"""Nobody reaches an account but the account.

The regression suite for the hole backend/api/guard.py closed: every endpoint
under /api took `username` as a parameter and believed it, so a request with no
cookie at all could read — and write, and delete — any account by name.

Three questions, and the first is the one that has to keep being asked as the
app grows:

    1. does every account endpoint refuse a caller with no session?
    2. is the `username` a caller sends actually ignored?
    3. can a signed-in account reach another account's rows by id?

`test_every_account_endpoint_requires_a_session` walks `app.routes` rather than
listing paths, so an endpoint added next year is covered the day it is written.
A new public endpoint has to be added to PUBLIC deliberately, which is the
review this needs.
"""
import pytest

from backend.database import connection as db

#: Endpoints that answer without a session, and why each one may.
PUBLIC = {
    '/api/login',                    # the way in
    '/api/logout',                   # must work from a dead session
    '/api/signup',                   # the older sign-up
    '/api/auth/signup',
    '/api/auth/resend',              # keyed on `pending_user` in the session
    '/api/auth/providers',           # whether the Google button can work
    '/api/auth/verify_status',       # answers "nobody" rather than refusing
    '/api/auth/complete_profile',    # reads `pending_user`, pre-sign-in
    '/api/avatar',                   # checks the session itself, returns 401
    '/api/set_theme',                # a visitor has a theme too
    '/api/daily_quote',              # the same line for everybody
    # The skill library's written practice steps. The table they come from has
    # no user_id at all — it is the curriculum, the same rows for every reader
    # — so there is nothing here to protect and nobody to identify. A session
    # check would guard the syllabus of the app against the person running it.
    # See the note at the top of backend/api/skillsteps.py.
    '/api/skill-steps',
    '/api/skill-steps/coverage',
}


def account_routes(app):
    """Every /api route that is not deliberately public."""
    out = []
    for route in app.routes:
        path = getattr(route, 'path', '')
        if not path.startswith('/api') or path in PUBLIC:
            continue
        for method in sorted(getattr(route, 'methods', set()) - {'HEAD', 'OPTIONS'}):
            out.append((method, path))
    return out


def test_there_are_account_routes_to_check(app):
    """Guards the guard: a walk that finds nothing would pass silently."""
    assert len(account_routes(app)) > 40


def test_every_account_endpoint_requires_a_session(app, anon):
    """No cookie, no data — on every route, not a sample of them."""
    leaked = []
    for method, path in account_routes(app):
        # A path parameter's value does not matter: the session is checked
        # before the handler runs at all.
        url = path.replace('{task_id}', 'x').replace('{entry_id}', 'x') \
                  .replace('{event_id}', 'x').replace('{subject_id}', 'x')
        reply = anon.request(method, url, json={})
        if reply.status_code != 401:
            leaked.append((method, path, reply.status_code))
    assert not leaked, 'these answered without a session: %r' % (leaked,)


def test_the_username_a_caller_sends_is_ignored(client, stranger):
    """Naming another account returns your own rows, not theirs."""
    client.post('/api/tasks', json={'name': 'mine', 'xp_reward': 1})
    stranger.post('/api/tasks', json={'name': 'theirs', 'xp_reward': 1})

    # Signed in as tester, asking for stranger's tasks by name.
    tasks = client.get('/api/tasks', params={'username': 'stranger'}).json()['tasks']
    assert [t['title'] for t in tasks] == ['mine']
    assert {t['user_id'] for t in tasks} == {'tester'}


def test_the_username_in_a_body_is_ignored(client, stranger):
    """The same, for the POSTs that carry it in the body."""
    client.post('/api/tasks', json={'name': 'filed under tester',
                                    'username': 'stranger', 'xp_reward': 1})
    assert [t['title'] for t in db.rows_for('tasks', 'stranger')] == []
    assert [t['title'] for t in db.rows_for('tasks', 'tester')] == ['filed under tester']


def test_a_task_cannot_be_deleted_by_another_account(client, stranger, task):
    """`task` belongs to tester. stranger is signed in and knows its id."""
    stranger.delete('/api/tasks/%s' % task)
    assert db.find_row('tasks', task, user_id='tester') is not None


