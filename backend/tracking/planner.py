"""Breaking a goal into checkpoints, with a model.

## Why this is a model and not a rule

Every other file in this package computes something: XP from a task, a streak
from a run of days, focus time from a stopwatch. Those are arithmetic, and
arithmetic is what a tracker is for. "What are the five checkpoints between
here and USACO Gold?" is not arithmetic — it is domain knowledge about a
subject the app has never heard of, and there is no table it could be read
from. That is the one job here.

## What a checkpoint is, and why the prompt spends its words on it

The distinction the whole goals page is built on is that a milestone is *a
state the goal reaches*, not an action taken toward it — "Master Silver DP" is
a checkpoint, "Solve ten DP problems" is a task. A model asked for "five steps"
returns the tasks every time, so the prompt says which of the two it wants and
shows the difference rather than naming it.

Five, and exactly five, because that is what the page draws. The count is
asked for in the prompt and enforced here on the way back: `suggest` returns
five titles or raises, and never a short list the caller has to pad.

## Four providers, one job

Groq, Hugging Face, Grok and Anthropic — see `PROVIDERS`, which is also the
order they are tried in. The reason for the order is cost: this is one short
answer per goal a person creates by hand, so a small model behind a free-tier
token is the right size of tool, and nobody should need a paid account to use
a button. The two paid ones stay because they are markedly better at the part
that is actually hard — five checkpoints that are sequential, non-overlapping
and real advances on each other is a reasoning problem — and an account that
has a key should get that.

**Groq and Grok are not the same thing.** Groq is an inference host serving
open models; Grok is xAI's own model. Their names differ by one letter, both
speak the OpenAI chat shape, and both live in this file. Everything belonging
to one is spelled consistently — `GROQ_`/`groq` against `GROK_`/`grok` — and
`provider()` matches the two names exactly rather than fuzzily, so a
`MILESTONE_PROVIDER` naming one never quietly resolves to the other.

Which one runs is `MILESTONE_PROVIDER`, or whichever key is present when that
is unset. Everything below the provider split is shared: same system prompt,
same brief, same parse, same enforcement of five. Swapping providers changes
where the sentence comes from and nothing about what the page does with it.

## Small models do not return clean JSON

The Anthropic, Groq and Grok paths constrain the answer with a schema and get
an object back. The Hugging Face path asks for JSON and gets, variously: JSON,
JSON in a markdown fence, JSON with a sentence in front of it, a bare array, or
a numbered list in prose. `_titles` handles all of them, because the alternative
is a feature that works on Tuesdays. It is deliberately generous on the way in
and strict on the way out — anything it cannot read five titles from raises,
and the page says so.

## Nothing here writes

A suggestion is a draft. This module hands five strings back to the endpoint
and the endpoint hands them to the page, where they land in five editable
fields that only reach the database if the user saves them. The model proposes
the plan; the account owns it.
"""
import json
import os
import re
from typing import List

# What the page draws, so what the model is asked for and what is enforced on
# the way back.
COUNT = 5

# ---------------------------------------------------------------------------
# Anthropic
# ---------------------------------------------------------------------------
# Sonnet 5. Thinking is on by default here as it was on Opus, which is the
# property this actually depends on: the five have to be sequential and
# non-overlapping, and that is a reasoning problem rather than a recall one.
# `thinking` is left unset because omitting it on this model runs adaptive.
ANTHROPIC_MODEL_DEFAULT = 'claude-sonnet-5'


def model() -> str:
    """Which model answers. Read per call, for the reason `provider()` is."""
    return os.environ.get('ANTHROPIC_MODEL') or ANTHROPIC_MODEL_DEFAULT

# Room for the thinking as well as the answer — `max_tokens` is a hard limit
# on the two together, and five titles that arrive truncated are five titles
# the JSON parse rejects. 16k is the recommended ceiling for a request that
# does not stream, which this one does not: it is one short answer and the
# page is holding a spinner for it.
ANTHROPIC_MAX_TOKENS = 16000

def workspace_id() -> str:
    """The workspace a request acts in, or '' when there is none to name.

    Sent as `anthropic-workspace-id`. An identity-linked key belongs to a
    person rather than to a workspace, and the API refuses it with a 400 until
    the request names one. A key that is not identity-linked neither needs
    this nor is sent it — empty means the header is omitted entirely rather
    than sent blank, which is its own 400.

    **Read per call, and that is the whole point.** This was a module constant
    for one commit, and a constant is evaluated at import — which is before
    `load_dotenv()` runs in any of the three entry points. The result was that
    setting ANTHROPIC_WORKSPACE_ID in .env did nothing at all: the header was
    never sent, the API kept asking for the workspace, and the error kept
    telling the reader to do the thing they had already done. `provider()`
    says the same thing three functions down and has since it was written.
    """
    return os.environ.get('ANTHROPIC_WORKSPACE_ID') or ''

# ---------------------------------------------------------------------------
# Hugging Face
# ---------------------------------------------------------------------------
# The router is OpenAI-shaped, so this is one POST and no SDK: it takes the
# same `messages` array and answers in `choices[0].message.content`. Going
# through the router rather than at a named provider means the token works
# against whichever provider is actually serving the model that day.
HF_URL = 'https://router.huggingface.co/v1/chat/completions'

