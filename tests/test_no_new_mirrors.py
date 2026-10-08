"""No new hand-kept copies of a rule between the browser and the server.

A value both sides need lives in shared/rules.json, and logic both sides
implement is pinned by shared/cases/ (see shared/README.md). The comments
that used to say "Mirrors X in Y" are how a hand-kept copy announced itself;
the ones still in the code are counted here, and the count may only go down.
A new one fails this test: put the value in shared/ instead.
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIRROR = re.compile(r'mirrors |mirrored by|kept in step by hand', re.IGNORECASE)

#: How many there are now. Lower it when one goes; never raise it.
MOST = 35


def _mirror_comments():
    found = []
    for top in ('backend', os.path.join('frontend', 'src')):
        for folder, _dirs, files in os.walk(os.path.join(ROOT, top)):
            if '__pycache__' in folder or 'node_modules' in folder:
                continue
            for name in files:
                if not name.endswith(('.py', '.ts', '.tsx', '.css')) or 'test' in name:
                    continue
                path = os.path.join(folder, name)
                with open(path, encoding='utf-8') as handle:
                    for number, line in enumerate(handle, 1):
                        if MIRROR.search(line):
                            found.append('{}:{}'.format(os.path.relpath(path, ROOT), number))
    return found


def test_no_new_hand_kept_copies():
    found = _mirror_comments()
    assert len(found) <= MOST, (
        'A new "mirrors" comment means a rule is being copied by hand between '
        'the browser and the server. Put the value in shared/rules.json (or the '
        'behaviour in shared/cases/) instead. Found {}:\n{}'.format(len(found), '\n'.join(found)))
