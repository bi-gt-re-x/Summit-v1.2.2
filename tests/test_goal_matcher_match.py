"""Steps five and six of the goal matcher: the score, and what it concludes.

The goals and checkpoints below are the dev database's active outcome goals,
copied as they are — including "Reach AIME" filed under computer_science,
which is a real filing and decides real outcomes below. The task titles are
real ones from the same account. When config.py changes, these are the cases
to watch move.
"""
import time

import pytest

from backend.goal_matcher import candidate_index as ci
from backend.goal_matcher import config
from backend.goal_matcher.deterministic import TaskInput, TaskWords, noisy_or, rank, score

CHECKPOINTS = {
    'anthropic': ['Fundamental ML theory understood', 'Hands‑on experience with transformer models',
                  'Contributions to open‑source AI projects', 'Successful interview with Anthropic',
                  'Anthropic Engineer role secured'],
    'ascen': ['Calendar rewritten', 'Tasks page rebuilt', 'Goals page rebuilt', 'Analytics finished',
              'User authentication', '100-day uptime', 'Public launch', 'Add more', 'even more'],
    'codeforces': ['Rating 800', 'Reach 1000 rating', 'Rating 1400', 'Rating 1700', 'Rating 2000'],
    'users': ['First 100 users', 'First 1,000 users', 'Launch beta', '2,500 users', '5,000 users'],
    'aime': ['AMC 10 practice at 100+', 'Consistent 105+ on mocks', 'AMC 10 sat and cleared',
             'AIME problem set fluent', 'AIME qualified'],
    'usaco': ['Bronze solved without hints', 'Silver greedy fluent', 'Master DP',
              'Gold graph theory solid', 'Gold division reached'],
    'violin': ['RCM Level 8', 'RCM Level 9', 'Complete RCM Level 10', 'ARCT repertoire chosen',
               'ARCT exam passed'],
    'temp-usaco': ['Bronze solved without hints', 'Silver greedy fluent', 'Silver DP unassisted',
                   'Gold graph theory solid', 'Gold division reached'],
}


def goal(goal_id, title, subjects='', measure='milestones'):
    return {'id': goal_id, 'title': title, 'subject_ids': subjects, 'status': 'active',
            'measure': measure}


REAL_GOALS = [
    goal('temp-usaco', '[temp] Reach USACO Gold'),
    goal('aime', 'Reach AIME', 'computer_science'),
    goal('ascen', 'Build Ascen v2'),
    goal('usaco', 'Reach USACO Gold'),
    goal('users', 'Reach 5,000 Ascen users', measure='number'),
    goal('violin', 'Violin ARCT'),
    goal('codeforces', 'Codeforces rating 2000', measure='number'),
    goal('anthropic', 'Become Anthropic Engineer from scratch', 'computer_science'),
    # The counters: never candidates, whatever the title says.
    goal('streak', 'Reach a 60-day streak', measure='streak'),
    goal('xp', 'Earn 250,000 XP', measure='xp'),
]


def real_index(goals=REAL_GOALS):
    stones = [{'goal_id': gid, 'title': t} for gid, titles in CHECKPOINTS.items() for t in titles]
    return ci.build(goals, stones)


def scores(title, subject=None, index=None):
    return dict(rank(index or real_index(), TaskInput(id='t', title=title, subject=subject)))


def strong(title, subject=None, index=None):
    """The goals this task scores a match against."""
    return {g for g, s in scores(title, subject, index).items() if s >= config.MATCH_THRESHOLD}


# ---------------------------------------------------------------------------
# Step 5: the score
# ---------------------------------------------------------------------------
@pytest.mark.parametrize('title, subject, goals', [
    # The goal's own key word, or both of its USACO copies.
    ('USACO Gold training', 'computer_science', {'usaco', 'temp-usaco'}),
    ('USACO training', 'computer_science', {'usaco', 'temp-usaco'}),
    ('Violin lesson', 'music', {'violin'}),
    ('Long violin practice', 'music', {'violin'}),
    ('Codeforces round', None, {'codeforces'}),
    # One key word two goals share: both, which is right — it is work on Ascen.
    ('Ascen landing page', 'computer_science', {'ascen', 'users'}),
    # Title half-covered, filed under the goal's subject, a checkpoint agreeing.
    ('Anthropic interview prep', 'computer_science', {'anthropic'}),
    # No title word, but a checkpoint named nearly whole, and the subject.
    ('Transformer models from scratch', 'computer_science', {'anthropic'}),
])
def test_what_the_task_is_about_makes_the_match(title, subject, goals):
    assert strong(title, subject) == goals


