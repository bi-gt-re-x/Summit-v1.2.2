"""The model-written panel on a subject's page.

Nothing here calls a model. What is worth testing is everything around the
call — the shape that goes in, the bounds that come out, and the two states
that are not "it worked": no key, and an answer that cannot be read.

The rule the feature exists to keep is that the model may write prose over the
page's figures and may not produce any others. That rule lives in the prompt
and cannot be asserted from here, so what these tests hold instead is the
structure that makes it enforceable: the brief carries the figures verbatim,
and the one number the model does supply is bounded on the way out.
"""
import pytest

from backend.tracking import subject_brief


FINDINGS = {
    'subject': 'Mathematics',
    'span': '30D',
    'score': 61,
    'grade': 'C',
    'finished': 18,
    'finished_before': 12,
    'streak': 4,
    'rates': [
        {'label': 'Quality', 'now': 47},
        {'label': 'Consistency', 'now': 48},
    ],
    'bands': [
        {'label': 'Trivial', 'done': 9, 'holding': 90},
        {'label': 'Brutal', 'done': 15, 'holding': 61},
    ],
    'struggles': [
        {'label': 'Kept getting interrupted', 'share': 40, 'count': 4},
    ],
    'goals': [
        {'title': 'Competition ready', 'progress': 35,
         'deadline': '2026-12-01', 'drift': 11},
    ],
}


# ---------------------------------------------------------------------------
# The brief that goes to the model
# ---------------------------------------------------------------------------
def test_the_brief_carries_the_pages_own_figures_verbatim():
    """Every number the model is allowed to use has to actually reach it.

    The prompt forbids inventing figures, which is only a workable instruction
    if the ones the page drew are all present. A finding dropped on the way in
    is a finding the model is then forbidden from mentioning.
    """
    brief = subject_brief.brief_from(FINDINGS)

    for expected in ('Mathematics', '61', 'C', '18', '12',
                     'Quality: 47', 'Consistency: 48',
                     'Brutal', 'Kept getting interrupted', '40%',
                     'Competition ready', '11 days late'):
        assert expected in brief, expected


def test_the_brief_leaves_out_what_was_not_measured():
    """An empty line is a line the model has to interpret, and it guesses.

    The same reason `planner._brief` only writes the fields that were filled
    in: "Grade: " reads as a grade the reader has and the model could not see.
    """
    brief = subject_brief.brief_from({'subject': 'Physics'})

    assert 'Physics' in brief
    assert 'Grade' not in brief
    assert 'Overall score' not in brief
    # And no empty section headings for the four lists.
    assert 'difficulty band' not in brief
    assert 'Goals this subject' not in brief


def test_a_goal_with_no_projection_is_not_described_as_on_time():
    """The same three-way split the advice panel makes.

    A null drift means there is no arrival to work back from. Calling it "on
    time" in the brief would hand the model a claim to repeat.
    """
    brief = subject_brief.brief_from({
        'subject': 'Maths',
        'goals': [{'title': 'Someday', 'progress': 5, 'deadline': '', 'drift': None}],
    })

    assert 'no projection yet' in brief
    assert 'on time' not in brief


# ---------------------------------------------------------------------------
# The answer that comes back
# ---------------------------------------------------------------------------
def test_the_suggested_sitting_is_clamped_to_something_a_person_could_sit():
    """`minutes` is the one figure the model supplies rather than quotes.

    Everything else in the panel is a number the page already drew. This one
    is a recommendation, so it is bounded here rather than trusted — a
    confident 400-minute sitting is not a thing to print.
    """
    cleaned = subject_brief._clean({
        'reading': 'A reading.',
        'practice': [
            {'title': 'Too long', 'minutes': 400, 'focus': [], 'why': 'because'},
            {'title': 'Too short', 'minutes': 1, 'focus': [], 'why': 'because'},
            {'title': 'Not a number', 'minutes': 'twenty', 'focus': [], 'why': 'because'},
        ],
    })

    assert [item['minutes'] for item in cleaned['practice']] == [
        subject_brief.MINUTES[1], subject_brief.MINUTES[0], subject_brief.MINUTES[0]]


def test_the_practice_list_is_cut_to_what_the_page_draws():
    cleaned = subject_brief._clean({
        'reading': 'A reading.',
        'practice': [
            {'title': 'One', 'minutes': 20, 'focus': ['a', 'b', 'c', 'd', 'e'], 'why': 'w'}
        ] * 9,
    })

    assert len(cleaned['practice']) == subject_brief.PRACTICE
    # And each block's focus list, for the same reason.
    assert len(cleaned['practice'][0]['focus']) == 4


