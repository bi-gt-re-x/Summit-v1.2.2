"""Experiments: test a change on your own work and get a straight answer.

## Why

An insight like "you do worse in the evening" is a guess about the past. It turns
useful when it becomes a test: move the sessions to the morning for two weeks, and
find out. That's what this is. A reader (or the weekly review, or a card on a subject
page) proposes a change, Summit watches the work that follows, and at the end says
whether it worked, didn't matter, or made things worse, as strongly as the count allows.

## Two designs

    split         During the test, sessions done the new way against the ones that
                  weren't. Morning against not-morning, short against long. Needs the
                  change to be visible on each task (its time, its length, its order).
    before/after  The test's days against the same number of days before it. For
                  changes a task can't show (a phone in another room, one session a
                  day). Weaker, because other things change too, and the page says so.

When every session in a split test went the new way, there's nothing to split, so it
falls back to the days before.

## What's measured

Only what the app already records: the 1-5 rating a finished task gets, the reason
picked when it went badly, and which days had work. Self-ratings are a soft measure,
which is one more reason every verdict goes through backend/tracking/evidence.py: a
gap that can't be told from noise is called no difference, and a small count can only
say "too early".

Pure: rows and dates in, words and numbers out. backend/api/experiments.py stores them.
"""
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from statistics import mean
from typing import Any, Callable, Dict, List, Optional, Sequence

from backend.tracking import evidence, goal_why, next_sessions, record
from backend.tracking.measures import kind_of

#: How long a test runs unless the reader picks otherwise.
DAYS = 14
#: The lengths a reader can pick.
LENGTHS = (7, 14, 21, 28)
#: How much longer "run it another week" makes a test.
EXTEND = 7
#: The most tests running at once. More than this and they muddy each other.
MOST_RUNNING = 3
#: How far back proposals read.
LOOKBACK = 90
#: Rated tasks on a goal before proposals are scoped to it rather than to everything.
GOAL_FLOOR = 12
#: A sitting longer than this is a timer left running, not a session.
LONGEST_SESSION = 6 * 3600
#: Session lengths for the "shorter" test: long is over LONG, short is up to SHORT.
SHORT, LONG = 60, 75
#: Rating gaps under these aren't worth proposing a test for.
PART_GAP, LENGTH_GAP, EASY_GAP = 0.25, 0.3, 0.4
#: Under this share of goal sessions first in the day, "do it first" is worth testing.
FIRST_SHARE = 0.3
#: Parts of the day, by the hour each starts (same hours as backend/tracking/mood.py).
PARTS = (('Morning', 5), ('Afternoon', 12), ('Evening', 17), ('Late hours', 22))
PART_WORD = {'Morning': 'Morning', 'Afternoon': 'Afternoon', 'Evening': 'Evening', 'Late hours': 'Late-night'}
IN_PART = {'Morning': 'in the morning', 'Afternoon': 'in the afternoon',
           'Evening': 'in the evening', 'Late hours': 'late at night'}

#: For the reason that comes up most, the change to test and how to do it.
FOR_REASON = {
    'distracted': ('Phone in another room', 'Put your phone in another room for every session.'),
    'unclear': ('Write the first step first', 'Before you start, write down the very first step.'),
    'underestimated': ('Cut tasks in half', 'Split each task into two before you start it.'),
    'no-time': ('Book 50% more time', 'Give each session half again as long as you think it needs.'),
    'low-energy': ('Work while you feel fresh', 'Do these sessions in the first half of your day.'),
    'interrupted': ('No interruptions', 'Pick a time and place nobody can reach you.'),
}

#: What each kind of test is, how it's judged and what it measures.
KINDS = {
    'time_of_day': {'design': 'split', 'measure': 'rating'},
    'shorter': {'design': 'split', 'measure': 'rating'},
    'first_thing': {'design': 'split', 'measure': 'rating'},
    'daily': {'design': 'before_after', 'measure': 'days'},
    'reason': {'design': 'before_after', 'measure': 'reason'},
    'check_easy': {'design': 'before_after', 'measure': 'rating'},
    'custom': {'design': 'before_after', 'measure': 'rating'},
}
MEASURE_WORDS = {'rating': 'How your sessions rate', 'days': 'Days you work on it'}

