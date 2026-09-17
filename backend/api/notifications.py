"""The bell: what the app has to say, and everything the reader can do about it.

Four endpoints and one rule. The rule is that this module decides *nothing*
about what a notification says — that is backend/tracking/notify.py, which
holds the wording and the thresholds — and decides everything about who is
allowed to see and remove one, which is the part that has to be answered per
request.

    GET    /api/notifications          sweep, then the account's live list
    POST   /api/notifications/mark     stamp some as shown, or all as read
    DELETE /api/notifications/{id}     throw one away
    DELETE /api/notifications          throw all of them away

## The read is also the write

There is no job runner in this app, so the list is brought up to date by the
request that asks for it. That is the same trade `/api/stats` already makes
with the streak decay (backend/api/dashboard.py): the alternative is a
scheduler this app does not have, and stale rows about a state that has since
moved.

It is safe to call from every tab because the sweep inserts on a fingerprint
and ignores collisions — see data/sql/notifications.sql. Two tabs polling
together write the same row once.

## The switches are applied here and in the sweep, and that is not a duplicate

The channels the account has turned on are read once and used twice: they are
what the sweep is allowed to write, and they are what the read is filtered by.
Both are needed. The first is what stops a channel that is off from quietly
accumulating rows for the day somebody turns it back on; the second is what
hides the rows a channel wrote before it was turned off, which the sweep can no
longer reach.

## Deleting is the feature

`DELETE` is soft, and the tombstone it leaves is load-bearing rather than
squeamish — the situation a notification describes is usually still true, so a
hard delete would let the very next poll write it straight back. See
data/sql/notifications.sql. What the reader gets, and what they asked for, is a
bell that goes quiet and stays quiet until something genuinely new happens.
"""
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api import achievements
from backend.api.guard import current_user
from backend.api.reply import fail, ok
from backend.api.settings import FIELDS
from backend.database import connection as db
from backend.tracking import notify

router = APIRouter(tags=['notifications'])


class MarkNotifications(BaseModel):
    """What to stamp. `shown` are ids; `read` is all of them at once.

    Two different questions, which is why they are two fields rather than one
    list and a mode. `shown` is per row because the client only shows the ones
    it actually drew on screen; `read` is the whole list because the reader
    opened the bell, and opening it is one act.
    """
    shown: Optional[List[str]] = None
    read: bool = False


def _iso_day(value):
    """A caller-supplied `YYYY-MM-DD`, or the server's day if it is not one.

    Validated rather than trusted for the reason `/api/alerts` gives: it goes
    into a date comparison, and a caller sending nonsense should get today's
    notifications rather than an empty bell that looks like good news.
    """
    try:
        return date.fromisoformat((value or '').strip()[:10]).isoformat()
    except ValueError:
        return date.today().isoformat()


def _flag(username, key):
    """One boolean preference, read straight from `user_settings`.

    Against the defaults declared in backend/api/settings.py rather than
    through `/api/settings`, so this stays one small read and cannot disagree
    with that page about what a missing key means. A key that was never written
    is a real state and takes the declared default — and SQLite has no boolean,
    so a stored False comes back as '0', which is truthy anywhere it is not
    coerced. `_keyed` in that module coerces it for the same reason.
    """
    stored = db.user_setting(username, key)
    if stored is None:
        return bool(FIELDS[key][0])
    return str(stored).lower() not in ('0', 'false', '')


def _switches(username):
    """(on, popups, channels) — the master switch, the on-screen half, and
    the channels whose switch is on."""
    return (_flag(username, 'notifications_enabled'),
            _flag(username, 'notify_popups'),
            tuple(c for c in notify.CHANNELS
                  if _flag(username, 'notify_' + c)))


@router.get('/api/notifications')
def list_notifications(day: str = '', at: str = '',
                       user=Depends(current_user)):
    """The account's live notifications, newest first, swept first.

    `day` and `at` are the reader's own clock — the local ISO day and 'HH:MM'.
    Both are parameters rather than something computed here because stored
    stamps carry no timezone (backend/tracking/xp.py): the server's idea of
    today is only right for readers who happen to share its clock, and "your
    next calendar block" is meaningless without the second one.

    `popups` comes back with the list because the client needs both to decide
    anything: a notification it has not shown yet is only put on screen if the
    account still wants the on-screen half. Sending it here saves the panel a
    second request and keeps the two answers from arriving out of step.
    """
    username = user['username']
    enabled, popups, channels = _switches(username)

    if not enabled:
        # Nothing swept and nothing read. The rows already written are left
        # exactly where they are — turning notifications off is not a delete,
        # and turning them back on should not have lost anything.
        return ok(notifications=[], popups=False, enabled=False)

    # Badges before the sweep, and the order is the whole point.
    #
    # `notification_facts` reads what this account has earned out of
    # `user_achievements`, and until now the only thing that ever wrote to that
    # table was somebody opening the Achievements page. So the bell could
    # announce a badge, but only after the wall had already told the reader —
    # which is not a notification, it is an echo.
    #
    # Working the badges out here closes that. It has to happen before the
    # sweep or a row written now would not be in the facts it reads, and the
    # badge would wait for the next poll a minute on.
    #
    # Here rather than inside `notify.sweep` because tracking modules do not
    # import from api — the sweep is the rules, and this is the endpoint
    # arranging what the rules get to see. Gated on the same 'progress' switch
    # the resulting notification is filed under: a reader who turned that off
    # is not asking for the work to be done silently. It is guarded and
    # normally free; see `check_earned` in backend/api/achievements.py for what
    # it costs when it is not.
    if 'progress' in channels:
        achievements.check_earned(username, user)

    notify.sweep(user, _iso_day(day), at, channels)
    return ok(notifications=db.notifications_for(username, channels),
              popups=popups,
              enabled=True)


@router.post('/api/notifications/mark')
def mark_notifications(body: MarkNotifications, user=Depends(current_user)):
    """Stamp notifications as shown on screen, or the whole list as read.

    Separate from the delete on purpose. Reading a notification and being
    finished with it are different things, and collapsing them would mean the
    bell emptied itself the moment it was opened — which is the behaviour that
    makes people stop opening it.
    """
    username = user['username']
    shown = db.mark_notifications(username, body.shown or [], 'shown_at')

    read = 0
    if body.read:
        live = [row['id'] for row in db.notifications_for(username)]
        read = db.mark_notifications(username, live, 'read_at')

    return ok(shown=shown, read=read)


@router.delete('/api/notifications/{notification_id}')
def delete_notification(notification_id: str, user=Depends(current_user)):
    """Throw one away, for good — see the note at the top on why that sticks."""
    removed = db.delete_notifications(user['username'], [notification_id])
    if not removed:
        return fail('That notification is already gone.')
    return ok(removed=removed)


@router.delete('/api/notifications')
def clear_notifications(user=Depends(current_user)):
    """Throw all of them away. The panel's one destructive button.

    It does not ask first, and that is deliberate: nothing here is data the
    account made, every one of these will be raised again the next time its
    situation is genuinely new, and a confirm dialog in front of a bell is how
    you teach somebody to stop clearing it.
    """
    return ok(removed=db.delete_notifications(user['username']))
