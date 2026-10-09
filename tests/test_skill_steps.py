"""The quality gate on written practice steps, and the endpoint that serves them.

Two things are worth testing here and they are not the same thing.

The first is that the checks in backend/tracking/skillsteps.py actually reject
the step the whole feature exists to eliminate — "Do ten from memory", the
sentence a generic ladder produces because it knows nothing about the subject.
A gate that passes everything is a gate nobody notices is broken, and the way
this one would break is by drifting permissive one loosened rule at a time.

The second is the pair of invariants the table promises: a step that reaches it
has been checked, and a node with nothing written is reported as missing rather
than as a programme of no steps. The panel behaves differently on those two, so
the distinction has to survive the round trip.
"""
import json

import pytest

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))), 'scripts'))

import seed_skill_steps  # noqa: E402

from backend.database import connection  # noqa: E402
from backend.tracking import skillsteps  # noqa: E402


# ---------------------------------------------------------------------------
# A step to bend
# ---------------------------------------------------------------------------
NODE = {
    'id': 'm.quadratics',
    'name': 'Quadratics',
    'desc': 'Equations with a squared term, and the parabola they draw.',
    'tier': 'intermediate',
    'tree': 'mathematics',
    'treeTitle': 'Mathematics',
}


def step(**over):
    """A step that passes every check, so a test can break exactly one."""
    return {
        'ordinal': 1,
        'title': 'Factor Simple Quadratics',
        'mastery': 'Reverse the expansion to factor x^2 + bx + c into two brackets.',
        'practice': 'Factor x^2 - 7x + 12, then factor x^2 + 2x - 15.',
        'proof': '(x - 3)(x - 4), and (x + 5)(x - 3).',
        'pitfall': 'Getting the signs wrong when c is positive but b is negative.',
        'detail': 'Find two numbers multiplying to c and adding to b. With c positive '
                  'both share the sign of b; with c negative they differ. List the '
                  'factor pairs of c rather than guessing at them.',
        'minutes': 20,
        **over,
    }


def test_a_good_step_passes():
    assert skillsteps.failures(step(), NODE) == []


# ---------------------------------------------------------------------------
# The rule the module exists for
# ---------------------------------------------------------------------------
@pytest.mark.parametrize('practice', [
    'Do ten from memory.',
    'Work through some examples.',
    'Practice until it feels easy.',
    'Try a few of these on your own.',
])
def test_a_practice_line_naming_nothing_is_rejected(practice):
    """The exact failure mode the derived ladder had, in four spellings.

    Each of these is a grammatical instruction that cannot be carried out,
    because there is no *thing* in the sentence. Whether it trips 'concrete' or
    'not-generic' is an implementation detail; that it is refused is not.
    """
    bad = skillsteps.failures(step(practice=practice), NODE)
    assert any(reason.startswith(('concrete', 'not-generic')) for reason in bad), bad


def test_naming_an_object_is_what_rescues_it():
    """"From memory" is not the problem — saying nothing is.

    This is the pair the VAGUE list is deliberately kept short for: the same
    phrase passes the moment the sentence names what to do it to.
    """
    assert skillsteps.failures(
        step(practice='Write the circle of fifths from memory, all 12 keys.'), NODE) == []


def test_a_mastery_sentence_in_the_practice_column_is_rejected():
    bad = skillsteps.failures(
        step(practice='You should be able to factor any simple quadratic.'), NODE)
    assert any(reason.startswith('concrete') for reason in bad), bad


def test_a_scene_may_be_set_before_the_imperative():
    """"For <expression>, do <thing>" is ordinary English and has to pass."""
    assert skillsteps.failures(
        step(practice='For x^2 - 9x + 20 = 0, name the quickest method and solve it.'),
        NODE) == []


# ---------------------------------------------------------------------------
# The other checks
# ---------------------------------------------------------------------------
def test_a_missing_field_is_reported_alone():
    """Nothing else is measured on a step with a hole in it."""
    bad = skillsteps.failures(step(proof=''), NODE)
    assert bad == ['shape:missing proof']


def test_a_truncated_field_is_caught():
    bad = skillsteps.failures(step(detail='Find two numbers multiplying to c and adding '
                                          'to b, then write the pairs out rather than'), NODE)
    assert any('not a sentence' in reason for reason in bad), bad


