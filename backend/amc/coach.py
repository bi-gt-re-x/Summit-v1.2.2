"""The study plan's AI coach.

The week-by-week plan (engine.plan_weeks) is arithmetic: phases by date, topics
by weight and how much is in hand. That is a good skeleton and a poor coach —
it cannot hear "I have AoPS Intro to Counting", "I'm free only on weekends" or
"I scored 84 last year and blank everything past #18". This module hands all of
that, plus the account's actual results, to the configured model and asks for a
plan in a fixed shape.

The model call is backend/tracking/planner.py's `from_provider`: Groq when
GROQ_API_KEY is set, xAI's Grok when XAI_API_KEY is set and
MILESTONE_PROVIDER=grok, or the others it supports. Whatever answers, the
reply is checked on the way out — topic ids against the catalogue, counts
bounded — and its topic order feeds back into the week-by-week plan.

The model may also ask up to three follow-up questions. The page shows them
with answer boxes, and "Refine" runs this again with the answers in the brief.
"""
import json
import os
from datetime import date

from backend.amc import catalog
from backend.tracking import planner

SYSTEM = """\
You are an experienced AMC 10, AMC 12 and AIME coach writing a personal study
plan for one student. You are given their contest, exam date, goal score,
weekly time, what they told you about themselves, and their real results on
this site (accuracy by topic, projected score, mock contests, review log).

Write a plan that is specific to them, realistic for the time they have, and
built around the topics that will gain them the most points. Contest facts to
respect: the AMC 10/12 is 25 multiple-choice problems in 75 minutes, scored 6
per correct, 1.5 per blank, 0 per wrong; the AIME is 15 integer answers
(000-999) in 3 hours. Problems 1-10 are mostly algebra and arithmetic; geometry,
number theory and counting dominate from about #15. Recent AIME qualifying
cutoffs have mostly been around 95-115 on the AMC 10 and 75-95 on the AMC 12.

Rules:
- Use only topic ids from the list provided, exactly as written.
- Put what they are weak at and what appears most often first; leave topics
  they are already strong at for later, unless their results contradict them.
- Refer to the student as "you".
- Weekly minutes in the schedule must add up to roughly their stated hours.
- Ask follow-up questions only if the answer would change the plan; ask none
  if you have what you need.
- Be concrete: name problem ranges, timings and habits, not platitudes.
"""

SCHEMA = {
    'type': 'object',
    'properties': {
        'summary': {'type': 'string', 'description': 'Two or three sentences: the strategy for this student.'},
        'starting_point': {'type': 'string', 'description': 'An honest read of where they are now, from the data.'},
        'phases': {
            'type': 'array',
            'description': 'Two to five phases from now to the exam, in order.',
            'items': {
                'type': 'object',
                'properties': {
                    'name': {'type': 'string'},
                    'weeks': {'type': 'string', 'description': 'Which weeks, e.g. "1-6".'},
                    'goal': {'type': 'string'},
                    'focus_topics': {'type': 'array', 'items': {'type': 'string'}},
                    'routine': {'type': 'string', 'description': 'What a typical week in this phase looks like.'},
                },
                'required': ['name', 'weeks', 'goal', 'focus_topics', 'routine'],
                'additionalProperties': False,
            },
        },
        'weekly_schedule': {
            'type': 'array',
            'description': 'A typical week, one entry per study day.',
            'items': {
                'type': 'object',
                'properties': {
                    'day': {'type': 'string'},
                    'task': {'type': 'string'},
                    'minutes': {'type': 'integer'},
                },
                'required': ['day', 'task', 'minutes'],
                'additionalProperties': False,
            },
        },
        'milestones': {
            'type': 'array',
            'description': 'Checkpoints with a week number and a measurable target.',
            'items': {
                'type': 'object',
                'properties': {
                    'week': {'type': 'integer'},
                    'target': {'type': 'string'},
                },
                'required': ['week', 'target'],
                'additionalProperties': False,
            },
        },
        'focus_order': {
            'type': 'array', 'items': {'type': 'string'},
            'description': ('Topic ids in the order to study them: weak, high-weight topics first; '
                            'topics they are already strong at last or not at all.'),
        },
        'tips': {'type': 'array', 'items': {'type': 'string'}, 'description': 'Three to five contest-day and study habits.'},
        'questions': {
            'type': 'array', 'items': {'type': 'string'},
            'description': 'Up to three follow-up questions whose answers would change this plan. Empty if none.',
        },
    },
    'required': ['summary', 'starting_point', 'phases', 'weekly_schedule', 'milestones',
                 'focus_order', 'tips', 'questions'],
    'additionalProperties': False,
}

