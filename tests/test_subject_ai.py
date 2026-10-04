"""The subject page's interpretation layer, and the loop that checks it.

Nothing here calls a model. What is worth testing is everything around the
call: the sections that go in, the bounds that come out, and the two states
that are not "it worked" — no key, and an answer that cannot be read.

The rule the feature exists to keep is that the model may reason over the
page's figures and may not produce any others. That used to live only in the
prompt; `_clean` now checks it against the brief the model was sent, so the
last class here asserts it directly rather than asserting the conditions that
make it likely. The rest still hold those conditions — every counted figure
reaches the brief, the two figures the model *is* asked for are clamped, and
the vocabulary it is handed is labelled as a curriculum rather than as a
measurement.
"""
import pytest

from backend.tracking import subject_ai


STATE = {
    'subject': 'Algebra',
    'span': '30D',
    'aim': 'Get 24 on the AMC 8',
    'overall': 59,
    'finished': 33,
    'finished_before': 21,
    'rated': 31,
    'active_days': 11,
    'dimensions': [
        {'label': 'Mastery', 'value': 47, 'meaning': 'How hard the work is.',
         'evidence': ['31 rated tasks', 'mean difficulty 2.9 of 5']},
        {'label': 'Execution', 'value': 67, 'meaning': 'How it goes.',
         'evidence': ['mean 3.7 of 5']},
    ],
    'curve': {
        'rungs': [
            {'level': 3, 'label': 'Fair', 'done': 10, 'execution': 75,
             'quality': 60, 'cleared': 100, 'minutes': 25.0},
            {'level': 4, 'label': 'Hard', 'done': 9, 'execution': 25,
             'quality': 32, 'cleared': 0, 'minutes': 43.3},
        ],
        'best': {'label': 'Fair', 'execution': 75},
        'threshold': {'label': 'Hard', 'execution': 25},
        'drop': 50,
    },
    'time': {'known': True, 'typical': 25.0, 'hours': 14.3, 'drift': -1.2,
             'efficiency': 62, 'quicker': 55, 'rushed': 0, 'thorough': 9},
    'momentum': {'known': True, 'earlier': 51, 'later': 67, 'change': 16,
                 'direction': 'climbing'},
    'mistakes': [{'label': 'Kept getting interrupted', 'count': 4, 'share': 40}],
    'goals': [{'title': 'Get 24 on the AMC 8', 'progress': 50,
               'deadline': '2026-11-01', 'standing': 'projected 16 days late',
               'levers': ['Aim more of this subject at it — 2 of 11 tasks named it.']}],
    'vocabulary': ['Algebra', 'Equations', 'Functions', 'Inequalities'],
    'previous': [{'title': 'Timed Fair set', 'type': 'timed_set',
                  'difficulty': 3, 'minutes': 20, 'on': '2026-08-20'}],
    'outcomes': [{'type': 'timed_set', 'given': 3, 'taken': 2, 'change': 7}],
}


# ---------------------------------------------------------------------------
# The brief
# ---------------------------------------------------------------------------
def test_every_counted_figure_reaches_the_model():
    """A figure dropped on the way in is one the model is then forbidden to use.

    The prompt's whole instruction is "quote these and add nothing", which is
    only workable if the numbers on the reader's screen all arrive.
    """
    brief = subject_ai.brief_from(STATE)

    for expected in ('Algebra', '59', '33', '31', '11',
                     'Mastery: 47', 'Execution: 67', 'mean difficulty 2.9 of 5',
                     'Fair', 'Hard', '75', '25', '50',
                     '14.3', '62', 'climbing', '16',
                     'Kept getting interrupted', '40%',
                     'Get 24 on the AMC 8', 'timed_set'):
        assert expected in brief, expected


def test_the_brief_is_sectioned_so_the_instruction_can_name_a_section():
    """XML sections are not decoration. "Use the figures in
    <difficulty_analysis>" is followable in a way "use the figures above" is
    not, and a later change to one section leaves the others alone."""
    brief = subject_ai.brief_from({**STATE, 'recent_work': WORK})

    for section in ('subject_profile', 'dimensions', 'difficulty_analysis',
                    'time_analysis', 'recent_trends', 'mistake_patterns',
                    'recent_work', 'skill_vocabulary', 'goals',
                    'recommendation_outcomes'):
        assert '<{}>'.format(section) in brief, section
        assert '</{}>'.format(section) in brief, section


def test_the_skill_vocabulary_is_labelled_as_a_curriculum():
    """The single worst thing this feature could produce is "your circle
    geometry is at 68%" — a number about a person that nobody counted. Summit
    records a subject and a difficulty and nothing finer, so the area names
    have to arrive labelled as what they are."""
    brief = subject_ai.brief_from(STATE)

    assert 'NO measurement' in brief
    assert 'Equations' in brief
    # And the prompt has to say the same thing, since the label alone is a
    # hint rather than an instruction.
    assert 'It does **not** record' in subject_ai.SYSTEM
    assert 'a sub-skill' in subject_ai.SYSTEM
    assert 'MAY NOT state or imply the reader' in subject_ai.SYSTEM


def test_an_empty_section_is_left_out_rather_than_sent_blank():
    """An empty section is one the model has to decide means nothing, and it
    sometimes decides wrong."""
    brief = subject_ai.brief_from({'subject': 'Violin', 'dimensions': []})

    assert 'Violin' in brief
    assert '<mistake_patterns>' not in brief
    assert '<recommendation_outcomes>' not in brief


def test_a_kind_never_acted_on_reports_no_change_rather_than_none():
    """"It did not work" and "it was never tried" are different findings, and
    a zero would collapse them into the first."""
    brief = subject_ai.brief_from({
        **STATE,
        'outcomes': [{'type': 'review', 'given': 4, 'taken': 0, 'change': None}],
    })
    assert 'review: 4 recommended, 0 acted on' in brief


# ---------------------------------------------------------------------------
# The answer
# ---------------------------------------------------------------------------
def test_the_two_figures_the_model_supplies_are_clamped():
    """Difficulty and duration are the only numbers it is allowed to invent,
    and a 400-minute session at difficulty 9 is not a suggestion this page
    should print however confidently it arrives."""
    cleaned = subject_ai._clean({
        'diagnosis': [],
        'priorities': [],
        'next_steps': [
            {'title': 'Marathon', 'focus': 'Algebra', 'type': 'timed_set',
             'difficulty': 9, 'duration_minutes': 400, 'reason': 'x', 'drills': []},
            {'title': 'Atom', 'focus': 'Algebra', 'type': 'review',
             'difficulty': 0, 'duration_minutes': 1, 'reason': 'x', 'drills': []},
        ],
        'insights': [],
    })

    assert [step['difficulty'] for step in cleaned['next_steps']] == [5, 1]
    assert [step['minutes'] for step in cleaned['next_steps']] == [120, 10]


def test_an_unknown_session_kind_lands_in_a_known_bucket():
    """The feedback loop counts by kind. A free-text type would produce twelve
    spellings of "practice" and therefore no counts at all."""
    cleaned = subject_ai._clean({
        'diagnosis': [], 'priorities': [], 'insights': [],
        'next_steps': [{'title': 'Something', 'focus': 'x', 'type': 'vibes',
                        'difficulty': 3, 'duration_minutes': 30,
                        'reason': 'x', 'drills': []}],
    })
    assert cleaned['next_steps'][0]['type'] in subject_ai.STEP_TYPES


def test_confidence_out_of_range_is_not_confidence():
    cleaned = subject_ai._clean({
        'diagnosis': [
            {'finding': 'A', 'confidence': 4.2, 'evidence': ['x']},
            {'finding': 'B', 'confidence': -1, 'evidence': ['x']},
            {'finding': 'C', 'confidence': 'very', 'evidence': ['x']},
        ],
        'priorities': [], 'next_steps': [], 'insights': [],
    })
    assert [row['confidence'] for row in cleaned['diagnosis']] == [1.0, 0.0, 0.5]


