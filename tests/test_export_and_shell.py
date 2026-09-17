"""Taking the app with you: off the server, and onto a phone.

Two things that were broken in the same way — a promise the app made in markup
and did not keep in the response.

**"Export everything" meant five tables of seventeen.** `ACCOUNT_TABLES` is
what deleting an account clears, so it is the authoritative list of what the
account owns; `EXPORTS` held five. The gap was twelve tables the app would
destroy and could not hand back, including every calendar entry and the XP
ledger the level is counted from. The first half of this file is the assertion
that the two lists cannot drift apart again.

**The manifest was never served.** index.html has carried
`<link rel="manifest">` all along and `/manifest.json` 404'd on every built
install: `/assets` was mounted and the root of the bundle was not. The Vite dev
server serves public/ itself, which is what hid it. So the app has never been
installable anywhere except a developer's laptop, and nothing noticed because
nothing asked.
"""
import json

import pytest

from backend.api.settings import ACCOUNT_TABLES, EXPORTS
from backend.routes.spa import ROOT_FILES


# --------------------------------------------------------------------------
# The export
# --------------------------------------------------------------------------
def test_everything_means_every_table_the_account_owns(client):
    reply = client.get('/api/settings/export?table=all&format=json')
    assert reply.status_code == 200

    tables = reply.json()['export']['tables']
    assert set(tables) == set(ACCOUNT_TABLES), (
        'The export and the delete disagree about what the account owns. '
        'Whatever is missing here is data this app can destroy and cannot '
        'give back.'
    )


def test_the_tables_that_used_to_be_missing_are_named(client):
    """The twelve, spelled out — a set comparison alone would pass if both
    lists shrank together, and the calendar going quiet is the exact failure
    worth a second assertion."""
    tables = client.get('/api/settings/export').json()['export']['tables']
    for missing in ('calendar_entries', 'calendar_events', 'xp_events',
                    'goal_milestones', 'user_subjects', 'user_achievements',
                    'metric_snapshots', 'user_settings', 'activity_log',
                    'library_items', 'day_focus_notes', 'notifications'):
        assert missing in tables, missing


def test_the_account_row_is_not_in_it(client):
    """It holds the password hash and the verification token."""
    body = client.get('/api/settings/export').text
    assert 'users' not in json.loads(body)['export']['tables']
    assert 'password_hash' not in body
    assert 'verify_token' not in body


def test_a_curated_table_keeps_its_columns(client, task):
    """`EXPORTS` is still what decides the shape of the five it names, so the
    JSON and the CSV of a task cannot disagree about what a task is."""
    tables = client.get('/api/settings/export').json()['export']['tables']
    assert tables['tasks'], 'the fixture task should be in here'
    assert set(tables['tasks'][0]) == set(EXPORTS['tasks'])


def test_an_uncurated_table_goes_out_whole(client):
    """The other twelve are exported as stored rather than through a second
    copy of their schema kept in this file — see `_rows_for`."""
    rows = client.get('/api/settings/export').json()['export']['tables']
    assert 'user_settings' in rows
    # Whatever columns that table has, it is not narrowed to an EXPORTS list,
    # because there is not one for it.
    assert 'user_settings' not in EXPORTS


def test_one_table_can_still_be_asked_for(client, task):
    tables = client.get('/api/settings/export?table=tasks').json()['export']['tables']
    assert set(tables) == {'tasks'}


def test_a_table_that_is_not_yours_to_ask_for_is_refused(client):
    reply = client.get('/api/settings/export?table=users').json()
    assert reply['success'] is False


def test_the_export_is_only_your_own_rows(client, stranger, task):
    """`stranger` has an account and no tasks; the fixture task belongs to
    `tester`. An export that leaked across accounts would be the worst
    possible bug in a feature whose whole purpose is handing data over."""
    mine = client.get('/api/settings/export').json()['export']
    theirs = stranger.get('/api/settings/export').json()['export']

    assert mine['account'] != theirs['account']
    assert mine['tables']['tasks']
    assert theirs['tables']['tasks'] == []


def test_csv_still_answers_for_the_tables_it_names(client, task):
    reply = client.get('/api/settings/export?table=tasks&format=csv')
    assert reply.status_code == 200
    assert reply.headers['content-type'].startswith('text/csv')
    assert reply.text.splitlines()[0] == ','.join(EXPORTS['tasks'])


