"""The AMC prep API: dashboard, problems, review, topics, contests, study plan
and search. One router, because every page reads the same history.

Content (problems, topics, contests) is in backend/amc/bank.py and
catalog.py; the rules are in backend/amc/engine.py; the account's rows are in
backend/amc/store.py. Every endpoint answers for the signed-in account only.
"""
from datetime import date, timedelta
from typing import Dict, Optional, Union

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.amc import catalog, coach, engine, store
from backend.amc import official
from backend.amc import problems as pb
from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.tracking import planner

router = APIRouter(tags=['amc'])


def _today():
    return date.today()


def _context(user):
    """The account's history, read once per request."""
    attempts = store.attempts(user)
    reviews = store.reviews(user)
    hist = engine.history(attempts)
    review_by_id = {r['problem_id']: r for r in reviews}
    return attempts, reviews, hist, review_by_id


def _summary(_user, pid, hist, review_by_id):
    p = pb.get(pid)
    topic = catalog.TOPIC_BY_ID[p['topic']]
    sources = catalog.sources(pid)
    h = hist.get(pid)
    return {
        'id': pid, 'level': p['level'], 'topic': p['topic'], 'topic_name': topic['name'],
        'category': topic['category'], 'difficulty': p['difficulty'], 'rating': p.get('rating'),
        'technique_name': catalog.technique_name(p['technique']),
        'preview': engine.plain(p['statement'])[:160],
        'source': '{} #{}'.format(sources[0]['name'], sources[0]['number']) if sources else 'Drill',
        'short': catalog.short_label(pid),
        'technique': p['technique'],
        'official': bool(p.get('official')),
        'status': engine.status_of(pid, hist, review_by_id),
        'attempts': h['attempts'] if h else 0,
    }


def _pill(pid, hist, review_by_id):
    """The few fields a problem pill needs."""
    p = pb.get(pid)
    sources = catalog.sources(pid)
    return {'id': pid, 'short': catalog.short_label(pid), 'difficulty': p['difficulty'], 'rating': p.get('rating'),
            'status': engine.status_of(pid, hist, review_by_id),
            'title': '{} · {}'.format('{} #{}'.format(sources[0]['name'], sources[0]['number']) if sources else 'Drill',
                                      engine.plain(p['statement'])[:90])}


def _pill_order(p):
    """Easiest first, then bank before official, then by label."""
    return (p['difficulty'], p['short'].startswith("'"), p['short'])


