"""The route from where somebody is to one goal they named.

## What this answers that nothing else does

The subject page already says how a goal is going. `goalsFor` and `leversFor`
in frontend/src/components/Subject/model.ts read the record against the goal's
own terms and produce the arithmetic: what is left, how many days there are,
the rate it needs against the rate it is getting, and which constraint is
actually in the way. All of that is counted, and it stays counted.

What arithmetic cannot produce is the route. "It needs 1.6 points a week and
is getting 1.2" is a true and useless sentence to somebody who does not know
what a point on the AMC 8 is made of. Turning that into "six weeks on counting
and number theory, then four on the geometry that shows up in questions 15 to
20" requires knowing what the goal *is* — a named competition, exam, syllabus
or body of work — and there is no table in this app that knows. That is the
same argument backend/tracking/subject_brief.py makes for the read-out, and the
only argument that justifies a model call here.

## The division, which is the whole design

The app supplies every figure. The model supplies the structure of the work
and the knowledge of the field, and is told plainly that the figures are the
reader's and may not be added to. The one number it is asked for is how many
weeks each phase should run — which is a recommendation, is labelled as one,
and is bounded on the way out.

It also may not restate the arithmetic as if it were a finding. The panel it
lands in sits directly beneath the counted figures it was given; a plan that
opens by reading the same numbers back is a plan that spent its first
paragraph saying nothing.

## Why the goal is named and the subject is context

The read-out (`subject_brief`) is about a subject and mentions its goals. This
is the other way round: one goal, with the subject's record as the evidence
about whether it is going to happen. A reader with two goals on one subject
gets two different plans, and the difference between them is the point.

## Nothing here writes

A plan. It is returned to the page, drawn in a panel that says a model wrote
it, and that is the end of it — never cached into the account, never mixed
into the counted panels, never used to compute anything. Same contract as
subject_brief, for the same reason.
"""
from typing import Any, Dict, List

from backend.tracking import planner
from backend.tracking.subject_brief import BriefUnavailable, _object

#: Opus, for the reason subject_brief gives. This one reads a table of the
#: reader's figures, has to lay a route over them without restating them, and
#: has to hold "add no numbers" across nested structured output — which is
#: exactly where a smaller model drifts into inventing a statistic about a
#: person.
MODEL_DEFAULT = 'claude-opus-5'

MAX_TOKENS = 16000

#: How many phases the page draws, and what one is allowed to run for.
#: Bounds rather than validation for its own sake: a plan in eleven stages is
#: not a plan anybody follows, and a single phase of three years drafted
#: against a goal due in April is a plan that has ignored the date it was
#: given.
PHASES = 5
PHASE_WEEKS = (1, 104)

#: Actions for the coming week. Three to five; more is a list nobody starts.
THIS_WEEK = 5

SYSTEM = """\
You lay out the route to one goal on a study-analytics page.

You are given a goal somebody set, the terms they set it on, and a set of \
figures the app has already counted from their own record in the subject the \
goal is filed under. Your job is to say how they get from where the figures \
put them to the goal, by the date on it.

THE ONE RULE THAT MATTERS

Every number you write about the reader must be one that appears in the brief \
you were given. You may quote them, compare them, and say what they imply. \
You may not compute new ones, estimate, re-round, or introduce any figure \
that is not there — not a percentage, not a count, not a rate, not a date.

The exception, and it is the only one: `weeks` on each phase is yours. It is \
a recommendation for how long that stage should run, it is labeled as one, \
and the phases together should fit roughly inside the days remaining that the \
brief gives you.

This is not a style preference. The reader of this page can tell a counted \
figure from an invented one only by trusting that there are no invented ones.

Do not restate the arithmetic as a finding. The panel this lands in sits \
directly under the figures you were handed; "you need 1.6 a week and are \
getting 1.2" is already on the reader's screen and is not worth your first \
sentence.

You also know nothing about this person beyond the brief. No inferences about \
their schedule, their age, their school, or their reasons.

WHAT YOU DO KNOW THAT THE APP DOES NOT

**The goal itself.** If its title names a real thing — a competition, an exam, \
a syllabus, a rating ladder, a repertoire, a certification — you know what it \
is made of, what its stages usually are, and what somebody at the stated \
standing should work on to move. That is knowledge about the world, not a \
claim about the reader, and it is the reason a model is doing this at all. \
Name the specific things: topics, question ranges, problem sets, pieces, \
rating bands, sections of a syllabus. If the title names something you do not \
recognize, say so in `route` and lay out a route from its own words instead \
of guessing at an institution.

**What a plan looks like.** Phases that build on each other, in an order where \
each one is usable before the next starts.

WHAT TO WRITE

`route` — two or three sentences. What actually stands between them and this \
goal, read against the figures. If the goal's own terms are the problem — no \
target, no date, a target that the days remaining cannot carry — say that \
first and plainly. If the record is too thin to plan against, say that instead \
of overreading it.

`phases` — the stages, in order, from now to the date. Two to five. Each has:
- `title`: the stage, six words or fewer.
- `weeks`: how long it should run. A whole number. The phases together should \
fit roughly inside the days remaining.
- `outcome`: what is true at the end of it — a state they arrive at, not an \
activity they do.
- `focus`: two to four specific things to work on in it, a few words each, \
concrete to what the goal actually is.

`week` — three to five things to do in the next seven days. Concrete enough to \
start this evening: a topic, a set, a count, a piece. This is the part a \
reader acts on, and "revise algebra" is not something anybody can start.

TONE

Direct and specific. No encouragement, no praise, no "you've got this". The \
reader came for a route, not a pep talk.

Write the way somebody who knows the subject would say it out loud. Short \
sentences. Ordinary words. No em-dash asides, no "X, not Y" flourishes, and \
no sentence that exists to land a point rather than say a thing. Never open \
with "Your record shows" or close by summarizing what you just said.
"""