def test_each_list_is_cut_to_what_the_page_draws():
    """The product rule: the database can be exhaustive and the UI selective.
    A page of forty-seven findings answers no question."""
    cleaned = subject_ai._clean({
        'diagnosis': [{'finding': 'd{}'.format(n), 'confidence': 0.5,
                       'evidence': ['a', 'b', 'c', 'd', 'e']} for n in range(9)],
        'priorities': [{'focus': 'p{}'.format(n), 'weight': 0.5, 'reason': 'x'}
                       for n in range(9)],
        'next_steps': [{'title': 's{}'.format(n), 'focus': 'x', 'type': 'review',
                        'difficulty': 3, 'duration_minutes': 30, 'reason': 'x',
                        'drills': ['a', 'b', 'c', 'd', 'e', 'f']} for n in range(9)],
        'insights': [{'observation': 'i{}'.format(n), 'evidence': 'x',
                      'implication': 'y'} for n in range(9)],
    })

    assert len(cleaned['diagnosis']) == subject_ai.DIAGNOSES
    assert len(cleaned['priorities']) == subject_ai.PRIORITIES
    assert len(cleaned['next_steps']) == subject_ai.NEXT_STEPS
    assert len(cleaned['insights']) == subject_ai.INSIGHTS
    assert len(cleaned['diagnosis'][0]['evidence']) == 4
    assert len(cleaned['next_steps'][0]['drills']) == 4


def test_an_empty_answer_is_a_failure_rather_than_an_empty_page():
    with pytest.raises(subject_ai.BriefUnavailable):
        subject_ai._clean({'diagnosis': [], 'priorities': [],
                           'next_steps': [], 'insights': []})


# ---------------------------------------------------------------------------
# The goal, which the page now opens on
# ---------------------------------------------------------------------------
def test_an_unrecognised_goal_kind_becomes_the_honest_one():
    """The kind decides what counts as progress, and the page draws a word per
    kind. A twelfth spelling of "exam" steers nothing and draws nothing, so it
    lands on `unstated` rather than becoming a category of one."""
    cleaned = subject_ai._clean({
        'goal_read': {'objective': 'Qualify for AIME', 'kind': 'contest',
                      'focus': 'Reproduce it under a clock.', 'why_kind': ''},
        'diagnosis': [], 'priorities': [], 'next_steps': [],
        'insights': [], 'goal_evidence': [],
    })

    assert cleaned['goal_read']['kind'] == 'unstated'
    assert cleaned['goal_read']['objective'] == 'Qualify for AIME'


def test_a_band_sentence_citing_an_uncounted_figure_is_blanked_not_dropped():
    """The band keeps its heading when one clause overreaches.

    Unlike a card, which is dropped whole: a card *is* its figures and one with
    the uncounted line removed still reads as counted, whereas a band that lost
    its heading to a bad strapline would take the page's first section with it.
    """
    cleaned = subject_ai._clean({
        'goal_read': {
            'objective': 'Qualify for AIME',
            'kind': 'competition',
            'focus': 'Your recursion is at 68, so drill it.',
            'why_kind': '',
        },
        'diagnosis': [], 'priorities': [], 'next_steps': [],
        'insights': [], 'goal_evidence': [],
    }, brief=BRIEF)

    assert cleaned['goal_read']['objective'] == 'Qualify for AIME'
    assert cleaned['goal_read']['kind'] == 'competition'
    assert cleaned['goal_read']['focus'] == ''


def test_an_evidence_card_citing_an_uncounted_figure_goes_whole():
    cleaned = subject_ai._clean({
        'goal_evidence': [
            {'claim': 'Consistency is holding.', 'direction': 'helps',
             'evidence': ['Consistency: 57'], 'relevance': 'It is the measure.'},
            {'claim': 'Recursion is at 68.', 'direction': 'hurts',
             'evidence': ['recursion 68'], 'relevance': 'Drill it.'},
        ],
        'diagnosis': [], 'priorities': [], 'next_steps': [], 'insights': [],
    }, brief=BRIEF)

    assert len(cleaned['goal_evidence']) == 1
    assert cleaned['goal_evidence'][0]['claim'] == 'Consistency is holding.'


def test_the_evidence_cards_are_cut_to_what_the_section_draws():
    card = {'claim': 'A claim.', 'direction': 'helps', 'evidence': [],
            'relevance': 'Because.'}
    cleaned = subject_ai._clean({
        'goal_evidence': [card] * 9,
        'diagnosis': [], 'priorities': [], 'next_steps': [], 'insights': [],
    })

    assert len(cleaned['goal_evidence']) == subject_ai.GOAL_EVIDENCE


# ---------------------------------------------------------------------------
# The bottleneck, and the test attached to each step
# ---------------------------------------------------------------------------
def test_a_bottleneck_is_dropped_whole_when_any_part_of_it_is_invented():
    """Unlike the band, which is blanked clause by clause.

    This is the page's only outright judgement rather than one of its
    measurements, and a judgement with its working quietly removed is the exact
    thing a reader has no way to check by looking.
    """
    cleaned = subject_ai._clean({
        'bottleneck': {
            'name': 'Reliable execution',
            'evidence': ['Consistency: 57', 'recursion sits at 68'],
            'reading': 'The ceiling is ahead of the reliability.',
            'ruled_out': '', 'confidence': 0.8,
        },
        'goal_evidence': [], 'diagnosis': [], 'priorities': [],
        'next_steps': [], 'insights': [],
        # Something has to survive, or the empty-answer guard fires and the
        # assertion below is never reached. A goal with no figure in it is not
        # something the record check has an opinion about.
        'goal_read': {'objective': 'Qualify for AIME', 'kind': 'competition',
                      'focus': '', 'why_kind': ''},
    }, brief=BRIEF)

    assert cleaned['bottleneck'] == {}


def test_a_bottleneck_whose_figures_were_all_counted_survives():
    cleaned = subject_ai._clean({
        'bottleneck': {
            'name': 'Reliable execution',
            'evidence': ['Consistency: 57'],
            'reading': 'The ceiling is ahead of the reliability.',
            'ruled_out': 'Harder material is not the next move.',
            'confidence': 4,
        },
        'goal_evidence': [], 'diagnosis': [], 'priorities': [],
        'next_steps': [], 'insights': [],
    }, brief=BRIEF)

    assert cleaned['bottleneck']['name'] == 'Reliable execution'
    assert cleaned['bottleneck']['ruled_out'] == 'Harder material is not the next move.'
    # Out-of-range confidence is not confidence, here as everywhere else.
    assert cleaned['bottleneck']['confidence'] == 1.0


def test_a_signal_naming_a_figure_nobody_counted_is_dropped():
    """The signal is a prediction about a figure, so it is held to the record
    the same way the reason is: a test the reader cannot run is not a test.

    The step survives it. The two figures on a step are the model's own and
    the title is a prescription; losing the signal costs the loop its check,
    not the reader their session.
    """
    cleaned = subject_ai._clean({
        'next_steps': [{
            'title': 'Timed set at Fair',
            'focus': 'Algebra',
            'type': 'timed_set',
            'difficulty': 3,
            'duration_minutes': 40,
            'reason': 'Consistency: 57 is the measure holding it down.',
            'signal': 'If recursion moves past 68 this is working.',
            'drills': ['ten past-paper problems'],
        }],
        'goal_evidence': [], 'diagnosis': [], 'priorities': [], 'insights': [],
    }, brief=BRIEF)

    assert len(cleaned['next_steps']) == 1
    assert cleaned['next_steps'][0]['signal'] == ''
    assert cleaned['next_steps'][0]['reason'].startswith('Consistency')


def test_a_signal_quoting_the_brief_is_kept():
    cleaned = subject_ai._clean({
        'next_steps': [{
            'title': 'Timed set at Fair',
            'focus': 'Algebra',
            'type': 'timed_set',
            'difficulty': 3,
            'duration_minutes': 40,
            'reason': 'Consistency: 57 is the measure holding it down.',
            'signal': 'Consistency: 57 should rise while the level you file stays the same.',
            'drills': [],
        }],
        'goal_evidence': [], 'diagnosis': [], 'priorities': [], 'insights': [],
    }, brief=BRIEF)

    assert cleaned['next_steps'][0]['signal'].startswith('Consistency: 57 should rise')


def test_an_answer_that_is_only_goal_evidence_is_still_an_answer():
    """The section it fills is the page's second one, so a reading that
    produced nothing else is a reading worth drawing."""
    cleaned = subject_ai._clean({
        'goal_evidence': [{'claim': 'Consistency is holding.',
                           'direction': 'helps', 'evidence': [],
                           'relevance': 'It is the measure.'}],
        'diagnosis': [], 'priorities': [], 'next_steps': [], 'insights': [],
    })

    assert len(cleaned['goal_evidence']) == 1