EXPERIENCE = {
    'first': 'This is their first AMC.',
    'taken': 'They have taken the AMC before.',
    'qualified': 'They have qualified for the AIME before.',
}


def available():
    """Whether a model that answers in a fixed shape is configured."""
    return planner.able()


def provider_label():
    """What will write the plan, for the page: e.g. "Groq · openai/gpt-oss-120b"."""
    using = planner.provider()
    if using == 'groq':
        return 'Groq · ' + (os.environ.get('GROQ_MODEL') or planner.GROQ_MODEL)
    if using == 'grok':
        return 'Grok · ' + (os.environ.get('GROK_MODEL') or planner.GROK_MODEL)
    if using == 'anthropic':
        return 'Claude · ' + planner.model()
    if using == 'huggingface':
        return 'Hugging Face · ' + planner.HF_MODEL
    return ''


def brief(plan, details, tstats, projected, mocks, review_counts, answers, today):
    """Everything the model is told, as plain text."""
    target = plan['target']
    exam = date.fromisoformat(plan['exam_date'])
    weeks = max(1, (exam - today).days // 7)
    relevant = [t for t in catalog.TOPICS if target in t['levels']]
    lines = [
        'Contest: {}. Exam date: {} ({} days, about {} weeks away). Today: {}.'.format(
            target, plan['exam_date'], (exam - today).days, weeks, today.isoformat()),
        'Goal score: {} out of {}.'.format(plan['goal_score'], catalog.FORMATS[target]['max']),
        'Study time: about {} hours a week over {} days a week.'.format(
            plan['hours'], details.get('days_per_week') or 'unspecified'),
    ]
    if details.get('experience') in EXPERIENCE:
        lines.append(EXPERIENCE[details['experience']])
    if details.get('last_score') not in (None, ''):
        lines.append('Their most recent real score on this contest: {}.'.format(details['last_score']))
    if details.get('strong'):
        lines.append('They say they are strong at: {}.'.format(', '.join(
            catalog.TOPIC_BY_ID[t]['name'] for t in details['strong'] if t in catalog.TOPIC_BY_ID)))
    if details.get('weak'):
        lines.append('They say they are weak at: {}.'.format(', '.join(
            catalog.TOPIC_BY_ID[t]['name'] for t in details['weak'] if t in catalog.TOPIC_BY_ID)))
    if details.get('resources'):
        lines.append('Resources they have: {}'.format(details['resources']))
    if details.get('notes'):
        lines.append('Anything else they said: {}'.format(details['notes']))

    lines.append('')
    lines.append('Their results on this site:')
    lines.append('- Projected {} score from their answers: {}.'.format(
        target, projected if projected is not None else 'not enough answers yet'))
    lines.append('- Review log: {} due, {} in the log, {} mastered.'.format(
        review_counts['due'], review_counts['active'], review_counts['mastered']))
    if mocks:
        lines.append('- Recent contests: ' + '; '.join(
            '{} {} ({})'.format(m['name'], m['score'], m['at'][:10]) for m in mocks[:5]) + '.')
    else:
        lines.append('- No timed contests yet.')
    attempted = [(t, tstats[t['id']]) for t in relevant if tstats[t['id']]['attempted']]
    if attempted:
        lines.append('- Topic accuracy (first try): ' + '; '.join(
            '{} {}/{}'.format(t['name'], s['first_right'], s['attempted']) for t, s in attempted) + '.')
    else:
        lines.append('- No practice answers yet.')

    if answers:
        lines.append('')
        lines.append('Their answers to your earlier follow-up questions:')
        for question, answer in answers.items():
            if str(answer).strip():
                lines.append('- Q: {}\n  A: {}'.format(question, str(answer).strip()))

    lines.append('')
    lines.append('Topic ids you may use (id: name, how often it appears 1-3):')
    for t in relevant:
        lines.append('- {}: {} ({})'.format(t['id'], t['name'], t['weight']))
    return '\n'.join(lines)


def _strings(value, limit, length=400):
    out = []
    for item in value if isinstance(value, list) else []:
        text = str(item).strip()
        if text:
            out.append(text[:length])
    return out[:limit]


def _topics(value, target):
    allowed = {t['id'] for t in catalog.TOPICS if target in t['levels']}
    out = []
    for item in value if isinstance(value, list) else []:
        tid = str(item).strip().lower()
        if tid in allowed and tid not in out:
            out.append(tid)
    return out


def clean(found, target):
    """The model's answer, bounded and checked against the catalogue."""
    if not isinstance(found, dict):
        raise planner.PlannerUnavailable('The model did not return a plan. Try again.')
    phases = []
    for p in (found.get('phases') or [])[:5]:
        if not isinstance(p, dict):
            continue
        phases.append({
            'name': str(p.get('name') or '').strip()[:60] or 'Phase',
            'weeks': str(p.get('weeks') or '').strip()[:20],
            'goal': str(p.get('goal') or '').strip()[:400],
            'focus_topics': _topics(p.get('focus_topics'), target)[:6],
            'routine': str(p.get('routine') or '').strip()[:600],
        })
    schedule = []
    for d in (found.get('weekly_schedule') or [])[:7]:
        if not isinstance(d, dict):
            continue
        try:
            minutes = max(0, min(600, int(d.get('minutes') or 0)))
        except (TypeError, ValueError):
            minutes = 0
        schedule.append({'day': str(d.get('day') or '').strip()[:20],
                         'task': str(d.get('task') or '').strip()[:300], 'minutes': minutes})
    milestones = []
    for m in (found.get('milestones') or [])[:10]:
        if not isinstance(m, dict):
            continue
        try:
            week = max(1, min(104, int(m.get('week') or 1)))
        except (TypeError, ValueError):
            week = 1
        milestones.append({'week': week, 'target': str(m.get('target') or '').strip()[:300]})
    summary = str(found.get('summary') or '').strip()[:1200]
    if not summary or not phases:
        raise planner.PlannerUnavailable('The model returned an incomplete plan. Try again.')
    return {
        'summary': summary,
        'starting_point': str(found.get('starting_point') or '').strip()[:800],
        'phases': phases,
        'weekly_schedule': schedule,
        'milestones': sorted(milestones, key=lambda m: m['week']),
        'focus_order': _topics(found.get('focus_order'), target),
        'tips': _strings(found.get('tips'), 6),
        'questions': _strings(found.get('questions'), 3, 300),
    }


def write_plan(plan, details, tstats, projected, mocks, review_counts, answers, today):
    """Ask the configured model for a plan. Raises PlannerUnavailable with a
    message meant for the page when it cannot."""
    if not planner.provider():
        raise planner.PlannerUnavailable(
            'The AI coach needs a model key in .env: GROQ_API_KEY (free, console.groq.com), '
            'or XAI_API_KEY with MILESTONE_PROVIDER=grok for Grok. Restart the server after adding it.')
    if not available():
        raise planner.PlannerUnavailable(
            'The configured model cannot answer in the fixed shape a plan needs. '
            'Use GROQ_API_KEY, XAI_API_KEY or ANTHROPIC_API_KEY.')
    text = planner.from_provider(
        brief(plan, details, tstats, projected, mocks, review_counts, answers, today),
        system=SYSTEM, schema=SCHEMA,
        instruction='Write this student’s study plan.')
    try:
        found = json.loads(planner._json_span(text))
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        raise planner.PlannerUnavailable('The model’s answer could not be read. Try again.') from exc
    return clean(found, plan['target'])
