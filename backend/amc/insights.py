"""Reading an account's history: the dashboard's recent performance, and the
analytics page — how you are doing, what each contest tests, and how to get
from where you are to your goal.

Everything here is computed from the attempts and mocks the API already reads;
nothing is stored. The contest facts (GUIDE) are content, written for this
site, and kept beside the topic map in catalog.py.
"""
import math
from datetime import date, timedelta

from backend.amc import catalog, engine
from backend.amc import official
from backend.amc import problems as pb
from backend.amc.solutions import tier

#: The AoPS-scale buckets the analytics page groups answers by.
RATING_BUCKETS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5]
#: Seconds a problem may take at contest pace.
PACE = {'AMC 10': 180, 'AMC 12': 180, 'AIME': 720}


# ---------------------------------------------------------------------------
# Recent performance (the dashboard)
# ---------------------------------------------------------------------------
def _graded(attempts):
    """Answers that say something about ability: not 'show me the answer'."""
    return [a for a in attempts if a['source'] != 'reveal']


def _window(attempts, start, end):
    lo, hi = start.isoformat(), end.isoformat()
    inside = [a for a in attempts if lo <= a['at'][:10] <= hi]
    graded = _graded(inside)
    right = [a for a in graded if a['correct']]
    timed = [int(a.get('seconds') or 0) for a in graded if int(a.get('seconds') or 0) > 0]
    hardest = None
    for a in right:
        p = pb.get(a['problem_id'])
        if p and (hardest is None or p['rating'] > hardest['rating']):
            hardest = {'id': p['id'], 'rating': p['rating'], 'short': catalog.short_label(p['id'])}
    return {
        'answered': len(graded),
        'correct': len(right),
        'accuracy': round(len(right) / len(graded), 3) if graded else None,
        'revealed': len(inside) - len(graded),
        'minutes': round(sum(int(a.get('seconds') or 0) for a in inside) / 60),
        'avg_seconds': round(sum(timed) / len(timed)) if timed else None,
        'days': len({a['at'][:10] for a in inside}),
        'hardest': hardest,
    }


def _mock_point(row):
    c = catalog.contest(row['contest_id']) or {'name': row['contest_id'], 'level': '', 'max': None}
    return {'id': row['id'], 'contest_id': row['contest_id'], 'name': c['name'], 'level': c.get('level', ''),
            'kind': row['kind'], 'score': row['score'], 'max': c.get('max'), 'at': row['at']}


def recent_performance(attempts, mocks, today):
    """This week against last week, the last fortnight day by day, and the
    latest contest scores — what replaced the list of recent answers."""
    this_week = _window(attempts, today - timedelta(days=6), today)
    last_week = _window(attempts, today - timedelta(days=13), today - timedelta(days=7))
    days = []
    for back in range(13, -1, -1):
        day = today - timedelta(days=back)
        graded = _graded([a for a in attempts if a['at'][:10] == day.isoformat()])
        days.append({'date': day.isoformat(), 'answered': len(graded),
                     'correct': sum(1 for a in graded if a['correct'])})
    scored = [_mock_point(m) for m in mocks[:5]]

    notes = []
    a, b = this_week['accuracy'], last_week['accuracy']
    if a is not None and b is not None:
        delta = round((a - b) * 100)
        if delta >= 5:
            notes.append({'tone': 'up', 'text': 'Accuracy up {} points from last week.'.format(delta)})
        elif delta <= -5:
            notes.append({'tone': 'down', 'text': 'Accuracy down {} points from last week.'.format(-delta)})
        else:
            notes.append({'tone': 'flat', 'text': 'Accuracy about the same as last week.'})
    if this_week['answered'] and last_week['answered']:
        if this_week['answered'] >= last_week['answered'] * 1.25:
            notes.append({'tone': 'up', 'text': 'More problems than last week ({} vs {}).'.format(
                this_week['answered'], last_week['answered'])})
        elif this_week['answered'] * 1.25 <= last_week['answered']:
            notes.append({'tone': 'down', 'text': 'Fewer problems than last week ({} vs {}).'.format(
                this_week['answered'], last_week['answered'])})
    # Only like for like: two Step Mocks, or two logged official papers.
    same = [m for m in scored if scored and m['kind'] == scored[0]['kind']]
    if len(same) >= 2 and same[0]['level'] == same[1]['level'] and same[0]['level']:
        diff = same[0]['score'] - same[1]['score']
        if diff:
            notes.append({'tone': 'up' if diff > 0 else 'down',
                          'text': 'Last {} score {:+g} from the one before.'.format(same[0]['level'], diff)})
    if this_week['revealed'] >= 3 and this_week['revealed'] > this_week['answered'] / 3:
        notes.append({'tone': 'down', 'text': '{} answers revealed this week. Try an answer first.'.format(
            this_week['revealed'])})
    return {'this_week': this_week, 'last_week': last_week, 'days': days, 'mocks': scored, 'notes': notes}


