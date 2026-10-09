"""Write the practice programme for every node in the library, and check it.

    .venv-fastapi/bin/python scripts/generate_skill_steps.py --tree calculus
    .venv-fastapi/bin/python scripts/generate_skill_steps.py            # all of it
    .venv-fastapi/bin/python scripts/generate_skill_steps.py --report   # what exists

This is the thing that makes the steps in the skill tree worth reading. What it
replaces is frontend/src/skills/improve.ts, which derived them in the browser
from a twenty-rung ladder and a tier — see the note at the top of
data/sql/skillsteps.sql for why that could never produce a good step, and
backend/tracking/skillsteps.py for the rule it kept breaking.

## The pipeline, and why there are two reviewers

    generate   one call per node: the model writes the whole programme at once
    rules      backend/tracking/skillsteps.py, deterministic, every step
    review     a second call, a different prompt, the model marking its own work
    repair     the steps that failed either stage, rewritten with the reasons
    store      the node's programme, or nothing at all

    problems   the questions under each step, in batches of fifteen, through
               the same four stages against the problem rules

The two reviewers catch different things and neither is redundant.

The rules catch a step with no object in it — "Do ten from memory" — which is
what a model reaches for when it does not know the subject well enough to name
anything. That failure has a shape, so it can be caught for free, and catching
it for free matters when it is a fifth of first drafts.

The model catches a step that is specific and *wrong*. "Factor x^2 - 7x + 13"
passes every rule in the deterministic set and does not factor over the
integers. No string check will ever find that, and it is the failure a reader
actually notices, because they will sit down and try it.

They run in that order because the cheap one is cheap.

## The steps are the half of it a reader does not sit down in front of

A step says what to practice and the problem set is what the reader actually
works: see `build_problems`. Both are written here, because they are one
judgement — the questions a step is owed depend on what the step asked for, and
a second script briefed only on the step's title writes a set for a different
step. `--no-problems` writes the programme alone, and `--problems-only` fills
the sets under programmes that already exist.

How many questions a step gets is not a decision this file makes: it is read off
the step's own minutes by `problem_slots` in backend/tracking/skillsteps.py,
which mirrors frontend/src/utils/problemSet — the panel drew the graded slots
long before there was anything to put in them.

## A node is all or nothing

The unit of work is a node's whole programme, not a step. A programme is ordered
and its steps lean on each other, so storing the seven that passed and dropping
the three that did not leaves a list with a hole in the middle and a step nine
that refers to a step three nobody can read. If the repairs do not bring the
whole programme through, the node is left with nothing and the panel falls back
to its derived advice — which is worse than good steps and much better than a
list with a hole in it.

## Resumable, because it will be interrupted

Twelve hundred nodes is hours. By default a node that already has steps is
skipped, so the script can be stopped and restarted and will pick up where it
left off; `--redo` overrides that. Nothing is written until a node passes, so an
interrupted run leaves no half-written programme behind.

## What is in the audit table

Every outcome, including the failures, because the failures are the only way to
tell a prompt that is working from a prompt that is quietly bad at one domain.
See the note on skill_step_audit in data/sql/skillsteps.sql.
"""
import argparse
import json
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from backend.config import settings  # noqa: E402

settings.load_dotenv()

from backend.database import connection  # noqa: E402
from backend.tracking import planner, skillsteps  # noqa: E402

NODES_PATH = os.path.join(ROOT, 'data', 'skill_nodes.json')

#: Sonnet 5, the same default backend/tracking/planner.py runs the goals page
#: on. The job here is domain knowledge plus format discipline rather than deep
#: reasoning, which is the shape Sonnet is for; `--model` trades up for a tree
#: that comes back weak.
DEFAULT_MODEL = 'claude-sonnet-5'

#: How many steps a tier asks for.
#:
#: The shape of the old ladder's mistake was length: it ran five to twenty by
#: tier and had nothing subject-specific to fill twenty with, so the tail was
#: padding. These are shorter and the range is narrower, because every step here
#: has to earn its place by naming something.
STEPS_BY_TIER = {
    'foundation': 5,
    'beginner': 6,
    'intermediate': 7,
    'advanced': 8,
    'expert': 9,
    'mastery': 10,
}

# The completion has to hold ten steps of six fields, plus the thinking the
# effort setting asks for. Truncation arrives as unparseable JSON, which the
# retry below would spend another call on for no reason.
GENERATE_MAX_TOKENS = 16000
REVIEW_MAX_TOKENS = 12000

#: How many times a rate-limited request is waited out before giving up, and
#: how long each wait is. Six tries at thirty seconds covers three minutes of a
#: busy window, which is long enough for Groq's per-minute budget to clear
#: several times over and short enough that a genuinely dead key still fails.
RATE_LIMIT_TRIES = 6
RATE_LIMIT_WAIT = 30

#: Set when the provider says the key's allowance for the *day* is gone. Every
#: node still in flight then stops asking, because the answer will not change
#: before the window rolls and 500 nodes each waiting out six retries is a
#: quarter of a day spent proving it.
SPENT = threading.Event()

#: The completion budget sent to Groq, which is the throughput lever and not
#: an obvious one.
#:
#: Groq's free tier counts the prompt *plus the completion you asked for*
#: against a fixed per-minute allowance — the tokens you reserve, not the
#: tokens you use. Asking for the Anthropic-sized budgets above therefore books
#: most of a minute per call whatever the model actually writes, and the run
#: crawls at a third of a node a minute while the model sits idle.
#:
#: These are sized to the real answers. Ten steps of six short fields measures
#: 2,100 tokens of JSON and a verdict list is a few hundred, so the ceiling only
#: has to clear those with room for the thinking. It roughly trebled the rate.
#:
#: What they have to clear is the *thinking*, and that is where the first sizing
#: of these was wrong. gpt-oss-120b at the 'medium' effort the goals page uses
#: spent 2,729 tokens of a 3,200 budget reasoning about a ten-step programme and
#: had 470 left to write it in. The programme then came back with two steps in
#: it and `finish_reason: length`, which is what truncation looks like through a
#: strict schema: the decoder closes the array it was cut off inside, so the
#: answer parses, and the rules reject it as a short programme rather than as a
#: broken call. Three rounds of repair then bought three more truncations.
#:
#: The fix was the effort rather than the ceiling — see WRITE_REASONING. At
#: 'low' the same node reasoned for 71 tokens and wrote all ten steps.
GROQ_BUDGET = 3600
GROQ_REVIEW_BUDGET = 4200

#: How hard the model thinks, per stage, and they are deliberately different.
#:
#: Writing a programme is recall and format discipline: the subject knowledge is
#: either there or it is not, and thinking longer about how to word a step does
#: not put a scale in A-flat major. Reviewing one is the opposite — the job is to
#: work the arithmetic and find the answer that does not come out, which is the
#: one thing here worth paying reasoning tokens for.
WRITE_REASONING = 'low'
REVIEW_REASONING = planner.GROQ_REASONING


