"""Spaces — three pages under "Personal" in the rail, and three under "Team".

Each is a name and a page. They start as "Space 1" to "Space 3" and "Team
Space 1" to "Team Space 3" with nothing written, and the reader renames them
and fills them in.

## The page is blocks

The space page is a block editor in the manner of Notion
(frontend/src/components/Spaces/BlockEditor.tsx): an icon, a cover, and a
list of blocks — text, three heading sizes, bulleted, numbered and to-do
lists, toggles, quotes, callouts, dividers, code, charts, live data and
containers — each with an indent. A container is a framed box: the blocks
indented under it ride inside it wherever it is dragged. A top-level block may also carry a place on the page's grid (`x`,
`y`, `w`: column, row, width in columns) once it has been dragged, and a
chart carries its kind, its scale and its points.
That list is `doc`, checked here block by block against the kinds the editor
knows. `body` stays as the page in plain text, written from the blocks on
every save, so anything that only wants the words still has them, and a page
written before blocks existed still opens: the editor reads its `body` into
blocks when there is no `doc`. Not notes: a note is one of many, filed by day,
task or goal; a space is one of three fixed places the reader comes back to.

## Live blocks

A `live` block holds no numbers of its own: it names a source (a goal, a skill
tree, productivity, records, the calendar, a subject's growth) and a few
settings, cleaned by `live.clean_config`, and the page asks for what that
source says *now* every time it draws it. backend/tracking/live.py has the
rules and the note on how an open page keeps up.

A `panel` block is the same idea in the browser: it names one of the app's
own panels (the plan, the trend chart, the habit cards, the focus timer, the
badges) and its settings, cleaned by `panels.clean_panel`
(backend/tracking/panels.py), and the page draws that panel from the
account's numbers with the component it comes from.

    GET  /api/spaces/live                what one live block shows right now
    GET  /api/spaces/live/options        what a live block can be pointed at
    GET  /api/spaces/live/revisions      a stamp per source; a change means refresh

A team space also has a member list. **Invites are a placeholder**: an address
added is kept and shown as pending, and nothing is sent — there are no shared
accounts yet for it to send anybody into. The list exists so the page has the
shape a team page will have, and so the addresses are already there when
inviting is built.

Kept in `user_settings`, one list per kind (KINDS), because three short
records do not earn a table — the same choice the analytics baseline made.

    GET  /api/spaces                     personal
    POST /api/spaces/<n>                 rename / write
    GET  /api/team-spaces                team, with invites
    POST /api/team-spaces/<n>            rename / write
    POST /api/team-spaces/<n>/invite     add a pending address
    POST /api/team-spaces/<n>/uninvite   take one back
    POST /api/spaces/<n>/ai              build or change the page from the chat
    POST /api/team-spaces/<n>/ai         the same, for a team space
    GET  /api/spaces/<n>/chat            this account's chat on this space
    POST /api/spaces/<n>/chat/undo       put the page back from before one AI turn
    POST /api/spaces/<n>/chat/clear      start the chat over
    (and the same three under /api/team-spaces/<n>/chat)
"""
import re
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api import background as background_api
from backend.api import goals as goals_api
from backend.api import records as records_api
from backend.api import skillsteps as skillsteps_api
from backend.api import subjects as subjects_api
from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.database import connection as db
from backend.config.shared import RULES
from backend.config import subjects as subjects_catalog
from backend.goal_matcher import store as goal_store
from backend.tracking import growth as growth_tracking
from backend.tracking import live, panels
from backend.tracking import space_ai, space_look
from backend.tracking.subject_brief import BriefUnavailable
from backend.tracking import skill_level
from backend.tracking import xp as xp_tracking
from backend.tracking.auth import load_user

router = APIRouter(tags=['spaces'])

#: Where each kind lives in `user_settings`, and what its spaces are called
#: before anybody renames them.
KINDS = {
    'personal': {'key': 'personal_spaces', 'name': 'Space {}'},
    'team': {'key': 'team_spaces', 'name': 'Team Space {}'},
}

#: How many of each. Fixed, and the rail draws exactly this many.
COUNT = RULES['spaces']['count']

#: A name is a rail row, not a sentence.
NAME_MAX = RULES['spaces']['name_max']

#: A page of writing, generously, rather than an unbounded column.
BODY_MAX = RULES['spaces']['body_max']

#: What a page may hold — shared/rules.json, which the block editor reads too.
#: The icon is an emoji, which can be several code points (a flag, a family).
BLOCK_TYPES = tuple(RULES['spaces']['block_types'])
BLOCKS_MAX = RULES['spaces']['blocks_max']
BLOCK_TEXT_MAX = RULES['spaces']['block_text_max']
INDENT_MAX = RULES['spaces']['indent_max']
COVERS = tuple(RULES['spaces']['covers'])
ICON_MAX = RULES['spaces']['icon_max']
GRID = RULES['spaces']['grid']
CHART = RULES['spaces']['chart']
FILL_STYLES = tuple(RULES['spaces']['fill_styles'])
SHAPES = tuple(RULES['spaces']['shapes'])
TALL = RULES['spaces']['tall_rows']
COVER_TEXT_MAX = RULES['spaces']['cover_text_max']
COVER_ALIGNS = tuple(RULES['spaces']['cover_aligns'])
HEX = re.compile(r'^#[0-9a-fA-F]{6}$')

