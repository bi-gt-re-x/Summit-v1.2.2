"""The bell: what it raises, what it will not raise twice, and what a delete means.

The contract this file protects, in the order the notifications feature would
break if any of it stopped holding:

  1. The sweep is idempotent. It runs on every read of the list — there is no
     job runner (backend/tracking/notify.py) — so a bell that grew by one row
     per poll would be unusable within a minute.
  2. A deleted notification stays deleted. This is the whole feature: the
     situation behind it is usually still true, so a hard delete would let the
     next poll write it straight back.
  3. A day-scoped count is reworded in place rather than re-raised, so
     finishing a task does not produce a second "tasks are late".
  4. A channel that is off writes nothing and shows nothing.
  5. The first sweep an account ever gets says nothing about its backlog.
  6. One account's notifications are not another's.
"""
from datetime import date, timedelta

import pytest

from backend.database import connection as db
from backend.tracking import notify

from tests.conftest import make_account, sign_in

DAY = '2026-09-01'
TOMORROW = '2026-09-02'


def _task(username, title, due, status='todo'):
    db.insert_row('tasks', {
        'id': db.new_id('tasks'),
        'user_id': username,
        'title': title,
        'priority': 'medium',
        'status': status,
        'xp_value': 10,
        'due_date': due,
    })


def _list(client, day=DAY, at='09:00'):
    reply = client.get('/api/notifications', params={'day': day, 'at': at}).json()
    assert reply['success'], reply
    return reply['notifications']


def _prints(rows):
    return {row['fingerprint'] for row in rows}


@pytest.fixture
def overdue(client):
    """`tester`, three days behind on two tasks and due one today."""
    _task('tester', 'the late one', '2026-08-20')
    _task('tester', 'the other late one', '2026-08-22')
    _task('tester', 'the one due today', DAY)
    return client


# --------------------------------------------------------------------------
# The sweep
# --------------------------------------------------------------------------
def test_the_record_becomes_notifications(overdue):
    rows = _list(overdue)
    prints = _prints(rows)
    assert 'overdue:%s' % DAY in prints
    assert 'due-today:%s' % DAY in prints

    late = next(r for r in rows if r['fingerprint'] == 'overdue:%s' % DAY)
    assert late['channel'] == 'tasks'
    assert late['tone'] == 'urgent'
    # The count is in the words, never in the fingerprint — see the note in
    # backend/tracking/notify.py on why.
    assert '2 tasks' in late['title']
    assert 'the late one' in late['body']


def test_sweeping_again_writes_nothing(overdue):
    first = _list(overdue)
    assert first
    for _ in range(3):
        again = _list(overdue)
    assert _prints(again) == _prints(first)
    assert [r['id'] for r in again] == [r['id'] for r in first]


def test_a_moving_count_is_reworded_rather_than_re_raised(overdue):
    before = next(r for r in _list(overdue) if r['fingerprint'] == 'overdue:%s' % DAY)
    assert '2 tasks' in before['title']

    # One of the two is finished. The situation is the same situation; only
    # the number in it has changed.
    row = next(r for r in db.rows_for('tasks', 'tester') if r['title'] == 'the late one')
    db.update_row('tasks', row['id'], {'status': 'done'}, user_id='tester')

    after = [r for r in _list(overdue) if r['fingerprint'] == 'overdue:%s' % DAY]
    assert len(after) == 1
    assert after[0]['id'] == before['id']
    assert '1 task' in after[0]['title']


def test_a_new_day_retires_the_old_one_and_raises_its_own(overdue):
    """Yesterday's count is neither news nor today's number, so it goes."""
    assert 'overdue:%s' % DAY in _prints(_list(overdue))

    tomorrow = _prints(_list(overdue, day=TOMORROW))
    assert 'overdue:%s' % TOMORROW in tomorrow
    assert 'overdue:%s' % DAY not in tomorrow

    # Retired, not forgotten — the fingerprint stays as a tombstone, so going
    # back to yesterday does not resurrect it.
    assert 'overdue:%s' % DAY in db.live_fingerprints('tester')
    assert 'overdue:%s' % DAY not in _prints(_list(overdue))


