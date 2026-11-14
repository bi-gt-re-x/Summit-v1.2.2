"""The AI endpoints: smart insights, hints, mistake explanations and new problems.

The numbers come from backend/amc/smart.py and need no key. Everything a model
writes goes through backend/amc/ai.py (Grok when XAI_API_KEY is set, Groq
otherwise), which caches answers and enforces a daily limit per account. A
missing key or a spent limit comes back as `{"success": false, "message": ...}`
with the sentence the page shows, never a 500.
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.amc import ai, catalog, create, engine, smart, store
from backend.amc import problems as pb
from backend.api.guard import current_username
from backend.api.reply import fail, ok

router = APIRouter(tags=['amc-ai'])


def _context(user):
    attempts = store.attempts(user)
    reviews = store.reviews(user)
    return attempts, engine.history(attempts), {r['problem_id']: r for r in reviews}


@router.get('/api/amc/ai/status')
def status(username: str = Depends(current_username)):
    return ok(**ai.status(username))


# ---------------------------------------------------------------------------
# Smart insights
# ---------------------------------------------------------------------------
DIAGNOSE_SYSTEM = """\
You are an experienced AMC 10, AMC 12 and AIME coach reading one student's
results. You get a model of their ability on the AoPS 1-10 rating scale (the
rating they solve half the time), their predicted score, topic and technique
strengths, patterns in their mistakes, and their trend. Explain what the
numbers mean for them and what to do this week. Be specific and honest: if
there is little data, say so and keep advice general. Use only topic ids from
the list given.
""" + ai.VOICE

DIAGNOSE_SCHEMA = {
    'type': 'object',
    'properties': {
        'headline': {'type': 'string', 'description': 'One sentence: where they stand.'},
        'diagnosis': {'type': 'string', 'description': 'Three to five sentences reading the numbers.'},
        'strengths': {'type': 'array', 'items': {'type': 'string'}},
        'weaknesses': {'type': 'array', 'items': {'type': 'string'}},
        'this_week': {
            'type': 'array',
            'items': {'type': 'object', 'properties': {
                'action': {'type': 'string'}, 'why': {'type': 'string'}, 'minutes': {'type': 'integer'},
                'topic': {'type': 'string', 'description': 'A topic id, or empty.'},
            }, 'required': ['action', 'why', 'minutes', 'topic'], 'additionalProperties': False},
        },
        'contest_strategy': {'type': 'string', 'description': 'How to approach the paper itself: pacing, what to skip.'},
    },
    'required': ['headline', 'diagnosis', 'strengths', 'weaknesses', 'this_week', 'contest_strategy'],
    'additionalProperties': False,
}


def _clean_diagnosis(found):
    week = []
    for item in (found.get('this_week') or [])[:6]:
        if not isinstance(item, dict):
            continue
        topic = item.get('topic') if item.get('topic') in catalog.TOPIC_BY_ID else ''
        try:
            minutes = max(5, min(240, int(item.get('minutes') or 30)))
        except (TypeError, ValueError):
            minutes = 30
        week.append({'action': ai.text(item.get('action'), 300), 'why': ai.text(item.get('why'), 400),
                      'minutes': minutes, 'topic': topic,
                      'topic_name': catalog.TOPIC_BY_ID[topic]['name'] if topic else ''})
    return {'headline': ai.text(found.get('headline'), 300), 'diagnosis': ai.text(found.get('diagnosis'), 1500),
            'strengths': ai.strings(found.get('strengths'), 5), 'weaknesses': ai.strings(found.get('weaknesses'), 5),
            'this_week': [w for w in week if w['action']],
            'contest_strategy': ai.text(found.get('contest_strategy'), 1000)}


@router.get('/api/amc/insights')
def insights(username: str = Depends(current_username)):
    attempts, hist, review_by_id = _context(username)
    stats = smart.analyze(attempts, hist, review_by_id, store.mocks(username), store.plan(username))
    today = ai.cached('diagnosis', ai._today(), username)
    return ok(stats=stats, ai=ai.status(username), diagnosis=today['data'] if today else None,
              diagnosis_at=today['at'] if today else None)


class DiagnoseBody(BaseModel):
    refresh: bool = False


@router.post('/api/amc/insights/ai')
def diagnose(body: DiagnoseBody, username: str = Depends(current_username)):
    """The AI coach's reading of the numbers, once a day unless refreshed."""
    if not body.refresh:
        today = ai.cached('diagnosis', ai._today(), username)
        if today:
            return ok(diagnosis=today['data'], at=today['at'], cached=True)
    attempts, hist, review_by_id = _context(username)
    plan = store.plan(username)
    stats = smart.analyze(attempts, hist, review_by_id, store.mocks(username), plan)
    try:
        found = ai.ask(username, DIAGNOSE_SYSTEM, smart.ai_brief(stats, plan), DIAGNOSE_SCHEMA,
                       instruction='Read these results and tell the student what to do this week.')
    except ai.AIUnavailable as exc:
        return fail(str(exc))
    diagnosis = _clean_diagnosis(found)
    ai.remember('diagnosis', ai._today(), username, diagnosis)
    return ok(diagnosis=diagnosis, at=ai._today(), cached=False, provider=ai.label())


# ---------------------------------------------------------------------------
# Hints and explanations
# ---------------------------------------------------------------------------
HINT_SYSTEM = """\
You give one hint for a contest problem without giving away the answer.
Level 1 is a gentle nudge: what to notice or which idea applies. Level 2 names
the method and the first concrete step. Level 3 walks to just before the end,
leaving the last computation to the student. Never state the final answer or
which choice is right.
""" + ai.VOICE

HINT_SCHEMA = {
    'type': 'object',
    'properties': {'hint': {'type': 'string'}},
    'required': ['hint'], 'additionalProperties': False,
}


