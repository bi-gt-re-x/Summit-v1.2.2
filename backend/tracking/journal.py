"""What Summit learns from the Log page, and how it's used.

The Log is a private journal (backend/api/journal.py). After an entry is
saved, a model reads it in the background and turns it into a few short
insights about the person: their goals, interests, priorities, motivation,
recurring challenges, preferences and how they work. Each one carries a kind:

  * **goal**: something they want long term.
  * **pattern**: something that keeps happening.
  * **preference**: how they like to work or learn.
  * **feeling**: how they felt then. It fades after `FEELING_DAYS` and is never
    used as a fact about them, only as "lately they've felt".

A later entry can revise an insight (`update`), back one up (`confirm`) or say
it stopped being true (`retire`). The model sees the active insights with
their ids to do that, and the ones the person removed so it doesn't learn them
again.

## What it never does

It never infers health, sexuality, gender identity, religion, politics,
ethnicity or anything like them. The prompt says so, and `sensitive` drops any
line that slips through anyway, whatever the model wrote.

## Failing

A failed model call leaves the insights exactly as they were and marks the
entry 'failed'. The entry itself is saved before any of this runs, so a model
being down can never lose writing.

## When it runs

Autosaves fire while someone types, and reading every one would spend a free
Groq allowance in minutes. So `schedule` waits `QUIET_SECONDS` after a save
and is reset by the next one; pressing Save reads straight away. Jobs for one
account run one at a time (`_user_lock`), so two entries read together can't
both rewrite the same insight.
"""
import json
import re
import threading
from datetime import date, datetime, timedelta
from typing import Dict, Iterable, List, Optional

from backend.config.shared import RULES
from backend.database import connection as db
from backend.tracking import planner
from backend.tracking.plainwords import STYLE, plain

RULE = RULES['log']
TITLE_MAX = RULE['title_max']
BODY_MAX = RULE['body_max']
FEELING_DAYS = RULE['feeling_days']
QUIET_SECONDS = RULE['quiet_seconds']
INSIGHTS_MAX = RULE['insights_max']
KINDS = tuple(entry['key'] for entry in RULE['kinds'])
KIND_LABELS = {entry['key']: entry['label'] for entry in RULE['kinds']}
TOPICS = tuple(entry['key'] for entry in RULE['topics'])

#: The longest one insight may be. A line, not a paragraph.
TEXT_MAX = 160

#: How much of an entry goes to the model. Entries can be long; the brief and
#: the answer still have to fit a free Groq allowance.
READ_CHARS = 6000

#: New insights one entry may add.
ADDS_MAX = 6

#: Lines handed to other prompts. Goals and patterns first.
BRIEF_MAX = 12


# ---------------------------------------------------------------------------
# Sensitive things, never kept
# ---------------------------------------------------------------------------
#: Word stems that mark a line as about health, sexuality, gender identity,
#: religion, politics or ethnicity. Matched at the start of a word, so
#: "religious" and "therapist" are caught and "pray" doesn't catch "spray".
SENSITIVE = re.compile(
    r"\b("
    # Health, body and mind
    r"diagnos|adhd|autis|depress|disorder|therap|medica|medicine|illness|"
    r"disease|sick|injur|surgery|hospital|doctor|pregnan|eating disorder|"
    r"anorex|bulimi|self[- ]harm|suicid|panic attack|ocd|bipolar|dyslex|"
    r"mental health|psychiatr|weight loss|diet\b|"
    # Sexuality, gender identity and romance
    r"gay|lesbian|bisexual|queer|transgender|nonbinary|non-binary|sexual|"
    r"sexuality|gender|dating|boyfriend|girlfriend|crush|"
    # Religion
    r"relig|church|mosque|synagogue|temple|pray|prayer|god\b|bible|quran|"
    r"torah|faith|christian|muslim|islam|jewish|hindu|buddhis|atheis|"
    # Politics
    r"politic|democrat|republican|liberal|conservative|election|vot(e|ing)\b|"
    # Ethnicity, race and immigration
    r"ethnic|racial|race\b|immigra|citizenship|visa\b"
    r")", re.IGNORECASE)


def sensitive(text: str) -> bool:
    """Whether a line touches something Summit must never keep about anyone."""
    return bool(SENSITIVE.search(text or ''))


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def now() -> str:
    return datetime.now().isoformat(timespec='seconds')


