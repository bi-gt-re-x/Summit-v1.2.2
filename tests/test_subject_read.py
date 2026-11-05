"""A subject page has to say what the subject is for, going by where the work is.

The first tests are the two that started this, both from a real account: a violin goal
with 844 tasks in Music and no filing, where the page said no goal was set, and a math
contest filed under Computer Science, where the page read every CS task against it.
"""
from datetime import datetime, timedelta

from backend.tracking import priority, subject_read

NOW = datetime(2026, 11, 3, 10, 0)
TODAY = NOW.date()
_seq = [0]


def back(days):
    return (TODAY - timedelta(days=days)).isoformat()


def ahead(days):
    return (TODAY + timedelta(days=days)).isoformat()


def task(subject, days_ago, title='Practice set', execution=None, difficulty=None, **more):
    _seq[0] += 1
    row = {'id': 't-{}'.format(_seq[0]), 'title': title, 'status': 'done', 'subject': subject,
           'completed_at': back(days_ago) + 'T12:00:00', 'created_at': back(days_ago + 1) + 'T09:00:00',
           'execution': execution, 'difficulty': difficulty, 'xp_value': 40, 'completion_seconds': 1500}
    row.update(more)
    return row


def goal(title, subject='', deadline=None, priority_=5, current=5, target=15, **more):
    row = {'id': title.lower().replace(' ', '-'), 'title': title, 'status': 'active', 'measure': 'number',
           'subject_ids': subject, 'deadline': deadline if deadline is not None else ahead(200),
           'priority': priority_, 'current_value': current, 'target_number': target,
           'progress': current / target * 100, 'start_date': back(200), 'milestones': []}
    row.update(more)
    return row


def read(subject, tasks, goals, name=None):
    decision = priority.decide(goals, tasks, NOW, 60)
    return subject_read.read(subject, name or subject.title(), tasks, goals, [], decision, [], TODAY)


def violin_tasks(count=40):
    return [task('music', day, 'Violin practice', execution=4, difficulty=3) for day in range(1, count + 1)]


# ---- where the work is ------------------------------------------------------
def test_a_goal_with_its_work_here_counts_without_being_filed():
    found = read('music', violin_tasks(), [goal('Violin ARCT', deadline=ahead(800))])
    assert found['lead'] == 'violin-arct'
    assert found['goals'][0]['filed'] is False
    assert found['goals'][0]['work_here'] == 40
    assert 'None of your goals' not in found['card']['title']


def test_a_goal_filed_here_with_its_work_elsewhere_is_called_misfiled():
    tasks = [task('mathematics', day, 'AIME problem set', execution=4) for day in range(1, 41)]
    tasks += [task('computer_science', day, 'Graph problems', execution=4) for day in range(1, 21)]
    aime = goal('Reach AIME', subject='computer_science')
    found = read('computer_science', tasks, [aime], name='Computer Science')
    assert found['lead'] is None
    assert found['goals'] == []
    moved = found['misfiled'][0]
    assert (moved['title'], moved['work_here'], moved['work_total']) == ('Reach AIME', 0, 40)
    assert moved['home'] == 'mathematics'


def test_a_filing_with_too_little_work_to_dispute_stands():
    tasks = [task('mathematics', 1, 'AIME problem set')]
    found = read('computer_science', tasks, [goal('Reach AIME', subject='computer_science')])
    assert found['lead'] == 'reach-aime'
    assert found['misfiled'] == []


def test_counter_goals_never_lead():
    counter = goal('Earn 250,000 XP', subject='music', measure='xp', goal_type='xp', target_xp=250000)
    found = read('music', violin_tasks(), [counter])
    assert found['lead'] is None


def test_routines_are_not_work_on_a_goal():
    tasks = [task('meditation', day, 'Meditation') for day in range(1, 20)]
    found = read('meditation', tasks, [goal('Meditation retreat', deadline=ahead(100))])
    assert found['goals'] == []
    assert found['card']['title'].endswith('is a routine, so no goal rides on it.')


# ---- what the plan says -----------------------------------------------------
def behind_goal(subject_work='computer_science'):
    tasks = [task(subject_work, day * 7, 'USACO Gold problems', execution=4, difficulty=4) for day in range(1, 8)]
    return tasks, goal('USACO Gold', deadline=ahead(27), priority_=9, current=6, target=15)


