"""What one subject is for, and what its work says about getting there.

## Why this reads the work and not only the filing

A goal is tied to a subject by `subject_ids`, a field a reader fills in once and rarely
looks at again. Going by that alone, Alpha's Music page said no goal was set, with 844
finished tasks on Violin ARCT, and Computer Science led with Reach AIME, a math contest
with none of its 656 tasks filed there. So a goal counts as being about a subject when
its work is there (`goal_why.is_direct`, the same test the forecast uses). The filing
only decides what to offer: file a goal where its work is, or move one that's somewhere
it has no work.

## Why this reads the plan

Order and pace come from `priority.decide` and `forecast`, the ones the plan reads, so
this page can't say a subject matters while the plan says to leave it alone. What this
adds is the part a page about one subject can answer: whether the plan needs this subject
right now, how much of the work here was on the goal, and if the goal has room to spare,
how many sessions could go to the one that doesn't.

## The shape of everything it says

Each reading is a headline that interprets, the figures behind it, and "This suggests"
with what to try (the rule in components/Analytics/Suggestion.tsx). Comparisons go through
`evidence`: a gap that can't be told from noise isn't said, and anything said is worded
as strongly as its count allows.

Pure: rows and dates in, words out. backend/api/subject_read.py does the reading.
"""
import math
from collections import Counter
from datetime import date
from statistics import mean
from typing import Any, Callable, Dict, List, Optional, Sequence

from backend.tracking import (evidence, experiments, forecast, goal_why, growth_reads, next_sessions, priority,
                              record, topics)
from backend.tracking.measures import kind_of

#: The window the page's counts read, against the one before it.
RECENT_DAYS = 30
#: Windows tried for a before and after, shortest first, until both sides can speak.
TREND_DAYS = (30, 90)
#: How far back the level and reason reads look.
LOOKBACK_DAYS = 180
#: A goal's share of work in a subject before that subject counts as feeding it.
SERVES_SHARE = 0.1
#: With this much work on a goal and under MISFILED_SHARE of it in the subject it's
#: filed under, the filing is wrong. Below this count there's too little to dispute it.
MISFILED_MIN = 10
MISFILED_SHARE = 0.05
#: Under this share of study work on the goal, most of it is going elsewhere.
ON_GOAL_SHARE = 0.5
#: Difficulty at or below this is easy work, at or above HARD is hard work.
EASY, HARD = 2, 4
#: Under this share of hard work, the goal is being practiced below its level.
HARD_SHARE = 0.2
#: Tasks on a goal before the share of hard work means anything.
HARD_FLOOR = 10
#: Under this share of a goal's topics touched, coverage is worth saying.
COVERED_SHARE = 0.6
#: The most readings it sends. The page shows some and folds the rest.
MOST_INSIGHTS = 6
#: Names of the off-goal work to pick the swap from.
TOP_NAMES = 1

#: What to try for each reason, in the reader's terms. Keyed by the label in
#: shared/rules.json `task_reasons`.
TRY_FOR = {
    'Could not focus': 'Try a shorter block with your phone in another room.',
    'Did not know where to start': 'Write down the first step before you sit down.',
    'Bigger than it looked': 'Cut the next one in half before you start.',
    'Ran out of time': 'Book more time for it, or plan fewer problems.',
    'Low energy': 'Move it to the part of the day you feel fresh.',
    'Kept getting interrupted': "Pick a time and place where nobody can reach you.",
}
ORDER = {'bad': 0, 'flat': 1, 'good': 2}


def _plural(count: int, word: str) -> str:
    return '{:,} {}'.format(count, word if count == 1 else '{}s'.format(word))


def _sessions(value: Optional[float]) -> str:
    shown = '{:g}'.format(round(float(value or 0), 1))
    return '{} {}'.format(shown, 'session' if float(shown) == 1 else 'sessions')


def _days(count: int) -> str:
    return '{:,} {}'.format(count, 'day' if count == 1 else 'days')


def _figure(value: float) -> str:
    return '{:.1f}'.format(value)


def _rating(task: Dict[str, Any]) -> Optional[float]:
    value = task.get('execution')
    return float(value) if isinstance(value, (int, float)) and 1 <= value <= 5 else None


def _level(task: Dict[str, Any]) -> Optional[float]:
    value = task.get('difficulty')
    return float(value) if isinstance(value, (int, float)) and 1 <= value <= 5 else None


