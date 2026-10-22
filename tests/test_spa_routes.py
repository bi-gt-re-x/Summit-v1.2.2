"""Every page the React app routes has to be served by the built app too.

Vite serves index.html for any path, so a page missing from SPA_ROUTES works
in development and 404s on :5050 the moment it's reloaded or opened from a
link. That's how the subject pages, Tasks, Settings, Achievements and two
analytics tabs went missing on the built app.
"""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
APP = (ROOT / 'frontend' / 'src' / 'App.tsx').read_text()

# Param segments get a sample value; '*' is the router's own 404 page.
PATHS = sorted({
    re.sub(r':\w+', '1', path)
    for path in re.findall(r'path="([^"]+)"', APP)
    if path != '*'
})


@pytest.mark.parametrize('path', PATHS)
def test_every_routed_page_is_served(client, path):
    reply = client.get(path, follow_redirects=False)
    assert reply.status_code in (200, 503), '{} answered {}'.format(path, reply.status_code)


@pytest.mark.parametrize('path', ['/tasks', '/analytics/subject/mathematics', '/settings/account'])
def test_pages_with_your_record_need_an_account(anon, path):
    reply = anon.get(path, follow_redirects=False)
    assert reply.status_code == 303
    assert reply.headers['location'].startswith('/login')
