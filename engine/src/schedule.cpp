/* schedule.cpp — the search.
 *
 * Why this work is here rather than in Python, and what the objective means,
 * are in include/summit/schedule.h. This file is the algorithm.
 *
 * Three parts, in order: a scorer for one slot, a greedy seed, and annealing
 * over the seed. The scorer is the only place the objective is written down;
 * the other two call it and nothing else knows the formula.
 */
#include "summit/schedule.h"

#include <algorithm>
#include <cmath>
#include <new>
#include <vector>

namespace {

/* xorshift64*, written out rather than <random>.
 *
 * Not for speed — the search is not bound by its random numbers — but because
 * the standard engines' *distributions* are not specified to produce the same
 * values across implementations. A plan that differs between a Mac and a
 * Linux box for the same seed and the same input is not reproducible, and
 * reproducibility is most of what this returns. */
struct Rng {
    uint64_t state;
    explicit Rng(uint64_t seed) : state(seed ? seed : 0x9e3779b97f4a7c15ull) {}

    uint64_t next() {
        state ^= state >> 12;
        state ^= state << 25;
        state ^= state >> 27;
        return state * 0x2545f4914f6cdd1dull;
    }
    /* Unbiased enough for this; `bound` is a task or slot count, never near
       the point where the modulo skew could matter. */
    int32_t below(int32_t bound) {
        return bound <= 0 ? 0 : static_cast<int32_t>(next() % static_cast<uint64_t>(bound));
    }
    double unit() { return static_cast<double>(next() >> 11) * (1.0 / 9007199254740992.0); }
}
;

struct Problem {
    const summit_tasks* tasks;
    const summit_slots* slots;
    const summit_plan_opts* opts;

    /* Which tasks are in which slot, in the order they sit there. Order is
       only ever read by the subject-switch term; nothing else cares. */
    std::vector<std::vector<int32_t>> in_slot;
    std::vector<int32_t> slot_of;   /* task -> slot, or -1 */
    std::vector<int32_t> used;      /* slot -> minutes taken */
    std::vector<double> score_of;   /* slot -> its own contribution */

    /* One slot's contribution to the plan. The whole objective lives here. */
    double slot_score(int32_t slot) const {
        const std::vector<int32_t>& here = in_slot[static_cast<size_t>(slot)];
        if (here.empty()) return 0.0;

        const double weight = slots->weight[slot];
        double total = 0.0;
        int32_t previous_subject = -2;   /* -1 is a real subject id ("none") */

        for (size_t at = 0; at < here.size(); ++at) {
            const int32_t task = here[at];
            const double value = tasks->value[task];
            total += value * weight;

            const int32_t due = tasks->due[task];
            if (due >= 0 && slot > due) total -= value * opts->late_penalty;

            const int32_t subject = tasks->subject[task];
            if (at > 0 && subject != previous_subject) total -= opts->switch_penalty;
            previous_subject = subject;
        }
        return total;
    }

    double total_score() const {
        double total = 0.0;
        for (size_t slot = 0; slot < score_of.size(); ++slot) total += score_of[slot];
        return total;
    }

    bool fits(int32_t task, int32_t slot) const {
        return used[static_cast<size_t>(slot)] + tasks->minutes[task] <=
               slots->minutes[slot];
    }

    void place(int32_t task, int32_t slot) {
        in_slot[static_cast<size_t>(slot)].push_back(task);
        used[static_cast<size_t>(slot)] += tasks->minutes[task];
        slot_of[static_cast<size_t>(task)] = slot;
    }