@pytest.mark.parametrize('path, payload', [
    ('/api/get_task_status', {'task_id': None}),
    ('/api/timer_expired', {'task_id': None}),
    ('/api/delete_task_no_tracking', {'id': None}),
])
def test_endpoints_keyed_by_id_check_the_owner(client, stranger, task, path, payload):
    """These four found a row by id alone and never asked whose it was."""
    body = {key: (task if value is None else value) for key, value in payload.items()}
    reply = stranger.post(path, json=body).json()
    assert reply['success'] is False
    # Still tester's, untouched.
    row = db.find_row('tasks', task, user_id='tester')
    assert row is not None and row.get('status') == 'todo'


def test_another_accounts_goal_cannot_be_advanced(client, stranger):
    """`/api/update_goal_progress` moved any goal in the table by name."""
    made = client.post('/api/add_goal', json={
        'title': 'read more', 'goal_type': 'xp', 'target_xp': 500,
    }).json()
    assert made['success'], made
    goal_id = db.rows_for('goals', 'tester')[0]['id']

    reply = stranger.post('/api/update_goal_progress',
                          json={'goal_id': goal_id, 'xp_to_add': 400}).json()
    assert reply['success'] is False
    assert (db.find_row('goals', goal_id, user_id='tester').get('current_xp') or 0) == 0


def test_a_signed_out_session_answers_401_not_an_error_page(anon):
    """The client reads this status to sign out — see services/api.ts."""
    reply = anon.get('/api/achievements')
    assert reply.status_code == 401
    assert reply.json() == {'success': False, 'message': 'Sign in to continue.'}


def test_no_request_model_declares_a_username(app):
    """The field is gone, and a future one should not creep back.

    Not cosmetic. A Pydantic model that still declared `username` said the
    server read it, and a handler added later would reasonably believe that.
    The account comes from `current_username` and from nowhere else — this test
    is what keeps the models honest about it.

    The sign-in endpoints are the exception and are named: /api/login and
    /api/signup take a username because there is no session yet to take it
    from, which is the whole point of them.
    """
    import ast
    import pathlib

    signup_models = {'Login', 'LegacySignup', 'Signup', 'CompleteProfile'}
    offenders = []
    for path in sorted(pathlib.Path('backend').rglob('*.py')):
        for node in ast.walk(ast.parse(path.read_text())):
            if not isinstance(node, ast.ClassDef):
                continue
            if not any(getattr(b, 'id', getattr(b, 'attr', '')) == 'BaseModel'
                       for b in node.bases):
                continue
            if node.name in signup_models:
                continue
            for stmt in node.body:
                if isinstance(stmt, ast.AnnAssign) and getattr(stmt.target, 'id', '') == 'username':
                    offenders.append('%s.%s' % (path, node.name))
    assert not offenders, 'these still declare a username: %r' % (offenders,)


def test_no_request_model_defaults_to_a_dependency(app):
    """`Depends()` belongs in a handler signature, never in a model.

    A field defaulting to `Depends(current_username)` is not injected — it is a
    Depends object sitting where a string should be, and it reads as if the
    body were authenticated. Three models picked one up during the migration
    and nothing failed, because no handler read them any more.
    """
    import ast
    import pathlib

    offenders = []
    for path in sorted(pathlib.Path('backend').rglob('*.py')):
        for node in ast.walk(ast.parse(path.read_text())):
            if not isinstance(node, ast.ClassDef):
                continue
            if not any(getattr(b, 'id', getattr(b, 'attr', '')) == 'BaseModel'
                       for b in node.bases):
                continue
            for stmt in node.body:
                if (isinstance(stmt, ast.AnnAssign) and isinstance(stmt.value, ast.Call)
                        and getattr(stmt.value.func, 'id', '') == 'Depends'):
                    offenders.append('%s.%s.%s'
                                     % (path, node.name, stmt.target.id))
    assert not offenders, 'Depends() inside a model: %r' % (offenders,)
