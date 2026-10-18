"""Said vs did: what the reader has told Summit, held up against what they do.

Analytics counts behavior: tasks, XP, focus, hours. The reader also *says*
things: About you answers at sign-up (backend/tracking/background.py) and
what the Log has learned from their journal (backend/tracking/journal.py).
Before this, the two sat side by side and never met. This module joins them:

- **Aims.** Each thing they said they want to improve or reach, with a
  subject, against the share of the last 30 days that went to it.
- **Activities.** Each thing they said they do, against whether any of it
  shows up in the last 30 days.
- **Timing.** A Log line about when they work best ("mornings", "late at
  night"), against the hours their tasks are actually finished.
- **Topics.** Inside each busy subject, the finer topics its task names
  mention (Math: Algebra 232, Calculus 196), so a subject isn't one blob.
- **Unfiled.** Finished tasks with no subject whose names say what they
  were for, grouped so the reader can file them in one click.

Everything is counted, never guessed: a line with no subject in it is left
out of the comparisons rather than matched to the nearest thing. Subjects
are found in text by `background.subject_in`, the same matcher the About you
facts are filed with.
"""
import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from typing import Dict, Iterable, List, Optional

from backend.tracking import background

#: The last stretch the comparisons read.
DAYS = 30
#: Timing reads further back: hours need more tasks to settle.
TIMING_DAYS = 60
#: Fewer finished tasks than this and a timing comparison says nothing.
TIMING_MIN = 10
#: Topics shown per subject, and the floor for a topic to count.
TOPICS_SHOWN = 3
TOPIC_MIN = 3
#: Subject groups too general to infer from a name: "Do homework for math"
#: is math, not Homework.
GENERIC_GROUPS = ('Studying',)
#: Subjects named by an everyday word. "I want to work at a lab" isn't about
#: the Work subject, so a line has to be filed under one of these, or name it
#: as the only subject, before it counts.
EVERYDAY = ('work', 'school', 'planning', 'health', 'reading', 'writing', 'travel',
            'family', 'friends', 'chores', 'errands', 'sleep')

#: Parts of the day, as [start, end) hours, and the words that name them.
WINDOWS = (
    ('morning', 5, 12, ('morning', 'mornings', 'early', 'before school', 'sunrise')),
    ('afternoon', 12, 17, ('afternoon', 'afternoons', 'after school', 'after lunch')),
    ('evening', 17, 21, ('evening', 'evenings', 'after dinner')),
    ('night', 21, 29, ('night', 'nights', 'late at night', 'midnight', 'night owl')),
)

#: How a share of the month reads.
def _verdict(share: float, tasks: int) -> str:
    if tasks == 0:
        return 'none'
    if share >= 20:
        return 'strong'
    if share >= 8:
        return 'some'
    return 'little'


def _day(stamp) -> str:
    return str(stamp or '')[:10]


def _hour(stamp) -> Optional[int]:
    try:
        return datetime.fromisoformat(str(stamp)[:19]).hour
    except (TypeError, ValueError):
        return None


def _window_of(hour: int) -> str:
    for name, start, end, _ in WINDOWS:
        if start <= hour < end or start <= hour + 24 < end:
            return name
    return 'night'


def window_in(text: str) -> Optional[str]:
    """The part of the day a line talks about, or None. A line naming two
    ("evening review speeds up the next morning") names neither."""
    lowered = (text or '').lower()
    found = [name for name, _, _, words in WINDOWS
             if any(re.search(r'(?<![a-z]){}(?![a-z])'.format(re.escape(word)), lowered)
                    for word in words)]
    return found[0] if len(found) == 1 else None


class Namer:
    """Finds subjects in task names, preferring specific ones over generic."""

    def __init__(self, names: Dict[str, str], groups: Dict[str, str]):
        self.names = names
        self.groups = groups
        self.specific = {sid: name for sid, name in names.items()
                         if groups.get(sid) not in GENERIC_GROUPS}

    def subject(self, text: str) -> Optional[str]:
        """The subject a task name is about, specific subjects first."""
        return background.subject_in(text, self.specific) or background.subject_in(text, self.names)

    def said(self, text: str) -> Optional[str]:
        """The subject a sentence the reader wrote is about, skipping the
        ones named by everyday words."""
        plain_words = lambda pool: {sid: name for sid, name in pool.items() if sid not in EVERYDAY}
        return (background.subject_in(text, plain_words(self.specific))
                or background.subject_in(text, plain_words(self.names)))

    def topic(self, text: str, filed: str) -> Optional[str]:
        """A finer subject in the same group as `filed`, named in `text`."""
        group = self.groups.get(filed)
        if not group:
            return None
        same = {sid: name for sid, name in self.names.items()
                if sid != filed and self.groups.get(sid) == group}
        return background.subject_in(text, same) if same else None


def subjects_of(task: dict, namer: Namer) -> set:
    """Every subject a task counts toward: the one it's filed under, and
    the one its name mentions. "Violin practice" filed under Music counts
    for Music and for Violin, so an aim about violin sees it."""
    out = set()
    filed = (task.get('subject') or '').strip()
    if filed:
        out.add(filed)
    named = namer.subject(task.get('title') or '')
    if named and named not in EVERYDAY:
        out.add(named)
    elif named and not filed:
        out.add(named)
    return out


