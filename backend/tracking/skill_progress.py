"""Where an account stands on every skill-tree node, read from real work.

## What this replaced

A tile's bar used to be authored. Every tree was drawn with a plausible walk
down it (Variables mastered, Loops three-quarters done), identical on every
account, and the only way to move a tile was a Practice button that added XP
for a click, stored in the browser. Nothing a reader actually did reached the
tree: finishing a calculus task, an hour on the timer, a goal about the AMC.

This reads the record instead. A node moves when work lands on it:

    a finished task filed under the node            one session
    a task finished across several days of sittings one session per day
    sittings of SITTING_MIN+ minutes on an open task one session per day

Filing is the topic library's (backend/tracking/topics.py): the task's name,
its description and its subject decide the topic, and the topic decides the
node (`topic_nodes`). A task booked from the skill tree carries its node in
`tasks.skill_node`, so it never depends on its name filing the right way.

## Done means passed, where there is something to pass

A node with a written problem set (CHECK_MIN problems or more) is mastered by
passing its skill check (backend/tracking/skill_check.py), not by a count of
sessions. The sessions fill the bar and say when the reader is ready; the check
is the proof. A reader can take it early, which is how somebody tests out of a
skill they already have.

A node with nothing written cannot be checked, so there the sessions are the
whole story: TARGET of them finishes it.

## Open, and why evidence opens a node

A node is open when nothing comes before it, when everything before it is done,
or when the reader has already worked on it. The last one matters: somebody
doing derivatives homework is doing derivatives whatever the tree says about
limits, and drawing that tile as locked would be the tree arguing with the
record.

## Nothing is stored

Every figure is a function of tasks, sittings and checks, read fresh. A GET
reads (tests/test_get_requests_do_not_write.py); only a check writes.
"""
import json
from collections import defaultdict
from functools import lru_cache
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from backend.config import skill_trees
from backend.tracking import topics

#: Sessions of real work a node asks for, by tier. Fewer at the bottom of a
#: tree, where a skill is a few sittings, and more at the top.
TARGET = {
    'foundation': 3,
    'beginner': 3,
    'intermediate': 4,
    'advanced': 5,
    'expert': 6,
    'mastery': 8,
}
DEFAULT_TARGET = 4

#: A sitting this long on a task counts as a session on that task's node.
SITTING_MIN = 10

#: Written problems a node needs before it gets a check. Fewer than three is
#: not a check, it is a question.
CHECK_MIN = 3

#: How many of a node's sessions come back with it, newest first.
RECENT = 5

#: How many unfiled task names a tree carries back as examples.
UNFILED_SAMPLES = 3


# --------------------------------------------------------------------------
# The catalogue
# --------------------------------------------------------------------------
@lru_cache(maxsize=1)
def catalog() -> Dict[str, Dict[str, Any]]:
    """Node id → the parts this module reads, from data/skill_nodes.json."""
    with open(topics.NODES_PATH, encoding='utf-8') as handle:
        nodes = json.load(handle)['nodes']
    return {
        node['id']: {
            'id': node['id'],
            'name': node['name'],
            'tree': node['tree'],
            'tree_title': node.get('treeTitle') or node['tree'],
            'tier': node.get('tier') or '',
            'requires': list(node.get('requireIds') or []),
        }
        for node in nodes
    }


def target_for(node_id: str) -> int:
    node = catalog().get(node_id)
    return TARGET.get(node['tier'], DEFAULT_TARGET) if node else DEFAULT_TARGET


@lru_cache(maxsize=1)
def _overrides() -> Dict[str, str]:
    """Topic id → node id, for the taxonomy topics that say so with `node`."""
    with open(topics.TAXONOMY_PATH, encoding='utf-8') as handle:
        entries = json.load(handle).get('topics', [])
    out = {}
    for entry in entries:
        named = entry.get('node')
        if not named:
            continue
        for tree in entry.get('trees') or [entry.get('tree')]:
            node = named.get(tree) if isinstance(named, dict) else named
            if tree and node:
                out['{}:{}'.format(tree, topics.slug(entry['label']))] = node
    return out


