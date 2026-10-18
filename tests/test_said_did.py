"""Said vs did: the reader's words held against their record.

Pinned here: names are read (a task's name counts toward the subject it
mentions), everyday words don't pass for subjects, a timing line naming two
parts of the day says nothing, and filing only ever touches unfiled tasks.
"""
from datetime import date

from backend.tracking import said_did

from tests.conftest import make_account, sign_in

TODAY = date(2026, 10, 18)
NAMES = {'mathematics': 'Mathematics', 'algebra': 'Algebra', 'calculus': 'Calculus',
         'physics': 'Physics', 'chemistry': 'Chemistry', 'music': 'Music', 'violin': 'Violin',
         'work': 'Work', 'homework': 'Homework', 'friends': 'Friends', 'running': 'Running'}
GROUPS = {'mathematics': 'Math and science', 'algebra': 'Math and science',
          'calculus': 'Math and science', 'physics': 'Math and science',
          'chemistry': 'Math and science', 'music': 'Creative', 'violin': 'Creative',
          'work': 'Work', 'homework': 'Studying', 'friends': 'Life and home',
          'running': 'Health and fitness'}


def _task(title, subject='', day='2026-10-17', hour=10, at=[0]):
    at[0] += 1
    return {'id': str(at[0]), 'title': title, 'subject': subject, 'status': 'done',
            'completed_at': '{}T{:02d}:00:00'.format(day, hour)}


def _read(tasks, facts=(), insights=()):
    return said_did.readings(tasks, facts, insights, NAMES, GROUPS, today=TODAY)


def test_a_task_counts_for_the_subject_its_name_mentions():
    tasks = [_task('Violin practice', 'music'), _task('Violin lesson', 'music'),
             _task('Algebra set', 'mathematics')]
    found = _read(tasks, insights=[{'kind': 'goal', 'topic': 'goals',
                                    'text': 'Practice violin every day'}])
    aim = found['aims'][0]
    assert (aim['subject'], aim['tasks'], aim['share']) == ('violin', 2, 67)


def test_everyday_words_are_not_subjects():
    found = _read([_task('Algebra set', 'mathematics')],
                  insights=[{'kind': 'goal', 'topic': 'goals', 'text': 'Get a job at work I like'}])
    assert found['aims'] == []


def _history():
    """Enough old work that the account is past its first weeks."""
    return [_task('Algebra', 'mathematics', day='2026-08-0{}'.format(1 + n % 9)) for n in range(30)]


def test_aims_get_a_verdict_from_their_share():
    tasks = _history() + [_task('Algebra', 'mathematics') for _ in range(9)] + [_task('Physics reading')]
    found = _read(tasks, facts=[{'kind': 'aim', 'text': 'Get better at physics', 'subject': 'physics'}])
    assert found['stage'] == 'settled'
    assert found['aims'][0]['verdict'] == 'some'  # 1 of 10 is 10%
    found = _read(tasks[:-1], facts=[{'kind': 'aim', 'text': 'Physics', 'subject': 'physics'}])
    assert found['aims'][0]['verdict'] == 'none'


def test_a_new_account_is_getting_started_not_falling_short():
    found = _read([_task('Algebra', 'mathematics')],
                  facts=[{'kind': 'activity', 'text': 'Physics and violin', 'subject': None}])
    assert found['stage'] == 'new'
    assert {row['verdict'] for row in found['named']} == {'not_yet'}


def test_resources_belong_to_their_subject_and_hide_false_matches():
    names = {**NAMES, 'art': 'Art', 'swimming': 'Swimming', 'gym': 'Gym', 'computer_science': 'Computer Science'}
    groups = {**GROUPS, 'art': 'Creative', 'swimming': 'Health and fitness', 'gym': 'Health and fitness',
              'computer_science': 'Computing'}
    facts = [
        {'kind': 'activity', 'text': 'Use resources such as Art of Problem Solving and Alcumus', 'subject': 'art'},
        {'kind': 'activity', 'text': 'Analyze mistakes and work on improving execution', 'subject': 'work'},
        {'kind': 'activity', 'text': 'Swim, work on strength training', 'subject': 'work'},
        {'kind': 'activity', 'text': 'Practice competitive programming for USACO', 'subject': None},
    ]
    found = said_did.readings([], facts, [], names, groups, today=TODAY)
    rows = {row['subject']: row for row in found['named']}
    assert 'art' not in rows and 'work' not in rows
    assert rows['mathematics']['resources'] == ['Alcumus', 'Art of Problem Solving']
    assert set(rows) == {'mathematics', 'swimming', 'gym', 'computer_science'}


def test_a_line_naming_several_subjects_counts_for_each_and_rows_rank_by_mentions():
    facts = [
        {'kind': 'about', 'text': 'Focused on competitive mathematics, physics and violin'},
        {'kind': 'activity', 'text': 'Violin and music'},
        {'kind': 'activity', 'text': 'Play violin in orchestra'},
        {'kind': 'activity', 'text': 'Mathematics problem sets'},
    ]
    found = _read([], facts=facts)
    order = [(row['subject'], row['mentions']) for row in found['named']]
    assert order[:3] == [('violin', 3), ('mathematics', 2), ('physics', 1)]
    # Each row leads with the line most about it alone, not the shared opener.
    assert found['named'][0]['text'] == 'Play violin in orchestra'
    assert found['named'][0]['lines'][-1]['text'].startswith('Focused on')


