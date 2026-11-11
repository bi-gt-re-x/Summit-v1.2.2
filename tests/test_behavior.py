"""Behavior: patterns you already know you fall into, tracked until they stop.

The rules are backend/tracking/behavior.py; the endpoints backend/api/behavior.py. These
pin how often and how much it comes back, whether a fix worked (and how sure that is),
the four stages, a resolved pattern coming back, what the record measures by itself,
when it shows up, what Summit spots, and the question after a task.
"""
from datetime import date, timedelta

from backend.database import connection as db
from backend.tracking import behavior

TODAY = date(2026, 11, 10)
_seq = [0]


def back(days):
    return TODAY - timedelta(days=days)


def task(days_ago, hour=16, title='Practice set', subject='mathematics', **more):
    _seq[0] += 1
    row = {'id': 't{}'.format(_seq[0]), 'title': title, 'status': 'done', 'subject': subject,
           'completed_at': '{}T{:02d}:30:00'.format(back(days_ago).isoformat(), hour)}
    row.update(more)
    return row


def pattern(**more):
    row = {'id': 'b1', 'title': 'Impulsive answers on tests', 'detail': '', 'scope': 'study', 'subject': '',
           'words': '', 'source': 'own', 'source_ref': '', 'status': 'open',
           'identified_on': back(40).isoformat(), 'resolved_on': None, 'came_back': 0}
    row.update(more)
    return row


def check(days_ago, times, used=None, task_id='', label=''):
    _seq[0] += 1
    return {'id': 'c{}'.format(_seq[0]), 'behavior_id': 'b1', 'task_id': task_id, 'day': back(days_ago).isoformat(),
            'times': times, 'used': used, 'label': label, 'note': '', 'intervention_id': '',
            'created_at': back(days_ago).isoformat()}


def fix(started_days_ago, **more):
    row = {'id': 'f1', 'behavior_id': 'b1', 'title': 'Answer-confidence checkpoint', 'how': 'Mark sure or unsure.',
           'started_on': back(started_days_ago).isoformat(), 'ended_on': None, 'outcome': ''}
    row.update(more)
    return row


def read(row, checks, fixes=(), tasks=(), entries=()):
    return behavior.describe(row, checks, list(fixes), list(tasks), behavior.context_for(tasks, entries), TODAY)


# ---- how often and how much it comes back ----------------------------------------
def test_frequency_counts_times_and_sessions_in_the_last_month():
    checks = [check(3, 2), check(5, 0), check(9, 1), check(12, 0), check(50, 3)]
    found = read(pattern(), checks)
    assert found['frequency']['times'] == 3
    assert found['frequency']['sessions'] == 2
    assert found['frequency']['checked'] == 4
    assert found['frequency']['line'] == '3 times in the last 30 days, in 2 of 4 checked sessions.'


def test_recurrence_counts_only_sessions_since_it_was_named():
    checks = [check(50, 3), check(30, 1), check(20, 0), check(10, 1), check(2, 0)]
    found = read(pattern(identified_on=back(35).isoformat()), checks)
    assert found['recurrence']['hits'] == 2
    assert found['recurrence']['of'] == 4
    assert found['recurrence']['percent'] == 50
    assert 'since you named it on Oct 6' in found['recurrence']['line']


def test_a_pattern_with_no_fix_is_identified():
    found = read(pattern(), [check(3, 1)])
    assert found['status'] == 'identified'
    assert found['status_label'] == 'Identified'
    assert found['fix'] is None and found['effect'] is None


# ---- whether a fix worked ----------------------------------------------------------
def test_a_fix_that_cuts_it_down_is_working_and_improving():
    before = [check(days, 1) for days in range(40, 20, -2)]
    during = [check(days, 0, used=True) for days in range(18, 0, -2)] + [check(1, 1, used=True)]
    found = read(pattern(), before + during, [fix(19)])
    effect = found['effect']
    assert effect['before'] == {'hits': 10, 'of': 10, 'percent': 100}
    assert effect['during']['of'] == 10 and effect['during']['hits'] == 1
    assert effect['verdict'] == 'working'
    assert effect['headline'] == "It's working"
    assert effect['evidence']
    assert effect['used'] == {'done': 10, 'of': 10}
    assert found['status'] == 'improving'


