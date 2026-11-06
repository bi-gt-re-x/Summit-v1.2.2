"""The weekly review: what moved, what stalled, and the bet.

The rules are backend/tracking/weekly.py.
"""
from datetime import date, datetime, timedelta

from backend.tracking import priority, weekly

_seq = [0]


def task(day, title='Practice set', subject='mathematics', execution=4, difficulty=3, **more):
    _seq[0] += 1
    row = {'id': 't{}'.format(_seq[0]), 'title': title, 'status': 'done', 'subject': subject,
           'completed_at': '{}T18:00:00'.format(day.isoformat()), 'execution': execution,
           'difficulty': difficulty, 'completion_seconds': 1800}
    row.update(more)
    return row


def read(tasks, goals=(), today=date(2026, 11, 4), reviews=(), tests=()):
    now = datetime.combine(today, datetime.min.time()).replace(hour=10)
    decision = priority.decide(list(goals), list(tasks), now, 60)
    return weekly.read(list(tasks), list(goals), [], [], decision, list(tests), list(reviews), today)


def test_the_week_is_last_week_until_sunday():
    assert weekly.week_of(date(2026, 11, 4)) == {'start': date(2026, 10, 26), 'end': date(2026, 11, 1)}
    assert weekly.week_of(date(2026, 11, 8)) == {'start': date(2026, 11, 2), 'end': date(2026, 11, 8)}
    assert weekly.week_of(date(2026, 11, 2)) == {'start': date(2026, 10, 26), 'end': date(2026, 11, 1)}


def test_the_tiles_count_the_week_against_the_one_before():
    monday = date(2026, 10, 26)
    tasks = [task(monday + timedelta(days=at)) for at in (0, 0, 2, 4)]
    tasks += [task(monday - timedelta(days=at)) for at in (1, 2)]
    found = read(tasks)
    tiles = {tile['key']: tile for tile in found['tiles']}
    assert (tiles['sessions']['value'], tiles['sessions']['before']) == (4, 2)
    assert tiles['days']['value'] == 3
    assert tiles['days']['days'] == [True, False, True, False, True, False, False]
    assert found['week']['label'] == 'Oct 26 to Nov 1'


def test_busy_with_no_goal_moving_is_said_first():
    monday = date(2026, 10, 26)
    tasks = [task(monday + timedelta(days=at % 7)) for at in range(8)]
    assert read(tasks)['headline'] == 'A busy week, but no goal moved'


def test_a_quiet_week_says_so():
    assert read([])['headline'] == 'A quiet week'


def test_a_subject_that_dropped_is_named():
    monday = date(2026, 10, 26)
    tasks = [task(monday - timedelta(days=1 + at % 6), subject='music') for at in range(8)]
    tasks += [task(monday, subject='music')]
    stalled = read(tasks, today=date(2026, 11, 4))['stalled']
    assert any(line['detail'] == 'Down from 8 sessions to 1.' for line in stalled)


def test_hard_work_done_well_moves_both_ways():
    monday = date(2026, 10, 26)
    tasks = [task(monday + timedelta(days=at), difficulty=5, execution=5) for at in range(3)]
    moved = read(tasks)['moved']
    assert any(line['title'] == 'Hard work done well' and line['detail'] == '3 this week, up from 0.' for line in moved)


def test_the_streak_counts_reviewed_weeks_in_a_row():
    reviews = [{'week_start': '2026-10-26'}, {'week_start': '2026-10-19'}, {'week_start': '2026-10-05'}]
    found = read([], reviews=reviews)
    assert found['reviewed'] is True
    assert found['streak'] == 2
    # Not reviewed yet this week: the streak so far still counts.
    assert read([], reviews=reviews[1:])['streak'] == 1


def test_lines_are_short_and_plain():
    monday = date(2026, 10, 26)
    tasks = [task(monday + timedelta(days=at % 7), difficulty=5, execution=5) for at in range(9)]
    found = read(tasks)
    for line in found['moved'] + found['stalled']:
        assert len(line['detail'].split()) <= 12
        assert '—' not in line['detail']


def test_the_review_endpoint_reads_and_saving_marks_the_week(client):
    first = client.get('/api/weekly_review').json()
    assert first['success'] and first['reviewed'] is False
    assert client.post('/api/weekly_review', json={'note': 'Mornings work.'}).json()['success']
    again = client.get('/api/weekly_review').json()
    assert (again['reviewed'], again['note'], again['streak']) == (True, 'Mornings work.', 1)
    # Saving twice updates the note rather than failing on the key.
    assert client.post('/api/weekly_review', json={'note': 'Evenings too.'}).json()['success']
    assert client.get('/api/weekly_review').json()['note'] == 'Evenings too.'
