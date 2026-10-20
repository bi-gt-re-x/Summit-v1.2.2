"""Skill tree plans: suggestions and a next session, from your own answers.

The rules are backend/tracking/skill_plan.py; the endpoints
backend/api/skill_plan.py.
"""
from datetime import date, datetime, timedelta

from backend.database import connection as db
from backend.tracking import skill_plan as sp

TODAY = date(2026, 10, 20)

#: A small tree: A is the base, B and D build on it, C builds on B.
NODES = [
    {'id': 't.a', 'name': 'Arithmetic', 'core': True, 'tier': 'foundation', 'requires': [], 'recommends': []},
    {'id': 't.b', 'name': 'Fractions', 'core': True, 'tier': 'core', 'requires': ['t.a'], 'recommends': []},
    {'id': 't.c', 'name': 'Ratios', 'core': False, 'tier': 'core', 'requires': ['t.b'], 'recommends': []},
    {'id': 't.d', 'name': 'Decimals', 'core': False, 'tier': 'core', 'requires': ['t.a'], 'recommends': []},
]
LIBRARY = {'t.b': [{'ordinal': 1, 'title': 'Add Fractions', 'minutes': 20, 'problems': []},
                   {'ordinal': 2, 'title': 'Multiply Fractions', 'minutes': 25, 'problems': []}]}


def rows(node, weight, right, wrong, days_ago=1, ordinal=0):
    """`right` + `wrong` marked problems, spread a minute apart."""
    stamp = datetime.combine(TODAY - timedelta(days=days_ago), datetime.min.time()).replace(hour=16)
    out = []
    for n in range(right + wrong):
        out.append({'node_id': node, 'ordinal': ordinal, 'slot': n % 20 + 1, 'weight': weight, 'attempted': 1,
                    'correct': 1 if n < right else 0, 'source': 'problem',
                    'at': (stamp + timedelta(minutes=n)).isoformat()})
    return out


def got(node, days_ago=1, ordinal=0):
    """Easy and Medium cleared: level 3."""
    return rows(node, 'warmup', 5, 0, days_ago, ordinal) + rows(node, 'core', 5, 0, days_ago, ordinal)


def plan(attempts, due=()):
    found, _ = sp.suggestions(NODES, attempts, LIBRARY, TODAY, due=due)
    return found


def kinds(found):
    return [item['kind'] for item in found]


# ---- Where to start -------------------------------------------------------------
def test_nothing_practiced_starts_at_the_base():
    [item] = plan([])
    assert (item['kind'], item['node_id'], item['weight']) == ('start', 't.a', 'warmup')
    assert item['title'] == 'Start with Arithmetic'


# ---- Going badly ------------------------------------------------------------------
def test_a_shaky_base_means_step_back():
    attempts = rows('t.a', 'core', 3, 4, days_ago=10) + rows('t.b', 'warmup', 3, 5, ordinal=1)
    item = plan(attempts)[0]
    assert (item['kind'], item['node_id'], item['from_id']) == ('step-back', 't.a', 't.b')
    assert item['title'] == 'Step back to Arithmetic'
    assert item['because'] == ("You got 3 of 8 right on Fractions lately. It builds on Arithmetic, "
                               "where you've got 43% right lately. Shore that up first.")


def test_a_stale_base_means_step_back():
    attempts = got('t.a', days_ago=40) + rows('t.b', 'warmup', 2, 6, ordinal=1)
    item = plan(attempts)[0]
    assert item['kind'] == 'step-back'
    assert 'which you last practiced 40 days ago.' in item['because']


def test_a_base_never_practiced_is_worth_a_check():
    item = plan(rows('t.b', 'warmup', 2, 6, ordinal=1))[0]
    assert item['kind'] == 'step-back'
    assert "which you haven't practiced here yet." in item['because']
    assert item['weight'] == 'warmup'


