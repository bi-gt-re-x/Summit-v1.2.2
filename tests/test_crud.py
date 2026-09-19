"""Create it, change it, read it back, delete it — for each thing the app owns.

Not exhaustive coverage of every endpoint; a round trip through each resource,
asserting on the database rather than on the reply, so a handler that answers
`{"success": true}` without writing anything cannot pass. These are the tests
the goals and milestone refactor leans on.
"""
from backend.api.settings import ANALYTICS_SUBJECTS_MAX, SUBJECT_GOALS_MAX
from backend.database import connection as db


# --------------------------------------------------------------------------
# Tasks
# --------------------------------------------------------------------------
def test_task_round_trip(client):
    made = client.post('/api/tasks', json={
        'name': 'write the tests', 'priority': 'high', 'xp_reward': 20,
        'due_date': '2026-12-31T23:59:00',
    }).json()
    assert made['success']
    task_id = made['task_id']

    row = db.find_row('tasks', task_id, user_id='tester')
    assert (row['title'], row['priority'], row['xp_value']) == ('write the tests', 'high', 20)

    client.put('/api/tasks/%s' % task_id, json={'name': 'renamed', 'priority': 'low'})
    row = db.find_row('tasks', task_id, user_id='tester')
    assert (row['title'], row['priority']) == ('renamed', 'low')

    assert client.delete('/api/tasks/%s' % task_id).json()['success']
    assert db.find_row('tasks', task_id) is None


def test_completing_a_task_records_the_timing(client):
    """`completion_seconds` and `met_deadline` are what efficiency reads."""
    made = client.post('/api/tasks', json={
        'name': 'on time', 'xp_reward': 5, 'due_date': '2099-01-01T00:00:00',
    }).json()
    client.post('/api/complete_task', json={'task_id': made['task_id']})

    row = db.find_row('tasks', made['task_id'], user_id='tester')
    assert row['status'] == 'done'
    assert row['completed_at']
    assert row['met_deadline'] is True
    assert row['completion_seconds'] >= 0


def test_rating_a_task_stores_both_answers(client, task):
    client.post('/api/complete_task', json={'task_id': task})
    client.post('/api/rate_task', json={'task_id': task, 'difficulty': 4, 'execution': 2})
    row = db.find_row('tasks', task, user_id='tester')
    assert (row['difficulty'], row['execution']) == (4, 2)


def test_an_unrated_task_is_absent_rather_than_zero(client, task):
    """A zero would be a rating. The scores must not see one."""
    row = db.find_row('tasks', task, user_id='tester')
    assert 'difficulty' not in row and 'execution' not in row


# --------------------------------------------------------------------------
# Notes
# --------------------------------------------------------------------------
def test_note_round_trip(client):
    made = client.post('/api/notes/save',
                       json={'title': 'first', 'body': 'hello'}).json()
    assert made['success']
    note_id = made['note']['id']
    assert db.find_row('notes', note_id, user_id='tester')['title'] == 'first'

    client.post('/api/notes/save',
                json={'id': note_id, 'title': 'second', 'body': 'changed'})
    row = db.find_row('notes', note_id, user_id='tester')
    assert (row['title'], row['body']) == ('second', 'changed')

    assert client.post('/api/notes/delete', json={'id': note_id}).json()['success']
    assert db.find_row('notes', note_id) is None


def test_editing_a_note_that_is_gone_does_not_create_one(client):
    """A failed edit must not silently become a new note."""
    reply = client.post('/api/notes/save',
                        json={'id': 'no-such-note', 'title': 'x', 'body': 'y'}).json()
    assert reply['success'] is False
    assert db.rows_for('notes', 'tester') == []


