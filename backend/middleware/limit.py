"""Rate limiting, for the endpoints where guessing is the attack.

    LIMITS is the whole answer to "what is throttled, and how hard?"

The same shape as the account gate next door: one table, read by one piece of
middleware, so the policy can be read in ten seconds rather than gathered from
decorators spread across four routers. An endpoint that needs a limit gets a
line here; nothing else changes.

## What this is for

`/api/login` had no limit of any kind. A script could try passwords against an
account as fast as the network allowed, forever, and nothing in the app would
notice or care — no delay, no lockout, no log. That is the whole attack: the
password hashing is real (werkzeug pbkdf2, see tracking/auth.py) and the
session cookie is signed with a key that is no longer guessable, so the front
door was the only way in and it was unlocked.

Three other endpoints are here for a different reason. Sign-up creates rows,
resend sends e-mail, and `/api/suggest_milestones` and `/api/suggest_steps`
spend money at Anthropic — none of them is a way *in*, and all of them are a
way to make the app expensive or noisy for somebody else.

## Two keys, on purpose

Login is limited per IP **and** per account, and the two numbers are
deliberately different.

Per IP is the strict one, because one host trying many passwords is the common
case and there is no honest reason to attempt twenty sign-ins a minute from one
address.

Per account is the loose one, and it is loose for a reason worth stating: a
tight per-account limit is itself an attack. Anyone who knows your username
could lock you out of your own account by failing to log in as you a few times,
which trades a password-guessing problem for a denial-of-service one. So the
per-account budget is generous enough that a real person sharing an office
network never reaches it, and tight enough to make a slow distributed guessing
run take months.

**On the credential endpoints, only failures count.** A successful sign-in
clears both counters, so somebody who typed their password wrong twice and then
got it right starts fresh, and a long-lived session refreshing pages is never
throttled at all.

## The money endpoints are the other way round

The three `suggest_*` paths are not a way in and are not guessed at; they are a
way to spend somebody else's Anthropic key, and their cost lands when they
*work*. Charging them as failures did not limit them — it un-limited them,
because the middleware clears a key on success, so every working request wiped
the budget it had just spent and a loop of them never reached a limit.

They are `charge=CALLS`: every request counts, nothing clears. And they are
keyed per **account** rather than only per address, because the account is what
spends the money — a shared school network is one address for hundreds of
readers, and a phone is a new address every hour. The per-IP budget stays as a
much larger backstop against one host working through a pile of accounts.

## What this is not

In-process and per-worker. Two uvicorn workers keep two sets of counters and a
restart forgets them, so the real budget is the one below times the number of
processes. That is honest for how this runs — one process, SQLite, WAL — and it
is the thing to replace first if the app ever runs behind more than one. A
shared store (Redis, or a table in the database) is the same table above with a
different backend; nothing else here changes.

It is also not a defence against a large botnet, which no per-IP limit is. It
raises the cost of the cheap attack, which is the one that actually happens.
"""
import json
import threading
import time
from collections import deque

from starlette.responses import JSONResponse, Response

from backend.config import settings


#: What a request costs against its budget.
#:
#: `FAILURES` is the guessing case and the original one: only a refused attempt
#: is counted, and a success clears the counter, so the budget is *consecutive
#: failures* and somebody who mistypes twice and then signs in is never
#: throttled.
#:
#: `CALLS` is the opposite, and the endpoints that spend money need it. Their
#: cost is on the way *out*, not on a refusal — a successful draft is the one
#: that bills Anthropic. Counted as failures, they were not limited at all:
#: every successful call cleared the budget it had just spent, so a loop of
#: working requests never reached the limit. Under CALLS every request counts
#: and nothing clears.
FAILURES = 'failures'
CALLS = 'calls'


