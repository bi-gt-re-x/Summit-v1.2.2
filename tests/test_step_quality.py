"""Checkpoint steps that say what to open, how much, and when it's done.

Pinned: the vague-step check, the second pass it triggers, the resources and
the other checkpoints' steps reaching the brief, and Groq falling back to a
model with its own allowance when the main one is limited.
"""
import json

import pytest

from backend.tracking import planner

GOAL = 'Qualify for Mathcounts Nationals, score 24 AMC8'
CHECKPOINT = 'Scoring 24+ on timed AMC8 practice'
VAGUE = ['Review core topic notes and example problems',
         'Diagnose weaknesses with a Mathcounts topic quiz',
         'Solve timed practice sets for each topic',
         'Analyze errors, log patterns, and revise strategies',
         'Take a full Mathcounts mock test under exam conditions']
SHARP = ['Do AMC 8 2019 problems 1-25 in 40 minutes, score it',
         'Alcumus: 30 Counting & Probability problems at 85%+',
         'AoPS Intro to Number Theory ch. 5, all exercises',
         'Redo every 2019 miss untimed, write the trick for each',
         'Timed AMC 8 2022, aim for 24, log every miss by topic']


@pytest.mark.parametrize('step', VAGUE)
def test_vague_steps_are_caught(step):
    assert planner.too_generic(step, GOAL + ' ' + CHECKPOINT)


@pytest.mark.parametrize('step', SHARP)
def test_specific_steps_pass(step):
    assert not planner.too_generic(step, GOAL + ' ' + CHECKPOINT)


def _with_answers(monkeypatch, answers):
    """Stub the provider with a queue of answers; return the briefs it got."""
    briefs = []
    monkeypatch.setattr(planner, 'provider', lambda: 'groq')

    def fake(brief, system=None, instruction='', schema=None, max_tokens=0):
        briefs.append((brief, max_tokens))
        return json.dumps({'steps': answers.pop(0)})
    monkeypatch.setattr(planner, '_from_groq', fake)
    return briefs


def test_a_vague_draft_is_sent_back_once(monkeypatch):
    briefs = _with_answers(monkeypatch, [list(VAGUE), list(SHARP)])
    steps = planner.suggest_steps(CHECKPOINT, goal=GOAL, resources=['They already use: Alcumus'],
                                  taken=['Alcumus: 20 Algebra problems'])
    assert steps == SHARP
    assert len(briefs) == 2
    first, second = briefs[0][0], briefs[1][0]
    assert 'They already use: Alcumus' in first
    assert 'Alcumus: 20 Algebra problems' in first and "Don't repeat them" in first
    assert 'too vague to act on' in second and '"Review core topic notes and example problems"' in second
    assert briefs[0][1] == planner.STEPS_BUDGET


def test_a_sharp_draft_is_kept_without_a_second_call(monkeypatch):
    briefs = _with_answers(monkeypatch, [list(SHARP)])
    assert planner.suggest_steps(CHECKPOINT, goal=GOAL) == SHARP
    assert len(briefs) == 1


def test_a_worse_second_draft_doesnt_replace_the_first(monkeypatch):
    first = VAGUE[:2] + SHARP[:3]
    _with_answers(monkeypatch, [list(first), list(VAGUE)])
    assert planner.suggest_steps(CHECKPOINT, goal=GOAL) == first


def test_long_steps_are_cut_at_a_word(monkeypatch):
    long = 'Alcumus Counting & Probability: finish thirty brand new problems at the hardest level, ' \
           'ending with at least 85% accuracy overall'
    _with_answers(monkeypatch, [[long] + SHARP[1:]])
    step = planner.suggest_steps(CHECKPOINT, goal=GOAL)[0]
    assert len(step) <= 110 and long.startswith(step) and not step.endswith(' ')


def test_groq_falls_back_to_a_model_with_its_own_allowance(monkeypatch):
    calls = []

    def fake(url, token, model_id, *args):
        calls.append(model_id)
        if model_id == planner.GROQ_MODEL:
            raise planner.PlannerUnavailable('Groq is rate-limiting this key. Try again in a minute.')
        return '{"steps": []}'
    monkeypatch.setattr(planner, '_from_openai_chat', fake)
    monkeypatch.setattr(planner, '_groq_token', lambda: 'k')
    assert planner._from_groq('brief') == '{"steps": []}'
    assert calls == [planner.GROQ_MODEL, planner.GROQ_FALLBACK_MODEL]


def test_other_failures_dont_fall_back(monkeypatch):
    def fake(*args):
        raise planner.PlannerUnavailable('Groq rejected the key.')
    monkeypatch.setattr(planner, '_from_openai_chat', fake)
    monkeypatch.setattr(planner, '_groq_token', lambda: 'k')
    with pytest.raises(planner.PlannerUnavailable, match='rejected'):
        planner._from_groq('brief')


def test_the_steps_budget_is_allowed_past_the_usual_cap(monkeypatch):
    seen = []
    monkeypatch.setattr(planner, '_from_openai_chat', lambda *args: seen.append(args[8]) or '{}')
    monkeypatch.setattr(planner, '_groq_token', lambda: 'k')
    planner._from_groq('brief', max_tokens=planner.STEPS_BUDGET)
    planner._from_groq('brief', max_tokens=16000)
    planner._from_groq('brief')
    assert seen == [planner.STEPS_BUDGET, planner.GROQ_MAX_TOKENS, planner.GROQ_MAX_TOKENS]