# --------------------------------------------------------------------------
# Records
# --------------------------------------------------------------------------
def test_record_round_trip(client):
    made = client.post('/api/records/save', json={
        'name': 'AMC 8', 'kind': 'record', 'value': 18, 'unit': 'pts',
    }).json()
    assert made['success']
    record_id = made['record']['id']
    assert db.find_row('records', record_id, user_id='tester')['value'] == 18

    client.post('/api/records/save', json={
        'id': record_id, 'name': 'AMC 8', 'kind': 'record', 'value': 25, 'unit': 'pts',
    })
    assert db.find_row('records', record_id, user_id='tester')['value'] == 25

    assert client.post('/api/records/delete', json={'id': record_id}).json()['success']
    assert db.find_row('records', record_id) is None


# --------------------------------------------------------------------------
# Goals and their checkpoints
# --------------------------------------------------------------------------
def make_goal(client, title='ship it', target=100):
    reply = client.post('/api/add_goal', json={
        'title': title, 'goal_type': 'xp', 'target_xp': target,
    }).json()
    assert reply['success'], reply
    return db.rows_for('goals', 'tester')[-1]['id']


def test_goal_round_trip(client):
    goal_id = make_goal(client)
    assert db.find_row('goals', goal_id, user_id='tester')['title'] == 'ship it'

    client.post('/api/update_goal', json={'id': goal_id, 'title': 'ship it properly'})
    assert db.find_row('goals', goal_id, user_id='tester')['title'] == 'ship it properly'

    assert client.post('/api/delete_goal', json={'goal_id': goal_id}).json()['success']
    assert db.find_row('goals', goal_id) is None


def test_a_goal_keeps_the_chart_it_was_given(client):
    reply = client.post('/api/add_goal', json={
        'title': 'chart me', 'goal_type': 'xp', 'target_xp': 10, 'chart': 'step',
    }).json()
    assert db.find_row('goals', reply['id'], user_id='tester')['chart'] == 'step'

    client.post('/api/update_goal', json={'id': reply['id'], 'chart': 'heatmap'})
    assert db.find_row('goals', reply['id'], user_id='tester')['chart'] == 'heatmap'

    # Anything off the list reads as "let the page pick" rather than an error.
    client.post('/api/update_goal', json={'id': reply['id'], 'chart': 'pie'})
    assert db.find_row('goals', reply['id'], user_id='tester')['chart'] == ''


def test_goal_progress_is_capped_at_its_target(client):
    goal_id = make_goal(client, target=100)
    reply = client.post('/api/update_goal_progress',
                        json={'goal_id': goal_id, 'xp_to_add': 250}).json()
    assert reply['success']
    assert reply['current'] == 100
    assert reply['status'] == 'completed'


def test_milestones_round_trip_and_keep_their_order(client):
    goal_id = make_goal(client)
    for title in ('first', 'second', 'third'):
        assert client.post('/api/add_milestone',
                           json={'goal_id': goal_id, 'title': title}).json()['success']

    stones = sorted(db.rows_for('goal_milestones', 'tester'),
                    key=lambda r: r.get('position', 0))
    assert [s['title'] for s in stones] == ['first', 'second', 'third']
    assert [s.get('position', 0) for s in stones] == [0, 1, 2]

    middle = stones[1]['id']
    assert client.post('/api/delete_milestone', json={'id': middle}).json()['success']

    left = sorted(db.rows_for('goal_milestones', 'tester'),
                  key=lambda r: r.get('position', 0))
    assert [s['title'] for s in left] == ['first', 'third']
    # The gap is closed rather than left as 0, 2.
    assert [s.get('position', 0) for s in left] == [0, 1]


def test_deleting_a_goal_unlinks_its_tasks_without_deleting_them(client):
    """A task done for a goal was still done. It loses the link, not itself."""
    goal_id = make_goal(client)
    made = client.post('/api/tasks', json={
        'name': 'toward the goal', 'xp_reward': 5, 'goal_id': goal_id,
    }).json()
    assert db.find_row('tasks', made['task_id'], user_id='tester')['goal_id'] == goal_id

    client.post('/api/delete_goal', json={'goal_id': goal_id})
    row = db.find_row('tasks', made['task_id'], user_id='tester')
    assert row is not None
    assert 'goal_id' not in row or row['goal_id'] is None


