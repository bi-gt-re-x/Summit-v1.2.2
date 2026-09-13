"""The hall of fame the account writes itself.

Three endpoints over the table in data/sql/records.sql, and `save` is one of
them rather than two for the reason notes.py gives: create and edit differ by
whether an `id` was sent, the page has one dialog, and two endpoints would be
two clients functions whose only difference is a field left out.

## What this does not do

It does not decide what the personal best is, group rows by name, or work out
which entry was an improvement on the last — not even now that the row says
which direction is better, because `comparison_direction` is a fact about the
record and the comparison it feeds is still a view. All of that is the *page's*,
because all of it is a view of the same rows and the client already holds them
all — see `bestOf` and `evolutionOf` in frontend/src/utils/records.ts. The
server's job here is the part that has to be true: that a row belongs to the
account that asked for it, that a number is a number, and that a date is a
date.

That split is the opposite of the one goals.py makes, and deliberately. A
goal's progress is recomputed server-side because two clients could disagree
about it and the disagreement would be written back. Nothing here is written
back — the best is read, never stored — so there is nothing to keep honest.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.database import connection as db
from backend.tracking.auth import load_user

router = APIRouter(tags=['records'])

#: Field ceilings. The columns are TEXT with no limit and a request body is the
#: one thing here a caller controls entirely.
NAME_MAX = 120
NOTE_MAX = 500

KINDS = ('record', 'milestone')

#: Which end of a record's range is the good end. A score wants 'higher', a
#: mile time wants 'lower'. Stored rather than guessed from the unit, because
#: "minutes practised" is a bigger-is-better duration and any rule built on the
#: unit gets that one backwards — see data/sql/records.sql.
DIRECTIONS = ('higher', 'lower')


def _known(username):
    """Whether this is a real account. See the same helper in notes.py."""
    _, user = load_user((username or '').strip())
    return bool(user)


def _now():
    return datetime.now().isoformat(timespec='seconds')


def _date(raw):
    """An ISO day, or '' — never a half-parsed one.

    A milestone that has not happened has no date, and the page draws it as an
    open circle off exactly this being empty. So a string that is not a date is
    stored as no date rather than as itself: the alternative is a timeline that
    sorts "soon" between March and April.
    """
    text = (raw or '').strip()[:10]
    if not text:
        return ''
    try:
        datetime.strptime(text, '%Y-%m-%d')
    except ValueError:
        return ''
    return text


def _number(raw):
    """A finite number, or 0. Rejects NaN and infinities, which JSON permits."""
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 0
    if value != value or value in (float('inf'), float('-inf')):
        return 0
    return value


class SaveRecord(BaseModel):
    #: Absent on a create, present on an edit. The row's own id, never reused.
    id: Optional[str] = None
    kind: str = 'record'
    name: str = ''
    category: str = ''
    value: float = 0
    target: float = 0
    unit: str = ''
    comparison_direction: str = 'higher'
    note: str = ''
    achieved_on: str = ''


class DeleteRecord(BaseModel):
    id: Optional[str] = None


def _mine(username):
    """This account's rows, newest achievement first.

    Undated rows sort last rather than first: a milestone with no date has not
    happened, and the top of a hall of fame is not where "not yet" belongs.
    Applied here rather than in the client for the reason notes.py gives — one
    ordering, decided once.
    """
    rows = db.rows_for('records', username)
    rows.sort(
        key=lambda row: (
            0 if row.get('achieved_on') else 1,
            [-ord(c) for c in (row.get('achieved_on') or '')],
            [-ord(c) for c in (row.get('created_at') or '')],
        )
    )
    return rows


def _clean(entry: SaveRecord):
    """The writable fields, trimmed, capped and typed. Nothing else is stored."""
    kind = entry.kind if entry.kind in KINDS else 'record'
    return {
        'kind': kind,
        'name': entry.name.strip()[:NAME_MAX],
        'category': entry.category.strip()[:NAME_MAX],
        # A milestone carries no figure. Zeroed rather than trusted, so a
        # client that sends one cannot produce a milestone that draws a number.
        'value': 0 if kind == 'milestone' else _number(entry.value),
        'target': 0 if kind == 'milestone' else _number(entry.target),
        'unit': '' if kind == 'milestone' else entry.unit.strip()[:24],
        # A milestone has nothing to compare, so it is stored 'higher' rather
        # than left to whatever a client sent: the column is one of two words
        # everywhere, and a row that reads 'lower' but carries no figure is a
        # question the page would have to answer every time it groups rows.
        'comparison_direction': (
            entry.comparison_direction
            if kind == 'record' and entry.comparison_direction in DIRECTIONS
            else 'higher'
        ),
        'note': entry.note.strip()[:NOTE_MAX],
        'achieved_on': _date(entry.achieved_on),
    }


@router.get('/api/records')
def list_records(username: str = Depends(current_username)):
    """Every record and milestone this account has, in the page's order."""
    if not _known(username):
        return fail('Sign in to see your records.')
    return ok(records=_mine(username))


@router.post('/api/records/save')
def save_record(entry: SaveRecord, username: str = Depends(current_username)):
    """Create a record or milestone, or replace the writable fields of one."""
    if not _known(username):
        return fail('Sign in to add a record.')

    fields = _clean(entry)
    if not fields['name']:
        return fail('A record needs a name.')

    if entry.id:
        row = db.find_row('records', entry.id, user_id=username)
        # Not silently created: making a new row out of a failed edit is how an
        # account ends up with two of something it meant to change once.
        if not row:
            return fail('That record no longer exists.')
        row.update(fields)
        row['updated_at'] = _now()
        db.update_row('records', row['id'],
                      {**fields, 'updated_at': row['updated_at']}, user_id=username)
        saved = row
    else:
        saved = {
            'id': str(db.new_id('records')),
            'user_id': username,
            **fields,
            'created_at': _now(),
            'updated_at': _now(),
        }
        saved = db.insert_row('records', saved)

    return ok(record=saved)


@router.post('/api/records/delete')
def delete_record(body: DeleteRecord, username: str = Depends(current_username)):
    """Remove one row. Only ever this account's own."""
    if not _known(username):
        return fail('Sign in to delete a record.')
    if not body.id:
        return fail('Record ID required')

    if not db.delete_row('records', body.id, user_id=username):
        return fail('Record not found')
    return ok(id=body.id)