# A 7B that follows a JSON instruction well enough to be worth its price, which
# is the whole reason this path exists. Set HF_MODEL to trade up — a bigger
# instruct model gives noticeably better checkpoints and still costs a
# fraction of a frontier call:
#
#   Qwen/Qwen2.5-7B-Instruct          the default: cheapest that works
#   meta-llama/Llama-3.1-8B-Instruct  same size, often better prose
#   Qwen/Qwen2.5-72B-Instruct         much better plans, still cheap
#   meta-llama/Llama-3.3-70B-Instruct the strongest of the open options
HF_MODEL = os.environ.get('HF_MODEL') or 'Qwen/Qwen2.5-7B-Instruct'

# No thinking to budget for on these, and five six-word titles is a short
# answer. Generous enough that a model which preambles still gets its JSON out.
HF_MAX_TOKENS = 700

# Low, not zero. The task wants the obvious decomposition of a goal rather than
# an inventive one, and small models get less coherent as this climbs.
HF_TEMPERATURE = 0.3

# Long enough for a cold provider to load the model, short enough that the
# button does not look hung. The page holds its own spinner meanwhile.
HF_TIMEOUT = 60.0

# ---------------------------------------------------------------------------
# Groq
# ---------------------------------------------------------------------------
# The same OpenAI shape as the Hugging Face router, so it goes through the
# same POST — see `_from_openai_chat`. It is a separate provider rather than
# an HF_URL override because the two fail differently and a reader has to be
# told which one is refusing them.
GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

# A 120B mixture-of-experts, served free, that honours a strict JSON schema
# rather than being asked for JSON and hoped at. That last part is what makes
# it usable for the subject reading: `_from_openai_chat` sends the same schema
# the Anthropic path sends, so the answer arrives in the shape the page draws
# instead of in prose that has to be salvaged.
#
#   openai/gpt-oss-120b   the default: the strongest of the free options
#   qwen/qwen3.8-27b      smaller and quicker, noticeably shallower readings
#   openai/gpt-oss-20b    when the 120B is rate-limited
#
# `GET /openai/v1/models` on the key lists what is actually being served
# today, which is the only list worth trusting.
GROQ_MODEL = os.environ.get('GROQ_MODEL') or 'openai/gpt-oss-120b'

# This is a reasoning model and its thinking is billed against the completion,
# so the budget covers both. A subject reading that runs out mid-object comes
# back as unparseable JSON rather than as a short answer.
#
# The ceiling is the free tier's, not the model's. Groq counts the whole
# request — prompt plus the completion you *asked* for — against a limit of
# 8000 tokens a minute, so a generous `max_tokens` is refused before the model
# ever runs, with a 413 rather than a truncation. The subject reading's prompt
# is around 2,500 tokens, which leaves this much and no more.
#
# It is a cap rather than a default: the four callers pass budgets written for
# Anthropic, where 16,000 tokens is a rounding error, and passing one of those
# through here is exactly how the 413 gets hit. See `_from_groq`.
GROQ_MAX_TOKENS = 4500

# How much of that budget it is allowed to spend thinking. 'medium', not
# 'high': the job is reading a table rather than solving it, and at 'high' this
# model sometimes spends the entire completion on reasoning and emits nothing —
# which the server then fails against the schema as an empty string. There is a
# retry for that in `_from_openai_chat`, but not provoking it is better than
# recovering from it.
GROQ_REASONING = os.environ.get('GROQ_REASONING') or 'medium'

# The task wants the obvious reading of a table, not an inventive one.
GROQ_TEMPERATURE = 0.3

# It is fast — most calls land in a couple of seconds — but a queued request
# on the free tier can sit for a while before it starts.
GROQ_TIMEOUT = 90.0

# ---------------------------------------------------------------------------
# Grok (xAI)
# ---------------------------------------------------------------------------
# **Read the spelling twice.** This is Grok, xAI's model, and the section above
# is Groq, the inference host — two different companies whose names differ by
# one letter, both reachable from this file, both OpenAI-shaped. Everything
# here is `GROK_`/`grok`; everything above is `GROQ_`/`groq`. `provider()`
# matches the two names exactly and never falls from one to the other, because
# the failure that would cause is the worst kind: the button still works, the
# answers just come from somewhere the reader did not choose and a card is
# quietly billed to the wrong account.
GROK_URL = 'https://api.x.ai/v1/chat/completions'

# Grok honours a strict JSON schema, which is what puts it in SCHEMA_PROVIDERS
# alongside Groq and Anthropic — the subject reading and the two goal prompts
# need a shape held rather than asked for.
#
#   grok-4-fast    the default: cheap, long-context, and strong enough here
#   grok-4         better on the part that is actually hard, several times the
#                  price, and slower on a button somebody is waiting at
#   grok-3-mini    when the goals are simple and the bill matters more
#
# `GET https://api.x.ai/v1/models` on the key lists what is actually being
# served today, which is the only list worth trusting.
GROK_MODEL = os.environ.get('GROK_MODEL') or 'grok-4-fast'

