"""What to do next: the plan, packed into the time the reader has.

Ported from frontend/src/utils/nextActions.test.ts when the planner moved to
backend/tracking/next_actions.py, plus the two rules that test never reached
(a goal behind its schedule, a task gone stale) and the lens.
"""
from datetime import datetime, timedelta

from backend.tracking.next_actions import build_plan, leading_lens, seeded, to_fixed

NOW = datetime(2026, 9, 22, 9, 0, 0)
_seq = [0]


def iso(back):
    return (NOW - timedelta(days=back)).date().isoformat()


def task(**over):
    _seq[0] += 1
    row = {'id': 't-{}'.format(_seq[0]), 'title': 'A task', 'status': 'open', 'xp_value': 50}
    row.update(over)
    return row


def done(subject, back, execution=4):
    return task(status='done', subject=subject, execution=execution,
                completed_at=iso(back) + 'T12:00:00', completion_seconds=25 * 60)


def series(completed_on, span=30):
    return [{'date': iso(span - 1 - at),
             'tasks_completed': 2 if span - 1 - at in completed_on else 0,
             'xp_earned': 60 if span - 1 - at in completed_on else 0} for at in range(span)]


def plan(tasks=(), goals=(), days=None, budget=45, lens=None):
    return build_plan(list(tasks), list(goals), series([]) if days is None else days,
                      lambda one: one, budget, now=NOW, stamp='2026-W39', lens=lens)


def everything(found):
    return found['actions'] + found['more']


def first(found, kind):
    return next((item for item in everything(found) if item['kind'] == kind), None)


def kinds(items):
    return [item['kind'] for item in items]


# ---- The streak row names something -------------------------------------
def test_streak_prefers_an_undated_task():
    found = plan([task(title='Dated one', due_date=iso(-3), xp_value=10),
                  task(title='Undated one', xp_value=90)])
    assert first(found, 'streak')['title'] == 'Close "Undated one"'


def test_streak_falls_back_to_a_dated_task_rather_than_to_nobody():
    streak = first(plan([task(title='Dated one', due_date=iso(-3))]), 'streak')
    assert streak['title'] == 'Close "Dated one"'
    assert streak['taskId']


def test_streak_still_says_something_with_no_open_task():
    streak = first(plan([done('math', 2)]), 'streak')
    assert streak['title'] == 'Close one small task'
    assert 'taskId' not in streak


def test_streak_counts_the_run_it_asks_you_to_carry():
    assert '3 days in a row' in first(plan([task()], days=series([1, 2, 3])), 'streak')['because']


def test_streak_does_not_appear_once_the_day_has_something_in_it():
    assert 'streak' not in kinds(everything(plan([task()], days=series([0]))))


# ---- Momentum ------------------------------------------------------------
def run(days):
    return [done('violin', back) for back in days]


def test_momentum_fires_on_a_live_run_and_names_its_length():
    item = first(plan(run([1, 2, 3, 4]) + run([9]), days=series([1])), 'momentum')
    assert '4 days in a row' in item['because']
    assert item['subject'] == 'violin'


def test_momentum_is_quiet_once_today_has_fed_the_run():
    assert 'momentum' not in kinds(everything(plan(run([0, 1, 2, 3]), days=series([0]))))


def test_momentum_counts_a_run_not_fed_yet_today():
    assert '3 days in a row' in first(plan(run([1, 2, 3]), days=series([1, 2, 3])), 'momentum')['because']


def test_momentum_ignores_a_run_that_is_over():
    assert 'momentum' not in kinds(everything(plan(run([4, 5, 6]), days=series([4, 5, 6]))))


def test_momentum_is_outranked_by_everything_going_wrong():
    order = kinds(plan(run([1, 2, 3, 4]) + [task(title='Late essay', due_date=iso(4))],
                       days=series([1]), budget=120)['actions'])
    assert order.index('overdue') < order.index('momentum')


