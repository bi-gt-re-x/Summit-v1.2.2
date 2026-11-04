"""Activity, output, progress, mastery: four questions that stay apart.

## Why this exists

XP is a proxy for productivity. A finished task is a proxy for progress. Focus
time is a proxy for effort. None of them says whether anything was achieved, and
every total on the analytics page is built from them. Take two students:

    A  15 easy tasks a day, 1,000 XP, a 30-day streak, 4 hours on the timer.
    B  3 tasks a day, 300 XP, 2 hours, hard problems, closer to a competition.

Read by XP and streaks, A looks more productive and B looks like they're slipping.
So this keeps the four things those numbers get mistaken for apart:

    Activity   What did you do?          Finished tasks, days worked, focus, XP.
    Output     What did you produce?     Study work that was hard and went well,
                                         or was scored and mostly right.
    Progress   How much closer are you?  Goals with a real outcome that moved.
    Mastery    What can you do now?      Passed checks, new bests on measured
                                         records, problems right and wrong.

## The rule that keeps them apart

Each one reads its own evidence, and nothing on this list feeds another:

- XP and focus time are Activity and nothing else. They never reach the other
  three, so piling up easy work can't raise them.
- A routine (a life or health subject, planning, meditation) or something attended
  (a lecture, a meeting, a rehearsal) is Activity, however it was rated. Alpha rated
  "Evening review" hard and well, which says something about the evening, not about
  what got produced.
- An XP, streak, task or focus goal counts activity, so it isn't Progress. Only a
  goal with a number or checkpoints is an objective.
- A self-rating is never Mastery. It's how the student felt about the work, so it's
  reported as self-rated and not counted. Only something that could have come out
  the other way counts: a check, a right or wrong answer, a contest score, a time.

There's no total on purpose. Averaging the four would turn them back into one
number, and that's the problem this is here to fix.

## What the record can't say

A number goal's `current_value` has no history, and a checkpoint's steps have no
dates, so neither can say when it moved. Progress reads the dates that exist: when
a checkpoint was finished, and when a record tied to the goal set a new best.

Pure: `read` takes rows and a date. backend/api/measures.py is the only caller that
touches the database.
"""
import re
from collections import Counter
from datetime import date, timedelta
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from backend.tracking import goal_why, growth_reads, record, record_reads, topics
from backend.tracking.goal_health import measure_of, progress_of

#: The stretch all four read, against the same stretch before it. Long enough for a
#: checkpoint or a contest to land in it, and fixed so the four are about the same days.
WINDOW_DAYS = 30
#: How far back the self-rated line looks. Ratings take longer to settle.
SELF_RATED_DAYS = 90
#: Difficulty and execution, 1-5, for "hard and it went well".
HARD = 4
WELL = 4
#: A scored set this far right counts as produced, however it was rated.
PASS_SHARE = 0.6
#: Answers needed before an accuracy figure means much (see record.SCORE_FLOOR).
SCORE_FLOOR = record.SCORE_FLOOR
#: This many tasks in the window and "you did a lot" is a fair thing to say.
BUSY = 30
#: Under this share of the work aimed at a goal, most of it isn't.
AIM_LOW = 0.25
#: A move this much worse than the task count's means hard work went first.
FELL_FASTER = 10
#: A goal this close is what the plan is built around (backend/tracking/priority.py).
PRESSING_DAYS = 45

#: Things attended rather than produced. WORKED lets "Review lecture notes" through.
ATTENDED = re.compile(
    r'\b(lectures?|seminars?|sections?|class(es)?|meetings?|rehearsals?|lessons?|'
    r'reading group|office hours|webinars?|talks?)\b', re.I)
WORKED = re.compile(r'\b(problems?|exercises?|notes|review|solve|write|set)\b', re.I)
SOCIAL = re.compile(r'\b(lunch|dinner|brunch|coffee|catch[- ‑]?up|party)\b', re.I)
#: A record that counts how much was done rather than how good it is. "Longest
#: streak" is Activity. A record with a target ("AIME problems: 4 / 15") is a score.
ACTIVITY_RECORD = re.compile(
    r'streak|longest|largest|best (xp|week|day|month)|focus|hours?|sessions?|tasks?|'
    r'papers read|solved', re.I)


def _day(raw: Any) -> Optional[date]:
    try:
        return date.fromisoformat(str(raw or '')[:10])
    except ValueError:
        return None


def _num(raw: Any) -> float:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return 0.0


