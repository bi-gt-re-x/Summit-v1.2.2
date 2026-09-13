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
    brief = subject_ai.brief_from(STATE)

    for section in ('subject_profile', 'dimensions', 'difficulty_analysis',
                    'time_analysis', 'recent_trends', 'mistake_patterns',
                    'skill_vocabulary', 'goals', 'recommendation_outcomes'):
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
        _save(client, monkeypatch)
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
