"""Live blocks: a space's page reading the account's own data.

A live block on a space's page (frontend/src/components/Spaces/LiveBlock.tsx)
is a window onto one of six things the account already keeps, and never a copy
of it. The page stores which window and how it is set (`source` and a few
options, cleaned by `clean_config`); what it shows is read here, every time it
is asked, from the same rows the rest of the app reads.

    goal          one goal: progress, deadline, checkpoints, recent work
    skills        one skill tree: what is done, what is next, accuracy per node
    productivity  XP, tasks and focus by week, and which recent days had work
    records       personal bests, how far each has come, the latest entries
    calendar      open tasks, checkpoints and goal deadlines coming up
    growth        one subject (or all of them) over 7, 30 or 90 days, against
                  the window before

Everything below `clean_config` is a pure function of rows and a date, so the
tests can hand it rows and a day and read the answer. backend/api/spaces.py
reads the rows and calls these.

## Keeping up while the page is open

A block is only worth calling live if it moves when the data does. Two things
make it move:

  * the response to any request that wrote a table a source reads carries
    `X-Summit-Live` naming those sources (backend/middleware/writes.py), so the
    tab that made the change refreshes its blocks at once;
  * every such write also bumps the account's revision for those sources
    (`note_writes`), and an open page polls `revisions` cheaply, so another tab
    or another device catches up within one poll.

The revisions are kept in memory, per process, the same scope and the same
reasoning as the growth series cache: a restart starts a new `BOOT` and every
open page sees every revision change once, which costs one refresh each.
"""
import threading
import time
from datetime import date, datetime, timedelta

from backend.config.shared import RULES

LIVE = RULES['spaces']['live']

#: The sources, in the order the slash menu lists them.
SOURCES = tuple(LIVE['sources'])

#: The tables each source reads. A write to any of them makes it stale.
SOURCE_TABLES = {
    'goal': {'goals', 'goal_milestones', 'tasks', 'task_goal_matches', 'xp_events',
             'focus_days', 'focus_sittings', 'users'},
    'skills': {'skill_attempts'},
    'productivity': {'xp_events', 'tasks', 'focus_days', 'focus_sittings', 'users'},
    'records': {'records'},
    'calendar': {'tasks', 'goals', 'goal_milestones', 'calendar_entries'},
    'growth': {'tasks', 'xp_events', 'focus_days', 'skill_attempts'},
}

#: Which levels count as a node done, and as one under way.
DONE_LEVEL = 4
TIERS = ('foundation', 'core', 'advanced', 'expert', 'mastery')


# --------------------------------------------------------------------------
# What a page may store
# --------------------------------------------------------------------------
def _ref(value) -> str:
    """An id or a key the reader picked: a short string, or ''."""
    return str(value).strip()[:LIVE['ref_max']] if isinstance(value, (str, int)) and not isinstance(value, bool) else ''


def _choice(value, allowed, default):
    try:
        value = int(value)
    except (TypeError, ValueError):
        return default
    return value if value in allowed else default


def clean_config(raw) -> dict:
    """A live block's settings as the page may store them.

    An unknown source becomes the first one rather than being refused, the way
    an unknown block kind becomes text: the block survives, and the reader can
    point it somewhere else.
    """
    raw = raw if isinstance(raw, dict) else {}
    source = raw.get('source') if raw.get('source') in SOURCES else SOURCES[0]
    out = {'source': source}
    if source == 'goal':
        out['goal'] = _ref(raw.get('goal'))
    elif source == 'skills':
        out['tree'] = _ref(raw.get('tree'))
    elif source == 'productivity':
        out['weeks'] = _choice(raw.get('weeks'), LIVE['weeks'], LIVE['weeks'][1])
    elif source == 'records':
        out['category'] = _ref(raw.get('category'))
        out['limit'] = max(1, min(LIVE['limit_max'], _choice(raw.get('limit'), range(1, LIVE['limit_max'] + 1), 5)))
    elif source == 'calendar':
        out['days'] = _choice(raw.get('days'), LIVE['ahead'], LIVE['ahead'][0])
    elif source == 'growth':
        out['subject'] = _ref(raw.get('subject'))
        out['days'] = _choice(raw.get('days'), LIVE['windows'], LIVE['windows'][1])
    return out


# --------------------------------------------------------------------------
# Revisions
# --------------------------------------------------------------------------
#: Changes on every start, so a page that polled the last process refreshes.
BOOT = '{:x}'.format(int(time.time() * 1000))
_REVS = {}
_LOCK = threading.Lock()
#: Accounts remembered at most; the oldest is dropped past this.
_REVS_MAX = 5000