# ---- The budget is spent -------------------------------------------------
def test_the_best_leftover_is_trimmed_into_the_time_that_remains():
    found = plan([done('maths', at + 1, 1) for at in range(6)]
                 + [done('latin', at + 1, 5) for at in range(6)]
                 + [task(title='Old thing', created_at=iso(40) + 'T09:00:00')], budget=45)
    assert (found['planned'], found['spare']) == (45, 0)
    started = [item for item in found['actions'] if 'Starting it still counts' in item['because']]
    assert len(started) == 1
    assert found['actions'][-1] is started[0] or found['actions'][-1] == started[0]


def test_a_budget_shorter_than_anything_still_gets_an_answer():
    found = plan([task(title='Late essay', due_date=iso(4))], budget=15)
    assert len(found['actions']) == 1
    assert found['actions'][0]['minutes'] == 15
    assert 'Starting it still counts' in found['actions'][0]['because']


def test_the_remainder_is_left_alone_with_nothing_to_trim():
    found = plan([task()], budget=120)
    assert found['more'] == []
    assert found['spare'] > 0


def test_never_plans_more_than_the_budget():
    tasks = [done('maths', at + 1, 1) for at in range(8)] + [
        task(title='Late', due_date=iso(6)), task(title='Old', created_at=iso(40) + 'T09:00:00')]
    for budget in (15, 30, 45, 60, 90, 120):
        assert plan(tasks, budget=budget)['planned'] <= budget


# ---- The two rules the old tests did not reach --------------------------
def test_a_goal_behind_its_schedule_names_its_next_task():
    # The nearest dated goal is the deadline row now, and it still names the
    # task already written down for it.
    goal = {'id': 'g', 'title': 'Pass the exam', 'status': 'active', 'progress': 10,
            'start_date': iso(30), 'deadline': iso(-10), 'milestones': []}
    linked = task(title='Past paper 3', goal_id='g')
    item = first(plan([linked], [goal], budget=120), 'deadline')
    assert item['title'] == 'Finish "Past paper 3" for Pass the exam'
    assert item['because'].startswith("10 days to Pass the exam. You're 65% behind schedule.")


def test_a_second_goal_behind_its_schedule_still_gets_the_goal_row():
    near = {'id': 'n', 'title': 'Quiz', 'status': 'active', 'progress': 90,
            'start_date': iso(30), 'deadline': iso(-3), 'milestones': []}
    far = {'id': 'g', 'title': 'Pass the exam', 'status': 'active', 'progress': 10,
           'start_date': iso(30), 'deadline': iso(-10), 'milestones': []}
    item = first(plan([task(title='Past paper 3', goal_id='g')], [near, far], budget=120), 'goal')
    assert item['title'] == 'Finish "Past paper 3" for Pass the exam'
    assert item['because'] == '10 days left, 66% behind schedule.'


def test_an_undated_task_sitting_two_weeks_is_do_or_drop():
    item = first(plan([task(title='Tidy notes', created_at=iso(20) + 'T09:00:00')], budget=120), 'stale')
    assert item['title'] == 'Do or drop "Tidy notes"'
    assert 'On your list for 20 days' in item['because']


# ---- The lens --------------------------------------------------------------
def test_the_lens_follows_the_goal_with_the_most_work_behind_it():
    streak = {'id': 's', 'title': 'Daily practice', 'status': 'active', 'measure': 'streak'}
    totals = {'id': 'x', 'title': 'Earn XP', 'status': 'active', 'measure': 'xp'}
    lens = leading_lens([streak, totals], [done('maths', 1)])
    # Both counter goals read the whole record, so they tie, and the title decides.
    assert lens['id'] == 'consistency'
    assert lens['goalTitle'] == 'Daily practice'


