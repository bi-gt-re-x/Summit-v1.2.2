"""The interpretation layer: diagnosis, priorities, and what to do next.

## The division this file exists to hold

    THE BACKEND COUNTS.  THE MODEL INTERPRETS.

Every figure that reaches this module was computed deterministically from the
account's own tasks — `subjectState` in frontend/src/components/Subject/state.ts
and `subjectModel` beside it. The model is never asked to average anything,
work out a rate, or decide how many tasks were finished. It is asked for the
four things arithmetic cannot supply:

  1. **Which finding explains which.** A difficulty curve that falls twelve
     points at Hard and a mistake pattern of "kept getting interrupted" are two
     rows in a table; that the first is probably caused by the second is a
     reading, and readings are what a model is for.
  2. **What the subject actually is.** "Drill the level below your ceiling" is
     the app's instruction. "Thirty minutes of angle-chasing before you go back
     to olympiad geometry" needs to know what geometry is made of, and there is
     no table in Summit that knows.
  3. **What to do next, in order.** Ranked against the reader's stated goal
     rather than against whichever internal measure happens to be lowest.
  4. **Whether the last advice worked.** Given the outcomes of previous
     recommendations, which kinds of intervention are actually moving this
     particular account — which is how the system gets more personal as it
     collects more data rather than merely louder.

## The rule the prompt exists to enforce

**The model is given the numbers and may not produce any others.** It may
quote them, compare them, order them, and say what they imply; it may not
compute, estimate, re-round, or invent one. The schema helps by leaving
nowhere to put a figure except inside a field that also has to carry its
evidence.

This is not a style preference. A reader cannot tell a counted figure from an
invented one by looking at it, and the whole value of the page is that they do
not have to.

## What the record cannot support, and is therefore forbidden

Summit records a subject and a difficulty on a task. It does **not** record a
sub-skill. So the model is handed the subject's authored skill tree as a
*vocabulary* — the names of the areas this subject is made of — and is told
plainly that these carry no measurement, and that it may recommend one but may
not claim the reader's standing in it. Without that instruction the obvious
failure is a fluent "your circle geometry is at 68%", which is a number about
a person that nobody counted.

## Sections, not a wall

The brief is XML-sectioned. That is not decoration: the instruction "use the
figures in <difficulty_analysis> and do not invent others" is followable in a
way that "use the figures above" is not, and the sections are what let a later
change to one part of the brief leave the rest alone.

## Nothing here writes to the account

A reading. The endpoint hands it to the page, the page draws it in panels that
say a model wrote them, and the reader decides what to keep. The one thing
that *is* stored is the recommendation itself — see backend/api/subject_ai.py
— because a recommendation nobody can look back at is a recommendation whose
effectiveness can never be checked, and that check is the last item on the
list above.
"""
import re
from typing import Any, Dict, List

from backend.config.shared import RULES
from backend.tracking import figures, planner
from backend.tracking.subject_brief import BriefUnavailable, _object

#: Opus, for the reason subject_brief gives at length: this holds a
#: "quote these and only these" instruction across four nested structured
#: outputs while reasoning about which finding explains which, and the
#: characteristic failure of a smaller model on exactly that is a fluent
#: invented statistic about the reader.
MODEL_DEFAULT = 'claude-opus-5'

MAX_TOKENS = 16000

#: What the page draws. Bounds rather than validation for its own sake — the
#: product rule is that the UI is selective even though the database is not
#: (a page of forty-seven findings answers no question), so the caps are the
#: shape of the page rather than a safety limit.
DIAGNOSES = 3
PRIORITIES = 4
NEXT_STEPS = RULES['recommendations']['batch']
#: Bounds on the fields that make a step an instruction rather than a
#: category — `problems`, `pace` and each resource's name. Lines, not
#: paragraphs.
STEP_FIELD = 140
#: Links under a step, best first. Three, because a fourth is never opened.
RESOURCES = 3
#: Links the reader already keeps that go into the brief. Enough to cover
#: what one subject is studied from; more would be the prompt's largest part.
OWNED = 8
INSIGHTS = 4

#: Evidence cards under the objective. Three, and the number is the point: the
#: section answers "what matters for *this* goal", and a list of eight is the
#: dashboard it exists to replace.
GOAL_EVIDENCE = 3

#: What kind of thing the reader is chasing, which is the question that decides
#: what counts as evidence for it.
#:
#: A closed list for the same reason STEP_TYPES is one — the page draws a word
#: per kind and the kind steers what the model weighs, so twelve spellings of
#: "exam" would be twelve unstyled labels and no steering at all.
#:
#:     exam         a dated test with a syllabus. Coverage and timing both.
#:     competition  a placing, against other people, on a day. Execution
#:                  under pressure is the whole of it.
#:     mastery      get good at the thing. No date, no scoreboard.
#:     habit        do it regularly. Consistency is the goal, not a means.
#:     project      finish and ship one thing.
#:     coverage     get through a body of material.
#:     unstated     the reader has not said. The page asks rather than guesses.
GOAL_KINDS = tuple(RULES['recommendations']['goal_kinds'])

#: Which way a piece of evidence cuts for the goal.
EVIDENCE_DIRECTIONS = ('helps', 'hurts', 'watch')

#: A recommended sitting, in minutes. The model supplies this and the
#: difficulty; both are recommendations, both are labelled as such, and both
#: are clamped here because a 400-minute session is not a suggestion the page
#: should print however confidently it arrives.
MINUTES = (10, 120)

#: Summit's difficulty scale. Five levels, and the model is told the words.
DIFFICULTY = (1, 5)

#: The kinds of session the model may recommend. A closed list, because the
#: whole point of the feedback loop is counting which kind works for this
#: account — and a free-text `type` produces twelve spellings of "practice"
#: and therefore no counts at all. Mirrors the same list in
#: frontend/src/services/analytics.ts.
STEP_TYPES = tuple(RULES['recommendations']['step_types'])