# ---------------------------------------------------------------------------
# Without a key
# ---------------------------------------------------------------------------
def test_without_a_key_it_says_so_instead_of_calling_anything(monkeypatch):
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    monkeypatch.setenv('HF_TOKEN', 'a-token-that-does-not-help-here')

    assert subject_ai.configured() is False
    with pytest.raises(subject_ai.BriefUnavailable) as caught:
        subject_ai.read(STATE)
    assert 'ANTHROPIC_API_KEY' in str(caught.value)


# ---------------------------------------------------------------------------
# The endpoints, and the loop
# ---------------------------------------------------------------------------
def test_the_endpoint_reports_availability_rather_than_failing(client, monkeypatch):
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    body = client.get('/api/subject_reading').json()
    assert body['success'] is True
    assert body['available'] is False


def test_the_endpoint_answers_readably_rather_than_erroring(client, monkeypatch):
    """A reading that cannot be made is not a broken request. The analytics
    under it were already complete."""
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    response = client.post('/api/subject_reading', json={'subject': 'Algebra'})

    assert response.status_code == 200
    assert response.json()['success'] is False
    assert 'ANTHROPIC_API_KEY' in response.json()['message']


def test_the_endpoint_needs_a_subject(client):
    response = client.post('/api/subject_reading', json={'subject': '  '})
    assert response.status_code == 200
    assert response.json()['success'] is False


def test_recommendations_start_empty_and_do_not_error(client):
    body = client.get('/api/subject_recommendations?subject=Algebra').json()
    assert body['success'] is True
    assert body['recommendations'] == []
    assert body['outcomes'] == []


def test_taking_a_recommendation_that_is_not_on_record_says_so(client):
    body = client.post('/api/subject_recommendation',
                       json={'id': 'nope', 'task_id': ''}).json()
    assert body['success'] is False


def test_outcomes_separate_never_tried_from_did_not_work():
    """The distinction the whole loop exists for. A kind recommended six times
    and never acted on has no change to report, and reporting nought would
    read as a verdict on it."""
    from backend.api.subject_ai import _outcomes

    rows = [
        {'kind': 'timed_set', 'taken_at': '2026-09-01', 'execution_at': 60},
        {'kind': 'timed_set', 'taken_at': '2026-09-02', 'execution_at': 64},
        {'kind': 'review', 'taken_at': None, 'execution_at': 60},
    ]
    by_kind = {entry['type']: entry for entry in _outcomes(rows, 70)}

    assert by_kind['timed_set'] == {'type': 'timed_set', 'given': 2, 'taken': 2,
                                    'change': 8}
    assert by_kind['review']['change'] is None
    assert by_kind['review']['taken'] == 0


# ---------------------------------------------------------------------------
# The rule, now that it is checkable
# ---------------------------------------------------------------------------
# This file's opening note used to say the "no invented figures" rule lives in
# the prompt and cannot be asserted from here. That stopped being true when
# `_clean` started taking the brief: the brief holds every number the model was
# allowed to use, so the rule is arithmetic now rather than an instruction, and
# these are the tests that hold it. See backend/tracking/figures.py.
BRIEF = ('<measures>Quality: 48\nConsistency: 57\nRated: 143 tasks</measures>\n'
         '<curve>Trivial: execution 90\nEasy: execution 61</curve>\n')


def _one(**parts):
    """A model answer with only the section under test filled in."""
    return {'diagnosis': [], 'priorities': [], 'next_steps': [], 'insights': [],
            **parts}


class TestAFigureNobodyCountedIsDropped:
    def test_a_diagnosis_citing_an_invented_number_does_not_survive(self):
        # The exact failure the prompt warns about in capitals: a level in a
        # sub-skill, which nothing in this app measures.
        cleaned = subject_ai._clean(_one(diagnosis=[
            {'finding': 'Recursion is at 68%', 'confidence': 0.9, 'evidence': []},
            {'finding': 'Execution falls from 90 to 61', 'confidence': 0.8,
             'evidence': ['Trivial 90, Easy 61']},
        ]), BRIEF)
        assert [entry['finding'] for entry in cleaned['diagnosis']] == [
            'Execution falls from 90 to 61']

    def test_evidence_is_held_to_the_same_rule_as_the_claim(self):
        # The claim is clean and the evidence under it is not, which is worse
        # than the other way round: it reads as a checkable finding. A second,
        # sound finding rides along so the panel is not empty — an empty one
        # raises, and that is a different test.
        cleaned = subject_ai._clean(_one(diagnosis=[
            {'finding': 'Quality is the weak measure', 'confidence': 0.9,
             'evidence': ['Quality 48', 'and 22% of graph problems']},
            {'finding': 'Consistency is 57', 'confidence': 0.8, 'evidence': []},
        ]), BRIEF)
        assert [entry['finding'] for entry in cleaned['diagnosis']] == [
            'Consistency is 57']

    def test_an_insight_citing_an_invention_goes_whole(self):
        # The invented figure is in the implication, two fields away from the
        # observation. All three are the same claim as far as a reader is
        # concerned, so all three are checked.
        cleaned = subject_ai._clean(_one(insights=[
            {'observation': 'You rush the easy work', 'evidence': 'execution 61',
             'implication': 'it costs you about 14 points'},
            {'observation': 'Quality trails consistency', 'evidence': '48 against 57',
             'implication': 'rate the work you finish'},
        ]), BRIEF)
        assert [entry['observation'] for entry in cleaned['insights']] == [
            'Quality trails consistency']

    def test_a_priority_reason_is_checked(self):
        cleaned = subject_ai._clean(_one(priorities=[
            {'focus': 'Algorithms', 'weight': 0.9, 'reason': 'sitting at 33%'},
            {'focus': 'Review', 'weight': 0.5, 'reason': 'quality is 48'},
        ]), BRIEF)
        assert [entry['focus'] for entry in cleaned['priorities']] == ['Review']

    def test_everything_invented_reads_as_nothing_usable(self):
        with pytest.raises(subject_ai.BriefUnavailable):
            subject_ai._clean(_one(diagnosis=[
                {'finding': 'Recursion is at 68%', 'confidence': 0.9, 'evidence': []},
            ]), BRIEF)


class TestAPrescriptionMayCarryItsOwnNumbers:
    """The other half of the line, and the one that is easy to get wrong.

    "Twenty past-paper problems" is an instruction for Tuesday, not a claim
    about the reader. Guarding those would delete exactly the specificity that
    makes a next step worth reading.
    """

    def test_drills_keep_their_quantities(self):
        cleaned = subject_ai._clean(_one(next_steps=[
            {'title': 'Easy set, timed', 'focus': 'Algorithms',
             'type': 'timed_set', 'difficulty': 2, 'duration_minutes': 45,
             'reason': 'execution 61 at Easy',
             'drills': ['20 past-paper problems', '3 timed sets of 15']},
        ]), BRIEF)
        assert cleaned['next_steps'][0]['drills'] == [
            '20 past-paper problems', '3 timed sets of 15']

    def test_a_title_with_a_number_in_it_survives(self):
        cleaned = subject_ai._clean(_one(next_steps=[
            {'title': '30 minutes on recursion', 'focus': 'Algorithms',
             'type': 'concept', 'difficulty': 3, 'duration_minutes': 30,
             'reason': '', 'drills': []},
        ]), BRIEF)
        assert cleaned['next_steps'][0]['title'] == '30 minutes on recursion'

    def test_but_the_reason_is_dropped_when_it_invents(self):
        # The step stays, because what to go and do is still worth showing.
        # The sentence claiming the record justifies it does not.
        cleaned = subject_ai._clean(_one(next_steps=[
            {'title': 'Drill recursion', 'focus': 'Algorithms',
             'type': 'targeted_practice', 'difficulty': 3, 'duration_minutes': 40,
             'reason': 'you are at 68% on recursion', 'drills': ['ten problems']},
        ]), BRIEF)
        assert cleaned['next_steps'][0]['title'] == 'Drill recursion'
        assert cleaned['next_steps'][0]['reason'] == ''


