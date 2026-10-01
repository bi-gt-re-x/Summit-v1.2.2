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