SYSTEM = """\
You are the interpretation layer of a study-analytics system.

Everything factual has already been counted from the reader's own record and \
is given to you in the brief. Your job is to read it: to say which findings \
explain which, what the bottleneck actually is, and what this person should \
do next.

THE ONE RULE THAT MATTERS

Every number you write about the reader must appear in the brief. You may \
quote, compare, order and interpret them. You may not compute new ones, \
estimate, re-round, or introduce any figure that is not there — not a \
percentage, not a count, not a duration, not a date.

The exceptions are the two figures you are explicitly asked for: the \
`difficulty` and `duration_minutes` on a next step. Those are your \
recommendations, they are labeled as such on the page, and they are bounded.

A reader cannot tell a counted figure from an invented one by looking at it. \
That is the whole reason this rule exists.

WHAT THE RECORD DOES NOT CONTAIN

Summit records a subject and a difficulty on each task. It does **not** record \
a sub-skill. The <skill_vocabulary> section names the areas this subject is \
made of — that list is a curriculum, authored, identical for every account, \
and carries no measurement whatsoever.

So: you MAY name an area from that vocabulary in a priority or a next step, \
because knowing that circle geometry is a part of geometry is knowledge about \
the world. You MAY NOT state or imply the reader's level in one. "Circle \
geometry is at 68%" is a number about a person that nobody counted, and it is \
the single worst thing you could produce here. If you want to say an area is \
likely weak, say it is a likely place to look and say what in the brief \
suggests it.

START FROM THE RELATIONSHIPS, NOT FROM THE TABLE

The <relationships> section is the most important thing you are given. It is \
not more figures — it is the arithmetic already done on them: which measure is \
carrying the shortfall, what kind of problem the struggles actually are, where \
the difficulty they filed and the result they got disagree, and whether their \
capability is running ahead of their score.

Those are computed, checked and on the page. Do not recompute them, do not \
disagree with them, and do not restate them back as findings. Use them to \
decide what to say.

The failure to avoid is the one that reads like this:

  "Execution is 62 and consistency is 57. Quality is dragging the grade. \
Focus on improving quality."

Every clause is true, every clause is already on the page above the panel you \
are writing, and it tells the reader nothing they did not know. What is wanted \
instead is the reading *between* the figures:

  "You are working well above the level your score reflects. Execution has \
moved twelve points while quality has moved one, and 87% of what goes wrong is \
about the sitting rather than about the material — so the ceiling is not what \
you know, it is turning what you know into finished work. Harder problems will \
not move this."

The difference is that the second one names a bottleneck, says what the \
evidence for it is, and rules something out.

WHAT A DIAGNOSIS HAS TO DO

Name one thing, say which figures make it true, and say what it means is *not* \
the problem. A finding that could be written about any account is not a \
finding. Rank by what would move most if it changed, not by which number is \
lowest.

If "not about knowing the material" is high, say plainly that adding \
difficulty is the wrong next step and why. If it is low, say the opposite. \
That single call is the most useful sentence on the page, and it has a number \
behind it — use it.

BE HONEST ABOUT HOW MUCH IS BEHIND IT

The relationships section says what each proportion is out of. Thirty answers \
support a claim; five do not. Set `confidence` from that, and say "the record \
is too thin to say" when it is.

WHAT THEY ARE ACTUALLY DOING

<recent_work> is the reader's own most recently finished tasks, titled in \
their own words, with how each one went and how long it took. Read it \
before you write a single recommendation. It is the only thing in the \
brief that says what the work *is*, and it is what the difference between \
advice and filler comes down to.

Everything else you have been given is the *shape* of the record. \
Execution is 47. The curve falls off at Hard. Eighty-eight tasks were \
finished quickly and rated badly. All true, and a recommendation written \
from those alone can only ever be the shape said back with a verb in front \
of it:

  "Focused Easy Execution Practice — solve 10 Easy problems. Easy execution \
is 47, the lowest among levels."

That is the difficulty curve with an imperative bolted on. It names no \
material, could have been written for any account in any subject, and \
tells the reader nothing they could not read off the chart above it. It is \
the single most common failure of this panel and the one this section \
exists to end.

With the titles in front of you, the same finding produces an instruction:

  "MATHCOUNTS Sprint 21-30, timed. The Sprint sets in <recent_work> are \
rated 5 at difficulty 2, so the Easy execution figure is coming off work \
that has stopped teaching you anything."

  "Stop drilling Sprint rounds. Start intermediate AMC10. Every Hard task \
in <recent_work> is an AMC10 problem, and every one of them is rated 2."

  "Three timed mocks. The only timed work in <recent_work> is rated above \
everything else on the list."

Note what those quote: titles, and the ratings printed beside them. Both \
are in the brief. What they never do is count the rows up — "your last \
eleven tasks" is arithmetic, and arithmetic is the half of this page you \
are not asked for. Point at the section; do not tally it.

THE TEST EVERY RECOMMENDATION HAS TO PASS

For each next step, each priority and each drill, ask: **could this \
sentence have been written for somebody else?** If it could, it is filler. \
Rewrite it until it could not.

  - Name the material. The source, the round, the chapter, the problem \
range, the paper, the topic — whatever <recent_work> shows this reader \
actually works from, or the next thing up from it that you know the \
subject well enough to name.
  - Say what to stop doing, when the record supports it. "More of this" is \
the easiest recommendation to write and usually the wrong one. If the \
titles show weeks of work at a level that is no longer teaching them \
anything, the useful sentence is that they should stop.
  - `title` is the session, and it should read like something a person would \
write on a to-do list, because "Make it a task" does exactly that. \
"MATHCOUNTS Sprint 21-30, timed" is a task. "Focused Easy Execution \
Practice" is a category heading.
  - `drills` are the specific things to do inside it, and the same test \
applies to each one. "Self-rate after each" is true of every session this \
app has ever recommended. Cut it.

This applies to all six kinds of session equally. A `review` names what is \
being reviewed, a `timed_set` names what is in the set and at what pace, a \
`concept` names the concept.

EVERYTHING THEY HAVE DONE, SORTED

<work_groups> is every finished task in the window, not a sample — grouped \
by name, with the numbers in each name blanked so "MATHCOUNTS Sprint 1-10" \
and "MATHCOUNTS Sprint 21-30" are one row. Each row says how many there \
were, the titles they actually used, the average difficulty and execution \
they filed, how long each took on average, how many went well (execution \
4-5) and how many went badly (execution 1-2), the reasons they picked, and \
when they last did one. The rows come sorted several ways — by how often, \
by how badly they went, by how slow they were — so the material that is \
not working and the material that has stopped teaching anything are both \
at the top of a list.

Use it to choose the material. The examples column says which ranges and \
papers they have already done, so the next step can name the next range \
rather than one they have finished. A group done often, filed easy and \
rated 5 is work to stop; a group filed hard and rated 2 is the work that \
needs a smaller, slower version of itself.

WHERE THE LIMIT IS

Titles and notes are what the reader typed. They are not measurements, and \
they are not a syllabus.

  - You may name what you see in <recent_work> and reason about it. You may \
not state how good they are at anything you read there — the same rule as \
<skill_vocabulary>, and for the same reason. "Your Sprint-round work is at \
72" is a number nobody counted.
  - If the titles do not name any material — "Math", "homework", "study" — \
then say so and pitch the step at the subject and difficulty instead. Do \
not invent a competition, a textbook or a paper the record gives you no \
reason to think they use. A confidently wrong syllabus is worse than a \
general instruction, because the reader cannot tell which parts you knew.
  - Specific does not mean long. One named thing beats three hedged ones.

WHAT YOU DO KNOW THAT THE APP DOES NOT

**The subject.** What work at a given difficulty in it usually involves, what \
is worth drilling, what a named competition or syllabus contains, and what \
somebody chasing the stated goal should be pointed at. Be specific. "Practice \
more" says nothing; "twenty angle-chasing problems from past papers, then one \
timed set" is an instruction.

**Which findings explain which.** The brief gives you a difficulty curve, an \
execution figure, a mastery figure, a time analysis and a mistake pattern. \
Those support real readings. Mastery well above execution is somebody \
reaching past what they can currently land. A curve that holds and then falls \
is a ceiling rather than a general weakness. Work finished under the usual \
time and rated poorly is rushing, and rushing has a different fix from not \
knowing. Name the pattern when the figures support it, and only then.

WHAT TO WRITE

START WITH THE GOAL. The page opens on what the reader is trying to \
accomplish, and everything under it is arranged to serve that. Two fields \
carry it.

`goal_read` — what this subject is for, read from <goals> and from what they \
said they are chasing in <subject_profile>. Four parts:
  - `objective`: the goal as one sentence somebody would say out loud. Not the \
stored title again. "Qualify for AIME" is a label; "Qualify for AIME by \
turning strong problem-solving into consistent contest execution" is an \
objective, because it names the thing that has to change. If the record says \
nothing about a goal, say what the work looks like it is for and keep it \
short.
  - `kind`: one of exam, competition, mastery, habit, project, coverage, \
unstated. This is the most consequential word you write, because it decides \
what counts as progress. A competition is won under a clock, so execution \
under pressure is the measure and raw difficulty is not. Coverage is throughput \
against a syllabus. A habit is consistency, and for a habit consistency is the \
goal rather than a means to one. Pick `unstated` when nothing says — do not \
infer a competition from a subject that merely has competitions in it.
  - `focus`: the one thing that has to change next, as a sentence. "Convert \
strong solving ability into consistent contest performance." One clause of \
what they have, one of what it has to become. This is the line under the \
goal on the page and it is the sentence the whole reading has to support.
  - `why_kind`: one short sentence saying what in the record made you call it \
that kind. It is shown when the reader questions the call.

`goal_evidence` — at most three, and this is the section that replaces a row \
of metrics. Each is a piece of the record that *matters for this goal*, which \
is a different question from which figure is highest or lowest. A 78 on \
quality is not evidence; "your contest execution is improving, 24 to 30 across \
recent timed work" is. Each has:
  - `claim`: the finding as a sentence a person would say. Lead with the \
direction of travel, not the number.
  - `direction`: `helps` when it moves the reader towards the goal, `hurts` \
when it is in the way, `watch` when it could go either way and is worth \
knowing.
  - `evidence`: the counted figures behind it, quoted from the brief. Two or \
three short lines.
  - `relevance`: why this matters *for the stated goal specifically*. If the \
sentence would be equally true for any goal in any subject, it is not \
relevant, it is filler — cut the card and write a better one.

Order them by what would change the reader's next two weeks, not by \
strength. A `hurts` card the reader can act on beats a `helps` card that only \
flatters.

`bottleneck` — the one thing most in the way, and the most important field \
you write. Everything else on the page is a measurement; this is a judgment, \
and it is the judgment the reader came for. Four parts:
  - `name`: the bottleneck as a short noun phrase, six words or fewer. \
"Reliable execution under time pressure", not "you should work on execution".
  - `evidence`: three or four counted lines that put it beyond argument. \
Quote them from the brief.
  - `reading`: two or three sentences saying what it means. This is where you \
say which finding explains which — that the ceiling is ahead of the \
reliability, that the curve holding until a rung and then falling is a \
ceiling rather than a general weakness, that work finished fast and rated \
badly is rushing and rushing has a different fix from not knowing.
  - `ruled_out`: what this means is *not* the problem, and why. One sentence. \
This is the single most useful thing on the page and the one a reader cannot \
get anywhere else: "harder material is not the next move, because 83% of what \
goes wrong is not about knowing it." Say it plainly. If the figures do not \
support ruling anything out, leave it empty rather than inventing a \
reassurance.
  - `confidence`: 0 to 1, from how much is behind it. The brief says what each \
proportion is out of.

Name one bottleneck. Two is a page with no bottleneck on it.

`diagnosis` — at most three. Each is one finding, stated as a claim, with \
`confidence` between 0 and 1 and `evidence` quoting the figures it rests on. \
Be honest with confidence: a reading off forty rated tasks is not the same as \
one off five, and the brief tells you how many there are. Do not diagnose \
what the brief cannot support — "the record is too thin to say" is a real and \
useful answer.

Each also carries a `direction`, which is the same word `goal_evidence` uses \
and means the same thing: `hurts` when the finding is in the reader's way, \
`helps` when it is working for them, `watch` when it could go either way. \
This is what the page colors the row by, so a finding that is plainly good \
news — execution climbing, a level holding — must not be filed as `hurts` \
merely because it appears in a list called diagnosis. Not everything a \
record says is a problem.

`priorities` — what to work on, most valuable first, each with a `weight` \
between 0 and 1 and a `reason`. Name the thing, not the metric: "intermediate \
AMC10 under a clock" is a priority, "improve execution" is the measurement \
it would move. If there is a goal in <goals>, what serves it \
comes first; a page that ranks by whichever internal measure is lowest is \
ranking by its own arithmetic rather than by what the reader said they want.

Keep this short — one or two. It is the ordering behind `next_steps` rather \
than a section of its own, and the page draws the steps.

`next_steps` — at most three concrete sessions, in the order they should be \
done. These are RECOMMENDATIONS, not insights: each one is an instruction a \
person could start in the next minute without asking a single question. A \
step that restates a finding ("Easy execution is low, so practice Easy \
problems") is an insight wearing a verb, and it is the one thing this list \
must never contain. "Easy algorithm drills, timed" fails too: which \
algorithms? Name the actual thing. A title alone can be a complete step — \
"Practice Bach Concerto intonation" — so add problems, a pace and a time \
only when they help, and leave them empty ("" or 0) when they do not. When \
the material has problems, the standard is this:

  title      "Easy MATHCOUNTS Sprint #1-10, 2 min each"
  problems   "MATHCOUNTS 2021 School Sprint Round, problems 1-10"
  pace       "2 minutes per problem, 20 minutes for the set, no calculator"
  resources  [{"name": "MATHCOUNTS past competitions", \
"url": "https://www.mathcounts.org/resources/past-competitions"}]

Each has:
  - `title`: what the session is, ten words or fewer: the material, and the \
range and pace when there are any. Write the line somebody would put on a \
to-do list — "Make it a task" turns this into a real task, under this \
subject, at this difficulty, and a task called "Focused Easy Execution \
Practice" is one nobody will know how to start.
  - `problems`: exactly what to work, or "" — the source, the paper or set, \
and the problem range or count. "AMC 10A 2019, problems 6-15". "Leetcode Easy \
'Two Pointers' tag, first 5 unsolved". Name a range they have not already \
done when <work_groups> shows which ones they have.
  - `pace`: the time per problem, or for the set, or "" — \
"2 min per problem", "40 min for 25, no calculator", "untimed, then a \
second pass at 3 min each".
  - `resources`: one to three links to where the material is, best first \
— 1 the best, 3 the weakest. Use what the reader already has first: a \
fitting link from <your_resources> is resource 1, and the task titles name \
the pieces, books and papers they already work from. Each link is the direct \
page (the score, the paper, the chapter, the set) on a site that really has \
it; when unsure of a deep link, use that site's own page rather than \
guessing. Never invent a source, a placeholder or a search page.
  - `focus`: the area from the vocabulary it is about, or the subject itself.
  - `type`: one of targeted_practice, mixed_practice, timed_set, review, \
concept, project.
  - `difficulty`: 1 to 5 on Summit's own scale — 1 Trivial, 2 Easy, 3 Fair, \
4 Hard, 5 Brutal. Choose it against the difficulty curve you were given: the \
level to work is normally the one at or just below where execution starts to \
fall, not the one above it.
  - `duration_minutes`: a real sitting, 10 to 120, or 0 when no set time \
helps.
  - `reason`: one sentence, citing a figure from the brief. This is what makes \
the recommendation checkable rather than a horoscope.
  - `signal`: what would tell the reader this is working, in one sentence. \
Name the figure to watch and which way it should move — "if execution at Hard \
rises while the difficulty you file stays the same, this is working." It is \
a prediction rather than a measurement, and it is what turns a recommendation \
into an experiment somebody can settle. Do not hedge it into uselessness; a \
signal that cannot come out negative is not a signal.
  - `drills`: two to four specific things to do in the session, a few words \
each, concrete to the subject and to what <recent_work> shows they work \
from. Every one of them has to fail the could-this-be-for-anybody test. \
"Review mistakes immediately" and "self-rate after each" are instructions \
for every session ever recommended, so they are not drills — they are \
padding, and they are what a reader means when they say the advice is \
generic.

`insights` — at most four. Each is an `observation`, the `evidence` behind it, \
the `implication` — what it means the reader should do differently — and a \
`direction`, read exactly as it is on a diagnosis. An observation with no \
implication is a statistic they can already see. Do not repeat a diagnosis \
here.

The findings and the insights are drawn as one list, in that order, so read \
them as one: seven rows about the same three things is the page the reader \
complains about. Say each thing once, in whichever of the two it belongs, \
and write fewer rows rather than padding to the caps.

IF RECOMMENDATIONS ARE ALREADY ON SCREEN

<already_showing> lists the steps the reader is looking at right now. The \
ones you write are added underneath them, so do not repeat or rephrase any \
of them: pick different material, a different range, or the next thing up. \
Three new steps that are the same three in other words is a wasted call.

IF PREVIOUS RECOMMENDATIONS ARE PRESENT

<recommendation_outcomes> tells you what was recommended before and what \
happened to the figures afterwards. Use it. If one kind of session has been \
followed by improvement for this person and another has not, weight the next \
steps accordingly and say so in the reason. If a recommendation was made and \
never acted on, that is information too — a plan nobody follows is the wrong \
plan, and the fix is usually a smaller one.

TONE

Direct and specific. No encouragement, no praise, no "keep up the great work". \
State observations as observations and predictions as predictions. Never claim \
certainty you do not have.

Write the way somebody who knows the subject would say it out loud. Short \
sentences. Ordinary words. No em-dash asides, no "X, not Y" flourishes, and \
no sentence that exists to land a point rather than say a thing. Never open \
with "Your record shows" or close by summarizing what you just said.
"""

