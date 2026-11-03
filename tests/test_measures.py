"""Activity, output, progress and mastery stay four separate readings.

The two students are the point of backend/tracking/measures.py: fifteen easy tasks a
day against three hard ones that got somebody closer to a competition. The rest pin
the rule that keeps the four apart, one source moving one measure.
"""
from datetime import date, timedelta

from backend.tracking import measures

TODAY = date(2026, 11, 3)


def back(days):
    return (TODAY - timedelta(days=days)).isoformat()


def task(days_ago, title='Algebra drill', subject='algebra', difficulty=None, execution=None, **more):
    row = {'id': '{}-{}-{}'.format(title, days_ago, more.get('n', 0)), 'title': title, 'subject': subject,
           'status': 'done', 'completed_at': back(days_ago) + 'T12:00:00',
           'difficulty': difficulty, 'execution': execution}
    row.update(more)
    return row


def rollup(tasks, xp_each, focus_each):
    days = {}
    for row in tasks:
        day = days.setdefault(row['completed_at'][:10], {'worked': True, 'xp': 0, 'focus_seconds': 0})
        day['xp'] += xp_each
        day['focus_seconds'] += focus_each
    return days


def goal(**more):
    row = {'id': 'g1', 'title': 'Reach AIME', 'status': 'active', 'measure': 'number',
           'current_value': 8, 'target_number': 15, 'deadline': back(-60), 'milestones': []}
    row.update(more)
    return row


def read(tasks=(), goals=(), records=(), attempts=(), checks=(), days=None, ready=()):
    return measures.read(list(tasks), list(goals), list(records), list(attempts), list(checks),
                         days if days is not None else {}, TODAY, ready=list(ready))


def by_key(result):
    return {row['key']: row for row in result['measures']}


