"""Records, read against everything else the account does.

## What this is for

The Achievements page reads a record against itself: 18 → 25, six months,
+1.1 a month. What it cannot say is what the record is *about*, or what the
rest of the account did while it moved. A record called "AMC 8" is a
Competition Mathematics contest; the account's finished tasks say how much
Competition Mathematics it did between the 18 and the 25; its goals say
whether "Qualify for AIME" is what all of that is for. None of that is typed
anywhere. It is all in the names.

So this reads each record's name (and its category and note) through the same
filing the topic library uses (backend/tracking/topics.py): a contest, course
or site it names ("AMC 8", "Codeforces", "USACO Bronze"), the skill tree that
contest belongs to, and the subject that tree sits under. Then it joins:

    the work      finished tasks on the same contest or tree, else the subject
    the goals     active goals whose own words name the same contest, tree or
                  subject, and how far the record's best gets toward a goal
                  that has a number in it
    the period    which bests were set in the window the page is showing, and
                  in the window before it

and writes the findings as short sentences with a weight, the way
growth_reads.py does, so the page shows the strongest few.

## What it will not say

Every reading has a floor. A trend needs three dated entries, a monthly rate
four weeks of them, "stalled" a best older than six weeks with entries after
it, and "hours per point" a real gain and real hours. A record whose name
files nowhere is still counted and broken down by its category, but nothing
is said about the work behind it, because there is no work it can honestly
be tied to. Nothing calls a model: a name always files the same way, and the
tests can say exactly where it lands.

Pure: `analyse` takes rows and dates. backend/api/records.py is the only
caller that touches the database.
"""
import json
import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from functools import lru_cache
from statistics import median
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from backend.config.subjects import BY_ID
from backend.tracking import topics

#: Dated entries before a trend is said at all, and before it stops being an
#: early read. The same gates as frontend/src/utils/records.ts (`NEED`).
NEED_TREND = 3
NEED_SETTLED = 5
#: Days from the first entry to the best before a monthly rate is said.
RATE_DAYS = 28
#: A best this old, with entries logged after it, is a record that has stalled.
STALL_DAYS = 45
#: Fewer related tasks than this on the contest or tree, and the subject's
#: tasks stand in for them.
DIRECT_FLOOR = 3

#: Findings shown, strongest first.
READS_MAX = 8
#: The most lines of one kind, so six old climbs can't push out this month's
#: new best, the record that's stuck and the goal it's for.
PER_KIND = {'climb': 3, 'fresh': 3, 'stalled': 2, 'slipping': 1, 'goal': 2, 'fastest': 1}
#: "About 3h per point" is only said of a climb this short. Over years the
#: related work is everything the account did in the area, and the ratio
#: stops describing what the point cost.
PER_UNIT_DAYS = 548


# --------------------------------------------------------------------------
# Printing figures — the same rules as formatValue in utils/records.ts
# --------------------------------------------------------------------------
def _round(value: float) -> float:
    return round(float(value) * 100) / 100


def _number(value: float) -> str:
    clean = _round(value)
    if clean == int(clean):
        return '{:,}'.format(int(clean))
    return '{:,}'.format(clean).rstrip('0').rstrip('.')


def fmt(value: float, unit: str = '', target: float = 0) -> str:
    """A figure the way its unit reads: "7m 45s", "25 / 25", "12 problems"."""
    clean = _round(value)
    if unit == 'minutes':
        seconds = max(0, round(clean * 60))
        if seconds < 3600 and seconds % 60:
            minutes = seconds // 60
            span = '{}m {}s'.format(minutes, seconds % 60) if minutes else '{}s'.format(seconds % 60)
        else:
            total = max(0, round(clean))
            hours, minutes = divmod(total, 60)
            span = '{}h {}m'.format(hours, minutes) if hours else '{}m'.format(minutes)
        return '{} / {}'.format(span, fmt(target, 'minutes')) if target > 0 else span
    shown = _number(clean)
    if target > 0:
        return '{} / {}'.format(shown, _number(target))
    return '{} {}'.format(shown, unit) if unit and unit != 'points' else shown


