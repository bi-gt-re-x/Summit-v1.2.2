"""Fitting a list of tasks into the week ahead.

Two planners behind one function. `plan()` hands the problem to the C++ search
in `engine/` when it is built, and to `plan_greedily()` — the reference
implementation below — when it is not. Both answer in the same shape and both
are measured by the same scorer, so a caller never has to ask which one ran.

## What a caller supplies

Tasks and slots, and three numbers saying how to trade them off. None of it is
invented here: the minutes come from the task's estimate, the value from its
XP, the deadline from the calendar, and the slot weights from whatever model
of the reader's day the caller has — a flat 1.0 is a perfectly good start.
A "slot" is whatever the caller decides a slot is; this only ever sees a
capacity and a weight.

## Why there is a Python planner at all

Because the engine is optional (see `backend/engine/__init__.py`) and a
feature that only exists on machines with a C++ compiler is not a feature.
`plan_greedily` is the same first move the engine makes — densest first, into
the slot that scores it best — and stops there. It is decent, it is fast, and
it is what the search is measured against: `tests/test_engine_schedule.py`
asserts the engine never returns a worse plan than this one, which is the only
honest way to claim the search is doing something.

## Nothing here is wired to a route

Deliberately. This is a library with two implementations and a test, and
adding an endpoint is a separate decision about product, auth and the shape of
the request — not something to slip in behind a performance change. The entry
point is `plan()`; see `engine/README.md` for the shape of the call.
"""
import ctypes
from array import array

from backend import engine

#: What a slot is worth when the caller has no model of the reader's day yet.
DEFAULT_WEIGHT = 1.0

#: Fraction of a task's value lost by landing after its deadline. Half, so a
#: late task is still worth doing — which is true, and the alternative is a
#: planner that drops everything it cannot finish in time.
DEFAULT_LATE_PENALTY = 0.5

#: What it costs to change subject between two tasks in the same slot, in the
#: units `value` is in. Zero until the caller has a reason: context switching
#: is real, but how expensive it is for a given person is a thing to measure
#: rather than assume.
DEFAULT_SWITCH_PENALTY = 0.0

#: Fixed rather than random, so the same inputs give the same plan and a
#: reader asking "why did it say that?" can be answered.
DEFAULT_SEED = 0x5EED


class Task:
    """One thing to do. `minutes` must be positive; everything else may be 0."""

    __slots__ = ('minutes', 'value', 'due', 'subject')

    def __init__(self, minutes, value, due=None, subject=None):
        self.minutes = int(minutes)
        self.value = float(value)
        #: The last slot index it may sit in, or None for no deadline.
        self.due = -1 if due is None else int(due)
        #: A dense integer per subject, or None. Only ever compared for
        #: equality, so the caller may number them however it likes.
        self.subject = -1 if subject is None else int(subject)


class Slot:
    """Somewhere to put work: a capacity, and how well work goes in it."""

    __slots__ = ('minutes', 'weight')

    def __init__(self, minutes, weight=DEFAULT_WEIGHT):
        self.minutes = int(minutes)
        self.weight = float(weight)


class Plan:
    """An answer: where each task went, what it scored, and who decided."""

    __slots__ = ('slot_of', 'score', 'engine')

    def __init__(self, slot_of, score, by_engine):
        #: One entry per task: the slot index it goes in, or -1 for left out.
        self.slot_of = slot_of
        self.score = score
        #: True when the C++ search produced it, False for the Python greedy.
        self.engine = by_engine

    def __repr__(self):
        placed = sum(1 for slot in self.slot_of if slot >= 0)
        who = 'engine' if self.engine else 'greedy'
        return f'<Plan {placed}/{len(self.slot_of)} placed, {self.score:.1f}, {who}>'


def available() -> bool:
    """Whether `plan()` will search rather than fall back to the greedy."""
    return engine.available()


def score_plan(tasks, slots, slot_of, *, late_penalty=DEFAULT_LATE_PENALTY,
               switch_penalty=DEFAULT_SWITCH_PENALTY):
    """What an assignment is worth, by the same objective both planners use.

    Written out here as well as in C++ — the one piece of arithmetic that is
    deliberately in both languages. Two planners are only comparable if one
    ruler measures both, and a ruler that only exists on machines with the
    engine built cannot measure the fallback on machines without it. The two
    are checked against each other in tests/test_engine_schedule.py.

    An assignment that overfills a slot is scored as it stands rather than
    rejected: a caller comparing plans wants to know how bad, and the
    constraint is enforced by the planners, not by the scorer.
    """
    here = [[] for _ in slots]
    for index, slot in enumerate(slot_of):
        if 0 <= slot < len(slots):
            here[slot].append(index)

    total = 0.0
    for slot_index, contents in enumerate(here):
        weight = slots[slot_index].weight
        previous_subject = None
        for at, task_index in enumerate(contents):
            task = tasks[task_index]
            total += task.value * weight
            if task.due >= 0 and slot_index > task.due:
                total -= task.value * late_penalty
            if at > 0 and task.subject != previous_subject:
                total -= switch_penalty
            previous_subject = task.subject
    return total


