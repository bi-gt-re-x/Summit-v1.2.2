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
- Every block kind the editor has is open to it, and so is every live
  analytics source with its views and settings. The brief lists the
  account's own goals, subjects, skill trees and records, and a live block
  pointed at anything else falls back to the source's default.

`mode` is the model's call: `replace` for "make me a page about X", `append`
for "add a to-do list". Either way the reader can undo it from the chat.
"""
import re
from typing import Any, Dict, List, Sequence

from backend.config.shared import RULES
from backend.tracking import planner
from backend.tracking.plainwords import STYLE, plain
from backend.tracking.subject_brief import BriefUnavailable, _object

MAX_TOKENS = 8000

SPACES = RULES['spaces']
LIVE = SPACES['live']

#: Every kind the editor has.
KINDS = tuple(SPACES['block_types'])
SHAPES = tuple(SPACES['shapes'])
COVERS = tuple(SPACES['covers'])
SOURCES = tuple(LIVE['sources'])

#: The one setting each live source takes a pick for, and which key it's
#: stored under (backend/tracking/live.py `clean_config`).
REF_KEY = {'goal': 'goal', 'record': 'name', 'skills': 'tree', 'growth': 'subject',
           'records': 'category'}
#: Which key a live source's time range is stored under, and in what unit.
DAYS_KEY = {'heatmap': 'weeks', 'productivity': 'weeks', 'rhythm': 'days',
            'subjects': 'days', 'calendar': 'days', 'growth': 'days'}

#: How much of the page and the conversation the brief carries.
PAGE_CHARS = 6000
HISTORY_TURNS = 8
BLOCKS_MAX = 80
#: How many of each pickable thing the brief lists.
OPTIONS_MAX = 40


def _live_menu() -> str:
    """Every live source with its views, metrics and settings, as brief text."""
    lines = []
    for source in SOURCES:
        parts = ['views: {}'.format(', '.join(LIVE['views'][source]))]
        if source in LIVE['metrics']:
            parts.append('metrics: {}'.format(', '.join(LIVE['metrics'][source])))
        if source in REF_KEY:
            parts.append('live_ref: a {} from the lists below'.format(
                {'goal': 'goal id', 'record': 'record name', 'skills': 'skill tree id',
                 'growth': 'subject id', 'records': 'record category (or empty for all)'}[source]))
        if source in DAYS_KEY:
            unit = DAYS_KEY[source]
            allowed = {'heatmap': LIVE['heat_weeks'], 'productivity': LIVE['weeks'],
                       'rhythm': LIVE['rhythm_days'], 'subjects': LIVE['windows'],
                       'calendar': LIVE['ahead'], 'growth': LIVE['windows']}[source]
            parts.append('live_range in {}: {}'.format(unit, ', '.join(str(x) for x in allowed)))
        if source == 'goals':
            parts.append('live_ref: {}'.format(', '.join(LIVE['goal_status'])))
        lines.append('  - {}: {}'.format(source, '; '.join(parts)))
    return '\n'.join(lines)


SYSTEM = """\
You build pages in a student's notebook app, from what they ask for in a chat.
You can use everything the page editor can make.

A page is a list of blocks. Every block has these fields; set the ones its
type uses and leave the rest null (or 0 / false / "").