def change(amount: float, unit: str, direction: str) -> str:
    """A difference toward better: "+2", "20s faster", "−3"."""
    size = fmt(abs(amount), unit)
    if amount == 0:
        return size
    if direction == 'lower' and unit == 'minutes':
        return '{} {}'.format(size, 'faster' if amount > 0 else 'slower')
    plus = (amount > 0) != (direction == 'lower')
    return '{}{}'.format('+' if plus else '−', size)


def duration(days: int) -> str:
    """"4 months", "3 weeks", "5 days"."""
    if days < 1:
        return 'the same day'
    if days < 14:
        return '{} day{}'.format(days, '' if days == 1 else 's')
    if days < 60:
        return '{} weeks'.format(round(days / 7))
    months = round(days / 30.44)
    if months < 12:
        return '{} months'.format(months)
    years, rest = divmod(months, 12)
    out = '{} year{}'.format(years, '' if years == 1 else 's')
    return out + (' {} month{}'.format(rest, '' if rest == 1 else 's') if rest else '')


def hours(seconds: float) -> str:
    """"22h", "40m", "1.5h"."""
    if seconds < 3600:
        return '{}m'.format(max(1, round(seconds / 60)))
    value = seconds / 3600
    return '{}h'.format(round(value) if value >= 10 else round(value, 1)).replace('.0h', 'h')


# --------------------------------------------------------------------------
# Small readers
# --------------------------------------------------------------------------
def _day(raw) -> Optional[date]:
    text = str(raw or '')[:10]
    try:
        return datetime.strptime(text, '%Y-%m-%d').date()
    except ValueError:
        return None


def _num(raw) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 0.0
    return value if value == value else 0.0


def _good(value: float, direction: str) -> float:
    """Bigger is better, whichever way the record is measured."""
    return -value if direction == 'lower' else value


def _links(raw) -> List[str]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return [str(name) for name in parsed if str(name).strip()] if isinstance(parsed, list) else []


def _short(iso: str) -> str:
    """"Sep 12", without the platform-specific strftime flags."""
    day = _day(iso)
    return '{} {}'.format(day.strftime('%b'), day.day) if day else ''


#: What one unit of a record is called in "about 3h per point".
PER = {'points': 'point', '': 'point', 'rating': 'rating point', 'problems': 'problem',
       'level': 'level', 'days': 'day', 'lines': 'line'}


def subject_name(subject: str) -> str:
    entry = BY_ID.get(subject)
    return entry['name'] if entry else ''


# --------------------------------------------------------------------------
# What a record is about
# --------------------------------------------------------------------------
@lru_cache(maxsize=1)
def _tree_roots() -> Dict[str, str]:
    """Each skill tree's top-level area ("Mathematics" over Competition
    Mathematics), from the node file the taxonomy already reads."""
    with open(topics.NODES_PATH, encoding='utf-8') as handle:
        nodes = json.load(handle)['nodes']
    roots: Dict[str, str] = {}
    for node in nodes:
        path = node.get('treePath') or []
        if path and node['tree'] not in roots:
            roots[node['tree']] = str(path[0])
    return roots


def _close(a: str, b: str) -> bool:
    """Two stemmed words that are the same word: "run" and "runn"."""
    if len(a) < 3 or len(b) < 3:
        return a == b
    return a.startswith(b) or b.startswith(a)


def _subject_by_words(text: str, used: Counter) -> str:
    """The catalog subject whose name the text says, preferring the ones this
    account works in. "Mile run" and "Running" both say Running."""
    said = topics.words(text)
    if not said:
        return ''
    best, best_score = '', 0.0
    for subject_id, entry in BY_ID.items():
        name = topics.words(entry['name'])
        if not name or not all(any(_close(word, have) for have in said) for word in name):
            continue
        value = len(name) * 10 + min(used.get(subject_id, 0), 50) / 10
        if value > best_score:
            best, best_score = subject_id, value
    return best


def subject_for_tree(tree: str, used: Counter) -> str:
    """The catalog subject a skill tree sits under.

    The tree's own id when it is a subject (calculus, violin). Otherwise the
    subjects whose families list it, and of those the one this account has
    the most tasks in, so a coder's Algorithms is Coding and a student's is
    Computer Science. Then the tree's top-level area by name. Then nothing.
    """
    if not tree:
        return ''
    own = tree.replace('-', '_')
    if own in BY_ID:
        return own
    families = topics.taxonomy().families
    candidates = [subject for subject, trees in families.items() if tree in trees and subject in BY_ID]
    if candidates:
        return max(candidates, key=lambda s: (used.get(s, 0), len(families.get(s, []))))
    root = _tree_roots().get(tree, '')
    return _subject_by_words(root, used) if root else ''


