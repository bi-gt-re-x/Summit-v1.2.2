"""Earning a badge, and hearing about it.

Three things are pinned here, and each of them was broken before this file
existed.

**A badge is earned when you earn it.** `list_achievements` used to be the only
thing that ever wrote a row to `user_achievements`, so the earning happened on
the reader's next visit to the wall rather than on the work. Everything
downstream inherited that: the bell announces a badge by reading that table
(`_progress_candidates` in backend/tracking/notify.py), so the notification was
real and arrived *after* the page had already broken the news.

**Working it out is guarded.** The check is a pass over every task the account
owns plus a reading of the analytics report card, and it runs on a sixty-second
poll and on every completion. The guard is what makes that affordable; a guard
that never lets the work run and a guard that never stops it are both bugs, and
only a test tells them apart.

**The graded metrics come from the analytics engine.** Nine of them are
thresholds on figures `analytics.ratings` publishes rather than on anything
recounted here. If that wiring breaks, every badge on it silently reads zero
and simply stays locked — no error, no wrong number on screen, nothing to
notice. That is exactly the kind of failure worth a test.
"""
from backend.api import achievements
from backend.database import connection as db

from tests.conftest import make_account, sign_in

DAY = '2026-09-01'


def _finish(username, subject='mathematics', xp=100, **over):
    """One finished task, filed under a subject so it counts toward a lattice."""
    row = {
        'id': db.new_id('tasks'),
        'user_id': username,
        'title': 'Practice set',
        'priority': 'medium',
        'status': 'done',
        'xp_value': xp,
        'subject': subject,
        'created_at': '2026-08-30T09:00:00',
        'completed_at': '2026-08-31T10:00:00',
    }
    row.update(over)
    db.insert_row('tasks', row)
    return row


def _user(username):
    from backend.tracking.auth import load_user
    return load_user(username)[1]


# --------------------------------------------------------------------------
# Earning, without going to look
# --------------------------------------------------------------------------
def test_a_badge_is_earned_without_opening_the_page(app):
    """The whole point. Finishing the work is what earns it."""
    make_account('earner')
    _finish('earner')

    _figures, fresh = achievements.check_earned('earner', _user('earner'))

    assert 'first-task' in {badge['id'] for badge in fresh}
    rows = db.rows_for('user_achievements', 'earner')
    assert 'first-task' in {row['achievement_id'] for row in rows}


def test_a_badge_already_held_is_not_earned_twice(app):
    """`fresh` is what the bell announces, so a second run reporting the same
    badge would be a notification for something that happened last week."""
    make_account('twice')
    _finish('twice')
    achievements.check_earned('twice', _user('twice'))

    # Force past the guard, so this is about `_record_earned` and not about it.
    _figures, fresh = achievements.check_earned('twice', _user('twice'), force=True)
    assert fresh == []


def test_the_guard_skips_the_work_when_nothing_has_moved(app):
    """`figures` is None only when the check decided not to look."""
    make_account('quiet')
    _finish('quiet')
    achievements.check_earned('quiet', _user('quiet'))

    figures, fresh = achievements.check_earned('quiet', _user('quiet'))
    assert figures is None
    assert fresh == []


def test_the_guard_reopens_the_question_when_work_lands(app):
    """A guard that never lets go is the same bug as no earning at all."""
    make_account('busy')
    _finish('busy')
    achievements.check_earned('busy', _user('busy'))

    for _ in range(10):
        _finish('busy')

    figures, fresh = achievements.check_earned('busy', _user('busy'))
    assert figures is not None
    assert 'tasks-10' in {badge['id'] for badge in fresh}


def test_the_page_works_it_out_whatever_the_guard_says(app):
    """The wall prints every badge's progress and not only what is earned, so
    it needs the figures even on a visit where nothing could have been won."""
    make_account('reader')
    _finish('reader')
    achievements.check_earned('reader', _user('reader'))

    figures, _fresh = achievements.check_earned('reader', _user('reader'), force=True)
    assert figures is not None
    assert figures['tasks'] >= 1


