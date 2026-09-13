"""The records endpoints, and the one column that decides what a best means.

`comparison_direction` is read by every figure on the Records page — the best,
the improvement, the headline, which entry broke a record — and it is read
*from the row*. So what this file is mostly about is the row being right: that
the two words are the only two that can be stored, that a milestone cannot
carry the question at all, and that a database written before the column
existed still answers it.

The rest is the contract the page leans on and no test covered before: that an
entry is a new row rather than an edit, that a failed edit is not silently a
create, and that none of the three endpoints will touch another account's rows.
Assertions are on the database rather than on the reply, for the reason
test_crud.py gives.
"""
import sqlite3

from backend.database import connection as db


def _save(client, **fields):
    """Log a record, and hand back the row the server wrote."""
    body = {'kind': 'record', 'name': 'AMC 8', 'value': 25, 'unit': 'points'}
    body.update(fields)
    reply = client.post('/api/records/save', json=body).json()
    assert reply['success'], reply
    return reply['record']


# ---------------------------------------------------------------------------
# Which way is better
# ---------------------------------------------------------------------------
def test_direction_is_stored_as_given(client):
    up = _save(client, name='AMC 8', comparison_direction='higher')
    down = _save(client, name='Mile', unit='minutes', value=6,
                 comparison_direction='lower')

    assert db.find_row('records', up['id'], user_id='tester')['comparison_direction'] == 'higher'
    assert db.find_row('records', down['id'], user_id='tester')['comparison_direction'] == 'lower'


def test_direction_defaults_to_higher_when_not_asked(client):
    """Which is what the whole page assumed before the column existed."""
    row = _save(client, name='Pull-ups')
    assert row['comparison_direction'] == 'higher'


def test_a_third_direction_is_not_a_direction(client):
    """Anything but the two words is stored as 'higher' rather than as itself.

    The column is read with `=== 'lower'` on the client, so a junk value would
    read as 'higher' there anyway — but it would sit in the database looking
    like an answer, and the CHECK constraint on a freshly built schema would
    refuse the same value the endpoint had already accepted elsewhere.
    """
    row = _save(client, name='Odd', comparison_direction='sideways')
    assert row['comparison_direction'] == 'higher'


def test_a_milestone_cannot_carry_a_direction(client):
    """It has no figure, so there is nothing for the question to be about."""
    reply = client.post('/api/records/save', json={
        'kind': 'milestone', 'name': 'First 25/25', 'comparison_direction': 'lower',
        'value': 25, 'unit': 'points',
    }).json()
    row = reply['record']
    assert row['comparison_direction'] == 'higher'
    # And the figure it was sent goes with it, for the same reason.
    assert (row['value'], row['target'], row['unit']) == (0, 0, '')


def test_an_edit_can_change_which_way_is_better(client):
    """Answering it wrong once is not permanent."""
    row = _save(client, name='Mile', unit='minutes', value=6)
    assert row['comparison_direction'] == 'higher'

    client.post('/api/records/save', json={
        'id': row['id'], 'kind': 'record', 'name': 'Mile', 'value': 6,
        'unit': 'minutes', 'comparison_direction': 'lower',
    })
    assert db.find_row('records', row['id'],
                       user_id='tester')['comparison_direction'] == 'lower'


def test_the_column_reaches_a_database_that_predates_it(tmp_path):
    """The migration, run against a whole database from before the column.

    A fresh schema declares it NOT NULL DEFAULT 'higher', so NULL cannot happen
    there — it is only ever what ALTER TABLE leaves behind on an install being
    caught up, which is the case no fresh-schema test can reach. So this builds
    the real database, puts the `records` table back the shape it had before the
    column, and runs `_catch_up` over it. That is the whole point of
    ADDED_COLUMNS in backend/database/connection.py and it is the part that
    decides whether an account that has been logging records for a year still
    has them afterwards.

    The row keeps its NULL rather than being backfilled. `directionOf` in
    frontend/src/utils/records.ts reads it as 'higher' — one place, which is why
    nothing here guesses a second time.
    """
    path = str(tmp_path / 'old.db')
    db._build(path)

    con = sqlite3.connect(path)
    try:
        # The table as it stood before the column. Rebuilt rather than dropped
        # from: SQLite will not drop a column a CHECK constraint names, and
        # this one's does.
        con.execute('PRAGMA foreign_keys = OFF')
        con.execute('ALTER TABLE records RENAME TO records__before')
        con.execute(
            "CREATE TABLE records ("
            " id TEXT PRIMARY KEY, user_id TEXT NOT NULL,"
            " kind TEXT NOT NULL DEFAULT 'record', name TEXT NOT NULL DEFAULT '',"
            " category TEXT NOT NULL DEFAULT '', value NUMERIC NOT NULL DEFAULT 0,"
            " target NUMERIC NOT NULL DEFAULT 0, unit TEXT NOT NULL DEFAULT '',"
            " note TEXT NOT NULL DEFAULT '', achieved_on TEXT NOT NULL DEFAULT '',"
            " created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '')"
        )
        con.execute('DROP TABLE records__before')
        con.execute(
            "INSERT INTO records (id, user_id, kind, name, value, achieved_on)"
            " VALUES ('1', 'tester', 'record', 'AMC 8', 25, '2026-09-12')"
        )
        con.commit()
    finally:
        con.close()

    db._catch_up(path)

    con = sqlite3.connect(path)
    try:
        columns = [row[1] for row in con.execute('PRAGMA table_info("records")')]
        assert 'comparison_direction' in columns
        stored = con.execute(
            'SELECT name, value, comparison_direction FROM records').fetchone()
        # The entry survived the migration, and did not acquire an answer to a
        # question it was never asked.
        assert stored == ('AMC 8', 25, None)
    finally:
        con.close()


