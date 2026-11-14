r"""Smart analytics: a model of the student, not just counts.

## Ability on the problems' own scale

Every problem carries a 1-10 rating (backend/amc/scale.py). We model the
chance of solving a problem of rating r at the first try as

    P(r) = 1 / (1 + exp(SLOPE * (r - theta)))

so `theta` is the rating the student solves half the time, on the same scale
as the problems. It is fitted by maximum a posteriori from first attempts only
(a second try after seeing a solution says nothing about contest day), with a
normal prior so that three answers cannot claim a 6.

Each topic and each technique gets its own theta with the overall one as its
prior, so a topic with two answers sits near the student's overall level and
moves away only as evidence comes in.

## What follows from it

* **Predicted scores** for each contest, using the real paper's ratings by
  problem number and the best answer-or-skip strategy (answer when the chance
  beats the 1.5 points of a blank), with a range from theta's uncertainty and
  the chance of reaching the AIME cutoff, by simulation.
* **The reachable part of a paper**: up to which number the student is more
  likely right than wrong.
* **Patterns**: careless misses (wrong on problems well below their level),
  time sinks, rushed answers, solutions revealed before trying.
* **Trend**: theta refitted at the end of each of the last six weeks.
* **What to do next**: the topics worth the most points, and specific unsolved
  problems a little above their level in those topics.

Nothing here needs a model key; backend/amc/coach.py and the AI diagnosis in
backend/api/amc_ai.py read this and write prose on top of it.
"""
import math
import random
from datetime import date, timedelta

from backend.amc import catalog, engine
from backend.amc import problems as pb
from backend.amc.scale import RATING_BY_NUMBER

SLOPE = 1.6
PRIOR_MEAN = 2.0
PRIOR_SD = 1.5
TOPIC_SD = 0.8
CUTOFFS = {'AMC 10': 100, 'AMC 12': 85}
PACE = {'AMC 10': 180, 'AMC 12': 180, 'AIME': 720}


def chance(theta, rating):
    return 1 / (1 + math.exp(SLOPE * (rating - theta)))


def fit(points, mean=PRIOR_MEAN, sd=PRIOR_SD):
    """MAP theta and its standard error from [(rating, correct)]."""
    theta = mean
    for _ in range(40):
        grad = -(theta - mean) / sd ** 2
        info = 1 / sd ** 2
        for rating, right in points:
            p = chance(theta, rating)
            grad += SLOPE * ((1 if right else 0) - p)
            info += SLOPE ** 2 * p * (1 - p)
        step = grad / info
        theta += max(-1.0, min(1.0, step))
        if abs(step) < 1e-6:
            break
    return round(theta, 2), round(1 / math.sqrt(info), 2)


def _first_points(hist, keep=None):
    out = []
    for pid, h in hist.items():
        p = pb.get(pid)
        if p and (keep is None or keep(p)):
            out.append((p['rating'], h['first_correct'], p))
    return out


def _expected(theta, level):
    """Expected score with the best answer-or-skip choice on each problem."""
    table = RATING_BY_NUMBER[level]
    if level == 'AIME':
        return sum(chance(theta, r) for r in table)
    return sum(max(6 * chance(theta, r), 1.5) for r in table)


def _simulate(theta, se, level, target, runs=2000, seed=7):
    """(low, high) 80% range and P(score >= target), by simulation."""
    rng = random.Random(seed)
    table = RATING_BY_NUMBER[level]
    scores = []
    for _ in range(runs):
        t = rng.gauss(theta, se)
        total = 0.0
        for r in table:
            p = chance(t, r)
            if level == 'AIME':
                total += 1 if rng.random() < p else 0
            elif 6 * p > 1.5:
                total += 6 if rng.random() < p else 0
            else:
                total += 1.5
        scores.append(total)
    scores.sort()
    hit = sum(1 for s in scores if s >= target) / runs if target is not None else None
    return scores[int(runs * 0.1)], scores[int(runs * 0.9)], hit


def _reach(theta, level):
    """The last problem number solved more often than not."""
    last = 0
    for n, r in enumerate(RATING_BY_NUMBER[level], start=1):
        if chance(theta, r) >= 0.5:
            last = n
    return last


def _trend(attempts, today, weeks=6):
    out = []
    for back in range(weeks - 1, -1, -1):
        end = (today - timedelta(days=7 * back)).isoformat()
        firsts = {}
        for a in attempts:
            if a['at'][:10] <= end and a['source'] != 'reveal' and a['problem_id'] not in firsts:
                firsts[a['problem_id']] = bool(a['correct'])
        pts = [(pb.get(pid)['rating'], ok) for pid, ok in firsts.items() if pb.get(pid)]
        out.append({'week_end': end, 'answered': len(pts), 'theta': fit(pts)[0] if pts else None})
    return out


