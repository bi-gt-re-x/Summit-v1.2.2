"""Replies written straight to JSON — backend/routes/json_replies.py.

The fast write exists only to skip work, so what it must never do is change a
reply. These check its bytes against what FastAPI itself would have sent, and
that it stays away from the routes where skipping FastAPI would lose something.
"""
import datetime
import decimal

from fastapi import FastAPI, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from pydantic import BaseModel

from backend.routes import json_replies


def fastapi_bytes(content):
    return JSONResponse(jsonable_encoder(content)).body


class Thing(BaseModel):
    name: str


class TestTheBytes:
    def test_plain_replies_come_out_exactly_as_fastapi_writes_them(self):
        for content in [
            {'success': True, 'tasks': [{'id': 't1', 'title': 'Café — “quoted”', 'done': False,
                                         'xp': 12, 'score': 0.1 + 0.2, 'tags': [], 'note': None}]},
            {'success': True, 'by_day': {1: 'one', 2.5: 'x', True: 'yes', None: 'none'}},
            [1, 'two', [3.0, -4], {'nested': {'deep': ('a', 'tuple')}}],
            {'when': datetime.date(2026, 11, 9), 'at': datetime.datetime(2026, 11, 9, 8, 30, 1, 5),
             'time': datetime.time(7, 5), 'money': decimal.Decimal('12.50'),
             'whole': decimal.Decimal('3'), 'set': {'only'}, 'frozen': frozenset({'one'})},
            {}, [],
        ]:
            assert json_replies.render(content) == fastapi_bytes(content), content

    def test_anything_unusual_is_left_to_fastapi(self):
        for content in [
            {'value': float('nan')},
            {datetime.date(2026, 1, 1): 'a date as a key'},
            {'model': Thing(name='x')},
            {'_sa_instance_state': 1, 'id': 2},
            {'object': object()},
            'a bare string',
            None,
        ]:
            assert json_replies.render(content) is None, content


def app_with(install=True):
    app = FastAPI()

    @app.get('/api/plain')
    def plain():
        return {'success': True, 'day': datetime.date(2026, 11, 9), 'rows': [{'n': n} for n in range(3)]}

    @app.get('/api/model')
    def model():
        return {'thing': Thing(name='kept')}

    @app.get('/api/cookie')
    def cookie(response: Response):
        response.set_cookie('seen', '1')
        return {'success': True}

    @app.post('/api/made', status_code=201)
    def made():
        return {'success': True}

    @app.get('/api/async')
    async def is_async():
        return {'success': True, 'async': True}

    count = json_replies.install(app) if install else 0
    return app, count


class TestTheRoutes:
    def test_routes_answer_the_same_with_and_without_it(self):
        fast, count = app_with()
        slow, _ = app_with(install=False)
        assert count == 3  # plain, model and async; not the cookie or the 201
        a, b = TestClient(fast), TestClient(slow)
        for method, path in [('get', '/api/plain'), ('get', '/api/model'), ('get', '/api/cookie'),
                             ('post', '/api/made'), ('get', '/api/async')]:
            one, two = getattr(a, method)(path), getattr(b, method)(path)
            assert (one.status_code, one.content, one.headers.get('content-type')) == \
                (two.status_code, two.content, two.headers.get('content-type')), path
        assert a.get('/api/cookie').cookies.get('seen') == '1'
        assert a.post('/api/made').status_code == 201

    def test_the_real_app_gets_it(self, client):
        # Most of the app's API should be on the fast path; if a FastAPI upgrade
        # changes the internals it leans on, this is where it shows.
        routes = [r for r in client.app.routes if getattr(r, 'path', '').startswith('/api')]
        wrapped = [r for r in routes if getattr(getattr(r, 'dependant', None), 'call', None) is not None
                   and getattr(r.dependant.call, '__wrapped__', None) is r.endpoint]
        assert len(wrapped) > len(routes) // 2