def test_the_subject_the_plan_needs_most_says_so_with_the_pace():
    tasks, usaco = behind_goal()
    found = read('computer_science', tasks, [usaco], name='Computer Science')
    assert found['stance'] == 'first'
    assert found['card']['tone'] == 'bad'
    assert 'needs' in found['card']['figures'] and 'a week and you do' in found['card']['figures']


def test_work_going_elsewhere_gets_a_swap_named():
    tasks, usaco = behind_goal()
    tasks += [task('computer_science', day, 'LeetCode review', execution=4) for day in range(1, 11)]
    stones = [{'id': 's', 'title': 'Silver DP unassisted', 'status': 'active', 'position': 0, 'steps': []}]
    usaco = dict(usaco, milestones=stones)
    found = read('computer_science', tasks, [usaco], name='Computer Science')
    assert 'going elsewhere' in found['card']['title']
    assert 'Swap your next "LeetCode review"' in found['card']['suggests']
    assert 'Silver DP unassisted' in found['card']['suggests']


def test_aim_right_and_volume_short_says_that_instead():
    tasks, usaco = behind_goal()
    tasks += [task('computer_science', 3, 'USACO Gold problems', execution=4)]
    found = read('computer_science', tasks, [usaco], name='Computer Science')
    assert "There just isn't enough of it yet." in found['card']['title']
    assert 'Add' in found['card']['suggests']


def test_a_subject_ahead_of_its_goal_says_how_many_sessions_could_move():
    tasks, usaco = behind_goal()
    tasks += violin_tasks(28)
    violin = goal('Violin ARCT', deadline=ahead(800), priority_=5, current=5, target=15)
    found = read('music', tasks, [usaco, violin], name='Music')
    assert found['stance'] == 'waits'
    assert 'ahead of what Violin ARCT needs' in found['card']['title']
    assert 'a week could move from here to USACO Gold until' in found['card']['suggests']
    assert 'would still land on time' in found['card']['suggests']


def test_no_goal_says_so_and_offers_the_way_out():
    tasks = [task('physics', 3, 'Physics problems')]
    found = read('physics', tasks, [])
    assert found['stance'] == 'none'
    assert found['card']['title'] == 'None of your goals depends on Physics.'
    assert 'give it a goal' in found['card']['suggests']


def test_a_quiet_subject_with_no_goal_can_stay_parked():
    found = read('physics', [task('physics', 90, 'Physics problems')], [])
    assert "gone quiet" in found['card']['title']


# ---- what the work says ------------------------------------------------------
def ids(found):
    return [one['id'] for one in found['insights']]


def test_a_real_change_in_ratings_is_said_with_from_and_to():
    tasks = [task('music', day, 'Violin practice', execution=2, difficulty=3) for day in range(30, 60)]
    tasks += [task('music', day, 'Violin practice', execution=5, difficulty=3) for day in range(0, 30)]
    found = read('music', tasks, [goal('Violin ARCT', deadline=ahead(800))], name='Music')
    trend = next(one for one in found['insights'] if one['id'] == 'trend')
    assert '2.0 → 5.0' in trend['figures']
    assert trend['evidence'] == 'Potentially reliable'


def test_a_change_that_cant_be_told_from_noise_isnt_said():
    tasks = [task('music', day, 'Violin practice', execution=3 + day % 2, difficulty=3) for day in range(1, 61)]
    found = read('music', tasks, [goal('Violin ARCT', deadline=ahead(800))], name='Music')
    assert 'trend' not in ids(found)


def test_ratings_going_up_while_the_pace_is_short_are_read_together():
    tasks = [task('computer_science', day, 'USACO Gold problems', execution=2, difficulty=4) for day in range(40, 60, 2)]
    tasks += [task('computer_science', day, 'USACO Gold problems', execution=5, difficulty=4) for day in range(10, 30, 2)]
    found = read('computer_science', tasks, [goal('USACO Gold', deadline=ahead(14), priority_=9, current=1, target=15)],
                 name='Computer Science')
    trend = next(one for one in found['insights'] if one['id'] == 'trend')
    assert "but the pace hasn't caught up" in trend['title']
    assert 'more sessions' in trend['suggests']


def test_easy_work_going_worse_than_hard_is_read_against_the_goal():
    tasks = [task('music', day, 'Violin scales', execution=2, difficulty=1) for day in range(1, 21)]
    tasks += [task('music', day, 'Violin concerto', execution=5, difficulty=5) for day in range(1, 21)]
    found = read('music', tasks, [goal('Violin ARCT', deadline=ahead(800))], name='Music')
    level = next(one for one in found['insights'] if one['id'] == 'level')
    assert level['title'] == 'Easy work on Violin ARCT goes worse than the hard work.'


