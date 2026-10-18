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


def test_aims_get_a_verdict_from_their_share():
    tasks = [_task('Algebra', 'mathematics') for _ in range(9)] + [_task('Physics reading')]
    found = _read(tasks, facts=[{'kind': 'aim', 'text': 'Get better at physics', 'subject': 'physics'}])
    assert found['aims'][0]['verdict'] == 'some'  # 1 of 10 is 10%
    found = _read(tasks[:9], facts=[{'kind': 'aim', 'text': 'Physics', 'subject': 'physics'}])
    assert found['aims'][0]['verdict'] == 'none'


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
