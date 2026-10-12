"""Every step moves a goal, and finishing one asks before it counts.

Three things pinned here. A ticked step moves a checkpoint goal's progress,
but an open checkpoint never makes the goal read 100%. A goal its own numbers
finish is flagged and waits for the reader's answer rather than quietly
counting. And the answer: yes records it once in activity_log, where the
Analytics page reads it; not yet reopens the last checkpoint.
"""
from backend.database import connection as db


def make_goal(client, stones=('One', 'Two')):
    goal_id = client.post('/api/add_goal', json={
        'title': 'Reach USACO Gold', 'measure': 'milestones', 'category': 'coding',
        'milestones': list(stones)}).json()['id']
    rows = sorted(db.rows_for('goal_milestones', 'tester'), key=lambda row: row['position'])
    return goal_id, [row['id'] for row in rows if row['goal_id'] == goal_id]


def goal(goal_id):
    return db.find_row('goals', goal_id, user_id='tester')


def steps(*done):
    return [{'id': 's%d' % n, 'title': 'Step %d' % n, 'done': flag} for n, flag in enumerate(done)]


def finish(client, stone_id):
    client.post('/api/update_milestone', json={'id': stone_id, 'status': 'done'})


def test_a_ticked_step_moves_the_goal(client):
    goal_id, (first, _) = make_goal(client)
    assert goal(goal_id)['progress'] == 0
    client.post('/api/update_milestone', json={'id': first, 'steps': steps(True, False)})
    # Half of the first of two checkpoints.
    assert goal(goal_id)['progress'] == 25


def test_an_open_checkpoint_never_reads_as_done(client):
    goal_id, (first, second) = make_goal(client)
    finish(client, first)
    client.post('/api/update_milestone', json={'id': second, 'steps': steps(True, True)})
    row = goal(goal_id)
    assert row['progress'] == 95
    assert row['status'] == 'active'


def test_finishing_by_arithmetic_asks_first(client):
    goal_id, (first, second) = make_goal(client)
    finish(client, first)
    assert not goal(goal_id).get('needs_verify')
    finish(client, second)
    row = goal(goal_id)
    assert row['status'] == 'completed'
    assert row['needs_verify'] is True
    assert client.get('/api/goals/completed').json()['goals'] == []


def test_yes_records_it_once_with_what_it_finished_on(client):
    goal_id, stones = make_goal(client)
    client.post('/api/update_milestone', json={'id': stones[0], 'steps': steps(True, True, True)})
    for stone in stones:
        finish(client, stone)

    reply = client.post('/api/goals/verify', json={'id': goal_id, 'done': True}).json()
    assert reply['success']
    assert reply['record']['checkpoints'] == 2
    assert reply['record']['steps'] == 3
    row = goal(goal_id)
    assert row['needs_verify'] is False and row['verified_at']

    client.post('/api/goals/verify', json={'id': goal_id, 'done': True})
    done = client.get('/api/goals/completed').json()['goals']
    assert len(done) == 1
    assert done[0]['goal_id'] == goal_id and done[0]['title'] == 'Reach USACO Gold'


def test_not_yet_reopens_the_last_checkpoint(client):
    goal_id, (first, second) = make_goal(client)
    finish(client, first)
    finish(client, second)
    reply = client.post('/api/goals/verify', json={'id': goal_id, 'done': False}).json()
    assert reply['reopened'] == second
    row = goal(goal_id)
    assert row['status'] == 'active' and row['needs_verify'] is False
    # Reaching it again asks again.
    finish(client, second)
    assert goal(goal_id)['needs_verify'] is True


def test_an_unreached_goal_cannot_be_confirmed(client):
    goal_id, _ = make_goal(client)
    reply = client.post('/api/goals/verify', json={'id': goal_id, 'done': True}).json()
    assert not reply['success']
    assert client.get('/api/goals/completed').json()['goals'] == []


def test_a_goal_with_no_target_is_the_readers_to_finish(client):
    goal_id = client.post('/api/add_goal', json={'title': 'Read more', 'measure': 'milestones'}).json()['id']
    assert client.post('/api/goals/verify', json={'id': goal_id, 'done': True}).json()['success']
    assert goal(goal_id)['status'] == 'completed'
    assert len(client.get('/api/goals/completed').json()['goals']) == 1


def test_someone_elses_goal_is_not_found(client, stranger):
    goal_id, _ = make_goal(client)
    assert not stranger.post('/api/goals/verify', json={'id': goal_id}).json()['success']


def test_a_padded_prompt_sent_back_is_not_a_step(client):
    """The page sends the whole checklist on every tick, padding included."""
    goal_id, (first, _) = make_goal(client)
    client.post('/api/update_milestone', json={'id': first, 'steps': [
        {'id': 's1', 'title': 'Squeeze theorem', 'done': True},
        {'id': 's2', 'title': 'Limit laws', 'done': False},
        {'id': 's3', 'title': 'Name what finishes it', 'done': False, 'placeholder': True},
    ]})
    stone = next(row for row in client.get('/api/get_goals').json()['goals'][0]['milestones'] if row['id'] == first)
    assert [step['placeholder'] for step in stone['steps']] == [False, False, True]
    assert goal(goal_id)['progress'] == 25
