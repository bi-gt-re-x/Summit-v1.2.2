"""The goal forecast: when a dated goal finishes at the current pace.

The pace math is backend/tracking/forecast.py; the endpoints are
backend/api/forecast.py.
"""
from datetime import date, datetime, timedelta

from backend.database import connection as db
from backend.tracking import forecast as fc

#: A Monday, so "this week" is the whole week.
TODAY = date(2026, 10, 19)


def ago(days):
    return (TODAY - timedelta(days=days)).isoformat() + 'T18:00:00'


def a_goal(ticked=4, steps=10, due_in=60, started=28, **over):
    goal = {'id': 'g1', 'title': 'AIME', 'status': 'active', 'measure': 'milestones',
            'deadline': (TODAY + timedelta(days=due_in)).isoformat(),
            'start_date': (TODAY - timedelta(days=started)).isoformat(),
            'subject_ids': 'maths',
            'milestones': [{'id': 'm1', 'status': 'active', 'position': 0, 'steps': [
                {'id': 's{}'.format(n), 'title': 'Step {}'.format(n), 'done': n < ticked}
                for n in range(steps)]}]}
    goal.update(over)
    return goal


def sessions(days_ago, subject='maths'):
    return [{'id': 't{}'.format(n), 'title': 'Set', 'status': 'done', 'subject': subject,
             'completed_at': ago(day)} for n, day in enumerate(days_ago)]


#: Two a week over the last four weeks, all since the goal started.
TWO_A_WEEK = sessions([1, 4, 8, 11, 15, 18, 22, 27])


# ---- The pace --------------------------------------------------------------
def test_on_track():
    # 8 sessions moved it 4 steps: 2 a step. 6 left is 12 sessions, 6 weeks at 2 a week.
    found = fc.forecast(a_goal(due_in=60), TWO_A_WEEK, [], TODAY)
    assert found['state'] == 'on_track'
    assert found['per_week'] == 2.0
    assert found['finish'] == (TODAY + timedelta(days=42)).isoformat()
    assert found['line'] == "Due Dec 18. At this pace you finish Nov 30. You're on track."
    assert found['facts'] == '4 of 10 steps done. About 2 sessions a week lately.'
    assert found['to_book'] == 0


def test_behind_says_how_many_more_a_week():
    # 12 sessions in 30 days is 2.8 a week; at 2 a week that's 1 more.
    found = fc.forecast(a_goal(due_in=30), TWO_A_WEEK, [], TODAY)
    assert found['state'] == 'behind'
    assert found['more_per_week'] == 1
    assert found['need_per_week'] == 2.8
    assert found['line'] == 'Due Nov 18. At this pace you finish Nov 30. 1 more session a week gets you there.'
    # The week asks for 3 and nothing's done or booked yet.
    assert found['to_book'] == 3


def test_behind_counts_what_is_already_booked():
    booked = [{'id': 'b1', 'status': 'pending', 'subject': 'maths',
               'due_date': (TODAY + timedelta(days=2)).isoformat() + 'T17:00:00'}]
    found = fc.forecast(a_goal(due_in=30), TWO_A_WEEK + booked, [], TODAY)
    assert found['booked_this_week'] == 1
    assert found['to_book'] == 2


def test_much_further_behind_says_more_sessions():
    found = fc.forecast(a_goal(due_in=14), TWO_A_WEEK, [], TODAY)
    # 12 sessions in two weeks is 6 a week, 4 more than now.
    assert found['state'] == 'behind'
    assert found['more_per_week'] == 4
    assert '4 more sessions a week gets you there.' in found['line']


def test_out_of_reach_says_move_the_date():
    found = fc.forecast(a_goal(due_in=3), TWO_A_WEEK, [], TODAY)
    assert found['state'] == 'behind'
    assert found['line'].endswith("Even two a day won't get you there. Think about moving the date.")
    assert found['to_book'] == 0


def test_no_sessions_lately_is_stalled():
    old = sessions([30, 33, 36, 40, 43, 47, 50, 54])
    found = fc.forecast(a_goal(due_in=60, started=60), old, [], TODAY)
    assert found['state'] == 'stalled'
    assert found['per_week'] == 0
    assert found['line'] == "Due Dec 18. You haven't done a session on it in 4 weeks. 2 sessions a week gets you there."


def test_a_focus_timer_on_a_linked_task_is_a_session():
    open_task = [{'id': 'open', 'status': 'pending', 'subject': 'maths'}]
    sittings = [{'id': 'f1', 'day': ago(2)[:10], 'minutes': 25, 'task_id': 'open'},
                # Too short to count.
                {'id': 'f2', 'day': ago(3)[:10], 'minutes': 4, 'task_id': 'open'},
                # The same day its task was finished: already one session.
                {'id': 'f3', 'day': ago(1)[:10], 'minutes': 30, 'task_id': 't0'}]
    days, _ = fc.session_days(a_goal(), TWO_A_WEEK + open_task, sittings)
    assert len(days) == 9


def test_a_number_goal_counts_its_progress():
    goal = a_goal(measure='number', target_number=5000, progress=40, milestones=[])
    found = fc.forecast(goal, TWO_A_WEEK, [], TODAY)
    assert found['unit'] == 'percent'
    assert found['facts'].startswith("You're 40% of the way.")
    # 8 sessions for 40%: 12 more for the last 60%, same as the steps case.
    assert found['state'] == 'on_track'


