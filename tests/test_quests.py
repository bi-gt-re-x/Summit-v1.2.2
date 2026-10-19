"""First-week quests: each is ticked by the real action and pays once.

The rules are backend/tracking/quests.py. These pin the three promises the
Dashboard card makes: a quest isn't done until the row it asks for exists, a
claim pays real XP (ledger and account both), and nothing pays twice.
"""
from datetime import date, datetime, timedelta

import pytest

from backend.database import connection as db
from backend.tracking import quests


def _joined_today(username='tester'):
    user = next(row for row in db.users() if row['username'] == username)
    db.update_row('users', user['id'], {'created_at': datetime.now().isoformat()})


def _line(client):
    reply = client.get('/api/quests').json()
    assert reply['success'], reply
    return reply


def _by_id(client):
    return {quest['id']: quest for quest in _line(client)['quests']}


def _claim(client, quest_id):
    return client.post('/api/quests/claim', json={'id': quest_id}).json()


def _account(username='tester'):
    return next(row for row in db.users() if row['username'] == username)


def _quest_events(username='tester'):
    return [row for row in db.rows_for('xp_events', username)
            if str(row.get('reason', '')).startswith('quest:')]


def _finish_a_task(client):
    task = client.post('/api/tasks', json={'name': 'Read ch. 1', 'priority': 'low',
                                           'xp_reward': 10}).json()['task_id']
    assert client.post('/api/complete_task', json={'task_id': task}).json()['success']


# ---------------------------------------------------------------------------
# What's done
# ---------------------------------------------------------------------------
def test_a_new_account_has_six_open_quests(client):
    _joined_today()
    line = _line(client)
    assert [quest['id'] for quest in line['quests']] == [
        'task', 'focus', 'practice', 'log', 'goal', 'back']
    assert not any(quest['done'] or quest['claimed'] for quest in line['quests'])
    assert line['retired'] is False
    assert all(quest['xp'] > 0 for quest in line['quests'])


def test_each_quest_is_ticked_by_the_row_its_action_leaves(client):
    _joined_today()
    _finish_a_task(client)
    db.insert_row('focus_sittings', {
        'id': 's1', 'user_id': 'tester', 'day': date.today().isoformat(),
        'style_id': 'classic', 'minutes': 5})
    db.insert_row('skill_attempts', {
        'id': 'a1', 'user_id': 'tester', 'node_id': 'algebra-1', 'ordinal': 1,
        'weight': 'core', 'attempted': 1, 'correct': 1, 'source': 'problem',
        'at': datetime.now().isoformat()})
    db.insert_row('goals', {'id': 'g1', 'user_id': 'tester', 'title': 'Pass the AP exam',
                            'status': 'active'})
    assert client.post('/api/log/save', json={'title': 'Day one', 'body': 'Fine.',
                                              'mood': 4}).json()['success']

    found = _by_id(client)
    assert {key for key, quest in found.items() if quest['done']} == {
        'task', 'focus', 'practice', 'log', 'goal'}


def test_focus_counts_from_the_days_total_too(client):
    # Sittings are sent up in batches, so the day's seconds can land first.
    _joined_today()
    db.insert_row('focus_days', {'user_id': 'tester', 'date': date.today().isoformat(),
                                 'seconds': 120})
    assert _by_id(client)['focus']['done']


def test_a_log_entry_without_a_mood_does_not_count(client):
    _joined_today()
    assert client.post('/api/log/save', json={'title': 'Day one', 'body': 'Fine.'}).json()['success']
    assert not _by_id(client)['log']['done']


def test_coming_back_is_done_on_any_later_day(client):
    _joined_today()
    assert not _by_id(client)['back']['done']
    tomorrow = date.today() + timedelta(days=1)
    assert next(quest for quest in quests.status('tester', today=tomorrow)['quests']
                if quest['id'] == 'back')['done']


# ---------------------------------------------------------------------------
# Claiming
# ---------------------------------------------------------------------------
def test_an_unfinished_quest_cannot_be_claimed(client):
    _joined_today()
    reply = _claim(client, 'task')
    assert not reply['success']
    assert _quest_events() == []
    assert _account()['xp'] == 0


