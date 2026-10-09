"""Subjects — the catalogue, plus whatever this account has made of it.

The catalogue itself is a fixed hundred entries in backend/config/subjects.py.
This module is what makes it useful to a picker, and it does three things to
it before handing it over.

**It orders it by use.** The subjects this account files the most tasks under
move to the front, so someone who tags everything "Mathematics" and "Gym" is
offered those two first instead of scrolling to them every time. The count
comes from the user's own tasks, which is the only record of the choice —
there is no separate "favourites" table to keep in step, and there is nothing
to migrate if the catalogue is edited later. A subject retired from the
catalogue simply stops being counted, because the ordering walks the catalogue
rather than the tasks. Ties keep catalogue order, and catalogue order is
deliberate: the groups run from study through work to home, which is a
sensible first offer to an account that has never picked a subject at all.

**It puts the account's own subjects at the front of that.** Ahead of the
hundred, not sorted into them, and ahead of them however little they have been
used. Somebody who went and made a subject did so because the hundred did not
have the one they wanted; burying it at position forty because it is new would
undo the making of it.

**It applies the account's colours.** A `family` on a row here overrides the
palette's own answer for that subject — see frontend/src/utils/eventPalette.ts
for the twelve families and what they mean by default.

Storage for the last two is data/sql/subjects.sql. The catalogue is code and
is not in the database.
"""
import re
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.config import subjects as catalogue
from backend.database import connection as db

router = APIRouter(tags=['subjects'])

# The twelve in frontend/src/utils/eventPalette.ts. Repeated rather than
# imported because there is nothing to import from — the palette is the
# frontend's. A name not in this list is refused, so a typo cannot reach a
# calendar block as an unknown family and paint it as nothing at all.
FAMILIES = (
    'blue', 'indigo', 'purple', 'teal', 'green', 'cyan',
    'yellow', 'orange', 'red', 'rose', 'brown', 'gray',
)

# What a custom subject's id looks like. The prefix is what keeps the two id
# spaces apart: no catalogue id can begin with it, so `_own` below can tell a
# made-up subject from one of the hundred without consulting either list.
CUSTOM_PREFIX = 'own_'

MAX_NAME = 40

# Enough for a picker to stay a picker. The catalogue is a hundred and the row
# is meant to be scanned; an account with two hundred of its own has built a
# different feature and should be told so rather than silently allowed.
MAX_CUSTOM = 40


class NewSubject(BaseModel):
    name: str = ''
    family: Optional[str] = None


class Recolour(BaseModel):
    # None clears the choice and hands the subject back to the palette.
    family: Optional[str] = None


def _slug(name):
    """"Data Science Team" as "own_data_science_team"."""
    body = re.sub(r'[^a-z0-9]+', '_', str(name).strip().lower()).strip('_')
    return CUSTOM_PREFIX + body if body else ''


def _rows(username):
    """This account's rows, keyed by subject id."""
    if not username:
        return {}
    return {
        row['subject_id']: row
        for row in db.user_subjects()
        if row.get('user_id') == username
    }


def usage(username: Optional[str]):
    """{subject_id: how many of this user's tasks carry it}."""
    if not username:
        return {}
    return db.subject_usage(username)


def _custom_entry(row, used):
    """One of the account's own subjects, in the shape the catalogue uses.

    Every field the hundred have, so nothing downstream has to ask which kind
    of subject it is holding. `icon` is the one that cannot be guessed well —
    the catalogue's hundred each have a drawing chosen for them, and a name
    nobody has seen before has none — so custom subjects share one mark and
    the colour is what tells them apart. That is also why the library asks for
    a colour when it asks for the name.
    """
    return {
        'id': row['subject_id'],
        'name': row.get('name') or row['subject_id'],
        'abbr': None,
        'label': row.get('name') or row['subject_id'],
        'icon': 'star',
        'group': 'Yours',
        'used': used,
        'family': row.get('family'),
        'custom': True,
    }


def own_ids(username):
    """The custom subject ids this account may file a task under.

    backend/api/tasks.py calls this: a subject id is stored only if something
    recognises it, and until there were custom subjects the catalogue was the
    only thing that could.
    """
    return {
        subject_id for subject_id, row in _rows(username).items()
        if row.get('custom')
    }


