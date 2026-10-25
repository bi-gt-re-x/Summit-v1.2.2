"""Topics: tasks filed below their subject, scored, and tied to goals.

The rules are backend/tracking/topics.py and the words are
data/topic_taxonomy.json. These pin where real task names land, that a topic
only reads as weak with the ratings to show it, that a goal's plan names real
work (a count, a contest, a topic) rather than general advice, and that the
library is built by a POST and only read by a GET.
"""
from datetime import datetime, timedelta

import pytest

from backend.database import connection as db
from backend.tracking import topics


# --------------------------------------------------------------------------
# Filing one task
# --------------------------------------------------------------------------
@pytest.mark.parametrize('title, subject, subsubject, topic, context', [
    # The user's own example: the contest, the area and the topic.
    ('AMC 10 recursive counting problems', 'mathematics', 'competition-math',
     'competition-math:recursive-counting', 'amc10'),
    ('AIME 2019 I #10 geometry', 'mathematics', 'competition-math', 'competition-math:geometry', 'aime'),
    ('USACO Gold DP set', 'computer_science', 'competitive-programming',
     'competitive-programming:dynamic-programming', 'usaco-gold'),
    ('LeetCode sliding window x5', 'computer_science', 'algorithms', 'algorithms:sliding-window', 'leetcode'),
    ('Integration drills', 'mathematics', 'calculus', 'calculus:integrals', ''),
    ('Calculus: u-sub drills', 'mathematics', 'calculus', 'calculus:u-substitution', ''),
    ('Strang Linear Algebra Ch.2 eigenvalues', 'mathematics', 'linear-algebra',
     'linear-algebra:eigenvectors-eigenvalues', ''),
    ('Data structures revision', 'computer_science', 'algorithms', 'algorithms:data-structures', ''),
    ('Kreutzer etude 9', 'music', 'violin', 'violin:etudes', ''),
])
def test_a_name_that_says_the_topic_files_under_it(title, subject, subsubject, topic, context):
    filed = topics.classify(title, '', subject)
    assert (filed['subsubject'], filed['topic'], filed['context']) == (subsubject, topic, context)
    assert filed['how'] == 'named'


@pytest.mark.parametrize('title, subject, subsubject, context, how', [
    # The area, with no topic in it: "algebra" inside "linear algebra" is the
    # area's name, not Algebraic Manipulation.
    ('Linear algebra exercises', 'mathematics', 'linear-algebra', '', 'area'),
    ('Algorithms problem set', 'computer_science', 'algorithms', '', 'area'),
    # Only a contest: it says the area. "Gold training" isn't the ML node
    # "Train, Validate, Test".
    ('USACO Gold training', 'computer_science', 'competitive-programming', 'usaco-gold', 'context'),
    ('AIME problem set', 'mathematics', 'competition-math', 'aime', 'context'),
    ('LeetCode session', 'computer_science', 'algorithms', 'leetcode', 'context'),
])
def test_a_name_without_a_topic_still_files_its_area(title, subject, subsubject, context, how):
    filed = topics.classify(title, '', subject)
    assert (filed['subsubject'], filed['topic'], filed['context'], filed['how']) == (subsubject, '', context, how)


@pytest.mark.parametrize('title, subject', [
    ('Morning meditation', 'meditation'),
    ('SAT with friends', 'friends'),      # "sat" the verb isn't the SAT
    ('Weekend problem set', 'mathematics'),
    ('Minecraft mod night', 'friends'),   # "mod" outside math isn't modular arithmetic
])
def test_a_name_with_nothing_to_go_on_files_nowhere(title, subject):
    assert topics.classify(title, '', subject) == {'subsubject': '', 'topic': '', 'context': '', 'how': 'none'}


def test_the_description_names_the_topic_when_the_title_does_not():
    filed = topics.classify('AMC 10 set', 'All casework today', 'mathematics')
    assert filed['topic'] == 'competition-math:casework'
    assert filed['how'] == 'described'


def test_the_contest_picks_the_tree_when_two_have_the_topic():
    # Dynamic programming is in both trees. USACO says competitive programming,
    # LeetCode says algorithms.
    assert topics.classify('USACO DP', '', 'computer_science')['subsubject'] == 'competitive-programming'
    assert topics.classify('LeetCode DP', '', 'computer_science')['subsubject'] == 'algorithms'


