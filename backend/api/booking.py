"""Putting a planned session on the calendar, for every planner.

Three buttons book work into the calendar:

    Plan my next session   a subject page's recommendation   api/subject_ai.py
    Book N sessions        a dated goal's plan row           api/next.py
    Plan a session         a skill-tree node                 api/skillprogress.py

They used to answer "when" two different ways. The subject page asked
backend/tracking/session_timing.py, which reads when this reader works and how
it goes, spaces sessions for one subject apart and caps a day at two; the other
two took the first free gap, so a goal's three sessions landed at 8 AM on the
next three mornings whatever the reader's hours were, and a skill session could
sit on the same afternoon as a session for the same subject.

Now all three call `place` here, which reads the record once and asks
`session_timing.place`. The sessions any planner already booked count as
booked for all of them, so they space around each other.

No router: this is the account reads the rules need, shared by three routers.
"""
from datetime import datetime
from typing import Iterable, List, Optional

from backend.database import connection as db
from backend.tracking import session_plan
from backend.tracking import session_timing

#: What the rules read off each task.
TASK_COLUMNS = ('id', 'status', 'show_on_calendar', 'created_at', 'due_date', 'completed_at',
                'completion_seconds', 'execution', 'difficulty', 'subject', 'goal_id',
                'skill_node')


def _key(task: dict, fallback: str) -> str:
    """What two sessions share when they are for the same thing: the subject
    they're filed under, else whatever the planner calls them."""
    return (task.get('subject') or '').strip() or fallback


def planned(username: str, tasks: List[dict], now: datetime,
            exclude_recommendation: str = '') -> List[dict]:
    """Every session a planner booked that is still ahead, as
    `{start, end, subject}`: subject-page recommendations, skill-tree sessions
    and sessions linked to a goal. The reader's own calendar blocks are in
    `busy` already; these are the ones the spacing rules count."""
    from_recommendations = {}
    for row in db.rows_for('subject_recommendations', username):
        if row.get('task_id') and not row.get('taken_at') and row.get('id') != exclude_recommendation:
            from_recommendations[str(row['task_id'])] = row
    out = []
    for task in tasks:
        if task.get('status') == 'done' or not task.get('show_on_calendar'):
            continue
        task_id = str(task.get('id') or '')
        node = str(task.get('skill_node') or '')
        if task_id in from_recommendations:
            fallback = from_recommendations[task_id].get('subject') or ''
        elif node and node != '-':
            fallback = 'skill:' + node
        elif task.get('goal_id'):
            fallback = 'goal:' + str(task['goal_id'])
        else:
            continue
        start = session_plan._parse(task.get('created_at'))
        end = session_plan._parse(task.get('due_date'))
        if not start or not end or end <= now:
            continue
        out.append({'start': start, 'end': end, 'subject': _key(task, fallback)})
    return out


class Planner:
    """The record read once, for one or several bookings in one request."""

    def __init__(self, username: str, now: Optional[datetime] = None,
                 exclude_recommendation: str = ''):
        self.now = now or datetime.now()
        self.tasks = db.columns_for('tasks', username, TASK_COLUMNS)
        self.busy = session_plan.busy_spans(self.tasks, db.calendar_document(username), self.now)
        self.booked = planned(username, self.tasks, self.now, exclude_recommendation)
        self.profile = session_timing.rhythm(self.tasks, db.rows_for('focus_days', username), self.now)

    def place(self, minutes: int, difficulty, subject: str,
              before: Optional[datetime] = None) -> Optional[dict]:
        """`{start, end, why}` for one session, or None. A slot handed out
        counts as booked for the next call, so a run of bookings spaces
        itself."""
        slot = session_timing.place(minutes, difficulty, subject, self.busy, self.booked,
                                    self.profile, self.now, before)
        if slot:
            self.booked.append({'start': slot['start'], 'end': slot['end'], 'subject': subject})
            self.busy = sorted(self.busy + [(slot['start'], slot['end'])])
        return slot


def ends_by(deadline) -> Optional[datetime]:
    """A goal's deadline as the latest a session may end: the end of that day."""
    day = session_plan._parse(deadline)
    if not day:
        return None
    return day.replace(hour=23, minute=59, second=0, microsecond=0)


def subjects_of(values: Iterable) -> str:
    """The first subject in a list, or ''."""
    return next((str(one) for one in values if one), '')
