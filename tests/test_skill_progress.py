"""The skill tree's reading of real work, and the skill check that masters a node.

Three layers, tested in the order they depend on each other:

- backend/tracking/skill_progress.py: which node a task counts toward, how
  many sessions that is, and what is open, in progress and done.
- backend/tracking/skill_check.py: which problems a check asks and how a typed
  answer is graded.
- backend/api/skillprogress.py and skillchecks.py: booking a session, moving
  a task between nodes, and a check from start to pass, with the account
  checks around each.

The node ids are the real catalogue's (data/skill_nodes.json), because the
rules read it: Arithmetic (m.arith) is a root of the Mathematics tree, and
Order of Operations (m.order) and Fractions (m.fractions) both need it.
"""
import json
import random

from backend.database import connection as db
from backend.tracking import skill_check
from backend.tracking import skill_progress as sp
from backend.tracking import skillsteps


def _task(id, title, subject='', status='done', day='2026-10-01', **extra):
    row = {'id': id, 'title': title, 'subject': subject, 'status': status,
           'completed_at': '{}T10:00:00'.format(day) if status == 'done' else None}
    row.update(extra)
    return row


def _sitting(task_id, day, minutes=25, title=''):
    return {'task_id': task_id, 'day': day, 'minutes': minutes, 'task_title': title}


# ---------------------------------------------------------------------------
# Filing: which node a task counts toward
# ---------------------------------------------------------------------------
def test_every_node_is_its_own_topic():
    mapped = sp.topic_nodes()
    assert mapped['mathematics:arithmetic'] == 'm.arith'
    assert mapped['calculus:integrals'] == 'k.integral'


def test_a_finer_topic_counts_toward_the_node_it_sits_under():
    """Recursive counting is filed under Counting, so it moves Counting."""
    assert sp.topic_nodes()['competition-math:recursive-counting'] == 'cm.count'


def test_a_taxonomy_topic_can_name_its_node():
    assert sp.topic_nodes()['competition-math:number-theory'] == 'cm.numtheory'
    # Graphs names a node on one of its two trees only.
    assert sp.topic_nodes()['competitive-programming:graphs'] == 'cp.dfs'
    assert 'algorithms:graphs' not in sp.topic_nodes()


def test_a_task_files_by_its_name_and_subject():
    assert sp.file_task({'title': 'Integration drills', 'subject': 'calculus'})['node'] == 'k.integral'
    assert sp.file_task({'title': 'AMC 10 recursive counting set',
                         'subject': 'mathematics'})['node'] == 'cm.count'


def test_naming_only_the_area_moves_no_node_but_says_which_tree():
    found = sp.file_task({'title': 'Calculus problem set', 'subject': 'calculus'})
    assert found == {'node': '', 'tree': 'calculus', 'how': 'area'}


def test_one_loose_word_with_no_subject_to_narrow_it_moves_nothing():
    """'source' is the Humanities node Sources; an open source PR is not."""
    assert sp.file_task({'title': 'Open source contribution', 'subject': 'programming'})['node'] == ''


def test_a_booked_node_beats_the_name():
    found = sp.file_task({'title': 'Something else entirely', 'skill_node': 'm.fractions'})
    assert found == {'node': 'm.fractions', 'tree': 'mathematics', 'how': 'booked'}


def test_moved_off_means_no_node_whatever_the_name_says():
    found = sp.file_task({'title': 'Integration drills', 'subject': 'calculus',
                          'skill_node': sp.NO_NODE})
    assert found['node'] == ''


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------
def test_a_finished_task_is_one_session():
    filed = sp.work([_task('1', 'Integration drills', 'calculus')])
    assert [item['sessions'] for item in filed['by_node']['k.integral']] == [1]


def test_sittings_on_separate_days_are_separate_sessions():
    tasks = [_task('1', 'Integration drills', 'calculus', status='todo')]
    sittings = [_sitting('1', '2026-10-01'), _sitting('1', '2026-10-02'), _sitting('1', '2026-10-02')]
    item = sp.work(tasks, sittings)['by_node']['k.integral'][0]
    assert (item['sessions'], item['days']) == (2, ['2026-10-01', '2026-10-02'])