#: What the page says for each verdict: a headline and what to do now.
VERDICTS = {
    'better': ('It worked', 'Keep doing it.'),
    'worse': ('It made things worse', 'Drop it and try something else.'),
    'same': ('No real difference', "It didn't matter. Drop it, or test something bigger."),
    'leaning_better': ('Looks better, not proven yet', 'Run it another week to be sure.'),
    'leaning_worse': ('Looks worse, not proven yet', 'Run it another week to be sure.'),
    'thin': ('Not enough sessions to tell', 'Run it again and do more sessions the new way.'),
    'early': ('Too early to tell', ''),
}
TONE = {'better': 'good', 'worse': 'bad', 'same': 'flat', 'leaning_better': 'good',
        'leaning_worse': 'bad', 'thin': 'flat', 'early': 'flat'}


# ---------------------------------------------------------------------------
# Reading tasks
# ---------------------------------------------------------------------------
def _day(raw: Any) -> Optional[date]:
    return record._day(raw)


def _rating(task: Dict[str, Any]) -> Optional[float]:
    value = task.get('execution')
    return float(value) if isinstance(value, (int, float)) and 1 <= value <= 5 else None


def _level(task: Dict[str, Any]) -> Optional[float]:
    value = task.get('difficulty')
    return float(value) if isinstance(value, (int, float)) and 1 <= value <= 5 else None


def _seconds(task: Dict[str, Any]) -> Optional[int]:
    try:
        value = int(task.get('completion_seconds') or 0)
    except (TypeError, ValueError):
        return None
    return value if 0 < value <= LONGEST_SESSION else None


def _started(task: Dict[str, Any]) -> Optional[datetime]:
    """When the session began: its finish, less how long it took when that's known."""
    raw = str(task.get('completed_at') or '')
    try:
        done = datetime.fromisoformat(raw[:19])
    except ValueError:
        return None
    if len(raw) < 13:
        return None
    seconds = _seconds(task)
    return done - timedelta(seconds=seconds) if seconds else done


def part_of(task: Dict[str, Any]) -> Optional[str]:
    began = _started(task)
    if began is None:
        return None
    named = [label for label, start in PARTS if began.hour >= start]
    return named[-1] if named else PARTS[-1][0]