def test_a_practice_line_restating_its_mastery_line_is_rejected():
    bad = skillsteps.failures(
        step(practice='Reverse the expansion to factor x^2 + bx + c into two brackets.'),
        NODE)
    assert any(reason.startswith('distinct') for reason in bad), bad


def test_two_steps_saying_the_same_thing_are_rejected():
    first = step(ordinal=1)
    second = step(ordinal=2, title='Factor Quadratics Again')
    bad = skillsteps.failures(second, NODE, [first, second])
    assert any(reason.startswith('distinct') for reason in bad), bad


def test_a_step_about_something_else_is_rejected():
    bad = skillsteps.failures(step(
        title='Tune the Low E String',
        mastery='Bring the sixth string to pitch against a reference tone.',
        detail='Play the reference, then turn the machine head until the beating between '
               'the two notes slows and stops. Tune up to the note rather than down to it.',
    ), NODE)
    assert any(reason.startswith('on-topic') for reason in bad), bad


def test_a_step_may_anchor_to_its_neighbours_instead_of_the_node():
    """A programme's own vocabulary counts as being on topic.

    "Expand Binomials" shares no word with a node called Quadratics whose
    description talks about parabolas, and it is plainly a quadratics step.
    """
    siblings = [
        step(ordinal=1, title='Recognise a Quadratic',
             mastery='Identify whether an expression is quadratic, and name a, b and c.'),
    ]
    subject = step(
        ordinal=2,
        title='Expand Binomials',
        mastery='Expand a product of two brackets, collecting the middle terms.',
        practice='Expand (2x - 3)(x + 7).',
        proof='2x^2 + 11x - 21.',
        pitfall='Writing (x + 5)^2 as x^2 + 25, which drops the middle terms.',
        detail='Multiply each term in the first bracket by each in the second, which is '
               'four products. The two middle ones combine into a single term, and that '
               'is the term people lose.',
    )
    assert skillsteps.failures(subject, NODE, siblings + [subject]) == []


# ---------------------------------------------------------------------------
# Whole programmes
# ---------------------------------------------------------------------------
def test_a_programme_that_is_too_short_fails_as_a_whole():
    _, whole = skillsteps.review_programme([step()], NODE)
    assert any(reason.startswith('ladder') for reason in whole), whole


def test_ordinals_with_a_gap_fail_as_a_whole():
    steps = [step(ordinal=n, title='Step {}'.format(n)) for n in (1, 2, 4, 5, 6)]
    _, whole = skillsteps.review_programme(steps, NODE)
    assert any('ordinals' in reason for reason in whole), whole


# ---------------------------------------------------------------------------
# The table's own promise
# ---------------------------------------------------------------------------
def rows_for(node_id, count=5):
    return [{
        'ordinal': n,
        'title': 'Step {}'.format(n),
        'mastery': 'What mastering step {} means, said in one sentence.'.format(n),
        'practice': 'Factor x^2 - {}x + 12.'.format(n),
        'detail': 'How to actually do step {}, at enough length that a reader can '
                  'follow it while working rather than before starting.'.format(n),
        'proof': 'The answer comes out exact.',
        'pitfall': 'The specific mistake people make on this one.',
        'minutes': 20,
        'tree_id': 'mathematics',
        'tier': 'intermediate',
        'model': 'authored',
        'generated_at': '2026-09-26T12:00:00',
        'attempts': 1,
        'verified_at': '2026-09-26T12:00:00',
        'verifier': 'rules+authored',
        'checks': list(skillsteps.RULE_CHECKS),
    } for n in range(1, count + 1)]


def test_a_stored_programme_reads_back_in_order():
    connection.save_node_steps('t.one', rows_for('t.one'))
    out = skillsteps.programmes_for(['t.one'])
    assert [row['ordinal'] for row in out['t.one']] == [1, 2, 3, 4, 5]
    assert out['t.one'][0]['title'] == 'Step 1'


def test_every_stored_step_carries_its_verification():
    connection.save_node_steps('t.two', rows_for('t.two'))
    for row in skillsteps.programmes_for(['t.two'])['t.two']:
        assert row['verified']['at']
        assert row['verified']['by'] == 'rules+authored'
        assert 'concrete' in row['verified']['checks']