def _within(rows: Sequence[Dict[str, Any]], today: date, start_back: int, stop_back: int = 0) -> List[Dict[str, Any]]:
    """Rows finished from `start_back` days ago up to `stop_back` days ago."""
    found = []
    for task in rows:
        day = record._day(task.get('completed_at'))
        if day and stop_back <= (today - day).days < start_back:
            found.append(task)
    return found


def _done(tasks: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [task for task in tasks if task.get('status') == 'done' and task.get('completed_at')]


# ---------------------------------------------------------------------------
# Which goals this subject feeds
# ---------------------------------------------------------------------------
def _home_of(direct: Sequence[Dict[str, Any]]) -> Optional[str]:
    """The subject most of a goal's work is in."""
    counts = Counter(task.get('subject') for task in direct if task.get('subject'))
    return counts.most_common(1)[0][0] if counts else None


def goals_here(subject: str, tasks: Sequence[Dict[str, Any]], goals: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """The objective goals fed by this subject, and the ones filed here that aren't.

    Returns {'serving': [...], 'misfiled': [...]}, each row holding the goal and its
    finished work here and everywhere. Routines don't count as work on a goal.
    """
    done = [task for task in _done(tasks) if kind_of(task) != 'routine']
    serving, misfiled = [], []
    for goal in goals:
        if not priority.is_objective(goal):
            continue
        terms = goal_why.goal_terms(goal)
        direct = goal_why.direct_tasks(done, goal, terms)
        here = [task for task in direct if task.get('subject') == subject]
        filed = subject in record.subject_ids(goal)
        share = len(here) / len(direct) if direct else 0.0
        row = {'goal': goal, 'terms': terms, 'direct': direct, 'here': here, 'filed': filed}
        if len(here) >= evidence.FLOOR and share >= SERVES_SHARE:
            serving.append(row)
        elif filed and len(direct) >= MISFILED_MIN and share < MISFILED_SHARE:
            misfiled.append(row)
        elif filed:
            serving.append(row)
    return {'serving': serving, 'misfiled': misfiled}


# ---------------------------------------------------------------------------
# The goal card
#
# A short title and one thing to try. The figures behind it (what the goal needs a
# week against what it gets, days left, how much work was on it) go out as numbers,
# and the page draws them, so nobody has to read a sentence to see a gap.
# ---------------------------------------------------------------------------
def _pace_of(goal: Dict[str, Any], tasks, sittings, today: date, name_of) -> Dict[str, Any]:
    """A goal's forecast, or an empty one with no date on it."""
    ends = record._day(goal.get('deadline'))
    if ends is None or ends < today:
        return {'state': 'undated', 'days_left': None, 'per_week': None, 'need_per_week': None,
                'line': '', 'out_of_reach': False}
    return forecast.forecast(goal, tasks, sittings, today, name_of)


def _swap_of(work: Dict[str, Any]) -> str:
    names = goal_why._top_names(work['off'], TOP_NAMES)
    return names[0] if names else ''


def _card(tone: str, title: str, tip: str, **more) -> Dict[str, Any]:
    return {'tone': tone, 'title': title, 'tip': tip, **more}


def _next(step: str) -> str:
    return 'Next: "{}".'.format(step) if step else ''


def _no_pace(state: str, step: str) -> Dict[str, Any]:
    return _card('flat', 'No pace to read yet',
                 ('Give it a date. ' if state == 'undated' else 'Log a few more sessions on it. ') + _next(step))


def _first_card(name: str, title: str, pace: Dict[str, Any], work: Dict[str, Any], step: str) -> Dict[str, Any]:
    """The subject the plan needs most."""
    state, study = pace['state'], len(work['study'])
    share = len(work['on']) / study if study else 0.0
    if state == 'behind':
        if pace.get('out_of_reach'):
            return _card('bad', "Your top goal can't make its date at this pace",
                         'Move the date or shrink the goal before adding hours.')
        if study and share < ON_GOAL_SHARE:
            swap = _swap_of(work)
            return _card('bad', "Most work here isn't on your top goal",
                         'Swap your next "{}" for "{}".'.format(swap, step) if swap and step
                         else 'Point your next session at it. ' + _next(step))
        more = max(1, math.ceil(pace['need_per_week'] - pace['per_week']))
        return _card('bad', 'The aim is right. You need more sessions.',
                     'Add {} a week. {}'.format(_sessions(more), _next(step)).strip())
    if state == 'stalled':
        return _card('bad', 'Your top goal has stalled', 'Book one session this week. ' + _next(step))
    if state == 'on_track':
        return _card('good', 'Your top goal is on pace', 'Keep it up. ' + _next(step))
    return _no_pace(state, step)


def _waiting_card(name: str, title: str, pace: Dict[str, Any], work: Dict[str, Any], step: str,
                  top: Optional[Dict[str, Any]], until: str) -> Dict[str, Any]:
    """A subject whose goal isn't the one the plan puts first."""
    state = pace['state']
    top_title = (top or {}).get('title') or ''
    top_short = bool(top and top.get('state') in ('behind', 'stalled') and top.get('needs') is not None)
    if state == 'on_track':
        if top_short:
            spare = math.floor(pace['per_week'] - pace['need_per_week'])
            short = math.ceil(top['needs'] - (top['pace'] or 0))
            moved = min(spare, short)
            if moved >= 1:
                return _card('flat', '{} a week to spare here'.format(_sessions(moved)).capitalize(),
                             'Give {} to {} {}. {} still lands on time.'.format('it' if moved == 1 else 'them', top_title, until, title),
                             spare=moved, to=top_title)
        return _card('good', 'On pace, nothing to push', 'Keep it up. ' + _next(step))
    if state in ('behind', 'stalled'):
        if pace.get('out_of_reach'):
            return _card('bad', "Can't make its date at this pace", 'Move the date or shrink the goal.')
        if top_title:
            return _card('flat', 'Behind, but your top goal comes first',
                         'Give {} what you can spare {}.'.format(name, until))
        return _card('bad', 'Behind', 'It needs more sessions. ' + _next(step))
    if state == 'done':
        return _card('good', 'Goal reached', 'Mark it done on Goals.')
    return _no_pace(state, step)


def _no_goal_card(name: str, work: Dict[str, Any], top: Optional[Dict[str, Any]], routine: int = 0) -> Dict[str, Any]:
    if routine:
        return _card('flat', 'A routine, so nothing to chase', 'No goal rides on {}. That\'s fine.'.format(name),
                     recent=routine)
    total = len(work['all'])
    if not total:
        return _card('flat', 'Quiet, and no goal needs it', 'It can stay parked, or give it a goal.', recent=0)
    return _card('flat', 'No goal depends on {}'.format(name), 'If it should lead somewhere, give it a goal.',
                 recent=total)


# ---------------------------------------------------------------------------
# What the work says about the goal
#
# Each reading: a tag, a short title, a chart the page draws, and one thing to try.
# How sure it is goes out as its evidence label, drawn as a chip, so the wording
# stays short however early the evidence is.
#   compare: bars on one scale, e.g. your rating here against your average
#   part:    a share, e.g. 5 of 23 topics
# ---------------------------------------------------------------------------
def _read(id_: str, tone: str, tag: str, title: str, chart: Dict[str, Any], tip: str,
          sure: Optional[Dict[str, Any]] = None, resource=None, test=None) -> Dict[str, Any]:
    return {'id': id_, 'tone': tone, 'tag': tag, 'title': title, 'chart': chart, 'tip': tip,
            'evidence': sure['label'] if sure else None, 'resource': resource, 'test': test}


def _test(kind: str, title: str, how: str, **params) -> Dict[str, Any]:
    """A test the page can start from a reading (backend/tracking/experiments.py).
    The goal and subject it's scoped to are added by `insights`."""
    return {'kind': kind, 'title': title, 'params': {**params, 'how': how}}


def _compare(rows: List[Any], top: Optional[float] = 5) -> Dict[str, Any]:
    """Bars on one scale. `rows` are (label, value) pairs."""
    values = [value for _, value in rows]
    return {'type': 'compare', 'max': top or max(values + [1]),
            'unit': '/ 5' if top == 5 else '',
            'rows': [{'label': label, 'value': round(value, 1)} for label, value in rows]}


def _part(part: int, whole: int, label: str) -> Dict[str, Any]:
    return {'type': 'part', 'part': part, 'whole': whole, 'label': label}


def _trend(rows: Sequence[Dict[str, Any]], today: date, aim: str, behind: bool) -> Optional[Dict[str, Any]]:
    """Whether the work is going better or worse, from one window to the one before."""
    for days in TREND_DAYS:
        now = [r for r in map(_rating, _within(rows, today, days)) if r is not None]
        then = [r for r in map(_rating, _within(rows, today, days * 2, days)) if r is not None]
        sure = evidence.means(then, now)
        if not (evidence.speaks(sure) and sure['clear']):
            continue
        before, after = mean(then), mean(now)
        chart = _compare([('{} days before'.format(days), before), ('Last {} days'.format(days), after)])
        if after > before:
            if behind:
                return _read('trend', 'flat', 'Trend', "Ratings are up. The pace isn't yet.", chart,
                             'Quality is fine. More sessions are what it needs.', sure)
            return _read('trend', 'good', 'Trend', 'Ratings are up', chart, 'Keep the same setup.', sure)
        return _read('trend', 'bad', 'Trend', 'Ratings are down', chart,
                     'Look at what changed, and slow the next one down.', sure)
    return None


def _levels(rows: Sequence[Dict[str, Any]], today: date, aim: str) -> Optional[Dict[str, Any]]:
    """How the work goes by difficulty, and whether it's at the level the goal asks for."""
    recent = _within(rows, today, LOOKBACK_DAYS)
    easy = [r for r in (_rating(t) for t in recent if (_level(t) or 9) <= EASY) if r is not None]
    hard = [r for r in (_rating(t) for t in recent if (_level(t) or 0) >= HARD) if r is not None]
    sure = evidence.means(easy, hard)
    if evidence.speaks(sure) and sure['clear']:
        chart = _compare([('Easy work', mean(easy)), ('Hard work', mean(hard))])
        if mean(easy) < mean(hard):
            return _read('level', 'bad', 'Difficulty', 'Easy work goes worse than hard', chart,
                         'Check the easy ones before calling them done.', sure,
                         test=_test('check_easy', 'Check easy work before calling it done',
                                    'Before you tick off an easy task, go over it once more.'))
        return _read('level', 'bad', 'Difficulty', 'It falls off when it gets hard', chart,
                     'Do your next session at the hard level, slower.', sure)
    leveled = [task for task in recent if _level(task) is not None]
    many_hard = sum(1 for task in leveled if _level(task) >= HARD)
    if len(leveled) >= HARD_FLOOR and many_hard / len(leveled) < HARD_SHARE:
        return _read('level', 'bad', 'Difficulty', 'Very little hard work', _part(many_hard, len(leveled), 'tasks were hard'),
                     'Make the next session harder.')
    return None


def _reason(rows: Sequence[Dict[str, Any]], today: date, aim: str) -> Optional[Dict[str, Any]]:
    """The thing that goes wrong most on this work."""
    recent = _within(rows, today, LOOKBACK_DAYS)
    named = [next_sessions.STRUGGLES[t['reason']] for t in recent if t.get('reason') in next_sessions.STRUGGLES]
    if not named:
        return None
    label, count = Counter(named).most_common(1)[0]
    sure = evidence.counted(count)
    if not evidence.speaks(sure):
        return None
    key = next((key for key, name in next_sessions.STRUGGLES.items() if name == label), '')
    test = (_test('reason', experiments.FOR_REASON[key][0], experiments.FOR_REASON[key][1], reason=key)
            if key in experiments.FOR_REASON else None)
    return _read('reason', 'bad', 'What goes wrong', '"{}" comes up most'.format(label),
                 _part(count, len(named), 'times something went wrong'),
                 TRY_FOR.get(label, "Decide before the next session how you'll handle it."), sure, test=test)


def _when(rows: Sequence[Dict[str, Any]], today: date, aim: str) -> Optional[Dict[str, Any]]:
    """The part of the day the work goes best, when that's clear from the rest."""
    recent = _within(rows, today, LOOKBACK_DAYS)
    by_part: Dict[str, List[float]] = {}
    for task in recent:
        part, rating = experiments.part_of(task), _rating(task)
        if part and rating is not None:
            by_part.setdefault(part, []).append(rating)
    sized = {part: values for part, values in by_part.items() if len(values) >= evidence.FLOOR}
    if len(sized) < 2:
        return None
    best = max(sized, key=lambda part: mean(sized[part]))
    rest = [value for part, values in by_part.items() if part != best for value in values]
    sure = evidence.means(rest, sized[best])
    if not (evidence.speaks(sure) and sure['clear']) or mean(sized[best]) <= mean(rest):
        return None
    when = experiments.IN_PART[best]
    return _read('when', 'good', 'When', '{} sessions go best'.format(experiments.PART_WORD[best]),
                 _compare([(experiments.PART_WORD[best], mean(sized[best])), ('Other times', mean(rest))]),
                 'Try doing them {} for two weeks.'.format(when), sure,
                 test=_test('time_of_day', 'Do {} sessions {}'.format(aim, when),
                            'Schedule them {} for the next two weeks.'.format(when), part=best))


def _works(rows: Sequence[Dict[str, Any]], today: date, aim: str) -> Optional[Dict[str, Any]]:
    """What the good sessions have in common."""
    recent = _within(rows, today, LOOKBACK_DAYS)
    named = [next_sessions.GOOD[t['reason']] for t in recent if t.get('reason') in next_sessions.GOOD]
    if not named:
        return None
    label, count = Counter(named).most_common(1)[0]
    sure = evidence.counted(count)
    if not evidence.speaks(sure):
        return None
    return _read('works', 'good', 'What works', '"{}" helps most'.format(label),
                 _part(count, len(named), 'good sessions'), 'Set up the next one the same way.', sure)


def _attended(work: Dict[str, Any], name: str, aim: str) -> Optional[Dict[str, Any]]:
    """More sitting and listening than doing. Attending is activity, and goals move on output."""
    sat, did = len(work['attended']), len(work['study'])
    if sat < evidence.FLOOR or sat <= did:
        return None
    return _read('attended', 'flat', 'Practice', 'More sitting in than practicing',
                 _compare([('Attended', sat), ('Practiced', did)], None),
                 'Practice is what moves {}.'.format(aim))


def _weak_topic(goal: Dict[str, Any], rows_here: Sequence[Dict[str, Any]], aim: str) -> Optional[Dict[str, Any]]:
    """The weakest part of the goal in this subject, and work that names it."""
    plan = topics.plan(goal, rows_here)
    move = next((one for one in plan.get('moves') or [] if str(one.get('id')).startswith('weak-')), None)
    if not move:
        return None
    goal_id = str(goal.get('id'))
    row = next((one for one in rows_here if one.get('topic') == move.get('topic') and goal_id in one.get('goal_ids', [])), None)
    if not row or row.get('execution') is None or row.get('base') is None:
        return None
    sure = evidence.counted(int(row.get('tasks') or 0))
    if not evidence.speaks(sure):
        return None
    label = row['label']
    return _read('topic', 'bad', 'Weak spot', '{} is your weakest topic'.format(label),
                 _compare([(label, row['execution']), ('Your average', row['base'])]),
                 '{}.'.format(move['title']), sure, move.get('resource'))


def _coverage(goal: Dict[str, Any], rows: Sequence[Dict[str, Any]], worked: int, aim: str) -> Optional[Dict[str, Any]]:
    """How much of what the goal tests has any work behind it."""
    plan = topics.plan(goal, rows)
    position = plan.get('position') or []
    covered = plan.get('covered', 0)
    if len(position) < evidence.FLOOR or covered >= len(position) * COVERED_SHARE:
        return None
    untouched = [topics.lower(spot['label']) for spot in position if spot['status'] == 'untouched']
    contest = (plan.get('contexts') or [''])[0]
    return _read('coverage', 'flat', 'Coverage',
                 'Only {} of {} {} topics touched'.format(covered, len(position), contest).replace('  ', ' '),
                 _part(covered, len(position), 'topics with work'),
                 'Try {} next.'.format(untouched[0]))


def insights(rows: Sequence[Dict[str, Any]], work: Dict[str, Any], today: date, name: str, aim: str,
             goal: Optional[Dict[str, Any]], topic_rows: Sequence[Dict[str, Any]], subject: str,
             behind: bool, worked: int) -> List[Dict[str, Any]]:
    """Every reading with something to say, the bad news first."""
    found: List[Optional[Dict[str, Any]]] = []
    if goal:
        here = [row for row in topic_rows if row.get('subject') == subject]
        found += [_weak_topic(goal, here, aim), _coverage(goal, topic_rows, worked, aim)]
    found += [_trend(rows, today, aim, behind), _levels(rows, today, aim), _reason(rows, today, aim),
              _attended(work, name, aim), _when(rows, today, aim), _works(rows, today, aim)]
    said = [one for one in found if one]
    for one in said:
        if one.get('test'):
            one['test'].update(goal=str(goal.get('id')) if goal else '', subject=subject)
    return sorted(said, key=lambda one: ORDER[one['tone']])[:MOST_INSIGHTS]


# ---------------------------------------------------------------------------
# The read
# ---------------------------------------------------------------------------
def _work_here(done_here: Sequence[Dict[str, Any]], on_goal: Callable[[Dict[str, Any]], bool],
               on_any: Callable[[Dict[str, Any]], bool], today: date) -> Dict[str, Any]:
    """The last window's work here, split by what it was and whether it was on the goal."""
    recent = [task for task in _within(done_here, today, RECENT_DAYS) if kind_of(task) != 'routine']
    study = [task for task in recent if kind_of(task) == 'study']
    return {'all': recent, 'study': study, 'attended': [task for task in recent if kind_of(task) == 'attended'],
            'on': [task for task in study if on_goal(task)],
            'off': [task for task in study if not on_any(task)]}


def _row_out(row: Dict[str, Any], pace: Dict[str, Any], plan_row: Dict[str, Any], note: str, step: str) -> Dict[str, Any]:
    goal = row['goal']
    return {'goal_id': str(goal.get('id')), 'title': str(goal.get('title') or 'Your goal'),
            'state': pace['state'], 'days_left': pace.get('days_left'), 'percent': plan_row.get('percent'),
            'needs': pace.get('need_per_week'), 'pace': pace.get('per_week'),
            'gets_time': bool(plan_row.get('gets_time')), 'filed': row['filed'],
            'work_here': len(row['here']), 'work_total': len(row['direct']), 'next': step, 'note': note}


def read(subject: str, name: str, tasks: Sequence[Dict[str, Any]], goals: Sequence[Dict[str, Any]],
         sittings: Sequence[Dict[str, Any]], decision: Dict[str, Any], topic_rows: Sequence[Dict[str, Any]],
         today: date, name_of=lambda key: key) -> Dict[str, Any]:
    """What this subject is for, what the plan says about it and what its work shows."""
    found = goals_here(subject, tasks, goals)
    plan_rows = {row['goal_id']: row for row in decision.get('goals') or []}
    order = {row['goal_id']: at for at, row in enumerate(decision.get('goals') or [])}
    serving = sorted(found['serving'], key=lambda row: order.get(str(row['goal'].get('id')), len(order)))
    focus = decision.get('focus') or {}
    focus_id = focus.get('goal_id')
    top = plan_rows.get(focus_id)
    # The plan says what comes back "after Dec 1". What's set down here is set down until then.
    until = str(decision.get('until') or '').replace('after ', 'until ', 1)
    if not until.startswith('until '):
        until = 'for now'
    also = set(decision.get('also') or [])
    done_here = [task for task in _done(tasks) if task.get('subject') == subject]

    rows_out = []
    paces = {}
    for row in serving:
        goal = row['goal']
        goal_id, title = str(goal.get('id')), str(goal.get('title') or 'Your goal')
        pace = _pace_of(goal, tasks, sittings, today, name_of)
        paces[goal_id] = pace
        note = 'Moves with {}'.format(top['title']) if top and title in also else ''
        rows_out.append(_row_out(row, pace, plan_rows.get(goal_id) or {}, note, goal_why.next_step(goal) or ''))

    live = [row for row in serving if paces[str(row['goal'].get('id'))]['state'] != 'done']
    lead = (live or serving or [None])[0]

    if lead is None:
        everything = _work_here(done_here, lambda task: False, lambda task: False, today)
        routine = len(_within(done_here, today, RECENT_DAYS)) if growth_reads.routine(subject) else 0
        card = _no_goal_card(name, everything, top, routine)
        worked = [task for task in done_here if kind_of(task) != 'routine']
        said = insights(worked, everything, today, name, name, None, topic_rows, subject, False, len(worked))
        stance, lead_id = 'none', None
    else:
        goal = lead['goal']
        lead_id = str(goal.get('id'))
        title = str(goal.get('title') or 'Your goal')
        pace = paces[lead_id]
        step = goal_why.next_step(goal) or ''
        moves_with = lead_id == focus_id or title in also
        # Work on a goal that moves with this one counts as work on this one.
        companions = [row for row in serving if str(row['goal'].get('id')) == lead_id or row['goal'].get('title') in also] \
            if moves_with else [lead]

        def on_goal(task):
            return any(goal_why.is_direct(task, one['goal'], one['terms']) for one in companions)

        def on_any(task):
            return any(goal_why.is_direct(task, one['goal'], one['terms']) for one in serving)

        work = _work_here(done_here, on_goal, on_any, today)
        if moves_with:
            stance = 'first' if lead_id == focus_id else 'also'
            card = _first_card(name, title, pace, work, step)
        else:
            given = any(one.get('goal_id') == lead_id for one in decision.get('allocation') or [])
            stance = 'second' if given else 'waits'
            card = _waiting_card(name, title, pace, work, step, top, until)
        said = insights(lead['here'], work, today, name, title, goal, topic_rows, subject,
                        pace['state'] in ('behind', 'stalled'), len(lead['direct']))
        # The numbers the page draws under the title.
        card['days_left'] = pace.get('days_left')
        if pace.get('need_per_week') is not None and pace.get('per_week') is not None:
            card['meter'] = {'needs': pace['need_per_week'], 'does': pace['per_week']}
        if work['study']:
            card['on_goal'] = {'on': len(work['on']), 'of': len(work['study']), 'days': RECENT_DAYS}

    return {
        'subject': subject,
        'stance': stance,
        'top': {'goal_id': focus_id, 'title': focus.get('title'), 'days_left': focus.get('days_left')} if focus_id else None,
        'lead': lead_id,
        'card': card,
        'goals': rows_out,
        'misfiled': [_misfiled_out(row, name_of) for row in found['misfiled']],
        'insights': said,
    }


def _misfiled_out(row: Dict[str, Any], name_of) -> Dict[str, Any]:
    home = _home_of(row['direct'])
    return {'goal_id': str(row['goal'].get('id')), 'title': str(row['goal'].get('title') or 'Your goal'),
            'work_here': len(row['here']), 'work_total': len(row['direct']),
            'home': home, 'home_name': name_of(home) if home else ''}


def lead_goal(subject: str, tasks: Sequence[Dict[str, Any]], goals: Sequence[Dict[str, Any]],
              decision: Dict[str, Any], sittings: Sequence[Dict[str, Any]], today: date) -> Optional[Dict[str, Any]]:
    """The goal this subject's sessions should be written for: the row `read` leads with."""
    order = {row['goal_id']: at for at, row in enumerate(decision.get('goals') or [])}
    serving = sorted(goals_here(subject, tasks, goals)['serving'],
                     key=lambda row: order.get(str(row['goal'].get('id')), len(order)))
    live = [row for row in serving if _pace_of(row['goal'], tasks, sittings, today, str)['state'] != 'done']
    return live[0] if live else None


def session_decision(row: Dict[str, Any], decision: Dict[str, Any], tasks, sittings, today: date, name_of) -> Dict[str, Any]:
    """The parts of a decision `priority.session_block` reads, for one subject's goal.

    The goal isn't always the one the plan puts first, so this writes where it stands
    and leaves `not_now` empty: a subject's own goal is never set aside on its own page.
    """
    goal = row['goal']
    goal_id = str(goal.get('id'))
    plan_row = next((one for one in decision.get('goals') or [] if one['goal_id'] == goal_id), {})
    pace = _pace_of(goal, tasks, sittings, today, name_of)
    standing = ('{} needs {} a week and you do {}, with {} left.'.format(
        goal.get('title'), _sessions(pace['need_per_week']), '{:g}'.format(pace['per_week']), _days(pace['days_left']))
        if pace.get('need_per_week') is not None and pace.get('per_week') is not None
                else pace.get('line') or 'It has no date yet.')
    return {'focus': {'goal_id': goal_id, 'title': str(goal.get('title') or 'Your goal'),
                      'percent': plan_row.get('percent', 0), 'days_left': pace.get('days_left'),
                      'next': goal_why.next_step(goal)},
            'answers': [{'key': 'urgent', 'answer': standing}],
            'not_now': []}


def narrowed(rows: Sequence[Dict[str, Any]], row: Dict[str, Any], subject: str, key: str = 'name') -> List[Dict[str, Any]]:
    """The work a model is shown, cut to what's on this goal. Everything, with too little
    left to plan from."""
    kept = [one for one in rows
            if goal_why.is_direct({'title': one.get(key), 'subject': subject}, row['goal'], row['terms'])]
    return kept if len(kept) >= evidence.FLOOR else list(rows)

