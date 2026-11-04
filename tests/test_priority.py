"""Summit should know what deserves the time, and what deliberately doesn't.

The first test is the case that started this: a contest in three days, Mathematics the
strongest subject, Computer Science the weakest, consistency and XP both down.
"""
from datetime import date, datetime, timedelta

from backend.tracking import priority
from backend.tracking.next_actions import build_plan

NOW = datetime(2026, 11, 3, 10, 0)
TODAY = NOW.date()


def back(days):
    return (TODAY - timedelta(days=days)).isoformat()


def ahead(days):
    return (TODAY + timedelta(days=days)).isoformat()


_seq = [0]


def task(subject, days_ago, title='Practice set', execution=None, difficulty=None, status='done', **more):
    _seq[0] += 1
    row = {'id': 't-{}'.format(_seq[0]), 'title': title, 'status': status, 'subject': subject, 'xp_value': 40,
           'completed_at': back(days_ago) + 'T12:00:00' if status == 'done' else None,
           'created_at': back(days_ago + 1) + 'T09:00:00', 'execution': execution, 'difficulty': difficulty,
           'completion_seconds': 1500}
    row.update(more)
    return row


def goal(title, subject, deadline, priority_=5, measure='number', current=5, target=15, **more):
    row = {'id': title.lower().replace(' ', '-'), 'title': title, 'status': 'active', 'measure': measure,
           'subject_ids': subject, 'deadline': deadline, 'priority': priority_, 'current_value': current,
           'target_number': target, 'progress': current / target * 100 if target else 0,
           'start_date': back(120), 'milestones': []}
    row.update(more)
    return row


def amc_student():
    """Math is strongest, CS weakest, and the AMC 10 is in three days."""
    tasks = []
    for day in range(1, 60, 2):
        tasks.append(task('mathematics', day, 'AMC 10 counting set', execution=5, difficulty=4))
    for day in range(2, 60, 3):
        tasks.append(task('computer_science', day, 'CLRS exercises', execution=2, difficulty=4))
    goals = [goal('AMC 10 cutoff', 'mathematics', ahead(3), priority_=8, current=90, target=120),
             goal('Finish CS project', 'computer_science', ahead(400), priority_=8, measure='milestones', current=0, target=0,
                  milestones=[{'id': 'm1', 'title': 'Plan', 'status': 'done', 'position': 0},
                              {'id': 'm2', 'title': 'Build', 'status': 'active', 'position': 1, 'steps': []}])]
    return tasks, goals


def plan_for(tasks, goals, budget=60, days=()):
    return build_plan(tasks, goals, list(days), lambda key: key.replace('_', ' ').title(), budget, now=NOW, stamp='x')


def kinds(rows):
    return [row['kind'] for row in rows]


# ---- The case that started this --------------------------------------------
def test_a_contest_in_three_days_beats_the_weakest_subject():
    tasks, goals = amc_student()
    plan = plan_for(tasks, goals)
    first = plan['actions'][0]
    assert first['kind'] == 'deadline' and first['goalId'] == 'amc-10-cutoff'
    assert plan['priority']['mode'] == 'crunch'
    assert plan['priority']['focus']['title'] == 'AMC 10 cutoff'
    assert not [row for row in plan['actions'] + plan['more'] if row['kind'] == 'weak-subject']


def test_it_says_out_loud_what_to_leave_alone():
    tasks, goals = amc_student()
    plan = plan_for(tasks, goals)
    left = {row['title']: row['why'] for row in plan['priority']['not_now']}
    assert 'Computer Science' in left
    assert "doesn't depend on it" in left['Computer Science']
    assert 'after Nov 6' in left['Computer Science']
    assert 'Finish CS project' in left


def test_a_crunch_gets_the_whole_budget():
    tasks, goals = amc_student()
    decision = plan_for(tasks, goals, budget=120)['priority']
    assert [row['minutes'] for row in decision['allocation']] == [120]


