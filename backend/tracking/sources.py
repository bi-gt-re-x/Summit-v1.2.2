"""Reference facts for the AI, looked up before it writes.

The models Summit uses are small and will state a wrong exam date, a made-up
score cutoff or a topic that isn't on a syllabus with the same confidence as a
right one. So every prompt that drafts something about a real-world topic (a
goal, its checkpoints, a subject reading, a session plan, a Spaces page) first
looks the topic up here and hands the model what it found, with an
instruction to take facts from that and nowhere else.

The source is Wikipedia: free, no key, edited and cited, and covers nearly
every subject, exam and competition a student names. Search finds the best
few articles for the topic; the REST summary endpoint gives each one's lead
paragraph and its URL.

Never a reason for a draft to fail. A timeout, no network or nothing found
all come back as no references, and the prompt goes out as it did before.
Results are cached per topic for a day, so the same subject page doesn't pay
for the lookup on every visit.

`SUMMIT_NO_SOURCES=1` turns lookups off, which the test suite sets so no test
touches the network.
"""
import json
import os
import re
import threading
import time
import urllib.parse
import urllib.request
from typing import Dict, List, Tuple

SEARCH_URL = 'https://en.wikipedia.org/w/api.php'
SUMMARY_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary/{}'
USER_AGENT = 'Summit/1.2 (study planner; reference lookups)'

#: Seconds for each request. Two rounds (search, then the summaries), so a
#: dead network costs the reader at most a few seconds, once a day per topic.
TIMEOUT = 4
#: How many articles a prompt gets. Three lead paragraphs is about 400 words,
#: which fits inside Groq's free-tier budget beside the rest of a brief.
LIMIT = 3
#: Characters kept of each lead paragraph.
EXTRACT_CHARS = 700
CACHE_SECONDS = 24 * 3600

HEADING = (
    'Reference facts, from Wikipedia. Take any fact about the topic (dates, '
    'formats, scores, what is covered, how it works) from these and nowhere '
    'else. If something you would say is not here and you are not certain of '
    'it, leave it out or say to check it, rather than guess. Never contradict '
    'these:')

_cache: Dict[str, Tuple[float, List[dict]]] = {}
_lock = threading.Lock()


def enabled() -> bool:
    return (os.environ.get('SUMMIT_NO_SOURCES') or '').strip() not in ('1', 'true', 'yes')


def _get(url: str) -> dict:
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT,
                                                   'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as reply:  # noqa: S310 - fixed https host
        return json.loads(reply.read().decode('utf-8'))


def _clean(topic: str) -> str:
    """The topic as a search: no filler, no punctuation, bounded."""
    text = re.sub(r'[^\w\s\-+.&]', ' ', str(topic or ''))
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:120]


def lookup(topic: str, limit: int = LIMIT) -> List[dict]:
    """Up to `limit` articles about `topic`: `{title, url, extract}` each."""
    query = _clean(topic)
    if not query or not enabled():
        return []
    key = query.lower()
    now = time.time()
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < CACHE_SECONDS:
            return hit[1][:limit]

    found: List[dict] = []
    try:
        search = _get('{}?{}'.format(SEARCH_URL, urllib.parse.urlencode({
            'action': 'query', 'list': 'search', 'srsearch': query,
            'srlimit': limit, 'format': 'json', 'utf8': 1})))
        titles = [row.get('title') for row in (search.get('query') or {}).get('search') or []
                  if row.get('title')]
        for title in titles[:limit]:
            try:
                page = _get(SUMMARY_URL.format(urllib.parse.quote(title.replace(' ', '_'))))
            except Exception:  # noqa: BLE001 - one missing summary isn't the lookup failing
                continue
            extract = re.sub(r'\s+', ' ', str(page.get('extract') or '')).strip()
            if not extract or page.get('type') == 'disambiguation':
                continue
            if len(extract) > EXTRACT_CHARS:
                extract = extract[:EXTRACT_CHARS].rsplit(' ', 1)[0] + '…'
            url = ((page.get('content_urls') or {}).get('desktop') or {}).get('page') or \
                'https://en.wikipedia.org/wiki/{}'.format(urllib.parse.quote(title.replace(' ', '_')))
            found.append({'title': str(page.get('title') or title), 'url': url, 'extract': extract})
    except Exception:  # noqa: BLE001 - no references is the answer to any failure
        found = []

    with _lock:
        _cache[key] = (now, found)
    return found[:limit]


def brief_block(*topics: str) -> str:
    """The references for the first topic that finds any, as brief text.

    Several topics so a caller can go from specific to general: a goal's own
    title, then its subject. Empty string when nothing was found.
    """
    for topic in topics:
        rows = lookup(topic)
        if rows:
            lines = ['', HEADING]
            for row in rows:
                lines.append('- {} ({}): {}'.format(row['title'], row['url'], row['extract']))
            return '\n'.join(lines)
    return ''
