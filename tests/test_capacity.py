"""Ambition, priority right now, and capacity, kept apart.

MathCounts Nationals can matter most and still not be today's first thing, because a
violin audition is on Thursday, and a Tuesday with school only holds so much. The rules
are backend/tracking/capacity.py and the commitment half of backend/tracking/priority.py.
"""
from datetime import date, datetime, timedelta

from backend.tracking import capacity, priority
from backend.tracking.next_actions import build_plan

NOW = datetime(2026, 11, 10, 15, 0)   # a Tuesday afternoon
TODAY = NOW.date()
_seq = [0]


def back(days):
    return TODAY - timedelta(days=days)


def ahead(days):
    return (TODAY + timedelta(days=days)).isoformat()


def task(days_ago, minutes=40, title='Practice set', subject='mathematics', status='done', **more):
    _seq[0] += 1
    day = back(days_ago).isoformat()
    row = {'id': 'k{}'.format(_seq[0]), 'title': title, 'status': status, 'subject': subject,
           'created_at': '{}T16:00:00'.format(day),
           'completed_at': '{}T16:{:02d}:00'.format(day, min(minutes, 59)) if status == 'done' else None,
           'completion_seconds': minutes * 60}
    row.update(more)
    return row


def goal(title, subject, deadline, priority_=5, **more):
    row = {'id': title.lower().replace(' ', '-'), 'title': title, 'status': 'active', 'measure': 'number',
           'subject_ids': subject, 'deadline': deadline, 'priority': priority_, 'current_value': 5,
           'target_number': 15, 'progress': 33, 'start_date': back(120).isoformat(), 'milestones': []}
    row.update(more)
    return row


def tuesdays(minutes_each, count=6):
    """A study task on each of the last `count` Tuesdays."""
    return [task(7 * week, minutes=m) for week, m in zip(range(1, count + 1), minutes_each)]


# ---- what you usually do ------------------------------------------------------------
def test_usual_is_the_median_of_the_days_you_worked_on_this_weekday():
    by_day = capacity.worked_by_day(tuesdays([30, 50, 40, 45, 55]), [], back(60), TODAY)
    found = capacity.usual(by_day, TODAY)
    assert found == {'minutes': 45, 'days': 5, 'of': 8, 'label': 'Tuesdays', 'weekday': True,
                     'evidence': found['evidence']}


def test_with_too_few_of_this_weekday_every_recent_day_stands_in():
    rows = [task(days, minutes=20) for days in (1, 2, 3, 4)]
    found = capacity.usual(capacity.worked_by_day(rows, [], back(60), TODAY), TODAY)
    assert found['minutes'] == 20 and found['label'] == 'days you work' and not found['weekday']


def test_with_nothing_timed_it_says_so():
    assert capacity.usual({}, TODAY)['minutes'] is None


def test_a_timer_and_the_task_it_was_on_are_never_counted_twice():
    rows = [task(7, minutes=40)]
    timers = [{'day': back(7).isoformat(), 'minutes': 50}]
    assert capacity.worked_by_day(rows, timers, back(30), TODAY)[back(7)] == 50


def test_lead_time_is_not_time_spent():
    """`completion_seconds` is how long a task sat on the list; two days isn't a session."""
    rows = [task(7, minutes=40, completion_seconds=2 * 86400)]
    assert capacity.worked_by_day(rows, [], back(30), TODAY) == {}


# ---- today's calendar ---------------------------------------------------------------
def test_free_time_is_what_events_leave_between_now_and_the_end_of_the_day():
    practice = (NOW.replace(hour=17, minute=0), NOW.replace(hour=19, minute=0))
    found = capacity.free_minutes([practice], NOW)
    assert found == {'busy': 120.0, 'free': 300.0}


def test_after_the_end_of_the_day_nothing_is_free():
    assert capacity.free_minutes([], NOW.replace(hour=23))['free'] == 0


def test_what_fits_is_the_smaller_of_usual_and_free_less_what_is_done():
    rows = tuesdays([90, 90, 90, 90]) + [task(0, minutes=30)]
    busy = [(NOW.replace(hour=15, minute=30), NOW.replace(hour=22))]
    found = capacity.read(rows, [], busy, NOW)
    assert found['usual'] == 90 and found['done'] == 30
    assert found['free'] == 30
    assert found['left'] == 30
    found = capacity.read(rows, [], [], NOW)
    assert found['left'] == 60
    assert 'On Tuesdays you usually work about 1h 30m (4 of the last 8).' in found['line']


