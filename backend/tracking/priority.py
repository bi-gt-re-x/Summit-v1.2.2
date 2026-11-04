"""What deserves your time right now, and what deliberately doesn't.

## Why this exists

The plan used to be a list of things the record could point at, ordered by weights.
Ask it about a student with an AMC 10 in three days, whose strongest subject is
Mathematics and weakest is Computer Science, and it would say to practice Computer
Science. That's a true fact and terrible advice. Time is the limit, so a good answer
has to say what the time is for, and what it isn't for:

    What matters most?          The goal's own priority, set by the reader.
    What's time-sensitive?      The date, and the pace that date asks for.
    What gives the most back?   How much of the goal a session has really moved.
    What does it cost?          What that time then can't go to.
    What should you leave?      Everything that doesn't serve this, said out loud.

So this ranks goals first and tasks second. Only a goal with a real outcome (a number
or checkpoints) can lead: XP, streak, task and focus goals count activity, and they
move by themselves when the real work gets done (backend/tracking/measures.py).

## How a goal ranks

    score = matters x (0.2 + 0.8 x urgent) x (0.5 + 0.5 x returns)

Each part runs from 0 to 1, and the page prints the parts rather than the score, since
a decimal would claim a precision none of this has. The formula is a way to weigh three
things a student can check, not a model of anything.

- `matters` is the reader's own priority, out of 10.
- `urgent` starts from the date (10 / (days + 10): 0.77 at 3 days, 0.26 at 4 weeks) and
  moves with the pace. A goal behind schedule climbs toward 1, sooner the closer the
  date is. A goal well ahead of its pace falls away, because more time on it now buys
  little.
- `returns` is how much of the goal a session has moved so far, against the best of the
  reader's goals. With too few sessions to say, it's 0.5 and the page says it's unknown.
  A weak topic on the goal's syllabus adds a little, since that's where a session goes
  furthest.

A date inside CRUNCH_HARD days leads whatever the score says.

## How the time gets split

The budget goes to the top goal first. In a crunch it gets everything. Otherwise a second
goal gets a block only if there's room for a real SESSION, because ten minutes on a second
thing is just less time on the first. Goals that share a contest or a tree count as one
piece of work, so doing one also moves the other.

## What gets left alone

Whatever doesn't serve the goals getting time is taken out of the plan and named with its
reason, when a date is pressing. A weakest subject that no pressing goal needs is the
classic case. With nothing pressing, those rows stay but sit behind the goal work.

Pure: `decide` and `arrange` take rows and dates. backend/api/next.py is the only caller
that touches the database.
"""
import math
import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple

from backend.tracking import evidence, forecast, goal_why, record, topics
from backend.tracking.goal_health import measure_of, progress_of
from backend.tracking.measures import kind_of

#: Inside this many days, a date leads whatever the score says.
CRUNCH_HARD = 7
#: Inside this many days, a goal without a safe margin takes the whole budget.
CRUNCH_DAYS = 14
#: Inside this many days, a goal that's behind takes most of it.
PUSH_DAYS = 45
#: The shortest block worth splitting off for a second goal.
SESSION = 30
#: The share of the budget the top goal gets when it isn't a crunch.
PUSH_SHARE = 0.75
BALANCE_SHARE = 0.6
#: Pace against what's needed, above which a goal has room to wait.
SAFE_MARGIN = 1.25
EASY_MARGIN = 2.0
#: The most rows the page names as "leave these alone".
NOT_NOW_SHOWN = 4
#: Rows that say "go work on this" without a date behind them.
SOFT = ('weak-subject', 'slipping', 'neglected', 'goal-quiet', 'momentum', 'xp', 'stale',
        'review', 'skill', 'check', 'streak', 'stuck', 'misses', 'goal')
#: Rows that are noise beside a pressing goal, and not worth naming one by one.
QUIET_DROP = ('momentum', 'xp', 'streak')
#: How far back a student's real weekly capacity is read.
CAPACITY_DAYS = 28


def _short(day: date) -> str:
    return '{} {}'.format(day.strftime('%b'), day.day)


def _days(count: int) -> str:
    return '1 day' if count == 1 else '{:,} days'.format(count)