SCHEMA = {
    'type': 'object',
    'properties': {
        'route': {
            'type': 'string',
            'description': 'Two or three sentences on what stands between them and the goal.',
        },
        'phases': {
            'type': 'array',
            'description': 'The stages from here to the date, in order.',
            'items': {
                'type': 'object',
                'properties': {
                    'title': {'type': 'string'},
                    'weeks': {'type': 'integer'},
                    'outcome': {'type': 'string'},
                    'focus': {'type': 'array', 'items': {'type': 'string'}},
                },
                'required': ['title', 'weeks', 'outcome', 'focus'],
                'additionalProperties': False,
            },
        },
        'week': {
            'type': 'array',
            'description': 'Three to five things to do in the next seven days.',
            'items': {'type': 'string'},
        },
    },
    'required': ['route', 'phases', 'week'],
    'additionalProperties': False,
}


NO_KEY = (
    'Planning a route needs an Anthropic key. Put one in ANTHROPIC_API_KEY in '
    '.env and restart the server. A Hugging Face token does not cover this '
    'one: it asks a model to lay a plan over a table of your figures without '
    'adding any, and a small model inventing a number about you here would be '
    'worse than no panel at all.')


def configured() -> bool:
    """Whether the button can do anything. Checked per call, as planner does."""
    return planner.able()


# ---------------------------------------------------------------------------
# The brief
# ---------------------------------------------------------------------------
def _line(label: str, value: Any) -> str:
    return '{}: {}'.format(label, value)


