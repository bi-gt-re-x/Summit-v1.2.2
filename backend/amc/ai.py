"""The AI layer: one way for the AMC features to ask a model something.

## Which model

Grok (xAI) whenever a Grok key is set (`XAI_API_KEY`, or `GROK_API_KEY`), so an
install with one gets Grok for every AI feature without also having to set
MILESTONE_PROVIDER. Without one it falls back to whatever
backend/tracking/planner.py would use (Groq with `GROQ_API_KEY`, then
Anthropic). Model names come from `GROK_MODEL` / `GROQ_MODEL` there.

## What every call goes through

* **A fixed shape.** Each feature passes a JSON schema and gets a dict back,
  or `AIUnavailable` with a sentence meant for the page. Nothing here returns
  free text to be scraped.
* **A cache** (table `amc_ai`). The same question is asked once: a hint for a
  problem is shared by every account, an analysis is kept per account per day.
* **A daily limit** per account (`AI_DAILY_LIMIT`, default 80 calls), counted
  from the same table, so a page left refreshing cannot run up a bill.

Everything the AI says on top of the arithmetic is optional: every page works,
with the numbers, when no key is set.
"""
import hashlib
import json
import os
import uuid
from datetime import datetime

from backend.database.connection import connect
from backend.tracking import planner


class AIUnavailable(RuntimeError):
    """A sentence for the page: no key, the limit reached, or a failed call."""


def _limit():
    try:
        return max(1, int(os.environ.get('AI_DAILY_LIMIT') or 80))
    except ValueError:
        return 80


def provider():
    """'grok', 'groq', 'anthropic', or '' when nothing that can hold a schema is set."""
    if planner._grok_token():
        return 'grok'
    using = planner.provider()
    return using if using in planner.SCHEMA_PROVIDERS else ''


def label():
    using = provider()
    if using == 'grok':
        return 'Grok · ' + (os.environ.get('GROK_MODEL') or planner.GROK_MODEL)
    if using == 'groq':
        return 'Groq · ' + (os.environ.get('GROQ_MODEL') or planner.GROQ_MODEL)
    if using == 'anthropic':
        return 'Claude · ' + planner.model()
    return ''


def status(user=''):
    """What the pages show about the AI: on or off, which model, calls left today."""
    using = provider()
    return {
        'available': bool(using), 'provider': using, 'label': label(),
        'used_today': used_today(user) if user else 0, 'limit': _limit(),
        'setup': '' if using else ('Add XAI_API_KEY (Grok) to .env and restart the server to turn on the AI '
                                   'coach, hints and problem writing. GROQ_API_KEY works too.'),
    }


# ---------------------------------------------------------------------------
# Cache and log
# ---------------------------------------------------------------------------
def _today():
    return datetime.now().date().isoformat()


def key_of(*parts):
    return hashlib.sha256(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()[:32]


def cached(kind, cache_key, user=''):
    con = connect()
    try:
        row = con.execute('SELECT payload, provider, at FROM amc_ai WHERE kind = ? AND cache_key = ? AND user_id = ? '
                          'ORDER BY at DESC LIMIT 1', (kind, cache_key, user)).fetchone()
    finally:
        con.close()
    if not row:
        return None
    payload, used, at = tuple(row)
    try:
        return {'data': json.loads(payload), 'provider': used, 'at': at}
    except (TypeError, ValueError):
        return None


def _store(kind, cache_key, user, data, used):
    con = connect()
    try:
        with con:
            con.execute('INSERT INTO amc_ai (id, user_id, kind, cache_key, payload, provider, at) '
                        'VALUES (?, ?, ?, ?, ?, ?, ?)',
                        (uuid.uuid4().hex, user or '', kind, cache_key, json.dumps(data), used,
                         datetime.now().isoformat(timespec='seconds')))
    finally:
        con.close()


def used_today(user):
    """Model calls this account made today (cache hits are free)."""
    con = connect()
    try:
        row = con.execute("SELECT COUNT(*) FROM amc_ai WHERE user_id = ? AND kind = 'call' AND at >= ?",
                          (user, _today())).fetchone()
    finally:
        con.close()
    return int(tuple(row)[0]) if row else 0


# ---------------------------------------------------------------------------
# The call
# ---------------------------------------------------------------------------
def _call(system, brief, schema, instruction, max_tokens):
    """One schema-shaped answer as text. Separate so tests can replace it."""
    using = provider()
    if using == 'grok':
        return planner._from_grok(brief, system, instruction, schema, max_tokens)
    return planner.from_provider(brief, system=system, schema=schema, instruction=instruction,
                                 max_tokens=max_tokens)


def ask(user, system, brief, schema, instruction='', max_tokens=3000):
    """Ask the model; return the parsed dict. Counts against `user`'s day."""
    using = provider()
    if not using:
        raise AIUnavailable(status()['setup'])
    if user and used_today(user) >= _limit():
        raise AIUnavailable('You have used today’s {} AI requests. They reset at midnight.'.format(_limit()))
    try:
        text = _call(system, brief, schema, instruction, max_tokens)
    except planner.PlannerUnavailable as exc:
        raise AIUnavailable(str(exc)) from exc
    _store('call', key_of(instruction, brief[:200]), user or '', {'chars': len(text or '')}, using)
    try:
        return json.loads(planner._json_span(text))
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        raise AIUnavailable('The model’s answer could not be read. Try again.') from exc


def remember(kind, cache_key, user, data):
    _store(kind, cache_key, user, data, provider())


def strings(value, limit=8, length=600):
    """A list of short strings from whatever the model sent."""
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    out = []
    for item in value[:limit]:
        if isinstance(item, (str, int, float)):
            text = str(item).strip()
            if text:
                out.append(text[:length])
    return out


def text(value, length=1500):
    return str(value).strip()[:length] if isinstance(value, (str, int, float)) else ''

#: The voice every feature shares.
VOICE = """\
Write plainly, like a good teacher talking to one student. Short sentences,
everyday words, "you" for the student. No em dashes, no hype, no filler like
"unlock", "master", "journey", "level up" or "dive into". Math goes in $...$
LaTeX (KaTeX), e.g. $\\frac{3}{4}$ or $x^2$."""
