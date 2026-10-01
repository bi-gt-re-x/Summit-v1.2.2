"""Accounts: who exists, who is signed in, and how they got there.

The journey the home page's popup walks through:

    Log In ──────────────────────────────┐
                                         │
    Create Account → name / e-mail /     │
    password → verification e-mail →     │
    "check your inbox" → verify ─────────┤
                                         │
                                  Complete Profile
                            (username, theme, daily goal)
                                         │
                                     Dashboard

Two things are deliberately environment-driven, so the app runs with nothing
configured and gains the real thing the moment credentials exist:

  * E-mail. With MAIL_USERNAME + MAIL_PASSWORD set, verification links are sent
    over SMTP (Gmail's server by default — any recipient works). Without them
    the app is in dev mode: the link is printed to the server log and handed
    back to the popup, so the flow can be walked end to end with no mail
    account at all.
  * Google sign-in. With GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET set, the
    "Continue with Google" button appears and works. Without them the button
    stays hidden rather than showing a control that cannot work.

Accounts live in the users table in users.sql. An account with no
`email_verified` field predates the e-mail flow and is treated as verified, so
nobody is locked out by a column that did not exist when they signed up.

Passwords are pbkdf2 hashes and nothing else: `check_password` has no plaintext
branch, and the note on it says why that branch could not survive the app being
reachable from anywhere but this machine.

This module holds the rules only. The HTTP endpoints are in
backend/routes/auth.py.

The session lives in a signed cookie, managed by Starlette's SessionMiddleware
(see backend/main.py). `request.session` is a plain dict, so the three
functions that touch it take the request rather than reaching for a global —
which is also what makes them testable without a live server.
"""
import json
import os
import re
import secrets
import smtplib
import ssl
import urllib.parse
import urllib.request
from datetime import date, datetime
from email.message import EmailMessage

# werkzeug only for its password hashing. Accounts already in the database hold
# pbkdf2 hashes werkzeug wrote, so verifying them needs the same code — nothing
# else here depends on it, and no web framework comes with it.
from werkzeug.security import check_password_hash, generate_password_hash

from backend.database import connection as db
from backend.tracking.avatar import avatar_for, avatar_path

# scrypt (werkzeug's default) needs a hashlib build that isn't guaranteed here,
# so pin the hash to pbkdf2-sha256, which is available everywhere.
HASH_METHOD = 'pbkdf2:sha256'

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
USERNAME_RE = re.compile(r'^[A-Za-z0-9._-]{3,24}$')


# --------------------------------------------------------------------------
# Finding accounts
# --------------------------------------------------------------------------
def find_user(users, username=None, email=None):
    """The account matching a username or an e-mail (both case-insensitive)."""
    for u in users:
        if username and str(u.get('username', '')).lower() == str(username).lower():
            return u
        if email and u.get('email') and str(u.get('email', '')).lower() == str(email).lower():
            return u
    return None


def load_user(username):
    """(all users, the one named) — so a caller can mutate and save the store."""
    users = db.users()
    return users, find_user(users, username=username)