# --------------------------------------------------------------------------
# The shell
# --------------------------------------------------------------------------
def built(reply):
    """Whether there is a bundle behind this route.

    These files come out of frontend/dist, and the suite has to pass on a
    checkout that has not been built — so the assertion worth making
    unconditionally is that the *route* answers. 503 is this app's deliberate
    answer for a missing build (see MISSING_BUILD in backend/routes/spa.py);
    404 is the bug this file is about, and no amount of not-building produces
    one.
    """
    assert reply.status_code in (200, 503), reply.status_code
    return reply.status_code == 200


@pytest.mark.parametrize('name', ROOT_FILES)
def test_every_root_file_is_served(anon, name):
    """404 on any of these is a promise index.html makes and the server breaks."""
    reply = anon.get('/' + name)
    assert reply.status_code != 404, (
        '/{} has no route. index.html asks for it and the browser will not '
        'negotiate the path.'.format(name)
    )
    assert built(reply) or reply.status_code == 503


def test_the_manifest_is_json_and_names_the_app(anon):
    reply = anon.get('/manifest.json')
    if not built(reply):
        pytest.skip('no bundle built')
    body = reply.json()
    assert body['name'] == 'Summit'
    assert body['start_url'] == '/'
    assert body['icons'], 'a manifest with no icons is not installable'


def test_the_touch_icon_is_a_png(anon):
    """iOS will not take the SVG the other surfaces use, and composites what it
    gets onto black — so this one has to be a PNG and has to be opaque."""
    reply = anon.get('/apple-touch-icon.png')
    if not built(reply):
        pytest.skip('no bundle built')
    assert reply.content[:8] == b'\x89PNG\r\n\x1a\n'


def test_the_worker_is_served_uncacheable(anon):
    """A service worker pinned by an intermediary is a build nobody can
    replace: the file that decides when everything else is stale must not be
    stale itself."""
    reply = anon.get('/sw.js')
    if not built(reply):
        pytest.skip('no bundle built')
    assert reply.headers.get('cache-control') == 'no-cache'


def test_the_worker_never_caches_the_account(anon):
    """The one rule in that file worth a test from out here. A cached /api/
    response is yesterday's record shown as today's, with nothing on screen
    saying so."""
    reply = anon.get('/sw.js')
    if not built(reply):
        pytest.skip('no bundle built')
    assert "startsWith('/api/')" in reply.text


def test_a_root_file_does_not_shadow_the_app(anon):
    """The reason these are listed rather than mounted at '/': a StaticFiles
    mount there answers before every route in the app."""
    assert anon.get('/', follow_redirects=False).status_code == 200
    assert anon.get('/home', follow_redirects=False).status_code == 200


# --------------------------------------------------------------------------
# The analytics read
# --------------------------------------------------------------------------
def test_the_task_read_does_not_sort_every_row(client):
    """`columns_for` defaults to ORDER BY rowid, and on `tasks` that is an
    order the index cannot supply — SQLite builds a temp B-tree over every row
    the account owns to produce it. Asking for the order the index already
    holds removes the sort outright.

    Asserted through EXPLAIN rather than by timing it, because a timing test
    on a seeded account is a coin flip that fails in CI.
    """
    from backend.api.analytics import ANALYTICS_TASK_FIELDS, TASK_ORDER
    from backend.database import connection as db

    con = db.connect()
    try:
        columns = ', '.join('"{}"'.format(name) for name in ANALYTICS_TASK_FIELDS)
        plan = con.execute(
            'EXPLAIN QUERY PLAN SELECT {} FROM "tasks" WHERE user_id = ? '
            'ORDER BY {}'.format(columns, TASK_ORDER), ('tester',)).fetchall()
    finally:
        con.close()

    steps = ' '.join(str(row['detail']) for row in plan)
    assert 'TEMP B-TREE' not in steps.upper(), steps
    assert 'INDEX' in steps.upper(), steps


def test_the_order_is_a_literal(client):
    """It is interpolated into the SQL, so it must never be caller-shaped."""
    from backend.api import analytics
    assert isinstance(analytics.TASK_ORDER, str)
    assert ';' not in analytics.TASK_ORDER


def test_the_task_read_still_returns_the_account_s_own_rows(client, task):
    """`rows`, not `tasks`: the wire is columnar now. See
    tests/test_analytics_tasks.py, which holds that shape to its promises."""
    reply = client.get('/api/analytics/tasks').json()
    assert reply['success'] is True
    assert reply['rows'], 'the fixture task should be here'


def test_the_task_read_is_scoped_to_the_caller(client, stranger, task):
    """The order changed and so did the encoding; the WHERE did not."""
    assert client.get('/api/analytics/tasks').json()['rows']
    assert stranger.get('/api/analytics/tasks').json()['rows'] == []