def test_an_unverified_row_cannot_be_stored():
    """The invariant is a schema constraint, not a convention.

    A row with no verifier is refused by SQLite itself, so there is no path —
    a new script, a future endpoint, a careless migration — that puts unchecked
    content where the panel will read it.
    """
    rows = rows_for('t.three', 1)
    rows[0]['verifier'] = ''
    with pytest.raises(Exception):
        connection.save_node_steps('t.three', rows)


def test_a_node_with_nothing_written_is_absent_rather_than_empty():
    """The distinction the panel's fallback depends on."""
    connection.save_node_steps('t.four', rows_for('t.four'))
    out = skillsteps.programmes_for(['t.four', 't.nothing'])
    assert 't.four' in out
    assert 't.nothing' not in out


def test_rewriting_a_node_replaces_it_rather_than_appending():
    connection.save_node_steps('t.five', rows_for('t.five', 7))
    connection.save_node_steps('t.five', rows_for('t.five', 5))
    assert len(skillsteps.programmes_for(['t.five'])['t.five']) == 5


def test_the_audit_trail_keeps_the_failures():
    """What the table cannot show, because it only holds what passed."""
    connection.log_step_audit([
        {'run_id': 'r1', 'node_id': 't.six', 'ordinal': 2, 'stage': 'review',
         'outcome': 'fail', 'reason': '12 x 3 is 36, not 34', 'at': '2026-09-26T12:00:00'},
        {'run_id': 'r1', 'node_id': 't.six', 'ordinal': None, 'stage': 'store',
         'outcome': 'drop', 'reason': 'did not pass review', 'at': '2026-09-26T12:00:00'},
    ])
    summary = connection.step_audit_summary('r1')
    assert {'stage': 'review', 'outcome': 'fail', 'count': 1} in summary
    assert {'stage': 'store', 'outcome': 'drop', 'count': 1} in summary


# ---------------------------------------------------------------------------
# The endpoint
# ---------------------------------------------------------------------------
def test_the_endpoint_answers_for_several_nodes_at_once(client):
    connection.save_node_steps('t.api1', rows_for('t.api1'))
    connection.save_node_steps('t.api2', rows_for('t.api2', 6))
    body = client.get('/api/skill-steps?nodes=t.api1,t.api2,t.absent').json()
    assert body['success'] is True
    assert len(body['steps']['t.api1']) == 5
    assert len(body['steps']['t.api2']) == 6
    assert body['missing'] == ['t.absent']


def test_the_endpoint_refuses_an_empty_request(client):
    body = client.get('/api/skill-steps?nodes=').json()
    assert body['success'] is False


def test_the_endpoint_caps_how_many_nodes_one_request_may_name(client):
    ids = ','.join('n{}'.format(n) for n in range(300))
    body = client.get('/api/skill-steps?nodes=' + ids).json()
    assert body['success'] is False
    assert 'limit' in body['message']


def test_coverage_reports_what_is_written(client):
    connection.save_node_steps('m.quadratics', rows_for('m.quadratics', 7))
    body = client.get('/api/skill-steps/coverage').json()
    assert body['success'] is True
    maths = next(row for row in body['trees'] if row['tree'] == 'mathematics')
    assert maths['written'] >= 1
    assert maths['nodes'] >= maths['written']


def test_the_served_shape_is_the_one_the_panel_draws(client):
    """A step answers three questions before it is opened and three after.

    The closed row is title, mastery and practice — which is the table in the
    design. Everything else is the expansion. If a field disappears from this
    list the panel silently renders a gap, so the contract is asserted whole.
    """
    connection.save_node_steps('t.shape', rows_for('t.shape', 5))
    first = client.get('/api/skill-steps?nodes=t.shape').json()['steps']['t.shape'][0]
    assert set(first) == {
        'ordinal', 'title', 'mastery', 'practice',
        'detail', 'proof', 'pitfall', 'minutes', 'problems', 'verified',
    }


