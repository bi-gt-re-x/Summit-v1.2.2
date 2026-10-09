"""Writing up one subject's findings, with a model.

## Why this is a model and not a rule, and where the line is

The subject page already knows everything factual about a subject: the score
and the four rates it is the mean of, how each difficulty band is going, which
of the twelve reasons show up when a session goes badly, whether the goal is
going to land. All of that is arithmetic over the account's own tasks and it
stays arithmetic — see frontend/src/components/Subject/model.ts, which is
where every number on that page comes from and where every number will
continue to come from.

What arithmetic cannot do is the part that needs to know what the subject *is*.
"Your hardest band is at 61%" is a fact the app can compute. "Spend the next
half hour on multi-step proofs, because that is what a Brutal-rated maths task
usually is" requires knowing something about mathematics, and there is no
table in this app it could be read from. That is the same argument
backend/tracking/planner.py makes for milestone suggestions, and it is the
only argument that justifies a model call in a codebase whose whole claim is
that its figures are its own.

## The rule the prompt exists to enforce

**The model is given the numbers and may not produce any others.** It writes
prose over a supplied set of findings: it may quote them, order them, explain
what they imply and say what to practice — and it may not compute, estimate,
round differently, or invent a figure that was not handed to it. The system
prompt says this three ways because it is the one failure that would matter:
a made-up "you are 68% accurate in geometry" on this page is indistinguishable
from a counted one, and the entire value of the page is that its readers can
trust the difference.

The schema helps by leaving nowhere to put a number except inside prose that
also has to cite where it came from — every practice block carries a `why`
that has to name a figure from the brief.

## Anthropic only, deliberately

planner.py offers Hugging Face first because a cheap open model can write five
short titles and nobody should need a paid account for a button. That
reasoning does not carry here. This asks for nested structured output over a
table of supplied statistics, with a hard instruction not to add to them, and
the characteristic failure of a small model on exactly that task is a fluent
invented number. A feature that is wrong in a way the reader cannot see is
worse than a feature that is absent, so when there is no Anthropic key this
says so and the page simply does not show the panel.

## Nothing here is stored, and nothing here is a figure

The endpoint returns prose to the page, the page draws it in a panel that says
it was written by a model, and that is the end of it. It is never cached into
the account, never mixed into the counted panels, and never used to compute
anything. A reader who never presses the button sees a page that is exactly as
complete as it was before.
"""
import json
import re
from typing import Any, Dict, List

from backend.tracking import planner

#: Opus, and not the Sonnet the goals page uses.
#:
#: The two calls are not the same shape of problem. A milestone is five short
#: titles from a goal's own words; this reads a table of a dozen statistics,
#: has to work out which of them actually explain each other, and has to do it
#: without adding any. Holding a "quote these and only these" instruction
#: across nested structured output is exactly where a smaller model drifts,
#: and the drift here is a fabricated number about the reader.
#:
#: Overridable for the same reason planner's is, and under its own name so
#: that setting one does not silently move the other.
MODEL_DEFAULT = 'claude-opus-5'

#: Room for the thinking and the answer together. This is one panel of prose
#: and the page holds a spinner for it, so it does not stream.
MAX_TOKENS = 16000

#: How many practice blocks the page draws.
PRACTICE = 3

