"""The review queue: misses come back on 1, 3, 7 and 14 days until they stick.

The rules are backend/tracking/review.py; the endpoints backend/api/review.py.
"""
from datetime import date, datetime, timedelta

from backend.database import connection as db
from backend.tracking import review as rv

TODAY = date(2026, 10, 20)


def d(days_ago):
    return TODAY - timedelta(days=days_ago)


def at(days_ago, hour=17):
    return datetime.combine(d(days_ago), datetime.min.time()).replace(hour=hour).isoformat()


def attempt(node='m.quadratics', ordinal=2, slot=3, right=False, days_ago=0, weight='core', **over):
    row = {'node_id': node, 'ordinal': ordinal, 'slot': slot, 'weight': weight, 'attempted': 1,
           'correct': 1 if right else 0, 'source': 'problem', 'at': at(days_ago)}
    row.update(over)
    return row


# ---- The schedule ------------------------------------------------------------
def test_a_miss_is_due_the_next_day():
    read = rv.schedule([(d(1), False)], TODAY)
    assert (read['rung'], read['due']) == (0, TODAY)


def test_each_right_answer_moves_it_up_the_ladder():
    read = rv.schedule([(d(10), False), (d(9), True)], TODAY)
    assert (read['rung'], read['due']) == (1, d(9) + timedelta(days=3))
    read = rv.schedule([(d(20), False), (d(19), True), (d(16), True)], TODAY)
    assert (read['rung'], read['due']) == (2, d(16) + timedelta(days=7))


def test_four_right_on_four_days_clears_it():
    read = rv.schedule([(d(30), False), (d(29), True), (d(26), True), (d(19), True), (d(5), True)], TODAY)
    assert read['cleared_on'] == d(5) and read['due'] is None


def test_right_on_the_same_day_as_the_miss_does_not_count():
    # You just saw the answer.
    read = rv.schedule([(d(2), False), (d(2), True)], TODAY)
    assert read['rung'] == 0
    assert read['due'] == d(1)


def test_a_new_miss_starts_it_over():
    read = rv.schedule([(d(10), False), (d(9), True), (d(6), True), (d(1), False)], TODAY)
    assert (read['rung'], read['missed_on'], read['due']) == (0, d(1), TODAY)


def test_a_miss_after_clearing_brings_it_back():
    history = [(d(40), False), (d(39), True), (d(36), True), (d(29), True), (d(15), True), (d(2), False)]
    read = rv.schedule(history, TODAY)
    assert read['cleared_on'] is None and read['due'] == d(1)


def test_never_missed_is_not_in_the_queue():
    assert rv.schedule([(d(3), True), (d(1), True)], TODAY) is None


def test_after_says_what_one_answer_does():
    assert rv.after(0, True) == (1, 3)
    assert rv.after(2, True) == (3, 14)
    assert rv.after(3, True) == (4, None)
    assert rv.after(3, False) == (0, 1)


# ---- The queue -----------------------------------------------------------------
LIBRARY = {'m.quadratics': [{'ordinal': 2, 'title': 'Factor Simple Quadratics', 'problems': [
    {'slot': 3, 'weight': 'core', 'prompt': 'Factor x^2 + 5x + 6.', 'answer': '(x + 2)(x + 3)', 'hint': ''},
    {'slot': 4, 'weight': 'core', 'prompt': 'Factor x^2 - 9.', 'answer': '(x - 3)(x + 3)', 'hint': ''}]}]}
NODES = {'m.quadratics': {'id': 'm.quadratics', 'name': 'Quadratics', 'tree': 'algebra', 'treeTitle': 'Algebra'}}


def test_a_missed_problem_comes_back_with_its_own_words():
    found = rv.queue([attempt(days_ago=1)], [], [], TODAY, library=LIBRARY, nodes=NODES)
    [item] = found['due']
    assert item['key'] == 'p:m.quadratics#2#3'
    assert (item['title'], item['where'], item['tree_title']) == ('Factor Simple Quadratics', 'Quadratics', 'Algebra')
    assert (item['prompt'], item['answer'], item['level']) == ('Factor x^2 + 5x + 6.', '(x + 2)(x + 3)', 'Medium')
    assert item['line'] == 'Missed yesterday. 2nd try.'
    assert found['minutes'] == rv.PROBLEM_MINUTES


