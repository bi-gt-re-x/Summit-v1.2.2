"""Spaces AI: build or change a page from a sentence in the chat sidebar.

The reader types what they want ("a study plan for the AMC 10 with a
checklist and a progress chart") and the model answers in the editor's own
shape (frontend/src/components/Spaces/blocks.ts). The API layer
(backend/api/spaces.py) cleans every block with the same `_clean_doc` a
normal save goes through, so nothing the model sends can put a block on the
page that the editor couldn't have made.

## What it can do

Four modes, the model's call: `replace` rewrites the page, `append` adds to
the end, `edit` makes targeted changes to numbered blocks (update, delete,
insert after, move after) and leaves the rest exactly as it was, and `reply`
answers a question without touching the page. Every block kind the editor
has, columns (halves and thirds), fill styles, note and shape heights, the
cover and the page background, every live analytics source with its
views, metrics and ranges, and every panel the app's own pages draw.

## What it knows

- **The page as it looks**, from backend/tracking/space_look.py: every block
  numbered, with its fill, text color, width and measured contrast, and
  which theme the page follows. So "make the second sticky blue" and "is
  this readable?" have something real to work from.
- **The reader**: About you, the Log, said-vs-did and mood lines.
- **The topic**: reference facts from Wikipedia (backend/tracking/sources.py).
- **What the prompt is about**: the API passes `context`, lines picked for
  this prompt (the subject's recent tasks, goals and free resources, the
  coming week, mood, totals). See `prompt_context` in backend/api/spaces.py.

After it builds, the API measures the result and fixes any text the AI wrote
that fails contrast, and the reply says what it found.
"""
import re
from typing import Any, Dict, List, Sequence, Tuple

from backend.config.shared import RULES
from backend.tracking import panels, planner, space_look
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
PANEL_KINDS = panels.KINDS
FILL_STYLES = tuple(SPACES['fill_styles'])
COVER_ALIGNS = tuple(SPACES['cover_aligns'])
TALL = SPACES['tall_rows']

#: Where a block may sit, as (column, width) on the 12-column grid.
COLUMNS = {'full': (0, 12), 'left': (0, 6), 'right': (6, 6), 'left_third': (0, 4),
           'middle_third': (4, 4), 'right_third': (8, 4)}
MODES = ('replace', 'append', 'edit', 'reply')
EDIT_OPS = ('update', 'delete', 'insert_after', 'move_after')

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


#: What each live source draws, so the model picks by meaning, not by name.
SHOWS = {
    'goal': 'one goal: how far along it is and its checkpoints',
    'goals': 'every goal with its progress',
    'records': 'their personal records list, bests like a mile time',
    'record': "one personal record's history",
    'calendar': 'what is coming up: tasks due and goal checkpoints in the next days',
    'productivity': 'XP, tasks or focus per week, with the streak',
    'growth': "one subject's work over time",
    'skills': 'progress through one skill tree',
    'heatmap': 'a GitHub-style grid of active days',
    'rhythm': 'which weekdays or hours they work',
    'subjects': 'the mix of subjects their work went to',
}