def _plural(count: int, word: str, many: Optional[str] = None) -> str:
    return '{:,} {}'.format(count, word if count == 1 else (many or word + 's'))


def _change(now: float, before: float, word: str = 'the 30 days before') -> str:
    """How a figure moved, in words the card can print under it."""
    if now == before:
        return 'same as {}'.format(word)
    return '{} from {:,}'.format('up' if now > before else 'down', int(before))


def _percent(now: float, before: float) -> Optional[int]:
    return round((now - before) / before * 100) if before > 0 else None


def kind_of(task: Dict[str, Any]) -> str:
    """'routine', 'attended' or 'study': what kind of thing this task was."""
    title = str(task.get('title') or '')
    if growth_reads.routine(task.get('subject') or '') or SOCIAL.search(title):
        return 'routine'
    if ATTENDED.search(title) and not WORKED.search(title):
        return 'attended'
    return 'study'


def _finished(tasks: Sequence[Dict[str, Any]], start: date, end: date) -> List[Dict[str, Any]]:
    out = []
    for task in tasks:
        if task.get('status') != 'done':
            continue
        day = _day(task.get('completed_at'))
        if day and start <= day <= end:
            out.append(task)
    return out


def _score(task: Dict[str, Any]) -> Optional[Tuple[int, int]]:
    return record.score_of(task)


def _produced(task: Dict[str, Any]) -> bool:
    """Whether a study task counts as output: scored and mostly right, or hard and well."""
    score = _score(task)
    if score:
        return score[0] / score[1] >= PASS_SHARE
    return _num(task.get('difficulty')) >= HARD and _num(task.get('execution')) >= WELL


def _rated(task: Dict[str, Any]) -> bool:
    return bool(_score(task)) or (_num(task.get('difficulty')) > 0 and _num(task.get('execution')) > 0)


# --------------------------------------------------------------------------
# Activity
# --------------------------------------------------------------------------
def _activity(now: List[Dict[str, Any]], before: List[Dict[str, Any]], rollup: Dict[str, Dict[str, Any]],
              start: date, end: date) -> Dict[str, Any]:
    days = xp = 0
    focus = 0.0
    day = start
    while day <= end:
        row = rollup.get(day.isoformat())
        day += timedelta(days=1)
        if row:
            days += 1 if row.get('worked') else 0
            xp += row.get('xp') or 0
            focus += row.get('focus_seconds') or 0
    kinds = Counter(kind_of(task) for task in now)
    busywork = kinds['routine'] + kinds['attended']
    share = round(busywork / len(now) * 100) if now else 0

    if not now:
        suggests = "This suggests the list has gone quiet. One small task today is enough to restart it."
    elif share >= 50:
        suggests = ("This suggests {}% of your list is routines or time in a room. That's worth doing, "
                    "but don't read it as getting closer to anything.").format(share)
    else:
        suggests = ("This suggests most of your list is real study work, so this count means more than "
                    "most. Output says how it went.")
    return {
        'key': 'activity',
        'label': 'Activity',
        'question': 'What did you do?',
        'evidence': 'Counted',
        'figure': '{:,}'.format(len(now)),
        'unit': 'task finished' if len(now) == 1 else 'tasks finished',
        'now': len(now),
        'before': len(before),
        'change': _change(len(now), len(before)),
        'lines': ['{} worked, {:,} hours of focus and {:,} XP.'.format(
            _plural(days, 'day'), round(focus / 3600), round(xp))],
        'mix': [
            {'key': 'study', 'label': 'Study work', 'count': kinds['study']},
            {'key': 'routine', 'label': 'Routines', 'count': kinds['routine']},
            {'key': 'attended', 'label': 'Attended', 'count': kinds['attended']},
        ],
        'suggests': suggests,
    }


# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------
def _output(now: List[Dict[str, Any]], before: List[Dict[str, Any]]) -> Dict[str, Any]:
    study = [task for task in now if kind_of(task) == 'study']
    made = [task for task in study if _produced(task)]
    was = [task for task in before if kind_of(task) == 'study' and _produced(task)]
    unrated = sum(1 for task in study if not _rated(task))
    problems = sum((_score(task) or (0, record.problem_count(task.get('title')) or 0))[1] for task in study)
    top = Counter(str(task.get('title') or '') for task in made).most_common(2)

    lines = ['From {} of study work{}.'.format(
        _plural(len(study), 'task'),
        ', {} unrated and not counted'.format(unrated) if unrated else '')]
    if top:
        lines.append('Most of it: {}.'.format(' and '.join('{} ({})'.format(*row) for row in top)))
    if problems:
        lines.append('{} named in task titles or scores.'.format(_plural(problems, 'problem')))

    tasks_moved = _percent(len(now), len(before))
    moved = _percent(len(made), len(was))
    if not study:
        suggests = ("This suggests nothing on your list is study work right now. Add one task that "
                    "makes something, like a problem set or a draft.")
    elif moved is not None and moved <= -25 and tasks_moved is not None and tasks_moved >= 0:
        suggests = ("This suggests you're doing more, but less of it is hard work. Swap one easy task "
                    "for a hard one this week.")
    elif moved is not None and moved <= -25 and tasks_moved is not None and moved < tasks_moved - FELL_FASTER:
        suggests = ("This suggests the hard work is going first. Tasks fell {}% but this fell {}%. Do one "
                    "hard task before your routines tomorrow.").format(-tasks_moved, -moved)
    elif moved is not None and moved <= -25:
        suggests = ("This suggests real work fell about as fast as everything else. One hard task a day "
                    "is the first thing to get back.")
    elif unrated >= max(5, len(study) * 0.3):
        suggests = ("This suggests the count is probably low, since {} study tasks have no rating. Rate "
                    "them when you finish, so real work shows up here.").format(unrated)
    elif len(made) > len(was):
        suggests = "This suggests more of your time is going into work that counts. Keep the hard task first."
    else:
        suggests = "This suggests a steady amount of real work. If you want more, add it here before adding tasks."
    return {
        'key': 'output',
        'label': 'Output',
        'question': 'What did you produce?',
        'evidence': 'Scored and rated' if any(_score(task) for task in study) else 'Your ratings',
        'figure': '{:,}'.format(len(made)),
        'unit': 'hard task done well' if len(made) == 1 else 'hard tasks done well',
        'now': len(made),
        'before': len(was),
        'change': _change(len(made), len(was)),
        'lines': lines,
        'suggests': suggests,
    }


# --------------------------------------------------------------------------
# Progress
# --------------------------------------------------------------------------
def _is_objective(goal: Dict[str, Any]) -> bool:
    return measure_of(goal) in ('number', 'milestones')


def _short(day: date) -> str:
    return '{} {}'.format(day.strftime('%b'), day.day)


def _moves(goals: Sequence[Dict[str, Any]], records: Sequence[Dict[str, Any]],
           tasks: Sequence[Dict[str, Any]], start: date, end: date, today: date) -> List[Dict[str, Any]]:
    """Every dated sign an objective moved inside [start, end], newest first."""
    out = []
    for goal in goals:
        for stone in goal.get('milestones') or []:
            day = _day(stone.get('completed_at'))
            if stone.get('status') == 'done' and day and start <= day <= end:
                out.append({'goal': str(goal.get('id')), 'title': str(goal.get('title') or ''), 'on': day,
                            'what': 'finished "{}"'.format(stone.get('title') or 'a checkpoint')})
    used = Counter(str(task.get('subject') or '') for task in tasks)
    live = [goal for goal in goals if goal.get('status') == 'active']
    for row in record_reads.group(records):
        figures = record_reads.stats(row, today)
        steps = [step for step in figures['steps'] if start <= _day(step['on']) <= end]
        if not steps:
            continue
        info = record_reads.infer(row['name'], row['category'], row['note'], used)
        for tied in record_reads.goals_for(row, info, figures, live, today):
            step = steps[-1]
            out.append({'goal': tied['id'], 'title': tied['title'], 'on': _day(step['on']),
                        'what': '{} reached {}'.format(
                            row['name'], record_reads.fmt(step['value'], row['unit'], row['target']))})
    out.sort(key=lambda move: move['on'], reverse=True)
    return out