def test_deleting_a_milestone_unlinks_its_tasks(client):
    goal_id = make_goal(client)
    client.post('/api/add_milestone', json={'goal_id': goal_id, 'title': 'step one'})
    stone_id = db.rows_for('goal_milestones', 'tester')[0]['id']
    made = client.post('/api/tasks', json={
        'name': 'toward the step', 'xp_reward': 5,
        'goal_id': goal_id, 'milestone_id': stone_id,
    }).json()

    client.post('/api/delete_milestone', json={'id': stone_id})
    row = db.find_row('tasks', made['task_id'], user_id='tester')
    assert row is not None
    assert 'milestone_id' not in row or row['milestone_id'] is None


# --------------------------------------------------------------------------
# Calendar
# --------------------------------------------------------------------------
def test_calendar_event_belongs_to_the_account_that_made_it(client, stranger):
    """The leak: `create_event` never wrote user_id and nothing filtered on it."""
    made = client.post('/api/create_calendar_event', json={
        'name': 'study block', 'date': '2026-09-01', 'time_block': 'Morning',
    }).json()
    assert made['success']
    assert db.find_row('calendar_events', made['entry_id'])['user_id'] == 'tester'

    assert client.get('/api/get_custom_events').json()['events']
    assert stranger.get('/api/get_custom_events').json()['events'] == []

    # And the stranger cannot delete it.
    assert stranger.delete('/api/delete_calendar_event/%s'
                           % made['entry_id']).json()['success'] is False
    assert db.find_row('calendar_events', made['entry_id']) is not None


def test_calendar_entry_round_trip(client, task):
    made = client.post('/api/calendar', json={
        'date': '2026-09-01', 'time_block': 'Morning', 'task_id': task,
    }).json()
    assert made['success']
    entries = db.rows_for('calendar_entries', 'tester')
    assert len(entries) == 1

    entry_id = entries[0]['id']
    client.put('/api/calendar/%s' % entry_id, json={'time_block': 'Evening'})
    assert db.find_row('calendar_entries', entry_id)['time_block'] == 'Evening'

    client.delete('/api/calendar/%s' % entry_id)
    assert db.rows_for('calendar_entries', 'tester') == []


# --------------------------------------------------------------------------
# Focus
# --------------------------------------------------------------------------
def test_a_focus_day_is_never_lowered_by_a_stale_client(client):
    """An old tab must not shrink a day already recorded."""
    client.post('/api/focus_sync', json={'date': '2026-08-01', 'focused_seconds': 3600,
                                         'goal_hours': 2})
    client.post('/api/focus_sync', json={'date': '2026-08-01', 'focused_seconds': 60,
                                         'goal_hours': 2})
    row = db.find_row('focus_days', '2026-08-01', user_id='tester', key='date')
    assert row['seconds'] == 3600


def test_the_catch_up_stamp_takes_a_date_and_refuses_anything_else(client):
    """`catchup_seen_on` is state, and the only preference here holding a date.

    Empty is a real answer — an account the prompt has never met — so the
    validator has to let it through while still rejecting junk. Nothing else in
    FIELDS had that shape, which is why it is worth a test of its own.
    """
    client.post('/api/settings', json={'values': {'catchup_seen_on': '2026-08-28'}})
    assert client.get('/api/settings').json()['settings']['catchup_seen_on'] == '2026-08-28'

    # Refused, and the stored answer is left alone rather than cleared.
    client.post('/api/settings', json={'values': {'catchup_seen_on': 'last tuesday'}})
    assert client.get('/api/settings').json()['settings']['catchup_seen_on'] == '2026-08-28'

    client.post('/api/settings', json={'values': {'catchup_seen_on': ''}})
    assert client.get('/api/settings').json()['settings']['catchup_seen_on'] == ''


