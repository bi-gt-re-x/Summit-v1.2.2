"""Spaces AI: build or change a page from a sentence in the chat sidebar.

The reader types what they want ("a study plan for the AMC 10 with a
checklist and a progress chart") and the model answers with blocks in the
editor's own shape (frontend/src/components/Spaces/blocks.ts). The API layer
(backend/api/spaces.py) cleans them with the same `_clean_doc` a normal save
goes through, so nothing the model sends can put a block on the page that the
editor couldn't have made.

Three things keep it honest:

- The current page goes in the brief, so "add a section on geometry" adds to
  what's there instead of starting over.
- Reference facts about the topic are looked up first (backend/tracking/
  sources.py), so dates, formats and syllabus contents come from Wikipedia
  rather than the model's memory.
- What the reader has told Summit about themselves (About you and the Log)
  goes in too, so a plan fits them.

`mode` is the model's call: `replace` for "make me a page about X", `append`
for "add a to-do list". Either way the reader can undo it from the chat.
"""
from typing import Any, Dict, List, Sequence

from backend.tracking import planner
from backend.tracking.plainwords import STYLE, plain
from backend.tracking.subject_brief import BriefUnavailable, _object

MAX_TOKENS = 8000

#: The kinds the model may write. Stickies, shapes and containers are drawn
#: things the reader places by hand; a model placing them blind makes a mess.
KINDS = ('text', 'h1', 'h2', 'h3', 'bullet', 'numbered', 'todo', 'toggle',
         'quote', 'callout', 'divider', 'code', 'chart', 'live')

#: Live sources that need nothing but their name, plus `goal` with an id.
LIVE_SOURCES = ('productivity', 'records', 'calendar', 'heatmap', 'rhythm',
                'subjects', 'goals', 'goal')

#: How much of the page and the conversation the brief carries.
PAGE_CHARS = 6000
HISTORY_TURNS = 8
BLOCKS_MAX = 80

SYSTEM = """\
You build pages in a student's notebook app, from what they ask for in a chat.

A page is a list of blocks. Each block has a type:
text, h1, h2, h3, bullet, numbered, todo, toggle, quote, callout, divider,
code, chart, live.

- `indent` (0 to 2) nests a block under the one above it. Bullets under a
  toggle are indented 1 so they fold with it.
- `todo` blocks can set `checked`.
- `chart` blocks need `chart`: a kind (bar, line, area, pie, donut) and 1 to
  12 points with a short label and a number. Only chart numbers that are
  real: from the references, or ones the reader gave you. Never make up data.
- `live` blocks show the reader's own data and update by themselves. Set
  `live_source` to one of: productivity, records, calendar, heatmap, rhythm,
  subjects, goals, goal. For `goal`, set `goal` to one of the goal ids listed
  in the brief. Use these when the reader wants to track their own progress.
- Leave `chart`, `live_source` and `goal` null on every other block.

Write a real page: a clear h1, short sections with h2s, and content that's
specific and useful (actual topics, steps, resources), not filler. Keep each
text block to a few sentences.

FACTS

The brief may include reference facts from Wikipedia. Take facts about the
topic (dates, formats, rules, what's covered) from those. If you aren't sure
of something and it isn't in them, leave it out or tell the reader to check
it. Never invent dates, scores, prices or statistics.

WHAT TO RETURN

- `reply`: one or two short sentences to the reader saying what you did.
- `mode`: `replace` to rewrite the whole page (a new page, or "start over"),
  `append` to add blocks under what's there (anything that asks to add to
  it). If they ask to change something specific, use `replace` and return
  the whole page with the change made, keeping everything else as it was.
- `icon`: one emoji for the page, or an empty string to leave it.
- `blocks`: the blocks to write.
""" + STYLE

_BLOCK = {
    'type': 'object',
    'additionalProperties': False,
    'required': ['type', 'text', 'indent', 'checked', 'chart', 'live_source', 'goal'],
    'properties': {
        'type': {'type': 'string', 'enum': list(KINDS)},
        'text': {'type': 'string'},
        'indent': {'type': 'integer'},
        'checked': {'type': 'boolean'},
        'chart': {
            'anyOf': [
                {'type': 'null'},
                {
                    'type': 'object',
                    'additionalProperties': False,
                    'required': ['kind', 'points'],
                    'properties': {
                        'kind': {'type': 'string', 'enum': ['bar', 'line', 'area', 'pie', 'donut']},
                        'points': {
                            'type': 'array',
                            'items': {
                                'type': 'object',
                                'additionalProperties': False,
                                'required': ['label', 'value'],
                                'properties': {'label': {'type': 'string'},
                                               'value': {'type': 'number'}},
                            },
                        },
                    },
                },
            ],
        },
        'live_source': {'anyOf': [{'type': 'null'}, {'type': 'string', 'enum': list(LIVE_SOURCES)}]},
        'goal': {'anyOf': [{'type': 'null'}, {'type': 'string'}]},
    },
}