def test_every_syllabus_topic_exists():
    tax = topics.taxonomy()
    for context in tax.contexts:
        for topic_id in context.get('syllabus', []) + context.get('also', []):
            assert topic_id in tax.topics, '{} names {}, which no tree has'.format(context['id'], topic_id)
        if context.get('warmup'):
            assert context['warmup'] in tax.context_by_id


# --------------------------------------------------------------------------
# The library
# --------------------------------------------------------------------------
def _task(title, execution, subject='mathematics', **extra):
    return {'id': title + str(execution) + str(extra.get('n', '')), 'title': title, 'description': '',
            'subject': subject, 'execution': execution, 'difficulty': 3, 'score_got': None,
            'score_of': None, 'met_deadline': None, 'reason': extra.get('reason', ''),
            'completed_at': '2026-10-01T10:00:00', 'goal_id': extra.get('goal_id')}


def _row(rows, topic_id):
    return next(row for row in rows if row['topic'] == topic_id)


def _account_tasks():
    """Recursive counting going badly, angle chasing going well, the rest
    of the subject in between."""
    tasks = [_task('AMC 10 recursive counting set', 2, n=i, reason='rushed') for i in range(8)]
    tasks += [_task('AMC 10 angle chasing set', 5, n=i) for i in range(8)]
    tasks += [_task('Calculus problem set', 4, n=i) for i in range(16)]
    tasks += [_task('AMC 10 practice set', 3, n=i) for i in range(10)]
    return tasks


def test_a_topic_rated_below_the_subject_reads_weak_and_above_reads_strong():
    rows = topics.library(_account_tasks())
    weak = _row(rows, 'competition-math:recursive-counting')
    strong = _row(rows, 'competition-math:angle-chasing')
    assert weak['status'] == 'weak' and weak['gap'] < 0
    assert strong['status'] == 'strong' and strong['gap'] > 0
    assert weak['tasks'] == 8 and weak['execution'] == 2
    assert weak['reason'] == 'rushed'
    assert weak['contexts'] == {'amc10': 8}
    assert weak['subsubject_label'] == 'Competition Mathematics' or weak['subsubject_label']


def test_two_rated_tasks_are_too_few_to_call():
    tasks = [_task('AMC 10 recursive counting set', 1, n=i) for i in range(2)]
    tasks += [_task('Calculus problem set', 4, n=i) for i in range(10)]
    assert _row(topics.library(tasks), 'competition-math:recursive-counting')['status'] == 'untested'


def test_tasks_without_a_subject_are_left_out():
    rows = topics.library([_task('AMC 10 counting', 3, subject='')])
    assert rows == []


# --------------------------------------------------------------------------
# Goals
# --------------------------------------------------------------------------
GOAL = {'id': 'g1', 'title': 'Make AIME', 'description': 'Qualify through AMC 10', 'subject_ids': 'mathematics'}


def test_a_goal_reads_its_contest_and_syllabus_from_its_own_words():
    found = topics.scope(GOAL)
    assert found['contexts'][0] == 'aime'          # the title's contest leads
    assert 'amc10' in found['contexts']
    assert 'competition-math:recursive-counting' in found['syllabus']
    assert 'competition-math' in found['trees']


def test_the_plan_names_real_work_for_the_weakest_topic():
    rows = topics.library(_account_tasks(), [GOAL])
    plan = topics.plan(GOAL, rows)
    first = plan['moves'][0]
    # Practiced where the account did it (AMC 10), then on the goal's contest.
    assert first['title'] == 'Do 10 AMC 10 recursive counting problems, then 3 AIME ones'
    assert first['weight'] == 'now'
    assert '2.0 out of 5' in first['why']
    assert first['resource'] and first['resource']['url'].startswith('https://')
    assert any(move['id'] == 'keep-competition-math:angle-chasing' for move in plan['moves'])
    assert any(move['title'].startswith('Try 5 AIME ') for move in plan['moves'])
    assert plan['insights'][0]['title'] == 'Weakest topic: Recursive counting'
    # Where it starts from: the syllabus, each topic with how it's going.
    status = {spot['topic']: spot['status'] for spot in plan['position']}
    assert status['competition-math:recursive-counting'] == 'weak'
    assert status['competition-math:polynomials'] == 'untouched'