@router.get('/api/subjects')
def subjects(username: str = Depends(current_username)):
    """The account's own subjects, then the hundred, most-used first."""
    counts = usage(username)
    rows = _rows(username)

    mine = [
        _custom_entry(row, counts.get(subject_id, 0))
        for subject_id, row in rows.items()
        if row.get('custom')
    ]
    # Newest last, so the list does not reshuffle every time one is added.
    mine.sort(key=lambda entry: rows[entry['id']].get('created_at') or '')

    # `-used` sorts descending; the index keeps ties in catalogue order, which
    # `sorted` would preserve anyway but only because it is stable — saying it
    # here means the ordering does not depend on that.
    ordered = sorted(
        enumerate(catalogue.SUBJECTS),
        key=lambda pair: (-counts.get(pair[1]['id'], 0), pair[0]),
    )

    return ok(subjects=mine + [
        {
            **subject,
            'used': counts.get(subject['id'], 0),
            'family': (rows.get(subject['id']) or {}).get('family'),
            'custom': False,
        }
        for _, subject in ordered
    ])


@router.post('/api/subjects')
def create(body: NewSubject, username: str = Depends(current_username)):
    """Add a subject of this account's own."""

    name = ' '.join(str(body.name or '').split())[:MAX_NAME]
    if not name:
        return fail('A subject needs a name')

    subject_id = _slug(name)
    if not subject_id:
        return fail('That name has no letters or numbers in it')

    if catalogue.get(subject_id):
        return fail('The catalog already has that one')

    family = body.family
    if family is not None and family not in FAMILIES:
        return fail('Unknown color')

    mine = db.rows_for('user_subjects', username)
    if any(r['subject_id'] == subject_id for r in mine):
        return fail('You already have a subject called that')
    if len([r for r in mine if r.get('custom')]) >= MAX_CUSTOM:
        return fail('That is as many subjects as one account can add')

    added = db.insert_row('user_subjects', {
        'user_id': username,
        'subject_id': subject_id,
        'name': name,
        'family': family,
        'custom': True,
    })
    return ok(subject=_custom_entry(added, 0))


@router.patch('/api/subjects/{subject_id}/color')
def recolour(subject_id: str, body: Recolour,
             username: str = Depends(current_username)):
    """Choose a colour for a subject — one of the account's own, or one of the
    hundred. `family: null` gives the subject back to the palette."""

    family = body.family
    if family is not None and family not in FAMILIES:
        return fail('Unknown color')

    known = bool(catalogue.get(subject_id)) or subject_id in own_ids(username)
    if not known:
        return fail('No such subject')

    # This table is keyed on (user_id, subject_id) rather than an `id`, so the
    # row operations are pointed at `subject_id` as the key.
    row = db.find_row('user_subjects', subject_id, user_id=username, key='subject_id')
    if row:
        # Clearing the colour on a catalogue subject leaves a row that says
        # nothing; drop it rather than store "this account has no opinion".
        if family is None and not row.get('custom'):
            db.delete_row('user_subjects', subject_id, user_id=username,
                          key='subject_id')
        else:
            db.update_row('user_subjects', subject_id, {'family': family},
                          user_id=username, key='subject_id')
    else:
        db.insert_row('user_subjects', {
            'user_id': username,
            'subject_id': subject_id,
            'name': '',
            'family': family,
            'custom': False,
        })

    return ok(subject_id=subject_id, family=family)


@router.delete('/api/subjects/{subject_id}')
def remove(subject_id: str, username: str = Depends(current_username)):
    """Delete one of the account's own subjects.

    Tasks already filed under it keep the id. They draw as unfiled — the same
    as a task whose subject was retired from the catalogue — rather than being
    rewritten, because a delete here is about the picker and should not reach
    into the record of work already done.
    """
    if subject_id not in own_ids(username):
        return fail('That is not one of yours to delete')

    db.delete_row('user_subjects', subject_id, user_id=username, key='subject_id')
    return ok(subject_id=subject_id)