def test_the_followed_subjects_are_a_list_and_are_bounded(client):
    """`analytics_subjects` is the only preference here holding a set.

    Everything else in FIELDS is one value, so this is the one validator whose
    job is to say what a *list* is allowed to be. Three rules, and each is a
    thing the rail would otherwise show the reader:

    - the order is kept, because it is the reader's own and the menu is drawn
      in it;
    - duplicates go, because a menu with the same row twice is a visible bug;
    - past the cap it is truncated rather than refused, the same way `_whole`
      clamps — a client that sent five meant "these".
    """
    settings = lambda: client.get('/api/settings').json()['settings']

    # Absent is empty, not missing. An account that named none gets the single
    # Analytics entry it has always had.
    assert settings()['analytics_subjects'] == []

    client.post('/api/settings', json={'values': {
        'analytics_subjects': ['physics', 'maths', 'physics'],
    }})
    assert settings()['analytics_subjects'] == ['physics', 'maths']

    # Five picked, four stored, and the four are the first four.
    client.post('/api/settings', json={'values': {
        'analytics_subjects': ['a', 'b', 'c', 'd', 'e'],
    }})
    assert settings()['analytics_subjects'] == ['a', 'b', 'c', 'd']

    # A string where a list belongs is a bug in the client rather than an
    # over-eager reader, so it is refused and the stored answer is left alone.
    assert client.post('/api/settings', json={
        'values': {'analytics_subjects': 'maths'},
    }).status_code == 400
    assert settings()['analytics_subjects'] == ['a', 'b', 'c', 'd']

    # Emptying it is a real answer and has to be possible: it is how a reader
    # puts the Analytics entry back to a single link.
    client.post('/api/settings', json={'values': {'analytics_subjects': []}})
    assert settings()['analytics_subjects'] == []


def test_the_subject_depth_map_is_bounded_and_refuses_the_wrong_shape(client):
    """`analytics_subject_depth` says which branch a subject opens on.

    The first of the id-to-id maps, and the one `_id_map` was written for —
    `analytics_subject_goal` below reuses it, so the rules proved here are the
    rules that one inherits.

    It says which branch of a followed subject's skill tree that subject opens
    on. Absence is the answer for most subjects and means "the whole thing", so
    an empty value is stored as absence rather than as an empty string — the
    page falls back to the subject's own root either way, and a key mapping to
    nothing would be a stored answer that means the default.
    """
    settings = lambda: client.get('/api/settings').json()['settings']

    assert settings()['analytics_subject_depth'] == {}

    client.post('/api/settings', json={'values': {
        'analytics_subject_depth': {'maths': 'algebra', 'coding': ''},
    }})
    # The empty one is dropped, not stored as ''.
    assert settings()['analytics_subject_depth'] == {'maths': 'algebra'}

    # Capped at the number of subjects that can be followed in the first place.
    client.post('/api/settings', json={'values': {
        'analytics_subject_depth': {
            'a': 't', 'b': 't', 'c': 't', 'd': 't', 'e': 't', 'f': 't',
        },
    }})
    assert len(settings()['analytics_subject_depth']) == 4

    # A list where a map belongs is a client bug, refused rather than coerced.
    assert client.post('/api/settings', json={
        'values': {'analytics_subject_depth': ['maths']},
    }).status_code == 400

    # As is a value that is not a string.
    assert client.post('/api/settings', json={
        'values': {'analytics_subject_depth': {'maths': 3}},
    }).status_code == 400