def test_a_claim_pays_the_ledger_and_the_account_once(client):
    _joined_today()
    _finish_a_task(client)
    before = _account()['xp']

    paid = _claim(client, 'task')
    assert paid['success'], paid
    assert paid['xp_earned'] == quests.BY_ID['task']['xp']
    assert paid['total_xp'] == before + paid['xp_earned']
    assert _account()['xp'] == before + paid['xp_earned']
    events = _quest_events()
    assert len(events) == 1
    assert events[0]['reason'] == 'quest:task'
    assert events[0]['amount'] == paid['xp_earned']
    assert (events[0].get('tasks_completed') or 0) == 0

    again = _claim(client, 'task')
    assert not again['success'] and again.get('claimed') is True
    assert len(_quest_events()) == 1
    assert _account()['xp'] == before + paid['xp_earned']
    assert _by_id(client)['task']['claimed']


def test_the_table_key_stops_a_racing_second_claim(client):
    # The read-then-write in `claim` can lose a race; the insert can't.
    stamp = datetime.now().isoformat()
    assert db.claim_quest('tester', 'task', 30, stamp) is True
    assert db.claim_quest('tester', 'task', 30, stamp) is False


def test_a_claim_that_crosses_a_level_says_so(client):
    _joined_today()
    user = _account()
    db.update_row('users', user['id'], {'xp': 90, 'level': 1})
    _finish_a_task(client)      # +10, to 100: level 2 already
    db.update_row('users', user['id'], {'xp': 90, 'level': 1})
    paid = _claim(client, 'task')
    assert paid['leveled_up'] is True
    assert paid['new_level'] == 2
    assert _account()['level'] == 2


def test_an_unknown_quest_and_an_empty_claim_are_refused(client):
    assert not _claim(client, 'nope')['success']
    assert not client.post('/api/quests/claim', json={}).json()['success']


def test_claims_belong_to_their_account(client, stranger):
    _finish_a_task(client)
    assert _claim(client, 'task')['success']
    assert not _by_id(stranger)['task']['claimed']
    # The stranger hasn't finished a task, so it isn't theirs to claim.
    assert not _claim(stranger, 'task')['success']


def test_signed_out_gets_nothing(anon):
    assert anon.get('/api/quests').status_code == 401
    assert anon.post('/api/quests/claim', json={'id': 'task'}).status_code == 401


# ---------------------------------------------------------------------------
# Retiring
# ---------------------------------------------------------------------------
def test_the_line_retires_once_every_quest_is_claimed(client):
    # `tester` was made in January, so coming back is already done.
    _finish_a_task(client)
    db.insert_row('focus_days', {'user_id': 'tester', 'date': date.today().isoformat(),
                                 'seconds': 600})
    db.insert_row('skill_attempts', {
        'id': 'a1', 'user_id': 'tester', 'node_id': 'algebra-1', 'ordinal': 1,
        'weight': 'core', 'attempted': 1, 'correct': 1, 'source': 'problem',
        'at': datetime.now().isoformat()})
    db.insert_row('goals', {'id': 'g1', 'user_id': 'tester', 'title': 'Read more',
                            'status': 'active'})
    client.post('/api/log/save', json={'title': 'Day', 'body': 'Ok.', 'mood': 3})

    for quest in quests.QUESTS[:-1]:
        assert _claim(client, quest['id'])['success'], quest['id']
        assert _line(client)['retired'] is False
    assert _claim(client, 'back')['success']
    assert _line(client)['retired'] is True
    assert _account()['xp'] == 10 + sum(quest['xp'] for quest in quests.QUESTS)


def test_a_seasoned_account_is_retired_without_the_browser(client):
    for back in range(quests.SEASONED_XP_DAYS):
        day = (date.today() - timedelta(days=back)).isoformat()
        db.insert_row('xp_events', {'id': str(db.new_id('xp_events')), 'user_id': 'tester',
                                    'amount': 10, 'reason': 'task_completion',
                                    'timestamp': day + 'T09:00:00', 'date': day,
                                    'tasks_completed': 1})
    assert _line(client)['retired'] is True


def test_resetting_progress_lets_the_quests_be_earned_again(client):
    _finish_a_task(client)
    assert _claim(client, 'task')['success']
    reply = client.post('/api/settings/reset', json={'scope': 'progress', 'confirm': 'tester'}).json()
    assert reply['success'], reply
    assert not _by_id(client)['task']['claimed']
    assert _claim(client, 'task')['success']