def test_the_lens_tilts_the_order():
    tasks = [task(title='Old', created_at=iso(40) + 'T09:00:00'), task(title='Late', due_date=iso(3))]
    plain = kinds(plan(tasks, budget=120)['actions'])
    tilted = kinds(plan(tasks, budget=120, lens={'weights': {'stale': 5}})['actions'])
    assert plain.index('overdue') < plain.index('stale')
    assert tilted.index('stale') < tilted.index('overdue')


# ---- Matching the page's own arithmetic ---------------------------------
def test_ties_round_up_the_way_the_page_printed_them():
    assert to_fixed(3.25) == '3.3'
    assert to_fixed(2.45) == '2.5'


def test_the_tiebreak_hash_is_the_pages():
    # Computed by `seeded` in frontend/src/utils/recent.ts, including a key
    # with a character outside ASCII.
    assert seeded('2026-W39overdue-t-1') == 0.8814
    assert seeded('2026-W39momentum-violín') == 0.9517
    assert seeded('2026-W39streak') == 0.8521


# ---- What a goal makes worth reading (ported from utils/goalLens.test.ts) ----
from backend.tracking.next_actions import goal_lens  # noqa: E402


def lens_goal(**over):
    row = {'id': 'g-1', 'title': 'Get 24 on the AMC 8', 'status': 'active', 'measure': 'number',
           'target_number': 24, 'current_value': 12, 'progress': 50, 'start_date': '2026-07-01',
           'created_at': '2026-07-01T09:00:00', 'deadline': '2026-11-01', 'milestones': []}
    row.update(over)
    return row


def many(difficulty, count=10, goal_id='g-1'):
    return [{'id': 't{}{}'.format(goal_id, at), 'goal_id': goal_id, 'status': 'done',
             'difficulty': difficulty, 'execution': 3,
             'completed_at': '2026-08-31T10:00:00'} for at in range(count)]


def test_ordinary_work_is_a_goal_about_getting_it_right():
    lens = goal_lens(lens_goal(), many(2.5))
    assert lens['id'] == 'accuracy'
    assert lens['priorities'][0] == 'quality'
    assert '2.5/5' in lens['because']


def test_hard_work_is_a_goal_about_depth():
    lens = goal_lens(lens_goal(title='Reach 7 on the AIME'), many(4.6))
    assert lens['id'] == 'depth'
    assert lens['priorities'][0] == 'focus'


def test_the_lens_does_not_read_a_title():
    assert goal_lens(lens_goal(title='Reach 7 on the AIME'), many(2))['id'] == 'accuracy'


def test_a_streak_goal_is_about_turning_up_and_a_counter_about_rate():
    assert goal_lens(lens_goal(measure='streak'), [])['id'] == 'consistency'
    assert goal_lens(lens_goal(measure='xp'), [])['priorities'][0] == 'productivity'


def test_no_lens_without_enough_rated_work_or_on_a_finished_goal():
    assert goal_lens(lens_goal(), many(4.8, 3)) is None
    assert goal_lens(lens_goal(), [dict(task, difficulty=None) for task in many(3)]) is None
    assert goal_lens(lens_goal(status='completed'), many(4.5)) is None


def test_the_lens_carries_the_count_it_was_chosen_on():
    lens = goal_lens(lens_goal(), many(4.5, 12))
    assert lens['rated'] == 12
    assert abs(lens['difficulty'] - 4.5) < 1e-9


def test_one_lens_follows_the_goal_with_the_most_work_pointed_at_it():
    busy = lens_goal(id='g-2', title='The one being worked', priority=1)
    idle = lens_goal(id='g-3', title='The one marked urgent', priority=10)
    tasks = many(4.6, 12, 'g-2') + many(2, 9, 'g-3')
    assert leading_lens([idle, busy], tasks)['goalTitle'] == 'The one being worked'
    assert leading_lens([lens_goal()], many(4, 2)) is None
    assert leading_lens([], []) is None