# --------------------------------------------------------------------------
# Deleting
# --------------------------------------------------------------------------
def test_deleting_one_keeps_it_gone(overdue):
    doomed = next(r for r in _list(overdue) if r['fingerprint'] == 'overdue:%s' % DAY)
    assert overdue.delete('/api/notifications/%s' % doomed['id']).json()['success']

    # The tasks are still late. The notification about them does not come back.
    for _ in range(3):
        rows = _list(overdue)
    assert 'overdue:%s' % DAY not in _prints(rows)
    assert 'due-today:%s' % DAY in _prints(rows)


def test_delete_all_empties_it_and_it_stays_empty(overdue):
    assert _list(overdue)
    removed = overdue.delete('/api/notifications').json()
    assert removed['success'] and removed['removed'] > 0

    assert _list(overdue) == []
    assert _list(overdue) == []

    # Until something genuinely new turns up, which a new day is.
    assert _list(overdue, day=TOMORROW)


def test_deleting_one_that_is_already_gone_is_a_failure_not_a_crash(overdue):
    doomed = _list(overdue)[0]
    assert overdue.delete('/api/notifications/%s' % doomed['id']).json()['success']
    assert not overdue.delete('/api/notifications/%s' % doomed['id']).json()['success']


def test_one_account_cannot_delete_anothers(overdue, stranger):
    mine = _list(overdue)[0]
    assert not stranger.delete('/api/notifications/%s' % mine['id']).json()['success']
    assert mine['id'] in {row['id'] for row in _list(overdue)}


def test_an_accounts_list_is_its_own(overdue, stranger):
    _task('stranger', 'not yours', '2026-08-01')
    theirs = _list(stranger)
    assert theirs
    assert not {r['id'] for r in theirs} & {r['id'] for r in _list(overdue)}


# --------------------------------------------------------------------------
# Read, and shown
# --------------------------------------------------------------------------
def test_reading_is_not_deleting(overdue):
    rows = _list(overdue)
    assert overdue.post('/api/notifications/mark', json={'read': True}).json()['success']

    after = _list(overdue)
    assert len(after) == len(rows)
    assert all(row['read_at'] for row in after)


def test_shown_is_stamped_per_row(overdue):
    rows = _list(overdue)
    first = rows[0]['id']
    overdue.post('/api/notifications/mark', json={'shown': [first]})

    after = {row['id']: row for row in _list(overdue)}
    assert after[first].get('shown_at')
    assert not any(row.get('shown_at') for key, row in after.items() if key != first)


# --------------------------------------------------------------------------
# The switches
# --------------------------------------------------------------------------
def test_the_master_switch_stops_everything(overdue):
    assert _list(overdue)
    overdue.post('/api/settings', json={'values': {'notifications_enabled': False}})

    reply = overdue.get('/api/notifications', params={'day': DAY}).json()
    assert reply['success'] and reply['enabled'] is False
    assert reply['notifications'] == []

    # Off is not a delete: what was there is there again when it comes back.
    overdue.post('/api/settings', json={'values': {'notifications_enabled': True}})
    assert _list(overdue)


def test_a_channel_that_is_off_is_neither_written_nor_shown(client):
    client.post('/api/settings', json={'values': {'notify_tasks': False}})
    _task('tester', 'the late one', '2026-08-20')

    assert 'overdue:%s' % DAY not in _prints(_list(client))
    # Not written either, so turning it back on starts from what is true then
    # rather than replaying what was suppressed.
    assert not [row for row in db.notifications_for('tester')
                if row['channel'] == 'tasks']

    client.post('/api/settings', json={'values': {'notify_tasks': True}})
    assert 'overdue:%s' % DAY in _prints(_list(client))