def test_finishing_a_task_keeps_the_days_already_spent_on_it():
    """Three days of sittings, then done: still three, not back to one."""
    sittings = [_sitting('1', '2026-10-0{}'.format(day)) for day in (1, 2, 3)]
    before = sp.work([_task('1', 'Integration drills', 'calculus', status='todo')], sittings)
    after = sp.work([_task('1', 'Integration drills', 'calculus', day='2026-10-03')], sittings)
    assert before['by_node']['k.integral'][0]['sessions'] == 3
    assert after['by_node']['k.integral'][0]['sessions'] == 3


def test_a_short_sitting_is_not_a_session():
    tasks = [_task('1', 'Integration drills', 'calculus', status='todo')]
    filed = sp.work(tasks, [_sitting('1', '2026-10-01', minutes=sp.SITTING_MIN - 1)])
    assert filed['by_node'] == {}


def test_a_sitting_on_a_deleted_task_files_by_the_title_it_kept():
    filed = sp.work([], [_sitting('gone', '2026-10-01', title='AMC 10 recursive counting set')])
    assert filed['by_node']['cm.count'][0]['kind'] == 'sitting'


def test_a_kept_title_with_no_subject_needs_more_than_one_word():
    """A sitting keeps the title, not the subject, so one loose word is not enough."""
    assert sp.work([], [_sitting('gone', '2026-10-01', title='Integration drills')])['by_node'] == {}


def test_an_open_task_with_no_sittings_is_planned_not_progress():
    reading = sp.read([_task('1', 'Integration drills', 'calculus', status='todo')])
    figure = reading['nodes']['k.integral']
    assert (figure['sessions'], figure['planned']) == (0, 1)


def test_a_task_that_named_only_the_tree_is_counted_as_unfiled():
    reading = sp.read([_task('1', 'Calculus problem set', 'calculus')])
    assert reading['unfiled']['calculus'] == {'count': 1, 'titles': ['Calculus problem set']}


# ---------------------------------------------------------------------------
# The reading: done, open, ready
# ---------------------------------------------------------------------------
def _arithmetic(sessions, start=1):
    return [_task(str(n), 'Arithmetic drills', 'mathematics', day='2026-10-{:02d}'.format(n),
                  skill_node='m.arith') for n in range(start, start + sessions)]


def test_with_no_work_the_roots_are_open_and_the_rest_locked():
    status = sp.read([])['status']
    assert status['m.arith'] == 'available'
    assert 'm.order' not in status
    assert 'complete' not in status.values()


def test_a_node_with_no_check_is_done_at_its_target():
    target = sp.target_for('m.arith')
    short = sp.read(_arithmetic(target - 1))
    assert short['status']['m.arith'] == 'progress'
    assert short['nodes']['m.arith']['percent'] == round(100 * (target - 1) / target)
    done = sp.read(_arithmetic(target))
    assert done['status']['m.arith'] == 'complete'
    # The day the target-th session landed.
    assert done['nodes']['m.arith']['on'] == '2026-10-{:02d}'.format(target)


def test_finishing_a_node_opens_what_needs_it():
    status = sp.read(_arithmetic(sp.target_for('m.arith')))['status']
    assert status['m.order'] == 'available'
    assert status['m.fractions'] == 'available'


def test_work_on_a_locked_node_opens_it():
    """Derivatives homework is derivatives, whatever the tree says about limits."""
    status = sp.read([_task('1', 'Fractions worksheet', 'mathematics')])['status']
    assert status['m.fractions'] == 'progress'


def test_a_node_with_a_check_waits_for_the_check():
    target = sp.target_for('m.arith')
    reading = sp.read(_arithmetic(target + 2), checkable=['m.arith'])
    assert reading['status']['m.arith'] == 'progress'
    assert reading['nodes']['m.arith']['ready'] is True
    assert reading['nodes']['m.arith']['percent'] == 100


def _check(node, passed, correct=4, asked=5, day='2026-10-20'):
    return {'node_id': node, 'passed': passed, 'correct': correct, 'asked': asked,
            'finished_at': '{}T12:00:00'.format(day)}


def test_passing_the_check_masters_a_node_with_no_sessions_at_all():
    reading = sp.read([], checks=[_check('m.arith', True)], checkable=['m.arith'])
    assert reading['status']['m.arith'] == 'complete'
    assert reading['nodes']['m.arith']['on'] == '2026-10-20'
    assert reading['status']['m.order'] == 'available'