# ---- When it won't guess ---------------------------------------------------
def test_too_little_history_says_what_is_missing():
    found = fc.forecast(a_goal(), sessions([1, 3, 6, 9]), [], TODAY)
    assert found['state'] == 'missing'
    assert found['missing'] == 'too_new'
    assert found['finish'] is None
    assert found['line'] == 'Due Dec 18. We need two weeks of sessions on maths to tell your pace. You have 10 days so far.'


def test_no_history_at_all():
    found = fc.forecast(a_goal(), [], [], TODAY, name_of=lambda key: 'Math')
    assert (found['state'], found['missing']) == ('missing', 'too_new')
    assert 'No sessions on Math yet.' in found['line']


def test_no_linked_subject():
    found = fc.forecast(a_goal(subject_ids=''), sessions([1, 5, 9, 20]), [], TODAY)
    assert (found['state'], found['missing']) == ('missing', 'no_subject')
    assert found['line'] == 'Due Dec 18. Link a subject to it and we can track your pace.'


def test_a_task_linked_to_the_goal_stands_in_for_a_subject():
    linked = [dict(task, subject=None, goal_id='g1') for task in TWO_A_WEEK]
    found = fc.forecast(a_goal(subject_ids=''), linked, [], TODAY)
    assert found['state'] == 'on_track'


def test_nothing_ticked_yet():
    found = fc.forecast(a_goal(ticked=0), TWO_A_WEEK, [], TODAY)
    assert (found['state'], found['missing']) == ('missing', 'nothing_done')


def test_no_steps_to_count():
    found = fc.forecast(a_goal(milestones=[]), TWO_A_WEEK, [], TODAY)
    assert (found['state'], found['missing']) == ('missing', 'no_steps')


def test_goal_already_done():
    found = fc.forecast(a_goal(ticked=10), TWO_A_WEEK, [], TODAY)
    assert found['state'] == 'done'
    assert found['line'] == "Due Dec 18. Every step's ticked off. Mark it done on Goals."
    assert found['to_book'] == 0


def test_a_finished_checkpoint_counts_all_its_steps():
    goal = a_goal(ticked=0)
    goal['milestones'][0]['status'] = 'done'
    assert fc.units(goal) == (10.0, 10.0, 'steps')


def test_which_goals_get_one():
    goals = [a_goal(id='later', due_in=90), a_goal(id='sooner', due_in=20),
             a_goal(id='undated', deadline=None), a_goal(id='past', due_in=-1),
             a_goal(id='closed', status='completed'), a_goal(id='xp', measure='xp')]
    assert [row['goal_id'] for row in fc.forecasts(goals, TWO_A_WEEK, [], TODAY)] == ['sooner', 'later']


def test_a_date_next_year_names_the_year():
    assert fc.say_day(date(2027, 2, 5), TODAY) == 'Feb 5, 2027'
    assert fc.say_day(date(2026, 11, 5), TODAY) == 'Nov 5'


# ---- The endpoints -----------------------------------------------------------
def _seed_goal(behind=True):
    today = date.today()
    db.insert_row('goals', {
        'id': 'g-aime', 'user_id': 'tester', 'title': 'AIME', 'status': 'active',
        'measure': 'milestones', 'goal_type': 'xp', 'subject_ids': 'mathematics',
        'deadline': (today + timedelta(days=21 if behind else 200)).isoformat(),
        'start_date': (today - timedelta(days=28)).isoformat(),
        'created_at': (today - timedelta(days=28)).isoformat()})
    db.insert_row('goal_milestones', {
        'id': 'm-aime', 'user_id': 'tester', 'goal_id': 'g-aime', 'title': 'Algebra', 'position': 0,
        'status': 'active', 'steps': '[' + ','.join(
            '{{"id":"s{0}","title":"Part {0}","done":{1}}}'.format(n, 'true' if n < 2 else 'false')
            for n in range(10)) + ']'})
    for n, day in enumerate((1, 6, 10, 15, 20, 25)):
        stamp = (datetime.now() - timedelta(days=day)).isoformat(timespec='seconds')
        db.insert_row('tasks', {'id': 'done{}'.format(n), 'user_id': 'tester', 'title': 'Set',
                                'status': 'done', 'subject': 'mathematics', 'completed_at': stamp,
                                'created_at': stamp, 'xp_value': 20, 'priority': 'low'})


def test_get_reads_the_forecast(client):
    _seed_goal()
    reply = client.get('/api/goal_forecast').json()
    assert reply['success']
    [row] = reply['goals']
    assert row['goal_id'] == 'g-aime'
    assert row['state'] == 'behind'
    assert 'more sessions a week gets you there.' in row['line']


def test_book_puts_the_missing_sessions_on_the_calendar(client):
    _seed_goal()
    before = client.get('/api/goal_forecast').json()['goals'][0]
    assert before['to_book'] > 0
    reply = client.post('/api/goal_forecast/book', json={'goal_id': 'g-aime'}).json()
    assert reply['success'], reply
    assert len(reply['booked']) >= 1
    made = db.find_row('tasks', reply['booked'][0]['task_id'], user_id='tester')
    assert made['goal_id'] == 'g-aime' and made['subject'] == 'mathematics'
    after = client.get('/api/goal_forecast').json()['goals'][0]
    assert after['booked_this_week'] == len(reply['booked'])


def test_book_refuses_a_goal_on_track(client):
    _seed_goal(behind=False)
    reply = client.post('/api/goal_forecast/book', json={'goal_id': 'g-aime'}).json()
    assert not reply['success']
    assert reply['message'] == 'This week already has the sessions this goal needs.'