# ---------------------------------------------------------------------------
# The prompts
# ---------------------------------------------------------------------------
# Written against one failure mode, and it is worth saying which: a model asked
# for "practice steps" writes advice. Advice is the genre — "practice regularly,
# focus on accuracy, review your mistakes" — and every sentence of it is true
# and useless. The system prompt spends most of its words refusing that genre
# and showing the alternative, because naming it is not enough; the example is
# what actually moves the output.
_GENERATE_BASE = """\
You write practice programmes for a skill-tree app used by students.

A programme is an ordered list of steps for ONE skill. Each step is a small,
finishable piece of work with a name, a definition of what mastering it means,
and one concrete thing to go and do right now.

This is the shape, and it is not negotiable:

  title     Factor Simple Quadratics
  mastery   Reverse FOIL to factor x^2 + bx + c.
  practice  Factor x^2 - 7x + 12.
  proof     You get (x - 3)(x - 4), and expanding it returns the original.
  pitfall   Getting the signs right on the two factors when b is negative.
  detail    Look for two numbers that multiply to c and add to b. With c
            positive and b negative, both are negative. Write the pairs out
            rather than guessing: 1 and 12, 2 and 6, 3 and 4.
  minutes   15

THE ONE RULE: every practice line must name its object.

  NO   Do ten from memory.              names nothing
  NO   Practice until it feels easy.    names nothing, and cannot be finished
  NO   Work through some examples.      names nothing
  YES  Factor x^2 - 7x + 12.
  YES  Balance Fe + O2 -> Fe2O3.
  YES  Write a loop that prints every second item of [4, 8, 15, 16, 23, 42].
  YES  Hold a 40-second plank with your hips level, filmed from the side.
  YES  Transpose "Happy Birthday" from C major into E-flat major.

If you cannot name an object for a step, the step is wrong — write a different
step. A programme of five specific steps beats one of ten vague ones.

THE SECOND RULE: the object must be one the reader already has, or one the step
gives them. They have no files, no repository and no dataset from you.

  NO   Run calculate_sum.rb with input 3,4,5.      no such file exists
  NO   Fix the IndexError in process_data.rb.      invented, and unopenable
  NO   Open the project's config and change it.    which project
  YES  Write a script that sums [3, 4, 5] and prints the total.
  YES  Type this in and run it: for i in range(3): print(i / 0)
  YES  Take a program you have already written and ...
  YES  Factor x^2 - 7x + 12.

A step may name a real, public, findable thing — Python's `itertools` docs, the
Moonlight Sonata, a barbell — and may tell the reader to make something. It may
not refer to a file, a bug, a dataset or a codebase that only exists inside the
step. If a step needs code to debug, give the code.

THE THIRD RULE, and it catches a subtler thing than a filename. Do not invent
the reader's own life and then ask them to look it up. This is the commonest
failure on the subjects with no notation of their own — study, productivity,
management, career, fitness:

  NO   Write down the due date for Assignment 3: 2023-10-15.
  NO   For Assignment 3, list Chapter 4 (pages 67-82) and Chapter 5.
       There is no Assignment 3, no syllabus and no Chapter 4. Making up
       somebody's coursework and then asking them to read it back is not
       practice, it is a form to fill in.
  YES  Take the next assessment you actually have and write down its date, the
       pages it covers, and the hours left before it.
  YES  Given this workload — 3 essays due in 10 days, 2 of them 1500 words —
       write the order you would do them in and one line on why.

So: send the reader to their own real material, or state the whole scenario
inside the step as a given. What you may not do is invent a fact and then treat
it as something they can go and check.

Never write a calendar date. 2023-10-15 is in the past and was never theirs.
Count in days instead — "in 10 days", "day 1", "the first session".

Keep one technology per programme. A Ruby filename with a Python error message
in it is a step nobody can act on.

More rules, all of them things that get this rejected:

- `practice` starts with an imperative verb and states the actual problem,
  numbers included. Give the real expression, the real reps, the real piece.
- `proof` says how the reader knows they got it right. Where there is an
  answer, give the answer. It is checked, so it must be correct.
- `mastery` is one sentence describing the ability, not the activity.
- `detail` is two to four sentences of how to actually do it, written to be
  read while doing it. Not a restatement of `mastery`.
- `pitfall` names the specific mistake people make here, not "be careful".
- `title` is one to six words, no full stop, and no two steps share one.
- Steps go easiest first, and each builds on the one before it.
- Vary the whole sentence, not just the numbers. Ten practice lines built from
  one template with the values swapped is a failed programme — they get
  rejected as duplicates. Each step is a different kind of work, so each
  practice line should read like a different instruction.
- That check compares the wording of your lines and not the objects in them,
  which is worth knowing because it is where a good programme dies. Three steps
  opening "Play the C major scale ascending and descending", "Play the G major
  scale ascending and descending", "Play the D major scale ascending and
  descending" are read as one step written three times, however different the
  three scales are. Change the work, not only the noun: name the scale, then
  ask for it hands separately, then in contrary motion, then against a
  metronome at 80, then written out on staff paper from memory. If two steps
  differ only by a noun, you have written one step.
- Be correct. A wrong worked answer is worse than a vague step, and every
  number you write will be checked by somebody who sits down and tries it.
- Write numbers as digits. "Plan 3 assignments across 14 days" is accepted;
  "plan three assignments across two weeks" is rejected as naming nothing,
  because what is looked for is a digit, a symbol, notation or a proper noun,
  and a spelled-out number is none of them. This bites hardest on the subjects
  with no notation of their own — study, fitness, cooking, mindfulness — where
  the number is the only concrete thing in the line.
"""

def _bounds_note():
    """The length limits, stated to the model rather than only enforced.

    Left out of the first draft of this prompt, and it was the commonest
    rejection by a distance: a model writing a genuinely specific practice line
    runs to 250 characters, the validator wants 200, and a correct programme was
    thrown away over a clause that belonged in `detail` anyway. Three rounds of
    repair never fixed it either, because nothing in the objection sent back
    said what the limit was.

    Built from skillsteps.BOUNDS rather than typed out, so the prompt cannot
    drift from the rule that judges it.
    """
    lines = ['FIELD LENGTHS, in characters. A field outside its range fails the whole',
             'programme, however good it is:', '']
    for name in skillsteps.STEP_FIELDS:
        low, high = skillsteps.BOUNDS[name]
        lines.append('  {:<9} {}-{}'.format(name, low, high))
    lines.extend([
        '',
        '`practice` is the one that gets rejected, and it is rejected for being',
        'long. One instruction naming one object: aim at 150 characters, which',
        'leaves the margin, and never pass 200. Everything else you want to say',
        'about how to do it goes in `detail`, which has the room for it.',
        '',
        'minutes is a whole number between {} and {}.'.format(*skillsteps.MINUTES_RANGE),
    ])
    return '\n'.join(lines)


GENERATE_SYSTEM = _GENERATE_BASE + '\n' + _bounds_note() + '\n'

REVIEW_SYSTEM = """\
You are checking practice steps written for a skill-tree app, before they are
shown to students. You are the last reader before publication and you are
expected to reject things.

For each step, decide PASS or FAIL. Fail it for any of these:

1. WRONG. The worked answer in `proof` does not follow from `practice`, the
   maths does not come out, the chemistry does not balance, the code would not
   run, the claim is false, or the terminology is misused. Check the arithmetic
   yourself — do not assume it is right because it looks confident.
2. VAGUE. `practice` does not name a specific object to work on. "Do ten from
   memory", "work through examples", "practice until comfortable". A step that
   cannot be started without first deciding what to work on has failed.
3. OFF-TOPIC. The step is not about the skill it is filed under.
4. MISPLACED. It is far above or below the stated level, or it comes before
   something it depends on.
5. DUPLICATE. It is another step in the same list, reworded.
6. UNAVAILABLE. It tells the reader to open, run or fix something that does not
   exist for them — a named source file, a specific bug, a dataset, a
   repository — without giving it to them. "Run calculate_sum.rb" and "fix the
   IndexError in process_data.rb" are both failures: there is no such file.
   Telling the reader to write something, or to use their own existing work, or
   to use a real public resource, is fine. So is giving them the code inline.
   Also fail a step that mixes technologies incoherently, such as a Ruby
   filename raising a Python exception.

Pass anything that is correct, specific and in the right place. Do not fail a
step for style, for length, or because you would have picked a different
example. A programme where everything fails is a review that has gone wrong.

For every FAIL, give a one-line reason naming which of the five it is, and be
concrete about what is wrong — "12 x 3 is 36, not 34", not "check the numbers".
"""

