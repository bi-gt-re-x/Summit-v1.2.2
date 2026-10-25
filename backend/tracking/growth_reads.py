"""Growth, specifically: what improved, when you work best, what to watch.

## What this is for

The Growth tab drew levels and scores, so every sentence on it could be said
of anybody: "Chemistry went Competent → Strong". This reads the finished
tasks themselves and says things only this account's record can say:

    You improved most at recursive counting: rated 2.2 → 2.9 over 14 sessions.
    Mathematics is your favorite thing to do at 4 pm.
    Your math goes best before noon: 4.1, against 3.4 after 9 pm.
    Your best work comes in 30-60 minute sessions.

Topics come from backend/tracking/topics.py (task names filed as subject →
area → topic), so "improved" can be about recursive counting rather than
Mathematics. Times come from when a session started: the calendar block's
start when it has one, else the finish time less its length.

## How a finding earns its place

Each kind has its own floor (enough sessions, a gap bigger than a rating's
everyday wobble, a share well above even), and each surviving finding gets a
weight: how big the effect is times how much record is behind it. The tab
shows the strongest few in each group. Nothing is said that a handful of
tasks could have produced by chance, and nothing calls a model, so a finding
always matches the record under it.

Pure: `reads` takes the tasks and the day, and backend/api/analytics.py's
`/api/growth_reads` is the only caller that touches the database.
"""
import math
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple

from backend.config.subjects import BY_ID
from backend.tracking import topics

#: The catalog groups that are life rather than study. Their sessions still
#: count toward everything else, but "laundry is slipping" and "planning is
#: your favorite thing at 10 pm" aren't growth, so they aren't said.
LIFE_GROUPS = {'Life and home', 'Health and fitness'}
#: And a few routines filed under study-ish groups.
ROUTINE_SUBJECTS = {'planning', 'meditation', 'sleep'}

#: The most lines one kind of finding gets in a group, so "When you work best"
#: isn't four "goes best" lines in a row.
PER_KIND = 2


def routine(subject: str) -> bool:
    entry = BY_ID.get(subject)
    return subject in ROUTINE_SUBJECTS or bool(entry and entry['group'] in LIFE_GROUPS)

#: A rating has to move at least this much (1-5 scale) to count as a change.
MOVE = 0.3

#: The parts of the day a session can start in.
PARTS = (
    ('morning', 'before noon', 5, 12),
    ('afternoon', 'in the afternoon', 12, 17),
    ('evening', 'in the evening', 17, 21),
    ('night', 'after 9 pm', 21, 29),  # 21:00 to 05:00, wrapping
)

WEEKDAYS = ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')

LENGTHS = (
    ('under 30 minutes', 0, 30),
    ('30-60 minute', 30, 60),
    ('60-90 minute', 60, 90),
    ('over 90 minutes', 90, 10_000),
)

REASONS = {
    'distracted': 'got distracted', 'unclear': 'unclear what to do', 'underestimated': 'took longer than planned',
    'no-time': 'ran out of time', 'low-energy': 'low energy', 'interrupted': 'kept getting interrupted',
}


# --------------------------------------------------------------------------
# One session
# --------------------------------------------------------------------------
def _when(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace('Z', '')[:19])
    except ValueError:
        return None


def _num(value) -> Optional[float]:
    try:
        return None if value is None or value == '' else float(value)
    except (TypeError, ValueError):
        return None