def test_an_unreadable_answer_raises_rather_than_being_salvaged():
    """Stricter than planner's parse, and deliberately.

    That one reads prose into five titles, because prose can be read as titles
    without risk. Here a shape this cannot parse is a shape whose numbers
    cannot be trusted, so it refuses rather than guessing.
    """
    with pytest.raises(subject_brief.BriefUnavailable):
        subject_brief._object('I am afraid I cannot help with that.')

    with pytest.raises(subject_brief.BriefUnavailable):
        subject_brief._object('')

    with pytest.raises(subject_brief.BriefUnavailable):
        # Valid JSON, wrong shape.
        subject_brief._object('["a", "b"]')


def test_json_in_a_fence_or_behind_a_sentence_is_still_read():
    fenced = subject_brief._object('Here you go:\n```json\n{"reading": "hi"}\n```')
    assert fenced['reading'] == 'hi'

    trailing = subject_brief._object('Sure. {"reading": "hi"} Hope that helps.')
    assert trailing['reading'] == 'hi'


def test_an_empty_answer_is_a_failure_rather_than_an_empty_panel():
    with pytest.raises(subject_brief.BriefUnavailable):
        subject_brief._clean({'reading': '', 'practice': []})


# ---------------------------------------------------------------------------
# The answers a configured install actually gets back
# ---------------------------------------------------------------------------
@pytest.mark.parametrize('raw, expected', [
    # The real 400 from an account with a workspace-scoped key and no credits.
    ("Error code: 400 - {'type': 'error', 'error': {'type': "
     "'invalid_request_error', 'message': 'Your credit balance is too low to "
     "access the Anthropic API. Please go to Plans & Billing to upgrade or "
     "purchase credits.'}}", 'out of API credits'),
    ("Error code: 401 - {'error': {'type': 'authentication_error', "
     "'message': 'invalid x-api-key'}}", 'did not accept the key'),
    ("Error code: 429 - {'error': {'type': 'rate_limit_error'}}",
     'rate-limiting'),
])
def test_the_common_failures_read_as_instructions_not_as_api_errors(
        monkeypatch, raw, expected):
    """These are shown in a panel, to somebody looking at a page.

    A raw `Error code: 400 - {...}` in the write-up panel is the API talking to
    whoever wrote the client. Each of these is a state a correctly-configured
    install genuinely reaches, so each says what to do about it. The catch-all
    underneath still exists — it is a floor, not the plan.
    """
    from backend.tracking import planner

    class Boom:
        def __init__(self, *args, **kwargs):
            pass

        @property
        def messages(self):
            raise RuntimeError(raw)

    monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-ant-api03-test')
    monkeypatch.setattr('anthropic.Anthropic', Boom)

    with pytest.raises(planner.PlannerUnavailable) as caught:
        planner.from_anthropic('Goal: something')
    assert expected in str(caught.value)
    # And never the raw shape underneath it.
    assert 'Error code:' not in str(caught.value)


# ---------------------------------------------------------------------------
# Without a key
# ---------------------------------------------------------------------------
def test_without_a_key_it_says_so_instead_of_calling_anything(monkeypatch):
    """And the message says why a Hugging Face token does not cover it."""
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    monkeypatch.setenv('HF_TOKEN', 'a-token-that-does-not-help-here')

    assert subject_brief.configured() is False
    with pytest.raises(subject_brief.BriefUnavailable) as caught:
        subject_brief.write(FINDINGS)
    assert 'ANTHROPIC_API_KEY' in str(caught.value)


def test_the_endpoint_reports_availability_rather_than_failing(client, monkeypatch):
    """The page asks before it draws the button.

    A control that is always there and says "no key" when pressed is a worse
    answer than no control, so the page needs to know beforehand.
    """
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    body = client.get('/api/subject_brief').json()
    assert body['success'] is True
    assert body['available'] is False


def test_the_endpoint_answers_readably_rather_than_erroring(client, monkeypatch):
    """A write-up that cannot be made is not a broken request.

    The same contract `/api/suggest_milestones` keeps: the page prints the
    message in the panel, over a page that was already complete without it.
    """
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    response = client.post('/api/subject_brief', json={'subject': 'Maths'})

    assert response.status_code == 200
    assert response.json()['success'] is False
    assert 'ANTHROPIC_API_KEY' in response.json()['message']


def test_the_endpoint_needs_a_subject_to_write_about(client):
    response = client.post('/api/subject_brief', json={'subject': '   '})
    assert response.status_code == 200
    assert response.json()['success'] is False


def test_what_the_log_taught_goes_into_the_write_up_brief():
    brief = subject_brief.brief_from({'subject': 'Mathematics',
                                      'about': ['Preference: Writes proofs by hand']})
    assert 'Preference: Writes proofs by hand' in brief
    assert subject_brief.planner.ABOUT_HEADING in brief


def test_and_into_a_subject_goal_draft():
    from backend.tracking import subject_goal
    brief = subject_goal.brief_from({'subject': 'Mathematics', 'milestones': [],
                                     'about': ['Long-term goal: Putnam top 500']})
    assert 'Long-term goal: Putnam top 500' in brief