def _study(tasks: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [task for task in tasks if task.get('status') == 'done' and _day(task.get('completed_at'))
            and kind_of(task) == 'study']


def _between(rows: Sequence[Dict[str, Any]], start: date, end: date) -> List[Dict[str, Any]]:
    return [task for task in rows if start <= _day(task['completed_at']) <= end]


def scoped(tasks: Sequence[Dict[str, Any]], scope: Dict[str, Any], goals: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The finished study work a test is about: on its goal, in its subject, or all of it."""
    rows = _study(tasks)
    if scope.get('subject'):
        rows = [task for task in rows if task.get('subject') == scope['subject']]
    goal = next((one for one in goals if str(one.get('id')) == str(scope.get('goal') or '')), None)
    if goal is not None:
        terms = goal_why.goal_terms(goal)
        rows = [task for task in rows if goal_why.is_direct(task, goal, terms)]
    return rows


def _firsts(tasks: Sequence[Dict[str, Any]]) -> set:
    """The id of the first study task finished on each day."""
    first: Dict[date, Any] = {}
    for task in sorted(_study(tasks), key=lambda row: str(row.get('completed_at'))):
        first.setdefault(_day(task['completed_at']), task.get('id'))
    return set(first.values())


def condition(kind: str, params: Dict[str, Any], tasks: Sequence[Dict[str, Any]]) -> Callable[[Dict[str, Any]], Optional[bool]]:
    """For a split test: whether a session went the new way. None when it can't be told."""
    if kind == 'time_of_day':
        wanted = params.get('part')
        return lambda task: None if part_of(task) is None else part_of(task) == wanted
    if kind == 'shorter':
        limit = int(params.get('minutes') or SHORT) * 60
        return lambda task: None if _seconds(task) is None else _seconds(task) <= limit
    if kind == 'first_thing':
        firsts = _firsts(tasks)
        return lambda task: task.get('id') in firsts
    return lambda task: None


# ---------------------------------------------------------------------------
# Judging a test
# ---------------------------------------------------------------------------
def _verdict(read: Dict[str, Any], better: bool) -> str:
    if read['tier'] == evidence.INSUFFICIENT:
        return 'same' if read['noise'] else 'thin'
    if not read['clear']:
        return 'leaning_better' if better else 'leaning_worse'
    return 'better' if better else 'worse'


def _short(day: date) -> str:
    return '{} {}'.format(day.strftime('%b'), day.day)


def window(row: Dict[str, Any], today: date) -> Dict[str, Any]:
    start, ends = _day(row['started_on']), _day(row['ends_on'])
    length = (ends - start).days + 1
    upto = min(ends, today)
    return {'start': start, 'ends': ends, 'upto': upto, 'length': length,
            'done': max(0, min(length, (upto - start).days + 1)),
            'before': (start - timedelta(days=length), start - timedelta(days=1))}


def evaluate(row: Dict[str, Any], tasks: Sequence[Dict[str, Any]], goals: Sequence[Dict[str, Any]],
             today: date) -> Dict[str, Any]:
    """Where a test stands: its phase, progress, and what it shows so far."""
    kind = row['kind']
    params = row.get('params') or {}
    spec = KINDS.get(kind, KINDS['custom'])
    measure = params.get('measure', spec['measure']) if kind == 'custom' else spec['measure']
    span = window(row, today)
    status = row.get('status') or 'running'
    phase = ('stopped' if status == 'stopped' else 'decided' if status == 'done'
             else 'ready' if today > span['ends'] else 'running')
    scope = {'goal': row.get('goal_id') or '', 'subject': row.get('subject') or ''}
    rows = scoped(tasks, scope, goals)
    if kind == 'check_easy':
        rows = [task for task in rows if (_level(task) or 9) <= 2]
    during = _between(rows, span['start'], span['upto'])
    before = _between(rows, *span['before'])

    out = {'phase': phase, 'days_done': span['done'], 'days_total': span['length'],
           'started_on': span['start'].isoformat(), 'ends_on': span['ends'].isoformat(),
           'ends_label': _short(span['ends']), 'measure': MEASURE_WORDS.get(measure, measure),
           'design': spec['design'], 'adherence': None, 'chart': None, 'evidence': None,
           'compared_with': '', 'sessions': len(during)}

    if spec['design'] == 'split':
        went = condition(kind, params, tasks)
        new = [task for task in during if went(task) is True and _rating(task) is not None]
        old = [task for task in during if went(task) is False and _rating(task) is not None]
        out['adherence'] = {'done': len(new), 'of': len(new) + len(old)}
        if len(old) >= evidence.FLOOR:
            other, out['compared_with'] = old, 'Other sessions'
        else:
            other = [task for task in before if _rating(task) is not None]
            out['compared_with'] = 'The {} days before'.format(span['length'])
        a, b = [_rating(task) for task in other], [_rating(task) for task in new]
        read = evidence.means(a, b)
        out['chart'] = _bars([(out['compared_with'], a), ('The new way', b)])
        better = bool(a and b and mean(b) > mean(a))
        need = max(0, evidence.FLOOR - len(new))
    elif measure == 'days':
        ran = span['done']
        hit_now = len({_day(task['completed_at']) for task in during})
        hit_before = len({_day(task['completed_at']) for task in before})
        days_before = span['length']
        read = evidence.rates(hit_before, days_before, hit_now, max(1, ran))
        out['compared_with'] = 'The {} days before'.format(span['length'])
        out['chart'] = {'type': 'compare', 'max': 100, 'unit': '%', 'rows': [
            {'label': out['compared_with'], 'value': round(hit_before / days_before * 100),
             'text': '{}/{}'.format(hit_before, days_before)},
            {'label': 'During the test', 'value': round(hit_now / max(1, ran) * 100),
             'text': '{}/{}'.format(hit_now, ran)}]}
        better = hit_now / max(1, ran) > hit_before / days_before
        need = max(0, evidence.FLOOR - ran)
    elif measure == 'reason':
        key = params.get('reason')
        rated_now = [task for task in during if _rating(task) is not None]
        rated_before = [task for task in before if _rating(task) is not None]
        now_hits = sum(1 for task in rated_now if task.get('reason') == key)
        before_hits = sum(1 for task in rated_before if task.get('reason') == key)
        read = evidence.rates(before_hits, max(1, len(rated_before)), now_hits, max(1, len(rated_now)))
        # A thing that came up twice can't show a change, however many sessions sat around it.
        if not rated_before or not rated_now or before_hits + now_hits < evidence.FLOOR:
            read = evidence.counted(min(before_hits + now_hits, evidence.FLOOR - 1))
        out['compared_with'] = 'The {} days before'.format(span['length'])
        label = next_sessions.STRUGGLES.get(key, 'it')
        out['measure'] = 'How often "{}" comes up'.format(label)
        share = lambda hits, n: round(hits / n * 100) if n else 0  # noqa: E731
        out['chart'] = {'type': 'compare', 'max': 100, 'unit': '%', 'rows': [
            {'label': out['compared_with'], 'value': share(before_hits, len(rated_before)),
             'text': '{}/{}'.format(before_hits, len(rated_before))},
            {'label': 'During the test', 'value': share(now_hits, len(rated_now)),
             'text': '{}/{}'.format(now_hits, len(rated_now))}]}
        # Fewer is better here.
        better = bool(rated_now and rated_before and now_hits / len(rated_now) < before_hits / len(rated_before))
        need = max(0, evidence.FLOOR - len(rated_now))
    else:
        a = [r for r in map(_rating, before) if r is not None]
        b = [r for r in map(_rating, during) if r is not None]
        read = evidence.means(a, b)
        out['compared_with'] = 'The {} days before'.format(span['length'])
        out['chart'] = _bars([(out['compared_with'], a), ('During the test', b)])
        better = bool(a and b and mean(b) > mean(a))
        need = max(0, evidence.FLOOR - len(b))

    verdict = _verdict(read, better)
    if phase == 'running' and verdict in ('thin', 'same'):
        verdict = 'early'
    out['verdict'] = verdict
    out['tone'] = TONE[verdict]
    out['headline'], tip = VERDICTS[verdict]
    if verdict == 'early':
        tip = ('{} more {} and it can start to say.'.format(need, 'session' if need == 1 else 'sessions')
               if need else 'Keep going. It needs the full {} days to be fair.'.format(span['length']))
    if measure == 'reason' and verdict == 'thin':
        out['headline'] = 'Too rare to tell'
        tip = 'It barely came up either way. Keep the change if it feels better.'
    out['tip'] = tip
    out['evidence'] = read['label'] if evidence.speaks(read) else None
    return out


def _bars(groups: List[Any]) -> Dict[str, Any]:
    """Average ratings as bars on the 1-5 scale, with how many sessions are behind each."""
    return {'type': 'compare', 'max': 5, 'unit': '/ 5', 'rows': [
        {'label': label, 'value': round(mean(values), 1) if values else 0,
         'text': '{:.1f}'.format(mean(values)) if values else '-', 'n': len(values)}
        for label, values in groups]}


def describe(row: Dict[str, Any], tasks, goals, today: date, name_of=lambda key: key) -> Dict[str, Any]:
    """A stored test as the page draws it."""
    goal = next((one for one in goals if str(one.get('id')) == str(row.get('goal_id') or '')), None)
    scope = (str(goal.get('title')) if goal else name_of(row['subject']) if row.get('subject')
             else 'All your study work')
    found = evaluate(row, tasks, goals, today)
    # A decided test shows what it showed when the reader decided, not a fresh read.
    kept_result = row.get('result') if isinstance(row.get('result'), dict) else None
    if row.get('status') == 'done' and kept_result and row.get('verdict') in VERDICTS:
        found.update({key: kept_result[key] for key in ('chart', 'adherence', 'evidence', 'compared_with', 'sessions')
                      if key in kept_result})
        found.update(verdict=row['verdict'], tone=TONE[row['verdict']],
                     headline=kept_result.get('headline') or VERDICTS[row['verdict']][0], tip='')
    return {'id': row['id'], 'kind': row['kind'], 'title': row.get('title') or '', 'why': row.get('why') or '',
            'how': (row.get('params') or {}).get('how', ''), 'scope': scope,
            'kept': None if row.get('kept') is None else bool(row.get('kept')),
            'decided_at': row.get('decided_at'), **found}


# ---------------------------------------------------------------------------
# Proposing tests
# ---------------------------------------------------------------------------
def _figure(value: float) -> str:
    return '{:.1f}'.format(value)


def _template(kind: str, title: str, why: str, scope: Dict[str, Any], score: float, **params) -> Dict[str, Any]:
    spec = KINDS[kind]
    return {'kind': kind, 'title': title, 'why': why, 'how': params.pop('how', ''), 'params': params,
            'goal': scope.get('goal') or '', 'subject': scope.get('subject') or '',
            'measure': MEASURE_WORDS.get(spec['measure'], ''), 'design': spec['design'], 'score': score}


def _by_part(rows: Sequence[Dict[str, Any]], scope, aim) -> Optional[Dict[str, Any]]:
    groups: Dict[str, List[float]] = defaultdict(list)
    for task in rows:
        part, rating = part_of(task), _rating(task)
        if part and rating is not None:
            groups[part].append(rating)
    sized = {part: values for part, values in groups.items() if len(values) >= evidence.FLOOR}
    if len(sized) < 2:
        return None
    best = max(sized, key=lambda part: mean(sized[part]))
    usual = max(sized, key=lambda part: len(sized[part]))
    gap = mean(sized[best]) - mean(sized[usual])
    if best == usual or gap < PART_GAP:
        return None
    return _template('time_of_day', 'Do {} sessions {}'.format(aim, IN_PART[best]),
                     '{} sessions rate {}. {} ones, where most of yours are, rate {}.'.format(
                         PART_WORD[best], _figure(mean(sized[best])), PART_WORD[usual], _figure(mean(sized[usual]))),
                     scope, gap * min(len(sized[best]), 10), part=best,
                     how='Schedule them {} for the next two weeks.'.format(IN_PART[best]))


def _by_reason(rows: Sequence[Dict[str, Any]], scope) -> Optional[Dict[str, Any]]:
    named = Counter(task['reason'] for task in rows if task.get('reason') in next_sessions.STRUGGLES)
    if not named:
        return None
    key, count = named.most_common(1)[0]
    if count < evidence.FLOOR or key not in FOR_REASON:
        return None
    title, how = FOR_REASON[key]
    found = _template('reason', title, '"{}" came up {} times in the last {} days.'.format(
        next_sessions.STRUGGLES[key], count, LOOKBACK), scope, float(count), reason=key, how=how)
    found['measure'] = 'How often "{}" comes up'.format(next_sessions.STRUGGLES[key])
    return found


def _by_length(rows: Sequence[Dict[str, Any]], scope) -> Optional[Dict[str, Any]]:
    long_, short = [], []
    for task in rows:
        seconds, rating = _seconds(task), _rating(task)
        if seconds is None or rating is None:
            continue
        if seconds > LONG * 60:
            long_.append(rating)
        elif seconds <= SHORT * 60:
            short.append(rating)
    if min(len(long_), len(short)) < evidence.FLOOR or mean(short) - mean(long_) < LENGTH_GAP:
        return None
    return _template('shorter', 'Keep sessions under {} minutes'.format(SHORT),
                     'Sessions over {} minutes rate {}, shorter ones {}.'.format(
                         LONG, _figure(mean(long_)), _figure(mean(short))),
                     scope, (mean(short) - mean(long_)) * min(len(long_), 10), minutes=SHORT,
                     how='Stop at {} minutes, even mid-problem. Pick it up next time.'.format(SHORT))


def _by_level(rows: Sequence[Dict[str, Any]], scope) -> Optional[Dict[str, Any]]:
    easy = [r for r in (_rating(t) for t in rows if (_level(t) or 9) <= 2) if r is not None]
    hard = [r for r in (_rating(t) for t in rows if (_level(t) or 0) >= 4) if r is not None]
    if min(len(easy), len(hard)) < evidence.FLOOR or mean(hard) - mean(easy) < EASY_GAP:
        return None
    return _template('check_easy', 'Check easy work before calling it done',
                     'Easy work rates {}, hard work {}.'.format(_figure(mean(easy)), _figure(mean(hard))),
                     scope, (mean(hard) - mean(easy)) * min(len(easy), 10),
                     how='Before you tick off an easy task, go over it once more.')


def _by_cadence(focus: Optional[Dict[str, Any]], scope) -> Optional[Dict[str, Any]]:
    if not focus or focus.get('state') not in ('behind', 'stalled') or not focus.get('needs'):
        return None
    return _template('daily', 'One {} session every day'.format(focus['title']),
                     'It needs {:g} sessions a week and gets {:g}.'.format(focus['needs'], focus.get('pace') or 0),
                     scope, 8.0, how='Even a short one counts. The point is not missing a day.')


def _by_order(rows: Sequence[Dict[str, Any]], tasks, scope, aim) -> Optional[Dict[str, Any]]:
    if not scope.get('goal') or len(rows) < 10:
        return None
    firsts = _firsts(tasks)
    first = sum(1 for task in rows if task.get('id') in firsts)
    if first / len(rows) >= FIRST_SHARE:
        return None
    return _template('first_thing', 'Do {} first each day'.format(aim),
                     'Only {} of your last {} sessions on it came first in the day.'.format(first, len(rows)),
                     scope, 3.0, how='Make it the first thing you work on, before anything else.')


def propose(tasks: Sequence[Dict[str, Any]], goals: Sequence[Dict[str, Any]], decision: Dict[str, Any],
            today: date, running: Sequence[Dict[str, Any]] = (), scope: Optional[Dict[str, Any]] = None,
            most: int = 3) -> List[Dict[str, Any]]:
    """Tests worth running, best first. Scoped to the plan's top goal when it has the work."""
    focus = decision.get('focus') or {}
    top = next((row for row in decision.get('goals') or [] if row['goal_id'] == focus.get('goal_id')), None)
    since = today - timedelta(days=LOOKBACK)
    if scope is None:
        scope = {'goal': focus.get('goal_id') or '', 'subject': ''}
    aim = next((str(goal.get('title')) for goal in goals if str(goal.get('id')) == scope.get('goal')), '')
    rows = _between(scoped(tasks, scope, goals), since, today)
    if sum(1 for task in rows if _rating(task) is not None) < GOAL_FLOOR and not scope.get('subject'):
        scope = {'goal': '', 'subject': ''}
        aim = ''
        rows = _between(scoped(tasks, scope, goals), since, today)
    label = aim or 'study'
    found = [_by_part(rows, scope, label), _by_reason(rows, scope), _by_length(rows, scope), _by_level(rows, scope),
             _by_order(rows, tasks, scope, label)]
    if top and scope.get('goal') == top['goal_id']:
        found.append(_by_cadence({**top, 'title': top['title']}, scope))
    taken = {(row['kind'], str(row.get('goal_id') or ''), str(row.get('subject') or '')) for row in running}
    out = [one for one in found if one and (one['kind'], one['goal'], one['subject']) not in taken]
    out.sort(key=lambda one: -one['score'])
    for one in out:
        one['scope'] = aim or 'All your study work'
    return out[:most]


def validate(kind: str, params: Dict[str, Any]) -> Optional[str]:
    """Why a test can't be started as asked, or None."""
    if kind not in KINDS:
        return "That isn't a test Summit can run."
    if kind == 'time_of_day' and params.get('part') not in IN_PART:
        return 'Pick a part of the day.'
    if kind == 'reason' and params.get('reason') not in FOR_REASON:
        return 'Pick something that goes wrong.'
    if kind == 'shorter':
        try:
            if not 10 <= int(params.get('minutes') or 0) <= 240:
                return 'Pick a length between 10 and 240 minutes.'
        except (TypeError, ValueError):
            return 'Pick a length in minutes.'
    if kind == 'custom' and params.get('measure', 'rating') not in ('rating', 'days'):
        return 'Pick what to measure.'
    return None
