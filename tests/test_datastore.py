"""The row operations, and the rules they inherited from `write_table`.

connection.py has two ways to write now: the whole-table pair it was built on,
and the targeted six that replaced it on every hot path. They share `_encode`
and the missing-key convention, and the point of most of these tests is that
they really do — a row written by one has to read back the same as a row
written by the other, or the app has two datastores wearing one interface.
"""
import pytest

from backend.database import connection as db


@pytest.fixture
def two_accounts(fresh_db):
    for name in ('alice', 'bob'):
        db.insert_row('users', {'id': db.new_id('users'), 'username': name,
                                'xp': 0, 'level': 1, 'theme': 'light'})
    return 'alice', 'bob'


def a_task(owner, title='t', **extra):
    row = {'id': db.new_id('tasks'), 'user_id': owner, 'title': title,
           'status': 'todo', 'xp_value': 5}
    row.update(extra)
    return db.insert_row('tasks', row)


# --------------------------------------------------------------------------
# Scoping
# --------------------------------------------------------------------------
def test_rows_for_returns_only_that_account(two_accounts):
    alice, bob = two_accounts
    a_task(alice, 'hers'); a_task(alice, 'hers too'); a_task(bob, 'his')
    assert [r['title'] for r in db.rows_for('tasks', alice)] == ['hers', 'hers too']
    assert [r['title'] for r in db.rows_for('tasks', bob)] == ['his']


def test_update_row_will_not_cross_accounts(two_accounts):
    alice, bob = two_accounts
    row = a_task(alice, 'hers')
    assert db.update_row('tasks', row['id'], {'title': 'stolen'}, user_id=bob) is False
    assert db.find_row('tasks', row['id'])['title'] == 'hers'


def test_delete_row_will_not_cross_accounts(two_accounts):
    alice, bob = two_accounts
    row = a_task(alice, 'hers')
    assert db.delete_row('tasks', row['id'], user_id=bob) is False
    assert db.find_row('tasks', row['id']) is not None
    assert db.delete_row('tasks', row['id'], user_id=alice) is True
    assert db.find_row('tasks', row['id']) is None


def test_find_row_hides_another_accounts_row(two_accounts):
    """"Not yours" and "not there" are the same answer, on purpose."""
    alice, bob = two_accounts
    row = a_task(alice)
    assert db.find_row('tasks', row['id'], user_id=bob) is None


# --------------------------------------------------------------------------
# The NULL convention, shared with write_table
# --------------------------------------------------------------------------
def test_a_column_that_was_never_written_stays_missing(two_accounts):
    """The rule the whole backend reads by: NULL is an absent key, not None."""
    alice, _ = two_accounts
    row = a_task(alice)
    read = db.find_row('tasks', row['id'])
    assert 'due_date' not in read
    assert read.get('due_date', 'fallback') == 'fallback'


def test_setting_a_field_to_none_clears_it(two_accounts):
    """`update_row` says what to change, so None means NULL rather than skip."""
    alice, _ = two_accounts
    row = a_task(alice, due_date='2026-05-05')
    assert db.find_row('tasks', row['id'])['due_date'] == '2026-05-05'
    db.update_row('tasks', row['id'], {'due_date': None}, user_id=alice)
    assert 'due_date' not in db.find_row('tasks', row['id'])


def test_a_row_reads_back_the_same_whichever_wrote_it(two_accounts):
    """`insert_row` and `write_table` are one datastore, not two."""
    alice, _ = two_accounts
    a_task(alice, 'via insert_row', due_date='2026-06-06')
    rows = db.read_table('tasks')
    rows.append({'id': db.new_id('tasks'), 'user_id': alice, 'title': 'via write_table',
                 'status': 'todo', 'xp_value': 5, 'due_date': '2026-06-06'})
    db.write_table('tasks', rows)

    both = {r['title']: r for r in db.rows_for('tasks', alice)}
    one = dict(both['via insert_row']); two = dict(both['via write_table'])
    for differ in ('id', 'title'):
        one.pop(differ); two.pop(differ)
    # Same keys, same values — including which columns are absent because the
    # write left them NULL rather than letting a DEFAULT stand in.
    assert one == two


def test_booleans_survive_the_round_trip(two_accounts):
    """SQLite stores 0/1; the app and its JSON want real booleans."""
    alice, _ = two_accounts
    row = a_task(alice)
    db.update_row('tasks', row['id'], {'timer_expired': True}, user_id=alice)
    assert db.find_row('tasks', row['id'])['timer_expired'] is True