def _review_view(row, hist, review_by_id, today):
    out = _summary(None, row['problem_id'], hist, review_by_id)
    out.update(stage=int(row['stage']), due=row['due'], review_status=row['status'],
               note=row.get('note') or '', misses=int(row.get('misses') or 0),
               overdue=row['due'] < today.isoformat(), is_due=row['due'] <= today.isoformat())
    return out


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@router.get('/api/amc/dashboard')
def dashboard(username: str = Depends(current_username)):
    today = _today()
    attempts, reviews, hist, review_by_id = _context(username)
    plan = store.plan(username)
    target = plan['target'] if plan else 'AMC 10'
    tstats = engine.topic_stats(hist, review_by_id)
    due = [r for r in reviews if r['status'] == 'active' and r['due'] <= today.isoformat()]
    first = [h for h in hist.values()]
    mocks = store.mocks(username)

    plan_view = None
    if plan:
        weeks = engine.plan_weeks(plan, tstats, [m for m in mocks if m['kind'] == 'mock'], today)
        practiced = {a['problem_id'] for a in attempts if a['at'][:10] == today.isoformat()
                     and a['source'] == 'practice'}
        items = engine.today_items(plan, weeks, len(due), today, plan['checks'], practiced)
        week = next((w for w in weeks if w['current']), None)
        plan_view = {'target': plan['target'], 'exam_date': plan['exam_date'], 'goal_score': plan['goal_score'],
                     'days_left': (date.fromisoformat(plan['exam_date']) - today).days,
                     'week': week, 'today': items}

    # The next problem: the easiest unseen one in the weakest relevant topic.
    relevant = [t for t in catalog.TOPICS if target in t['levels']]
    weakest = sorted(relevant, key=lambda t: (tstats[t['id']]['mastery'], -t['weight']))
    next_problem = None
    for t in weakest:
        pool = sorted((p for p in pb.all_problems() if p['topic'] == t['id'] and p['id'] not in hist),
                      key=lambda p: p['difficulty'])
        if pool:
            next_problem = _summary(username, pool[0]['id'], hist, review_by_id)
            break

    recent = []
    for row in reversed(attempts[-8:]):
        if pb.get(row['problem_id']):
            item = _summary(username, row['problem_id'], hist, review_by_id)
            item.update(correct=bool(row['correct']), at=row['at'], via=row['source'])
            recent.append(item)

    # No number until there is something to base it on: with no answers the
    # projection is only the prior, and a score on the dashboard reads as a fact.
    enough = len(hist) >= engine.PROJECTION_MIN
    projection = {lvl: engine.projected(hist, lvl) if enough else None
                  for lvl in ('AMC 10', 'AMC 12', 'AIME')}
    return ok(
        stats={
            'solved': sum(1 for h in first if h['solved']),
            'attempted': len(first),
            'total': len(pb.all_problems()),
            'accuracy': round(sum(1 for h in first if h['first_correct']) / len(first), 3) if first else None,
            'streak': engine.streak(attempts, today),
            'due': len(due),
            'in_review': sum(1 for r in reviews if r['status'] == 'active'),
            'mastered': sum(1 for r in reviews if r['status'] == 'mastered'),
            'minutes': round(sum(int(a.get('seconds') or 0) for a in attempts) / 60),
            'mocks': sum(1 for m in mocks if m['kind'] == 'mock'),
        },
        target=target,
        goal=plan['goal_score'] if plan else engine.DEFAULT_GOALS[target],
        projected=projection,
        projection_min=engine.PROJECTION_MIN,
        categories=engine.category_stats(tstats),
        weakest=[{'id': t['id'], 'name': t['name'], 'mastery': tstats[t['id']]['mastery'],
                  'accuracy': tstats[t['id']]['accuracy']} for t in weakest[:4]],
        next_problem=next_problem,
        recent=recent,
        plan=plan_view,
        last_mock=_mock_brief(mocks[0]) if mocks else None,
    )


def _mock_brief(row):
    c = catalog.contest(row['contest_id']) or {'name': row['contest_id'], 'level': ''}
    return {'id': row['id'], 'contest_id': row['contest_id'], 'name': c['name'], 'level': c.get('level', ''),
            'kind': row['kind'], 'score': row['score'], 'correct': row['correct'], 'wrong': row['wrong'],
            'blank': row['blank'], 'seconds': row['seconds'], 'note': row.get('note') or '', 'at': row['at'],
            'max': c.get('max')}


# ---------------------------------------------------------------------------
# Problems
# ---------------------------------------------------------------------------
@router.get('/api/amc/problems')
def list_problems(level: str = '', category: str = '', topic: str = '', difficulty: str = '',
                  status: str = '', technique: str = '', q: str = '', sort: str = 'source',
                  source: str = '', username: str = Depends(current_username)):
    _, _, hist, review_by_id = _context(username)
    wanted_diff = {int(d) for d in difficulty.split(',') if d.strip().isdigit()}
    toks = engine._tokens(q)
    rows = []
    for p in pb.all_problems():
        if source == 'official' and not p.get('official'):
            continue
        if source == 'step' and p.get('official'):
            continue
        tops = [p['topic']] + p['also']
        if level and p['level'] != level:
            continue
        if topic and topic not in tops:
            continue
        if category and catalog.TOPIC_BY_ID[p['topic']]['category'] != category:
            continue
        if wanted_diff and p['difficulty'] not in wanted_diff:
            continue
        if technique and p['technique'] != technique:
            continue
        summary = _summary(username, p['id'], hist, review_by_id)
        if status and summary['status'] != status:
            continue
        if toks and not engine._score(toks, ' '.join([p['id'], engine.plain(p['statement']),
                                                      summary['topic_name'], summary['technique_name']])):
            continue
        rows.append(summary)
    if sort == 'difficulty':
        rows.sort(key=lambda r: (r['difficulty'], r['id']))
    elif sort == 'topic':
        rows.sort(key=lambda r: (r['topic_name'], r['difficulty']))
    counts = {s: 0 for s in ('new', 'solved', 'missed', 'review')}
    for p in pb.all_problems():
        counts[engine.status_of(p['id'], hist, review_by_id)] += 1
    return ok(problems=rows, total=len(pb.all_problems()), counts=counts,
              official=sum(1 for p in pb.all_problems() if p.get('official')),
              topics=[{'id': t['id'], 'name': t['name'], 'category': t['category']} for t in catalog.TOPICS],
              categories=catalog.CATEGORIES,
              techniques=[{'id': t, 'name': catalog.technique_name(t)} for t in catalog.TECHNIQUES])


