"""What every test gets: a database of its own, and a client that is signed in.

    .venv-fastapi/bin/python -m pytest

## The database

`SUMMIT_DB` decides where the datastore lives (backend/config/settings.py), and
`connection.py` builds one from data/sql/*.sql the first time anything asks for
it. So a test suite needs nothing but a temporary path: point the variable at
one, and the app builds the real schema there and runs against it. No fixtures
to keep in step with the schema, and no chance of a test touching the database
somebody is actually using.

It is set **before `backend` is imported for the first time**, because
`settings.DB_PATH` is read at import. That is the reason for the shape of this
file: the environment is arranged at module scope, above the imports that
depend on it.

`_built` in connection.py is a module-level "have I built it yet" flag, so it
has to be reset per database too, or the second test session finds a fresh path
and a cached "yes".

## The client

`client` is signed in as `tester`; `stranger` is a second account, for the
tests that ask whether one account can reach another's rows. `anon` has no
session at all and is what the guard tests use.

Accounts are created by writing the row and then going through /api/login,
rather than by forging a session cookie: the sign-in path is part of what these
tests are protecting, and a fixture that skips it would let it rot.
"""
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

# Before backend is imported anywhere: settings.DB_PATH is read at import time.
_TMP = tempfile.mkdtemp(prefix='summit-tests-')
os.environ['SUMMIT_DB'] = os.path.join(_TMP, 'test.db')
os.environ['SECRET_KEY'] = 'tests-do-not-need-a-real-one'

# `create_app` refuses to start without these two unless SUMMIT_DEV says the
# install is a laptop (see `deployment_problems` in backend/config/settings.py).
# They are set here rather than by setting SUMMIT_DEV, deliberately: several
# tests in test_ratelimit.py build an app with SUMMIT_DEV *unset*, because that
# is how they check that a deployed install does not hand the verification link
# back to whoever asked. Those tests need the deployed answer to that question
# and a startable app at the same time, which is what these two give them.
os.environ['APP_BASE_URL'] = 'http://testserver'

# The session cookie is marked Secure by default, and a Secure cookie is never
# sent over http:// — which is what TestClient speaks. Left on, every test that
# signs in would appear to sign in and then be anonymous on the next request.
#
# This is the same flag the development server sets for the same reason (see
# `main` in backend/run.py), not a weakening of the check: the secure default
# itself is asserted in tests/test_ratelimit.py, which builds an app without
# this and reads the Set-Cookie header.
os.environ['SUMMIT_INSECURE_COOKIES'] = '1'

import pytest                                            # noqa: E402
from fastapi.testclient import TestClient                # noqa: E402

from backend.config import settings                      # noqa: E402
from backend.database import connection as db            # noqa: E402
from backend.main import create_app                      # noqa: E402
from backend.middleware import limit                     # noqa: E402
from backend.tracking import auth                        # noqa: E402


# ---------------------------------------------------------------------------
# No test calls a model provider
# ---------------------------------------------------------------------------
# This used to be true by accident. Every path to a model went through the
# `anthropic` SDK, and the handful of tests that exercised one stubbed
# `sys.modules['anthropic']` — so a test that forgot to stub it failed on the
# import rather than on the network, loudly and locally.
#
# Adding Groq ended that. It is an HTTP call through httpx, which is installed
# and needs no stubbing to work, so a provider key left in the environment is
# all it takes for a test run to start making real requests. That is not
# hypothetical: the run that prompted this note made five, and read back
# "Groq is rate-limiting this key" as a test failure.
#
# So the keys come out for every test, and a test that wants one sets it
# itself. Autouse, because the tests that would do damage are exactly the ones
# nobody thought to guard.
@pytest.fixture(autouse=True)
def _no_model_keys(monkeypatch):
    """Strip every provider credential, before each test.

    `MILESTONE_PROVIDER` goes too: pinning a provider whose key has just been
    removed is a different state again, and no test should inherit it from
    whatever happens to be in the developer's .env.
    """
    for name in ('GROQ_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID',
                 'HF_TOKEN', 'HUGGINGFACE_API_KEY', 'MILESTONE_PROVIDER'):
        monkeypatch.delenv(name, raising=False)

    # And nothing may put them back. `settings.load_dotenv` reads the .env of
    # whoever is running the tests and fills in any name that is *not already
    # set* — so against a stripped environment it does not top the keys up, it
    # restores them wholesale, in the middle of a test.
    #
    # scripts/plan_backfill.py calls it inside `main()`, which several tests
    # here run directly. That was invisible while the only key in a .env was
    # Anthropic's and every test stubbed the Anthropic SDK: the reload handed
    # back a key whose transport was already faked. It stopped being invisible
    # the moment a .env could carry a Groq key, because that transport is real.
    #
    # A test run has no business reading the developer's .env at all — every
    # value it needs is set in this file or by the test itself — so the reload
    # is a no-op here rather than a thing to remember about.
    monkeypatch.setattr(settings, 'load_dotenv', lambda path=None: None)


