"""The brief for three next sessions, counted on the server from the tasks.

The subject page plans its sessions from figures the page has already worked
out in the browser (frontend/src/components/Subject), and sends them up with
the request — see the note at the top of backend/api/subject_ai.py. The
dashboard and the analytics Recommendations tab offer the same three sessions
for any one subject, or across every subject at once, and neither of them has
those figures: the dashboard never downloads the task history, and the
Recommendations tab has no subject in view.

So this counts the part of the brief a plan is written from
(`subject_ai.STEPS_SECTIONS`) straight from the task rows: who and how much,
what goes wrong, the newest work, and every finished task grouped by name.
The groups are the same as the page's (`workGroups` in
frontend/src/components/Subject/recentWork.ts), and are what the model reads
the material from. What it leaves out — the difficulty curve, the time
analysis, goals — are the page's own computations; a plan is good without
them, and the subject page still sends them when it is the one asking.

Across every subject, each title carries its subject in brackets, so the
model can see which subject a group belongs to and say which one a session
is for.
"""
import re
from collections import Counter
from datetime import date, timedelta
from typing import Dict, Iterable, List, Optional

from backend.tracking import time_spent
from backend.config.shared import RULES

#: What the recommendations are filed under when they span every subject.
OVERALL = 'All subjects'

#: The window the figures cover, and the one before it for comparison.
WINDOW_DAYS = 90

#: The newest finished tasks the brief lists one by one.
RECENT = 15

#: Name groups, largest first — shared/rules.json, as the subject page's are.
GROUPS = RULES['recommendations']['work_groups']

#: The reasons a task went badly or well, by key, in the words the rating
#: prompt shows the reader — shared/rules.json.
STRUGGLES = {reason['key']: reason['label'] for reason in RULES['task_reasons']['struggle']}
GOOD = {reason['key']: reason['label'] for reason in RULES['task_reasons']['went_well']}

#: A task's own note, as much of it as goes to the model.
NOTE = 160


def name_family(title: str) -> str:
    """A title with its numbers blanked, so ranges of one material group:
    "MATHCOUNTS Sprint 21-30" and "MATHCOUNTS Sprint 1-10" are both
    "MATHCOUNTS Sprint #". A word with a letter in it is kept whole. Mirrors
    `nameFamily` in recentWork.ts."""
    words = ['#' if not any(ch.isalpha() for ch in word) else word
             for word in str(title or '').split()]
    return ' '.join(word for at, word in enumerate(words)
                    if not (word == '#' and at > 0 and words[at - 1] == '#'))


def _day(raw) -> str:
    return str(raw or '')[:10]


def _level(value) -> Optional[int]:
    try:
        level = int(value)
    except (TypeError, ValueError):
        return None
    return level if 1 <= level <= 5 else None


def _minutes(task) -> Optional[int]:
    """How long the task took — see backend/tracking/time_spent."""
    return time_spent.minutes_spent(task)


def _mean(values: List[float]) -> Optional[float]:
    return round(sum(values) / len(values), 1) if values else None


def _reason(key) -> str:
    key = str(key or '')
    return STRUGGLES.get(key) or GOOD.get(key) or ''


def finished(tasks: Iterable[dict], subject_id: Optional[str], since: str,
             until: str = '9999') -> List[dict]:
    """Finished, titled tasks in [since, until), newest first; one subject's
    when `subject_id` is given, every subject's when it is None."""
    rows = [
        task for task in tasks
        if task.get('status') == 'done'
        and str(task.get('title') or '').strip()
        and since <= _day(task.get('completed_at')) < until
        and (subject_id is None or task.get('subject') == subject_id)
    ]
    return sorted(rows, key=lambda task: _day(task.get('completed_at')), reverse=True)


def _title(task: dict, names: Optional[Dict[str, str]]) -> str:
    """The title, with its subject in front when the brief spans them all."""
    title = str(task.get('title') or '').strip()
    if names is None:
        return title
    subject = names.get(task.get('subject') or '')
    return '[{}] {}'.format(subject, title) if subject else title


def recent_work(rows: List[dict], names: Optional[Dict[str, str]] = None) -> List[dict]:
    """The newest few, in the shape `subject_ai.brief_from` prints."""
    out = []
    for task in rows[:RECENT]:
        out.append({
            'title': _title(task, names)[:120],
            'on': _day(task.get('completed_at')),
            'difficulty': _level(task.get('difficulty')),
            'execution': _level(task.get('execution')),
            'minutes': _minutes(task),
            'reason': _reason(task.get('reason')),
            'note': str(task.get('description') or '').strip()[:NOTE],
        })
    return out