    void lift(int32_t task) {
        const int32_t slot = slot_of[static_cast<size_t>(task)];
        if (slot < 0) return;
        std::vector<int32_t>& here = in_slot[static_cast<size_t>(slot)];
        here.erase(std::find(here.begin(), here.end(), task));
        used[static_cast<size_t>(slot)] -= tasks->minutes[task];
        slot_of[static_cast<size_t>(task)] = -1;
    }
};

/* The seed: densest tasks first, each into the slot that scores it best.
 *
 * Value per minute rather than value, because a slot is minutes: an eight-hour
 * task worth 200 and four one-hour tasks worth 100 each are not the same offer
 * and sorting on value alone cannot tell them apart. Ties break on the task
 * index so the seed does not depend on the sort's stability. */
void seed_greedily(Problem& plan) {
    const int32_t n = plan.tasks->count;
    std::vector<int32_t> order(static_cast<size_t>(n));
    for (int32_t i = 0; i < n; ++i) order[static_cast<size_t>(i)] = i;

    const summit_tasks* tasks = plan.tasks;
    std::sort(order.begin(), order.end(), [tasks](int32_t a, int32_t b) {
        const double da = tasks->value[a] / static_cast<double>(tasks->minutes[a]);
        const double db = tasks->value[b] / static_cast<double>(tasks->minutes[b]);
        if (da != db) return da > db;
        return a < b;
    });

    for (int32_t task : order) {
        int32_t best_slot = -1;
        double best_gain = 0.0;   /* leaving it out scores 0; beat that */

        for (int32_t slot = 0; slot < plan.slots->count; ++slot) {
            if (!plan.fits(task, slot)) continue;
            const double before = plan.score_of[static_cast<size_t>(slot)];
            plan.place(task, slot);
            const double gain = plan.slot_score(slot) - before;
            plan.lift(task);
            if (gain > best_gain) {
                best_gain = gain;
                best_slot = slot;
            }
        }
        if (best_slot >= 0) {
            plan.place(task, best_slot);
            plan.score_of[static_cast<size_t>(best_slot)] = plan.slot_score(best_slot);
        }
    }
}

/* How long to search, when the caller did not say.
 *
 * Linear in the problem's size with a floor and a ceiling. The floor is so a
 * ten-task week still gets shaken properly; the ceiling is so that a caller
 * who hands over something enormous waits a bounded time rather than however
 * long the formula says. */
int32_t iterations_for(int32_t tasks, int32_t slots) {
    const int64_t scale = static_cast<int64_t>(tasks) * (slots + 1) * 40;
    const int64_t floored = std::max<int64_t>(scale, 20000);
    return static_cast<int32_t>(std::min<int64_t>(floored, 4000000));
}

void anneal(Problem& plan, Rng& rng, int32_t iterations) {
    const int32_t n = plan.tasks->count;
    const int32_t m = plan.slots->count;
    if (n == 0 || m == 0) return;

    std::vector<int32_t> best_slot_of = plan.slot_of;
    double current = plan.total_score();
    double best = current;

    /* The starting temperature is a fraction of the typical task's value, so
       a move that costs about one task's worth of score is accepted early and
       refused late. Reading it off the data rather than fixing it means the
       same schedule is searched the same way whether values are XP in the
       hundreds or minutes in the tens. */
    double typical = 0.0;
    for (int32_t task = 0; task < n; ++task) typical += std::fabs(plan.tasks->value[task]);
    typical = n > 0 ? typical / n : 1.0;
    const double hot = std::max(typical * 0.35, 1e-6);

    for (int32_t step = 0; step < iterations; ++step) {
        /* Geometric cooling to a hundredth of the start. */
        const double progress = static_cast<double>(step) / iterations;
        const double temperature = hot * std::pow(0.01, progress);

        const int32_t task = rng.below(n);
        const int32_t from = plan.slot_of[static_cast<size_t>(task)];

        /* Two moves. A relocate can also mean "take it out", which is the only
           way a task the greedy seed forced in ever comes back out again. */
        const bool swapping = (rng.next() & 1u) != 0 && n > 1;
        int32_t other = -1;
        int32_t to = -1;

        if (swapping) {
            other = rng.below(n);
            if (other == task) continue;
            to = plan.slot_of[static_cast<size_t>(other)];
            if (to == from) continue;
        } else {
            to = rng.below(m + 1) - 1;   /* -1 .. m-1, where -1 is unscheduled */
            if (to == from) continue;
        }

        /* Remember what the touched slots scored, so an unaccepted move can be
           put back without rescoring the whole plan. */
        const int32_t touched_a = from;
        const int32_t touched_b = to;
        const double was_a = touched_a >= 0 ? plan.score_of[static_cast<size_t>(touched_a)] : 0.0;
        const double was_b = touched_b >= 0 ? plan.score_of[static_cast<size_t>(touched_b)] : 0.0;

        if (swapping) {
            plan.lift(task);
            plan.lift(other);
            if ((to >= 0 && !plan.fits(task, to)) || (from >= 0 && !plan.fits(other, from))) {
                if (from >= 0) plan.place(task, from);
                if (to >= 0) plan.place(other, to);
                continue;
            }
            if (to >= 0) plan.place(task, to);
            if (from >= 0) plan.place(other, from);
        } else {
            plan.lift(task);
            if (to >= 0 && !plan.fits(task, to)) {
                if (from >= 0) plan.place(task, from);
                continue;
            }
            if (to >= 0) plan.place(task, to);
        }

        const double now_a = touched_a >= 0 ? plan.slot_score(touched_a) : 0.0;
        const double now_b = touched_b >= 0 ? plan.slot_score(touched_b) : 0.0;
        const double delta = (now_a - was_a) + (now_b - was_b);

        const bool accept = delta >= 0.0 ||
                            rng.unit() < std::exp(delta / temperature);
        if (accept) {
            if (touched_a >= 0) plan.score_of[static_cast<size_t>(touched_a)] = now_a;
            if (touched_b >= 0) plan.score_of[static_cast<size_t>(touched_b)] = now_b;
            current += delta;
            if (current > best) {
                best = current;
                best_slot_of = plan.slot_of;
            }
        } else {
            /* Undo. Rebuilt from the remembered assignment rather than by
               reversing the move, because a swap is four operations and
               getting the inverse of it subtly wrong is a plan that slowly
               stops obeying its capacities. */
            if (swapping) {
                plan.lift(task);
                plan.lift(other);
                if (from >= 0) plan.place(task, from);
                if (to >= 0) plan.place(other, to);
            } else {
                plan.lift(task);
                if (from >= 0) plan.place(task, from);
            }
            if (touched_a >= 0) plan.score_of[static_cast<size_t>(touched_a)] = was_a;
            if (touched_b >= 0) plan.score_of[static_cast<size_t>(touched_b)] = was_b;
        }
    }

    /* The best plan seen, not the last one walked to. */
    plan.slot_of = best_slot_of;
}

bool valid(const summit_tasks* tasks, const summit_slots* slots,
           const summit_plan_opts* opts) {
    if (tasks == nullptr || slots == nullptr || opts == nullptr) return false;
    if (tasks->count < 0 || slots->count < 0) return false;
    if (tasks->count > 0 &&
        (tasks->minutes == nullptr || tasks->value == nullptr ||
         tasks->due == nullptr || tasks->subject == nullptr)) {
        return false;
    }
    if (slots->count > 0 && (slots->minutes == nullptr || slots->weight == nullptr)) {
        return false;
    }
    for (int32_t task = 0; task < tasks->count; ++task) {
        if (tasks->minutes[task] <= 0) return false;
    }
    return true;
}

}  // namespace