def test_without_a_brief_the_check_is_off():
    """`_clean` is still callable for tests that are about shape alone."""
    cleaned = subject_ai._clean(_one(diagnosis=[
        {'finding': 'Recursion is at 68%', 'confidence': 0.9, 'evidence': []},
    ]))
    assert len(cleaned['diagnosis']) == 1


# ---------------------------------------------------------------------------
# The relationships, which are what stop the reading being generic
# ---------------------------------------------------------------------------
# The section added when the panel's output was still a restatement of the
# table above it. Everything in it is worked out by the client
# (frontend/src/components/Subject/performance) and only formatted here, so
# these tests are about what reaches the prompt rather than about arithmetic —
# the arithmetic has its own tests, on the side that does it.
PERFORMANCE = {
    'gap': {
        'known': True, 'standing': 61, 'total': 39.0,
        'parts': [
            {'key': 'knowledge', 'label': 'Knowing it', 'points': 4.3, 'from': 'how hard'},
            {'key': 'execution', 'label': 'Doing it', 'points': 18.6, 'from': 'how it goes'},
        ],
        'largest': {'key': 'execution', 'label': 'Doing it', 'points': 18.6},
    },
    'families': {
        'known': True, 'answered': 31,
        'shares': [{'key': 'execution', 'label': 'The sitting itself',
                    'count': 16, 'share': 52}],
        'leading': {'key': 'execution', 'label': 'The sitting itself', 'share': 52},
        'notConceptual': 87,
    },
    'calibration': {
        'known': True,
        'outgrown': [{'label': 'Hard', 'execution': 82, 'done': 8}],
        'overestimated': [{'label': 'Trivial', 'execution': 55, 'done': 12}],
        'rushed': 9,
    },
    'divergence': {'known': True, 'capability': 12, 'outcome': 1,
                   'reading': 'capability-ahead'},
}


class TestTheRelationshipsReachTheModel:
    def test_the_shortfall_split_arrives_with_its_largest_part_named(self):
        brief = subject_ai.brief_from({**STATE, 'performance': PERFORMANCE})
        assert 'Doing it: 18.6 points' in brief
        assert 'Largest single part: Doing it' in brief

    def test_the_figure_that_decides_the_next_step_arrives(self):
        # The single most useful number the panel has: whether adding
        # difficulty is the right move at all.
        brief = subject_ai.brief_from({**STATE, 'performance': PERFORMANCE})
        assert 'Not about knowing the material: 87%' in brief

    def test_the_base_a_proportion_is_out_of_arrives_with_it(self):
        # Without it the model cannot set confidence honestly, which is the
        # difference between a finding and a guess with a percentage on it.
        brief = subject_ai.brief_from({**STATE, 'performance': PERFORMANCE})
        assert 'over 31 answers' in brief

    def test_divergence_arrives_as_a_reading_rather_than_two_numbers(self):
        brief = subject_ai.brief_from({**STATE, 'performance': PERFORMANCE})
        assert 'Capability is running ahead of the score' in brief

    def test_a_single_point_move_is_not_pluralised(self):
        brief = subject_ai.brief_from({**STATE, 'performance': PERFORMANCE})
        assert 'quality moved 1 point.' in brief

    def test_nothing_worked_out_means_no_section_at_all(self):
        """A heading over four "unknown" lines is worse than silence.

        This is the state an account is in with `rating_depth` set to
        'ratings' or 'none' — a real setting, not a broken install.
        """
        brief = subject_ai.brief_from(STATE)
        assert '<relationships>' not in brief

    def test_an_unmeasured_half_leaves_only_its_own_lines_out(self):
        # Reasons off, everything else on. The gap still arrives.
        thin = {**PERFORMANCE, 'families': {'known': False}}
        brief = subject_ai.brief_from({**STATE, 'performance': thin})
        assert 'Largest single part' in brief
        assert 'Not about knowing the material' not in brief

    def test_the_prompt_tells_the_model_to_start_there(self):
        # The section is only worth sending if the prompt says what it is for.
        assert 'START FROM THE RELATIONSHIPS' in subject_ai.SYSTEM
        assert 'Do not recompute them' in subject_ai.SYSTEM


# ---------------------------------------------------------------------------
# Surviving a refresh
# ---------------------------------------------------------------------------
# A reading costs an API call, and it used to live in component state and
# nowhere else — so reloading the page threw it away and the panel came back
# empty with the button offering to spend the call again. The steps were
# already on record in `subject_recommendations`, but that table is a ledger of
# what was advised rather than a copy of what was written: no diagnosis, no
# priorities, no insights, no drills. Restoring from it would put back one
# section out of four.
READING = {
    'diagnosis': [{'finding': 'Execution is the bottleneck', 'confidence': 0.8,
                   'evidence': ['Doing it: 18.6 points']}],
    'priorities': [{'focus': 'Timed sets', 'weight': 0.9, 'reason': 'rushing, not gaps'}],
    'next_steps': [{'title': 'Timed set', 'focus': 'Algebra', 'type': 'timed_set',
                    'difficulty': 3, 'minutes': 45, 'reason': 'nine rushed tasks',
                    'drills': ['ten problems under median time']}],
    'insights': [{'observation': 'Capability is ahead of the score',
                  'evidence': 'execution +12, quality +1',
                  'implication': 'convert rather than add'}],
}


def _save(client, monkeypatch, subject='Algebra', span='the last 30 days'):
    """Ask for a reading with the model stubbed, so one gets stored."""
    monkeypatch.setattr(subject_ai, 'configured', lambda: True)
    monkeypatch.setattr(subject_ai, 'read', lambda *a, **k: dict(READING))
    monkeypatch.setattr(subject_ai, 'plan', lambda *a, **k: list(READING['next_steps']))
    return client.post('/api/subject_reading',
                       json={'subject': subject, 'span': span}).json()


class TestAReadingSurvivesARefresh:
    def test_nothing_saved_reads_as_nothing_rather_than_as_a_failure(self, client):
        # The page has to tell "not asked for yet" from "the request broke",
        # and those look identical if the key just goes missing.
        body = client.get('/api/subject_reading_saved?subject=Algebra').json()
        assert body['success'] is True
        assert body['reading'] is None

    def test_a_reading_comes_back_whole(self, client, monkeypatch):
        assert _save(client, monkeypatch)['success'] is True

        body = client.get('/api/subject_reading_saved?subject=Algebra').json()
        assert body['success'] is True
        # All four sections, not just the steps the ledger holds.
        assert body['reading']['diagnosis'][0]['finding'] == 'Execution is the bottleneck'
        assert body['reading']['priorities'][0]['focus'] == 'Timed sets'
        assert body['reading']['insights'][0]['implication'] == 'convert rather than add'
        assert body['reading']['next_steps'][0]['drills'] == ['ten problems under median time']

    def test_the_stored_steps_keep_the_ids_the_loop_needs(self, client, monkeypatch):
        # A restored step has to be actionable: "I did this" writes against the
        # id, so a restore that dropped it would put back a dead button.
        _save(client, monkeypatch)
        body = client.get('/api/subject_reading_saved?subject=Algebra').json()
        assert body['reading']['next_steps'][0].get('id')

    def test_the_window_it_was_argued_from_comes_back_with_it(self, client, monkeypatch):
        # The page will not show a reading over figures it is no longer
        # displaying, so it needs to know which window this one was written
        # against. Same rule that clears a live reading when the window moves.
        _save(client, monkeypatch, span='the last 90 days')
        body = client.get('/api/subject_reading_saved?subject=Algebra').json()
        assert body['span'] == 'the last 90 days'

    def test_asking_again_replaces_rather_than_piles_up(self, client, monkeypatch):
        # This is a restore point for a panel, not a history. The history is
        # `subject_recommendations`, and it is the one nothing overwrites.
        _save(client, monkeypatch)
        monkeypatch.setattr(subject_ai, 'read', lambda *a, **k: {
            **READING,
            'diagnosis': [{'finding': 'Something else entirely', 'confidence': 0.5,
                           'evidence': []}],
        })
        client.post('/api/subject_reading', json={'subject': 'Algebra', 'span': 'x'})

        body = client.get('/api/subject_reading_saved?subject=Algebra').json()
        assert body['reading']['diagnosis'][0]['finding'] == 'Something else entirely'

    def test_the_ledger_is_still_appended_to(self, client, monkeypatch):
        """The outcome loop depends on every recommendation staying on record."""
        _save(client, monkeypatch)
        client.post('/api/subject_reading',
                    json={'subject': 'Algebra', 'span': 'x', 'mode': 'fresh'})
        listed = client.get('/api/subject_recommendations?subject=Algebra').json()
        assert len(listed['recommendations']) == 2

    def test_one_subject_does_not_answer_for_another(self, client, monkeypatch):
        _save(client, monkeypatch, subject='Algebra')
        body = client.get('/api/subject_reading_saved?subject=Geometry').json()
        assert body['reading'] is None

    def test_a_stranger_cannot_read_it(self, client, monkeypatch, stranger):
        _save(client, monkeypatch)
        body = stranger.get('/api/subject_reading_saved?subject=Algebra').json()
        assert body['reading'] is None


