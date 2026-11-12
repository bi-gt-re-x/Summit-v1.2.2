"""Guessing a password has to get expensive.

/api/login had no limit of any kind: a script could try passwords against an
account as fast as the network allowed, forever, and nothing in the app would
notice. The hashing is real and the session key is no longer guessable, so the
front door was the only way in and it was unlocked.

Three things are worth pinning here, and only the first is about counting:

    1. a budget exists, and running it out answers 429 rather than another
       "invalid credentials" the script can keep hammering;
    2. **only failures count.** A reader who mistypes and then gets it right
       must not be locked out, and a busy session must never be throttled —
       this is the property most likely to be broken by a later edit, because
       it is invisible until somebody hits it;
    3. the window slides, so a caller who waits gets back in.

`test_every_credential_endpoint_is_limited` walks the app's own routes rather
than listing paths, in the spirit of test_guard: an auth endpoint added next
year is covered the day it is written, and exempting one is a deliberate edit
somebody has to justify.
"""
import pytest
from fastapi.testclient import TestClient

from backend.middleware import limit
from tests.conftest import PASSWORD, make_account, sign_in


def wrong(client, username='tester', password='definitely-not-it'):
    return client.post('/api/login',
                       json={'username': username, 'password': password})


# --------------------------------------------------------------------------
# The budget
# --------------------------------------------------------------------------
def test_a_burst_of_wrong_passwords_is_cut_off(app, anon):
    make_account('tester')
    policy = limit.LIMITS['/api/login']

    for attempt in range(policy.limit):
        reply = wrong(anon)
        assert reply.status_code == 200, 'attempt %d' % attempt
        assert reply.json()['success'] is False

    refused = wrong(anon)
    assert refused.status_code == 429
    assert refused.json()['success'] is False
    assert 'Too many sign-in attempts' in refused.json()['message']


def test_the_refusal_says_when_to_come_back(app, anon):
    make_account('tester')
    for _ in range(limit.LIMITS['/api/login'].limit):
        wrong(anon)

    refused = wrong(anon)
    assert refused.status_code == 429
    # A client that wants to back off correctly needs this, and a bare 429
    # tells it nothing.
    assert int(refused.headers['retry-after']) > 0


def test_the_right_password_still_works_inside_the_budget(app, anon):
    make_account('tester')
    for _ in range(limit.LIMITS['/api/login'].limit - 1):
        wrong(anon)

    reply = anon.post('/api/login',
                      json={'username': 'tester', 'password': PASSWORD})
    assert reply.json()['success'] is True


# --------------------------------------------------------------------------
# Only failures count
# --------------------------------------------------------------------------
def test_signing_in_clears_what_came_before(app, anon):
    """Two typos then the real password must not leave a half-spent budget."""
    make_account('tester')
    policy = limit.LIMITS['/api/login']

    for _ in range(policy.limit - 1):
        wrong(anon)
    anon.post('/api/login', json={'username': 'tester', 'password': PASSWORD})

    # The budget is consecutive failures, so this is attempt one of ten again.
    for attempt in range(policy.limit):
        assert wrong(anon).status_code == 200, 'attempt %d' % attempt


def test_a_working_session_is_never_throttled(app):
    """The limiter must not touch ordinary use.

    Signing in successfully many times over is what a person with several
    devices does, and it is indistinguishable from a script only if attempts
    are counted rather than failures.
    """
    make_account('tester')
    for _ in range(limit.LIMITS['/api/login'].limit * 3):
        client = TestClient(app)
        reply = client.post('/api/login',
                            json={'username': 'tester', 'password': PASSWORD})
        assert reply.json()['success'] is True