def created_date_for(user):
    """When the account was made.

    Prefer the stored created_at; otherwise fall back to the account id, which
    is the creation timestamp in milliseconds. That way the day counter
    accumulates from the real creation date even for accounts that predate the
    created_at field.

    A bare date is a created_at too. scripts/seed_stages.py writes them, and
    without the last format here every one of those accounts fell through to
    the id — which for a seeded id band is a timestamp in 2008 — so the growth
    series walked nineteen years of empty days and shipped 1.5 MB of zeros on
    every analytics visit.
    """
    raw = user.get('created_at')
    if raw:
        for fmt in ('%Y-%m-%dT%H:%M:%S.%f', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
            try:
                return datetime.strptime(raw, fmt).date()
            except (ValueError, TypeError):
                continue
    try:
        return datetime.fromtimestamp(int(user.get('id')) / 1000).date()
    except (ValueError, TypeError, OSError, OverflowError):
        return date.today()


# --------------------------------------------------------------------------
# Passwords and account state
# --------------------------------------------------------------------------
def _is_hashed(value):
    return isinstance(value, str) and value.startswith(('pbkdf2:', 'scrypt:', 'argon2', 'sha256$'))


def check_password(user, password):
    """True when `password` opens this account. Hashes only.

    ## Why there is no plaintext branch any more

    Accounts made before this module stored the password in the clear, and this
    function used to end `return stored == password` so those kept working,
    upgrading themselves to a hash on the next successful sign-in. That was a
    reasonable bargain while the app ran on one laptop and the only rows it
    could match were the author's own.

    It is not one for anything reachable from the internet. The branch means
    the column is trusted to say what it holds: any row whose `password_hash`
    is not recognisably a hash is compared literally, so a value that arrives
    there by any route — a seed file, an import, a restore, a bad migration —
    becomes a working password that is *also* readable by anyone who can see
    the row. data/sql/users.sql shipped exactly that: two accounts whose stored
    value was the password, in a file in the repository.

    So a stored value that is not a hash now opens nothing. The accounts that
    branch existed for are gone from the seed (see the note in users.sql), and
    an account that somehow still holds one is locked rather than guessable —
    it can be recovered through the e-mail flow, which is the path a forgotten
    password is supposed to take.
    """
    stored = user.get('password_hash') or ''
    if not stored or not _is_hashed(stored):
        return False
    try:
        return check_password_hash(stored, password)
    except (ValueError, TypeError):
        return False


def hash_password(password):
    return generate_password_hash(password, method=HASH_METHOD)


def password_problem(password):
    """None when the password is acceptable, else why it isn't."""
    if not password or len(password) < 8:
        return 'Password must be at least 8 characters.'
    if password.isdigit() or password.isalpha():
        return 'Mix letters with numbers or symbols.'
    return None


def is_verified(user):
    """Legacy accounts (no such field) count as verified — nobody gets locked out."""
    return bool(user.get('email_verified', True))


def profile_complete(user):
    """Same rule: an account that predates the profile step is already complete."""
    return bool(user.get('profile_complete', True))


def unique_username(users, wanted):
    """`wanted`, or the first free `wanted2`, `wanted3`… variant."""
    base = re.sub(r'[^A-Za-z0-9._-]', '', str(wanted or '')).strip('._-') or 'user'
    base = base[:24] or 'user'
    if not find_user(users, username=base):
        return base
    for n in range(2, 1000):
        candidate = '{}{}'.format(base[:22], n)
        if not find_user(users, username=candidate):
            return candidate
    return '{}{}'.format(base[:16], secrets.token_hex(3))


# Every table that keys its rows to an account by username.
OWNED_TABLES = ('tasks', 'goals', 'xp_events', 'focus_days', 'day_focus_notes',
                'calendar_entries', 'calendar_events', 'metric_snapshots')


def rename_user(old, new):
    """Rename an account and carry its rows across every other table.

    Only used while finishing a brand-new account, so there is normally nothing
    to carry — but doing it properly means a username chosen at the last step
    can never orphan data.
    """
    if old == new:
        return
    for table in OWNED_TABLES:
        rows = db.read_table(table)
        touched = False
        for row in rows:
            if row.get('user_id') == old:
                row['user_id'] = new
                touched = True
        if touched:
            db.write_table(table, rows)


# --------------------------------------------------------------------------
# The session
# --------------------------------------------------------------------------
def public_user(user):
    """The fields the client is allowed to see."""
    return {
        'username': user.get('username'),
        'name': user.get('name') or user.get('username'),
        'email': user.get('email'),
        'theme': user.get('theme') if user.get('theme') in ('light', 'dark') else 'light',
        'daily_goal': user.get('daily_goal'),
        'profile_complete': profile_complete(user),
        # The account's profile picture, worked out from its id rather than
        # stored — see tracking/avatar.py.
        'avatar': '/static/' + avatar_path(avatar_for(user)),
    }


def sign_in(request, user):
    """Put the account in the session and hand back its public shape."""
    request.session['username'] = user['username']
    request.session.pop('pending_user', None)
    return public_user(user)


def sign_out(request):
    request.session.pop('username', None)


def signed_in_user(request):
    """The signed-in account, or None. Drops a session pointing at a dead account."""
    username = request.session.get('username')
    if not username:
        return None
    user = find_user(db.users(), username=username)
    if not user:
        request.session.pop('username', None)
        return None
    return user


# --------------------------------------------------------------------------
# E-mail verification
# --------------------------------------------------------------------------
def mail_configured():
    return bool(os.environ.get('MAIL_USERNAME') and os.environ.get('MAIL_PASSWORD'))


def base_url(request=None):
    """The origin links in outgoing e-mail point at.

    APP_BASE_URL wins when it is set, which is the only way to get this right
    once the app is reachable somewhere other than the machine it runs on.
    Otherwise it is taken from the request that is asking.
    """
    configured = os.environ.get('APP_BASE_URL')
    if configured:
        return configured.rstrip('/')
    if request is not None:
        return str(request.base_url).rstrip('/')
    return 'http://127.0.0.1:5050'


def _send_mail(to_address, subject, body):
    """Send over SMTP. Returns True when it actually went out."""
    if not mail_configured():
        return False
    host = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
    port = int(os.environ.get('MAIL_PORT', '587'))
    username = os.environ['MAIL_USERNAME']
    password = os.environ['MAIL_PASSWORD']
    sender = os.environ.get('MAIL_FROM', username)

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = sender
    msg['To'] = to_address
    msg.set_content(body)

    context = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=context, timeout=20) as server:
            server.login(username, password)
            server.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=20) as server:
            server.starttls(context=context)
            server.login(username, password)
            server.send_message(msg)
    return True


