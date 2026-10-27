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

#: Things people name that aren't subject names but plainly belong to one:
#: a resource, a contest, a sport said as a verb. Matched before the subject
#: names and cut out of the line, so "Art of Problem Solving" is Mathematics
#: and never Art. `(pattern, subject, how to say it back)`.
RESOURCES = (
    (r'alcumus', 'mathematics', 'Alcumus'),
    (r'art of problem solving|aops', 'mathematics', 'Art of Problem Solving'),
    (r'mathcounts', 'mathematics', 'MathCounts'),
    (r'amc ?(?:8|10|12)?', 'mathematics', 'AMC'),
    (r'aime|usamo|usajmo|math olympiad', 'mathematics', 'olympiad math'),
    (r'usaco', 'computer_science', 'USACO'),
    (r'leetcode|codeforces|competitive programming', 'computer_science', 'competitive programming'),
    (r'swim(?:s|ming)?', 'swimming', 'swimming'),
    (r'strength training|lifting|weightlifting|weight training', 'gym', 'strength training'),
    (r'philharmonic|orchestra', 'band', 'orchestra'),
)

#: An account this young is getting started, not falling short: fewer than
#: NEW_TASKS finished tasks, or a first one under NEW_DAYS ago.
NEW_TASKS = 25
NEW_DAYS = 21
#: Which kind of line a row leads with, first to last.
LINE_ORDER = {'aim': 0, 'goal': 0, 'activity': 1, 'achievement': 2, 'stat': 2, 'pattern': 2,
              'preference': 2, 'about': 3}