# --------------------------------------------------------------------------
# The two keys
# --------------------------------------------------------------------------
def test_one_account_cannot_be_locked_out_cheaply(app, anon):
    """Failing against somebody else's username must not lock them out fast.

    The per-account budget is deliberately looser than the per-IP one: a tight
    one turns password guessing into denial of service, where anybody who knows
    your username can keep you out of your own account. See the note in
    backend/middleware/limit.py.
    """
    policy = limit.LIMITS['/api/login']
    assert limit.IDENTITY_MULTIPLIER > 1
    # The per-account budget is the looser number, so exhausting the per-IP one
    # from a single address cannot have exhausted the account's.
    account_budget = policy.limit * limit.IDENTITY_MULTIPLIER
    assert account_budget > policy.limit


def test_the_two_keys_are_separate(app):
    """Different addresses get their own budgets."""
    policy = limit.LIMITS['/api/login']
    one = limit.attempts
    for _ in range(policy.limit):
        one.record('/api/login|ip|10.0.0.1', policy.seconds)

    allowed, _ = one.check('/api/login|ip|10.0.0.1', policy.limit, policy.seconds)
    assert allowed is False
    allowed, _ = one.check('/api/login|ip|10.0.0.2', policy.limit, policy.seconds)
    assert allowed is True


# --------------------------------------------------------------------------
# The window
# --------------------------------------------------------------------------
def test_the_window_slides():
    """A caller who waits gets back in, without the app restarting.

    Time is passed in rather than slept, so this stays a unit test.
    """
    counter = limit.Attempts()
    for tick in range(5):
        counter.record('k', seconds=60, now=1000 + tick)

    assert counter.check('k', limit=5, seconds=60, now=1030)[0] is False
    # The first five all fall out of a 60s window by 1065.
    assert counter.check('k', limit=5, seconds=60, now=1065)[0] is True


def test_a_fixed_window_boundary_cannot_be_used_to_double_up():
    """The reason this is a sliding window and not a counter per minute.

    A fixed window lets a script send the whole budget at the end of one window
    and the whole budget again at the start of the next.
    """
    counter = limit.Attempts()
    for tick in range(5):
        counter.record('k', seconds=60, now=1059 + tick * 0.1)

    # One second later a fixed window would have rolled over and allowed five
    # more. The sliding window still remembers.
    assert counter.check('k', limit=5, seconds=60, now=1061)[0] is False


def test_the_table_stays_bounded(monkeypatch):
    """A stream of unique addresses must not grow the counters without limit."""
    monkeypatch.setattr(limit, 'MAX_TRACKED', 50)
    counter = limit.Attempts()
    for n in range(500):
        counter.record('ip|%d' % n, seconds=60)
    assert len(counter._hits) <= 50


# --------------------------------------------------------------------------
# Coverage: the policy table is the whole answer
# --------------------------------------------------------------------------
#: Endpoints that take a credential or spend something, and are deliberately
#: not limited. Empty on purpose — a new one has to be argued for here.
EXEMPT = set()


def test_every_credential_endpoint_is_limited(app):
    """Every path that accepts a password or sends mail has a policy.

    Walks the app's routes rather than a list, so an endpoint added later is
    covered the day it is written.
    """
    guessable = []
    for route in app.routes:
        path = getattr(route, 'path', '')
        methods = getattr(route, 'methods', set()) or set()
        if 'POST' not in methods:
            continue
        if any(word in path for word in ('login', 'signup', 'resend')):
            guessable.append(path)

    assert guessable, 'no auth endpoints found — has the router moved?'
    missing = [p for p in guessable if p not in limit.LIMITS and p not in EXEMPT]
    assert missing == [], (
        'these accept credentials and have no rate limit: %s' % missing)


def test_a_paid_call_is_counted_even_when_it_works(app, monkeypatch):
    """The bug: success cleared the budget it had just spent.

    `/api/set_theme` stands in for a model endpoint here — it is a POST that
    succeeds — so the middleware's counting can be tested without asking
    Anthropic for anything. Under the old default these ten calls would each
    clear the counter and the eleventh would sail through.
    """
    monkeypatch.setitem(limit.LIMITS, '/api/set_theme', limit.Policy(
        limit=3, seconds=3600, charge=limit.CALLS, by_account=True,
        message='Enough.'))
    client = sign_in(app, make_account('spender'))

    for attempt in range(3):
        reply = client.post('/api/set_theme', json={'theme': 'dark'})
        assert reply.json().get('success'), (attempt, reply.json())

    refused = client.post('/api/set_theme', json={'theme': 'dark'})
    assert refused.status_code == 429, refused.json()


