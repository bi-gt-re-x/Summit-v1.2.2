"""The application factory — where the backend is assembled.

    config/      what things are called and where they live
    database/    the SQLite datastore, and the only code that touches a file
    tracking/    the rules: XP, streaks, focus, calendar events, accounts
    api/         one router per page: the endpoints that page calls
    routes/      the cross-page routes (accounts, theme, the Jinja pages) and
                 the asset mounts
    middleware/  what happens around every request

Nothing here knows anything about a specific page. `routes.register` walks the
router list and attaches each one; adding a page never means editing this file.

Two things below are not obvious:

**The validation handler.** Every endpoint answers `{"success": ...}` with HTTP
200, and every script in frontend/ checks that flag rather than the status code
(see backend/api/reply.py). FastAPI's default answer to a body it cannot parse
is a 422 carrying `detail`, which those scripts would read straight past. The
handler below puts a malformed request back into the shape the client expects.

**Middleware order.** Starlette runs middleware in reverse registration order,
so the one added *last* runs *first*. The account gate reads `request.session`,
so SessionMiddleware has to run before it — which means being added after it.
"""
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.sessions import SessionMiddleware

from backend import middleware, routes
from backend.api.guard import NotSignedIn
from backend.config import settings


def create_app():
    # Before anything is built. Both of these have a fallback that works and is
    # quietly wrong once the app is not on one laptop, so an install that has
    # not said it is a laptop has to say what its origin and its signing key
    # are. See `deployment_problems` in backend/config/settings.py.
    problems = settings.deployment_problems()
    if problems:
        raise settings.Misconfigured(
            'Refusing to start.\n\n' + '\n\n'.join('  * ' + p for p in problems)
            + '\n\nIf this is a development machine, set SUMMIT_DEV=1 — '
              '`python run.py` does it for you.')

    app = FastAPI(
        title='Summit',
        description='A gamified productivity tracker: tasks, XP, streaks, '
                    'a calendar, goals and growth analytics.',
        version='1.0.1',
    )

    @app.exception_handler(RequestValidationError)
    async def malformed_request(request, exc):
        """A body FastAPI could not parse, in the shape the client reads."""
        return JSONResponse(
            {"success": False, "message": "Invalid request.",
             "detail": exc.errors()},
            status_code=200)

    @app.exception_handler(NotSignedIn)
    async def not_signed_in(request, exc):
        """A request to an account endpoint with no session behind it.

        Raised by the dependencies in backend/api/guard.py, which every
        endpoint that touches an account's data now depends on. 401 rather than
        the usual 200, because this is the one failure the client acts on
        rather than displays — see the note in guard.py.
        """
        return JSONResponse(
            {"success": False, "message": "Sign in to continue."},
            status_code=401)

    middleware.register(app)

    # Added after the gate so it runs before it — see the note above.
    #
    # `https_only` is what marks the cookie Secure, and it is on unless the
    # environment says otherwise. Without it the browser will send the session
    # over plain HTTP, where anything between the reader and the server can
    # read it and *be* them — the cookie is the whole of the authorization now
    # (backend/api/guard.py), so it is the one thing worth protecting.
    #
    # Development is the exception the flag exists for: a Secure cookie is
    # simply never sent over the http:// dev server, so signing in locally
    # would stop working. run.py sets SUMMIT_INSECURE_COOKIES for a local run.
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.secret_key(),
        session_cookie=settings.SESSION_COOKIE,
        max_age=settings.SESSION_MAX_AGE,
        same_site='lax',
        https_only=settings.secure_cookies(),
    )

    # Compression, added last so it runs first and therefore wraps everything
    # below it — including the JSON the API returns.
    #
    # This app sends a lot of JSON and none of it was compressed. The analytics
    # page reads the account's whole task list, which on a real account is a
    # couple of megabytes of short, extremely repetitive objects — the same
    # sixteen keys, eight thousand times — and that is close to the best case
    # for deflate. Narrowing the columns (see ANALYTICS_TASK_FIELDS in
    # backend/api/analytics.py) took about a fifth off it; this takes about
    # nine tenths off what is left, and it does so for every response the app
    # sends rather than for one endpoint.
    #
    # `minimum_size` is what keeps that from being a loss: below roughly a
    # kilobyte the gzip header and the CPU cost buy nothing, and most of this
    # API's replies are a success flag and a sentence.
    #
    # Level 6 rather than Starlette's default of 9. On the largest response in
    # the app — the analytics task list, 3.3 MB for a five-year account — 9
    # took 94 ms of server time to save 6% over 6's 30 ms, and the server is
    # answering eight other calls for the same page while it does.
    app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=6)

    # The Vite dev server is a separate origin during development and the
    # session cookie has to survive the hop. Nothing is cross-origin once the
    # built frontend is served by this app.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.DEV_ORIGINS,
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
        # Read by frontend/src/services/api.ts; see backend/middleware/writes.py.
        expose_headers=['X-Summit-Tasks-Changed'],
    )

    routes.register(app)

    return app