def test_it_answers_all_four_questions():
    tasks, goals = amc_student()
    answers = {row['key']: row['answer'] for row in plan_for(tasks, goals)['priority']['answers']}
    assert set(answers) == {'matters', 'urgent', 'return', 'cost'}
    assert 'AMC 10 cutoff' in answers['matters'] and '8 of 10' in answers['matters']
    assert '3 days left' in answers['urgent']
    assert 'Finish CS project' in answers['cost']


# ---- How goals rank --------------------------------------------------------
def test_a_higher_priority_goal_with_no_pressure_doesnt_outrank_a_close_one():
    far = goal('Far dream', 'physics', ahead(900), priority_=10)
    near = goal('Near exam', 'chemistry', ahead(20), priority_=6)
    tasks = [task('chemistry', day, 'Chem set', execution=4, difficulty=3) for day in range(1, 40)]
    decision = priority.decide([far, near], tasks, NOW, 60)
    assert decision['focus']['title'] == 'Near exam'


def test_with_nothing_pressing_the_reader_priority_leads():
    low = goal('Low priority', 'physics', ahead(600), priority_=3)
    high = goal('High priority', 'chemistry', ahead(600), priority_=9)
    decision = priority.decide([low, high], [], NOW, 60)
    assert decision['mode'] == 'balance'
    assert decision['focus']['title'] == 'High priority'


def test_a_goal_well_ahead_of_pace_doesnt_get_the_time():
    ahead_of_it = goal('Ahead', 'physics', ahead(30), priority_=9, current=14, target=15)
    behind_it = goal('Behind', 'chemistry', ahead(35), priority_=7, current=1, target=15)
    tasks = ([task('physics', day, 'Physics set') for day in range(1, 60)]
             + [task('chemistry', day, 'Chem set') for day in (20, 40, 60)])
    decision = priority.decide([ahead_of_it, behind_it], tasks, NOW, 60)
    assert decision['focus']['title'] == 'Behind'


def test_xp_streak_and_focus_goals_can_never_lead():
    xp = {'id': 'x', 'title': 'Earn 250,000 XP', 'status': 'active', 'goal_type': 'xp', 'deadline': ahead(2),
          'priority': 10, 'target_xp': 250000, 'current_xp': 100}
    real = goal('Real exam', 'mathematics', ahead(200), priority_=2)
    decision = priority.decide([xp, real], [], NOW, 60)
    assert decision['focus']['title'] == 'Real exam'
    assert any(row['key'] == 'counters' and 'activity' in row['why'] for row in decision['not_now'])


def test_no_real_goal_leaves_the_plan_alone_and_says_why():
    xp = {'id': 'x', 'title': 'Earn XP', 'status': 'active', 'goal_type': 'xp', 'priority': 5}
    decision = priority.decide([xp], [], NOW, 60)
    assert decision['mode'] == 'none'
    assert 'number or checkpoints' in decision['note']


def test_a_finished_goal_gets_no_time():
    done = goal('All ticked', 'physics', ahead(5), priority_=10, measure='milestones', current=0, target=0,
                milestones=[{'id': 'm', 'title': 'x', 'status': 'done', 'position': 0}], progress=100)
    other = goal('Still open', 'chemistry', ahead(60), priority_=3)
    tasks = [task('physics', day, 'Physics set') for day in range(1, 30)]
    decision = priority.decide([done, other], tasks, NOW, 60)
    assert decision['focus']['title'] == 'Still open'


# ---- Splitting the time ----------------------------------------------------
def test_a_short_budget_isnt_cut_into_scraps():
    one = goal('First', 'physics', ahead(300), priority_=9)
    two = goal('Second', 'chemistry', ahead(300), priority_=8)
    assert len(priority.decide([one, two], [], NOW, 45)['allocation']) == 1
    split = priority.decide([one, two], [], NOW, 120)['allocation']
    assert [row['title'] for row in split] == ['First', 'Second']
    assert sum(row['minutes'] for row in split) == 120