def _progress(goals: Sequence[Dict[str, Any]], records: Sequence[Dict[str, Any]],
              tasks: Sequence[Dict[str, Any]], now: List[Dict[str, Any]],
              start: date, end: date, before_start: date, before_end: date, today: date,
              focus: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    objectives = [goal for goal in goals if _is_objective(goal)]
    live = [goal for goal in objectives if goal.get('status') == 'active']
    counters = [goal for goal in goals if goal.get('status') == 'active' and not _is_objective(goal)]
    moves = _moves(objectives, records, tasks, start, end, today)
    moved = {move['goal'] for move in moves}
    moved_before = {move['goal'] for move in _moves(objectives, records, tasks, before_start, before_end, today)}
    # A goal finished this month was an objective this month, though it's closed now.
    total = len({str(goal.get('id')) for goal in live} | moved)

    terms = [(goal, goal_why.goal_terms(goal)) for goal in live]
    aimed = sum(1 for task in now if any(goal_why.is_direct(task, goal, found) for goal, found in terms))

    dated = sorted(((_day(goal.get('deadline')), goal) for goal in live
                    if _day(goal.get('deadline')) and _day(goal.get('deadline')) >= today),
                   key=lambda row: row[0])
    nearest = None
    if dated:
        due, goal = dated[0]
        nearest = {'title': str(goal.get('title') or ''), 'percent': round(progress_of(goal)),
                   'days_left': (due - today).days, 'next': goal_why.next_step(goal)}
    # What the priority engine picked, when it picked. Two panels naming two different
    # goals as the place to go next would be the page arguing with itself.
    if focus:
        nearest = {'title': focus['title'], 'percent': focus['percent'], 'days_left': focus['days_left'],
                   'next': focus['next']}

    lines = []
    seen = set()
    for move in moves:
        if move['goal'] not in seen and len(seen) < 2:
            seen.add(move['goal'])
            lines.append('{}: {} on {}.'.format(move['title'], move['what'], _short(move['on'])))
    if live:
        lines.append('{} of {} went at one of these goals.'.format(aimed, _plural(len(now), 'task')))
    if counters:
        first = str(counters[0].get('title') or '')
        lines.append('Not counted: {}{}. {} activity.'.format(
            first, ' and {} more'.format(len(counters) - 1) if len(counters) > 1 else '',
            'It counts' if len(counters) == 1 else 'They count'))

    if not total:
        suggests = ("This suggests nothing here can tell you if you're getting closer. Add a goal with a "
                    "number or checkpoints, like a contest score or a rating.")
    else:
        where = ''
        if nearest and nearest['days_left'] is not None:
            where = ' {} has {} left and is {}% done.'.format(
                nearest['title'], _plural(nearest['days_left'], 'day'), nearest['percent'])
        if not moved:
            suggests = "This suggests your work isn't landing on your goals yet.{}".format(where)
        elif now and aimed / len(now) < AIM_LOW:
            suggests = "This suggests your goals are moving on a small part of your time.{}".format(where)
        else:
            suggests = "This suggests your work is reaching your goals. Keep it there.{}".format(where)
    return {
        'key': 'progress',
        'label': 'Progress',
        'question': 'How much closer are you?',
        'evidence': 'Your goals',
        'figure': '{} of {}'.format(len(moved), total) if total else '0',
        'unit': 'goals moved',
        'now': len(moved),
        'before': len(moved_before),
        'change': _change(len(moved), len(moved_before)),
        'lines': lines,
        'suggests': suggests,
        'total': total,
        'aimed': aimed,
        'nearest': nearest,
    }


# --------------------------------------------------------------------------
# Mastery
# --------------------------------------------------------------------------
def _skill_record(row: Dict[str, Any]) -> bool:
    """A record that measures how good, not how much."""
    return bool(row['target']) or not ACTIVITY_RECORD.search(row['name'])


def _answers(tasks: Sequence[Dict[str, Any]], attempts: Sequence[Dict[str, Any]],
             start: date, end: date) -> Tuple[int, int]:
    """Problems right, out of problems answered, in [start, end]."""
    right = worked = 0
    for task in _finished(tasks, start, end):
        score = _score(task)
        if score:
            right += score[0]
            worked += score[1]
    for row in attempts:
        day = _day(row.get('at'))
        if day and start <= day <= end:
            right += int(_num(row.get('correct')))
            worked += int(_num(row.get('attempted')))
    return right, worked


def _self_rated(tasks: Sequence[Dict[str, Any]], today: date) -> Optional[str]:
    """The strongest improvement the reader's own ratings claim. Not proof."""
    since = today - timedelta(days=SELF_RATED_DAYS - 1)
    recent = _finished(tasks, since, today)
    sessions = [one for one in (growth_reads.session(task) for task in recent) if one]
    found = [item for item in growth_reads.improvements(sessions, since, topics.taxonomy())
             if item['group'] == 'improved']
    if not found:
        return None
    best = max(found, key=lambda item: item['weight'])
    return '{}. {}'.format(best['title'], best['detail'])


def _mastery(tasks: Sequence[Dict[str, Any]], records: Sequence[Dict[str, Any]],
             attempts: Sequence[Dict[str, Any]], checks: Sequence[Dict[str, Any]],
             ready: Sequence[Dict[str, Any]], name_of_node: Callable[[str], str],
             start: date, end: date, before_start: date, before_end: date, today: date,
             focus: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    passed = [row for row in checks if row.get('passed') and _day(row.get('finished_at'))]
    proofs = [{'on': _day(row.get('finished_at')), 'what': 'passed the {} check'.format(
        name_of_node(str(row.get('node_id') or '')))} for row in passed]
    for row in record_reads.group(records):
        if not _skill_record(row):
            continue
        for step in record_reads.stats(row, today)['steps']:
            proofs.append({'on': _day(step['on']), 'what': '{} {}'.format(
                row['name'], record_reads.fmt(step['value'], row['unit'], row['target']))})
    proofs.sort(key=lambda proof: proof['on'], reverse=True)
    now = [proof for proof in proofs if start <= proof['on'] <= end]
    was = [proof for proof in proofs if before_start <= proof['on'] <= before_end]

    right, worked = _answers(tasks, attempts, start, end)
    right_was, worked_was = _answers(tasks, attempts, before_start, before_end)

    lines = []
    for proof in now[:2]:
        lines.append('{}: {}.'.format(_short(proof['on']), proof['what']))
    if worked >= SCORE_FLOOR:
        was_share = ' (was {}%)'.format(round(right_was / worked_was * 100)) if worked_was >= SCORE_FLOOR else ''
        lines.append('{} of {} right, {}%{}.'.format(right, _plural(worked, 'problem'),
                                                     round(right / worked * 100), was_share))
    else:
        lines.append('No problems marked right or wrong.' if not worked
                     else 'Only {} marked right or wrong so far.'.format(_plural(worked, 'problem')))
    if not now and proofs:
        last = proofs[0]
        lines.append('Your last proof was {} on {}, {}.'.format(last['what'], _short(last['on']), last['on'].year))
    claim = _self_rated(tasks, today)
    if claim:
        lines.append('Self-rated, so not counted: {}'.format(claim))

    check = None
    if ready:
        first = ready[0]
        check = {'name': first['name'], 'sessions': first['sessions'],
                 'to': '/skill-trees?node={}&check=1'.format(first['node_id'])}
    if now:
        suggests = "This suggests the work is turning into things you can actually do. Keep testing it."
    elif check:
        suggests = ("This suggests you may know more than you can show. You've done {} on {} and nothing has "
                    "tested it.").format(_plural(check['sessions'], 'session'), check['name'])
        # The plan decides what comes first, and this shouldn't talk over it.
        pressing = focus and focus.get('days_left') is not None and focus['days_left'] <= PRESSING_DAYS
        suggests += (' Take the check once {} has had its time.'.format(focus['title']) if pressing
                     else ' Take the check, since it only takes a few minutes.')
    else:
        suggests = ("This suggests nothing has measured your skill lately. Mark problems right or wrong in "
                    "the Skill Tree, or log a real score as a record.")
    out = {
        'key': 'mastery',
        'label': 'Mastery',
        'question': 'What can you do now?',
        'evidence': 'Tested' if now or worked else 'Not tested',
        'figure': '{:,}'.format(len(now)),
        'unit': 'skill proven' if len(now) == 1 else 'skills proven',
        'now': len(now),
        'before': len(was),
        'change': _change(len(now), len(was)),
        'lines': lines,
        'suggests': suggests,
    }
    if check:
        out['to'] = check['to']
        out['action'] = 'Take the {} check'.format(check['name'])
    return out


# --------------------------------------------------------------------------
# What the four say together
# --------------------------------------------------------------------------
def _reading(activity: Dict[str, Any], output: Dict[str, Any], progress: Dict[str, Any],
             mastery: Dict[str, Any]) -> Dict[str, Any]:
    """The one tension worth leading with. A sentence, never a score."""
    tasks, tasks_was = activity['now'], activity['before']
    moved, total, aimed = progress['now'], progress['total'], progress['aimed']
    nearest = progress['nearest']
    if not total:
        return {
            'kind': 'no-target',
            'headline': "You're getting things done, but nothing says if you're getting closer.",
            'figures': 'You finished {} and none of your goals has a number or checkpoints.'.format(
                _plural(tasks, 'task')),
            'suggests': ("This suggests your work has nothing to be measured against. Add one goal with a "
                         "real target."),
            'to': '/goals', 'action': 'Add a goal',
        }
    goal_share = moved / total
    aim_share = aimed / tasks if tasks else 0
    if tasks >= BUSY and (moved == 0 or (aim_share < AIM_LOW and goal_share < 0.34)):
        step = ''
        if nearest:
            step = ' Put your next three sessions on {}{}.'.format(
                nearest['title'], ': "{}"'.format(nearest['next']) if nearest['next'] else '')
        return {
            'kind': 'busy',
            'headline': "You did a lot, but most of it didn't move your goals.",
            'figures': '{} in 30 days. {} went at a goal, and {} of {} moved.'.format(
                _plural(tasks, 'task'), '{:,}'.format(aimed), moved, _plural(total, 'goal')),
            'suggests': "This suggests effort isn't the problem. Where it goes is.{}".format(step),
            'to': '/goals', 'action': 'Open Goals',
        }
    if moved and tasks < tasks_was:
        return {
            'kind': 'closer-on-less',
            'headline': "You're doing less, but you're getting closer.",
            'figures': 'Tasks went from {:,} to {:,}, and {} of {} moved.'.format(
                tasks_was, tasks, moved, _plural(total, 'goal')),
            'suggests': ("This suggests your work is well aimed. Don't add volume just to match your old "
                         "numbers."),
        }
    if moved and mastery['now']:
        return {
            'kind': 'proving',
            'headline': "You're getting closer, and you can show it.",
            'figures': '{} of {} moved, with {}.'.format(moved, _plural(total, 'goal'),
                                                         _plural(mastery['now'], 'skill') + ' proven'),
            'suggests': "This suggests what you're doing is working. Don't change it just to raise a total.",
        }
    if moved:
        return {
            'kind': 'moving',
            'headline': 'Your goals are moving, but nothing has tested the skill behind them.',
            'figures': '{} of {} moved, with {} proven.'.format(moved, _plural(total, 'goal'),
                                                                _plural(mastery['now'], 'skill')),
            'suggests': 'This suggests one real test would tell you how solid this is.',
            **({'to': mastery['to'], 'action': mastery['action']} if mastery.get('to') else {}),
        }
    if output['now']:
        return {
            'kind': 'untested',
            'headline': "The work looks good, but it hasn't reached your goals yet.",
            'figures': '{} done well, and {} of {} moved.'.format(
                _plural(output['now'], 'hard task'), moved, _plural(total, 'goal')),
            'suggests': 'This suggests the next step is pointing that work at one goal.',
            'to': '/goals', 'action': 'Open Goals',
        }
    return {
        'kind': 'quiet',
        'headline': "It's been a quiet month for your goals.",
        'figures': '{} and {} of {} moved.'.format(_plural(tasks, 'task'), moved, _plural(total, 'goal')),
        'suggests': 'This suggests starting small. One session on your nearest goal is enough to get moving.',
        'to': '/goals', 'action': 'Open Goals',
    }


def read(tasks: Sequence[Dict[str, Any]], goals: Sequence[Dict[str, Any]], records: Sequence[Dict[str, Any]],
         attempts: Sequence[Dict[str, Any]], checks: Sequence[Dict[str, Any]],
         rollup: Dict[str, Dict[str, Any]], today: date, ready: Sequence[Dict[str, Any]] = (),
         name_of_node: Callable[[str], str] = lambda node: node, days: int = WINDOW_DAYS,
         focus: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """The four measures over the last `days` days, and what they say together."""
    start = today - timedelta(days=days - 1)
    before_end = start - timedelta(days=1)
    before_start = before_end - timedelta(days=days - 1)
    now = _finished(tasks, start, today)
    before = _finished(tasks, before_start, before_end)

    activity = _activity(now, before, rollup, start, today)
    output = _output(now, before)
    progress = _progress(goals, records, tasks, now, start, today, before_start, before_end, today, focus)
    mastery = _mastery(tasks, records, attempts, checks, ready, name_of_node,
                       start, today, before_start, before_end, today, focus)
    return {
        'days': days,
        'from': start.isoformat(),
        'to': today.isoformat(),
        'before_from': before_start.isoformat(),
        'before_to': before_end.isoformat(),
        'reading': _reading(activity, output, progress, mastery),
        'measures': [activity, output, progress, mastery],
    }