def test_the_subject_goal_map_is_bounded_and_refuses_the_wrong_shape(client):
    """`analytics_subject_goal` records which goal a subject page is about.

    The same validator as the depth map above, on a wider cap, and the width is
    the thing worth stating: a subject page opens for any subject in the
    catalogue rather than only the four in the rail, so a connection made from
    a subject that was later unfollowed is a connection somebody still meant.
    Capping this at the follow list would delete it.
    """
    settings = lambda: client.get('/api/settings').json()['settings']

    assert settings()['analytics_subject_goal'] == {}

    client.post('/api/settings', json={'values': {
        'analytics_subject_goal': {'maths': 'goal-7', 'coding': ''},
    }})
    # The empty one is a disconnection, stored as absence rather than as ''.
    assert settings()['analytics_subject_goal'] == {'maths': 'goal-7'}

    # One goal per subject by construction: the second connection replaces the
    # first rather than joining it, because a subject page reading two goals
    # would be two answers to what the subject is for.
    client.post('/api/settings', json={'values': {
        'analytics_subject_goal': {'maths': 'goal-9'},
    }})
    assert settings()['analytics_subject_goal'] == {'maths': 'goal-9'}

    # Wider than the follow list, and wide enough that the whole catalogue
    # could not overflow it in one save.
    assert SUBJECT_GOALS_MAX > ANALYTICS_SUBJECTS_MAX
    client.post('/api/settings', json={'values': {
        'analytics_subject_goal': {
            f'subject-{n}': f'goal-{n}' for n in range(SUBJECT_GOALS_MAX + 5)
        },
    }})
    assert len(settings()['analytics_subject_goal']) == SUBJECT_GOALS_MAX

    # A list where a map belongs, and a value that is not a string: both are
    # client bugs, refused rather than coerced.
    assert client.post('/api/settings', json={
        'values': {'analytics_subject_goal': ['maths']},
    }).status_code == 400
    assert client.post('/api/settings', json={
        'values': {'analytics_subject_goal': {'maths': 7}},
    }).status_code == 400


def test_a_connected_goal_outlives_the_subject_being_unfollowed(client):
    """Nothing joins this map to the follow list, and that is deliberate.

    Unfollowing a subject takes it out of the rail; it does not mean the reader
    has changed their mind about which goal that subject is about. They follow
    it again a fortnight later and the connection is still there — which is
    only true while the validator refuses to cross-check the two answers.
    """
    client.post('/api/settings', json={'values': {
        'analytics_subjects': ['maths'],
        'analytics_subject_goal': {'maths': 'goal-7'},
    }})

    client.post('/api/settings', json={'values': {'analytics_subjects': []}})
    settings = client.get('/api/settings').json()['settings']
    assert settings['analytics_subjects'] == []
    assert settings['analytics_subject_goal'] == {'maths': 'goal-7'}


def test_a_default_is_not_shared_between_accounts(client, stranger):
    """The list and map defaults in FIELDS are module-level objects.

    Handed out rather than copied, one account's mutation would be everybody's
    — and the two accounts here would come back holding the same list.
    """
    mine = client.get('/api/settings').json()['settings']['analytics_subjects']
    theirs = stranger.get('/api/settings').json()['settings']['analytics_subjects']

    assert mine == [] and theirs == []
    mine.append('maths')
    # The other account's answer is untouched, and so is the next read of mine.
    assert stranger.get('/api/settings').json()['settings']['analytics_subjects'] == []
    assert client.get('/api/settings').json()['settings']['analytics_subjects'] == []


def test_hand_entered_focus_adds_to_the_day_rather_than_replacing_it(client):
    """The catch-up prompt is a person, not a mirror.

    `focus_sync` takes the larger of the two values because a stale tab must
    not be able to shrink a day. That rule is wrong for somebody typing "I did
    two hours on Tuesday" into the dashboard: a Tuesday holding twenty tracked
    minutes plus two typed hours is two hours twenty, and under the max rule it
    would silently be two.
    """
    client.post('/api/focus_sync', json={'date': '2026-08-02', 'focused_seconds': 1200,
                                         'goal_hours': 2})
    client.post('/api/focus_log', json={'date': '2026-08-02', 'minutes': 120,
                                        'goal_hours': 3})

    row = db.find_row('focus_days', '2026-08-02', user_id='tester', key='date')
    assert row['seconds'] == 1200 + 120 * 60
    # And the goal the day was actually measured against is not rewritten by
    # a backfill arriving with a different default behind it.
    assert row['goal_hours'] == 2


def test_hand_entered_focus_opens_a_day_that_had_no_record(client):
    client.post('/api/focus_log', json={'date': '2026-08-03', 'minutes': 45,
                                        'goal_hours': 2.5})
    row = db.find_row('focus_days', '2026-08-03', user_id='tester', key='date')
    assert (row['seconds'], row['goal_hours']) == (2700, 2.5)