# ---------------------------------------------------------------------------
# The work itself
# ---------------------------------------------------------------------------
WORK = [
    {'title': 'MATHCOUNTS Sprint 21-30', 'on': '2026-09-04', 'difficulty': 2,
     'execution': 5, 'minutes': 18, 'reason': ''},
    {'title': 'AMC10 2019 #14', 'on': '2026-09-03', 'difficulty': 4,
     'execution': 2, 'minutes': 41, 'reason': 'Ran out of time'},
]


class TestTheWorkItselfReachesTheModel:
    """The one input that is not a measurement.

    Every other section describes the shape of the record, and a model given
    only those can do one thing with them: say the shape back with a verb in
    front. "Focused Easy Execution Practice — solve 10 Easy problems" is the
    difficulty curve with an imperative bolted on, and it is what this
    section exists to make impossible.
    """

    def test_the_titles_arrive_because_nothing_else_says_what_the_work_is(self):
        brief = subject_ai.brief_from({**STATE, 'recent_work': WORK})

        assert '<recent_work>' in brief
        assert 'MATHCOUNTS Sprint 21-30' in brief
        assert 'AMC10 2019 #14' in brief

    def test_how_it_went_and_how_long_it_took_arrive_beside_the_title(self):
        # A title on its own is a reading list. Tied to its rating and its
        # minutes it is evidence: this is what they work on, this is what it
        # costs them, and this is where it stops going well.
        brief = subject_ai.brief_from({**STATE, 'recent_work': WORK})

        assert 'difficulty 4, execution 2' in brief
        assert '41 min' in brief
        assert 'reason: Ran out of time' in brief

    def test_a_note_on_the_task_arrives_when_there_is_one(self):
        brief = subject_ai.brief_from({
            **STATE,
            'recent_work': [{**WORK[0], 'note': 'guessed the last four'}],
        })
        assert 'note: guessed the last four' in brief

    def test_an_unrated_task_says_so_rather_than_printing_a_blank(self):
        # A blank beside "difficulty" reads as a low score. There is a
        # difference between work that went badly and work nobody rated, and
        # the model cannot see it unless the brief states it.
        brief = subject_ai.brief_from({
            **STATE,
            'recent_work': [{'title': 'Untimed drill', 'on': '2026-09-02',
                             'difficulty': None, 'execution': None,
                             'minutes': None, 'reason': ''}],
        })
        assert 'not rated' in brief

    def test_the_section_is_labelled_as_what_they_wrote_not_as_a_measurement(self):
        """The same guard `<skill_vocabulary>` carries.

        A title is what somebody typed. Left unlabelled beside seven counted
        sections it is an invitation to "your Sprint-round work is at 72",
        which is the worst thing this panel can produce.
        """
        brief = subject_ai.brief_from({**STATE, 'recent_work': WORK})
        assert 'not measurements' in brief

    def test_no_work_leaves_the_section_out_rather_than_sending_it_empty(self):
        brief = subject_ai.brief_from({**STATE, 'recent_work': []})
        assert '<recent_work>' not in brief


class TestTheSampleIsBoundedOnTheServer:
    def test_the_client_is_held_to_the_cap_rather_than_trusted_on_it(self, client):
        from backend.api import subject_ai as api

        rows = [api.WorkRow(id='', title='Task %d' % at) for at in range(api.WORK + 30)]
        assert len(api._work('tester', rows)) == api.WORK

    def test_a_title_is_a_line_not_a_paragraph(self, client):
        from backend.api import subject_ai as api

        kept = api._work('tester', [api.WorkRow(id='', title='x' * 5000)])
        assert len(kept[0]['title']) == api.TEXT

    def test_a_row_with_no_title_is_not_a_row(self, client):
        from backend.api import subject_ai as api

        assert api._work('tester', [api.WorkRow(id='', title='   ')]) == []

    def test_a_rating_outside_the_scale_is_no_rating(self, client):
        # Absent is not nought: a task nobody rated says nothing about the
        # work, where a task rated 1 says something quite specific.
        from backend.api import subject_ai as api

        kept = api._work('tester', [api.WorkRow(id='', title='t', difficulty=9,
                                                execution=0, minutes=0)])
        assert kept[0]['difficulty'] is None
        assert kept[0]['execution'] is None
        assert kept[0]['minutes'] is None


class TestTheNoteIsFetchedRatherThanSent:
    """`description` is the field `ANALYTICS_TASK_FIELDS` exists to withhold.

    Sending it to the browser so the browser could send it back would put
    unbounded free text on the wire twice to reach somewhere it can be read
    from the database once.
    """

    def _task(self, client, name, description=''):
        from backend.database import connection as db

        made = client.post('/api/tasks', json={'name': name, 'xp_reward': 10}).json()
        if description:
            db.update_row('tasks', made['task_id'], {'description': description},
                          user_id='tester')
        return made['task_id']

    def test_the_note_is_joined_on_from_the_id_alone(self, client):
        from backend.api import subject_ai as api

        task_id = self._task(client, 'AMC10 set', 'stuck on #18 both times')
        kept = api._work('tester', [api.WorkRow(id=task_id, title='AMC10 set')])

        assert kept[0]['note'] == 'stuck on #18 both times'

    def test_a_note_is_cut_to_the_sentence_somebody_writes(self, client):
        from backend.api import subject_ai as api

        task_id = self._task(client, 'long one', 'y' * 4000)
        kept = api._work('tester', [api.WorkRow(id=task_id, title='long one')])

        assert len(kept[0]['note']) == api.NOTE

    def test_a_task_with_no_note_carries_none(self, client):
        from backend.api import subject_ai as api

        task_id = self._task(client, 'plain')
        kept = api._work('tester', [api.WorkRow(id=task_id, title='plain')])

        assert kept[0]['note'] == ''

    def test_another_account_s_note_is_not_reachable_by_naming_its_id(self, client, stranger):
        """The id comes from the client, so it is a parameter like any other."""
        from backend.api import subject_ai as api
        from backend.database import connection as db

        made = stranger.post('/api/tasks', json={'name': 'theirs', 'xp_reward': 10}).json()
        db.update_row('tasks', made['task_id'], {'description': 'private'},
                      user_id='stranger')

        kept = api._work('tester', [api.WorkRow(id=made['task_id'], title='theirs')])
        assert kept[0]['note'] == ''


def test_the_work_the_page_sends_is_the_work_the_model_is_shown(client, monkeypatch):
    """The wiring, end to end, because every piece of it passes on its own.

    The page samples, the endpoint bounds and joins the notes on, and
    `brief_from` prints a section. Three correct halves and a field renamed
    anywhere between them is a panel that quietly goes back to writing
    "Focused Easy Execution Practice" with nothing to say why.
    """
    from backend.database import connection as db

    made = client.post('/api/tasks', json={'name': 'AMC10 2019 #14',
                                           'xp_reward': 10}).json()
    db.update_row('tasks', made['task_id'],
                  {'description': 'stuck on the geometry one'}, user_id='tester')

    seen = {}
    monkeypatch.setattr(subject_ai, 'configured', lambda: True)
    monkeypatch.setattr(subject_ai, 'read',
                        lambda state, *a, **k: seen.update(
                            brief=subject_ai.brief_from(state)) or dict(READING))

    body = client.post('/api/subject_reading', json={
        'subject': 'Algebra',
        'span': 'the last 30 days',
        'recent_work': [{
            'id': made['task_id'], 'title': 'AMC10 2019 #14', 'on': '2026-09-03',
            'difficulty': 4, 'execution': 2, 'minutes': 41,
            'reason': 'Ran out of time',
        }],
    }).json()

    assert body['success'] is True
    assert 'AMC10 2019 #14' in seen['brief']
    assert 'difficulty 4, execution 2' in seen['brief']
    assert 'note: stuck on the geometry one' in seen['brief']


