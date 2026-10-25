"""Growth, specifically: findings read off the record, and only real ones.

The rules are backend/tracking/growth_reads.py. These pin that each kind of
finding says the specific thing (the topic, the hour, the part of the day),
that small or even samples say nothing, and that life admin isn't growth.
"""
from datetime import date, datetime, timedelta

from backend.tracking import growth_reads

TODAY = date(2026, 10, 25)


def _task(day_back, hour, title, subject, execution=None, minutes=45, difficulty=3, reason=''):
    start = datetime.combine(TODAY - timedelta(days=day_back), datetime.min.time()) + timedelta(hours=hour)
    end = start + timedelta(minutes=minutes)
    return {'title': title, 'description': '', 'subject': subject, 'execution': execution,
            'difficulty': difficulty, 'created_at': start.isoformat(), 'completed_at': end.isoformat(),
            'completion_seconds': minutes * 60, 'show_on_calendar': True, 'reason': reason}


def _items(result):
    return {item['id']: item for group in result['groups'] for item in group['items']}


def test_a_topic_whose_ratings_climbed_is_named():
    tasks = [_task(60 - 4 * i, 16, 'AMC 10 recursive counting set', 'mathematics', 2 if i < 5 else 4)
             for i in range(10)]
    found = _items(growth_reads.reads(tasks, TODAY, 90))
    item = found['topic:competition-math:recursive-counting']
    assert item['title'] == 'You improved at recursive counting'
    assert item['detail'] == 'Rated 2.0 → 4.0 over your last 10 sessions (Competition Mathematics).'
    assert item['tone'] == 'good'


def test_a_topic_whose_ratings_fell_goes_under_watch_out():
    tasks = [_task(60 - 4 * i, 16, 'AIME geometry set', 'mathematics', 4 if i < 4 else 2) for i in range(8)]
    result = growth_reads.reads(tasks, TODAY, 90)
    watch = next(group for group in result['groups'] if group['id'] == 'watch')
    assert watch['items'][0]['title'] == 'Geometry is slipping'


def test_harder_work_with_ratings_held_counts_as_growth():
    tasks = [_task(60 - 4 * i, 17, 'USACO Gold DP problems', 'computer_science', 3, difficulty=3 if i < 4 else 5)
             for i in range(8)]
    item = _items(growth_reads.reads(tasks, TODAY, 90))['harder:competitive-programming:dynamic-programming']
    assert item['title'] == 'You took on harder dynamic programming'
    assert 'Difficulty 3.0 → 5.0' in item['detail']


def test_the_subject_that_owns_an_hour_is_your_favorite_thing_then():
    tasks = [_task(i, 16, 'Calculus problem set', 'mathematics', 4) for i in range(14)]
    tasks += [_task(i, 16, 'Violin practice', 'music', 4) for i in range(3)]
    item = _items(growth_reads.reads(tasks, TODAY, 90))['slot:16:mathematics']
    assert item['title'] == 'Mathematics is your favorite thing to do at 4 pm'
    assert item['detail'] == '82% of what you do between 4 pm and 6 pm is math.'


def test_the_part_of_the_day_a_subject_goes_best():
    tasks = [_task(i, 9, 'Calculus problem set', 'mathematics', 5) for i in range(12)]
    tasks += [_task(i, 22, 'Calculus problem set', 'mathematics', 3) for i in range(12)]
    item = _items(growth_reads.reads(tasks, TODAY, 90))['best-time:mathematics']
    assert item['title'] == 'Your math goes best before noon'
    assert item['detail'] == 'Rated 5.0 before noon, against 3.0 after 9 pm.'


def test_session_length_sweet_spot():
    tasks = [_task(i, 10, 'Proof practice', 'mathematics', 5, minutes=45) for i in range(10)]
    tasks += [_task(i, 14, 'Proof practice', 'mathematics', 3, minutes=120) for i in range(10)]
    item = _items(growth_reads.reads(tasks, TODAY, 90))['length:30-60 minute']
    assert item['title'] == 'Your best work comes in 30-60 minute sessions'
    assert item['detail'] == 'Rated 5.0 there, against 3.0 for sessions over 90 minutes.'


def test_when_the_usual_problem_shows_up():
    tasks = [_task(i, 22, 'Proof practice', 'mathematics', 2, reason='distracted') for i in range(6)]
    tasks += [_task(i, 10, 'Proof practice', 'mathematics', 2, reason='distracted') for i in range(2)]
    item = _items(growth_reads.reads(tasks, TODAY, 90))['reason:distracted']
    assert item['title'] == '"Got distracted" shows up most after 9 pm'
    assert item['detail'] == '6 of the 8 times you picked it.'


def test_small_or_even_samples_say_nothing():
    tasks = [_task(i * 9, 16, 'AMC 10 recursive counting set', 'mathematics', 2 + i % 2) for i in range(5)]
    tasks += [_task(i, 7 + 2 * (i % 7), 'Calculus problem set', 'mathematics', 4) for i in range(14)]
    found = _items(growth_reads.reads(tasks, TODAY, 90))
    assert not any(key.startswith('topic:') for key in found)
    assert not any(key.startswith('slot:') for key in found)


def test_life_admin_is_not_growth():
    tasks = [_task(60 - 4 * i, 18, 'Laundry', 'chores', 5 if i < 5 else 2) for i in range(10)]
    tasks += [_task(i, 22, 'Evening review', 'planning', 4) for i in range(20)]
    result = growth_reads.reads(tasks, TODAY, 90)
    assert result['groups'] == []


def test_the_endpoint_answers_and_never_writes(client):
    reply = client.get('/api/growth_reads?days=90').json()
    assert reply['success'] and reply['days'] == 90 and reply['groups'] == []
    assert client.get('/api/growth_reads?days=5').json()['days'] == 30
