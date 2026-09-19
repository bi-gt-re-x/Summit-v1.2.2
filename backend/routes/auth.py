"""The account endpoints — everything the sign-in popup and the e-mail link hit.

These are deliberately thin: the rules (hashing, verification, Google, the
session) are in backend/tracking/auth.py. Not a page of its own — the popup
lives on the home page — so it sits here with the other cross-page routes.

The session is a signed cookie managed by Starlette's SessionMiddleware, so
every endpoint that reads or writes it takes the `Request` and hands it to the
tracker. The theme cookie is set on the response the same way Flask did it, so
a page still renders in the right theme before any JS runs.
"""
import secrets
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

from backend.api.reply import fail, ok
from backend.config import settings
from backend.config.settings import THEME_COOKIE_MAX_AGE
from backend.database import connection as db
from backend.tracking import auth, avatar

router = APIRouter(tags=['auth'])


class Login(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None


class LegacySignup(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None


class Signup(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None


class Resend(BaseModel):
    email: Optional[str] = None


class CompleteProfile(BaseModel):
    username: Optional[str] = None
    theme: Optional[str] = None
    daily_goal: Optional[object] = 100


class Avatar(BaseModel):
    avatar: Optional[str] = None


def _with_theme(body, theme):
    """A JSON response that also seeds the theme cookie.

    Set on login and on finishing the profile so every page this device loads
    renders in the right theme immediately, even before any JS runs.
    """
    response = JSONResponse(body)
    response.set_cookie('theme', theme, max_age=THEME_COOKIE_MAX_AGE, samesite='lax')
    return response


def _to_login(**params):
    """Redirect to the sign-in page, carrying the flow's state in the query."""
    query = '&'.join('{}={}'.format(k, v) for k, v in params.items() if v != '')
    return RedirectResponse('/login?{}'.format(query) if query else '/login',
                            status_code=303)


# --------------------------------------------------------------------------
# Sign in / sign out
# --------------------------------------------------------------------------
@router.post('/api/login')
def login(request: Request, body: Login):
    """Sign in with a username or an e-mail address.

    Passwords are checked against a hash and nothing else. This used to carry
    the other half of the legacy-plaintext bargain — match the stored value
    literally, then quietly rewrite it as a hash — and both halves are gone
    together; see `check_password` in backend/tracking/auth.py for why.
    """
    identifier = str(body.username or body.email or '').strip()
    password = str(body.password or '')

    users = db.users()
    user = auth.find_user(users, username=identifier, email=identifier)

    if not user or not auth.check_password(user, password):
        return fail("Account doesn't exist or invalid credentials.")

    # An unconfirmed address used to end the sign-in here. It does not any
    # more: the account opens, and `unverified` rides along on the *success*
    # envelope so the app can carry the banner that asks for the confirmation.
    #
    # Confirming an e-mail proves the address belongs to whoever typed it.
    # That matters for the things the address is *for* — sending to it, and
    # one day recovering an account through it — and it has never been what
    # says whether the tasks behind the login are this person's. The password
    # says that. Holding the whole app behind the inbox charged every new
    # reader a round trip out to their mail and back before they had seen
    # anything worth the trip; see the note on `signup` below.
    payload = auth.sign_in(request, user)
    return _with_theme(ok(
        message='Login successful!',
        user={"username": user['username'], "id": user.get('id'),
              "theme": payload['theme']},
        profile_complete=auth.profile_complete(user),
        unverified=not auth.is_verified(user),
        email=user.get('email'),
    ), payload['theme'])


@router.post('/api/logout')
def logout(request: Request):
    """Drop the session, and the theme cookie with it."""
    auth.sign_out(request)
    response = JSONResponse(ok(message='Logged out.'))
    response.delete_cookie('theme')
    return response


@router.post('/api/avatar')
def set_avatar(request: Request, body: Avatar):
    """Pick the account's profile picture, from the menu under the avatar."""
    user = auth.signed_in_user(request)
    if not user:
        return fail('Sign in first.', status=401)

    name = str(body.avatar or '')
    if not avatar.choose_avatar(user['username'], name):
        return fail('Unknown picture.', status=400)

    return ok(avatar='/static/' + avatar.avatar_path(name))


@router.post('/api/signup')
def legacy_signup(body: LegacySignup):
    """The original username + password sign-up, kept for older clients.

    New accounts go through /api/auth/signup, which adds the e-mail
    verification and profile steps.
    """
    if not body.username or not body.password:
        return fail('Username and password are required.')

    users = db.users()
    if auth.find_user(users, username=body.username):
        return fail('Account already exists.')

    db.insert_row('users', {
        "id": db.new_id('users'),
        "username": body.username,
        "password_hash": auth.hash_password(body.password),
        "xp": 0,
        "level": 1,
        "theme": "light",
        # Recorded so the growth chart's day counter accumulates from the real
        # creation date.
        "created_at": datetime.now().isoformat(),
    })
    return ok(message='Account created successfully! Please log in.')


# --------------------------------------------------------------------------
# Sign up, verify, complete profile
# --------------------------------------------------------------------------
@router.get('/api/auth/providers')
def providers():
    """What the popup should offer: Google only when it can actually work."""
    return ok(google=auth.google_configured(), mail=auth.mail_configured())


@router.post('/api/auth/signup')
def signup(request: Request, body: Signup):
    name = str(body.name or '').strip()
    email = str(body.email or '').strip()
    password = str(body.password or '')

    if not name:
        return fail('Enter your name.', field='name')
    if not auth.EMAIL_RE.match(email):
        return fail('Enter a valid e-mail address.', field='email')
    problem = auth.password_problem(password)
    if problem:
        return fail(problem, field='password')

    if auth.find_user(db.users(), email=email):
        return fail('An account already uses that e-mail. Log in instead.',
                    field='email')

    user = auth.create_account(name, email, password)
    # **Signed in here, before the address is confirmed.** The account used to
    # be parked in `pending_user` and go no further until a link in an inbox
    # was clicked, which put a trip out to another application — on a phone,
    # often another device — between a stranger and the first thing this app
    # had to show them. The cost landed entirely on the people who had not yet
    # decided they wanted it.
    #
    # The mail still goes out on this request, and the account still knows it
    # is unconfirmed: `email_verified` stays False, every answer about the
    # session carries it, and the app wears a banner until the link is
    # followed. What changed is only *when* the asking happens — alongside the
    # work instead of in front of it.
    #
    # `pending_user` is set and then cleared by `sign_in` on the next line,
    # which is correct and not an oversight: it is the marker for an account
    # that exists but has nobody signed in as it, and that is no longer this
    # account. `resend` and the inbox poll find a signed-in account by session
    # instead — see the note on `resend`.
    request.session['pending_user'] = user['username']
    auth.sign_in(request, user)

    sent, link = auth.send_verification(user, request)
    reply = _verification_reply(sent, link, email=email)
    return ok(**reply,
              username=user['username'],
              profile_complete=auth.profile_complete(user),
              message=(
        'Account created — confirm {} when you get a moment.'.format(email)
        if reply['sent'] or reply['dev_link']
        else 'Your account is made, but the confirmation e-mail could not be '
             'sent. Try "Send it again" in a moment.'))


def _verification_reply(sent, link, **extra):
    """The half of a verification response that depends on where it ran.

    The link only ever goes back to the caller in development — see `dev_mode`
    in backend/config/settings.py for why this is asked directly rather than
    inferred from the send having failed. Everywhere else a failure to send is
    reported as one, because the alternative is a reader watching an inbox
    nothing is coming to.
    """
    if sent:
        return dict(extra, sent=True, dev_link=None)
    if settings.dev_mode():
        return dict(extra, sent=False, dev_link=link)
    return dict(extra, sent=False, dev_link=None, mail_failed=True)


@router.post('/api/auth/resend')
def resend(request: Request, body: Resend):
    """Send the confirmation again.

    Three ways to be the account asking, in order of how much they prove.
    Signed in is the usual one now that signing up signs you in — it is the
    banner over the app that asks for this. `pending_user` covers the account
    that has not signed in at all, which is what is left of the old flow: an
    unconfirmed account that signed out, and the inbox panel behind it. The
    address in the body is the last resort and proves nothing, which is why it
    is last and why the reply says no more than that something was sent.
    """
    users = db.users()
    user = auth.find_user(users, username=request.session.get('username')
                          or request.session.get('pending_user'))
    if not user:
        user = auth.find_user(users, email=str(body.email or '').strip())
    if not user:
        return fail('Start again — we lost track of that sign-up.')
    if auth.is_verified(user):
        return ok(already=True, message='That e-mail is already confirmed.')

    auth.new_verify_token(user)
    db.save_user(user)
    sent, link = auth.send_verification(user, request)
    reply = _verification_reply(sent, link)
    return ok(**reply, message=(
        'Sent again to {}.'.format(user.get('email'))
        if reply['sent'] or reply['dev_link']
        else 'That still did not send. Try again in a few minutes.'))


@router.get('/verify/{token}')
def verify_link(request: Request, token: str):
    """The link from the e-mail. Confirms, signs in, opens Complete Profile."""
    user = auth.consume_verify_token(token)
    if not user:
        return _to_login(auth='login', verify='invalid')
    auth.sign_in(request, user)
    if auth.profile_complete(user):
        # The front door rather than the dashboard: '/' is the route that reads
        # the account's chosen start page. See FrontDoor in frontend/src/App.tsx.
        return RedirectResponse('/', status_code=303)
    return _to_login(auth='profile', verify='ok')


@router.get('/api/auth/verify_status')
def verify_status(request: Request):
    """Has the pending account been confirmed yet?

    The inbox screen polls this, so clicking the link in another tab moves this
    one along on its own. Opening the link in THIS browser signs the account
    in, which clears `pending_user` — so fall back to the signed-in account, or
    the poll would keep waiting for something that already happened.

    It also answers "who is signed in", which is what the React app asks it on
    every load. A server-rendered page got `current_user` in its template; a
    single-page app has no such moment, and the session cookie is deliberately
    opaque to the client — so without the username here, an account whose
    localStorage was cleared would be signed in and unable to say as whom.
    `username` is additive: the older popup reads only the two flags.

    ## Why `signed_in` is its own field

    The two jobs used to share one answer: `verified` meant both "the address
    is confirmed" and, to the app, "you are signed in". That worked only while
    the two were the same thing. They are not any more — an account can sign
    in and work with its address still unconfirmed — so the flags separate.
    `signed_in` is the session and is what the app gates on; `verified` is the
    address and is what the banner reads. `AuthProvider` in
    frontend/src/context/AuthContext.tsx is the caller that cares.
    """
    signed_in = request.session.get('username')
    user = auth.find_user(db.users(),
                          username=signed_in or request.session.get('pending_user'))
    if not user:
        return {"success": False, "verified": False, "signed_in": False}
    verified = auth.is_verified(user)
    # The inbox poll's one job: the link was opened in another tab, so the
    # session here has a pending account rather than a signed-in one. Nothing
    # to do when the session is already signed in, which is now the usual case.
    if verified and not signed_in:
        auth.sign_in(request, user)
        signed_in = user.get('username')
    return ok(verified=verified,
              signed_in=bool(signed_in),
              profile_complete=auth.profile_complete(user),
              username=user.get('username'),
              # The banner names the address it is asking about, so that a
              # reader who typed it wrong can see that they did.
              email=user.get('email'),
              avatar='/static/' + avatar.avatar_path(avatar.avatar_for(user)))


@router.post('/api/auth/complete_profile')
def complete_profile(request: Request, body: CompleteProfile):
    """The last step: pick a username, a theme and a daily goal."""
    users = db.users()
    user = auth.find_user(users,
                          username=request.session.get('username')
                          or request.session.get('pending_user'))
    if not user:
        return fail('Sign in again to finish setting up.')
    # No verification check. Picking a username, a theme and a daily goal is
    # the account describing itself to itself; none of it is sent anywhere,
    # and none of it is worth a trip to an inbox to be allowed to do. See the
    # note on `signup`.

    wanted = str(body.username or '').strip()
    if wanted and wanted.lower() != str(user.get('username', '')).lower():
        if not auth.USERNAME_RE.match(wanted):
            return fail('3-24 characters: letters, numbers, dot, '
                        'dash or underscore.', field='username')
        if auth.find_user(users, username=wanted):
            return fail('That username is taken.', field='username')
        old = user['username']
        user['username'] = wanted
        # The one save that still rewrites the table, and it has to. Every
        # owned table has a foreign key onto users.username, and SQLite will
        # not let an UPDATE move a parent key out from under its children —
        # `write_table` switches foreign keys off for exactly this. The rename
        # then carries the children across. Once per account, at sign-up.
        db.save_users(users)
        auth.rename_user(old, wanted)

    user['theme'] = body.theme if body.theme in ('light', 'dark') else 'light'

    try:
        goal = int(body.daily_goal)
    except (TypeError, ValueError):
        goal = 100
    user['daily_goal'] = max(10, min(2000, goal))

    user['profile_complete'] = True
    db.save_user(user)

    payload = auth.sign_in(request, user)
    return _with_theme(ok(user=payload, message='You are all set.'), user['theme'])


# --------------------------------------------------------------------------
# Google sign-in
# --------------------------------------------------------------------------
@router.get('/auth/google')
def google_start(request: Request, next: str = ''):
    if not auth.google_configured():
        return _to_login(auth='login', oauth='unconfigured')
    state = secrets.token_urlsafe(24)
    request.session['oauth_state'] = state
    request.session['oauth_next'] = next or ''
    return RedirectResponse(auth.google_consent_url(state, request), status_code=303)


@router.get('/auth/google/callback')
def google_callback(request: Request, state: str = '', code: str = ''):
    if not auth.google_configured():
        return _to_login(auth='login', oauth='unconfigured')
    if state != request.session.pop('oauth_state', None):
        return _to_login(auth='login', oauth='state')
    if not code:
        return _to_login(auth='login', oauth='denied')

    try:
        info = auth.google_profile(code, request)
    except Exception as exc:              # noqa: BLE001 - surface as a popup message
        print('[auth] google sign-in failed: {}'.format(exc))
        return _to_login(auth='login', oauth='failed')

    email = str(info.get('email') or '').strip()
    if not email or not info.get('email_verified', True):
        return _to_login(auth='login', oauth='noemail')

    user = auth.upsert_google_user(info, email)
    auth.sign_in(request, user)

    nxt = request.session.pop('oauth_next', '') or ''
    if not auth.profile_complete(user):
        return _to_login(auth='profile', next=nxt)
    if nxt.startswith('/'):
        return RedirectResponse(nxt, status_code=303)
    # As above: the front door decides where an account opens.
    return RedirectResponse('/', status_code=303)
