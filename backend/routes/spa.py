"""The React frontend, on the pages it has taken over.

backend/routes/pages.py is the list of what still renders server-side. This is
the other half of that sentence: the list of what does not, because React now
owns it. A path appears in exactly one of the two files, which is what makes
the switch-over a one-line move rather than a question of which router wins.

Both halves are served by this app, on one origin. That matters for more than
tidiness — the session cookie, the theme cookie and every `/api/...` call are
same-origin this way, so a page React owns and a page Jinja still renders are
the same signed-in session with the same theme. During development the Vite
server on :5173 is a separate origin and CORS covers the hop (see
backend/main.py); nothing here depends on that.

What is served is the **build**, not the source. `npm run build` writes
frontend/dist, and until it has, these routes say so instead of 404ing — a
missing build is a thing you forgot to do, not a page that does not exist.
"""
import os

from fastapi import APIRouter, Request
from starlette.responses import FileResponse, HTMLResponse
from starlette.staticfiles import StaticFiles

from backend.config.settings import DIST_DIR

router = APIRouter(include_in_schema=False)

# The paths React answers for. Moving a page across is: port the component,
# delete its route from pages.py, add its path here.
#
# Every one of these is also still in pages.py's ENDPOINTS map, and has to be:
# that map is what `url_for('aboutus.page')` resolves to inside the templates
# that are still rendered, and those templates still link here.
SPA_ROUTES = (
    # The front door. The choice it makes — signed in to the dashboard,
    # everyone else to the landing page — is `FrontDoor` in src/App.tsx now.
    '/',
    '/home',
    # Signing in and signing up. The gate and the auth redirects land here —
    # see backend/middleware/gate.py and backend/routes/auth.py.
    '/login',
    '/dashboard',
    '/about-us',
    '/privacy-policy',
    '/terms-of-service',
    '/goals',
    '/growth',
    '/analytics',
    # The analysis is one page with five tabs, and a tab is a URL so that the
    # rail, the back button and a pasted link agree about what is showing.
    # /analytics says how much, /trends says which way, /habits says what you
    # do, /insights says why, /recommendations says what to change. All five
    # render src/pages/Analytics.tsx — see VIEWS in components/Analytics.
    '/trends',
    '/habits',
    '/insights',
    '/recommendations',
    # A skill tree per subject, built from finished tasks. `/growth-tree` was
    # the placeholder's path and redirects to it in src/App.tsx; it is here so
    # that a hard refresh on the old URL still reaches the router that does the
    # redirecting.
    '/skill-trees',
    '/growth-tree',
    # Free-form notes. The one page whose contents the app does not score.
    '/notes',
    # The focus timer with a pomodoro cycle over it. The session it runs is the
    # account's ordinary one — see src/pages/Timer.tsx.
    '/timer',
    # The calendar is one page in three views. It was one URL and a script
    # that swapped panes; it is three routes now, and /calendar keeps working
    # by redirecting to the week — see src/App.tsx.
    '/calendar',
    '/calendar/day',
    '/calendar/week',
    '/calendar/month',
)

INDEX = os.path.join(DIST_DIR, 'index.html')

MISSING_BUILD = """<!doctype html>
<meta charset="utf-8"><title>Frontend not built</title>
<body style="font: 15px/1.6 system-ui; max-width: 34em; margin: 15vh auto; padding: 0 1.5em">
<h1 style="font-size: 1.3rem">The frontend has not been built</h1>
<p>This page is served by the React app in <code>frontend/src/</code>, from the
bundle <code>npm run build</code> writes to <code>frontend/dist/</code>. That
bundle is not there.</p>
<pre style="background: #f4f6f8; padding: 12px 14px; border-radius: 8px">npm run build</pre>
<p>Or run <code>npm run dev</code> and use the Vite server directly, which
serves the same app from source with hot reload.</p>
</body>"""


def index(request: Request):
    """Hand back the built index.html; React's router reads the URL from there.

    `no-cache` for the same reason the CSS and JS mounts have it (see
    assets.py): index.html sits at a stable URL and names the hashed bundle,
    so a stale copy of it pins the whole app to an old build. The hashed files
    it points at are immutable and cached hard by the mount below.
    """
    if not os.path.isfile(INDEX):
        return HTMLResponse(MISSING_BUILD, status_code=503)
    return FileResponse(INDEX, headers={'Cache-Control': 'no-cache'})


for _path in SPA_ROUTES:
    router.api_route(_path, methods=['GET', 'HEAD'])(index)


#: The bundle's root-level files, served from `/` under their own names.
#:
#: Vite copies frontend/public/ into the root of the build, and everything in
#: there is a file some *other* program asks for by an exact path it will not
#: negotiate: the browser reads /manifest.json because <link rel="manifest">
#: named it, iOS reads /apple-touch-icon.png without being told at all, a
#: crawler reads /robots.txt or assumes the worst, and a service worker at
#: /sw.js may only claim the scope its own URL sits in.
#:
#: None of them were served. `/assets` was mounted and the root of the build
#: was not, so on a built install every one of these 404'd — the manifest that
#: index.html points at has never once been delivered by this server, and the
#: app has therefore never been installable outside the Vite dev server, which
#: serves public/ itself and hid the whole thing.
#:
#: Listed rather than mounted as a directory. A StaticFiles mount at '/' would
#: sit in front of every route in the app and answer for paths that belong to
#: the SPA; naming the files keeps the root a closed set, and a new one in
#: public/ is a line here.
ROOT_FILES = (
    'manifest.json',
    'favicon.ico',
    'robots.txt',
    'apple-touch-icon.png',
    # The service worker. Its scope is the directory it is served from, so it
    # has to be this path and not /assets/ — see frontend/public/sw.js.
    'sw.js',
)


def _root_file(name):
    """One handler per file in ROOT_FILES, bound to its name."""
    def serve():
        path = os.path.join(DIST_DIR, name)
        if not os.path.isfile(path):
            return HTMLResponse(MISSING_BUILD, status_code=503)
        # The worker decides for itself how long the app is stale, so it is the
        # one file that must never be served from cache — a service worker
        # pinned by an intermediary is a build nobody can replace.
        headers = {'Cache-Control': 'no-cache'} if name == 'sw.js' else {}
        return FileResponse(path, headers=headers)
    return serve


def register(app):
    """Mount the bundle's own files.

    Vite emits `/assets/<name>-<hash>.js`, and the hash is the version — a
    changed file gets a new name, so the old URL can be cached forever and
    never go stale. That is the opposite of the /static mounts, which serve
    files edited in place under fixed names.

    check_dir=False so a checkout that has not been built yet still starts;
    the routes above explain the situation better than a crash at boot.

    The root files are added the same way the SPA routes are — one route each,
    above the mount — so that the build's own names resolve without a catch-all
    at '/' that would shadow the app.
    """
    for _name in ROOT_FILES:
        app.add_api_route('/' + _name, _root_file(_name),
                          methods=['GET', 'HEAD'], include_in_schema=False)

    app.mount('/assets',
              StaticFiles(directory=os.path.join(DIST_DIR, 'assets'),
                          check_dir=False),
              name='spa-assets')