@router.get('/api/amc/problems/{problem_id}')
def get_problem(problem_id: str, username: str = Depends(current_username)):
    p = pb.get(problem_id)
    if not p:
        return fail('No such problem.')
    attempts, _, hist, review_by_id = _context(username)
    mine = sorted((a for a in attempts if a['problem_id'] == problem_id), key=lambda a: a['at'])
    revealed = bool(mine)
    rev = review_by_id.get(problem_id)
    related = [_summary(username, q['id'], hist, review_by_id) for q in pb.all_problems()
               if q['id'] != problem_id and (q['topic'] == p['topic'] or p['topic'] in q['also'])][:5]
    # Previous and next stay inside the same set: an official problem steps
    # through its own contest, a bank problem through the bank.
    if p.get('official'):
        family = [q for q in pb.all_problems() if q.get('contest') == p['contest']]
    else:
        family = [q for q in pb.all_problems() if not q.get('official')]
    order = [q['id'] for q in family]
    i = order.index(problem_id)
    return ok(problem=engine.public(p, reveal=revealed),
              status=engine.status_of(problem_id, hist, review_by_id),
              attempts=[{'answer': a['answer'], 'correct': bool(a['correct']), 'at': a['at'],
                         'source': a['source'], 'seconds': a['seconds']} for a in mine],
              review=_review_view(rev, hist, review_by_id, _today()) if rev else None,
              related=related,
              prev=order[i - 1] if i > 0 else None,
              next=order[i + 1] if i + 1 < len(order) else None)


class AttemptBody(BaseModel):
    answer: Union[str, int, None] = ''
    seconds: Optional[int] = 0
    source: Optional[str] = 'practice'


@router.post('/api/amc/problems/{problem_id}/attempt')
def attempt(problem_id: str, body: AttemptBody, username: str = Depends(current_username)):
    p = pb.get(problem_id)
    if not p:
        return fail('No such problem.')
    given = engine.normalize_answer(p, body.answer)
    if not given:
        return fail('Pick an answer first.' if p['choices'] else 'Enter an integer from 0 to 999.')
    source = body.source if body.source in ('practice', 'review') else 'practice'
    correct = given == str(p['answer'])
    today = _today()
    statements = [store.attempt_rows(username, problem_id, given, correct, body.seconds, source)]
    existing = store.review(username, problem_id)
    new_review = engine.after_answer(existing, problem_id, correct, today)
    if new_review:
        statements += store.review_upsert(username, new_review)
    store.write(statements)
    rev = store.review(username, problem_id)
    return ok(correct=correct, given=given, problem=engine.public(p, reveal=True),
              review={'stage': int(rev['stage']), 'due': rev['due'], 'status': rev['status']} if rev else None,
              moved=bool(new_review))


@router.post('/api/amc/problems/{problem_id}/reveal')
def reveal(problem_id: str, username: str = Depends(current_username)):
    """Show the solution without answering. Counts as a miss, so it comes
    back for review like any other."""
    p = pb.get(problem_id)
    if not p:
        return fail('No such problem.')
    existing = store.review(username, problem_id)
    statements = [store.attempt_rows(username, problem_id, '', False, 0, 'reveal')]
    statements += store.review_upsert(username, engine.after_answer(existing, problem_id, False, _today()))
    store.write(statements)
    return ok(problem=engine.public(p, reveal=True))


# ---------------------------------------------------------------------------
# Review
# ---------------------------------------------------------------------------
@router.get('/api/amc/review')
def review_queue(username: str = Depends(current_username)):
    today = _today()
    _, reviews, hist, review_by_id = _context(username)
    views = [_review_view(r, hist, review_by_id, today) for r in reviews if pb.get(r['problem_id'])]
    due = sorted([v for v in views if v['review_status'] == 'active' and v['is_due']], key=lambda v: v['due'])
    upcoming = sorted([v for v in views if v['review_status'] == 'active' and not v['is_due']], key=lambda v: v['due'])
    mastered = sorted([v for v in views if v['review_status'] == 'mastered'], key=lambda v: v['id'])
    # How many come due on each of the next 14 days.
    forecast = []
    for k in range(14):
        day = (today + timedelta(days=k)).isoformat()
        forecast.append({'date': day, 'count': sum(1 for v in upcoming + due
                                                   if (v['due'] == day) or (k == 0 and v['due'] < day))})
    by_topic = {}
    for v in due + upcoming:
        by_topic[v['topic_name']] = by_topic.get(v['topic_name'], 0) + 1
    return ok(due=due, upcoming=upcoming, mastered=mastered, forecast=forecast,
              by_topic=sorted(({'name': k, 'count': n} for k, n in by_topic.items()), key=lambda r: -r['count']),
              intervals=engine.INTERVALS)