def test_a_failed_check_is_progress_and_keeps_its_best_score():
    checks = [_check('m.arith', False, correct=2, day='2026-10-01'),
              _check('m.arith', False, correct=3, day='2026-10-02')]
    reading = sp.read([], checks=checks, checkable=['m.arith'])
    assert reading['status']['m.arith'] == 'progress'
    check = reading['nodes']['m.arith']['check']
    assert (check['tries'], check['best'], check['asked'], check['passed_on']) == (2, 3, 5, '')


def test_an_unfinished_check_is_not_a_try():
    open_check = {'node_id': 'm.arith', 'correct': 2, 'asked': 5}
    reading = sp.read([], checks=[open_check], checkable=['m.arith'])
    assert 'm.arith' not in reading['nodes']
    assert reading['status']['m.arith'] == 'available'


def test_a_goal_that_names_a_topic_is_tied_to_its_node():
    goals = [{'id': 'g1', 'title': 'Get good at recursive counting'}]
    reading = sp.read([], goals=goals)
    assert reading['nodes']['cm.count']['goal_ids'] == ['g1']
    assert reading['goals'] == {'g1': 'Get good at recursive counting'}


def test_a_task_linked_to_a_goal_ties_its_node_to_that_goal():
    goals = [{'id': 'g2', 'title': 'Finish the calculus course'}]
    reading = sp.read([_task('1', 'Integration drills', 'calculus', goal_id='g2')], goals=goals)
    assert 'g2' in reading['nodes']['k.integral']['goal_ids']


def test_opened_by_names_what_the_pass_opened():
    before = sp.read([])['status']
    after = sp.read([], checks=[_check('m.arith', True)], checkable=['m.arith'])['status']
    opened = {entry['id'] for entry in sp.opened_by('m.arith', before, after)}
    assert {'m.order', 'm.fractions'} <= opened


def test_the_step_a_reader_is_on_is_one_per_session():
    steps = [{'ordinal': n} for n in (1, 2, 3)]
    assert [sp.step_for(n, steps)['ordinal'] for n in (0, 1, 2, 5)] == [1, 2, 3, 3]
    assert sp.step_for(2, []) is None


# ---------------------------------------------------------------------------
# The check: choosing problems
# ---------------------------------------------------------------------------
def _steps(count, per=3):
    weights = ('warmup', 'core', 'stretch')
    return [{'ordinal': n, 'title': 'Step {}'.format(n), 'problems': [
        {'slot': s, 'weight': weights[(s - 1) % 3], 'prompt': 'Q{}.{}'.format(n, s), 'answer': '1.'}
        for s in range(1, per + 1)]} for n in range(1, count + 1)]


def test_a_check_takes_one_problem_from_each_step_and_skips_warmups():
    picked = skill_check.pick(_steps(5), rng=random.Random(1))
    assert [q['ordinal'] for q in picked] == [1, 2, 3, 4, 5]
    assert all(q['weight'] != 'warmup' for q in picked)


def test_a_long_programme_is_sampled_end_to_end():
    picked = skill_check.pick(_steps(9), rng=random.Random(1))
    assert [q['ordinal'] for q in picked] == [1, 3, 5, 7, 9]


def test_a_short_programme_fills_the_check_from_its_harder_steps():
    picked = skill_check.pick(_steps(2), rng=random.Random(1))
    assert len(picked) == 5
    assert len({(q['ordinal'], q['slot']) for q in picked}) == 5
    assert [q['ordinal'] for q in picked] == sorted(q['ordinal'] for q in picked)


def test_a_retake_avoids_the_last_tries_problems():
    first = skill_check.pick(_steps(5), rng=random.Random(1))
    keys = [skill_check.problem_key(q['ordinal'], q['slot']) for q in first]
    second = skill_check.pick(_steps(5), keys, rng=random.Random(1))
    assert not {skill_check.problem_key(q['ordinal'], q['slot']) for q in second} & set(keys)


def test_too_few_problems_is_no_check():
    assert skill_check.pick(_steps(1, per=2)) == []
    assert len(skill_check.pick(_steps(1, per=3))) == 3


def test_the_pass_mark():
    assert [skill_check.pass_mark(n) for n in (3, 4, 5)] == [3, 3, 4]