STEP_SCHEMA = {
    'type': 'object',
    'properties': {
        'steps': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'title': {'type': 'string'},
                    'mastery': {'type': 'string'},
                    'practice': {'type': 'string'},
                    'proof': {'type': 'string'},
                    'pitfall': {'type': 'string'},
                    'detail': {'type': 'string'},
                    'minutes': {'type': 'integer'},
                },
                'required': ['title', 'mastery', 'practice', 'proof', 'pitfall',
                             'detail', 'minutes'],
                'additionalProperties': False,
            },
        },
    },
    'required': ['steps'],
    'additionalProperties': False,
}

REVIEW_SCHEMA = {
    'type': 'object',
    'properties': {
        'verdicts': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'ordinal': {'type': 'integer'},
                    'verdict': {'type': 'string', 'enum': ['pass', 'fail']},
                    'reason': {'type': 'string'},
                },
                'required': ['ordinal', 'verdict', 'reason'],
                'additionalProperties': False,
            },
        },
    },
    'required': ['verdicts'],
    'additionalProperties': False,
}


# ---------------------------------------------------------------------------
# The problems
# ---------------------------------------------------------------------------
# A step says what to practice. A problem set is what the reader actually sits
# down in front of, and until this stage existed the panel drew the graded slots
# from frontend/src/utils/problemSet with nothing in them — the shape of a set
# with no set.
#
# The failure mode here is not the one the steps have. A model asked for
# practice questions does not write advice, it writes the step's own practice
# line five times with the numbers changed, and then answers them wrong. So this
# prompt spends its words on two things: that the set is a slope, and that the
# answer is checked.
PROBLEMS_SYSTEM = """\
You write the problems that sit under ONE step of a practice programme.

A problem is a question with its answer written down. The reader works down the
set and marks their own work, so the question has to be answerable from the
question alone and the answer has to be right.

This is the shape:

  prompt  Factor x^2 - 7x + 12.
  answer  (x - 3)(x - 4).
  hint    Two numbers that multiply to 12 and add to -7.

THE FIRST RULE: every prompt names its object, with the real numbers in it.

  NO   Try a harder factorisation.        names nothing
  NO   Practice a few more of these.      names nothing, cannot be marked
  YES  Factor x^2 + 2x - 15.
  YES  Balance C3H8 + O2 -> CO2 + H2O.
  YES  What does len("summit") return?
  YES  Name the relative minor of A-flat major.

THE SECOND RULE: `answer` answers it. Give the result — the factorisation, the
balanced equation, the number, the name — not a restatement of the question and
not a method with the answer left out. Where the answer is one word or one
number, one word or one number is the whole field. It is checked by somebody
who works the problem, so it must be correct.

THE THIRD RULE: the set is a slope, and each problem is told which band it is
in. Honour the band you are given:

  warmup   one recall or one substitution, finishable in under a minute. It is
           a smaller case of the same skill — not a lookup of something the
           step already wrote down. "What is 8 x 7?" is a warm-up; "what
           number did the step say?" is not a question.
  core     the ordinary case of the skill, the thing the step is actually for.
  stretch  the case that settles whether they have it — two ideas at once, an
           awkward sign, a value that makes the obvious method fail, or a
           question that asks them to explain why rather than only what.

More rules, all of them things that get this rejected:

- Every prompt in the set is a different question. Not one question with the
  numbers swapped five times: vary the form, not only the values.
- The set is not the step's practice line again. It may open on a piece of it;
  it may not be it five times.
- `hint` is optional and usually wrong to write. Use "" on a warm-up. A hint
  earns its place on a stretch problem, where it names the idea to reach for
  without doing the work: "Try it with n = 0 first", not "Factorise it".
- Nothing to open, download or run that the reader does not have. Give code
  inline if the question is about code.
- Keep to the step. A set filed under one step that quietly teaches the next
  one is a set the reader meets too early.
- A problem may not lean on a fact the step invented. If it needs a situation,
  the prompt states the whole situation: "A plan holds 2 sessions of 45 minutes
  on day 1 and 1 of 60 minutes on day 2 — how many minutes is that?" is
  answerable. "What is the due date for Assignment 3?" is not, because there is
  no Assignment 3 outside the step that made it up, and the reader has nowhere
  to look.
- No calendar dates. Count in days.
- A question whose answer is sitting in its own wording is not a question. "How
  many minutes are in one 30-minute block?" and "what page range did the step
  give?" are both rejected. A warm-up is small; it is still work.
"""

#: Length bounds for a problem, stated for the same reason the step's are —
#: see `_bounds_note`.
PROBLEMS_SYSTEM = PROBLEMS_SYSTEM + """
LENGTHS, in characters: prompt {}-{}, answer {}-{}, hint 0-{} ("" for none).
""".format(*skillsteps.PROBLEM_BOUNDS['prompt'],
           *skillsteps.PROBLEM_BOUNDS['answer'],
           skillsteps.PROBLEM_BOUNDS['hint'][1])

PROBLEM_REVIEW_SYSTEM = """\
You are checking problems written for a skill-tree app, before students are
asked to solve them. You are the last reader before publication and you are
expected to reject things.

For each problem, decide PASS or FAIL. Fail it for any of these:

1. WRONG. The answer is not the answer. Work the problem yourself — do the
   arithmetic, balance the equation, run the code in your head, check the key
   signature. A confident wrong answer is the worst thing this table can hold,
   because the reader will believe it over themselves.
2. UNANSWERABLE. It cannot be worked from what is written: a missing value, an
   ambiguous question with two defensible answers, or a reference to something
   the reader has not got.
3. VAGUE. It names nothing to work on.
4. RESTATES. The answer field repeats the question instead of answering it, or
   gives a method where the result was asked for.
5. DUPLICATE. It is another problem in the same set with the values changed.
6. MISBANDED. A warm-up that takes ten minutes, or a stretch problem that is a
   one-step recall. The band is given with each problem.
7. OFF-STEP. It is not about the step it is filed under, or it needs the next
   step's idea to solve.

Pass anything that is correct, specific, answerable and in its band. Do not fail
a problem because you would have chosen a different example, and do not fail a
warm-up for being easy — that is what a warm-up is. A set where everything
fails is a review that has gone wrong.

For every FAIL, name which of the seven it is and be concrete: "3 x 14 is 42,
not 44", not "check the arithmetic".
"""

#: `hint` is required by the schema and optional by the rules, which is not a
#: contradiction: a strict schema has no optional fields, so the model is told
#: to send "" and `problem_failures` accepts an empty one. Making it absent
#: instead means every provider that validates strictly refuses the call.
PROBLEM_SCHEMA = {
    'type': 'object',
    'properties': {
        'sets': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'ordinal': {'type': 'integer'},
                    'problems': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'slot': {'type': 'integer'},
                                'prompt': {'type': 'string'},
                                'answer': {'type': 'string'},
                                'hint': {'type': 'string'},
                            },
                            'required': ['slot', 'prompt', 'answer', 'hint'],
                            'additionalProperties': False,
                        },
                    },
                },
                'required': ['ordinal', 'problems'],
                'additionalProperties': False,
            },
        },
    },
    'required': ['sets'],
    'additionalProperties': False,
}