def test_hand_entered_focus_refuses_nothing_and_bounds_the_rest(client):
    """An empty answer is not a zero-second day, and a slip is not a week."""
    assert not client.post('/api/focus_log', json={'date': '2026-08-04',
                                                   'minutes': 0}).json()['success']
    assert db.find_row('focus_days', '2026-08-04', user_id='tester', key='date') is None

    client.post('/api/focus_log', json={'date': '2026-08-05', 'minutes': 99999})
    row = db.find_row('focus_days', '2026-08-05', user_id='tester', key='date')
    assert row['seconds'] == 1440 * 60


def test_day_focus_note_upserts_and_an_empty_one_deletes(client):
    client.post('/api/day_focus', json={'date': '2026-08-01', 'text': 'deep work'})
    assert db.find_row('day_focus_notes', '2026-08-01',
                       user_id='tester', key='date')['text'] == 'deep work'

    client.post('/api/day_focus', json={'date': '2026-08-01', 'text': 'changed'})
    assert db.find_row('day_focus_notes', '2026-08-01',
                       user_id='tester', key='date')['text'] == 'changed'

    client.post('/api/day_focus', json={'date': '2026-08-01', 'text': ''})
    assert db.find_row('day_focus_notes', '2026-08-01',
                       user_id='tester', key='date') is None


# --------------------------------------------------------------------------
# Subjects and the avatar — the two tables keyed on something other than `id`
# --------------------------------------------------------------------------
def test_a_custom_subject_round_trips(client):
    made = client.post('/api/subjects', json={'name': 'Olympiad Geometry'}).json()
    assert made['success'], made
    subject_id = made['subject']['id']
    assert db.find_row('user_subjects', subject_id,
                       user_id='tester', key='subject_id')['custom'] is True

    client.patch('/api/subjects/%s/color' % subject_id, json={'family': 'blue'})
    assert db.find_row('user_subjects', subject_id,
                       user_id='tester', key='subject_id')['family'] == 'blue'

    assert client.delete('/api/subjects/%s' % subject_id).json()['success']
    assert db.find_row('user_subjects', subject_id,
                       user_id='tester', key='subject_id') is None


def test_clearing_a_catalogue_subjects_colour_drops_the_row(client):
    """A row saying "this account has no opinion" is a row worth not keeping."""
    catalogue_id = client.get('/api/subjects').json()['subjects'][-1]['id']
    client.patch('/api/subjects/%s/color' % catalogue_id, json={'family': 'rose'})
    assert db.find_row('user_subjects', catalogue_id,
                       user_id='tester', key='subject_id') is not None

    client.patch('/api/subjects/%s/color' % catalogue_id, json={'family': None})
    assert db.find_row('user_subjects', catalogue_id,
                       user_id='tester', key='subject_id') is None


def test_choosing_an_avatar_replaces_the_previous_pick(client):
    """An upsert on (user_id, key) — it must not leave two rows behind."""
    first = client.post('/api/avatar', json={'avatar': 'rocket'}).json()
    assert first['success'], first
    client.post('/api/avatar', json={'avatar': 'penguin'})

    rows = [r for r in db.rows_for('user_settings', 'tester') if r['key'] == 'avatar']
    assert len(rows) == 1
    assert client.get('/api/auth/verify_status').json()['avatar'].endswith('/penguin.svg')


# --------------------------------------------------------------------------
# Drafting a plan with the model
# --------------------------------------------------------------------------
# The model itself is never called here. `planner.suggest_steps` is the seam:
# these prove the endpoint reads the right rows, hands the planner what it
# needs and turns a refusal into a sentence — which is all of it that is ours.
def test_adding_a_checkpoint_hands_back_its_id(client):
    """The caller's next move is to draft a checklist onto the row it made.

    Finding it again by title is a guess the moment two checkpoints are named
    the same thing, which is why this returns an id the way add_goal does.
    """
    goal = client.post('/api/add_goal', json={'title': 'Reach USACO Gold', 'target_xp': 500}).json()
    made = client.post('/api/add_milestone',
                       json={'goal_id': goal['id'], 'title': 'Silver DP unassisted'}).json()

    assert made['success']
    assert made['id']
    stones = client.get('/api/get_goals').json()['goals'][0]['milestones']
    assert [s['id'] for s in stones] == [made['id']]