def _sessions(count: float) -> str:
    shown = '{:g}'.format(round(count, 1))
    return '{} {}'.format(shown, 'session' if float(shown) == 1 else 'sessions')


def is_objective(goal: Dict[str, Any]) -> bool:
    return goal.get('status') == 'active' and measure_of(goal) in ('number', 'milestones')


def _subjects(goal: Dict[str, Any]) -> set:
    found = set(record.subject_ids(goal))
    found.update(topics.scope(goal).get('subjects') or [])
    return found


def _margin(row: Dict[str, Any]) -> Optional[float]:
    """How far the current pace is above what the date needs. None when unknown."""
    need, pace = row.get('need_per_week'), row.get('per_week')
    if need is None or pace is None or need <= 0:
        return None
    return pace / need


def _urgency(days_left: Optional[int], row: Optional[Dict[str, Any]]) -> float:
    if days_left is None or row is None:
        return 0.05
    if row['state'] == 'done':
        return 0.0
    base = 10 / (max(days_left, 0) + 10)
    if row.get('out_of_reach'):
        return base * 0.5
    margin = _margin(row)
    if row['state'] == 'on_track':
        if margin is not None and margin >= EASY_MARGIN:
            return base * 0.35
        if margin is not None and margin >= SAFE_MARGIN:
            return base * 0.6
        return base * 0.85
    if row['state'] in ('behind', 'stalled'):
        short = 1.0 if margin is None else min(1.0, max(0.0, 1 - margin))
        return base + (1 - base) * short * 30 / (max(days_left, 0) + 30)
    return base


def stakes(goals: Sequence[Dict[str, Any]], tasks: Sequence[Dict[str, Any]], sittings: Sequence[Dict[str, Any]],
           today: date, name_of=lambda key: key) -> List[Dict[str, Any]]:
    """Every objective goal, read and ranked, best first."""
    rows = []
    for goal in goals:
        if not is_objective(goal):
            continue
        ends = record._day(goal.get('deadline'))
        if ends is not None and ends < today:
            ends = None
        days_left = (ends - today).days if ends else None
        read = forecast.forecast(goal, tasks, sittings, today, name_of) if ends else None
        percent = float(progress_of(goal))
        gain = None
        sessions = (read or {}).get('sessions') or 0
        if read and read.get('need_per_week') and days_left and percent < 100:
            needed = read['need_per_week'] * days_left / 7
            gain = (100 - percent) / needed if needed > 0 else None
        stones = [stone for stone in goal.get('milestones') or [] if stone.get('status') != 'done']
        rows.append({
            'goal': goal,
            'id': str(goal.get('id')),
            'title': str(goal.get('title') or 'Your goal'),
            'priority': float(goal.get('priority') or 5),
            'why': str(goal.get('why') or '').strip(),
            'deadline': ends,
            'days_left': days_left,
            'percent': round(percent),
            'state': read['state'] if read else 'undated',
            'read': read,
            'gain': gain,
            'sessions': sessions,
            'return_read': evidence.counted(sessions),
            'next': goal_why.next_step(goal),
            'waiting': max(0, len(stones) - 1),
            'subjects': _subjects(goal),
            'scope': topics.scope(goal),
            'urgent': _urgency(days_left, read),
        })
    if not rows:
        return []
    known = [row['gain'] for row in rows if row['gain'] and evidence.speaks(row['return_read'])]
    best = max(known) if known else None
    for row in rows:
        row['returns'] = (min(1.0, row['gain'] / best)
                          if best and row['gain'] and evidence.speaks(row['return_read']) else 0.5)
        matters = max(0.3, min(1.0, row['priority'] / 10))
        row['matters'] = matters
        row['score'] = matters * (0.2 + 0.8 * row['urgent']) * (0.5 + 0.5 * row['returns'])

    def rank(row):
        # A date this close leads, nearest first, unless it's already handled.
        pressing = (row['days_left'] is not None and row['days_left'] <= CRUNCH_HARD
                    and row['state'] != 'done' and not (row['read'] or {}).get('out_of_reach'))
        return (not pressing, row['days_left'] if pressing else 0, -row['score'], row['title'].lower())
    rows.sort(key=rank)
    return [row for row in rows if row['state'] != 'done'] + [row for row in rows if row['state'] == 'done']