# ---------------------------------------------------------------------------
# One row is one entry
# ---------------------------------------------------------------------------
def test_beating_a_record_writes_a_new_row(client):
    """The shape the evolution chart is drawable at all because of."""
    first = _save(client, name='AMC 8', value=18, achieved_on='2026-03-02')
    later = _save(client, name='AMC 8', value=25, achieved_on='2026-09-12')

    assert first['id'] != later['id']
    rows = client.get('/api/records').json()['records']
    assert sorted(row['value'] for row in rows if row['name'] == 'AMC 8') == [18, 25]


def test_an_edit_replaces_the_row_it_names(client):
    row = _save(client, name='AMC 8', value=23)
    client.post('/api/records/save', json={
        'id': row['id'], 'kind': 'record', 'name': 'AMC 8', 'value': 25,
        'target': 25, 'unit': 'points',
    })

    stored = db.find_row('records', row['id'], user_id='tester')
    assert (stored['value'], stored['target']) == (25, 25)
    assert len(client.get('/api/records').json()['records']) == 1


def test_a_failed_edit_is_not_a_create(client):
    """Editing a row that is gone answers no, rather than making a second one."""
    reply = client.post('/api/records/save', json={
        'id': 'no-such-row', 'kind': 'record', 'name': 'AMC 8', 'value': 25,
    }).json()
    assert not reply['success']
    assert client.get('/api/records').json()['records'] == []


# ---------------------------------------------------------------------------
# What the page is handed
# ---------------------------------------------------------------------------
def test_a_record_needs_a_name(client):
    reply = client.post('/api/records/save', json={'kind': 'record', 'value': 25}).json()
    assert not reply['success']
    assert client.get('/api/records').json()['records'] == []


def test_a_date_that_is_not_a_date_is_stored_as_no_date(client):
    """Rather than as itself, which would sort "soon" between March and April."""
    assert _save(client, achieved_on='soon')['achieved_on'] == ''
    assert _save(client, achieved_on='2026-09-12')['achieved_on'] == '2026-09-12'


def test_a_figure_that_is_not_a_number_is_stored_as_zero(client):
    """JSON permits NaN and the infinities; the comparison model does not.

    Sent as raw text rather than through the `json=` helper, which refuses to
    serialise them — which is the point: a body like this does not come from
    this app\'s own client, it comes from whatever else is willing to send one,
    and `_number` in backend/api/records.py is what stands between that and a
    personal best of infinity that nothing can ever beat.
    """
    for literal in ('Infinity', '-Infinity', 'NaN'):
        reply = client.post(
            '/api/records/save',
            content='{"kind": "record", "name": "Odd", "value": %s}' % literal,
            headers={'content-type': 'application/json'},
        ).json()
        assert reply['success'], reply
        assert reply['record']['value'] == 0


def test_undated_rows_sort_last(client):
    """The top of a hall of fame is not where "not yet" belongs."""
    _save(client, kind='milestone', name='Someday', achieved_on='')
    _save(client, name='Done', achieved_on='2026-09-12')

    listed = client.get('/api/records').json()['records']
    assert [row['name'] for row in listed] == ['Done', 'Someday']


# ---------------------------------------------------------------------------
# One account's rows
# ---------------------------------------------------------------------------
def test_records_are_not_shared_between_accounts(client, stranger):
    mine = _save(client, name='Mine')
    stranger.post('/api/records/save', json={'kind': 'record', 'name': 'Theirs', 'value': 1})

    assert [row['name'] for row in client.get('/api/records').json()['records']] == ['Mine']
    assert [row['name'] for row in stranger.get('/api/records').json()['records']] == ['Theirs']

    # And neither endpoint will act on the other account's row.
    assert not stranger.post('/api/records/delete', json={'id': mine['id']}).json()['success']
    assert not stranger.post('/api/records/save', json={
        'id': mine['id'], 'kind': 'record', 'name': 'Stolen', 'value': 1,
    }).json()['success']
    assert db.find_row('records', mine['id'], user_id='tester')['name'] == 'Mine'


def test_signed_out_reaches_none_of_it(anon):
    assert not anon.get('/api/records').json()['success']
    assert not anon.post('/api/records/save', json={'kind': 'record', 'name': 'x'}).json()['success']
    assert not anon.post('/api/records/delete', json={'id': 'x'}).json()['success']


def test_delete_removes_the_row(client):
    row = _save(client, name='Gone')
    assert client.post('/api/records/delete', json={'id': row['id']}).json()['success']
    assert db.find_row('records', row['id']) is None
