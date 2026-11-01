"""Why a dated goal is where it is — backend/tracking/goal_why.py."""
from datetime import date, timedelta

from backend.tracking import forecast as fc
from backend.tracking import goal_why as gw

TODAY = date(2026, 11, 2)  # a Monday


def ago(days, hour=18):
    return '{}T{:02d}:00:00'.format((TODAY - timedelta(days=days)).isoformat(), hour)


def a_goal(title='Reach USACO Gold', steps=None, subjects='computer_science', due_in=30, ticked=2, **over):
    goal = {'id': 'g1', 'title': title, 'status': 'active', 'measure': 'milestones', 'subject_ids': subjects,
            'deadline': (TODAY + timedelta(days=due_in)).isoformat(),
            'start_date': (TODAY - timedelta(days=80)).isoformat(),
            'milestones': [{'id': 'm1', 'title': 'Silver', 'status': 'active', 'position': 0, 'steps': steps or [
                {'id': 's{}'.format(n), 'title': 'Part {}'.format(n), 'done': n < ticked} for n in range(6)]}]}
    goal.update(over)
    return goal


COUNT = iter(range(100000))


def task(title, days, hour=18, subject='computer_science', **extra):
    return {'id': 't{}'.format(next(COUNT)), 'title': title, 'status': 'done', 'subject': subject,
            'completed_at': ago(days, hour), **extra}


def why(goal, tasks):
    return fc.forecasts([goal], tasks, [], TODAY, lambda key: {'computer_science': 'Computer Science',
                                                               'music': 'Music'}.get(key, key))[0]['why']


def point(found, label):
    return next((one for one in found['points'] if one['label'] == label), None)


class TestDirectWork:
    def terms(self, goal):
        return gw.goal_terms(goal)

    def test_a_link_counts(self):
        goal = a_goal()
        assert gw.is_direct({'title': 'Something', 'goal_ids': ['g1']}, goal, self.terms(goal))

    def test_naming_the_goal_counts(self):
        goal = a_goal('Violin ARCT')
        assert gw.is_direct({'title': 'Violin lesson', 'subject': 'music'}, goal, self.terms(goal))

    def test_naming_its_contest_counts_even_in_another_subject(self):
        goal = a_goal()
        assert gw.is_direct({'title': 'USACO Gold practice', 'subject': 'algorithms'}, goal, self.terms(goal))

    def test_a_topic_on_its_syllabus_counts(self):
        goal = a_goal('Reach AIME', subjects='mathematics')
        assert gw.is_direct({'title': 'Recursive counting drill', 'subject': 'mathematics'}, goal, self.terms(goal))

    def test_other_work_in_the_subject_does_not(self):
        goal = a_goal()
        assert not gw.is_direct({'title': 'Refactor my website', 'subject': 'computer_science'}, goal, self.terms(goal))

    def test_generic_goal_words_do_not_count(self):
        goal = a_goal('Become a great engineer')
        assert not gw.is_direct({'title': 'Become more organized', 'subject': 'planning'}, goal, self.terms(goal))

    def test_stand_in_step_titles_never_match(self):
        goal = a_goal('Violin ARCT', steps=[{'id': 's', 'title': 'Name the first piece of work', 'done': False}])
        assert not gw.is_direct({'title': 'First piece of work today', 'subject': 'x'}, goal, self.terms(goal))


class TestTheLead:
    def test_most_subject_work_off_target_is_the_cause(self):
        tasks = [task('USACO Gold DP', day) for day in (40, 50, 60, 70, 75, 3, 12)] + \
                [task('Refactor my website', day) for day in range(1, 11)]
        found = why(a_goal(due_in=10), tasks)
        assert "because most of your Computer Science time isn't going to this." in found['lead']
        direct = point(found, 'Direct work')
        assert direct['tone'] == 'bad'
        assert 'Only 2 of your 12 Computer Science sessions' in direct['text']
        assert 'Refactor my website' in direct['text']

    def test_all_direct_work_says_so(self):
        tasks = [task('USACO Gold DP', day) for day in (2, 5, 9, 12, 16, 19, 23, 26)]
        direct = point(why(a_goal(), tasks), 'Direct work')
        assert direct == {'label': 'Direct work', 'tone': 'good', 'text': 'All 8 sessions lately went right at this goal.'}

    def test_on_track_says_what_makes_it_work(self):
        tasks = [task('USACO Gold DP', day) for day in (2, 5, 9, 12, 16, 19, 23, 26)]
        found = why(a_goal(due_in=200), tasks)
        assert found['lead'].startswith("You'll make it because you do 2.1 sessions a week and it only needs")

    def test_stalled_says_when_and_what_took_over(self):
        tasks = [task('USACO Gold DP', day) for day in (35, 40, 45, 50, 55, 60)] + \
                [task('Refactor my website', day) for day in (2, 6, 10)]
        found = why(a_goal(), tasks)
        assert found['lead'].startswith('No session on this since Sep 28.')
        assert 'pushed out' in found['lead']
        assert point(found, 'Last session')['text'] == 'Your last task on this was 35 days ago.'

    def test_it_compares_with_the_subject_the_work_is_really_filed_under(self):
        tasks = [task('USACO Gold DP', day, subject='music') for day in (2, 6)] + \
                [task('Theory homework', day, subject='music') for day in (3, 4, 5, 7, 8)] + \
                [task('Refactor my website', day) for day in (3, 4)]
        found = point(why(a_goal(), tasks), 'Direct work')
        assert found['text'].startswith('Only 2 of your 7 Music sessions')

    def test_none_direct_says_none(self):
        tasks = [task('Refactor my website', day) for day in (2, 6)]
        found = point(why(a_goal(), tasks), 'Direct work')
        assert found['text'].startswith('None of your 2 Computer Science sessions lately')

    def test_a_long_gap_is_said_in_years(self):
        tasks = [task('USACO Gold DP', 1153)]
        assert point(why(a_goal(), tasks), 'Last session')['text'] == 'Your last task on this was over 3 years ago.'

    def test_what_is_missing_drops_the_due_date(self):
        found = why(a_goal(subjects=''), [])
        assert found['lead'].startswith('Link a subject')


