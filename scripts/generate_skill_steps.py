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

#: The completion budget sent to Groq, which is the throughput lever and not
#: an obvious one.
#:
#: Groq's free tier counts the prompt *plus the completion you asked for*
#: against a fixed per-minute allowance — the tokens you reserve, not the
#: tokens you use. Asking for the Anthropic-sized budgets above therefore books
#: most of a minute per call whatever the model actually writes, and the run
#: crawls at a third of a node a minute while the model sits idle.
#:
#: These are sized to the real answers. Ten steps of six short fields is around
#: 2,000 tokens of JSON and a verdict list is a few hundred, so the ceiling
#: only has to clear those with room for the reasoning. It roughly trebled the
#: rate.
GROQ_BUDGET = 3200
GROQ_REVIEW_BUDGET = 1400


# ---------------------------------------------------------------------------
# The prompts
# ---------------------------------------------------------------------------
# Written against one failure mode, and it is worth saying which: a model asked
# for "practice steps" writes advice. Advice is the genre — "practise regularly,
# focus on accuracy, review your mistakes" — and every sentence of it is true
# and useless. The system prompt spends most of its words refusing that genre
# and showing the alternative, because naming it is not enough; the example is
# what actually moves the output.
GENERATE_SYSTEM = """\
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
  NO   Practise until it feels easy.    names nothing, and cannot be finished
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
- Be correct. A wrong worked answer is worse than a vague step, and every
  number you write will be checked by somebody who sits down and tries it.
"""

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
   memory", "work through examples", "practise until comfortable". A step that
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


# ---------------------------------------------------------------------------
# Talking to the model
# ---------------------------------------------------------------------------
def ask(brief, system, schema, model_id, max_tokens, provider='', groq_budget=0):
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
                                max_tokens, groq_budget))
        except Exception as exc:  # noqa: BLE001 - re-raised below unless it is a 429
            text = str(exc)
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


def _call(name, brief, system, schema, model_id, max_tokens, groq_budget=0):
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
            reasoning=planner.GROQ_REASONING, timeout=180.0)
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
                        groq_budget=GROQ_REVIEW_BUDGET)
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


def store(out, node, model_id, run_id):
    """Write a passing node's programme, and its audit trail either way."""
    stamp = datetime.now().isoformat(timespec='seconds')
    for row in out.audit:
        row['run_id'] = run_id
    if out.steps:
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
    else:
        out.log('store', 'drop', out.note or 'did not pass review')
    for row in out.audit:
        row.setdefault('run_id', run_id)
    connection.log_step_audit(out.audit)


# ---------------------------------------------------------------------------
# The run
# ---------------------------------------------------------------------------
def load_nodes():
    with open(NODES_PATH, 'r') as handle:
        return json.load(handle).get('nodes', [])


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
    parser.add_argument('--dry-run', action='store_true',
                        help='Generate and check, but write nothing.')
    args = parser.parse_args()

    if args.report:
        report()
        return 0

    nodes = load_nodes()
    if args.tree:
        nodes = [node for node in nodes if node['tree'] in set(args.tree)]
    if args.tier:
        nodes = [node for node in nodes if node['tier'] in set(args.tier)]
    if args.node:
        nodes = [node for node in nodes if node['id'] in set(args.node)]
    if not args.redo:
        have = set(connection.skill_steps_for([node['id'] for node in nodes]))
        nodes = [node for node in nodes if node['id'] not in have]
    if args.limit:
        nodes = nodes[:args.limit]

    if not nodes:
        print('Nothing to do — every node asked for already has steps.')
        return 0

    run_id = datetime.now().isoformat(timespec='seconds')
    # What actually answers, which is what gets written on every row.
    answering = effective_model(args.provider, args.model)
    print('{} node(s), {} via {}, {} workers, run {}'.format(
        len(nodes), answering, args.provider or planner.provider() or 'no provider',
        args.workers, run_id))

    lock = threading.Lock()
    tally = {'ok': 0, 'failed': 0, 'steps': 0}

    def work(node):
        out = build(node, args.model, args.rounds, args.provider)
        with lock:
            # Serialised because SQLite takes one writer, and because the
            # progress line is unreadable interleaved.
            if not args.dry_run:
                store(out, node, answering, run_id)
            if out.steps:
                tally['ok'] += 1
                tally['steps'] += len(out.steps)
            else:
                tally['failed'] += 1
            done = tally['ok'] + tally['failed']
            print('[{:>4}/{}] {:<9} {:<28} {}'.format(
                done, len(nodes),
                'ok' if out.steps else 'FAILED',
                node['id'],
                '{} steps, {} round(s)'.format(len(out.steps), out.attempts)
                if out.steps else out.note[:70]),
                flush=True)
        return out

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(work, node) for node in nodes]
        for future in as_completed(futures):
            future.result()

    print('\n{} written, {} failed, {} steps total.'.format(
        tally['ok'], tally['failed'], tally['steps']))
    if args.dry_run:
        print('--dry-run: nothing was saved.')
    return 0 if tally['failed'] == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