# No free-tier allowance to fit inside — this is a metered account, so unlike
# `GROQ_MAX_TOKENS` this is a default rather than a cap and a caller asking for
# more gets more. Generous because grok-4-fast reasons, and reasoning is billed
# against the completion: an answer that runs out mid-object comes back as
# unparseable JSON rather than as a short one.
GROK_MAX_TOKENS = 8000

# Deliberately empty, and this is the one setting here worth explaining.
# `reasoning_effort` is accepted by some xAI models and *rejected outright* by
# others — grok-4 is the one that refuses it — and `_from_openai_chat` only
# knows how to retry a 400 that is about the schema. Sending nothing lets every
# model run at its own default and cannot 400; set it for a model documented to
# take it, and not otherwise.
GROK_REASONING = os.environ.get('GROK_REASONING') or ''

# The task wants the obvious decomposition of a goal, not an inventive one.
GROK_TEMPERATURE = 0.3

# Slower than Groq and quicker than a cold HF provider. The page holds a
# spinner meanwhile.
GROK_TIMEOUT = 90.0

# Tried in this order when MILESTONE_PROVIDER is unset. Free first: an account
# with several keys is not asking to be billed for a button it could have free.
# Groq leads because it is the only free one that honours a JSON schema, which
# is what the subject reading needs and the HF default cannot give it.
#
# The two paid ones come after, and Grok before Anthropic only because an
# account that has gone to the trouble of setting XAI_API_KEY has said which
# one it wants. Nothing an existing install does changes by this line growing:
# an account without an xAI key falls past it exactly as before.
PROVIDERS = ('groq', 'huggingface', 'grok', 'anthropic')

#: Providers that will hold a supplied JSON schema rather than being asked in
#: prose for a shape. The subject reading, the write-up and the two goal
#: prompts all need one; the goals page's checkpoint list does not.
SCHEMA_PROVIDERS = ('groq', 'grok', 'anthropic')

SYSTEM = """\
You break a long-term goal into its checkpoints for a study-planning app.

A checkpoint is a STATE THE GOAL REACHES, not an action taken toward it. This \
distinction is the whole point and getting it wrong makes the output useless:

  Goal: Reach USACO Gold
  Checkpoint (right): "Solving Silver DP problems unassisted"
  Checkpoint (wrong): "Do ten DP practice problems"

The second is a task. Tasks are the evidence a checkpoint is being reached and \
the app tracks them separately; you are writing the checkpoints.

Rules for the set you return:
- Exactly five, in the order they will be reached.
- Each one is a real advance on the one before it, and they do not overlap.
- The fifth is the goal itself being reached.
- Specific to this goal and its subject. "Make good progress" says nothing.
- Six words or fewer each, written as a state: no leading verb like \
"Complete", "Finish" or "Start".
- If you are given a deadline, pitch them at what can be reached by it: the \
five are spread evenly up to that date, so the first is a few weeks out, not \
a term.
"""

# Said only to the open models. The Anthropic path constrains the shape with a
# schema instead, and repeating it there costs tokens to no effect.
JSON_RULE = """\

Answer with JSON and nothing else — no explanation, no markdown fence:

{"milestones": ["first", "second", "third", "fourth", "fifth"]}
"""

# ---------------------------------------------------------------------------
# The second job: one checkpoint's checklist
# ---------------------------------------------------------------------------
# What a checkpoint's checklist holds, and so what is asked for. Between
# MIN_STEPS and MAX_STEPS in backend/api/goals.py, because the column is
# padded up to the first and cut at the second — asking for a number outside
# that range means asking for rows that will be silently added or dropped.
STEP_COUNT = 5

# The distinction the milestone prompt spends its words keeping apart is the
# one this prompt spends its words inverting. A checkpoint is a state; a step
# is the work that gets there, and here the actions are exactly what is
# wanted. Said plainly, because a model that has been told "not an action"
# about milestones will otherwise hedge toward states here too.
SYSTEM_STEPS = """\
You break one checkpoint of a long-term goal into the actions that reach it, \
for a study-planning app.

A step is an ACTION SOMEBODY DOES — a piece of work that can be sat down to \
and finished. This is the opposite of the checkpoint above it, which is a \
state being reached:

  Checkpoint: "Solving Silver DP problems unassisted"
  Step (right): "Work through the knapsack chapter"
  Step (wrong): "Confident with knapsack problems"

The second is a state. States are what checkpoints are; you are writing the \
work underneath one.

Rules for the set you return:
- Exactly five, in the order they would be done.
- Each is a single sitting or a small run of them, not a term's project.
- Concrete to this checkpoint and its subject. "Practise more" says nothing.
- Ten words or fewer each, starting with a verb.
- Together they are enough that finishing all five reaches the checkpoint.
- If you are told the checkpoints either side of this one, stay between \
them: nothing the one before already covers, nothing that belongs to the one \
after.
- If you are given a date, the five have to fit before it.
"""

STEPS_SCHEMA = {
    'type': 'object',
    'properties': {
        'steps': {
            'type': 'array',
            'items': {'type': 'string'},
            'description': 'The five steps, in the order they would be done.',
        },
    },
    'required': ['steps'],
    'additionalProperties': False,
}