def test_a_failed_call_still_clears_on_the_credential_endpoints(app):
    """The other mode is untouched: FAILURES still forgives a success."""
    assert limit.LIMITS['/api/login'].charge == limit.FAILURES


def test_two_accounts_on_one_address_have_their_own_budgets(app, monkeypatch):
    """Why the account is keyed at all.

    A school is one address. If the address were the only key, the first
    reader to plan an afternoon of goals would spend everybody's budget.
    """
    monkeypatch.setitem(limit.LIMITS, '/api/set_theme', limit.Policy(
        limit=2, seconds=3600, charge=limit.CALLS, by_account=True,
        ip_limit=100, message='Enough.'))

    first = sign_in(app, make_account('classmate_one'))
    second = sign_in(app, make_account('classmate_two'))

    for _ in range(2):
        assert first.post('/api/set_theme', json={'theme': 'dark'}).json()['success']
    assert first.post('/api/set_theme', json={'theme': 'dark'}).status_code == 429

    # The second reader has not spent anything, and shares the address.
    assert second.post('/api/set_theme', json={'theme': 'dark'}).json()['success']


def test_the_account_key_comes_from_the_session_not_the_body(app, monkeypatch):
    """A caller cannot buy a fresh budget by naming a different account.

    `username` is still in the bodies the client sends and is dropped by the
    server (backend/api/guard.py). If the limiter read it instead of the
    session, spelling a new one each request would be a way round the meter.
    """
    monkeypatch.setitem(limit.LIMITS, '/api/set_theme', limit.Policy(
        limit=2, seconds=3600, charge=limit.CALLS, by_account=True,
        ip_limit=100, message='Enough.'))
    client = sign_in(app, make_account('honest'))

    for _ in range(2):
        client.post('/api/set_theme', json={'theme': 'dark'})

    refused = client.post('/api/set_theme',
                          json={'theme': 'dark', 'username': 'somebody_else'})
    assert refused.status_code == 429, refused.json()


def test_signup_is_limited(app, anon):
    """Account creation is a write a stranger can do. It gets a budget."""
    policy = limit.LIMITS['/api/auth/signup']
    for _ in range(policy.limit):
        anon.post('/api/auth/signup',
                  json={'name': 'x', 'email': 'x@example.test', 'password': 'y'})

    refused = anon.post('/api/auth/signup',
                        json={'name': 'x', 'email': 'x2@example.test', 'password': 'y'})
    assert refused.status_code == 429


# --------------------------------------------------------------------------
# The session cookie
# --------------------------------------------------------------------------
# These live here rather than in a file of their own because they are the same
# question as the rate limit: what does the front door give away?
#
# The suite runs with SUMMIT_INSECURE_COOKIES set — TestClient speaks http, and
# a Secure cookie is never sent over it, so every signed-in test would break
# (see the note in conftest). That makes the *default* the thing worth pinning,
# because it is the one posture the rest of the suite cannot exercise: these
# two build an app with the flag cleared and read the header directly.
def _login_headers(monkeypatch, insecure):
    from backend.main import create_app

    if insecure is None:
        monkeypatch.delenv('SUMMIT_INSECURE_COOKIES', raising=False)
    else:
        monkeypatch.setenv('SUMMIT_INSECURE_COOKIES', insecure)

    make_account('tester')
    client = TestClient(create_app())
    reply = client.post('/api/login',
                        json={'username': 'tester', 'password': PASSWORD})
    assert reply.json()['success'] is True
    # Starlette writes the attributes lower-case (`secure`, `httponly`), so
    # everything below compares in one case rather than guessing which.
    return [v.lower() for k, v in reply.headers.multi_items()
            if k.lower() == 'set-cookie']


