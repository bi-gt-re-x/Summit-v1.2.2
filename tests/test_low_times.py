"""When energy and output dropped — `low_times` in backend/tracking/mood.py."""
from datetime import date, timedelta

from backend.tracking import mood

TODAY = date(2026, 11, 1)  # a Sunday


def _ago(days):
    return (TODAY - timedelta(days=days)).isoformat()


def _task(days, hour=10, **extra):
    return {'status': 'done', 'title': 'Proof set', 'completed_at': '{}T{:02d}:00:00'.format(_ago(days), hour),
            'xp_value': 10, **extra}


def _low(entries=(), tasks=()):
    return mood.readings(list(entries), list(tasks), {}, TODAY)['low_times']


class TestLowEnergy:
    def test_a_drained_tap_is_recorded_with_its_time(self):
        low = _low([{'title': '', 'body': '', 'energy': 1, 'created_at': _ago(1) + 'T21:15:00',
                     'updated_at': _ago(1) + 'T21:15:00'}])
        mark = low['energy']['latest'][0]
        assert low['energy']['count'] == 1
        assert (mark['day'], mark['time'], mark['label']) == (_ago(1), '21:15', 'Drained')

    def test_a_tap_with_no_writing_is_timed_when_it_was_tapped(self):
        low = _low([{'title': '', 'body': '', 'energy': 1, 'created_at': _ago(1) + 'T08:00:00',
                     'updated_at': _ago(1) + 'T22:30:00'}])
        assert low['energy']['latest'][0]['time'] == '22:30'
        assert {row['name']: row['count'] for row in low['energy']['parts']}['Late hours'] == 1

    def test_writing_that_you_are_tired_counts_unless_a_tap_says_otherwise(self):
        wrote = {'title': '', 'body': 'So tired today.', 'created_at': _ago(1) + 'T09:00:00'}
        assert _low([wrote])['energy']['latest'][0]['label'] == 'Tired'
        assert _low([{**wrote, 'energy': 3}])['energy']['count'] == 0
        assert _low([{**wrote, 'body': 'Not tired at all.'}])['energy']['count'] == 0

    def test_a_task_marked_low_energy_counts(self):
        low = _low(tasks=[_task(1, hour=19, reason='low-energy', title='Essay draft')])
        mark = low['energy']['latest'][0]
        assert mark['label'] == 'Low energy' and 'Essay draft' in mark['detail'] and mark['time'] == '19:00'

    def test_the_worst_part_of_the_day_needs_four_and_no_tie(self):
        evening = [_task(day, hour=18, reason='low-energy') for day in (1, 2, 3)]
        assert _low(tasks=evening)['energy']['worst_part'] is None
        evening.append(_task(4, hour=18, reason='low-energy'))
        assert _low(tasks=evening)['energy']['worst_part'] == 'Evening'

    def test_nothing_outside_the_window_counts(self):
        assert _low(tasks=[_task(400, reason='low-energy')])['energy']['count'] == 0


class TestLowProductivity:
    def test_a_day_under_half_the_usual_is_slow(self):
        tasks = [_task(day) for day in range(2, 7) for _ in range(4)] + [_task(1)]
        low = _low(tasks=tasks)
        assert low['output']['slow_days'] == 1
        mark = low['output']['latest'][0]
        assert mark['day'] == _ago(1) and mark['time'] == '' and mark['detail'] == '1 task vs. your usual 4.'

    def test_a_day_with_nothing_done_is_slow_but_not_before_the_first_task(self):
        tasks = [_task(day) for day in (1, 3, 4) for _ in range(4)]
        low = _low(tasks=tasks)
        assert low['output']['slow_days'] == 1
        assert sum(row['of'] for row in low['output']['weekdays']) == 4

    def test_today_is_never_slow(self):
        tasks = [_task(day) for day in range(1, 5) for _ in range(4)]
        assert _low(tasks=tasks)['output']['slow_days'] == 0

    def test_low_ratings_are_recorded_by_part_of_day_as_a_share(self):
        tasks = [_task(day, hour=9, execution=5) for day in range(1, 7)] + \
                [_task(day, hour=20, execution=2) for day in range(1, 7)]
        low = _low(tasks=tasks)
        parts = {row['name']: row for row in low['output']['parts']}
        assert low['output']['low_rated'] == 6
        assert parts['Evening']['share'] == 100 and parts['Morning']['share'] == 0
        assert low['output']['worst_part'] == 'Evening'

    def test_a_dinner_that_went_badly_is_not_low_productivity(self):
        low = _low(tasks=[_task(1, execution=1, subject='friends', title='Dinner out')])
        assert low['output']['low_rated'] == 0

    def test_a_small_gap_between_parts_of_the_day_is_not_a_finding(self):
        tasks = [_task(day, hour=9, execution=2 if day % 8 == 0 else 5) for day in range(1, 41)] + \
                [_task(day, hour=20, execution=2 if day % 7 == 0 else 5) for day in range(1, 41)]
        assert _low(tasks=tasks)['output']['worst_part'] is None

    def test_saying_you_got_nothing_done_counts(self):
        low = _low([{'title': '', 'body': 'I got nothing done today.', 'created_at': _ago(1) + 'T22:00:00'}])
        assert low['output']['said'] == 1 and low['output']['latest'][0]['label'] == 'You said so'

    def test_the_latest_come_newest_first_and_are_capped(self):
        tasks = [_task(day, execution=1) for day in range(1, 20)]
        latest = _low(tasks=tasks)['output']['latest']
        assert len(latest) == mood.LOW_SHOWN and latest[0]['day'] == _ago(1)