def test_a_fix_with_too_few_sessions_says_how_many_more():
    found = read(pattern(), [check(30, 1), check(25, 1), check(1, 0)], [fix(2)])
    assert found['effect']['verdict'] == 'early'
    assert found['effect']['tip'] == '3 more checked sessions since the fix and it can start to say.'
    assert found['status'] == 'intervening'


def test_no_difference_is_said_plainly():
    before = [check(days, at % 2) for at, days in enumerate(range(40, 20, -2))]
    during = [check(days, at % 2) for at, days in enumerate(range(18, 0, -2))]
    found = read(pattern(), before + during, [fix(19)])
    assert found['effect']['verdict'] == 'no_change'
    assert found['status'] == 'intervening'


def test_a_clean_run_with_nothing_before_still_counts():
    found = read(pattern(identified_on=back(20).isoformat()), [check(days, 0) for days in range(10, 0, -2)], [fix(12)])
    assert found['effect']['verdict'] == 'clean'
    assert found['status'] == 'improving'


def test_sessions_with_the_fix_are_compared_with_the_ones_without():
    during = [check(days, 0, used=True) for days in range(1, 9)] + [check(days, 1, used=False) for days in range(9, 17)]
    found = read(pattern(), during, [fix(20)])
    assert found['effect']['split']['line'] == 'With the fix it came up in 0 of 8 sessions, without it in 8 of 8.'
    assert found['effect']['split']['helps'] is True


def test_resolving_is_offered_after_a_clean_run_on_a_fix_that_has_run_long_enough():
    checks = [check(days, 0, used=True) for days in range(1, behavior.CLEAN_RUN + 1)]
    assert read(pattern(), checks, [fix(behavior.RESOLVE_DAYS)])['ready_to_resolve'] is True
    assert read(pattern(), checks, [fix(behavior.RESOLVE_DAYS - 5)])['ready_to_resolve'] is False
    slipped = checks[:-1] + [check(0, 1, used=True)]
    assert read(pattern(), slipped, [fix(behavior.RESOLVE_DAYS)])['ready_to_resolve'] is False


def test_a_resolved_pattern_that_happens_again_shows_it_came_back():
    row = pattern(status='resolved', resolved_on=back(10).isoformat())
    assert read(row, [check(12, 1), check(5, 0)])['status'] == 'resolved'
    found = read(row, [check(12, 1), check(5, 1)])
    assert found['status'] == 'identified'
    assert found['returned_label'] == 'Nov 5'
    assert found['came_back'] == 1


# ---- what the record measures by itself -------------------------------------------
def test_a_struggle_reason_pattern_is_measured_from_the_rated_tasks():
    tasks = [task(day, execution=2, reason='distracted') for day in (3, 6, 9)]
    tasks += [task(day, execution=4) for day in (4, 5, 7)]
    tasks.append(task(8, title='Morning meditation', subject='meditation', execution=1, reason='distracted'))
    tasks.append(task(2, execution=None))
    found = read(pattern(source='reason', source_ref='distracted'), [], tasks=tasks)
    assert found['from_record'] is True
    assert found['frequency']['times'] == 3
    assert found['frequency']['checked'] == 6


def test_a_check_by_hand_beats_the_records_reading_of_the_same_task():
    tasks = [task(3, execution=2, reason='distracted')]
    found = read(pattern(source='reason', source_ref='distracted'), [check(3, 0, task_id=tasks[0]['id'])], tasks=tasks)
    assert found['frequency']['times'] == 0
    assert found['checks'] == 1


def test_easy_points_lost_are_measured_from_scores():
    tasks = [task(day, difficulty=2, score_got=8, score_of=10) for day in (2, 4)]
    tasks += [task(day, difficulty=2, score_got=10, score_of=10) for day in (3, 5)]
    tasks.append(task(6, difficulty=5, score_got=3, score_of=10))
    found = read(pattern(source='easy'), [], tasks=tasks)
    assert (found['frequency']['times'], found['frequency']['checked']) == (2, 4)