def test_when_today_asks_for_more_than_fits_it_names_what_to_move_and_keeps_goal_work():
    rows = tuesdays([60, 60, 60, 60])
    rows.append(task(0, title='Essay draft', status='todo', show_on_calendar=True,
                     created_at=NOW.replace(hour=16).isoformat(), due_date=NOW.replace(hour=17, minute=30).isoformat()))
    rows.append(task(0, title='Lab report', status='todo', due_date=NOW.replace(hour=23).isoformat()))
    rows.append(task(0, title='Nationals sprint', status='todo', due_date=NOW.replace(hour=23).isoformat(), goal_id='nat'))
    found = capacity.read(rows, [], [], NOW)
    assert found['booked'] > found['left'] and found['over'] > 0
    moved = capacity.with_moves(found, keep=['nat'])['move']
    assert moved and all(one['goal_id'] != 'nat' for one in moved)


def test_the_plan_length_is_what_fits_in_fives():
    assert capacity.budget_for({'usual': 90, 'free': 300, 'left': 83}, 45) == 85
    assert capacity.budget_for({'usual': 90, 'free': 300, 'left': 3}, 45) == 15
    assert capacity.budget_for({'usual': None, 'free': 0, 'left': 0}, 45) == 45


# ---- commitments --------------------------------------------------------------------
def calendar(**days):
    """{days_ahead: [names]} as the calendar store keeps them."""
    out = {}
    for key, names in days.items():
        day = TODAY + timedelta(days=int(key[1:]))
        out['{}-{}-{}'.format(day.year, day.month, day.day)] = {'timestamps': [
            {'task': name, 'startTime': '10:00', 'endTime': '11:00'} for name in names]}
    return out


def test_commitments_are_events_to_prepare_for_and_real_deadlines():
    rows = [task(0, title='Essay on Hamlet', status='todo', due_date=ahead(1)),
            task(0, title='Math homework 4.2', status='todo', due_date=ahead(1)),
            task(0, title='Read chapter 5', status='todo', due_date=ahead(1), priority='high'),
            task(0, title='AMC prep set', status='todo', due_date=ahead(1), goal_id='amc'),
            task(0, title='Lab report', status='todo', due_date=ahead(6))]
    found = capacity.commitments(calendar(d2=['Violin audition', 'Dinner with Sam'], d20=['Final exam']), rows, NOW)
    assert [(one['title'], one['days_left']) for one in found] == [
        ('Essay on Hamlet', 1), ('Read chapter 5', 1), ('Violin audition', 2)]


def test_a_commitment_no_goal_covers_comes_first_without_changing_what_matters_most():
    nationals = goal('MathCounts Nationals', 'mathematics', ahead(200), priority_=10)
    rows = [task(day, title='Nationals sprint round', subject='mathematics') for day in range(1, 40, 3)]
    audition = capacity.commitments(calendar(d2=['Violin audition']), [], NOW)
    decision = priority.decide([nationals], rows, NOW, 90, commitments=audition)
    assert decision['lead']['title'] == 'Violin audition'
    assert decision['allocation'][0]['kind'] == 'commitment'
    assert decision['allocation'][0]['minutes'] == 45
    assert decision['allocation'][1]['title'] == 'MathCounts Nationals'
    assert decision['headline'] == 'Violin audition is in 2 days, so it comes first today. MathCounts Nationals gets the rest.'
    answers = {row['key']: row['answer'] for row in decision['answers']}
    assert answers['matters'].startswith('MathCounts Nationals: ambition 10 of 10.')
    assert "It isn't first today, because Violin audition is in 2 days, but it still gets time." in answers['matters']
    assert answers['urgent'].startswith('Violin audition: in 2 days.')
    assert decision['ambition_top']['title'] == 'MathCounts Nationals'
    row = decision['goals'][0]
    assert (row['ambition'], row['ambition_label'], row['now']) == (10, 'High', 'Today')


