"""Experiments: test a change on your own work, and get a straight answer.

The rules are backend/tracking/experiments.py. These pin the verdicts (worked, no
difference, too early, made it worse), the two designs, the proposals that come from
a record, and the endpoints that start, stop, extend and decide a test.
"""
from datetime import date, datetime, timedelta

from backend.database import connection as db
from backend.tracking import experiments, priority

TODAY = date(2026, 11, 4)
NOW = datetime(2026, 11, 4, 10, 0)
_seq = [0]


def back(days):
    return (TODAY - timedelta(days=days)).isoformat()


def task(days_ago, hour=19, execution=4, difficulty=3, minutes=40, title='Practice set', subject='mathematics', **more):
    _seq[0] += 1
    row = {'id': 't{}'.format(_seq[0]), 'title': title, 'status': 'done', 'subject': subject,
           'completed_at': '{}T{:02d}:30:00'.format(back(days_ago), hour), 'execution': execution,
           'difficulty': difficulty, 'completion_seconds': minutes * 60}
    row.update(more)
    return row


def trial(kind, started=13, length=14, **more):
    start = TODAY - timedelta(days=started)
    row = {'id': 'x1', 'kind': kind, 'params': {}, 'goal_id': '', 'subject': '', 'title': 'A test',
           'status': 'running', 'started_on': start.isoformat(),
           'ends_on': (start + timedelta(days=length - 1)).isoformat()}
    row.update(more)
    return row


# ---- judging -------------------------------------------------------------------
def test_a_split_test_compares_the_new_way_with_the_rest():
    tasks = [task(day, hour=8, execution=5) for day in range(8, 20)]
    tasks += [task(day, hour=20, execution=2) for day in range(8, 20)]
    found = experiments.evaluate(trial('time_of_day', started=20, params={'part': 'Morning'}), tasks, [], TODAY)
    assert found['phase'] == 'ready'
    assert found['verdict'] == 'better'
    assert found['headline'] == 'It worked'
    assert found['compared_with'] == 'Other sessions'
    assert found['adherence'] == {'done': 12, 'of': 24}
    assert [row['label'] for row in found['chart']['rows']] == ['Other sessions', 'The new way']


def test_all_sessions_the_new_way_falls_back_to_the_days_before():
    tasks = [task(day, hour=8, execution=5) for day in range(1, 14)]
    tasks += [task(day, hour=20, execution=2) for day in range(15, 28)]
    found = experiments.evaluate(trial('time_of_day', started=14, params={'part': 'Morning'}), tasks, [], TODAY)
    assert found['compared_with'] == 'The 14 days before'
    assert found['verdict'] == 'better'


def test_no_real_difference_is_said_plainly():
    tasks = [task(day, hour=8 if day % 2 else 20, execution=3 + day % 2) for day in range(1, 30)]
    tasks += [task(day, hour=20 if day % 2 else 8, execution=3 + day % 2) for day in range(1, 30)]
    found = experiments.evaluate(trial('time_of_day', started=20, params={'part': 'Morning'}), tasks, [], TODAY)
    assert found['verdict'] == 'same'
    assert found['headline'] == 'No real difference'


def test_a_running_test_with_too_little_says_how_many_more():
    tasks = [task(1, hour=8, execution=5), task(2, hour=8, execution=5)]
    found = experiments.evaluate(trial('time_of_day', started=2, params={'part': 'Morning'}), tasks, [], TODAY)
    assert found['phase'] == 'running'
    assert found['verdict'] == 'early'
    assert found['tip'] == '2 more sessions and it can start to say.'
    assert found['days_done'] == 3


def test_a_change_for_the_worse_is_called_that():
    tasks = [task(day, execution=4) for day in range(15, 29)] + [task(day, execution=2) for day in range(1, 14)]
    found = experiments.evaluate(trial('custom', started=14, params={'measure': 'rating'}), tasks, [], TODAY)
    assert found['verdict'] == 'worse'
    assert found['tone'] == 'bad'