def infer(name: str, category: str = '', note: str = '', used: Optional[Counter] = None) -> Dict[str, str]:
    """What one record is about, from its own words.

    `how` says where the answer came from, which is also how sure it is:
    `name` (the record's name files under a contest, tree or topic),
    `category` (only the category does), `subject` (the words name a subject
    and nothing finer) or `none`.
    """
    used = used or Counter()
    tax = topics.taxonomy()
    found = topics.classify(name, '', '')
    how = 'name' if found['subsubject'] else ''
    if not found['subsubject']:
        found = topics.classify(category, note, '')
        how = 'category' if found['subsubject'] else ''

    tree = found['subsubject']
    subject = subject_for_tree(tree, used)
    if not subject:
        subject = _subject_by_words(name, used) or _subject_by_words(category, used)
        if subject and not how:
            how = 'subject'
    context = found['context']
    return {
        'subject': subject,
        'subject_name': subject_name(subject),
        'tree': tree,
        'tree_label': tax.trees.get(tree, '') if tree else '',
        'topic': found['topic'],
        'topic_label': tax.label(found['topic']) if found['topic'] else '',
        'context': context,
        'context_label': tax.context_by_id[context]['label'] if context in tax.context_by_id else '',
        'how': how or 'none',
    }


# --------------------------------------------------------------------------
# One record, across its entries
# --------------------------------------------------------------------------
def group(rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Record rows grouped by name, oldest dated entry first. Direction is the
    newest entry's answer, NULL reading as 'higher' — `directionOf` in
    utils/records.ts, said again here because the server reads the rows too."""
    groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if (row.get('kind') or 'record') != 'record':
            continue
        key = str(row.get('name') or '').strip().lower()
        if key and _day(row.get('achieved_on')):
            groups[key].append(row)
    out = []
    for entries in groups.values():
        entries.sort(key=lambda row: (str(row.get('achieved_on')), str(row.get('created_at') or '')))
        direction = 'higher'
        for row in reversed(entries):
            if row.get('comparison_direction') in ('higher', 'lower'):
                direction = row['comparison_direction']
                break
        newest = entries[-1]
        out.append({
            'name': str(newest.get('name') or '').strip(),
            'category': str(newest.get('category') or '').strip(),
            'note': ' '.join(str(row.get('note') or '') for row in entries)[:400],
            'unit': str(newest.get('unit') or ''),
            'target': _num(newest.get('target')),
            'direction': direction,
            'entries': entries,
        })
    return out


def _trend(goods: List[float]) -> Optional[Dict[str, Any]]:
    """Which way the last five results lean, against the whole range — the
    same reading as `trendOf` in utils/records.ts."""
    if len(goods) < NEED_TREND:
        return None
    window = goods[-5:]
    n = len(window)
    mx, my = (n - 1) / 2, sum(window) / n
    top = sum((i - mx) * (y - my) for i, y in enumerate(window))
    bottom = sum((i - mx) ** 2 for i in range(n))
    lean = (top / bottom if bottom else 0) * (n - 1)
    spread = max(goods) - min(goods)
    word = 'steady' if spread == 0 or abs(lean) < 0.1 * spread else ('improving' if lean > 0 else 'slipping')
    return {'word': word, 'early': len(goods) < NEED_SETTLED, 'basis': n}


def stats(record: Dict[str, Any], today: date) -> Dict[str, Any]:
    """The record's own figures: best, start, gain, how long the best took,
    the monthly rate and the trend, each behind its gate."""
    entries = record['entries']
    direction = record['direction']
    values = [_num(row.get('value')) for row in entries]
    days = [_day(row.get('achieved_on')) for row in entries]
    goods = [_good(value, direction) for value in values]

    best_at = max(range(len(goods)), key=lambda i: (goods[i], -i))
    first, best = values[0], values[best_at]
    gain = goods[best_at] - goods[0]
    days_to_best = (days[best_at] - days[0]).days if best_at else None
    span = (days[-1] - days[0]).days
    rate = None
    if len(entries) >= NEED_TREND and span >= RATE_DAYS and gain > 0 and days_to_best:
        rate = gain / (days_to_best / 30.44)

    # Every entry that set a best, after the first: the dates of each step up.
    steps = []
    peak = goods[0]
    for i in range(1, len(goods)):
        if goods[i] > peak:
            steps.append({'on': days[i].isoformat(), 'jump': goods[i] - peak, 'value': values[i]})
            peak = goods[i]

    return {
        'first': first,
        'first_on': days[0].isoformat(),
        'best': best,
        'best_on': days[best_at].isoformat(),
        'latest': values[-1],
        'latest_on': days[-1].isoformat(),
        'gain': gain,
        'percent': (gain / abs(first) * 100) if first else 0.0,
        'entries': len(entries),
        'days_to_best': days_to_best,
        'days_since_best': (today - days[best_at]).days,
        'after_best': len(entries) - 1 - best_at,
        'rate_per_month': rate,
        'trend': _trend(goods),
        'steps': steps,
    }


def _best_by(entries: Sequence[Dict[str, Any]], direction: str, until: date) -> Optional[float]:
    """The best on or before a day, as goodness, or None before the first."""
    goods = [_good(_num(row.get('value')), direction) for row in entries
             if _day(row.get('achieved_on')) and _day(row.get('achieved_on')) <= until]
    return max(goods) if goods else None


# --------------------------------------------------------------------------
# The work behind a record
# --------------------------------------------------------------------------
def _filed(task: Dict[str, Any]) -> Dict[str, str]:
    return topics.classify(str(task.get('title') or ''), str(task.get('description') or ''),
                           str(task.get('subject') or ''))


def related(info: Dict[str, str], tasks: Sequence[Dict[str, Any]],
            filed_all: Optional[Sequence[Dict[str, str]]] = None) -> Tuple[List[Dict[str, Any]], str]:
    """The finished tasks a record's progress came from, and how they were
    matched: `context` (they name the same contest or one of its family, AMC
    10 work for an AMC 8 record counts), `tree` (the same skill tree),
    `subject` (only the subject agrees), or '' when nothing does."""
    context, tree, subject = info['context'], info['tree'], info['subject']
    family = context.split('-')[0].rstrip('0123456789') if context else ''
    by_context, by_tree, by_subject = [], [], []
    # Filed once per task by the caller when it has them: filing is the costly
    # part, and every record would otherwise file all of the tasks again.
    for at, task in enumerate(tasks):
        filed = (filed_all[at] if filed_all is not None else _filed(task)) if (context or tree) else {}
        task_context = filed.get('context', '')
        if context and task_context and (
                task_context == context or task_context.split('-')[0].rstrip('0123456789') == family):
            by_context.append(task)
        elif tree and filed.get('subsubject') == tree:
            by_tree.append(task)
        elif subject and task.get('subject') == subject:
            by_subject.append(task)
    direct = by_context + by_tree
    if len(direct) >= DIRECT_FLOOR:
        return direct, 'context' if len(by_context) >= DIRECT_FLOOR else 'tree'
    if subject:
        everything = direct + by_subject
        if everything:
            return everything, 'subject'
    return direct, ('tree' if direct else '')


def _between(tasks: Sequence[Dict[str, Any]], start: date, end: date) -> Tuple[int, float]:
    """How many of these tasks were finished from `start` to `end`, and the
    seconds they took."""
    count, seconds = 0, 0.0
    for task in tasks:
        done = _day(task.get('completed_at'))
        if done and start <= done <= end:
            count += 1
            seconds += _num(task.get('completion_seconds'))
    return count, seconds


# --------------------------------------------------------------------------
# What a record is for
# --------------------------------------------------------------------------
def _target_number(goal: Dict[str, Any], names: Sequence[str] = ()) -> Optional[float]:
    """The number a goal is aiming at: its own field, else the last number its
    title says ("Reach Codeforces 1300").

    A number that is part of a name is not a target: the 8 in "Solve 400 AMC
    8 problems" is the contest. So the record's name, the contest label and
    anything the taxonomy's contest patterns match are cut out first.

    The goal's own fields count only when it is measured as a number. A goal
    measured in milestones stores how many milestones it has there ("Violin
    ARCT": 5), which is not a score anybody is aiming at. A time in the title
    ("Run a 7:30 mile") reads as minutes.
    """
    if str(goal.get('measure') or '').strip().lower() == 'number':
        for key in ('target_number', 'target_value'):
            value = _num(goal.get(key))
            if value > 0:
                return value
    title = str(goal.get('title') or '').lower()
    for name in names:
        if name:
            title = title.replace(name.lower(), ' ')
    for context in topics.taxonomy().contexts:
        for pattern in context['regex']:
            title = pattern.sub(' ', title)
    clock = re.findall(r'\b(\d{1,2}):([0-5]\d)\b', title)
    if clock:
        minutes, seconds = clock[-1]
        return int(minutes) + int(seconds) / 60
    found = re.findall(r'(\d[\d,]*(?:\.\d+)?)', title)
    for raw in reversed(found):
        value = _num(raw.replace(',', ''))
        if value > 0:
            return value
    return None


def goals_for(record: Dict[str, Any], info: Dict[str, str], record_stats: Dict[str, Any],
              goals: Sequence[Dict[str, Any]], today: date) -> List[Dict[str, Any]]:
    """The active goals a record works toward, strongest tie first.

    A goal is tied when its own words name the record's contest (3), its name
    (3), its skill tree (2), or when the goal is filed under the record's
    subject (1). Two points are needed, so a subject alone never ties a
    record to a goal: "Running" does not make every running goal about one
    mile time.

    When the tie is by contest or name and the goal has a number in it, the
    record's best is measured against that number in the record's direction,
    from the record's first entry: Codeforces 800 → 1150 toward 1300 is 70%.
    The number has to be in reach of the record's own scale (between a fifth
    and five times its best) or it is about something else — "Solve 50 AMC
    problems" is not a score of 50.
    """
    name_words = set(topics.words(record['name']))
    out = []
    for goal in goals:
        found = topics.scope(goal)
        title_words = set(topics.words(str(goal.get('title') or '')))
        score, by = 0, []
        if info['context'] and info['context'] in found['contexts']:
            score += 3
            by.append('contest')
        if name_words and name_words <= title_words:
            score += 3
            by.append('name')
        if info['tree'] and info['tree'] in found['trees']:
            score += 2
            by.append('tree')
        if info['subject'] and info['subject'] in found['subjects']:
            score += 1
            by.append('subject')
        if score < 2:
            continue

        progress = None
        aim = _target_number(goal, (record['name'], info['context_label']))
        best = record_stats['best']
        if aim and ('contest' in by or 'name' in by) and best and 0.2 * abs(best) <= aim <= 5 * abs(best):
            direction = record['direction']
            start, now, end = (_good(record_stats['first'], direction), _good(best, direction),
                               _good(aim, direction))
            met = now >= end
            share = 1.0 if met else (0.0 if end == start else (now - start) / (end - start))
            progress = {'target': aim, 'percent': max(0.0, min(100.0, share * 100)), 'met': met}
        due = _day(goal.get('deadline'))
        out.append({
            'id': str(goal.get('id')),
            'title': str(goal.get('title') or ''),
            'by': by,
            'score': score,
            'progress': progress,
            'days_left': (due - today).days if due else None,
        })
    out.sort(key=lambda goal: (-goal['score'], goal['title']))
    return out[:3]


# --------------------------------------------------------------------------
# All of it
# --------------------------------------------------------------------------
def analyse(rows: Sequence[Dict[str, Any]], tasks: Sequence[Dict[str, Any]],
            goals: Sequence[Dict[str, Any]], today: date, days: int = 90) -> Dict[str, Any]:
    """Every record, read against the work and the goals, plus the account's
    breakdown and the findings worth saying, over the last `days` days."""
    days = max(7, int(days))
    start = today - timedelta(days=days - 1)
    before_start = start - timedelta(days=days)
    used = Counter(str(task.get('subject') or '') for task in tasks)

    milestones = [row for row in rows if row.get('kind') == 'milestone']
    filed_all = [_filed(task) for task in tasks]
    out_records = []
    for record in group(rows):
        info = infer(record['name'], record['category'], record['note'], used)
        figures = stats(record, today)
        direction, unit = record['direction'], record['unit']

        work, basis = related(info, tasks, filed_all)
        first_on, best_on = _day(figures['first_on']), _day(figures['best_on'])
        climb_tasks, climb_seconds = _between(work, first_on, best_on)
        since_tasks, since_seconds = _between(work, best_on + timedelta(days=1), today)
        window_tasks, window_seconds = _between(work, start, today)

        before = _best_by(record['entries'], direction, start - timedelta(days=1))
        now = _best_by(record['entries'], direction, today)
        earlier = _best_by(record['entries'], direction, before_start - timedelta(days=1))
        bests_now = [step for step in figures['steps'] if _day(step['on']) >= start]
        bests_before = [step for step in figures['steps'] if before_start <= _day(step['on']) < start]
        logged_now = sum(1 for row in record['entries'] if _day(row.get('achieved_on')) >= start)

        per_unit = None
        if figures['gain'] > 0 and climb_seconds >= 3600:
            per_unit = climb_seconds / figures['gain']

        linked = [str(row.get('name') or '') for row in milestones
                  if record['name'].lower() in (name.lower() for name in _links(row.get('links')))]

        in_window = [task for task in work
                     if _day(task.get('completed_at')) and start <= _day(task.get('completed_at')) <= today]

        out_records.append({
            '_window_work': in_window,
            'name': record['name'],
            'category': record['category'],
            'unit': unit,
            'target': record['target'],
            'direction': direction,
            **info,
            **figures,
            'work': {
                'basis': basis,
                'climb_tasks': climb_tasks,
                'climb_seconds': climb_seconds,
                'since_tasks': since_tasks,
                'since_seconds': since_seconds,
                'window_tasks': window_tasks,
                'window_seconds': window_seconds,
                'seconds_per_unit': per_unit,
            },
            'window': {
                'logged': logged_now,
                'new_bests': len(bests_now),
                'previous_bests': len(bests_before),
                # How far the best moved inside the window, toward better.
                'gain': (now - before) if before is not None and now is not None else None,
                'started_in_window': before is None,
                'previous_gain': (before - earlier) if earlier is not None and before is not None else None,
            },
            'goals': goals_for(record, info, figures, goals, today),
            'milestones': linked,
        })

    out_records.sort(key=lambda r: (-(r['window']['new_bests']), -r['percent'], r['name'].lower()))
    subjects = by_subject(out_records)
    for record in out_records:
        record.pop('_window_work', None)
    return {
        'days': days,
        'since': start.isoformat(),
        'summary': summary(out_records),
        'by_subject': subjects,
        'records': out_records,
        'reads': reads(out_records, days),
    }


def summary(records: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """The account's records in five figures."""
    moved = [r for r in records if r['entries'] > 1]
    improving = [r for r in moved if r['gain'] > 0]
    percents = [r['percent'] for r in improving if r['percent'] > 0]
    return {
        'records': len(records),
        'with_history': len(moved),
        'improving': len(improving),
        'not_yet': len(moved) - len(improving),
        'new_bests': sum(r['window']['new_bests'] for r in records),
        'previous_bests': sum(r['window']['previous_bests'] for r in records),
        'logged': sum(r['window']['logged'] for r in records),
        'median_percent': median(percents) if percents else None,
        'stalled': sum(1 for r in records if _stalled(r)),
        'tied_to_goals': sum(1 for r in records if r['goals']),
    }


def by_subject(records: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Records under the subject they were read as, or their own category
    when they file nowhere, with the strongest climber in each."""
    groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for record in records:
        key = record['subject'] or 'category:' + (record['category'] or 'Other').lower()
        groups[key].append(record)
    out = []
    for key, members in groups.items():
        inferred = not key.startswith('category:')
        label = members[0]['subject_name'] if inferred else (members[0]['category'] or 'Other')
        improving = [r for r in members if r['gain'] > 0]
        top = max(improving, key=lambda r: r['percent'], default=None)
        percents = [r['percent'] for r in improving if r['percent'] > 0]
        out.append({
            'key': key,
            'label': label,
            'inferred': inferred,
            'records': len(members),
            'improving': len(improving),
            'new_bests': sum(r['window']['new_bests'] for r in members),
            'median_percent': median(percents) if percents else None,
            # Each task once, however many records in the subject it counts
            # toward: a Codeforces round is work behind the rating and behind
            # "longest coding session", and it was still one round.
            'window_seconds': sum(_num(task.get('completion_seconds')) for task in {
                id(task): task for r in members if r['work']['basis'] for task in r.get('_window_work', [])
            }.values()),
            'top': {'name': top['name'], 'percent': top['percent'],
                    'gain': change(top['gain'], top['unit'] if top['unit'] == 'minutes' else '', top['direction'])}
            if top else None,
            'names': [r['name'] for r in members],
        })
    out.sort(key=lambda g: (-g['new_bests'], -(g['median_percent'] or 0), g['label'].lower()))
    return out


def _stalled(record: Dict[str, Any]) -> bool:
    return (record['entries'] >= NEED_TREND and record['after_best'] >= 1
            and record['days_since_best'] >= STALL_DAYS)


def _area(record: Dict[str, Any]) -> str:
    """What the work behind a record is called in a sentence."""
    basis = record['work']['basis']
    if basis == 'context' and record['context']:
        # The contest family, since AMC 10 sets count toward an AMC 8 record:
        # "AMC work", not "AMC 8 work" about tasks that were AMC 10.
        contexts = topics.taxonomy().context_by_id
        family = record['context'].split('-')[0].rstrip('0123456789')
        label = (contexts.get(family) or contexts.get(record['context']) or {}).get('label', '')
        if label:
            return '{} work'.format(label)
    if basis in ('context', 'tree') and record['tree_label']:
        return '{} work'.format(record['tree_label'])
    if record['subject_name']:
        return '{} work'.format(record['subject_name'])
    return 'related work'


def reads(records: Sequence[Dict[str, Any]], days: int) -> List[Dict[str, Any]]:
    """The findings worth a line, strongest first. Each has a floor; `weight`
    is the size of the effect times how much record is behind it."""
    found: List[Dict[str, Any]] = []
    span = 'the last {} days'.format(days) if days < 365 else ('the last year' if days < 730 else 'the last two years')

    def say(kind, record, tone, title, detail, weight):
        found.append({'id': '{}:{}'.format(kind, record['name'].lower()), 'kind': kind,
                      'record': record['name'], 'tone': tone, 'title': title,
                      'detail': detail, 'weight': round(weight, 3)})

    for r in records:
        unit_less = r['unit'] if r['unit'] == 'minutes' else ''
        work = r['work']

        stalled = _stalled(r)
        than = 'than' if r['direction'] == 'lower' and r['unit'] == 'minutes' else 'on'

        # 1. A climb, and what it took.
        if r['gain'] > 0 and r['days_to_best']:
            detail = '{} to {} in {}.'.format(fmt(r['first'], r['unit'], r['target']),
                                             fmt(r['best'], r['unit'], r['target']),
                                             duration(r['days_to_best']))
            if work['basis'] and work['climb_tasks'] and work['climb_seconds'] >= 3600:
                detail += ' That came with {} of {} over {} task{}'.format(
                    hours(work['climb_seconds']), _area(r), work['climb_tasks'],
                    '' if work['climb_tasks'] == 1 else 's')
                if work['seconds_per_unit'] and r['unit'] in PER and r['days_to_best'] <= PER_UNIT_DAYS:
                    detail += ', about {} per {}'.format(hours(work['seconds_per_unit']), PER[r['unit']])
                detail += '.'
            say('climb', r, 'good', '{}: {} since your first entry'.format(
                r['name'], change(r['gain'], unit_less, r['direction'])),
                # Size of the climb, scaled by how much record is behind it,
                # topping out near a fresh best's weight rather than far above.
                detail, 0.6 + min(r['percent'], 200) / 100 * min(r['entries'], 6) / 6 * 1.6)

        # 2. A best set in the window. Not beside "hasn't moved": a best from
        # two months ago is both inside a 90-day window and stalled, and the
        # stall is the more useful thing to hear.
        if r['window']['new_bests'] and not stalled:
            last = r['steps'][-1]
            size = last['jump'] / abs(r['first']) if r['first'] else 0.1
            say('fresh', r, 'good',
                'New best on {}: {}'.format(r['name'], fmt(last['value'], r['unit'], r['target'])),
                '{} {} your previous best, set {}. {} new best{} in {}.'.format(
                    change(last['jump'], unit_less, r['direction']), than,
                    _short(last['on']),
                    r['window']['new_bests'], '' if r['window']['new_bests'] == 1 else 's', span),
                1.2 + min(size * 10, 1.5) + 0.2 * (r['window']['new_bests'] - 1))

        # 3. Stalled, with work going in.
        if stalled:
            detail = 'Your best is {} from {}, and {} entr{} since haven\'t topped it.'.format(
                fmt(r['best'], r['unit'], r['target']), _short(r['best_on']),
                r['after_best'], 'y' if r['after_best'] == 1 else 'ies')
            if work['basis'] and work['since_seconds'] >= 3600:
                detail += ' You\'ve put {} into {} since then, so a different kind of session may be what moves it.'.format(
                    hours(work['since_seconds']), _area(r))
            say('stalled', r, 'bad', '{} hasn\'t moved in {}'.format(r['name'], duration(r['days_since_best'])),
                detail, 1.0 + r['after_best'] * 0.3)

        # 4. Slipping, said only once there is a settled trend.
        trend = r['trend']
        if trend and not trend['early'] and trend['word'] == 'slipping' and not stalled:
            say('slipping', r, 'bad', '{} has been slipping'.format(r['name']),
                'Your last {} results lean the wrong way. Your best is still {}.'.format(
                    trend['basis'], fmt(r['best'], r['unit'], r['target'])), 1.2)

        # 5. What it is for.
        for goal in r['goals'][:1]:
            progress = goal['progress']
            if progress:
                if progress['met']:
                    detail = 'Your best of {} already reaches {}. Worth checking it off.'.format(
                        fmt(r['best'], r['unit'], r['target']), fmt(progress['target'], r['unit']))
                else:
                    detail = 'Your best of {} is {}% of the way to {}{}.'.format(
                        fmt(r['best'], r['unit'], r['target']), round(progress['percent']),
                        fmt(progress['target'], r['unit']),
                        ', with {} days left'.format(goal['days_left']) if goal['days_left'] is not None
                        and goal['days_left'] >= 0 else '')
                weight = 1.4 + progress['percent'] / 100
            else:
                detail = 'Every new best here is progress toward it.'
                weight = 0.8
            say('goal', r, 'good' if not progress or progress['met'] or progress['percent'] >= 50 else 'flat',
                '{} counts toward "{}"'.format(r['name'], goal['title']), detail, weight)

    # 6. Where records move fastest, once two areas have climbs with rates.
    rates: Dict[str, List[float]] = defaultdict(list)
    for r in records:
        if r['rate_per_month'] and r['first'] and r['subject_name']:
            rates[r['subject_name']].append(r['rate_per_month'] / abs(r['first']) * 100)
    if len(rates) >= 2:
        ranked = sorted(((median(v), k) for k, v in rates.items()), reverse=True)
        (top, top_name), (low, low_name) = ranked[0], ranked[-1]
        if top > 0 and top >= 1.5 * max(low, 0.01):
            found.append({'id': 'fastest', 'kind': 'fastest', 'record': '', 'tone': 'flat',
                          'title': 'Your records climb fastest in {}'.format(top_name),
                          'detail': 'About {}% a month there, against {}% in {}.'.format(
                              round(top, 1), round(low, 1), low_name),
                          'weight': 1.3})

    found.sort(key=lambda item: -item['weight'])
    # At most two lines about any one record, so one busy record can't fill
    # it, and at most PER_KIND of each kind.
    per_record: Counter = Counter()
    per_kind: Counter = Counter()
    kept = []
    for item in found:
        if item['record'] and per_record[item['record']] >= 2:
            continue
        if per_kind[item['kind']] >= PER_KIND.get(item['kind'], 2):
            continue
        per_record[item['record']] += 1
        per_kind[item['kind']] += 1
        kept.append(item)
    return kept[:READS_MAX]