@router.post('/api/amc/review/{problem_id}')
def add_review(problem_id: str, username: str = Depends(current_username)):
    if not pb.get(problem_id):
        return fail('No such problem.')
    row = engine.after_answer(store.review(username, problem_id), problem_id, False, _today(), manual=True)
    if row:
        store.write(store.review_upsert(username, row))
    return ok()


@router.delete('/api/amc/review/{problem_id}')
def remove_review(problem_id: str, username: str = Depends(current_username)):
    store.review_delete(username, problem_id)
    return ok()


class NoteBody(BaseModel):
    note: str = ''


@router.post('/api/amc/review/{problem_id}/note')
def note_review(problem_id: str, body: NoteBody, username: str = Depends(current_username)):
    if not store.review(username, problem_id):
        return fail('That problem is not in your review log.')
    store.review_note(username, problem_id, body.note.strip()[:1000])
    return ok()


# ---------------------------------------------------------------------------
# Topics
# ---------------------------------------------------------------------------
@router.get('/api/amc/topics')
def topics(username: str = Depends(current_username)):
    _, _, hist, review_by_id = _context(username)
    tstats = engine.topic_stats(hist, review_by_id)
    everything = pb.all_problems()
    pills = {t['id']: [] for t in catalog.TOPICS}
    for p in everything:
        for tid in [p['topic']] + p['also']:
            pills[tid].append(_pill(p['id'], hist, review_by_id))
    cats = []
    for cat in engine.category_stats(tstats):
        cats.append({**cat, 'topics': [{**t, **tstats[t['id']],
                                        'pills': sorted(pills[t['id']], key=_pill_order)}
                                       for t in catalog.TOPICS if t['category'] == cat['id']]})
    return ok(categories=cats)


@router.get('/api/amc/strategies')
def strategies(username: str = Depends(current_username)):
    """The problems grouped by the technique that solves them, in families."""
    _, _, hist, review_by_id = _context(username)
    by_technique = {}
    untagged = []
    for p in pb.all_problems():
        if p['technique'] in catalog.TECHNIQUE_FAMILY:
            by_technique.setdefault(p['technique'], []).append(p)
        else:
            untagged.append(p['id'])
    families = []
    for fam in catalog.STRATEGY_FAMILIES:
        techniques = []
        for tid, idea in fam['techniques']:
            probs = by_technique.get(tid, [])
            pill_rows = sorted((_pill(p['id'], hist, review_by_id) for p in probs), key=_pill_order)
            topics = sorted({p['topic'] for p in probs})
            techniques.append({
                'id': tid, 'name': catalog.technique_name(tid), 'idea': idea,
                'pills': pill_rows,
                'solved': sum(1 for x in pill_rows if x['status'] == 'solved'),
                'topics': [{'id': t, 'name': catalog.TOPIC_BY_ID[t]['name']} for t in topics],
            })
        families.append({'id': fam['id'], 'name': fam['name'], 'color': fam['color'], 'blurb': fam['blurb'],
                         'techniques': techniques,
                         'problems': sum(len(t['pills']) for t in techniques),
                         'solved': sum(t['solved'] for t in techniques)})
    return ok(families=families, untagged=len(untagged))


