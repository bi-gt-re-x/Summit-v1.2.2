"""How strongly a task's words say it is toward a goal. No model, no database.

Every signal is a number between 0 and 1 from config.py, and they combine as a
noisy OR: 1 - (1-a)(1-b)... So each reads as "how sure would this alone make
me", two moderate signals make a strong one, and a pile of weak ones stays
weak because each of them is small.

Strongest first:

  title coverage   the share of the goal's key title words the task names.
                   "Reach AIME" has one key word, so "AIME mock" covers it
                   all; "Violin ARCT" has two, so "Violin lesson" covers half.
  title pair       two title words side by side, in order: "usaco gold",
                   "amc 10". Needs a key word in the pair.
  checkpoint       the best-covered checkpoint under the goal, or a pair
                   from one.
  weak words       "rating", "gold", numbers. Capped together, so "reach
                   gold" cannot add up to a match on its own.
  subject          the task is filed under one of the goal's subjects.
                   Corroboration only.
  generic words    "practice", "problem set". Next to nothing, and capped.

Generic words alone never make a match, and neither does the subject: the
match has to come from what the task is about.
"""
from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple

from backend.goal_matcher import config
from backend.goal_matcher.candidate_index import CandidateIndex, GoalProfile
from backend.goal_matcher.normalize import key_pairs, kind_of, normalize
from backend.goal_matcher.types import TaskGoalMapping, TaskGoalMatch

# The weak title words, together, never count for more than this. Below the
# ambiguous threshold on purpose.
WEAK_CAP = 0.4


@dataclass(frozen=True, slots=True)
class TaskInput:
    """The fields matching reads, and only those. No description, no notes."""

    id: str
    title: str
    subject: Optional[str] = None


@dataclass(frozen=True, slots=True)
class TaskWords:
    """A task's title, normalised once and taken apart once."""

    tokens: Tuple[str, ...]
    words: frozenset
    pairs: frozenset
    subject: str

    @classmethod
    def of(cls, task: TaskInput) -> 'TaskWords':
        tokens = tuple(normalize(task.title).split())
        return cls(tokens=tokens, words=frozenset(tokens), pairs=key_pairs(tokens),
                   subject=(task.subject or '').strip().lower())


def noisy_or(values: Iterable[float]) -> float:
    missing = 1.0
    for value in values:
        missing *= 1.0 - max(0.0, min(1.0, value))
    return 1.0 - missing


def _coverage(found: int, total: int, base: float, span: float) -> float:
    return base + span * (found / total) if total and found else 0.0


def score(goal: GoalProfile, task: TaskWords) -> float:
    """How strongly `task` is toward `goal`, 0 to 1."""
    words = task.words
    signals: List[float] = []

    signals.append(_coverage(len(words & goal.title_keys), len(goal.title_keys),
                             config.TITLE_COVERAGE_BASE, config.TITLE_COVERAGE_SPAN))
    if task.pairs & goal.title_pairs:
        signals.append(config.TITLE_PAIR)

    weak = [config.TITLE_NUMBER if kind_of(word) == 'number' else config.TITLE_WEAK_TERM
            for word in words & goal.title_weak]
    signals.append(min(noisy_or(weak), WEAK_CAP))

    stage = max((_coverage(len(words & keys), len(keys),
                           config.CHECKPOINT_COVERAGE_BASE, config.CHECKPOINT_COVERAGE_SPAN)
                 for keys in goal.checkpoint_keys), default=0.0)
    if task.pairs & goal.checkpoint_pairs:
        stage = max(stage, config.CHECKPOINT_PAIR)
    signals.append(stage)

    if task.subject and task.subject in goal.subjects:
        signals.append(config.SUBJECT_AGREES)

    shared_generic = len(words & goal.title_generic)
    signals.append(min(shared_generic * config.GENERIC_TERM, config.GENERIC_CAP))

    return round(noisy_or(signals), 2)


def rank(index: CandidateIndex, task: TaskInput) -> List[Tuple[str, float]]:
    """Every candidate goal with its score, strongest first.

    Only the goals the index offers are scored — the task's subject bucket,
    narrowed to the ones sharing a real word with it — so the cost is a few
    set intersections per candidate, not per goal on the account.
    """
    words = TaskWords.of(task)
    scored = [(goal.id, score(goal, words))
              for goal in index.candidates(words.subject, words.tokens)]
    scored.sort(key=lambda pair: (-pair[1], pair[0]))
    return scored


# ---------------------------------------------------------------------------
# What the scores come to
# ---------------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class Classification:
    """The mapping to store, and what was considered on the way to it.

    `candidates` is in memory only and never stored: the plausible goals of an
    ambiguous task, strongest first, which is exactly the short list a closer
    look (the AI step) needs — so it never has to be sent every goal.
    """

    mapping: TaskGoalMapping
    candidates: Tuple[Tuple[str, float], ...] = ()


def decide(scored: List[Tuple[str, float]]) -> Classification:
    """matched, ambiguous or unmatched, from ranked (goal id, score) pairs.

    * **matched** — the best goal clears MATCH_THRESHOLD. Others are kept beside
      it if they clear SECONDARY_MATCH_THRESHOLD, up to MAX_MATCHES_PER_TASK.
    * **ambiguous** — the best clears only AMBIGUOUS_THRESHOLD. Nothing is
      stored as a match; the plausible goals ride along as candidates.
    * **unmatched** — nothing plausible, including no candidates at all. A
      valid answer, and never passed on for a second opinion.

    `pending` is not decided here. It means "queued right now", and only the
    queue that queues a task sets it.
    """
    ranked = sorted(scored, key=lambda pair: (-pair[1], pair[0]))
    top = ranked[0][1] if ranked else 0.0

    if top >= config.MATCH_THRESHOLD:
        kept = [ranked[0]] + [pair for pair in ranked[1:]
                              if pair[1] >= config.SECONDARY_MATCH_THRESHOLD]
        return Classification(TaskGoalMapping(status='matched', matches=tuple(
            TaskGoalMatch(goal_id=goal_id, score=value, source='rule')
            for goal_id, value in kept[:config.MAX_MATCHES_PER_TASK])))

    if top >= config.AMBIGUOUS_THRESHOLD:
        plausible = tuple(pair for pair in ranked if pair[1] >= config.AMBIGUOUS_THRESHOLD)
        return Classification(TaskGoalMapping(status='ambiguous'),
                              candidates=plausible[:config.MAX_MATCHES_PER_TASK + 2])

    return Classification(TaskGoalMapping.unmatched())


def classify(index: CandidateIndex, task: TaskInput) -> Classification:
    """The deterministic answer for one task. Cheap; no model, no database."""
    return decide(rank(index, task))