def sources_for(tables) -> list:
    """The sources a write to these tables makes stale, in SOURCES order."""
    tables = set(tables or ())
    return [source for source in SOURCES if SOURCE_TABLES[source] & tables]


def note_writes(username, tables) -> list:
    """Bump this account's revision for every source the tables feed."""
    stale = sources_for(tables)
    if not username or not stale:
        return stale
    with _LOCK:
        revs = _REVS.pop(username, None) or {}
        for source in stale:
            revs[source] = revs.get(source, 0) + 1
        _REVS[username] = revs
        while len(_REVS) > _REVS_MAX:
            _REVS.pop(next(iter(_REVS)))
    return stale


def revisions(username) -> dict:
    """`{source: 'boot.n'}` for every source. Equal strings mean nothing changed."""
    with _LOCK:
        revs = dict(_REVS.get(username) or {})
    return {source: '{}.{}'.format(BOOT, revs.get(source, 0)) for source in SOURCES}


# --------------------------------------------------------------------------
# Small readers
# --------------------------------------------------------------------------
def _day(value):
    """The date at the front of an ISO string, or None."""
    if isinstance(value, (date, datetime)):
        return value if isinstance(value, date) and not isinstance(value, datetime) else value.date()
    try:
        return date.fromisoformat(str(value or '')[:10])
    except ValueError:
        return None


def _num(value, default=0.0):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return default if number != number else number


def _int(value):
    return int(round(_num(value)))


def _pct(now, before):
    """Change from `before` to `now` as a whole percent, or None with nothing before."""
    if not before:
        return None
    return int(round((now - before) / before * 100))


# --------------------------------------------------------------------------
# Goal
# --------------------------------------------------------------------------
#: Which pair of columns a counter goal reads (the same table as goals.py).
_COUNTERS = {'xp': ('current_xp', 'target_xp', 'XP'), 'streak': ('current_streak', 'target_streak', 'days'),
             'tasks': ('current_tasks', 'target_tasks', 'tasks'), 'focus': ('current_focus', 'target_focus', 'hours')}


def pick_goal(goals, wanted, today):
    """The goal a block shows: the one it names, or else the most pressing open one.

    Most pressing is the soonest deadline among open goals, then the highest
    priority, then the newest. A block left on "whichever is most pressing"
    keeps following as goals finish and new ones start.
    """
    goals = list(goals or [])
    if wanted:
        for goal in goals:
            if str(goal.get('id')) == wanted:
                return goal
        return None
    open_goals = [goal for goal in goals if goal.get('status') != 'completed'] or goals
    if not open_goals:
        return None

    def rank(goal):
        due = _day(goal.get('deadline'))
        return (due is None, due or today, -_int(goal.get('priority') or 5),
                [-ord(c) for c in str(goal.get('created_at') or '')])
    return sorted(open_goals, key=rank)[0]


def goal_view(goal, tasks, today):
    """One goal as a live block draws it.

    `goal` is a row as /api/get_goals sends it: progress worked out, its
    checkpoints under `milestones`, its `health`. `tasks` are the account's
    tasks with `goal_ids` filled in, for the recent work toward it.
    """
    if not goal:
        return {'empty': True}
    gid = str(goal.get('id'))
    measure = goal.get('measure') or goal.get('goal_type') or 'xp'
    if measure in _COUNTERS:
        now_field, target_field, unit = _COUNTERS[measure]
        current, target = _num(goal.get(now_field)), _num(goal.get(target_field))
    elif measure == 'number':
        current, target, unit = _num(goal.get('current_value')), _num(goal.get('target_number')), goal.get('unit') or ''
    else:
        stones = goal.get('milestones') or []
        current, target, unit = len([s for s in stones if s.get('status') == 'done']), len(stones), 'checkpoints'

    deadline = _day(goal.get('deadline'))
    milestones = []
    next_stone = None
    for stone in goal.get('milestones') or []:
        steps = [step for step in stone.get('steps') or [] if not step.get('placeholder')]
        when = _day(stone.get('target_date'))
        row = {
            'id': str(stone.get('id')),
            'title': stone.get('title') or '',
            'status': stone.get('status') or 'pending',
            'date': when.isoformat() if when else None,
            'steps_done': len([step for step in steps if step.get('done')]),
            'steps': len(steps),
        }
        milestones.append(row)
        if next_stone is None and row['status'] != 'done':
            next_stone = row

    recent = []
    for task in tasks or []:
        linked = str(task.get('goal_id') or '') == gid or gid in [str(i) for i in task.get('goal_ids') or []]
        if linked and task.get('status') == 'done' and task.get('completed_at'):
            recent.append({'title': task.get('title') or '', 'at': str(task.get('completed_at'))[:19],
                           'xp': _int(task.get('xp_value'))})
    recent.sort(key=lambda row: row['at'], reverse=True)
    week_ago = (today - timedelta(days=6)).isoformat()

    health = goal.get('health') or {}
    return {
        'empty': False,
        'goal': {
            'id': gid,
            'title': goal.get('title') or '',
            'measure': measure,
            'status': goal.get('status') or 'active',
            'progress': round(min(100.0, max(0.0, _num(goal.get('progress')))), 1),
            'current': current,
            'target': target,
            'unit': unit,
            'deadline': deadline.isoformat() if deadline else None,
            'days_left': (deadline - today).days if deadline else None,
            'health': {'state': health.get('state'), 'label': health.get('label'), 'reason': health.get('reason')}
            if health else None,
        },
        'milestones': milestones,
        'next_milestone': next_stone,
        'recent': recent[:5],
        'done_this_week': len([row for row in recent if row['at'][:10] >= week_ago]),
    }