def _patterns(attempts, hist, theta, level):
    pace = PACE.get(level, 180)
    first_rows = {}
    for a in attempts:
        if a['problem_id'] not in first_rows:
            first_rows[a['problem_id']] = a
    careless, slow, rushed = [], [], []
    for pid, a in first_rows.items():
        p = pb.get(pid)
        if not p or a['source'] == 'reveal':
            continue
        secs = int(a.get('seconds') or 0)
        pace_here = 720 if p['level'] == 'AIME' else 180
        if not a['correct'] and p['rating'] <= theta - 1:
            careless.append(pid)
        if secs > 2 * pace_here:
            slow.append(pid)
        if not a['correct'] and 0 < secs < 0.25 * pace_here:
            rushed.append(pid)
    reveals = [pid for pid, a in first_rows.items() if a['source'] == 'reveal']

    def brief(ids):
        return [{'id': pid, 'short': catalog.short_label(pid), 'topic': pb.get(pid)['topic'],
                 'rating': pb.get(pid)['rating']} for pid in ids[:8]]
    out = []
    if careless:
        out.append({'kind': 'careless', 'count': len(careless), 'problems': brief(careless),
                    'text': '{} first-try miss{} on problems rated at least a point below your level. '
                            'These are points you already know how to get.'.format(len(careless), '' if len(careless) == 1 else 'es')})
    if slow:
        out.append({'kind': 'slow', 'count': len(slow), 'problems': brief(slow),
                    'text': '{} problem{} took more than twice contest pace ({} min each).'.format(
                        len(slow), '' if len(slow) == 1 else 's', pace // 60)})
    if rushed:
        out.append({'kind': 'rushed', 'count': len(rushed), 'problems': brief(rushed),
                    'text': '{} wrong answer{} came in under a quarter of contest pace. Slow down and check.'.format(
                        len(rushed), '' if len(rushed) == 1 else 's')})
    if reveals:
        out.append({'kind': 'revealed', 'count': len(reveals), 'problems': brief(reveals),
                    'text': '{} solution{} opened before trying. Try for five minutes first.'.format(
                        len(reveals), '' if len(reveals) == 1 else 's')})
    return out


def _mock_summary(mocks):
    graded = [m for m in mocks if m['kind'] == 'mock']
    if not graded:
        return None
    by_fifth = [[0, 0] for _ in range(5)]
    blanks = 0
    asked = 0
    for m in graded:
        ids = (m.get('answers') or {}).get('_ids') or []
        for n, pid in enumerate(ids, start=1):
            given = (m['answers'] or {}).get(str(n), '')
            p = pb.get(pid)
            if not p:
                continue
            asked += 1
            fifth = min(4, (n - 1) * 5 // len(ids))
            by_fifth[fifth][1] += 1
            if given == '':
                blanks += 1
            elif engine.normalize_answer(p, given) == str(p['answer']):
                by_fifth[fifth][0] += 1
    return {
        'taken': len(graded),
        'scores': [{'contest': m['contest_id'], 'score': m['score'], 'at': m['at'][:10]} for m in reversed(graded[:8])],
        'blank_rate': round(blanks / asked, 3) if asked else None,
        'by_fifth': [round(r / n, 3) if n else None for r, n in by_fifth],
    }


def analyze(attempts, hist, review_by_id, mocks, plan, today=None):
    """Everything the Insights page and the AI diagnosis read."""
    today = today or date.today()
    level = plan['target'] if plan else 'AMC 10'
    goal = plan['goal_score'] if plan else engine.DEFAULT_GOALS[level]
    points = _first_points(hist)
    theta, se = fit([(r, ok) for r, ok, _ in points])
    n = len(points)

    contests = {}
    for lvl in ('AMC 10', 'AMC 12', 'AIME'):
        target = goal if lvl == level else CUTOFFS.get(lvl, 7 if lvl == 'AIME' else None)
        low, high, hit = _simulate(theta, se, lvl, target)
        contests[lvl] = {
            'expected': round(_expected(theta, lvl), 1), 'low': round(low, 1), 'high': round(high, 1),
            'target': target, 'chance': round(hit, 3) if hit is not None else None,
            'reach': _reach(theta, lvl), 'count': len(RATING_BY_NUMBER[lvl]),
        }

    # Per topic and per technique, shrunk toward the overall theta.
    by_topic, by_tech = {}, {}
    for rating, ok, p in points:
        for tid in [p['topic']] + p['also']:
            by_topic.setdefault(tid, []).append((rating, ok))
        by_tech.setdefault(p['technique'], []).append((rating, ok))
    topics = []
    for t in catalog.TOPICS:
        pts = by_topic.get(t['id'], [])
        th, tse = fit(pts, mean=theta, sd=TOPIC_SD) if pts else (None, None)
        relevant = level in t['levels']
        topics.append({'id': t['id'], 'name': t['name'], 'category': t['category'], 'weight': t['weight'],
                       'answered': len(pts), 'right': sum(1 for _, ok in pts if ok),
                       'theta': th, 'se': tse, 'relevant': relevant,
                       # Points at stake: weight times how far below the student's level it sits,
                       # untested topics counted as slightly below.
                       'priority': round(t['weight'] * ((theta - th + 0.75) if th is not None else 1.0), 2)
                       if relevant else 0})
    techniques = []
    for tid, pts in by_tech.items():
        if tid == 'official' or len(pts) < 2:
            continue
        th, tse = fit(pts, mean=theta, sd=TOPIC_SD)
        if th < theta:              # only the ones holding the student back
            techniques.append({'id': tid, 'name': catalog.technique_name(tid), 'answered': len(pts), 'theta': th})
    techniques.sort(key=lambda r: r['theta'])

    focus = sorted([t for t in topics if t['relevant']], key=lambda t: -t['priority'])[:5]
    strong = sorted([t for t in topics if t['theta'] is not None and t['answered'] >= 2 and t['theta'] >= theta],
                    key=lambda t: -t['theta'])[:4]

    # Next problems: unsolved, in the focus topics, a little above the student's level.
    focus_ids = {t['id'] for t in focus}
    candidates = []
    for p in pb.all_problems():
        if p['level'] != level and not (level == 'AMC 12' and p['level'] == 'AMC 10'):
            continue
        h = hist.get(p['id'])
        if h and h['solved']:
            continue
        in_focus = p['topic'] in focus_ids or any(t in focus_ids for t in p['also'])
        if not in_focus:
            continue
        gap = abs(p['rating'] - (theta + 0.5))
        candidates.append((gap, catalog.short_label(p['id']), p))
    candidates.sort(key=lambda c: (c[0], c[1]))
    next_problems = [{'id': p['id'], 'short': short, 'topic': p['topic'],
                      'topic_name': catalog.TOPIC_BY_ID[p['topic']]['name'], 'rating': p['rating'],
                      'chance': round(chance(theta, p['rating']), 2)} for _, short, p in candidates[:8]]

    due = sum(1 for r in review_by_id.values() if r['status'] == 'active' and r['due'] <= today.isoformat())
    return {
        'level': level, 'goal': goal, 'answered': n,
        'confident': n >= 15,
        'theta': theta, 'se': se,
        'band': '{:g}–{:g}'.format(max(1, round((theta - se) * 2) / 2), round((theta + se) * 2) / 2),
        'contests': contests,
        'topics': [t for t in topics if t['answered'] or t['relevant']],
        'techniques': techniques[:12],
        'focus': focus, 'strong': strong,
        'patterns': _patterns(attempts, hist, theta, level),
        'trend': _trend(attempts, today),
        'mocks': _mock_summary(mocks),
        'next_problems': next_problems,
        'review_due': due,
    }


def ai_brief(stats, plan):
    """The compact, factual brief the AI diagnosis is written from."""
    c = stats['contests'][stats['level']]
    lines = [
        'Contest: {}. Goal: {}.'.format(stats['level'], stats['goal']),
        'First-try answers so far: {}.'.format(stats['answered']),
        'Ability estimate (rating solved half the time, 1-10 AoPS scale): {} ± {}.'.format(stats['theta'], stats['se']),
        'Predicted score: {} (80% range {}-{}); chance of reaching {}: {}%. More likely right than wrong up to #{} of {}.'.format(
            c['expected'], c['low'], c['high'], c['target'], round(100 * (c['chance'] or 0)), c['reach'], c['count']),
        'Weekly ability trend (oldest first): {}.'.format(', '.join(str(w['theta']) for w in stats['trend'] if w['theta'] is not None) or 'none yet'),
        'Weakest high-value topics (id, name, ability, answered): {}.'.format(
            '; '.join('{} ({}, {}, {})'.format(t['id'], t['name'], t['theta'] if t['theta'] is not None else 'untested', t['answered'])
                      for t in stats['focus'])),
        'Strongest topics: {}.'.format('; '.join('{} ({})'.format(t['name'], t['theta']) for t in stats['strong']) or 'none yet'),
        'Weakest techniques: {}.'.format('; '.join('{} ({})'.format(t['name'], t['theta']) for t in stats['techniques'][:4]) or 'none yet'),
        'Patterns: {}'.format(' '.join(p['text'] for p in stats['patterns']) or 'none flagged.'),
        'Reviews due: {}.'.format(stats['review_due']),
    ]
    if stats['mocks']:
        m = stats['mocks']
        lines.append('Mocks taken: {}; recent scores {}; blank rate {}; accuracy by fifth of the paper {}.'.format(
            m['taken'], [s['score'] for s in m['scores']], m['blank_rate'], m['by_fifth']))
    if plan:
        lines.append('Exam date: {}; hours per week: {}.'.format(plan.get('exam_date'), plan.get('hours')))
    lines.append('Valid topic ids: {}.'.format(', '.join(t['id'] for t in catalog.TOPICS if stats['level'] in t['levels'])))
    return '\n'.join(lines)