SYSTEM = """\
You write the read-out for one subject on a study-analytics page.

You are given a set of findings that the app has already computed from the \
reader's own record. Your job is to turn them into two things: a short reading \
of what they mean together, and what to practice next.

THE ONE RULE THAT MATTERS

Every number you write must be one that appears in the findings you were \
given. You may quote them, compare them, and say what they imply. You may not \
compute new ones, estimate, re-round, or introduce any figure that is not in \
the brief — not a percentage, not a count, not a duration, not a date.

This is not a style preference. The reader of this page can tell a counted \
figure from an invented one only by trusting that there are no invented ones. \
If a claim you want to make needs a number you were not given, make the claim \
without the number or make a different claim.

You also do not know anything about this person beyond the brief. No \
inferences about their schedule, their exams, their age, or their reasons.

WHAT YOU DO KNOW THAT THE APP DOES NOT

Two things, and they are the reason a model is doing this at all.

**The subject.** What a task at a given difficulty in this subject usually \
involves, what is worth drilling, and what somebody chasing the stated aim \
should be pointed at next — a specific competition, exam, syllabus or body of \
work, by name. That is knowledge about the world, not a claim about the \
reader, and naming one is often the single most useful line on the page. Say \
plainly that it is a suggestion.

**What the pattern means.** The brief gives you the difficulty bands and the \
reasons given when a session went badly. Those support real readings: work \
attempted at the top difficulty with execution falling off says something \
different from work that goes wrong at every level, and reasons like being \
interrupted or losing focus say something different again from not knowing \
where to start. Name the pattern when the figures support it — "the ceiling is \
high and the errors are careless" is a finding; the same sentence with no \
figures behind it is a horoscope.

What you still may not do is invent a figure. If you want to say a particular \
topic is the weak one, you may only do so if the brief names it — the app \
records a subject and a difficulty and nothing finer, so there is no per-topic \
accuracy anywhere and you must not produce one.

WHAT TO WRITE

`reading` — two or three sentences on what these findings mean together, read \
against what they said they are chasing. Say the thing the numbers are \
evidence for, not the numbers again: the reader can see the table. If one \
finding explains another, that connection is the most useful sentence on the \
page. If the record is thin, say that plainly instead of overreading it.

`practice` — what to work on next, most valuable first. This is where you are \
allowed to know things the app does not: what a task at that difficulty in \
that subject usually involves, and what specifically is worth drilling. Be \
concrete to the subject. "Practice more" says nothing.

Each practice block has:
- `title`: what to work on, six words or fewer.
- `minutes`: a suggested length for one sitting, a whole number between 10 \
and 90. This is your recommendation, not a measurement, and it is the one \
number you are asked to supply.
- `focus`: two to four specific things to drill, a few words each, concrete \
to the subject.
- `why`: one sentence, and it must cite a figure from the findings — this is \
what makes the recommendation checkable rather than a horoscope. The one \
exception is a block whose whole point is something outside the record — a \
named competition or syllabus to aim at — where the `why` says what it would \
do for the aim they stated.

Order matters: if there is a goal in the brief and it is behind, the first \
practice block should be the one that serves it.

TONE

Direct and specific. No encouragement, no praise, no "keep up the great work". \
The reader came for a read-out, not a report card comment.

Write the way somebody who knows the subject would say it out loud. Short \
sentences. Ordinary words. No em-dash asides, no "X, not Y" flourishes, and \
no sentence that exists to land a point rather than say a thing. Never open \
with "Your record shows" or close by summarizing what you just said.
"""

SCHEMA = {
    'type': 'object',
    'properties': {
        'reading': {
            'type': 'string',
            'description': 'Two or three sentences on what the findings mean together.',
        },
        'practice': {
            'type': 'array',
            'description': 'What to work on next, most valuable first.',
            'items': {
                'type': 'object',
                'properties': {
                    'title': {'type': 'string'},
                    'minutes': {'type': 'integer'},
                    'focus': {'type': 'array', 'items': {'type': 'string'}},
                    'why': {'type': 'string'},
                },
                'required': ['title', 'minutes', 'focus', 'why'],
                'additionalProperties': False,
            },
        },
    },
    'required': ['reading', 'practice'],
    'additionalProperties': False,
}

#: What a suggested sitting is allowed to be, in minutes. The model is asked
#: for a number in this range and it is clamped here as well: it is the one
#: figure it supplies, and a 400-minute recommendation is not one the page
#: should print however confidently it arrives.
MINUTES = (10, 90)


class BriefUnavailable(RuntimeError):
    """The brief could not be written.

    Carries a message for the person looking at the subject page, the same way
    `planner.PlannerUnavailable` does — this is shown in the panel rather than
    logged.
    """


NO_KEY = (
    'Writing this up needs an Anthropic key. Put one in ANTHROPIC_API_KEY in '
    '.env and restart the server. A Hugging Face token does not cover this '
    'one: it asks a model to write over a table of your figures without '
    'adding any, and a small model inventing a number here would be worse '
    'than no panel at all.')


def configured() -> bool:
    """Whether the button can do anything. Checked per call, as planner does."""
    return planner.able()


# ---------------------------------------------------------------------------
# The brief
# ---------------------------------------------------------------------------
def _line(label: str, value: Any) -> str:
    return '{}: {}'.format(label, value)


def brief_from(findings: Dict[str, Any]) -> str:
    """The findings, as the lines the model reads.

    Written out as text rather than handed over as JSON because the one
    instruction that matters is "quote these and add nothing", and a labelled
    list of statements is what that instruction is easiest to follow against.
    Only the parts that are actually present — an empty line is a line the
    model has to decide means nothing, and it sometimes decides wrong.
    """
    lines: List[str] = [_line('Subject', findings.get('subject') or 'this subject')]

    for label, key in (
        ('Period', 'span'),
        ('Overall score', 'score'),
        ('Grade', 'grade'),
        ('Tasks finished this period', 'finished'),
        ('Tasks finished the period before', 'finished_before'),
        ('Current streak, days', 'streak'),
    ):
        value = findings.get(key)
        if value not in (None, '', []):
            lines.append(_line(label, value))

    # What the reader said the work is for, and where they say they are. Not
    # measured and not presented as if it were — it is the sentence they wrote
    # in the setup questions, and it is what makes "what next" answerable.
    aim = str(findings.get('aim') or '').strip()
    level = str(findings.get('level') or '').strip()
    if aim:
        lines.append('')
        lines.append('What they say they are chasing in this subject: {}'.format(aim))
    if level:
        lines.append('Where they say they are now: {}'.format(level))

    checkpoints = [str(entry).strip() for entry in (findings.get('checkpoints') or [])
                   if str(entry).strip()]
    if checkpoints:
        lines.append('The stages they wrote between here and there:')
        for at, title in enumerate(checkpoints, 1):
            lines.append('  {}. {}'.format(at, title))

    rates = findings.get('rates') or []
    if rates:
        lines.append('')
        lines.append('The four rates the score is the mean of, out of 100:')
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
        lines.append('What the reader said when a session went badly:')
        for entry in reasons:
            lines.append('  - {} ({}% of those sessions, {} tasks)'.format(
                entry.get('label'), entry.get('share'), entry.get('count')))

    goals = findings.get('goals') or []
    if goals:
        lines.append('')
        lines.append('Goals this subject is filed under:')
        for entry in goals:
            drift = entry.get('drift')
            when = ('no projection yet' if drift is None
                    else 'projected {} days late'.format(drift) if drift > 0
                    else 'projected on time or early')
            lines.append('  - "{}": {}% done, due {}, {}'.format(
                entry.get('title'), entry.get('progress'),
                entry.get('deadline') or 'no date set', when))

    return '\n'.join(lines)