# ---------------------------------------------------------------------------
# The check: grading
# ---------------------------------------------------------------------------
def test_a_number_answer_is_graded_on_the_number():
    assert skill_check.grade('15.', '15') is True
    assert skill_check.grade('15.', 'The answer is 15') is True
    assert skill_check.grade('15.', 'x = 15') is True
    assert skill_check.grade('15.', '15.4') is False
    assert skill_check.grade('15.', '15 or 16') is False
    assert skill_check.grade('15.', '') is False


def test_decimals_are_read_to_the_answers_own_last_place():
    assert skill_check.grade('24.73.', '24.734') is True
    assert skill_check.grade('24.73.', '24.7') is False


def test_a_fraction_takes_a_decimal_right_to_the_places_typed():
    assert skill_check.grade('1/6', '0.1667') is True
    assert skill_check.grade('1/6', '0.17') is True
    assert skill_check.grade('1/6', '0.2') is False
    assert skill_check.grade('1/6', '0.16') is False
    assert skill_check.grade('0.33', '1/3') is True
    assert skill_check.grade('-4/3', '-1.33') is True
    assert skill_check.grade('15.', '15.0') is True


def test_fractions_percents_units_and_commas():
    assert skill_check.grade('3/4', '0.75') is True
    assert skill_check.grade('0.75', '3/4') is True
    assert skill_check.grade('60%', '0.6') is True
    assert skill_check.grade('60%', '60') is True
    assert skill_check.grade('-60 kJ.', '-60') is True
    assert skill_check.grade('-60 kJ.', '60') is False
    assert skill_check.grade('6 cm.', '6cm') is True
    assert skill_check.grade('1,048,576.', '1048576') is True


def test_anything_but_one_number_is_the_readers_to_mark():
    for answer in ('x = 3', '2 pi.', '3 tens.', 'It raises IndexError.', '0.2 or -0.2.'):
        assert skill_check.grade(answer, '3') is None, answer


def test_every_number_answer_in_the_library_grades_itself_right():
    """The library's own answers, typed back, must all pass."""
    import json
    with open('data/skill_steps_seed.json', encoding='utf-8') as handle:
        programmes = json.load(handle)['programmes']
    answers = [p['answer'] for prog in programmes.values() for step in prog['steps']
               for p in step.get('problems', [])]
    gradable = [answer for answer in answers if skill_check.gradable(answer)]
    assert len(gradable) > 500
    assert [answer for answer in gradable if not skill_check.grade(answer, answer)] == []


# ---------------------------------------------------------------------------
# The endpoints
# ---------------------------------------------------------------------------
STEP_ROW = {
    'mastery': 'Add, subtract, multiply and divide whole numbers without a slip.',
    'practice': 'Work 12 mixed sums of 3-digit numbers, then check each one by estimating.',
    'detail': 'Estimate first so a wrong place value shows up before you finish the sum.',
    'proof': 'All 12 sums right on the first pass.',
    'pitfall': 'Dropping a carried 1 when the column already holds a 9.',
    'minutes': 15, 'tree_id': 'mathematics', 'tier': 'foundation', 'model': 'authored',
    'generated_at': '2026-10-01T00:00:00', 'attempts': 1, 'verified_at': '2026-10-01T00:00:00',
    'verifier': 'rules+authored', 'checks': list(skillsteps.RULE_CHECKS),
}


SENTENCES = ('Carry the one.', 'Because 9 plus 1 carries.')


def _number(question):
    """The number answer to a question from `_seed_check`, by step and grade."""
    return 10 * question['ordinal'] if question['weight'] == 'core' else 20 * question['ordinal']


def _seed_check(node='m.arith', steps=5):
    """A written programme whose every check has both kinds of question. The
    check takes one core or stretch problem from each step at random, so the
    kinds are fixed per step rather than per grade: steps 1-4 have number
    answers (core 10n, stretch 20n), the last step has only sentences. The
    warmups are sentences too, and a check never asks them while it has a
    choice."""
    db.save_node_steps(node, [{**STEP_ROW, 'ordinal': n, 'title': 'Step {} of the drill'.format(n)}
                              for n in range(1, steps + 1)])
    for n in range(1, steps + 1):
        last = n == steps
        db.save_step_problems(node, n, [{
            'slot': slot, 'weight': weight, 'prompt': 'Question {} in step {}?'.format(slot, n),
            'answer': answer, 'hint': 'Estimate first.', 'tree_id': 'mathematics', 'model': 'authored',
            'generated_at': '2026-10-01T00:00:00', 'verified_at': '2026-10-01T00:00:00',
            'verifier': 'rules+authored', 'checks': ['concrete'],
        } for slot, weight, answer in (
            (1, 'warmup', 'Seven tens.'),
            (2, 'core', SENTENCES[0] if last else '{}.'.format(10 * n)),
            (3, 'stretch', SENTENCES[1] if last else '{}.'.format(20 * n)),
        )])


