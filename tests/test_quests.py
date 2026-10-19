"""First-week quests: each is ticked by the real action and pays once.

The rules are backend/tracking/quests.py. These pin the three promises the
Dashboard card makes: a quest isn't done until the row it asks for exists, a
claim pays real XP (ledger and account both), and nothing pays twice.
"""
from datetime import date, datetime, timedelta

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