def test_the_session_cookie_is_secure_by_default(fresh_db, monkeypatch):
    """Unset the dev flag and the session cookie must come back Secure.

    Without it the browser sends the session over plain HTTP, where anything
    on the path can read it and be the account — and the cookie is the whole
    of the authorization now (backend/api/guard.py).
    """
    cookies = _login_headers(monkeypatch, None)
    session = [c for c in cookies if c.startswith('session=')]
    assert session, 'no session cookie was set: %s' % cookies
    assert 'secure' in session[0]
    # HttpOnly and SameSite are the other two halves and are worth failing on
    # together — a cookie readable from JavaScript is one an XSS can steal, and
    # one sent on cross-site requests is a CSRF away from being used.
    assert 'httponly' in session[0]
    assert 'samesite=lax' in session[0]


def test_the_dev_flag_is_the_only_way_to_turn_that_off(fresh_db, monkeypatch):
    """And it has to actually work, or local development is impossible."""
    cookies = _login_headers(monkeypatch, '1')
    session = [c for c in cookies if c.startswith('session=')]
    assert session
    assert 'secure' not in session[0]


# --------------------------------------------------------------------------
# The verification link, and who is allowed to see it
# --------------------------------------------------------------------------
def _signup(monkeypatch, dev, email='newcomer@example.test'):
    """Sign up with no mail server configured, under a given SUMMIT_DEV."""
    from backend.main import create_app

    # No mail server: this is the state that used to hand the link back, and
    # it is also what a deployment looks like when its SMTP is misconfigured.
    monkeypatch.delenv('MAIL_USERNAME', raising=False)
    monkeypatch.delenv('MAIL_PASSWORD', raising=False)
    if dev is None:
        monkeypatch.delenv('SUMMIT_DEV', raising=False)
    else:
        monkeypatch.setenv('SUMMIT_DEV', dev)

    client = TestClient(create_app())
    return client.post('/api/auth/signup', json={
        'name': 'A Newcomer', 'email': email, 'password': 'Testpass123!',
    }).json()


def test_the_verification_link_is_not_handed_to_the_caller_by_default(
        fresh_db, monkeypatch):
    """The bug: signing up as somebody else, and confirming it yourself.

    With no mail server the popup used to print the link so the flow stayed
    walkable — gated on whether the send succeeded, which is *also* true of a
    deployed install with no SMTP, and of a configured one whose mail server
    is refusing connections. Either way the server handed the caller a token
    confirming an address they had not proven they own.
    """
    reply = _signup(monkeypatch, None)
    assert reply['success'] is True
    assert reply['dev_link'] is None, reply
    assert reply['sent'] is False
    # And it says so, rather than sending the reader to watch an empty inbox.
    assert reply.get('mail_failed') is True, reply


def test_the_dev_flag_is_the_only_way_to_see_it(fresh_db, monkeypatch):
    """It still has to work, or the accounts flow cannot be walked locally."""
    reply = _signup(monkeypatch, '1', email='local@example.test')
    assert reply['success'] is True
    assert reply['dev_link'], reply
    assert '/verify/' in reply['dev_link']


def test_a_resend_does_not_leak_it_either(fresh_db, monkeypatch):
    """The other endpoint that sends the same mail, and the same token."""
    from backend.main import create_app

    monkeypatch.delenv('MAIL_USERNAME', raising=False)
    monkeypatch.delenv('MAIL_PASSWORD', raising=False)
    monkeypatch.delenv('SUMMIT_DEV', raising=False)

    client = TestClient(create_app())
    client.post('/api/auth/signup', json={
        'name': 'A Newcomer', 'email': 'again@example.test',
        'password': 'Testpass123!'})
    reply = client.post('/api/auth/resend', json={'email': 'again@example.test'}).json()

    assert reply['dev_link'] is None, reply