PROBLEM_REVIEW_SCHEMA = {
    'type': 'object',
    'properties': {
        'verdicts': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'ordinal': {'type': 'integer'},
                    'slot': {'type': 'integer'},
                    'verdict': {'type': 'string', 'enum': ['pass', 'fail']},
                    'reason': {'type': 'string'},
                },
                'required': ['ordinal', 'slot', 'verdict', 'reason'],
                'additionalProperties': False,
            },
        },
    },
    'required': ['verdicts'],
    'additionalProperties': False,
}


def brief_for(node, count):
    """What the model is told about a node before it writes for it."""
    lines = [
        'SKILL: {}'.format(node['name']),
        'SUBJECT: {}'.format(' > '.join(node.get('treePath') or [node['treeTitle']])),
        'FIELD: {}'.format(node.get('group', '')),
        'LEVEL: {}'.format(node['tier']),
        'WHAT IT IS: {}'.format(node.get('desc', '')),
    ]
    if node.get('requires'):
        # What the reader already has. Without this the model re-teaches the
        # prerequisite in step one of every node on the tree.
        lines.append('ALREADY DONE (do not re-teach): {}'.format(
            ', '.join(node['requires'])))
    lines.append('')
    lines.append(
        'Write exactly {} steps taking a reader at the {} level from their first '
        'contact with {} to being able to use it unaided. Each practice line must '
        'name a specific thing to work on, with the real numbers, expressions, '
        'pieces or reps written out.'.format(count, node['tier'], node['name']))
    return '\n'.join(lines)


def review_brief(node, steps):
    """The programme, laid out for the second pass to mark."""
    lines = [
        'SKILL: {} ({}, {})'.format(
            node['name'], node['tier'], ' > '.join(node.get('treePath') or [])),
        'WHAT IT IS: {}'.format(node.get('desc', '')),
        '',
        'Check every step below and return a verdict for each ordinal.',
        '',
    ]
    for step in steps:
        lines.append('--- STEP {} ---'.format(step['ordinal']))
        lines.append('title:    {}'.format(step['title']))
        lines.append('mastery:  {}'.format(step['mastery']))
        lines.append('practice: {}'.format(step['practice']))
        lines.append('proof:    {}'.format(step['proof']))
        lines.append('pitfall:  {}'.format(step['pitfall']))
        lines.append('detail:   {}'.format(step['detail']))
        lines.append('')
    return '\n'.join(lines)


def repair_brief(node, steps, problems):
    """A rewrite request naming what was wrong with which step.

    The whole programme is sent rather than only the broken steps, because
    'DUPLICATE' and 'comes before something it depends on' are facts about the
    list. A model handed one step in isolation fixes it into a collision with a
    step it cannot see.
    """
    lines = [
        brief_for(node, len(steps)),
        '',
        'A first draft was written and reviewed. These steps were rejected:',
        '',
    ]
    for ordinal, reasons in sorted(problems.items()):
        step = next((one for one in steps if one['ordinal'] == ordinal), None)
        if not step:
            continue
        lines.append('STEP {} — "{}"'.format(ordinal, step['title']))
        lines.append('  practice was: {}'.format(step['practice']))
        for reason in reasons:
            lines.append('  REJECTED: {}'.format(reason))
        lines.append('')
    lines.append(
        'Return the whole programme of {} steps again. Rewrite the rejected ones '
        'so the objection no longer applies — a new example, a corrected answer, '
        'a different step entirely if that is what it takes. Keep the steps that '
        'were not named above as they are.'.format(len(steps)))
    return '\n'.join(lines)


#: How many problems one call is asked for at a time.
#:
#: Per step would be the obvious unit and is the wrong one: a node of nine steps
#: is nine sets, and one call each turns the library into eight thousand calls on
#: a free key. Per node is the other extreme — a mastery node asks for ninety
#: problems, which is past what a Groq completion will hold and arrives
#: truncated, which is unparseable, which costs the call anyway.
#:
#: So the batch is sized by problems rather than by steps, and fifteen is about
#: 900 tokens of JSON: comfortably inside the budget with the reasoning on top.
PROBLEMS_PER_CALL = 15

#: Fifteen problems is fifteen verdicts with a reason on each, and the reasoning
#: behind them is the point of the stage — this is where the arithmetic actually
#: gets worked. Same ceiling as the programme review.
GROQ_PROBLEM_REVIEW_BUDGET = GROQ_REVIEW_BUDGET


def problem_batches(steps, want):
    """The steps grouped into calls, by how many problems each one asks for."""
    batches, batch, held = [], [], 0
    for step in steps:
        size = len(want[step['ordinal']])
        if batch and held + size > PROBLEMS_PER_CALL:
            batches.append(batch)
            batch, held = [], 0
        batch.append(step)
        held += size
    if batch:
        batches.append(batch)
    return batches


def _step_block(step, slots):
    """One step, and the slots the model is to fill under it."""
    lines = [
        '--- STEP {}: {} ---'.format(step['ordinal'], step['title']),
        'mastery:  {}'.format(step['mastery']),
        'practice: {}'.format(step['practice']),
        'proof:    {}'.format(step['proof']),
        'pitfall:  {}'.format(step['pitfall']),
        'WRITE {} PROBLEMS for this step, one per slot, in this order:'.format(len(slots)),
    ]
    lines.extend('  slot {}  {}'.format(one['slot'], one['weight']) for one in slots)
    lines.append('')
    return lines


def problem_brief(node, steps, want):
    """What the model is told before it writes the problems for some steps.

    The step's own practice line and proof go in, and not only for context: the
    commonest thing a bad set does is hand the practice line back five times,
    and a model that cannot see the line writes it again by accident.
    """
    lines = [
        'SKILL: {}'.format(node['name']),
        'SUBJECT: {}'.format(' > '.join(node.get('treePath') or [node['treeTitle']])),
        'LEVEL: {}'.format(node['tier']),
        'WHAT IT IS: {}'.format(node.get('desc', '')),
        '',
        'Below are steps from this skill\'s programme. Write the problem set for '
        'each one.',
        '',
    ]
    for step in steps:
        lines.extend(_step_block(step, want[step['ordinal']]))
    lines.append(
        'Return one entry in `sets` for each of the {} step(s) above, with '
        '`ordinal` equal to that step\'s number and exactly one problem per slot '
        'listed under it. The questions belong to the step they are filed under, '
        'not to the skill in general.'.format(len(steps)))
    return '\n'.join(lines)


def problem_review_brief(node, steps, sets):
    """The sets, laid out for the second pass to mark."""
    lines = [
        'SKILL: {} ({}, {})'.format(
            node['name'], node['tier'], ' > '.join(node.get('treePath') or [])),
        '',
        'Check every problem below and return a verdict for each ordinal and slot.',
        '',
    ]
    for step in steps:
        lines.append('--- STEP {}: {} ---'.format(step['ordinal'], step['title']))
        lines.append('the step asks: {}'.format(step['practice']))
        lines.append('')
        for problem in sets.get(step['ordinal'], []):
            lines.append('  ordinal {} slot {} [{}]'.format(
                step['ordinal'], problem['slot'], problem['weight']))
            lines.append('    prompt: {}'.format(problem['prompt']))
            lines.append('    answer: {}'.format(problem['answer']))
            if problem.get('hint'):
                lines.append('    hint:   {}'.format(problem['hint']))
        lines.append('')
    return '\n'.join(lines)