# --------------------------------------------------------------------------
# Skill tree
# --------------------------------------------------------------------------
def trees_of(nodes):
    """`[{id, title}]` for every tree the node list holds, in its order."""
    seen, out = set(), []
    for node in nodes:
        tree = node.get('tree')
        if tree and tree not in seen:
            seen.add(tree)
            out.append({'id': tree, 'title': node.get('treeTitle') or tree})
    return out


def pick_tree(nodes, attempts, wanted):
    """The tree a block shows: the one it names, or the one practiced most."""
    trees = {tree['id'] for tree in trees_of(nodes)}
    if wanted:
        return wanted if wanted in trees else None
    tree_of = {node['id']: node.get('tree') for node in nodes}
    counts = {}
    for row in attempts or []:
        tree = tree_of.get(row.get('node_id'))
        if tree:
            counts[tree] = counts.get(tree, 0) + _int(row.get('attempted'))
    if counts:
        return max(counts, key=lambda tree: (counts[tree], tree))
    return nodes[0]['tree'] if nodes else None


def skills_view(nodes, attempts, tree, read_level, now=None):
    """One tree's nodes with the level the reader's answers give each.

    `read_level` is backend/tracking/skill_level.read_level, passed in so this
    stays a function of its arguments. A node's level is read over every step
    of it at once. Done is Hard cleared (level 4) or better. A node is next
    when it isn't done and everything it requires is.
    """
    mine = [node for node in nodes if node.get('tree') == tree]
    if not mine:
        return {'empty': True}
    by_node = {}
    for row in attempts or []:
        by_node.setdefault(row.get('node_id'), []).append(row)

    read = {}
    for node in mine:
        level = read_level(by_node.get(node['id'], []), now=now)
        read[node['name']] = level
    done_names = {name for name, level in read.items() if level['level'] >= DONE_LEVEL}

    out = []
    for node in mine:
        level = read[node['name']]
        if node['name'] in done_names:
            state = 'done'
        elif level['level'] > 0:
            state = 'doing'
        elif all(req in done_names for req in node.get('requires') or []):
            state = 'next'
        else:
            state = 'locked'
        out.append({
            'id': node['id'],
            'name': node['name'],
            'tier': node.get('tier') or '',
            'level': level['level'],
            'mastery': level['mastery'],
            'accuracy': level['accuracy'],
            'attempted': level['attempted'],
            'last_at': level['lastAt'],
            'state': state,
            'requires': list(node.get('requires') or []),
        })
    attempted = sum(row['attempted'] for row in out)
    correct = sum(read[row['name']]['correct'] for row in out)
    return {
        'empty': False,
        'tree': tree,
        'title': mine[0].get('treeTitle') or tree,
        'nodes': out,
        'done': len([row for row in out if row['state'] == 'done']),
        'doing': len([row for row in out if row['state'] == 'doing']),
        'total': len(out),
        'attempted': attempted,
        'accuracy': int(round(correct / attempted * 100)) if attempted else None,
    }


