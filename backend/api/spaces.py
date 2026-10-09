"""Spaces — three pages under "Personal" in the rail, and three under "Team".

Each is a name and a page. They start as "Space 1" to "Space 3" and "Team
Space 1" to "Team Space 3" with nothing written, and the reader renames them
and fills them in.

## The page is blocks

The space page is a block editor in the manner of Notion
(frontend/src/components/Spaces/BlockEditor.tsx): an icon, a cover, and a
list of blocks — text, three heading sizes, bulleted, numbered and to-do
lists, toggles, quotes, callouts, dividers, code and charts — each with an
indent. A top-level block may also carry a place on the page's grid (`x`,
`y`, `w`: column, row, width in columns) once it has been dragged, and a
chart carries its kind, its scale and its points.
That list is `doc`, checked here block by block against the kinds the editor
knows. `body` stays as the page in plain text, written from the blocks on
every save, so anything that only wants the words still has them, and a page
written before blocks existed still opens: the editor reads its `body` into
blocks when there is no `doc`. Not notes: a note is one of many, filed by day,
task or goal; a space is one of three fixed places the reader comes back to.

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
"""
import re
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.database import connection as db
from backend.config.shared import RULES

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
        return fail('There is no space {}.'.format(space_id))
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


# ---- Personal --------------------------------------------------------------
@router.get('/api/spaces')
def list_spaces(username: str = Depends(current_username)):
    return ok(spaces=_spaces(username, 'personal'))


@router.post('/api/spaces/{space_id}')
def save_space(space_id: int, body: SaveSpace,
               username: str = Depends(current_username)):
    return _save(username, 'personal', space_id, body)


# ---- Team ------------------------------------------------------------------
@router.get('/api/team-spaces')
def list_team_spaces(username: str = Depends(current_username)):
    return ok(spaces=_spaces(username, 'team'))


@router.post('/api/team-spaces/{space_id}')
def save_team_space(space_id: int, body: SaveSpace,
                    username: str = Depends(current_username)):
    return _save(username, 'team', space_id, body)


@router.post('/api/team-spaces/{space_id}/invite')
def invite(space_id: int, body: Invite, username: str = Depends(current_username)):
    """Add a pending invite. Placeholder: nothing is sent. See the module note."""
    if not 1 <= space_id <= COUNT:
        return fail('There is no space {}.'.format(space_id))
    email = body.email.strip().lower()[:200]
    if not EMAIL.match(email):
        return fail('That does not look like an e-mail address.')
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
        return fail('There is no space {}.'.format(space_id))
    email = body.email.strip().lower()
    spaces = _spaces(username, 'team')
    space = spaces[space_id - 1]
    space['invites'] = [item for item in space['invites'] if item['email'] != email]
    _store(username, 'team', spaces)
    return ok(space=space)