class TestThePoints:
    def test_a_slump_on_just_this_goal_says_it_got_pushed_out(self):
        tasks = [task('USACO Gold DP', day) for day in (15, 17, 19, 21, 23, 25, 3)] + \
                [task('Dinner', day, subject='friends') for day in (1, 2, 4, 5, 6, 7, 8, 9, 16)]
        slump = point(why(a_goal(), tasks), 'Slump')
        assert slump['text'].startswith('1 session in the last two weeks, down from 6.')
        assert 'pushed out' in slump['text']

    def test_a_slump_across_everything_says_so(self):
        tasks = [task('USACO Gold DP', day) for day in (15, 17, 19, 21, 23, 25)] + \
                [task('Dinner', day, subject='friends') for day in (16, 18, 20, 22)]
        slump = point(why(a_goal(), tasks), 'Slump')
        assert 'All your work fell too' in slump['text']

    def test_no_slump_with_too_little_before(self):
        tasks = [task('USACO Gold DP', day) for day in (20, 25)]
        assert point(why(a_goal(), tasks), 'Slump') is None

    def test_next_step_named_or_not(self):
        steps = [{'id': 'a', 'title': 'Graph traversal', 'done': False}]
        named = [task('USACO Gold graph traversal', day) for day in (3, 8, 13)]
        assert point(why(a_goal(steps=steps), named), 'Next step')['tone'] == 'good'
        other = [task('USACO Gold greedy', day) for day in (3, 8, 13)]
        found = point(why(a_goal(steps=steps), other), 'Next step')
        assert found['tone'] == 'bad' and 'Graph traversal' in found['text']

    def test_when_the_work_happens_and_when_it_goes_better(self):
        tasks = [task('USACO Gold DP', day, hour=9, execution=5) for day in (2, 4, 6)] + \
                [task('USACO Gold DP', day, hour=20, execution=3) for day in (8, 10, 12, 14, 16)]
        timing = point(why(a_goal(), tasks), 'Timing')
        assert 'You mostly do this in the evening (5 of 8)' in timing['text']
        assert 'It goes better in the morning: 5 of 5 vs. 3 in the evening.' in timing['text']
        assert timing['tone'] == 'bad'

    def test_timing_waits_for_enough_sessions(self):
        assert point(why(a_goal(), [task('USACO Gold DP', day) for day in (3, 6)]), 'Timing') is None

    def test_ratings_falling_is_a_point(self):
        tasks = [task('USACO Gold DP', day, execution=2) for day in (2, 6, 10)] + \
                [task('USACO Gold DP', day, execution=4) for day in (35, 40, 45)]
        assert 'dropped to 2 of 5, down from 4' in point(why(a_goal(), tasks), 'How it went')['text']

    def test_the_reason_picked_most_is_a_point(self):
        tasks = [task('USACO Gold DP', day, execution=3, reason='low-energy') for day in (2, 6, 10)]
        assert 'low energy (3 times)' in point(why(a_goal(), tasks), 'How it went')['text']

    def test_the_lowest_topic_is_named(self):
        tasks = [task('USACO Gold dynamic programming', day, execution=2) for day in (2, 6, 10)] + \
                [task('USACO Gold practice', day, execution=5) for day in (3, 7, 11, 15)]
        weak = point(why(a_goal(), tasks), 'Weak spot')
        assert weak and 'of 5 vs.' in weak['text']

    def test_overdue_sessions_are_called_out(self):
        tasks = [task('USACO Gold DP', 3), {'id': 'late', 'title': 'USACO Gold graphs', 'status': 'pending',
                                            'due_date': ago(4)}]
        assert point(why(a_goal(), tasks), 'Overdue')['text'] == '1 task on this is past due and still open.'

    def test_timing_always_makes_the_cut(self):
        tasks = [task('USACO Gold dynamic programming', day, execution=1, reason='low-energy') for day in (15, 17, 19, 21, 23)] + \
                [task('USACO Gold practice', day, execution=5) for day in (30, 33, 36, 39)] + \
                [task('Refactor my website', day) for day in range(1, 12)] + \
                [{'id': 'late', 'title': 'USACO Gold graphs', 'status': 'pending', 'due_date': ago(4)}]
        steps = [{'id': 'a', 'title': 'Graph traversal', 'done': False}]
        found = why(a_goal(steps=steps), tasks)
        assert len(found['points']) <= gw.MOST_POINTS
        assert point(found, 'Timing')

    def test_no_dashes_or_curly_quotes_anywhere(self):
        tasks = [task('USACO Gold DP', day, execution=2) for day in (2, 5, 9, 12, 16, 19, 23)]
        found = why(a_goal(due_in=5), tasks)
        text = found['lead'] + ' '.join(one['text'] for one in found['points'])
        assert not any(mark in text for mark in '—“”‘’')