@lru_cache(maxsize=1)
def topic_nodes() -> Dict[str, str]:
    """Topic id → the node its tasks count toward.

    Every node is a topic of its own (`tree:slug(name)`), so most of this is
    the identity. A finer topic counts toward the topic it sits `under`
    (recursive counting → Counting), and a taxonomy topic with no node of its
    own name can name one. Topics that reach no node (Real Analysis has no
    tree yet) are left out, and their tasks file as "no skill named".
    """
    tax = topics.taxonomy()
    nodes = catalog()
    by_slug = {'{}:{}'.format(node['tree'], topics.slug(node['name'])): node['id']
               for node in nodes.values()}
    overrides = _overrides()

    def resolve(topic_id: str, seen: frozenset) -> str:
        if topic_id in overrides:
            return overrides[topic_id]
        if topic_id in by_slug:
            return by_slug[topic_id]
        topic = tax.topics.get(topic_id)
        if topic and topic['under'] and topic_id not in seen:
            parent = '{}:{}'.format(topic['tree'], topics.slug(topic['under']))
            return resolve(parent, seen | {topic_id})
        return ''

    out = {}
    for topic_id in tax.topics:
        node = resolve(topic_id, frozenset())
        if node in nodes:
            out[topic_id] = node
    return out


@lru_cache(maxsize=1)
def tree_subjects() -> Dict[str, str]:
    """Tree id → the subject a task booked on it is filed under.

    The catalogue's own map first (Calculus is the calculus subject), then
    the topic families (Competition Math is filed under mathematics), so the
    task lands in a subject whose tasks the topic library reads against that
    tree.
    """
    out: Dict[str, str] = {}
    for subject, tree in skill_trees.SUBJECT_TREE.items():
        out.setdefault(tree, subject)
    for subject, trees in topics.taxonomy().families.items():
        for tree in trees:
            out.setdefault(tree, subject)
    return out


# --------------------------------------------------------------------------
# Filing work
# --------------------------------------------------------------------------
#: What `tasks.skill_node` holds when the reader has said a task counts toward
#: no skill at all ("Not this skill" on the panel). Empty means "file it by
#: its name", and a node id means that node.
NO_NODE = '-'


def _confident(task: Dict[str, Any], topic_id: str, how: str) -> bool:
    """Whether a topic match is firm enough to move a tile.

    The topic library is generous on purpose: it files a task to *something*
    so the subject page can talk about it. A tile is a stronger claim, so a
    match on one word ("source" in "Open source contribution") counts only
    when the task's subject narrows the trees it could be about. A match on a
    phrase of two words or more always counts.
    """
    tax = topics.taxonomy()
    topic = tax.topics.get(topic_id)
    if not topic:
        return False
    text = str(task.get('title') or '')
    if how == 'described':
        text = '{} {}'.format(text, str(task.get('description') or '')[:400])
    tokens = topics.words(text)
    for alias in topic['aliases']:
        size = len(alias)
        if any(tokens[at:at + size] == alias for at in range(len(tokens) - size + 1)):
            if size >= 2:
                return True
    return bool(tax.family(str(task.get('subject') or '')))


def file_task(task: Dict[str, Any]) -> Dict[str, str]:
    """Where one task counts: `node` ('' for none), `tree` it named, and `how`.

    `how` is the topic library's word, 'booked' when the task carries its node
    (it was made from the skill tree, or the reader moved it), or 'moved off'
    when the reader said it belongs to no skill.
    """
    chosen = str(task.get('skill_node') or '').strip()
    if chosen == NO_NODE:
        return {'node': '', 'tree': '', 'how': 'moved off'}
    if chosen in catalog():
        return {'node': chosen, 'tree': catalog()[chosen]['tree'], 'how': 'booked'}
    found = topics.classify(str(task.get('title') or ''), str(task.get('description') or ''),
                            str(task.get('subject') or ''))
    node = topic_nodes().get(found['topic'] or '', '')
    if node and not _confident(task, found['topic'], found['how']):
        node = ''
    return {'node': node, 'tree': found['subsubject'] or '', 'how': found['how']}


def _day(value: Any) -> str:
    return str(value or '')[:10]


