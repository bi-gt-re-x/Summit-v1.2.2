"""backend/tracking/planner.py — the environment it reads, and when.

Every test here is about timing rather than about planning. `load_dotenv()`
runs in the entry point, which is *after* this module is imported, so anything
the planner reads at import time reads as unset however carefully it was
written into .env. `provider()` has always been careful about that; the model
and the workspace id were not, for one commit, and the workspace id is the one
that cost something — the header was never sent, the API kept asking for the
workspace, and the error told the reader to do the thing they had done.

No network in any of these: `anthropic.Anthropic` is stubbed where a client
would be built, so what is asserted is the request the planner *would* make.
"""
import sys
import types

import pytest

from backend.tracking import planner


@pytest.fixture
def captured(monkeypatch):
    """Stand in for the SDK and record how the client was constructed."""
    seen = {}

    class FakeMessages:
        def create(self, **kwargs):
            seen['request'] = kwargs
            raise RuntimeError('stop here — the request is what is under test')

    class FakeAnthropic:
        def __init__(self, **kwargs):
            seen['client'] = kwargs
            self.messages = FakeMessages()

    monkeypatch.setitem(sys.modules, 'anthropic',
                        types.SimpleNamespace(Anthropic=FakeAnthropic))
    return seen


# --------------------------------------------------------------------------
# Read late, not at import
# --------------------------------------------------------------------------
def test_the_workspace_id_is_read_after_import(monkeypatch):
    """The regression. This module is imported before .env is loaded.

    Setting the variable now stands in for `load_dotenv()` setting it later:
    if this were still a module constant, the value below would be invisible.
    """
    monkeypatch.setenv('ANTHROPIC_WORKSPACE_ID', 'wrkspc_set_after_import')
    assert planner.workspace_id() == 'wrkspc_set_after_import'


def test_the_model_is_read_after_import_too(monkeypatch):
    """Same defect, same fix — an ANTHROPIC_MODEL in .env was also ignored."""
    monkeypatch.setenv('ANTHROPIC_MODEL', 'claude-opus-5')
    assert planner.model() == 'claude-opus-5'


def test_the_model_falls_back_to_the_default(monkeypatch):
    monkeypatch.delenv('ANTHROPIC_MODEL', raising=False)
    assert planner.model() == planner.ANTHROPIC_MODEL_DEFAULT == 'claude-sonnet-5'


def test_no_workspace_configured_is_the_empty_string(monkeypatch):
    monkeypatch.delenv('ANTHROPIC_WORKSPACE_ID', raising=False)
    assert planner.workspace_id() == ''


# --------------------------------------------------------------------------
# What reaches the request
# --------------------------------------------------------------------------
def test_the_workspace_header_is_sent_when_one_is_configured(monkeypatch, captured):
    monkeypatch.setenv('ANTHROPIC_WORKSPACE_ID', 'wrkspc_real')
    with pytest.raises(planner.PlannerUnavailable):
        planner._from_anthropic('Goal: something')

    assert captured['client']['default_headers'] == {
        'anthropic-workspace-id': 'wrkspc_real'}


def test_the_header_is_omitted_rather_than_sent_blank(monkeypatch, captured):
    """A blank workspace id is refused the same way a missing one is."""
    monkeypatch.delenv('ANTHROPIC_WORKSPACE_ID', raising=False)
    with pytest.raises(planner.PlannerUnavailable):
        planner._from_anthropic('Goal: something')

    assert captured['client']['default_headers'] is None


def test_the_model_in_the_environment_reaches_the_request(monkeypatch, captured):
    monkeypatch.setenv('ANTHROPIC_MODEL', 'claude-opus-5')
    with pytest.raises(planner.PlannerUnavailable):
        planner._from_anthropic('Goal: something')

    assert captured['request']['model'] == 'claude-opus-5'