def _answer_all(client, check, right=True):
    """Answer every open question: the number when it's auto-graded, a mark
    when it isn't."""
    reply = None
    for question in check['questions']:
        if question['result']:
            continue
        if question['auto']:
            given = str(_number(question)) if right else '999'
            reply = client.post('/api/skill-checks/answer', json={
                'id': check['id'], 'index': question['index'], 'given': given}).json()
        else:
            reveal = client.post('/api/skill-checks/answer', json={
                'id': check['id'], 'index': question['index'], 'given': 'my try'}).json()
            assert reveal['success'] and reveal['reveal']['answer'], reveal
            reply = client.post('/api/skill-checks/answer', json={
                'id': check['id'], 'index': question['index'], 'given': 'my try',
                'mark': 'right' if right else 'wrong'}).json()
        assert reply['success'], reply
    return reply


def test_the_reading_needs_an_account(anon):
    assert anon.get('/api/skill-progress').status_code in (401, 403) or \
        anon.get('/api/skill-progress').json()['success'] is False


def test_the_reading_counts_finished_tasks(client):
    made = client.post('/api/tasks', json={'name': 'Integration drills', 'subject': 'calculus'}).json()
    client.post('/api/complete_task', json={'task_id': made['task_id']})
    reading = client.get('/api/skill-progress').json()
    assert reading['success'], reading
    assert reading['nodes']['k.integral']['sessions'] == 1
    assert reading['status']['k.integral'] == 'progress'


def test_booking_makes_a_task_for_the_step_the_reader_is_on(client):
    _seed_check()
    reply = client.post('/api/skill-progress/book', json={'node_id': 'm.arith'}).json()
    assert reply['success'], reply
    task = db.find_row('tasks', reply['task']['id'], user_id='tester')
    assert task['title'] == 'Arithmetic: Step 1 of the drill'
    assert task['skill_node'] == 'm.arith'
    assert task['subject'] == 'mathematics'
    assert task['description'].startswith('Step 1 of 5.')
    assert reply['nodes']['m.arith']['planned'] == 1

    # Finishing it is a session on the node, and the next booking is step 2.
    client.post('/api/complete_task', json={'task_id': task['id']})
    reading = client.get('/api/skill-progress').json()
    assert reading['nodes']['m.arith']['sessions'] == 1
    again = client.post('/api/skill-progress/book', json={'node_id': 'm.arith'}).json()
    assert again['task']['title'] == 'Arithmetic: Step 2 of the drill'


def test_booking_a_node_with_nothing_written_still_names_it(client):
    reply = client.post('/api/skill-progress/book', json={'node_id': 'm.fractions'}).json()
    assert reply['success'], reply
    assert reply['task']['title'] == 'Fractions session'


def test_booking_refuses_a_node_that_does_not_exist(client):
    assert client.post('/api/skill-progress/book', json={'node_id': 'no.such'}).json()['success'] is False


def test_a_task_can_be_moved_off_a_node_and_back(client):
    made = client.post('/api/tasks', json={'name': 'Integration drills', 'subject': 'calculus'}).json()
    client.post('/api/complete_task', json={'task_id': made['task_id']})
    off = client.post('/api/skill-progress/file', json={'task_id': made['task_id'], 'node_id': '-'}).json()
    assert off['success'], off
    assert 'k.integral' not in off['nodes']
    onto = client.post('/api/skill-progress/file', json={'task_id': made['task_id'],
                                                         'node_id': 'm.fractions'}).json()
    assert onto['nodes']['m.fractions']['sessions'] == 1
    back = client.post('/api/skill-progress/file', json={'task_id': made['task_id'], 'node_id': ''}).json()
    assert back['nodes']['k.integral']['sessions'] == 1
    assert 'm.fractions' not in back['nodes']