def _minutes(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def work(tasks: Sequence[Dict[str, Any]], sittings: Sequence[Dict[str, Any]] = ()
         ) -> Dict[str, Any]:
    """Every task and sitting, filed: `by_node` (node id → work items, oldest
    first) and `unfiled` (tree id → task titles that named the tree but no
    skill on it).

    One item per task, carrying how many sessions it is worth: one per day
    with a SITTING_MIN+ sitting on it, and at least one once it is finished.
    So finishing a task never takes a session away from the days already spent
    on it, and a task done in one go is one session however long it ran.
    Sittings with no task, or under SITTING_MIN, count for nothing.
    """
    days_on: Dict[str, set] = defaultdict(set)
    titles: Dict[str, str] = {}
    for sitting in sittings:
        if _minutes(sitting.get('minutes')) < SITTING_MIN:
            continue
        task_id = str(sitting.get('task_id') or '')
        day = _day(sitting.get('day'))
        if not task_id or not day:
            continue
        days_on[task_id].add(day)
        titles.setdefault(task_id, str(sitting.get('task_title') or ''))

    by_node: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    unfiled: Dict[str, List[str]] = defaultdict(list)
    seen = set()
    for task in tasks:
        task_id = str(task.get('id') or '')
        if not task_id or task_id in seen:
            continue
        seen.add(task_id)
        done = task.get('status') == 'done'
        days = sorted(days_on.get(task_id, ()))
        if not done and not days:
            continue
        found = file_task(task)
        title = str(task.get('title') or '')
        if not found['node']:
            if done and found['tree']:
                unfiled[found['tree']].append(title)
            continue
        finished = _day(task.get('completed_at')) if done else ''
        sessions = max(len(days), 1 if done else 0)
        by_node[found['node']].append({
            'kind': 'task',
            'id': task_id,
            'title': title,
            'done': done,
            'day': finished or (days[-1] if days else ''),
            'days': days,
            'sessions': sessions,
            'goal_id': str(task.get('goal_id') or ''),
            'how': found['how'],
        })

    # Sittings on a task that is gone (deleted, or not in the rows handed in)
    # still happened. Filed by the title the sitting kept.
    for task_id, days in days_on.items():
        if task_id in seen or not titles.get(task_id):
            continue
        found = file_task({'title': titles[task_id]})
        if not found['node']:
            continue
        ordered = sorted(days)
        by_node[found['node']].append({
            'kind': 'sitting', 'id': task_id, 'title': titles[task_id], 'done': False,
            'day': ordered[-1], 'days': ordered, 'sessions': len(ordered), 'goal_id': '',
            'how': found['how'],
        })

    for items in by_node.values():
        items.sort(key=lambda item: (item['day'], item['id']))
    return {'by_node': dict(by_node), 'unfiled': dict(unfiled)}


def same_name(title: str) -> str:
    """A task name as two tasks with "the same name" share it."""
    return ' '.join(str(title or '').lower().split())


def _grouped(items: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The work on a node, newest first, one row per name.

    A routine repeats its name ("Orchestra rehearsal" a hundred times), and a
    list of five identical rows says less than one row that says a hundred.
    The row carries the newest task's id, the day it landed, and how many
    tasks and sessions share the name."""
    rows: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for item in reversed(items):
        key = (item['kind'], same_name(item['title']))
        row = rows.get(key)
        if row:
            row['count'] += 1
            row['sessions'] += item['sessions']
            continue
        rows[key] = {**{name: item[name] for name in ('kind', 'id', 'title', 'day', 'sessions', 'done', 'how')},
                     'count': 1}
    return list(rows.values())


def _session_days(items: Iterable[Dict[str, Any]]) -> List[str]:
    """One date per session, oldest first, so the n-th session has a day."""
    out: List[str] = []
    for item in items:
        # A task finished with no sittings is one session, on the day it was
        # finished. Otherwise each sitting day is one.
        days = list(item['days']) or [item['day']] * item['sessions']
        out.extend(days[:item['sessions']])
    return sorted(day for day in out if day)


# --------------------------------------------------------------------------
# Goals
# --------------------------------------------------------------------------
def goal_nodes(goals: Sequence[Dict[str, Any]]) -> Dict[str, List[str]]:
    """Node id → the active goals that name it, from each goal's own words:
    the topics on its contest's syllabus and the topics its title names."""
    mapped = topic_nodes()
    out: Dict[str, List[str]] = defaultdict(list)
    for goal in goals:
        goal_id = str(goal.get('id') or '')
        if not goal_id:
            continue
        found = topics.scope(goal)
        for topic_id in list(found['syllabus']) + list(found['also']):
            node = mapped.get(topic_id)
            if node and goal_id not in out[node]:
                out[node].append(goal_id)
    return dict(out)


# --------------------------------------------------------------------------
# The reading
# --------------------------------------------------------------------------
def _check_summary(rows: Sequence[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Node id → tries, best score and the day it was first passed, from the
    finished checks. An unfinished check is not a try."""
    out: Dict[str, Dict[str, Any]] = {}
    for row in sorted(rows, key=lambda one: str(one.get('finished_at') or '')):
        if row.get('passed') is None or not row.get('finished_at'):
            continue
        entry = out.setdefault(str(row['node_id']), {
            'tries': 0, 'best': 0, 'asked': 0, 'passed_on': '', 'last_on': ''})
        entry['tries'] += 1
        correct, asked = int(row.get('correct') or 0), int(row.get('asked') or 0)
        if asked and (correct / asked > (entry['best'] / entry['asked'] if entry['asked'] else -1)):
            entry['best'], entry['asked'] = correct, asked
        entry['last_on'] = _day(row['finished_at'])
        if row.get('passed') and not entry['passed_on']:
            entry['passed_on'] = _day(row['finished_at'])
    return out


def read(tasks: Sequence[Dict[str, Any]], sittings: Sequence[Dict[str, Any]] = (),
         checks: Sequence[Dict[str, Any]] = (), checkable: Iterable[str] = (),
         goals: Sequence[Dict[str, Any]] = ()) -> Dict[str, Any]:
    """The whole account's standing, for the page.

    `tasks` are every task (done and open), `sittings` the focus sittings,
    `checks` the skill_checks rows, `checkable` the node ids that have a
    check, `goals` the active goals.

    Answers with:

    - `status`: node id → 'complete' | 'progress' | 'available'. A node left
      out is locked. Only the catalogue's nodes; a tree's doorways are the
      page's business.
    - `nodes`: node id → the evidence, for every node that has any (work, a
      check, a goal or a planned task): sessions, target, percent, whether it
      is ready for its check, the day it was done, the latest work.
    - `unfiled`: tree id → how many finished tasks named the tree but no skill
      on it, and a few of their names.
    - `goals`: goal id → title, for the goals the nodes name.
    - `checkable`: the node ids that have a check, sorted.
    - `targets`: TARGET, so the page can say "of 4" on a tile with no work.
    """
    nodes = catalog()
    checkable = set(checkable)
    filed = work(tasks, sittings)
    by_node = filed['by_node']
    tried = _check_summary(checks)
    on_goals = goal_nodes(goals)
    goal_titles = {str(goal.get('id')): str(goal.get('title') or '') for goal in goals}
    active = set(goal_titles)

    planned: Dict[str, int] = defaultdict(int)
    for task in tasks:
        if task.get('status') != 'todo':
            continue
        found = file_task(task)
        if found['node']:
            planned[found['node']] += 1

    complete: Dict[str, str] = {}
    figures: Dict[str, Dict[str, Any]] = {}
    for node_id in set(by_node) | set(tried) | set(on_goals) | set(planned):
        if node_id not in nodes:
            continue
        items = by_node.get(node_id, [])
        days = _session_days(items)
        target = target_for(node_id)
        check = tried.get(node_id)
        done_on = ''
        if check and check['passed_on']:
            done_on = check['passed_on']
        elif node_id not in checkable and len(days) >= target:
            done_on = days[target - 1]
        if done_on:
            complete[node_id] = done_on
        goal_ids = list(on_goals.get(node_id, []))
        for item in items:
            if item['goal_id'] in active and item['goal_id'] not in goal_ids:
                goal_ids.append(item['goal_id'])
        figures[node_id] = {
            'sessions': len(days),
            'target': target,
            'percent': 100 if done_on else min(100, round(100 * len(days) / target)),
            'ready': not done_on and node_id in checkable and len(days) >= target,
            'on': done_on,
            'last': days[-1] if days else '',
            'planned': planned.get(node_id, 0),
            'goal_ids': goal_ids,
            'check': check,
            'work': _grouped(items)[:RECENT],
            'tasks': len(items),
        }

    status: Dict[str, str] = {}
    for node_id, node in nodes.items():
        if node_id in complete:
            status[node_id] = 'complete'
            continue
        figure = figures.get(node_id)
        worked = bool(figure and (figure['sessions'] or figure['check']))
        gates = [gate for gate in node['requires'] if gate in nodes]
        if worked:
            status[node_id] = 'progress'
        elif not gates or all(gate in complete for gate in gates):
            status[node_id] = 'available'

    unfiled = {
        tree: {'count': len(titles),
               'titles': list(dict.fromkeys(reversed(titles)))[:UNFILED_SAMPLES]}
        for tree, titles in filed['unfiled'].items()
    }
    named = {goal_id for figure in figures.values() for goal_id in figure['goal_ids']}
    return {
        'status': status,
        'nodes': figures,
        'unfiled': unfiled,
        'goals': {goal_id: goal_titles[goal_id] for goal_id in sorted(named) if goal_id in goal_titles},
        'checkable': sorted(checkable & set(nodes)),
        'targets': dict(TARGET),
    }


def opened_by(node_id: str, before: Dict[str, str], after: Dict[str, str]) -> List[Dict[str, str]]:
    """The nodes that `node_id` finishing opened: locked in `before`, open in
    `after`, and gated on it. For the check's result screen."""
    out = []
    for other in catalog().values():
        if node_id in other['requires'] and other['id'] not in before and other['id'] in after:
            out.append({'id': other['id'], 'name': other['name']})
    return out


def step_for(sessions: int, steps: Sequence[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """The written step a reader with this many sessions is on: one step per
    session, staying on the last once they are through."""
    if not steps:
        return None
    return steps[min(max(sessions, 0), len(steps) - 1)]