def test_the_request_carries_effort_and_a_schema(monkeypatch, captured):
    """Both live in output_config; `effort` top-level would be ignored."""
    with pytest.raises(planner.PlannerUnavailable):
        planner._from_anthropic('Goal: something')

    config = captured['request']['output_config']
    assert config['effort'] == 'high'
    assert config['format']['type'] == 'json_schema'


def test_the_request_sends_nothing_this_model_rejects(monkeypatch, captured):
    """`budget_tokens`, `temperature`, `top_p` and `top_k` are 400s on Sonnet 5,
    and an assistant prefill is another. None of them is sent."""
    with pytest.raises(planner.PlannerUnavailable):
        planner._from_anthropic('Goal: something')

    request = captured['request']
    for banned in ('thinking', 'budget_tokens', 'temperature', 'top_p', 'top_k'):
        assert banned not in request
    assert [m['role'] for m in request['messages']] == ['user']


# --------------------------------------------------------------------------
# What the reader is told
# --------------------------------------------------------------------------
def test_a_rejected_workspace_id_is_not_told_to_go_and_set_one(monkeypatch, captured):
    """The circle this message used to send people round.

    Somebody who has set the value and had it refused needs to hear that it
    was refused — not to be sent back to .env to set it again.
    """
    monkeypatch.setenv('ANTHROPIC_WORKSPACE_ID', 'wrkspc_wrong')

    class Boom:
        def create(self, **kwargs):
            raise RuntimeError('anthropic-workspace-id header must be valid')

    monkeypatch.setitem(sys.modules, 'anthropic', types.SimpleNamespace(
        Anthropic=lambda **kw: types.SimpleNamespace(messages=Boom())))

    with pytest.raises(planner.PlannerUnavailable) as caught:
        planner._from_anthropic('Goal: something')

    message = str(caught.value)
    assert 'would not accept' in message
    assert 'wrkspc_wrong' in message


def test_no_workspace_at_all_names_both_ways_out(monkeypatch):
    """Setting the id is one fix; a workspace-scoped key removes the need."""
    monkeypatch.delenv('ANTHROPIC_WORKSPACE_ID', raising=False)

    class Boom:
        def create(self, **kwargs):
            raise RuntimeError(
                'anthropic-workspace-id is required when authenticating with '
                'an identity-linked API key')

    monkeypatch.setitem(sys.modules, 'anthropic', types.SimpleNamespace(
        Anthropic=lambda **kw: types.SimpleNamespace(messages=Boom())))

    with pytest.raises(planner.PlannerUnavailable) as caught:
        planner._from_anthropic('Goal: something')

    message = str(caught.value)
    assert 'ANTHROPIC_WORKSPACE_ID' in message
    assert 'workspace API key' in message