def test_work_below_the_goals_level_is_said():
    tasks = [task('music', day, 'Violin scales', execution=4, difficulty=2) for day in range(1, 21)]
    found = read('music', tasks, [goal('Violin ARCT', deadline=ahead(800))], name='Music')
    level = next(one for one in found['insights'] if one['id'] == 'level')
    assert 'below the hard level' in level['title']


def test_a_reason_needs_enough_behind_it_and_comes_with_what_to_try():
    from backend.tracking.next_sessions import STRUGGLES
    reason = next(key for key, label in STRUGGLES.items() if label == 'Could not focus')
    few = [task('music', day, 'Violin practice', execution=2, reason=reason) for day in range(1, 4)]
    assert 'reason' not in ids(read('music', few, [goal('Violin ARCT', deadline=ahead(800))], name='Music'))
    many = [task('music', day, 'Violin practice', execution=2, reason=reason) for day in range(1, 7)]
    found = read('music', many, [goal('Violin ARCT', deadline=ahead(800))], name='Music')
    said = next(one for one in found['insights'] if one['id'] == 'reason')
    assert '6 of the 6 times' in said['figures']
    assert 'phone in another room' in said['suggests']


def test_more_attending_than_doing_is_said():
    tasks = [task('mathematics', day, 'Abstract algebra lecture') for day in range(1, 11)]
    tasks += [task('mathematics', day, 'AIME problem set') for day in range(1, 4)]
    found = read('mathematics', tasks, [goal('Reach AIME', deadline=ahead(400))], name='Mathematics')
    said = next(one for one in found['insights'] if one['id'] == 'attended')
    assert said['title'] == 'You sat through more Mathematics than you practiced.'


def test_the_bad_news_comes_first_and_every_reading_has_its_three_parts():
    tasks = [task('music', day, 'Violin scales', execution=2, difficulty=1) for day in range(1, 21)]
    tasks += [task('music', day, 'Violin concerto', execution=5, difficulty=5) for day in range(1, 21)]
    from backend.tracking.next_sessions import GOOD
    good = next(iter(GOOD))
    tasks += [task('music', day, 'Violin concerto', execution=5, difficulty=5, reason=good) for day in range(1, 11)]
    found = read('music', tasks, [goal('Violin ARCT', deadline=ahead(800))], name='Music')
    tones = [one['tone'] for one in found['insights']]
    assert tones == sorted(tones, key=subject_read.ORDER.get)
    assert 'good' in tones and 'bad' in tones
    for one in [found['card']] + found['insights']:
        assert one['title'] and one['figures'] and one['suggests']
        for text in (one['title'], one['figures'], one['suggests']):
            assert '—' not in text and '“' not in text


# ---- what the sessions are written for ---------------------------------------
def test_the_sessions_are_written_for_the_goal_the_page_leads_with():
    tasks, usaco = behind_goal()
    tasks += violin_tasks(28)
    violin = goal('Violin ARCT', deadline=ahead(800))
    decision = priority.decide([usaco, violin], tasks, NOW, 60)
    lead = subject_read.lead_goal('music', tasks, [usaco, violin], decision, [], TODAY)
    assert lead['goal']['title'] == 'Violin ARCT'
    block = priority.session_block(subject_read.session_decision(lead, decision, tasks, [], TODAY, str), lead['goal'], [])
    assert 'Goal: Violin ARCT' in block
    assert 'leave_alone' not in block


def test_no_goal_means_no_goal_on_the_sessions():
    decision = priority.decide([], [], NOW, 60)
    assert subject_read.lead_goal('music', violin_tasks(), [], decision, [], TODAY) is None


def test_the_work_a_model_sees_is_narrowed_to_the_goal_unless_that_leaves_too_little():
    violin = goal('Violin ARCT')
    lead = {'goal': violin, 'terms': subject_read.goal_why.goal_terms(violin)}
    rows = [{'name': 'Violin practice #'}, {'name': 'Violin scales'}, {'name': 'Violin etudes'},
            {'name': 'Violin lesson'}, {'name': 'Music theory reading'}]
    assert [row['name'] for row in subject_read.narrowed(rows, lead, 'music')] == [row['name'] for row in rows[:4]]
    assert subject_read.narrowed(rows[3:], lead, 'music') == rows[3:]


