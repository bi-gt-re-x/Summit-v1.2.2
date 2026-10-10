"""scripts/seed_year.py hands each account its own block of ids.

The script exists to put a real amount of work in front of the app, and its
whole point is doing that for a demo account beside the ones already there. It
could not: `base` was `int(SEED_ID_LOW)` flat, so every run wrote ids from
1000000000000 upward whatever `--user` and `--seed` said, and seeding a second
account died on its first row with `UNIQUE constraint failed: tasks.id`.

Only the id arithmetic is tested here. What the week contains is a judgement
about what a rigorous two weeks looks like and not something to pin.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))), 'scripts'))

import seed_year  # noqa: E402

SEED = 20260818
NAMES = ['Alpha', 'reviewer', 'demo', 'riley', 'avery', 'casey', 'jordan',
         'morgan', 'a', 'A', 'user1', 'user2']


def test_two_accounts_do_not_share_a_block():
    """The bug, stated as the property it broke."""
    bases = {name: seed_year.id_base(name, SEED) for name in NAMES}
    assert len(set(bases.values())) == len(NAMES), bases


def test_a_block_is_stable_for_a_name():
    """Not `hash()`, which is salted per process for strings — an account's
    ids would move every run and `--clear` would strand the old ones."""
    assert seed_year.id_base('Alpha', SEED) == seed_year.id_base('Alpha', SEED)


def test_the_seed_is_the_way_out_of_a_collision():
    """One in a hundred thousand, and the error message says to turn this."""
    assert seed_year.id_base('Alpha', SEED) != seed_year.id_base('Alpha', SEED + 1)


def test_every_id_stays_inside_the_reserved_window():
    """`OWNED` finds seeded rows by that window and by `length(id) = 13`, so a
    block that ran past either end would leave rows `--clear` cannot see."""
    low, high = int(seed_year.SEED_ID_LOW), int(seed_year.SEED_ID_HIGH)
    for name in NAMES:
        base = seed_year.id_base(name, SEED)
        top = base + seed_year.SEED_BLOCK - 1
        assert low <= base <= top <= high, (name, base, top)
        assert len(str(base)) == 13 and len(str(top)) == 13, name


def test_the_blocks_tile_the_window_exactly():
    """The last id of the last block is the last id of the window — so no
    space is wasted and, more to the point, none is overrun."""
    assert seed_year.SEED_BLOCK * seed_year.SEED_BLOCKS == (
        int(seed_year.SEED_ID_HIGH) - int(seed_year.SEED_ID_LOW) + 1)


def test_a_year_of_rows_fits_a_block_many_times_over():
    """The guard in `add` is for a runaway --days, not for ordinary use."""
    from datetime import date

    rows = seed_year.build('someone', date(2026, 1, 1), 365, 500, SEED)
    assert len(rows) < seed_year.SEED_BLOCK / 100, len(rows)


def test_the_rows_a_build_writes_are_inside_that_account_s_block():
    """End to end: what `build` actually puts in the id column."""
    from datetime import date

    base = seed_year.id_base('someone', SEED)
    rows = seed_year.build('someone', date(2026, 1, 1), 90, 500, SEED)
    ids = [int(row[0]) for row in rows]
    assert min(ids) == base
    assert max(ids) < base + seed_year.SEED_BLOCK
    assert len(set(ids)) == len(ids), 'ids repeat within one build'
