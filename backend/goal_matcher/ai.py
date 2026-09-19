"""The second opinion, for the few tasks the rules cannot settle.

Only ambiguous tasks reach this — a handful of plausible goals and no
confident one (see deterministic.decide). A matched task is already answered;
an unmatched one has nothing to ask about, and asking anyway is how a model
ends up inventing a relationship nobody's words support.

## What is sent

The task's title, its subject, and the shortlist the rules already drew up:
at most MAX_CANDIDATES goals, each as a title and its checkpoint titles. No
task history, no other goals, no descriptions, no ids. The answer comes back
as the numbers beside the goals, which is the smallest thing that can be said
and the easiest to check.

## What comes back

Numbers this module recognises, or nothing. An answer naming a goal that was
not offered, an answer that is not the shape asked for, an error, a timeout —
all read the same way: no answer, and the task stays ambiguous. Nothing here
can produce a match the rules did not already consider.

## Asked once

Answers are cached on what was asked, not on which task asked it: the same
title, subject and shortlist give the same answer, so eighty-five "USACO
training" tasks are one call. The cache lives in the database, so a restart
does not buy it again.
"""
import hashlib
import json
from typing import List, Optional, Sequence, Tuple

from backend.database import connection as db
from backend.goal_matcher import metrics
from backend.goal_matcher.config import MAX_MATCHES_PER_TASK
from backend.goal_matcher.normalize import normalize
from backend.tracking import planner

# The most goals a question may offer. The rules rarely find more than three
# plausible ones; past five the question is a list to skim rather than a
# choice to make.
MAX_CANDIDATES = 5

# Bumped when the question or the reading of the answer changes, so cached
# answers to the old question are not reused.
ASK_VERSION = 1

SYSTEM = """\
You decide which goals a piece of work counts toward.

You are given one task and a short list of goals. Answer with the numbers of \
the goals the task is genuinely work toward — the ones whose progress this \
task moves.

Be strict. Most tasks belong to no goal at all, and saying so is the right \
answer: an empty list is expected and is never a failure. Do not choose a \
goal because it is the same broad subject, or because both mention studying, \
practising or revising. Choose it when doing the task is doing part of that \
goal.

A task may count toward more than one goal. Answer with numbers only.\
"""

SCHEMA = {
    'type': 'object',
    'properties': {
        'goals': {
            'type': 'array',
            'items': {'type': 'integer'},
            'description': 'The numbers of the goals this task is work toward. Empty if none.',
        },
    },
    'required': ['goals'],
    'additionalProperties': False,
}


def available() -> bool:
    """Whether a model that can hold a shape is configured. Checked per call."""
    return planner.able()


def brief(title: str, subject: str, candidates: Sequence[Tuple[str, str, Sequence[str]]]) -> str:
    """The question: one task, one subject, a numbered shortlist of goals."""
    lines = ['Task: {}'.format(title.strip())]
    if subject:
        lines.append('Filed under: {}'.format(subject.replace('_', ' ')))
    lines.append('')
    lines.append('Goals:')
    for at, (_, goal_title, stages) in enumerate(candidates, start=1):
        lines.append('{}. {}'.format(at, goal_title.strip()))
        for stage in list(stages)[:5]:
            if stage:
                lines.append('   - {}'.format(str(stage).strip()))
    return '\n'.join(lines)


def cache_key(title: str, subject: str, candidates: Sequence[Tuple[str, str, Sequence[str]]]) -> str:
    """What was asked, as one short string. Two identical questions share it."""
    parts = [str(ASK_VERSION), normalize(title), (subject or '').strip().lower()]
    for goal_id, goal_title, stages in candidates:
        parts.append('{}|{}|{}'.format(goal_id, normalize(goal_title),
                                       '~'.join(normalize(stage) for stage in stages)))
    return hashlib.sha1('\n'.join(parts).encode('utf-8')).hexdigest()


def _read(text: str, count: int) -> Optional[List[int]]:
    """The numbers in the answer, or None if it could not be read."""
    try:
        found = json.loads(planner._json_span(text))
    except (json.JSONDecodeError, ValueError, TypeError):
        return None
    if not isinstance(found, dict) or not isinstance(found.get('goals'), list):
        return None
    picked = []
    for entry in found['goals']:
        # A string of digits is a model answering the question in its own
        # way, not a bad answer. Anything else is.
        if isinstance(entry, bool):
            return None
        if isinstance(entry, str) and entry.strip().isdigit():
            entry = int(entry.strip())
        if not isinstance(entry, int):
            return None
        # Out of range is the one thing that cannot be honoured: it names a
        # goal that was never offered.
        if not 1 <= entry <= count:
            return None
        if entry not in picked:
            picked.append(entry)
    return picked[:MAX_MATCHES_PER_TASK]


def ask(username: str, title: str, subject: str,
        candidates: Sequence[Tuple[str, str, Sequence[str]]]) -> Optional[List[str]]:
    """Which of these goals the task is toward. None when there is no answer.

    None means the question could not be answered — no model configured, a
    call that failed, an answer that could not be read — and the caller leaves
    the task as it was. An empty list is an answer: none of them.
    """
    candidates = list(candidates)[:MAX_CANDIDATES]
    if not candidates or not available():
        return None

    key = cache_key(title, subject, candidates)
    held = db.goal_ai_answer(username, key)
    if held is not None:
        metrics.count('ai_cached')
        return [goal_id for goal_id in held if goal_id in {c[0] for c in candidates}]

    metrics.count('ai_asked')
    try:
        text = planner.from_provider(
            brief(title, subject, candidates),
            system=SYSTEM,
            schema=SCHEMA,
            instruction='Which of these goals is this task work toward?',
        )
    except Exception as exc:  # noqa: BLE001 - every failure reads the same here
        metrics.count('ai_failed')
        print('[goal_matcher] the model could not be asked: {!r}'.format(exc))
        return None

    numbers = _read(text, len(candidates))
    if numbers is None:
        metrics.count('ai_unreadable')
        print('[goal_matcher] the model answer could not be read')
        return None

    metrics.count('ai_answered')
    chosen = [candidates[number - 1][0] for number in numbers]
    db.save_goal_ai_answer(username, key, chosen)
    return chosen
