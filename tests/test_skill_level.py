"""Skill levels, read from what the reader got right.

Ported from frontend/src/utils/skillLevel.test.ts when the rule moved to
backend/tracking/skill_level.py.
"""
from datetime import datetime

from backend.tracking.skill_level import read_level, step_levels

NOW = datetime(2026, 9, 30, 12, 0, 0)
_seq = [0]


def row(weight, **over):
    _seq[0] += 1
    out = {'id': str(_seq[0]), 'node_id': 'm.quadratics', 'ordinal': 3, 'weight': weight,
           'attempted': 1, 'correct': 1, 'source': 'problem', 'at': '2026-09-10T10:00:00'}
    out.update(over)
    return out


def marks(weight, count, right, day='2026-09-10'):
    """`count` single problems at one difficulty, `right` of them correct, on `day`."""
    return [row(weight, correct=1 if i < right else 0, at='{}T10:{:02d}:00'.format(day, i))
            for i in range(count)]


def level(rows, as_of=NOW):
    return read_level(rows, as_of=as_of)


def test_zero_with_nothing_answered():
    read = level([])
    assert (read['level'], read['mastery'], read['accuracy'], read['evidence']) == (0, 0, None, 'none')


def test_one_once_anything_is_answered():
    assert level(marks('warmup', 1, 0))['level'] == 1


def test_two_for_easy_at_seventy_percent_over_five():
    assert level(marks('warmup', 5, 4))['level'] == 2
    assert level(marks('warmup', 4, 4))['level'] == 1
    assert level(marks('warmup', 5, 3))['level'] == 1


def test_hardest_difficulty_cleared_not_a_climb():
    assert level(marks('core', 6, 5))['level'] == 3


def test_four_for_hard_at_seventy_percent():
    assert level(marks('stretch', 5, 4))['level'] == 4


def test_one_evening_of_hard_problems_is_not_mastery():
    assert level(marks('stretch', 12, 12, '2026-09-20'))['level'] == 4
    two_days = marks('stretch', 6, 6, '2026-09-20') + marks('stretch', 6, 6, '2026-09-21')
    assert level(two_days)['level'] == 5
    assert level(two_days)['mastery'] == 100


def test_a_run_of_misses_can_take_a_level_away():
    early = marks('stretch', 10, 10, '2026-09-01')
    lately = marks('stretch', 20, 6, '2026-09-25')
    assert level(early)['level'] >= 4
    assert level(early + lately)['level'] < 4


def test_a_large_log_counts_in_part_when_it_crosses_the_window():
    read = level([row('core', source='log', attempted=50, correct=40)])
    assert read['tiers']['core']['attempted'] == 20
    assert read['tiers']['core']['correct'] == 16
    assert read['attempted'] == 50
    assert read['level'] == 3


def test_partial_credit_toward_the_next_level():
    read = level(marks('warmup', 5, 5) + marks('core', 2, 2))
    assert read['level'] == 2
    assert 40 < read['mastery'] < 60


def test_names_the_hardest_difficulty_answered_correctly():
    assert level(marks('warmup', 3, 3) + marks('stretch', 2, 0))['hardest'] == 'warmup'


def test_counts_practice_days_in_the_last_four_weeks():
    rows = marks('core', 1, 1, '2026-09-29') + marks('core', 1, 1, '2026-09-20') \
        + marks('core', 1, 1, '2026-08-01')
    assert level(rows)['activeDays'] == 2


def test_reads_only_what_existed_at_the_date_asked_about():
    rows = marks('warmup', 5, 5, '2026-09-01') + marks('core', 5, 5, '2026-09-25')
    assert level(rows, datetime(2026, 9, 10))['level'] == 2
    assert level(rows)['level'] == 3


def test_a_row_stamped_ahead_of_the_clock_counts_when_reading_now():
    ahead = marks('warmup', 5, 5, '2099-01-01')
    assert read_level(ahead, now=NOW)['level'] == 2
    assert level(ahead)['level'] == 0


def test_step_levels_reads_each_step_now_and_a_month_ago():
    rows = marks('warmup', 5, 5, '2026-08-01') + marks('stretch', 6, 5, '2026-09-25') \
        + [row('core', ordinal=0, at='2026-09-25T09:00:00')]
    found = step_levels(rows, now=NOW)
    assert set(found) == {'m.quadratics#3', 'm.quadratics#0'}
    step = found['m.quadratics#3']
    assert (step['before']['level'], step['now']['level'], step['attempted']) == (2, 4, 11)