def _shares_work(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
    """Whether working on one is working on the other: the same contest or tree."""
    return bool(set(a['scope'].get('contexts') or []) & set(b['scope'].get('contexts') or [])
                or set(a['scope'].get('trees') or []) & set(b['scope'].get('trees') or []))


def _capacity(tasks: Sequence[Dict[str, Any]], today: date) -> Tuple[float, Dict[str, Any]]:
    """Study sessions a week the reader really does, lately."""
    since = today - timedelta(days=CAPACITY_DAYS - 1)
    done = 0
    for task in tasks:
        if task.get('status') != 'done':
            continue
        day = record._day(task.get('completed_at'))
        if day and day >= since and kind_of(task) == 'study':
            done += 1
    return done * 7 / CAPACITY_DAYS, evidence.counted(done)


def _mode(top: Dict[str, Any]) -> str:
    days, read = top['days_left'], top['read'] or {}
    if days is None:
        return 'balance'
    margin = _margin(read)
    safe = top['state'] == 'on_track' and margin is not None and margin >= SAFE_MARGIN
    if days <= CRUNCH_HARD or (days <= CRUNCH_DAYS and not safe):
        return 'crunch'
    if days <= PUSH_DAYS and top['state'] in ('behind', 'stalled', 'missing'):
        return 'push'
    return 'balance'


def _round_five(minutes: float) -> int:
    return int(5 * round(minutes / 5))


def _split(ranked: List[Dict[str, Any]], mode: str, budget: int) -> List[Tuple[Dict[str, Any], int]]:
    """Who gets the minutes. A second goal only with room for a real session."""
    top = ranked[0]
    if mode == 'crunch':
        return [(top, budget)]
    share = PUSH_SHARE if mode == 'push' else BALANCE_SHARE
    mine = max(SESSION, _round_five(budget * share))
    rest = budget - mine
    other = next((row for row in ranked[1:] if row['state'] != 'done' and not _shares_work(top, row)), None)
    if other is None or rest < SESSION:
        return [(top, budget)]
    return [(top, mine), (other, rest)]


def _standing(row: Dict[str, Any]) -> str:
    """One line on where a goal stands: its time and its pace."""
    read = row['read'] or {}
    if row['days_left'] is None:
        return 'No date on it, so nothing here forces it this week.'
    left = _days(row['days_left'])
    if read.get('out_of_reach'):
        return "{} left, and even two sessions a day won't get there at the pace it has moved.".format(left)
    if row['state'] == 'on_track' and read.get('need_per_week') is not None:
        return '{} left. It needs {} a week and you do {}.'.format(
            left, _sessions(read['need_per_week']), read['per_week'])
    if row['state'] == 'behind' and read.get('need_per_week') is not None:
        return '{} left. It needs {} a week and you do {}.'.format(
            left, _sessions(read['need_per_week']), read['per_week'])
    if row['state'] == 'stalled':
        return '{} left, and no sessions on it lately.'.format(left)
    return '{} left. Too little on it yet to tell the pace.'.format(left)


def _leave_goal(row: Dict[str, Any], top: Dict[str, Any], until: str) -> Optional[Dict[str, Any]]:
    """Why a goal that isn't getting time this time can wait."""
    read = row['read'] or {}
    if row['state'] == 'done':
        return None
    if row['state'] == 'on_track':
        why = "It's on track. {} More time now won't change much.".format(_standing(row))
    elif read.get('out_of_reach'):
        why = "{} Move the date or shrink it before you put more hours in.".format(_standing(row))
    elif row['days_left'] is None:
        why = _standing(row)
    elif row['state'] in ('behind', 'stalled'):
        why = "{} It's next in line, but {} is closer.".format(_standing(row), top['title'])
    else:
        why = '{} Give it time {}.'.format(_standing(row), until)
    return {'key': 'goal-{}'.format(row['id']), 'title': row['title'], 'why': why}


def decide(goals: Sequence[Dict[str, Any]], tasks: Sequence[Dict[str, Any]], now: datetime, budget: int,
           sittings: Sequence[Dict[str, Any]] = (), name_of=lambda key: key,
           topic_rows: Sequence[Dict[str, Any]] = ()) -> Dict[str, Any]:
    """Where the time should go, why, what it costs and what to leave."""
    today = now.date()
    counters = [goal for goal in goals if goal.get('status') == 'active' and not is_objective(goal)]
    ranked = stakes(goals, tasks, sittings, today, name_of)
    live = [row for row in ranked if row['state'] != 'done']
    if not live:
        return {
            'mode': 'none', 'headline': None, 'focus': None, 'allocation': [], 'answers': [], 'not_now': [],
            'goals': [], 'counters': len(counters), 'stakes': [], 'until': None,
            'note': ('None of your goals has a number or checkpoints, so nothing here can say what '
                     'matters most. Add one and the plan will build around it.') if counters or goals else None,
        }
    top = live[0]
    mode = _mode(top)
    split = _split(live, mode, budget)
    given = {row['id'] for row, _ in split}
    until = 'after {}'.format(_short(top['deadline'])) if top['deadline'] and mode != 'balance' else 'once this is moving'

    # The best use of the time, from what the reader's own ratings say is weakest.
    # A topic with too few tasks behind it can't be called weak yet.
    best_use = None
    if topic_rows:
        plan = topics.plan(top['goal'], topic_rows)
        best_use = next((move for move in plan.get('moves') or [] if str(move.get('id')).startswith('weak-')), None)
        if best_use:
            behind = sum(int(row.get('tasks') or 0) for row in topic_rows if row.get('topic') == best_use.get('topic'))
            read = evidence.counted(behind)
            best_use = dict(best_use, read=read) if evidence.speaks(read) else None
    also = [row for row in live if row['id'] not in given and _shares_work(top, row)]

    allocation = []
    for row, minutes in split:
        allocation.append({
            'goal_id': row['id'], 'title': row['title'], 'minutes': minutes, 'step': row['next'],
            'subject': next(iter(sorted(row['subjects'])), None), 'days_left': row['days_left'],
            'state': row['state'], 'percent': row['percent'], 'waiting': row['waiting'],
            'best_use': best_use['title'] if best_use and row is top else None,
        })

    # ---- the answers -------------------------------------------------------
    answers = [_matters(top, live), _time_sensitive(top, live), _returns(top, best_use, also)]
    capacity, capacity_read = _capacity(tasks, today)
    answers.append(_cost(live, given, {row['id'] for row in also}, capacity, capacity_read))

    leave = []
    for row in live:
        if row['id'] in given or row in also:
            continue
        found = _leave_goal(row, top, until)
        if found:
            leave.append(found)
    # The least urgent last: on-track goals are the easy ones to set down.
    if counters:
        first = str(counters[0].get('title') or 'That goal')
        leave.append({
            'key': 'counters',
            'title': first if len(counters) == 1 else '{} and {} more'.format(first, len(counters) - 1),
            'why': ('{} activity, so {} when you do the work above. Chasing the count '
                    "won't get you closer to anything.").format(
                'It counts' if len(counters) == 1 else 'They count',
                'it moves' if len(counters) == 1 else 'they move'),
        })

    headline = {
        'crunch': '{} gets your time. It\'s {} away.'.format(top['title'], _days(top['days_left'] or 0)),
        'push': '{} comes first this week.'.format(top['title']),
        'balance': "Nothing is pressing, so {} gets the most time.".format(top['title']),
    }[mode]
    warning = None
    if (top['read'] or {}).get('out_of_reach'):
        warning = "Even two sessions a day won't get {} there at the pace it has moved. Think about moving the date.".format(top['title'])

    return {
        'mode': mode,
        'headline': headline,
        'warning': warning,
        'focus': {'goal_id': top['id'], 'title': top['title'], 'days_left': top['days_left'],
                  'percent': top['percent'], 'next': top['next'], 'state': top['state'],
                  'subject': next(iter(sorted(top['subjects'])), None)},
        'until': until,
        'allocation': allocation,
        'also': [row['title'] for row in also],
        'answers': answers,
        'not_now': leave,
        'counters': len(counters),
        'goals': [_row_out(row, given) for row in ranked],
        # For `arrange`, on the server only. api/next.py takes it off before replying.
        'stakes': [row for row, _ in split] + also,
    }


def _matters(top: Dict[str, Any], live: List[Dict[str, Any]]) -> Dict[str, str]:
    text = '{}: priority {:g} of 10.'.format(top['title'], top['priority'])
    higher = next((row for row in live[1:] if row['priority'] > top['priority']), None)
    if higher:
        text += " {} ranks higher, but {}.".format(
            higher['title'], 'it has no date' if higher['days_left'] is None
            else 'it has {}'.format(_days(higher['days_left'])))
    if top['why']:
        text += ' You said: "{}"'.format(top['why'])
    return {'key': 'matters', 'question': 'What matters most?', 'answer': text}


def _time_sensitive(top: Dict[str, Any], live: List[Dict[str, Any]]) -> Dict[str, str]:
    if top['days_left'] is None and not any(row['days_left'] is not None for row in live):
        text = 'Nothing. None of your goals has a date yet.'
    else:
        text = '{}: {}'.format(top['title'], _standing(top))
    return {'key': 'urgent', 'question': "What's time-sensitive?", 'answer': text}


def _returns(top: Dict[str, Any], best_use: Optional[Dict[str, Any]], also: List[Dict[str, Any]]) -> Dict[str, str]:
    read = top['return_read']
    if top['gain'] and evidence.speaks(read):
        text = 'A session has moved it about {:.1f}% so far, over {}. How sure: {}.'.format(
            top['gain'], _sessions(top['sessions']), read['label'].lower())
    else:
        text = "There aren't enough sessions yet to say what one buys. It's a guess until there are."
    if best_use:
        # Its first sentence, and "vs." doesn't end one.
        why = re.split(r'(?<!vs)\.\s', best_use['why'])[0].rstrip('.')
        text += ' {}, so that\'s where a session goes furthest. How sure: {}.'.format(
            why, best_use['read']['label'].lower())
    if also:
        text += ' It also moves {}.'.format(' and '.join(row['title'] for row in also[:2]))
    if top['next'] and top['waiting']:
        text += ' "{}" comes first, and {} more {} on it.'.format(
            top['next'], top['waiting'], 'checkpoint waits' if top['waiting'] == 1 else 'checkpoints wait')
    return {'key': 'return', 'question': 'What gives the most back?', 'answer': text}


def _cost(live: List[Dict[str, Any]], given: set, same_work: set, capacity: float,
          capacity_read: Dict[str, Any]) -> Dict[str, str]:
    asked = sum(min(7, math.ceil((row['read'] or {}).get('need_per_week') or 0)) for row in live
                if not (row['read'] or {}).get('out_of_reach'))
    # Not a goal that's the same work: that one moves anyway, so it costs nothing.
    next_best = next((row for row in live if row['id'] not in given and row['id'] not in same_work), None)
    parts = []
    if evidence.speaks(capacity_read) and capacity > 0 and asked > round(capacity):
        parts.append('Your goals ask for about {} a week and you do about {}, so something has to wait.'.format(
            _sessions(asked), _sessions(round(capacity))))
    if next_best:
        parts.append("This time can't also go to {}. {}".format(next_best['title'], _standing(next_best)))
    else:
        parts.append('Nothing else with a real target is competing for this time.')
    return {'key': 'cost', 'question': 'What does it cost?', 'answer': ' '.join(parts)}


def _row_out(row: Dict[str, Any], given: set) -> Dict[str, Any]:
    read = row['read'] or {}
    return {
        'goal_id': row['id'], 'title': row['title'], 'days_left': row['days_left'], 'state': row['state'],
        'percent': row['percent'], 'priority': row['priority'], 'gets_time': row['id'] in given,
        'needs': read.get('need_per_week'), 'pace': read.get('per_week'),
        'gain': round(row['gain'], 1) if row['gain'] and evidence.speaks(row['return_read']) else None,
        'gain_evidence': row['return_read']['label'] if evidence.speaks(row['return_read']) else None,
        'matters': 'High' if row['priority'] >= 8 else 'Medium' if row['priority'] >= 5 else 'Low',
    }


# ---------------------------------------------------------------------------
# Sessions written for the goal
# ---------------------------------------------------------------------------
def session_tasks(goal: Dict[str, Any], tasks: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The study work that's on this goal, for a model to plan its sessions from.

    The same rule the forecast uses: tasks linked to it or named for it, and every task
    in its subjects too until there are enough of those. What the model can't see, it
    can't suggest, which holds better than asking it to leave things out.
    """
    terms = goal_why.goal_terms(goal)
    direct = [task for task in tasks if goal_why.is_direct(task, goal, terms)]
    done = sum(1 for task in direct if task.get('status') == 'done' and task.get('completed_at'))
    found = list(direct)
    if done < forecast.MIN_DIRECT:
        seen = {task.get('id') for task in direct}
        subjects = _subjects(goal)
        found += [task for task in tasks if task.get('subject') in subjects and task.get('id') not in seen]
    return [task for task in found if kind_of(task) == 'study']


def _topic_line(row: Dict[str, Any]) -> str:
    """One topic the goal tests, and only as much as its tasks can support."""
    label = row.get('label') or 'A topic'
    if row.get('status') == 'untouched':
        return '{}: not started'.format(label)
    tasks = int(row.get('tasks') or 0)
    if not evidence.speaks(evidence.counted(tasks)):
        return '{}: {} so far, too few to say how it is going'.format(label, _sessions(tasks).replace('session', 'task'))
    rated = ', rated {:g} of 5'.format(row['execution']) if row.get('execution') is not None else ''
    return '{}: {} over {}{}'.format(label, row.get('status') or 'steady', _sessions(tasks).replace('session', 'task'), rated)


def session_block(decision: Dict[str, Any], goal: Dict[str, Any], topic_rows: Sequence[Dict[str, Any]]) -> str:
    """The section of a model's brief that says what the sessions are for."""
    focus = decision['focus']
    urgent = next((row['answer'] for row in decision['answers'] if row['key'] == 'urgent'), '')
    lines = ['Goal: {}'.format(focus['title']),
             'Where it stands: {}% done. {}'.format(focus['percent'], urgent)]
    if str(goal.get('why') or '').strip():
        lines.append('Why they want it: {}'.format(str(goal['why']).strip()[:200]))
    if focus['next']:
        lines.append('The next step on it: {}'.format(focus['next']))
    if focus['days_left'] is not None and focus['days_left'] <= CRUNCH_DAYS:
        lines.append('The date is close, so no new material: only timed practice and going over what they '
                     'already know is worth doing, and every session has to fit before the date.')
    plan = topics.plan(goal, topic_rows)
    if plan.get('contexts'):
        lines.append('What it is: {}'.format(', '.join(plan['contexts'])))
    position = plan.get('position') or []
    if position:
        lines.append('What it tests, and how each part is going:')
        lines += ['  {}'.format(_topic_line(row)) for row in position[:10]]
    for move in (plan.get('moves') or [])[:2]:
        lines.append('Practice that fits: {}'.format(move['title']))
    out = '\n\n<priority_goal>\n{}\n</priority_goal>'.format('\n'.join(lines))
    leave = [row['title'] for row in decision['not_now'] if str(row.get('key')).startswith('goal-')][:5]
    if leave:
        out += '\n\n<leave_alone>\n{}\n</leave_alone>'.format('\n'.join('  - {}'.format(title) for title in leave))
    return out


# ---------------------------------------------------------------------------
# Applying it to the plan
# ---------------------------------------------------------------------------
def _serves(item: Dict[str, Any], stakes_given: List[Dict[str, Any]], task_goals: Dict[Any, List[str]]) -> bool:
    ids = {row['id'] for row in stakes_given}
    if item.get('goalId') is not None and str(item['goalId']) in ids:
        return True
    if item.get('taskId') is not None and set(task_goals.get(item['taskId']) or []) & ids:
        return True
    subject = item.get('subject')
    return bool(subject and any(subject in row['subjects'] for row in stakes_given))


def _leave_row(item: Dict[str, Any], top_title: str, until: str, name_of) -> Optional[Dict[str, Any]]:
    """Why a row is being set down. None for the ones not worth naming."""
    kind, subject = item['kind'], item.get('subject')
    name = name_of(subject) if subject else None
    if kind in QUIET_DROP:
        return None
    if kind == 'weak-subject' and name:
        return {'key': item['id'], 'title': name,
                'why': "Your ratings are lowest here, but {} doesn't depend on it. Come back to it {}.".format(top_title, until)}
    if kind == 'neglected' and name:
        return {'key': item['id'], 'title': name,
                'why': "It's gone quiet, and no goal you're working toward needs it. Leave it, or archive it if it's done."}
    if kind == 'slipping' and name:
        return {'key': item['id'], 'title': name,
                'why': "It's slipped, but {} doesn't depend on it. Pick it back up {}.".format(top_title, until)}
    if kind == 'stale':
        return {'key': item['id'], 'title': item['title'].replace('Do or drop ', ''),
                'why': 'No date, and nothing pressing needs it. Decide on it {}.'.format(until)}
    return {'key': item['id'], 'title': item['title'],
            'why': "It doesn't serve {}, so it can wait. Come back to it {}.".format(top_title, until)}


def arrange(decision: Dict[str, Any], candidates: List[Dict[str, Any]], tasks: Sequence[Dict[str, Any]],
            focus_rows: Dict[str, Dict[str, Any]], name_of=lambda key: key) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """The plan's rows in the order the decision asks for, and what it set down.

    Returns (kept, left). With no goal to build around, the rows are unchanged.
    """
    if decision['mode'] == 'none':
        return candidates, []
    given = decision['stakes']
    given_ids = {row['id'] for row in given}
    task_goals = {}
    for task in tasks:
        ids = [str(one) for one in (task.get('goal_ids') or [])]
        if task.get('goal_id'):
            ids.append(str(task['goal_id']))
        if ids:
            task_goals[task.get('id')] = ids

    pressing = decision['mode'] in ('crunch', 'push')
    top_title = decision['focus']['title']
    until = decision['until']
    allocated = [row['goal_id'] for row in decision['allocation']]
    lead, quick, serving, dated, rest, left = [], [], [], [], [], []
    seen_left = set()

    def set_down(item):
        found = _leave_row(item, top_title, until, name_of)
        if found and found['key'] not in seen_left:
            seen_left.add(found['key'])
            left.append(found)

    # The goals getting time lead, each with the minutes it was given.
    for allot in decision['allocation']:
        row = focus_rows.get(allot['goal_id'])
        if row:
            lead.append(dict(row, minutes=allot['minutes']))

    for item in candidates:
        kind, goal_id = item['kind'], str(item.get('goalId')) if item.get('goalId') is not None else None
        if kind == 'deadline' and goal_id in allocated:
            continue  # Already leading, from `focus_rows`.
        if kind in ('deadline', 'goal', 'goal-quiet') and goal_id not in given_ids:
            # `decide` already speaks for these: an objective goal not getting time
            # has its reason, and a counter goal's row only asks for more activity.
            continue
        if kind == 'triage':
            quick.append(item)
            continue
        if _serves(item, given, task_goals):
            serving.append(item)
        elif kind in ('overdue', 'due'):
            dated.append(item)  # A date someone set is a commitment, so it stays.
        elif kind in SOFT:
            if pressing or kind == 'neglected':
                set_down(item)
            else:
                rest.append(item)
        else:
            rest.append(item)

    # Something real due tonight has to fit too, unless the goal itself is that close.
    # Routines and things attended don't take from this time.
    by_id = {task.get('id'): task for task in tasks}
    tonight = []
    if decision['mode'] != 'crunch':
        tonight = [item for item in dated if item['kind'] == 'due' and item.get('taskId') in by_id
                   and kind_of(by_id[item['taskId']]) == 'study']
        dated = [item for item in dated if item not in tonight]

    # Five minutes clearing the pile makes the rest of the list readable, so it fits in
    # beside the session. In a crunch, only after it.
    fitted = (quick if decision['mode'] != 'crunch' else []) + tonight
    if lead:
        room = sum(item['minutes'] for item in fitted)
        top = lead[0]
        lead[0] = dict(top, minutes=max(SESSION if top['minutes'] >= SESSION else top['minutes'], top['minutes'] - room))
    after = quick if decision['mode'] == 'crunch' else []
    return lead[:1] + fitted + lead[1:] + after + serving + dated + rest, left