#: Rows shown before "Show more".
TOP = 5
#: Suggestions shown.
SUGGESTIONS = 4
#: Groups whose subjects are practice more than tasks: an instrument, a sport.
PRACTICE_GROUPS = ('Creative', 'Health and fitness')

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
        # Task names repeat (a routine is the same name a hundred times), and
        # a namer lives for one request, so its answers can be kept.
        self._named: Dict[str, Optional[str]] = {}
        self._topics: Dict[tuple, Optional[str]] = {}

    def subject(self, text: str) -> Optional[str]:
        """The subject a task name is about, specific subjects first."""
        if text not in self._named:
            self._named[text] = (background.subject_in(text, self.specific)
                                 or background.subject_in(text, self.names))
        return self._named[text]

    def said(self, text: str) -> Optional[str]:
        """The subject a sentence the reader wrote is about, skipping the
        ones named by everyday words."""
        return self.read(text)[0]

    def read(self, text: str):
        """`(subject, resources named)` for a sentence the reader wrote."""
        subjects, resources = self.read_all(text)
        first = subjects[0] if subjects else None
        return first, [label for label, subject in resources if subject == first]

    def read_all(self, text: str):
        """Every subject a sentence names, in the order it names them, and
        the resources in it as `(label, subject)`.

        Resources first, cut out of the line before the subject names are
        tried, so a resource's own words can't pass for another subject
        ("Art of Problem Solving" is Mathematics, never Art). Then every
        subject name in what's left, longest first so "Computer Science"
        isn't also Science, skipping everyday words.
        """
        lowered = (text or '').lower()
        resources, at = [], {}
        for pattern, subject, label in RESOURCES:
            rx = r'(?<![a-z0-9]){}(?![a-z0-9])'.format(pattern)
            match = re.search(rx, lowered)
            if match:
                if subject in self.names:
                    resources.append((label, subject))
                    at.setdefault(subject, match.start())
                lowered = re.sub(rx, lambda m: ' ' * len(m.group(0)), lowered)
        pool = {sid: name for sid, name in self.names.items() if sid not in EVERYDAY}
        for sid, name in sorted(pool.items(), key=lambda row: -len(row[1] or '')):
            word = (name or '').strip().lower()
            if len(word) < 3:
                continue
            match = re.search(r'(?<![a-z0-9]){}(?![a-z0-9])'.format(re.escape(word)), lowered)
            if match:
                at.setdefault(sid, match.start())
                lowered = lowered[:match.start()] + ' ' * len(word) + lowered[match.end():]
        for sid, words in background.ALIASES.items():
            if sid in pool and sid not in at:
                for word in words:
                    match = re.search(r'(?<![a-z0-9]){}(?![a-z0-9])'.format(re.escape(word)), lowered)
                    if match:
                        at[sid] = match.start()
                        break
        return sorted(at, key=at.get), resources

    def topic(self, text: str, filed: str) -> Optional[str]:
        """A finer subject in the same group as `filed`, named in `text`."""
        key = (text, filed)
        if key in self._topics:
            return self._topics[key]
        group = self.groups.get(filed)
        same = {sid: name for sid, name in self.names.items()
                if sid != filed and self.groups.get(sid) == group} if group else {}
        self._topics[key] = background.subject_in(text, same) if same else None
        return self._topics[key]


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

    # ---- how far in the account is ------------------------------------------
    first_day = min((_day(task['completed_at']) for task in done), default=None)
    young = (first_day is None
             or (today - date.fromisoformat(first_day)).days < NEW_DAYS)
    stage = 'new' if len(done) < NEW_TASKS or young else 'settled'

    def standing(subject: str) -> dict:
        count = month.get(subject, 0)
        share = round(count / month_total * 100) if month_total else 0
        verdict = _verdict(share, count)
        if stage == 'new':
            # A week-old account with nothing filed under violin hasn't
            # neglected violin; it hasn't started logging it.
            verdict = 'started' if count else 'not_yet'
        return {
            'subject': subject,
            'name': names.get(subject, subject),
            'tasks': count,
            'share': share,
            'rank': ranked.index(subject) + 1 if subject in ranked else None,
            'of': len(ranked),
            'last_on': last_on.get(subject),
            'verdict': verdict,
        }

    # ---- what they said, one row per subject ---------------------------------
    # A line naming three subjects counts once for each of them.
    said: List[dict] = []
    lines = ([(fact, 'About you') for fact in facts]
             + [(insight, 'Log') for insight in insights])
    for row, source in lines:
        text = row.get('text') or ''
        subjects, resources = namer.read_all(text)
        # The subject filed at sign-up, only when the strict read finds none
        # and it isn't an everyday word ("work on", "health and").
        stored = row.get('subject') if source == 'About you' else None
        if not subjects and stored and stored not in EVERYDAY and stored in names:
            subjects = [stored]
        for subject in subjects:
            said.append({'kind': row.get('kind'), 'text': text, 'source': source,
                         'subject': subject, 'topic': row.get('topic'), 'span': len(subjects),
                         'resources': [label for label, owner in resources if owner == subject]})

    is_aim = lambda item: item['kind'] in ('aim', 'goal') or item.get('topic') in ('goals', 'priorities')
    grouped: Dict[str, dict] = {}
    for at, item in enumerate(said):
        if item['kind'] == 'feeling':
            continue
        row = grouped.get(item['subject'])
        if row is None:
            row = grouped[item['subject']] = {'lines': [], 'goal': False, 'resources': [], 'first': at}
        row['lines'].append({'text': item['text'], 'source': item['source'],
                             '_rank': (item['span'], LINE_ORDER.get(item['kind'], 3), at)})
        row['goal'] = row['goal'] or is_aim(item)
        for label in item.get('resources') or []:
            if label not in row['resources']:
                row['resources'].append(label)
    named = []
    for subject, row in grouped.items():
        # Lead with the line most about this subject alone: one that names
        # only it, a goal or something they do before a line about them in
        # general. Otherwise every row in a long answer quotes the same
        # opening sentence.
        row['lines'].sort(key=lambda line: line.pop('_rank'))
        named.append({**standing(subject), 'kind': 'goal' if row['goal'] else 'doing',
                      'mentions': len(row['lines']), 'lines': row['lines'][:4],
                      'text': row['lines'][0]['text'], 'source': row['lines'][0]['source'],
                      'resources': row['resources'], 'practice': groups.get(subject) in PRACTICE_GROUPS,
                      '_first': row['first']})
    # The ones written about most first; ties go to the one with work behind
    # it, then to the order they were written in.
    named.sort(key=lambda row: (-row['mentions'], -row['tasks'], row['_first']))
    for row in named:
        row.pop('_first')
    aims = [row for row in named if row['kind'] == 'goal']
    activities = [row for row in named if row['kind'] == 'doing']

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

    # The weekday most gets done, once there are enough days to say so: six
    # tasks finished in one sitting don't make that day "the day you get the
    # most done".
    recent = [_day(task['completed_at']) for task in done if _day(task['completed_at']) >= since_timing]
    weekdays = Counter(date.fromisoformat(day).weekday() for day in recent)
    best_day = (WEEKDAYS[weekdays.most_common(1)[0][0]]
                if len(recent) >= 10 and len(set(recent)) >= 4 else None)

    found = {'days': DAYS, 'month_tasks': month_total, 'total_tasks': len(done), 'stage': stage,
             'top': TOP, 'named': named, 'aims': aims, 'activities': activities,
             'timing': timing, 'topics': topics, 'unfiled': unfiled, 'best_day': best_day}
    found['suggestions'] = suggestions(found, month)
    return found