def plan_greedily(tasks, slots, *, late_penalty=DEFAULT_LATE_PENALTY,
                  switch_penalty=DEFAULT_SWITCH_PENALTY):
    """Densest task first, into the slot it gains most in. Never overfills.

    The same opening move the engine makes, and the whole of what happens when
    the engine is not there. Value *per minute*, because a slot is minutes: an
    eight-hour task worth 200 and four one-hour tasks worth 100 each are not
    the same offer, and sorting on value alone cannot tell them apart.
    """
    slot_of = [-1] * len(tasks)
    if not tasks or not slots:
        return slot_of

    used = [0] * len(slots)
    contents = [[] for _ in slots]

    def slot_score(slot_index):
        total = 0.0
        weight = slots[slot_index].weight
        previous_subject = None
        for at, task_index in enumerate(contents[slot_index]):
            task = tasks[task_index]
            total += task.value * weight
            if task.due >= 0 and slot_index > task.due:
                total -= task.value * late_penalty
            if at > 0 and task.subject != previous_subject:
                total -= switch_penalty
            previous_subject = task.subject
        return total

    order = sorted(range(len(tasks)),
                   key=lambda i: (-(tasks[i].value / tasks[i].minutes), i))

    for task_index in order:
        task = tasks[task_index]
        best_slot, best_gain = -1, 0.0   # leaving it out scores 0; beat that
        for slot_index, slot in enumerate(slots):
            if used[slot_index] + task.minutes > slot.minutes:
                continue
            before = slot_score(slot_index)
            contents[slot_index].append(task_index)
            gain = slot_score(slot_index) - before
            contents[slot_index].pop()
            if gain > best_gain:
                best_gain, best_slot = gain, slot_index
        if best_slot >= 0:
            contents[best_slot].append(task_index)
            used[best_slot] += task.minutes
            slot_of[task_index] = best_slot
    return slot_of


def plan(tasks, slots, *, late_penalty=DEFAULT_LATE_PENALTY,
         switch_penalty=DEFAULT_SWITCH_PENALTY, iterations=0,
         seed=DEFAULT_SEED):
    """The plan, searched in C++ if it is built and greedy in Python if not.

    `iterations` of 0 lets the engine choose from the size of the problem,
    which is what every caller should pass unless it is benchmarking. It is
    ignored by the fallback, which does not search.
    """
    for task in tasks:
        if task.minutes <= 0:
            raise ValueError('a task with no minutes would fit anywhere, '
                             'any number of times')

    if not engine.available() or not tasks or not slots:
        slot_of = plan_greedily(tasks, slots, late_penalty=late_penalty,
                                switch_penalty=switch_penalty)
        return Plan(slot_of,
                    score_plan(tasks, slots, slot_of, late_penalty=late_penalty,
                               switch_penalty=switch_penalty),
                    by_engine=False)

    # Columns, built once. Small enough that the cost of getting there is
    # nothing beside the search behind it — which is the whole reason this
    # workload is in C++ and the daily rollup is not. See engine/README.md.
    minutes = array('i', (task.minutes for task in tasks))
    values = array('d', (task.value for task in tasks))
    dues = array('i', (task.due for task in tasks))
    subjects = array('i', (task.subject for task in tasks))
    slot_minutes = array('i', (slot.minutes for slot in slots))
    slot_weights = array('d', (slot.weight for slot in slots))
    out = (ctypes.c_int32 * len(tasks))()

    call_tasks = engine.Tasks(
        minutes=_ptr(minutes, ctypes.c_int32),
        value=_ptr(values, ctypes.c_double),
        due=_ptr(dues, ctypes.c_int32),
        subject=_ptr(subjects, ctypes.c_int32),
        count=len(tasks),
    )
    call_slots = engine.Slots(
        minutes=_ptr(slot_minutes, ctypes.c_int32),
        weight=_ptr(slot_weights, ctypes.c_double),
        count=len(slots),
    )
    options = engine.PlanOpts(
        late_penalty=float(late_penalty),
        switch_penalty=float(switch_penalty),
        iterations=int(iterations),
        seed=int(seed),
    )

    score = engine.library().summit_plan(
        ctypes.byref(call_tasks), ctypes.byref(call_slots),
        ctypes.byref(options), out)
    if score < 0:
        raise RuntimeError(f'engine error {int(score)}')
    return Plan(list(out), score, by_engine=True)


def _ptr(buffer, kind):
    """A pointer into an `array.array`'s own storage — no copy.

    The engine's columns are `const`, and its one output is a ctypes array
    rather than an `array.array` so that reading it back is an index rather
    than a struct unpack.
    """
    return ctypes.cast(buffer.buffer_info()[0], ctypes.POINTER(kind))
