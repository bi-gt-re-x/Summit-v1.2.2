"""The C++ planner, held to the Python one it replaces.

There are two planners: the annealing search in `engine/`, and the greedy in
`backend/engine/schedule.py` that runs when the library is not built. They do
not have to agree — a search that returned the greedy's answer would be
pointless — so what is asserted instead is the pair of claims that make the
search worth having:

  * it never returns a **worse** plan than the greedy, measured on the same
    ruler; and
  * the plan it returns is **valid**: no slot over its capacity, no task in
    two places, no task in a slot that does not exist.

The second is the one that matters. An annealing search moves by undoing and
redoing assignments thousands of times a second, and the failure mode of
getting an undo subtly wrong is not a crash — it is a plan that slowly stops
obeying its own capacities and looks fine. Every test here that produces a
plan checks it.

Skipped, not failed, when the library is not built: the engine is optional on
purpose, and a suite that went red on a machine with no C++ compiler would
have made it mandatory by the back door. The greedy's own tests run either
way, at the bottom, because that path is the one most people will be on.
"""
import random

import pytest

from backend import engine
from backend.engine import schedule

needs_engine = pytest.mark.skipif(
    not schedule.available(),
    reason=f'C++ engine unavailable: {engine.reason()}',
)


def _week(seed, tasks=60, slots=10):
    """A week's worth of work, shaped like a real one.

    Ragged on purpose: a few tasks too long for any slot, a few with deadlines
    early in the week, a spread of subjects, and more work than there is room
    for — which is the only interesting case, because a week that fits needs
    no planner.
    """
    rng = random.Random(seed)
    work = [
        schedule.Task(
            minutes=rng.choice([15, 25, 30, 45, 60, 90, 120]),
            value=rng.randint(10, 300),
            due=rng.randint(0, slots - 1) if rng.random() < 0.3 else None,
            subject=rng.randint(0, 5),
        )
        for _ in range(tasks)
    ]
    day = [schedule.Slot(minutes=rng.choice([90, 120, 180]),
                         weight=round(rng.uniform(0.5, 1.5), 2))
           for _ in range(slots)]
    return work, day


def _is_valid(work, day, slot_of):
    """No slot over capacity, and every index in range."""
    assert len(slot_of) == len(work)
    used = [0] * len(day)
    for index, slot in enumerate(slot_of):
        assert -1 <= slot < len(day), f'task {index} sent to slot {slot}'
        if slot >= 0:
            used[slot] += work[index].minutes
    for slot, minutes in enumerate(used):
        assert minutes <= day[slot].minutes, (
            f'slot {slot} holds {minutes}m of {day[slot].minutes}m')
    return True


# --------------------------------------------------------------------------
# The engine
# --------------------------------------------------------------------------
@needs_engine
@pytest.mark.parametrize('seed', [1, 7, 42, 2026])
def test_the_search_never_does_worse_than_the_greedy(seed):
    work, day = _week(seed)
    switch = 20.0

    greedy = schedule.plan_greedily(work, day, switch_penalty=switch)
    greedy_score = schedule.score_plan(work, day, greedy, switch_penalty=switch)

    searched = schedule.plan(work, day, switch_penalty=switch)

    assert searched.engine is True
    assert _is_valid(work, day, searched.slot_of)
    # The greedy is the search's own starting point, so this is a floor it
    # cannot fall through — if it ever does, the annealing is keeping a plan
    # it walked to rather than the best one it saw.
    assert searched.score >= greedy_score - 1e-6


@needs_engine
def test_the_search_actually_improves_on_its_seed():
    # Not merely "no worse". If this stops holding, the annealing has stopped
    # doing anything and the engine is an expensive greedy.
    total_gain = 0.0
    for seed in range(8):
        work, day = _week(seed, tasks=80, slots=8)
        greedy = schedule.plan_greedily(work, day, switch_penalty=25.0)
        base = schedule.score_plan(work, day, greedy, switch_penalty=25.0)
        found = schedule.plan(work, day, switch_penalty=25.0)
        total_gain += found.score - base
    assert total_gain > 0


@needs_engine
def test_the_two_scorers_agree():
    # score_plan is written in Python and in C++ — the one piece of arithmetic
    # deliberately in both languages, because the fallback needs a ruler on a
    # machine with no engine. If they drift, every comparison above is void.
    work, day = _week(3)
    found = schedule.plan(work, day, switch_penalty=12.5, late_penalty=0.7)
    in_python = schedule.score_plan(work, day, found.slot_of,
                                    switch_penalty=12.5, late_penalty=0.7)
    assert found.score == pytest.approx(in_python, rel=1e-9)


@needs_engine
def test_the_same_seed_gives_the_same_plan():
    # Reproducibility is most of what a planner returns: "why did it say that?"
    # has no answer if the answer changes between two identical calls.
    work, day = _week(11)
    first = schedule.plan(work, day, seed=99)
    second = schedule.plan(work, day, seed=99)
    assert first.slot_of == second.slot_of
    assert first.score == second.score


@needs_engine
def test_a_deadline_is_worth_respecting_when_it_costs_less_than_missing_it():
    work = [schedule.Task(minutes=60, value=100, due=0)]
    day = [schedule.Slot(60, weight=1.0), schedule.Slot(60, weight=1.2)]

    # 100 x 1.0 on time beats 100 x 1.2 minus 90 late.
    strict = schedule.plan(work, day, late_penalty=0.9)
    assert strict.slot_of == [0]

    # Barely penalised, the nicer slot wins instead — the planner is trading,
    # not obeying.
    relaxed = schedule.plan(work, day, late_penalty=0.01)
    assert relaxed.slot_of == [1]


@needs_engine
def test_it_leaves_out_what_it_cannot_fit():
    work = [schedule.Task(minutes=60, value=500), schedule.Task(minutes=60, value=5)]
    day = [schedule.Slot(60)]
    found = schedule.plan(work, day)
    assert found.slot_of[0] == 0
    assert found.slot_of[1] == -1
    assert _is_valid(work, day, found.slot_of)


@needs_engine
def test_a_big_week_is_still_valid():
    # 400 tasks over 40 slots is far past anything a person has, and is here
    # because capacity bugs in a local search show up under pressure.
    work, day = _week(5, tasks=400, slots=40)
    found = schedule.plan(work, day, switch_penalty=8.0)
    assert _is_valid(work, day, found.slot_of)


# --------------------------------------------------------------------------
# The fallback, which runs whether or not the engine is built
# --------------------------------------------------------------------------
@pytest.mark.parametrize('seed', [1, 7, 42])
def test_the_greedy_is_valid_too(seed):
    work, day = _week(seed)
    assert _is_valid(work, day, schedule.plan_greedily(work, day))


def test_plan_falls_back_when_the_engine_is_off(monkeypatch):
    monkeypatch.setattr(schedule.engine, 'available', lambda: False)
    work, day = _week(2)
    found = schedule.plan(work, day)
    assert found.engine is False
    assert _is_valid(work, day, found.slot_of)
    assert found.score == pytest.approx(
        schedule.score_plan(work, day, found.slot_of))


def test_nothing_to_do_or_nowhere_to_do_it():
    assert schedule.plan([], [schedule.Slot(60)]).slot_of == []
    found = schedule.plan([schedule.Task(30, 10)], [])
    assert found.slot_of == [-1]
    assert found.score == 0.0


def test_a_task_with_no_minutes_is_refused():
    # It would fit anywhere, any number of times, and the search would place
    # infinitely many of them. Caught at the door rather than in the engine.
    with pytest.raises(ValueError):
        schedule.plan([schedule.Task(0, 10)], [schedule.Slot(60)])