# --------------------------------------------------------------------------
# Milestones on a subject
# --------------------------------------------------------------------------
"""Checkpoints a reader sets against a subject, before there is a goal.

## Why these are not goal milestones

A goal's milestones belong to that goal — the table is keyed on `goal_id`, and
deleting the goal takes them with it. That is right for a goal and wrong for
the thing people actually do first, which is know roughly what the stages of a
subject are long before they have decided on a target, a date or a number.
Making them state a goal to record "get comfortable with proofs" is asking for
the hardest part first.

So these hang off the *subject*. They outlive any goal, they need no target and
no date, and they are what `/api/suggest_subject_goal` reads to draft a real
goal — at which point the goal gets its own milestones, seeded from these, and
the two lists go their separate ways. Copied rather than shared on purpose: a
goal is a commitment and its checkpoints should not silently change because
somebody edited a note on a subject page months later.

## One row, not a table

Every account's whole set is small — a handful of subjects with a handful of
lines each — and it is always read all at once by the page that draws it. A
table would buy indexing nothing needs and cost a migration.
"""

#: Where they live in `user_settings`.
MILESTONES_KEY = 'subject_milestones'

#: How many subjects may carry a list, and how long a list may be.
#:
#: Bounds rather than rules about behaviour. The whole set is one JSON value
#: read and rewritten on every save, so an unbounded one is a row that grows
#: until something slow happens; and a subject with forty checkpoints has a
#: plan nobody is going to read, let alone finish.
MILESTONE_SUBJECTS = 40
MILESTONES_PER_SUBJECT = 12
MILESTONE_TITLE_MAX = 120


class SubjectMilestones(BaseModel):
    """One subject's list, replacing whatever it held."""

    subject: str = ''
    #: Titles in the order they are meant to be reached. Ticked ones carry a
    #: trailing marker rather than a second field — see `_clean_milestones`.
    milestones: Optional[list] = None


def _clean_milestones(raw):
    """One subject's list, bounded and made honest.

    Reads defensively for the reason `_clean` in analytics.py does: the value
    is one JSON blob written by one endpoint and read by a page that draws off
    it, so a hand-edited store should cost the reader their list rather than
    the page.
    """
    if not isinstance(raw, list):
        return []
    out = []
    for entry in raw[:MILESTONES_PER_SUBJECT]:
        if not isinstance(entry, dict):
            continue
        title = str(entry.get('title') or '').strip()[:MILESTONE_TITLE_MAX]
        if not title:
            continue
        out.append({
            'id': str(entry.get('id') or '')[:64] or 'm{}'.format(len(out)),
            'title': title,
            'done': bool(entry.get('done')),
        })
    return out


def _all_milestones(username):
    """Every subject's list for this account, cleaned."""
    raw = db.user_setting(username, MILESTONES_KEY)
    if not isinstance(raw, dict):
        return {}
    out = {}
    for subject, rows in list(raw.items())[:MILESTONE_SUBJECTS]:
        cleaned = _clean_milestones(rows)
        if cleaned:
            out[str(subject)[:64]] = cleaned
    return out


@router.get('/api/subject_milestones')
def get_subject_milestones(username: str = Depends(current_username)):
    """Every subject's checkpoints. One read; the page holds the lot."""
    return ok(milestones=_all_milestones(username))


@router.post('/api/subject_milestones')
def set_subject_milestones(body: SubjectMilestones,
                           username: str = Depends(current_username)):
    """Replace one subject's list.

    One subject at a time, and the whole list rather than a diff. The page
    edits a handful of lines in place and saves the result, so a diff protocol
    would be three endpoints and an ordering question to save a few bytes on a
    request nobody makes twice a minute.

    An empty list is a real answer and clears the subject rather than being
    refused — it is how somebody removes their last checkpoint.
    """
    subject = (body.subject or '').strip()[:64]
    if not subject:
        return fail('Which subject?')

    everything = _all_milestones(username)
    cleaned = _clean_milestones(body.milestones or [])
    if cleaned:
        if subject not in everything and len(everything) >= MILESTONE_SUBJECTS:
            return fail('That is as many subjects as can carry checkpoints.')
        everything[subject] = cleaned
    else:
        everything.pop(subject, None)

    db.set_user_setting(username, MILESTONES_KEY, everything)
    return ok(milestones=everything)