@router.get('/api/amc/topics/{topic_id}')
def topic(topic_id: str, username: str = Depends(current_username)):
    t = catalog.TOPIC_BY_ID.get(topic_id)
    if not t:
        return fail('No such topic.')
    _, _, hist, review_by_id = _context(username)
    tstats = engine.topic_stats(hist, review_by_id)
    problems = [_summary(username, p['id'], hist, review_by_id) for p in pb.all_problems()
                if p['topic'] == topic_id or topic_id in p['also']]
    problems.sort(key=lambda r: (r['difficulty'], r['id']))
    siblings = [{'id': s['id'], 'name': s['name']} for s in catalog.TOPICS
                if s['category'] == t['category'] and s['id'] != topic_id]
    techniques = {}
    for p in pb.all_problems():
        if p['topic'] == topic_id or topic_id in p['also']:
            techniques[p['technique']] = techniques.get(p['technique'], 0) + 1
    groups = {}
    for row in problems:
        key = row['technique']
        groups.setdefault(key, []).append(_pill(row['id'], hist, review_by_id))
    family_order = {tid: i for i, (tid, _) in enumerate(
        (pair for f in catalog.STRATEGY_FAMILIES for pair in f['techniques']))}
    by_strategy = [{'id': k, 'name': 'Official problems' if k == 'official' else catalog.technique_name(k),
                    'idea': catalog.TECHNIQUE_IDEA.get(k, 'Imported contest problems, not yet tagged by strategy.'),
                    'pills': sorted(v, key=_pill_order)}
                   for k, v in sorted(groups.items(), key=lambda kv: family_order.get(kv[0], 999))]
    return ok(by_strategy=by_strategy,
              topic={**t, **tstats[topic_id],
                     'category_name': catalog.CATEGORY_BY_ID[t['category']]['name']},
              problems=problems, siblings=siblings,
              techniques=[{'id': k, 'name': catalog.technique_name(k), 'count': n}
                          for k, n in sorted(techniques.items(), key=lambda kv: -kv[1])])


# ---------------------------------------------------------------------------
# Contests
# ---------------------------------------------------------------------------
def _gradable(contest_id):
    """A contest the site can time and grade: a Step Mock, or an official paper
    whose every problem and answer has been imported. None otherwise."""
    if contest_id in catalog.MOCK_BY_ID:
        return catalog.MOCK_BY_ID[contest_id]
    past = catalog.PAST_BY_ID.get(contest_id)
    if not past:
        return None
    ids = [official.problem_id(contest_id, n) for n in range(1, past['count'] + 1)]
    if not all(pb.get(pid) for pid in ids):
        return None
    return {'id': contest_id, 'name': past['name'], 'level': past['level'], 'problems': ids}


@router.get('/api/amc/contests')
def contests(username: str = Depends(current_username)):
    mocks = store.mocks(username)
    by_contest = {}
    for m in mocks:
        by_contest.setdefault(m['contest_id'], []).append(_mock_brief(m))
    mock_rows = []
    for m in catalog.MOCKS:
        mine = by_contest.get(m['id'], [])
        mock_rows.append({**{k: v for k, v in m.items() if k != 'problems'}, **catalog.FORMATS[m['level']],
                          'attempts': len(mine), 'best': max((x['score'] for x in mine), default=None)})
    imported = official.imported_contests()
    years = {}
    for c in catalog.PAST:
        mine = by_contest.get(c['id'], [])
        years.setdefault(c['year'], []).append({**c, 'logged': mine[0] if mine else None,
                                                'imported': imported.get(c['id'], 0)})
    return ok(mocks=mock_rows,
              years=[{'year': y, 'contests': rows} for y, rows in sorted(years.items(), reverse=True)],
              history=[_mock_brief(m) for m in mocks][:20],
              formats=catalog.FORMATS,
              imported=sum(1 for cid, n in imported.items()
                           if n == catalog.PAST_BY_ID[cid]['count']))


@router.get('/api/amc/contests/{contest_id}')
def contest(contest_id: str, username: str = Depends(current_username)):
    c = catalog.contest(contest_id)
    if not c:
        return fail('No such contest.')
    mine = [_mock_brief(m) for m in store.mocks(username) if m['contest_id'] == contest_id]
    gradable = _gradable(contest_id)
    if c['kind'] == 'past' and not gradable:
        return ok(contest={**c, 'imported': False}, problems=[], history=mine)
    _, _, hist, review_by_id = _context(username)
    problems = []
    for number, pid in enumerate(gradable['problems'], start=1):
        p = engine.public(pb.get(pid))
        problems.append({'number': number, **p, 'status': engine.status_of(pid, hist, review_by_id)})
    info = {k: v for k, v in c.items() if k != 'problems'}
    if c['kind'] == 'past':
        info['imported'] = True
    return ok(contest=info, problems=problems, history=mine)