def _problem_text(p):
    text = p['statement']
    if p.get('choices'):
        text += '\n\nChoices: ' + ' | '.join('({}) {}'.format('ABCDE'[i], c) for i, c in enumerate(p['choices']))
    return text


class HintBody(BaseModel):
    level: int = 1


@router.post('/api/amc/ai/hint/{problem_id}')
def hint(problem_id: str, body: HintBody, username: str = Depends(current_username)):
    p = pb.get(problem_id)
    if not p:
        return fail('No such problem.')
    level = max(1, min(3, body.level))
    key = ai.key_of(problem_id, level, p['statement'])
    have = ai.cached('hint', key)
    if have:
        return ok(hint=have['data']['hint'], level=level, cached=True)
    brief = _problem_text(p)
    if p.get('solution'):
        brief += '\n\nReference solution, for you only (do not reveal its answer):\n' + '\n'.join(p['solution'])
    if p.get('insight'):
        brief += '\nKey idea: ' + p['insight']
    try:
        found = ai.ask(username, HINT_SYSTEM, brief, HINT_SCHEMA,
                       instruction='Give a level {} hint.'.format(level), max_tokens=1200)
    except ai.AIUnavailable as exc:
        return fail(str(exc))
    text = ai.text(found.get('hint'), 1200)
    answer = str(p['answer'])
    if p.get('choices') is None and len(answer) > 1 and answer in text:
        text = 'Think about the key step before computing the final number.'   # never leak an AIME answer
    ai.remember('hint', key, '', {'hint': text})
    return ok(hint=text, level=level, cached=False)


EXPLAIN_SYSTEM = """\
A student answered a contest problem wrong. You see the problem, the right
answer, a reference solution and the student's answer. Work out the most likely
mistake that leads to their answer (a misread, a sign error, a missed case, the
trap), explain it in two to four sentences, and give one habit that would have
caught it. Then explain the right approach briefly.
""" + ai.VOICE

EXPLAIN_SCHEMA = {
    'type': 'object',
    'properties': {
        'likely_mistake': {'type': 'string'},
        'habit': {'type': 'string'},
        'right_approach': {'type': 'string'},
    },
    'required': ['likely_mistake', 'habit', 'right_approach'], 'additionalProperties': False,
}


@router.post('/api/amc/ai/explain/{problem_id}')
def explain(problem_id: str, username: str = Depends(current_username)):
    p = pb.get(problem_id)
    if not p:
        return fail('No such problem.')
    mine = [a for a in store.attempts(username) if a['problem_id'] == problem_id and a['source'] != 'reveal']
    wrong = [a for a in mine if not a['correct'] and str(a['answer']).strip()]
    if not wrong:
        return fail('Answer it first. This explains a wrong answer.')
    given = str(wrong[-1]['answer'])
    key = ai.key_of(problem_id, given)
    have = ai.cached('explain', key)
    if have:
        return ok(**have['data'], given=given, cached=True)
    brief = _problem_text(p) + '\n\nRight answer: {}\nStudent answered: {}'.format(p['answer'], given)
    if p.get('solution'):
        brief += '\n\nReference solution:\n' + '\n'.join(p['solution'])
    if p.get('trap'):
        brief += '\nCommon trap: ' + p['trap']
    try:
        found = ai.ask(username, EXPLAIN_SYSTEM, brief, EXPLAIN_SCHEMA,
                       instruction='Explain this student’s mistake.', max_tokens=1500)
    except ai.AIUnavailable as exc:
        return fail(str(exc))
    data = {'likely_mistake': ai.text(found.get('likely_mistake'), 1200), 'habit': ai.text(found.get('habit'), 500),
            'right_approach': ai.text(found.get('right_approach'), 1500)}
    ai.remember('explain', key, '', data)
    return ok(**data, given=given, cached=False)


# ---------------------------------------------------------------------------
# New problems
# ---------------------------------------------------------------------------
class CreateBody(BaseModel):
    like: str = ''
    level: str = ''
    topic: str = ''
    technique: str = ''
    rating: Optional[float] = None


@router.post('/api/amc/ai/create')
def make(body: CreateBody, username: str = Depends(current_username)):
    """One new problem: "more like this" (`like`), or a level/topic/rating.
    With neither, it targets the student's weakest high-value topic just above
    their level."""
    like = pb.get(body.like) if body.like else None
    if body.like and not like:
        return fail('No such problem.')
    if like:
        level, topic, technique, rating = like['level'], like['topic'], like['technique'], like['rating']
        if technique == 'official':
            technique = ''
    else:
        level, topic, technique, rating = body.level, body.topic, body.technique, body.rating
        if not topic or rating is None or not level:
            attempts, hist, review_by_id = _context(username)
            stats = smart.analyze(attempts, hist, review_by_id, store.mocks(username), store.plan(username))
            level = level or stats['level']
            topic = topic or (stats['focus'][0]['id'] if stats['focus'] else 'basic-counting')
            rating = rating if rating is not None else stats['theta'] + 0.5
    try:
        pid = create.create(username, level, topic, technique, rating, like)
    except ai.AIUnavailable as exc:
        return fail(str(exc))
    return ok(id=pid, problem=engine.public(pb.get(pid)))


@router.get('/api/amc/ai/problems')
def made(username: str = Depends(current_username)):
    """The AI-written problems, newest first."""
    rows = sorted(create.all_problems(), key=lambda p: p['created_at'], reverse=True)
    return ok(problems=[{'id': p['id'], 'level': p['level'], 'topic': p['topic'],
                         'topic_name': catalog.TOPIC_BY_ID[p['topic']]['name'], 'rating': p['rating'],
                         'preview': engine.plain(p['statement'])[:140], 'created_at': p['created_at']}
                        for p in rows[:100]])