def test_suggestions_are_built_from_the_figures():
    names = {**NAMES, 'swimming': 'Swimming', 'geometry': 'Geometry', 'art': 'Art',
             'computer_science': 'Computer Science', 'databases': 'Databases'}
    groups = {**GROUPS, 'swimming': 'Health and fitness', 'geometry': 'Math and science',
              'computer_science': 'Computing', 'databases': 'Computing'}
    facts = [
        {'kind': 'activity', 'text': 'Mathematics and competitive problem-solving'},
        {'kind': 'activity', 'text': 'Prepare for MathCounts with Alcumus'},
        {'kind': 'activity', 'text': 'Violin and music'},
        {'kind': 'activity', 'text': 'Swim twice a week'},
        {'kind': 'activity', 'text': 'Geometry and algebra'},
        {'kind': 'activity', 'text': 'Computer science and databases'},
    ]
    tasks = [_task('Calculus quiz', 'calculus', day='2026-10-1{}'.format(n)) for n in range(4)]
    found = said_did.readings(tasks, facts, [], names, groups, today=TODAY)
    tips = {tip['key']: tip for tip in found['suggestions']}

    assert 'narrow' in tips and 'Mathematics' in tips['narrow']['body']
    start = tips['start-top']['body']
    assert 'Mathematics comes up 2 times' in start and '"Alcumus: 10 problems"' in start
    assert 'Violin' in tips['practice']['body'] and 'Swimming' in tips['practice']['body']
    assert 'Calculus took 4 of your 4 tasks' in tips['drift']['body']
    for tip in found['suggestions']:
        assert '\u2014' not in tip['body'] and '\u201c' not in tip['body']


def test_old_work_is_outside_the_month():
    found = _read([_task('Physics', 'physics', day='2026-08-01')],
                  facts=[{'kind': 'aim', 'text': 'physics', 'subject': 'physics'}])
    assert found['aims'][0]['tasks'] == 0
    assert found['aims'][0]['last_on'] == '2026-08-01'


def test_timing_is_checked_against_the_hours():
    tasks = [_task('Algebra', 'mathematics', hour=20) for _ in range(12)]
    insights = [{'kind': 'preference', 'text': 'I work best in the morning'},
                {'kind': 'pattern', 'text': 'Evening review sets up the next morning'}]
    found = _read(tasks, insights=insights)
    assert len(found['timing']) == 1  # the second names two parts of the day
    row = found['timing'][0]
    assert (row['said'], row['share'], row['busiest'], row['matches']) == ('morning', 0, 'evening', False)


def test_timing_needs_enough_tasks():
    found = _read([_task('Algebra', 'mathematics')],
                  insights=[{'kind': 'preference', 'text': 'Mornings are best'}])
    assert found['timing'] == []


def test_topics_stay_inside_the_subjects_group():
    tasks = ([_task('Algebra set', 'mathematics') for _ in range(4)]
             + [_task('Long run with friends', 'running') for _ in range(4)])
    found = _read(tasks)
    names = {row['subject']: [t['subject'] for t in row['topics']] for row in found['topics']}
    assert names == {'mathematics': ['algebra']}


def test_unfiled_tasks_are_grouped_by_what_their_names_say():
    tasks = [_task('Chemistry lab'), _task('Chemistry quiz'), _task('Homework for physics'),
             _task('Call mom')]
    found = _read(tasks)
    groups = {row['subject']: len(row['ids']) for row in found['unfiled']['groups']}
    # Specific subjects beat generic ones: this homework is physics.
    assert groups == {'chemistry': 2, 'physics': 1}
    assert found['unfiled']['total'] == 4


def test_filing_only_touches_unfiled_tasks(app):
    from backend.database import connection as db
    make_account('filer')
    client = sign_in(app, 'filer')
    for title, subject in (('Chemistry lab', ''), ('Chemistry quiz', 'physics')):
        db.insert_row('tasks', {'id': db.new_id('tasks'), 'user_id': 'filer', 'title': title,
                                'subject': subject, 'status': 'done',
                                'completed_at': '2026-10-17T10:00:00', 'priority': 'medium'})
    ids = [str(row['id']) for row in db.rows_for('tasks', 'filer')]

    reply = client.post('/api/analytics/file_inferred',
                        json={'subject': 'chemistry', 'ids': ids}).json()

    assert reply['success'] and reply['filed'] == 1
    subjects = sorted(row['subject'] for row in db.rows_for('tasks', 'filer'))
    assert subjects == ['chemistry', 'physics']
    assert not client.post('/api/analytics/file_inferred',
                           json={'subject': 'not-a-subject', 'ids': ids}).json()['success']


def test_the_page_reads_it(app):
    make_account('reader2')
    client = sign_in(app, 'reader2')
    reply = client.get('/api/analytics/said').json()
    assert reply['success']
    assert set(reply) >= {'aims', 'activities', 'timing', 'topics', 'unfiled', 'days'}