class ImportBody(BaseModel):
    problems: str = ''
    key: str = ''
    save: bool = False


@router.post('/api/amc/contests/{contest_id}/import')
def import_contest(contest_id: str, body: ImportBody, username: str = Depends(current_username)):
    """Parse a pasted contest and its answer key. With `save`, store it.

    Without `save` this is a preview: what was found, and what is missing, so
    the page can show the reader the result before anything is written.
    """
    c = catalog.PAST_BY_ID.get(contest_id)
    if not c:
        return fail('No such contest.')
    if len(body.problems) > 400_000 or len(body.key) > 20_000:
        return fail('That is far longer than one contest.')
    level, count = c['level'], c['count']
    parsed = official.parse_contest(body.problems, level)
    key = official.parse_key(body.key, level)
    numbers = {p['number'] for p in parsed}
    problems_missing = [n for n in range(1, count + 1) if n not in numbers]
    no_choices = [p['number'] for p in parsed if level != 'AIME' and not p['choices']]
    empty = [p['number'] for p in parsed if not p['statement']]
    key_ok = len(key) == count
    preview = [{'number': p['number'], 'statement': p['statement'], 'choices': p['choices'],
                'diagram': bool(p['diagram']), 'topic': official.guess_topic(p['statement']),
                'answer': key[p['number'] - 1] if key_ok else None} for p in parsed]
    problems_text = ['Problems {} were not found.'.format(', '.join(map(str, problems_missing)))] if problems_missing else []
    issues = problems_text + (
        ['Problems {} have no answer choices.'.format(', '.join(map(str, no_choices)))] if no_choices else []) + (
        ['Problems {} have no text.'.format(', '.join(map(str, empty)))] if empty else []) + (
        [] if key_ok else ['The answer key has {} of {} answers.'.format(len(key), count)])
    if body.save:
        if problems_missing or empty or not key_ok:
            return fail(' '.join(issues) or 'Nothing to import.', issues=issues, preview=preview)
        official.save(contest_id, [p for p in parsed if 1 <= p['number'] <= count], key, username)
    return ok(preview=preview, issues=issues, saved=bool(body.save), count=count,
              diagrams=sum(1 for p in parsed if p['diagram']))


@router.delete('/api/amc/contests/{contest_id}/import')
def remove_import(contest_id: str, username: str = Depends(current_username)):
    if contest_id not in catalog.PAST_BY_ID:
        return fail('No such contest.')
    official.remove(contest_id)
    return ok()


class SubmitBody(BaseModel):
    answers: Dict[str, Union[str, int, None]] = {}
    seconds: Optional[int] = 0


@router.post('/api/amc/contests/{contest_id}/submit')
def submit(contest_id: str, body: SubmitBody, username: str = Depends(current_username)):
    mock = _gradable(contest_id)
    if not mock:
        return fail('Import this contest first, or log the score you got on it.')
    graded = engine.score_mock(mock, {k: ('' if v is None else str(v)) for k, v in body.answers.items()})
    today = _today()
    reviews = {r['problem_id']: r for r in store.reviews(username)}
    statements = []
    answers = {}
    for row in graded['rows']:
        answers[str(row['number'])] = row['given']
        correct = row['result'] == 'correct'
        if row['result'] != 'blank':
            statements.append(store.attempt_rows(username, row['problem_id'], row['given'], correct, 0, 'mock'))
        # A blank is still a problem you could not do: it goes to review
        # without counting as an attempt.
        new_review = engine.after_answer(reviews.get(row['problem_id']), row['problem_id'], correct, today)
        if new_review:
            statements += store.review_upsert(username, new_review)
            reviews[row['problem_id']] = new_review
    mock_id, insert = store.mock_row(username, contest_id, 'mock', answers, graded['score'], graded['correct'],
                                     graded['wrong'], graded['blank'], body.seconds)
    statements.append(insert)
    store.write(statements)
    return ok(id=mock_id)