class TestAFindingSaysWhichWayItCuts:
    """The page draws findings and insights as one list of coloured rows.

    The colour is the `direction`, and it is the same closed word
    `goal_evidence` already uses rather than a second vocabulary for the
    same idea. Without it the page has to guess a tone from the prose, and
    "execution is improving" would be drawn in the colour of a problem
    because it arrived in a list called diagnosis.
    """

    def test_a_finding_and_an_insight_both_carry_one(self):
        out = subject_ai._clean({
            'diagnosis': [{'finding': 'Execution is climbing', 'direction': 'helps',
                           'confidence': 0.7, 'evidence': []}],
            'insights': [{'observation': 'Rushing is costing quality',
                          'direction': 'hurts', 'evidence': '', 'implication': 'slow down'}],
        })

        assert out['diagnosis'][0]['direction'] == 'helps'
        assert out['insights'][0]['direction'] == 'hurts'

    def test_an_unrecognised_direction_becomes_the_neutral_one(self):
        # A word the page has no colour for steers nothing and draws as
        # nothing, so it becomes 'watch' rather than a fourth tone.
        out = subject_ai._clean({
            'diagnosis': [{'finding': 'Something', 'direction': 'catastrophic',
                           'confidence': 0.5, 'evidence': []}],
        })
        assert out['diagnosis'][0]['direction'] == 'watch'

    def test_a_reading_written_before_the_field_existed_still_draws(self):
        """Saved readings are replayed from the database on a refresh.

        One written before this field was added has no direction anywhere in
        it, and the page still has to colour its rows.
        """
        out = subject_ai._clean({
            'diagnosis': [{'finding': 'Old finding', 'confidence': 0.5, 'evidence': []}],
            'insights': [{'observation': 'Old insight', 'evidence': '', 'implication': 'x'}],
        })

        assert out['diagnosis'][0]['direction'] == 'watch'
        assert out['insights'][0]['direction'] == 'watch'

    def test_the_model_is_told_not_to_file_good_news_as_a_problem(self):
        assert 'Not everything a record says is a problem.' in subject_ai.SYSTEM


# ---------------------------------------------------------------------------
# Batches of three, up to six
# ---------------------------------------------------------------------------
def _batch(*titles):
    """A stubbed reading whose steps carry these titles."""
    return {
        **READING,
        'next_steps': [
            {'title': title, 'problems': 'Sprint #1-10', 'pace': '2 min each',
             'resource': 'mathcounts.org', 'focus': 'Algebra', 'type': 'timed_set',
             'difficulty': 2, 'minutes': 20, 'reason': '', 'signal': '', 'drills': []}
            for title in titles
        ],
    }


def _ask(client, monkeypatch, reading, mode):
    monkeypatch.setattr(subject_ai, 'configured', lambda: True)
    seen = {}

    def fake(state, *a, **k):
        seen['state'] = state
        return reading

    def fake_plan(state, *a, **k):
        seen['state'] = state
        return list(reading['next_steps'])

    monkeypatch.setattr(subject_ai, 'read', fake)
    monkeypatch.setattr(subject_ai, 'plan', fake_plan)
    body = client.post('/api/subject_reading',
                       json={'subject': 'Algebra', 'span': 'x', 'mode': mode}).json()
    return body, seen.get('state') or {}


def _titles(body):
    return [step['title'] for step in body['reading']['next_steps']]


class TestMoreGoesUnderTheFirstBatch:
    def test_a_fresh_ask_is_three(self, client, monkeypatch):
        body, _ = _ask(client, monkeypatch, _batch('A', 'B', 'C', 'D'), 'fresh')
        assert _titles(body) == ['A', 'B', 'C']

    def test_more_adds_three_under_the_ones_on_screen(self, client, monkeypatch):
        _ask(client, monkeypatch, _batch('A', 'B', 'C'), 'fresh')
        body, _ = _ask(client, monkeypatch, _batch('D', 'E', 'F'), 'more')
        assert _titles(body) == ['A', 'B', 'C', 'D', 'E', 'F']
        # And it survives a refresh in that order.
        saved = client.get('/api/subject_reading_saved?subject=Algebra').json()
        assert [step['title'] for step in saved['reading']['next_steps']] == list('ABCDEF')

    def test_more_never_repeats_a_title_already_on_screen(self, client, monkeypatch):
        _ask(client, monkeypatch, _batch('A', 'B', 'C'), 'fresh')
        body, _ = _ask(client, monkeypatch, _batch('a', 'D', 'E', 'F'), 'more')
        assert _titles(body) == ['A', 'B', 'C', 'D', 'E', 'F']

    def test_six_is_the_most(self, client, monkeypatch):
        _ask(client, monkeypatch, _batch('A', 'B', 'C'), 'fresh')
        _ask(client, monkeypatch, _batch('D', 'E', 'F'), 'more')
        body, _ = _ask(client, monkeypatch, _batch('G', 'H', 'I'), 'more')
        assert body['success'] is False
        assert 'Six is the most' in body['message']

    def test_the_model_is_told_what_is_already_showing(self, client, monkeypatch):
        _ask(client, monkeypatch, _batch('A', 'B', 'C'), 'fresh')
        _, state = _ask(client, monkeypatch, _batch('D', 'E', 'F'), 'more')
        assert state['showing'] == ['A', 'B', 'C']
        assert '<already_showing>' in subject_ai.brief_from(state)

    def test_reading_the_record_leaves_the_steps_alone(self, client, monkeypatch):
        _ask(client, monkeypatch, _batch('A', 'B', 'C'), 'fresh')
        before = len(client.get('/api/subject_recommendations?subject=Algebra')
                     .json()['recommendations'])
        body, _ = _ask(client, monkeypatch, _batch('X', 'Y', 'Z'), 'read')
        assert _titles(body) == ['A', 'B', 'C']
        after = len(client.get('/api/subject_recommendations?subject=Algebra')
                    .json()['recommendations'])
        assert after == before

    def test_starting_over_replaces_the_six(self, client, monkeypatch):
        _ask(client, monkeypatch, _batch('A', 'B', 'C'), 'fresh')
        _ask(client, monkeypatch, _batch('D', 'E', 'F'), 'more')
        body, _ = _ask(client, monkeypatch, _batch('G', 'H', 'I'), 'fresh')
        assert _titles(body) == ['G', 'H', 'I']


# ---------------------------------------------------------------------------
# Precise steps, from everything they have done
# ---------------------------------------------------------------------------
GROUPS = [
    {'name': 'MATHCOUNTS Sprint #', 'count': 14,
     'examples': ['MATHCOUNTS Sprint 1-10', 'MATHCOUNTS Sprint 21-30'],
     'rated': 14, 'difficulty': 2.1, 'execution': 4.8, 'minutes': 18,
     'well': 13, 'badly': 0, 'reasons': [], 'last': '2026-09-30'},
    {'name': 'AMC10 #', 'count': 6, 'examples': ['AMC10 2019 #14'],
     'rated': 6, 'difficulty': 4.0, 'execution': 1.9, 'minutes': 41,
     'well': 0, 'badly': 5, 'reasons': ['Ran out of time ×4'], 'last': '2026-09-29'},
]