def problem_repair_brief(node, steps, want, sets, faults):
    """A rewrite request naming what was wrong with which problem.

    The whole set for a step is sent back rather than the one problem that
    failed, for the reason the programme is: 'duplicate' and 'the set gets
    easier partway through' are facts about the set, and a model handed one
    question in isolation fixes it into a collision with one it cannot see.
    """
    lines = [
        problem_brief(node, steps, want),
        '',
        'A first draft was written and reviewed. These were rejected:',
        '',
    ]
    for ordinal in sorted(faults):
        for problem in sets.get(ordinal, []):
            lines.append('STEP {} slot {}: {}'.format(
                ordinal, problem['slot'], problem['prompt']))
        for reason in faults[ordinal]:
            lines.append('  REJECTED: {}'.format(reason))
        lines.append('')
    lines.append(
        'Write the whole set again for each step named above. Where a question '
        'was wrong, correct the answer or replace the question; where two were '
        'the same question, write a different one. Keep the slots and their '
        'bands as they are.')
    return '\n'.join(lines)


def graded(raw, slots):
    """One step's problems, in order, with the bands put on by the pipeline.

    The model is told which band each slot is, and is not trusted to report it
    back: the slope is a fact about how the panel reads — see `problem_slots` in
    backend/tracking/skillsteps.py — so it is assigned here and the model's own
    `slot` is used for nothing but the order it wrote them in. That is one whole
    class of rejection the generator cannot argue itself into.
    """
    out = []
    for at, (problem, slot) in enumerate(zip(raw or [], slots), start=1):
        out.append({
            'slot': at,
            'weight': slot['weight'],
            'prompt': stopped(problem.get('prompt')),
            'answer': stopped(problem.get('answer')),
            'hint': str(problem.get('hint', '') or '').strip(),
        })
    return out


# ---------------------------------------------------------------------------
# Talking to the model
# ---------------------------------------------------------------------------
def ask(brief, system, schema, model_id, max_tokens, provider='', groq_budget=0,
        reasoning=WRITE_REASONING):
    """One schema-constrained answer, parsed.

    The provider machinery in backend/tracking/planner.py is reused rather than
    reimplemented: it already holds the workspace header, the refusal check, the
    Groq token budget and the several error messages that took somebody an
    afternoon to word. This adds the parse and the routing and nothing else.

    Which provider answers follows `MILESTONE_PROVIDER`, or whichever key is
    present, exactly as the goals page decides it — with one difference worth
    knowing. Anthropic is the one to want here: the whole point of the table is
    that a step names a real object, and naming one correctly is a knowledge
    problem. Groq's free model will write a programme and roughly one step in
    six comes back wrong on review, which the pipeline then pays to repair. It
    works, and it is slower and weaker than it looks.
    """
    name = provider or planner.provider()
    if not name:
        raise ValueError(planner.NO_KEY)
    # A rate limit is not a failure, it is a queue. Groq's free tier counts
    # tokens per minute and this script is deliberately trying to saturate it,
    # so a 429 is the expected steady state rather than an error — without a
    # wait here the run would "fail" most of the library in about a minute and
    # write nothing. Anthropic rate-limits too, more rarely.
    for attempt in range(RATE_LIMIT_TRIES):
        try:
            return _parse(_call(name, brief, system, schema, model_id,
                                max_tokens, groq_budget, reasoning))
        except Exception as exc:  # noqa: BLE001 - re-raised below unless it is a 429
            text = str(exc)
            # A spent daily allowance is not a queue and there is nothing to
            # wait for: the window rolls tomorrow, not in six minutes. Waiting
            # it out node by node is how a run spends an afternoon asleep and
            # writes nothing, so it is raised at once and `SPENT` stops the
            # rest of the run — see planner's 429 branch for where the two
            # kinds of 429 are told apart.
            if 'for the day' in text:
                SPENT.set()
                raise
            limited = 'rate-limit' in text or 'rate_limit' in text or '429' in text
            if not limited or attempt == RATE_LIMIT_TRIES - 1:
                raise
            # Linear rather than exponential: the window that is full is a
            # fixed sixty seconds, so doubling past it only wastes the minute
            # after the one that was busy.
            time.sleep(RATE_LIMIT_WAIT * (attempt + 1))
    raise ValueError('unreachable')


def effective_model(provider, model_id):
    """The model that will actually answer, which is not always `--model`.

    `--model` defaults to an Anthropic id, and a run that falls through to Groq
    ignores it and serves gpt-oss-120b instead. Recording the flag rather than
    the fact put `rules+claude-sonnet-5` on eight programmes Sonnet never saw —
    which is the one thing an audit trail must not do, because the whole point
    of storing provenance is to be able to find and redo the weaker content.
    """
    name = provider or planner.provider()
    if name == 'groq':
        return model_id if model_id.startswith('openai/') else planner.GROQ_MODEL
    if name == 'grok':
        return planner.GROK_MODEL
    return model_id


def _call(name, brief, system, schema, model_id, max_tokens, groq_budget=0,
          reasoning=WRITE_REASONING):
    """One request to whichever provider is answering, as raw text."""
    if name == 'anthropic':
        text = planner.from_anthropic(
            brief, system=system, schema=schema, model_id=model_id,
            max_tokens=max_tokens)
    elif name == 'groq':
        text = planner._from_openai_chat(
            planner.GROQ_URL, planner._groq_token(),
            model_id if model_id.startswith('openai/') else planner.GROQ_MODEL,
            'Groq', brief, system=system, schema=schema,
            # Groq's free tier counts the prompt and the completion you ask for
            # against one 8000-a-minute ceiling, so the Anthropic budgets above
            # are refused outright with a 413 rather than truncated. Its own
            # cap is the one to send.
            max_tokens=min(max_tokens, groq_budget or GROQ_BUDGET),
            reasoning=reasoning or planner.GROQ_REASONING, timeout=180.0)
    elif name == 'grok':
        text = planner._from_openai_chat(
            planner.GROK_URL, planner._grok_token(), planner.GROK_MODEL, 'Grok',
            brief, system=system, schema=schema, max_tokens=max_tokens,
            timeout=180.0)
    else:
        raise ValueError(
            'Provider {!r} cannot hold a JSON schema, and a step with a field '
            'missing is not worth the call. Use anthropic, groq or grok.'.format(name))
    return text


def _parse(text):
    """The answer as an object."""
    if not text:
        raise ValueError('empty answer')
    try:
        return json.loads(text)
    except ValueError:
        # A schema-constrained answer should never need this, and one arriving
        # in a fence is cheaper to survive than to re-request.
        match = re.search(r'\{.*\}', text, re.S)
        if not match:
            raise
        return json.loads(match.group(0))


def stopped(text):
    """A field with terminal punctuation on it.

    A missing full stop is the commonest thing the rules reject and the least
    interesting: the content is right and the model simply did not type the
    dot. Repairing it through the model costs two more calls and can come back
    with a different example, so it is normalised here instead. This adds
    punctuation and never changes a word — anything that would alter meaning
    stays a rejection.
    """
    clean = str(text or '').strip()
    if clean and clean[-1] not in '.!?':
        clean += '.'
    return clean