def test_tasks_with_the_same_name_are_one_row_and_move_together(client):
    """A routine repeats its name. One row says how many, and "Not this
    skill" takes every task with that name off, not one of a hundred."""
    ids = []
    for _ in range(3):
        made = client.post('/api/tasks', json={'name': 'Integration drills', 'subject': 'calculus'}).json()
        client.post('/api/complete_task', json={'task_id': made['task_id']})
        ids.append(made['task_id'])
    other = client.post('/api/tasks', json={'name': 'Integration  DRILLS', 'subject': 'calculus'}).json()
    client.post('/api/complete_task', json={'task_id': other['task_id']})
    reading = client.get('/api/skill-progress').json()
    rows = reading['nodes']['k.integral']['work']
    assert len(rows) == 1 and rows[0]['count'] == 4 and rows[0]['sessions'] == 4
    off = client.post('/api/skill-progress/file', json={
        'task_id': ids[0], 'node_id': '-', 'same_name': True}).json()
    assert off['moved'] == 4
    assert 'k.integral' not in off['nodes']


def test_moving_by_name_stays_inside_the_account(client, stranger):
    mine = client.post('/api/tasks', json={'name': 'Integration drills', 'subject': 'calculus'}).json()
    theirs = stranger.post('/api/tasks', json={'name': 'Integration drills', 'subject': 'calculus'}).json()
    client.post('/api/skill-progress/file', json={'task_id': mine['task_id'], 'node_id': '-', 'same_name': True})
    assert db.find_row('tasks', mine['task_id'], user_id='tester')['skill_node'] == '-'
    assert not db.find_row('tasks', theirs['task_id'], user_id='stranger').get('skill_node')


def test_one_account_cannot_move_anothers_task(client, stranger):
    made = client.post('/api/tasks', json={'name': 'Integration drills', 'subject': 'calculus'}).json()
    reply = stranger.post('/api/skill-progress/file', json={'task_id': made['task_id'], 'node_id': '-'}).json()
    assert reply['success'] is False
    assert not db.find_row('tasks', made['task_id'], user_id='tester').get('skill_node')


def test_every_seeded_check_has_both_kinds_of_question(client):
    """What the endpoint tests below rely on, checked over many draws."""
    _seed_check()
    for _ in range(30):
        check = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()['check']
        kinds = {question['auto'] for question in check['questions']}
        assert kinds == {True, False}
        db.delete_row('skill_checks', check['id'], user_id='tester')


def test_a_check_goes_out_without_its_answers(client):
    _seed_check()
    reply = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()
    assert reply['success'], reply
    check = reply['check']
    assert (check['asked'], check['need']) == (5, 4)
    assert [q['ordinal'] for q in check['questions']] == [1, 2, 3, 4, 5]
    assert all(q['result'] is None and 'answer' not in q for q in check['questions'])
    assert all(q['weight'] != 'warmup' for q in check['questions'])


def test_passing_a_check_masters_the_node_and_opens_the_next(client):
    _seed_check()
    check = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()['check']
    final = _answer_all(client, check, right=True)
    assert final['check']['finished'] is True
    assert final['check']['passed'] is True
    assert final['progress']['status']['m.arith'] == 'complete'
    assert {'m.order', 'm.fractions'} <= {node['id'] for node in final['opened']}
    # Every answer is one attempt, which is what moves the step levels.
    assert len(db.rows_for('skill_attempts', 'tester')) == 5
    row = db.find_row('skill_checks', check['id'], user_id='tester')
    assert row['correct'] == 5 and row['finished_at']


def test_failing_a_check_leaves_the_node_in_progress(client):
    _seed_check()
    check = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()['check']
    final = _answer_all(client, check, right=False)
    assert final['check']['passed'] is False
    assert final['opened'] == []
    assert final['progress']['status']['m.arith'] == 'progress'
    assert final['progress']['nodes']['m.arith']['check']['tries'] == 1


def test_a_sentence_answer_is_shown_before_anything_is_recorded(client):
    _seed_check()
    check = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()['check']
    question = next(q for q in check['questions'] if not q['auto'])
    reveal = client.post('/api/skill-checks/answer', json={
        'id': check['id'], 'index': question['index'], 'given': 'a guess'}).json()
    assert reveal['reveal']['answer'] in SENTENCES
    assert db.rows_for('skill_attempts', 'tester') == []


