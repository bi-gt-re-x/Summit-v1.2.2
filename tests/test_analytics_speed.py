"""The analytics page's server-side shortcuts, and that none of them changes an answer.

Three were added to make the page usable on a five-year account, and each is
a place a stale or different answer could hide:

- `/api/growth_periods` keeps its daily rollup between calls. Pinned here: an
  edit to anything the rollup reads — a rating, a completion time, a focus
  session — is a rebuild, never a stale score.
- `/api/subjects` counts subject usage in SQL rather than by reading every
  task. Pinned: the same counts.
- `/api/analytics/tasks` and `/api/get_growth_data` return JSON directly,
  skipping FastAPI's encoder walk. Pinned: the same payload.
"""
from fastapi.encoders import jsonable_encoder

from backend.api.analytics import ANALYTICS_TASK_FIELDS, TASK_ORDER
from backend.api.reply import ok
from backend.database import connection as db
from backend.goal_matcher import store as goal_store
from backend.tracking import analytics
from backend.tracking import growth as growth_tracking

from test_growth_periods import ago, finish


def _overall(client, period='30d'):
    return client.get('/api/growth_periods', params={'period': period}).json()['current']['parts']


def test_a_rating_edit_rebuilds_the_cached_rollup(client):
    task_id = finish(client, when=ago(3), difficulty=3, execution=3)
    finish(client, when=ago(5), difficulty=3, execution=3)
    before = _overall(client)
    # Served from the cache the second time, and unchanged.
    assert _overall(client) == before

    client.post('/api/rate_task', json={'task_id': task_id, 'difficulty': 5, 'execution': 5})
    after = _overall(client)
    assert after != before, 'a re-rated task must move the score, not be served stale'
    # And it is exactly what a rebuild from scratch says.
    fresh = analytics.period_scores('tester', '30d', rollup=analytics._daily_rollup('tester'))
    assert after == fresh['current']['parts']


def test_moving_a_task_to_another_day_moves_the_signature(client):
    task_id = finish(client, when=ago(3))
    before = db.rollup_signature('tester')
    db.update_row('tasks', task_id, {'completed_at': ago(9) + 'T12:00:00'}, user_id='tester')
    assert db.rollup_signature('tester') != before


def test_a_focus_session_moves_the_signature(client):
    before = db.rollup_signature('tester')
    db.insert_row('focus_days', {'user_id': 'tester', 'date': ago(1), 'seconds': 1800,
                                 'goal_hours': 1}, key='date')
    assert db.rollup_signature('tester') != before


def test_subject_usage_counts_in_sql_what_the_loop_counted(client):
    for subject in ('mathematics', 'mathematics', 'physics', ''):
        client.post('/api/tasks', json={'name': 't', 'xp_reward': 5, 'subject': subject})
    by_loop = {}
    for task in db.tasks_for('tester'):
        if task.get('subject'):
            by_loop[task['subject']] = by_loop.get(task['subject'], 0) + 1
    assert db.subject_usage('tester') == by_loop
    assert by_loop.get('mathematics') == 2


def test_the_direct_json_responses_are_the_same_payload(client):
    finish(client, when=ago(2), difficulty=4, execution=4)
    fields, rows = db.columns_table_for('tasks', 'tester', ANALYTICS_TASK_FIELDS, order=TASK_ORDER)
    expected_tasks = jsonable_encoder(ok(fields=fields, rows=rows,
                                         goal_links=goal_store.goal_links('tester')))
    assert client.get('/api/analytics/tasks').json() == expected_tasks

    expected_growth = jsonable_encoder(ok(**growth_tracking.series('tester', 0)))
    assert client.get('/api/get_growth_data', params={'days': 0}).json() == expected_growth