def numbered(raw):
    """The model's steps, with ordinals and a sane `minutes`, in order."""
    steps = []
    for index, step in enumerate(raw or [], start=1):
        minutes = step.get('minutes')
        if not isinstance(minutes, int):
            minutes = 20
        steps.append({
            'ordinal': index,
            # A title is a label and is the one field that must NOT end in a
            # full stop, so it is stripped rather than stopped.
            'title': str(step.get('title', '')).strip().rstrip('.').strip(),
            'mastery': stopped(step.get('mastery')),
            'practice': stopped(step.get('practice')),
            'proof': stopped(step.get('proof')),
            'pitfall': stopped(step.get('pitfall')),
            'detail': stopped(step.get('detail')),
            'minutes': max(skillsteps.MINUTES_RANGE[0],
                           min(skillsteps.MINUTES_RANGE[1], minutes)),
        })
    return steps


# ---------------------------------------------------------------------------
# One node, end to end
# ---------------------------------------------------------------------------
class Outcome:
    """What happened to one node: its steps if it passed, and the audit rows."""

    def __init__(self, node_id):
        self.node_id = node_id
        self.steps = []
        self.audit = []
        self.attempts = 0
        self.note = ''

    def log(self, stage, outcome, reason='', ordinal=None):
        self.audit.append({
            'node_id': self.node_id, 'ordinal': ordinal, 'stage': stage,
            'outcome': outcome, 'reason': reason,
            'at': datetime.now().isoformat(timespec='seconds'),
        })


def build(node, model_id, rounds, provider=''):
    """Generate, check, repair and return one node's programme.

    Returns an `Outcome`. `steps` is empty when the programme never came
    through clean, which is deliberate — see the note on all-or-nothing above.
    """
    out = Outcome(node['id'])
    count = STEPS_BY_TIER.get(node['tier'], 7)
    steps = []
    problems = {}

    for attempt in range(1, rounds + 1):
        out.attempts = attempt
        stage = 'generate' if attempt == 1 else 'repair'
        brief = (brief_for(node, count) if attempt == 1
                 else repair_brief(node, steps, problems))
        try:
            answer = ask(brief, GENERATE_SYSTEM, STEP_SCHEMA, model_id,
                         GENERATE_MAX_TOKENS, provider)
        except Exception as exc:  # noqa: BLE001 - reported, not raised
            out.log(stage, 'error', str(exc)[:300])
            out.note = str(exc)[:160]
            return out
        steps = numbered(answer.get('steps'))
        out.log(stage, 'pass', '{} steps'.format(len(steps)))

        # ---- stage one: the rules ----------------------------------------
        per_step, whole = skillsteps.review_programme(steps, node)
        problems = {}
        for reason in whole:
            out.log('rules', 'fail', reason)
        for step, reasons in zip(steps, per_step):
            for reason in reasons:
                out.log('rules', 'fail', reason, ordinal=step['ordinal'])
                problems.setdefault(step['ordinal'], []).append(reason)
        if whole:
            # A list-wide failure — wrong length, broken ordinals — is not
            # repaired step by step. Go round again from the brief.
            if attempt < rounds:
                problems = problems or {1: whole}
                continue
            out.note = '; '.join(whole)[:160]
            return out
        if problems:
            if attempt < rounds:
                continue
            out.note = 'rules: {} step(s) still failing'.format(len(problems))
            return out
        out.log('rules', 'pass', 'all {} steps'.format(len(steps)))

        # ---- stage two: the model marks it -------------------------------
        try:
            marks = ask(review_brief(node, steps), REVIEW_SYSTEM, REVIEW_SCHEMA,
                        model_id, REVIEW_MAX_TOKENS, provider,
                        groq_budget=GROQ_REVIEW_BUDGET,
                        reasoning=REVIEW_REASONING)
        except Exception as exc:  # noqa: BLE001
            out.log('review', 'error', str(exc)[:300])
            out.note = str(exc)[:160]
            return out
        verdicts = marks.get('verdicts') or []
        seen = set()
        for verdict in verdicts:
            ordinal = verdict.get('ordinal')
            seen.add(ordinal)
            if verdict.get('verdict') == 'fail':
                reason = str(verdict.get('reason', ''))[:300]
                out.log('review', 'fail', reason, ordinal=ordinal)
                problems.setdefault(ordinal, []).append(reason)
        # A step the reviewer skipped is a step nobody checked, and this table
        # promises every row was. Treat silence as a failure rather than as
        # consent.
        for step in steps:
            if step['ordinal'] not in seen:
                reason = 'reviewer returned no verdict for this step'
                out.log('review', 'fail', reason, ordinal=step['ordinal'])
                problems.setdefault(step['ordinal'], []).append(reason)

        if not problems:
            out.log('review', 'pass', 'all {} steps'.format(len(steps)))
            out.steps = steps
            return out
        if attempt >= rounds:
            out.note = 'review: {} step(s) still failing'.format(len(problems))
            return out

    return out


def build_problems(node, steps, model_id, rounds, provider='', out=None):
    """Write, check, repair and return the problem sets for a node's steps.

    Returns {ordinal: [problem]} holding only the sets that came through clean.

    The unit here is the step, not the node, which is the one place this departs
    from the rule at the top of the file. A programme is all-or-nothing because
    its steps lean on each other and a hole in the middle leaves a step nine
    referring to a step three nobody can read. A problem set leans on nothing
    outside itself: a step whose questions never passed falls back to the empty
    graded slots the panel already draws, and the steps either side of it are
    untouched. So the sets that pass are kept.
    """
    out = out or Outcome(node['id'])
    want = {step['ordinal']: skillsteps.problem_slots(step['minutes'])
            for step in steps}
    done = {}

    for batch in problem_batches(steps, want):
        pending = list(batch)
        sets = {}
        faults = {}
        for attempt in range(1, rounds + 1):
            stage = 'generate' if attempt == 1 else 'repair'
            brief = (problem_brief(node, pending, want) if attempt == 1
                     else problem_repair_brief(node, pending, want, sets, faults))
            try:
                answer = ask(brief, PROBLEMS_SYSTEM, PROBLEM_SCHEMA, model_id,
                             GENERATE_MAX_TOKENS, provider)
            except Exception as exc:  # noqa: BLE001 - reported, not raised
                out.log(stage, 'error', 'problem: ' + str(exc)[:290])
                out.note = out.note or str(exc)[:160]
                # A provider that has stopped answering will not start again for
                # the next batch, and every one of them costs the same wait.
                return done
            written = {entry.get('ordinal'): entry.get('problems') or []
                       for entry in answer.get('sets') or []}
            out.log(stage, 'pass', 'problem: {} set(s)'.format(len(written)))

            # ---- stage one: the rules ------------------------------------
            sets, faults = {}, {}
            for step in pending:
                slots = want[step['ordinal']]
                raw = written.get(step['ordinal']) or []
                problems = graded(raw, slots)
                sets[step['ordinal']] = problems
                reasons = []
                if len(raw) != len(slots):
                    # Not a rule in skillsteps — the count is the pipeline's
                    # own demand, and a short set would otherwise pass every
                    # check it is put through and arrive with a slot missing.
                    reasons.append('graded:{} problem(s) for {} slot(s)'.format(
                        len(raw), len(slots)))
                else:
                    per, whole = skillsteps.review_problems(problems, step)
                    reasons.extend(whole)
                    for problem, group in zip(problems, per):
                        reasons.extend('slot {}: {}'.format(problem['slot'], one)
                                       for one in group)
                for reason in reasons:
                    out.log('rules', 'fail', 'problem: ' + reason,
                            ordinal=step['ordinal'])
                if reasons:
                    faults[step['ordinal']] = reasons

            clean = [step for step in pending if step['ordinal'] not in faults]
            for step in clean:
                out.log('rules', 'pass', 'problem: {} problem(s)'.format(
                    len(sets[step['ordinal']])), ordinal=step['ordinal'])

            # ---- stage two: the model marks it ---------------------------
            if clean:
                try:
                    marks = ask(problem_review_brief(node, clean, sets),
                                PROBLEM_REVIEW_SYSTEM, PROBLEM_REVIEW_SCHEMA,
                                model_id, REVIEW_MAX_TOKENS, provider,
                                groq_budget=GROQ_PROBLEM_REVIEW_BUDGET,
                                reasoning=REVIEW_REASONING)
                except Exception as exc:  # noqa: BLE001
                    out.log('review', 'error', 'problem: ' + str(exc)[:290])
                    out.note = out.note or str(exc)[:160]
                    return done
                seen = set()
                for verdict in marks.get('verdicts') or []:
                    where = (verdict.get('ordinal'), verdict.get('slot'))
                    seen.add(where)
                    if verdict.get('verdict') == 'fail':
                        reason = 'slot {}: {}'.format(
                            where[1], str(verdict.get('reason', ''))[:260])
                        out.log('review', 'fail', 'problem: ' + reason,
                                ordinal=where[0])
                        faults.setdefault(where[0], []).append(reason)
                # A problem the reviewer skipped is a problem nobody checked,
                # and this table promises every row was. Silence is a failure
                # rather than consent, exactly as it is for a step.
                for step in clean:
                    for problem in sets[step['ordinal']]:
                        if (step['ordinal'], problem['slot']) not in seen:
                            reason = 'slot {}: reviewer returned no verdict'.format(
                                problem['slot'])
                            out.log('review', 'fail', 'problem: ' + reason,
                                    ordinal=step['ordinal'])
                            faults.setdefault(step['ordinal'], []).append(reason)

            for step in pending:
                if step['ordinal'] not in faults:
                    out.log('review', 'pass', 'problem: all {} problem(s)'.format(
                        len(sets[step['ordinal']])), ordinal=step['ordinal'])
                    done[step['ordinal']] = sets[step['ordinal']]
            pending = [step for step in pending if step['ordinal'] in faults]
            if not pending:
                break
        for step in pending:
            out.log('store', 'drop', 'problem: {} still failing after {} round(s)'.format(
                len(faults.get(step['ordinal'], [])), rounds), ordinal=step['ordinal'])

    return done