def test_the_seed_file_passes_the_same_checks_the_generator_does():
    """Authored content is not trusted more than generated content.

    This is the check that fails when somebody edits data/skill_steps_seed.json
    by hand and writes a practice line that names nothing. It reads the file
    rather than the table, so it fails before a bad step is ever loaded.
    """
    import os
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(root, 'data', 'skill_nodes.json')) as handle:
        nodes = {node['id']: node for node in json.load(handle)['nodes']}
    with open(os.path.join(root, 'data', 'skill_steps_seed.json')) as handle:
        seed = json.load(handle)['programmes']

    assert seed, 'the seed file is empty'
    problems = []
    for node_id, entry in seed.items():
        # Two shapes are valid: a bare list of steps for hand-written content,
        # and an object carrying provenance for anything `--export` wrote back
        # out of the table. See `_unpack` in scripts/seed_skill_steps.py.
        raw = entry.get('steps', []) if isinstance(entry, dict) else entry
        node = nodes.get(node_id)
        assert node, 'seed names {}, which is not a node'.format(node_id)
        steps = [{'ordinal': n, **one} for n, one in enumerate(raw, start=1)]
        per_step, whole = skillsteps.review_programme(steps, node)
        problems.extend('{}: {}'.format(node_id, reason) for reason in whole)
        for one, reasons in zip(steps, per_step):
            problems.extend(
                '{} step {}: {}'.format(node_id, one['ordinal'], reason) for reason in reasons)
    assert problems == [], problems


# ---------------------------------------------------------------------------
# Problems
# ---------------------------------------------------------------------------
def problem(**over):
    """A problem that passes every check, so a test can break exactly one."""
    return {
        'slot': 1,
        'weight': 'warmup',
        'prompt': 'Factor x^2 - 7x + 12.',
        'answer': '(x - 3)(x - 4).',
        'hint': '',
        **over,
    }


def test_a_good_problem_passes():
    assert skillsteps.problem_failures(problem(), step()) == []


def test_a_problem_with_no_answer_is_rejected():
    """Stricter than the step rules, on purpose.

    A question nobody wrote the answer to cannot be marked, so a reader who
    gets it wrong finds out nothing — which is worse than no question.
    """
    assert skillsteps.problem_failures(problem(answer=''), step()) == ['shape:missing answer']


def test_a_problem_naming_nothing_is_rejected():
    bad = skillsteps.problem_failures(problem(prompt='Try a harder one of these.'), step())
    assert any(reason.startswith('concrete') for reason in bad), bad


def test_an_ordering_answer_is_not_a_restatement():
    """The answer to "put these in order" is those things, in order.

    It reuses every token in the question and is exactly correct, which is why
    the restatement check compares wording rather than numbers.
    """
    assert skillsteps.problem_failures(problem(
        prompt='Order -7, 3, -2, 0 and -10 from smallest to largest.',
        answer='-10, -7, -2, 0, 3.',
    ), step()) == []


def test_an_answer_that_only_repeats_the_question_is_rejected():
    bad = skillsteps.problem_failures(problem(
        prompt='Explain why completing the square reveals the vertex of a parabola.',
        answer='Completing the square reveals the vertex of the parabola.',
    ), step())
    assert any(reason.startswith('answered') for reason in bad), bad


def test_a_warm_up_contained_in_its_stretch_is_not_a_duplicate():
    """Containment is what makes a good warm-up, not what makes a duplicate."""
    warm = problem(slot=1, prompt='Evaluate 2 + 3 x 4.', answer='14.')
    hard = problem(slot=2, weight='core',
                   prompt='Evaluate 20 - 3 x 4 + 8 / 2 and list the order you applied.',
                   answer='12, taking the product and the quotient first.')
    assert skillsteps.problem_failures(hard, step(), [warm, hard]) == []


def test_a_set_must_open_light_and_end_heavy():
    backwards = [
        problem(slot=1, weight='stretch'),
        problem(slot=2, weight='core', prompt='Factor 6x^2 - x - 2.', answer='(3x - 2)(2x + 1).'),
        problem(slot=3, weight='warmup', prompt='Factor x^2 + 5x + 6.', answer='(x + 2)(x + 3).'),
    ]
    _, whole = skillsteps.review_problems(backwards, step())
    assert any('easier' in reason for reason in whole), whole


def test_how_many_problems_a_step_gets_follows_its_cost():
    """The same table frontend/src/utils/problemSet.test.ts asserts.

    Two languages decide this — the panel drew graded slots before there was
    anything to put in them, and the generator now fills them — so the numbers
    are asserted in both places rather than trusted to stay in step. A
    disagreement here is a step served with four questions into a layout drawn
    for three.
    """
    assert [skillsteps.problem_count(m) for m in (5, 15, 20, 25, 30, 45, 180)] == \
        [3, 3, 4, 5, 6, 9, 9]


