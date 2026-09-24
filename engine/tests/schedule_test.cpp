/* schedule_test.cpp — the engine's own checks, with no test framework.
 *
 * `engine/build.sh test` builds and runs this. A bare `main` with a `check`
 * macro on purpose: one source file does not justify pulling GoogleTest and a
 * package manager into a repository whose other half is a Vite app, and a
 * dependency nobody can build is worse than a smaller test.
 *
 * What is asserted here is the contract — the invariants a plan must hold
 * whatever the search decides, and the ways a caller can get the call wrong.
 * Whether the plan is any *good* is tests/test_engine_schedule.py, which
 * measures it against a reference planner on the same ruler.
 */
#include "summit/schedule.h"

#include <cmath>
#include <cstdio>
#include <vector>

static int failures = 0;

#define check(cond)                                                        \
    do {                                                                   \
        if (!(cond)) {                                                     \
            std::printf("  FAIL  %s:%d  %s\n", __FILE__, __LINE__, #cond); \
            ++failures;                                                    \
        }                                                                  \
    } while (0)

namespace {

struct Tasks {
    std::vector<int32_t> minutes, due, subject;
    std::vector<double> value;

    void add(int32_t m, double v, int32_t d = -1, int32_t s = -1) {
        minutes.push_back(m);
        value.push_back(v);
        due.push_back(d);
        subject.push_back(s);
    }
    summit_tasks view() const {
        summit_tasks t{};
        t.minutes = minutes.data();
        t.value = value.data();
        t.due = due.data();
        t.subject = subject.data();
        t.count = static_cast<int32_t>(minutes.size());
        return t;
    }
};

struct Slots {
    std::vector<int32_t> minutes;
    std::vector<double> weight;

    void add(int32_t m, double w = 1.0) {
        minutes.push_back(m);
        weight.push_back(w);
    }
    summit_slots view() const {
        summit_slots s{};
        s.minutes = minutes.data();
        s.weight = weight.data();
        s.count = static_cast<int32_t>(minutes.size());
        return s;
    }
};

summit_plan_opts options(int32_t iterations = 20000, double late = 0.5,
                         double switching = 0.0) {
    summit_plan_opts o{};
    o.late_penalty = late;
    o.switch_penalty = switching;
    o.iterations = iterations;
    o.seed = 12345;
    return o;
}

/* No slot may hold more minutes than it has. The one hard constraint, and the
   one an annealing search will quietly break if a move's undo is wrong. */
bool capacities_held(const Tasks& tasks, const Slots& slots,
                     const std::vector<int32_t>& where) {
    std::vector<int32_t> used(slots.minutes.size(), 0);
    for (size_t task = 0; task < where.size(); ++task) {
        const int32_t slot = where[task];
        if (slot < 0) continue;
        if (slot >= static_cast<int32_t>(slots.minutes.size())) return false;
        used[static_cast<size_t>(slot)] += tasks.minutes[task];
    }
    for (size_t slot = 0; slot < used.size(); ++slot) {
        if (used[slot] > slots.minutes[slot]) return false;
    }
    return true;
}

void it_fills_the_day_it_can_fill() {
    Tasks tasks;
    tasks.add(30, 100);
    tasks.add(30, 100);
    tasks.add(30, 100);
    Slots slots;
    slots.add(90);

    std::vector<int32_t> where(3, -9);
    const auto t = tasks.view();
    const auto s = slots.view();
    const auto o = options();
    const double score = summit_plan(&t, &s, &o, where.data());

    check(score > 0.0);
    check(where[0] == 0 && where[1] == 0 && where[2] == 0);
    check(capacities_held(tasks, slots, where));
}

void it_leaves_out_what_does_not_fit() {
    Tasks tasks;
    tasks.add(60, 500);   /* the good one */
    tasks.add(60, 10);    /* and one that cannot also fit */
    Slots slots;
    slots.add(60);

    std::vector<int32_t> where(2, -9);
    const auto t = tasks.view();
    const auto s = slots.view();
    const auto o = options();
    summit_plan(&t, &s, &o, where.data());

    check(where[0] == 0);
    check(where[1] == -1);
    check(capacities_held(tasks, slots, where));
}

void it_prefers_the_better_hour() {
    Tasks tasks;
    tasks.add(60, 100);
    Slots slots;
    slots.add(60, 0.4);   /* a bad hour */
    slots.add(60, 1.6);   /* a good one */

    std::vector<int32_t> where(1, -9);
    const auto t = tasks.view();
    const auto s = slots.view();
    const auto o = options();
    check(summit_plan(&t, &s, &o, where.data()) > 0.0);
    check(where[0] == 1);
}

void it_respects_a_deadline_when_it_is_worth_it() {
    Tasks tasks;
    tasks.add(60, 100, /*due*/ 0);   /* must be in slot 0 or lose half its worth */
    Slots slots;
    slots.add(60, 1.0);
    slots.add(60, 1.2);              /* nicer, but late */

    std::vector<int32_t> where(1, -9);
    const auto t = tasks.view();
    const auto s = slots.view();
    const auto o = options(20000, /*late*/ 0.9);
    summit_plan(&t, &s, &o, where.data());

    /* 100 x 1.0 on time beats 100 x 1.2 minus 90. */
    check(where[0] == 0);
}

void a_switch_costs_what_it_is_told_to_cost() {
    Tasks tasks;
    tasks.add(30, 100, -1, /*subject*/ 1);
    tasks.add(30, 100, -1, /*subject*/ 2);
    Slots slots;
    slots.add(60);
    slots.add(60);

    std::vector<int32_t> where(2, -9);
    const auto t = tasks.view();
    const auto s = slots.view();

    /* Free: either arrangement scores the same, and both are allowed. */
    const auto cheap = options(20000, 0.5, /*switch*/ 0.0);
    check(summit_plan(&t, &s, &cheap, where.data()) > 0.0);

    /* Expensive: two subjects in one slot costs more than the slots are worth
       apart, so they are separated. */
    const auto dear = options(50000, 0.5, /*switch*/ 60.0);
    summit_plan(&t, &s, &dear, where.data());
    check(where[0] != where[1]);
}

void the_same_seed_gives_the_same_plan() {
    Tasks tasks;
    for (int32_t i = 0; i < 40; ++i) tasks.add(20 + (i % 5) * 10, 50 + i, -1, i % 4);
    Slots slots;
    for (int32_t i = 0; i < 10; ++i) slots.add(120, 0.8 + 0.05 * i);

    const auto t = tasks.view();
    const auto s = slots.view();
    const auto o = options(100000);

    std::vector<int32_t> first(40, -9), second(40, -9);
    const double a = summit_plan(&t, &s, &o, first.data());
    const double b = summit_plan(&t, &s, &o, second.data());

    check(first == second);
    check(std::fabs(a - b) < 1e-9);
    check(capacities_held(tasks, slots, first));
}

void searching_beats_the_greedy_seed() {
    /* Densest-first is a good start and a poor finish: it fills the best slots
       with small dense tasks and leaves the big valuable ones homeless. If the
       annealing is doing nothing, this is where it shows. */
    Tasks tasks;
    for (int32_t i = 0; i < 60; ++i) {
        tasks.add(15 + (i * 7) % 90, 20 + (i * 13) % 200, (i % 5 == 0) ? i % 8 : -1, i % 6);
    }
    Slots slots;
    for (int32_t i = 0; i < 8; ++i) slots.add(180, 0.6 + 0.1 * (i % 5));

    const auto t = tasks.view();
    const auto s = slots.view();
    std::vector<int32_t> seeded(60, -9), searched(60, -9);

    const auto none = options(1, 0.6, 15.0);       /* effectively the seed alone */
    const auto full = options(400000, 0.6, 15.0);
    const double seed_score = summit_plan(&t, &s, &none, seeded.data());
    const double searched_score = summit_plan(&t, &s, &full, searched.data());

    check(searched_score >= seed_score);
    check(capacities_held(tasks, slots, searched));
    std::printf("  seed %.1f -> searched %.1f\n", seed_score, searched_score);
}

void nothing_in_is_nothing_out() {
    Tasks tasks;
    Slots slots;
    slots.add(60);
    const auto t = tasks.view();
    const auto s = slots.view();
    const auto o = options();
    check(summit_plan(&t, &s, &o, nullptr) == 0.0);

    Tasks only_tasks;
    only_tasks.add(30, 10);
    Slots no_slots;
    std::vector<int32_t> where(1, -9);
    const auto t2 = only_tasks.view();
    const auto s2 = no_slots.view();
    check(summit_plan(&t2, &s2, &o, where.data()) == 0.0);
    check(where[0] == -1);
}

void broken_calls_are_refused() {
    Tasks tasks;
    tasks.add(30, 10);
    Slots slots;
    slots.add(60);
    std::vector<int32_t> where(1, -9);
    const auto t = tasks.view();
    const auto s = slots.view();
    const auto o = options();

    check(summit_plan(nullptr, &s, &o, where.data()) == SUMMIT_ERR_NULL);
    check(summit_plan(&t, nullptr, &o, where.data()) == SUMMIT_ERR_NULL);
    check(summit_plan(&t, &s, nullptr, where.data()) == SUMMIT_ERR_NULL);
    check(summit_plan(&t, &s, &o, nullptr) == SUMMIT_ERR_NULL);

    /* A task that takes no time would fit anywhere, any number of times. */
    Tasks weightless;
    weightless.add(0, 10);
    const auto bad = weightless.view();
    check(summit_plan(&bad, &s, &o, where.data()) == SUMMIT_ERR_NULL);
}

}  // namespace

int main() {
    std::printf("summit engine, ABI %d\n", summit_engine_abi());
    check(summit_engine_abi() == SUMMIT_ENGINE_ABI);

    it_fills_the_day_it_can_fill();
    it_leaves_out_what_does_not_fit();
    it_prefers_the_better_hour();
    it_respects_a_deadline_when_it_is_worth_it();
    a_switch_costs_what_it_is_told_to_cost();
    the_same_seed_gives_the_same_plan();
    searching_beats_the_greedy_seed();
    nothing_in_is_nothing_out();
    broken_calls_are_refused();

    if (failures == 0) {
        std::printf("all passed\n");
        return 0;
    }
    std::printf("%d check(s) failed\n", failures);
    return 1;
}