class PlannerUnavailable(RuntimeError):
    """The model could not be reached, or was not configured.

    Carries a message written for the person looking at the goals page rather
    than for a log, because that is where it is shown.
    """


# ---------------------------------------------------------------------------
# Which provider
# ---------------------------------------------------------------------------
def _hf_token() -> str:
    """The Hugging Face token, under either of the names people have it under."""
    return (os.environ.get('HF_TOKEN')
            or os.environ.get('HUGGINGFACE_API_KEY')
            or '')


def _groq_token() -> str:
    """The Groq key. One name, because Groq only ever calls it this."""
    return os.environ.get('GROQ_API_KEY') or ''


def _grok_token() -> str:
    """The xAI key, under either of the names people have it under.

    `XAI_API_KEY` is what xAI's own console and SDK call it and is the name to
    prefer. `GROK_API_KEY` is here because it is what people type — the model
    is the thing they bought and the company is not — and a key that silently
    does nothing under a reasonable name is a support question rather than a
    configuration error.

    Note what is *not* accepted: `GROQ_API_KEY`. One letter away and a
    different company entirely, and reading it here would send an account's
    Groq key to api.x.ai, where it would be rejected and reported as a bad xAI
    key. See the section head over `GROK_URL`.
    """
    return (os.environ.get('XAI_API_KEY')
            or os.environ.get('GROK_API_KEY')
            or '')


def _keyed(provider: str) -> bool:
    """Whether this provider has what it needs to be called."""
    if provider == 'groq':
        return bool(_groq_token())
    if provider == 'grok':
        return bool(_grok_token())
    if provider == 'huggingface':
        return bool(_hf_token())
    if provider == 'anthropic':
        return bool(os.environ.get('ANTHROPIC_API_KEY'))
    return False


def provider() -> str:
    """The provider this call will use, or '' if none can be.

    Read per call rather than at import, because `load_dotenv()` in the entry
    point runs after this module is imported — the same reason `configured()`
    has always checked the environment late.
    """
    named = (os.environ.get('MILESTONE_PROVIDER') or '').strip().lower()
    # Exact, and the two lookalikes are matched separately on purpose: a name
    # that is one letter off is a name that meant the other provider, and
    # answering it with "close enough" is how a reader ends up reading Groq's
    # answers under the impression they are Grok's. Neither falls through to
    # the other, and a misspelling that is neither reaches the search below
    # and picks whatever is keyed — which is the pre-existing behaviour for an
    # unrecognised name and is what `NO_KEY` is worded against.
    if named == 'groq':
        return 'groq' if _keyed('groq') else ''
    if named in ('grok', 'xai'):
        return 'grok' if _keyed('grok') else ''
    if named in ('huggingface', 'hf'):
        return 'huggingface' if _keyed('huggingface') else ''
    if named == 'anthropic':
        return 'anthropic' if _keyed('anthropic') else ''
    return next((name for name in PROVIDERS if _keyed(name)), '')


def configured() -> bool:
    """Whether a suggestion can be made at all. Checked per call."""
    return bool(provider())


NO_KEY = (
    'Milestone suggestions need a model key in the environment. A free Groq '
    'key in GROQ_API_KEY is the shortest way there (console.groq.com → API '
    'Keys); a free Hugging Face token in HF_TOKEN works too, as do the paid '
    'XAI_API_KEY (Grok) and ANTHROPIC_API_KEY. Add one to .env and restart '
    'the server.')


# ---------------------------------------------------------------------------
# The brief
# ---------------------------------------------------------------------------
def _ask(goal: str, instruction: str = '') -> str:
    """The user turn. Everything the account has said about the thing.

    `instruction` is what to do with it, and it differs between the two jobs
    this module does — five checkpoints for a goal, or a checklist for one
    checkpoint. The brief underneath is built the same way for both.
    """
    lead = instruction or 'Break this goal into its five checkpoints.'
    return (lead + '\n\n' + goal)


def _brief(title: str, why: str = '', description: str = '',
           category: str = '', unit: str = '', target: str = '',
           deadline: str = '') -> str:
    """What the account has told us about the goal, as lines the model reads.

    Only the fields that were filled in. An empty "Why: " line is a line the
    model has to decide means nothing, and it sometimes decides wrong.

    The deadline goes in because it is what the checkpoints are laid out
    against — `_spread_dates` in backend/api/goals.py divides the run-up to it
    evenly — and a ladder drafted without it is pitched at no particular pace:
    five checkpoints for a goal due in six weeks and one due in two years came
    back the same.
    """
    lines = ['Goal: {}'.format(title.strip())]
    if category and category != 'other':
        lines.append('Field: {}'.format(category))
    if why.strip():
        lines.append('Why it matters: {}'.format(why.strip()))
    if description.strip():
        lines.append('Notes: {}'.format(description.strip()))
    if target:
        lines.append('Target: {}{}'.format(target, ' {}'.format(unit) if unit else ''))
    if str(deadline or '').strip():
        lines.append('Deadline: {}'.format(str(deadline).strip()[:10]))
    return '\n'.join(lines)