# ---------------------------------------------------------------------------
# What appears on each contest
# ---------------------------------------------------------------------------
#: Written for this site from the contests' published formats and the AoPS
#: competition ratings. Shares are approximate for a typical recent paper.
GUIDE = {
    'AMC 10': {
        'who': 'For grade 10 and below.',
        'format': '25 multiple-choice problems in 75 minutes. 6 points for a right answer, 1.5 for a blank, 0 for '
                  'a wrong one. No calculator.',
        'qualify': 'Score 100 to qualify (fixed from 2026–27). It used to change each year, for example 103.5 on '
                   'the 2019 10A and 108 on the 10B.',
        'shares': {'algebra': 30, 'geometry': 25, 'counting': 20, 'number-theory': 20, 'misc': 5},
        'sections': [
            {'range': '1–10', 'rating': '1–1.5', 'minutes': 20,
             'what': 'Arithmetic, percents, rates, short word problems, easy counting and area. Go fast and '
                     'don’t make careless mistakes.'},
            {'range': '11–20', 'rating': '2–2.5', 'minutes': 35,
             'what': 'Casework, similar triangles, remainders, systems of equations, simple probability. Most '
                     'qualifying scores are won or lost here.'},
            {'range': '21–25', 'rating': '3–3.5', 'minutes': 20,
             'what': 'Harder counting and probability, number theory, geometry that needs an extra line. Try the '
                     'one or two that look familiar.'},
        ],
    },
    'AMC 12': {
        'who': 'For grade 12 and below.',
        'format': '25 multiple-choice problems in 75 minutes, scored like the AMC 10. The second half adds '
                  'precalculus.',
        'qualify': 'Score 85 to qualify (fixed from 2026–27). It used to change each year, for example 84 on the '
                   '2019 12A and 94.5 on the 12B.',
        'shares': {'algebra': 35, 'geometry': 25, 'counting': 18, 'number-theory': 17, 'misc': 5},
        'sections': [
            {'range': '1–10', 'rating': '1.5–2', 'minutes': 20,
             'what': 'Like the middle of the AMC 10: word problems, quick counting, ratios, coordinates.'},
            {'range': '11–20', 'rating': '2.5–3', 'minutes': 35,
             'what': 'Logs, trig, complex numbers and sequences on top of the usual topics. Know the identities '
                     'well.'},
            {'range': '21–25', 'rating': '3.5–4', 'minutes': 20,
             'what': 'Polynomial roots, roots of unity, 3D and trig geometry, hard counting. About as hard as the '
                     'early AIME.'},
        ],
    },
    'AIME': {
        'who': 'By invitation, from AMC 10 and AMC 12 scores.',
        'format': '15 problems in 3 hours. Every answer is a whole number from 0 to 999. One point each, and no '
                  'penalty for wrong answers, so always answer.',
        'qualify': 'USAJMO and USAMO use AMC score + 10 × AIME score. The cutoff changes every year.',
        'shares': {'geometry': 28, 'algebra': 25, 'counting': 25, 'number-theory': 22, 'misc': 0},
        'sections': [
            {'range': '1–5', 'rating': '2.5–3.5', 'minutes': 50,
             'what': 'Like the end of the AMC, with no answer choices: counting, digits, geometry.'},
            {'range': '6–10', 'rating': '4', 'minutes': 70,
             'what': 'Two or three steps each. Mods, recursion, coordinates or trig.'},
            {'range': '11–15', 'rating': '5–6', 'minutes': 60,
             'what': 'Very hard. Bijections, polynomials, complex numbers, hard geometry. Solving one is a good '
                     'result.'},
        ],
    },
}