# ---- The endpoint ------------------------------------------------------------
def test_the_endpoint_returns_a_plan_for_the_budget_asked(client):
    made = client.post('/api/tasks', json={'name': 'Write the essay', 'xp_reward': 20}).json()
    assert made['success'], made
    reply = client.get('/api/next_actions?budget=30').json()
    assert reply['success'], reply
    assert reply['plan']['budget'] == 30
    assert reply['plan']['planned'] <= 30
    assert 'lens' in reply


def test_top_is_the_best_suggestion_even_when_it_does_not_fit():
    # An overdue task the length of the whole budget sits in `more`, and is
    # still the one line the dashboard should show.
    long_ones = [task(status='done', completion_seconds=60 * 60, completed_at=iso(1) + 'T09:00:00')
                 for _ in range(5)]
    found = plan(long_ones + [task(title='Late essay', due_date=iso(3))], budget=15)
    assert found['top']['title'] == 'Finish "Late essay"'


# ---- Not the same plan every day -------------------------------------------
def test_the_weak_subject_reads_recent_ratings_and_names_the_worst_task():
    rows = ([done('maths', back, execution=4) for back in (2, 3, 4, 5, 6)]
            + [done('essays', back, execution=2) for back in (3, 5, 7, 9)]
            + [done('essays', 200, execution=5)])
    rows[-2]['title'] = 'Compare two poems'
    item = first(plan(rows), 'weak-subject')
    assert item['subject'] == 'essays'
    assert 'last 4 rated essays tasks' in item['because']
    assert '"Compare two poems"' in item['because']


def test_a_subject_rated_badly_long_ago_is_not_weak_now():
    rows = ([done('maths', back, execution=4) for back in (2, 3, 4, 5, 6)]
            + [done('essays', back, execution=2) for back in (100, 110, 120, 130, 140)])
    assert first(plan(rows), 'weak-subject') is None


def test_a_subject_worked_today_is_not_suggested_again():
    rows = ([done('maths', back, execution=4) for back in (2, 3, 4, 5, 6)]
            + [done('essays', back, execution=2) for back in (0, 5, 7, 9)])
    assert first(plan(rows), 'weak-subject') is None


def test_a_fading_subject_is_slipping():
    rows = ([done('chemistry', back) for back in (16, 18, 20, 22, 24)]
            + [done('chemistry', 3)])
    item = first(plan(rows), 'slipping')
    assert item['title'] == 'Catch up on chemistry'
    assert '50 XP from 1 task in the last two weeks, down from 250 XP from 5' in item['because']


def test_a_goal_with_nothing_finished_lately_is_named():
    goal = {'id': 'g1', 'title': 'Learn Spanish', 'status': 'active', 'progress': 30,
            'created_at': iso(60), 'milestones': []}
    rows = [task(title='Old lesson', status='done', goal_id='g1', completed_at=iso(15) + 'T10:00:00'),
            task(title='Lesson 9', goal_id='g1')]
    item = first(plan(rows, goals=[goal]), 'goal-quiet')
    assert item['title'] == 'Finish "Lesson 9" for Learn Spanish'
    assert '15 days' in item['because'] and '30%' in item['because']


def test_the_daily_goal_says_how_far_off_it_is():
    days = series([0])
    found = build_plan([done('maths', 3)], [], days, lambda one: one, 45, now=NOW,
                       stamp='2026-W39', daily_goal=200)
    item = first(found, 'xp')
    assert item['title'] == 'Earn 140 more XP today'
    assert "You're at 60 of your 200 XP daily goal" in item['because']


def test_a_slow_week_is_called_out_without_a_daily_goal():
    days = series(list(range(7, 28)), span=28)
    item = first(plan([done('maths', 9)], days=days), 'xp')
    assert '0 XP in the last 7 days' in item['because']