# ---------------------------------------------------------------------------
# Reading the answer
# ---------------------------------------------------------------------------
# A leading "1. ", "- ", "* " or "1) " on a prose fallback line.
_BULLET = re.compile(r'^\s*(?:[-*•]|\d+[.)])\s*')
# Quotes and trailing commas left by a list that was nearly JSON.
_TRIM = re.compile(r'^["\'\s,]+|["\'\s,]+$')


def _strings(value) -> List[str]:
    """Pull a list of titles out of whatever shape the JSON came back in."""
    if isinstance(value, list):
        found = []
        for entry in value:
            if isinstance(entry, str):
                found.append(entry)
            elif isinstance(entry, dict):
                # Some models answer [{"milestone": "..."}] however plainly the
                # prompt asked for strings.
                found.extend(str(inner) for inner in entry.values()
                             if isinstance(inner, str))
        return found
    if isinstance(value, dict):
        for key in ('milestones', 'checkpoints', 'steps', 'result', 'items'):
            if key in value:
                return _strings(value[key])
        # A single-key object wrapping the list under a name we did not guess.
        if len(value) == 1:
            return _strings(next(iter(value.values())))
    return []


def _titles(text: str) -> List[str]:
    """Five titles from a model's answer, however it chose to format it.

    Generous on the way in — see the module docstring. Order of attempts is
    cheapest-and-most-likely first, and each one is a shape a small model has
    actually been seen to return.
    """
    if not text or not text.strip():
        return []
    body = text.strip()

    # A markdown fence, with or without a language tag.
    fence = re.search(r'```(?:json)?\s*(.+?)```', body, re.S)
    if fence:
        body = fence.group(1).strip()

    # Clean JSON, which is the case the prompt asks for.
    try:
        found = _strings(json.loads(body))
        if found:
            return found
    except (json.JSONDecodeError, ValueError):
        pass

    # JSON with a sentence in front of it or behind it. Widest span first, so
    # an object holding the array wins over the array alone.
    for pattern in (r'\{.*\}', r'\[.*\]'):
        match = re.search(pattern, body, re.S)
        if not match:
            continue
        try:
            found = _strings(json.loads(match.group(0)))
            if found:
                return found
        except (json.JSONDecodeError, ValueError):
            continue

    # Prose: a numbered or bulleted list. Only lines that were actually marked
    # as list items, so a preamble sentence does not become a checkpoint.
    lines = [_TRIM.sub('', _BULLET.sub('', line))
             for line in body.splitlines() if _BULLET.match(line)]
    return [line for line in lines if line]


# ---------------------------------------------------------------------------
# The providers
# ---------------------------------------------------------------------------
# The response is parsed, so it is constrained rather than asked for politely.
# `minItems`/`maxItems` are not supported constraints, which is why the count
# is stated in the prompt and checked below instead.
SCHEMA = {
    'type': 'object',
    'properties': {
        'milestones': {
            'type': 'array',
            'items': {'type': 'string'},
            'description': 'The five checkpoints, in the order they are reached.',
        },
    },
    'required': ['milestones'],
    'additionalProperties': False,
}


