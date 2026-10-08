"""The numbers this app is about, checked against each other.

Summit computes the same quantity in more than one place on purpose — the ring
at the top of the badge wall and the wall beneath it, `users.xp` and the XP
ledger, a category bar and the badges filed under it. That is a reasonable
design and it has one failure mode, which is the two copies disagreeing. These
are the tests that notice.

The first of them is a real regression: `/api/achievements` reported `earned`
as the number of rows in `user_achievements`, and that table never deletes, so
it still held rows for badges the catalogue had since renamed. The page said
"71 Achievements Earned" over a wall with 68 badges on it, and the ring and the
five category bars each gave a third and fourth answer.
"""
import re
from pathlib import Path

from backend.api import achievements as wall
from backend.api import settings, subjects
from backend.database import connection as db


def finish_task(client, xp=10, name='task'):
    """Create a task and complete it. Returns the completion's reply."""
    made = client.post('/api/tasks', json={'name': name, 'xp_reward': xp}).json()
    return client.post('/api/complete_task', json={'task_id': made['task_id']}).json()


# --------------------------------------------------------------------------
# The badge wall
# --------------------------------------------------------------------------
def test_the_earned_figure_counts_the_wall(client):
    """The headline, the ring and the category bars are one number."""
    finish_task(client)
    body = client.post('/api/achievements').json()

    on_the_wall = sum(1 for badge in body['achievements'] if badge['earned'])
    in_categories = sum(category['earned'] for category in body['categories'])

    assert body['earned'] == on_the_wall
    assert body['earned'] == in_categories
    assert body['total'] == len(body['achievements'])


def test_a_badge_the_catalogue_dropped_is_not_counted(client):
    """The exact shape of the bug: a stale row from a renamed badge.

    `user_achievements` never deletes — see `_sync_catalogue` — so a row for an
    id the catalogue no longer knows survives forever. It must not reach the
    count.
    """
    finish_task(client)
    db.insert_row('achievements', {'id': 'retired-badge', 'name': 'Retired',
                                   'description': 'x', 'metric': 'tasks',
                                   'threshold': 1, 'tier': 1})
    db.insert_row('user_achievements', {
        'user_id': 'tester', 'achievement_id': 'retired-badge',
        'earned_at': '2026-01-01T00:00:00'})

    body = client.post('/api/achievements').json()
    assert 'retired-badge' not in {b['id'] for b in body['achievements']}
    assert body['earned'] == sum(1 for b in body['achievements'] if b['earned'])


def test_the_achievement_score_is_the_earned_badges(client):
    finish_task(client)
    body = client.post('/api/achievements').json()
    assert body['achievement_xp'] == sum(
        b['xp_reward'] for b in body['achievements'] if b['earned'])
    assert body['total_xp'] == sum(b['xp_reward'] for b in body['achievements'])


def test_a_hidden_badge_gives_nothing_away_until_it_is_earned(client):
    """Five of the hundred, and the page must not be able to leak them."""
    body = client.post('/api/achievements').json()
    secret = [b for b in body['achievements'] if b['hidden'] and not b['earned']]
    assert len(secret) == len(wall.HIDDEN)
    for badge in secret:
        assert badge['name'] == '???'
        assert badge['threshold'] == 0
        assert badge['value'] == 0
        assert badge['metric'] == ''
        assert badge['title'] is None
        # The real names must not appear anywhere in the payload.
        assert badge['description'] == 'A hidden achievement. Keep going.'


def test_a_badge_stays_earned_after_the_figure_falls(client):
    """A streak badge won in March is still won in July.

    The catalogue reads `best_streak`, not the current one, and the row in
    `user_achievements` is what fixes the date — so nothing can un-earn it.
    """
    finish_task(client)
    earned_first = {b['id'] for b in client.post('/api/achievements').json()['achievements']
                    if b['earned']}
    user = db.find_row('users', db.rows_for('tasks', 'tester')[0]['user_id'],
                       key='username') or {}
    db.update_row('users', user['id'], {'current_streak': 0, 'tasks_completed': 0, 'xp': 0})

    still = {b['id'] for b in client.post('/api/achievements').json()['achievements']
             if b['earned']}
    assert earned_first <= still


# --------------------------------------------------------------------------
# XP
# --------------------------------------------------------------------------
def test_the_account_total_matches_the_ledger(client):
    """`users.xp` against `SUM(amount)`. The check to reach for if they drift."""
    for i in range(5):
        finish_task(client, xp=7, name='task %d' % i)

    user = db.rows_for('tasks', 'tester') and db.find_row(
        'users', 'tester', key='username')
    ledger = sum(row.get('amount', 0) for row in db.rows_for('xp_events', 'tester'))
    assert user['xp'] == ledger == 35


def test_completing_a_task_writes_exactly_one_ledger_row(client, task):
    before = len(db.rows_for('xp_events', 'tester'))
    client.post('/api/complete_task', json={'task_id': task})
    assert len(db.rows_for('xp_events', 'tester')) == before + 1


def test_the_level_follows_the_total(client):
    """Level N costs N x 100, and the stored level is derived from the total."""
    reply = finish_task(client, xp=250)
    user = db.find_row('users', 'tester', key='username')
    assert user['level'] == reply['new_level']
    assert user['xp'] == 250


def test_reading_the_wall_never_awards_xp(client):
    """The endpoint scores the record; it does not get to change it."""
    finish_task(client, xp=10)
    before = db.find_row('users', 'tester', key='username')['xp']
    for _ in range(3):
        client.post('/api/achievements')
    assert db.find_row('users', 'tester', key='username')['xp'] == before


# --------------------------------------------------------------------------
# The caps the wizard warns about
# --------------------------------------------------------------------------
#
# frontend/src/components/Analytics/ambitionCheck.ts holds copies of three
# server-side caps. It has to: it is the warning that says what the server is
# about to truncate, so it cannot ask the server at the moment it needs to
# know, and a warning that names the wrong number is worse than no warning —
# "only the first twelve are kept" over a server that keeps ten is a sentence
# somebody will act on and lose two stages to.
#
# The copies are commented as copies and its own tests name the constants they
# stand in for, but nothing so far compares the two halves. Both sides pass
# happily while disagreeing, which is the exact failure this file exists for.
def _exported_number(name):
    """Read `export const <name> = <n>;` out of the wizard's checker."""
    source = (Path(__file__).resolve().parent.parent / 'frontend' / 'src'
              / 'components' / 'Analytics' / 'ambitionCheck.ts').read_text()
    found = re.search(r'export const %s = (\d+);' % name, source)
    # A miss is a failure rather than a skip: the constant being renamed or
    # dropped is the same silence this test is here to break.
    assert found, '%s is no longer exported from ambitionCheck.ts' % name
    return int(found.group(1))


def test_the_wizard_warns_with_the_length_the_server_truncates_at():
    """`AIM_MAX` against `AMBITION_TEXT_MAX`, backend/api/settings.py."""
    assert _exported_number('AIM_MAX') == settings.AMBITION_TEXT_MAX


def test_the_wizard_warns_with_the_number_of_checkpoints_the_server_keeps():
    """`CHECKPOINTS_MAX` against `MILESTONES_PER_SUBJECT`, backend/api/subjects.py."""
    assert _exported_number('CHECKPOINTS_MAX') == subjects.MILESTONES_PER_SUBJECT


def test_the_wizard_warns_with_the_title_length_the_server_keeps():
    """`CHECKPOINT_MAX` against `MILESTONE_TITLE_MAX`, backend/api/subjects.py."""
    assert _exported_number('CHECKPOINT_MAX') == subjects.MILESTONE_TITLE_MAX
