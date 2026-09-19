"""Which goals a task could possibly be toward, found without comparing to all.

    task  →  its subject's bucket (plus cross-subject goals)
          →  only the goals sharing a meaningful word with it
          →  score those, and nothing else

Built once per account per batch from two narrow reads — goal ids, titles,
subjects and measures, and checkpoint titles — and then reused for every task
in the batch. Nothing here holds a goal's description, figures or history.

## Which goals are candidates at all

* **Active.** A completed goal takes no new work; its old links stay where
  they are, but nothing new is filed into it. `include_completed` exists for
  the one caller that needs history.
* **Outcome goals only.** A goal measured by XP, streak, task count or focus
  time already counts every task by its measure, so tying tasks to it by name
  would be noise. Only goals measured by a number or by checkpoints are
  matched.
* **Same subject, or no subject.** A goal filed under subjects is only compared
  with tasks filed under one of them. A goal with no subject is cross-subject:
  it is compared with everything. A task with no subject has nothing to filter
  by and is compared with every candidate goal — which is still only the
  account's handful of goals, and the words still have to agree.
"""
from dataclasses import dataclass
from typing import Dict, FrozenSet, Iterable, List, Optional, Tuple

from backend.database import connection as db
from backend.goal_matcher.normalize import key_pairs, kept, kind_of, words

# Measures that are an outcome rather than a counter. See _measure_of in
# backend/api/goals.py, which this mirrors: an empty measure reads as the
# goal_type, and every goal_type is a counter.
OUTCOME_MEASURES = ('number', 'milestones')

# The fields read, and no more. Descriptions stay in the database.
GOAL_FIELDS = ('id', 'title', 'status', 'subject_ids', 'measure', 'goal_type')
CHECKPOINT_FIELDS = ('goal_id', 'title')


def subjects_of(value) -> FrozenSet[str]:
    """A goal's comma-separated subject ids as a set. Empty means cross-subject."""
    return frozenset(part.strip().lower() for part in str(value or '').split(',') if part.strip())


@dataclass(frozen=True, slots=True)
class GoalProfile:
    """The words of one goal, sorted by what they are worth. Ids and words only."""

    id: str
    subjects: FrozenSet[str]
    # The title's key words, and its weaker ones (weak words and numbers).
    title_keys: FrozenSet[str]
    title_weak: FrozenSet[str]
    title_pairs: FrozenSet[Tuple[str, str]]
    # Each checkpoint's key words, one set per checkpoint.
    checkpoint_keys: Tuple[FrozenSet[str], ...]
    checkpoint_pairs: FrozenSet[Tuple[str, str]]
    title_generic: FrozenSet[str]

    @property
    def cross_subject(self) -> bool:
        return not self.subjects

    def terms(self) -> FrozenSet[str]:
        """Every word that can send a task here: generic words cannot."""
        out = set(self.title_keys) | set(self.title_weak)
        for keys in self.checkpoint_keys:
            out |= keys
        return frozenset(out)


def profile(goal: dict, checkpoint_titles: Iterable[str] = ()) -> GoalProfile:
    title = words(goal.get('title'))
    stages = [words(text) for text in checkpoint_titles]
    return GoalProfile(
        id=str(goal['id']),
        subjects=subjects_of(goal.get('subject_ids')),
        title_keys=frozenset(w for w in title if kind_of(w) == 'key'),
        title_weak=frozenset(w for w in title if kind_of(w) in ('weak', 'number')),
        title_pairs=key_pairs(title),
        checkpoint_keys=tuple(
            keys for keys in (frozenset(w for w in stage if kind_of(w) == 'key') for stage in stages)
            if keys),
        checkpoint_pairs=frozenset().union(*(key_pairs(stage) for stage in stages)),
        title_generic=frozenset(w for w in title if kind_of(w) == 'generic'),
    )


def is_candidate(goal: dict, include_completed: bool = False) -> bool:
    """Whether a goal can have tasks matched into it at all."""
    if not goal.get('id'):
        return False
    if goal.get('status') == 'completed' and not include_completed:
        return False
    measure = (goal.get('measure') or '').strip() or (goal.get('goal_type') or '')
    return measure in OUTCOME_MEASURES


class CandidateIndex:
    """One account's candidate goals, bucketed by subject and by word."""

    __slots__ = ('goals', 'by_subject', 'cross', 'by_term')

    def __init__(self, profiles: Iterable[GoalProfile]):
        # dict keeps insertion order, and a duplicated id keeps its first.
        self.goals: Dict[str, GoalProfile] = {}
        for item in profiles:
            self.goals.setdefault(item.id, item)
        by_subject: Dict[str, List[str]] = {}
        cross: List[str] = []
        by_term: Dict[str, set] = {}
        for goal in self.goals.values():
            if goal.cross_subject:
                cross.append(goal.id)
            for subject in sorted(goal.subjects):
                by_subject.setdefault(subject, []).append(goal.id)
            for term in goal.terms():
                by_term.setdefault(term, set()).add(goal.id)
        self.by_subject: Dict[str, Tuple[str, ...]] = {k: tuple(v) for k, v in by_subject.items()}
        self.cross: Tuple[str, ...] = tuple(cross)
        self.by_term: Dict[str, FrozenSet[str]] = {k: frozenset(v) for k, v in by_term.items()}

    def __len__(self):
        return len(self.goals)

    def pool(self, subject: Optional[str]) -> Tuple[str, ...]:
        """The goals a task in this subject may be compared with, before words.

        A task with a subject gets that subject's goals and the cross-subject
        ones — never another subject's. A task with none gets them all.
        """
        subject = (subject or '').strip().lower()
        if not subject:
            return tuple(self.goals)
        return self.by_subject.get(subject, ()) + self.cross

    def candidates(self, subject: Optional[str], tokens: Iterable[str]) -> List[GoalProfile]:
        """The goals in the task's pool that share at least one real word with it.

        A goal sharing nothing but generic words, or nothing at all, is left
        out without being scored: the most it could reach is the subject and
        generic evidence, which config.py keeps below the ambiguous threshold.
        """
        hits = set()
        for word in kept(tokens):
            hits |= self.by_term.get(word, frozenset())
        return [self.goals[goal_id] for goal_id in self.pool(subject) if goal_id in hits]


def build(goals: Iterable[dict], checkpoints: Iterable[dict] = (),
          include_completed: bool = False) -> CandidateIndex:
    """The index over `goals`, from plain rows. No database."""
    chosen = [goal for goal in goals if is_candidate(goal, include_completed)]
    wanted = {str(goal['id']) for goal in chosen}
    titles: Dict[str, List[str]] = {}
    for stone in checkpoints:
        goal_id = str(stone.get('goal_id') or '')
        if goal_id in wanted and stone.get('title'):
            titles.setdefault(goal_id, []).append(stone['title'])
    return CandidateIndex(profile(goal, titles.get(str(goal['id']), ())) for goal in chosen)


def load(username: str, include_completed: bool = False) -> CandidateIndex:
    """This account's index, from two narrow reads. Build once, use for a batch."""
    return build(db.columns_for('goals', username, GOAL_FIELDS),
                 db.columns_for('goal_milestones', username, CHECKPOINT_FIELDS, order='position'),
                 include_completed)