def test_popups_are_reported_with_the_list(overdue):
    assert overdue.get('/api/notifications', params={'day': DAY}).json()['popups'] is True
    overdue.post('/api/settings', json={'values': {'notify_popups': False}})
    assert overdue.get('/api/notifications', params={'day': DAY}).json()['popups'] is False


# --------------------------------------------------------------------------
# The first sweep
# --------------------------------------------------------------------------
def test_the_first_sweep_says_nothing_about_the_backlog(app):
    """A level and a badge earned long ago are not news, and are never raised.

    They are still filed, under their own fingerprints, which is what stops
    them turning up as news on the second sweep instead.
    """
    make_account('veteran')
    user = db.find_row('users', 'veteran', key='username')
    db.update_row('users', 'veteran', {'xp': 4200, 'current_streak': 30},
                  key='username')
    client = sign_in(app, 'veteran')
    assert user is not None

    rows = _list(client)
    assert not [r for r in rows if r['channel'] == 'progress']
    assert 'streak-milestone:30' not in _prints(rows)

    # Filed, not forgotten: a second sweep does not discover them.
    assert 'streak-milestone:30' in db.live_fingerprints('veteran')
    assert not [r for r in _list(client) if r['channel'] == 'progress']


def test_something_new_after_the_first_sweep_is_raised(client):
    _list(client)  # the settling sweep

    db.insert_row('records', {
        'id': db.new_id('records'),
        'user_id': 'tester',
        'kind': 'record',
        'name': 'AMC 8',
        'value': 24,
        'unit': 'points',
        'achieved_on': DAY,
    })
    rows = _list(client)
    fresh = [r for r in rows if r['fingerprint'].startswith('record:')]
    assert len(fresh) == 1
    assert 'AMC 8' in fresh[0]['title']
    assert fresh[0]['tone'] == 'good'


# --------------------------------------------------------------------------
# The rules themselves
# --------------------------------------------------------------------------
def test_a_streak_with_work_on_it_is_not_at_risk(app, client):
    """The one notification that is about something you can still lose."""
    db.update_row('users', 'tester', {'current_streak': 4}, key='username')
    assert 'streak-risk:%s' % DAY in _prints(_list(client))

    # A second account, identical but for having finished something today.
    make_account('busy')
    db.update_row('users', 'busy', {'current_streak': 4}, key='username')
    _task('busy', 'done today', '', status='done')
    db.update_row(
        'tasks',
        db.rows_for('tasks', 'busy')[-1]['id'],
        {'completed_at': DAY + 'T10:00:00'},
        user_id='busy')

    assert 'streak-risk:%s' % DAY not in _prints(_list(sign_in(app, 'busy')))


def _risk(rows):
    return next(row for row in rows if row['fingerprint'] == 'streak-risk:%s' % DAY)


def test_the_warning_only_says_midnight_when_midnight_ends_the_run(app, client):
    """A run with a grace day to spend survives an empty day, so says so."""
    yesterday = (date.fromisoformat(DAY) - timedelta(days=1)).isoformat()
    db.update_row('users', 'tester', {'current_streak': 12, 'last_task_date': yesterday},
                  key='username')
    covered = _risk(_list(client))
    assert 'midnight' not in covered['body']
    assert 'grace day covers it' in covered['body']
    assert covered['tone'] == 'warn'

    # The same run with its grace spent last week: midnight is the truth.
    make_account('spent')
    db.update_row('users', 'spent', {
        'current_streak': 12, 'last_task_date': yesterday,
        'streak_grace_day': (date.fromisoformat(DAY) - timedelta(days=7)).isoformat(),
    }, key='username')
    bare = _risk(_list(sign_in(app, 'spent')))
    assert bare['body'] == 'Anything finished today keeps it. It resets at midnight.'
    assert bare['tone'] == 'urgent'