class TestPreciseStepsFromEverythingDone:
    def test_every_group_reaches_the_model_with_its_figures(self):
        brief = subject_ai.brief_from({**STATE, 'work_groups': GROUPS})
        assert '<work_groups>' in brief
        assert '"MATHCOUNTS Sprint #" — 14 done' in brief
        assert '"MATHCOUNTS Sprint 21-30"' in brief
        assert 'avg difficulty 4.0, avg execution 1.9' in brief
        assert 'avg 41 min each' in brief
        assert '0 went well, 5 went badly' in brief
        assert 'Ran out of time ×4' in brief

    def test_the_groups_come_sorted_by_how_they_went_and_how_long(self):
        brief = subject_ai.brief_from({**STATE, 'work_groups': GROUPS})
        assert 'Went worst (lowest avg execution): "AMC10 #"; "MATHCOUNTS Sprint #"' in brief
        assert 'Went best (highest avg execution): "MATHCOUNTS Sprint #"' in brief
        assert 'Slowest (most minutes each): "AMC10 #"' in brief

    def test_the_endpoint_bounds_what_the_page_sends(self, client, monkeypatch):
        many = [{**GROUPS[0], 'name': 'G{}'.format(n)} for n in range(40)]
        many[0] = {**many[0], 'execution': 9, 'examples': ['x'] * 10}
        monkeypatch.setattr(subject_ai, 'configured', lambda: True)
        seen = {}
        monkeypatch.setattr(subject_ai, 'plan',
                            lambda state, *a, **k: seen.setdefault('s', state) and [])
        client.post('/api/subject_reading',
                    json={'subject': 'Algebra', 'span': 'x', 'work_groups': many,
                          'mode': 'fresh'})
        groups = seen['s']['work_groups']
        assert len(groups) == 25
        assert groups[0]['execution'] is None   # 9 is not a 1-5 average
        assert len(groups[0]['examples']) == 4

    def test_a_step_says_what_to_work_how_fast_and_from_where(self):
        assert 'problems' in subject_ai.SCHEMA['properties']['next_steps']['items']['required']
        assert 'pace' in subject_ai.SCHEMA['properties']['next_steps']['items']['required']
        assert 'resources' in subject_ai.SCHEMA['properties']['next_steps']['items']['required']
        assert 'RECOMMENDATIONS, not insights' in subject_ai.SYSTEM
        assert 'Easy MATHCOUNTS Sprint #1-10, 2 min each' in subject_ai.SYSTEM

    def test_the_three_fields_survive_cleaning_even_with_numbers_in_them(self):
        # "1-10" and "2 min" are instructions, not claims about the reader, so
        # they are not held to the brief's figures the way a reason is.
        cleaned = subject_ai._clean({
            'next_steps': [{
                'title': 'Easy MATHCOUNTS Sprint #1-10, 2 min each', 'focus': 'Algebra',
                'problems': 'MATHCOUNTS 2021 School Sprint, problems 1-10',
                'pace': '2 minutes per problem, no calculator',
                'resource': 'MATHCOUNTS past competitions, mathcounts.org',
                'type': 'timed_set', 'difficulty': 2, 'duration_minutes': 20,
                'reason': '', 'signal': '', 'drills': [],
            }],
        }, brief='nothing counted here')
        step = cleaned['next_steps'][0]
        assert step['problems'] == 'MATHCOUNTS 2021 School Sprint, problems 1-10'
        assert step['pace'] == '2 minutes per problem, no calculator'
        assert step['resource'] == 'MATHCOUNTS past competitions, mathcounts.org'


class TestRecommendationsAlone:
    """The panel's own call: steps only, from a brief a fraction the size."""

    def test_the_plan_brief_keeps_what_bears_on_what_to_do(self):
        state = {**STATE, 'work_groups': GROUPS,
                 'recent_work': [dict(WORK[0], note='') for _ in range(40)]}
        brief = subject_ai.steps_brief_from(state)
        assert '<work_groups>' in brief
        assert '<relationships>' not in brief
        assert '<dimensions>' not in brief
        recent = brief.split('<recent_work>')[1].split('</recent_work>')[0]
        assert recent.count('"MATHCOUNTS Sprint 21-30"') == subject_ai.STEPS_RECENT

    def test_the_plan_asks_for_steps_alone_behind_the_short_prompt(self, monkeypatch):
        import json as _json
        monkeypatch.setattr(subject_ai, 'configured', lambda: True)
        sent = {}

        def fake(brief, **kwargs):
            sent.update(kwargs, brief=brief)
            return _json.dumps({'next_steps': [{
                'title': 'Easy MATHCOUNTS Sprint #31-40, 2 min each',
                'problems': 'MATHCOUNTS 2021 School Sprint, 31-40', 'pace': '2 min each',
                'resource': 'mathcounts.org', 'focus': 'Algebra', 'type': 'timed_set',
                'difficulty': 2, 'duration_minutes': 20, 'reason': '', 'signal': '',
                'drills': []}]})

        monkeypatch.setattr(subject_ai.planner, 'from_provider', fake)
        steps = subject_ai.plan({**STATE, 'work_groups': GROUPS})
        assert sent['system'] is subject_ai.STEPS_SYSTEM
        assert list(sent['schema']['properties']) == ['next_steps']
        assert sent['max_tokens'] == subject_ai.STEPS_MAX_TOKENS
        assert steps[0]['resource'] == 'mathcounts.org'

    def test_the_short_prompt_fits_a_free_groq_minute_with_room_to_answer(self):
        # Groq's free tier counts prompt and answer together against 8,000
        # tokens a minute. ~4 characters a token is generous for English.
        assert len(subject_ai.STEPS_SYSTEM) / 4 + subject_ai.STEPS_MAX_TOKENS < 5000

    def test_no_steps_back_is_said_rather_than_drawn_empty(self, monkeypatch):
        monkeypatch.setattr(subject_ai, 'configured', lambda: True)
        monkeypatch.setattr(subject_ai.planner, 'from_provider',
                            lambda *a, **k: '{"next_steps": []}')
        with pytest.raises(subject_ai.BriefUnavailable):
            subject_ai.plan(STATE)


def test_a_saved_reading_is_found_by_subject_not_by_a_derived_id(client, monkeypatch):
    # The row id is hashed from the username, so a renamed account's row no
    # longer matches it — and inserting a second row for the same subject
    # breaks the one-per-subject constraint and loses the reading just made.
    from backend.database import connection as db
    _save(client, monkeypatch)
    con = db.connect()
    try:
        con.execute("UPDATE subject_readings SET id = 'sr-from-an-old-name' "
                    "WHERE user_id = 'tester' AND subject = 'Algebra'")
        con.commit()
    finally:
        con.close()
    body, _ = _ask(client, monkeypatch, _batch('A', 'B', 'C'), 'fresh')
    assert body['success'] is True
    saved = client.get('/api/subject_reading_saved?subject=Algebra').json()
    assert [step['title'] for step in saved['reading']['next_steps']] == ['A', 'B', 'C']


@pytest.mark.parametrize('made_up', [
    'Analysis problem set, University of XYZ, 2023',
    'a standard textbook',
    'Online resources',
    '[insert textbook here]',
])
def test_a_placeholder_source_is_left_blank_rather_than_printed(made_up):
    cleaned = subject_ai._clean({'next_steps': [{
        'title': 'Proof set', 'problems': 'problems 1-6', 'pace': '12 min each',
        'resource': made_up, 'focus': 'Analysis', 'type': 'review',
        'difficulty': 3, 'duration_minutes': 72, 'reason': '', 'signal': '',
        'drills': []}]})
    assert cleaned['next_steps'][0]['resource'] == ''


def test_a_real_source_is_kept():
    cleaned = subject_ai._clean({'next_steps': [{
        'title': 'Stewart Ch. 7 integrals #1-8, 8 min each', 'problems': 'Ch. 7, 1-8',
        'pace': '8 min each', 'resource': 'James Stewart, Calculus, 8th edition',
        'focus': 'Calculus', 'type': 'targeted_practice', 'difficulty': 3,
        'duration_minutes': 64, 'reason': '', 'signal': '', 'drills': []}]})
    assert cleaned['next_steps'][0]['resource'] == 'James Stewart, Calculus, 8th edition'


# ---------------------------------------------------------------------------
# A step can be its title alone, and links to where the material is
# ---------------------------------------------------------------------------
def _one(**over):
    entry = {'title': 'Practice Bach Concerto intonation', 'problems': '',
             'pace': '', 'resources': [], 'focus': 'Violin', 'type': 'targeted_practice',
             'difficulty': 3, 'duration_minutes': 0, 'reason': '', 'signal': '',
             'drills': []}
    entry.update(over)
    return entry