def test_a_checkpoint_is_broken_down_against_the_goal_it_sits_under(client, monkeypatch):
    """A six-word checkpoint title alone is frequently not enough to plan.

    "Silver DP unassisted" is a different checklist under a coding goal than
    under one about teaching, so the goal's own words go to the planner
    alongside the checkpoint's.
    """
    from backend.tracking import planner

    seen = {}

    # `**_` for the date and the neighbouring checkpoints, which the endpoint
    # passes too — tests/test_goal_ai.py is where those are checked.
    def fake(milestone, goal='', why='', description='', category='', unit='', target='',
             **_):
        seen.update(milestone=milestone, goal=goal, why=why, category=category)
        return ['Read the chapter', 'Do ten problems', 'Redo the failures',
                'Time a contest', 'Review the editorial']

    monkeypatch.setattr(planner, 'suggest_steps', fake)

    goal = client.post('/api/add_goal', json={
        'title': 'Reach USACO Gold', 'target_xp': 500,
        'why': 'College applications', 'category': 'coding'}).json()
    made = client.post('/api/add_milestone',
                       json={'goal_id': goal['id'], 'title': 'Silver DP unassisted'}).json()

    out = client.post('/api/suggest_steps', json={'milestone_id': made['id']}).json()

    assert out['success']
    assert len(out['steps']) == 5
    assert seen['milestone'] == 'Silver DP unassisted'
    assert seen['goal'] == 'Reach USACO Gold'
    assert seen['why'] == 'College applications'
    assert seen['category'] == 'coding'


def test_a_checklist_that_cannot_be_drafted_is_a_sentence_not_a_500(client, monkeypatch):
    """The page shows this on the checkpoint. A failure to plan is not a broken
    request — the checkpoint keeps the empty rows it was seeded with."""
    from backend.tracking import planner

    def fake(*args, **kwargs):
        raise planner.PlannerUnavailable('No key configured.')

    monkeypatch.setattr(planner, 'suggest_steps', fake)

    goal = client.post('/api/add_goal', json={'title': 'Reach USACO Gold', 'target_xp': 500}).json()
    made = client.post('/api/add_milestone',
                       json={'goal_id': goal['id'], 'title': 'Silver DP unassisted'}).json()

    response = client.post('/api/suggest_steps', json={'milestone_id': made['id']})

    assert response.status_code == 200
    assert not response.json()['success']
    assert 'No key configured.' in response.json()['message']


def test_breaking_down_a_checkpoint_that_is_not_yours_is_not_found(client):
    """The row is looked up scoped to the account, like every other read here."""
    out = client.post('/api/suggest_steps', json={'milestone_id': 'm999'}).json()
    assert not out['success']
    assert 'not found' in out['message'].lower()


def test_search_can_be_asked_for_open_tasks_only(client):
    """`open=1` is what the top bar's search passes, and why.

    The endpoint caps its answer, so an ordering that merely puts unfinished
    first is not enough: a word appearing in more finished tasks than the cap
    comes back with the live ones missing. What the panel does with a result is
    take the reader to it, and a finished task is not somewhere to be taken.
    """
    for index in range(3):
        made = client.post('/api/tasks', json={'name': 'audit step %d' % index}).json()
        client.post('/api/complete_task', json={'task_id': made['task_id']})
    client.post('/api/tasks', json={'name': 'audit the last step'})

    everything = client.get('/api/tasks/search', params={'q': 'audit'}).json()['tasks']
    assert len(everything) == 4

    live = client.get('/api/tasks/search',
                      params={'q': 'audit', 'open': 1}).json()['tasks']
    assert [row['title'] for row in live] == ['audit the last step']