PASSWORD = 'not-a-real-password-1'


@pytest.fixture(autouse=True)
def fresh_limiter():
    """Empty rate-limit counters per test.

    The limiter's table is module-level and shared by every app this suite
    builds, so without this the tests that deliberately exhaust a budget would
    leave it exhausted for whatever ran next — and `sign_in` would start
    failing in tests that have nothing to do with rate limiting. Autouse
    because the coupling is invisible from the test that breaks.
    """
    limit.attempts.reset()
    yield
    limit.attempts.reset()


@pytest.fixture
def fresh_db(tmp_path, monkeypatch):
    """A database per test, built from the real schema.

    Per test rather than per session: these tests count rows and assert on
    totals, and a suite where test order changes the answer is a suite that
    passes until somebody adds a test in the middle.
    """
    path = str(tmp_path / 'summit.db')
    monkeypatch.setattr(db, 'DB_PATH', path, raising=False)
    monkeypatch.setattr('backend.config.settings.DB_PATH', path, raising=False)
    monkeypatch.setattr(db, '_built', False)
    monkeypatch.setattr(db, '_last_id', {})
    db._ensure_database()
    yield path

    # The goal matcher's background work, finished while this database is
    # still the one it was queued against. Creating or editing a goal queues a
    # catch-up on worker threads (backend/goal_matcher/queue.py); those
    # threads outlive the test, and the path below is about to be put back, so
    # a job still running would write into the next test's database.
    #
    # Here rather than in an autouse fixture of its own: one depending on
    # `fresh_db` would build a database for every test in the suite, including
    # the ones that never touch it.
    from backend.goal_matcher.queue import work
    assert work.wait_idle(timeout=30), 'goal matcher jobs still running after the test'
    work.clear()


@pytest.fixture
def app(fresh_db):
    return create_app()


def make_account(username):
    """One account, written straight to the table."""
    db.insert_row('users', {
        'id': db.new_id('users'),
        'username': username,
        'email': '%s@example.test' % username,
        'password_hash': auth.hash_password(PASSWORD),
        'email_verified': True,
        'profile_complete': True,
        'xp': 0,
        'level': 1,
        'tasks_completed': 0,
        'theme': 'light',
        'created_at': '2026-01-01T00:00:00',
    })
    return username


def sign_in(app, username):
    """A client holding a real session for `username`.

    Through /api/login rather than by writing the cookie, so the sign-in path
    is exercised by every test that needs an account.
    """
    client = TestClient(app)
    reply = client.post('/api/login',
                        json={'username': username, 'password': PASSWORD})
    assert reply.json().get('success'), reply.json()
    return client


@pytest.fixture
def anon(app):
    """No session. What an unauthenticated caller sees."""
    return TestClient(app)


@pytest.fixture
def client(app):
    """Signed in as `tester`."""
    make_account('tester')
    return sign_in(app, 'tester')


@pytest.fixture
def stranger(app, client):
    """A second account, signed in. Depends on `client` so both exist.

    For the questions only two accounts can ask: can this one see that one's
    rows, and does naming that one in a parameter change what this one gets.
    """
    make_account('stranger')
    return sign_in(app, 'stranger')


@pytest.fixture
def task(client):
    """One task belonging to `tester`, worth 10 XP. Returns its id."""
    reply = client.post('/api/tasks', json={
        'name': 'a task', 'priority': 'medium', 'xp_reward': 10,
    }).json()
    assert reply['success'], reply
    return reply['task_id']