class TestBareSteps:
    def test_a_title_alone_is_a_whole_step(self):
        step = subject_ai._clean({'next_steps': [_one()]})['next_steps'][0]
        assert step['title'] == 'Practice Bach Concerto intonation'
        assert step['problems'] == '' and step['pace'] == ''
        assert step['resources'] == []

    @pytest.mark.parametrize('given', [0, None, '', -5, 'whenever'])
    def test_no_time_is_left_absent_rather_than_defaulted(self, given):
        step = subject_ai._clean({'next_steps': [_one(duration_minutes=given)]})['next_steps'][0]
        assert step['minutes'] is None

    def test_a_time_that_is_given_is_still_clamped(self):
        steps = subject_ai._clean({'next_steps': [
            _one(duration_minutes=400), _one(title='b', duration_minutes=3)]})['next_steps']
        assert [step['minutes'] for step in steps] == [120, 10]

    def test_both_prompts_say_a_title_alone_can_be_enough(self):
        for prompt in (subject_ai.SYSTEM, subject_ai.STEPS_SYSTEM):
            assert 'Practice Bach Concerto intonation' in prompt
            assert '0 when no set time' in prompt

    def test_a_history_line_with_no_time_does_not_print_none(self):
        brief = subject_ai.brief_from({**STATE, 'previous': [
            {'title': 'Bach intonation', 'type': 'targeted_practice',
             'difficulty': 3, 'minutes': None, 'on': '2026-10-01'}]})
        assert 'None min' not in brief
        assert 'Bach intonation' in brief


IMSLP = 'https://imslp.org/wiki/Violin_Concerto_in_A_minor,_BWV_1041_(Bach,_Johann_Sebastian)'


class TestStepLinks:
    def test_up_to_three_links_in_the_order_given(self):
        step = subject_ai._clean({'next_steps': [_one(resources=[
            {'name': 'IMSLP score', 'url': IMSLP},
            {'name': 'Henle edition', 'url': 'https://www.henle.de/en/detail/?Title=Violin+Concerto+a+minor+BWV+1041_1041'},
            {'name': 'Recording', 'url': 'https://www.youtube.com/watch?v=abc123'},
            {'name': 'A fourth', 'url': 'https://example.org/four'},
        ])]})['next_steps'][0]
        assert [link['name'] for link in step['resources']] == [
            'IMSLP score', 'Henle edition', 'Recording']
        assert step['resources'][0]['url'] == IMSLP

    @pytest.mark.parametrize('bad', [
        'imslp.org', 'ftp://imslp.org/x', 'javascript:alert(1)',
        'https://example.com/book', 'https://localhost/x', 'not a link', ''])
    def test_a_link_that_is_not_one_is_dropped(self, bad):
        step = subject_ai._clean({'next_steps': [_one(resources=[
            {'name': 'x', 'url': bad}])]})['next_steps'][0]
        assert step['resources'] == []

    def test_the_same_page_twice_is_kept_once(self):
        step = subject_ai._clean({'next_steps': [_one(resources=[
            {'name': 'a', 'url': 'https://www.mathcounts.org/resources/'},
            {'name': 'b', 'url': 'http://mathcounts.org/resources'},
        ])]})['next_steps'][0]
        assert [link['name'] for link in step['resources']] == ['a']

    def test_a_link_with_no_usable_name_is_named_after_its_site(self):
        step = subject_ai._clean({'next_steps': [_one(resources=[
            {'name': 'a standard textbook', 'url': 'https://www.mathcounts.org/x'}])]})['next_steps'][0]
        assert step['resources'][0]['name'] == 'mathcounts.org'

    def test_a_link_the_reader_already_keeps_is_marked_theirs(self):
        owned = {subject_ai._link_key(IMSLP)}
        step = subject_ai._clean({'next_steps': [_one(resources=[
            {'name': 'score', 'url': IMSLP.replace('https://', 'http://')},
            {'name': 'other', 'url': 'https://www.henle.de/en/'}])]},
            owned=owned)['next_steps'][0]
        assert [link['yours'] for link in step['resources']] == [True, False]

    def test_the_plan_marks_owned_links_from_the_state(self, monkeypatch):
        import json as _json
        monkeypatch.setattr(subject_ai, 'configured', lambda: True)
        monkeypatch.setattr(subject_ai.planner, 'from_provider', lambda *a, **k: _json.dumps(
            {'next_steps': [_one(resources=[{'name': 'score', 'url': IMSLP}])]}))
        steps = subject_ai.plan({**STATE, 'owned_resources': [
            {'name': 'Bach score', 'url': IMSLP, 'from': 'task'}]})
        assert steps[0]['resources'][0]['yours'] is True


class TestOwnedResources:
    def test_links_are_found_in_task_notes_notes_and_the_library(self):
        found = subject_ai.owned_resources(
            [{'title': 'Bach Concerto practice', 'description': f'Score: {IMSLP}.'}],
            [{'title': 'Teacher links', 'body': 'Etudes: [Kreutzer 42](https://imslp.org/wiki/42_Etudes)'}],
            [{'title': 'Suzuki Book 4', 'url': 'https://suzuki.example.org/book4'}])
        by_url = {entry['url']: entry for entry in found}
        # A bare link in a task's note is named after the task, and the full
        # stop after it is not part of it.
        assert by_url[IMSLP]['name'] == 'Bach Concerto practice'
        assert by_url[IMSLP]['from'] == 'task'
        # A Markdown link keeps its own text.
        assert by_url['https://imslp.org/wiki/42_Etudes']['name'] == 'Kreutzer 42'
        assert by_url['https://suzuki.example.org/book4']['from'] == 'library'

    def test_the_same_page_is_listed_once_and_the_list_is_bounded(self):
        tasks = [{'title': f'T{n}', 'description': f'https://site{n}.org/x {IMSLP}'}
                 for n in range(20)]
        found = subject_ai.owned_resources(tasks, [], [])
        assert len(found) == subject_ai.OWNED
        assert sum(entry['url'] == IMSLP for entry in found) == 1

    def test_they_reach_the_plan_brief_with_their_urls(self):
        brief = subject_ai.steps_brief_from({**STATE, 'owned_resources': [
            {'name': 'Bach score', 'url': IMSLP, 'from': 'task'}]})
        assert '<your_resources>' in brief
        assert IMSLP in brief

    def test_no_owned_links_means_no_section(self):
        assert '<your_resources>' not in subject_ai.steps_brief_from(STATE)


def test_the_endpoint_hands_the_plan_this_subjects_links_only(client, monkeypatch):
    from backend.database import connection as db
    db.insert_row('tasks', {'id': 'own-1', 'user_id': 'tester', 'title': 'Bach Concerto',
                            'description': f'score {IMSLP}', 'subject': 'music',
                            'status': 'done'})
    db.insert_row('tasks', {'id': 'own-2', 'user_id': 'tester', 'title': 'Integrals',
                            'description': 'https://tutorial.math.lamar.edu/',
                            'subject': 'calculus', 'status': 'done'})
    db.insert_row('notes', {'id': 'own-n', 'user_id': 'tester', 'title': 'Etudes',
                            'body': 'https://imslp.org/wiki/42_Etudes',
                            'subject_ids': 'music'})
    monkeypatch.setattr(subject_ai, 'configured', lambda: True)
    seen = {}
    monkeypatch.setattr(subject_ai, 'plan',
                        lambda state, *a, **k: seen.setdefault('s', state) and [])
    client.post('/api/subject_reading', json={
        'subject': 'Music', 'subject_id': 'music', 'span': 'x', 'mode': 'fresh'})
    urls = [entry['url'] for entry in seen['s']['owned_resources']]
    assert IMSLP in urls
    assert 'https://imslp.org/wiki/42_Etudes' in urls
    assert 'https://tutorial.math.lamar.edu/' not in urls


@pytest.mark.parametrize('text, url', [
    (f'score ({IMSLP}).', IMSLP),
    ('(see https://www.henle.de/en/)', 'https://www.henle.de/en/'),
    ('[Lamar](https://tutorial.math.lamar.edu/Classes/CalcII/IntTechIntro.aspx)',
     'https://tutorial.math.lamar.edu/Classes/CalcII/IntTechIntro.aspx'),
])
def test_a_link_is_cut_from_the_sentence_around_it(text, url):
    found = subject_ai.owned_resources([{'title': 't', 'description': text}], [], [])
    assert [entry['url'] for entry in found] == [url]