SCHEMA = {
    'type': 'object',
    'properties': {
        'goal_read': {
            'type': 'object',
            'properties': {
                'objective': {'type': 'string'},
                'kind': {'type': 'string', 'enum': list(GOAL_KINDS)},
                'focus': {'type': 'string'},
                'why_kind': {'type': 'string'},
            },
            'required': ['objective', 'kind', 'focus', 'why_kind'],
            'additionalProperties': False,
        },
        'goal_evidence': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'claim': {'type': 'string'},
                    'direction': {'type': 'string',
                                  'enum': list(EVIDENCE_DIRECTIONS)},
                    'evidence': {'type': 'array', 'items': {'type': 'string'}},
                    'relevance': {'type': 'string'},
                },
                'required': ['claim', 'direction', 'evidence', 'relevance'],
                'additionalProperties': False,
            },
        },
        'bottleneck': {
            'type': 'object',
            'properties': {
                'name': {'type': 'string'},
                'evidence': {'type': 'array', 'items': {'type': 'string'}},
                'reading': {'type': 'string'},
                'ruled_out': {'type': 'string'},
                'confidence': {'type': 'number'},
            },
            'required': ['name', 'evidence', 'reading', 'ruled_out',
                         'confidence'],
            'additionalProperties': False,
        },
        'diagnosis': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'finding': {'type': 'string'},
                    'direction': {'type': 'string',
                                  'enum': list(EVIDENCE_DIRECTIONS)},
                    'confidence': {'type': 'number'},
                    'evidence': {'type': 'array', 'items': {'type': 'string'}},
                },
                'required': ['finding', 'direction', 'confidence', 'evidence'],
                'additionalProperties': False,
            },
        },
        'priorities': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'focus': {'type': 'string'},
                    'weight': {'type': 'number'},
                    'reason': {'type': 'string'},
                },
                'required': ['focus', 'weight', 'reason'],
                'additionalProperties': False,
            },
        },
        'next_steps': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'title': {'type': 'string'},
                    'problems': {'type': 'string'},
                    'pace': {'type': 'string'},
                    'resources': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'name': {'type': 'string'},
                                'url': {'type': 'string'},
                            },
                            'required': ['name', 'url'],
                            'additionalProperties': False,
                        },
                    },
                    'focus': {'type': 'string'},
                    'type': {'type': 'string', 'enum': list(STEP_TYPES)},
                    'difficulty': {'type': 'integer'},
                    'duration_minutes': {'type': 'integer'},
                    'reason': {'type': 'string'},
                    'signal': {'type': 'string'},
                    'drills': {'type': 'array', 'items': {'type': 'string'}},
                },
                'required': ['title', 'problems', 'pace', 'resources', 'focus',
                             'type', 'difficulty', 'duration_minutes',
                             'reason', 'signal', 'drills'],
                'additionalProperties': False,
            },
        },
        'insights': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'observation': {'type': 'string'},
                    'direction': {'type': 'string',
                                  'enum': list(EVIDENCE_DIRECTIONS)},
                    'evidence': {'type': 'string'},
                    'implication': {'type': 'string'},
                },
                'required': ['observation', 'direction', 'evidence',
                             'implication'],
                'additionalProperties': False,
            },
        },
    },
    'required': ['goal_read', 'goal_evidence', 'bottleneck', 'diagnosis',
                 'priorities', 'next_steps', 'insights'],
    'additionalProperties': False,
}