class Policy:
    """How many attempts, over how long, and what to say when they run out."""

    def __init__(self, limit, seconds, message, by_ip=True, by_identity=None,
                 by_account=False, charge=FAILURES, ip_limit=None):
        self.limit = limit
        self.seconds = seconds
        self.message = message
        self.by_ip = by_ip
        #: Field in the JSON body to key a second, per-subject budget on.
        self.by_identity = by_identity
        #: Key a budget on the signed-in account, read from the session.
        #:
        #: Not from the body. `username` is a field the client still sends and
        #: the server deliberately drops (see backend/api/guard.py), so keying
        #: on it would let a caller spell a new account each request and hold a
        #: fresh budget every time. The session is the only thing on a request
        #: that says who is asking and cannot be chosen by whoever asks.
        self.by_account = by_account
        #: FAILURES or CALLS. See the note above.
        self.charge = charge
        #: A separate budget for the per-IP key, when one address should be
        #: allowed more than one account is.
        #:
        #: This is for the endpoints metered per account. There, the account is
        #: the real limit and the address is a backstop: it stops one host
        #: burning the key through a pile of accounts, and it must not be the
        #: number that a shared network reaches first. A school is one address
        #: for hundreds of readers, so an IP budget equal to one reader's is a
        #: limit on the school, which is the bug rather than the feature.
        self.ip_limit = ip_limit


#: Path -> policy. The whole answer to what is throttled.
#:
#: Every one of these takes something a caller can guess, spend or send. A new
#: endpoint that does any of those wants a line here — and
#: tests/test_ratelimit.py fails if a credential-taking one does not have it.
LIMITS = {
    '/api/login': Policy(
        limit=10, seconds=300,
        message='Too many sign-in attempts. Wait a few minutes and try again.',
        by_identity='identity'),
    '/api/auth/signup': Policy(
        limit=5, seconds=3600,
        message='Too many accounts created from here. Try again later.'),
    '/api/signup': Policy(
        limit=5, seconds=3600,
        message='Too many accounts created from here. Try again later.'),
    # Every call counts, found or not: it answers "is this address taken", so
    # the cost is in asking, not in being wrong. Plenty for a person retyping
    # an address; far too few to check a list.
    '/api/auth/email_check': Policy(
        limit=30, seconds=600, charge=CALLS,
        message='Too many checks for now. Wait a few minutes and try again.'),
    '/api/auth/resend': Policy(
        limit=5, seconds=3600,
        message='Too many emails requested. Check your inbox, then try again.',
        by_identity='email'),
    # --- the three that spend money -------------------------------------
    #
    # All three are `charge=CALLS` and keyed per account as well as per IP.
    #
    # CALLS because their cost lands on success. As failures they were not
    # limited at all: the middleware clears a key when a request works, so a
    # loop of *successful* drafts cleared its own budget every time round and
    # the limit below was never reached by the only traffic that bills
    # anything.
    #
    # Per account because per IP is the wrong unit for a signed-in endpoint. A
    # shared network — a school, which is who this app is for — is one key for
    # everybody on it, so one person planning an afternoon of goals locks out
    # the rest; and one person on a phone is a new key every time the network
    # hands them a different address. The account is the thing actually
    # spending the money, so it is the thing to meter.
    '/api/suggest_milestones': Policy(
        limit=20, seconds=3600, by_account=True, charge=CALLS, ip_limit=200,
        message='Too many suggestions for now. Try again in a little while.'),
    # The same money, and now spent without anybody pressing anything: a
    # checkpoint drafts its checklist as it is created, so this is reached by
    # ordinary use rather than by a button. Higher than the ladder's limit
    # because there are five checkpoints under every goal and each one asks
    # once — twenty would stop a single afternoon's planning.
    '/api/suggest_steps': Policy(
        limit=60, seconds=3600, by_account=True, charge=CALLS, ip_limit=600,
        message='Too many checklists drafted for now. Try again in a little while.'),
    # Missed when it was written, and the most expensive of the three: it is
    # the only one that asks for Opus (MODEL_DEFAULT in
    # backend/tracking/subject_goal.py) rather than Sonnet. It had no line
    # here at all, so it was not metered in any direction — an account could
    # hold the button down and bill the key for as long as it liked.
    #
    # Lower than the other two because it is one draft per subject rather than
    # one per checkpoint: a reader with a dozen subjects who redrafts each of
    # them twice is still inside it.
    '/api/suggest_subject_goal': Policy(
        limit=30, seconds=3600, by_account=True, charge=CALLS, ip_limit=300,
        message='Too many goals drafted for now. Try again in a little while.'),
}

