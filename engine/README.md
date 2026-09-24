# The Summit engine

One small C++ library, for the one kind of work Python is the wrong tool for.

```
    FastAPI
       │  request
       ▼
    backend/tracking/…            rules, rows, everything else
       │  a small question
       ▼
    backend/engine/schedule.py    columns out, an answer back
       │  ctypes, no copy
       ▼
    engine/  (this)               a few million candidate plans
       │  an answer
       ▼
    backend/…                     turned back into tasks and days
       │
       ▼
    the datastore
```

## Build it

```sh
./build.sh          # the shared library, into build/
./build.sh test     # …and the C++ checks
./build.sh clean
```

Any C++17 compiler. There is no CMake here on purpose: this is one source file
and one header, and a build system would be more lines than the thing it
builds.

**Nothing in Summit requires it.** `backend/engine/schedule.py` keeps a
pure-Python planner and uses it when the library is missing, stale, or turned
off with `SUMMIT_ENGINE=0`. An unbuilt engine is a slightly worse plan, never a
broken app — which is the only reason a C++ dependency can live in a repo whose
other half is a Vite app.

## What is in here

| | |
|---|---|
| `include/summit/schedule.h` | the `extern "C"` ABI, and why the boundary is where it is |
| `src/schedule.cpp` | greedy seed, then simulated annealing |
| `tests/schedule_test.cpp` | the contract: capacities, determinism, bad calls |
| `build.sh` | the whole build |

On the Python side: `backend/engine/__init__.py` loads the library and checks
its ABI, `backend/engine/schedule.py` is the only thing that calls it, and
`tests/test_engine_schedule.py` holds the two planners to the same ruler.

## The rule for what belongs here

**Send C++ a small question with a large answer behind it.**

That rule was bought rather than guessed. The first thing moved here was the
daily rollup in `backend/tracking/analytics.py` — the merge of three streams of
`(user, day, numbers)` that `/api/standing` runs for every account, which is
exactly the "10,000 users × 50,000 events" shape a C++ engine sounds right for.
It was written, it passed an equality test against the Python on five random
datasets, and it was **three times slower**:

| | rows | Python | engine |
|---|---|---|---|
| 200 users × 365 days | 131,322 | 53ms | 164ms |
| 2,000 users × 365 days | 1,313,365 | 511ms | 1,708ms |
| 10,000 users × 120 days | 2,159,976 | 860ms | 2,768ms |

The reason is not the fold; the fold was fast. It is that a rollup's work is
proportional to the rows going into it, so moving the work means moving the
rows. Flattening the nested dicts into buffers — measured at its absolute
cheapest, no function calls, no conversions — cost **483ms** against the
**511ms** the entire Python rollup took, before the engine had added a single
number. When the data *is* the workload, there is nothing left to win.

Scheduling is the opposite shape, and that is why it is the thing that stayed:

| | data across the boundary | work behind it |
|---|---|---|
| rollup | 2.1M rows | 2.1M additions |
| planning | 200 tasks, 40 slots (~12KB) | 328,000 rearrangements |

Measured on this machine, 200 tasks over 40 slots:

```
 problem              greedy   searched    iterations   engine    iterations/s
 200 tasks / 40 slots  24,702    24,990       328,000    10.3ms    32,000,000
```

Python manages about 2.5 million iterations a second on a loop doing *less*
than a real move — no lifting, no placing, no rescoring — so the real ratio is
somewhere north of fifty. The point is not the multiple. The point is that
328,000 rearrangements fit inside 10ms and therefore inside a request, and in
Python they would not.

The gains over the greedy seed are small here (1.2%) because a densest-first
greedy is already good on a loosely-constrained week. They grow with the
constraints — deadlines, subject-switch penalties, slots of unequal quality —
which is also when a person can least work the answer out themselves.

## What it does not know

Not one rule about Summit. It is handed durations, values, deadlines, subject
ids, capacities, weights, and three numbers that say how to trade them off.
Every one of those is decided in Python and passed in already decided — the
weights from whatever model of the reader's day the caller has, the values from
XP, the deadlines from the calendar.

That split is deliberate and is the thing to preserve. A rule written in two
languages is a rule that will disagree with itself, and an accelerator that has
to be kept in step with the logic it accelerates is worth less than no
accelerator. The one exception is the scoring function, which exists in both
`src/schedule.cpp` and `backend/engine/schedule.py` — because the fallback
planner needs a ruler on machines with no engine — and the two are asserted
equal in `tests/test_engine_schedule.py`.

## Calling it

```python
from backend.engine import schedule

tasks = [schedule.Task(minutes=45, value=120, due=2, subject=3), ...]
slots = [schedule.Slot(minutes=120, weight=1.4), ...]     # weight: how well work goes here

plan = schedule.plan(tasks, slots, switch_penalty=20.0)
plan.slot_of      # [0, 2, -1, 1, ...]  -1 means left out
plan.score
plan.engine       # True if C++ searched it, False if the greedy did
```

Nothing is wired to a route. That is a separate decision about product, auth
and request shape, and not something to slip in behind a performance change.