# --------------------------------------------------------------------------
# Arithmetic and ids
# --------------------------------------------------------------------------
def test_add_to_row_adds_rather_than_sets(two_accounts):
    alice, _ = two_accounts
    user = db.find_row('users', alice, key='username')
    db.add_to_row('users', user['id'], {'xp': 30})
    after = db.add_to_row('users', user['id'], {'xp': 12})
    assert after['xp'] == 42


def test_add_to_row_applies_its_plain_changes_in_the_same_write(two_accounts):
    alice, _ = two_accounts
    user = db.find_row('users', alice, key='username')
    after = db.add_to_row('users', user['id'], {'xp': 5},
                          changes={'current_streak': 3, 'day_state': 'oldday'})
    assert (after['xp'], after['current_streak'], after['day_state']) == (5, 3, 'oldday')


def test_add_to_row_treats_a_null_column_as_zero(two_accounts):
    """COALESCE, so a column nobody has written to is not NULL + 1 = NULL."""
    alice, _ = two_accounts
    user = db.find_row('users', alice, key='username')
    assert 'tasks_completed' not in user or user['tasks_completed'] == 0
    assert db.add_to_row('users', user['id'], {'tasks_completed': 1})['tasks_completed'] == 1


def test_ids_are_unique_and_ordered(fresh_db):
    ids = [db.new_id('tasks') for _ in range(50)]
    assert len(set(ids)) == 50
    assert ids == sorted(ids, key=int)


def test_insert_row_steps_past_an_id_already_taken(two_accounts):
    """The cross-process half of the id fix: the table is the only memory."""
    alice, _ = two_accounts
    first = a_task(alice, 'first')
    second = db.insert_row('tasks', {'id': first['id'], 'user_id': alice,
                                     'title': 'same id', 'status': 'todo'})
    assert second['id'] != first['id']
    assert len(db.rows_for('tasks', alice)) == 2


def test_a_real_constraint_still_raises(two_accounts):
    """The retry is for colliding ids only, not for every IntegrityError."""
    import sqlite3
    with pytest.raises(sqlite3.IntegrityError):
        db.insert_row('tasks', {'id': db.new_id('tasks'),
                                'user_id': 'nobody-by-that-name',
                                'title': 'orphan', 'status': 'todo'})


# --------------------------------------------------------------------------
# JSON columns that hold a scalar
# --------------------------------------------------------------------------
def test_a_preference_written_without_its_encoding_still_reads_as_itself(two_accounts):
    """`user_settings.value` is JSON, and a bare word is not.

    Everything that writes through `_encode` dumps the value, so this only
    arises when something writes the column itself — a seeding script, an
    import, a hand-run UPDATE. It arose: scripts/seed_alpha.py wrote eighteen
    preferences bare, `json.loads('dark')` raised, and the decode's `{}`
    fallback handed the page an object where it wanted a word. The account
    lost its palette on every page.

    `{}` is still right for the JSON columns that hold an object. For the ones
    holding a scalar the text as written is a better answer than an empty
    thing of the wrong shape — see SCALAR_JSON_COLUMNS.
    """
    alice, _ = two_accounts
    with db.connect() as con:
        con.execute('INSERT INTO user_settings (user_id, key, value)'
                    ' VALUES (?,?,?)', (alice, 'theme_mode', 'dark'))

    assert db.user_setting(alice, 'theme_mode') == 'dark'


def test_a_properly_encoded_preference_is_unaffected(two_accounts):
    """The fallback is a fallback: anything that is JSON is still decoded.

    The bool is the odd one and it is not this change's doing: `_encode` tests
    `isinstance(value, bool)` before it reaches the JSON branch, so a flag is
    stored as SQLite's 1 and read back as 1. `_keyed` in backend/api/settings.py
    is what turns it into a bool again, and it accepts both spellings — the 1
    this writes and the 'true' a `json.dumps` writes.
    """
    alice, _ = two_accounts
    db.set_user_setting(alice, 'confirm_delete', True)
    db.set_user_setting(alice, 'default_xp', 40)
    db.set_user_setting(alice, 'analytics_subjects', ['music'])

    assert db.user_setting(alice, 'confirm_delete') == 1
    assert db.user_setting(alice, 'default_xp') == 40
    assert db.user_setting(alice, 'analytics_subjects') == ['music']


