"""Tell the browser when a request changed something it keeps a copy of.

The browser keeps copies of the account's tasks and used to depend on each
page remembering to refresh them after a change. This opens a set for the
request, the database notes every table a statement writes into it
(`WRITTEN` in backend/database/connection.py), and a response from a request
that wrote `tasks` carries `X-Summit-Tasks-Changed: 1`. The browser's one
request function reads it and announces the change
(frontend/src/services/api.ts), so no endpoint and no page has to.

Live blocks on a space's page ride the same set. A response from a request
that wrote a table a live source reads carries `X-Summit-Live` naming those
sources, so the tab that made the change redraws them at once, and the
account's revision for each is bumped (backend/tracking/live.py), so every
other open page sees it on its next poll.

The set is shared by reference with the endpoint's thread: a sync endpoint
runs in a thread pool under a copy of this context, and the copy holds the
same set.
"""
from backend.database import connection
from backend.tracking import live

HEADER = 'X-Summit-Tasks-Changed'
LIVE_HEADER = 'X-Summit-Live'


def register(app):
    app.middleware('http')(tasks_changed)


def _username(request):
    """Who made the request, from the session, or None. Read after the route
    ran, so a sign-in is credited to the account it signed in."""
    try:
        return request.session.get('username')
    except AssertionError:
        # No SessionMiddleware around this app (a bare test app).
        return None


async def tasks_changed(request, call_next):
    written = set()
    token = connection.WRITTEN.set(written)
    try:
        response = await call_next(request)
    finally:
        connection.WRITTEN.reset(token)
    if 'tasks' in written:
        response.headers[HEADER] = '1'
    if written:
        stale = live.note_writes(_username(request), written)
        if stale:
            response.headers[LIVE_HEADER] = ','.join(stale)
    return response