def _imported_shares(level):
    """Category shares measured on the official papers this site has imported
    (topics guessed from the text), or None when there are none."""
    rows = [p for p in official.all_problems() if p['level'] == level]
    if not rows:
        return None
    counts = {c['id']: 0 for c in catalog.CATEGORIES}
    for p in rows:
        topic = catalog.TOPIC_BY_ID.get(p['topic'])
        if topic:
            counts[topic['category']] += 1
    total = sum(counts.values()) or 1
    return {'papers': len({p['contest'] for p in rows}), 'problems': len(rows),
            'shares': {k: round(100 * v / total) for k, v in counts.items()}}


def contest_guide(level):
    guide = GUIDE[level]
    return {
        'level': level, **catalog.FORMATS[level], **{k: guide[k] for k in ('who', 'format', 'qualify', 'sections')},
        'shares': [{'id': c['id'], 'name': c['name'], 'share': guide['shares'][c['id']]}
                   for c in catalog.CATEGORIES if guide['shares'][c['id']]],
        'measured': _imported_shares(level),
        'bands': [{'last': last, 'rating': rating} for last, rating in official.RATING_BANDS[level]],
        'key_topics': [{'id': t['id'], 'name': t['name'], 'category': t['category']}
                       for t in sorted(catalog.TOPICS, key=lambda t: -t['weight'])
                       if level in t['levels'] and t['weight'] >= 3],
    }


# ---------------------------------------------------------------------------
# Your performance
# ---------------------------------------------------------------------------
def _bucket(rating):
    for b in reversed(RATING_BUCKETS):
        if rating >= b:
            return b
    return RATING_BUCKETS[0]


def by_rating(attempts, hist):
    """First-try accuracy and time by AoPS rating bucket."""
    rows = {b: {'rating': b, 'attempted': 0, 'first_right': 0, 'seconds': []} for b in RATING_BUCKETS}
    first_seconds = {}
    for a in attempts:
        if a['source'] != 'reveal' and a['problem_id'] not in first_seconds:
            first_seconds[a['problem_id']] = int(a.get('seconds') or 0)
    for pid, h in hist.items():
        p = pb.get(pid)
        if not p:
            continue
        row = rows[_bucket(p['rating'])]
        row['attempted'] += 1
        row['first_right'] += 1 if h['first_correct'] else 0
        if first_seconds.get(pid):
            row['seconds'].append(first_seconds[pid])
    out = []
    for row in rows.values():
        secs = row.pop('seconds')
        row['accuracy'] = round(row['first_right'] / row['attempted'], 3) if row['attempted'] else None
        row['avg_seconds'] = round(sum(secs) / len(secs)) if secs else None
        out.append(row)
    return out


def weekly(attempts, today, weeks=8):
    """Answers and accuracy for each of the last `weeks` weeks (oldest first)."""
    out = []
    for back in range(weeks - 1, -1, -1):
        end = today - timedelta(days=7 * back)
        w = _window(attempts, end - timedelta(days=6), end)
        out.append({'start': (end - timedelta(days=6)).isoformat(), 'answered': w['answered'],
                    'correct': w['correct'], 'accuracy': w['accuracy']})
    return out


def recovery(attempts, hist):
    """Of the problems missed first time: how many were later solved."""
    missed = [pid for pid, h in hist.items() if not h['first_correct']]
    later = sum(1 for pid in missed if hist[pid]['solved'])
    return {'missed_first': len(missed), 'recovered': later, 'open': len(missed) - later,
            'revealed': sum(1 for a in attempts if a['source'] == 'reveal')}


def ceiling(rows):
    """The highest rating solved first time at least 70% of the time (two or
    more tries), or None."""
    best = None
    for row in rows:
        if row['attempted'] >= 2 and (row['accuracy'] or 0) >= 0.7:
            best = row['rating']
    return best