# ---------------------------------------------------------------------------
# Today's quest
# ---------------------------------------------------------------------------
def _today():
    return date.today().isoformat()


def _daily(client, day=None):
    reply = client.get('/api/quests', params={'day': day or _today()}).json()
    assert reply['success'], reply
    return reply['daily']


def _claim_daily(client, day=None):
    return client.post('/api/quests/claim', json={'id': 'daily', 'day': day or _today()}).json()


def _counts(**done):
    blank = {'tasks': 0, 'subject_tasks': 0, 'focus_seconds': 0, 'focus_minutes': 0,
             'practice': 0, 'log': 0, 'planned': 0}
    return dict(blank, **done)


def _do(action, client, username='tester'):
    """Leave the rows one daily action asks for, today."""
    now = datetime.now().isoformat()
    if action in ('tasks2', 'subject'):
        for name in ('One', 'Two'):
            task = client.post('/api/tasks', json={
                'name': name, 'priority': 'low', 'xp_reward': 10,
                'subject': 'algebra' if action == 'subject' else None}).json()['task_id']
            assert client.post('/api/complete_task', json={'task_id': task}).json()['success']
    elif action == 'focus15':
        db.insert_row('focus_days', {'user_id': username, 'date': _today(), 'seconds': 15 * 60})
    elif action == 'practice3':
        db.insert_row('skill_attempts', {
            'id': 'p-' + username, 'user_id': username, 'node_id': 'algebra-1', 'ordinal': 1,
            'weight': 'core', 'attempted': 3, 'correct': 2, 'source': 'log', 'at': now})
    elif action == 'log':
        assert client.post('/api/log/save', json={'title': 'Today', 'body': 'Ok.'}).json()['success']
    elif action == 'plan':
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        assert client.post('/api/tasks', json={'name': 'Prep', 'priority': 'low',
                                               'due_date': tomorrow}).json()['success']
    else:
        raise AssertionError(action)


def test_each_daily_action_reads_its_own_rows():
    did = {quest['id']: quest['did'] for quest in quests.DAILY}
    assert not any(check(_counts()) for check in did.values())
    assert did['tasks2'](_counts(tasks=2)) and not did['tasks2'](_counts(tasks=1))
    assert did['focus15'](_counts(focus_minutes=15))
    assert did['focus15'](_counts(focus_seconds=900)) and not did['focus15'](_counts(focus_seconds=899))
    assert did['practice3'](_counts(practice=3)) and not did['practice3'](_counts(practice=2))
    assert did['log'](_counts(log=1))
    assert did['subject'](_counts(subject_tasks=1)) and not did['subject'](_counts(tasks=5))
    assert did['plan'](_counts(planned=1))


def test_the_pick_is_the_same_all_day_and_moves_between_days():
    day = date(2026, 10, 20)
    first = quests.pick_daily('tester', day, {})
    assert all(quests.pick_daily('tester', day, {}) is first for _ in range(5))
    picks = {quests.pick_daily('tester', day + timedelta(days=n), {})['id'] for n in range(30)}
    assert len(picks) > 2


def test_the_pick_skips_what_was_done_lately():
    day = date(2026, 10, 20)
    yesterday = (day - timedelta(days=1)).isoformat()
    everything_but_log = _counts(tasks=2, subject_tasks=2, focus_minutes=30, practice=3, planned=1)
    for name in ('tester', 'someone', 'else', 'again'):
        assert quests.pick_daily(name, day, {yesterday: everything_but_log})['id'] == 'log'
    # Too long ago doesn't count, and doing it all lately falls back to the whole pool.
    old = (day - timedelta(days=quests.LATELY + 1)).isoformat()
    assert quests.pick_daily('tester', day, {old: everything_but_log}) is quests.pick_daily('tester', day, {})
    all_of_it = dict(everything_but_log, log=1)
    assert quests.pick_daily('tester', day, {yesterday: all_of_it}) is quests.pick_daily('tester', day, {})


def test_doing_todays_quest_doesnt_change_it(client):
    _joined_today()
    before = _daily(client)
    _do(before['action'], client)
    after = _daily(client)
    assert after['action'] == before['action']
    assert after['done'] is True and after['claimed'] is False
    assert after['id'] == 'daily:' + _today()