def test_a_solid_base_means_ease_off_a_difficulty():
    attempts = (got('t.a', days_ago=3) + rows('t.b', 'warmup', 5, 0, ordinal=1)
                + rows('t.b', 'core', 2, 6, ordinal=1))
    item = plan(attempts)[0]
    assert (item['kind'], item['node_id'], item['weight']) == ('ease-off', 't.b', 'warmup')
    assert item['title'] == 'Go back to Easy problems on Add Fractions'


# ---- Going well ---------------------------------------------------------------------
def test_nailed_a_difficulty_means_move_up():
    attempts = got('t.a', days_ago=3) + rows('t.b', 'warmup', 9, 1, ordinal=1)
    found = plan(attempts)
    harder = next(item for item in found if item['kind'] == 'harder')
    assert (harder['node_id'], harder['ordinal'], harder['weight']) == ('t.b', 1, 'core')
    assert harder['title'] == 'Try Medium problems on Add Fractions'
    assert harder['because'] == 'You got 9 of 10 Easy right. Time to move up.'


def test_keep_going_names_the_next_step():
    attempts = got('t.a', days_ago=3) + got('t.b', ordinal=1) + rows('t.b', 'warmup', 2, 1, ordinal=2)
    item = next(item for item in plan(attempts) if item['kind'] == 'continue')
    assert item['title'] == 'Keep going: Multiply Fractions'
    assert item['because'].startswith('Step 2 of 2 in Fractions.')
    assert item['weight'] == 'warmup'


def test_ready_when_every_prerequisite_is_got():
    found = plan(got('t.a', days_ago=2))
    ready = [item for item in found if item['kind'] == 'ready']
    # Core first: Fractions before Decimals. Ratios needs Fractions, so not yet.
    assert [item['node_id'] for item in ready] == ['t.b', 't.d']
    assert ready[0]['because'] == "It builds on Arithmetic, and you've got it."


def test_something_got_and_left_goes_cold():
    found = plan(got('t.a', days_ago=25))
    cold = next(item for item in found if item['kind'] == 'cold')
    assert cold['title'] == 'Warm up Arithmetic'
    assert cold['because'] == "You haven't practiced it in 25 days. 10 minutes keeps it."


# ---- The session -----------------------------------------------------------------------
DUE = [{'key': 'p:t.b#1#3', 'where': 'Fractions', 'minutes': 3, 'node_id': 't.b'},
       {'key': 'p:t.b#1#4', 'where': 'Fractions', 'minutes': 3, 'node_id': 't.b'}]


def test_a_session_is_review_then_the_main_thing_then_a_warm_up():
    attempts = got('t.a', days_ago=40) + rows('t.b', 'warmup', 2, 6, ordinal=1) + got('t.d', days_ago=30)
    found = plan(attempts, due=DUE)
    assert found[0]['kind'] == 'review'
    session = sp.session(found, 30)
    assert [block['kind'] for block in session['blocks']] == ['review', 'step-back', 'cold']
    assert [block['minutes'] for block in session['blocks']] == [6, 14, 10]
    assert session['minutes'] == 30
    assert sp.session_title('Math', session) == 'Math: redo 2 misses, then Arithmetic (Medium)'


def test_a_short_budget_drops_the_warm_up():
    attempts = got('t.a', days_ago=40) + rows('t.b', 'warmup', 2, 6, ordinal=1) + got('t.d', days_ago=30)
    session = sp.session(plan(attempts), 20)
    assert [block['kind'] for block in session['blocks']] == ['step-back', 'cold']
    session = sp.session(plan(attempts), 15)
    assert [block['kind'] for block in session['blocks']] == ['step-back']


def test_session_notes_say_each_block():
    session = sp.session(plan([]), 20)
    assert sp.session_notes(session) == ("20 min. Start with Arithmetic. It's where this tree begins. "
                                         "Try 5 Easy problems and see how it goes.")


# ---- The endpoints ------------------------------------------------------------------------
def seed(node, weight, right, wrong, days_ago=1, ordinal=0):
    for n, row in enumerate(rows(node, weight, right, wrong, days_ago, ordinal)):
        stamp = datetime.now() - timedelta(days=days_ago, minutes=n)
        db.insert_row('skill_attempts', dict(row, id='{}-{}-{}-{}'.format(node, weight, days_ago, n),
                                             user_id='tester', at=stamp.isoformat(timespec='seconds')))