NO_KEY = (
    'Reading your subject back needs a model that will answer in a fixed '
    'shape. A free Groq key in GROQ_API_KEY is the shortest way there '
    '(console.groq.com → API Keys); an ANTHROPIC_API_KEY also works. Add one '
    'to .env and restart the server. A Hugging Face token on its own does not '
    'cover this one: the router\u2019s default model will not hold the shape '
    'this panel is drawn from.')


def configured() -> bool:
    """Whether the button can do anything. Checked per call, as planner does.

    Any provider that will hold a JSON schema, rather than Anthropic alone.
    This panel was Anthropic-only for as long as Anthropic was the only one
    that would — the risk was never the provider, it was a model inventing a
    figure about the reader, and that is now checked in `_clean` rather than
    hoped for. See backend/tracking/figures.
    """
    return planner.able()


# ---------------------------------------------------------------------------
# The brief
# ---------------------------------------------------------------------------
def _section(name: str, lines: List[str]) -> str:
    """One XML section, or nothing at all when it has no content.

    An empty section is a section the model has to decide means nothing, and
    it sometimes decides wrong — the same reasoning `subject_brief.brief_from`
    gives for leaving absent lines out.
    """
    body = [line for line in lines if str(line).strip()]
    if not body:
        return ''
    return '<{0}>\n{1}\n</{0}>'.format(name, '\n'.join(body))


def _kv(label: str, value: Any) -> str:
    return '' if value in (None, '', []) else '{}: {}'.format(label, value)


def _relationship_lines(read: Dict[str, Any]) -> List[str]:
    """The worked-out readings, as statements rather than as a table.

    Empty when the page sent none, which `_section` turns into no section at
    all — an account with nothing rated has no relationships to report, and a
    heading over four "unknown" lines is worse than silence.

    Every figure here came from the client already computed. None of it is
    re-derived: this function formats and nothing else, which is the only way
    the numbers in the brief and the numbers on the page can be guaranteed to
    agree.
    """
    lines: List[str] = []

    gap = read.get('gap') or {}
    if gap.get('known'):
        lines.append(
            'WHERE THE SHORTFALL SITS. They are at {} out of 100, so {} points '
            'are missing. Those points divide across the measures like this, '
            'and the parts sum to the whole:'.format(
                gap.get('standing'), gap.get('total')))
        for part in (gap.get('parts') or []):
            lines.append('  {}: {} points — {}'.format(
                part.get('label'), part.get('points'), part.get('from')))
        largest = gap.get('largest')
        lines.append('  Largest single part: {}'.format(
            largest.get('label') if largest
            else 'none — no measure is clearly ahead of the others'))
        lines.append('')

    families = read.get('families') or {}
    if families.get('known'):
        lines.append(
            'WHAT KIND OF PROBLEM IT IS. The six reasons regrouped by what they '
            'indicate, over {} answers:'.format(families.get('answered')))
        for entry in (families.get('shares') or []):
            lines.append('  {}: {}% ({} tasks)'.format(
                entry.get('label'), entry.get('share'), entry.get('count')))
        leading = families.get('leading')
        if leading:
            lines.append('  Clearly ahead: {}'.format(leading.get('label')))
        else:
            lines.append('  No kind is clearly ahead of the rest.')
        lines.append(
            '  Not about knowing the material: {}%. This is the figure that '
            'decides whether harder work is the right next step. High means '
            'they can already do it and keep not doing it, and more difficulty '
            'would add a second problem on top of the one they have.'.format(
                families.get('notConceptual')))
        lines.append('')

    cal = read.get('calibration') or {}
    if cal.get('known'):
        said = []
        for rung in (cal.get('outgrown') or []):
            said.append('  Filed hard and going well: {} at execution {} over {} '
                        'tasks. They have room above where they are working.'.format(
                            rung.get('label'), rung.get('execution'), rung.get('done')))
        for rung in (cal.get('overestimated') or []):
            said.append('  Filed easy and going badly: {} at execution {} over {} '
                        'tasks. These are losses that should not be happening.'.format(
                            rung.get('label'), rung.get('execution'), rung.get('done')))
        if cal.get('rushed'):
            said.append('  Finished quicker than their own median and rated badly: '
                        '{} tasks. Rushing has a different fix from not knowing.'.format(
                            cal.get('rushed')))
        if said:
            lines.append('WHERE THE DIFFICULTY FILED AND THE RESULT DISAGREE.')
            lines.extend(said)
            lines.append('')

    div = read.get('divergence') or {}
    if div.get('known'):
        reading = {
            'capability-ahead':
                'Capability is running ahead of the score. They are getting '
                'better at the work faster than the result is following, which '
                'points at converting ability into outcome rather than at '
                'adding more ability.',
            'outcome-ahead':
                'The score is running ahead of capability. The result is '
                'improving faster than execution is, which usually means the '
                'work has got easier rather than they have got better.',
            'together': 'Capability and outcome are moving together.',
        }.get(str(div.get('reading')), '')
        lines.append('CAPABILITY AGAINST OUTCOME.')
        points = lambda n: '{} point{}'.format(n, '' if abs(n or 0) == 1 else 's')
        lines.append('  Execution moved {}; quality moved {}.'.format(
            points(div.get('capability')), points(div.get('outcome'))))
        if reading:
            lines.append('  {}'.format(reading))

    return [line for line in lines if line != ''] or []


