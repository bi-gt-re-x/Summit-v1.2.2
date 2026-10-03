"""A skill's level, read from what the reader actually got right.

Levels run 0 to 5 per step of a skill tree, and every one is arithmetic over
the rows in `skill_attempts` and a date:

    0  Not started   no problems answered
    1  Started       answered, but not enough right at any difficulty yet
    2  Easy          5+ Easy problems, 70%+ right, over the latest 20
    3  Medium        the same on Medium
    4  Hard          the same on Hard
    5  Mastered      10+ Hard problems, 85%+ right, on 2+ different days

Each tier is read over its latest twenty problems, so a level can fall as well
as rise: an old run of right answers does not hold a level up for ever.

This used to be worked out in the browser (frontend/src/utils/skillLevel.ts),
once per panel that showed a level. It lives here now so the skill tree and the
analytics page read one answer. `/api/skill-attempts` returns it with the rows,
and every add or delete returns the new reading for the step it touched.

## The past is the same function

`read_level(attempts, as_of)` reads only rows from before `as_of`, so the level
a month ago is this module run against a shorter list — not a stored history.
"""
import math
from datetime import datetime, timedelta

TIERS = ('warmup', 'core', 'stretch')

#: How many of a tier's latest problems a level is read over.
RECENT = 20
#: Clearing a tier: this many problems, this share right.
CLEAR_MIN = 5
CLEAR_RATE = 0.7
#: Mastery: this many Hard problems, this share right, over this many days.
MASTER_MIN = 10
MASTER_RATE = 0.85
MASTER_DAYS = 2
#: The window "days practised lately" is counted over.
CONSISTENCY_DAYS = 28
#: How far back the "before" reading looks, in days.
COMPARE_DAYS = 30

MAX_LEVEL = 5


def js_round(value):
    """`Math.round`: halves go up, the way the page always printed them."""
    return math.floor(value + 0.5)


def _stamp(row):
    try:
        return datetime.fromisoformat(str(row.get('at') or ''))
    except ValueError:
        return None


def _count(value):
    """A count off a row, as a whole number when it is one (so it serialises
    as 5 rather than 5.0, the way the page has always printed it)."""
    try:
        number = float(value or 0)
    except (TypeError, ValueError):
        return 0
    return int(number) if number.is_integer() else number


def _recent(rows, limit):
    """The latest `limit` problems of these rows: how many, how many right, on
    how many days. A batch row straddling the limit counts in proportion."""
    newest = sorted(rows, key=_stamp, reverse=True)
    attempted = 0
    correct = 0.0
    days = set()
    for row in newest:
        if attempted >= limit:
            break
        rows_attempted = _count(row.get('attempted'))
        take = min(rows_attempted, limit - attempted)
        attempted += take
        rows_correct = _count(row.get('correct'))
        correct += rows_correct if take == rows_attempted else rows_correct * take / rows_attempted
        days.add(str(row.get('at'))[:10])
    return {
        'attempted': attempted,
        'correct': js_round(correct),
        'rate': correct / attempted if attempted > 0 else None,
        'days': len(days),
    }


def _cleared(read):
    return read['attempted'] >= CLEAR_MIN and (read['rate'] or 0) >= CLEAR_RATE


def _mastered(read):
    return (read['attempted'] >= MASTER_MIN and (read['rate'] or 0) >= MASTER_RATE
            and read['days'] >= MASTER_DAYS)


EMPTY = {'attempted': 0, 'correct': 0, 'rate': None, 'days': 0, 'cleared': False}


def _next(level, tiers):
    """What the next level asks for, and how far along it the reader is."""
    if level == 0:
        return {'level': 1, 'tier': None, 'need': 1, 'rate': 0, 'days': 1, 'have': EMPTY}
    if level in (1, 2, 3):
        tier = TIERS[level - 1]
        return {'level': level + 1, 'tier': tier, 'need': CLEAR_MIN, 'rate': CLEAR_RATE,
                'days': 1, 'have': tiers[tier]}
    if level == 4:
        return {'level': 5, 'tier': 'stretch', 'need': MASTER_MIN, 'rate': MASTER_RATE,
                'days': MASTER_DAYS, 'have': tiers['stretch']}
    return None


def _partial(following):
    """How far into the next level, 0-1: volume, accuracy and spread, together."""
    if not following or following['tier'] is None or following['have']['attempted'] == 0:
        return 0
    have = following['have']
    volume = min(1, have['attempted'] / following['need'])
    accuracy = min(1, (have['rate'] or 0) / following['rate'])
    spread = min(1, have['days'] / following['days'])
    return volume * accuracy * spread


def read_level(attempts, as_of=None, now=None):
    """The level these attempts add up to, counting only rows up to `as_of`."""
    base = as_of or now or datetime.now()
    rows = [row for row in attempts
            if _stamp(row) is not None and (as_of is None or _stamp(row) <= as_of)
            and _count(row.get('attempted')) > 0]

    tiers = {tier: _recent([row for row in rows if row.get('weight') == tier], RECENT)
             for tier in TIERS}
    # Whether each difficulty is cleared, so the page can tick it off without
    # knowing what "cleared" means.
    for read in tiers.values():
        read['cleared'] = _cleared(read)

    level = 0
    if rows:
        level = 1
    if _cleared(tiers['warmup']):
        level = 2
    if _cleared(tiers['core']):
        level = 3
    if _cleared(tiers['stretch']):
        level = 4
    if _mastered(tiers['stretch']):
        level = 5

    following = _next(level, tiers)
    overall = _recent(rows, RECENT)

    hardest = None
    for tier in TIERS:
        if any(row.get('weight') == tier and _count(row.get('correct')) > 0 for row in rows):
            hardest = tier

    since = datetime.combine((base - timedelta(days=CONSISTENCY_DAYS - 1)).date(),
                             datetime.min.time())
    active_days = len({str(row.get('at'))[:10] for row in rows if _stamp(row) >= since})

    last_at = None
    for row in rows:
        if last_at is None or _stamp(row) > _stamp({'at': last_at}):
            last_at = row.get('at')

    attempted = sum(_count(row.get('attempted')) for row in rows)
    correct = sum(_count(row.get('correct')) for row in rows)
    partial = _partial(following) if level < MAX_LEVEL else 0
    return {
        'level': level,
        'mastery': js_round((level + partial) / MAX_LEVEL * 100),
        'attempted': attempted,
        'correct': correct,
        'accuracy': None if overall['rate'] is None else js_round(overall['rate'] * 100),
        'tiers': tiers,
        'hardest': hardest,
        'lastAt': last_at,
        'activeDays': active_days,
        'next': following,
        'evidence': ('none' if attempted == 0 else 'thin' if attempted < CLEAR_MIN
                     else 'fair' if attempted < 15 else 'solid'),
    }


def key_of(row):
    """One step of one skill: `node#ordinal`, the key the page files levels under."""
    return '{}#{}'.format(row.get('node_id'), int(_count(row.get('ordinal'))))


def step_levels(attempts, now=None):
    """Every step's level now and `COMPARE_DAYS` ago, and how much was answered.

    `{key: {now, before, attempted}}`. The skill tree's level card compares now
    against a month ago; the analytics page reads now and the total.
    """
    now = now or datetime.now()
    before = now - timedelta(days=COMPARE_DAYS)
    grouped = {}
    for row in attempts:
        grouped.setdefault(key_of(row), []).append(row)
    out = {}
    for key, rows in grouped.items():
        current = read_level(rows, now=now)
        out[key] = {
            'now': current,
            'before': read_level(rows, as_of=before),
            'attempted': current['attempted'],
        }
    return out