def _panel_menu() -> str:
    """Every panel kind, a section at a time, as brief text."""
    groups = {}
    for kind in PANEL_KINDS:
        groups.setdefault(panels.PANELS['kinds'][kind]['group'], []).append(
            '{} ({})'.format(kind, panels.NAMES[kind]))
    return '\n'.join('  - {}: {}'.format(group, ', '.join(kinds)) for group, kinds in groups.items())


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
        lines.append('  - {} ({}): {}'.format(source, SHOWS.get(source, ''), '; '.join(parts)))
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
- `color` (#rrggbb) sets a block's text color. See LOOK before using it.

DRAWN BLOCKS
- sticky: a sticky note. `text`, `fill_color` (#rrggbb, pale colors read
  best), `width` in grid columns (1 to 12, try 4), `rows` for its height
  (""" + str(TALL['min']) + """ to """ + str(TALL['max']) + """, about 22 fits four lines).
- shape: `shape` (""" + ', '.join(SHAPES) + """), `text` as its label,
  `fill_color`, `width`, `rows`.
- container: a framed box. `text` is its title, `fill_color` its tint.
  Blocks after it with `indent` 1 sit inside it. Good for grouping a
  section, for example a tracker with a few live blocks.
- `fill_style` on stickies, shapes and containers: """ + ', '.join(FILL_STYLES) + """.

LAYOUT
- The page is 12 columns. `column` puts a top-level block (indent 0) in
  full, left, right (halves), or left_third, middle_third, right_third.
  Two blocks side by side: give the first `left` and the next `right`.
  Leave `column` null for a normal full-width page; once any block has a
  column, give every top-level block one so the rest stay full width.

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

PANEL BLOCKS: the app's own panels, from their real data
- panel: `panel_kind`, one of the kinds below. `text` is an optional
  caption. It starts on the kind's own settings, and the reader can change
  them (time range, subject, how many rows, which lines a chart plots) with
  the block's gear. Use one when the reader asks for something the app
  already shows: a plan or suggestions, habits, insights, a focus timer,
  their sessions, badges.
""" + _panel_menu() + """

THE PAGE
- `icon`: one emoji, or "" to leave it.
- `cover`: one of """ + ', '.join(COVERS) + """, or "" to leave it.
- `cover_text`: words on the cover, or "". `cover_align`: left, center, right or "".
- `background`: a #rrggbb page color, or "" to leave it. Only if asked.

LOOK: what the page will look like
- The brief shows every block numbered, with its colors and its measured
  contrast (text against what's behind it). Body text needs 4.5:1, h1 and
  h2 need 3:1. Use those numbers when the reader asks about colors or
  readability, and quote them.
- A page with no background follows the reader's light or dark theme, so
  text on it switches between dark and light by itself. Don't set `color`
  on text sitting on such a page: no one color reads well on both.
- Text on a sticky, shape or container sits on that fill. The app picks
  dark or light text by the fill, so pale fills with no `color` are safest.
- After you build, the app measures again and fixes any of your text that
  fails, and tells the reader. Get it right so there's nothing to fix.

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

- `reply`: one to three short sentences to the reader saying what you did,
  or answering them.
- `mode`:
  - `replace`: a new page or "start over". `blocks` is the whole page.
  - `append`: add to the end. `blocks` is what to add.
  - `edit`: change specific blocks and leave the rest alone. `edits` is a
    list of {op, index, was, target, block}. `index` is the block's number
    exactly as the brief prints it (the first block is 1, not 0), and `was`
    is the first few words of that block's text as the brief shows it (or
    its type, for a divider), so the right block is changed even if a
    number is off:
    `update` replaces block `index` with `block` (send every field);
    `delete` removes it; `insert_after` puts `block` after `index` (0 for
    the top); `move_after` moves block `index` to after block `target`.
    Use this for "change", "fix", "recolor", "remove", "move" requests.
  - `reply`: a question about the page or their work; change nothing.
- `blocks` and `edits`: send [] for the one the mode doesn't use.

CONTEXT
- The brief may include lines about the reader's own work picked for this
  request: recent tasks, goals and deadlines, the coming week, free
  resources for the subject. Use them so the page is about their real
  week, real goals and real resources, not a generic template.
""" + STYLE

_NULL_STR = {'anyOf': [{'type': 'null'}, {'type': 'string'}]}
_NULL_INT = {'anyOf': [{'type': 'null'}, {'type': 'integer'}]}

_BLOCK = {
    'type': 'object',
    'additionalProperties': False,
    'required': ['type', 'text', 'indent', 'checked', 'color', 'fill_color', 'fill_style', 'shape',
                 'width', 'rows', 'column', 'chart', 'live_source', 'live_view', 'live_metric',
                 'live_ref', 'live_range', 'panel_kind'],
    'properties': {
        'type': {'type': 'string', 'enum': list(KINDS)},
        'text': {'type': 'string'},
        'indent': {'type': 'integer'},
        'checked': {'type': 'boolean'},
        'color': _NULL_STR,
        'fill_color': _NULL_STR,
        'fill_style': {'anyOf': [{'type': 'null'}, {'type': 'string', 'enum': list(FILL_STYLES)}]},
        'shape': {'anyOf': [{'type': 'null'}, {'type': 'string', 'enum': list(SHAPES)}]},
        'width': _NULL_INT,
        'rows': _NULL_INT,
        'column': {'anyOf': [{'type': 'null'}, {'type': 'string', 'enum': list(COLUMNS)}]},
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
        'panel_kind': {'anyOf': [{'type': 'null'}, {'type': 'string', 'enum': list(PANEL_KINDS)}]},
    },
}

_EDIT = {
    'type': 'object',
    'additionalProperties': False,
    'required': ['op', 'index', 'was', 'target', 'block'],
    'properties': {
        'op': {'type': 'string', 'enum': list(EDIT_OPS)},
        'index': {'type': 'integer'},
        'was': {'type': 'string'},
        'target': _NULL_INT,
        'block': {'anyOf': [{'type': 'null'}, _BLOCK]},
    },
}

SCHEMA = {
    'type': 'object',
    'additionalProperties': False,
    'required': ['reply', 'mode', 'icon', 'cover', 'cover_text', 'cover_align', 'background',
                 'blocks', 'edits'],
    'properties': {
        'reply': {'type': 'string'},
        'mode': {'type': 'string', 'enum': list(MODES)},
        'icon': {'type': 'string'},
        'cover': {'type': 'string'},
        'cover_text': {'type': 'string'},
        'cover_align': {'type': 'string'},
        'background': {'type': 'string'},
        'blocks': {'type': 'array', 'items': _BLOCK},
        'edits': {'type': 'array', 'items': _EDIT},
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
               options: Dict[str, Any] = None, doc: Dict[str, Any] = None,
               context: Sequence[str] = ()) -> str:
    lines: List[str] = ['PAGE NAME: {}'.format(page_name or 'Untitled')]
    if doc and doc.get('blocks'):
        look = space_look.snapshot(doc)
        text = '\n'.join(look)
        lines += ['', 'THE PAGE NOW, AS IT LOOKS (blocks numbered for edits):', text[:PAGE_CHARS]]
        lines += ['', 'CONTRAST CHECK:'] + space_look.report_lines(doc)
    elif doc is not None:
        lines += ['', 'The page is empty. ' + space_look.snapshot(doc)[0]]
    else:
        page_text = (page_text or '').strip()
        if page_text:
            lines += ['', 'WHAT THE PAGE HOLDS NOW (one line per block):', page_text[:PAGE_CHARS]]
        else:
            lines += ['', 'The page is empty.']

    if context:
        lines += ['', 'ABOUT THIS REQUEST, FROM THEIR OWN RECORD:']
        lines += ['- {}'.format(line) for line in context]

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
        style = raw.get('fill_style') if raw.get('fill_style') in FILL_STYLES else (
            'solid' if kind == 'sticky' else 'fade')
        block['fill'] = {'color': _hex(raw['fill_color']), 'style': style}
    if kind == 'shape' and raw.get('shape') in SHAPES:
        block['shape'] = raw['shape']
    if kind in ('sticky', 'shape') and isinstance(raw.get('width'), int):
        block['w'] = max(1, min(12, raw['width']))
    if kind in ('sticky', 'shape') and isinstance(raw.get('rows'), int):
        block['rows'] = max(TALL['min'], min(TALL['max'], raw['rows']))
    if not indent and raw.get('column') in COLUMNS:
        block['_column'] = raw['column']
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
    if kind == 'panel' and raw.get('panel_kind'):
        # Cleaned to the kind's own defaults by the API's save, which also
        # gives a panel that named no kind the first one.
        block['panel'] = {'kind': raw['panel_kind']}
    return block


def build(prompt: str, page_text: str = '', page_name: str = '', history: Sequence[dict] = (),
          goals: Sequence[dict] = (), about: Sequence[str] = (),
          options: Dict[str, Any] = None, doc: Dict[str, Any] = None,
          context: Sequence[str] = ()) -> Dict[str, Any]:
    """`{reply, mode, icon, cover, cover_text, cover_align, background,
    blocks, edits}` for what the reader asked.

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
    brief = brief_from(prompt, page_text, page_name, history, about=about, options=options,
                       doc=doc, context=context)
    try:
        text = planner.from_provider(
            brief,
            system=SYSTEM,
            schema=SCHEMA,
            instruction='Build, change or answer about the page as they ask.',
            max_tokens=MAX_TOKENS,
            topics=(prompt, page_name),
        )
    except planner.PlannerUnavailable as exc:
        raise BriefUnavailable(str(exc)) from exc

    try:
        found = _object(text)
    except Exception as exc:  # noqa: BLE001 - one message for every unreadable answer
        raise BriefUnavailable("The answer came back in a shape I couldn't read. Try again.") from exc

    mode = found.get('mode') if found.get('mode') in MODES else 'replace'
    blocks = [_block(raw, options) for raw in (found.get('blocks') or [])[:BLOCKS_MAX]
              if isinstance(raw, dict)]
    edits = []
    for raw in (found.get('edits') or [])[:BLOCKS_MAX]:
        if not isinstance(raw, dict) or raw.get('op') not in EDIT_OPS:
            continue
        try:
            index = int(raw.get('index') or 0)
        except (TypeError, ValueError):
            continue
        target = raw.get('target') if isinstance(raw.get('target'), int) else None
        block = _block(raw['block'], options) if isinstance(raw.get('block'), dict) else None
        edits.append({'op': raw['op'], 'index': index, 'was': str(raw.get('was') or '')[:80],
                      'target': target, 'block': block})
    if mode in ('replace', 'append') and not blocks:
        raise BriefUnavailable("That came back empty. Try saying it another way.")
    if mode == 'edit' and not edits:
        mode = 'reply'
    return {
        'reply': plain(str(found.get('reply') or 'Done.')).strip()[:900],
        'mode': mode,
        'icon': str(found.get('icon') or '').strip()[:16],
        'cover': found.get('cover') if found.get('cover') in COVERS else '',
        'cover_text': plain(str(found.get('cover_text') or '')).strip()[:SPACES['cover_text_max']],
        'cover_align': found.get('cover_align') if found.get('cover_align') in COVER_ALIGNS else '',
        'background': _hex(found.get('background')),
        'blocks': blocks,
        'edits': edits,
    }


# ---------------------------------------------------------------------------
# Putting it on the page
# ---------------------------------------------------------------------------
def apply(before: List[Dict[str, Any]], made: Dict[str, Any], new_id) -> Tuple[List[Dict[str, Any]], set]:
    """The page's blocks after the model's answer, and the ids it wrote.

    `new_id(n)` names the nth new block. Edits are numbered against the page
    as the model saw it (1-based), so every index is turned into a block id
    first and the operations are applied by id: deleting block 2 doesn't
    move what "block 5" means for the edit after it.
    """
    mode = made['mode']
    written = set()
    made_count = [0]

    def fresh(block):
        block = dict(block)
        block['id'] = new_id(made_count[0])
        made_count[0] += 1
        written.add(block['id'])
        return block

    if mode == 'reply':
        return [dict(block) for block in before], written
    if mode == 'replace':
        out = [fresh(block) for block in made['blocks']]
    elif mode == 'append':
        out = [dict(block) for block in before] + [fresh(block) for block in made['blocks']]
    else:
        out = [dict(block) for block in before]
        ids = [block.get('id') for block in before]
        index_at = lambda index: ids[index - 1] if 1 <= index <= len(ids) else None

        def id_at(index, was=''):
            """The block an edit means: the one at its number when that
            block's text matches what the model said it was, otherwise the
            block nearest that number whose text does. Models count from 0
            often enough that a number alone moved the wrong block."""
            want = re.sub(r'\s+', ' ', (was or '').strip().lower())[:40]
            if not want:
                return index_at(index)
            def says(at):
                block = before[at]
                text = re.sub(r'\s+', ' ', (block.get('text') or '').strip().lower())
                return (text.startswith(want[:25]) or want[:25] in text
                        or (not text and block.get('type') == want))
            guess = index - 1
            for at in sorted(range(len(before)), key=lambda at: abs(at - guess)):
                if says(at):
                    return ids[at]
            return index_at(index)
        position = lambda ident: next((at for at, block in enumerate(out) if block.get('id') == ident), None)
        for edit in made['edits']:
            ident = id_at(edit['index'], edit.get('was', ''))
            if edit['op'] == 'update' and ident and edit['block']:
                at = position(ident)
                if at is None:
                    continue
                old = out[at]
                new = dict(edit['block'])
                # What the model can't express is kept: the block's place,
                # and a live block's settings when it named no source.
                for key in ('x', 'y', 'w'):
                    if key in old and key not in new and '_column' not in new:
                        new[key] = old[key]
                if new.get('type') == 'live' and old.get('live') and not edit['block'].get('live'):
                    new['live'] = old['live']
                # The same for a panel: its settings stay unless it names another kind.
                if new.get('type') == 'panel' and old.get('panel') and \
                        (not new.get('panel') or new['panel'].get('kind') == old['panel'].get('kind')):
                    new['panel'] = old['panel']
                new['id'] = ident
                written.add(ident)
                out[at] = new
            elif edit['op'] == 'delete' and ident:
                at = position(ident)
                if at is not None:
                    out.pop(at)
            elif edit['op'] == 'insert_after' and edit['block']:
                at = 0 if edit['index'] == 0 else (position(ident) + 1 if ident and position(ident) is not None else len(out))
                out.insert(at, fresh(edit['block']))
            elif edit['op'] == 'move_after' and ident:
                at = position(ident)
                if at is None:
                    continue
                moving = out.pop(at)
                target = id_at(edit['target'] or 0)
                to = 0 if not edit['target'] else (position(target) + 1 if target and position(target) is not None else len(out))
                out.insert(to, moving)
                written.add(ident)
    return place_columns(out), written


def place_columns(blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Turn `column` picks into grid places.

    Once any top-level block has a column or a place, every top-level block
    gets one: on the editor's grid a block with no place follows the one
    before it, at its width, so one block in the right half would pull
    everything after it into the right half too. Every place is pinned at
    row 0, and the grid's own layout (frontend/src/components/Spaces/
    canvas.ts) pushes each down past what's already placed, in page order,
    which stacks full-width blocks and sets a left and a right side by side.
    """
    tops = [block for block in blocks if not block.get('indent')]
    if not any('_column' in block or 'x' in block for block in tops):
        for block in blocks:
            block.pop('_column', None)
        return blocks
    for block in blocks:
        column = block.pop('_column', None)
        if block.get('indent'):
            continue
        own = block.get('w') if 'x' not in block else None
        if column and column != 'full':
            block['x'], block['w'] = COLUMNS[column]
            block['y'] = 0
        elif 'x' not in block:
            # Full width, or the block's own width (a note, a shape) from the left.
            block['x'], block['w'], block['y'] = 0, own or 12, 0
    return blocks