# ---- where it shows up -------------------------------------------------------------
def test_scope_decides_which_tasks_a_pattern_is_checked_against():
    tests = pattern(scope='tests')
    assert behavior.in_scope(tests, {'title': 'AMC 10 mock #3'})
    assert behavior.in_scope(tests, {'title': 'SAT practice test'})
    assert not behavior.in_scope(tests, {'title': 'Read Act 2 of Hamlet'})
    assert not behavior.in_scope(pattern(scope='subject', subject='physics'), {'title': 'Set', 'subject': 'mathematics'})
    worded = pattern(scope='words', words='violin,scales')
    assert behavior.in_scope(worded, {'title': 'Violin scales', 'subject': 'music'})
    assert not behavior.in_scope(pattern(), {'title': 'Evening meditation', 'subject': 'meditation'})


def test_when_it_shows_up_names_the_condition_the_evidence_supports():
    tasks, checks = [], []
    for day in range(1, 11):
        evening = task(day, hour=20)
        morning = task(day, hour=9)
        tasks += [evening, morning]
        checks += [check(day, 1, task_id=evening['id']), check(day, 0, task_id=morning['id'])]
    found = read(pattern(), checks, tasks=tasks)['when']
    assert found['found']['key'] == 'evening'
    assert found['found']['line'] == 'It came up in 10 of 10 evening and late sessions, and 0 of 10 earlier ones.'
    assert found['found']['suggests']


def test_when_it_shows_up_says_how_many_more_sessions_it_needs():
    found = read(pattern(), [check(2, 1, label='AMC mock')])['when']
    assert found['found'] is None
    assert found['need'] == 7


def test_low_energy_days_come_from_the_log_check_in():
    tasks, checks, entries = [], [], []
    for day in range(1, 11):
        one = task(day)
        tasks.append(one)
        low = day % 2 == 0
        checks.append(check(day, 1 if low else 0, task_id=one['id']))
        entries.append({'created_at': back(day).isoformat() + 'T08:00:00', 'mood': 4, 'energy': 1 if low else 3})
    found = read(pattern(), checks, tasks=tasks, entries=entries)['when']['found']
    assert found['key'] == 'low_energy'


# ---- the summary -------------------------------------------------------------------
def test_the_summary_counts_patterns_that_came_back_after_being_named():
    rows = [
        read(pattern(id='b1'), [check(3, 1)]),
        read(dict(pattern(id='b1'), title='Missing easy ones'), [check(3, 0)]),
        read(dict(pattern(id='b1', identified_on=back(2).isoformat()), title='New one'), [check(1, 1)]),
    ]
    found = behavior.summary(rows, TODAY)
    assert found['repeat'] == {'hits': 1, 'of': 2, 'percent': 50}
    assert found['headline'] == "Naming a mistake hasn't stopped it yet."
    assert '1 of the 2 patterns you named at least a week ago came back afterward.' in found['figures']
    assert found['suggests'].startswith("This suggests knowing isn't the hard part")


# ---- what Summit spots -------------------------------------------------------------
def test_suggestions_come_from_reasons_the_log_easy_work_and_long_sessions():
    tasks = [task(day, execution=2, reason='no-time') for day in (1, 2, 3, 4)]
    tasks += [task(day, difficulty=1, score_got=4, score_of=5) for day in (5, 6, 7, 8)]
    tasks += [task(day, execution=1, completion_seconds=100 * 60) for day in (9, 10, 11, 12)]
    insights = [{'id': 'i1', 'kind': 'pattern', 'status': 'active', 'text': 'Rushes the last problems on tests'},
                {'id': 'i2', 'kind': 'goal', 'status': 'active', 'text': 'Wants AIME 4'}]
    found = behavior.suggest(tasks, insights, [], TODAY)
    assert {(one['source'], one['source_ref']) for one in found} == {('log', 'i1'), ('reason', 'no-time'), ('easy', ''), ('length', '')}
    log = next(one for one in found if one['source'] == 'log')
    assert log['scope'] == 'tests'
    assert log['fixes'][0]['title'] == 'Answer-confidence checkpoint'
    reason = next(one for one in found if one['source'] == 'reason')
    assert reason['fixes'][0]['title'] == 'Book 50% more time'
    tracked = [{'source': 'reason', 'source_ref': 'no-time', 'status': 'open', 'title': 'Ran out of time'}]
    assert ('reason', 'no-time') not in {(one['source'], one['source_ref']) for one in behavior.suggest(tasks, insights, tracked, TODAY)}