def test_the_shuffle_changes_by_day_but_never_lifts_soft_rows_over_overdue_work():
    rows = ([done('maths', back, execution=4) for back in (2, 3, 4, 5, 6)]
            + [done('essays', back, execution=2) for back in (3, 5, 7, 9)]
            + [task(title='Late essay', due_date=iso(2))])
    for day in range(10):
        found = build_plan(rows, [], series([]), lambda one: one, 120, now=NOW,
                           stamp='2026-09-{:02d}'.format(day + 1))
        assert found['actions'][0]['kind'] == 'overdue'


# ---- Looking forward: the date, the list, the misses, the snag ----------
def stone(**over):
    row = {'id': 's1', 'title': 'Silver DP unassisted', 'status': 'pending', 'position': 0,
           'steps': [{'id': 'a', 'title': 'Work through the knapsack chapter', 'done': True},
                     {'id': 'b', 'title': 'Solve 5 USACO Silver DP problems', 'done': False}]}
    row.update(over)
    return row


def contest(**over):
    goal = {'id': 'usaco', 'title': 'USACO December', 'status': 'active', 'progress': 40,
            'start_date': iso(20), 'deadline': iso(-47), 'subject_ids': 'computer_science',
            'milestones': [stone()]}
    goal.update(over)
    return goal


def test_the_nearest_dated_goal_leads_the_plan_even_seven_weeks_out():
    # The old goal rule only looked 45 days ahead, so a contest 47 days out
    # never reached the plan at all.
    worked = [done('computer_science', 3), done('computer_science', 9)]
    found = plan(worked + [task(title='Old thing', due_date=iso(2))], [contest()], budget=120)
    top = found['top']
    assert top['kind'] == 'deadline'
    assert top['title'] == 'Book 3 computer_science sessions for USACO December'
    assert top['because'] == ('47 days to USACO December. You\'re on "Silver DP unassisted", 1 of 2 steps '
                              'done. You worked on it on 2 of the last 14 days. 3 more this week holds a '
                              'pace of 3 a week.')
    assert top['book'] == {'count': 3, 'minutes': 45, 'title': 'Solve 5 USACO Silver DP problems',
                           'milestoneId': 's1'}


def test_a_goal_past_four_months_does_not_lead():
    assert first(plan([], [contest(deadline=iso(-150))]), 'deadline') is None


def test_a_week_already_done_books_nothing_and_names_the_next_step():
    # Sunday, with three sittings this week: the pace is met.
    sunday = datetime(2026, 9, 27, 9, 0, 0)
    worked = [task(status='done', subject='computer_science', completed_at='2026-09-{}T12:00:00'.format(day))
              for day in (22, 24, 26)]
    found = build_plan(worked, [contest(deadline='2026-11-13')], series([]), lambda one: one, 120,
                       now=sunday, stamp='x')
    top = found['top']
    assert top['title'] == 'Do "Solve 5 USACO Silver DP problems" for USACO December'
    assert 'book' not in top
    assert "You've done this week's 3." in top['because']


def test_leftover_routines_become_one_row_and_leave_the_overdue_rule():
    finished = [task(status='done', title='Lab {}'.format(at), completed_at=iso(at % 6 + 1) + 'T10:00:00')
                for at in range(24)]
    routines = [task(title='Morning meditation', due_date=iso(back)) for back in range(1, 13)]
    real = task(title='Essay draft', due_date=iso(2), priority='high')
    found = plan(finished + routines + [real], budget=120)
    triage = first(found, 'triage')
    assert triage['title'] == 'Clear 12 leftover routines'
    assert sorted(triage['clear']) == sorted(row['id'] for row in routines)
    assert '13 things are due now and you finish about 4 on a day you work.' in triage['because']
    assert 'keep "Essay draft"' in triage['because']
    overdue = [item for item in everything(found) if item['kind'] == 'overdue']
    assert [item['title'] for item in overdue] == ['Finish "Essay draft"']


def test_a_short_list_is_not_triaged():
    finished = [task(status='done', title='Lab {}'.format(at), completed_at=iso(at % 6 + 1) + 'T10:00:00')
                for at in range(24)]
    routines = [task(title='Morning meditation', due_date=iso(back)) for back in range(1, 4)]
    assert first(plan(finished + routines), 'triage') is None


