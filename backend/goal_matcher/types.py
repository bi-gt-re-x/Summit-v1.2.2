"""What the goal matcher decides about one task, and the rules that shape it.

A task's goals are a *derived* property. The task row stays the source of
truth; this is the cached answer to "which goals is this work toward", worked
out when the task is created or edited and read back by everything else. Nothing
here is computed while a page renders.

## What is stored, and what is not

Only references. A match is a goal id, a score and where the match came from.
The goal's name, description, keywords and statistics stay on the goal, where
they already are; copying any of them onto every task would be ten thousand
stale copies the first time a goal is renamed.

Persisted as rows of `task_goal_matches` (one per task-goal pair, see
data/sql/goals.sql) plus two columns on the task: `goal_match_status` and
`goal_match_version`. `score` and `source` are kept because two later steps
read them. `source` is how an explicit link survives re-matching and how an AI
answer stays cached. `score` is what the thresholds are tuned against.

## Status

    matched     at least one goal, explicit or confident enough to count
    ambiguous   plausible goals, none confident: worth a closer look (AI)
    unmatched   nothing plausible. A valid answer, not an error
    pending     queued for asynchronous classification right now

`matched` exactly when there are matches, and that is enforced here. An
ambiguous task's candidates are *not* stored as matches: anything counted as a
relationship has to be one, and "maybe" is not.
"""
from dataclasses import dataclass, field
from typing import Literal, Tuple

# Bumped whenever the matching rules change, so earlier answers can be told
# apart and refreshed lazily. See `is_stale` below.
GOAL_MATCHER_VERSION = 1

# A task can count toward several goals, but only a few. Past three the
# secondary matches are almost always noise, and every extra one is a goal
# whose numbers go up for work that was not really toward it.
MAX_MATCHES_PER_TASK = 3

Status = Literal['matched', 'ambiguous', 'unmatched', 'pending']
Source = Literal['explicit', 'rule', 'ai']

STATUSES: Tuple[str, ...] = ('matched', 'ambiguous', 'unmatched', 'pending')
SOURCES: Tuple[str, ...] = ('explicit', 'rule', 'ai')

# Explicit first, then the model's answer, then the rules. Used to order ties
# and to decide which copy of a duplicated goal id is kept.
_RANK = {'explicit': 0, 'ai': 1, 'rule': 2}


@dataclass(frozen=True, slots=True)
class TaskGoalMatch:
    """One goal a task counts toward. Ids and small numbers only."""

    goal_id: str
    # 0 to 1. An explicit link is always 1: the reader said so.
    score: float
    source: Source

    def __post_init__(self):
        if not self.goal_id or not isinstance(self.goal_id, str):
            raise ValueError('A match needs a goal id')
        if self.source not in SOURCES:
            raise ValueError('Unknown match source: {!r}'.format(self.source))
        # Stored to two places. More precision than that is noise the
        # thresholds cannot see, and it keeps the row small.
        score = 1.0 if self.source == 'explicit' else round(float(self.score), 2)
        if not 0.0 <= score <= 1.0:
            raise ValueError('A match score is between 0 and 1')
        object.__setattr__(self, 'score', score)


def _tidy(matches):
    """One entry per goal, strongest first, at most MAX_MATCHES_PER_TASK.

    A duplicated goal id keeps its best copy: explicit over everything, then
    the higher score. The order is explicit, then score, then goal id, so the
    same matches always come out in the same order and compare equal.
    """
    best = {}
    for match in matches:
        held = best.get(match.goal_id)
        if held is None or (_RANK[match.source], -match.score) < (_RANK[held.source], -held.score):
            best[match.goal_id] = match
    ordered = sorted(best.values(),
                     key=lambda m: (m.source != 'explicit', -m.score, m.goal_id))
    return tuple(ordered[:MAX_MATCHES_PER_TASK])


@dataclass(frozen=True, slots=True)
class TaskGoalMapping:
    """Everything the matcher concluded about one task."""

    status: Status
    matches: Tuple[TaskGoalMatch, ...] = field(default=())
    version: int = GOAL_MATCHER_VERSION

    def __post_init__(self):
        if self.status not in STATUSES:
            raise ValueError('Unknown mapping status: {!r}'.format(self.status))
        matches = _tidy(tuple(self.matches))
        if (self.status == 'matched') != bool(matches):
            raise ValueError('A mapping is matched exactly when it has matches '
                             '(status {!r}, {} matches)'.format(self.status, len(matches)))
        object.__setattr__(self, 'matches', matches)

    @property
    def goal_ids(self) -> Tuple[str, ...]:
        return tuple(match.goal_id for match in self.matches)

    @property
    def explicit(self) -> Tuple[TaskGoalMatch, ...]:
        return tuple(match for match in self.matches if match.source == 'explicit')

    def is_stale(self, version: int = GOAL_MATCHER_VERSION) -> bool:
        """Worked out by an older matcher, so due a lazy refresh."""
        return self.version < version

    def to_api(self) -> dict:
        """The shape the front end reads. See `TaskGoalMapping` in types/models.ts."""
        return {
            'version': self.version,
            'status': self.status,
            'matches': [{'goal_id': m.goal_id, 'score': m.score, 'source': m.source}
                        for m in self.matches],
        }

    @classmethod
    def unmatched(cls) -> 'TaskGoalMapping':
        return cls(status='unmatched')