# ---------------------------------------------------------------------------
# How to prepare
# ---------------------------------------------------------------------------
def needed_right(level, goal):
    """Right answers needed to reach `goal` with every other problem blank
    (AMC), or right answers (AIME)."""
    if level == 'AIME':
        return max(0, min(15, math.ceil(goal)))
    return max(0, min(25, math.ceil((goal - 37.5) / 4.5)))


def phase(days_left):
    if days_left is None:
        return None
    weeks = days_left / 7
    if weeks > 16:
        return {'name': 'Foundation', 'weeks': round(weeks),
                'text': 'Learn new topics well. Speed comes later. Take a mock every 3 or 4 weeks.'}
    if weeks > 6:
        return {'name': 'Build', 'weeks': round(weeks),
                'text': 'Work on the problems that decide your score. A timed mock every 2 weeks.'}
    if weeks > 2:
        return {'name': 'Sharpen', 'weeks': round(weeks),
                'text': 'A timed paper every week. Past contests over new topics. Clear Review before each one.'}
    return {'name': 'Taper', 'weeks': max(0, round(weeks)),
            'text': 'Redo problems you know. Nothing new. Sleep well.'}


def prepare(level, goal, hours, days_left, projected, rating_rows, tstats, due, mocks_taken, avg_seconds):
    """The plan of attack: how the goal breaks down, which problems decide it,
    what to work on first, and how to spend the week."""
    right = needed_right(level, goal)
    count = catalog.FORMATS[level]['count']
    if level == 'AIME':
        split = '{} right answers out of 15.'.format(right)
    else:
        blanks = count - right
        split = '{} right and {} blank = {:g} points. Each wrong answer costs 1.5 compared with a blank.'.format(
            right, blanks, right * 6 + blanks * 1.5)
    need_rating = official.rating_at(level, max(1, right)) if right else None
    top = ceiling(rating_rows)

    if need_rating is None:
        reach = 'Your goal is very low. Raise it on Study Plan.'
    elif top is None:
        reach = ('You need to solve up to about #{} (AoPS {:g}). Answer more problems to see where you '
                 'stand.').format(right, need_rating)
    elif top >= need_rating:
        reach = ('You need to solve up to about #{} (AoPS {:g}). You already get {:g} problems right, so work '
                 'on speed and fewer mistakes.').format(right, need_rating, top)
    else:
        lo = min(need_rating, top + 0.5)
        band = '{:g}'.format(lo) if lo == need_rating else '{:g}–{:g}'.format(lo, need_rating)
        reach = ('You need to solve up to about #{} (AoPS {:g}). You are solid up to {:g}, so practise '
                 'problems rated {}.').format(right, need_rating, top, band)

    gap = None if projected is None else round(goal - projected, 1)

    # Topics: common on this contest and not yet in hand, most points first.
    pool = [t for t in catalog.TOPICS if level in t['levels']]
    ranked = sorted(pool, key=lambda t: -(t['weight'] * (1 - tstats[t['id']]['mastery'])))
    focus = [{'id': t['id'], 'name': t['name'], 'category': t['category'], 'weight': t['weight'],
              'mastery': tstats[t['id']]['mastery'], 'accuracy': tstats[t['id']]['accuracy']}
             for t in ranked[:5]]

    steps = []
    if focus:
        steps.append({'title': 'Work on weak topics',
                      'body': 'Start with {}.'.format(', '.join(f['name'] for f in focus[:3])),
                      'to': '/topics/{}'.format(focus[0]['id'])})
    if need_rating is not None:
        hi = official.difficulty_at(level, max(1, right))
        lo = min(hi, tier(top + 0.5) if top is not None else official.difficulty_at(level, 1))
        steps.append({'title': 'Practise at your target level',
                      'body': 'Problems up to AoPS {:g}, until you get 80% right first try.'.format(need_rating),
                      'to': '/problems?level={}&difficulty={}'.format(
                          level.replace(' ', '+'), ','.join(str(d) for d in range(lo, hi + 1)))})
    if due:
        steps.append({'title': 'Clear Review',
                      'body': '{} missed problem{} due.'.format(due, ' is' if due == 1 else 's are'),
                      'to': '/review'})
    if not mocks_taken:
        steps.append({'title': 'Take a timed mock',
                      'body': 'See how you do under real timing.',
                      'to': '/contests'})
    pace = PACE[level]
    if avg_seconds and avg_seconds > pace * 1.2:
        steps.append({'title': 'Speed up',
                      'body': 'You take {} per problem. The {} gives you about {}. Time sets of five.'.format(
                          _clock(avg_seconds), level, _clock(pace)),
                      'to': '/problems?level={}'.format(level.replace(' ', '+'))})

    hours = max(1, hours or 1)
    week = [
        {'what': 'New problems', 'hours': round(hours * 0.45, 1)},
        {'what': 'Review', 'hours': round(hours * 0.2, 1)},
        {'what': 'Mocks and past papers', 'hours': round(hours * 0.35, 1)},
    ]
    return {'goal': goal, 'right_needed': right, 'split': split, 'need_rating': need_rating, 'ceiling': top,
            'reach': reach, 'gap': gap, 'focus': focus, 'steps': steps, 'week': week,
            'phase': phase(days_left)}


