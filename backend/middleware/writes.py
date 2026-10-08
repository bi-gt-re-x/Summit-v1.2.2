"""Tell the browser when a request changed the task list.

The browser keeps copies of the account's tasks and used to depend on each
page remembering to refresh them after a change. This opens a set for the
request, the database notes every table a statement writes into it
(`WRITTEN` in backend/database/connection.py), and a response from a request
that wrote `tasks` carries `X-Summit-Tasks-Changed: 1`. The browser's one
request function reads it and announces the change
(frontend/src/services/api.ts), so no endpoint and no page has to.

The set is shared by reference with the endpoint's thread: a sync endpoint
runs in a thread pool under a copy of this context, and the copy holds the
same set.
"""
from backend.database import connection

HEADER = 'X-Summit-Tasks-Changed'


def register(app):
    app.middleware('http')(tasks_changed)


async def tasks_changed(request, call_next):
    written = set()
    token = connection.WRITTEN.set(written)
    try:
        response = await call_next(request)
    finally:
        connection.WRITTEN.reset(token)
    if 'tasks' in written:
        response.headers[HEADER] = '1'
    return response
