"""About you — the answers from the end of sign-up, and the facts kept from them.

    GET  /api/background   the answers, how detailed they are, and the facts
    POST /api/background   save the answers; the facts are filed again

The rules are backend/tracking/background.py; the tables are
data/sql/background.sql.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api import subjects as user_subjects
from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.config import subjects as subject_catalogue
from backend.database import connection as db
from backend.tracking import background, journal, mood, said_did
from backend.tracking import focus as focus_tracking
from backend.tracking.auth import load_user

router = APIRouter(tags=['background'])

FACT_FIELDS = ('kind', 'text', 'subject', 'value', 'unit', 'question')


class Answers(BaseModel):
    describe: str = ''
    doing: str = ''
    done: str = ''
    improve: str = ''


def subject_names(username):
    """Every subject this account can file under, id to name."""
    names = {entry['id']: entry['name'] for entry in subject_catalogue.SUBJECTS}
    for subject_id, row in user_subjects._rows(username).items():
        if row.get('custom'):
            names[subject_id] = row.get('name') or subject_id
    return names


def saved(username):
    """The account's row, or None before it has answered."""
    return next(iter(db.rows_for('user_background', username)), None)


def facts_for(username):
    """The account's facts, in the order they were written."""
    return [{key: row.get(key) for key in ('id',) + FACT_FIELDS}
            for row in db.rows_for('user_facts', username, order='position, rowid')]


def about_lines(username, subject=None):
    """Everything the account has told Summit, as lines a model reads.

    What it said at sign-up comes first, then what its Log has taught since.
    Every AI brief should read this rather than the Log alone: a new account
    has written nothing in its Log yet, and its sign-up answers were the only
    thing Summit knew about it, which no prompt but the subject page's read.

    `subject` is an id or a name. With one, facts about other subjects are
    left out (backend/tracking/background.py `brief_lines`).
    """
    names = subject_names(username)
    subject_id = None
    wanted = (subject or '').strip().lower()
    if wanted:
        subject_id = next((sid for sid, name in names.items()
                           if sid.lower() == wanted or str(name).lower() == wanted), None)
    return (background.brief_lines(facts_for(username), subject_id, names)
            + journal.brief_lines(username)
            + said_did.brief_lines(said_for(username, names))
            + mood.brief_lines(mood_for(username)))


def mood_for(username):
    """How the days felt against what they did (tracking/mood.py)."""
    entries = mood.entry_rows(db.rows_for('log_entries', username))
    tasks = db.columns_for('tasks', username, ('status', 'completed_at', 'xp_value', 'execution'))
    return mood.readings(entries, tasks, focus_tracking.history_for(username))


def subject_groups() -> dict:
    """Each catalogue subject's group, for telling a topic from a subject."""
    return {entry['id']: entry.get('group') or '' for entry in subject_catalogue.SUBJECTS}


def said_for(username, names=None):
    """What the account said, held against what it did (tracking/said_did.py)."""
    tasks = db.columns_for('tasks', username, ('id', 'title', 'subject', 'status', 'completed_at'))
    insights = journal.shown(db.rows_for('log_insights', username))
    return said_did.readings(tasks, facts_for(username), insights,
                             names or subject_names(username), subject_groups())


def head_start(username):
    """Days of head start the account's answers earn — 0 before it has any."""
    row = saved(username)
    return int(row.get('head_start') or 0) if row else 0


def _reply(username):
    row = saved(username) or {}
    answers = {key: row.get(key) or '' for key in background.QUESTIONS}
    return ok(answers=answers, detail=background.detail(answers),
              facts=facts_for(username), updated_at=row.get('updated_at'))


@router.get('/api/background')
def read_background(username: str = Depends(current_username)):
    _, user = load_user(username)
    if not user:
        return fail('Sign in to see this.')
    return _reply(username)


@router.post('/api/background')
def save_background(body: Answers, username: str = Depends(current_username)):
    """Keep the answers, and file the facts in them again from scratch."""
    _, user = load_user(username)
    if not user:
        return fail('Sign in to save this.')
    answers = background.clean(body.model_dump())
    scored = background.detail(answers)
    now = background.stamp()
    row = {**answers, 'words': scored['words'], 'detail': scored['level'],
           'head_start': scored['head_start'], 'updated_at': now}

    if saved(username):
        db.update_row('user_background', username, row, user_id=username, key='user_id')
    else:
        db.insert_row('user_background', {'user_id': username, **row}, key='user_id')

    for old in db.rows_for('user_facts', username):
        if old.get('source') == 'background':
            db.delete_row('user_facts', old['id'], user_id=username)
    found = background.facts(answers, subject_names(username))
    if found:
        ids = db.new_ids('user_facts', len(found))
        db.insert_rows('user_facts', [
            {'id': str(fact_id), 'user_id': username, 'position': at, 'source': 'background',
             'created_at': now, **{key: fact.get(key) for key in FACT_FIELDS}}
            for at, (fact_id, fact) in enumerate(zip(ids, found))
        ])
    return _reply(username)