def test_with_no_room_left_the_goal_that_matters_most_is_told_when_it_comes_back():
    nationals = goal('MathCounts Nationals', 'mathematics', ahead(200), priority_=10)
    audition = capacity.commitments(calendar(d1=['Violin audition']), [], NOW)
    decision = priority.decide([nationals], [], NOW, 45, commitments=audition)
    assert [row['kind'] for row in decision['allocation']] == ['commitment']
    assert decision['headline'].endswith('MathCounts Nationals gets time again after Nov 11.')
    left = {row['title']: row['why'] for row in decision['not_now']}
    assert left['MathCounts Nationals'].startswith('It still matters most to you, but Violin audition is tomorrow.')
    assert decision['goals'][0]['now'] == 'Waits'


def test_a_commitment_about_a_goal_makes_that_goal_the_one_that_needs_you():
    nationals = goal('MathCounts Nationals', 'mathematics', ahead(200), priority_=10)
    violin = goal('Pass violin grade 6', 'music', ahead(150), priority_=6)
    audition = capacity.commitments(calendar(d2=['Violin audition']), [], NOW)
    decision = priority.decide([nationals, violin], [], NOW, 60, commitments=audition)
    assert decision['lead'] is None
    assert decision['focus']['title'] == 'Pass violin grade 6'
    assert decision['mode'] == 'crunch'
    assert decision['headline'] == 'Pass violin grade 6 gets your time. Violin audition is in 2 days.'
    assert decision['commitments'][0]['goal'] == 'Pass violin grade 6'
    matters = next(row['answer'] for row in decision['answers'] if row['key'] == 'matters')
    assert matters.startswith('MathCounts Nationals: ambition 10 of 10. It isn\'t first today, because Violin audition is in 2 days.')


def test_a_nearer_pressing_goal_still_beats_an_unrelated_commitment():
    contest = goal('AMC 10 cutoff', 'mathematics', ahead(1), priority_=8)
    audition = capacity.commitments(calendar(d3=['Violin audition']), [], NOW)
    decision = priority.decide([contest], [], NOW, 60, commitments=audition)
    assert decision['lead'] is None
    assert 'Also coming up: Violin audition in 3 days.' in next(
        row['answer'] for row in decision['answers'] if row['key'] == 'urgent')


def test_the_plan_leads_with_the_commitment_and_doesnt_list_its_task_twice():
    nationals = goal('MathCounts Nationals', 'mathematics', ahead(200), priority_=10)
    essay = task(0, title='Essay on Hamlet', status='todo', due_date=ahead(1), subject='english')
    found = capacity.commitments({}, [essay], NOW)
    decision = priority.decide([nationals], [essay], NOW, 60, commitments=found)
    plan = build_plan([essay], [nationals], [], lambda key: key, 60, now=NOW, stamp='x', decision=decision)
    first = plan['actions'][0]
    assert first['kind'] == 'commitment' and first['title'] == 'Finish "Essay on Hamlet"'
    assert first['because'] == "It's due tomorrow, so it comes before goal work today."
    assert [row for row in plan['actions'] + plan['more'] if row.get('taskId') == essay['id']] == [first]


def test_capacity_is_answered_when_the_plan_knows_it():
    nationals = goal('MathCounts Nationals', 'mathematics', ahead(200), priority_=10)
    fits = capacity.read(tuesdays([60, 60, 60, 60]), [], [], NOW)
    fits['auto'] = True
    decision = priority.decide([nationals], [], NOW, capacity.budget_for(fits, 45), capacity=fits)
    answer = next(row['answer'] for row in decision['answers'] if row['key'] == 'capacity')
    assert answer.startswith('On Tuesdays you usually work about 1h (4 of the last 8).')
    assert "So today's plan is 1h." in answer
    assert decision['capacity']['move'] == []


def test_the_plan_endpoint_picks_its_own_length_and_says_so(client):
    reply = client.get('/api/next_actions').json()
    assert reply['success']
    assert reply['plan']['auto_budget'] is True
    assert reply['plan']['priority']['capacity'] is not None or reply['plan']['priority'].get('mode') == 'none'
    picked = client.get('/api/next_actions?budget=90').json()['plan']
    assert picked['budget'] == 90 and picked['auto_budget'] is False
