/* summit/schedule.h — fitting a list of tasks into a week, by search.
 *
 * ## Why this is the job C++ got, and the rollup is not
 *
 * The first thing tried here was the daily rollup in
 * backend/tracking/analytics.py — the merge of three streams of (user, day,
 * numbers) that `/api/standing` runs for every account. It was written, it was
 * correct, and it was three times *slower* than the Python it replaced.
 *
 * The reason is worth writing down, because it is the rule for anything else
 * that gets moved here. A rollup's work is proportional to the rows that go
 * into it: 1.3 million rows in, a million days out, and one addition each.
 * Handing those rows across a ctypes boundary means flattening a nested dict
 * into a buffer, and that flattening — measured at its absolute cheapest, with
 * no function calls and no conversions — cost 483ms against the 511ms the
 * whole Python rollup took. The engine had not added a single number yet. When
 * the data *is* the workload, moving the workload moves the data, and there is
 * nothing left to win.
 *
 * Scheduling is the opposite shape. Two hundred tasks and a hundred slots is
 * about twelve kilobytes; the answer is eight hundred bytes. Between them are
 * a few million candidate rearrangements, each one a handful of additions and
 * a comparison. The ratio of arithmetic to bytes is thousands to one, and that
 * ratio is the only thing that makes crossing the boundary worth it.
 *
 * **So the rule is: send C++ a small question with a large answer behind it.**
 *
 * ## What it decides, and what it is told
 *
 * Nothing here knows what a task is. It is given durations, values, deadlines
 * and a subject id per task; capacities and a weight per slot; and three
 * numbers that say how to trade those off. Every one of those comes from
 * Python — the weights from whatever model of the reader's day the caller has,
 * the values from XP, the deadlines from the calendar. This searches, and does
 * not judge. See backend/engine/schedule.py, which is the only caller.
 *
 * ## The objective
 *
 * A plan's score is, over every slot:
 *
 *     for each task in the slot:  value x slot weight
 *                              -  value x late_penalty, if past its deadline
 *     minus                       switch_penalty, per change of subject
 *                                 between consecutive tasks in that slot
 *
 * An unscheduled task scores nothing, which is what makes leaving one out a
 * real option rather than something the search has to be stopped from doing.
 * Capacity is a hard constraint and is never violated, not even transiently:
 * a move that would overfill a slot is rejected before it is scored.
 *
 * ## The search
 *
 * A greedy seed by value density, then simulated annealing over two moves —
 * relocate one task, or swap two. Both are local: a move touches at most two
 * slots, so only those two slots are rescored, which is what makes a few
 * million iterations cheap. The result is not optimal and is not claimed to
 * be; it is reproducible, which matters more. Same seed, same answer.
 */
#ifndef SUMMIT_SCHEDULE_H
#define SUMMIT_SCHEDULE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Bumped when anything below changes shape. backend/engine/__init__.py refuses
   a library whose number it does not know: a stale .so has the same symbols
   and would answer confidently with the wrong fields. */
#define SUMMIT_ENGINE_ABI 1

enum {
    SUMMIT_ERR_NULL = -1,   /* a required pointer was null */
    SUMMIT_ERR_COUNT = -2,  /* a negative or absurd count */
    SUMMIT_ERR_MEMORY = -3  /* an allocation failed */
};

/* What there is to do. Parallel arrays, filled by backend/engine/schedule.py
   from `array.array` buffers, so nothing is copied on the way in. */
typedef struct {
    const int32_t* minutes;  /* how long it takes; must be > 0 */
    const double* value;     /* what finishing it is worth — XP, usually */
    const int32_t* due;      /* last slot it may sit in, or -1 for no deadline */
    const int32_t* subject;  /* dense subject id, or -1 for none */
    int32_t count;
} summit_tasks;

/* Where it can go. A slot is whatever the caller says it is — an afternoon, an
   hour, a study block — and `weight` is how well work goes in it. */
typedef struct {
    const int32_t* minutes;  /* capacity */
    const double* weight;    /* 1.0 is an ordinary slot; higher is a better one */
    int32_t count;
} summit_slots;

/* The three numbers that decide what a good plan is. */
typedef struct {
    /* Fraction of a task's value lost by finishing it after its deadline.
       1.0 makes a late task worthless; above 1.0 makes it worse than not
       doing it, which is a real position and why it is not clamped. */
    double late_penalty;
    /* Charged once per change of subject between consecutive tasks in a slot.
       In the units `value` is in, so 25 means "a switch costs 25 XP". */
    double switch_penalty;
    /* Annealing steps. 0 asks the engine to choose from the problem's size,
       which is what every caller should pass unless it is benchmarking. */
    int32_t iterations;
    /* Same seed, same plan. Fixed rather than random so that a plan can be
       reproduced from its inputs when somebody asks why it said that. */
    uint64_t seed;
} summit_plan_opts;

/* The ABI this build speaks. Checked on load. */
int32_t summit_engine_abi(void);

/* Plan, writing `out_slot[i]` = the slot task i goes in, or -1 for unscheduled.
 * Returns the plan's score, or a negative SUMMIT_ERR_* if the call was wrong.
 * A score is never negative for a valid call: the empty plan scores 0 and is
 * always available, so the search cannot do worse than nothing. */
double summit_plan(const summit_tasks* tasks, const summit_slots* slots,
                   const summit_plan_opts* opts, int32_t* out_slot);

/* What `summit_plan` would score for an assignment somebody else made. The
 * pure-Python fallback and the engine are compared through this in
 * tests/test_engine_schedule.py: two planners are only comparable if one ruler
 * measures both. Returns SUMMIT_ERR_* on a bad call, and a score otherwise —
 * including for an assignment that overfills a slot, which is scored as it
 * stands rather than rejected, so that a caller can find out *how* bad. */
double summit_plan_score(const summit_tasks* tasks, const summit_slots* slots,
                         const summit_plan_opts* opts, const int32_t* slot_of);

#ifdef __cplusplus
} /* extern "C" */
#endif

#endif /* SUMMIT_SCHEDULE_H */