# --------------------------------------------------------------------------
# Productivity
# --------------------------------------------------------------------------
def productivity_view(series, weeks, streak, today):
    """XP, tasks and focus per week for `weeks` weeks, and the last 28 days.

    `series` is backend/tracking/growth.series's `growth_data`: one row per
    day, oldest first, ending today. Weeks end today rather than on a Sunday,
    so the newest bar is always a whole seven days.
    """
    by_day = {row['date']: row for row in series or []}

    def row_on(day):
        return by_day.get(day.isoformat()) or {}

    out_weeks = []
    for back in range(weeks - 1, -1, -1):
        end = today - timedelta(days=7 * back)
        days = [end - timedelta(days=i) for i in range(6, -1, -1)]
        rows = [row_on(day) for day in days]
        out_weeks.append({
            'start': days[0].isoformat(),
            'end': end.isoformat(),
            'xp': sum(_int(row.get('xp_earned')) for row in rows),
            'tasks': sum(_int(row.get('tasks_completed')) for row in rows),
            'focus_minutes': sum(_int(row.get('focus_minutes')) for row in rows),
            'active_days': len([row for row in rows if _int(row.get('tasks_completed')) or _int(row.get('focus_minutes'))]),
        })

    recent = []
    for back in range(27, -1, -1):
        day = today - timedelta(days=back)
        row = row_on(day)
        recent.append({'date': day.isoformat(), 'xp': _int(row.get('xp_earned')),
                       'active': bool(_int(row.get('tasks_completed')) or _int(row.get('focus_minutes')))})
    active = len([day for day in recent if day['active']])
    this_week, last_week = out_weeks[-1], (out_weeks[-2] if len(out_weeks) > 1 else None)
    return {
        'weeks': out_weeks,
        'days': recent,
        'consistency': int(round(active / len(recent) * 100)),
        'active_days': active,
        'streak': _int(streak),
        'change': _pct(this_week['xp'], last_week['xp']) if last_week else None,
    }


# --------------------------------------------------------------------------
# Records
# --------------------------------------------------------------------------
def records_view(rows, category, limit):
    """Personal bests by name, with how far each has come, and the latest entries.

    A record's best is its highest value, or its lowest when lower is better
    (`comparison_direction`). How far it has come is best against the first
    entry, in the record's own unit.
    """
    rows = [row for row in rows or [] if row.get('kind', 'record') == 'record']
    categories = sorted({row.get('category') or '' for row in rows} - {''}, key=str.lower)
    if category:
        rows = [row for row in rows if (row.get('category') or '') == category]

    groups = {}
    for row in rows:
        groups.setdefault((row.get('name') or '').strip() or 'Untitled', []).append(row)

    bests = []
    for name, entries in groups.items():
        entries.sort(key=lambda row: (str(row.get('achieved_on') or '9999'), str(row.get('created_at') or '')))
        lower = (entries[-1].get('comparison_direction') or 'higher') == 'lower'
        values = [_num(row.get('value')) for row in entries]
        # The first time the best was reached, whichever end is the good one.
        best_value = min(values) if lower else max(values)
        best_at = values.index(best_value)
        first, best = values[0], values[best_at]
        improvement = (first - best) if lower else (best - first)
        bests.append({
            'name': name,
            'category': entries[-1].get('category') or '',
            'unit': entries[-1].get('unit') or '',
            'direction': 'lower' if lower else 'higher',
            'best': best,
            'best_on': entries[best_at].get('achieved_on') or None,
            'first': first,
            'latest': values[-1],
            'improvement': round(improvement, 6),
            'entries': len(entries),
            'history': [{'value': values[i], 'on': entries[i].get('achieved_on') or None}
                        for i in range(max(0, len(entries) - 12), len(entries))],
        })
    bests.sort(key=lambda row: str(row['best_on'] or ''), reverse=True)

    latest = sorted(rows, key=lambda row: (str(row.get('achieved_on') or ''), str(row.get('created_at') or '')),
                    reverse=True)
    return {
        'categories': categories,
        'bests': bests[:limit],
        'total': len(bests),
        'latest': [{'name': row.get('name') or '', 'value': _num(row.get('value')), 'unit': row.get('unit') or '',
                    'on': row.get('achieved_on') or None} for row in latest[:limit]],
    }


# --------------------------------------------------------------------------
# Calendar
# --------------------------------------------------------------------------
#: How far back an unfinished task still shows, as overdue.
OVERDUE_DAYS = 14