def test_an_auto_question_needs_something_typed(client):
    _seed_check()
    check = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()['check']
    question = next(q for q in check['questions'] if q['auto'])
    reply = client.post('/api/skill-checks/answer', json={
        'id': check['id'], 'index': question['index'], 'given': '  '}).json()
    assert reply['success'] is False


def test_showing_the_answer_without_trying_counts_as_missed(client):
    _seed_check()
    check = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()['check']
    reply = client.post('/api/skill-checks/answer', json={
        'id': check['id'], 'index': 0, 'skip': True}).json()
    assert reply['result']['right'] is False and reply['result']['how'] == 'skipped'
    assert reply['result']['answer']


def test_answering_twice_does_not_count_twice(client):
    _seed_check()
    check = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()['check']
    question = next(q for q in check['questions'] if q['auto'])
    body = {'id': check['id'], 'index': question['index'], 'given': str(_number(question))}
    client.post('/api/skill-checks/answer', json=body)
    again = client.post('/api/skill-checks/answer', json={**body, 'given': '0'}).json()
    assert again['check']['questions'][question['index']]['result']['right'] is True
    assert len(db.rows_for('skill_attempts', 'tester')) == 1


def test_leaving_and_coming_back_resumes_the_same_check(client):
    _seed_check()
    first = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()['check']
    client.post('/api/skill-checks/answer', json={'id': first['id'], 'index': 0, 'skip': True})
    again = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()
    assert again['resumed'] is True
    assert again['check']['id'] == first['id']
    assert again['check']['questions'][0]['result']['how'] == 'skipped'


def test_a_retake_after_a_finished_check_is_a_new_check(client):
    _seed_check()
    first = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()['check']
    _answer_all(client, first, right=False)
    second = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()
    assert second['resumed'] is False
    assert second['check']['id'] != first['id']


def test_a_locked_node_cannot_be_checked(client):
    _seed_check('m.order')
    reply = client.post('/api/skill-checks/start', json={'node_id': 'm.order'}).json()
    assert reply['success'] is False
    assert 'locked' in reply['message']


def test_a_node_with_no_problems_has_no_check(client):
    reply = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()
    assert reply['success'] is False


def test_one_account_cannot_answer_anothers_check(client, stranger):
    _seed_check()
    check = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()['check']
    reply = stranger.post('/api/skill-checks/answer', json={
        'id': check['id'], 'index': 0, 'skip': True}).json()
    assert reply['success'] is False
    assert db.rows_for('skill_attempts', 'tester') == []


def test_the_checkable_list_comes_with_the_reading(client):
    _seed_check()
    reading = client.get('/api/skill-progress').json()
    assert 'm.arith' in reading['checkable']


def test_two_starts_at_once_settle_on_one_check(client):
    """A double click, or React running the start effect twice in development:
    each request finds nothing running and opens a check. Every start keeps
    the earliest and drops the later empty ones, so a retake never resumes a
    stray check that was opened by accident."""
    _seed_check()
    first = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()['check']
    row = db.find_row('skill_checks', first['id'], user_id='tester')
    # The second request's check, written as if it raced the first.
    db.insert_row('skill_checks', {**row, 'id': str(int(row['id']) + 1), 'answers': [None] * row['asked']})
    again = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()
    assert again['check']['id'] == first['id']
    assert len(db.rows_for('skill_checks', 'tester')) == 1


def test_a_running_check_with_answers_is_never_dropped(client):
    _seed_check()
    first = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()['check']
    row = db.find_row('skill_checks', first['id'], user_id='tester')
    later = str(int(row['id']) + 1)
    db.insert_row('skill_checks', {**row, 'id': later, 'started_at': row['started_at'][:-1] + '9',
                                   'answers': [{'given': '', 'right': False, 'how': 'skipped'}] + [None] * 4})
    client.post('/api/skill-checks/start', json={'node_id': 'm.arith'})
    assert db.find_row('skill_checks', later, user_id='tester')