# ---------------------------------------------------------------------------
# Reading the answer
# ---------------------------------------------------------------------------
def _object(text: str) -> Dict[str, Any]:
    """The JSON object out of the answer, however it was wrapped.

    Less forgiving than planner's `_titles`, and deliberately: that one has to
    cope with small models returning prose, because prose can be read as five
    titles without risk. Here a shape this cannot parse is a shape whose
    numbers cannot be trusted, so it raises rather than salvaging.
    """
    if not text or not text.strip():
        raise BriefUnavailable('The model returned nothing. Try again.')

    body = text.strip()
    fence = re.search(r'```(?:json)?\s*(.+?)```', body, re.S)
    if fence:
        body = fence.group(1).strip()

    try:
        found = json.loads(body)
    except (json.JSONDecodeError, ValueError):
        match = re.search(r'\{.*\}', body, re.S)
        if not match:
            raise BriefUnavailable('The model’s answer could not be read. Try again.')
        try:
            found = json.loads(match.group(0))
        except (json.JSONDecodeError, ValueError) as exc:
            raise BriefUnavailable(
                'The model’s answer could not be read. Try again.') from exc

    if not isinstance(found, dict):
        raise BriefUnavailable('The model’s answer could not be read. Try again.')
    return found


def _clean(found: Dict[str, Any]) -> Dict[str, Any]:
    """The answer, narrowed to the shape the page draws.

    Everything is bounded on the way out. The reading is trimmed, the practice
    list is cut to what the page has room for, and `minutes` — the one number
    the model is asked to supply — is clamped into a range a person could
    actually sit for.
    """
    reading = str(found.get('reading') or '').strip()

    practice = []
    for entry in (found.get('practice') or [])[:PRACTICE]:
        if not isinstance(entry, dict):
            continue
        title = str(entry.get('title') or '').strip()
        why = str(entry.get('why') or '').strip()
        if not title:
            continue
        try:
            minutes = int(entry.get('minutes'))
        except (TypeError, ValueError):
            minutes = MINUTES[0]
        focus = [str(item).strip() for item in (entry.get('focus') or [])
                 if str(item).strip()]
        practice.append({
            'title': title,
            'minutes': max(MINUTES[0], min(MINUTES[1], minutes)),
            'focus': focus[:4],
            'why': why,
        })

    if not reading and not practice:
        raise BriefUnavailable('The model returned nothing usable. Try again.')

    return {'reading': reading, 'practice': practice}


# ---------------------------------------------------------------------------
# The one thing this module does
# ---------------------------------------------------------------------------
def write(findings: Dict[str, Any], model_id: str = '') -> Dict[str, Any]:
    """A reading of these findings, and what to practice next.

    Raises `BriefUnavailable` for everything the panel should say out loud —
    no key, a refused request, an unreadable answer. The caller turns that
    into a sentence in the panel rather than into a 500: a brief that cannot
    be written is a panel that says so, over a page that was already complete
    without it.
    """
    if not configured():
        raise BriefUnavailable(NO_KEY)
    if not (findings.get('subject') or '').strip():
        raise BriefUnavailable('There is no subject to write about.')

    try:
        text = planner.from_provider(
            brief_from(findings),
            system=SYSTEM,
            schema=SCHEMA,
            instruction=(
                'Write the reading and the practice list for this subject, '
                'using only the figures below.'),
            model_id=model_id or MODEL_DEFAULT,
            max_tokens=MAX_TOKENS,
        )
    except planner.PlannerUnavailable as exc:
        # The client, the workspace header and the refusal check are shared
        # with the goals page — see `planner.from_anthropic`. Its errors are
        # already written for a reader rather than for a log, so they are
        # passed through under this module's own type rather than reworded.
        raise BriefUnavailable(str(exc)) from exc

    return _clean(_object(text))