def test_a_generated_set_is_graded_in_a_shape_the_rules_accept():
    """The slope the pipeline assigns is the slope the reviewer demands.

    `problem_slots` exists so that no call ever has to argue with the `graded`
    checks: the bands are a fact about how the panel reads, not a judgement made
    per set. If these two ever disagree the generator fails every node it
    writes and the reason will look like a content problem, so it is asserted
    directly.
    """
    for minutes in (5, 20, 25, 30, 60):
        slots = skillsteps.problem_slots(minutes)
        written = [problem(slot=one['slot'], weight=one['weight'],
                           prompt='Factor x^2 + {}x + {}.'.format(one['slot'] + 4, one['slot'] + 3),
                           answer='(x + {})(x + 1).'.format(one['slot'] + 3))
                   for one in slots]
        _, whole = skillsteps.review_problems(written, step())
        assert whole == [], (minutes, whole)


def test_a_set_that_only_restates_its_step_is_rejected():
    """One problem repeating the practice line is fine; all of them is not."""
    line = step()['practice']
    same = [problem(slot=n, weight=w, prompt=line, answer='It factors.')
            for n, w in ((1, 'warmup'), (2, 'core'), (3, 'stretch'))]
    _, whole = skillsteps.review_problems(same, step())
    assert any(reason.startswith('distinct') for reason in whole), whole


def test_problems_are_served_inside_their_step(client):
    connection.save_node_steps('t.prob', rows_for('t.prob', 5))
    connection.save_step_problems('t.prob', 2, [{
        'slot': 1, 'weight': 'warmup', 'prompt': 'Factor x^2 + 5x + 6.',
        'answer': '(x + 2)(x + 3).', 'hint': '', 'tree_id': 'mathematics',
        'model': 'authored', 'generated_at': '2026-09-27T12:00:00',
        'verified_at': '2026-09-27T12:00:00', 'verifier': 'rules+authored',
        'checks': list(skillsteps.PROBLEM_CHECKS),
    }])
    steps = client.get('/api/skill-steps?nodes=t.prob').json()['steps']['t.prob']
    assert steps[0]['problems'] == []
    assert len(steps[1]['problems']) == 1
    assert steps[1]['problems'][0]['prompt'] == 'Factor x^2 + 5x + 6.'


def test_an_unverified_problem_cannot_be_stored():
    with pytest.raises(Exception):
        connection.save_step_problems('t.bad', 1, [{
            'slot': 1, 'weight': 'warmup', 'prompt': 'x', 'answer': 'y', 'hint': '',
            'tree_id': 't', 'model': 'm', 'generated_at': 'now',
            'verified_at': '', 'verifier': '', 'checks': [],
        }])


def test_the_seed_problems_pass_the_same_checks():
    """Every problem in the committed corpus, against the live rules.

    Normalised through the loader's own `_problems_of` rather than read raw,
    because the file leaves `slot` and `weight` out on purpose — a set written
    by hand is numbered and graded by the order it was written in, and testing
    the un-normalised form would be testing a shape that never reaches the
    database.
    """
    import os
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(root, 'data', 'skill_steps_seed.json')) as handle:
        seed = json.load(handle)['programmes']

    problems_seen = 0
    faults = []
    for node_id, entry in seed.items():
        raw = entry.get('steps', []) if isinstance(entry, dict) else entry
        for at, one in enumerate(raw, start=1):
            written = seed_skill_steps._problems_of(one, at)
            if not written:
                continue
            problems_seen += len(written)
            per, whole = skillsteps.review_problems(written, {**one, 'ordinal': at})
            faults.extend('{} step {}: {}'.format(node_id, at, r) for r in whole)
            for slot, reasons in zip(written, per):
                faults.extend('{} step {} slot {}: {}'.format(
                    node_id, at, slot.get('slot'), r) for r in reasons)
    assert problems_seen > 0, 'the corpus has no problems in it'
    assert faults == [], faults


def test_activity_ranks_trees_by_finished_work():
    """The order writing effort is spent in, and why it is not alphabetical."""
    from backend.config import skill_trees
    ranked = connection.subject_work_by_tree(skill_trees.SUBJECT_TREE)
    # Whatever the fixture database holds, the contract is the shape and the
    # ordering: heaviest first, and every row names a real tree.
    assert all(len(row) == 4 for row in ranked)
    assert ranked == sorted(ranked, key=lambda row: (-row[1], row[0]))
