"""backend/tracking/planner.py — a whole goal from one sentence.

The two older jobs break down something the reader has already written, so
their answer is a list of strings and there is very little to get wrong on the
way out. This one fills in a *form*, and the form belongs to a page that
cannot render arbitrary values: the category picker draws nine fixed chips,
and the deadline lands in a date input.

So every test here is about the boundary rather than about the prompt. A model
that answers "academics", or 900 months, or JSON wrapped in an apology, is not
a hypothetical — it is Tuesday — and what matters is that none of those reach
the wizard.

No network anywhere: `from_provider` is replaced with something that returns a
canned string.
"""
import json

import pytest

from backend.tracking import planner


@pytest.fixture(autouse=True)
def keyed(monkeypatch):
    """A provider that holds a schema, so the guard is not what is under test."""
    for name in ('MILESTONE_PROVIDER', 'HF_TOKEN', 'HUGGINGFACE_API_KEY',
                 'ANTHROPIC_API_KEY', 'XAI_API_KEY', 'GROK_API_KEY'):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv('GROQ_API_KEY', 'gsk_test')


def answering(monkeypatch, payload):
    """Make the model return exactly this text."""
    monkeypatch.setattr(planner, 'from_provider',
                        lambda *args, **kwargs: payload)


WHOLE = {
    'title': 'Reach USACO Gold',
    'why': 'It is the result every summer programme worth going to asks for.',
    'category': 'coding',
    'months': 9,
    'milestones': ['Bronze solved unassisted', 'Silver DP unassisted',
                   'Silver consistently', 'Gold problems attempted',
                   'Gold division reached'],
}


class TestWhatComesBack:
    def test_a_clean_answer_passes_through(self, monkeypatch):
        answering(monkeypatch, json.dumps(WHOLE))
        drafted = planner.draft_goal('get good at usaco')
        assert drafted['title'] == 'Reach USACO Gold'
        assert drafted['category'] == 'coding'
        assert drafted['months'] == 9
        assert len(drafted['milestones']) == 5

    def test_json_in_a_fence_is_read(self, monkeypatch):
        answering(monkeypatch, '```json\n' + json.dumps(WHOLE) + '\n```')
        assert planner.draft_goal('x')['title'] == 'Reach USACO Gold'

    def test_json_behind_a_sentence_is_read(self, monkeypatch):
        answering(monkeypatch, 'Sure! Here is the goal:\n' + json.dumps(WHOLE))
        assert planner.draft_goal('x')['title'] == 'Reach USACO Gold'

    def test_a_short_list_is_kept_rather_than_refused(self, monkeypatch):
        # Unlike `suggest_milestones`, where five fields are waiting. Here they
        # land in a list the reader edits anyway, and three good checkpoints
        # beat throwing the whole draft away over the other two.
        answering(monkeypatch, json.dumps({**WHOLE, 'milestones': ['One', 'Two']}))
        assert planner.draft_goal('x')['milestones'] == ['One', 'Two']

    def test_more_than_five_is_cut(self, monkeypatch):
        answering(monkeypatch, json.dumps({**WHOLE, 'milestones': list('abcdefgh')}))
        assert len(planner.draft_goal('x')['milestones']) == planner.COUNT


class TestWhatIsNotLetThrough:
    """The wizard's fields are not free-form, so neither is this."""

    @pytest.mark.parametrize('given', ['academics', 'Competitive Programming', '', None, 7])
    def test_a_category_the_picker_cannot_draw_becomes_other(self, monkeypatch, given):
        answering(monkeypatch, json.dumps({**WHOLE, 'category': given}))
        assert planner.draft_goal('x')['category'] == 'other'

    def test_a_real_category_survives_its_casing(self, monkeypatch):
        answering(monkeypatch, json.dumps({**WHOLE, 'category': 'MATH'}))
        assert planner.draft_goal('x')['category'] == 'math'

    @pytest.mark.parametrize('given,want', [
        (0, planner.MONTHS_MIN),
        (-4, planner.MONTHS_MIN),
        (900, planner.MONTHS_MAX),
        ('nine', planner.MONTHS_FALLBACK),
        (None, planner.MONTHS_FALLBACK),
    ])
    def test_the_duration_is_bounded(self, monkeypatch, given, want):
        answering(monkeypatch, json.dumps({**WHOLE, 'months': given}))
        assert planner.draft_goal('x')['months'] == want

    def test_a_runaway_title_is_cut_rather_than_stored_whole(self, monkeypatch):
        answering(monkeypatch, json.dumps({**WHOLE, 'title': 'x' * 400}))
        assert len(planner.draft_goal('x')['title']) == 120


class TestWhenItCannot:
    def test_an_empty_idea_is_refused_before_the_model(self, monkeypatch):
        answering(monkeypatch, json.dumps(WHOLE))
        with pytest.raises(planner.PlannerUnavailable):
            planner.draft_goal('   ')

    def test_unreadable_json_is_a_sentence_not_a_crash(self, monkeypatch):
        answering(monkeypatch, 'I would rather not.')
        with pytest.raises(planner.PlannerUnavailable):
            planner.draft_goal('x')

    def test_an_answer_with_no_title_is_refused(self, monkeypatch):
        answering(monkeypatch, json.dumps({**WHOLE, 'title': '  '}))
        with pytest.raises(planner.PlannerUnavailable):
            planner.draft_goal('x')

    def test_a_provider_that_cannot_hold_a_shape_says_so(self, monkeypatch):
        """Hugging Face's default is asked for JSON in prose, and a *form* is
        not something to hope at. The message names the ones that work."""
        monkeypatch.delenv('GROQ_API_KEY', raising=False)
        monkeypatch.setenv('HF_TOKEN', 'hf_test')
        with pytest.raises(planner.PlannerUnavailable) as raised:
            planner.draft_goal('x')
        assert 'GROQ_API_KEY' in str(raised.value)

    def test_nothing_configured_says_that_instead(self, monkeypatch):
        monkeypatch.delenv('GROQ_API_KEY', raising=False)
        with pytest.raises(planner.PlannerUnavailable) as raised:
            planner.draft_goal('x')
        assert str(raised.value) == planner.NO_KEY