def store(out, node, model_id, run_id, sets=None, steps=True):
    """Write a passing node's programme and problem sets, and the audit either way.

    One writer rather than two, because SQLite takes one and because the audit
    rows for the steps and for the questions under them belong to the same run
    and should land together — a crash between two flushes is a node whose
    trail says the steps were stored and nothing about the sets.

    `steps=False` is the problems-only pass, where the programme is already in
    the table and only the sets under it are new.
    """
    stamp = datetime.now().isoformat(timespec='seconds')
    for row in out.audit:
        row['run_id'] = run_id
    if steps and out.steps:
        connection.save_node_steps(node['id'], [{
            'ordinal': step['ordinal'],
            'title': step['title'],
            'mastery': step['mastery'],
            'practice': step['practice'],
            'detail': step['detail'],
            'proof': step['proof'],
            'pitfall': step['pitfall'],
            'minutes': step['minutes'],
            'tree_id': node['tree'],
            'tier': node['tier'],
            'model': model_id,
            'generated_at': stamp,
            'attempts': out.attempts,
            'verified_at': stamp,
            'verifier': 'rules+{}'.format(model_id),
            'checks': list(skillsteps.RULE_CHECKS) + ['reviewed'],
        } for step in out.steps])
        out.log('store', 'pass', '{} steps'.format(len(out.steps)))
    elif steps:
        out.log('store', 'drop', out.note or 'did not pass review')
    for ordinal, problems in sorted((sets or {}).items()):
        connection.save_step_problems(node['id'], ordinal, [{
            'slot': problem['slot'],
            'weight': problem['weight'],
            'prompt': problem['prompt'],
            'answer': problem['answer'],
            'hint': problem['hint'],
            'tree_id': node['tree'],
            'model': model_id,
            'generated_at': stamp,
            'verified_at': stamp,
            'verifier': 'rules+{}'.format(model_id),
            'checks': list(skillsteps.PROBLEM_CHECKS) + ['reviewed'],
        } for problem in problems])
        out.log('store', 'pass', 'problem: {} for step {}'.format(
            len(problems), ordinal), ordinal=ordinal)
    for row in out.audit:
        row.setdefault('run_id', run_id)
    connection.log_step_audit(out.audit)


# ---------------------------------------------------------------------------
# The run
# ---------------------------------------------------------------------------
def load_nodes():
    with open(NODES_PATH, 'r') as handle:
        return json.load(handle).get('nodes', [])


def problem_gap(node_ids):
    """Node id → the stored steps that have no problem set behind them.

    The list `--problems-only` works from. It is per step rather than per node
    because that is how a set is stored and how it fails: a node can come out of
    a run with sets on eight of its nine steps, and the ninth is the work left.
    """
    stored = connection.skill_steps_for(node_ids)
    problems = connection.skill_problems_for(list(stored))
    out = {}
    for node_id, rows in stored.items():
        covered = {one['ordinal'] for one in problems.get(node_id, [])}
        gap = [row for row in rows if row['ordinal'] not in covered]
        if gap:
            out[node_id] = gap
    return out


def activity_order():
    """Tree ids, heaviest first by the work accounts have actually finished.

    The library is twelve hundred nodes and no run has ever reached the end of
    it, so the order matters more than the total. A tree nine accounts have
    filed two hundred thousand XP against is a tree somebody will open; one
    nobody has ever touched is content written into a drawer.

    Node-level completion is not in the database — it lives in the browser, see
    the note at the top of frontend/src/utils/skillSteps — so the signal is the
    finished tasks accounts filed under subjects, mapped through the catalogue
    to the tree each subject opens. That is a coarser claim than "they finished
    this node" and it is the honest one available.
    """
    from backend.config import skill_trees
    return connection.subject_work_by_tree(skill_trees.SUBJECT_TREE)


def priority_report():
    """Which trees accounts actually work in, and how much is written there."""
    nodes = load_nodes()
    per_tree = {}
    for node in nodes:
        per_tree.setdefault(node['tree'], 0)
        per_tree[node['tree']] += 1
    stored = connection.skill_step_coverage()
    problems = connection.skill_problem_coverage()

    print('{:<24} {:>9} {:>5} {:>7} {:>8} {:>9}'.format(
        'tree', 'xp done', 'accts', 'nodes', 'written', 'problems'))
    ranked = activity_order()
    for tree, xp, accounts, _tasks in ranked:
        written, _steps = stored.get(tree, (0, 0))
        _sets, probs = problems.get(tree, (0, 0))
        print('{:<24} {:>9} {:>5} {:>7} {:>8} {:>9}'.format(
            tree, xp, accounts, per_tree.get(tree, 0), written, probs))
    touched = {row[0] for row in ranked}
    idle = sorted(tree for tree in per_tree if tree not in touched)
    print()
    print('{} tree(s) with finished work behind them, {} with none.'.format(
        len(ranked), len(idle)))
    print('Nodes in the worked trees: {}'.format(
        sum(per_tree.get(row[0], 0) for row in ranked)))