# --------------------------------------------------------------------------
# The bell
# --------------------------------------------------------------------------
def test_the_bell_announces_a_badge_earned_since_the_last_look(app):
    """End to end, through the endpoint the client actually calls.

    The first read settles the account — an account arriving with a shelf of
    badges did not earn them in the last minute, so the first sweep files the
    backlog without showing it (see the note in backend/tracking/notify.py).
    What is asserted is the *second* read, after new work.
    """
    make_account('belle')
    client = sign_in(app, 'belle')
    client.get('/api/notifications', params={'day': DAY, 'at': '09:00'})

    for _ in range(10):
        _finish('belle')

    reply = client.get('/api/notifications', params={'day': DAY, 'at': '09:05'}).json()
    assert reply['success'], reply

    prints = {row['fingerprint'] for row in reply['notifications']}
    assert 'badge:tasks-10' in prints, sorted(prints)

    said = next(row for row in reply['notifications'] if row['fingerprint'] == 'badge:tasks-10')
    assert said['title'] == 'Badge earned: Warmed Up'
    assert said['link'] == '/achievements'


def test_the_bell_says_nothing_twice_about_one_badge(app):
    """The sweep runs on every poll. A badge announced per poll is the bug the
    fingerprint exists to prevent, and this is that rule for the new caller."""
    make_account('once')
    client = sign_in(app, 'once')
    client.get('/api/notifications', params={'day': DAY, 'at': '09:00'})

    for _ in range(10):
        _finish('once')

    first = client.get('/api/notifications', params={'day': DAY, 'at': '09:05'}).json()
    second = client.get('/api/notifications', params={'day': DAY, 'at': '09:06'}).json()

    badges = [row for row in second['notifications'] if row['fingerprint'].startswith('badge:')]
    assert len(badges) == len({row['fingerprint'] for row in badges})
    assert len(first['notifications']) == len(second['notifications'])


# --------------------------------------------------------------------------
# The graded half
# --------------------------------------------------------------------------
def test_every_graded_metric_has_a_figure(app):
    """Zero is the right answer for an account too new to score. `None` or a
    missing key is not: `>=` against a threshold would throw or be silently
    skipped, and the badge would be unearnable rather than unearned."""
    make_account('fresh')

    figures = achievements._figures('fresh', _user('fresh'))

    for metric in achievements.GRADED_METRICS:
        assert metric in figures, metric
        assert isinstance(figures[metric], int), metric


def test_the_graded_figures_are_the_report_cards_own(app):
    """Read off `analytics.ratings` rather than recounted, which is the whole
    reason these badges exist in the form they do — a threshold on a published
    figure, not a second definition of a word the analytics page already
    defines, scores and grades."""
    from backend.tracking import analytics as analytics_tracking

    make_account('graded')
    for _ in range(6):
        _finish('graded', difficulty=4, execution=5)

    card = analytics_tracking.ratings('graded', record=False)
    figures = achievements._figures('graded', _user('graded'))

    assert figures['growth_score'] == round(card['overall']['score'])
    assert figures['quality_score'] == round(card['metrics']['quality']['score'])
    assert figures['consistency_rate'] == round(card['metrics']['consistency']['rate'])
    assert figures['rated'] == card['metrics']['quality']['rated_tasks']


def test_every_badge_has_a_figure_to_be_measured_against(app):
    """A metric in the catalogue with nothing in `_figures` is a badge that can
    never be earned, and nothing on the page would say so — it would simply sit
    at 0 / 90 forever."""
    make_account('cover')

    figures = achievements._figures('cover', _user('cover'))

    for badge in achievements.ALL:
        assert badge['metric'] in figures, badge['id']
        assert badge['metric'] in achievements.METRIC_LABELS, badge['id']