def test_answered_right_it_waits_three_days():
    rows = [attempt(days_ago=2), attempt(days_ago=1, right=True)]
    found = rv.queue(rows, [], [], TODAY, library=LIBRARY, nodes=NODES)
    assert found['due'] == []
    [item] = found['later']
    assert item['due'] == (d(1) + timedelta(days=3)).isoformat()
    assert item['line'] == 'Next one in 2 days.'
    assert found['next_due'] == item['due']


def test_most_overdue_comes_first():
    rows = [attempt(slot=3, days_ago=1), attempt(slot=4, days_ago=6)]
    found = rv.queue(rows, [], [], TODAY, library=LIBRARY, nodes=NODES)
    assert [item['slot'] for item in found['due']] == [4, 3]
    assert found['due'][0]['late'] == 5


def test_an_old_miss_nobody_came_back_to_drops_out():
    found = rv.queue([attempt(days_ago=rv.MISS_DAYS + 5)], [], [], TODAY)
    assert found['due_count'] == 0


def test_cleared_lately_is_counted():
    rows = [attempt(days_ago=30), attempt(days_ago=29, right=True), attempt(days_ago=26, right=True),
            attempt(days_ago=19, right=True), attempt(days_ago=5, right=True)]
    found = rv.queue(rows, [], [], TODAY)
    assert found['due_count'] == 0 and found['cleared_lately'] == 1


def test_a_scored_set_with_misses_comes_back():
    task = {'id': 't1', 'title': 'Quadratics #1-10', 'status': 'done', 'subject': 'maths',
            'completed_at': at(1), 'score_got': 6, 'score_of': 10}
    found = rv.queue([], [task], [], TODAY, name_of=lambda key: 'Math')
    [item] = found['due']
    assert (item['kind'], item['key'], item['missed'], item['where']) == ('set', 't:t1', 4, 'Math')
    assert item['minutes'] == 12


def test_a_full_score_is_not_a_miss():
    task = {'id': 't1', 'title': 'Set', 'status': 'done', 'completed_at': at(1), 'score_got': 10, 'score_of': 10}
    assert rv.queue([], [task], [], TODAY)['due_count'] == 0


def test_a_mark_moves_a_set_up():
    task = {'id': 't1', 'title': 'Set', 'status': 'done', 'completed_at': at(3), 'score_got': 6, 'score_of': 10}
    marks = [{'item': 't:t1', 'result': 'right', 'at': at(1)}]
    found = rv.queue([], [task], marks, TODAY)
    assert found['due_count'] == 0
    assert found['later'][0]['rung'] == 1


def test_a_logged_batch_with_misses_brings_the_step_back():
    rows = [attempt(source='log', slot=None, attempted=10, correct=6, days_ago=2)]
    found = rv.queue(rows, [], [], TODAY, library=LIBRARY, nodes=NODES)
    [item] = found['due']
    assert (item['kind'], item['key']) == ('step', 's:m.quadratics#2')
    # Its problems come with it, so it can be reviewed by answering some.
    assert [one['slot'] for one in item['problems']] == [3, 4]


def test_a_good_day_on_the_step_moves_it_up():
    rows = [attempt(source='log', slot=None, attempted=10, correct=6, days_ago=4),
            attempt(source='log', slot=None, attempted=5, correct=5, days_ago=2)]
    found = rv.queue(rows, [], [], TODAY)
    assert found['due_count'] == 0 and found['later'][0]['rung'] == 1


def test_marks_are_only_for_sets_and_steps():
    assert rv.clean_mark({'item': 't:9', 'result': 'right'})[0] == {'item': 't:9', 'result': 'right'}
    assert rv.clean_mark({'item': 'p:m.x#1#1', 'result': 'right'})[1]
    assert rv.clean_mark({'item': 't:9', 'result': 'maybe'})[1]