def readings(tasks: Iterable[dict], facts: Iterable[dict], insights: Iterable[dict],
             names: Dict[str, str], groups: Dict[str, str], today: date = None) -> dict:
    """The whole comparison, as plain data for the page."""
    today = today or date.today()
    since = (today - timedelta(days=DAYS - 1)).isoformat()
    since_timing = (today - timedelta(days=TIMING_DAYS - 1)).isoformat()
    namer = Namer(names, groups)
    done = [task for task in tasks if task.get('status') == 'done' and _day(task.get('completed_at'))]

    # ---- the month, by subject, names counted in -------------------------
    month = Counter()
    last_on: Dict[str, str] = {}
    for task in done:
        day = _day(task['completed_at'])
        for subject in subjects_of(task, namer):
            if day >= since:
                month[subject] += 1
            if day > last_on.get(subject, ''):
                last_on[subject] = day
    month_total = sum(1 for task in done if _day(task['completed_at']) >= since)
    ranked = [subject for subject, _ in month.most_common()]

    def standing(subject: str) -> dict:
        count = month.get(subject, 0)
        share = round(count / month_total * 100) if month_total else 0
        return {
            'subject': subject,
            'name': names.get(subject, subject),
            'tasks': count,
            'share': share,
            'rank': ranked.index(subject) + 1 if subject in ranked else None,
            'of': len(ranked),
            'last_on': last_on.get(subject),
            'verdict': _verdict(share, count),
        }

    # ---- what they said, with a subject in it ------------------------------
    said: List[dict] = []
    for fact in facts:
        subject = fact.get('subject') or namer.said(fact.get('text') or '')
        if subject:
            said.append({'kind': fact.get('kind'), 'text': fact.get('text') or '',
                         'source': 'About you', 'subject': subject})
    for insight in insights:
        text = insight.get('text') or ''
        subject = namer.said(text)
        if subject:
            said.append({'kind': insight.get('kind'), 'text': text, 'source': 'Log',
                         'subject': subject, 'topic': insight.get('topic')})

    aims, activities, seen = [], [], set()
    for item in said:
        key = (item['kind'] in ('aim', 'goal'), item['subject'])
        if key in seen:
            continue
        if item['kind'] in ('aim', 'goal') or item.get('topic') in ('goals', 'priorities'):
            seen.add(key)
            aims.append({**item, **standing(item['subject'])})
        elif item['kind'] == 'activity':
            seen.add(key)
            activities.append({**item, **standing(item['subject'])})

    # ---- timing --------------------------------------------------------------
    hours = Counter()
    for task in done:
        if _day(task['completed_at']) >= since_timing:
            hour = _hour(task['completed_at'])
            if hour is not None:
                hours[_window_of(hour)] += 1
    timed = sum(hours.values())
    timing = []
    if timed >= TIMING_MIN:
        busiest = hours.most_common(1)[0][0]
        for insight in insights:
            if insight.get('kind') not in ('preference', 'pattern'):
                continue
            window = window_in(insight.get('text') or '')
            if not window:
                continue
            timing.append({
                'text': insight.get('text') or '',
                'said': window,
                'share': round(hours.get(window, 0) / timed * 100),
                'busiest': busiest,
                'busiest_share': round(hours[busiest] / timed * 100),
                'matches': busiest == window,
                'tasks': timed,
            })
            if len(timing) >= 3:
                break

    # ---- topics inside subjects, from names ---------------------------------
    inner: Dict[str, Counter] = defaultdict(Counter)
    filed_count = Counter()
    for task in done:
        filed = (task.get('subject') or '').strip()
        if not filed:
            continue
        filed_count[filed] += 1
        topic = namer.topic(task.get('title') or '', filed)
        if topic:
            inner[filed][topic] += 1
    topics = []
    for subject, count in filed_count.most_common(8):
        rows = [{'subject': topic, 'name': names.get(topic, topic), 'tasks': n}
                for topic, n in inner[subject].most_common(TOPICS_SHOWN) if n >= TOPIC_MIN]
        if rows:
            topics.append({'subject': subject, 'name': names.get(subject, subject),
                           'tasks': count, 'topics': rows})

    # ---- unfiled, with what their names say --------------------------------
    unfiled_groups: Dict[str, List[str]] = defaultdict(list)
    unfiled_total = 0
    for task in done:
        if (task.get('subject') or '').strip():
            continue
        unfiled_total += 1
        guess = namer.subject(task.get('title') or '')
        if guess:
            unfiled_groups[guess].append(str(task.get('id')))
    unfiled = {
        'total': unfiled_total,
        'groups': sorted(
            ({'subject': subject, 'name': names.get(subject, subject), 'ids': ids}
             for subject, ids in unfiled_groups.items()),
            key=lambda row: -len(row['ids'])),
    }

    return {'days': DAYS, 'month_tasks': month_total, 'aims': aims, 'activities': activities,
            'timing': timing, 'topics': topics, 'unfiled': unfiled}


def brief_lines(found: dict) -> List[str]:
    """The comparison as short lines for an AI brief."""
    lines = []
    for aim in found.get('aims') or []:
        lines.append('Said they want "{}" ({}); {} got {} of {} tasks in {} days ({}%).'.format(
            aim['text'], aim['source'], aim['name'], aim['tasks'], found['month_tasks'],
            found['days'], aim['share']))
    for item in found.get('activities') or []:
        if item['tasks'] == 0:
            lines.append('Said "{}" but nothing in {} in the last {} days.'.format(
                item['text'], item['name'], found['days']))
    for row in found.get('timing') or []:
        lines.append('Said "{}"; {}% of tasks are finished in the {}, busiest is the {} ({}%).'.format(
            row['text'], row['share'], row['said'], row['busiest'], row['busiest_share']))
    return lines