# ---------------------------------------------------------------------------
# Aids: a figure, an answer figure, a calculator
# ---------------------------------------------------------------------------
FIGURE = {'kind': 'plot', 'x': [0, 4], 'y': [0, 3], 'items': [{'path': [[0, 0], [4, 0], [0, 3]], 'closed': True}]}
WORKED = {'kind': 'table', 'rows': [[3, 4, 5]]}


def test_a_well_formed_figure_passes_and_a_broken_one_says_why():
    assert skillsteps.aid_failures({'figure': FIGURE, 'answer_figure': WORKED, 'tools': ['calculator']}) == []
    assert skillsteps.aid_failures({}) == []
    assert skillsteps.aid_failures({'tools': ['abacus']})
    assert skillsteps.aid_failures({'figure': {'kind': 'photo'}})
    assert skillsteps.aid_failures({'figure': {**FIGURE, 'x': [4, 0]}})
    # A curve may only use the calculator's own words, so it can't carry code.
    assert skillsteps.aid_failures({'figure': {**FIGURE, 'items': [{'fn': 'alert(1)'}]}})
    assert skillsteps.aid_failures({'figure': {**FIGURE, 'items': [{'fn': 'sin(x) + x^2'}]}}) == []
    assert skillsteps.aid_failures({'figure': {'kind': 'graph', 'nodes': [{'id': 'A', 'at': [10, 10]}],
                                               'edges': [{'from': 'A', 'to': 'B'}]}})


def test_a_figure_makes_a_question_concrete():
    problem = {'slot': 1, 'weight': 'warmup', 'prompt': 'Which side is the hypotenuse here?', 'answer': 'The long one.'}
    assert any(f.startswith('concrete') for f in skillsteps.problem_failures(problem, {}))
    assert skillsteps.problem_failures({**problem, 'aids': {'figure': FIGURE}}, {}) == []


def test_every_aid_in_the_library_is_drawable():
    import json
    with open('data/skill_steps_seed.json', encoding='utf-8') as handle:
        programmes = json.load(handle)['programmes']
    aids = [p['aids'] for prog in programmes.values() for step in prog['steps']
            for p in step.get('problems', []) if p.get('aids')]
    assert len(aids) > 200
    assert [failure for one in aids for failure in skillsteps.aid_failures(one)] == []


def test_the_answer_figure_waits_for_the_answer(client):
    _seed_check()
    for n in range(1, 6):
        rows = db.skill_problems_for(['m.arith'])['m.arith']
        db.save_step_problems('m.arith', n, [
            {**row, 'aids': {'figure': FIGURE, 'answer_figure': WORKED, 'tools': ['calculator']}}
            for row in rows if row['ordinal'] == n])
    check = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()['check']
    question = check['questions'][0]
    assert question['figure'] == FIGURE and question['tools'] == ['calculator']
    assert 'answer_figure' not in json.dumps(check) and 'figure' not in (question['result'] or {})
    final = _answer_all(client, check, right=True)
    assert all(q['result']['figure'] == WORKED for q in final['check']['questions'])


def test_a_miss_in_a_skill_check_comes_back_on_the_review_queue(client):
    """A wrong answer in a check is a problem attempt like any other, so the
    review queue brings it back the next day."""
    from datetime import date, timedelta
    from backend.api.review import read_queue
    _seed_check()
    check = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()['check']
    _answer_all(client, check, right=False)
    queue = read_queue('tester', today=date.today() + timedelta(days=1))
    due = {(item.get('node_id'), item.get('ordinal')) for item in queue['due']}
    assert {('m.arith', q['ordinal']) for q in check['questions']} <= due


def test_the_plan_offers_a_check_once_its_sessions_are_done(client):
    _seed_check()
    for n, day in enumerate(('2026-10-01', '2026-10-02', '2026-10-03'), start=1):
        made = client.post('/api/tasks', json={'name': 'Arithmetic drill {}'.format(n)}).json()
        db.update_row('tasks', made['task_id'], {'status': 'done', 'skill_node': 'm.arith',
                                                 'completed_at': '{}T10:00:00'.format(day)}, user_id='tester')
    assert client.get('/api/skill-progress').json()['nodes']['m.arith']['ready'] is True
    plan = client.get('/api/next_actions?budget=120').json()['plan']
    rows = plan['actions'] + plan.get('more', [])
    row = next(one for one in rows if one['kind'] == 'check')
    assert row['to'] == '/skill-trees?node=m.arith&check=1'