def test_days_with_work_is_compared_as_a_share_of_days():
    tasks = [task(day) for day in range(1, 14)] + [task(day) for day in range(16, 28, 4)]
    found = experiments.evaluate(trial('daily', started=14), tasks, [], TODAY)
    rows = found['chart']['rows']
    assert rows[0]['text'] == '3/14' and rows[1]['text'] == '13/14'
    assert found['verdict'] in ('better', 'leaning_better')


def test_a_reason_that_barely_comes_up_is_too_rare_to_tell():
    tasks = [task(day, execution=2, reason='distracted') for day in (20, 22)] + [task(day) for day in range(1, 28)]
    found = experiments.evaluate(trial('reason', started=14, params={'reason': 'distracted'}), tasks, [], TODAY)
    assert found['headline'] == 'Too rare to tell'


def test_a_reason_that_stops_coming_up_worked():
    tasks = [task(day, execution=2, reason='distracted') for day in range(15, 28)]
    tasks += [task(day, execution=4) for day in range(1, 14)]
    found = experiments.evaluate(trial('reason', started=14, params={'reason': 'distracted'}), tasks, [], TODAY)
    assert found['verdict'] == 'better'
    assert found['measure'] == 'How often "Could not focus" comes up'


def test_routines_and_other_subjects_stay_out_of_a_scoped_test():
    tasks = [task(day, subject='music', execution=5, hour=8) for day in range(1, 10)]
    tasks += [task(day, title='Meditation', subject='meditation', execution=5, hour=8) for day in range(1, 10)]
    found = experiments.evaluate(trial('time_of_day', subject='mathematics', params={'part': 'Morning'}), tasks, [], TODAY)
    assert found['sessions'] == 0


def test_a_decided_test_shows_what_it_showed_then():
    row = trial('custom', started=30, status='done', verdict='better', kept=1,
                   result={'headline': 'It worked', 'chart': {'type': 'compare', 'max': 5, 'unit': '/ 5', 'rows': []},
                           'adherence': None, 'evidence': 'Emerging pattern', 'compared_with': 'x', 'sessions': 9})
    found = experiments.describe(row, [], [], TODAY)
    assert (found['phase'], found['verdict'], found['kept'], found['sessions']) == ('decided', 'better', True, 9)


# ---- proposals ----------------------------------------------------------------------
def decision(goals=(), tasks=()):
    return priority.decide(list(goals), list(tasks), NOW, 60)


def test_proposes_moving_work_to_the_part_of_the_day_it_goes_best():
    tasks = [task(day, hour=8, execution=5) for day in range(1, 8)]
    tasks += [task(day, hour=20, execution=3) for day in range(1, 30)]
    found = experiments.propose(tasks, [], decision(), TODAY)
    first = found[0]
    assert first['kind'] == 'time_of_day' and first['params'] == {'part': 'Morning'}
    assert first['title'] == 'Do study sessions in the morning'
    assert first['why'] == 'Morning sessions rate 5.0. Evening ones, where most of yours are, rate 3.0.'


def test_proposes_a_fix_for_what_goes_wrong_most():
    tasks = [task(day, execution=2, reason='interrupted') for day in range(1, 7)] + [task(day) for day in range(1, 20)]
    found = experiments.propose(tasks, [], decision(), TODAY)
    reason = next(one for one in found if one['kind'] == 'reason')
    assert reason['title'] == 'No interruptions'
    assert reason['why'] == '"Kept getting interrupted" came up 6 times in the last 90 days.'


def test_proposes_shorter_sessions_when_long_ones_go_worse():
    tasks = [task(day, minutes=120, execution=2) for day in range(1, 10)]
    tasks += [task(day, minutes=40, execution=4) for day in range(1, 10)]
    kinds = [one['kind'] for one in experiments.propose(tasks, [], decision(), TODAY)]
    assert 'shorter' in kinds