@pytest.mark.parametrize('title, subject', [
    # Real titles from the same account that are toward none of these goals.
    ('Algorithms problem set', 'computer_science'),
    ('LeetCode session', 'computer_science'),
    ('Refactor the parser', 'computer_science'),
    ('Kaggle notebook', 'data_science'),
    ('Scales and arpeggios', 'music'),
    ('Morning meditation', 'meditation'),
    # A weak title word is not enough: this is not a Codeforces goal.
    ('Chess rating', None),
    ('Build: side project', 'computer_science'),
    # Generic words, however many.
    ('Practice problem set review session', 'computer_science'),
])
def test_ordinary_words_make_no_match(title, subject):
    assert strong(title, subject) == set()


def test_a_subject_mismatch_is_no_match_however_good_the_words():
    """"Reach AIME" is filed under computer_science; the AIME tasks under
    mathematics. The filter holds, and says nothing rather than guessing."""
    assert scores('AIME problem set', 'mathematics') == {}
    # Filed where the tasks are, the same title is an easy match.
    refiled = [goal('aime', 'Reach AIME', 'mathematics')]
    assert strong('AIME problem set', 'mathematics', real_index(refiled)) == {'aime'}
    assert strong('AMC 10 practice set', 'mathematics', real_index(refiled)) == {'aime'}


def test_a_task_with_no_subject_still_needs_the_words():
    assert strong('Violin lesson', None) == {'violin'}
    assert strong('Lesson', None) == set()


def test_generic_words_alone_score_below_ambiguous_even_with_the_subject():
    index = ci.build([goal('g', 'Practice problem sets daily', 'mathematics')])
    profile = index.goals['g']
    task = TaskWords.of(TaskInput('t', 'Practice problem set session daily', 'mathematics'))
    assert score(profile, task) < config.AMBIGUOUS_THRESHOLD


def test_weak_words_are_capped_so_they_cannot_add_up_to_a_match():
    index = ci.build([goal('g', 'Reach gold rating level 2000')])
    task = TaskWords.of(TaskInput('t', 'Reach gold rating level 2000'))
    # Every word of the title, and still not a match: none of them is a key word.
    assert score(index.goals['g'], task) < config.AMBIGUOUS_THRESHOLD


def test_the_subject_alone_scores_below_ambiguous():
    assert config.SUBJECT_AGREES < config.AMBIGUOUS_THRESHOLD
    assert noisy_or([config.SUBJECT_AGREES, config.GENERIC_CAP]) < config.AMBIGUOUS_THRESHOLD


def test_scores_are_between_zero_and_one_and_ranked_strongest_first():
    ranked = rank(real_index(), TaskInput('t', 'USACO Gold DP graph theory', 'computer_science'))
    assert all(0 <= s <= 1 for _, s in ranked)
    assert [s for _, s in ranked] == sorted((s for _, s in ranked), reverse=True)


def test_a_renamed_task_is_scored_on_its_new_name():
    before = scores('Violin lesson', 'music')
    after = scores('Scales and arpeggios', 'music')
    assert before and not after


def test_goals_nobody_could_match_are_never_scored():
    """The counters are not in the index, so they are not even candidates."""
    assert 'streak' not in scores('Reach a 60-day streak')
    assert 'xp' not in scores('Earn XP')


def test_scoring_a_large_history_is_fast():
    """Twenty thousand tasks against the real goals, index built once."""
    index = real_index()
    titles = ['USACO Gold training', 'Violin lesson', 'Morning meditation', 'Chess rating',
              'Anthropic interview prep', 'Algorithms problem set', 'Lift', 'Graph theory']
    tasks = [TaskInput(str(i), '{} {}'.format(titles[i % len(titles)], i % 97), 'computer_science')
             for i in range(20000)]
    started = time.perf_counter()
    for task in tasks:
        rank(index, task)
    assert time.perf_counter() - started < 2.0


# ---------------------------------------------------------------------------
# Step 6: matched, ambiguous, unmatched — and pending, which is not decided here
# ---------------------------------------------------------------------------
from backend.goal_matcher.deterministic import classify, decide  # noqa: E402
from backend.goal_matcher.types import TaskGoalMapping  # noqa: E402


def outcome(title, subject=None, index=None):
    return classify(index or real_index(), TaskInput('t', title, subject))