def test_fixes_are_matched_by_the_words_in_a_pattern():
    assert behavior.fixes_for({'title': 'I overlook apparently easy problems'})[0]['title'] == 'Easy-problem recheck'
    assert behavior.fixes_for({'title': 'Impulsive decisions on exams'})[0]['title'] == 'Answer-confidence checkpoint'
    assert behavior.fixes_for({'title': 'Logging hours without focused work'})[0]['title'] == 'Goal-first focus blocks'
    assert behavior.fixes_for({'title': 'Something else entirely'})[-1]['title'] == 'If-then plan'


# ---- the endpoints -----------------------------------------------------------------
def _add(client, **fields):
    reply = client.post('/api/behavior/add', json={'title': 'Impulsive answers on tests', 'scope': 'tests', **fields}).json()
    assert reply['success'], reply
    return reply['id']


def test_naming_a_pattern_with_a_first_fix_and_reading_it_back(client):
    pid = _add(client, fix_title='Answer-confidence checkpoint', fix_how='Mark sure or unsure.')
    page = client.get('/api/behavior').json()
    assert page['success']
    one = page['behaviors'][0]
    assert one['id'] == pid and one['scope_label'] == 'Tests and contests'
    assert one['status'] == 'intervening'
    assert one['fix']['title'] == 'Answer-confidence checkpoint'
    assert page['summary']['named'] == 1
    assert [row['key'] for row in page['statuses']] == ['identified', 'intervening', 'improving', 'resolved']


def test_a_pattern_needs_words_and_a_valid_scope(client):
    assert not client.post('/api/behavior/add', json={'title': '  '}).json()['success']
    assert not client.post('/api/behavior/add', json={'title': 'X', 'scope': 'subject'}).json()['success']
    assert not client.post('/api/behavior/add', json={'title': 'X', 'scope': 'words', 'words': []}).json()['success']


def test_the_question_after_a_task_only_keeps_patterns_the_task_can_show(client):
    tests_id = _add(client)
    focus_id = _add(client, title='Drifting off', scope='study')
    mock = client.post('/api/tasks', json={'name': 'AMC 10 mock', 'priority': 'low', 'xp_reward': 20}).json()['task_id']
    reading = client.post('/api/tasks', json={'name': 'Read chapter 4', 'priority': 'low', 'xp_reward': 20}).json()['task_id']
    client.post('/api/complete_task', json={'task_id': mock})
    client.post('/api/complete_task', json={'task_id': reading})

    asked = client.get('/api/behavior/for_task?task_id={}'.format(mock)).json()['behaviors']
    assert {row['id'] for row in asked} == {tests_id, focus_id}
    assert {row['id'] for row in client.get('/api/behavior/for_task?task_id={}'.format(reading)).json()['behaviors']} == {focus_id}

    reply = client.post('/api/behavior/checks', json={'task_id': reading, 'checks': [
        {'behavior_id': tests_id, 'times': 2}, {'behavior_id': focus_id, 'times': 0}]}).json()
    assert len(reply['saved']) == 1
    # Answering again changes the answer rather than adding a second session.
    client.post('/api/behavior/checks', json={'task_id': reading, 'checks': [{'behavior_id': focus_id, 'times': 1}]})
    rows = [row for row in db.rows_for('behavior_checks', 'tester') if row['behavior_id'] == focus_id]
    assert len(rows) == 1 and rows[0]['times'] == 1