#: The per-account budget for login, which is looser than the per-IP one — see
#: "Two keys, on purpose" above for why a tight one here is its own attack.
IDENTITY_MULTIPLIER = 3

#: A ceiling on how many keys are tracked at once, so a stream of unique
#: addresses cannot grow this without bound. Oldest-idle is dropped first.
MAX_TRACKED = 20_000


class Attempts:
    """Sliding-window counters, keyed by whatever the policy decided.

    A deque of timestamps per key rather than a fixed-window count, because a
    fixed window lets twice the budget through across a boundary — ten at
    11:59:59 and ten more at 12:00:00 — which is exactly the burst a guessing
    script produces.
    """

    def __init__(self):
        self._hits = {}
        self._lock = threading.Lock()

    def check(self, key, limit, seconds, now=None):
        """Whether `key` is inside its budget, and how long until it is not.

        Does not record anything: a request is only counted once it is known to
        have failed. Returns `(allowed, retry_after_seconds)`.
        """
        now = time.time() if now is None else now
        with self._lock:
            hits = self._prune(key, now, seconds)
            if len(hits) < limit:
                return True, 0
            return False, max(1, int(hits[0] + seconds - now) + 1)

    def record(self, key, seconds, now=None):
        """Count one failure against `key`."""
        now = time.time() if now is None else now
        with self._lock:
            hits = self._prune(key, now, seconds)
            hits.append(now)
            self._evict()

    def clear(self, key):
        """Forget a key. What a successful sign-in does."""
        with self._lock:
            self._hits.pop(key, None)

    def reset(self):
        with self._lock:
            self._hits.clear()

    def _prune(self, key, now, seconds):
        hits = self._hits.get(key)
        if hits is None:
            hits = self._hits[key] = deque()
        cutoff = now - seconds
        while hits and hits[0] <= cutoff:
            hits.popleft()
        return hits

    def _evict(self):
        """Keep the table bounded. Empty windows go first, then the oldest."""
        if len(self._hits) <= MAX_TRACKED:
            return
        for key in [k for k, v in self._hits.items() if not v]:
            del self._hits[key]
        while len(self._hits) > MAX_TRACKED:
            oldest = min(self._hits, key=lambda k: self._hits[k][0] if self._hits[k] else 0)
            del self._hits[oldest]


#: One table for the process. Tests reach for `attempts.reset()`.
attempts = Attempts()


def client_ip(request):
    """The address to charge this request to.

    `request.client.host` is the socket's peer, which is the *proxy* when there
    is one in front — so behind a load balancer every caller would share one
    key and the first ten failures would lock out everybody.

    `X-Forwarded-For` says who the proxy heard from, and it is a header the
    caller can also simply write. Trusting it unconditionally turns the limiter
    off: a script sends a different one each request and never shares a bucket.
    So it is read only when the deployment says there is a proxy in front —
    `SUMMIT_TRUST_PROXY=1` — which is a claim about the network that only
    whoever runs it can make.
    """
    if settings.trust_proxy():
        forwarded = request.headers.get('x-forwarded-for', '')
        if forwarded:
            # Left-most is the original client; the rest are the hops.
            return forwarded.split(',')[0].strip()
    client = getattr(request, 'client', None)
    return getattr(client, 'host', None) or 'unknown'


# --------------------------------------------------------------------------
# The middleware
# --------------------------------------------------------------------------
def register(app):
    app.middleware('http')(throttle)


def _identity_of(body, field):
    """The subject a second budget is keyed on, lower-cased.

    Login accepts either a username or an e-mail in whichever field the popup
    filled in, so `identity` means "whatever they typed" rather than one
    column. Case is folded because `Alice` and `alice` are one account and
    would otherwise be two budgets.
    """
    if field == 'identity':
        value = body.get('username') or body.get('email') or ''
    else:
        value = body.get(field) or ''
    return str(value).strip().lower()


