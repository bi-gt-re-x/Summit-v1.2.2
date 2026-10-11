"""About you: the answers from the end of sign-up, how detailed they are, and
the facts filed from them. The detail arithmetic is pinned by
shared/cases/background_detail.json in tests/test_shared_cases.py."""
from backend.tracking import background
from backend.tracking.background import brief_lines, detail, facts

NAMES = {'mathematics': 'Mathematics', 'computer-science': 'Computer Science',
         'science': 'Science', 'violin': 'Violin'}


def test_each_line_is_filed_by_what_it_says():
    found = facts({
        'describe': "I'm a 10th grader in Austin.",
        'doing': 'I practice Violin for an hour a day. I do math competitions on weekends. '
                 'I solve 20 problems a week.',
        'done': 'Qualified for AIME in Mathematics with a score of 7.\nBuilt a chess engine',
        'improve': 'Get to USACO Gold in Computer Science by March.',
    }, NAMES)
    by_text = {row['text']: row for row in found}
    assert by_text["I'm a 10th grader in Austin"]['kind'] == 'about'
    assert by_text['I practice Violin for an hour a day']['kind'] == 'activity'
    assert by_text['I practice Violin for an hour a day']['subject'] == 'violin'
    assert by_text['I do math competitions on weekends']['kind'] == 'activity'
    week = by_text['I solve 20 problems a week']
    assert (week['kind'], week['value'], week['unit']) == ('stat', 20.0, 'problems')
    aime = by_text['Qualified for AIME in Mathematics with a score of 7']
    assert (aime['kind'], aime['subject'], aime['value'], aime['unit']) == (
        'achievement', 'mathematics', 7.0, 'AIME')
    assert by_text['Built a chess engine']['kind'] == 'achievement'
    gold = by_text['Get to USACO Gold in Computer Science by March']
    assert (gold['kind'], gold['subject']) == ('aim', 'computer-science')


def test_the_longest_subject_name_wins():
    assert background.subject_in('I love Computer Science', NAMES) == 'computer-science'
    assert background.subject_in('Science fair winner', NAMES) == 'science'
    assert background.subject_in('nothing here', NAMES) is None


def test_nicknames_find_a_subject_the_account_has():
    names = {'mathematics': 'Mathematics', 'programming': 'Programming', 'music': 'Music'}
    assert background.subject_in('Qualified for AIME', names) == 'mathematics'
    assert background.subject_in('I code in C++ and Python', names) == 'programming'
    assert background.subject_in('Grade 8 violin', names) == 'music'
    # Not a subject the account has, so not a match, nickname or not.
    assert background.subject_in('ran a marathon', names) is None
    # A nickname inside another word is not the nickname.
    assert background.subject_in('mathematical', {'mathematics': 'Mathematics'}) is None


def test_bullets_and_numbering_come_off():
    found = facts({'done': '- Won the regional spelling bee\n2) Finished a marathon in 4 hours'}, {})
    assert [row['text'] for row in found] == ['Won the regional spelling bee',
                                              'Finished a marathon in 4 hours']


def test_the_brief_keeps_the_subject_and_the_general_and_drops_other_subjects():
    rows = [{'kind': 'achievement', 'text': 'Grade 8 violin', 'subject': 'violin'},
            {'kind': 'about', 'text': '10th grader', 'subject': None},
            {'kind': 'achievement', 'text': 'AIME qualifier', 'subject': 'mathematics'}]
    lines = brief_lines(rows, 'mathematics', NAMES)
    assert lines == ['Has done (Mathematics): AIME qualifier', 'About them: 10th grader']
    assert len(brief_lines(rows, None, NAMES)) == 3


def test_answers_are_capped():
    assert len(background.clean({'describe': 'x' * 5000})['describe']) == background.MAX_CHARS


def test_saving_files_facts_and_scores_the_detail(client):
    empty = client.get('/api/background').json()
    assert empty['success'] and empty['detail']['level'] == 'none' and empty['facts'] == []

    words = ' '.join(['word'] * 40)
    reply = client.post('/api/background', json={
        'describe': 'I am a high school junior. ' + words,
        'doing': 'I practice violin daily. ' + words,
        'done': 'Won a state math contest. ' + words,
        'improve': 'Get better at proofs. ' + words,
    }).json()
    assert reply['success'], reply
    assert reply['detail']['level'] == 'detailed'
    assert reply['detail']['head_start'] == 7
    kinds = {row['kind'] for row in reply['facts']}
    assert {'achievement', 'aim'} <= kinds

    # A second save replaces the facts rather than adding to them.
    again = client.post('/api/background', json={'done': 'Won a state math contest.'}).json()
    assert [row['text'] for row in again['facts']] == ['Won a state math contest']
    assert again['detail']['level'] == 'none'
    assert client.get('/api/background').json()['answers']['done'] == 'Won a state math contest.'


def test_one_account_cannot_see_anothers(client, stranger):
    client.post('/api/background', json={'done': 'Won a state math contest.'})
    assert stranger.get('/api/background').json()['facts'] == []


def test_detail_reads_the_shared_bands():
    assert detail({})['head_start'] == 0
