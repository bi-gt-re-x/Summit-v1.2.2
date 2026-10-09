"""Drafting a goal for a subject, from the checkpoints already set against it.

## What this is for

Somebody on a subject page has two things the goals page does not: a list of
checkpoints they wrote against that subject, and a record of what they have
actually been doing in it. A goal is the piece in the middle — a target, a
number, a date — and it is the piece people are worst at writing, because it
asks for a commitment before they have worked out what the stages are.

They already worked out the stages. This turns them into the goal.

## The division of labour, which is the whole design

The model is asked for the parts that need judgement about the *subject*: what
to call the goal, what unit its target should be counted in, roughly how many
of that unit is a real target rather than a round number, and how long it
should run. Those are the things no table in this app can answer — the same
argument backend/tracking/planner.py makes for milestone suggestions.

It is not asked for anything about the reader that the app already knows.
Their current rate, what they have finished, how consistent they are: all of
that is measured, it is handed over in the brief as context, and the model is
told plainly that it may use those figures to size the target and may not
restate them as findings. A goal drafted here says what to aim at; the subject
page it came from says how it is going.

## The checkpoints come across, and then stop being shared

The draft carries the milestone titles so the goal can be created with them in
one call (`milestones` on `NewGoal`). They are **copied** — from that point the
goal's checkpoints are the goal's, and editing the subject's notes months later
does not silently rewrite a commitment. See the note in backend/api/subjects.py.

## Nothing here writes

A draft. The endpoint hands it to the page, the page shows it, and only the
reader pressing the button creates a goal — through the ordinary
`/api/add_goal`, with the ordinary validation. The model proposes; the account
owns.
"""
from typing import Any, Dict, List

from backend.tracking import planner
from backend.tracking.subject_brief import BriefUnavailable, _object

#: Opus, for the reason subject_brief uses it: this reads a table of the
#: reader's figures and has to size a target against them without restating
#: them, which is where a smaller model drifts into inventing.
MODEL_DEFAULT = 'claude-opus-5'

MAX_TOKENS = 16000

#: What a drafted goal is allowed to ask for. Bounds rather than validation for
#: its own sake: these become a real goal through /api/add_goal, and a target of
#: nought or a two-year horizon drafted from a fortnight of record is a goal
#: that will be abandoned rather than missed.
TARGET = (1, 100000)
WEEKS = (1, 104)

#: How many checkpoints ride along. The goals page pads and cuts to its own
#: bounds anyway; this keeps the prompt and the draft in the same range.
MILESTONES = 5

SYSTEM = """\
You draft one goal for a subject in a study-planning app, from checkpoints the \
reader has already written against that subject.

The checkpoints are the stages. You are writing the goal that sits over them: \
what it is called, what its target is counted in, how much of that is a real \
target, and how long it runs.

WHAT YOU DECIDE, AND WHAT YOU MUST NOT

Decide the things that need knowing about the subject: a title, a unit, a \
number, a horizon, and an order for the checkpoints.

Do not restate the reader's own figures as findings. The brief gives you what \
they have been doing so you can size the target against it — a target below \
what somebody is already managing is not a goal, and one at ten times their \
rate is a wish. Use the figures to choose the number. Do not write sentences \
about how they are doing; the page this came from already says that, and \
better, because it counted it.

SIZE IT ON DIFFICULTY AND EXECUTION, NOT ONLY ON VOLUME

The brief gives you how much work they finished, and it also gives you how \
hard that work was and how well it went: the four rates, the difficulty bands \
with an execution figure for each, and what they said when a session went \
badly. Use all of it.

Volume alone sets how *many*. The bands set how *hard*, and that is usually \
the more useful half. Somebody clearing trivial work at 90 and hard work at \
39 does not need more tasks — a goal counting tasks at a level they are \
already comfortable with can be met without them getting any better, which is \
the one way a goal here can be actively misleading. Pitch the target at the \
band where execution starts to fall, or one above it.

Say which in `why`, in the reader's terms rather than by quoting the number: \
"the harder problems are where this stalls" rather than "execution is 39 at \
Hard". The figures are on the page already.

Do not invent figures. If the brief does not give you a rate, pick a target \
from the subject and the checkpoints rather than from an imagined one.

THE FIELDS

`title`: what the goal is, six words or fewer. Not a checkpoint — the state \
past all of them. No leading verb like "Complete" or "Achieve".

`why`: one sentence on what reaching it would mean. Concrete to this subject.

`unit`: what the target counts, lowercase and plural — "problems", "essays", \
"hours", "pieces". One word where one will do.

`target`: a whole number of that unit. Reachable in the horizon you set, at a \
rate somewhat above what the brief shows they are managing.

`weeks`: how long it runs, a whole number. Long enough that the target is not \
trivial, short enough to still feel like this term rather than someday.

`milestones`: the checkpoints, in the order they should be reached, rewritten \
only where a title is unclear on its own. Keep the reader's wording where it \
works — these are theirs. If they gave you none, write the stages yourself.

TONE

Plain. No encouragement, no adjectives about the reader.

Write the way somebody who knows the subject would say it out loud. Short \
sentences. Ordinary words. No em-dash asides, no "X, not Y" flourishes, and \
no sentence that exists to land a point rather than say a thing. Never open \
with "Your record shows" or close by summarizing what you just said.
"""

