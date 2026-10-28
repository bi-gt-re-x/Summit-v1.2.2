"""The review queue: what you got wrong, brought back until you get it right.

A miss is the most useful thing the app records and, until this, the least
used: a wrong answer was counted into an accuracy and then forgotten. Here
every miss comes back after 1 day, then 3, 7 and 14, and leaves once it has
been got right at each of those gaps. That's spaced review, and it's the best
studied way there is to make something stick.

## What goes in

  problem   one of the skill tree's own problems marked "Missed it"
            (skill_attempts, source 'problem'). Done again by answering it.
  step      a batch logged against a step with misses in it (source 'log').
            There's no single problem to bring back, so the step comes back.
  set       a finished task with a score that wasn't full ("6 of 10").
            Done again by redoing the ones you missed, marked here.

Problems are reviewed by answering them, which writes a new attempt, so the
schedule is read off the attempts alone. Steps and sets have no problem to
answer, so their reviews are marks in review_marks (data/sql/review.sql).

## The schedule

Read from the item's history, oldest first, starting at its first miss:

  a miss               back to the start: due 1 day later
  a right answer       one rung up: due 3, then 7, then 14 days later,
                       then it's cleared
  right, same day      doesn't count. You've just seen the answer.

A step's history is its days: a day counts as right when 80% or more of what
was answered on it that day was right.

Nothing here writes. The queue is a reading of rows that already exist, which
is what keeps the GET a read (tests/test_get_requests_do_not_write.py).
"""
from datetime import date, timedelta

#: Days until the next review, by how many times it's been got right since
#: the last miss. Past the end, it's cleared.
LADDER = (1, 3, 7, 14)
#: A miss older than this, never reviewed, has gone stale. Leave it.
MISS_DAYS = 60
#: A step's day counts as right at this share.
STEP_BAR = 0.8
#: Rough minutes, for the "about 15 min" line.
PROBLEM_MINUTES = 3
STEP_MINUTES = 10
SET_MOST_MINUTES = 20
#: How many due items one sitting takes before it's too long to start.
SITTING = 12

RESULTS = ('right', 'missed')

_WEIGHT_WORD = {'warmup': 'Easy', 'core': 'Medium', 'stretch': 'Hard'}
_ORDINAL = {1: '1st', 2: '2nd', 3: '3rd', 4: '4th'}


def _day(value):
    try:
        return date.fromisoformat(str(value or '')[:10])
    except ValueError:
        return None


def _int(value):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def schedule(events, today):
    """Where one item stands, from its (day, right) history.

    Returns None when there's no miss to review, or a dict with `missed_on`
    (the miss the current run started from), `rung` (right answers since it),
    `due` (a date, or None once cleared), `cleared_on` and `last`.
    """
    events = sorted((day, ok) for day, ok in events if day is not None)
    start = rung = last = cleared_on = None
    for day, ok in events:
        if not ok:
            # A miss always restarts the climb, cleared or not.
            start, rung, last, cleared_on = day, 0, day, None
            continue
        if start is None or cleared_on is not None:
            continue
        if day <= last:
            continue
        rung += 1
        last = day
        if rung >= len(LADDER):
            cleared_on = day
    if start is None:
        return None
    due = None if cleared_on else last + timedelta(days=LADDER[rung])
    return {'missed_on': start, 'rung': rung, 'due': due, 'cleared_on': cleared_on, 'last': last}


# ---------------------------------------------------------------------------
# Histories
# ---------------------------------------------------------------------------
def problem_histories(attempts):
    """(node, ordinal, slot) -> [(day, right)] for marked problems."""
    out = {}
    for row in attempts:
        if row.get('source', 'problem') != 'problem' or row.get('slot') in (None, ''):
            continue
        key = (str(row.get('node_id')), _int(row.get('ordinal')), _int(row.get('slot')))
        out.setdefault(key, []).append((_day(row.get('at')), _int(row.get('correct')) > 0))
    return out