def brief_from(state: Dict[str, Any]) -> str:
    """The subject state, as the sections the model reads.

    Text rather than raw JSON, for the reason the other briefs give: the
    instruction that matters is "quote these and add nothing", and labelled
    statements are what that is easiest to follow against. The sections are
    the spec's, so a change to one leaves the others alone.
    """
    parts: List[str] = []

    # ---- Who and what --------------------------------------------------
    parts.append(_section('subject_profile', [
        _kv('Subject', state.get('subject')),
        _kv('Window these figures cover', state.get('span')),
        _kv('Overall rating out of 100', state.get('overall')),
        _kv('Tasks finished in the window', state.get('finished')),
        _kv('Tasks finished the window before', state.get('finished_before')),
        _kv('Of the finished ones, rated on both rows', state.get('rated')),
        _kv('Days in the window with work here', state.get('active_days')),
        _kv('What they say they are chasing here', state.get('aim')),
        _kv('Where they say they are now', state.get('level')),
    ]))

    # ---- The dimensions, each with what it was counted from -------------
    dimensions = state.get('dimensions') or []
    if dimensions:
        lines = []
        for entry in dimensions:
            value = entry.get('value')
            if value is None:
                continue
            lines.append('{}: {} — {}'.format(
                entry.get('label'), value, entry.get('meaning') or ''))
            for item in (entry.get('evidence') or []):
                lines.append('    evidence: {}'.format(item))
        parts.append(_section('dimensions', lines))

    # ---- The curve, which is the most useful thing here ------------------
    curve = state.get('curve') or {}
    rungs = curve.get('rungs') or []
    if rungs:
        lines = ['Summit rates difficulty 1-5: 1 Trivial, 2 Easy, 3 Fair, '
                 '4 Hard, 5 Brutal. Execution and quality are 0-100.']
        for rung in rungs:
            if not rung.get('done'):
                continue
            lines.append(
                '  Level {} ({}): {} rated, execution {}, quality {}, '
                'landed {}%, median {} min'.format(
                    rung.get('level'), rung.get('label'), rung.get('done'),
                    rung.get('execution'), rung.get('quality'),
                    rung.get('cleared'), rung.get('minutes')))
        if curve.get('threshold'):
            lines.append('')
            lines.append(
                'The app worked out where this falls off: execution is best at '
                '{} and drops {} points by {}.'.format(
                    (curve.get('best') or {}).get('label'), curve.get('drop'),
                    (curve.get('threshold') or {}).get('label')))
        elif curve.get('best'):
            lines.append('')
            lines.append(
                'The app found no level where execution falls away sharply. '
                'The best-executed level is {}.'.format(
                    (curve.get('best') or {}).get('label')))
        parts.append(_section('difficulty_analysis', lines))

    # ---- Time, and what it bought ---------------------------------------
    time = state.get('time') or {}
    if time.get('known'):
        parts.append(_section('time_analysis', [
            'Summit does not ask how long a task should take. "Usual" below '
            'means this account\'s own median time at that difficulty in this '
            'subject, so the comparison is against themselves.',
            _kv('Median minutes a task', time.get('typical')),
            _kv('Hours logged in the window', time.get('hours')),
            _kv('Mean minutes against their own median', time.get('drift')),
            _kv('Share of tasks finished quicker than usual, percent',
                time.get('quicker')),
            _kv('Efficiency out of 100 (speed weighted by how it was rated)',
                time.get('efficiency')),
            _kv('Finished quicker than usual AND rated poorly', time.get('rushed')),
            _kv('Took longer than usual AND rated well', time.get('thorough')),
        ]))

    # ---- Direction -------------------------------------------------------
    momentum = state.get('momentum') or {}
    if momentum.get('known'):
        parts.append(_section('recent_trends', [
            'Measured as the later half of the window against the earlier '
            'half, in points of execution.',
            _kv('Earlier half', momentum.get('earlier')),
            _kv('Later half', momentum.get('later')),
            _kv('Change in points', momentum.get('change')),
            _kv('Direction', momentum.get('direction')),
        ]))

    # ---- What goes wrong -------------------------------------------------
    reasons = state.get('mistakes') or []
    if reasons:
        lines = ['Chosen by the reader from a fixed list of six, on tasks they '
                 'rated at or below Solid.']
        for entry in reasons:
            lines.append('  {}: {} tasks, {}% of the badly-rated ones'.format(
                entry.get('label'), entry.get('count'), entry.get('share')))
        parts.append(_section('mistake_patterns', lines))

    # ---- The relationships, already worked out ---------------------------
    # The section this whole feature turns on, and the newest one.
    #
    # Everything above it is a snapshot: execution is 62, the curve falls off
    # at Fair, eighteen sessions ran out of time. A model given only those
    # writes about those — it restates the table with adjectives, because a
    # list of numbers is an invitation to describe it. Which is exactly the
    # complaint this section was added to answer.
    #
    # So the client works out the relationships first, in
    # frontend/src/components/Subject/performance, where they are arithmetic
    # with tests around them, and they arrive here as conclusions the model has
    # to *use* rather than figures it can merely repeat. It is told below that
    # these are already computed and are not to be recomputed.
    parts.append(_section('relationships', _relationship_lines(
        state.get('performance') or {})))

    # ---- The work itself -------------------------------------------------
    # The only section here that is not a measurement, and the one that
    # decides whether a next step can name anything.
    #
    # Every other section describes the shape of the record: execution is 47,
    # the curve falls off at Hard, 88 tasks were finished quickly and rated
    # badly. A model handed only that can do exactly one thing with it, which
    # is say it back with a verb in front — "Focused Easy Execution Practice.
    # Solve 10 Easy problems." True, useless, and unimprovable by any amount
    # of prompting, because nothing in the brief has ever said what the reader
    # is working on.
    #
    # The titles say. They are also the only place a sub-skill appears at all:
    # <skill_vocabulary> is an authored curriculum identical on every account,
    # and these are this reader's own words for their own work. That is why
    # the section leads with what it is and does not pretend to be counted —
    # a title is what somebody typed, not a measurement of them.
    work = state.get('recent_work') or []
    if work:
        lines = ['The reader\'s own most recently finished tasks here, newest '
                 'first, as they titled them. Titles and notes are what they '
                 'wrote, not measurements. Difficulty and execution are the '
                 'two 1-5 rows they answered on finishing; "reason" is the '
                 'one they picked from the fixed list.']
        for entry in work:
            said = ['"{}"'.format(entry.get('title'))]
            if entry.get('on'):
                said.append(entry['on'])
            if entry.get('difficulty') and entry.get('execution'):
                said.append('difficulty {}, execution {}'.format(
                    entry['difficulty'], entry['execution']))
            else:
                said.append('not rated')
            if entry.get('minutes'):
                said.append('{} min'.format(entry['minutes']))
            if entry.get('reason'):
                said.append('reason: {}'.format(entry['reason']))
            if entry.get('note'):
                said.append('note: {}'.format(entry['note']))
            lines.append('  ' + ' \u2014 '.join(said))
        parts.append(_section('recent_work', lines))

    # ---- Everything they have done, grouped and sorted --------------------
    # The sample above is the newest forty. This is every finished task in the
    # window, grouped by name and counted by the page, so the material that
    # has stopped teaching anything and the material that is going badly are
    # both at the top of a list rather than somewhere in a sample.
    groups = state.get('work_groups') or []
    if groups:
        lines = ['Every finished task in the window, grouped by name with the '
                 'numbers blanked to #. Counted by the app. "well" is '
                 'execution 4-5, "badly" is execution 1-2; averages are over '
                 'the rated and timed tasks only.']
        for entry in groups:
            said = ['"{}"'.format(entry.get('name')),
                    '{} done'.format(entry.get('count'))]
            if entry.get('examples'):
                said.append('e.g. ' + '; '.join(
                    '"{}"'.format(title) for title in entry['examples']))
            if entry.get('difficulty') is not None:
                said.append('avg difficulty {}, avg execution {}'.format(
                    entry.get('difficulty'), entry.get('execution')))
            else:
                said.append('not rated')
            if entry.get('minutes') is not None:
                said.append('avg {} min each'.format(entry['minutes']))
            if entry.get('rated'):
                said.append('{} went well, {} went badly'.format(
                    entry.get('well', 0), entry.get('badly', 0)))
            if entry.get('reasons'):
                said.append('reasons: ' + ', '.join(entry['reasons']))
            if entry.get('last'):
                said.append('last {}'.format(entry['last']))
            lines.append('  ' + ' \u2014 '.join(str(part) for part in said))

        # The same rows, ordered three more ways, by name only — the figures
        # are on the lines above and are not repeated.
        def order(label, key, keep):
            ranked = sorted((entry for entry in groups if keep(entry)), key=key)
            if ranked:
                lines.append('  {}: {}'.format(label, '; '.join(
                    '"{}"'.format(entry.get('name')) for entry in ranked[:5])))
        order('Went worst (lowest avg execution)',
              lambda entry: entry.get('execution'),
              lambda entry: entry.get('execution') is not None)
        order('Went best (highest avg execution)',
              lambda entry: -entry.get('execution'),
              lambda entry: entry.get('execution') is not None)
        order('Slowest (most minutes each)',
              lambda entry: -entry.get('minutes'),
              lambda entry: entry.get('minutes') is not None)
        parts.append(_section('work_groups', lines))

    # ---- What they already study from ------------------------------------
    # Links found in this subject's task notes, notes and library. Material
    # somebody already has is material they will open, so it goes first.
    owned = [entry for entry in (state.get('owned_resources') or [])
             if isinstance(entry, dict) and _link(entry.get('url'))][:OWNED]
    if owned:
        lines = ['Links the reader already keeps for this subject, from their '
                 'own task notes, notes and library. When one fits a step, it '
                 'is that step\'s first resource, with the URL exactly as '
                 'written here.']
        for entry in owned:
            lines.append('  "{}" — {} (in a {})'.format(
                entry.get('name'), entry.get('url'), entry.get('from') or 'note'))
        parts.append(_section('your_resources', lines))

    showing = [str(title).strip() for title in (state.get('showing') or [])
               if str(title).strip()]
    if showing:
        parts.append(_section('already_showing', [
            'Steps already on the reader\'s screen. Yours are added under '
            'these: do not repeat or rephrase them.',
            *('  "{}"'.format(title) for title in showing),
        ]))

    # ---- The curriculum's own words, and nothing more --------------------
    vocabulary = [str(entry).strip() for entry in (state.get('vocabulary') or [])
                  if str(entry).strip()]
    if vocabulary:
        parts.append(_section('skill_vocabulary', [
            'The named areas of this subject, from Summit\'s authored skill '
            'tree. This is a curriculum: it is identical for every account and '
            'carries NO measurement of this reader. Name one if it helps; do '
            'not state their level in it.',
            '  ' + ', '.join(vocabulary),
        ]))

    # ---- What it is all for ----------------------------------------------
    goals = state.get('goals') or []
    if goals:
        lines = []
        for entry in goals:
            lines.append('  "{}": {}% done, due {}, {}'.format(
                entry.get('title'), entry.get('progress'),
                entry.get('deadline') or 'no date set',
                entry.get('standing') or 'no projection'))
            for lever in (entry.get('levers') or []):
                lines.append('      the app says: {}'.format(lever))
        parts.append(_section('goals', lines))

    # ---- What was said last time, and whether it worked -------------------
    previous = state.get('previous') or []
    if previous:
        lines = []
        for entry in previous:
            lines.append('  {} — {} at difficulty {}, {}given {}'.format(
                entry.get('title'), entry.get('type'), entry.get('difficulty'),
                '{} min, '.format(entry['minutes']) if entry.get('minutes') else '',
                entry.get('on')))
        parts.append(_section('previous_recommendations', lines))

    outcomes = state.get('outcomes') or []
    if outcomes:
        lines = ['What happened to the figures after each kind of session was '
                 'recommended. Counted by the app, not by you.']
        for entry in outcomes:
            lines.append('  {}: {} recommended, {} acted on, execution moved '
                         '{} points after'.format(
                             entry.get('type'), entry.get('given'),
                             entry.get('taken'), entry.get('change')))
        parts.append(_section('recommendation_outcomes', lines))

    return '\n\n'.join(part for part in parts if part)