#: What a new sticky note and a new shape are filled with when nothing is said.
DEFAULT_FILL = {'sticky': {'color': '#fde68a', 'style': 'solid'},
                'shape': {'color': '#93c5fd', 'style': 'fade'}}
DEFAULT_ROWS = {'sticky': 22, 'shape': 20}

#: Each kind as a line of plain text, for `body`.
TEXT_PREFIX = {'h1': '# ', 'h2': '## ', 'h3': '### ', 'bullet': '- ', 'numbered': '1. ',
               'toggle': '▸ ', 'quote': '> ', 'callout': '💡 '}

#: A live block in `body`, which has only words.
LIVE_NAMES = {'goal': 'Goal progress', 'goals': 'All goals', 'skills': 'Skill tree',
              'productivity': 'Productivity', 'records': 'Records', 'record': 'Record history',
              'calendar': 'Calendar', 'growth': 'Growth', 'heatmap': 'Activity heatmap',
              'rhythm': 'Weekly rhythm', 'subjects': 'Subject mix'}

#: Pending invites a team space will hold.
INVITES_MAX = 20

#: Enough to refuse what is plainly not an address; the real check is the
#: e-mail that will one day be sent to it.
EMAIL = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


class SaveSpace(BaseModel):
    """Either field may be left out, and is then left alone."""

    name: Optional[str] = None
    body: Optional[str] = None
    #: The page as blocks. Cleaned by `_clean_doc`; `body` is then written
    #: from it and any `body` sent alongside is ignored.
    doc: Optional[dict] = None


class Invite(BaseModel):
    email: str = ''


class AskSpace(BaseModel):
    """One message in a space's AI chat."""

    prompt: str = ''
    #: The page as the editor holds it right now, which may be ahead of the
    #: last save. Cleaned like any save before it's used.
    doc: Optional[dict] = None
    #: Earlier turns, `{role: 'user' | 'ai', text}`, oldest first.
    history: Optional[List[dict]] = None


def _default_name(kind: str, at: int) -> str:
    return KINDS[kind]['name'].format(at)


def _whole(value) -> Optional[int]:
    """An int, or None — never a bool, a float with a fraction, or a string."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return int(value) if float(value).is_integer() else None


def _clean_place(item: dict) -> dict:
    """The block's grid place, when it is a whole, in-bounds one; else nothing."""
    x, y, w = _whole(item.get('x')), _whole(item.get('y')), _whole(item.get('w'))
    if None in (x, y, w):
        return {}
    if x < 0 or w < 1 or x + w > GRID['cols'] or not 0 <= y <= GRID['y_max']:
        return {}
    return {'x': x, 'y': y, 'w': w}


