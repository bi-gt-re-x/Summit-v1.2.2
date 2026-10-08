"""How long a task took — backend/tracking/time_spent.

`completion_seconds` is the time a task sat between being written down and
being finished, not the time spent on it; these pin what is read instead."""
from backend.tracking import time_spent as ts

PLACED = {'show_on_calendar': 1, 'created_at': '2026-10-06T09:00:00',
          'due_date': '2026-10-06T10:30:00'}


def test_a_calendar_block_is_the_time_spent():
    assert ts.seconds_spent({**PLACED, 'completion_seconds': 400_000}) == 90 * 60
    assert ts.minutes_spent(PLACED) == 90


def test_a_short_gap_from_writing_to_finishing_counts():
    assert ts.seconds_spent({'completion_seconds': 1_200}) == 1_200


def test_a_lead_time_is_not_a_duration():
    # Written on Monday, finished on Friday.
    assert ts.seconds_spent({'completion_seconds': 4 * 86_400}) is None
    assert ts.minutes_spent({'completion_seconds': 7 * 3600}) is None


def test_a_block_longer_than_a_sitting_is_a_deadline_and_falls_back():
    deadline = {'show_on_calendar': True, 'created_at': '2026-10-01T09:00:00',
                'due_date': '2026-10-06T09:00:00'}
    assert ts.block_seconds(deadline) is None
    assert ts.seconds_spent({**deadline, 'completion_seconds': 1_800}) == 1_800


def test_an_unplaced_task_ignores_its_dates():
    assert ts.block_seconds({**PLACED, 'show_on_calendar': 0}) is None


def test_nothing_recorded_is_nothing():
    assert ts.seconds_spent({}) is None
    assert ts.seconds_spent({'completion_seconds': 'n/a'}) is None
    assert ts.seconds_spent({'completion_seconds': 0}) is None
