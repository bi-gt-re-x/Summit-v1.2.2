"""Step four of the goal matcher: which goals a task is ever compared with."""
from backend.database import connection as db
from backend.goal_matcher import candidate_index as ci
from backend.goal_matcher.normalize import words


def goal(goal_id, title, subjects='', status='active', measure='milestones', goal_type='xp'):
    return {'id': goal_id, 'title': title, 'subject_ids': subjects, 'status': status,
            'measure': measure, 'goal_type': goal_type}


GOALS = [
    goal('aime', 'Reach AIME', 'mathematics'),
    goal('violin', 'Violin ARCT', 'music'),
    goal('usaco', 'Reach USACO Gold'),                       # no subject: cross-subject
    goal('both', 'Olympiad combinatorics', 'mathematics, computer_science'),
    goal('streak', 'Reach a 60-day streak', measure='', goal_type='streak'),
    goal('xp', 'Earn 250,000 XP', measure='xp'),
    goal('old', 'Pass AMC 8', 'mathematics', status='completed'),
    goal('users', 'Reach 5,000 Ascen users', measure='number'),
]


def ids(profiles):
    return [p.id for p in profiles]


def test_only_active_outcome_goals_are_indexed():
    index = ci.build(GOALS)
    # The counters count every task by their measure already, and a completed
    # goal takes no new work.
    assert list(index.goals) == ['aime', 'violin', 'usaco', 'both', 'users']


def test_completed_goals_can_be_asked_for_explicitly():
    assert 'old' in ci.build(GOALS, include_completed=True).goals


def test_goals_are_bucketed_by_subject():
    index = ci.build(GOALS)
    assert index.by_subject == {
        'mathematics': ('aime', 'both'),
        'music': ('violin',),
        'computer_science': ('both',),
    }
    assert index.cross == ('usaco', 'users')


def test_a_math_task_is_never_compared_with_a_violin_goal():
    pool = ci.build(GOALS).pool('mathematics')
    assert 'violin' not in pool
    assert set(pool) == {'aime', 'both', 'usaco', 'users'}


def test_a_subject_with_no_goals_leaves_only_cross_subject_goals():
    assert ci.build(GOALS).pool('chemistry') == ('usaco', 'users')


def test_a_task_with_no_subject_is_compared_with_every_candidate():
    assert set(ci.build(GOALS).pool(None)) == {'aime', 'violin', 'usaco', 'both', 'users'}
    assert ci.build(GOALS).pool('  ') == ci.build(GOALS).pool(None)


def test_subject_ids_are_compared_loosely():
    index = ci.build([goal('g', 'Violin ARCT', ' Music ,  ')])
    assert index.pool('music') == ('g',)
    assert index.pool('MUSIC') == ('g',)


def test_candidates_must_share_a_real_word():
    index = ci.build(GOALS)
    assert ids(index.candidates('mathematics', words('AIME problem set'))) == ['aime']
    # "practice" and "problem set" are activity words: they send a task nowhere.
    assert index.candidates('mathematics', words('Problem set practice')) == []
    # Nothing shared at all.
    assert index.candidates('mathematics', words('Integration drills')) == []


def test_a_word_from_another_subjects_goal_does_not_cross_over():
    """"Violin" is a Violin ARCT word, but a maths task never reaches that goal."""
    assert index_ids('mathematics', 'Violin sight-reading') == []
    assert index_ids('music', 'Violin sight-reading') == ['violin']


def index_ids(subject, title):
    return ids(ci.build(GOALS).candidates(subject, words(title)))


def test_checkpoint_words_also_lead_to_the_goal():
    index = ci.build([goal('aime', 'Reach AIME', 'mathematics')],
                     [{'goal_id': 'aime', 'title': 'AMC 10 sat and cleared'},
                      {'goal_id': 'elsewhere', 'title': 'Nothing to do with it'}])
    assert ids(index.candidates('mathematics', words('AMC 10 practice set'))) == ['aime']
    assert 'nothing' not in index.by_term


def test_a_duplicated_goal_is_indexed_once():
    index = ci.build([goal('g', 'Reach AIME'), goal('g', 'Something else')])
    assert list(index.goals) == ['g']
    assert index.cross == ('g',)


def test_weak_words_find_a_goal_but_generic_ones_never_do():
    index = ci.build([goal('g', 'Reach the top of the practice ladder')])
    # "reach" and "top" are weak: they make it a candidate, and the scorer
    # decides whether that is worth anything. "practice" cannot.
    assert set(index.by_term) == {'reach', 'top', 'ladder'}
    assert ids(index.candidates(None, words('Top practice'))) == ['g']
    assert index.candidates(None, words('Practice')) == []


def test_the_profile_holds_words_and_ids_only():
    profile = ci.build([goal('usaco', 'Reach USACO Gold')]).goals['usaco']
    assert profile.title_keys == {'usaco'}
    assert profile.title_weak == {'reach', 'gold'}
    assert ('usaco', 'gold') in profile.title_pairs
    assert profile.cross_subject


def test_loading_reads_only_the_fields_it_needs(client, monkeypatch):
    client.post('/api/add_goal', json={
        'title': 'Reach AIME', 'measure': 'milestones', 'subject_ids': 'mathematics',
        'description': 'x' * 5000, 'milestones': ['AMC 10 sat and cleared'],
    })
    asked = []
    real = db.columns_for

    def spy(table, user_id, columns, order='rowid'):
        asked.append((table, tuple(columns)))
        return real(table, user_id, columns, order)

    monkeypatch.setattr(db, 'columns_for', spy)
    index = ci.load('tester')

    assert asked == [('goals', ci.GOAL_FIELDS), ('goal_milestones', ci.CHECKPOINT_FIELDS)]
    assert 'description' not in ci.GOAL_FIELDS
    (profile,) = index.goals.values()
    assert profile.subjects == {'mathematics'}
    assert profile.checkpoint_keys == (frozenset({'amc'}),)


def test_loading_only_sees_this_accounts_goals(client, stranger):
    stranger.post('/api/add_goal', json={'title': 'Violin ARCT', 'measure': 'milestones'})
    mine = client.post('/api/add_goal', json={'title': 'Violin ARCT', 'measure': 'milestones'}).json()
    assert list(ci.load('tester').goals) == [mine['id']]
