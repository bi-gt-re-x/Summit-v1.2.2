"""What to review: the brief for three review sessions, counted from the tasks.

The Recommendations tab's "What to review" panel sits above Next sessions and
works the same way: a model reads the record and writes three exact sessions
that can be booked onto the calendar (backend/tracking/subject_ai.plan, with
`review` set). The difference is what the sessions are for. Next sessions move
the reader forward; these go back over work already done so it sticks.

So the brief adds one section, <review_due>, picked from finished tasks:

  spaced      work finished about 1, 3, 7, 14 or 30 days ago. Those are the
              points where going back over something does the most good, so
              they're what a review session should pick from first.
  went badly  work from the last 30 days rated 2 or lower, scored under 70%,
              or tagged with a struggle reason. The material most likely to
              have gaps.
  hard, once  work filed hard (4 or 5) between 7 and 45 days ago that nothing
              with the same name has followed. Hard work done once fades.

Each line names the task, how long ago it was, and how it went, so the model
can quote the figure in its reason and the figure check lets it.

The sessions go in the same ledger as Next sessions, under REVIEW (every
subject) or `review_key(name)` (one subject), so planning and "I did this" are
the same endpoints, and the two panels never show each other's sessions.
"""
from datetime import date, timedelta
from typing import Dict, List, Optional

from backend.config import subjects as subject_catalogue
from backend.tracking import next_sessions

#: What review sessions across every subject are filed under.
REVIEW = 'Review: all subjects'

#: Days after which going back over something does the most good, and how far
#: either side of each still counts.
SPACING = (1, 3, 7, 14, 30)
SLACK = {1: 0, 3: 1, 7: 1, 14: 2, 30: 4}

#: How far back "went badly" looks, and the hard-once window.
BADLY_DAYS = 30
HARD_FROM, HARD_TO = 7, 45

#: Lines per kind, so the brief stays short.
PER_KIND = 8

#: A name finished this many times in the last 30 days is a routine (a daily
#: run, an evening review), not material to go back over.
ROUTINE = 6


#: Catalog groups that aren't material to go back over: a run, a gym day,
#: dinner with friends. Custom subjects and untagged tasks are kept.
NOT_REVIEWED = {'Health and fitness', 'Life and home'}
SKIPPED = {entry['id'] for entry in subject_catalogue.SUBJECTS
           if entry.get('group') in NOT_REVIEWED}


def reviewable(subject_id) -> bool:
    """Whether work in this subject is study material worth reviewing."""
    return (subject_id or '') not in SKIPPED


def review_key(subject: str) -> str:
    """The ledger key for one subject's review sessions."""
    return 'Review: {}'.format(subject)


def is_review(key: str) -> bool:
    return str(key or '').startswith('Review: ')


def _ago(task: dict, today: date) -> Optional[int]:
    try:
        done = date.fromisoformat(str(task.get('completed_at') or '')[:10])
    except ValueError:
        return None
    return (today - done).days


def _how(task: dict) -> str:
    """How it went, in the words the brief uses."""
    parts = []
    execution = next_sessions._level(task.get('execution'))
    difficulty = next_sessions._level(task.get('difficulty'))
    if difficulty:
        parts.append('filed {} of 5 hard'.format(difficulty))
    if execution:
        parts.append('rated {} of 5'.format(execution))
    try:
        got, of = float(task.get('score_got')), float(task.get('score_of'))
        if of > 0:
            parts.append('scored {:g} of {:g}'.format(got, of))
    except (TypeError, ValueError):
        pass
    reason = next_sessions._reason(task.get('reason'))
    if reason and reason in next_sessions.STRUGGLES.values():
        parts.append('said: {}'.format(reason.lower()))
    return ', '.join(parts)


def _line(task: dict, ago: int, names: Optional[Dict[str, str]]) -> str:
    title = next_sessions._title(task, names)[:120]
    when = 'yesterday' if ago == 1 else 'today' if ago == 0 else '{} days ago'.format(ago)
    how = _how(task)
    return '"{}", finished {}{}'.format(title, when, '; ' + how if how else '')


def _went_badly(task: dict) -> bool:
    execution = next_sessions._level(task.get('execution'))
    if execution and execution <= 2:
        return True
    try:
        got, of = float(task.get('score_got')), float(task.get('score_of'))
        if of > 0 and got / of < 0.7:
            return True
    except (TypeError, ValueError):
        pass
    return task.get('reason') in next_sessions.STRUGGLES


def due(tasks: List[dict], subject_id: Optional[str], names: Optional[Dict[str, str]] = None,
        today: Optional[date] = None) -> Dict[str, List[str]]:
    """The three kinds of work worth reviewing, as brief lines, newest first.

    `names` puts each title's subject in brackets, for the brief across every
    subject; leave it out for one subject.
    """
    today = today or date.today()
    since = (today - timedelta(days=max(SPACING) + max(SLACK.values()) + 1)).isoformat()
    rows = [task for task in next_sessions.finished(tasks, subject_id, min(
        since, (today - timedelta(days=HARD_TO)).isoformat()))
        if reviewable(task.get('subject'))]
    families_after: Dict[str, str] = {}
    lately: Dict[str, int] = {}
    month = (today - timedelta(days=30)).isoformat()
    for task in rows:  # newest first: the first seen is the latest of its name
        family = next_sessions.name_family(task.get('title'))
        families_after.setdefault(family, str(task.get('completed_at') or '')[:10])
        if str(task.get('completed_at') or '')[:10] >= month:
            lately[family] = lately.get(family, 0) + 1

    seen = set()
    spaced, badly, hard = [], [], []
    for task in rows:
        ago = _ago(task, today)
        if ago is None:
            continue
        family = next_sessions.name_family(task.get('title'))
        key = (family, task.get('subject'))
        if key in seen or lately.get(family, 0) >= ROUTINE:
            continue
        line = _line(task, ago, names)
        if any(abs(ago - point) <= SLACK[point] for point in SPACING) and len(spaced) < PER_KIND:
            spaced.append(line)
            seen.add(key)
        elif ago <= BADLY_DAYS and _went_badly(task) and len(badly) < PER_KIND:
            badly.append(line)
            seen.add(key)
        elif (HARD_FROM <= ago <= HARD_TO
              and (next_sessions._level(task.get('difficulty')) or 0) >= 4
              and families_after.get(family) == str(task.get('completed_at') or '')[:10]
              and len(hard) < PER_KIND):
            hard.append(line)
            seen.add(key)
    return {'spaced': spaced, 'badly': badly, 'hard': hard}


def brief_block(found: Dict[str, List[str]]) -> str:
    """<review_due>, for the end of the plan's brief. Empty when nothing is due."""
    parts = []
    if found.get('spaced'):
        parts.append('Spaced (finished about 1, 3, 7, 14 or 30 days ago):\n'
                     + '\n'.join('  - ' + line for line in found['spaced']))
    if found.get('badly'):
        parts.append('Went badly in the last {} days:\n'.format(BADLY_DAYS)
                     + '\n'.join('  - ' + line for line in found['badly']))
    if found.get('hard'):
        parts.append('Hard, done once, not gone back to since:\n'
                     + '\n'.join('  - ' + line for line in found['hard']))
    if not parts:
        return ''
    return '\n\n<review_due>\n' + '\n\n'.join(parts) + '\n</review_due>'


def count(found: Dict[str, List[str]]) -> int:
    return sum(len(lines) for lines in found.values())