def test_goals_on_the_same_contest_count_as_one_piece_of_work():
    one = goal('Reach USACO Gold', 'computer_science', ahead(30), priority_=9)
    two = goal('USACO Gold by June', 'computer_science', ahead(200), priority_=7)
    third = goal('Learn cello', 'music', ahead(300), priority_=5)
    decision = priority.decide([one, two, third], [], NOW, 120)
    assert decision['also'] == ['USACO Gold by June']
    assert 'Learn cello' in [row['title'] for row in decision['allocation']]


def test_an_impossible_date_is_said_and_doesnt_eat_the_week():
    tasks = [task('physics', day, 'Physics set') for day in (40, 41, 42)]
    stuck = goal('Impossible', 'physics', ahead(2), priority_=9, current=1, target=100, start_date=back(60))
    found = priority.stakes([stuck], tasks, [], TODAY)[0]
    assert found['read']['out_of_reach']
    assert 'moving the date' in priority.decide([stuck], tasks, NOW, 60)['warning']


# ---- The plan around it ----------------------------------------------------
def test_with_nothing_pressing_weak_subjects_stay_but_come_after_goal_work():
    tasks = [task('chemistry', day, 'Chem set', execution=5, difficulty=3) for day in range(1, 30)]
    tasks += [task('history', day, 'History essay', execution=1, difficulty=3) for day in range(1, 30, 3)]
    plan = plan_for(tasks, [goal('Chem exam', 'chemistry', ahead(300), priority_=8)], budget=120)
    every = kinds(plan['actions'] + plan['more'])
    assert every[0] == 'deadline' or plan['actions'][0]['goalId'] == 'chem-exam'
    if 'weak-subject' in every:
        assert every.index('deadline') < every.index('weak-subject')


def test_a_homework_due_tonight_still_fits_unless_its_a_crunch():
    tasks = [task('chemistry', day, 'Chem set', execution=4, difficulty=3) for day in range(1, 30)]
    due = task('history', 0, 'History essay', status='todo', due_date=TODAY.isoformat())
    lecture = task('history', 0, 'History lecture', status='todo', due_date=TODAY.isoformat())
    plan = plan_for(tasks + [due, lecture], [goal('Chem exam', 'chemistry', ahead(40), priority_=8, current=2)], budget=60)
    titles = [row['title'] for row in plan['actions']]
    assert 'Finish "History essay"' in titles
    assert 'Finish "History lecture"' not in titles


def test_the_budget_is_still_respected():
    tasks, goals = amc_student()
    for budget in (15, 30, 45, 60, 90, 120):
        plan = plan_for(tasks, goals, budget=budget)
        assert plan['planned'] <= budget
        assert plan['actions'][0]['goalId'] == 'amc-10-cutoff'


def test_the_reply_holds_nothing_the_page_cant_read():
    import json
    tasks, goals = amc_student()
    decision = plan_for(tasks, goals)['priority']
    assert 'stakes' not in decision
    json.dumps(decision)


def test_the_copy_reads_cleanly_when_a_weak_topic_is_named():
    tasks, goals = amc_student()
    rows = [{'topic': 'competition-math:recursive-counting', 'tasks': 8, 'goal_ids': ['amc-10-cutoff'],
             'label': 'Recursive counting', 'status': 'weak', 'gap': -1.2, 'execution': 2.4, 'base': 3.5,
             'subject': 'mathematics', 'subject_label': 'Mathematics', 'subsubject': 'competition-math',
             'subsubject_label': 'Competition Mathematics', 'contexts': {}, 'examples': ['AMC set'], 'context_examples': {}}]
    decision = priority.decide(goals, tasks, NOW, 60, topic_rows=rows)
    answer = next(row['answer'] for row in decision['answers'] if row['key'] == 'return')
    assert 'vs. 3.5' in answer
    assert 'vs. How' not in answer
    assert 'preliminary signal' in answer


def test_nothing_is_told_to_wait_after_a_date():
    tasks, goals = amc_student()
    plan = plan_for(tasks + [task('history', 40, 'Old essay', status='todo', created_at=back(40) + 'T09:00:00')], goals)
    assert not [row for row in plan['priority']['not_now'] if 'wait after' in row['why']]