# ---- The endpoints ---------------------------------------------------------------
def test_get_reads_the_queue(client):
    yesterday = (datetime.now() - timedelta(days=1)).isoformat(timespec='seconds')
    db.insert_row('skill_attempts', {'id': 'a1', 'user_id': 'tester', 'node_id': 'm.quadratics', 'ordinal': 2,
                                     'slot': 3, 'weight': 'core', 'attempted': 1, 'correct': 0,
                                     'source': 'problem', 'at': yesterday})
    reply = client.get('/api/review_queue').json()
    assert reply['success']
    assert reply['due_count'] == 1
    assert reply['due'][0]['key'] == 'p:m.quadratics#2#3'


def test_answering_it_right_through_skill_attempts_moves_it_on(client):
    yesterday = (datetime.now() - timedelta(days=1)).isoformat(timespec='seconds')
    db.insert_row('skill_attempts', {'id': 'a1', 'user_id': 'tester', 'node_id': 'm.quadratics', 'ordinal': 2,
                                     'slot': 3, 'weight': 'core', 'attempted': 1, 'correct': 0,
                                     'source': 'problem', 'at': yesterday})
    client.post('/api/skill-attempts', json={'node_id': 'm.quadratics', 'ordinal': 2, 'slot': 3,
                                             'weight': 'core', 'attempted': 1, 'correct': 1})
    reply = client.get('/api/review_queue').json()
    assert reply['due_count'] == 0
    assert reply['later'][0]['rung'] == 1


def _scored_set(client, got=6, of=10):
    task_id = client.post('/api/tasks', json={'name': 'Quadratics #1-10', 'xp_reward': 20}).json()['task_id']
    client.post('/api/complete_tasks', json={'task_ids': [task_id]})
    client.post('/api/rate_task', json={'task_id': task_id, 'score_got': got, 'score_of': of})
    return task_id


def test_a_scored_set_is_marked_from_the_queue(client):
    task_id = _scored_set(client)
    # Missed today, so it's due tomorrow: on the list, not due yet.
    reply = client.get('/api/review_queue').json()
    assert reply['later_count'] == 1
    reply = client.post('/api/review_queue/mark', json={'item': 't:{}'.format(task_id), 'result': 'missed'}).json()
    assert reply['success']
    assert db.rows_for('review_marks', 'tester')[0]['result'] == 'missed'


def test_a_mark_for_something_not_on_the_list_is_refused(client):
    reply = client.post('/api/review_queue/mark', json={'item': 't:nope', 'result': 'right'}).json()
    assert not reply['success']
    assert db.rows_for('review_marks', 'tester') == []


# ---- The plan's row -------------------------------------------------------------
from backend.tracking.next_actions import build_plan  # noqa: E402

NOW = datetime(2026, 10, 20, 9, 0)


def plan_row(review, tasks=()):
    plan = build_plan(list(tasks), [], [], lambda key: key, 120, now=NOW, review=review)
    return next((item for item in plan['actions'] + plan['more'] if item['kind'] == 'misses'), None)


def test_the_plan_leads_with_what_is_due():
    rows = [attempt(slot=3, days_ago=1), attempt(slot=4, days_ago=6)]
    row = plan_row(rv.queue(rows, [], [], TODAY, library=LIBRARY, nodes=NODES))
    assert row['id'] == 'review-due'
    assert row['title'] == 'Redo 2 problems you missed'
    assert row['because'] == ('All from Quadratics. The oldest has waited 5 days. Each one comes back '
                              'after 1, 3, 7 and 14 days until you get it right.')
    assert row['to'] == '/recommendations#review'


def test_one_set_names_it():
    task = {'id': 't1', 'title': 'Quadratics #1-10', 'status': 'done', 'subject': 'maths',
            'completed_at': at(1), 'score_got': 6, 'score_of': 10}
    row = plan_row(rv.queue([], [task], [], TODAY, name_of=lambda key: 'Math'), [task])
    assert row['title'] == 'Redo the 4 you missed in "Quadratics #1-10"'
    assert row['subject'] == 'maths'


def test_nothing_due_means_no_row():
    rows = [attempt(days_ago=2), attempt(days_ago=1, right=True)]
    assert plan_row(rv.queue(rows, [], [], TODAY)) is None