def calendar_view(tasks, goals, today, days):
    """What's coming up in the next `days` days, soonest first.

    Open tasks with a due date (and ones overdue by up to OVERDUE_DAYS), open
    checkpoints with a date, and the deadlines of open goals.
    """
    end = today + timedelta(days=days - 1)
    since = today - timedelta(days=OVERDUE_DAYS)
    items = []
    for task in tasks or []:
        if task.get('status') != 'todo':
            continue
        due = _day(task.get('due_date'))
        if not due or due < since or due > end:
            continue
        raw = str(task.get('due_date') or '')
        items.append({'kind': 'task', 'id': str(task.get('id')), 'title': task.get('title') or '',
                      'date': due.isoformat(), 'time': raw[11:16] if len(raw) >= 16 else None,
                      'subject': task.get('subject') or None, 'overdue': due < today})
    for goal in goals or []:
        if goal.get('status') == 'completed':
            continue
        due = _day(goal.get('deadline'))
        if due and today <= due <= end:
            items.append({'kind': 'deadline', 'id': str(goal.get('id')), 'title': goal.get('title') or '',
                          'date': due.isoformat(), 'time': None, 'subject': None, 'overdue': False})
        for stone in goal.get('milestones') or []:
            when = _day(stone.get('target_date'))
            if stone.get('status') == 'done' or not when or when < since or when > end:
                continue
            items.append({'kind': 'milestone', 'id': str(stone.get('id')), 'title': stone.get('title') or '',
                          'goal': goal.get('title') or '', 'date': when.isoformat(), 'time': None,
                          'subject': None, 'overdue': when < today})
    order = {'deadline': 0, 'milestone': 1, 'task': 2}
    items.sort(key=lambda item: (item['date'], item['time'] or '99', order[item['kind']], item['title'].lower()))
    return {
        'days': days,
        'start': today.isoformat(),
        'end': end.isoformat(),
        'items': items[:LIVE['calendar_max']],
        'total': len(items),
        'overdue': len([item for item in items if item['overdue']]),
    }


# --------------------------------------------------------------------------
# Growth
# --------------------------------------------------------------------------
def _buckets(days):
    """Points on the line: one a day up to a month, one a week past that."""
    return 1 if days <= 30 else 7


def growth_view(subject, days, tasks, series, attempts, tree_nodes, today):
    """One subject over the last `days` days, against the `days` before.

    With a subject, the numbers are its finished tasks and the XP they were
    worth, plus the skill problems answered in its tree when it has one. With
    none, they are the whole account's day series, focus included.
    """
    start = today - timedelta(days=days - 1)
    before = start - timedelta(days=days)
    span_days = [start + timedelta(days=i) for i in range(days)]

    per_day = {}
    if subject:
        for task in tasks or []:
            if task.get('status') != 'done' or (task.get('subject') or '') != subject:
                continue
            day = _day(task.get('completed_at'))
            if day and before <= day <= today:
                bucket = per_day.setdefault(day, {'xp': 0, 'tasks': 0, 'focus': 0})
                bucket['xp'] += _int(task.get('xp_value'))
                bucket['tasks'] += 1
    else:
        for row in series or []:
            day = _day(row.get('date'))
            if day and before <= day <= today:
                per_day[day] = {'xp': _int(row.get('xp_earned')), 'tasks': _int(row.get('tasks_completed')),
                                'focus': _int(row.get('focus_minutes'))}

    def total(lo, hi):
        rows = [per_day[day] for day in per_day if lo <= day <= hi]
        return {'xp': sum(row['xp'] for row in rows), 'tasks': sum(row['tasks'] for row in rows),
                'focus_minutes': sum(row['focus'] for row in rows),
                'active_days': len([row for row in rows if row['tasks'] or row['focus']])}

    now_totals = total(start, today)
    then_totals = total(before, start - timedelta(days=1))

    step = _buckets(days)
    points = []
    for at in range(0, days, step):
        chunk = span_days[at:at + step]
        rows = [per_day.get(day) or {'xp': 0, 'tasks': 0} for day in chunk]
        points.append({'date': chunk[0].isoformat(), 'xp': sum(row['xp'] for row in rows),
                       'tasks': sum(row['tasks'] for row in rows)})

    skills = None
    node_ids = {node['id'] for node in tree_nodes or []}
    if node_ids:
        def answered(lo, hi):
            rows = [row for row in attempts or [] if row.get('node_id') in node_ids
                    and (_day(row.get('at')) or before) >= lo and (_day(row.get('at')) or today) <= hi]
            asked = sum(_int(row.get('attempted')) for row in rows)
            right = sum(_int(row.get('correct')) for row in rows)
            return asked, (int(round(right / asked * 100)) if asked else None)
        asked, accuracy = answered(start, today)
        asked_before, accuracy_before = answered(before, start - timedelta(days=1))
        skills = {'attempted': asked, 'accuracy': accuracy,
                  'attempted_before': asked_before, 'accuracy_before': accuracy_before}

    return {
        'subject': subject or '',
        'days': days,
        'start': start.isoformat(),
        'step': step,
        'now': now_totals,
        'before': then_totals,
        'change': {key: _pct(now_totals[key], then_totals[key]) for key in now_totals},
        'points': points,
        'skills': skills,
    }
