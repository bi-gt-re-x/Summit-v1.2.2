"""Spaces — three pages under "Personal" in the rail, and three under "Team".

Each is a name and a page. They start as "Space 1" to "Space 3" and "Team
Space 1" to "Team Space 3" with nothing written, and the reader renames them
and fills them in.

## The page is blocks

The space page is a block editor in the manner of Notion
(frontend/src/components/Spaces/BlockEditor.tsx): an icon, a cover, and a
list of blocks — text, three heading sizes, bulleted, numbered and to-do
lists, toggles, quotes, callouts, dividers and code — each with an indent.
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

router = APIRouter(tags=['spaces'])

#: Where each kind lives in `user_settings`, and what its spaces are called
#: before anybody renames them.
KINDS = {
    'personal': {'key': 'personal_spaces', 'name': 'Space {}'},
    'team': {'key': 'team_spaces', 'name': 'Team Space {}'},
}

#: How many of each. Fixed, and the rail draws exactly this many.
COUNT = 3

#: A name is a rail row, not a sentence.
NAME_MAX = 40

#: A page of writing, generously, rather than an unbounded column.
BODY_MAX = 50_000

#: What a page may hold. Mirrors BLOCK_KINDS, INDENT_MAX and COVERS in
#: frontend/src/components/Spaces/blocks.ts.
BLOCK_TYPES = ('text', 'h1', 'h2', 'h3', 'bullet', 'numbered', 'todo', 'toggle',
               'quote', 'callout', 'divider', 'code')
BLOCKS_MAX = 1000
BLOCK_TEXT_MAX = 10_000
INDENT_MAX = 4
COVERS = ('sunrise', 'ocean', 'meadow', 'dusk', 'ember', 'forest', 'slate', 'sand')
#: An emoji, which can be several code points (a flag, a skin tone, a family).
ICON_MAX = 16

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
        blocks.append(block)
    icon = str(raw.get('icon') or '').strip()[:ICON_MAX]
    cover = raw.get('cover') if raw.get('cover') in COVERS else ''
    return {'icon': icon, 'cover': cover, 'blocks': blocks}


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