def from_anthropic(brief: str, system: str = None, schema: dict = None,
                   instruction: str = '', model_id: str = '',
                   max_tokens: int = 0) -> str:
    """One schema-constrained answer from Anthropic, as raw text.

    Public, and named without the underscore, because a second module now
    calls it: backend/tracking/subject_brief.py asks a different question with
    a different prompt and schema. What is shared is everything around the
    question — building the client, the workspace header, the refusal check,
    and the two error messages that took a while to word. Duplicating those
    would mean a second copy of the identity-linked-key explanation, which is
    the one message here a reader actually has to act on.

    `model_id` and `max_tokens` default to this module's own, so the goals
    page's two calls are unchanged by the parameter existing.
    """
    try:
        import anthropic
    except ImportError as exc:  # pragma: no cover - dependency is in requirements
        raise PlannerUnavailable(
            'The anthropic package is not installed. Run: '
            '.venv-fastapi/bin/python -m pip install -r requirements.txt'
        ) from exc

    # The header is omitted rather than sent empty when there is no workspace
    # to name: a blank one is refused the same way a missing one is.
    workspace = workspace_id()
    client = anthropic.Anthropic(
        default_headers=({'anthropic-workspace-id': workspace}
                         if workspace else None))
    try:
        response = client.messages.create(
            model=model_id or model(),
            max_tokens=max_tokens or ANTHROPIC_MAX_TOKENS,
            system=system or SYSTEM,
            # `high` is this model's own default, and the level its guidance
            # calls the balance of cost against intelligence. It was 'medium'
            # under Opus, and carrying that down a tier would have been two
            # step-downs at once — medium here is described as comparable to
            # the *previous* Sonnet at high, and a weak plan is worse than no
            # plan. Raise to 'xhigh' if the checkpoints come back shallow;
            # that is the documented lever, rather than prompting around it.
            output_config={
                'effort': 'high',
                'format': {'type': 'json_schema', 'schema': schema or SCHEMA},
            },
            messages=[{'role': 'user', 'content': _ask(brief, instruction)}],
        )
    except Exception as exc:  # noqa: BLE001 - every failure reads the same here
        # One exception to "every failure reads the same": a key that belongs
        # to a person rather than to a workspace is refused until the request
        # names one, and the raw 400 for it is the API talking to a developer.
        # This module's errors are shown on the goals page, so it says what to
        # do instead of what happened.
        if 'anthropic-workspace-id' in str(exc):
            # Two different failures reach here and the reader can only act on
            # the right one if they are told apart: nothing set, or something
            # set that the API would not take. Saying "put it in .env" to
            # somebody who has already put it in .env is how the last version
            # of this message sent a reader in a circle.
            if workspace_id():
                raise PlannerUnavailable(
                    'Anthropic would not accept the workspace id in '
                    'ANTHROPIC_WORKSPACE_ID ({!r}). Check it against the id in '
                    'the console URL with the workspace open.'.format(
                        workspace_id())) from exc
            raise PlannerUnavailable(
                'This Anthropic key is identity-linked: it belongs to a person '
                'rather than to a workspace, so every request has to name the '
                'workspace it acts in. Two ways out, and the second is less to '
                'maintain: set ANTHROPIC_WORKSPACE_ID in .env to the id in the '
                'console URL with the workspace open, or make a workspace API '
                'key in that workspace and use it instead — a key that already '
                'belongs to a workspace needs none of this. Restart whatever '
                'read .env either way.') from exc
        # The other three answers a correctly-configured install actually
        # gets. All of them arrive as a 400 or 401 carrying a sentence written
        # for whoever wrote the client, and all of them are shown to somebody
        # looking at a page in an app — so each one says what to do instead of
        # what the API said. The catch-all below still exists for everything
        # not on this list; it is a floor, not the plan.
        text = str(exc)
        if 'credit balance' in text:
            raise PlannerUnavailable(
                'This Anthropic account is out of API credits, so the model '
                'cannot be called. Add credits under Plans & Billing in the '
                'Anthropic console — API credits are separate from a Claude '
                'subscription, and a Pro or Max plan does not include them.'
            ) from exc
        if 'authentication_error' in text or 'invalid x-api-key' in text:
            raise PlannerUnavailable(
                'Anthropic did not accept the key in ANTHROPIC_API_KEY. Check '
                'it has not been revoked, and that it was copied whole.'
            ) from exc
        if 'rate_limit' in text:
            raise PlannerUnavailable(
                'Anthropic is rate-limiting this key. Try again in a minute.'
            ) from exc
        raise PlannerUnavailable(
            'Could not reach the model: {}'.format(exc)) from exc

    # Checked before the content is read: on a refusal `content` is empty or a
    # partial, and indexing it is how this would become a 500 instead of a
    # sentence on the page.
    if response.stop_reason == 'refusal':
        raise PlannerUnavailable(
            'The model declined to plan this. Try rewording the title.')

    return next((block.text for block in response.content
                 if block.type == 'text'), '')


#: The name the two calls in this module were written against.
_from_anthropic = from_anthropic