def test_get_reads_one_tree(client):
    reply = client.get('/api/skill_plan?tree=mathematics').json()
    assert reply['success']
    assert reply['title'] == 'Mathematics'
    assert reply['subject'] == 'mathematics'
    assert reply['suggestions'][0]['kind'] == 'start'
    assert reply['session']['blocks']


def test_an_unknown_tree_is_refused(client):
    assert not client.get('/api/skill_plan?tree=nope').json()['success']


def test_the_summary_lists_trees_practiced(client):
    seed('m.arith', 'warmup', 9, 1)
    reply = client.get('/api/skill_plan/trees').json()
    assert reply['success']
    [tree] = reply['trees']
    assert tree['tree'] == 'mathematics'
    assert tree['top']['kind'] in sp.ORDER


def test_book_puts_the_session_on_the_calendar(client):
    seed('m.arith', 'warmup', 9, 1)
    reply = client.post('/api/skill_plan/book', json={'tree': 'mathematics', 'budget': 30}).json()
    assert reply['success'], reply
    task = db.find_row('tasks', reply['task_id'], user_id='tester')
    assert task['title'].startswith('Mathematics: ')
    assert task['subject'] == 'mathematics'
    assert ' min. ' in task['description']


# ---- The plan's row -------------------------------------------------------------------------
from backend.tracking.next_actions import build_plan  # noqa: E402


def plan_row(skills):
    found = build_plan([], [], [], lambda key: key, 120, now=datetime(2026, 10, 20, 9), skills=skills)
    return next((item for item in found['actions'] + found['more'] if item['kind'] == 'skill'), None)


def test_the_plan_carries_the_strongest_tree_suggestion():
    top = plan(rows('t.b', 'warmup', 2, 6, ordinal=1))[0]
    row = plan_row([{'tree': 'arith', 'title': 'Math', 'idle': 1, 'top': top}])
    assert row['title'] == 'Math: step back to Arithmetic'
    assert row['to'] == '/skill-trees?node=t.a'
    assert row['because'] == top['because']


def test_a_tree_left_alone_has_no_row():
    top = plan(rows('t.b', 'warmup', 2, 6, ordinal=1, days_ago=20))[0]
    assert plan_row([{'tree': 'arith', 'title': 'Math', 'idle': 20, 'top': top}]) is None


def test_a_struggling_easy_set_says_slow_down():
    item = plan(got('t.a', days_ago=3) + rows('t.b', 'warmup', 2, 6, ordinal=1))[0]
    assert (item['kind'], item['title']) == ('ease-off', 'Slow down on Add Fractions')


def test_prerequisites_written_as_names_resolve():
    """data/skill_nodes.json writes `requires` as names, "Arithmetic"."""
    named = [dict(node, requires=[next(one['name'] for one in NODES if one['id'] == ref) for ref in node['requires']])
             for node in NODES]
    attempts = rows('t.a', 'core', 3, 4, days_ago=10) + rows('t.b', 'warmup', 3, 5, ordinal=1)
    found, _ = sp.suggestions(named, attempts, LIBRARY, TODAY)
    assert (found[0]['kind'], found[0]['node_id']) == ('step-back', 't.a')


def test_the_real_math_tree_steps_back_to_its_base(client):
    seed('m.arith', 'core', 3, 5, days_ago=5)
    seed('m.fractions', 'warmup', 2, 6, days_ago=1)
    reply = client.get('/api/skill_plan?tree=mathematics').json()
    # The misses lead, then the base.
    assert reply['suggestions'][0]['kind'] == 'review'
    top = reply['suggestions'][1]
    assert (top['kind'], top['node_id'], top['from_id']) == ('step-back', 'm.arith', 'm.fractions')
    assert top['title'] == 'Step back to Arithmetic'