def test_proposes_nothing_already_running():
    tasks = [task(day, hour=8, execution=5) for day in range(1, 8)] + [task(day, hour=20, execution=3) for day in range(1, 30)]
    running = [trial('time_of_day', params={'part': 'Morning'})]
    assert all(one['kind'] != 'time_of_day' for one in experiments.propose(tasks, [], decision(), TODAY, running))


def test_proposes_nothing_from_an_empty_record():
    assert experiments.propose([], [], decision(), TODAY) == []


def test_validates_what_it_can_run():
    assert experiments.validate('time_of_day', {'part': 'Morning'}) is None
    assert experiments.validate('time_of_day', {'part': 'Noon'})
    assert experiments.validate('reason', {'reason': 'nope'})
    assert experiments.validate('shorter', {'minutes': 5})
    assert experiments.validate('teleport', {})


# ---- the endpoints --------------------------------------------------------------------
def start(client, **more):
    body = {'kind': 'time_of_day', 'params': {'part': 'Morning'}, 'title': 'Mornings', 'days': 14}
    body.update(more)
    return client.post('/api/experiments', json=body).json()


def test_starting_a_test_puts_it_on_the_review(client):
    reply = start(client)
    assert reply['success'], reply
    review = client.get('/api/weekly_review').json()
    assert [one['title'] for one in review['running']] == ['Mornings']
    assert review['running'][0]['days_total'] == 14


def test_the_same_test_twice_is_refused(client):
    assert start(client)['success']
    assert start(client)['message'] == "You're already testing that."


def test_three_tests_is_the_most(client):
    assert start(client)['success']
    assert start(client, kind='shorter', params={'minutes': 45}, title='Short')['success']
    assert start(client, kind='custom', params={'measure': 'days'}, title='Own')['success']
    assert start(client, kind='daily', params={}, title='Daily')['message'].startswith('Three tests at once')


def test_a_test_needs_a_name_and_a_sensible_length(client):
    assert not start(client, title='  ')['success']
    assert not start(client, days=5)['success']


def test_stop_and_extend(client):
    test_id = start(client)['id']
    extended = client.post('/api/experiments/{}/extend'.format(test_id)).json()
    assert extended['success']
    assert client.post('/api/experiments/{}/stop'.format(test_id)).json()['success']
    review = client.get('/api/weekly_review').json()
    assert review['running'] == []
    assert review['past'][0]['phase'] == 'stopped'


def test_deciding_waits_until_it_is_done_then_keeps_the_answer(client):
    test_id = start(client)['id']
    early = client.post('/api/experiments/{}/decide'.format(test_id), json={'keep': True}).json()
    assert not early['success']
    db.update_row('experiments', test_id, {'started_on': back(20), 'ends_on': back(7)}, user_id='tester')
    ready = client.get('/api/weekly_review').json()['ready']
    assert [one['id'] for one in ready] == [test_id]
    decided = client.post('/api/experiments/{}/decide'.format(test_id), json={'keep': False}).json()
    assert decided['success']
    past = client.get('/api/weekly_review').json()['past'][0]
    assert (past['phase'], past['kept']) == ('decided', False)


def test_one_account_cannot_touch_anothers_test(client, stranger):
    test_id = start(client)['id']
    assert not stranger.post('/api/experiments/{}/stop'.format(test_id)).json()['success']
    assert client.get('/api/weekly_review').json()['running'][0]['id'] == test_id


def test_a_finished_test_raises_one_notification(client):
    from backend.tracking import notify
    test_id = start(client)['id']
    db.update_row('experiments', test_id, {'started_on': back(20), 'ends_on': back(7)}, user_id='tester')
    found = notify._experiment_candidates('tester', TODAY)
    assert [one['fingerprint'] for one in found] == ['experiment-done:{}'.format(test_id)]
    assert found[0]['link'] == '/analytics/review'