def step_histories(attempts, marks):
    """(node, ordinal) -> [(day, right)] for steps a logged batch had misses on.

    Every row on the step counts toward its days once it's in the queue, so
    answering its problems in the skill tree reviews it too.
    """
    missed = {(str(row.get('node_id')), _int(row.get('ordinal'))) for row in attempts
              if row.get('source') == 'log' and _int(row.get('correct')) < _int(row.get('attempted'))}
    days = {}
    for row in attempts:
        key = (str(row.get('node_id')), _int(row.get('ordinal')))
        if key not in missed:
            continue
        day = _day(row.get('at'))
        tally = days.setdefault((key, day), [0, 0])
        tally[0] += _int(row.get('correct'))
        tally[1] += _int(row.get('attempted'))
    out = {key: [] for key in missed}
    for (key, day), (right, tried) in days.items():
        if tried > 0:
            out[key].append((day, right / tried >= STEP_BAR))
    for mark in marks:
        item = str(mark.get('item') or '')
        if item.startswith('s:'):
            node, _, ordinal = item[2:].rpartition('#')
            key = (node, _int(ordinal))
            if key in out:
                out[key].append((_day(mark.get('at')), mark.get('result') == 'right'))
    return out


def set_histories(tasks, marks):
    """task id -> (task, [(day, right)]) for scored tasks with misses."""
    out = {}
    for task in tasks:
        got, of = task.get('score_got'), task.get('score_of')
        if task.get('status') != 'done' or got in (None, '') or of in (None, ''):
            continue
        got, of = _int(got), _int(of)
        if of <= 0 or got >= of or got < 0:
            continue
        out[str(task.get('id'))] = (task, [(_day(task.get('completed_at')), False)])
    for mark in marks:
        item = str(mark.get('item') or '')
        if item.startswith('t:') and item[2:] in out:
            out[item[2:]][1].append((_day(mark.get('at')), mark.get('result') == 'right'))
    return out


# ---------------------------------------------------------------------------
# The queue
# ---------------------------------------------------------------------------
def _try_word(rung):
    """'2nd try', counting the miss as the first."""
    n = rung + 2
    return '{} try'.format(_ORDINAL.get(n, '{}th'.format(n)))


def _when(day, today):
    gap = (today - day).days
    if gap == 0:
        return 'today'
    if gap == 1:
        return 'yesterday'
    return '{} days ago'.format(gap)


def _due_word(due, today):
    gap = (due - today).days
    if gap <= 0:
        return 'today'
    if gap == 1:
        return 'tomorrow'
    return 'in {} days'.format(gap)


def queue(attempts, tasks, marks, today, library=None, nodes=None, name_of=lambda key: key):
    """Everything with a miss in it, scheduled. See the module note.

    `library` is node id -> written steps (skillsteps.programmes_for), for the
    problem's own words and the step's title. `nodes` is node id -> the node's
    catalogue entry (name, tree title). Both are optional: without them an item
    still has its place and its schedule, just plainer words.
    """
    library, nodes = library or {}, nodes or {}

    def step_of(node_id, ordinal):
        return next((step for step in library.get(node_id, []) if step.get('ordinal') == ordinal), None)

    def node_name(node_id):
        return (nodes.get(node_id) or {}).get('name') or node_id

    def tree_of(node_id):
        node = nodes.get(node_id) or {}
        return node.get('tree'), node.get('treeTitle')

    items = []

    for (node_id, ordinal, slot), history in problem_histories(attempts).items():
        read = schedule(history, today)
        if not _live(read, today):
            continue
        step = step_of(node_id, ordinal)
        problem = next((one for one in (step or {}).get('problems') or [] if one.get('slot') == slot), None)
        weight = (problem or {}).get('weight') or next(
            (row.get('weight') for row in attempts if str(row.get('node_id')) == node_id
             and _int(row.get('ordinal')) == ordinal and _int(row.get('slot')) == slot), 'core')
        tree, tree_title = tree_of(node_id)
        items.append(_item(
            read, today, kind='problem', key='p:{}#{}#{}'.format(node_id, ordinal, slot),
            title=(step or {}).get('title') or node_name(node_id),
            where=node_name(node_id), tree=tree, tree_title=tree_title,
            node_id=node_id, ordinal=ordinal, slot=slot, weight=weight,
            level=_WEIGHT_WORD.get(weight, 'Medium'),
            prompt=(problem or {}).get('prompt'), answer=(problem or {}).get('answer'),
            hint=(problem or {}).get('hint') or '', minutes=PROBLEM_MINUTES))

    for (node_id, ordinal), history in step_histories(attempts, marks).items():
        read = schedule(history, today)
        if not _live(read, today):
            continue
        step = step_of(node_id, ordinal)
        tree, tree_title = tree_of(node_id)
        # The problems written for the step, so it can be reviewed by answering
        # some rather than by taking somebody's word for it.
        problems = [dict(one) for one in (step or {}).get('problems') or []][:3]
        items.append(_item(
            read, today, kind='step', key='s:{}#{}'.format(node_id, ordinal),
            title=(step or {}).get('title') or node_name(node_id),
            where=node_name(node_id), tree=tree, tree_title=tree_title,
            node_id=node_id, ordinal=ordinal, problems=problems, minutes=STEP_MINUTES))

    for task_id, (task, history) in set_histories(tasks, marks).items():
        read = schedule(history, today)
        if not _live(read, today):
            continue
        missed = _int(task.get('score_of')) - _int(task.get('score_got'))
        subject = task.get('subject')
        items.append(_item(
            read, today, kind='set', key='t:{}'.format(task_id),
            title=task.get('title') or 'Untitled',
            where=name_of(subject) if subject else None, subject=subject, task_id=task_id,
            got=_int(task.get('score_got')), of=_int(task.get('score_of')), missed=missed,
            minutes=min(SET_MOST_MINUTES, max(PROBLEM_MINUTES, missed * PROBLEM_MINUTES))))

    due = sorted((item for item in items if item['state'] == 'due'),
                 key=lambda item: (-item['late'], item['rung'], item['missed_on']))
    later = sorted((item for item in items if item['state'] == 'later'),
                   key=lambda item: (item['due'], item['rung']))
    soon = today + timedelta(days=7)
    cleared = sum(1 for item in items if item['state'] == 'cleared'
                  and _day(item['cleared_on']) and (today - _day(item['cleared_on'])).days < 14)
    sitting = due[:SITTING]
    return {
        'due': due,
        'later': later,
        'due_count': len(due),
        'later_count': len(later),
        'this_week': sum(1 for item in later if _day(item['due']) <= soon),
        'next_due': later[0]['due'] if later else None,
        'cleared_lately': cleared,
        'minutes': sum(item['minutes'] for item in sitting),
        'sitting': len(sitting),
    }