def scored(subject, back, got, of, title='Set', **over):
    return task(status='done', subject=subject, title=title, score_got=got, score_of=of,
                completed_at=iso(back) + 'T12:00:00', **over)


def test_misses_name_the_sets_that_went_wrong():
    rows = [scored('maths', 2, 3, 10, title='Quadratics #1-10'),
            scored('maths', 4, 9, 10, title='Linear #1-10'),
            scored('maths', 6, 5, 8, title='Factoring drill')]
    item = first(plan(rows, budget=120), 'misses')
    assert item['title'] == 'Go back over the 11 maths problems you missed'
    assert item['because'] == ('You got 17 of your last 28 right (61%). Most misses were in '
                               '"Quadratics #1-10" (3/10) and "Factoring drill" (5/8). Rework those '
                               'before anything new.')


def test_good_scores_and_old_scores_say_nothing():
    good = [scored('maths', 2, 9, 10), scored('maths', 3, 10, 10)]
    old = [scored('physics', 40, 1, 10), scored('physics', 41, 2, 10)]
    assert first(plan(good + old), 'misses') is None


def test_a_reason_picked_again_and_again_comes_back_with_its_fix():
    rough = [task(status='done', subject='maths', execution=2, reason='unclear',
                  completed_at=iso(back) + 'T12:00:00') for back in (1, 3, 5)]
    rough.append(task(status='done', subject='maths', execution=1, reason='no-time',
                      completed_at=iso(6) + 'T12:00:00'))
    item = first(plan(rough, budget=120), 'stuck')
    assert item['title'] == 'Next maths session: start with one worked example before you try one yourself'
    assert item['because'] == 'You picked "Did not know where to start" on 3 of your last 4 rough sessions.'


def test_a_near_date_leads_even_when_the_lens_leans_toward_overdue_work():
    volume = {'id': 'volume', 'label': 'Throughput', 'weights': {'overdue': 1.4, 'goal': 1.2}}
    late = [task(title='Long run', due_date=iso(7))]
    found = plan(late, [contest()], budget=120, lens=volume)
    assert found['top']['kind'] == 'deadline'


def test_the_triage_row_keeps_real_work_not_todays_routines():
    finished = [task(status='done', title='Lab {}'.format(at), completed_at=iso(at % 6 + 1) + 'T10:00:00')
                for at in range(24)]
    routines = [task(title='Morning meditation', due_date=iso(back)) for back in range(0, 13)]
    real = task(title='Essay draft', due_date=iso(0))
    triage = first(plan(finished + routines + [real], budget=120), 'triage')
    assert triage['because'].endswith('Clear those and keep "Essay draft".')


def test_clearing_leftovers_comes_before_the_overdue_work_it_hides():
    finished = [task(status='done', title='Lab {}'.format(at), completed_at=iso(at % 6 + 1) + 'T10:00:00')
                for at in range(24)]
    routines = [task(title='Morning meditation', due_date=iso(back)) for back in range(1, 13)]
    real = task(title='Essay draft', due_date=iso(9))
    volume = {'id': 'volume', 'label': 'Throughput', 'weights': {'overdue': 1.4}}
    found = plan(finished + routines + [real], [contest()], budget=120, lens=volume)
    assert kinds(found['actions'])[:3] == ['deadline', 'triage', 'overdue']


def test_placeholder_steps_are_not_work():
    padded = stone(steps=[{'id': 'a', 'title': 'Name the first piece of work', 'done': False},
                          {'id': 'b', 'title': 'Name the second', 'done': False}])
    top = plan([], [contest(milestones=[padded])], budget=120)['top']
    assert top['book']['title'] == 'Silver DP unassisted'
    assert 'You\'re on "Silver DP unassisted".' in top['because']
