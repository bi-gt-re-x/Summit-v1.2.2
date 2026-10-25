"""Topics: the account's finished tasks filed by topic, and each goal's plan.

Two calls on one path. The GET reads the stored library and says whether it's
out of date (tests/test_get_requests_do_not_write.py: it never writes). The
POST rebuilds it from the tasks and goals and answers with the same shape, so
the page shows whichever it has and asks for a rebuild when `stale` is true.
The filing, the scoring and the plans are all in backend/tracking/topics.py.
"""
from datetime import datetime

from fastapi import APIRouter, Depends

from backend.api.guard import current_username
from backend.api.reply import ok
from backend.database import connection as db
from backend.tracking import topics as topic_tracking

router = APIRouter(tags=['topics'])


@router.get('/api/topics')
def read_topics(subject: str = '', username: str = Depends(current_username)):
    """The stored library for one subject (every subject when empty), a plan
    for each active goal, and whether the tasks have moved on since it was
    built."""
    rows, built_from = db.topic_library_for(username)
    _tasks, goals, _matches = db.topic_inputs(username, with_tasks=False)
    now = topic_tracking.fingerprint(db.topic_facts(username))
    return ok(**topic_tracking.payload(rows, goals, subject=subject.strip(),
                                       stale=built_from != now, built=bool(built_from)))


@router.post('/api/topics')
def build_topics(subject: str = '', username: str = Depends(current_username)):
    """File every finished task again, store the library, and answer as the
    GET does."""
    tasks, goals, matches = db.topic_inputs(username)
    rows = topic_tracking.library(tasks, goals, matches)
    stamp = datetime.now().isoformat(timespec='seconds')
    db.save_topic_library(username, rows, topic_tracking.fingerprint(db.topic_facts(username)), stamp)
    return ok(**topic_tracking.payload(rows, goals, subject=subject.strip()))