extern "C" int32_t summit_engine_abi(void) { return SUMMIT_ENGINE_ABI; }

extern "C" double summit_plan(const summit_tasks* tasks, const summit_slots* slots,
                              const summit_plan_opts* opts, int32_t* out_slot) {
    if (!valid(tasks, slots, opts)) return SUMMIT_ERR_NULL;
    if (tasks->count > 0 && out_slot == nullptr) return SUMMIT_ERR_NULL;
    for (int32_t task = 0; task < tasks->count; ++task) out_slot[task] = -1;
    if (tasks->count == 0 || slots->count == 0) return 0.0;

    try {
        Problem plan{};
        plan.tasks = tasks;
        plan.slots = slots;
        plan.opts = opts;
        plan.in_slot.assign(static_cast<size_t>(slots->count), {});
        plan.slot_of.assign(static_cast<size_t>(tasks->count), -1);
        plan.used.assign(static_cast<size_t>(slots->count), 0);
        plan.score_of.assign(static_cast<size_t>(slots->count), 0.0);

        seed_greedily(plan);

        const int32_t steps = opts->iterations > 0
                                  ? opts->iterations
                                  : iterations_for(tasks->count, slots->count);
        Rng rng(opts->seed);
        anneal(plan, rng, steps);

        for (int32_t task = 0; task < tasks->count; ++task) {
            out_slot[task] = plan.slot_of[static_cast<size_t>(task)];
        }
        return summit_plan_score(tasks, slots, opts, out_slot);
    } catch (const std::bad_alloc&) {
        return SUMMIT_ERR_MEMORY;
    }
}

extern "C" double summit_plan_score(const summit_tasks* tasks,
                                    const summit_slots* slots,
                                    const summit_plan_opts* opts,
                                    const int32_t* slot_of) {
    if (!valid(tasks, slots, opts)) return SUMMIT_ERR_NULL;
    if (tasks->count > 0 && slot_of == nullptr) return SUMMIT_ERR_NULL;
    if (tasks->count == 0 || slots->count == 0) return 0.0;

    try {
        Problem plan{};
        plan.tasks = tasks;
        plan.slots = slots;
        plan.opts = opts;
        plan.in_slot.assign(static_cast<size_t>(slots->count), {});
        plan.slot_of.assign(static_cast<size_t>(tasks->count), -1);
        plan.used.assign(static_cast<size_t>(slots->count), 0);
        plan.score_of.assign(static_cast<size_t>(slots->count), 0.0);

        for (int32_t task = 0; task < tasks->count; ++task) {
            const int32_t slot = slot_of[task];
            if (slot < 0 || slot >= slots->count) continue;
            plan.place(task, slot);
        }
        double total = 0.0;
        for (int32_t slot = 0; slot < slots->count; ++slot) total += plan.slot_score(slot);
        return total;
    } catch (const std::bad_alloc&) {
        return SUMMIT_ERR_MEMORY;
    }
}
