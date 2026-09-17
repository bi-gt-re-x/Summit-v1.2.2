"""The Mastery badges, and the generated table they are counted through.

Two things are worth pinning here, and they are the two that would be silent if
they broke.

**The standing is the account's own record.** A tree's nodes carry a `state`
and a `percent` and neither is evidence about anybody — they are authored
illustration, identical on every account. A badge counted on them would be
earned by everyone at signup. `_tree_standing` therefore reads XP filed under
the subjects that route to a tree, and this asserts that it does.

**The routing table is a copy.** backend/config/skill_trees.py is generated
from the client's subject map by scripts/gen_tree_map.mjs. A copy that drifts
does not error: a subject missing from it simply stops counting toward a badge,
and nothing renders wrong. `npm run check:trees` is what catches the drift; this
checks the shape the badges depend on.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.api.achievements import (           # noqa: E402
    CATALOGUE, CATEGORIES, METRIC_LABELS, _tree_standing,
)
from backend.config.skill_trees import SUBJECT_TREE, TREES, tree_for  # noqa: E402
from backend.config.subjects import BY_ID        # noqa: E402


def task(subject, xp):
    return {'subject': subject, 'xp_value': xp, 'status': 'done'}


def test_every_catalogue_subject_routes_to_a_tree():
    """The generated copy covers all hundred. A subject missing from it is a
    subject whose work counts toward no lattice, silently."""
    missing = sorted(set(BY_ID) - set(SUBJECT_TREE))
    assert missing == [], missing
    unknown = sorted({t for t in SUBJECT_TREE.values() if t not in TREES})
    assert unknown == [], unknown


def test_every_tree_is_worth_something():
    """A tree worth zero would divide by zero, or read as instantly complete."""
    for tree, (title, worth) in TREES.items():
        assert title, tree
        assert worth > 0, tree


def test_an_invented_subject_routes_nowhere():
    """Unlike the client's router, this one does not fall back to the group. A
    fallback is right for a rail that must place every subject; it is wrong for
    a badge, where it hands out credit in a lattice never opened."""
    assert tree_for('not_a_subject') is None
    assert tree_for('') is None
    assert tree_for('machine_learning') == 'machine-learning'


def test_standing_counts_the_accounts_own_xp():
    worth = TREES['machine-learning'][1]
    reached, best, deep, done, groups, total = _tree_standing([
        task('machine_learning', worth // 2),
        task('machine_learning', 0),
    ])
    assert reached == 1
    assert best == 50
    assert deep == 1
    # Halfway is not covered, and half a tree is not a whole one's worth.
    assert done == 0
    assert total == 0
    # One lattice, and the field the subject is filed under.
    assert groups == 1


def test_standing_is_capped_at_a_whole_tree():
    """A subject can be worked far past what its lattice covers. Uncapped,
    "halfway into 3 trees" would be reachable by grinding one of them."""
    worth = TREES['mathematics'][1]
    reached, best, deep, done, _groups, total = _tree_standing(
        [task('mathematics', worth * 4)])
    assert reached == 1
    assert best == 100
    assert deep == 1
    assert done == 1
    # Four trees' worth of work in one lattice is still one tree's worth of
    # standing. This is the figure the cap is the whole argument for.
    assert total == 1


def test_standing_ignores_what_it_cannot_route():
    assert _tree_standing([
        task('not_a_subject', 999_999), task(None, 100), task('', 100),
    ]) == (0, 0, 0, 0, 0, 0)


def test_many_subjects_on_one_tree_are_one_tree():
    """Five languages open Foreign Languages. Reaching all five is reaching one
    lattice, not five — which is the whole reason the badge counts trees rather
    than subjects, next to the `subjects` badges it sits beside."""
    reached, _best, _deep, _done, groups, _total = _tree_standing([
        task('spanish', 500), task('french', 500), task('japanese', 500),
    ])
    assert reached == 1
    # And one field. Three languages are not three things to be good at.
    assert groups == 1


def test_the_mastery_heading_exists_and_is_filled():
    assert 'Mastery' in CATEGORIES
    mastery = [row for row in CATALOGUE if row[6] == 'Mastery']
    assert len(mastery) >= 8
    # Every metric it measures on has a label, or a locked badge cannot say
    # what its number counts.
    for row in mastery:
        assert row[3] in METRIC_LABELS, row[0]
    # Thresholds climb inside each metric, so there is exactly one next rung.
    for metric in {row[3] for row in mastery}:
        rungs = [row[4] for row in mastery if row[3] == metric]
        assert rungs == sorted(rungs), metric
        assert len(set(rungs)) == len(rungs), metric