WEEKDAYS = ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
WINDOW_WORDS = {'morning': 'morning', 'afternoon': 'afternoon', 'evening': 'evening', 'night': 'night'}


def _and(items: List[str]) -> str:
    if len(items) <= 1:
        return ''.join(items)
    return '{} and {}'.format(', '.join(items[:-1]), items[-1])


def suggestions(found: dict, month: Counter) -> List[dict]:
    """What to do about it: a few moves, each one built from the figures.

    Every one names the reader's own subjects, counts or words, and is only
    offered when its condition holds, so nothing here is advice that would
    read the same on anyone else's page. `{key, title, body, action}`.
    """
    named = found['named']
    total = found['month_tasks']
    out: List[dict] = []
    if not named:
        return out
    top = named[0]
    on_day = ' on {}'.format(found['best_day']) if found.get('best_day') else ' this week'

    # Too many fronts for the work going in.
    if len(named) >= 5 and total < len(named) * 2:
        pair = [row['name'] for row in named[:2]]
        spread = ('{} tasks in 30 days'.format(total) if total else 'no finished tasks in 30 days yet')
        out.append({
            'key': 'narrow',
            'title': 'Pick two for the next two weeks',
            'body': ('You named {} areas and have {}. Spread that thin and none of them moves. '
                     'Put the next two weeks into {}, the two you write about most, and add the '
                     'rest back once those have a rhythm.').format(len(named), spread, _and(pair)),
            'action': None,
        })

    # The thing they write about most that has nothing behind it.
    waiting = next((row for row in named if row['tasks'] == 0), None)
    if waiting and waiting['mentions'] >= named[0]['mentions'] - 1:
        top = waiting
        if top['resources']:
            # The most task-shaped resource they named: RESOURCES is in that order.
            order = [label for _, _, label in RESOURCES]
            picked = sorted(top['resources'], key=lambda label: order.index(label) if label in order else 99)
            example = '"{}: 10 problems"'.format(picked[0])
            how = 'You mentioned {}. A task like {} filed under {} makes those sessions count here.'.format(
                _and(picked[:3]), example, top['name'])
        else:
            how = 'A task like "{}: 45 minutes", filed under {}, is enough to get it on the board.'.format(
                top['name'], top['name'])
        if found.get('best_day'):
            on_day = ' on {}, the day you get the most done'.format(found['best_day'])
        out.append({
            'key': 'start-top',
            'title': 'Get {} on the record'.format(top['name']),
            'body': ('{} comes up {} times in what you wrote, {}, and has no tasks in the last '
                     '30 days. {} Do the first one{}.').format(
                         top['name'], top['mentions'],
                         'more than anything else' if top is named[0] or top['mentions'] >= named[0]['mentions']
                         else 'close behind {}'.format(named[0]['name']),
                         how, on_day) if top['mentions'] > 1 else
                    ('{} is the first thing you named and has no tasks in the last 30 days. {} '
                     'Do the first one{}.').format(top['name'], how, on_day),
            'action': {'label': 'Add a task', 'to': '/tasks'},
        })

    # Practice that happens but isn't a task.
    practice = [row['name'] for row in named if row['practice'] and row['tasks'] == 0][:3]
    if practice:
        out.append({
            'key': 'practice',
            'title': 'Count the practice you already do',
            'body': ('{} {} practice you do anyway, but none of it is in your record. Make a '
                     'repeating task for each (for example "{} practice", every day you do it) so the '
                     'time shows up here and in your streak.').format(
                         _and(practice), 'is' if len(practice) == 1 else 'are', practice[0]),
            'action': {'label': 'Open Tasks', 'to': '/tasks'},
        })

    # Time going somewhere they barely mention.
    if total >= 3 and month:
        busiest, count = month.most_common(1)[0]
        share = round(count / total * 100)
        mentioned = {row['subject']: row['mentions'] for row in named}
        top_three = {row['subject'] for row in named[:3]}
        if share >= 40 and busiest not in top_three:
            name = next((row['name'] for row in named if row['subject'] == busiest), None)
            label = name or busiest.replace('_', ' ').title()
            out.append({
                'key': 'drift',
                'title': 'Your time is going to {}'.format(label),
                'body': ('{} took {} of your {} tasks this month ({}%), and you mention it {}. If '
                         'that\'s on purpose, good. If not, {} is the one waiting.').format(
                             label, count, total, share,
                             'once' if mentioned.get(busiest) == 1 else
                             ('{} times'.format(mentioned[busiest]) if busiest in mentioned else 'nowhere'),
                             top['name']),
                'action': None,
            })

    # When they said they work best, against when they do.
    for row in found.get('timing') or []:
        if not row['matches'] and row['share'] < row['busiest_share']:
            out.append({
                'key': 'timing',
                'title': 'Try the {} you said works best'.format(WINDOW_WORDS[row['said']]),
                'body': ('You wrote "{}", but only {}% of your tasks land in the {}. Most land in the '
                         '{} ({}%). Move tomorrow\'s hardest task to the {} and see if it goes better.').format(
                             row['text'], row['share'], row['said'], row['busiest'],
                             row['busiest_share'], row['said']),
                'action': None,
            })
            break

    # Finished work that isn't counting toward anything.
    groups = found['unfiled']['groups']
    if groups:
        biggest = groups[0]
        out.append({
            'key': 'file',
            'title': 'File {} {} under {}'.format(len(biggest['ids']), 'task' if len(biggest['ids']) == 1 else 'tasks',
                                                  biggest['name']),
            'body': ('Their names say {}, but they have no subject, so they don\'t count here. '
                     'Use "File them" below.').format(biggest['name']),
            'action': None,
        })
    elif found['unfiled']['total'] >= 3:
        out.append({
            'key': 'file',
            'title': 'Give {} finished tasks a subject'.format(found['unfiled']['total']),
            'body': ('They don\'t count toward anything you named until they have one. Open Tasks, '
                     'pick a subject on each, and they show up here.'),
            'action': {'label': 'Open Tasks', 'to': '/tasks'},
        })

    return out[:SUGGESTIONS]


def brief_lines(found: dict) -> List[str]:
    """The comparison as short lines for an AI brief."""
    lines = []
    for row in (found.get('named') or [])[:TOP]:
        lines.append('Named {} {} time{} ({}); it got {} of {} tasks in {} days ({}%).'.format(
            row['name'], row['mentions'], '' if row['mentions'] == 1 else 's',
            'a goal' if row['kind'] == 'goal' else 'something they do',
            row['tasks'], found['month_tasks'], found['days'], row['share']))
    for row in found.get('timing') or []:
        lines.append('Said "{}"; {}% of tasks are finished in the {}, busiest is the {} ({}%).'.format(
            row['text'], row['share'], row['said'], row['busiest'], row['busiest_share']))
    return lines
