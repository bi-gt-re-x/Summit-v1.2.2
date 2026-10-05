"""Spaces — three pages of the account's own, under "Personal" in the rail.

Each is a name and a page of free text, nothing more. They start as "Space 1",
"Space 2" and "Space 3" with nothing written, and the reader renames them and
fills them in. Not notes: a note is one of many, filed by day, task or goal;
a space is one of three fixed places the reader comes back to.

Kept in `user_settings` under SPACES_KEY as one list, because three short
records do not earn a table — the same choice the analytics baseline made.
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.database import connection as db

router = APIRouter(tags=['spaces'])

#: Where the spaces live in `user_settings`.
SPACES_KEY = 'personal_spaces'

#: How many there are. Fixed, and the rail draws exactly this many.
COUNT = 3

#: A name is a rail row, not a sentence.
NAME_MAX = 40

#: A page of writing, generously, rather than an unbounded column.
BODY_MAX = 50_000


class SaveSpace(BaseModel):
    """Either field may be left out, and is then left alone."""

    name: Optional[str] = None
    body: Optional[str] = None


def _default(at: int) -> dict:
    return {'name': 'Space {}'.format(at), 'body': ''}


def _spaces(username: str) -> list:
    """The three spaces, defaults filled in for any never saved."""
    stored = db.user_setting(username, SPACES_KEY)
    rows = stored if isinstance(stored, list) else []
    out = []
    for at in range(1, COUNT + 1):
        row = rows[at - 1] if at - 1 < len(rows) and isinstance(rows[at - 1], dict) else {}
        base = _default(at)
        name = str(row.get('name') or '').strip()[:NAME_MAX] or base['name']
        body = str(row.get('body') or '')[:BODY_MAX]
        out.append({'id': at, 'name': name, 'body': body})
    return out


@router.get('/api/spaces')
def list_spaces(username: str = Depends(current_username)):
    return ok(spaces=_spaces(username))


@router.post('/api/spaces/{space_id}')
def save_space(space_id: int, body: SaveSpace,
               username: str = Depends(current_username)):
    """Rename a space, write in it, or both.

    A blank name goes back to the default rather than leaving a row with no
    label in the rail.
    """
    if not 1 <= space_id <= COUNT:
        return fail('There is no space {}.'.format(space_id))

    spaces = _spaces(username)
    space = spaces[space_id - 1]
    if body.name is not None:
        space['name'] = body.name.strip()[:NAME_MAX] or _default(space_id)['name']
    if body.body is not None:
        space['body'] = body.body[:BODY_MAX]

    db.set_user_setting(username, SPACES_KEY,
                        [{'name': row['name'], 'body': row['body']} for row in spaces])
    return ok(space=space)