@router.get('/api/amc/mocks/{mock_id}')
def mock_result(mock_id: str, username: str = Depends(current_username)):
    row = store.mock(username, mock_id)
    if not row or row['kind'] != 'mock':
        return fail('No such mock.')
    mock = _gradable(row['contest_id'])
    if not mock:
        return fail('That contest is no longer available.')
    graded = engine.score_mock(mock, row['answers'])
    report = engine.mock_report(mock, graded)
    problems = []
    for r in graded['rows']:
        p = pb.get(r['problem_id'])
        problems.append({**r, 'rating': p.get('rating'), 'statement': p['statement'], 'topic_name': catalog.TOPIC_BY_ID[p['topic']]['name'],
                         'solution': p['solution'], 'insight': p['insight'], 'trap': p['trap'],
                         'choices': p['choices'], 'diagram': p.get('diagram') or ''})
    others = [m for m in store.mocks(username) if m['contest_id'] == row['contest_id'] and m['kind'] == 'mock']
    return ok(result={**_mock_brief(row), **catalog.FORMATS[mock['level']]},
              contest={'id': mock['id'], 'name': mock['name'], 'level': mock['level'],
                       'official': mock['id'] in catalog.PAST_BY_ID},
              rows=problems, report=report,
              attempts=[_mock_brief(m) for m in others])


class LogBody(BaseModel):
    score: float
    note: Optional[str] = ''


@router.post('/api/amc/contests/{contest_id}/log')
def log_score(contest_id: str, body: LogBody, username: str = Depends(current_username)):
    c = catalog.PAST_BY_ID.get(contest_id)
    if not c:
        return fail('No such contest.')
    if body.score < 0 or body.score > c['max']:
        return fail('A {} score is between 0 and {}.'.format(c['level'], c['max']))
    if c['level'] != 'AIME' and (body.score * 2) != int(body.score * 2):
        return fail('AMC scores are multiples of 1.5 (6 per right answer, 1.5 per blank).')
    _, insert = store.mock_row(username, contest_id, 'logged', {}, body.score, 0, 0, 0, 0,
                               (body.note or '').strip()[:300])
    store.write([insert])
    return ok()


@router.delete('/api/amc/mocks/{mock_id}')
def delete_mock(mock_id: str, username: str = Depends(current_username)):
    store.mock_delete(username, mock_id)
    return ok()


# ---------------------------------------------------------------------------
# Study plan
# ---------------------------------------------------------------------------
def _plan_payload(username):
    plan = store.plan(username)
    if not plan:
        return ok(plan=None, defaults=_defaults(),
                  ai={'available': coach.available(), 'label': coach.provider_label()})
    today = _today()
    attempts, reviews, hist, review_by_id = _context(username)
    tstats = engine.topic_stats(hist, review_by_id)
    mocks = [m for m in store.mocks(username) if m['kind'] == 'mock']
    weeks = engine.plan_weeks(plan, tstats, mocks, today)
    due = sum(1 for r in reviews if r['status'] == 'active' and r['due'] <= today.isoformat())
    practiced = {a['problem_id'] for a in attempts
                 if a['at'][:10] == today.isoformat() and a['source'] == 'practice'}
    items = engine.today_items(plan, weeks, due, today, plan['checks'], practiced)
    relevant = [t for t in catalog.TOPICS if plan['target'] in t['levels']]
    return ok(plan={**plan, 'days_left': (date.fromisoformat(plan['exam_date']) - today).days},
              ai={'available': coach.available(), 'label': coach.provider_label()},
              weeks=weeks, today=items,
              projected=engine.projected(hist, plan['target']) if len(hist) >= engine.PROJECTION_MIN else None,
              coverage=[{'id': t['id'], 'name': t['name'], 'category': t['category'],
                         'mastery': tstats[t['id']]['mastery'], 'weight': t['weight']}
                        for t in sorted(relevant, key=lambda t: (t['category'], t['name']))],
              defaults=_defaults())


def _defaults():
    """Next November's AMC 10/12 and next February's AIME, as starting dates."""
    today = _today()
    amc = date(today.year, 11, 5)
    if amc <= today:
        amc = date(today.year + 1, 11, 5)
    aime = date(today.year, 2, 5)
    if aime <= today:
        aime = date(today.year + 1, 2, 5)
    return {'dates': {'AMC 10': amc.isoformat(), 'AMC 12': amc.isoformat(), 'AIME': aime.isoformat()},
            'goals': engine.DEFAULT_GOALS}


@router.get('/api/amc/plan')
def get_plan(username: str = Depends(current_username)):
    return _plan_payload(username)


class PlanBody(BaseModel):
    target: str
    exam_date: str
    goal_score: float
    hours: int
    #: What the student tells the coach. See `_details`.
    details: Optional[dict] = None