def test_a_goal_past_its_date_is_raised_once_a_day(client):
    db.insert_row('goals', {
        'id': 'g-late',
        'user_id': 'tester',
        'title': 'Finish the unit',
        'goal_type': 'xp',
        'status': 'active',
        'progress': 40,
        'deadline': '2026-08-01',
    })
    rows = [r for r in _list(client) if r['fingerprint'].startswith('goal-overdue:')]
    assert len(rows) == 1
    assert 'Finish the unit' in rows[0]['title']
    assert rows[0]['link'] == '/goals'
    assert len([r for r in _list(client)
                if r['fingerprint'].startswith('goal-overdue:')]) == 1


def test_todays_calendar_becomes_a_notification(client):
    db.save_calendar_document('tester', {
        '2026-9-1': {'timestamps': [
            {'task': 'Physics set', 'startTime': '16:10', 'endTime': '17:30'},
            {'task': 'Piano', 'startTime': '19:00', 'endTime': '20:00'},
        ]},
    })
    rows = {r['fingerprint']: r for r in _list(client, at='15:50')}
    assert '2 blocks' in rows['calendar-today:%s' % DAY]['title']
    # The one about to start is a second, separate notification.
    assert 'Physics set' in rows['calendar-soon:%s:16:10' % DAY]['title']


def test_nothing_is_raised_about_an_empty_week(client):
    """A brand new account is not told it finished no tasks and earned no XP."""
    assert not [r for r in _list(client) if r['channel'] == 'analytics']


# --------------------------------------------------------------------------
# Housekeeping
# --------------------------------------------------------------------------
def test_old_tombstones_are_pruned(overdue):
    """A tombstone stops being useful once its fingerprint cannot recur.

    ## The two clocks, and why `far` is measured from the real one

    This test has to move time forward, and there are two clocks to move.

    `sweep` takes the day from the request — that is what lets every other test
    in this file pretend it is DAY — and the prune cutoff is computed from it,
    as `day - TOMBSTONE_DAYS`. But `deleted_at` is stamped by
    `delete_notifications` from the server's wall clock, which no parameter
    reaches. So the tombstone is written in real time and judged in simulated
    time, and the test only means what it says while the two agree.

    Measured from DAY, as this was, they stopped agreeing on 2026-09-03: `far`
    was 2026-11-02, the cutoff 2026-09-03, and the tombstone carried whatever
    today actually was. The suite passed until that date and failed every day
    after — not because pruning broke, but because the calendar moved.

    So `far` is measured from `date.today()`, the clock that writes the value
    being tested. The offset is what matters here, not the date: this asks
    whether a tombstone older than the window is dropped, and any pair of days
    that far apart asks it.
    """
    doomed = _list(overdue)[0]
    overdue.delete('/api/notifications/%s' % doomed['id'])
    assert doomed['fingerprint'] in db.live_fingerprints('tester')

    far = (date.today() + timedelta(days=notify.TOMBSTONE_DAYS + 2)).isoformat()
    _list(overdue, day=far)
    assert doomed['fingerprint'] not in db.live_fingerprints('tester')


def test_a_tombstone_inside_the_window_is_kept(overdue):
    """The other side of it, and the half that does the work.

    Pruning everything would pass the test above just as well. What a tombstone
    is *for* is stopping a notification the reader dismissed from being written
    again the next time the sweep runs, so one inside the window has to survive
    a sweep — including a sweep on a later day.
    """
    doomed = _list(overdue)[0]
    overdue.delete('/api/notifications/%s' % doomed['id'])

    near = (date.today() + timedelta(days=notify.TOMBSTONE_DAYS - 2)).isoformat()
    _list(overdue, day=near)
    assert doomed['fingerprint'] in db.live_fingerprints('tester')


def test_signed_out_is_a_401(anon):
    assert anon.get('/api/notifications').status_code == 401
    assert anon.delete('/api/notifications').status_code == 401