# ---------------------------------------------------------------------------
# Reading the answer
# ---------------------------------------------------------------------------
def _clamp(value: Any, low: int, high: int, fallback: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(low, min(high, number))


def _way(value: Any) -> str:
    """Which way a finding cuts, narrowed to the three the page draws.

    The same closed list `goal_evidence` uses, rather than a second
    vocabulary for the same idea: a finding is helping, in the way, or worth
    watching, and the page has one set of colours for those three. An
    unrecognised word steers nothing and draws as nothing, so it becomes the
    honest neutral answer instead of a category of one.
    """
    word = str(value or '').strip()
    return word if word in EVIDENCE_DIRECTIONS else 'watch'


def _unit(value: Any) -> float:
    """A 0-1 weight, defensively. Out-of-range confidence is not confidence."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.5
    return round(max(0.0, min(1.0, number)), 2)


#: What a made-up source looks like. A step that says where to get its
#: problems is only worth the line if the place exists; "University of XYZ" is
#: the model filling a required field, and printing it would send somebody
#: looking for a book that is not there.
PLACEHOLDER_SOURCE = re.compile(
    r'\b(xyz|abc university|example\.com|placeholder|tbd|lorem)\b'
    r'|\[[^\]]*\]'
    r'|^(a |any )?(standard |good |typical )?(textbook|online resources?|course notes'
    r'|your (own )?(notes|textbook|course|teacher))\.?$',
    re.IGNORECASE)


def _real_source(text: str) -> str:
    """The resource, or nothing when it is plainly a placeholder."""
    return '' if PLACEHOLDER_SOURCE.search(text) else text


# ---------------------------------------------------------------------------
# Links
# ---------------------------------------------------------------------------
# A step names where to get its material as up to three links, best first. A
# name alone ("MATHCOUNTS past competitions") sends somebody to a search
# engine; a link sends them to the page. The model is handed the links the
# reader already keeps for the subject and told to put those first when they
# fit, because the material somebody already owns is the material they will
# actually open.

#: A link in free text: a Markdown link, whose text is its name, or a bare URL.
#: One level of balanced brackets is part of a URL — IMSLP and Wikipedia put
#: them in page names — while an unbalanced one is the sentence around it.
LINK_IN_TEXT = re.compile(
    r'\[([^\]\n]{1,120})\]\((https?://(?:[^\s()]|\([^\s()]*\))+)\)'
    r'|(https?://(?:[^\s<>()"\'\]\[]|\([^\s<>()"\']*\))+)',
    re.IGNORECASE)


def _link(value: Any) -> str:
    """`value` as an http(s) link worth printing, or nothing.

    Trailing sentence punctuation is shed, because a URL at the end of a note
    usually carries the full stop after it.
    """
    from urllib.parse import urlparse
    text = str(value or '').strip().rstrip('.,;:!?\'"')
    if not text or len(text) > 500 or any(ch.isspace() for ch in text):
        return ''
    try:
        parts = urlparse(text)
    except ValueError:
        return ''
    host = (parts.hostname or '').lower()
    if parts.scheme not in ('http', 'https') or '.' not in host:
        return ''
    if PLACEHOLDER_SOURCE.search(host):
        return ''
    return text


def _link_key(url: str) -> str:
    """What makes two links the same page: host without `www.`, and the path
    without a trailing slash, ignoring case and scheme."""
    from urllib.parse import urlparse
    parts = urlparse(url)
    host = (parts.hostname or '').lower()
    host = host[4:] if host.startswith('www.') else host
    path = parts.path.rstrip('/')
    return (host + path + ('?' + parts.query if parts.query else '')).lower()


def _host(url: str) -> str:
    from urllib.parse import urlparse
    host = (urlparse(url).hostname or '').lower()
    return host[4:] if host.startswith('www.') else host


def owned_resources(tasks: List[Dict[str, Any]], notes: List[Dict[str, Any]],
                    library: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """The links the reader already keeps for one subject, newest use first.

    Each argument is already narrowed to the subject by the caller:
    `tasks` is title and description, `notes` title and body, `library` title
    and url. A link written in a task's note is named after the task, since
    the task's name is what says what the link is for; a Markdown link keeps
    its own text. The same page found twice is listed once.
    """
    found: List[Dict[str, str]] = []
    seen = set()

    def add(name: str, url: str, where: str) -> None:
        url = _link(url)
        if not url or len(found) >= OWNED:
            return
        key = _link_key(url)
        if key in seen:
            return
        seen.add(key)
        found.append({'name': (name.strip() or _host(url))[:STEP_FIELD],
                      'url': url, 'from': where})

    def scan(text: str, fallback: str, where: str) -> None:
        for match in LINK_IN_TEXT.finditer(text or ''):
            label, marked, bare = match.groups()
            add(label or fallback, marked or bare, where)

    for row in library:
        add(str(row.get('title') or ''), row.get('url'), 'library')
    for row in tasks:
        scan(str(row.get('description') or ''), str(row.get('title') or ''), 'task')
    for row in notes:
        scan(str(row.get('body') or ''), str(row.get('title') or ''), 'note')
    return found


def _resources(entry: Dict[str, Any], owned: set) -> List[Dict[str, Any]]:
    """A step's links, in the model's order (best first), at most RESOURCES.

    A link that is not an http(s) URL, or points at a placeholder host, is
    dropped rather than printed; one that is among the reader's own is marked
    `yours`, which is what the page labels.
    """
    out: List[Dict[str, Any]] = []
    seen = set()
    for item in (entry.get('resources') or []):
        if len(out) >= RESOURCES:
            break
        if not isinstance(item, dict):
            continue
        url = _link(item.get('url'))
        if not url:
            continue
        key = _link_key(url)
        if key in seen:
            continue
        seen.add(key)
        name = _real_source(str(item.get('name') or '').strip()[:STEP_FIELD])
        out.append({'name': name or _host(url), 'url': url, 'yours': key in owned})
    return out


def _minutes(value: Any):
    """A recommended sitting, or None when the step names no time.

    Not every session wants a clock — "Practice Bach Concerto intonation" is
    a complete instruction — so nothing (or nought) from the model is left
    absent rather than filled with a default the page would print as if
    somebody had chosen it.
    """
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return _clamp(number, *MINUTES, fallback=30) if number > 0 else None


#: The brief's own labels, as a reader would say them. The prompt asks for
#: plain words (STEPS_SYSTEM, "HOW THE WORDS READ"); a smaller model still
#: writes "average execution 3.3" now and then, so the shown text is put into
#: the reader's terms on the way out. Execution is the reader's own 1-5
#: rating of how a task went, so "rating" is the word.
READER_WORDS = (
    (re.compile(r'\bavg\.?(?=\s)', re.IGNORECASE), 'average'),
    (re.compile(r'\bexecution ratings?\b', re.IGNORECASE), 'rating'),
    (re.compile(r'\bexecution\b', re.IGNORECASE), 'rating'),
    (re.compile(r'≥\s*(\d+(?:\.\d+)?)'), r'\1 or more'),
    (re.compile(r'≤\s*(\d+(?:\.\d+)?)'), r'\1 or less'),
)


def reader_words(text: str) -> str:
    """Text a reader sees, with the brief's labels put in plain words."""
    for pattern, plain in READER_WORDS:
        text = pattern.sub(plain, text)
    return text


def _steps(found: Dict[str, Any], counted, owned: set = frozenset()) -> List[Dict[str, Any]]:
    """`next_steps`, narrowed to what the page draws. See `_clean` for the rule
    on which fields are held to the brief's figures and which are not.

    `owned` is the `_link_key` of every link the reader already keeps, so a
    step's link to one of them can say so."""
    steps = []
    for entry in (found.get('next_steps') or [])[:NEXT_STEPS]:
        if not isinstance(entry, dict):
            continue
        title = str(entry.get('title') or '').strip()
        if not title:
            continue
        kind = str(entry.get('type') or '').strip()
        reason = str(entry.get('reason') or '').strip()
        # A prediction about a figure, so it is held to the record the same way
        # the reason is: a signal naming a number nobody counted is a test the
        # reader cannot run.
        signal = str(entry.get('signal') or '').strip()
        if not counted(signal):
            signal = ''
        # The reason cites the record, so it is held to the record. The title
        # and the drills are what to go and do, and a quantity in one of those
        # is the model's job rather than a claim about the reader.
        if not counted(reason):
            reason = ''
        steps.append({
            'title': title,
            # What to do, how fast and from where. Instructions rather than
            # claims about the reader, so — like the title and the drills —
            # they are not held to the brief's figures. All optional: a step
            # can be its title alone ("Practice Bach Concerto intonation").
            'problems': str(entry.get('problems') or '').strip()[:STEP_FIELD],
            'pace': str(entry.get('pace') or '').strip()[:STEP_FIELD],
            'resources': _resources(entry, owned),
            # The single named source steps carried before `resources`; kept
            # so an answer in the old shape still says where to look.
            'resource': _real_source(str(entry.get('resource') or '').strip()[:STEP_FIELD]),
            'focus': str(entry.get('focus') or '').strip(),
            # An unknown type would break the counting the feedback loop is
            # for, so it lands in the general bucket rather than in a new one.
            'type': kind if kind in STEP_TYPES else 'targeted_practice',
            'difficulty': _clamp(entry.get('difficulty'), *DIFFICULTY, fallback=3),
            'minutes': _minutes(entry.get('duration_minutes')),
            'reason': reader_words(reason),
            'signal': reader_words(signal),
            'drills': [reader_words(str(item).strip()) for item in (entry.get('drills') or [])
                       if str(item).strip()][:4],
        })
    return steps


# ---------------------------------------------------------------------------
# Recommendations alone
# ---------------------------------------------------------------------------
# The Recommendations panel's own call. The full reading above asks for seven
# sections behind a four-thousand-token prompt, and Groq's free tier counts
# prompt and answer together against 8,000 tokens a minute — so a reading of a
# long record is refused before the model runs. This asks for the one thing the
# panel draws, from the sections that bear on *what to do*, behind a prompt a
# fifth the size: the recommendations are the better for it, and it fits.

#: The brief sections a plan is written from. Not the dimensions, trends or
#: relationships: those are what the record *is*, and the reading covers them.
STEPS_SECTIONS = ('subject_profile', 'difficulty_analysis', 'time_analysis',
                  'mistake_patterns', 'recent_work', 'work_groups',
                  'your_resources', 'already_showing', 'skill_vocabulary', 'goals',
                  'previous_recommendations', 'recommendation_outcomes')

#: How many of the newest tasks go up beside the groups. The groups already
#: cover every task; this is only "what is being done this week".
STEPS_RECENT = 15

#: Room for the reasoning and three steps, and under Groq's ceiling with the
#: prompt included.
STEPS_MAX_TOKENS = 3000

STEPS_SYSTEM = """\
You plan the next three study sessions for one subject, for a study-tracking \
app. Everything in the brief was counted from the reader's own tasks.

Write RECOMMENDATIONS, not insights. Each one is an instruction a person \
could start in the next minute without asking a question. It names the \
actual thing to work on. "Easy algorithm drills, timed" is a category and \
fails. "Focused Easy Execution Practice" fails. A title alone can be enough: \
"Practice Bach Concerto intonation" is a complete step. Add problems, a \
pace or a time only when they help; leave them empty ("" or 0) otherwise. \
Two good steps:

  title      "Easy MATHCOUNTS Sprint #1-10, 2 min each"
  problems   "MATHCOUNTS 2021 School Sprint Round, problems 1-10"
  pace       "2 minutes per problem, no calculator"
  resources  [{"name": "MATHCOUNTS past competitions", \
"url": "https://www.mathcounts.org/resources/past-competitions"}]

  title      "Practice Bach Concerto intonation"
  problems   ""   pace  ""   duration_minutes  0
  resources  [{"name": "Bach Violin Concerto in A minor, IMSLP", \
"url": "https://imslp.org/wiki/Violin_Concerto_in_A_minor,_BWV_1041_(Bach,_Johann_Sebastian)"}]

HOW TO CHOOSE

<work_groups> is every finished task, grouped by name with numbers blanked \
to #, with how hard it was filed, how it went (execution 1-5), how long each \
took, and the titles actually used. <recent_work> is the newest few. Use them \
to pick the material:
  - a group done often, filed easy and rated 4-5 has stopped teaching \
anything: move them up from it, or stop it;
  - a group filed hard and rated 1-2 needs a smaller, slower version of \
itself — fewer problems, more time each, then the pace again;
  - the slowest groups say where time goes;
  - the examples say which ranges and papers are done, so name the NEXT \
range rather than one they have finished.
<difficulty_analysis> says where execution falls off; the level to work is \
normally at or just below that point.

Name real material: the piece, competition, paper, year, chapter, problem \
range or tag the record shows, or the standard next thing up from it. Use \
what the reader already has first: <your_resources> are links they keep, \
and the task titles name the pieces, books and papers they already work \
from. When a title is only the reader's own label ("Proof practice"), point \
at a real, public equivalent instead.

<already_showing> is on the reader's screen. Yours go underneath, so do not \
repeat or rephrase any of them. <previous_recommendations> and \
<recommendation_outcomes> say what was advised before and whether it was \
acted on; a plan nobody followed is usually too big.

EACH STEP
  - `title`: ten words or fewer, the way a person writes a to-do — \
"Stewart Ch. 7 integrals #1-8", "Practice Bach Concerto intonation". Not \
the session type, not "Targeted Practice". It becomes a task as written.
  - `problems`: the source and exact range or count, or "".
  - `pace`: the time per problem or per step — "4 min per problem". "" \
when it would only repeat the session's length ("30 minutes total").
  - `resources`: one to three links to where the material is, best first — \
1 the best, 3 the weakest. A link from <your_resources> that fits goes \
first. Each is the direct page (the score, the paper, the chapter, the \
problem set), on a site that really has it; when unsure of a deep link, \
use the site's own page for it rather than guessing. Never a placeholder \
or a search page, and never an identifier you are not sure of — no made-up \
arXiv numbers, ISBNs or problem numbers; name a paper by its title instead.
  - `focus`: the area of the subject it is about.
  - `type`: one of targeted_practice, mixed_practice, timed_set, review, \
concept, project.
  - `difficulty`: 1-5 on the app's scale (1 Trivial, 2 Easy, 3 Fair, 4 Hard, \
5 Brutal).
  - `duration_minutes`: the whole sitting, 10-120, or 0 when no set time \
helps.
  - `reason`: one sentence, to the reader, on why this session and why now, \
quoting a figure from the brief. Every number you write about the reader \
must appear in the brief; do not compute new ones.
  - `signal`: one sentence, to the reader, on what would show it is working \
and which way it should move.
  - `drills`: two to four concrete things to do inside the session, each \
specific to this material. "Solve each problem", "Check answers", "Review \
mistakes" and "self-rate after each" are padding — cut them.

HOW THE WORDS READ
The reader sees `reason`, `signal` and `drills` as written, beside the \
title. Write them the way a coach would say them out loud. The brief's own \
labels are for you, not for them:
  - Name work by its plain name: "your Math 55 lectures", not "Math # \
lecture", never with a "#" for a number, never with a subject in brackets, \
and never as a "group".
  - Say what a figure means: "you rate them 3.8 out of 5 on average", not \
"avg execution 3.8"; "33 done in 90 days", not "count 33".
  - No symbols for words: "4 or higher", not "≥4".
  - Never use the words "execution", "avg" or "group" in these three \
fields. Execution is how the reader rated how a task went, out of 5: \
write "you rate them 3.3 out of 5" or "they go well".
  Bad:  Group "[Mathematics] Math # lecture" has avg execution 3.8 and is \
done often, so move to the next range.
  Good: You've done 33 Math 55 lectures and rate them 3.8 out of 5, so \
they are comfortable — the next chapter will teach you more.
  Bad:  Average execution on this set rises to ≥4.
  Good: You rate these sessions 4 or 5 out of 5.

Plain words, short sentences, no encouragement."""

#: Added to STEPS_SYSTEM when the brief spans every subject (the dashboard's
#: and the Recommendations tab's "All subjects"; backend/tracking/next_sessions).
OVERALL_NOTE = """

THIS BRIEF COVERS EVERY SUBJECT
The work below is from all of the reader's subjects together, and each title \
starts with its subject in brackets: "[Mathematics] Problem set #". Choose \
the three sessions across them — usually from the subjects whose work is \
going worst, or has stopped teaching anything, rather than three from the \
one done most — and do not put the brackets in your titles. Set `focus` to \
the subject's name exactly as the brackets write it, so the app can file the \
session under that subject."""

STEPS_SCHEMA = {
    'type': 'object',
    'properties': {'next_steps': SCHEMA['properties']['next_steps']},
    'required': ['next_steps'],
    'additionalProperties': False,
}


def steps_brief_from(state: Dict[str, Any]) -> str:
    """The brief a plan is written from: the sections in STEPS_SECTIONS, with
    only the newest STEPS_RECENT of the recent work."""
    trimmed = {**state, 'recent_work': (state.get('recent_work') or [])[:STEPS_RECENT]}
    full = brief_from(trimmed)
    kept = [part for part in full.split('\n\n<')
            if re.match(r'<?(\w+)>', part)
            and re.match(r'<?(\w+)>', part).group(1) in STEPS_SECTIONS]
    return '\n\n'.join(part if part.startswith('<') else '<' + part for part in kept)


def plan(state: Dict[str, Any], model_id: str = '',
         overall: bool = False) -> List[Dict[str, Any]]:
    """Three recommendations for this subject, and nothing else — or, with
    `overall`, three across every subject in the brief (OVERALL_NOTE).

    Raises `BriefUnavailable` for everything the page should say out loud, as
    `read` does.
    """
    if not configured():
        raise BriefUnavailable(NO_KEY)
    if not str(state.get('subject') or '').strip():
        raise BriefUnavailable('There is no subject to plan for.')

    brief = steps_brief_from(state)
    try:
        text = planner.from_provider(
            brief,
            system=STEPS_SYSTEM + (OVERALL_NOTE if overall else ''),
            schema=STEPS_SCHEMA,
            instruction=('Plan the next three sessions across these subjects '
                         'from the sections below.' if overall else
                         'Plan the next three sessions for this subject from '
                         'the sections below.'),
            model_id=model_id or MODEL_DEFAULT,
            max_tokens=STEPS_MAX_TOKENS,
        )
    except planner.PlannerUnavailable as exc:
        raise BriefUnavailable(str(exc)) from exc

    allowed = figures.allowed_from(brief)
    steps = _steps(_object(text), lambda *texts: figures.all_clean(texts, allowed),
                   _owned_keys(state))
    if not steps:
        raise BriefUnavailable('The model sent back no sessions. Try again.')
    return steps


def _owned_keys(state: Dict[str, Any]) -> set:
    return {_link_key(entry['url']) for entry in (state.get('owned_resources') or [])
            if isinstance(entry, dict) and _link(entry.get('url'))}


def _clean(found: Dict[str, Any], brief: str = '',
           owned: set = frozenset()) -> Dict[str, Any]:
    """The answer, narrowed to the shape the page draws.

    Everything is bounded on the way out, and every list is cut to what the
    page has room for — the product rule that the UI is selective even though
    the analytics are not.

    ## And every figure is checked against the brief

    `brief` is the text the model was sent, and it holds every number the
    model was allowed to use. Anything claiming to describe the reader is
    dropped if it cites a figure that is not in there, because the panel's
    whole value is that its numbers were counted and a reader cannot tell a
    counted one from an invented one by looking.

    Dropped, not corrected: there is no way to know what the model meant, and
    a finding with its figure quietly removed still reads as a finding. Four
    entries can each go on their own, and if every one of them goes the caller
    raises rather than drawing an empty panel.

    Next steps are held to this only through their `reason`, which cites the
    record. Their titles and drills are prescriptions — "twenty past-paper
    angle problems" is an instruction for Tuesday, not a statistic — and the
    two numbers on them are already labelled on the page as the model's own.
    See backend/tracking/figures for why that line is where it is.

    The default of `''` leaves the check off for callers that have no brief to
    check against, which keeps `_clean` usable in a test that is about shape.
    """
    allowed = figures.allowed_from(brief) if brief else None

    def counted(*texts: str) -> bool:
        """Whether this entry may claim to be reading the record."""
        return allowed is None or figures.all_clean(texts, allowed)

    # ---- What it is all for ---------------------------------------------
    # `objective` and `focus` are mostly the reader's own intention said back,
    # so a figure in them is unusual — but it is allowed to cite one, and if it
    # cites one nobody counted the sentence is blanked rather than the whole
    # band dropped. The band still has the goal's own title to fall back on,
    # and a page that loses its heading because one clause overreached is a
    # worse failure than a heading with no strapline under it.
    read = found.get('goal_read')
    goal_read = {}
    if isinstance(read, dict):
        objective = str(read.get('objective') or '').strip()
        focus = str(read.get('focus') or '').strip()
        why = str(read.get('why_kind') or '').strip()
        kind = str(read.get('kind') or '').strip()
        goal_read = {
            'objective': objective if counted(objective) else '',
            # An unrecognised kind steers nothing and draws as nothing, so it
            # becomes the honest answer rather than a new category of one.
            'kind': kind if kind in GOAL_KINDS else 'unstated',
            'focus': focus if counted(focus) else '',
            'why_kind': why if counted(why) else '',
        }

    goal_evidence = []
    for entry in (found.get('goal_evidence') or [])[:GOAL_EVIDENCE]:
        if not isinstance(entry, dict):
            continue
        claim = str(entry.get('claim') or '').strip()
        relevance = str(entry.get('relevance') or '').strip()
        if not claim:
            continue
        evidence = [str(item).strip() for item in (entry.get('evidence') or [])
                    if str(item).strip()][:3]
        # Dropped whole, unlike the band above: a card *is* its figures, and
        # one with the uncounted line removed still reads as counted.
        if not counted(claim, relevance, *evidence):
            continue
        direction = str(entry.get('direction') or '').strip()
        goal_evidence.append({
            'claim': claim,
            'direction': direction if direction in EVIDENCE_DIRECTIONS else 'watch',
            'evidence': evidence,
            'relevance': relevance,
        })

    # ---- The one thing most in the way -----------------------------------
    # Dropped whole when any part of it cites a figure nobody counted. This is
    # the page's judgement rather than one of its measurements, and a
    # judgement with its working quietly removed is exactly the thing a reader
    # has no way to check.
    found_neck = found.get('bottleneck')
    bottleneck = {}
    if isinstance(found_neck, dict):
        name = str(found_neck.get('name') or '').strip()
        reading = str(found_neck.get('reading') or '').strip()
        ruled = str(found_neck.get('ruled_out') or '').strip()
        evidence = [str(item).strip() for item in (found_neck.get('evidence') or [])
                    if str(item).strip()][:4]
        if name and counted(name, reading, ruled, *evidence):
            bottleneck = {
                'name': name,
                'evidence': evidence,
                'reading': reading,
                'ruled_out': ruled,
                'confidence': _unit(found_neck.get('confidence')),
            }

    diagnosis = []
    for entry in (found.get('diagnosis') or [])[:DIAGNOSES]:
        if not isinstance(entry, dict):
            continue
        finding = str(entry.get('finding') or '').strip()
        if not finding:
            continue
        evidence = [str(item).strip() for item in (entry.get('evidence') or [])
                    if str(item).strip()][:4]
        if not counted(finding, *evidence):
            continue
        diagnosis.append({
            'finding': finding,
            # Which way it cuts. Narrowed to the three the page can draw,
            # and an unrecognised one becomes 'watch' rather than a fourth
            # tone nothing has a colour for — the same rule `goal_read.kind`
            # follows. A reading saved before this field existed has no
            # direction at all, and gets the same neutral answer.
            'direction': _way(entry.get('direction')),
            'confidence': _unit(entry.get('confidence')),
            'evidence': evidence,
        })

    priorities = []
    for entry in (found.get('priorities') or [])[:PRIORITIES]:
        if not isinstance(entry, dict):
            continue
        focus = str(entry.get('focus') or '').strip()
        if not focus:
            continue
        reason = str(entry.get('reason') or '').strip()
        if not counted(focus, reason):
            continue
        priorities.append({
            'focus': focus,
            'weight': _unit(entry.get('weight')),
            'reason': reason,
        })

    steps = _steps(found, counted, owned)

    insights = []
    for entry in (found.get('insights') or [])[:INSIGHTS]:
        if not isinstance(entry, dict):
            continue
        observation = str(entry.get('observation') or '').strip()
        if not observation:
            continue
        evidence = str(entry.get('evidence') or '').strip()
        implication = str(entry.get('implication') or '').strip()
        if not counted(observation, evidence, implication):
            continue
        insights.append({
            'observation': observation,
            'direction': _way(entry.get('direction')),
            'evidence': evidence,
            'implication': implication,
        })

    # A band with a sentence in it is a section of the page, so a reading that
    # produced only that is still a reading. `goal_read` is a dict even when
    # both of its sentences were blanked above, so the test is for content
    # rather than for the key.
    said_something = bool(goal_read.get('objective') or goal_read.get('focus'))

    if not (said_something or goal_evidence or bottleneck or diagnosis
            or priorities or steps or insights):
        # Either the model answered in the wrong shape, or every single thing
        # it said cited a figure nobody counted. The second is the interesting
        # one and it reads the same from here, so the sentence covers both
        # without guessing which happened.
        raise BriefUnavailable('The model returned nothing usable. Try again.')

    return {
        'goal_read': goal_read,
        'goal_evidence': goal_evidence,
        'bottleneck': bottleneck,
        'diagnosis': diagnosis,
        'priorities': priorities,
        'next_steps': steps,
        'insights': insights,
    }


# ---------------------------------------------------------------------------
# The one thing this module does
# ---------------------------------------------------------------------------
def read(state: Dict[str, Any], model_id: str = '') -> Dict[str, Any]:
    """A reading of this subject state, and what to do next.

    Raises `BriefUnavailable` for everything the page should say out loud —
    no key, a refused request, an unreadable answer. The caller turns that
    into a sentence in the panel rather than into a 500: a reading that
    cannot be made is a page that says so, over analytics that were already
    complete without it.
    """
    if not configured():
        raise BriefUnavailable(NO_KEY)
    if not str(state.get('subject') or '').strip():
        raise BriefUnavailable('There is no subject to read.')

    brief = brief_from(state)
    try:
        text = planner.from_provider(
            brief,
            system=SYSTEM,
            schema=SCHEMA,
            instruction=(
                'Read this subject state. Diagnose, prioritize, and say what '
                'to do next — using only the figures in the sections below.'),
            model_id=model_id or MODEL_DEFAULT,
            max_tokens=MAX_TOKENS,
        )
    except planner.PlannerUnavailable as exc:
        # The client, the workspace header and the refusal check are shared
        # with the goals page — see `planner.from_anthropic`. Its errors are
        # already written for a reader rather than for a log.
        raise BriefUnavailable(str(exc)) from exc

    return _clean(_object(text), brief, _owned_keys(state))