def send_verification(user, request=None):
    """Mail the account its verification link.

    Returns (sent, link). In dev mode `sent` is False and the link is handed
    back so the popup can show it — the flow stays walkable with no mail set up.
    """
    link = '{}/verify/{}'.format(base_url(request), user['verify_token'])
    body = (
        "Hi {},\n\n"
        "Confirm your e-mail to finish setting up your Summit account:\n\n"
        "{}\n\n"
        "If you didn't create this account you can ignore this message.\n"
    ).format(user.get('name') or user.get('username'), link)
    try:
        sent = _send_mail(user['email'], 'Verify your Summit account', body)
    except Exception as exc:                  # noqa: BLE001 - report, don't crash signup
        print('[auth] verification e-mail failed: {}'.format(exc))
        sent = False
    if not sent:
        print('[auth] DEV MODE - verification link for {}: {}'.format(user['email'], link))
    return sent, link


def new_verify_token(user):
    """Give an account a fresh verification token, stamped now."""
    user['verify_token'] = secrets.token_urlsafe(32)
    user['verify_sent_at'] = datetime.now().isoformat()
    return user['verify_token']


def create_account(name, email, password):
    """Register a local account, unverified, with a pending profile."""
    users = db.users()
    now = datetime.now().isoformat()
    user = {
        'id': db.new_id('users'),
        'username': unique_username(users, email.split('@')[0]),
        'name': name,
        'email': email,
        'password_hash': hash_password(password),
        'provider': 'local',
        'email_verified': False,
        'verify_token': secrets.token_urlsafe(32),
        'verify_sent_at': now,
        'profile_complete': False,
        'xp': 0,
        'level': 1,
        'theme': 'light',
        'created_at': now,
    }
    db.insert_row('users', user)
    return user


def consume_verify_token(token):
    """Mark the account holding `token` verified. Returns the user or None."""
    users = db.users()
    user = next((u for u in users
                 if u.get('verify_token') and u.get('verify_token') == token), None)
    if not user:
        return None
    user['email_verified'] = True
    user['verify_token'] = None
    user['verified_at'] = datetime.now().isoformat()
    db.save_user(user)
    return user


# --------------------------------------------------------------------------
# Google sign-in
# --------------------------------------------------------------------------
GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'


def google_configured():
    return bool(os.environ.get('GOOGLE_CLIENT_ID') and os.environ.get('GOOGLE_CLIENT_SECRET'))


def google_redirect_uri(request=None):
    return '{}/auth/google/callback'.format(base_url(request))


def google_consent_url(state, request=None):
    params = {
        'client_id': os.environ.get('GOOGLE_CLIENT_ID'),
        'redirect_uri': google_redirect_uri(request),
        'response_type': 'code',
        'scope': 'openid email profile',
        'state': state,
        'access_type': 'online',
        'prompt': 'select_account',
    }
    return '{}?{}'.format(GOOGLE_AUTH_URL, urllib.parse.urlencode(params))


def _post_form(url, fields):
    body = urllib.parse.urlencode(fields).encode('utf-8')
    req = urllib.request.Request(url, data=body, method='POST')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode('utf-8'))


def _get_json(url, token):
    req = urllib.request.Request(url)
    req.add_header('Authorization', 'Bearer {}'.format(token))
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode('utf-8'))


def google_profile(code, request=None):
    """Trade an authorization code for the signer-in's Google profile."""
    token = _post_form(GOOGLE_TOKEN_URL, {
        'code': code,
        'client_id': os.environ.get('GOOGLE_CLIENT_ID'),
        'client_secret': os.environ.get('GOOGLE_CLIENT_SECRET'),
        'redirect_uri': google_redirect_uri(request),
        'grant_type': 'authorization_code',
    })
    return _get_json(GOOGLE_USERINFO_URL, token.get('access_token', ''))


def upsert_google_user(info, email):
    """The account behind a Google profile, created on first sign-in."""
    users = db.users()
    user = find_user(users, email=email)
    if not user:
        user = {
            'id': db.new_id('users'),
            'username': unique_username(users, email.split('@')[0]),
            'name': info.get('name') or email.split('@')[0],
            'email': email,
            'password_hash': '',
            'provider': 'google',
            # Google already proved the address — no second verification e-mail.
            'email_verified': True,
            'profile_complete': False,
            'xp': 0,
            'level': 1,
            'theme': 'light',
            'created_at': datetime.now().isoformat(),
        }
        db.insert_row('users', user)
    else:
        user['email_verified'] = True
        db.save_user(user)
    return user