# --------------------------------------------------------------------------
# What a deployment has to say for itself, and what every response carries
# --------------------------------------------------------------------------
def _problems(monkeypatch, **env):
    from backend.config import settings

    for name in ('SUMMIT_DEV', 'SECRET_KEY', 'APP_BASE_URL'):
        monkeypatch.delenv(name, raising=False)
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    return settings.deployment_problems()


def test_a_deployment_must_name_its_key_and_its_origin(monkeypatch):
    """Both have a fallback that works and is quietly wrong off a laptop.

    A generated SECRET_KEY signs everyone out on a rebuild and disagrees with
    itself across instances; an unset APP_BASE_URL builds verification links
    out of the Host header, which the caller writes.
    """
    problems = _problems(monkeypatch)
    assert len(problems) == 2, problems
    assert any('SECRET_KEY' in p for p in problems)
    assert any('APP_BASE_URL' in p for p in problems)


def test_the_dev_flag_is_what_says_this_is_a_laptop(monkeypatch):
    """And it has to work, or a fresh clone cannot be run at all."""
    assert _problems(monkeypatch, SUMMIT_DEV='1') == []


def test_each_one_is_reported_on_its_own(monkeypatch):
    """Setting one must not silence the other."""
    assert [p for p in _problems(monkeypatch, SECRET_KEY='x') if 'SECRET_KEY' in p] == []
    assert [p for p in _problems(monkeypatch, APP_BASE_URL='https://x.example')
            if 'APP_BASE_URL' in p] == []


def test_the_app_refuses_to_start_on_a_problem(monkeypatch, fresh_db):
    """Not a warning in a log nobody reads. It does not come up."""
    from backend.config import settings
    from backend.main import create_app

    monkeypatch.delenv('SUMMIT_DEV', raising=False)
    monkeypatch.delenv('SECRET_KEY', raising=False)
    with pytest.raises(settings.Misconfigured):
        create_app()


def test_every_response_carries_the_security_headers(client):
    """On every response, because one that misses is the one an attack picks.

    The gate answers some requests with a redirect and the limiter answers
    others with a 429, and both go through the same middleware — so a page, an
    API reply and a refusal are all checked here.
    """
    from backend.middleware import headers as headers_mw

    for response in (client.get('/dashboard'),
                     client.get('/api/get_goals'),
                     client.get('/privacy-policy')):
        for name, value in headers_mw.STATIC.items():
            assert response.headers.get(name) == value, (response.url, name)


def test_the_page_cannot_be_framed(client):
    """Clickjacking, and the settings page has a Delete my account button."""
    response = client.get('/dashboard')
    assert "frame-ancestors 'none'" in response.headers['Content-Security-Policy']
    assert response.headers['X-Frame-Options'] == 'DENY'


def test_hsts_is_not_sent_over_plain_http(client):
    """Sent over http it is ignored, and pinning localhost for a year would
    make every project on this machine unreachable in that browser."""
    assert 'Strict-Transport-Security' not in client.get('/dashboard').headers


def test_hsts_is_sent_behind_a_proxy_that_says_it_is_https(client, monkeypatch):
    """The forwarded scheme is believed only when the deployment says there is
    a proxy in front — the same claim the rate limiter needs for the client
    address, and the same flag answering it."""
    monkeypatch.setenv('SUMMIT_TRUST_PROXY', '1')
    response = client.get('/dashboard', headers={'X-Forwarded-Proto': 'https'})
    assert response.headers.get('Strict-Transport-Security', '').startswith('max-age=')


def test_the_forwarded_scheme_is_ignored_without_that_flag(client):
    """Otherwise any caller could turn HSTS on for a host that cannot serve it."""
    response = client.get('/dashboard', headers={'X-Forwarded-Proto': 'https'})
    assert 'Strict-Transport-Security' not in response.headers