def _details(raw):
    """The intake answers, bounded: known keys only, lengths capped."""
    raw = raw or {}
    out = {}
    if raw.get('experience') in coach.EXPERIENCE:
        out['experience'] = raw['experience']
    try:
        if raw.get('last_score') not in (None, ''):
            out['last_score'] = max(0.0, min(150.0, float(raw['last_score'])))
    except (TypeError, ValueError):
        pass
    try:
        if raw.get('days_per_week') not in (None, ''):
            out['days_per_week'] = max(1, min(7, int(raw['days_per_week'])))
    except (TypeError, ValueError):
        pass
    for key in ('strong', 'weak'):
        ids = [t for t in (raw.get(key) or []) if isinstance(t, str) and t in catalog.TOPIC_BY_ID]
        if ids:
            out[key] = ids[:12]
    for key, limit in (('resources', 300), ('notes', 1000)):
        text = str(raw.get(key) or '').strip()
        if text:
            out[key] = text[:limit]
    return out


@router.put('/api/amc/plan')
def save_plan(body: PlanBody, username: str = Depends(current_username)):
    if body.target not in catalog.FORMATS:
        return fail('Pick AMC 10, AMC 12 or AIME.')
    try:
        exam = date.fromisoformat(body.exam_date)
    except ValueError:
        return fail('That date is not valid.')
    if exam <= _today():
        return fail('The exam date has to be in the future.')
    if exam > _today() + timedelta(days=730):
        return fail('Pick an exam within the next two years.')
    top = catalog.FORMATS[body.target]['max']
    if not 0 < body.goal_score <= top:
        return fail('A {} goal is between 0 and {}.'.format(body.target, top))
    hours = max(1, min(40, int(body.hours)))
    existing = store.plan(username)
    store.save_plan(username, body.target, exam.isoformat(), body.goal_score, hours,
                    existing['checks'] if existing else {},
                    _details(body.details) if body.details is not None else None)
    return _plan_payload(username)


class CoachBody(BaseModel):
    #: Answers to the coach's follow-up questions: {question: answer}.
    answers: Optional[Dict[str, str]] = None


@router.post('/api/amc/plan/coach')
def coach_plan(body: CoachBody, username: str = Depends(current_username)):
    """Have the configured AI model write (or refine) the study plan."""
    plan = store.plan(username)
    if not plan:
        return fail('Make a plan first.')
    today = _today()
    attempts, reviews, hist, review_by_id = _context(username)
    tstats = engine.topic_stats(hist, review_by_id)
    projected = engine.projected(hist, plan['target']) if len(hist) >= engine.PROJECTION_MIN else None
    mocks = [_mock_brief(m) for m in store.mocks(username)]
    counts = {'due': sum(1 for r in reviews if r['status'] == 'active' and r['due'] <= today.isoformat()),
              'active': sum(1 for r in reviews if r['status'] == 'active'),
              'mastered': sum(1 for r in reviews if r['status'] == 'mastered')}
    answers = {str(q)[:300]: str(a)[:600] for q, a in (body.answers or {}).items()}
    try:
        written = coach.write_plan(plan, plan['details'], tstats, projected, mocks, counts, answers, today)
    except planner.PlannerUnavailable as exc:
        return fail(str(exc))
    store.save_coach(username, written, coach.provider_label())
    return _plan_payload(username)


@router.delete('/api/amc/plan')
def clear_plan(username: str = Depends(current_username)):
    store.delete_plan(username)
    return ok()


class CheckBody(BaseModel):
    key: str
    done: bool


@router.post('/api/amc/plan/check')
def check(body: CheckBody, username: str = Depends(current_username)):
    plan = store.plan(username)
    if not plan:
        return fail('Make a plan first.')
    day = _today().isoformat()
    # Only the last two weeks of ticks are kept; older ones say nothing.
    cutoff = (_today() - timedelta(days=14)).isoformat()
    checks = {d: keys for d, keys in plan['checks'].items() if d >= cutoff}
    keys = set(checks.get(day, []))
    (keys.add if body.done else keys.discard)(body.key[:40])
    checks[day] = sorted(keys)
    store.save_plan(username, plan['target'], plan['exam_date'], plan['goal_score'], plan['hours'], checks)
    return _plan_payload(username)


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------
@router.get('/api/amc/search')
def search(q: str = '', limit: int = 20, username: str = Depends(current_username)):
    return ok(query=q, **engine.search(q, max(1, min(60, limit))))