def _live(read, today):
    """Worth keeping: there's a miss, and it isn't a stale one nobody came back to."""
    if read is None:
        return False
    if read['cleared_on'] is not None:
        # Kept just long enough to count toward "cleared lately".
        return (today - read['cleared_on']).days < 14
    return not (read['rung'] == 0 and (today - read['missed_on']).days > MISS_DAYS)


def _item(read, today, **fields):
    if read['cleared_on'] is not None:
        state, late = 'cleared', 0
    else:
        late = (today - read['due']).days
        state = 'due' if late >= 0 else 'later'
    item = {
        'state': state,
        'rung': read['rung'],
        'reviews_left': len(LADDER) - read['rung'],
        'missed_on': read['missed_on'].isoformat(),
        'due': read['due'].isoformat() if read['due'] else None,
        'cleared_on': read['cleared_on'].isoformat() if read['cleared_on'] else None,
        'late': max(0, late),
        'prompt': None, 'answer': None, 'hint': '', 'problems': [],
        'node_id': None, 'ordinal': None, 'slot': None, 'weight': None, 'level': None,
        'tree': None, 'tree_title': None, 'subject': None, 'task_id': None,
        'got': None, 'of': None, 'missed': None,
    }
    item.update(fields)
    # One plain line under the title: when it was missed and which try this is.
    if state == 'cleared':
        item['line'] = 'Cleared. You got it right four times in a row.'
    elif state == 'due':
        item['line'] = 'Missed {}. {}.'.format(_when(read['missed_on'], today), _try_word(read['rung']).capitalize())
    else:
        item['line'] = 'Next one {}.'.format(_due_word(read['due'], today))
    return item


def after(rung, right):
    """What one answer does to an item on `rung`: its new rung, and when it's
    next due in days (None once cleared). For the "Back in 3 days" note the page
    shows right after a mark, which the server confirms on the next read."""
    if not right:
        return 0, LADDER[0]
    rung += 1
    return (rung, None) if rung >= len(LADDER) else (rung, LADDER[rung])


def clean_mark(body):
    """(row, None) for a mark worth storing, or (None, reason).

    Marks are for steps and sets only. A problem is reviewed by answering it,
    which the skill tree already records.
    """
    item = str(body.get('item') or '').strip()
    if not (item.startswith('t:') or item.startswith('s:')) or len(item) > 200 or len(item) < 3:
        return None, "That isn't something on your review list."
    result = body.get('result')
    if result not in RESULTS:
        return None, 'Say whether you got them right.'
    return {'item': item, 'result': result}, None
