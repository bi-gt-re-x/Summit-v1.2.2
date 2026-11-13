"""Print every piece of problem text in the bank as JSON, for the rendering test.

    .venv-fastapi/bin/python scripts/export_amc_text.py

Used by frontend/src/components/Amc/rendering.test.ts, which runs each string
through the same KaTeX path the pages use and fails on any parse error.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.amc import catalog  # noqa: E402
from backend.amc.bank import PROBLEMS  # noqa: E402

out = []
for p in PROBLEMS:
    def add(field, text):
        out.append({'id': p['id'], 'field': field, 'text': text})
    add('statement', p['statement'])
    for i, choice in enumerate(p['choices'] or []):
        add('choice ' + 'ABCDE'[i], choice)
    for i, step in enumerate(p['solution']):
        add('step %d' % (i + 1), step)
    add('insight', p['insight'])
    add('trap', p['trap'])
for t in catalog.TOPICS:
    for i, idea in enumerate(t['ideas']):
        out.append({'id': t['id'], 'field': 'idea %d' % (i + 1), 'text': idea})
print(json.dumps(out))