def _clock(seconds):
    m, s = divmod(int(seconds), 60)
    return '{}:{:02d}'.format(m, s)


def analytics(attempts, hist, review_by_id, reviews, mocks, plan, today):
    tstats = engine.topic_stats(hist, review_by_id)
    target = plan['target'] if plan else 'AMC 10'
    goal = plan['goal_score'] if plan else engine.DEFAULT_GOALS[target]
    rating_rows = by_rating(attempts, hist)
    enough = len(hist) >= engine.PROJECTION_MIN
    projected = {lvl: engine.projected(hist, lvl) if enough else None for lvl in ('AMC 10', 'AMC 12', 'AIME')}
    graded = _graded(attempts)
    timed = [int(a.get('seconds') or 0) for a in graded if int(a.get('seconds') or 0) > 0]
    avg_seconds = round(sum(timed) / len(timed)) if timed else None
    first = list(hist.values())
    topics = [{'id': t['id'], 'name': t['name'], 'category': t['category'], 'weight': t['weight'],
               'levels': t['levels'], **{k: tstats[t['id']][k] for k in ('attempted', 'problems', 'accuracy',
                                                                          'mastery', 'review')}}
              for t in catalog.TOPICS if tstats[t['id']]['attempted']]
    topics.sort(key=lambda t: (t['accuracy'] if t['accuracy'] is not None else 1, -t['attempted']))
    due = sum(1 for r in reviews if r['status'] == 'active' and r['due'] <= today.isoformat())
    days_left = None
    if plan and plan.get('exam_date'):
        days_left = (date.fromisoformat(plan['exam_date']) - today).days
    mock_rows = [m for m in mocks if m['kind'] in ('mock', 'logged')]
    return {
        'target': target,
        'goal': goal,
        'has_plan': bool(plan),
        'exam_date': plan['exam_date'] if plan else None,
        'days_left': days_left,
        'hours': plan['hours'] if plan else None,
        'performance': {
            'attempted': len(first),
            'solved': sum(1 for h in first if h['solved']),
            'accuracy': round(sum(1 for h in first if h['first_correct']) / len(first), 3) if first else None,
            'avg_seconds': avg_seconds,
            'minutes': round(sum(int(a.get('seconds') or 0) for a in attempts) / 60),
            'active_days': len({a['at'][:10] for a in attempts}),
            'projected': projected,
            'projection_min': engine.PROJECTION_MIN,
            'categories': engine.category_stats(tstats),
            'ratings': rating_rows,
            'ceiling': ceiling(rating_rows),
            'weeks': weekly(attempts, today),
            'topics': topics,
            'recovery': recovery(attempts, hist),
            'mocks': [_mock_point(m) for m in reversed(mock_rows)],
        },
        'contests': {lvl: contest_guide(lvl) for lvl in ('AMC 10', 'AMC 12', 'AIME')},
        'prepare': prepare(target, goal, plan['hours'] if plan else 4, days_left, projected[target], rating_rows,
                           tstats, due, sum(1 for m in mocks if m['kind'] == 'mock'), avg_seconds),
    }
