"""Step fourteen of the goal matcher: slow work runs in the background, bounded.

The queue itself — few workers, each job once, a cap on what waits — and the
work that goes through it when a goal changes: the tasks it could affect are
marked in one UPDATE and matched off the request, a slice at a time.
"""
import threading
import time

from backend.database import connection as db
from backend.goal_matcher import service, store
from backend.goal_matcher.queue import WorkQueue, work


# ---------------------------------------------------------------------------
# The queue
# ---------------------------------------------------------------------------
def test_no_threads_until_there_is_work():
    queue = WorkQueue()
    assert queue._threads == []
    queue.submit('a', lambda: None)
    assert queue.wait_idle()
    assert 0 < len(queue._threads) <= queue.workers


def test_never_more_than_the_workers_at_once():
    queue = WorkQueue(workers=3)
    live, most, lock = [0], [0], threading.Lock()

    def job():
        with lock:
            live[0] += 1
            most[0] = max(most[0], live[0])
        time.sleep(0.02)
        with lock:
            live[0] -= 1

    for at in range(20):
        queue.submit(at, job)
    assert queue.wait_idle()
    assert most[0] == 3


def test_a_key_already_waiting_is_not_queued_twice():
    queue = WorkQueue(workers=1)
    gate, ran = threading.Event(), []
    queue.submit('blocker', gate.wait)
    for _ in range(5):
        queue.submit('job', lambda: ran.append(1))
    gate.set()
    assert queue.wait_idle()
    assert ran == [1]


def test_a_key_submitted_while_running_runs_once_more_not_once_per_submit():
    queue = WorkQueue(workers=1)
    started, gate, ran = threading.Event(), threading.Event(), []

    def slow():
        ran.append('run')
        started.set()
        gate.wait()

    queue.submit('job', slow)
    started.wait()
    for _ in range(5):
        queue.submit('job', lambda: ran.append('again'))
    gate.set()
    assert queue.wait_idle()
    assert ran == ['run', 'again']


def test_the_waiting_line_is_capped_and_says_so():
    queue = WorkQueue(workers=1, max_waiting=2)
    gate = threading.Event()
    queue.submit('blocker', gate.wait)
    time.sleep(0.05)
    assert queue.submit('a', lambda: None) and queue.submit('b', lambda: None)
    assert queue.submit('c', lambda: None) is False
    assert queue.refused == 1
    gate.set()
    assert queue.wait_idle()


def test_a_failing_job_does_not_take_the_worker_with_it():
    queue = WorkQueue(workers=1)
    ran = []
    queue.submit('bad', lambda: 1 / 0)
    queue.submit('good', lambda: ran.append(1))
    assert queue.wait_idle()
    assert ran == [1]


# ---------------------------------------------------------------------------
# Goal changes, through it
# ---------------------------------------------------------------------------
def add_goal(client, title, subjects='', **extra):
    reply = client.post('/api/add_goal', json={
        'title': title, 'measure': 'milestones', 'subject_ids': subjects, **extra}).json()
    assert reply['success'], reply
    return reply['id']


def add_task(client, name, subject=None):
    body = {'name': name, 'xp_reward': 5, **({'subject': subject} if subject else {})}
    return client.post('/api/tasks', json=body).json()['task_id']


def goals_of(task_id):
    mapping = store.mapping_for('tester', task_id)
    return mapping.goal_ids if mapping else None


def version_of(task_id):
    return db.find_row('tasks', task_id, user_id='tester')['goal_match_version']


def test_a_new_goal_picks_up_existing_work_in_the_background(client, monkeypatch):
    lesson = add_task(client, 'Violin lesson', 'music')
    assert goals_of(lesson) == ()
    threads = []
    real = service.classify_task
    monkeypatch.setattr(service, 'classify_task',
                        lambda index, task: threads.append(threading.current_thread().name) or real(index, task))

    violin = add_goal(client, 'Violin ARCT', 'music')
    work.wait_idle()

    assert goals_of(lesson) == (violin,)
    # Matched on a worker, not inside the request that created the goal.
    assert threads and all(name.startswith('goal-matcher') for name in threads)


def test_refiling_a_goal_under_the_right_subject_matches_its_work(client):
    """The AIME case from the dev database: filed under computer_science while
    every AIME task is under mathematics."""
    aime = add_goal(client, 'Reach AIME', 'computer_science')
    tasks = [add_task(client, title, 'mathematics')
             for title in ('AIME problem set', 'AIME mock', 'Integration drills')]
    work.wait_idle()
    assert [goals_of(t) for t in tasks] == [(), (), ()]

    client.post('/api/update_goal', json={'id': aime, 'subject_ids': 'mathematics'})
    work.wait_idle()

    assert [goals_of(t) for t in tasks] == [(aime,), (aime,), ()]