# ---------------------------------------------------------------------------
# Groq
# ---------------------------------------------------------------------------
# Added when the Anthropic account ran out of credits and the free provider
# stopped being a nice-to-have. The thing worth testing is not the HTTP call —
# it is the same POST the Hugging Face path has always made — but the two
# decisions around it: which provider gets picked, and what budget it is asked
# for. The second one is not cosmetic. Groq's free tier counts the tokens you
# *ask* for against a per-minute allowance, so a caller passing Anthropic's
# 16,000 gets a 413 before the model runs.
class TestChoosingGroq:
    def test_a_groq_key_alone_is_enough(self, monkeypatch):
        monkeypatch.delenv('MILESTONE_PROVIDER', raising=False)
        monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
        monkeypatch.delenv('HF_TOKEN', raising=False)
        monkeypatch.delenv('HUGGINGFACE_API_KEY', raising=False)
        monkeypatch.setenv('GROQ_API_KEY', 'gsk_test')
        assert planner.provider() == 'groq'

    def test_free_wins_when_several_keys_are_set(self, monkeypatch):
        # An account with both is not asking to be billed for a button it
        # could have free.
        monkeypatch.delenv('MILESTONE_PROVIDER', raising=False)
        monkeypatch.setenv('GROQ_API_KEY', 'gsk_test')
        monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-ant-test')
        assert planner.provider() == 'groq'

    def test_naming_anthropic_still_pins_to_it(self, monkeypatch):
        monkeypatch.setenv('MILESTONE_PROVIDER', 'anthropic')
        monkeypatch.setenv('GROQ_API_KEY', 'gsk_test')
        monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-ant-test')
        assert planner.provider() == 'anthropic'

    def test_naming_groq_without_a_key_is_nothing_rather_than_a_fallback(
            self, monkeypatch):
        # Silently billing an Anthropic key because the free one is missing is
        # the surprise this app should never spring.
        monkeypatch.setenv('MILESTONE_PROVIDER', 'groq')
        monkeypatch.delenv('GROQ_API_KEY', raising=False)
        monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-ant-test')
        assert planner.provider() == ''

    def test_the_key_is_read_late_like_every_other(self, monkeypatch):
        """The bug this whole file exists for, checked for the new name too."""
        monkeypatch.delenv('MILESTONE_PROVIDER', raising=False)
        monkeypatch.delenv('GROQ_API_KEY', raising=False)
        monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
        monkeypatch.delenv('HF_TOKEN', raising=False)
        monkeypatch.delenv('HUGGINGFACE_API_KEY', raising=False)
        assert planner.provider() == ''
        monkeypatch.setenv('GROQ_API_KEY', 'gsk_test')
        assert planner.provider() == 'groq'


class TestWhoCanHoldAShape:
    """`able()`, which is the question the four schema-shaped panels ask.

    `configured()` is the looser one the goals page asks: a list of five titles
    survives being requested in prose, and a subject reading does not.
    """

    def test_groq_can(self, monkeypatch):
        monkeypatch.delenv('MILESTONE_PROVIDER', raising=False)
        monkeypatch.setenv('GROQ_API_KEY', 'gsk_test')
        assert planner.able() is True

    def test_the_hugging_face_router_cannot(self, monkeypatch):
        monkeypatch.setenv('MILESTONE_PROVIDER', 'huggingface')
        monkeypatch.setenv('HF_TOKEN', 'hf_test')
        assert planner.configured() is True
        assert planner.able() is False

    def test_nothing_configured_can_do_neither(self, monkeypatch):
        monkeypatch.delenv('MILESTONE_PROVIDER', raising=False)
        monkeypatch.delenv('GROQ_API_KEY', raising=False)
        monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
        monkeypatch.delenv('HF_TOKEN', raising=False)
        monkeypatch.delenv('HUGGINGFACE_API_KEY', raising=False)
        assert planner.able() is False


class TestTheBudgetSentToGroq:
    @pytest.fixture
    def sent(self, monkeypatch):
        """Capture the payload without letting it reach the network."""
        seen = {}

        def fake_chat(url, token, model_id, label, brief, system=None,
                      instruction='', schema=None, max_tokens=0, *args, **kwargs):
            seen.update(url=url, model=model_id, label=label,
                        max_tokens=max_tokens, schema=schema)
            return '{}'

        monkeypatch.setattr(planner, '_from_openai_chat', fake_chat)
        monkeypatch.setenv('GROQ_API_KEY', 'gsk_test')
        return seen

    def test_an_anthropic_sized_budget_is_capped(self, sent):
        planner._from_groq('brief', max_tokens=16000)
        assert sent['max_tokens'] == planner.GROQ_MAX_TOKENS

    def test_a_smaller_request_is_left_alone(self, sent):
        planner._from_groq('brief', max_tokens=500)
        assert sent['max_tokens'] == 500

    def test_no_request_gets_the_default(self, sent):
        planner._from_groq('brief')
        assert sent['max_tokens'] == planner.GROQ_MAX_TOKENS

    def test_the_cap_fits_inside_the_free_tier(self):
        # The tier allows 8,000 tokens a minute across prompt and completion
        # together, and the subject reading's prompt is around 2,500 of them.
        assert planner.GROQ_MAX_TOKENS <= 5000

    def test_the_schema_is_actually_passed_on(self, sent):
        # The whole reason this panel can use a free provider at all.
        planner._from_groq('brief', schema={'type': 'object'})
        assert sent['schema'] == {'type': 'object'}

    def test_from_provider_routes_to_groq(self, sent):
        planner.from_provider('brief', schema={'type': 'object'})
        assert sent['label'] == 'Groq'
        assert sent['url'] == planner.GROQ_URL