def session(task: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """A finished task as a session: when it started, how long, how it went."""
    done = _when(task.get('completed_at'))
    if not done or not task.get('subject'):
        return None
    created = _when(task.get('created_at'))
    seconds = _num(task.get('completion_seconds')) or 0
    if task.get('show_on_calendar') and created and created.date() == done.date() and created <= done:
        start = created
    elif 0 < seconds < 6 * 3600:
        start = done - timedelta(seconds=seconds)
    else:
        start = done
    minutes = seconds / 60 if 0 < seconds < 6 * 3600 else None
    filed = topics.classify(task.get('title', ''), task.get('description', ''), task['subject'])
    execution = _num(task.get('execution'))
    difficulty = _num(task.get('difficulty'))
    return {
        'subject': task['subject'],
        'area': filed['subsubject'],
        'topic': filed['topic'],
        'start': start,
        'day': done.date(),
        'minutes': minutes,
        'rating': execution if execution and 1 <= execution <= 5 else None,
        'difficulty': difficulty if difficulty and 1 <= difficulty <= 5 else None,
        'reason': task.get('reason') or '',
    }


# --------------------------------------------------------------------------
# Words
# --------------------------------------------------------------------------
def clock(hour: int) -> str:
    hour %= 24
    if hour == 0:
        return 'midnight'
    if hour == 12:
        return 'noon'
    return '{} {}'.format(hour if hour < 12 else hour - 12, 'am' if hour < 12 else 'pm')


def _mean(values: List[float]) -> Optional[float]:
    return sum(values) / len(values) if values else None


def _part(hour: int) -> str:
    for key, _words, low, high in PARTS:
        if low <= hour < high or low <= hour + 24 < high:
            return key
    return 'night'


def _subject(name: str) -> str:
    """A subject inside a sentence: "your math sessions", "your violin"."""
    lowered = name.lower()
    return {'mathematics': 'math', 'computer science': 'computer science'}.get(lowered, lowered)


def _finding(kind: str, key: str, tone: str, title: str, detail: str, weight: float, group: str) -> Dict[str, Any]:
    return {'id': '{}:{}'.format(kind, key), 'kind': kind, 'tone': tone, 'title': title,
            'detail': detail, 'weight': round(weight, 3), 'group': group}


def _strength(effect: float, count: int) -> float:
    return abs(effect) * math.log(1 + count)


# --------------------------------------------------------------------------
# The reads
# --------------------------------------------------------------------------
def _halves(rated: List[Dict[str, Any]], field: str) -> Tuple[Optional[float], Optional[float]]:
    rated = sorted(rated, key=lambda s: s['start'])
    half = len(rated) // 2
    first = [s[field] for s in rated[:half] if s[field] is not None]
    last = [s[field] for s in rated[half:] if s[field] is not None]
    return _mean(first), _mean(last)


def improvements(sessions: List[Dict[str, Any]], since: date, tax) -> List[Dict[str, Any]]:
    """Topics (and areas without topics) whose ratings or difficulty moved."""
    out = []
    by_topic = defaultdict(list)
    by_area = defaultdict(list)
    for s in sessions:
        if s['day'] < since or s['rating'] is None or routine(s['subject']):
            continue
        if s['topic']:
            by_topic[s['topic']].append(s)
        elif s['area']:
            by_area[(s['subject'], s['area'])].append(s)

    for topic_id, rows in by_topic.items():
        if len(rows) < 6:
            continue
        label = tax.label(topic_id)
        area = tax.trees.get(tax.topics[topic_id]['tree'], '')
        was, now = _halves(rows, 'rating')
        if was is not None and now is not None and abs(now - was) >= MOVE:
            up = now > was
            out.append(_finding(
                'topic', topic_id, 'good' if up else 'bad',
                ('You improved at {}' if up else '{} is slipping').format(topics.lower(label) if up else label),
                'Rated {:.1f} → {:.1f} over your last {} sessions ({}).'.format(was, now, len(rows), area),
                _strength(now - was, len(rows)) + (0.3 if up else 0), 'improved' if up else 'watch'))
            continue
        hard_was, hard_now = _halves(rows, 'difficulty')
        if (hard_was is not None and hard_now is not None and hard_now - hard_was >= 0.5
                and was is not None and now is not None and now - was > -0.15):
            out.append(_finding(
                'harder', topic_id, 'good',
                'You took on harder {}'.format(topics.lower(label)),
                'Difficulty {:.1f} → {:.1f}, and your ratings held at {:.1f}.'.format(hard_was, hard_now, now),
                _strength(hard_now - hard_was, len(rows)), 'improved'))

    for (subject, area), rows in by_area.items():
        if len(rows) < 10:
            continue
        was, now = _halves(rows, 'rating')
        if was is not None and now is not None and abs(now - was) >= MOVE:
            up = now > was
            label = tax.trees.get(area, area)
            out.append(_finding(
                'area', area, 'good' if up else 'bad',
                ('Your {} work got better' if up else 'Your {} work is slipping').format(label),
                'Rated {:.1f} → {:.1f} over {} sessions.'.format(was, now, len(rows)),
                _strength(now - was, len(rows)) * 0.8, 'improved' if up else 'watch'))
    return out


def new_topics(sessions: List[Dict[str, Any]], since: date, tax) -> List[Dict[str, Any]]:
    """Topics first worked on inside the window, with a few sessions behind them."""
    first_seen: Dict[str, date] = {}
    counts = Counter()
    for s in sessions:
        if not s['topic'] or routine(s['subject']):
            continue
        first_seen[s['topic']] = min(first_seen.get(s['topic'], s['day']), s['day'])
        if s['day'] >= since:
            counts[s['topic']] += 1
    fresh = [(topic_id, n) for topic_id, n in counts.items() if first_seen[topic_id] >= since and n >= 3]
    if not fresh:
        return []
    fresh.sort(key=lambda item: -item[1])
    names = ', '.join('{} ({})'.format(topics.lower(tax.label(t)), n) for t, n in fresh[:3])
    count = len(fresh)
    return [_finding('new', 'topics', 'good',
                     'You started {} new topic{}'.format(count, '' if count == 1 else 's'),
                     'Sessions so far: {}{}.'.format(names, ', and more' if count > 3 else ''),
                     0.6 * math.log(1 + sum(n for _t, n in fresh)), 'improved')]


def favorite_times(sessions: List[Dict[str, Any]], since: date) -> List[Dict[str, Any]]:
    """The subject that owns a time of day, and each subject's own peak."""
    out = []
    recent = [s for s in sessions if s['day'] >= since]
    by_slot = defaultdict(Counter)
    for s in recent:
        if routine(s['subject']):
            continue
        slot = s['start'].hour // 2 * 2
        by_slot[slot][s['subject']] += 1
    for slot, subjects in by_slot.items():
        total = sum(subjects.values())
        subject, n = subjects.most_common(1)[0]
        share = n / total
        if total >= 12 and share >= 0.4:
            name = topics.subject_name(subject)
            out.append(_finding(
                'slot', '{}:{}'.format(slot, subject), 'flat',
                '{} is your favorite thing to do at {}'.format(name, clock(slot)),
                '{:.0%} of what you do between {} and {} is {}.'.format(share, clock(slot), clock(slot + 2), _subject(name)),
                _strength(share - 0.25, total) * 1.2, 'when'))

    by_subject = defaultdict(list)
    for s in recent:
        by_subject[s['subject']].append(s)
    for subject, rows in by_subject.items():
        if len(rows) < 20 or routine(subject):
            continue
        name = topics.subject_name(subject)
        # Its quality by part of the day.
        parts = defaultdict(list)
        for s in rows:
            if s['rating'] is not None:
                parts[_part(s['start'].hour)].append(s['rating'])
        rated = {key: _mean(values) for key, values in parts.items() if len(values) >= 5}
        if len(rated) >= 2:
            best = max(rated, key=rated.get)
            worst = min(rated, key=rated.get)
            gap = rated[best] - rated[worst]
            if gap >= 0.4:
                words = dict((key, w) for key, w, _l, _h in PARTS)
                out.append(_finding(
                    'best-time', subject, 'good',
                    'Your {} goes best {}'.format(_subject(name), words[best]),
                    'Rated {:.1f} {}, against {:.1f} {}.'.format(rated[best], words[best], rated[worst], words[worst]),
                    _strength(gap, len(rows)), 'when'))
        # Its day of the week.
        days = Counter(s['start'].weekday() for s in rows)
        weekday, n = days.most_common(1)[0]
        share = n / len(rows)
        if share >= 0.25:
            out.append(_finding(
                'weekday', subject, 'flat',
                '{} is {} day'.format(WEEKDAYS[weekday], _subject(name)),
                '{:.0%} of your {} sessions lately fall on a {}.'.format(share, _subject(name), WEEKDAYS[weekday]),
                _strength(share - 1 / 7, len(rows)) * 0.8, 'when'))
    return out


def session_lengths(sessions: List[Dict[str, Any]], since: date) -> List[Dict[str, Any]]:
    """The length of session your best work comes in."""
    buckets = defaultdict(list)
    for s in sessions:
        if s['day'] < since or s['rating'] is None or s['minutes'] is None or routine(s['subject']):
            continue
        for label, low, high in LENGTHS:
            if low <= s['minutes'] < high:
                buckets[label].append(s['rating'])
    rated = {label: _mean(values) for label, values in buckets.items() if len(values) >= 8}
    if len(rated) < 2:
        return []
    best = max(rated, key=rated.get)
    worst = min(rated, key=rated.get)
    gap = rated[best] - rated[worst]
    if gap < 0.25:
        return []
    plural = 'sessions ' + best if best.endswith('minutes') else best + ' sessions'
    worse = 'sessions ' + worst if worst.endswith('minutes') else worst + ' sessions'
    return [_finding('length', best, 'good', 'Your best work comes in {}'.format(plural),
                     'Rated {:.1f} there, against {:.1f} for {}.'.format(rated[best], rated[worst], worse),
                     _strength(gap, sum(len(v) for v in buckets.values())) * 0.9, 'when')]


def reason_times(sessions: List[Dict[str, Any]], since: date) -> List[Dict[str, Any]]:
    """When the most common thing that goes wrong tends to happen."""
    struck = [s for s in sessions if s['day'] >= since and s['reason'] in REASONS]
    if len(struck) < 6:
        return []
    reason, n = Counter(s['reason'] for s in struck).most_common(1)[0]
    parts = Counter(_part(s['start'].hour) for s in struck if s['reason'] == reason)
    part, m = parts.most_common(1)[0]
    if n < 5 or m / n < 0.5:
        return []
    words = dict((key, w) for key, w, _l, _h in PARTS)
    return [_finding('reason', reason, 'bad',
                     '"{}" shows up most {}'.format(REASONS[reason].capitalize(), words[part]),
                     '{} of the {} times you picked it.'.format(m, n),
                     _strength(m / n - 0.25, n), 'watch')]


def steady(sessions: List[Dict[str, Any]], today: date) -> List[Dict[str, Any]]:
    """Subjects worked on nearly every day for the last four weeks."""
    since = today - timedelta(days=27)
    days = defaultdict(set)
    for s in sessions:
        if s['day'] >= since:
            days[s['subject']].add(s['day'])
    out = []
    for subject, worked in days.items():
        if len(worked) >= 20 and not routine(subject):
            name = topics.subject_name(subject)
            out.append(_finding('steady', subject, 'good', 'You kept {} going'.format(_subject(name)),
                                'Worked on it {} of the last 28 days.'.format(len(worked)),
                                0.5 * len(worked) / 28 * math.log(1 + len(worked)), 'improved'))
    return out


GROUPS = (
    ('improved', 'Where you grew'),
    ('when', 'When you work best'),
    ('watch', 'Watch out for'),
)


def reads(tasks: Sequence[Dict[str, Any]], today: date, days: int = 90, per_group: int = 4) -> Dict[str, Any]:
    """Every finding over the last `days` days, strongest first, in groups."""
    tax = topics.taxonomy()
    sessions = [s for s in (session(task) for task in tasks) if s]
    since = today - timedelta(days=days - 1)
    found: List[Dict[str, Any]] = []
    found += improvements(sessions, since, tax)
    found += new_topics(sessions, since, tax)
    found += favorite_times(sessions, since)
    found += session_lengths(sessions, since)
    found += reason_times(sessions, since)
    found += steady(sessions, today)

    groups = []
    for key, title in GROUPS:
        items = sorted((f for f in found if f['group'] == key), key=lambda f: -f['weight'])
        # One favorite-time line per subject, the strongest of each kind
        # first and then seconds, so a group reads as a few different things
        # rather than four of the same.
        seen, firsts, seconds, kinds = set(), [], [], Counter()
        for item in items:
            subject = item['id'].split(':')[-1] if item['kind'] == 'slot' else None
            if (subject and subject in seen) or kinds[item['kind']] >= PER_KIND:
                continue
            if subject:
                seen.add(subject)
            (firsts if kinds[item['kind']] == 0 else seconds).append(item)
            kinds[item['kind']] += 1
        kept = firsts + seconds
        if kept:
            groups.append({'id': key, 'title': title, 'items': kept[:per_group]})
    return {
        'from': since.isoformat(),
        'to': today.isoformat(),
        'days': days,
        'sessions': sum(1 for s in sessions if s['day'] >= since),
        'groups': groups,
    }