def work_groups(rows: List[dict], names: Optional[Dict[str, str]] = None) -> List[dict]:
    """Every task grouped by name, largest first, with how each group went."""
    groups: Dict[str, dict] = {}
    for task in rows:
        name = name_family(_title(task, names))
        group = groups.setdefault(name.lower(), {'name': name, 'rows': []})
        group['rows'].append(task)

    out = []
    for group in sorted(groups.values(), key=lambda g: -len(g['rows']))[:GROUPS]:
        members = group['rows']
        rated = [task for task in members
                 if _level(task.get('difficulty')) and _level(task.get('execution'))]
        execution = [_level(task.get('execution')) for task in rated]
        minutes = [m for m in (_minutes(task) for task in members) if m]
        reasons = Counter(label for label in (_reason(task.get('reason')) for task in members) if label)
        out.append({
            'name': group['name'][:120],
            'count': len(members),
            'examples': list(dict.fromkeys(_title(task, names)[:120] for task in members))[:4],
            'rated': len(rated),
            'difficulty': _mean([_level(task.get('difficulty')) for task in rated]),
            'execution': _mean(execution),
            'minutes': round(sum(minutes) / len(minutes)) if minutes else None,
            'well': sum(1 for value in execution if value >= 4),
            'badly': sum(1 for value in execution if value <= 2),
            'reasons': ['{} ×{}'.format(label, count) for label, count in reasons.most_common(3)],
            'last': _day(members[0].get('completed_at')),
        })
    return out


def mistakes(rows: List[dict]) -> List[dict]:
    """What went wrong, as picked on tasks rated at or below Solid (3)."""
    low = [task for task in rows if (_level(task.get('execution')) or 9) <= 3]
    counts = Counter(STRUGGLES[task['reason']] for task in low
                     if task.get('reason') in STRUGGLES)
    total = sum(counts.values())
    return [{'label': label, 'count': count, 'share': round(100 * count / total)}
            for label, count in counts.most_common(4)] if total else []


def state_for(tasks: List[dict], subject_id: Optional[str], subject: str,
              names: Dict[str, str], today: Optional[date] = None) -> dict:
    """The plan's brief for one subject (`subject_id`), or every subject (None).

    `names` maps subject ids to the names the brackets carry across every
    subject; unused for one.
    """
    today = today or date.today()
    since = (today - timedelta(days=WINDOW_DAYS)).isoformat()
    before = (today - timedelta(days=2 * WINDOW_DAYS)).isoformat()
    until = (today + timedelta(days=1)).isoformat()

    rows = finished(tasks, subject_id, since, until)
    earlier = finished(tasks, subject_id, before, since)
    labels = names if subject_id is None else None

    return {
        'subject': subject,
        'span': 'the last {} days'.format(WINDOW_DAYS),
        'finished': len(rows),
        'finished_before': len(earlier),
        'rated': sum(1 for task in rows
                     if _level(task.get('difficulty')) and _level(task.get('execution'))),
        'active_days': len({_day(task.get('completed_at')) for task in rows}),
        'mistakes': mistakes(rows),
        'recent_work': recent_work(rows, labels),
        'work_groups': work_groups(rows, labels),
    }


def subjects_in(tasks: List[dict], names: Dict[str, str], today: Optional[date] = None,
                most: int = 12) -> List[dict]:
    """The subjects with finished work in the window, busiest first — the
    choices beside "All subjects" in the panel's picker."""
    today = today or date.today()
    since = (today - timedelta(days=WINDOW_DAYS)).isoformat()
    counts = Counter(task.get('subject') for task in finished(tasks, None, since)
                     if task.get('subject') in names)
    return [{'id': subject_id, 'name': names[subject_id], 'count': count}
            for subject_id, count in counts.most_common(most)]


def subject_named(text: str, names: Dict[str, str]) -> Optional[str]:
    """The subject id a session across every subject was written for, read off
    its `focus` (which the model is told to set to the subject's name), or
    None when it names none of them."""
    wanted = str(text or '').strip().lower().strip('[]')
    if not wanted:
        return None
    for subject_id, name in names.items():
        if name.lower() == wanted:
            return subject_id
    for subject_id, name in names.items():
        if name.lower() in wanted:
            return subject_id
    return None


#: A subject in brackets, the way the brief across every subject writes it.
BRACKETED = re.compile(r'\[[^\]\n]{1,40}\]\s*')

#: The step fields a reader sees as written.
SHOWN = ('title', 'problems', 'pace', 'reason', 'signal')


def unbracket(step: dict) -> dict:
    """A step across every subject with the brief's "[Subject] " labels taken
    out of what the reader sees, and its labels in plain words
    (`subject_ai.reader_words`). The model is told not to copy either; this
    is for when it does anyway, and for steps saved before it was told."""
    from backend.tracking.subject_ai import reader_words

    def plain(text: str) -> str:
        return reader_words(BRACKETED.sub('', text).strip())

    clean = {key: plain(value) if key in SHOWN and isinstance(value, str) else value
             for key, value in step.items()}
    if isinstance(step.get('drills'), list):
        clean['drills'] = [plain(str(drill)) for drill in step['drills']]
    return clean