def report():
    """What is in the table now, per tree. No model calls, no writes."""
    nodes = load_nodes()
    stored = connection.skill_step_coverage()
    totals = {}
    for node in nodes:
        totals.setdefault(node['tree'], 0)
        totals[node['tree']] += 1
    done = sum(stored.get(tree, (0, 0))[0] for tree in totals)
    print('{:<26} {:>7} {:>7} {:>8}'.format('tree', 'nodes', 'written', 'steps'))
    for tree in sorted(totals):
        written, steps = stored.get(tree, (0, 0))
        flag = '' if written >= totals[tree] else '  <-'
        print('{:<26} {:>7} {:>7} {:>8}{}'.format(
            tree, totals[tree], written, steps, flag))
    print('{:<26} {:>7} {:>7} {:>8}'.format(
        'TOTAL', len(nodes), done, sum(v[1] for v in stored.values())))
    for row in connection.step_audit_summary():
        print('  audit  {:<9} {:<6} {}'.format(row['stage'], row['outcome'], row['count']))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--tree', action='append', default=[],
                        help='Only this tree id. Repeatable.')
    parser.add_argument('--node', action='append', default=[],
                        help='Only this node id. Repeatable.')
    parser.add_argument('--tier', action='append', default=[],
                        help='Only this difficulty. Repeatable.')
    parser.add_argument('--limit', type=int, default=0,
                        help='Stop after this many nodes.')
    parser.add_argument('--redo', action='store_true',
                        help='Rewrite nodes that already have steps.')
    parser.add_argument('--workers', type=int, default=6,
                        help='Nodes in flight at once. Default 6.')
    parser.add_argument('--rounds', type=int, default=3,
                        help='Generate-and-review rounds before giving up. Default 3.')
    parser.add_argument('--model', default=os.environ.get('SKILL_STEPS_MODEL') or DEFAULT_MODEL)
    parser.add_argument('--provider', default='',
                        help='anthropic | groq | grok. Default: whichever is keyed.')
    parser.add_argument('--report', action='store_true',
                        help='Print coverage and exit. Calls nothing.')
    parser.add_argument('--priority', action='store_true',
                        help='Rank trees by the work accounts have finished. Calls nothing.')
    parser.add_argument('--by-activity', action='store_true',
                        help='Work the trees accounts actually use first, and skip the rest.')
    parser.add_argument('--no-problems', dest='problems', action='store_false',
                        help='Write the steps only, and no questions under them.')
    parser.add_argument('--problems-only', action='store_true',
                        help='Leave the steps alone and fill the problem sets '
                             'missing from them.')
    parser.add_argument('--dry-run', action='store_true',
                        help='Generate and check, but write nothing.')
    args = parser.parse_args()

    if args.report:
        report()
        return 0

    if args.priority:
        priority_report()
        return 0

    nodes = load_nodes()
    if args.tree:
        nodes = [node for node in nodes if node['tree'] in set(args.tree)]
    if args.tier:
        nodes = [node for node in nodes if node['tier'] in set(args.tier)]
    if args.node:
        nodes = [node for node in nodes if node['id'] in set(args.node)]
    if args.by_activity:
        # Heaviest-used tree first, and trees nobody has touched are dropped
        # rather than pushed to the back: a run that never finishes should
        # spend every call it makes on a node somebody will open.
        rank = {tree: at for at, (tree, *_) in enumerate(activity_order())}
        nodes = [node for node in nodes if node['tree'] in rank]
        nodes.sort(key=lambda node: (rank[node['tree']], node['id']))
    # In the problems-only pass the skip is inverted: the nodes worth a call
    # are the ones that *do* have a programme, and what is missing is the
    # questions under it.
    gap = {}
    if args.problems_only:
        gap = problem_gap([node['id'] for node in nodes])
        nodes = [node for node in nodes if node['id'] in gap]
    elif not args.redo:
        have = set(connection.skill_steps_for([node['id'] for node in nodes]))
        nodes = [node for node in nodes if node['id'] not in have]
    if args.limit:
        nodes = nodes[:args.limit]

    if not nodes:
        print('Nothing to do — every node asked for already has {}.'.format(
            'problems on every step' if args.problems_only else 'steps'))
        return 0

    run_id = datetime.now().isoformat(timespec='seconds')
    # What actually answers, which is what gets written on every row.
    answering = effective_model(args.provider, args.model)
    print('{} node(s), {} via {}, {} workers, run {}'.format(
        len(nodes), answering, args.provider or planner.provider() or 'no provider',
        args.workers, run_id))

    lock = threading.Lock()
    tally = {'ok': 0, 'failed': 0, 'steps': 0, 'problems': 0, 'thin': 0,
             'skipped': 0}

    def work(node):
        if SPENT.is_set():
            # Not a failure of this node — it was never asked. Counted apart
            # from the ones that were, so the tally at the end is honest about
            # how much of the list the run actually reached.
            with lock:
                tally['skipped'] += 1
            return None
        if args.problems_only:
            # The programme is already in the table; only the sets are new.
            out = Outcome(node['id'])
            steps = gap[node['id']]
            sets = build_problems(node, steps, args.model, args.rounds,
                                  args.provider, out)
            passed = len(sets) == len(steps)
        else:
            out = build(node, args.model, args.rounds, args.provider)
            # Problems hang off steps, so a programme that did not come through
            # has nothing to hang them on and is not worth the calls.
            sets = (build_problems(node, out.steps, args.model, args.rounds,
                                   args.provider, out)
                    if out.steps and args.problems else {})
            passed = bool(out.steps)
        with lock:
            # Serialised because SQLite takes one writer, and because the
            # progress line is unreadable interleaved.
            if not args.dry_run:
                store(out, node, answering, run_id, sets=sets,
                      steps=not args.problems_only)
            if passed:
                tally['ok'] += 1
                tally['steps'] += len(out.steps)
                tally['problems'] += sum(len(one) for one in sets.values())
                # A node that came through with sets on only some of its steps.
                # Worth counting separately: it is not a failure — the steps are
                # good and the panel draws empty slots on the rest — but it is
                # the list `--problems-only` will be run over later.
                if args.problems and len(sets) < len(out.steps or gap.get(node['id'], [])):
                    tally['thin'] += 1
            else:
                tally['failed'] += 1
            done = tally['ok'] + tally['failed']
            wrote = ('{} steps, {} problems, {} round(s)'.format(
                         len(out.steps), sum(len(one) for one in sets.values()),
                         out.attempts)
                     if not args.problems_only else
                     '{}/{} sets, {} problems'.format(
                         len(sets), len(gap[node['id']]),
                         sum(len(one) for one in sets.values())))
            print('[{:>4}/{}] {:<9} {:<28} {}'.format(
                done, len(nodes),
                'ok' if passed else 'FAILED',
                node['id'],
                wrote if passed else out.note[:70]),
                flush=True)
        return out

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(work, node) for node in nodes]
        for future in as_completed(futures):
            future.result()

    print('\n{} written, {} failed, {} steps, {} problems total.'.format(
        tally['ok'], tally['failed'], tally['steps'], tally['problems']))
    if tally['skipped']:
        print('{} node(s) were never asked: the key\'s allowance for the day '
              'went while the run was going. Nothing is half-written — run the '
              'same command again when the window rolls.'.format(tally['skipped']))
    if tally['thin']:
        print('{} node(s) are short of a set on some step — '
              '--problems-only is the second pass over them.'.format(tally['thin']))
    if args.dry_run:
        print('--dry-run: nothing was saved.')
    return 0 if tally['failed'] == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
