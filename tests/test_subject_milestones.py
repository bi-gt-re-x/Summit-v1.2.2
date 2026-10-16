"""Checkpoints set against a subject, and the goal drafted from them.

Nothing here calls a model. What is worth testing is the store's bounds, and
the two rules that keep subject checkpoints from quietly becoming goal
checkpoints.
"""
import pytest

from backend.api import subjects as api
from backend.tracking import subject_goal
from backend.tracking.subject_brief import BriefUnavailable


def test_a_subjects_checkpoints_round_trip(client):
    client.post('/api/subject_milestones', json={
        'subject': 'mathematics',
        'milestones': [
            {'id': 'a', 'title': 'Comfortable with proofs', 'done': False},
            {'id': 'b', 'title': 'Silver DP unassisted', 'done': True},
        ],
    })
    got = client.get('/api/subject_milestones').json()['milestones']

    assert [row['title'] for row in got['mathematics']] == [
        'Comfortable with proofs', 'Silver DP unassisted']
    assert [row['done'] for row in got['mathematics']] == [False, True]


def test_an_empty_list_clears_the_subject_rather_than_being_refused(client):
    """It is how somebody removes their last checkpoint."""
    client.post('/api/subject_milestones', json={
        'subject': 'music', 'milestones': [{'id': 'a', 'title': 'Sight-read grade 5'}]})
    assert 'music' in client.get('/api/subject_milestones').json()['milestones']

    body = client.post('/api/subject_milestones',
                       json={'subject': 'music', 'milestones': []}).json()
    assert body['success'] is True
    assert 'music' not in body['milestones']


def test_one_subject_at_a_time_leaves_the_others_alone(client):
    client.post('/api/subject_milestones', json={
        'subject': 'mathematics', 'milestones': [{'id': 'a', 'title': 'Proofs'}]})
    client.post('/api/subject_milestones', json={
        'subject': 'music', 'milestones': [{'id': 'a', 'title': 'Scales'}]})

    got = client.get('/api/subject_milestones').json()['milestones']
    assert set(got) == {'mathematics', 'music'}


def test_the_list_is_bounded_and_junk_is_dropped(client):
    client.post('/api/subject_milestones', json={
        'subject': 'mathematics',
        'milestones': (
            [{'id': str(n), 'title': 'Stage {}'.format(n)} for n in range(30)]
            # A blank title is not a checkpoint, and neither is a bare string.
            + [{'id': 'x', 'title': '   '}, 'not a dict']
        ),
    })
    rows = client.get('/api/subject_milestones').json()['milestones']['mathematics']

    assert len(rows) == api.MILESTONES_PER_SUBJECT
    assert all(row['title'].strip() for row in rows)


def test_a_title_longer_than_the_column_is_cut_rather_than_refused(client):
    client.post('/api/subject_milestones', json={
        'subject': 'mathematics', 'milestones': [{'id': 'a', 'title': 'x' * 500}]})
    rows = client.get('/api/subject_milestones').json()['milestones']['mathematics']
    assert len(rows[0]['title']) == api.MILESTONE_TITLE_MAX


def test_a_save_needs_a_subject(client):
    body = client.post('/api/subject_milestones', json={'subject': '  '}).json()
    assert body['success'] is False


# ---------------------------------------------------------------------------
# The drafted goal
# ---------------------------------------------------------------------------
def test_the_brief_carries_the_checkpoints_in_the_readers_order():
    """They are the stages the goal is written over, so order is the content."""
    brief = subject_goal.brief_from({
        'subject': 'Mathematics',
        'finished': 90,
        'milestones': ['Comfortable with proofs', 'Silver DP unassisted'],
    })

    assert brief.index('Comfortable with proofs') < brief.index('Silver DP unassisted')
    assert '90' in brief


class TestTheBriefCarriesDifficultyAndExecution:
    """The half this brief used to leave out.

    Volume sizes a target and cannot pitch it. "Forty tasks" is met just as
    easily at a difficulty somebody has already cleared as at the one they keep
    falling off, so a goal drafted from counts alone can be reached without the
    reader getting any better at the subject — which is the one way a goal on
    this page can actively mislead. The write-up and the route were always
    given the bands; this is the same evidence in the same words.
    """

    FINDINGS = {
        'subject': 'Computer Science',
        'finished': 214,
        'days': 365,
        'aim': 'USACO Gold',
        'level': 'Silver',
        'rates': [{'label': 'Quality', 'now': 48}, {'label': 'Consistency', 'now': 57}],
        'bands': [{'label': 'Trivial', 'done': 30, 'holding': 90},
                  {'label': 'Hard', 'done': 18, 'holding': 39}],
        'struggles': [{'label': 'Ran out of time', 'share': 31, 'count': 18}],
        'milestones': ['Silver DP unassisted'],
    }

    def test_each_band_arrives_with_its_execution(self):
        brief = subject_goal.brief_from(self.FINDINGS)
        assert 'Trivial: 30 finished, execution 90' in brief
        assert 'Hard: 18 finished, execution 39' in brief

    def test_the_rates_arrive(self):
        brief = subject_goal.brief_from(self.FINDINGS)
        assert 'Quality: 48' in brief

    def test_what_goes_wrong_arrives(self):
        brief = subject_goal.brief_from(self.FINDINGS)
        assert 'Ran out of time' in brief
        assert '31%' in brief

    def test_the_aim_arrives_with_the_level_beside_it(self):
        brief = subject_goal.brief_from(self.FINDINGS)
        assert 'USACO Gold' in brief
        assert 'Silver' in brief

    def test_a_subject_with_nothing_rated_leaves_the_sections_out(self):
        """An empty section is a line the model has to interpret, and it
        guesses. The same rule the rest of this brief follows."""
        brief = subject_goal.brief_from({'subject': 'Music', 'finished': 4})
        assert 'execution' not in brief
        assert 'went badly' not in brief
        assert 'out of 100' not in brief

    def test_the_prompt_says_to_pitch_on_the_bands(self):
        # The evidence is only worth sending if the prompt asks for it to be
        # used, and "size it on volume" was all it said before.
        assert 'DIFFICULTY AND EXECUTION' in subject_goal.SYSTEM