def _day(stamp: Optional[str]) -> str:
    return (stamp or '')[:10]


def sources_of(row: dict) -> List[str]:
    return [part for part in str(row.get('sources') or '').split(',') if part]


def _join(ids: Iterable[str]) -> str:
    seen: List[str] = []
    for one in ids:
        if one and one not in seen:
            seen.append(one)
    return ','.join(seen)


def expires_for(kind: str, entry_day: str) -> Optional[str]:
    """When a passing feeling stops counting. None for every other kind."""
    if kind != 'feeling':
        return None
    try:
        start = date.fromisoformat(entry_day)
    except ValueError:
        start = date.today()
    return (start + timedelta(days=FEELING_DAYS)).isoformat()


def live(row: dict, today: Optional[str] = None) -> bool:
    """Active and, for a feeling, not faded yet."""
    if row.get('status') != 'active':
        return False
    ends = row.get('expires_at')
    return not ends or ends >= (today or date.today().isoformat())


def faded(row: dict, today: Optional[str] = None) -> bool:
    ends = row.get('expires_at')
    return bool(ends) and ends < (today or date.today().isoformat())


def shown(rows: Iterable[dict], today: Optional[str] = None) -> List[dict]:
    """What the Log page lists: active and retired, faded feelings left out,
    removed ones never. Newest first."""
    out = [row for row in rows
           if row.get('status') in ('active', 'retired') and not faded(row, today)]
    out.sort(key=lambda row: row.get('updated_at') or '', reverse=True)
    return out


# ---------------------------------------------------------------------------
# For other prompts
# ---------------------------------------------------------------------------
ORDER = {'goal': 0, 'pattern': 1, 'preference': 2, 'feeling': 3}


def lines_from(rows: Iterable[dict], today: Optional[str] = None,
               limit: int = BRIEF_MAX) -> List[str]:
    """Active insights as lines a model reads. A feeling is marked as passing,
    so no prompt treats it as a fact."""
    using = [row for row in rows if live(row, today) and row.get('text')]
    using.sort(key=lambda row: (ORDER.get(row.get('kind'), 9),
                                [-ord(c) for c in (row.get('updated_at') or '')]))
    out = []
    for row in using[:limit]:
        if row.get('kind') == 'feeling':
            out.append('Felt lately (passing, may have changed): {}'.format(row['text']))
        else:
            out.append('{}: {}'.format(KIND_LABELS.get(row.get('kind'), 'About them'), row['text']))
    return out


def brief_lines(username: str, limit: int = BRIEF_MAX) -> List[str]:
    """What this account's Log has taught Summit, for a student-facing prompt.
    Empty when there's nothing, so callers can add it unconditionally."""
    if not username:
        return []
    try:
        return lines_from(db.rows_for('log_insights', username), limit=limit)
    except Exception:  # noqa: BLE001 - a prompt without the log is still a prompt
        return []


#: The heading other prompts put over `brief_lines`.
BRIEF_HEADING = planner.ABOUT_HEADING


# ---------------------------------------------------------------------------
# The prompt
# ---------------------------------------------------------------------------
SYSTEM = """\
You read one private journal entry a student wrote in a study app, and keep a \
short list of what's worth knowing about them so the app can give better \
advice.

Pull out only things that would change advice about their studying and \
activities: goals, interests, priorities, what motivates them, challenges \
that keep coming up, how they like to work, and what they notice about how \
they work.

Each insight has:
- "kind": "goal" (something they want long term), "pattern" (something that \
keeps happening; use it only when the entry says it keeps happening, or an \
existing insight shows it happened before), "preference" (how they like to \
work or learn), or "feeling" (how they felt around this entry; it fades).
- "topic": one of goals, interests, priorities, motivation, challenges, \
preferences, reflections.
- "text": one short line about them with no subject, under 20 words, like \
"Wants to qualify for AIME by 9th grade" or "Makes careless mistakes under \
time pressure". Keep their own numbers and names. Never add numbers they \
didn't write.

A bad day is a feeling, not a pattern. Never turn one entry's mood into a \
lasting fact about them.

You also get the insights already kept, each with an id. Use them:
- "update": an existing insight this entry changes or sharpens (for example \
a feeling that has now come up again becomes a pattern). Give its id and the \
new kind, topic and text.
- "confirm": ids of existing insights this entry backs up as they are.
- "retire": ids of existing insights this entry says are no longer true. Only \
when the entry is newer than the insight and clearly says so.
- "add": new insights. Don't repeat one that's already kept, and never add \
back anything on the removed list.

NEVER keep or infer anything about health (physical or mental), body, \
sexuality, gender identity, relationships, religion, politics, ethnicity, \
nationality or immigration status, even if the entry mentions it. Leave \
other people's private details out too. Don't guess at things the entry \
doesn't say.

If the entry has nothing worth keeping, return empty lists. Most entries add \
zero to three insights.
"""
SYSTEM += STYLE

