"""Two requests that write the same badge at once.

The bell and the Achievements page both sweep badges on load, so on a fresh
deploy (new badges in the catalogue) or a fresh earning, two requests can each
find a row missing and each insert it. The second insert hitting the unique
key used to surface as a 500 from /api/notifications. These pin that the loser
of that race carries on.
"""
from backend.api import achievements
from backend.database import connection as db


def test_a_catalogue_sync_that_lost_the_race_carries_on(client, monkeypatch):
    achievements._sync_catalogue()
    # The second request read the table before the first wrote it.
    monkeypatch.setattr(db, 'read_table', lambda table: [])
    achievements._sync_catalogue()


def test_recording_a_badge_twice_at_once_carries_on(client, monkeypatch):
    achievements._sync_catalogue()
    badge = achievements.ALL[0]['id']
    achievements._record_earned('tester', [badge])
    real = db.rows_for
    monkeypatch.setattr(db, 'rows_for', lambda table, user, order='rowid':
                        [] if table == 'user_achievements' else real(table, user, order))
    earned = achievements._record_earned('tester', [badge])
    assert badge in earned
    assert len(real('user_achievements', 'tester')) == 1
