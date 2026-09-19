"""The account gate.

Pages that show personal data need an account. Rather than decorating each
view, this runs before every request and checks one list — so GATED_PATHS is
the whole answer to "what needs an account?", and the page routes stay free of
auth plumbing.

A signed-out visitor is bounced to the sign-in page (/login), and `next`
carries where they were headed so finishing the flow lands them there instead
of on the home page.

The Flask version matched on endpoint name; this one matches on path, which
says the same thing about the same four pages and keeps working when those
pages are served by the React router instead of by Jinja.
"""
from urllib.parse import urlencode

from starlette.responses import RedirectResponse

from backend.tracking.auth import profile_complete, signed_in_user

GATED_PATHS = ('/dashboard', '/calendar', '/goals', '/growth', '/analytics',
               # The analytics page's other four tabs, each on its own URL and
               # each read entirely off the account's own history.
               '/trends', '/habits', '/insights', '/recommendations',
               # The skill trees are the account's own finished tasks grouped
               # by subject, so there is nothing on the page for a visitor with
               # no account. The old placeholder path is gated with it because
               # it lands there.
               '/skill-trees', '/growth-tree',
               # Notes are the account's own writing and nobody else's.
               '/notes',
               # The timer shows the account's own focus hours against its own
               # goal, and banks more of them.
               '/timer',
               # Both read the account's own record: settings is what it has
               # chosen, achievements is what it has earned.
               '/settings', '/achievements',
               # The calendar's three views are three URLs now, and each of
               # them shows the account's own week as plainly as /calendar did.
               '/calendar/day', '/calendar/week', '/calendar/month')


def register(app):
    app.middleware('http')(gate_pages)


def _to_login(reason, path):
    return RedirectResponse(
        '/login?{}'.format(urlencode({'auth': reason, 'next': path})),
        status_code=303)


async def gate_pages(request, call_next):
    path = request.url.path
    if path in GATED_PATHS:
        user = signed_in_user(request)
        if not user:
            return _to_login('login', path)
        if not profile_complete(user):
            return _to_login('profile', path)
    return await call_next(request)