def _number(value, low: float, high: float, default: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value:
        return default
    value = max(low, min(high, float(value)))
    return int(value) if value.is_integer() else round(value, 6)


def _hex(value) -> Optional[str]:
    """A `#rrggbb` colour, lower-cased, or None."""
    return value.lower() if isinstance(value, str) and HEX.match(value) else None


def _clean_fill(raw) -> Optional[dict]:
    """One colour and a fade style (frontend/src/components/Spaces/fill.ts), or None."""
    if not isinstance(raw, dict) or not _hex(raw.get('color')):
        return None
    style = raw.get('style') if raw.get('style') in FILL_STYLES else 'solid'
    return {'color': _hex(raw['color']), 'style': style}


def _clean_chart(raw) -> dict:
    """A chart as the editor may store it: a known kind, a scale, 1–12 points."""
    raw = raw if isinstance(raw, dict) else {}
    kind = raw.get('kind') if raw.get('kind') in CHART['kinds'] else 'bar'
    top = _number(raw.get('max'), 0, CHART['value_max'], CHART['scale_default']) or CHART['scale_default']
    points = []
    for at, point in enumerate(raw.get('points') if isinstance(raw.get('points'), list) else []):
        if len(points) >= CHART['points_max']:
            break
        if not isinstance(point, dict):
            continue
        label = point.get('label')
        points.append({
            'label': (label if isinstance(label, str) else 'Item {}'.format(at + 1))[:CHART['label_max']],
            'value': _number(point.get('value'), 0, CHART['value_max'], 0),
        })
    if not points:
        points = [{'label': 'Item 1', 'value': 0}]
    return {'kind': kind, 'max': top, 'points': points}


def _clean_doc(raw) -> Optional[dict]:
    """A page as the editor may store it, or None for anything that is not one.

    Unknown kinds become text rather than being dropped, so nothing written is
    lost to a kind this server does not know yet; ids are made unique, because
    the editor keys its rows on them.
    """
    if not isinstance(raw, dict):
        return None
    blocks, seen = [], set()
    items = raw.get('blocks') if isinstance(raw.get('blocks'), list) else []
    for at, item in enumerate(items[:BLOCKS_MAX]):
        if not isinstance(item, dict):
            continue
        kind = item.get('type') if item.get('type') in BLOCK_TYPES else 'text'
        ident = str(item.get('id') or '')[:40] or 'b{}'.format(at)
        while ident in seen:
            ident = '{}-{}'.format(ident, at)
        seen.add(ident)
        block = {'id': ident, 'type': kind,
                 'text': '' if kind == 'divider' else str(item.get('text') or '')[:BLOCK_TEXT_MAX]}
        try:
            indent = max(0, min(INDENT_MAX, int(item.get('indent') or 0)))
        except (TypeError, ValueError):
            indent = 0
        if indent:
            block['indent'] = indent
        if kind == 'todo' and item.get('checked') is True:
            block['checked'] = True
        if kind == 'toggle' and item.get('collapsed') is True:
            block['collapsed'] = True
        if kind == 'chart':
            block['chart'] = _clean_chart(item.get('chart'))
        if kind == 'live':
            block['live'] = live.clean_config(item.get('live'))
        if kind == 'panel':
            block['panel'] = panels.clean_panel(item.get('panel'))
        if kind == 'container':
            fill = _clean_fill(item.get('fill'))
            if fill:
                block['fill'] = fill
        if _hex(item.get('color')):
            block['color'] = _hex(item['color'])
        if kind in ('sticky', 'shape'):
            block['fill'] = _clean_fill(item.get('fill')) or dict(DEFAULT_FILL[kind])
            rows = _whole(item.get('rows'))
            block['rows'] = DEFAULT_ROWS[kind] if rows is None else max(TALL['min'], min(TALL['max'], rows))
            if kind == 'shape':
                block['shape'] = item.get('shape') if item.get('shape') in SHAPES else 'rectangle'
        # Only a block at the left edge has a place of its own; one indented
        # under another rides inside it.
        if not indent:
            place = _clean_place(item)
            block.update(place)
            # A flowing block may keep a width of its own (a note, a shape).
            width = _whole(item.get('w'))
            if 'x' not in item and width is not None and 1 <= width <= GRID['cols']:
                block['w'] = width
        blocks.append(block)
    icon = str(raw.get('icon') or '').strip()[:ICON_MAX]
    cover_fill = _clean_fill(raw.get('coverFill'))
    cover = raw.get('cover') if raw.get('cover') in COVERS else ''
    if raw.get('cover') == 'custom' and cover_fill:
        cover = 'custom'
    doc = {'icon': icon, 'cover': cover, 'blocks': blocks}
    if cover == 'custom':
        doc['coverFill'] = cover_fill
    text = raw.get('coverText')
    if isinstance(text, str) and text.strip():
        doc['coverText'] = text[:COVER_TEXT_MAX]
    if _hex(raw.get('coverInk')):
        doc['coverInk'] = _hex(raw['coverInk'])
    if raw.get('coverAlign') in COVER_ALIGNS:
        doc['coverAlign'] = raw['coverAlign']
    background = _clean_fill(raw.get('background'))
    if background:
        doc['background'] = background
    return doc


def _doc_text(doc: dict) -> str:
    """The page as plain text, one line per block, indented two spaces a level."""
    lines = []
    for block in doc['blocks']:
        pad = '  ' * block.get('indent', 0)
        kind, text = block['type'], block['text']
        if kind == 'divider':
            lines.append(pad + '---')
        elif kind == 'code':
            lines.append(pad + '```\n' + text + '\n' + pad + '```')
        elif kind == 'todo':
            lines.append(pad + ('- [x] ' if block.get('checked') else '- [ ] ') + text)
        elif kind == 'sticky':
            lines.append(pad + '🗒 ' + text)
        elif kind == 'shape':
            name = block['shape'].capitalize()
            lines.append(pad + '[{}{}]'.format(name, ': ' + text if text else ''))
        elif kind == 'container':
            lines.append(pad + '▣ ' + (text or 'Container'))
        elif kind == 'live':
            name = LIVE_NAMES[block['live']['source']]
            lines.append(pad + '[Live: {}{}]'.format(name, ', ' + text if text else ''))
        elif kind == 'panel':
            name = panels.NAMES[block['panel']['kind']]
            lines.append(pad + '[Panel: {}{}]'.format(name, ', ' + text if text else ''))
        elif kind == 'chart':
            chart = block['chart']
            name = '{} chart'.format(chart['kind'].capitalize())
            values = ', '.join('{} {}'.format(p['label'], p['value']) for p in chart['points'])
            lines.append(pad + '[{}{}] {}'.format(name, ': ' + text if text else '', values))
        else:
            lines.append(pad + TEXT_PREFIX.get(kind, '') + text)
    return '\n'.join(lines)


def _spaces(username: str, kind: str) -> List[dict]:
    """The three spaces of one kind, defaults filled in for any never saved."""
    stored = db.user_setting(username, KINDS[kind]['key'])
    rows = stored if isinstance(stored, list) else []
    out = []
    for at in range(1, COUNT + 1):
        row = rows[at - 1] if at - 1 < len(rows) and isinstance(rows[at - 1], dict) else {}
        space = {
            'id': at,
            'name': str(row.get('name') or '').strip()[:NAME_MAX] or _default_name(kind, at),
            'body': str(row.get('body') or '')[:BODY_MAX],
        }
        # Only once there is one: a page never opened in the block editor is
        # its `body` alone, and the editor reads that into blocks itself.
        doc = _clean_doc(row.get('doc'))
        if doc:
            space['doc'] = doc
        if kind == 'team':
            space['invites'] = [
                {'email': str(item.get('email') or ''), 'status': 'pending'}
                for item in (row.get('invites') or [])
                if isinstance(item, dict) and EMAIL.match(str(item.get('email') or ''))
            ][:INVITES_MAX]
        out.append(space)
    return out


def _store(username: str, kind: str, spaces: List[dict]) -> None:
    db.set_user_setting(username, KINDS[kind]['key'],
                        [{key: value for key, value in space.items() if key != 'id'}
                         for space in spaces])


def _save(username: str, kind: str, space_id: int, body: SaveSpace):
    """Rename a space, write in it, or both. A blank name goes back to the
    default rather than leaving a row with no label in the rail."""
    if not 1 <= space_id <= COUNT:
        return fail("There's no space {}.".format(space_id))
    spaces = _spaces(username, kind)
    space = spaces[space_id - 1]
    if body.name is not None:
        space['name'] = body.name.strip()[:NAME_MAX] or _default_name(kind, space_id)
    doc = _clean_doc(body.doc) if body.doc is not None else None
    if doc:
        space['doc'] = doc
        space['body'] = _doc_text(doc)[:BODY_MAX]
    elif body.body is not None:
        space['body'] = body.body[:BODY_MAX]
    _store(username, kind, spaces)
    return ok(space=space)


# ---- The AI chat --------------------------------------------------------------
#: Turns kept per space, and how many of the newest AI turns keep the page
#: from before them for Undo (a page is big; forty of them is not a chat).
CHAT_KEEP = 40
UNDO_KEEP = 5

#: Words in a prompt that ask for a part of the record. Each picks the lines
#: `prompt_context` adds.
ASKS_WEEK = re.compile(r'\b(week|weekly|schedule|calendar|plan|planner|today|tomorrow|upcoming|deadline|due)\b', re.I)
ASKS_GOALS = re.compile(r'\b(goal|goals|target|aim|aims|milestone|checkpoint)\b', re.I)
ASKS_MOOD = re.compile(r'\b(mood|feel|feeling|feelings|energy|stress|stressed|tired|journal|log)\b', re.I)
ASKS_STATS = re.compile(r'\b(progress|stats|analytics|dashboard|tracker|track|habit|habits|streak|review|reflect)\b', re.I)


def _chat_key(kind: str, space_id: int) -> str:
    """One chat per account and per space: the key lives in that account's
    own settings rows, and names the kind and the number."""
    return 'space_chat:{}:{}'.format(kind, space_id)


def _chat(username: str, kind: str, space_id: int) -> List[dict]:
    stored = db.user_setting(username, _chat_key(kind, space_id))
    return [turn for turn in stored if isinstance(turn, dict)] if isinstance(stored, list) else []


def _keep_chat(username: str, kind: str, space_id: int, turns: List[dict]) -> List[dict]:
    turns = turns[-CHAT_KEEP:]
    ai_seen = 0
    for turn in reversed(turns):
        if turn.get('role') == 'ai' and turn.get('before') is not None:
            ai_seen += 1
            if ai_seen > UNDO_KEEP:
                turn['before'] = None
    db.set_user_setting(username, _chat_key(kind, space_id), turns)
    return turns


def _public(turns: List[dict]) -> List[dict]:
    """The chat as the page shows it: Undo is a flag, not a page."""
    return [{key: value for key, value in turn.items() if key != 'before'}
            | {'undo': turn.get('before') is not None} for turn in turns]


def prompt_context(username: str, prompt: str) -> List[str]:
    """Lines from the reader's own record, picked for this prompt.

    The subjects the prompt names (read the way said-vs-did reads a line, so
    "AMC" is Mathematics) get their last month: tasks done and open, goals
    filed under them, and the free resources the catalogue has for them.
    Asking about the week, goals, mood or progress adds that part of the
    record. Always the date, so "this week" means this week.
    """
    from backend.tracking import free_resources, said_did
    today = date.today()
    lines = ['Today is {}, {}.'.format(today.strftime('%A'), today.isoformat())]
    names = background_api.subject_names(username)
    namer = said_did.Namer(names, background_api.subject_groups())
    subjects, resources = namer.read_all(prompt)
    tasks = db.columns_for('tasks', username, ('title', 'subject', 'status', 'completed_at', 'due_date'))
    since = (today - timedelta(days=29)).isoformat()
    goals = [row for row in db.rows_for('goals', username) if row.get('status') != 'completed']

    for subject in subjects[:3]:
        name = names.get(subject, subject)
        mine = [row for row in tasks if row.get('subject') == subject]
        done = [row for row in mine if row.get('status') == 'done' and str(row.get('completed_at') or '')[:10] >= since]
        open_ = [row for row in mine if row.get('status') != 'done']
        lines.append('{}: {} tasks finished in the last 30 days{}.'.format(
            name, len(done), ' (latest: {})'.format('; '.join(
                row.get('title') or '' for row in sorted(done, key=lambda r: str(r.get('completed_at')), reverse=True)[:5]))
            if done else ''))
        if open_:
            lines.append('{} open {} tasks: {}.'.format(len(open_), name, '; '.join(
                '{}{}'.format(row.get('title') or '', ' (due {})'.format(row['due_date']) if row.get('due_date') else '')
                for row in open_[:6])))
        filed = [goal for goal in goals if subject in str(goal.get('subject_ids') or '')]
        for goal in filed[:3]:
            lines.append('Goal in {}: "{}", {}% done{}.'.format(
                name, goal.get('title'), int(float(goal.get('progress') or 0)),
                ', due {}'.format(goal['deadline']) if goal.get('deadline') else ''))
        free = free_resources.by_subject().get(subject) or []
        if free:
            lines.append('Free resources for {} (use these names and links if you list resources): {}.'.format(
                name, '; '.join('{} ({}): {}'.format(row['name'], row['url'], row.get('good_for') or '') for row in free[:4])))
    if resources:
        lines.append('They named: {}.'.format(', '.join(label for label, _ in resources)))

    if ASKS_WEEK.search(prompt):
        ahead = (today + timedelta(days=14)).isoformat()
        events = [row for row in db.rows_for('calendar_events', username)
                  if today.isoformat() <= str(row.get('date') or '') <= ahead]
        events.sort(key=lambda row: (str(row.get('date')), str(row.get('time_block') or '')))
        if events:
            lines.append('On their calendar in the next two weeks: {}.'.format('; '.join(
                '{} {}{}'.format(row.get('date'), row.get('name'), ' at {}'.format(row['time_block']) if row.get('time_block') else '')
                for row in events[:10])))
        due = [row for row in tasks if row.get('status') != 'done' and today.isoformat() <= str(row.get('due_date') or '') <= ahead]
        if due:
            lines.append('Tasks due in the next two weeks: {}.'.format('; '.join(
                '{} (due {})'.format(row.get('title'), row.get('due_date')) for row in sorted(due, key=lambda r: str(r.get('due_date')))[:10])))
        if not events and not due:
            lines.append('Nothing on their calendar or due in the next two weeks.')

    if ASKS_GOALS.search(prompt) and goals:
        lines.append('Their active goals: {}.'.format('; '.join(
            '"{}" {}%{}'.format(goal.get('title'), int(float(goal.get('progress') or 0)),
                                ' due {}'.format(goal['deadline']) if goal.get('deadline') else '')
            for goal in goals[:8])))

    if ASKS_MOOD.search(prompt):
        found = background_api.mood_for(username)
        if found.get('headline'):
            lines.append('Mood vs output: {}'.format(found['headline']['text']))

    if ASKS_STATS.search(prompt):
        recent = [row for row in tasks if row.get('status') == 'done' and str(row.get('completed_at') or '')[:10] >= since]
        top = {}
        for row in recent:
            if row.get('subject'):
                top[row['subject']] = top.get(row['subject'], 0) + 1
        best = sorted(top.items(), key=lambda pair: -pair[1])[:4]
        lines.append('Last 30 days: {} tasks finished{}.'.format(len(recent), ', mostly {}'.format(', '.join(
            '{} ({})'.format(names.get(subject, subject), count) for subject, count in best)) if best else ''))
    return lines


def _ask(username: str, kind: str, space_id: int, body: AskSpace):
    """Build, change or answer about a page from the chat
    (backend/tracking/space_ai.py).

    The chat is this account's and this space's alone, kept on the server
    (`_chat_key`), so it follows the reader to another device and never
    shows on another account or another space. The model's blocks are
    cleaned by `_clean_doc` like any save; then the page is measured
    (backend/tracking/space_look.py) and any text the AI wrote that fails
    contrast is fixed before it's saved, and the reply says what was found.
    """
    if not 1 <= space_id <= COUNT:
        return fail("There's no space {}.".format(space_id))
    prompt = (body.prompt or '').strip()[:2000]
    if not prompt:
        return fail('Say what you want on the page.')

    spaces = _spaces(username, kind)
    space = spaces[space_id - 1]
    before = _clean_doc(body.doc) or space.get('doc') or {'icon': '', 'cover': '', 'blocks': []}
    turns = _chat(username, kind, space_id)
    stamp = datetime.now().isoformat(timespec='seconds')
    turns.append({'role': 'user', 'text': prompt, 'at': stamp})

    try:
        made = space_ai.build(prompt, page_name=space['name'], history=turns[:-1],
                              options=_live_options(username), doc=before,
                              context=prompt_context(username, prompt),
                              about=background_api.about_lines(username))
    except BriefUnavailable as exc:
        turns.append({'role': 'ai', 'text': str(exc), 'at': stamp, 'failed': True})
        _keep_chat(username, kind, space_id, turns)
        return fail(str(exc), chat=_public(turns))

    code = datetime.now().strftime('%H%M%S%f')[:10]
    blocks, written = space_ai.apply(list(before['blocks']), made,
                                     lambda n: 'ai{}-{}'.format(code, n))
    page = {**before, 'blocks': blocks, 'icon': made['icon'] or before.get('icon') or ''}
    if made.get('cover'):
        page['cover'] = made['cover']
    if made.get('cover_text'):
        page['coverText'] = made['cover_text']
    if made.get('cover_align'):
        page['coverAlign'] = made['cover_align']
    if made.get('background'):
        page['background'] = {'color': made['background'], 'style': 'solid'}
    doc = _clean_doc(page)

    # Look at what was made: fix the AI's own failing text, report the rest.
    # The AI's own blocks: what it wrote now, and what it made in earlier
    # turns (their ids start "ai"). The reader's own blocks are only reported.
    mine = written | {block.get('id') for block in doc['blocks'] if str(block.get('id') or '').startswith('ai')}
    fixed = space_look.repair(doc, only_ids=mine) if made['mode'] != 'reply' else []
    checked = space_look.summary(doc)
    notes = _look_notes(fixed, checked, written)

    changed = made['mode'] != 'reply'
    if changed:
        space['doc'] = doc
        space['body'] = _doc_text(doc)[:BODY_MAX]
        _store(username, kind, spaces)
    turns.append({'role': 'ai', 'text': made['reply'], 'at': stamp, 'mode': made['mode'],
                  'notes': notes, 'before': before if changed else None})
    turns = _keep_chat(username, kind, space_id, turns)
    return ok(space=space, reply=made['reply'], mode=made['mode'], before=before if changed else None,
              notes=notes, chat=_public(turns))


def _look_notes(fixed: List[dict], checked: dict, written: set) -> List[str]:
    """What the contrast check found, in a line or two for the chat."""
    notes = []
    for row in fixed[:4]:
        if row['how'] == 'tint':
            notes.append('The title of block {} ("{}") was {}:1, so I deepened the box\'s tint to {} '
                         'and it reads on both themes now.'.format(row['index'], row['text'][:30],
                                                                  row['ratio'], row['fixed']))
        elif row['how'] == 'theme':
            notes.append('Block {} ("{}") was {}:1, so I dropped its text color and it follows '
                         'your light or dark theme now.'.format(row['index'], row['text'][:30], row['ratio']))
        else:
            notes.append('Block {} ("{}") was {}:1 on {}. I changed its text to {} ({}:1).'.format(
                row['index'], row['text'][:30], row['ratio'], row['ground'], row['fixed'], row['now']))
    others = [row for row in checked['failing']]
    for row in others[:3]:
        notes.append('Your block {} ("{}") is {}:1 on {}{}, under the {}:1 it needs. Ask me to fix it.'.format(
            row['index'], row['text'][:30], row['ratio'], row['ground'],
            ' in the dark theme' if row['theme'] == 'dark' else '', space_look.needed(row['type'])))
    if not notes and checked['checked']:
        notes.append('Checked contrast on {} text blocks: all pass, lowest {}:1.'.format(
            checked['checked'], checked['lowest']['ratio']))
    return notes


def _chat_reply(username: str, kind: str, space_id: int):
    if not 1 <= space_id <= COUNT:
        return fail("There's no space {}.".format(space_id))
    return ok(chat=_public(_chat(username, kind, space_id)))


class ChatTurnRef(BaseModel):
    #: Which turn, by its place in the chat.
    at: int = -1


def _undo(username: str, kind: str, space_id: int, body: ChatTurnRef):
    """Put the page back as it was before one AI turn, and say so in the chat."""
    if not 1 <= space_id <= COUNT:
        return fail("There's no space {}.".format(space_id))
    turns = _chat(username, kind, space_id)
    if not 0 <= body.at < len(turns) or turns[body.at].get('before') is None:
        return fail("That change can't be undone any more.")
    turn = turns[body.at]
    spaces = _spaces(username, kind)
    space = spaces[space_id - 1]
    doc = _clean_doc(turn['before']) or {'icon': '', 'cover': '', 'blocks': []}
    space['doc'] = doc
    space['body'] = _doc_text(doc)[:BODY_MAX]
    _store(username, kind, spaces)
    turn['before'] = None
    turn['undone'] = True
    turns = _keep_chat(username, kind, space_id, turns)
    return ok(space=space, chat=_public(turns))


def _clear_chat(username: str, kind: str, space_id: int):
    if not 1 <= space_id <= COUNT:
        return fail("There's no space {}.".format(space_id))
    db.set_user_setting(username, _chat_key(kind, space_id), [])
    return ok(chat=[])


# ---- Personal --------------------------------------------------------------
@router.get('/api/spaces')
def list_spaces(username: str = Depends(current_username)):
    return ok(spaces=_spaces(username, 'personal'))


@router.post('/api/spaces/{space_id}')
def save_space(space_id: int, body: SaveSpace,
               username: str = Depends(current_username)):
    return _save(username, 'personal', space_id, body)


@router.post('/api/spaces/{space_id}/ai')
def ask_space(space_id: int, body: AskSpace, username: str = Depends(current_username)):
    return _ask(username, 'personal', space_id, body)


@router.get('/api/spaces/{space_id}/chat')
def space_chat(space_id: int, username: str = Depends(current_username)):
    return _chat_reply(username, 'personal', space_id)


@router.post('/api/spaces/{space_id}/chat/undo')
def space_chat_undo(space_id: int, body: ChatTurnRef, username: str = Depends(current_username)):
    return _undo(username, 'personal', space_id, body)


@router.post('/api/spaces/{space_id}/chat/clear')
def space_chat_clear(space_id: int, username: str = Depends(current_username)):
    return _clear_chat(username, 'personal', space_id)


# ---- Team ------------------------------------------------------------------
@router.get('/api/team-spaces')
def list_team_spaces(username: str = Depends(current_username)):
    return ok(spaces=_spaces(username, 'team'))


@router.post('/api/team-spaces/{space_id}')
def save_team_space(space_id: int, body: SaveSpace,
                    username: str = Depends(current_username)):
    return _save(username, 'team', space_id, body)


@router.post('/api/team-spaces/{space_id}/ai')
def ask_team_space(space_id: int, body: AskSpace, username: str = Depends(current_username)):
    return _ask(username, 'team', space_id, body)


@router.get('/api/team-spaces/{space_id}/chat')
def team_space_chat(space_id: int, username: str = Depends(current_username)):
    return _chat_reply(username, 'team', space_id)


@router.post('/api/team-spaces/{space_id}/chat/undo')
def team_space_chat_undo(space_id: int, body: ChatTurnRef, username: str = Depends(current_username)):
    return _undo(username, 'team', space_id, body)


@router.post('/api/team-spaces/{space_id}/chat/clear')
def team_space_chat_clear(space_id: int, username: str = Depends(current_username)):
    return _clear_chat(username, 'team', space_id)


@router.post('/api/team-spaces/{space_id}/invite')
def invite(space_id: int, body: Invite, username: str = Depends(current_username)):
    """Add a pending invite. Placeholder: nothing is sent. See the module note."""
    if not 1 <= space_id <= COUNT:
        return fail("There's no space {}.".format(space_id))
    email = body.email.strip().lower()[:200]
    if not EMAIL.match(email):
        return fail("That doesn't look like an e-mail address.")
    spaces = _spaces(username, 'team')
    space = spaces[space_id - 1]
    if any(item['email'] == email for item in space['invites']):
        return fail('{} is already invited.'.format(email))
    if len(space['invites']) >= INVITES_MAX:
        return fail('A space holds {} invites at most.'.format(INVITES_MAX))
    space['invites'].append({'email': email, 'status': 'pending'})
    _store(username, 'team', spaces)
    return ok(space=space)


@router.post('/api/team-spaces/{space_id}/uninvite')
def uninvite(space_id: int, body: Invite, username: str = Depends(current_username)):
    if not 1 <= space_id <= COUNT:
        return fail("There's no space {}.".format(space_id))
    email = body.email.strip().lower()
    spaces = _spaces(username, 'team')
    space = spaces[space_id - 1]
    space['invites'] = [item for item in space['invites'] if item['email'] != email]
    _store(username, 'team', spaces)
    return ok(space=space)


# ---- Live blocks -----------------------------------------------------------
#: The task columns the live readers need, and no more: on a large account the
#: task list is twenty thousand rows.
LIVE_TASK_FIELDS = ('id', 'title', 'status', 'subject', 'goal_id', 'xp_value',
                    'due_date', 'completed_at')


def _goals_now(username):
    """Every goal as the goals page has it, without writing anything.

    The same path as GET /api/get_goals: streak and focus goals brought up to
    date on the rows in hand, then progress, checkpoints and health.
    """
    rows = db.rows_for('goals', username)
    goals_api.sync_streak_goals(username, rows, persist=False)
    goals_api.sync_focus_goals(username, rows, persist=False)
    return goals_api._goals_reply(username, rows)['goals']


def _tasks(username):
    return goal_store.with_goal_ids(username, db.columns_for('tasks', username, LIVE_TASK_FIELDS))


def _streak(username):
    """The streak as the dashboard reads it, decayed on a copy so nothing is written."""
    _, user = load_user(username)
    if not user:
        return 0
    user = dict(user)
    xp_tracking.refresh_streak(user)
    return user.get('current_streak', 0) or 0


def live_data(username, config, today=None):
    """What one live block shows, read fresh. `config` is already clean."""
    today = today or date.today()
    source = config['source']
    if source == 'goal':
        goal = live.pick_goal(_goals_now(username), config['goal'], today)
        return live.goal_view(goal, _tasks(username) if goal else [], today)
    if source == 'goals':
        return live.goals_view(_goals_now(username), config['status'], today, config['pick'])
    if source == 'record':
        return live.record_view(records_api._mine(username), config['name'], today)
    if source == 'heatmap':
        days = config['weeks'] * 7 + 7
        series = (growth_tracking.series(username, days) or {}).get('growth_data') or []
        return live.heatmap_view(series, config['weeks'], config['metric'], today)
    if source == 'rhythm':
        return live.rhythm_view(db.columns_for('tasks', username, LIVE_TASK_FIELDS),
                                config['days'], config['metric'], today)
    if source == 'subjects':
        return live.subjects_view(db.columns_for('tasks', username, LIVE_TASK_FIELDS), config['days'],
                                  config['metric'], today, lambda key: _subject_name(username, key),
                                  live.LIVE['subjects_max'])
    if source == 'skills':
        nodes = skillsteps_api.catalogue()
        attempts = db.rows_for('skill_attempts', username)
        tree = live.pick_tree(nodes, attempts, config['tree'])
        if not tree:
            return {'empty': True}
        return live.skills_view(nodes, attempts, tree, skill_level.read_level)
    if source == 'productivity':
        days = max(config['weeks'] * 7, 28)
        series = (growth_tracking.series(username, days) or {}).get('growth_data') or []
        return live.productivity_view(series, config['weeks'], _streak(username), today, config['metric'])
    if source == 'records':
        return live.records_view(records_api._mine(username), config['category'], config['limit'],
                                 config['pick'], config['sort'])
    if source == 'calendar':
        return live.calendar_view(db.columns_for('tasks', username, LIVE_TASK_FIELDS),
                                  _goals_now(username), today, config['days'])
    # growth
    subject = config['subject']
    series = [] if subject else (growth_tracking.series(username, config['days'] * 2) or {}).get('growth_data') or []
    tasks = db.columns_for('tasks', username, LIVE_TASK_FIELDS) if subject else []
    tree_nodes = [node for node in skillsteps_api.catalogue() if subject and node.get('tree') == subject]
    attempts = db.rows_for('skill_attempts', username) if tree_nodes else []
    view = live.growth_view(subject, config['days'], tasks, series, attempts, tree_nodes, today, config['metric'])
    view['name'] = _subject_name(username, subject)
    return view


def _subject_name(username, subject):
    """What a subject is called: the catalog's name, the account's own, or the id."""
    if not subject:
        return ''
    row = subjects_catalog.BY_ID.get(subject) or subjects_api._rows(username).get(subject) or {}
    return row.get('name') or subject


@router.get('/api/spaces/live')
def read_live(source: str = '', goal: str = '', tree: str = '', weeks: int = 0,
              category: str = '', limit: int = 0, days: int = 0, subject: str = '',
              view: str = '', metric: str = '', status: str = '', name: str = '',
              pick: str = '', sort: str = '',
              username: str = Depends(current_username)):
    """What one live block shows right now. Read only, like every GET.

    `pick` is a JSON list (the goals or records ticked), since a query string
    has no lists of its own.
    """
    if source not in live.SOURCES:
        return fail("There's no live source called {}.".format(source or 'that'))
    config = live.clean_config({'source': source, 'goal': goal, 'tree': tree, 'weeks': weeks,
                                'category': category, 'limit': limit, 'days': days, 'subject': subject,
                                'view': view, 'metric': metric, 'status': status, 'name': name,
                                'pick': pick, 'sort': sort})
    return ok(config=config, data=live_data(username, config),
              revision=live.revisions(username)[source],
              at=datetime.now().isoformat(timespec='seconds'))


@router.get('/api/spaces/live/options')
def live_options(username: str = Depends(current_username)):
    """What a live block can be pointed at: goals, trees, subjects, categories."""
    return ok(**_live_options(username))


def _live_options(username: str) -> dict:
    """The live block picks for this account. Shared with the AI chat."""
    goals = db.rows_for('goals', username)
    goals.sort(key=lambda goal: (goal.get('status') == 'completed', str(goal.get('title') or '').lower()))
    subjects = subjects_api.subjects(username=username)['subjects']
    subjects.sort(key=lambda row: -(row.get('used') or 0))
    records = records_api._mine(username)
    return dict(
        goals=[{'id': str(goal.get('id')), 'title': goal.get('title') or '', 'done': goal.get('status') == 'completed'}
               for goal in goals],
        trees=live.trees_of(skillsteps_api.catalogue()),
        subjects=[{'id': row['id'], 'name': row.get('name') or row['id'], 'used': row.get('used') or 0}
                  for row in subjects],
        categories=sorted({row.get('category') or '' for row in records if row.get('kind', 'record') == 'record'} - {''},
                          key=str.lower),
        records=live.record_names(records),
    )


@router.get('/api/spaces/live/revisions')
def live_revisions(username: str = Depends(current_username)):
    """A stamp per source. An open page polls this; a stamp that moved means refresh."""
    return ok(revisions=live.revisions(username))