# ---------------------------------------------------------------------------
# Grok (xAI)
# ---------------------------------------------------------------------------
# The thing worth testing here is not the HTTP call — it is the same POST the
# Hugging Face and Groq paths have always made — but the collision. "Grok" and
# "Groq" are one letter apart, they are different companies, and both are
# reachable from this module. Every test below is a way the two could be
# confused for each other, written down so that a later edit that blurs them
# fails here rather than in somebody's billing.
class TestGrokIsNotGroq:
    @pytest.fixture(autouse=True)
    def bare(self, monkeypatch):
        """No provider configured, so each test says exactly what it means."""
        for name in ('MILESTONE_PROVIDER', 'GROQ_API_KEY', 'XAI_API_KEY',
                     'GROK_API_KEY', 'ANTHROPIC_API_KEY', 'HF_TOKEN',
                     'HUGGINGFACE_API_KEY'):
            monkeypatch.delenv(name, raising=False)

    def test_an_xai_key_alone_is_enough(self, monkeypatch):
        monkeypatch.setenv('XAI_API_KEY', 'xai-test')
        assert planner.provider() == 'grok'

    def test_the_key_is_also_taken_under_the_name_people_type(self, monkeypatch):
        monkeypatch.setenv('GROK_API_KEY', 'xai-test')
        assert planner.provider() == 'grok'

    def test_a_groq_key_does_not_configure_grok(self, monkeypatch):
        """The expensive confusion: one letter, and a key sent to the wrong host."""
        monkeypatch.setenv('GROQ_API_KEY', 'gsk_test')
        assert planner._grok_token() == ''
        assert planner.provider() == 'groq'

    def test_an_xai_key_does_not_configure_groq(self, monkeypatch):
        monkeypatch.setenv('XAI_API_KEY', 'xai-test')
        assert planner._groq_token() == ''
        assert planner.provider() == 'grok'

    def test_naming_grok_does_not_fall_through_to_groq(self, monkeypatch):
        """A pinned name is a choice, not a preference. Off beats wrong."""
        monkeypatch.setenv('MILESTONE_PROVIDER', 'grok')
        monkeypatch.setenv('GROQ_API_KEY', 'gsk_test')
        assert planner.provider() == ''

    def test_naming_groq_does_not_fall_through_to_grok(self, monkeypatch):
        monkeypatch.setenv('MILESTONE_PROVIDER', 'groq')
        monkeypatch.setenv('XAI_API_KEY', 'xai-test')
        assert planner.provider() == ''

    def test_xai_is_accepted_as_the_name_too(self, monkeypatch):
        monkeypatch.setenv('MILESTONE_PROVIDER', 'xai')
        monkeypatch.setenv('XAI_API_KEY', 'xai-test')
        assert planner.provider() == 'grok'

    def test_the_free_ones_still_win_when_nothing_is_pinned(self, monkeypatch):
        """Adding a paid provider must not start billing an existing install."""
        monkeypatch.setenv('GROQ_API_KEY', 'gsk_test')
        monkeypatch.setenv('XAI_API_KEY', 'xai-test')
        assert planner.provider() == 'groq'

    def test_the_key_is_read_late_like_every_other(self, monkeypatch):
        """The bug this whole file exists for, checked for the new name too."""
        assert planner.provider() == ''
        monkeypatch.setenv('XAI_API_KEY', 'xai-test')
        assert planner.provider() == 'grok'

    def test_grok_can_hold_a_shape(self, monkeypatch):
        monkeypatch.setenv('XAI_API_KEY', 'xai-test')
        assert planner.able() is True


