"""Plain JSON replies, written once instead of copied and then written.

## Why this file exists

An endpoint here returns a dict (backend/api/reply.py), and FastAPI's default
for a dict is to walk it with `jsonable_encoder` — which builds a complete copy
of the reply, value by value — and then hand the copy to `json.dumps`. Almost
every reply this app sends is already plain JSON (strings, numbers, lists and
dicts), so the copy changes nothing and costs a lot: on Alpha's account the
task list is 20,815 tasks, and the walk alone took 284 ms and 10 MB of the
`/api/tasks` and `/api/get_user_data` replies before a byte was written.

So every API route is given a thin wrapper, once, at startup. When its
endpoint returns a dict or a list, the wrapper writes it straight to JSON with
the same settings Starlette's `JSONResponse` uses. The few non-JSON values the
app does return (dates, Decimals, sets) are written the way `jsonable_encoder`
writes them. Anything else — a pydantic model, a date used as a dict key, a
NaN — makes the fast write give up and the reply goes back to FastAPI exactly
as it did before, so the output is the same either way. Only the cost changes.

## Which routes are left alone

A route keeps FastAPI's own handling when the wrapper could change what the
reply says rather than only what it costs:

  * one with a `response_model`, whose filtering is the point;
  * one with a response class other than JSON (pages, files, redirects);
  * one with its own `status_code` (a 201 or a 204 has its own rules);
  * one where the endpoint, or anything it depends on, takes a `Response` to
    set a cookie or a header on: FastAPI copies those onto the reply it builds
    but not onto one the endpoint returns.

The wrapper works through FastAPI's documented escape hatch (an endpoint that
returns a `Response` is sent as it is), applied by rebuilding each route's
handler around a wrapped endpoint. tests/test_json_replies.py checks that
replies come out byte for byte as FastAPI would have written them.
"""
import dataclasses
import datetime
import decimal
import functools
import inspect
import json

from fastapi.datastructures import DefaultPlaceholder
from fastapi.encoders import decimal_encoder
from fastapi.responses import JSONResponse
# FastAPI's own `request_response`, not Starlette's: it opens the exit stack
# the dependency system needs, and is what APIRoute itself wraps a handler in.
from fastapi.routing import APIRoute, request_response
from starlette.responses import Response


class _NotPlain(TypeError):
    """A value the fast write won't guess at; FastAPI's encoder takes over."""


def _default(value):
    """The non-JSON values `jsonable_encoder` would write, written its way."""
    if isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
        return value.isoformat()
    if isinstance(value, decimal.Decimal):
        return decimal_encoder(value)
    if isinstance(value, (set, frozenset)):
        return list(value)
    raise _NotPlain(type(value).__name__)


def _keys_plain(value):
    """`jsonable_encoder` drops dict keys starting `_sa` (SQLAlchemy state).
    No reply here has one, but if one ever does, FastAPI should decide."""
    if isinstance(value, dict):
        for key, inner in value.items():
            if isinstance(key, str) and key.startswith('_sa'):
                return False
            if isinstance(inner, (dict, list)) and not _keys_plain(inner):
                return False
    elif isinstance(value, list):
        for inner in value:
            if isinstance(inner, (dict, list)) and not _keys_plain(inner):
                return False
    return True


def render(content):
    """`content` as the bytes JSONResponse would send, or None to leave it to FastAPI."""
    if not isinstance(content, (dict, list)):
        return None
    try:
        body = json.dumps(content, ensure_ascii=False, allow_nan=False,
                          indent=None, separators=(',', ':'), default=_default)
    except (TypeError, ValueError):
        return None
    if '"_sa' in body and not _keys_plain(content):
        return None
    return body.encode('utf-8')


def _reply(content):
    body = render(content)
    if body is None:
        return content
    return Response(content=body, media_type='application/json')


def _wrap(call):
    if inspect.iscoroutinefunction(call):
        @functools.wraps(call)
        async def fast(*args, **kwargs):
            return _reply(await call(*args, **kwargs))
    else:
        @functools.wraps(call)
        def fast(*args, **kwargs):
            return _reply(call(*args, **kwargs))
    return fast


def _sets_response(dependant):
    if dependant.response_param_name:
        return True
    return any(_sets_response(one) for one in dependant.dependencies)


def _eligible(route):
    if not isinstance(route, APIRoute) or not route.path.startswith('/api'):
        return False
    if route.response_model is not None or route.status_code not in (None, 200):
        return False
    response_class = route.response_class
    if isinstance(response_class, DefaultPlaceholder):
        response_class = response_class.value
    if response_class is not JSONResponse:
        return False
    call = route.dependant.call
    if call is None or inspect.isasyncgenfunction(call) or inspect.isgeneratorfunction(call):
        return False
    return not _sets_response(route.dependant)


def install(app):
    """Give every eligible API route the fast write. Returns how many."""
    count = 0
    for route in app.router.routes:
        if not _eligible(route):
            continue
        route.dependant = dataclasses.replace(route.dependant, call=_wrap(route.dependant.call))
        route.app = request_response(route.get_route_handler())
        count += 1
    return count