def test_an_object_column_still_falls_back_to_an_empty_object(two_accounts):
    """The other JSON columns are read by callers that want a dict."""
    alice, _ = two_accounts
    with db.connect() as con:
        con.execute('INSERT INTO metric_snapshots (user_id, date, metric,'
                    ' score, grade, detail) VALUES (?,?,?,?,?,?)',
                    (alice, '2026-09-13', 'overall', 80, 'A', 'not json'))

    rows = [r for r in db.read_table('metric_snapshots') if r['user_id'] == alice]
    assert rows[0]['detail'] == {}


# --------------------------------------------------------------------------
# One preference is one row
# --------------------------------------------------------------------------
# `set_user_setting` read the whole table, dropped the row being replaced and
# wrote every remaining row back. The table is shared, so storing one string
# cost an INSERT per preference on the instance — 93 of them on the author's
# database, on every view of the achievements page, which writes a signature
# each time it is read. It is an UPSERT on the row's own primary key now.
def _statements(work):
    """Every statement `work` runs, upper-cased on one line."""
    seen = []
    real = db.connect

    def counting():
        con = real()
        con.set_trace_callback(lambda sql: seen.append(' '.join(str(sql).split()).upper()))
        return con

    db.connect = counting
    try:
        work()
    finally:
        db.connect = real
    return seen


def test_storing_one_preference_writes_one_row(two_accounts):
    """The property, not the clock: a write that scales with the table shows
    up here as a statement count that grows with what is already stored."""
    alice, bob = two_accounts
    for i in range(20):
        db.set_user_setting(alice, 'filler{}'.format(i), i)
        db.set_user_setting(bob, 'filler{}'.format(i), i)

    writes = [sql for sql in _statements(
        lambda: db.set_user_setting(alice, 'theme_mode', 'dark'))
        if sql.startswith(('INSERT', 'UPDATE', 'DELETE'))]
    assert len(writes) == 1, writes
    assert not any(sql.startswith('DELETE') for sql in writes), writes


def test_replacing_a_preference_leaves_every_other_one_alone(two_accounts):
    """Including other accounts'. The whole-table rewrite made that a property
    of the rewrite being correct rather than of the write being scoped."""
    alice, bob = two_accounts
    db.set_user_setting(alice, 'theme_mode', 'dark')
    db.set_user_setting(alice, 'default_xp', 40)
    db.set_user_setting(bob, 'theme_mode', 'light')

    db.set_user_setting(alice, 'theme_mode', 'sepia')

    assert db.user_setting(alice, 'theme_mode') == 'sepia'
    assert db.user_setting(alice, 'default_xp') == 40
    assert db.user_setting(bob, 'theme_mode') == 'light'
    assert len(db.read_table('user_settings')) == 3


def test_a_preference_that_was_never_set_reads_as_none(two_accounts):
    """None means "never set", which is not the same as an empty value — the
    analytics page shows the baseline setup screen on exactly that difference."""
    alice, _ = two_accounts
    db.set_user_setting(alice, 'theme_mode', 'dark')
    assert db.user_setting(alice, 'analytics_baseline') is None
    assert db.user_setting('nobody', 'theme_mode') is None


def test_replacing_a_preference_bumps_only_its_own_timestamp(two_accounts):
    """`updated_at` said when somebody last saved anything, because every row
    was rewritten on every save. It now says when this preference changed."""
    alice, _ = two_accounts
    db.set_user_setting(alice, 'theme_mode', 'dark')
    db.set_user_setting(alice, 'default_xp', 40)

    def stamps():
        return {row['key']: row['updated_at'] for row in db.read_table('user_settings')}

    before = stamps()
    with db.connect() as con:
        con.execute("UPDATE user_settings SET updated_at = '2020-01-01 00:00:00'")
    db.set_user_setting(alice, 'theme_mode', 'sepia')
    after = stamps()

    # The one that was written moved; the one that was not did not. Not
    # compared against `before`: datetime('now') has second resolution and
    # both writes above land in the same second.
    assert after['theme_mode'] != '2020-01-01 00:00:00'
    assert after['default_xp'] == '2020-01-01 00:00:00'
    assert before['theme_mode'] != '2020-01-01 00:00:00'
