"""Fill in placeholder difficulty / execution ratings for the demo account.

The rating prompt after a completed task is new, so every account in the
database has an empty quality record and every quality panel renders its
"nothing rated" state. That is correct behaviour and worth being able to see —
but it means the panels that *do* have something to draw cannot be looked at at
all. This gives one account, `Alpha`, a plausible rating history so both halves
can be reviewed.

Placeholder, and only here. Nothing in the app invents a rating: the client
treats an unrated task as missing data everywhere (see utils/ratings.ts) and the
backend refuses to score one (see `rating_of`). This script writes real rows to
the database the way the prompt would have, and is the only thing in the repo
that does. Run it against a development database.

## What "plausible" means here

Random ratings would produce a uniform cloud in the difficulty-against-execution
grid, which is the one shape no real account has and the one that would make the
panel look broken. So the numbers carry the structure a real account's would:

- **Difficulty tracks what the task was worth.** A 70 XP task was set as a
  bigger piece of work than a 10 XP one, so its difficulty rating skews high.
  This is the correlation that makes the grid diagonal rather than square.
- **Execution improves over the account's life.** Alpha's record runs from 2021
  to 2026; execution drifts up about a point across it, which is what gives the
  quality trend something to find.
- **Harder tasks go slightly worse.** A mild penalty, so the grid's top-right
  corner is sparse — as it is for everybody.
- **Coverage is partial and patchy.** About 60% fully rated, 8% answered on one
  row only, and the rest skipped, with whole stretches left blank to exercise
  the carry-forward the charts do across unrated gaps.

Deterministic: the seed is fixed, so re-running produces the same record rather
than a different one each time.

    python3 scripts/seed_alpha_ratings.py [username] [--dry-run]
"""
import os
import random
import sys

# The repo root, from this file rather than from the working directory — the
# same bootstrap the three seed scripts beside this one use. It read
# `sys.path.insert(0, '.')` while this lived in utils/, which only resolved
# when the script happened to be run from the root.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.database import connection as db  # noqa: E402

USERNAME = 'Alpha'
SEED = 20260816

#: Roughly what share of finished tasks gets each treatment.
FULLY_RATED = 0.60
HALF_ANSWERED = 0.08

#: How long a stretch of "stopped bothering to rate" runs, in tasks, and how
#: often one starts. Kept low: on a 4,000-task account even a 2% chance per task
#: of a month-long silence eats well over half the record, and the point of the
#: gaps is to have some rather than to dominate.
QUIET_RUN = 25
QUIET_CHANCE = 0.006


def _clamp(value, low=1, high=5):
    return max(low, min(high, value))


def _difficulty(xp, rng):
    """A 1-5 rating skewed by what the task was worth, with real spread.

    The bands are the XP quartiles of a typical account rather than round
    numbers: most tasks sit between 10 and 60, and a scale that put everything
    under 50 in one band would flatten the grid's whole x axis.
    """
    if xp >= 60:
        base = 4.4
    elif xp >= 40:
        base = 3.8
    elif xp >= 25:
        base = 3.1
    elif xp >= 12:
        base = 2.4
    else:
        base = 1.7
    return _clamp(round(rng.gauss(base, 0.85)))


def _execution(difficulty, progress, rng):
    """A 1-5 rating that improves over the account's life and dips on hard work.

    `progress` is 0 at the account's first completed task and 1 at its last.
    """
    base = 2.9 + progress * 1.0 - (difficulty - 3) * 0.22
    return _clamp(round(rng.gauss(base, 0.8)))


def seed(username=USERNAME, dry_run=False):
    rows = db.tasks()
    done = [t for t in rows
            if t.get('user_id') == username and t.get('status') == 'done'
            and t.get('completed_at')]
    done.sort(key=lambda t: str(t.get('completed_at')))

    if not done:
        print('No completed tasks for {!r} — nothing to rate.'.format(username))
        return 0

    rng = random.Random(SEED)
    span = max(1, len(done) - 1)

    fully = half = skipped = 0
    quiet_left = 0

    for index, task in enumerate(done):
        # Clear whatever was there, so a re-run replaces rather than layers.
        task.pop('difficulty', None)
        task.pop('execution', None)

        # A stretch where the prompt simply stopped being answered. Real
        # accounts have these — a busy two weeks, a month of not caring — and
        # they are what the charts' carry-forward exists to survive.
        if quiet_left > 0:
            quiet_left -= 1
            skipped += 1
            continue
        if rng.random() < QUIET_CHANCE:
            quiet_left = rng.randint(QUIET_RUN // 2, QUIET_RUN)
            skipped += 1
            continue

        roll = rng.random()
        if roll > FULLY_RATED + HALF_ANSWERED:
            skipped += 1
            continue

        xp = task.get('xp_value') or 0
        difficulty = _difficulty(xp, rng)

        if roll > FULLY_RATED:
            # Answered one row and closed the dialog. Must not count as a
            # quality score anywhere — that is half the point of seeding them.
            task['difficulty'] = difficulty
            half += 1
            continue

        task['difficulty'] = difficulty
        task['execution'] = _execution(difficulty, index / span, rng)
        fully += 1

    print('{}: {} completed tasks'.format(username, len(done)))
    print('  {} rated on both rows ({:.0f}%)'.format(fully, fully / len(done) * 100))
    print('  {} answered on one row only'.format(half))
    print('  {} left unrated'.format(skipped))

    if dry_run:
        print('  dry run — nothing written')
        return fully

    db.save_tasks(rows)
    print('  written')
    return fully


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    seed(args[0] if args else USERNAME, dry_run='--dry-run' in sys.argv)