def _from_openai_chat(url: str, token: str, model_id: str, label: str,
                      brief: str, system: str = None, instruction: str = '',
                      schema: dict = None, max_tokens: int = 0,
                      temperature: float = HF_TEMPERATURE,
                      timeout: float = HF_TIMEOUT,
                      reasoning: str = '') -> str:
    """One answer from any OpenAI-shaped chat endpoint, as raw text.

    Two providers here speak this: the Hugging Face router and Groq. Both take
    the same `messages` array and answer in `choices[0].message.content`, so
    the only things that differ are the URL, the token, the model name and the
    word in the error messages — which is what `label` is for. Writing this
    twice would mean two copies of the six status codes below, and those are
    the part a reader actually sees.

    `schema` is honoured when the provider supports it. Groq holds a strict
    JSON schema, which is why the subject reading can use it at all; the HF
    router's default model cannot, so it is asked in prose instead and gets
    `JSON_RULE` appended. A provider that refuses the schema outright is
    retried once without it rather than failing the button — see below.
    """
    try:
        import httpx
    except ImportError as exc:  # pragma: no cover - arrives with anthropic
        raise PlannerUnavailable(
            'The httpx package is not installed. Run: '
            '.venv-fastapi/bin/python -m pip install -r requirements.txt'
        ) from exc

    def payload_for(with_schema: bool) -> dict:
        # The rule is appended only when the shape is being asked for in prose.
        # Sending both is a schema and a paragraph saying the same thing, and
        # the paragraph is the one that costs tokens on every call.
        body = {
            'model': model_id,
            'max_tokens': max_tokens or HF_MAX_TOKENS,
            'temperature': temperature,
            'messages': [
                {'role': 'system',
                 'content': (system or SYSTEM) + ('' if with_schema else JSON_RULE)},
                {'role': 'user', 'content': _ask(brief, instruction)},
            ],
        }
        if with_schema:
            body['response_format'] = {
                'type': 'json_schema',
                'json_schema': {'name': 'answer', 'strict': True, 'schema': schema},
            }
        else:
            # Honoured by some providers and ignored by the rest, which is why
            # `_titles` does not depend on it. Asking costs nothing and makes
            # the clean-JSON path the common one.
            body['response_format'] = {'type': 'json_object'}
        if reasoning:
            body['reasoning_effort'] = reasoning
        return body

    def post(body: dict):
        try:
            return httpx.post(
                url,
                headers={'Authorization': 'Bearer {}'.format(token)},
                json=body,
                timeout=timeout,
            )
        except Exception as exc:  # noqa: BLE001 - one message for every transport failure
            raise PlannerUnavailable(
                'Could not reach {}: {}'.format(label, exc)) from exc

    response = post(payload_for(bool(schema)))

    # Two different 400s arrive from a schema-constrained call, they want
    # opposite responses, and telling them apart is worth the branch.
    #
    # `json_validate_failed` is transient. A reasoning model can spend its
    # whole budget thinking and emit nothing, and the server then fails the
    # empty string against the schema — the body comes back with
    # `failed_generation` empty, which is the tell. That is worth one more
    # attempt at the same thing, because the same request usually works.
    #
    # Anything else the provider says about `response_format` or `schema` is
    # structural: it will not hold a shape, and asking again changes nothing.
    # Falling back to prose is worse than a schema and much better than a
    # button that does not work.
    if schema and response.status_code == 400:
        if 'json_validate_failed' in response.text:
            response = post(payload_for(True))
            if response.status_code == 400:
                response = post(payload_for(False))
        elif 'response_format' in response.text or 'schema' in response.text:
            response = post(payload_for(False))

    if response.status_code == 401:
        raise PlannerUnavailable(
            '{} rejected the key. Check it is current and was copied whole.'.format(label))
    if response.status_code == 402:
        raise PlannerUnavailable(
            'This {} account is out of inference credits. Wait for the reset, '
            'or point the model setting at a smaller model.'.format(label))
    if response.status_code == 404:
        raise PlannerUnavailable(
            '“{}” is not being served by {}. Set a model that is.'.format(model_id, label))
    if response.status_code == 429:
        raise PlannerUnavailable(
            '{} is rate-limiting this key. Try again in a minute.'.format(label))
    # Not "too large" in the sense the status code usually means. Free tiers
    # count the tokens you *ask* for against a per-minute allowance, so this
    # arrives when the allowance is nearly spent rather than when the prompt is
    # long — and "wait a minute" is the fix for it, not "write less".
    if response.status_code == 413:
        raise PlannerUnavailable(
            'This {} key has used its tokens for the minute. Wait a minute and '
            'try again.'.format(label))
    if response.status_code >= 400:
        raise PlannerUnavailable(
            '{} returned {}: {}'.format(label, response.status_code, response.text[:200]))

    try:
        choice = response.json()['choices'][0]['message']['content']
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise PlannerUnavailable(
            '{}\u2019s answer could not be read. Try again.'.format(label)) from exc
    return choice or ''


def _from_huggingface(brief: str, system: str = None,
                      instruction: str = '', schema: dict = None,
                      max_tokens: int = 0) -> str:
    """The Hugging Face router, through the shared OpenAI-shaped POST.

    No schema is passed on by default: the router's cheap default model does
    not hold one, and asking for a shape it cannot honour spends the retry
    above on every single call.
    """
    return _from_openai_chat(
        HF_URL, _hf_token(), HF_MODEL, 'Hugging Face',
        brief, system, instruction, schema, max_tokens or HF_MAX_TOKENS)


def _from_grok(brief: str, system: str = None, instruction: str = '',
               schema: dict = None, max_tokens: int = 0) -> str:
    """Grok, through the same POST, with the schema sent.

    Unlike `_from_groq` below this takes the caller's budget rather than
    capping it. There is no free tier to fit inside — the account is metered —
    so a caller that asked for a bigger answer has a reason to want one and
    trimming it here would only truncate the JSON it is about to parse.
    """
    return _from_openai_chat(
        GROK_URL, _grok_token(), GROK_MODEL, 'Grok',
        brief, system, instruction, schema,
        max_tokens or GROK_MAX_TOKENS,
        GROK_TEMPERATURE, GROK_TIMEOUT, GROK_REASONING)


def _from_groq(brief: str, system: str = None, instruction: str = '',
               schema: dict = None, max_tokens: int = 0) -> str:
    """Groq, through the same POST, with the schema actually sent.

    The caller's budget is capped rather than taken. Every caller here was
    written against Anthropic and asks for 16,000 tokens, which the free tier
    refuses outright — see `GROQ_MAX_TOKENS`. Silently asking for less is the
    right failure: the answer is a page of JSON, not an essay, and a caller
    that wanted a bigger one still gets as much as the tier will give.
    """
    return _from_openai_chat(
        GROQ_URL, _groq_token(), GROQ_MODEL, 'Groq',
        brief, system, instruction, schema,
        min(max_tokens or GROQ_MAX_TOKENS, GROQ_MAX_TOKENS),
        GROQ_TEMPERATURE, GROQ_TIMEOUT, GROQ_REASONING)


# ---------------------------------------------------------------------------
# The one call the other four modules make
# ---------------------------------------------------------------------------
def able() -> bool:
    """Whether a schema-shaped answer can be had from anything configured.

    The subject reading, the write-up and the two goal prompts all need a
    provider that will hold a shape. `configured()` is the looser question the
    goals page asks, because a list of five titles survives being asked for in
    prose.
    """
    return provider() in SCHEMA_PROVIDERS