def _account_of(request):
    """The signed-in account this request belongs to, or ''.

    Read straight off the session, which is a signed cookie the caller cannot
    forge — the same source backend/api/guard.py uses to decide whose data an
    endpoint touches.
    """
    try:
        return str(request.session.get('username') or '').strip().lower()
    except (AssertionError, KeyError, AttributeError):
        # No SessionMiddleware on this request (a unit test building the app
        # without it). No account, rather than an exception out of middleware.
        return ''


async def throttle(request, call_next):
    """Count failures on the paths in LIMITS, and refuse once they run out.

    The request is *let through* and the answer inspected, rather than counted
    on the way in. That is what makes "only failures count" true: the endpoints
    below all answer `{"success": false}` on a bad password or a taken address
    (see backend/api/reply.py), so the envelope is the signal, and a reader
    typing their password correctly is never charged for it.

    A successful sign-in clears the counters instead — so the budget is
    consecutive failures, not attempts.
    """
    policy = LIMITS.get(request.url.path)
    if policy is None or request.method != 'POST':
        return await call_next(request)

    # Read the body here so the identity is available, and put it back: a
    # Starlette request body is a stream and the endpoint has not read it yet.
    raw = await request.body()

    async def receive():
        return {'type': 'http.request', 'body': raw, 'more_body': False}

    request._receive = receive

    body = {}
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                body = parsed
        except ValueError:
            body = {}

    keys = []
    if policy.by_ip:
        keys.append(('{}|ip|{}'.format(request.url.path, client_ip(request)),
                     policy.ip_limit or policy.limit))
    if policy.by_identity:
        who = _identity_of(body, policy.by_identity)
        if who:
            keys.append(('{}|who|{}'.format(request.url.path, who),
                         policy.limit * IDENTITY_MULTIPLIER))
    if policy.by_account:
        account = _account_of(request)
        if account:
            keys.append(('{}|acct|{}'.format(request.url.path, account),
                         policy.limit))

    for key, limit in keys:
        allowed, retry_after = attempts.check(key, limit, policy.seconds)
        if not allowed:
            return _refused(policy, retry_after)

    response = await call_next(request)

    # `call_next` hands back a streaming response whose body has not been read,
    # so there is no `.body` to inspect. Drain it, decide, and hand back a
    # plain response carrying the same bytes — the payloads here are one small
    # JSON object, so buffering them costs nothing.
    body_bytes = b''
    async for chunk in response.body_iterator:
        body_bytes += chunk
    replayed = Response(
        content=body_bytes,
        status_code=response.status_code,
        headers=dict(response.headers),
        media_type=response.media_type,
    )

    if policy.charge == CALLS:
        # The request itself is the cost, so it counts however it turned out
        # and nothing clears. See the note on CALLS: charging these as failures
        # meant every successful call wiped the budget it had just spent.
        for key, _ in keys:
            attempts.record(key, policy.seconds)
    elif _failed(response.status_code, body_bytes):
        for key, _ in keys:
            attempts.record(key, policy.seconds)
    else:
        # It worked: forget what came before it, so a reader who mistyped
        # twice and then got in starts from a clean slate.
        for key, _ in keys:
            attempts.clear(key)

    return replayed


def _failed(status, body):
    """Whether the endpoint refused this attempt.

    Reads the `{"success": false}` envelope rather than the status code,
    because these endpoints answer 200 with it — that is the app's contract
    (backend/api/reply.py) and the reason this middleware buffers the body at
    all. A real error status counts too, so a 500 in the sign-in path is not a
    free retry.
    """
    if status >= 400:
        return True
    if not body:
        return False
    return b'"success":false' in body.replace(b' ', b'')


def _refused(policy, retry_after):
    """429, in the envelope the client already reads.

    A real status code so a proxy or a log can see it, and the same
    `{"success": false, "message": ...}` body every other failure uses, so the
    sign-in popup shows the sentence without needing a case for this.
    """
    return JSONResponse(
        {'success': False, 'message': policy.message},
        status_code=429,
        headers={'Retry-After': str(retry_after)},
    )
