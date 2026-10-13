"""Check every link in data/free_resources.json still loads.

    .venv-fastapi/bin/python scripts/check_free_resources.py

Prints each link that didn't answer 200. A 404 or a dead host needs fixing in
the JSON. A 403, 406 or 429 is usually a site refusing scripts (LeetCode, AoPS,
Paul's Notes do), not a broken page: open those in a browser before changing
them. Run it after editing the catalog, then
`scripts/sort_free_resources.py` to load the change.
"""
import concurrent.futures
import json
import os
import sys

import httpx

PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'data', 'free_resources.json')
HEADERS = {
    'User-Agent': ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/126.0 Safari/537.36'),
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
}


def check(url):
    try:
        with httpx.Client(follow_redirects=True, timeout=20, headers=HEADERS) as client:
            return url, client.get(url).status_code
    except httpx.HTTPError as exc:
        return url, type(exc).__name__


def main():
    with open(PATH, encoding='utf-8') as handle:
        urls = sorted({row['url'] for row in json.load(handle)['resources']})
    with concurrent.futures.ThreadPoolExecutor(16) as pool:
        results = list(pool.map(check, urls))
    bad = [(url, status) for url, status in results if status != 200]
    # Refusals and timeouts are usually a site blocking scripts; check by hand.
    soft = (202, 403, 406, 429, 'ReadTimeout', 'ConnectTimeout')
    broken = [(url, status) for url, status in bad if status not in soft]
    print('{} links, {} not 200, {} look broken'.format(len(urls), len(bad), len(broken)))
    for url, status in bad:
        print('  {:>14}  {}'.format(status, url))
    return 1 if broken else 0


if __name__ == '__main__':
    sys.exit(main())