# ---- The two students -------------------------------------------------------
def student_a():
    """15 easy tasks a day for 30 days. 1,000 XP a day, 4 hours, no goal moved."""
    tasks = [task(day, 'Algebra drill', difficulty=2, execution=4, n=n)
             for day in range(30) for n in range(15)]
    return read(tasks, goals=[goal()], days=rollup(tasks, 1000 // 15, 16 * 60))


def student_b():
    """3 hard tasks a day. 300 XP a day, 2 hours, a checkpoint and a contest best."""
    tasks = [task(day, 'AIME number theory set', 'mathematics', difficulty=5, execution=4, n=n)
             for day in range(30) for n in range(3)]
    stone = {'id': 'm1', 'title': 'Mocks at 10+', 'status': 'done', 'completed_at': back(5)}
    contest = [
        {'name': 'AIME', 'kind': 'record', 'value': 8, 'target': 15, 'achieved_on': back(200)},
        {'name': 'AIME', 'kind': 'record', 'value': 11, 'target': 15, 'achieved_on': back(6)},
    ]
    return read(tasks, goals=[goal(milestones=[stone])], records=contest, days=rollup(tasks, 100, 40 * 60))


def test_the_busier_student_only_wins_on_activity():
    a, b = by_key(student_a()), by_key(student_b())
    assert a['activity']['now'] == 450 and b['activity']['now'] == 90
    assert b['output']['now'] > a['output']['now']
    assert b['progress']['now'] > a['progress']['now']
    assert b['mastery']['now'] > a['mastery']['now']


def test_the_reading_tells_the_two_students_apart():
    assert student_a()['reading']['kind'] == 'busy'
    assert "didn't move your goals" in student_a()['reading']['headline']
    assert student_b()['reading']['kind'] in ('proving', 'closer-on-less')


def test_there_is_no_total():
    result = student_b()
    assert set(result) == {'days', 'from', 'to', 'before_from', 'before_to', 'reading', 'measures'}
    assert [row['key'] for row in result['measures']] == ['activity', 'output', 'progress', 'mastery']


# ---- One source moves one measure ------------------------------------------
def test_more_easy_work_and_xp_only_raise_activity():
    base = [task(day, 'AIME number theory set', 'mathematics', difficulty=5, execution=5) for day in range(5)]
    more = base + [task(1, 'Evening review', 'planning', difficulty=5, execution=5, n=n) for n in range(40)]
    before, after = by_key(read(base, [goal()])), by_key(read(more, [goal()], days=rollup(more, 500, 3600)))
    assert after['activity']['now'] > before['activity']['now']
    assert after['output']['now'] == before['output']['now']
    assert after['progress']['now'] == before['progress']['now']
    assert after['mastery']['now'] == before['mastery']['now']


def test_a_finished_checkpoint_only_moves_progress():
    stone = {'id': 'm1', 'title': 'Step', 'status': 'done', 'completed_at': back(3)}
    plain, moved = by_key(read([], [goal()])), by_key(read([], [goal(milestones=[stone])]))
    assert (plain['progress']['now'], moved['progress']['now']) == (0, 1)
    assert moved['activity']['now'] == plain['activity']['now']
    assert moved['output']['now'] == plain['output']['now']
    assert moved['mastery']['now'] == plain['mastery']['now']


def test_a_passed_check_only_moves_mastery():
    check = {'node_id': 'alg.expr', 'passed': True, 'finished_at': back(2)}
    plain, proven = by_key(read([], [goal()])), by_key(read([], [goal()], checks=[check]))
    assert (plain['mastery']['now'], proven['mastery']['now']) == (0, 1)
    assert proven['activity']['now'] == plain['activity']['now']
    assert proven['output']['now'] == plain['output']['now']
    assert proven['progress']['now'] == plain['progress']['now']


# ---- What doesn't count -----------------------------------------------------
def test_routines_and_things_attended_are_never_output_however_rated():
    rows = [task(1, 'Evening review', 'planning', difficulty=5, execution=5),
            task(1, 'Morning run', 'running', difficulty=5, execution=5),
            task(1, 'Math 55 lecture', 'mathematics', difficulty=5, execution=5),
            task(1, 'Advisor meeting', 'research', difficulty=5, execution=5),
            task(1, 'Lunch with the lab', 'research', difficulty=5, execution=5)]
    found = by_key(read(rows))
    assert found['output']['now'] == 0
    assert {row['key']: row['count'] for row in found['activity']['mix']} == {'study': 0, 'routine': 3, 'attended': 2}


def test_reviewing_lecture_notes_is_study_work():
    assert measures.kind_of(task(1, 'Review lecture notes', 'mathematics')) == 'study'


def test_a_scored_set_counts_when_mostly_right_and_not_when_mostly_wrong():
    good = task(1, 'AMC set', 'mathematics', score_got=7, score_of=10)
    bad = task(1, 'AMC set', 'mathematics', score_got=2, score_of=10)
    assert by_key(read([good]))['output']['now'] == 1
    assert by_key(read([bad]))['output']['now'] == 0


def test_an_xp_goal_is_not_an_objective():
    found = read([task(1)], [{'id': 'x', 'title': 'Earn 250,000 XP', 'status': 'active', 'goal_type': 'xp'}])
    progress = by_key(found)['progress']
    assert progress['total'] == 0
    assert found['reading']['kind'] == 'no-target'
    assert any('Earn 250,000 XP' in line and 'activity' in line for line in progress['lines'])


def test_a_self_rating_is_shown_but_is_never_proof():
    rows = ([task(day, 'AIME number theory', 'mathematics', difficulty=4, execution=2, n=day) for day in range(40, 30, -1)]
            + [task(day, 'AIME number theory', 'mathematics', difficulty=4, execution=5, n=day) for day in range(10, 0, -1)])
    mastery = by_key(read(rows))['mastery']
    assert mastery['now'] == 0
    assert mastery['evidence'] == 'Not tested'


def test_a_streak_record_is_not_a_skill_and_a_contest_score_is():
    rows = [{'name': 'Longest streak', 'kind': 'record', 'value': 10, 'achieved_on': back(100)},
            {'name': 'Longest streak', 'kind': 'record', 'value': 40, 'achieved_on': back(2)}]
    assert by_key(read(records=rows))['mastery']['now'] == 0
    rows = [{'name': 'AMC 8', 'kind': 'record', 'value': 18, 'target': 25, 'achieved_on': back(100)},
            {'name': 'AMC 8', 'kind': 'record', 'value': 22, 'target': 25, 'achieved_on': back(2)}]
    assert by_key(read(records=rows))['mastery']['now'] == 1


def test_a_ready_check_is_what_mastery_asks_for_when_nothing_is_tested():
    ready = [{'node_id': 'cm.algebra', 'name': 'Algebraic Manipulation', 'sessions': 12, 'last': back(1)}]
    mastery = by_key(read(ready=ready))['mastery']
    assert mastery['to'] == '/skill-trees?node=cm.algebra&check=1'
    assert 'Algebraic Manipulation' in mastery['suggests']


# ---- The window -------------------------------------------------------------
def test_each_measure_reads_the_last_thirty_against_the_thirty_before():
    rows = [task(10, 'AIME set', 'mathematics', difficulty=5, execution=5),
            task(40, 'AIME set', 'mathematics', difficulty=5, execution=5, n=1),
            task(41, 'AIME set', 'mathematics', difficulty=5, execution=5, n=2),
            task(70, 'AIME set', 'mathematics', difficulty=5, execution=5, n=3)]
    output = by_key(read(rows))['output']
    assert (output['now'], output['before']) == (1, 2)
    assert output['change'] == 'down from 2'