def test_an_edit_the_match_does_not_read_marks_nothing(client):
    add_goal(client, 'Violin ARCT', 'music')
    goal = add_goal(client, 'Spring recital', 'music')
    task = add_task(client, 'Violin lesson', 'music')
    work.wait_idle()

    client.post('/api/update_goal', json={'id': goal, 'deadline': '2027-06-01', 'why': 'Because'})

    assert version_of(task) > 0
    assert work.pending() == 0


def test_only_the_goals_subjects_are_marked(client):
    goal = add_goal(client, 'Violin ARCT', 'music')
    music = add_task(client, 'Violin lesson', 'music')
    chemistry = add_task(client, 'Titration lab', 'chemistry')
    nothing = add_task(client, 'Violin, unfiled')
    work.wait_idle()

    marked = service.goal_changed('tester', {'id': goal, 'title': 'Violin ARCT', 'subject_ids': 'music',
                                             'measure': 'milestones', 'status': 'active'},
                                  {'id': goal, 'title': 'Violin ARCT exam', 'subject_ids': 'music',
                                   'measure': 'milestones', 'status': 'active'})
    # The music task, and the one filed nowhere (compared with every goal).
    assert marked == 2
    work.wait_idle()
    assert version_of(chemistry) > 0


def test_a_cross_subject_goal_reaches_every_subject(client):
    tasks = [add_task(client, 'USACO training', subject) for subject in ('computer_science', 'mathematics')]
    usaco = add_goal(client, 'Reach USACO Gold')
    work.wait_idle()
    assert [goals_of(t) for t in tasks] == [(usaco,), (usaco,)]


def test_completing_a_goal_keeps_the_work_already_counted_toward_it(client):
    violin = add_goal(client, 'Violin ARCT', 'music')
    task = add_task(client, 'Violin lesson', 'music')

    client.post('/api/update_goal', json={'id': violin, 'status': 'completed'})
    work.wait_idle()

    assert goals_of(task) == (violin,)


def test_deleting_a_goal_rematches_the_work_that_was_toward_it(client):
    usaco = add_goal(client, 'Reach USACO Gold', 'computer_science')
    temp = add_goal(client, '[temp] Reach USACO Gold', 'computer_science')
    task = add_task(client, 'USACO Gold training', 'computer_science')
    assert set(goals_of(task)) == {usaco, temp}

    client.post('/api/delete_goal', json={'goal_id': usaco})
    work.wait_idle()

    assert goals_of(task) == (temp,)
    assert store.mapping_for('tester', task).status == 'matched'


def test_renaming_a_checkpoint_changes_what_it_matches(client):
    goal = add_goal(client, 'Reach USACO Gold', 'computer_science', milestones=['Master DP'])
    task = add_task(client, 'Graph theory', 'computer_science')
    work.wait_idle()
    stone = db.rows_for('goal_milestones', 'tester')[0]['id']
    assert store.mapping_for('tester', task).status == 'unmatched'

    client.post('/api/update_milestone', json={'id': stone, 'title': 'Gold graph theory solid'})
    work.wait_idle()

    assert store.mapping_for('tester', task).status in ('matched', 'ambiguous')
    # Ticking it off is not a change to what it matches.
    client.post('/api/update_milestone', json={'id': stone, 'status': 'done'})
    assert work.pending() == 0


def test_a_counter_goal_changing_touches_no_tasks(client):
    task = add_task(client, 'Anything')
    reply = client.post('/api/add_goal', json={'title': 'Earn XP', 'goal_type': 'xp', 'target_xp': 10}).json()
    client.post('/api/update_goal', json={'id': reply['id'], 'title': 'Earn lots of XP'})
    assert work.pending() == 0
    assert version_of(task) > 0


def test_a_full_queue_loses_nothing_the_next_catch_up_finds_it(client, monkeypatch):
    task = add_task(client, 'Violin lesson', 'music')
    # Scoped: the fixtures use this same monkeypatch for the test database,
    # so a blanket undo() would point everything below at another file.
    with monkeypatch.context() as patch:
        patch.setattr(work, 'submit', lambda key, job: False)
        add_goal(client, 'Violin ARCT', 'music')

    # Marked stale, but nothing ran: the queue refused it.
    assert store.stale_count('tester') == 1
    service.catch_up('tester')
    assert store.stale_count('tester') == 0 and goals_of(task)


def test_many_goal_edits_at_once_are_one_catch_up(client, monkeypatch):
    goal = add_goal(client, 'Violin ARCT', 'music')
    for i in range(10):
        add_task(client, 'Violin lesson {}'.format(i), 'music')
    work.wait_idle()
    runs = []
    real = service.catch_up
    gate = threading.Event()
    monkeypatch.setattr(service, 'catch_up', lambda user, **kw: (gate.wait(5), runs.append(user), real(user)))

    for i in range(8):
        client.post('/api/update_goal', json={'id': goal, 'title': 'Violin ARCT {}'.format(i)})
    gate.set()
    work.wait_idle()

    # One running when the edits began, at most one more for everything after.
    assert 1 <= len(runs) <= 2
