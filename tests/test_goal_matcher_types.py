"""The shape of a task's goal mapping, and the rules it refuses to break.

Step one of the goal matcher: nothing is matched yet, so these pin the data
structure itself — what counts as a valid answer, and that nothing but ids and
small numbers ever gets into it.
"""
import dataclasses

import pytest

from backend.goal_matcher.types import (
    GOAL_MATCHER_VERSION,
    MAX_MATCHES_PER_TASK,
    TaskGoalMapping,
    TaskGoalMatch,
)


def rule(goal_id, score):
    return TaskGoalMatch(goal_id=goal_id, score=score, source='rule')


def test_a_match_holds_an_id_and_two_small_values_and_nothing_else():
    assert [f.name for f in dataclasses.fields(TaskGoalMatch)] == ['goal_id', 'score', 'source']
    assert [f.name for f in dataclasses.fields(TaskGoalMapping)] == ['status', 'matches', 'version']


def test_unmatched_is_a_valid_answer_with_no_goals():
    mapping = TaskGoalMapping.unmatched()
    assert mapping.status == 'unmatched'
    assert mapping.goal_ids == ()
    assert mapping.version == GOAL_MATCHER_VERSION


@pytest.mark.parametrize('status', ['ambiguous', 'unmatched', 'pending'])
def test_only_a_matched_mapping_may_name_goals(status):
    """A "maybe" is not stored as a relationship: that would be inventing one."""
    with pytest.raises(ValueError):
        TaskGoalMapping(status=status, matches=(rule('g1', 0.9),))
    assert TaskGoalMapping(status=status).goal_ids == ()


def test_matched_needs_at_least_one_goal():
    with pytest.raises(ValueError):
        TaskGoalMapping(status='matched')


def test_a_task_can_count_toward_several_goals_strongest_first():
    mapping = TaskGoalMapping(status='matched', matches=(
        rule('counting', 0.6), rule('amc8', 0.95), rule('contests', 0.8)))
    assert mapping.goal_ids == ('amc8', 'contests', 'counting')


def test_no_more_than_the_cap_are_kept():
    many = tuple(rule('g{}'.format(i), 0.5 + i / 100) for i in range(MAX_MATCHES_PER_TASK + 4))
    mapping = TaskGoalMapping(status='matched', matches=many)
    assert len(mapping.matches) == MAX_MATCHES_PER_TASK
    # The strongest survive, not the first written.
    assert mapping.goal_ids[0] == 'g{}'.format(MAX_MATCHES_PER_TASK + 3)


def test_a_duplicated_goal_is_kept_once_at_its_best():
    mapping = TaskGoalMapping(status='matched', matches=(
        rule('amc8', 0.5), rule('amc8', 0.9), rule('amc8', 0.7)))
    assert mapping.goal_ids == ('amc8',)
    assert mapping.matches[0].score == 0.9


def test_an_explicit_link_outranks_any_score_and_is_always_certain():
    mapping = TaskGoalMapping(status='matched', matches=(
        rule('a', 0.99), rule('b', 0.98), rule('c', 0.97),
        TaskGoalMatch(goal_id='mine', score=0.1, source='explicit')))
    assert mapping.goal_ids[0] == 'mine'
    assert mapping.explicit[0].score == 1.0
    # The cap still holds, and it is a rule match that loses its place.
    assert mapping.goal_ids == ('mine', 'a', 'b')


def test_an_explicit_copy_beats_an_automatic_copy_of_the_same_goal():
    mapping = TaskGoalMapping(status='matched', matches=(
        rule('amc8', 0.99), TaskGoalMatch(goal_id='amc8', score=1, source='explicit')))
    assert [m.source for m in mapping.matches] == ['explicit']


def test_scores_are_rounded_and_bounded():
    assert rule('g', 0.87654).score == 0.88
    for bad in (-0.1, 1.2):
        with pytest.raises(ValueError):
            rule('g', bad)


@pytest.mark.parametrize('kwargs', [
    {'goal_id': '', 'score': 0.5, 'source': 'rule'},
    {'goal_id': 'g', 'score': 0.5, 'source': 'guess'},
])
def test_a_match_refuses_a_missing_goal_or_an_unknown_source(kwargs):
    with pytest.raises(ValueError):
        TaskGoalMatch(**kwargs)


def test_an_unknown_status_is_refused():
    with pytest.raises(ValueError):
        TaskGoalMapping(status='probably')


def test_an_older_version_reads_as_stale():
    assert TaskGoalMapping(status='unmatched', version=GOAL_MATCHER_VERSION - 1).is_stale()
    assert not TaskGoalMapping.unmatched().is_stale()


def test_the_api_shape_is_ids_and_numbers():
    mapping = TaskGoalMapping(status='matched', matches=(rule('amc8', 0.9),))
    assert mapping.to_api() == {
        'version': GOAL_MATCHER_VERSION,
        'status': 'matched',
        'matches': [{'goal_id': 'amc8', 'score': 0.9, 'source': 'rule'}],
    }


def test_equal_inputs_in_any_order_give_equal_mappings():
    one = TaskGoalMapping(status='matched', matches=(rule('a', 0.8), rule('b', 0.8)))
    two = TaskGoalMapping(status='matched', matches=(rule('b', 0.8), rule('a', 0.8)))
    assert one == two
