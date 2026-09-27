"""Load the written-ahead programmes in data/skill_steps_seed.json into the table.

    .venv-fastapi/bin/python scripts/seed_skill_steps.py            # load it
    .venv-fastapi/bin/python scripts/seed_skill_steps.py --check    # just check it

## Why there are two ways in

scripts/generate_skill_steps.py is the one that scales: it briefs a model per
node and can fill the whole library unattended. This one loads a file. Both end
at the same place — the same table, through the same checks in
backend/tracking/skillsteps.py — and they exist for different situations.

The generator needs a model key with credit behind it. A checkout that has
neither still has to come up with something better than the derived ladder on
the nodes a reader is most likely to open, and a file of written programmes is
how. It is also the only way to *correct* a programme: a node the generator
keeps getting wrong can be written by hand and will survive every later run,
because the generator skips nodes that already have steps.

## The checks are not skipped for authored content

Seeded rows go through `review_programme` exactly as generated ones do, and a
node that fails is reported and not written. Content written by hand is not more
trustworthy than content written by a model — it is differently untrustworthy,
and the failure it actually has is the one the rules are best at: a practice
line that got vague because the author was tired on node forty.

What it skips is the second stage, the model marking the work, because there is
no model in this path. So its rows are stored with 'reviewed' absent from
`checks` and a verifier of 'rules+authored' rather than 'rules+<model>'. That
distinction is queryable, which is the point: the day a key has credit again,
`--redo` over the rows whose checks lack 'reviewed' is the list of what has
never had a second reader.
"""
import argparse
import json
import os
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from backend.config import settings  # noqa: E402

settings.load_dotenv()

from backend.database import connection  # noqa: E402
from backend.tracking import skillsteps  # noqa: E402

SEED_PATH = os.path.join(ROOT, 'data', 'skill_steps_seed.json')
NODES_PATH = os.path.join(ROOT, 'data', 'skill_nodes.json')

#: What a seeded row's `checks` column holds. Every rule name, and deliberately
#: not 'reviewed' — see the module note.
SEED_CHECKS = list(skillsteps.RULE_CHECKS)


def load(path, key):
    with open(path, 'r') as handle:
        return json.load(handle).get(key)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--check', action='store_true',
                        help='Run the checks and report. Writes nothing.')
    parser.add_argument('--node', action='append', default=[],
                        help='Only this node id. Repeatable.')
    args = parser.parse_args()

    nodes = {node['id']: node for node in load(NODES_PATH, 'nodes') or []}
    seed = load(SEED_PATH, 'programmes') or {}
    if args.node:
        seed = {key: value for key, value in seed.items() if key in set(args.node)}

    run_id = 'seed:{}'.format(datetime.now().isoformat(timespec='seconds'))
    stamp = datetime.now().isoformat(timespec='seconds')
    written = failed = steps_total = 0
    audit = []

    for node_id, raw in sorted(seed.items()):
        node = nodes.get(node_id)
        if not node:
            # A programme for a node that no longer exists. Not fatal — the
            # library is edited constantly — but it is content nobody will ever
            # see again, and silence is how it stays that way.
            print('  ?? {:<20} no such node in the catalogue'.format(node_id))
            failed += 1
            audit.append({'run_id': run_id, 'node_id': node_id, 'ordinal': None,
                          'stage': 'store', 'outcome': 'drop',
                          'reason': 'no such node', 'at': stamp})
            continue

        steps = [{
            'ordinal': index,
            'minutes': step.get('minutes', 20),
            **{field: str(step.get(field, '')).strip() for field in skillsteps.STEP_FIELDS},
        } for index, step in enumerate(raw, start=1)]

        per_step, whole = skillsteps.review_programme(steps, node)
        problems = [(None, reason) for reason in whole]
        for step, reasons in zip(steps, per_step):
            problems.extend((step['ordinal'], reason) for reason in reasons)

        for ordinal, reason in problems:
            audit.append({'run_id': run_id, 'node_id': node_id, 'ordinal': ordinal,
                          'stage': 'rules', 'outcome': 'fail', 'reason': reason,
                          'at': stamp})
        if problems:
            failed += 1
            print('  FAIL {:<20} {}'.format(node_id, node['name']))
            for ordinal, reason in problems:
                print('       step {}: {}'.format(ordinal if ordinal else '-', reason))
            audit.append({'run_id': run_id, 'node_id': node_id, 'ordinal': None,
                          'stage': 'store', 'outcome': 'drop',
                          'reason': '{} check(s) failed'.format(len(problems)),
                          'at': stamp})
            continue

        audit.append({'run_id': run_id, 'node_id': node_id, 'ordinal': None,
                      'stage': 'rules', 'outcome': 'pass',
                      'reason': 'all {} steps'.format(len(steps)), 'at': stamp})
        if not args.check:
            connection.save_node_steps(node_id, [{
                **step,
                'tree_id': node['tree'],
                'tier': node['tier'],
                'model': 'authored',
                'generated_at': stamp,
                'attempts': 1,
                'verified_at': stamp,
                'verifier': 'rules+authored',
                'checks': SEED_CHECKS,
            } for step in steps])
            audit.append({'run_id': run_id, 'node_id': node_id, 'ordinal': None,
                          'stage': 'store', 'outcome': 'pass',
                          'reason': '{} steps'.format(len(steps)), 'at': stamp})
        written += 1
        steps_total += len(steps)
        print('  ok   {:<20} {} steps  {}'.format(node_id, len(steps), node['name']))

    if not args.check:
        connection.log_step_audit(audit)

    print('\n{} node(s) passed, {} failed, {} steps.'.format(
        written, failed, steps_total))
    if args.check:
        print('--check: nothing was written.')
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
