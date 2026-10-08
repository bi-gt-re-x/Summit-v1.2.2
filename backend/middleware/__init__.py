"""What happens around every request, whatever page it is for.

Three things, and they are not all the same kind of thing:

  * `gate` is real middleware — it runs before a request reaches a route and
    can answer it with a redirect instead;
  * `limit` is too: it counts failed attempts on the handful of endpoints
    where guessing or spending is the attack, and answers 429 once a caller
    has run out. See LIMITS there for the whole policy;
  * `headers` is too, and it is the only one that touches every response
    rather than a listed set of paths — a security header set on most
    responses is not set at all;
  * `writes` marks a response from a request that changed the task list, so
    the browser can refresh its copies without each page remembering to;
  * `context` is what a template renders with. Flask injected it globally
    through a context processor; here it is a function the page routes call,
    so it registers nothing.

Ordering note: `gate` reads `request.session`, so SessionMiddleware has to be
installed before it runs. Starlette runs middleware in reverse registration
order, so backend/main.py adds SessionMiddleware *after* this — see the note
there.
"""
from backend.middleware import gate, headers, limit, writes


def register(app):
    # First here, so it runs last and therefore sees every response — including
    # the redirects the gate answers with and the 429s the limiter does.
    headers.register(app)
    # Next, so it wraps every route: it marks a response from any request
    # that wrote the task list. See backend/middleware/writes.py.
    writes.register(app)
    gate.register(app)
    # Added after the gate so it runs before it: a signed-out caller hammering
    # /api/login should meet the limiter, and the gate has nothing to say about
    # /api paths anyway. See the ordering note in backend/main.py.
    limit.register(app)
