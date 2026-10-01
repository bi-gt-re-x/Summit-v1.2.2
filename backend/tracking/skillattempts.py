"""What counts as a believable attempt at a skill.

The page turns these rows into a level — see frontend/src/utils/skillLevel.ts —
and a level is only as honest as the rows under it. So this module is the part
that has to be true before anything is stored: that a skill is named the way the
skill tree names skills, that a difficulty is one of the three the problems are
graded in, and that nobody got eleven right out of ten.

No web framework here, for the reason every module in backend/tracking gives:
these are rules about the record, and the endpoint is only one way to reach
them.

## What is refused rather than repaired

Most of the app clamps a bad number into range and carries on. This does not,
for the counts: an attempt that said 15 right out of 10 is not a typo with an
obvious correction — it might be 15 out of 15, or 10 out of 10, or 1 out of 10
— and storing any of those would put a guess into the only evidence a level is
built from. So a count out of range is a refusal with a reason, and the page
asks again.
"""
import re
from datetime import datetime

#: The three grades a problem is written in, lightest first. The problems'
#: own words — see `weight` in data/sql/skillsteps.sql. The page calls them
#: Easy, Medium and Hard.
WEIGHTS = ('warmup', 'core', 'stretch')

SOURCES = ('problem', 'log')

#: A node id as the skill library writes them: `m.quadratics`,
#: `algorithms.binary-search`. Checked by shape rather than against the
#: catalogue, because the catalogue is a build artefact a checkout may not
#: have — and a well-formed id that names nothing costs one orphan row.
NODE_ID = re.compile(r'^[a-z0-9][a-z0-9._-]{0,79}$')

#: The most problems one log may claim. A long evening of exercises is well
#: under this; a number above it is a typo that would swamp every honest row.
LOG_MAX = 200

#: Steps per programme and problems per step are both small; these are
#: ceilings on what a request can name, not on what the library holds.
ORDINAL_MAX = 99
SLOT_MAX = 20


def _whole(raw):
    """An int from whatever JSON sent, or None. Booleans are not numbers here."""
    if isinstance(raw, bool):
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if value != value or value != int(value):
        return None
    return int(value)


def clean_attempt(body, now=None):
    """`(row, None)` for an attempt worth storing, or `(None, reason)`.

    `body` is the request as a dict. The row carries every column but `id` and
    `user_id`, which are the endpoint's to set. The time is always the server's:
    a client that could choose `at` could choose its own history, and a level
    read "as it stood a month ago" would mean nothing.
    """
    node_id = str(body.get('node_id') or '').strip()
    if not NODE_ID.match(node_id):
        return None, 'That is not a skill this app knows how to name.'

    ordinal = _whole(body.get('ordinal', 0))
    if ordinal is None or not 0 <= ordinal <= ORDINAL_MAX:
        return None, 'That step number is out of range.'

    weight = body.get('weight')
    if weight not in WEIGHTS:
        return None, 'Difficulty has to be easy, medium or hard.'

    source = body.get('source') or 'problem'
    if source not in SOURCES:
        return None, 'Unknown kind of attempt.'

    attempted = _whole(body.get('attempted', 1))
    correct = _whole(body.get('correct', 0))
    if attempted is None or correct is None:
        return None, 'Counts have to be whole numbers.'

    slot = None
    if source == 'problem':
        # One of the step's own problems: one attempt, right or wrong, at a
        # numbered slot. Anything else is a log wearing the wrong label.
        slot = _whole(body.get('slot'))
        if slot is None or not 1 <= slot <= SLOT_MAX:
            return None, 'A marked problem needs its number.'
        if attempted != 1 or correct not in (0, 1):
            return None, 'A marked problem is one attempt, right or wrong.'
    else:
        if not 1 <= attempted <= LOG_MAX:
            return None, 'Log between 1 and {} problems at a time.'.format(LOG_MAX)
        if not 0 <= correct <= attempted:
            return None, 'You cannot get more right than you attempted.'

    stamp = (now or datetime.now()).isoformat(timespec='seconds')
    return {
        'node_id': node_id,
        'ordinal': ordinal,
        'slot': slot,
        'weight': weight,
        'attempted': attempted,
        'correct': correct,
        'source': source,
        'at': stamp,
    }, None