def test_a_slip_after_resolving_opens_it_again_and_counts_it(client):
    pid = _add(client)
    assert client.post('/api/behavior/status', json={'id': pid, 'status': 'resolved'}).json()['success']
    db.update_row('behaviors', pid, {'resolved_on': (date.today() - timedelta(days=3)).isoformat()}, user_id='tester')
    assert client.post('/api/behavior/check', json={'behavior_id': pid, 'times': 1, 'label': 'School quiz'}).json()['success']
    row = db.find_row('behaviors', pid, user_id='tester')
    assert row['status'] == 'open' and row['came_back'] == 1 and row.get('resolved_on') is None


def test_a_new_fix_replaces_the_running_one(client):
    pid = _add(client, fix_title='First idea')
    assert client.post('/api/behavior/fix', json={'id': pid, 'title': 'Second idea', 'how': 'Do it.'}).json()['success']
    fixes = sorted(db.rows_for('behavior_interventions', 'tester'), key=lambda one: one['created_at'] + one['id'])
    assert [one['outcome'] for one in fixes if one.get('ended_on')] == ['replaced']
    assert [one['title'] for one in fixes if not one.get('ended_on')] == ['Second idea']
    assert client.post('/api/behavior/fix/end', json={'id': pid, 'outcome': 'dropped'}).json()['success']
    assert not client.post('/api/behavior/fix/end', json={'id': pid, 'outcome': 'dropped'}).json()['success']


def test_logged_sessions_record_whether_the_fix_was_used_only_when_there_is_one(client):
    pid = _add(client)
    client.post('/api/behavior/check', json={'behavior_id': pid, 'times': 0, 'used': True})
    client.post('/api/behavior/fix', json={'id': pid, 'title': 'Checkpoint'})
    client.post('/api/behavior/check', json={'behavior_id': pid, 'times': 0, 'used': True})
    used = sorted((row.get('used') for row in db.rows_for('behavior_checks', 'tester')), key=lambda one: one is None)
    assert used == [1, None]


def test_deleting_a_pattern_takes_its_sessions_and_fixes(client):
    pid = _add(client, fix_title='Checkpoint')
    client.post('/api/behavior/check', json={'behavior_id': pid, 'times': 1})
    assert client.post('/api/behavior/delete', json={'id': pid}).json()['success']
    assert db.rows_for('behaviors', 'tester') == []
    assert db.rows_for('behavior_checks', 'tester') == []
    assert db.rows_for('behavior_interventions', 'tester') == []


def test_patterns_belong_to_their_account(client, stranger):
    pid = _add(client)
    assert stranger.get('/api/behavior').json()['behaviors'] == []
    assert not stranger.post('/api/behavior/check', json={'behavior_id': pid, 'times': 1}).json()['success']
    assert not stranger.post('/api/behavior/status', json={'id': pid, 'status': 'archived'}).json()['success']
    assert not stranger.post('/api/behavior/delete', json={'id': pid}).json()['success']


def test_tracking_a_suggestion_twice_is_refused(client):
    assert client.post('/api/behavior/add', json={'title': 'Ran out of time', 'source': 'reason', 'source_ref': 'no-time'}).json()['success']
    again = client.post('/api/behavior/add', json={'title': 'Ran out of time', 'source': 'reason', 'source_ref': 'no-time'}).json()
    assert not again['success']


def test_fixes_too_new_to_judge_are_neither_working_nor_failing():
    rows = [read(pattern(), [check(30, 1)], [fix(0)])]
    found = behavior.summary(rows, TODAY)
    assert found['fixes'] == {'working': 0, 'of': 0, 'waiting': 1}
    assert 'One fix is too new to judge.' in found['figures']
    assert 'working so far' not in found['figures']


def test_only_log_challenges_are_offered_as_patterns_to_stop():
    insights = [{'id': 'i1', 'kind': 'pattern', 'topic': 'preferences', 'status': 'active', 'text': 'Practices violin every day'},
                {'id': 'i2', 'kind': 'pattern', 'topic': 'challenges', 'status': 'active', 'text': 'Rushes the last problems'}]
    assert [one['source_ref'] for one in behavior.suggest([], insights, [], TODAY)] == ['i2']
