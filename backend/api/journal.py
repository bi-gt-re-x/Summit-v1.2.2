"""Log: a private journal, and what Summit has learned from it.

The page is frontend/src/pages/Log.tsx; the tables are data/sql/log.sql. An
entry is the account's own writing. Nothing here is shared, scored or shown to
anyone else, and Spaces never reads it.

Saving an entry never waits on a model. The save writes the row and returns,
and backend/tracking/journal.py reads it in the background: after a quiet
spell for an autosave, straight away when the person pressed Save (`final`).
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.database import connection as db
from backend.tracking import journal, planner

router = APIRouter(tags=['log'])

#: A Save press reads the entry this soon: long enough for the reply to land.
FINAL_DELAY = 1.0


class SaveEntry(BaseModel):
    #: Absent on a create, present on an edit.
    id: Optional[str] = None
    title: str = ''
    body: str = ''
    #: The Save button rather than an autosave: read it now.
    final: bool = False
    #: How the day felt (1-5) and how much energy there was (1-3), from the
    #: check-in row. Left out means leave it; 0 means clear it.
    mood: Optional[int] = None
    energy: Optional[int] = None


def _scale(value, top):
    """A check-in answer: None to leave it, 0 to clear, else 1..top."""
    if value is None or isinstance(value, bool):
        return 'leave'
    if value == 0:
        return None
    return value if 1 <= value <= top else 'leave'


class EntryId(BaseModel):
    id: Optional[str] = None


def _entries(username):
    """Newest first. The page offers the other order itself."""
    rows = db.rows_for('log_entries', username)
    rows.sort(key=lambda row: (row.get('created_at') or '', str(row.get('id'))), reverse=True)
    return rows


def _insights(username):
    return [{key: row.get(key) for key in ('id', 'kind', 'topic', 'text', 'status',
                                          'expires_at', 'created_at', 'updated_at')}
            | {'sources': journal.sources_of(row)}
            for row in journal.shown(db.rows_for('log_insights', username))]


@router.get('/api/log')
def list_log(username: str = Depends(current_username)):
    """Every entry, what's been learned, and whether learning is on at all."""
    return ok(entries=_entries(username), insights=_insights(username),
              learning=planner.able())


@router.get('/api/log/insights')
def list_insights(username: str = Depends(current_username)):
    """Just what's been learned, and which entries are still waiting to be
    read. What the review panel polls after a save."""
    waiting = [row['id'] for row in db.rows_for('log_entries', username)
               if row.get('learn_state') == 'waiting']
    return ok(insights=_insights(username), waiting=waiting, learning=planner.able())


@router.post('/api/log/save')
def save_entry(body: SaveEntry, username: str = Depends(current_username)):
    """Create an entry or replace an existing one's title and text."""
    title = body.title.strip()[:journal.TITLE_MAX]
    text = body.body[:journal.BODY_MAX]
    mood = _scale(body.mood, 5)
    energy = _scale(body.energy, 3)
    checkin = {key: value for key, value in (('mood', mood), ('energy', energy)) if value != 'leave'}
    # A check-in alone is an entry: tapping how the day went is worth keeping
    # on a day with nothing to write.
    if not title and not text.strip() and not any(checkin.values()):
        return fail('Write something first.')

    stamp = journal.now()
    if body.id:
        row = db.find_row('log_entries', body.id, user_id=username)
        if not row:
            return fail("That entry doesn't exist.")
        changed = row.get('title') != title or row.get('body') != text
        if changed:
            fields = {'title': title, 'body': text, 'updated_at': stamp,
                      'learn_state': 'waiting'}
            db.update_row('log_entries', row['id'], fields, user_id=username)
            row.update(fields)
        # The check-in is the reader's own answer, not writing to learn from,
        # so changing it alone doesn't send the entry to be read again.
        moved = {key: value for key, value in checkin.items() if row.get(key) != value}
        if moved:
            db.update_row('log_entries', row['id'], {**moved, 'updated_at': stamp}, user_id=username)
            row.update(moved)
    else:
        changed = bool(title or text.strip())
        row = db.insert_row('log_entries', {
            'id': db.new_id('log_entries'), 'user_id': username, 'title': title,
            'body': text, 'learn_state': 'waiting' if changed else 'done',
            'created_at': stamp, 'updated_at': stamp, **checkin,
        })

    # Read it later, or now on a Save press. An unchanged entry that was
    # already read isn't read again.
    if changed or (body.final and row.get('learn_state') != 'done'):
        journal.schedule(username, row['id'],
                         FINAL_DELAY if body.final else journal.QUIET_SECONDS)
    # And any other entry a restart left waiting.
    journal.recover(username)
    return ok(entry=row)


@router.post('/api/log/resume')
def resume_reading(username: str = Depends(current_username)):
    """Queue again any entry left 'waiting' by a restart. The page calls this
    when it loads and sees one, since a GET never starts work."""
    return ok(resumed=journal.recover(username))


@router.post('/api/log/delete')
def delete_entry(body: EntryId, username: str = Depends(current_username)):
    """Delete an entry and every insight that came only from it."""
    if not body.id or not db.find_row('log_entries', body.id, user_id=username):
        return fail("That entry doesn't exist.")
    journal.cancel(username, body.id)
    with journal._user_lock(username):
        removed = journal.forget_entry(username, body.id)
        db.delete_row('log_entries', body.id, user_id=username)
    return ok(id=body.id, removed=removed)


@router.post('/api/log/insights/remove')
def remove_insight(body: EntryId, username: str = Depends(current_username)):
    """Take one insight out. It stops being shown or used straight away, and
    is kept only as a note not to learn it again."""
    row = db.find_row('log_insights', body.id, user_id=username) if body.id else None
    if not row or row.get('status') == 'removed':
        return fail("That's already gone.")
    with journal._user_lock(username):
        db.update_row('log_insights', row['id'],
                      {'status': 'removed', 'updated_at': journal.now()}, user_id=username)
    return ok(id=row['id'])