def from_provider(brief: str, system: str = None, schema: dict = None,
                  instruction: str = '', model_id: str = '',
                  max_tokens: int = 0) -> str:
    """One schema-constrained answer from whichever provider is configured.

    The four modules that ask a model to read a table used to name Anthropic
    directly, which was right while Anthropic was the only provider that would
    hold a schema. Groq holds one too, so the choice belongs here rather than
    in four copies — and an account with a free key should not be told its
    panel needs a paid one.

    `model_id` is Anthropic's alone. Groq's model is `GROQ_MODEL`, because the
    two providers do not share a naming scheme and a caller that knows one
    cannot be asked to know the other.
    """
    using = provider()
    if not using:
        raise PlannerUnavailable(NO_KEY)
    if using == 'groq':
        return _from_groq(brief, system, instruction, schema, max_tokens)
    if using == 'grok':
        return _from_grok(brief, system, instruction, schema, max_tokens)
    if using == 'huggingface':
        return _from_huggingface(brief, system, instruction, schema, max_tokens)
    return from_anthropic(brief, system, schema, instruction, model_id, max_tokens)


# ---------------------------------------------------------------------------
# The one thing this module does
# ---------------------------------------------------------------------------
def suggest_milestones(title, why='', description='', category='',
                       unit='', target='', deadline='') -> List[str]:
    """Five checkpoint titles for this goal, in order.

    Raises `PlannerUnavailable` for anything the page should say out loud: no
    key, no package, a refused request, a call that failed. The caller turns
    that into a message on the goal rather than into a 500 — a suggestion
    failing is a suggestion not appearing, not the page breaking.
    """
    if not (title or '').strip():
        raise PlannerUnavailable('A goal needs a title before it can be broken down.')

    using = provider()
    if not using:
        raise PlannerUnavailable(NO_KEY)

    brief = _brief(title, why, description, category, unit, target, deadline)
    if using == 'groq':
        text = _from_groq(brief, schema=SCHEMA)
    elif using == 'grok':
        text = _from_grok(brief, schema=SCHEMA)
    elif using == 'huggingface':
        text = _from_huggingface(brief)
    else:
        text = _from_anthropic(brief)

    cleaned = [str(entry).strip() for entry in _titles(text) if str(entry).strip()]
    if len(cleaned) < COUNT:
        raise PlannerUnavailable(
            'The model returned {} checkpoints instead of {}. Try again.'.format(
                len(cleaned), COUNT))
    return cleaned[:COUNT]


def suggest_steps(milestone, goal='', why='', description='', category='',
                  unit='', target='', deadline='', before='', after='') -> List[str]:
    """Five steps for one checkpoint, in the order they would be done.

    The goal is passed as well as the checkpoint because a checkpoint title is
    six words and frequently meaningless alone: "Silver DP unassisted" is a
    different checklist under "Reach USACO Gold" than it would be under a
    goal about teaching. The model gets both and is asked about the one.

    `before` and `after` are the checkpoints either side of it on the ladder.
    Every checkpoint of a new goal is broken down at once now, each by its own
    call, and a call that sees only its own checkpoint writes steps that
    belong to its neighbours — the second rung's checklist re-covering the
    first's, the fourth's starting on the fifth's. `deadline` is the
    checkpoint's own date where it has one and the goal's otherwise.

    Raises `PlannerUnavailable` on everything the page should say out loud,
    exactly as `suggest_milestones` does — a checklist that cannot be drafted
    is a checkpoint with the blank rows it would have had anyway.
    """
    if not (milestone or '').strip():
        raise PlannerUnavailable('A checkpoint needs a title before it can be broken down.')

    using = provider()
    if not using:
        raise PlannerUnavailable(NO_KEY)

    brief = _brief(goal or milestone, why, description, category, unit, target,
                   deadline)
    if goal.strip():
        brief += '\n\nCheckpoint to break down: {}'.format(milestone.strip())
        if str(before or '').strip():
            brief += ('\nThe checkpoint before it, whose work is already '
                      'covered: {}'.format(before.strip()))
        if str(after or '').strip():
            brief += ('\nThe checkpoint after it, whose work comes later: '
                      '{}'.format(after.strip()))
    else:
        brief = 'Checkpoint to break down: {}'.format(milestone.strip())
    instruction = 'Break this checkpoint into the five steps that reach it.'

    if using == 'groq':
        text = _from_groq(brief, SYSTEM_STEPS, instruction, STEPS_SCHEMA)
    elif using == 'grok':
        text = _from_grok(brief, SYSTEM_STEPS, instruction, STEPS_SCHEMA)
    elif using == 'huggingface':
        text = _from_huggingface(brief, SYSTEM_STEPS, instruction)
    else:
        text = _from_anthropic(brief, SYSTEM_STEPS, STEPS_SCHEMA, instruction)

    cleaned = [str(entry).strip() for entry in _titles(text) if str(entry).strip()]
    if len(cleaned) < STEP_COUNT:
        raise PlannerUnavailable(
            'The model returned {} steps instead of {}. Try again.'.format(
                len(cleaned), STEP_COUNT))
    return cleaned[:STEP_COUNT]
