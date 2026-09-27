"""The skill tree's practice programmes, read from the database.

The panel in frontend/src/components/SkillTree/LatticePanel.tsx asks this for a
node's steps and draws what comes back. It used to compute them in the browser
— see the note at the top of data/sql/skillsteps.sql for why that had to stop —
so the interesting thing about this module is how little it does: a read, a
shape, and no rules of its own. The rules are backend/tracking/skillsteps.py and
the writing is scripts/generate_skill_steps.py.

## Why the batch endpoint is the main one

A reader clicks tiles. Opening a tree and clicking six nodes should not be six
round trips, and it is not: the page asks for every node on the tree in one
request when it opens, and the panel then renders from memory. `?nodes=` takes
a comma-separated list, and the single-node path is that list with one entry.

The cap is there because the parameter is a URL and a caller can put anything in
it. 200 ids is more than the largest tree and small enough that a bad request
costs one query rather than a table scan.

## Why this is not behind a session

Every other endpoint under /api reads an account and is guarded by
backend/api/guard.py. This one reads the curriculum — the same rows for every
reader, no user_id in the table at all — so there is nothing here to protect and
nobody to identify. Adding a session check would be a guard against the reader
seeing the syllabus of the app they are already running.
"""
import json
import os

from fastapi import APIRouter, Query

from backend.api.reply import fail, ok
from backend.config.settings import DATA_DIR
from backend.database import connection
from backend.tracking import skillsteps

router = APIRouter(tags=['skillsteps'])

#: How many nodes one request may ask about. Above the largest tree, below
#: anything that would make the query interesting.
MAX_NODES = 200

#: The node catalogue, written by scripts/export_skill_nodes.mjs. Read for the
#: coverage report only — the steps themselves carry everything the panel needs.
NODES_PATH = os.path.join(DATA_DIR, 'skill_nodes.json')

_catalogue = None


def catalogue():
    """The exported node list, loaded once.

    Missing is not an error: the file is a build artefact and a checkout that
    has not run the exporter should still serve steps. Only the coverage report
    needs it, and it says so rather than failing.
    """
    global _catalogue
    if _catalogue is None:
        try:
            with open(NODES_PATH, 'r') as handle:
                _catalogue = json.load(handle).get('nodes', [])
        except (OSError, ValueError):
            _catalogue = []
    return _catalogue


@router.get('/api/skill-steps')
def read_steps(nodes: str = Query('', description='Comma-separated node ids')):
    """The written programme for each node asked for.

    Nodes with nothing written are simply absent from `steps`, and `missing`
    names them. That distinction is the whole contract: the panel falls back to
    its derived advice for a missing node, and would draw an empty programme for
    a node the server said it had and then did not.
    """
    ids = [one.strip() for one in nodes.split(',') if one.strip()]
    if not ids:
        return fail('Name at least one node id in ?nodes=')
    if len(ids) > MAX_NODES:
        return fail('Too many nodes: {} asked for, {} is the limit'.format(len(ids), MAX_NODES))

    programmes = skillsteps.programmes_for(ids)
    return ok(
        steps=programmes,
        missing=[one for one in ids if one not in programmes],
    )


@router.get('/api/skill-steps/coverage')
def read_coverage():
    """How much of the library has verified steps, per tree.

    What this is for: the generator writes one tree at a time and can be
    stopped, so "is this finished" is a real question with a changing answer.
    It is also the check that the table has not quietly lost a tree — a nodes
    count that falls is a regeneration that dropped content on review.
    """
    stored = connection.skill_step_coverage()
    totals = {}
    for node in catalogue():
        entry = totals.setdefault(
            node['tree'], {'tree': node['tree'], 'title': node['treeTitle'], 'nodes': 0})
        entry['nodes'] += 1

    trees = []
    for tree_id, entry in sorted(totals.items()):
        written, steps = stored.get(tree_id, (0, 0))
        trees.append({**entry, 'written': written, 'steps': steps})
    # A tree in the table that the catalogue has never heard of: content for a
    # node that has since been renamed or deleted. Worth surfacing rather than
    # dropping, because it is the failure mode scripts/check_steps.mjs exists
    # to catch and this is the only place it is visible at runtime.
    for tree_id, (written, steps) in sorted(stored.items()):
        if tree_id not in totals:
            trees.append({'tree': tree_id, 'title': tree_id, 'nodes': 0,
                          'written': written, 'steps': steps})

    return ok(
        trees=trees,
        nodes=sum(entry['nodes'] for entry in totals.values()),
        written=sum(tree['written'] for tree in trees),
        steps=sum(tree['steps'] for tree in trees),
        audit=connection.step_audit_summary(),
    )