SCHEMA = {
    'type': 'object',
    'additionalProperties': False,
    'required': ['reply', 'mode', 'icon', 'blocks'],
    'properties': {
        'reply': {'type': 'string'},
        'mode': {'type': 'string', 'enum': ['replace', 'append']},
        'icon': {'type': 'string'},
        'blocks': {'type': 'array', 'items': _BLOCK},
    },
}


def brief_from(prompt: str, page_text: str, page_name: str, history: Sequence[dict],
               goals: Sequence[dict], about: Sequence[str]) -> str:
    lines: List[str] = ['PAGE NAME: {}'.format(page_name or 'Untitled')]
    page_text = (page_text or '').strip()
    if page_text:
        lines += ['', 'WHAT THE PAGE HOLDS NOW (one line per block):',
                  page_text[:PAGE_CHARS]]
    else:
        lines += ['', 'The page is empty.']

    if goals:
        lines += ['', 'THE READER\'S GOALS (for live goal blocks, use the id):']
        lines += ['- id {}: {}'.format(goal['id'], goal['title']) for goal in goals]

    if about:
        lines += ['', planner.ABOUT_HEADING]
        lines += ['- {}'.format(line) for line in about]

    turns = [turn for turn in history if str(turn.get('text') or '').strip()][-HISTORY_TURNS:]
    if turns:
        lines += ['', 'THE CHAT SO FAR:']
        for turn in turns:
            who = 'Reader' if turn.get('role') == 'user' else 'You'
            lines.append('{}: {}'.format(who, str(turn['text']).strip()[:600]))

    lines += ['', 'WHAT THEY ASK NOW: {}'.format(prompt.strip())]
    return '\n'.join(lines)


def _block(raw: Dict[str, Any], goal_ids: set) -> Dict[str, Any]:
    """One model block in the editor's shape, before the API's own cleaning."""
    kind = raw.get('type') if raw.get('type') in KINDS else 'text'
    block: Dict[str, Any] = {'type': kind, 'text': plain(str(raw.get('text') or ''))}
    try:
        indent = max(0, min(2, int(raw.get('indent') or 0)))
    except (TypeError, ValueError):
        indent = 0
    if indent:
        block['indent'] = indent
    if kind == 'todo' and raw.get('checked') is True:
        block['checked'] = True
    if kind == 'chart':
        chart = raw.get('chart') if isinstance(raw.get('chart'), dict) else {}
        block['chart'] = {
            'kind': chart.get('kind') or 'bar',
            'points': chart.get('points') or [],
            'max': max([float(p.get('value') or 0) for p in chart.get('points') or []
                        if isinstance(p, dict)] or [0]) or 100,
        }
    if kind == 'live':
        source = raw.get('live_source') if raw.get('live_source') in LIVE_SOURCES else 'productivity'
        config: Dict[str, Any] = {'source': source}
        if source == 'goal':
            goal = str(raw.get('goal') or '')
            if goal in goal_ids:
                config['goal'] = goal
            else:
                config = {'source': 'goals'}
        block['live'] = config
    return block


def build(prompt: str, page_text: str = '', page_name: str = '', history: Sequence[dict] = (),
          goals: Sequence[dict] = (), about: Sequence[str] = ()) -> Dict[str, Any]:
    """`{reply, mode, icon, blocks}` for what the reader asked.

    Raises `BriefUnavailable` with a sentence for the chat when no model is
    set up or the answer can't be read.
    """
    prompt = (prompt or '').strip()
    if not prompt:
        raise BriefUnavailable('Say what you want on the page.')
    if not planner.able():
        raise BriefUnavailable(planner.NO_KEY)

    brief = brief_from(prompt, page_text, page_name, history, goals, about)
    try:
        text = planner.from_provider(
            brief,
            system=SYSTEM,
            schema=SCHEMA,
            instruction='Build or change the page as they ask.',
            max_tokens=MAX_TOKENS,
            topics=(prompt, page_name),
        )
    except planner.PlannerUnavailable as exc:
        raise BriefUnavailable(str(exc)) from exc

    try:
        found = _object(text)
    except Exception as exc:  # noqa: BLE001 - one message for every unreadable answer
        raise BriefUnavailable("The answer came back in a shape I couldn't read. Try again.") from exc

    goal_ids = {str(goal['id']) for goal in goals}
    blocks = [_block(raw, goal_ids) for raw in (found.get('blocks') or [])[:BLOCKS_MAX]
              if isinstance(raw, dict)]
    if not blocks:
        raise BriefUnavailable("That came back empty. Try saying it another way.")
    return {
        'reply': plain(str(found.get('reply') or 'Done.')).strip()[:600],
        'mode': 'append' if found.get('mode') == 'append' else 'replace',
        'icon': str(found.get('icon') or '').strip()[:16],
        'blocks': blocks,
    }