# --------------------------------------------------------------------------
# Reading the wall is a read
# --------------------------------------------------------------------------
# It was not. Every view of the page deleted the 158-row catalogue and
# reinserted it, rewrote all 93 rows of `user_settings` to store one signature,
# and read the account's whole task history twice — once to count the badges
# and once more inside the report card it asked for the graded nine. 289
# statements and 55 MB for a page of counts.
#
# `_sync_catalogue` meant to write only what changed and could not: it merged
# each stored row with the catalogue's version and compared, and `_row_for`
# states `icon` and `title` as None where a stored NULL is simply a missing
# key. `{**row, 'icon': None} != row` however equal the two are, so it rewrote
# the table every time. These tests hold the behaviour it was reaching for.
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


def test_syncing_an_unchanged_catalogue_writes_nothing(app):
    """The first call reconciles; the second has nothing to do and must do it."""
    achievements._sync_catalogue()
    writes = [sql for sql in _statements(achievements._sync_catalogue)
              if sql.startswith(('INSERT', 'UPDATE', 'DELETE'))]
    assert writes == [], writes


def test_syncing_still_fixes_a_row_that_drifted(app):
    """The point of syncing at all: the table has to say what the app says, or
    the claim that a reader querying the database sees the same badges is
    false. One row changed is one UPDATE, not a rewrite of the catalogue."""
    achievements._sync_catalogue()
    badge = achievements.ALL[0]
    db.update_row('achievements', badge['id'],
                  {'name': 'Stale name', 'threshold': 999999})

    statements = _statements(achievements._sync_catalogue)
    writes = [sql for sql in statements
              if sql.startswith(('INSERT', 'UPDATE', 'DELETE'))]
    assert len(writes) == 1, writes
    assert writes[0].startswith('UPDATE'), writes

    stored = db.find_row('achievements', badge['id'])
    assert stored['name'] == badge['name']
    assert stored['threshold'] == badge['threshold']


def test_syncing_inserts_a_badge_the_table_has_never_seen(app):
    """A release that adds a badge has to reach accounts that already cleared
    its threshold — and `user_achievements` references this table, so the row
    has to exist before anybody can be recorded as having earned it."""
    achievements._sync_catalogue()
    badge = achievements.ALL[0]
    db.delete_row('achievements', badge['id'])

    achievements._sync_catalogue()
    assert db.find_row('achievements', badge['id'])['name'] == badge['name']


def test_a_dropped_badge_keeps_its_row_and_its_earnings(app):
    """The one direction this does not sync, deliberately: deleting the row
    would cascade `user_achievements` and take somebody's history with it."""
    achievements._sync_catalogue()
    db.insert_row('achievements', {
        'id': 'retired-badge', 'name': 'Retired', 'description': '',
        'metric': 'tasks', 'threshold': 1, 'tier': 1, 'category': 'Special',
        'xp_reward': 0, 'hidden': 0, 'title': None})

    achievements._sync_catalogue()
    assert db.find_row('achievements', 'retired-badge') is not None


def test_the_page_reads_each_table_once(app):
    """The fix as a property. Every source the page counts off is read once:
    a second read of the tasks — which is what asking for the report card used
    to cost on top of counting the badges — shows up here as a two."""
    make_account('counted')
    _finish('counted')
    achievements.list_achievements(username='counted')   # first visit does the earning

    statements = _statements(
        lambda: achievements.list_achievements(username='counted'))
    # Row reads only. `badge_signature` asks each table for a COUNT and a SUM,
    # which is four scalars in one round trip and is the guard that stops the
    # sweep doing any of this — it is not the reading this test is about.
    reads = [sql for sql in statements
             if sql.startswith('SELECT') and 'COUNT(*)' not in sql]

    for table in ('TASKS', 'XP_EVENTS', 'FOCUS_DAYS', 'ACHIEVEMENTS'):
        hits = [sql for sql in reads if 'FROM "{}"'.format(table) in sql]
        assert len(hits) == 1, (table, hits)

    writes = [sql for sql in statements
              if sql.startswith(('INSERT', 'UPDATE', 'DELETE'))]
    # One: the signature this read was worked out against. The catalogue is
    # already reconciled and nothing new was earned.
    assert len(writes) == 1, writes
    assert 'USER_SETTINGS' in writes[0], writes