def test_todays_quest_ticks_only_on_todays_rows(client):
    _joined_today()
    quest = _daily(client)
    assert quest['done'] is False
    assert not _claim_daily(client)['success']
    assert _quest_events() == []
    _do(quest['action'], client)
    assert _daily(client)['done'] is True
    # The same rows don't make tomorrow's quest done.
    tomorrow = date.today() + timedelta(days=1)
    later = quests.status('tester', today=tomorrow, day=tomorrow.isoformat())['daily']
    assert later['done'] is False


def test_the_daily_claim_pays_once_a_day(client):
    _joined_today()
    quest = _daily(client)
    _do(quest['action'], client)
    before = _account()['xp']

    paid = _claim_daily(client)
    assert paid['success'], paid
    assert paid['quest'] == 'daily:' + _today()
    assert paid['xp_earned'] == quests.DAILY_BY_ID[quest['action']]['xp']
    assert _account()['xp'] == before + paid['xp_earned']
    events = [row for row in _quest_events() if row['reason'] == 'quest:daily']
    assert len(events) == 1 and events[0]['date'] == _today()
    assert (events[0].get('tasks_completed') or 0) == 0

    again = _claim_daily(client)
    assert not again['success'] and again.get('claimed') is True
    assert len(_quest_events()) == 1
    assert _account()['xp'] == before + paid['xp_earned']
    assert _daily(client)['claimed'] is True
    assert db.claim_quest('tester', 'daily:' + _today(), 30, datetime.now().isoformat()) is False


def test_a_new_day_is_a_new_claim(client):
    _joined_today()
    today = date.today()
    tomorrow = today + timedelta(days=1)
    stamp = datetime.now().isoformat()
    assert db.claim_quest('tester', 'daily:' + today.isoformat(), 30, stamp)
    assert db.claim_quest('tester', 'daily:' + tomorrow.isoformat(), 30, stamp)
    assert quests.status('tester', today=today, day=tomorrow.isoformat())['daily']['claimed']


def test_the_readers_day_is_kept_within_one_day():
    today = date(2026, 10, 20)
    assert quests.reader_day('2026-10-21', today) == date(2026, 10, 21)
    assert quests.reader_day('2026-10-19', today) == date(2026, 10, 19)
    assert quests.reader_day('2026-10-01', today) == today
    assert quests.reader_day('nonsense', today) == today
    assert quests.reader_day(None, today) == today


def test_an_old_day_cant_be_claimed(client):
    # A date from last week is read as today, whose quest isn't done.
    _joined_today()
    long_ago = (date.today() - timedelta(days=5)).isoformat()
    assert not _claim_daily(client, long_ago)['success']
    assert db.rows_for('quest_claims', 'tester') == []


@pytest.mark.parametrize('action', [quest['id'] for quest in quests.DAILY])
def test_every_daily_action_is_seen_in_the_real_rows(client, action):
    _joined_today()
    day = date.today().isoformat()
    quest = quests.DAILY_BY_ID[action]
    assert not quests._did(quest, db.daily_quest_facts('tester', day, day).get(day))
    _do(action, client)
    assert quests._did(quest, db.daily_quest_facts('tester', day, day).get(day))


def test_the_daily_quest_stops_for_a_seasoned_account(client):
    _joined_today()
    assert _daily(client) is not None
    for back in range(quests.DAILY_XP_DAYS):
        day = (date.today() - timedelta(days=back)).isoformat()
        db.insert_row('xp_events', {'id': str(db.new_id('xp_events')), 'user_id': 'tester',
                                    'amount': 10, 'reason': 'task_completion',
                                    'timestamp': day + 'T09:00:00', 'date': day,
                                    'tasks_completed': 1})
    assert _daily(client) is None


def test_the_daily_quest_carries_the_head_start(client):
    _joined_today()
    assert _daily(client)['head_start'] == 0


def test_daily_claims_dont_touch_the_first_week_line(client):
    _joined_today()
    quest = _daily(client)
    _do(quest['action'], client)
    assert _claim_daily(client)['success']
    line = _line(client)
    assert line['retired'] is False
    assert not any(row['claimed'] for row in line['quests'])
