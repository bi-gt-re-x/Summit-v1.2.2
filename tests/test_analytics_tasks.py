"""The analytics page's task read: the same rows, in fewer columns.

`/api/get_user_data` hands back every column of every task the account owns,
`description` included — free text with no ceiling, on a table that reaches
thousands of rows on a real account. The analytics page walks all of them and
reads sixteen fields. This endpoint is those sixteen.

The risk in a projection is not that it returns too little; a missing field is
a `undefined` that some panel renders as a dash, which is visible the first
time anybody looks. It is that it quietly returns *different rows* — a WHERE
clause that drifts, a decode that stops running because it was written for the
`SELECT *` path. So these check the two things a projection has to keep true:
every row that was there is still there, and each one still decodes the way the
rest of the app expects.

The wire shape is columns rather than rows — `{fields, rows}` — because two
thirds of the old payload was the sixteen field names repeated once per task.
`read` below is the decoder, and it is the same zip the client does; see
`rehydrate` in frontend/src/services/analytics.ts. Every assertion here is about
the rows that come out of it, which is what the page actually sees, so this file
holds the endpoint to the same promises it always did.
"""
from backend.api.analytics import ANALYTICS_TASK_FIELDS
from backend.database import connection as db


def read(client):
    """The endpoint's answer, as the rows every panel downstream works with.

    Nulls are dropped, which is the client's decoder and not a convenience
    here: the object endpoint omitted a NULL column entirely, and
    `utils/diagnosis` on the other side tests `met_deadline !== undefined` to
    find the tasks that had a deadline. A null left in would pass that test.
    See `rehydrate` in frontend/src/services/analytics.ts.
    """
    body = client.get('/api/analytics/tasks').json()
    assert body['success'] is True, body
    return [
        {f: v for f, v in zip(body['fields'], values) if v is not None}
        for values in body['rows']
    ]


def test_an_absent_field_stays_absent(client):
    """The trap in a positional encoding, pinned.

    A row has to carry a slot for every field, so an unrated task's
    `met_deadline` goes on the wire as null where it used to be missing. What
    reaches the page must still be missing — see the note on `read`.
    """
    make(client, name='never rated')

    body = client.get('/api/analytics/tasks').json()
    at = body['fields'].index('met_deadline')
    assert body['rows'][0][at] is None
    assert 'met_deadline' not in read(client)[0]


def test_sends_the_field_names_once(client):
    """The saving, asserted rather than assumed.

    A row carries values in `fields` order and no keys of its own. If somebody
    puts the objects back on the wire this is the test that says so, because
    everything else here passes either way — `read` above would still work.
    """
    make(client, name='one')

    body = client.get('/api/analytics/tasks').json()
    assert body['fields'] == [f for f in ANALYTICS_TASK_FIELDS]
    assert body['rows'] and isinstance(body['rows'][0], list)
    assert len(body['rows'][0]) == len(body['fields'])


def make(client, **fields):
    """One task, with whatever the caller wants set on it."""
    made = client.post('/api/tasks', json={
        'name': fields.pop('name', 'a task'),
        'xp_reward': fields.pop('xp_reward', 10),
        'due_date': fields.pop('due_date', ''),
    }).json()
    task_id = made['task_id']
    if fields:
        db.update_row('tasks', task_id, fields, user_id='tester')
    return task_id


def test_returns_every_task_the_account_owns(client):
    for index in range(5):
        make(client, name='task %d' % index)

    assert len(read(client)) == len(db.tasks_for('tester'))


def test_returns_only_the_declared_columns(client):
    make(client, description='a long description nothing on that page reads')

    row = read(client)[0]
    assert set(row) <= set(ANALYTICS_TASK_FIELDS)
    # The field the projection exists for.
    assert 'description' not in row


def test_keeps_the_values_the_full_read_gives(client):
    make(client, name='rated', difficulty=4, execution=2, subject='maths')

    full = {t['id']: t for t in db.tasks_for('tester')}
    for thin in read(client):
        for field, value in thin.items():
            assert full[thin['id']][field] == value, field


def test_decodes_booleans_as_booleans(client):
    """The `SELECT *` path runs every row through `_decode`; so must this one.

    SQLite has no boolean, so `met_deadline` comes back as 0 or 1 unless
    something converts it — and a projection that skipped the decode would hand
    the client a number where every other endpoint hands it a bool.
    """
    make(client, met_deadline=True)

    row = read(client)[0]
    assert row['met_deadline'] is True


def test_cannot_be_asked_for_a_column_that_is_not_there(client):
    """Unknown names are dropped rather than reaching the SQL.

    The column list goes into the query string, so an unchecked one is an
    injection. It is a constant today; this is what keeps that from being the
    only thing standing between the two.
    """
    make(client)

    rows = db.columns_for('tasks', 'tester', ('id', 'no_such_column'))
    assert rows and set(rows[0]) == {'id'}

    assert db.columns_for('tasks', 'tester', ('"; DROP TABLE tasks; --',)) == []
    # And the table it tried to drop is still there.
    assert db.tasks_for('tester')


def test_is_scoped_to_the_signed_in_account(client, stranger):
    make(client, name='mine')
    stranger.post('/api/tasks', json={'name': 'theirs', 'xp_reward': 5, 'due_date': ''})

    titles = [t['title'] for t in read(client)]
    assert 'theirs' not in titles


def test_needs_a_session(anon):
    assert anon.get('/api/analytics/tasks').status_code == 401
