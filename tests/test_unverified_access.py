"""An unconfirmed e-mail address does not lock the account out.

Confirming an address used to be a door in front of the whole app: signing up
parked the account, `/api/login` refused it, `complete_profile` refused it, and
nothing behind the gate opened until a link in an inbox had been followed. The
cost of that fell entirely on people who had not yet decided they wanted the
app — a trip out to another application, often another device, before they had
seen anything worth the trip.

The door is a banner now. These tests pin the four things that had to change
for that, and the two that had to *not* change with them: the address is still
unconfirmed, and it is still asked for.

See `signup` in backend/routes/auth.py for the reasoning, and
frontend/src/components/VerifyBanner.tsx for what replaced the door.
"""
from fastapi.testclient import TestClient

from backend.database import connection as db
from backend.tracking import auth

SIGNUP = {'name': 'A Newcomer', 'email': 'newcomer@example.test',
          'password': 'Testpass123!'}


def _row(email):
    return auth.find_user(db.users(), email=email)


# --------------------------------------------------------------------------
# Signing up
# --------------------------------------------------------------------------
def test_signing_up_signs_you_in(app):
    """The change itself: an account is usable the moment it is made."""
    client = TestClient(app)
    reply = client.post('/api/auth/signup', json=SIGNUP).json()
    assert reply['success'] is True

    status = client.get('/api/auth/verify_status').json()
    assert status['signed_in'] is True, status
    # ...and it is genuinely the new account, not a leftover session.
    assert status['username'] == _row(SIGNUP['email'])['username']


def test_signing_up_does_not_confirm_the_address(app):
    """The half that must NOT change.

    Nothing here proves the person typing owns that inbox, and signing them in
    is not a claim that it does. The flag stays false until the link is
    followed, which is what keeps the banner up and what `verified` means
    everywhere else.
    """
    client = TestClient(app)
    client.post('/api/auth/signup', json=SIGNUP)

    assert _row(SIGNUP['email'])['email_verified'] is False
    status = client.get('/api/auth/verify_status').json()
    assert status['verified'] is False, status
    # Signed in and unconfirmed at the same time — the state the whole change
    # exists to allow, and the one the old two-flags-in-one answer could not
    # express.
    assert status['signed_in'] is True


def test_a_new_account_still_has_a_profile_to_finish(app):
    """Signing up early must not skip Complete Profile, only the inbox."""
    client = TestClient(app)
    reply = client.post('/api/auth/signup', json=SIGNUP).json()
    assert reply['profile_complete'] is False, reply


# --------------------------------------------------------------------------
# Signing in again
# --------------------------------------------------------------------------
def test_an_unconfirmed_account_can_log_in(app):
    """It used to be refused outright, with `unverified` on the failure."""
    TestClient(app).post('/api/auth/signup', json=SIGNUP)

    fresh = TestClient(app)
    reply = fresh.post('/api/login', json={
        'username': SIGNUP['email'], 'password': SIGNUP['password']}).json()

    assert reply['success'] is True, reply
    # The flag survives the move from the failure envelope to the success one,
    # because the banner is what reads it.
    assert reply['unverified'] is True
    assert reply['email'] == SIGNUP['email']
    assert fresh.get('/api/auth/verify_status').json()['signed_in'] is True


def test_a_confirmed_account_is_not_nagged(app):
    """The flag is about this account, not about every account."""
    client = TestClient(app)
    reply = client.post('/api/auth/signup', json=SIGNUP).json()
    auth.consume_verify_token(_row(SIGNUP['email'])['verify_token'])

    fresh = TestClient(app)
    reply = fresh.post('/api/login', json={
        'username': SIGNUP['email'], 'password': SIGNUP['password']}).json()

    assert reply['success'] is True
    assert reply['unverified'] is False, reply
    assert fresh.get('/api/auth/verify_status').json()['verified'] is True


def test_a_wrong_password_is_still_a_wrong_password(app):
    """Opening the door for unconfirmed accounts opens it for nothing else."""
    TestClient(app).post('/api/auth/signup', json=SIGNUP)

    reply = TestClient(app).post('/api/login', json={
        'username': SIGNUP['email'], 'password': 'not-the-password'}).json()

    assert reply['success'] is False, reply


# --------------------------------------------------------------------------
# Finishing setup
# --------------------------------------------------------------------------
def test_the_profile_can_be_finished_before_the_address_is(app):
    """Picking a username, a theme and a goal is not worth a trip to an inbox."""
    client = TestClient(app)
    client.post('/api/auth/signup', json=SIGNUP)

    reply = client.post('/api/auth/complete_profile', json={
        'username': 'newcomer', 'theme': 'dark', 'daily_goal': 150}).json()

    assert reply['success'] is True, reply
    row = _row(SIGNUP['email'])
    assert row['profile_complete'] is True
    assert row['username'] == 'newcomer'
    # Still unconfirmed. Finishing setup is not a second way to verify.
    assert row['email_verified'] is False


def test_a_gated_page_opens_for_an_unconfirmed_account(app):
    """The end of it: the gate reads the session, and the session is real.

    backend/middleware/gate.py checks `signed_in_user` and `profile_complete`
    and has never checked the address — so this is the assertion that the
    session written at signup is the kind the gate accepts.
    """
    client = TestClient(app)
    client.post('/api/auth/signup', json=SIGNUP)
    client.post('/api/auth/complete_profile', json={'daily_goal': 100})

    reply = client.get('/dashboard', follow_redirects=False)
    assert reply.status_code == 200, reply.status_code


# --------------------------------------------------------------------------
# Still asking
# --------------------------------------------------------------------------
def test_the_banner_can_ask_for_the_mail_again(app):
    """Resend has to find the account by session now.

    `sign_in` clears `pending_user`, which used to be the only way `resend`
    identified the caller — so signing up and then pressing "Send it again"
    would have found nobody at all without the session lookup.
    """
    client = TestClient(app)
    client.post('/api/auth/signup', json=SIGNUP)

    before = _row(SIGNUP['email'])['verify_token']
    reply = client.post('/api/auth/resend', json={}).json()

    assert reply['success'] is True, reply
    # A fresh token, so the mail that goes out is one that works.
    assert _row(SIGNUP['email'])['verify_token'] != before


def test_a_dev_server_says_it_sent_nothing(app, monkeypatch):
    """With no mail set up a dev server hands the link back instead of sending
    it, and the reply says so rather than "Sent again" (found walking the flow,
    2026-10-11)."""
    from backend.config import settings
    monkeypatch.setattr(settings, 'dev_mode', lambda: True)
    client = TestClient(app)
    client.post('/api/auth/signup', json=SIGNUP)
    reply = client.post('/api/auth/resend', json={}).json()
    assert reply['dev_link'], reply
    assert not reply['message'].startswith('Sent again'), reply
    assert 'nothing was sent' in reply['message']


def test_the_link_still_confirms_the_address(app):
    """The banner has to have an end. This is it."""
    client = TestClient(app)
    client.post('/api/auth/signup', json=SIGNUP)

    token = _row(SIGNUP['email'])['verify_token']
    client.get('/verify/%s' % token, follow_redirects=False)

    assert _row(SIGNUP['email'])['email_verified'] is True
    assert client.get('/api/auth/verify_status').json()['verified'] is True