def test_the_brief_says_plainly_when_there_are_no_checkpoints():
    """An empty list has to read as an absence, not as a missing line.

    The model is asked to write the stages itself in that case, and it can only
    know to do that if the brief says so.
    """
    brief = subject_goal.brief_from({'subject': 'Mathematics'})
    assert "hasn't written any checkpoints" in brief


def test_a_draft_is_bounded_to_what_add_goal_will_take():
    cleaned = subject_goal._clean({
        'title': 'Competition ready',
        'why': 'because',
        'unit': 'problems',
        'target': 10 ** 9,
        'weeks': 500,
        'milestones': ['a'] * 20,
    })

    assert cleaned['target'] == subject_goal.TARGET[1]
    assert cleaned['weeks'] == subject_goal.WEEKS[1]
    assert len(cleaned['milestones']) == subject_goal.MILESTONES


def test_a_draft_with_no_title_is_a_failure_rather_than_an_unnamed_goal():
    with pytest.raises(BriefUnavailable):
        subject_goal._clean({'title': '   ', 'target': 10, 'weeks': 4})


def test_a_non_numeric_target_falls_back_rather_than_crashing():
    cleaned = subject_goal._clean({
        'title': 'Something', 'target': 'lots', 'weeks': 'a while', 'milestones': []})
    assert isinstance(cleaned['target'], int)
    assert isinstance(cleaned['weeks'], int)


def test_without_a_key_the_draft_says_so(client, monkeypatch):
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    response = client.post('/api/suggest_subject_goal', json={'subject': 'Maths'})

    assert response.status_code == 200
    assert response.json()['success'] is False
    assert 'ANTHROPIC_API_KEY' in response.json()['message']


# ---------------------------------------------------------------------------
# What the account says it is chasing
# ---------------------------------------------------------------------------
def test_the_ambition_is_a_preference_and_never_a_goal(client):
    """It is the sentence that says what the work is for, not a commitment.

    A goal on the goals page has a number, a date and progress read off the
    record. "Get to Mathcounts Nationals" has none of those, and putting it
    there would give it a progress bar nobody can honestly fill in.
    """
    client.post('/api/settings', json={'values': {'analytics_ambitions': {
        'mathematics': {'aim': 'Mathcounts Nationals', 'level': 'State qualifier'},
    }}})

    got = client.get('/api/settings').json()['settings']['analytics_ambitions']
    assert got['mathematics']['aim'] == 'Mathcounts Nationals'
    assert got['mathematics']['level'] == 'State qualifier'

    # And nothing reached the goals table.
    assert client.get('/api/get_goals').json()['goals'] == []


def test_an_ambition_with_neither_field_is_dropped(client):
    """A subject the reader skipped has no ambition, not an empty one.

    An empty record would reach the model as an aim it could not make out.
    """
    client.post('/api/settings', json={'values': {'analytics_ambitions': {
        'mathematics': {'aim': '', 'level': ''},
        'music': {'aim': 'Grade 8', 'level': ''},
    }}})
    got = client.get('/api/settings').json()['settings']['analytics_ambitions']

    assert 'mathematics' not in got
    assert got['music']['aim'] == 'Grade 8'


def test_a_flat_string_where_a_record_belongs_is_refused(client):
    """The value is two fields. A client sending one string has a bug."""
    assert client.post('/api/settings', json={
        'values': {'analytics_ambitions': {'mathematics': 'Nationals'}},
    }).status_code == 400


def test_the_brief_carries_the_aim_and_the_stages():
    """Without them the model is reading a table with no destination."""
    from backend.tracking import subject_brief

    brief = subject_brief.brief_from({
        'subject': 'Mathematics',
        'aim': 'Mathcounts Nationals',
        'level': 'State qualifier',
        'checkpoints': ['Comfortable with proofs', 'Silver DP unassisted'],
    })

    assert 'Mathcounts Nationals' in brief
    assert 'State qualifier' in brief
    assert brief.index('Comfortable with proofs') < brief.index('Silver DP unassisted')


def test_the_brief_says_nothing_about_an_aim_that_was_never_set():
    """An empty line reads as an aim the model could not make out."""
    from backend.tracking import subject_brief

    brief = subject_brief.brief_from({'subject': 'Mathematics', 'score': 61})
    assert 'chasing' not in brief
    assert 'Where they say they are' not in brief