def test_a_confident_task_is_matched_and_stores_its_goals():
    result = outcome('USACO Gold training', 'computer_science')
    assert result.mapping.status == 'matched'
    assert set(result.mapping.goal_ids) == {'usaco', 'temp-usaco'}
    assert {m.source for m in result.mapping.matches} == {'rule'}
    assert result.candidates == ()


def test_several_plausible_goals_and_none_confident_is_ambiguous():
    result = outcome('Graph theory', 'mathematics')
    assert result.mapping.status == 'ambiguous'
    # Nothing stored as a relationship...
    assert result.mapping.goal_ids == ()
    # ...but the short list a closer look needs is there, strongest first.
    assert [goal_id for goal_id, _ in result.candidates] == ['temp-usaco', 'usaco']


def test_one_plausible_goal_below_the_bar_is_ambiguous_too():
    result = outcome('RCM level 8 etudes', 'music')
    assert result.mapping.status == 'ambiguous'
    assert [goal_id for goal_id, _ in result.candidates] == ['violin']


@pytest.mark.parametrize('title, subject', [
    ('Read chapter 7', 'science'),          # the design's own example
    ('Practice', 'computer_science'),       # a generic name
    ('Chess rating', None),                 # a weak word, below ambiguous
    ('', None),
])
def test_nothing_plausible_is_unmatched_with_no_candidates(title, subject):
    result = outcome(title, subject)
    assert result.mapping == TaskGoalMapping.unmatched()
    assert result.candidates == ()


def test_an_account_with_no_candidate_goals_leaves_every_task_unmatched():
    only_counters = [goal('streak', 'Reach a 60-day streak', measure='streak')]
    assert outcome('Reach a 60-day streak', index=real_index(only_counters)).mapping.status == 'unmatched'


def test_a_goal_with_no_subject_matches_across_subjects():
    assert outcome('Violin lesson', 'music').mapping.goal_ids == ('violin',)
    assert outcome('Violin lesson', 'orchestra').mapping.goal_ids == ('violin',)


def test_secondary_goals_ride_along_only_above_their_own_bar():
    result = decide([('a', 0.9), ('b', config.SECONDARY_MATCH_THRESHOLD),
                     ('c', config.SECONDARY_MATCH_THRESHOLD - 0.01)])
    assert result.mapping.goal_ids == ('a', 'b')


def test_no_more_than_the_cap_are_matched():
    many = [('g{}'.format(i), 0.95 - i / 100) for i in range(config.MAX_MATCHES_PER_TASK + 3)]
    assert len(decide(many).mapping.goal_ids) == config.MAX_MATCHES_PER_TASK


def test_the_thresholds_are_inclusive():
    assert decide([('a', config.MATCH_THRESHOLD)]).mapping.status == 'matched'
    assert decide([('a', config.MATCH_THRESHOLD - 0.01)]).mapping.status == 'ambiguous'
    assert decide([('a', config.AMBIGUOUS_THRESHOLD)]).mapping.status == 'ambiguous'
    assert decide([('a', config.AMBIGUOUS_THRESHOLD - 0.01)]).mapping.status == 'unmatched'
    assert decide([]).mapping.status == 'unmatched'


def test_a_goal_scored_twice_is_matched_once():
    assert decide([('a', 0.8), ('a', 0.9)]).mapping.goal_ids == ('a',)


def test_the_order_scores_arrive_in_does_not_matter():
    assert decide([('b', 0.8), ('a', 0.9)]) == decide([('a', 0.9), ('b', 0.8)])


def test_the_thresholds_are_read_from_config_not_baked_in(monkeypatch):
    assert outcome('Violin lesson', 'music').mapping.status == 'matched'
    monkeypatch.setattr(config, 'MATCH_THRESHOLD', 0.8)
    assert outcome('Violin lesson', 'music').mapping.status == 'ambiguous'
    monkeypatch.setattr(config, 'AMBIGUOUS_THRESHOLD', 0.8)
    assert outcome('Violin lesson', 'music').mapping.status == 'unmatched'


def test_pending_is_never_a_decision_only_a_state_the_queue_sets():
    statuses = {outcome(t, s).mapping.status for t, s in [
        ('USACO training', 'computer_science'), ('Graph theory', 'mathematics'), ('Lift', 'gym')]}
    assert statuses == {'matched', 'ambiguous', 'unmatched'}
    assert TaskGoalMapping.pending().status == 'pending'
    assert TaskGoalMapping.pending().goal_ids == ()