SCHEMA = {
    'type': 'object',
    'properties': {
        'title': {'type': 'string'},
        'why': {'type': 'string'},
        'unit': {'type': 'string'},
        'target': {'type': 'integer'},
        'weeks': {'type': 'integer'},
        'milestones': {'type': 'array', 'items': {'type': 'string'}},
    },
    'required': ['title', 'why', 'unit', 'target', 'weeks', 'milestones'],
    'additionalProperties': False,
}


def configured() -> bool:
    return planner.able()


def brief_from(findings: Dict[str, Any]) -> str:
    """The subject, its checkpoints, and what the record says about the pace.

    Only what is there. An empty "Finished: " line is a line the model has to
    interpret, and it guesses — the same reason `planner._brief` writes only
    the fields that were filled in.
    """
    lines: List[str] = ['Subject: {}'.format(findings.get('subject') or 'this subject')]

    for label, key in (
        ('Tasks finished recently', 'finished'),
        ('Over how many days', 'days'),
        ('Days with work in them', 'active_days'),
        ('Hours logged', 'hours'),
    ):
        value = findings.get(key)
        if value not in (None, '', 0):
            lines.append('{}: {}'.format(label, value))

    aim = str(findings.get('aim') or '').strip()
    if aim:
        level = str(findings.get('level') or '').strip()
        lines.append('What they say this subject is for: {}{}'.format(
            aim, ' (at {} now)'.format(level) if level else ''))

    # How hard the work was and how it went, which is the half this brief used
    # to leave out. Volume alone sizes a target — twenty tasks a month says
    # forty is reachable and four hundred is not — and says nothing about what
    # they should be *worth*. Somebody clearing trivial work at 90 and hard
    # work at 39 does not need more tasks; they need harder ones, and a goal
    # counting tasks at the level they are already comfortable with is a goal
    # that can be met without getting any better. The same two sections the
    # write-up and the route are given, in the same words, so a reader who
    # opens both does not meet the same figures phrased two ways.
    rates = findings.get('rates') or []
    if rates:
        lines.append('')
        lines.append('Where the four rates stand (out of 100):')
        for entry in rates:
            lines.append('  - {}: {}'.format(entry.get('label'), entry.get('now')))

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

    checkpoints = [str(entry).strip() for entry in (findings.get('milestones') or [])
                   if str(entry).strip()]
    lines.append('')
    if checkpoints:
        lines.append("The reader's checkpoints for this subject, in their order:")
        for at, title in enumerate(checkpoints[:MILESTONES], 1):
            lines.append('  {}. {}'.format(at, title))
    else:
        lines.append('The reader has not written any checkpoints for this subject yet.')

    return '\n'.join(lines)


def _clean(found: Dict[str, Any]) -> Dict[str, Any]:
    """The draft, narrowed and bounded to what /api/add_goal will accept."""
    title = str(found.get('title') or '').strip()[:120]
    if not title:
        raise BriefUnavailable('The model did not name a goal. Try again.')

    try:
        target = int(found.get('target'))
    except (TypeError, ValueError):
        target = TARGET[0]
    try:
        weeks = int(found.get('weeks'))
    except (TypeError, ValueError):
        weeks = 8

    milestones = [str(entry).strip()[:120] for entry in (found.get('milestones') or [])
                  if str(entry).strip()][:MILESTONES]

    return {
        'title': title,
        'why': str(found.get('why') or '').strip()[:400],
        'unit': str(found.get('unit') or '').strip()[:40] or 'tasks',
        'target': max(TARGET[0], min(TARGET[1], target)),
        'weeks': max(WEEKS[0], min(WEEKS[1], weeks)),
        'milestones': milestones,
    }


def draft(findings: Dict[str, Any], model_id: str = '') -> Dict[str, Any]:
    """A goal drafted for this subject. Writes nothing.

    Raises `BriefUnavailable` — shared with subject_brief rather than a second
    type, because both are shown in the same place on the same page and the
    caller treats them identically — for everything the panel should say out
    loud: no key, a refusal, an answer that cannot be read.
    """
    if not configured():
        raise BriefUnavailable(
            'Drafting a goal needs an Anthropic key. Put one in ANTHROPIC_API_KEY '
            'in .env and restart the server.')
    if not (findings.get('subject') or '').strip():
        raise BriefUnavailable('There is no subject to draft a goal for.')

    try:
        text = planner.from_provider(
            brief_from(findings),
            system=SYSTEM,
            schema=SCHEMA,
            instruction='Draft one goal for this subject, from the checkpoints below.',
            model_id=model_id or MODEL_DEFAULT,
            max_tokens=MAX_TOKENS,
        )
    except planner.PlannerUnavailable as exc:
        raise BriefUnavailable(str(exc)) from exc

    return _clean(_object(text))