TEXT BLOCKS
- text, h1, h2, h3, bullet, numbered, quote, code: `text`.
- todo: `text`, `checked`.
- toggle: `text` is the title; blocks under it with `indent` 1 fold inside.
- callout: a highlighted note. `text`, and `color` for its tint.
- divider: a line. No text.
- `indent` (0 to 2) nests a block under the one above it.
- `color` (#rrggbb) tints any text block's words. Use it sparingly.

DRAWN BLOCKS
- sticky: a sticky note. `text`, `fill_color` (#rrggbb, pale colors read
  best), `width` in grid columns (1 to 12, try 4).
- shape: `shape` (""" + ', '.join(SHAPES) + """), `text` as its label,
  `fill_color`, `width`.
- container: a framed box. `text` is its title, `fill_color` its tint.
  Blocks after it with `indent` 1 sit inside it. Good for grouping a
  section, for example a tracker with a few live blocks.

CHARTS
- chart: `chart` with a kind (bar, line, area, pie, donut) and 1 to 12
  points (short label, number). Only real numbers: from the references, or
  that the reader gave you. Never make up data. To chart the reader's own
  data, use a live block instead.

LIVE BLOCKS: the reader's own analytics, always up to date
- live: `live_source`, plus `live_view`, `live_metric`, `live_ref` and
  `live_range` where the source takes them. `text` is an optional caption.
  The sources:
""" + _live_menu() + """
  Use only ids and names from the lists in the brief. Use live blocks
  whenever the reader wants to see, track or keep an eye on their own
  progress, goals, records, schedule, subjects or skills.

THE PAGE
- `icon`: one emoji, or "" to leave it.
- `cover`: one of """ + ', '.join(COVERS) + """, or "" to leave it.
- `cover_text`: words on the cover, or "".
- `background`: a #rrggbb page color, or "" to leave it. Only if asked.

Write a real page: a clear h1, short sections, and content that's specific
and useful (actual topics, steps, resources), not filler. Mix block types
where it helps: a checklist as todos, key facts in a callout, a tracker in a
container with live blocks.

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
- `blocks`: the blocks to write.
""" + STYLE

_NULL_STR = {'anyOf': [{'type': 'null'}, {'type': 'string'}]}
_NULL_INT = {'anyOf': [{'type': 'null'}, {'type': 'integer'}]}

_BLOCK = {
    'type': 'object',
    'additionalProperties': False,
    'required': ['type', 'text', 'indent', 'checked', 'color', 'fill_color', 'shape', 'width',
                 'chart', 'live_source', 'live_view', 'live_metric', 'live_ref', 'live_range'],
    'properties': {
        'type': {'type': 'string', 'enum': list(KINDS)},
        'text': {'type': 'string'},
        'indent': {'type': 'integer'},
        'checked': {'type': 'boolean'},
        'color': _NULL_STR,
        'fill_color': _NULL_STR,
        'shape': {'anyOf': [{'type': 'null'}, {'type': 'string', 'enum': list(SHAPES)}]},
        'width': _NULL_INT,
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
        'live_source': {'anyOf': [{'type': 'null'}, {'type': 'string', 'enum': list(SOURCES)}]},
        'live_view': _NULL_STR,
        'live_metric': _NULL_STR,
        'live_ref': _NULL_STR,
        'live_range': _NULL_INT,
    },
}

SCHEMA = {
    'type': 'object',
    'additionalProperties': False,
    'required': ['reply', 'mode', 'icon', 'cover', 'cover_text', 'background', 'blocks'],
    'properties': {
        'reply': {'type': 'string'},
        'mode': {'type': 'string', 'enum': ['replace', 'append']},
        'icon': {'type': 'string'},
        'cover': {'type': 'string'},
        'cover_text': {'type': 'string'},
        'background': {'type': 'string'},
        'blocks': {'type': 'array', 'items': _BLOCK},
    },
}


def _options_text(options: Dict[str, Any]) -> List[str]:
    """What live blocks can point at on this account, as brief lines."""
    lines: List[str] = []

    def section(title, rows):
        rows = [row for row in rows if row][:OPTIONS_MAX]
        if rows:
            lines.extend(['', title])
            lines.extend('- {}'.format(row) for row in rows)

    section("THE READER'S GOALS (live_ref for goal blocks is the id):",
            ['id {}: {}{}'.format(g['id'], g['title'], ' (done)' if g.get('done') else '')
             for g in options.get('goals') or []])
    section('THEIR SUBJECTS, MOST USED FIRST (live_ref for growth is the id):',
            ['id {}: {}'.format(row['id'], row['name']) for row in options.get('subjects') or []
             if row.get('used')] or
            ['id {}: {}'.format(row['id'], row['name']) for row in (options.get('subjects') or [])[:15]])
    section('SKILL TREES (live_ref for skills is the id):',
            ['id {}: {}'.format(row['id'], row['title']) for row in options.get('trees') or []])
    section('THEIR PERSONAL RECORDS (live_ref for record is the name):',
            list(options.get('records') or []))
    section('RECORD CATEGORIES (live_ref for records):', list(options.get('categories') or []))
    return lines


def brief_from(prompt: str, page_text: str, page_name: str, history: Sequence[dict],
               goals: Sequence[dict] = (), about: Sequence[str] = (),
               options: Dict[str, Any] = None) -> str:
    lines: List[str] = ['PAGE NAME: {}'.format(page_name or 'Untitled')]
    page_text = (page_text or '').strip()
    if page_text:
        lines += ['', 'WHAT THE PAGE HOLDS NOW (one line per block):',
                  page_text[:PAGE_CHARS]]
    else:
        lines += ['', 'The page is empty.']

    options = dict(options or {})
    if goals and not options.get('goals'):
        options['goals'] = list(goals)
    lines += _options_text(options)

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


def _hex(value) -> str:
    text = str(value or '').strip()
    return text.lower() if re.match(r'^#[0-9a-fA-F]{6}$', text) else ''


def _live(raw: Dict[str, Any], options: Dict[str, Any]) -> Dict[str, Any]:
    """A live block's settings from the model's flat fields.

    Anything that doesn't name a real goal, record, tree or subject on this
    account is dropped, and `live.clean_config` (run by the API's save)
    fills the defaults, so a wrong pick shows the source's default rather
    than an empty block.
    """
    source = raw.get('live_source') if raw.get('live_source') in SOURCES else 'productivity'
    config: Dict[str, Any] = {'source': source}
    if raw.get('live_view'):
        config['view'] = str(raw['live_view'])
    if raw.get('live_metric'):
        config['metric'] = str(raw['live_metric'])
    ref = str(raw.get('live_ref') or '').strip()
    known = {
        'goal': {str(g['id']) for g in options.get('goals') or []},
        'record': set(options.get('records') or []),
        'skills': {row['id'] for row in options.get('trees') or []},
        'growth': {row['id'] for row in options.get('subjects') or []},
        'records': set(options.get('categories') or []),
    }
    if source in REF_KEY and ref in known[source]:
        config[REF_KEY[source]] = ref
    if source == 'goal' and 'goal' not in config:
        config = {'source': 'goals'}
    if source == 'goals' and ref in LIVE['goal_status']:
        config['status'] = ref
    if source in DAYS_KEY and isinstance(raw.get('live_range'), int):
        config[DAYS_KEY[source]] = raw['live_range']
    return config


def _block(raw: Dict[str, Any], options: Dict[str, Any]) -> Dict[str, Any]:
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
    if _hex(raw.get('color')):
        block['color'] = _hex(raw['color'])
    if kind in ('sticky', 'shape', 'container') and _hex(raw.get('fill_color')):
        block['fill'] = {'color': _hex(raw['fill_color']),
                         'style': 'solid' if kind == 'sticky' else 'fade'}
    if kind == 'shape' and raw.get('shape') in SHAPES:
        block['shape'] = raw['shape']
    if kind in ('sticky', 'shape') and isinstance(raw.get('width'), int):
        block['w'] = max(1, min(12, raw['width']))
    if kind == 'chart':
        chart = raw.get('chart') if isinstance(raw.get('chart'), dict) else {}
        block['chart'] = {
            'kind': chart.get('kind') or 'bar',
            'points': chart.get('points') or [],
            'max': max([float(p.get('value') or 0) for p in chart.get('points') or []
                        if isinstance(p, dict)] or [0]) or 100,
        }
    if kind == 'live':
        block['live'] = _live(raw, options)
    return block


def build(prompt: str, page_text: str = '', page_name: str = '', history: Sequence[dict] = (),
          goals: Sequence[dict] = (), about: Sequence[str] = (),
          options: Dict[str, Any] = None) -> Dict[str, Any]:
    """`{reply, mode, icon, blocks}` for what the reader asked.

    Raises `BriefUnavailable` with a sentence for the chat when no model is
    set up or the answer can't be read.
    """
    prompt = (prompt or '').strip()
    if not prompt:
        raise BriefUnavailable('Say what you want on the page.')
    if not planner.able():
        raise BriefUnavailable(planner.NO_KEY)

    options = dict(options or {})
    if goals and not options.get('goals'):
        options['goals'] = list(goals)
    brief = brief_from(prompt, page_text, page_name, history, about=about, options=options)
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

    blocks = [_block(raw, options) for raw in (found.get('blocks') or [])[:BLOCKS_MAX]
              if isinstance(raw, dict)]
    if not blocks:
        raise BriefUnavailable("That came back empty. Try saying it another way.")
    return {
        'reply': plain(str(found.get('reply') or 'Done.')).strip()[:600],
        'mode': 'append' if found.get('mode') == 'append' else 'replace',
        'icon': str(found.get('icon') or '').strip()[:16],
        'cover': found.get('cover') if found.get('cover') in COVERS else '',
        'cover_text': plain(str(found.get('cover_text') or '')).strip()[:SPACES['cover_text_max']],
        'background': _hex(found.get('background')),
        'blocks': blocks,
    }
