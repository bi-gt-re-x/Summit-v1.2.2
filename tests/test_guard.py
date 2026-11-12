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
    '/api/auth/email_check',         # the sign-up form, before there's an account
    '/api/auth/resend',              # keyed on `pending_user` in the session
    '/api/auth/providers',           # whether the Google button can work
    '/api/auth/verify_status',       # answers "nobody" rather than refusing
    '/api/auth/complete_profile',    # reads `pending_user`, pre-sign-in
    '/api/avatar',                   # checks the session itself, returns 401
    '/api/set_theme',                # a visitor has a theme too
    # The skill library's written practice steps. The table they come from has
    # no user_id at all — it is the curriculum, the same rows for every reader
    # — so there is nothing here to protect and nobody to identify. A session
    # check would guard the syllabus of the app against the person running it.
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
    assert len(account_routes(app)) > 20


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
    """`?username=` names somebody else; the session still decides."""
    client.post('/api/amc/problems/step-10-02/attempt', json={'answer': 'A'})
    theirs = stranger.get('/api/amc/review', params={'username': 'tester'}).json()
    assert theirs['due'] == [] and theirs['upcoming'] == []


def test_the_username_in_a_body_is_ignored(client, stranger):
    """A body naming another account still writes to the caller's own."""
    stranger.post('/api/amc/problems/step-10-02/attempt',
                  json={'answer': 'A', 'username': 'tester'})
    assert client.get('/api/amc/review').json()['upcoming'] == []
    assert stranger.get('/api/amc/review').json()['upcoming'][0]['id'] == 'step-10-02'


def test_a_mock_cannot_be_read_or_deleted_by_another_account(client, stranger):
    """Mock results are keyed by id; the id alone must not be enough."""
    mock_id = client.post('/api/amc/contests/step-mock-aime/submit',
                          json={'answers': {'1': '55'}}).json()['id']
    assert not stranger.get('/api/amc/mocks/%s' % mock_id).json()['success']
    stranger.delete('/api/amc/mocks/%s' % mock_id)
    assert client.get('/api/amc/mocks/%s' % mock_id).json()['success']


def test_a_signed_out_session_answers_401_not_an_error_page(anon):
    """The client turns a 401 into a sign-in prompt; anything else is a bug."""
    reply = anon.get('/api/amc/dashboard')
    assert reply.status_code == 401
    assert reply.json()['success'] is False


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