_KIND = {'type': 'string', 'enum': list(KINDS)}
_TOPIC = {'type': 'string', 'enum': list(TOPICS)}
SCHEMA = {
    'type': 'object',
    'properties': {
        'add': {'type': 'array', 'items': {
            'type': 'object',
            'properties': {'kind': _KIND, 'topic': _TOPIC, 'text': {'type': 'string'}},
            'required': ['kind', 'topic', 'text'],
            'additionalProperties': False,
        }},
        'update': {'type': 'array', 'items': {
            'type': 'object',
            'properties': {'id': {'type': 'string'}, 'kind': _KIND, 'topic': _TOPIC,
                           'text': {'type': 'string'}},
            'required': ['id', 'kind', 'topic', 'text'],
            'additionalProperties': False,
        }},
        'confirm': {'type': 'array', 'items': {'type': 'string'}},
        'retire': {'type': 'array', 'items': {'type': 'string'}},
    },
    'required': ['add', 'update', 'confirm', 'retire'],
    'additionalProperties': False,
}


def brief(entry: dict, existing: List[dict], removed: List[dict], today: str) -> str:
    """The user turn: today's date, the entry, what's kept and what's removed."""
    lines = ['Today: {}'.format(today),
             'Entry written: {}'.format(_day(entry.get('created_at')) or today)]
    title = (entry.get('title') or '').strip()
    if title:
        lines.append('Title: {}'.format(title))
    lines.append('')
    lines.append('THE ENTRY')
    lines.append((entry.get('body') or '').strip()[:READ_CHARS] or '(empty)')
    lines.append('')
    lines.append('INSIGHTS ALREADY KEPT')
    if existing:
        for row in existing:
            lines.append('- id {} | {} | {} | last seen {} | {}'.format(
                row['id'], row.get('kind'), row.get('topic'),
                _day(row.get('updated_at')), row.get('text')))
    else:
        lines.append('(none yet)')
    if removed:
        lines.append('')
        lines.append('REMOVED BY THEM (never add these back)')
        for row in removed[:30]:
            lines.append('- {}'.format(row.get('text')))
    return '\n'.join(lines)


# ---------------------------------------------------------------------------
# Reading the answer
# ---------------------------------------------------------------------------
def _object(text: str) -> dict:
    span = planner._json_span(text)
    found = json.loads(span)
    if not isinstance(found, dict):
        raise ValueError('not an object')
    return found


def _line(value) -> str:
    text = re.sub(r'\s+', ' ', str(value or '')).strip().strip('"').strip()
    text = text.rstrip('.')
    return text[:TEXT_MAX]


def _norm(text: str) -> str:
    return re.sub(r'[^a-z0-9 ]', '', (text or '').lower()).strip()


def parse(text: str, known_ids: Iterable[str]) -> Dict[str, list]:
    """The model's answer, checked. Unknown kinds, topics and ids are dropped,
    and so is any line that touches something sensitive."""
    found = plain(_object(text))
    known = {str(one) for one in known_ids}

    def good(item) -> Optional[dict]:
        if not isinstance(item, dict):
            return None
        kind = str(item.get('kind') or '').strip().lower()
        topic = str(item.get('topic') or '').strip().lower()
        line = _line(item.get('text'))
        if kind not in KINDS or not line or sensitive(line):
            return None
        if topic not in TOPICS:
            topic = 'reflections'
        return {'kind': kind, 'topic': topic, 'text': line}

    adds = []
    for item in found.get('add') or []:
        clean = good(item)
        if clean and len(adds) < ADDS_MAX:
            adds.append(clean)
    updates = []
    for item in found.get('update') or []:
        clean = good(item)
        if clean and isinstance(item, dict) and str(item.get('id')) in known:
            updates.append({'id': str(item['id']), **clean})
    confirm = [str(one) for one in (found.get('confirm') or []) if str(one) in known]
    retire = [str(one) for one in (found.get('retire') or []) if str(one) in known]
    return {'add': adds, 'update': updates, 'confirm': confirm, 'retire': retire}