def brief_from(findings: Dict[str, Any]) -> str:
    """The goal and the record, as the lines the model reads.

    Text rather than JSON for the reason `subject_brief.brief_from` gives: the
    instruction that matters is "quote these and add nothing", and a labelled
    list of statements is what that is easiest to follow against. Only the
    parts that are actually present — an empty line is a line the model has to
    decide means nothing, and it sometimes decides wrong.
    """
    lines: List[str] = [
        'THE GOAL',
        _line('Title', findings.get('goal') or 'this goal'),
        _line('Subject it is filed under', findings.get('subject') or 'this subject'),
    ]

    for label, key in (
        ('Why they said it matters', 'why'),
        ('Where it stands', 'standing'),
        ('Days remaining', 'days_left'),
        ('Deadline', 'deadline'),
        ('Rate it needs, per week', 'need_weekly'),
        ('Rate it has been getting, per week', 'have_weekly'),
        ('Where it lands at that rate', 'lands'),
        ('Percent of its time that has gone', 'expected'),
    ):
        value = findings.get(key)
        if value not in (None, '', []):
            lines.append(_line(label, value))

    stages = [str(entry).strip() for entry in (findings.get('stages') or [])
              if str(entry).strip()]
    if stages:
        lines.append('Checkpoints still open on it:')
        for at, title in enumerate(stages, 1):
            lines.append('  {}. {}'.format(at, title))

    # What the app worked out is actually in the way. Handed over as the
    # app's own conclusions rather than as raw rows, because they already are
    # conclusions — see `leversFor` in components/Subject/model.
    levers = [str(entry).strip() for entry in (findings.get('levers') or [])
              if str(entry).strip()]
    if levers:
        lines.append('')
        lines.append('What the app worked out is in the way, hardest first:')
        for entry in levers:
            lines.append('  - {}'.format(entry))

    lines.append('')
    lines.append('THE RECORD IN THIS SUBJECT')

    aim = str(findings.get('aim') or '').strip()
    level = str(findings.get('level') or '').strip()
    if aim:
        lines.append('What they say they are chasing here: {}'.format(aim))
    if level:
        lines.append('Where they say they are now: {}'.format(level))

    for label, key in (
        ('Period these figures cover', 'span'),
        ('Overall score out of 100', 'score'),
        ('Grade', 'grade'),
        ('Tasks finished this period', 'finished'),
        ('Of those, pointed at this goal', 'aimed'),
        ('Days in the last two weeks with work on it', 'recent_days'),
    ):
        value = findings.get(key)
        if value not in (None, '', []):
            lines.append(_line(label, value))

    bands = findings.get('bands') or []
    if bands:
        lines.append('')
        lines.append('How each difficulty band went (execution, out of 100):')
        for entry in bands:
            lines.append('  - {}: {} finished, execution {}'.format(
                entry.get('label'), entry.get('done'), entry.get('holding')))

    reasons = findings.get('struggles') or []
    if reasons:
        lines.append('')
        lines.append('What they said when a session here went badly:')
        for entry in reasons:
            lines.append('  - {} ({}% of those sessions, {} tasks)'.format(
                entry.get('label'), entry.get('share'), entry.get('count')))

    return '\n'.join(lines)


# ---------------------------------------------------------------------------
# Reading the answer
# ---------------------------------------------------------------------------
def _clean(found: Dict[str, Any]) -> Dict[str, Any]:
    """The answer, narrowed to the shape the page draws.

    Everything is bounded on the way out. `weeks` is the one figure the model
    supplies and is clamped: a phase of three hundred weeks drafted against a
    goal due in April is not a plan the page should print however confidently
    it arrives.
    """
    route = str(found.get('route') or '').strip()

    phases = []
    for entry in (found.get('phases') or [])[:PHASES]:
        if not isinstance(entry, dict):
            continue
        title = str(entry.get('title') or '').strip()
        if not title:
            continue
        try:
            weeks = int(entry.get('weeks'))
        except (TypeError, ValueError):
            weeks = PHASE_WEEKS[0]
        focus = [str(item).strip() for item in (entry.get('focus') or [])
                 if str(item).strip()]
        phases.append({
            'title': title,
            'weeks': max(PHASE_WEEKS[0], min(PHASE_WEEKS[1], weeks)),
            'outcome': str(entry.get('outcome') or '').strip(),
            'focus': focus[:4],
        })

    week = [str(item).strip() for item in (found.get('week') or [])
            if str(item).strip()][:THIS_WEEK]

    if not route and not phases and not week:
        raise BriefUnavailable('The model returned nothing usable. Try again.')

    return {'route': route, 'phases': phases, 'week': week}


# ---------------------------------------------------------------------------
# The one thing this module does
# ---------------------------------------------------------------------------
def plan(findings: Dict[str, Any], model_id: str = '') -> Dict[str, Any]:
    """The route to this goal, from these figures.

    Raises `BriefUnavailable` for everything the panel should say out loud —
    no key, a refused request, an unreadable answer. The caller turns that
    into a sentence beside the button rather than into a 500: a plan that
    cannot be written is a panel that says so, over a page that was already
    complete without it.
    """
    if not configured():
        raise BriefUnavailable(NO_KEY)
    if not str(findings.get('goal') or '').strip():
        raise BriefUnavailable('There is no goal to plan a route to.')

    try:
        text = planner.from_provider(
            brief_from(findings),
            system=SYSTEM,
            schema=SCHEMA,
            instruction=(
                'Lay out the route to this goal, using only the figures '
                'below.'),
            model_id=model_id or MODEL_DEFAULT,
            max_tokens=MAX_TOKENS,
        )
    except planner.PlannerUnavailable as exc:
        # The client, the workspace header and the refusal check are shared
        # with the goals page — see `planner.from_anthropic`. Its errors are
        # already written for a reader rather than for a log, so they pass
        # through under this module's own type rather than reworded.
        raise BriefUnavailable(str(exc)) from exc

    return _clean(_object(text))