def test_a_weak_topic_with_no_contest_of_its_own_warms_up_below_the_goals():
    tasks = [_task('Recursive counting drills', 2, n=i) for i in range(8)]
    tasks += [_task('Calculus problem set', 4, n=i) for i in range(16)]
    plan = topics.plan(GOAL, topics.library(tasks, [GOAL]))
    assert plan['moves'][0]['title'] == 'Do 10 AMC 12 recursive counting problems, then 3 AIME ones'


def test_the_plan_asks_for_topic_names_when_the_tasks_dont_give_them():
    tasks = [_task('AIME problem set', 3, n=i) for i in range(12)]
    plan = topics.plan(GOAL, topics.library(tasks, [GOAL]))
    move = next(move for move in plan['moves'] if move['id'] == 'name-topics')
    assert move['title'] == 'Name the topic in your AIME tasks'
    assert '12 tasks' in move['why'] and '"AIME problem set"' in move['why']
    assert move['weight'] == 'now'


def test_a_goal_that_names_no_contest_takes_its_subjects_rows():
    goal = {'id': 'g2', 'title': 'Become an engineer from scratch', 'subject_ids': 'computer_science'}
    tasks = [_task('Data structures revision', 2, subject='computer_science', n=i) for i in range(8)]
    tasks += [_task('Algorithms problem set', 4, subject='computer_science', n=i) for i in range(12)]
    rows = topics.library(tasks, [goal])
    assert all('g2' in row['goal_ids'] for row in rows)
    plan = topics.plan(goal, rows)
    assert plan['moves'][0]['title'] == 'Do 8 data structures problems'


def test_copy_has_no_em_dashes_or_curly_quotes():
    plan = topics.plan(GOAL, topics.library(_account_tasks(), [GOAL]))
    for move in plan['moves']:
        for text in (move['title'], move['why']):
            assert '—' not in text and '“' not in text and '”' not in text


# --------------------------------------------------------------------------
# The API
# --------------------------------------------------------------------------
def _done(title, execution, subject='mathematics'):
    stamp = (datetime.now() - timedelta(days=1)).isoformat(timespec='seconds')
    db.insert_row('tasks', {
        'id': db.new_id('tasks'),
        'user_id': 'tester', 'title': title, 'status': 'done', 'subject': subject,
        'execution': execution, 'completed_at': stamp, 'created_at': stamp,
    })


def test_post_builds_the_library_and_get_reads_it_back(client):
    for _ in range(6):
        _done('AMC 10 recursive counting set', 2)
        _done('Calculus problem set', 4)
    client.post('/api/add_goal', json={'title': 'Reach AIME', 'goal_type': 'tasks', 'target_tasks': 10})

    before = client.get('/api/topics?subject=mathematics').json()
    assert before['success'] and before['built'] is False and before['stale'] is True

    built = client.post('/api/topics?subject=mathematics').json()
    assert built['success'] and built['built'] is True and built['stale'] is False
    weak = next(row for row in built['rows'] if row['topic'] == 'competition-math:recursive-counting')
    assert weak['status'] == 'weak'
    plan = next(iter(built['goals'].values()))
    assert plan['title'] == 'Reach AIME'
    assert plan['moves'][0]['title'] == 'Do 10 AMC 10 recursive counting problems, then 3 AIME ones'

    after = client.get('/api/topics?subject=mathematics').json()
    assert after['stale'] is False
    assert [row['topic'] for row in after['rows']] == [row['topic'] for row in built['rows']]
    assert after['goals'].keys() == built['goals'].keys()

    # A new finished task makes the stored library stale until the next build.
    _done('AMC 10 casework set', 3)
    assert client.get('/api/topics?subject=mathematics').json()['stale'] is True


def test_one_account_never_sees_anothers_library(client, stranger):
    for _ in range(4):
        _done('AMC 10 recursive counting set', 2)
    client.post('/api/topics')
    theirs = stranger.get('/api/topics').json()
    assert theirs['rows'] == [] and theirs['built'] is False


def test_the_same_topic_in_a_nearby_tree_counts_as_worked_on():
    tasks = [_task('Combinatorics practice', 4, n=i) for i in range(6)]
    plan = topics.plan(GOAL, topics.library(tasks, [GOAL]))
    status = {spot['topic']: spot for spot in plan['position']}
    assert status['competition-math:counting']['status'] != 'untouched'
    assert status['competition-math:counting']['tasks'] == 6
    assert not any(move['id'] == 'start-competition-math:counting' for move in plan['moves'])