# ---------------------------------------------------------------------------
# Learning from one entry
# ---------------------------------------------------------------------------
_locks: Dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _user_lock(username: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(username, threading.Lock())


def _set_state(username: str, entry_id: str, state: str) -> None:
    changes = {'learn_state': state}
    if state == 'done':
        changes['learned_at'] = now()
    db.update_row('log_entries', entry_id, changes, user_id=username)


def learn(username: str, entry_id: str) -> str:
    """Read one entry and update what's known. Returns the entry's new state:
    'done', 'failed', 'off' (no model configured), 'stale' (edited while it
    was being read; the newer save reads it again) or 'gone'."""
    with _user_lock(username):
        return _learn(username, entry_id)


def _learn(username: str, entry_id: str) -> str:
    entry = db.find_row('log_entries', entry_id, user_id=username)
    if not entry:
        return 'gone'
    if not planner.able():
        _set_state(username, entry_id, 'off')
        return 'off'

    today = date.today().isoformat()
    rows = db.rows_for('log_insights', username)
    removed = [row for row in rows if row.get('status') == 'removed']
    # Insights that came only from this entry are what the last reading of it
    # found. They're read again from the current text rather than shown as
    # "already kept", so an edit that takes a sentence out takes its insight
    # out too.
    own = [row for row in rows if row.get('status') != 'removed'
           and sources_of(row) == [entry_id]]
    own_ids = {row['id'] for row in own}
    existing = [row for row in rows if live(row, today) and row['id'] not in own_ids]

    seen_at = entry.get('updated_at')
    try:
        text = planner.from_provider(
            brief(entry, existing, removed, today), system=SYSTEM, schema=SCHEMA,
            instruction='Update what Summit knows about this student from this entry.',
            max_tokens=3000)
        ops = parse(text, [row['id'] for row in existing])
    except Exception as exc:  # noqa: BLE001 - any failure leaves things as they were
        print('[journal] reading entry {} failed: {!r}'.format(entry_id, exc))
        _set_state(username, entry_id, 'failed')
        return 'failed'

    fresh = db.find_row('log_entries', entry_id, user_id=username)
    if not fresh:
        return 'gone'
    if fresh.get('updated_at') != seen_at:
        return 'stale'

    apply(username, entry, ops, rows, own_ids, today)
    _set_state(username, entry_id, 'done')
    return 'done'


def apply(username: str, entry: dict, ops: Dict[str, list], rows: List[dict],
          own_ids: set, today: str) -> None:
    """Write one reading's changes."""
    entry_id = entry['id']
    entry_day = _day(entry.get('created_at')) or today
    stamp = now()
    by_id = {row['id']: row for row in rows}

    # This entry's old reading goes; its id comes off everything else, and
    # goes back on whatever this reading confirms or updates.
    for row_id in own_ids:
        db.delete_row('log_insights', row_id, user_id=username)
        by_id.pop(row_id, None)
    for row in list(by_id.values()):
        if row.get('status') == 'removed':
            continue
        ids = sources_of(row)
        if entry_id in ids:
            ids = [one for one in ids if one != entry_id]
            row['sources'] = _join(ids)
            if not ids:
                db.delete_row('log_insights', row['id'], user_id=username)
                by_id.pop(row['id'], None)
            else:
                db.update_row('log_insights', row['id'], {'sources': row['sources']},
                              user_id=username)

    touched = set()
    for item in ops['update']:
        row = by_id.get(item['id'])
        if not row or item['id'] in touched:
            continue
        touched.add(item['id'])
        changes = {
            'kind': item['kind'], 'topic': item['topic'], 'text': item['text'],
            'sources': _join(sources_of(row) + [entry_id]), 'status': 'active',
            'expires_at': expires_for(item['kind'], entry_day), 'updated_at': stamp,
        }
        db.update_row('log_insights', row['id'], changes, user_id=username)
        row.update(changes)
    for row_id in ops['confirm']:
        row = by_id.get(row_id)
        if not row or row_id in touched:
            continue
        touched.add(row_id)
        changes = {'sources': _join(sources_of(row) + [entry_id]), 'updated_at': stamp}
        if row.get('kind') == 'feeling':
            changes['expires_at'] = max(row.get('expires_at') or '',
                                        expires_for('feeling', entry_day) or '')
        db.update_row('log_insights', row_id, changes, user_id=username)
        row.update(changes)
    for row_id in ops['retire']:
        row = by_id.get(row_id)
        if not row or row_id in touched:
            continue
        db.update_row('log_insights', row_id, {'status': 'retired', 'updated_at': stamp},
                      user_id=username)
        row['status'] = 'retired'

    taken = {_norm(row.get('text')) for row in by_id.values()
             if row.get('status') in ('active', 'removed')}
    active = sum(1 for row in by_id.values() if row.get('status') == 'active')
    adding = []
    for item in ops['add']:
        key = _norm(item['text'])
        ends = expires_for(item['kind'], entry_day)
        if not key or key in taken or (ends and ends < today):
            continue
        if active + len(adding) >= INSIGHTS_MAX:
            break
        taken.add(key)
        adding.append({**item, 'expires_at': ends})
    if adding:
        ids = db.new_ids('log_insights', len(adding))
        db.insert_rows('log_insights', [
            {'id': str(new_id), 'user_id': username, 'kind': item['kind'],
             'topic': item['topic'], 'text': item['text'], 'sources': entry_id,
             'status': 'active', 'expires_at': item['expires_at'],
             'created_at': stamp, 'updated_at': stamp}
            for new_id, item in zip(ids, adding)])

    # Faded feelings go now, on a write: a GET never cleans up.
    for row in list(by_id.values()):
        if row.get('kind') == 'feeling' and faded(row, today) and row.get('status') != 'removed':
            db.delete_row('log_insights', row['id'], user_id=username)


def forget_entry(username: str, entry_id: str) -> int:
    """An entry is being deleted: drop every insight it was the only source of
    (removed ones too) and take its id off the rest. Returns how many of the
    ones the page shows went with it."""
    gone = 0
    today = date.today().isoformat()
    for row in db.rows_for('log_insights', username):
        ids = sources_of(row)
        if entry_id not in ids:
            continue
        rest = [one for one in ids if one != entry_id]
        if rest:
            db.update_row('log_insights', row['id'], {'sources': _join(rest)}, user_id=username)
            continue
        if row.get('status') in ('active', 'retired') and not faded(row, today):
            gone += 1
        db.delete_row('log_insights', row['id'], user_id=username)
    return gone


# ---------------------------------------------------------------------------
# Scheduling
# ---------------------------------------------------------------------------
_timers: Dict[tuple, threading.Timer] = {}
_timers_guard = threading.Lock()


def _run(key: tuple) -> None:
    with _timers_guard:
        _timers.pop(key, None)
    try:
        learn(*key)
    except Exception as exc:  # noqa: BLE001 - a background job must not crash its thread
        print('[journal] background read {!r} failed: {!r}'.format(key, exc))


def schedule(username: str, entry_id: str, delay: float) -> None:
    """Read this entry after `delay` seconds, replacing any read already
    waiting for it."""
    key = (username, entry_id)
    with _timers_guard:
        old = _timers.pop(key, None)
        if old:
            old.cancel()
        timer = threading.Timer(max(0.0, delay), _run, args=(key,))
        timer.daemon = True
        _timers[key] = timer
        timer.start()


def cancel(username: str, entry_id: str) -> None:
    with _timers_guard:
        old = _timers.pop((username, entry_id), None)
    if old:
        old.cancel()


def run_waiting() -> None:
    """Run every waiting read now, on this thread. For tests."""
    with _timers_guard:
        keys = list(_timers)
        for key in keys:
            _timers.pop(key).cancel()
    for key in keys:
        learn(*key)


def cancel_all() -> None:
    """Drop every waiting read. The test suite calls this between databases."""
    with _timers_guard:
        for timer in _timers.values():
            timer.cancel()
        _timers.clear()
