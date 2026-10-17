"""Smart session timing: best hours, spacing by subject, full days, the reason."""
from datetime import datetime, timedelta

from backend.database import connection as db
from backend.tracking import session_timing as timing

NOW = datetime(2026, 10, 17, 8, 0)  # a Saturday


def _history(hour_scores, days=60):
    """Finished calendar blocks at given hours, rated as given, every day."""
    tasks = []
    for back in range(1, days + 1):
        day = NOW - timedelta(days=back)
        for hour, execution in hour_scores.items():
            start = day.replace(hour=hour, minute=0)
            tasks.append({'status': 'done', 'show_on_calendar': True,
                          'created_at': start.isoformat(),
                          'due_date': (start + timedelta(hours=1)).isoformat(),
                          'completed_at': (start + timedelta(hours=1)).isoformat(),
                          'execution': execution, 'difficulty': 4})
    return tasks


def test_hard_work_lands_in_the_hours_it_goes_best():
    profile = timing.rhythm(_history({9: 2, 16: 5, 20: 3}), [], NOW)
    slot = timing.best_slot(60, 5, [], [], 'physics', profile, NOW)
    assert slot['start'].hour in (15, 16)
    assert 'out of 5' in slot['why']


def test_nothing_before_the_reader_ever_works():
    profile = timing.rhythm(_history({14: 4, 18: 4, 21: 4}), [], NOW)
    assert profile['window'][0] >= 14
    slot = timing.best_slot(30, 2, [], [], 'physics', profile, NOW)
    assert slot['start'].hour >= 14


def test_one_subject_never_gets_two_sessions_a_day_and_hard_ones_sit_apart():
    profile = timing.rhythm(_history({10: 4, 16: 4}), [], NOW)
    booked = []
    for _ in range(3):
        slot = timing.best_slot(60, 5, [], booked, 'physics', profile, NOW)
        booked.append({'start': slot['start'], 'end': slot['end'], 'subject': 'physics'})
    dates = sorted(one['start'].date() for one in booked)
    assert len(set(dates)) == 3
    assert all((b - a).days >= timing.GAP_DAYS[5] for a, b in zip(dates, dates[1:]))
    assert 'other session for this subject' in timing.best_slot(
        60, 5, [], booked, 'physics', profile, NOW)['why']


def test_another_subject_can_share_the_day():
    profile = timing.rhythm(_history({10: 4, 16: 4}), [], NOW)
    first = timing.best_slot(60, 3, [], [], 'physics', profile, NOW)
    booked = [{'start': first['start'], 'end': first['end'], 'subject': 'physics'}]
    other = timing.best_slot(60, 3, [], booked, 'piano', profile, NOW)
    assert other['start'].date() == first['start'].date()
    assert other['start'] >= first['end'] or other['end'] <= first['start']


def test_it_keeps_clear_of_busy_time_with_a_buffer():
    profile = timing.rhythm(_history({10: 5}), [], NOW)
    busy = [(NOW.replace(hour=9), NOW.replace(hour=12))]
    slot = timing.best_slot(45, 4, busy, [], 'physics', profile, NOW)
    clear = (slot['end'] + timing.BUFFER <= busy[0][0]
             or slot['start'] - timing.BUFFER >= busy[0][1])
    assert clear


def test_with_no_history_it_still_finds_a_time():
    profile = timing.rhythm([], [], NOW)
    slot = timing.best_slot(30, 3, [], [], '', profile, NOW)
    assert slot and slot['start'] > NOW and slot['why']


def _recommend(n, username='tester'):
    return db.insert_row('subject_recommendations', {
        'id': 'rtime{}{}'.format(n, datetime.now().timestamp()), 'user_id': username,
        'subject': 'Algebra', 'given_at': '2026-10-06T10:00:00',
        'title': 'Sprint #{}'.format(n), 'focus': '', 'kind': 'targeted_practice',
        'difficulty': 4, 'minutes': 45, 'reason': '', 'signal': ''})['id']


def test_planning_three_spreads_them_over_three_days(client):
    starts = []
    for n in range(3):
        body = client.post('/api/subject_recommendation/plan', json={'id': _recommend(n)}).json()
        assert body['success'], body
        assert body['task']['why']
        starts.append(datetime.fromisoformat(body['task']['start']))
    assert len({start.date() for start in starts}) == 3