class TestWhatIsSentToGrok:
    @pytest.fixture
    def sent(self, monkeypatch):
        """Capture the payload without letting it reach the network."""
        seen = {}

        def fake_chat(url, token, model_id, label, brief, system=None,
                      instruction='', schema=None, max_tokens=0,
                      temperature=None, timeout=None, reasoning='',
                      *args, **kwargs):
            seen.update(url=url, token=token, model=model_id, label=label,
                        max_tokens=max_tokens, schema=schema,
                        reasoning=reasoning)
            return '{}'

        monkeypatch.setattr(planner, '_from_openai_chat', fake_chat)
        for name in ('MILESTONE_PROVIDER', 'GROQ_API_KEY', 'ANTHROPIC_API_KEY',
                     'HF_TOKEN', 'HUGGINGFACE_API_KEY'):
            monkeypatch.delenv(name, raising=False)
        monkeypatch.setenv('XAI_API_KEY', 'xai-test')
        return seen

    def test_it_goes_to_xai_and_not_to_groq(self, sent):
        planner._from_grok('brief')
        assert sent['url'] == planner.GROK_URL == 'https://api.x.ai/v1/chat/completions'
        assert sent['url'] != planner.GROQ_URL

    def test_the_label_the_reader_sees_names_the_right_company(self, sent):
        # This is the word every error message in `_from_openai_chat` is built
        # from — "Grok rejected the key" has to mean the xAI key.
        planner._from_grok('brief')
        assert sent['label'] == 'Grok'

    def test_the_xai_key_is_the_one_sent(self, sent):
        planner._from_grok('brief')
        assert sent['token'] == 'xai-test'

    def test_a_caller_budget_is_taken_rather_than_capped(self, sent):
        # Unlike Groq: there is no free-tier allowance to fit inside, so
        # trimming here would only truncate JSON that is about to be parsed.
        planner._from_grok('brief', max_tokens=16000)
        assert sent['max_tokens'] == 16000

    def test_no_request_gets_the_default(self, sent):
        planner._from_grok('brief')
        assert sent['max_tokens'] == planner.GROK_MAX_TOKENS

    def test_no_reasoning_effort_is_sent_by_default(self, sent):
        # grok-4 refuses the parameter outright, and `_from_openai_chat` only
        # knows how to retry a 400 that is about the schema.
        planner._from_grok('brief')
        assert sent['reasoning'] == ''

    def test_the_schema_is_actually_passed_on(self, sent):
        planner._from_grok('brief', schema={'type': 'object'})
        assert sent['schema'] == {'type': 'object'}

    def test_from_provider_routes_to_grok(self, sent):
        planner.from_provider('brief', schema={'type': 'object'})
        assert sent['label'] == 'Grok'
        assert sent['url'] == planner.GROK_URL

    def test_the_checkpoint_prompt_routes_to_grok(self, monkeypatch, sent):
        monkeypatch.setattr(planner, '_titles', lambda text: ['a', 'b', 'c', 'd', 'e'])
        planner.suggest_milestones('Reach USACO Gold')
        assert sent['url'] == planner.GROK_URL
        assert sent['schema'] == planner.SCHEMA

    def test_the_steps_prompt_routes_to_grok(self, monkeypatch, sent):
        monkeypatch.setattr(planner, '_titles', lambda text: ['a', 'b', 'c', 'd', 'e'])
        planner.suggest_steps('Silver DP unassisted', goal='Reach USACO Gold')
        assert sent['url'] == planner.GROK_URL
        assert sent['schema'] == planner.STEPS_SCHEMA

