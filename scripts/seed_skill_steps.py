"""The committed corpus of practice programmes: load it, check it, write it out.

    .venv-fastapi/bin/python scripts/seed_skill_steps.py            # load it
    .venv-fastapi/bin/python scripts/seed_skill_steps.py --check    # just check it
    .venv-fastapi/bin/python scripts/seed_skill_steps.py --export   # table -> file

## The file is the artefact, not the table

data/summit.db is git-ignored, so a generator run that takes hours exists on
one machine and reaches nobody. `--export` writes the table back into
data/skill_steps_seed.json, which is committed — so the corpus is reviewable in
a diff, survives a fresh clone, and a checkout with no model key gets the whole
library from one command. The loop is: generate, export, read the diff, commit.

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


def _unpack(entry):
    """A programme and its provenance, from either shape the file may hold.

    A bare list is hand-written content, which is how the file started and is
    still the easiest thing to type. An object carries `steps` plus where they
    came from, which is what `--export` writes so that generated programmes
    keep saying they were generated.
    """
    if isinstance(entry, dict):
        return entry.get('steps') or [], {
            'model': entry.get('model') or 'authored',
            'verifier': entry.get('verifier') or 'rules+authored',
            'checks': entry.get('checks') or SEED_CHECKS,
        }
    return entry or [], {
        'model': 'authored',
        'verifier': 'rules+authored',
        'checks': SEED_CHECKS,
    }


def _problems_of(raw_step, ordinal):
    """One step's problem set out of the seed file, numbered and banded.

    `slot` and `weight` may be stated, and are filled in when they are not:
    position from the order they were written, and the band from the default
    slope in frontend/src/utils/problemSet — the first third warm-up, the last
    third stretch. Writing a set out by hand and having it graded for you is
    the common case; stating the band is for the set where the default is
    wrong.
    """
    raw = raw_step.get('problems') or []
    if not raw:
        return []
    total = len(raw)
    warm = max(1, -(-total // 3))
    stretch = max(1, min(total - warm, warm))
    out = []
    for at, problem in enumerate(raw, start=1):
        weight = problem.get('weight')
        if weight not in skillsteps.WEIGHTS:
            weight = ('warmup' if at <= warm
                      else 'stretch' if at > total - stretch else 'core')
        out.append({
            'slot': problem.get('slot') or at,
            'weight': weight,
            'prompt': str(problem.get('prompt', '')).strip(),
            'answer': str(problem.get('answer', '')).strip(),
            'hint': str(problem.get('hint', '') or '').strip(),
        })
    return out


def export():
    """Write every stored programme back out to the seed file.

    The database is git-ignored, so a generator run that takes hours lives in
    exactly one untracked file on one machine. This is what makes the corpus a
    committed artefact: export, review the diff, commit. A fresh clone then
    gets the whole library from `seed_skill_steps.py` with no model key and no
    waiting.

    Provenance is carried across per programme, so an exported file still
    distinguishes what a model wrote from what a person did.
    """
    stored = connection.skill_steps_for(
        [node['id'] for node in load(NODES_PATH, 'nodes') or []])
    problems = connection.skill_problems_for(list(stored))
    out = {}
    for node_id, rows in sorted(stored.items()):
        sets = {}
        for one in problems.get(node_id, []):
            sets.setdefault(one['ordinal'], []).append(one)
        first = rows[0]
        out[node_id] = {
            'model': first['model'],
            'verifier': first['verifier'],
            'checks': first['checks'],
            'steps': [{
                **{field: row[field] for field in (*skillsteps.STEP_FIELDS, 'minutes')},
                **({'problems': [
                    {'slot': one['slot'], 'weight': one['weight'],
                     'prompt': one['prompt'], 'answer': one['answer'],
                     **({'hint': one['hint']} if one['hint'] else {})}
                    for one in sets.get(row['ordinal'], [])]}
                   if sets.get(row['ordinal']) else {}),
            } for row in rows],
        }
    with open(SEED_PATH, 'w') as handle:
        json.dump({'programmes': out}, handle, indent=2, ensure_ascii=False)
        handle.write('\n')
    print('Exported {} programmes, {} steps, {} problems.'.format(
        len(out), sum(len(one['steps']) for one in out.values()),
        sum(len(step.get('problems', []))
            for one in out.values() for step in one['steps'])))
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--check', action='store_true',
                        help='Run the checks and report. Writes nothing.')
    parser.add_argument('--export', action='store_true',
                        help='Write the database back out to the seed file.')
    parser.add_argument('--node', action='append', default=[],
                        help='Only this node id. Repeatable.')
    args = parser.parse_args()

    if args.export:
        return export()

    nodes = {node['id']: node for node in load(NODES_PATH, 'nodes') or []}
    seed = load(SEED_PATH, 'programmes') or {}
    if args.node:
        seed = {key: value for key, value in seed.items() if key in set(args.node)}

    run_id = 'seed:{}'.format(datetime.now().isoformat(timespec='seconds'))
    stamp = datetime.now().isoformat(timespec='seconds')
    written = failed = steps_total = 0
    problems_total = failed_problems = 0
    audit = []

    for node_id, entry in sorted(seed.items()):
        raw, provenance = _unpack(entry)
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
                'model': provenance['model'],
                'generated_at': stamp,
                'attempts': 1,
                'verified_at': stamp,
                'verifier': provenance['verifier'],
                'checks': provenance['checks'],
            } for step in steps])
            audit.append({'run_id': run_id, 'node_id': node_id, 'ordinal': None,
                          'stage': 'store', 'outcome': 'pass',
                          'reason': '{} steps'.format(len(steps)), 'at': stamp})
        # Problems are stored per step, after the step itself, because the
        # step is what they hang off — a set for an ordinal with no step would
        # be unreachable content.
        for step, raw_step in zip(steps, raw):
            problems = _problems_of(raw_step, step['ordinal'])
            if not problems:
                continue
            per_problem, whole_set = skillsteps.review_problems(problems, step)
            faults = list(whole_set) + [one for group in per_problem for one in group]
            if faults:
                failed_problems += 1
                print('  FAIL {:<20} step {} problems: {}'.format(
                    node_id, step['ordinal'], faults[0]))
                audit.extend({
                    'run_id': run_id, 'node_id': node_id, 'ordinal': step['ordinal'],
                    'stage': 'rules', 'outcome': 'fail',
                    'reason': 'problem: ' + reason, 'at': stamp,
                } for reason in faults)
                continue
            if not args.check:
                connection.save_step_problems(node_id, step['ordinal'], [{
                    **problem,
                    'tree_id': node['tree'],
                    'model': provenance['model'],
                    'generated_at': stamp,
                    'verified_at': stamp,
                    'verifier': provenance['verifier'],
                    'checks': list(skillsteps.PROBLEM_CHECKS),
                } for problem in problems])
            problems_total += len(problems)

        written += 1
        steps_total += len(steps)
        print('  ok   {:<20} {} steps  {}'.format(node_id, len(steps), node['name']))

    if not args.check:
        connection.log_step_audit(audit)

    print('\n{} node(s) passed, {} failed, {} steps, {} problems.'.format(
        written, failed, steps_total, problems_total))
    if failed_problems:
        print('{} problem set(s) rejected.'.format(failed_problems))
    if args.check:
        print('--check: nothing was written.')
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
