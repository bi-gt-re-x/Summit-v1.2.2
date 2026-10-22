"""When an account was made — the date every day count is measured from.

The growth series walks one row per day from here, so a creation date that
comes out wrong is not a cosmetic error: a bare `2026-07-09` used to fall
through to the account id, and a seeded id decodes to 2008, which made the
series nineteen years long.
"""
from datetime import date

from backend.tracking.auth import created_date_for


def test_a_full_timestamp():
    assert created_date_for({'created_at': '2026-07-09T16:42:00'}) == date(2026, 7, 9)


def test_a_bare_date_is_a_creation_date_too():
    assert created_date_for({'created_at': '2026-07-09', 'id': '1200000001731'}) == date(2026, 7, 9)


def test_no_created_at_falls_back_to_the_id():
    # 1_700_000_000_000 ms is November 2023.
    assert created_date_for({'id': '1700000000000'}).year == 2023


def test_the_series_starts_at_the_first_record_when_that_is_earlier(client):
    """Alpha's record starts eleven months before its created_at. Walking from
    created_at dropped those months, so the charts summed 666K of 715K XP."""
    from backend.database import connection as db
    from backend.tracking import growth

    db.insert_row('xp_events', {
        'id': db.new_id('xp_events'), 'user_id': 'tester', 'amount': 40,
        'reason': 'task_completion', 'timestamp': '2025-06-01T10:00:00',
        'date': '2025-06-01', 'tasks_completed': 1,
    })
    data = growth.series('tester', 0)
    assert data['created_date'] == '2025-06-01'
    assert data['growth_data'][0]['xp_earned'] == 40
    assert data['growth_data'][-1]['cumulative_xp'] == 40
