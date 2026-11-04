"""How much a figure is allowed to claim.

Summit makes claims about people's work, and one wrong claim costs more than the
sentence it's in: catch the app calling three good days a pattern and you stop
believing the rest of the page. So every finding goes through here before it's said.

    1-3 observations    Insufficient evidence    Say nothing. Say what's missing.
    4-9 observations    Preliminary signal       Say it as something to test.
    10-29 observations  Emerging pattern         Say it, hedged.
    30+ observations    Potentially reliable     Say it, and still not as a cause.

The table is in shared/rules.json. For a comparison the count is the smaller side,
because forty days against three is a comparison of three.

## A count alone isn't enough

The right sample size depends on how noisy the figures are and how big the gap is,
so a comparison is also read in standard errors. Under `weak_gap` the two sides can't
be told apart and nothing is claimed, whatever the sample. Under `clear_gap` it stays
preliminary, whatever the sample. A big sample can only raise a claim the gap supports.

## What this won't do

It doesn't make anything a cause. These are one person's own days and tasks, never an
experiment, so "potentially reliable" means the pattern is probably there and not that
one thing drives the other. Callers say what kind of claim they're making: arithmetic,
a count, a before and after, or two things that go together.

frontend/src/utils/evidence.ts is the browser's copy, and shared/cases/evidence.json
pins both.
"""
import math
from statistics import mean, variance
from typing import Any, Dict, List, Sequence

from backend.config.shared import RULES

_RULES = RULES['evidence']
INSUFFICIENT, PRELIMINARY, EMERGING, RELIABLE = [row['key'] for row in _RULES['tiers']]
LABELS = {row['key']: row['label'] for row in _RULES['tiers']}
#: The fewest observations that can claim anything at all.
FLOOR = next(row['from'] for row in _RULES['tiers'] if row['key'] == PRELIMINARY)
WEAK_GAP = _RULES['weak_gap']
CLEAR_GAP = _RULES['clear_gap']
MIN_CORRELATION = _RULES['min_correlation']

_ORDER: List[str] = [row['key'] for row in _RULES['tiers']]


def tier_for(n: int) -> str:
    """The most `n` observations can claim."""
    found = INSUFFICIENT
    for row in _RULES['tiers']:
        if n >= row['from']:
            found = row['key']
    return found


def _read(tier: str, n: int, noise: bool = False, clear: bool = False) -> Dict[str, Any]:
    return {'tier': tier, 'label': LABELS[tier], 'n': n, 'noise': noise, 'clear': clear}


def counted(n: int) -> Dict[str, Any]:
    """A figure with no second side to compare with: only its count limits it."""
    return _read(tier_for(n), n)


def _judged(n: int, gap: float) -> Dict[str, Any]:
    """A comparison, given its smaller side and its gap in standard errors."""
    tier = tier_for(n)
    if tier == INSUFFICIENT:
        return _read(tier, n)
    if gap < WEAK_GAP:
        return _read(INSUFFICIENT, n, noise=True)
    if gap < CLEAR_GAP:
        return _read(PRELIMINARY, n)
    return _read(tier, n, clear=True)


def means(a: Sequence[float], b: Sequence[float]) -> Dict[str, Any]:
    """Whether two groups of readings really differ (Welch's standard error)."""
    n = min(len(a), len(b))
    if n < 2:
        return _read(INSUFFICIENT, n)
    gap = abs(mean(a) - mean(b))
    error = math.sqrt(variance(a) / len(a) + variance(b) / len(b))
    if error == 0:
        return _judged(n, math.inf if gap > 0 else 0.0)
    return _judged(n, gap / error)


def rates(hits_a: int, n_a: int, hits_b: int, n_b: int) -> Dict[str, Any]:
    """Whether two shares really differ (two-proportion, pooled)."""
    n = min(n_a, n_b)
    if n < 1:
        return _read(INSUFFICIENT, n)
    pooled = (hits_a + hits_b) / (n_a + n_b)
    error = math.sqrt(pooled * (1 - pooled) * (1 / n_a + 1 / n_b))
    gap = abs(hits_a / n_a - hits_b / n_b)
    if error == 0:
        return _judged(n, math.inf if gap > 0 else 0.0)
    return _judged(n, gap / error)


def correlation(r: float, n: int) -> Dict[str, Any]:
    """Whether two paired figures really move together."""
    tier = tier_for(n)
    if tier == INSUFFICIENT:
        return _read(tier, n)
    if abs(r) < MIN_CORRELATION:
        return _read(INSUFFICIENT, n, noise=True)
    if abs(r) >= 1:
        return _read(tier, n)
    return _judged(n, abs(r) * math.sqrt((n - 2) / (1 - r * r)))


def speaks(found: Dict[str, Any]) -> bool:
    """Whether a reading can be said at all."""
    return found['tier'] != INSUFFICIENT


def weakest(*tiers: str) -> str:
    """The lowest of several tiers, for a claim that rests on all of them."""
    return min(tiers, key=_ORDER.index)


def hedge(text: str, tier: str) -> str:
    """A "This suggests..." sentence, as strong as its tier allows. Empty when it
    can't be said at all."""
    if tier == INSUFFICIENT:
        return ''
    if tier == RELIABLE:
        return text
    opens = text.startswith('This suggests ')
    rest = text[len('This suggests '):] if opens else text
    if tier == EMERGING:
        return 'This may mean {}'.format(rest) if opens else text
    lead = "It's early, but this may mean {}".format(rest) if opens else "It's early. {}".format(rest)
    return '{} Treat it as something to test.'.format(lead)


def needs(n: int) -> int:
    """How many more observations before anything can be said."""
    return max(0, FLOOR - n)
