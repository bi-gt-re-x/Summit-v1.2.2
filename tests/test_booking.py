"""Every planner books through one scheduler.

Plan my next session (a subject page), Book N sessions (a dated goal) and Plan a
session (a skill-tree node) all ask backend/api/booking.py, which asks
backend/tracking/session_timing.py. These pin what that buys: a goal's sessions
end by its deadline and land on separate days at hours the reader works, every
booking says why its time, and sessions from different planners space around
each other.
"""
from datetime import date, datetime, timedelta

from backend.api import booking
from backend.database import connection as db
from backend.tracking import session_timing as timing

NOW = datetime(2026, 10, 17, 8, 0)


# ---------------------------------------------------------------------------
# The rule: a deadline
# ---------------------------------------------------------------------------
def test_a_session_ends_by_the_deadline():
    profile = timing.rhythm([], [], NOW)
    before = NOW.replace(hour=23, minute=59) + timedelta(days=1)
    slot = timing.place(45, 3, 'maths', [], [], profile, NOW, before)
    assert slot and slot['end'] <= before


def test_a_deadline_already_gone_has_no_slot():
    profile = timing.rhythm([], [], NOW)
    assert timing.place(45, 3, 'maths', [], [], profile, NOW, NOW - timedelta(hours=1)) is None


def test_when_spacing_leaves_no_day_the_first_free_slot_still_answers():
    """Every day in reach already holds this subject: spacing finds nothing,
    and the calendar still has room, so the answer is the first free slot."""
    profile = timing.rhythm([], [], NOW)
    booked = [{'start': (NOW + timedelta(days=offset)).replace(hour=9),
               'end': (NOW + timedelta(days=offset)).replace(hour=10), 'subject': 'maths'}
              for offset in range(timing.SEARCH_DAYS + 1)]
    slot = timing.place(30, 3, 'maths', [], booked, profile, NOW)
    assert slot and slot['why'] == timing.FIRST_FREE


def test_a_run_of_bookings_spaces_itself(client):
    planner = booking.Planner('tester', NOW)
    days = {planner.place(45, 3, 'maths')['start'].date() for _ in range(3)}
    assert len(days) == 3


# ---------------------------------------------------------------------------
# What counts as already planned
# ---------------------------------------------------------------------------
def _calendar_task(task_id, start, **extra):
    db.insert_row('tasks', {
        'id': task_id, 'user_id': 'tester', 'title': 'Session', 'status': 'todo',
        'show_on_calendar': True, 'created_at': start.isoformat(timespec='seconds'),
        'due_date': (start + timedelta(minutes=45)).isoformat(timespec='seconds'), **extra})


def test_skill_and_goal_sessions_count_as_planned_and_plain_tasks_do_not(client):
    soon = datetime.now().replace(second=0, microsecond=0) + timedelta(days=2)
    _calendar_task('t-skill', soon, skill_node='m.arith', subject='mathematics')
    _calendar_task('t-goal', soon + timedelta(hours=2), goal_id='g1')
    _calendar_task('t-mine', soon + timedelta(hours=4), subject='mathematics')
    _calendar_task('t-off', soon + timedelta(hours=6), skill_node='-')
    tasks = db.columns_for('tasks', 'tester', booking.TASK_COLUMNS)
    planned = booking.planned('tester', tasks, datetime.now())
    assert sorted(one['subject'] for one in planned) == ['goal:g1', 'mathematics']


# ---------------------------------------------------------------------------
# The three buttons
# ---------------------------------------------------------------------------
def _goal(deadline_days=30, **over):
    today = date.today()
    fields = {'id': 'g-book', 'user_id': 'tester', 'title': 'USACO December', 'status': 'active',
              'deadline': (today + timedelta(days=deadline_days)).isoformat(),
              'start_date': (today - timedelta(days=10)).isoformat(),
              'created_at': (today - timedelta(days=10)).isoformat(),
              'subject_ids': 'computer_science', 'progress': 30}
    fields.update(over)
    db.insert_row('goals', fields)
    return fields['id']


def test_a_goals_sessions_say_why_and_keep_to_waking_hours(client):
    reply = client.post('/api/next_actions/book', json={'goal_id': _goal()}).json()
    assert reply['success'], reply
    for one in reply['booked']:
        start = datetime.fromisoformat(one['start'])
        assert one['why']
        assert timing.DEFAULT_WINDOW[0] <= start.hour < timing.DEFAULT_WINDOW[1]
    assert len({one['start'][:10] for one in reply['booked']}) == len(reply['booked'])


def test_a_goals_sessions_end_by_its_deadline(client):
    reply = client.post('/api/next_actions/book', json={'goal_id': _goal(deadline_days=3)}).json()
    assert reply['success'], reply
    assert reply['booked']
    last = (date.today() + timedelta(days=3)).isoformat()
    assert all(one['end'][:10] <= last for one in reply['booked'])


def test_a_skill_session_is_not_put_on_a_day_its_subject_already_has(client):
    first = client.post('/api/skill-progress/book', json={'node_id': 'm.arith'}).json()
    second = client.post('/api/skill-progress/book', json={'node_id': 'm.fractions'}).json()
    assert first['success'] and second['success'], (first, second)
    assert first['task']['why'] and second['task']['why']
    # Both are Mathematics: never two on one day.
    assert first['task']['start'][:10] != second['task']['start'][:10]
