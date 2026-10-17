"""Free resources for session plans: the catalog, the sort, and the guard.

Session plans used to link wherever the model pointed, and the model points at
what it has read about most: CLRS on the MIT Press store, Stewart's Calculus,
a Hal Leonard excerpt book. A student can't start any of those in the next
minute, and that's the whole promise of a session plan. So:

1. **The catalog.** `data/free_resources.json` lists free resources for every
   subject in backend/config/subjects.py, each with how much signing up it
   takes (`none`, or `quick`: a free account by email or Google) and the
   words in a task name that it fits. Nothing paid, and nothing that takes
   long to set up, is in it. It's loaded into the `free_resources` table by
   `ensure_catalog`, and the file is the committed copy, the way
   data/skill_steps_seed.json is for skill steps.

2. **The sort.** `sort_subject` ranks one subject's catalog against the names
   of the account's tasks there, so a subject full of "LeetCode session" puts
   LeetCode first, and stores the order in `subject_resources`. The brief
   hands the model that list before anything else (subject_ai's
   <free_resources> section).

3. **The guard.** `guard` runs over every step on its way out, saved ones
   included. A link stays when it's the reader's own, or on a host known to be
   free. Anything else (a store page, a publisher, a paywall) is dropped, and
   a step left with no link gets the free one from the catalog that fits its
   words best, if any does. Every link that stays says how much signing up it
   needs, so the page can say "Free, no signup".

4. **No other productivity apps.** Summit is the reader's task list,
   calendar, focus timer, notes and log. A session never sends them to
   another one (Todoist, Notion, Google Calendar, Pomofocus...), even a free
   one, and even when it's a link they keep: `competitor` and
   `names_competitor` catch them, the guard drops the link, and
   subject_ai drops a step that names one.

The guard reads the catalog from the file, not the table, because it also runs
on GET requests and those never write (tests/test_get_requests_do_not_write.py).
"""
import json
import re
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional
from urllib.parse import urlparse

CATALOG_PATH = Path(__file__).resolve().parents[2] / 'data' / 'free_resources.json'

#: How many of a subject's sorted resources go into a one-subject brief.
BRIEF_COUNT = 6
#: And per subject, when the brief covers every subject.
BRIEF_COUNT_OVERALL = 2
#: The most links a step carries (subject_ai.RESOURCES).
MAX_LINKS = 3

SIGNUP_WORDS = {'none': 'no signup', 'quick': 'free account, quick to make'}

#: Free hosts that aren't in the catalog but turn up in good plans: reference
#: sites, docs, open archives. Matched on the host and anything under it.
EXTRA_FREE_HOSTS = (
    'wikipedia.org', 'wikibooks.org', 'wiktionary.org', 'youtube.com', 'youtu.be',
    'archive.org', 'stackoverflow.com', 'stackexchange.com', 'cppreference.com',
    'cplusplus.com', 'rust-lang.org', 'go.dev', 'react.dev', 'nodejs.org',
    'w3schools.com', 'geeksforgeeks.org', 'kaggle.com', 'docs.ros.org',
    'pytorch.org', 'tensorflow.org', 'scikit-learn.org', 'numpy.org',
    'docs.anthropic.com', 'docs.claude.com', 'distill.pub', 'paperswithcode.com',
    'aclanthology.org', 'openreview.net', 'biorxiv.org', 'medrxiv.org',
    'ncbi.nlm.nih.gov', 'pubmed.ncbi.nlm.nih.gov', 'gutenberg.org',
    'math.libretexts.org', 'libretexts.org', 'oercommons.org', 'ck12.org',
)

#: Other productivity apps: task lists, calendars, focus timers, notes and
#: journals, habit trackers, time trackers. Matched on the host and anything
#: under it.
COMPETITOR_HOSTS = (
    'todoist.com', 'notion.so', 'notion.com', 'notion.site', 'trello.com', 'asana.com',
    'ticktick.com', 'evernote.com', 'clickup.com', 'habitica.com', 'any.do',
    'rescuetime.com', 'toggl.com', 'clockify.me', 'focusmate.com', 'forestapp.cc',
    'sunsama.com', 'usemotion.com', 'akiflow.com', 'calendar.google.com',
    'keep.google.com', 'tasks.google.com', 'todo.microsoft.com', 'onenote.com',
    'obsidian.md', 'pomofocus.io', 'tomato-timer.com', 'marinaratimer.com',
    'pomodor.app', 'structured.app', 'tiimo.app', 'reclaim.ai', 'monday.com',
    'culturedcode.com', 'roamresearch.com', 'logseq.com', 'craft.do', 'coda.io',
    'notability.com', 'goodnotes.com', 'beeminder.com', 'habitify.me',
    'flexibits.com', 'calendly.com', 'airtable.com', 'microsoft.com/microsoft-365/microsoft-to-do-list-app',
)

#: The same apps by name, in a step's own words. Case matters for the names
#: that are also English words, so "the notion of a limit" isn't caught.
COMPETITOR_NAMES = re.compile(
    r'(?i:\b(?:todoist|trello|asana|ticktick|evernote|clickup|habitica|any\.do|rescuetime'
    r'|toggl|clockify|focusmate|sunsama|akiflow|google calendar|google keep|google tasks'
    r'|microsoft to ?do|onenote|obsidian|pomofocus|tomato[- ]timer|marinara timer|tiimo'
    r'|reclaim\.ai|monday\.com|roam research|logseq|notability|goodnotes|beeminder'
    r'|habitify|fantastical|calendly|airtable|apple reminders)\b)'
    r'|\bNotion\b|\bForest app\b|\bThings 3\b|\bStructured app\b|\bMotion app\b')


def competitor(url: str) -> bool:
    """Whether a link goes to another productivity app."""
    host = _host(url)
    if not host:
        return False
    whole = (host + urlparse(url).path).lower()
    return any(host == app or host.endswith('.' + app) or whole.startswith(app)
               for app in COMPETITOR_HOSTS)


def names_competitor(text: str) -> bool:
    """Whether text names another productivity app."""
    return bool(COMPETITOR_NAMES.search(text or ''))


#: Public universities and governments publish a lot for free, so .edu and
#: .gov hosts pass. Their presses don't: a press page is a store.
FREE_SUFFIXES = ('.edu', '.gov', '.ac.uk')
PRESS = re.compile(r'(^|\.)(press|mitpress|store|shop|bookstore)(\.|$)', re.IGNORECASE)


# --------------------------------------------------------------------------
# The catalog
# --------------------------------------------------------------------------
@lru_cache(maxsize=1)
def catalog() -> tuple:
    """Every row in the committed catalog, as read from the file."""
    with open(CATALOG_PATH, encoding='utf-8') as handle:
        rows = json.load(handle)['resources']
    return tuple(rows)


@lru_cache(maxsize=1)
def by_subject() -> Dict[str, List[Dict[str, Any]]]:
    out: Dict[str, List[Dict[str, Any]]] = {}
    for row in catalog():
        out.setdefault(row['subject'], []).append(row)
    for rows in out.values():
        rows.sort(key=lambda row: row['ordinal'])
    return out


def ensure_catalog(db) -> bool:
    """Bring the `free_resources` table into line with the file. Returns
    whether it had to write. Cheap when nothing changed: one read."""
    wanted = [dict(row) for row in catalog()]
    have = db.free_resources()
    key = lambda row: (row['id'], row['subject'], row['name'], row['url'], row['kind'],
                       row['signup'], row['good_for'], tuple(row['keywords']), int(row['ordinal']))
    if sorted(map(key, have)) == sorted(map(key, wanted)):
        return False
    db.save_free_resources(wanted)
    return True


# --------------------------------------------------------------------------
# Matching words in task names
# --------------------------------------------------------------------------
def _norm(text: str) -> str:
    """Lowercase, letters and digits only, single spaces, padded so a phrase
    matches on word boundaries: " leetcode session "."""
    return ' ' + ' '.join(re.sub(r'[^a-z0-9+#]+', ' ', str(text or '').lower()).split()) + ' '


def fits(row: Dict[str, Any], text: str) -> int:
    """How many of a resource's keywords appear in `text`, as whole words."""
    padded = _norm(text)
    return sum(1 for word in row.get('keywords') or () if _norm(word) in padded)


#: Words that say what kind of work a task is but not what it's about. A
#: match on one counts a third as much as a match on something specific, so
#: "Putnam problem session" ranks the Putnam archive over a site that only
#: matched "problem".
GENERIC = frozenset((
    'practice', 'exercise', 'exercises', 'problem', 'problems', 'lesson', 'lecture',
    'course', 'review', 'revision', 'homework', 'reading', 'read', 'notes', 'drills',
    'session', 'study', 'learn', 'learning', 'basics', 'overview', 'video', 'watch',
    'data', 'project', 'build', 'check', 'plan', 'write', 'draft', 'writing',
    'textbook', 'chapter', 'quiz', 'test', 'exam', 'daily', 'routine', 'log',
))


def _weight(word: str) -> int:
    return 1 if word.strip() in GENERIC else 3


def sort_rows(rows: Iterable[Dict[str, Any]], titles: Iterable[str]) -> List[Dict[str, Any]]:
    """`rows` ranked by how well they fit `titles`, best first.

    Each title a row fits scores its best keyword's weight (see GENERIC), and
    the row's score is the sum. Ties go to the one that needs no signup, then
    to catalog order, which is already roughly "most useful first". Each row
    comes back with `matched` (titles it fits) and `titles` (a few distinct
    ones, as written).
    """
    names = [str(title or '').strip() for title in titles if str(title or '').strip()]
    padded = [(_norm(name), name) for name in names]
    out = []
    for row in rows:
        # The subject's own name fits every task filed under it, so it says
        # nothing about which resource fits better: generic.
        own = _norm(str(row.get('subject') or '').replace('_', ' '))
        words = [(_norm(word), 1 if _norm(word) == own else _weight(_norm(word)))
                 for word in row.get('keywords') or ()]
        hits, score = [], 0
        for norm, name in padded:
            best = max((weight for word, weight in words if word in norm), default=0)
            if best:
                hits.append(name)
                score += best
        seen, sample = set(), []
        for name in hits:
            folded = re.sub(r'[\d#]+', '', name.lower()).strip()
            if folded not in seen:
                seen.add(folded)
                sample.append(name)
            if len(sample) == 3:
                break
        out.append({**row, 'matched': len(hits), 'titles': sample, 'score': score})
    out.sort(key=lambda row: (-row['score'], -row['matched'], row['signup'] != 'none',
                              row['ordinal']))
    return out


def sort_subject(db, username: str, subject_id: str, stamp: Optional[str] = None) -> List[Dict[str, Any]]:
    """Sort one subject's catalog against this account's task names there and
    store the order in `subject_resources`. Returns the sorted rows."""
    rows = by_subject().get(subject_id) or []
    if not rows:
        return []
    titles = [row.get('title') for row in db.columns_for('tasks', username, ('subject', 'title'))
              if (row.get('subject') or '') == subject_id]
    ranked = sort_rows(rows, titles)
    db.save_subject_resources(username, subject_id, ranked,
                              stamp or datetime.now().isoformat(timespec='seconds'))
    return ranked


def sorted_for(db, username: str, subject_id: str) -> List[Dict[str, Any]]:
    """The stored order for one subject, read only. Falls back to catalog
    order when the subject has never been sorted for this account."""
    rows = {row['id']: row for row in by_subject().get(subject_id) or []}
    if not rows:
        return []
    stored = db.subject_resources_for(username, subject_id)
    out = [{**rows[entry['resource_id']], 'matched': entry['matched'], 'titles': entry['titles']}
           for entry in stored if entry['resource_id'] in rows]
    listed = {row['id'] for row in out}
    out += [{**row, 'matched': 0, 'titles': []}
            for row in rows.values() if row['id'] not in listed]
    return out


# --------------------------------------------------------------------------
# What the brief says
# --------------------------------------------------------------------------
def brief_entries(ranked: List[Dict[str, Any]], count: int = BRIEF_COUNT,
                  subject: str = '') -> List[Dict[str, Any]]:
    """The few the model sees, in the shape subject_ai's brief prints."""
    return [{'name': row['name'], 'url': row['url'], 'signup': row['signup'],
             'good_for': row['good_for'], 'matched': row['matched'],
             'example': (row['titles'] or [''])[0], 'subject': subject}
            for row in ranked[:count]]


# --------------------------------------------------------------------------
# The guard
# --------------------------------------------------------------------------
def _host(url: str) -> str:
    host = (urlparse(url).hostname or '').lower()
    return host[4:] if host.startswith('www.') else host


def _key(url: str) -> str:
    parts = urlparse(url)
    return (_host(url) + parts.path.rstrip('/') + ('?' + parts.query if parts.query else '')).lower()


@lru_cache(maxsize=1)
def _known() -> tuple:
    """(link key → signup, host → signup) over the whole catalog. A host whose
    rows disagree on signup counts as 'quick', the cautious answer."""
    by_key: Dict[str, str] = {}
    by_host: Dict[str, str] = {}
    for row in catalog():
        by_key[_key(row['url'])] = row['signup']
        host = _host(row['url'])
        by_host[host] = 'quick' if by_host.get(host, row['signup']) != row['signup'] else row['signup']
    return by_key, by_host


def signup_for(url: str) -> Optional[str]:
    """How much signing up a link needs, or None when it isn't known free.
    Another productivity app is never "known free", whatever the catalog says."""
    if competitor(url):
        return None
    by_key, by_host = _known()
    if _key(url) in by_key:
        return by_key[_key(url)]
    host = _host(url)
    if not host:
        return None
    if host in by_host:
        return by_host[host]
    if any(host == free or host.endswith('.' + free) for free in EXTRA_FREE_HOSTS):
        return 'none'
    if host.endswith(FREE_SUFFIXES) and not PRESS.search(host):
        return 'none'
    return None


def best_for(step: Dict[str, Any], ranked: List[Dict[str, Any]], taken: Iterable[str] = ()) -> Optional[Dict[str, Any]]:
    """The catalog row whose keywords fit the step's own words best, ties to
    the account's sort order. None when nothing fits: a link to the subject's
    favorite site that has nothing to do with the step ("Read an article on
    networking" → a hiking app) is worse than no link. Never one whose link
    the step already has."""
    skip = {_key(url) for url in taken}
    text = ' '.join(str(step.get(field) or '') for field in ('title', 'problems', 'focus', 'resource'))
    scored = [(fits(row, text), place, row) for place, row in enumerate(ranked)
              if _key(row['url']) not in skip]
    scored = [entry for entry in scored if entry[0] > 0]
    if not scored:
        return None
    scored.sort(key=lambda entry: (-entry[0], entry[1]))
    return scored[0][2]


def _words(step: Dict[str, Any]) -> List[str]:
    """Everything a reader reads on a step, for `names_competitor`."""
    words = [str(step.get(field) or '') for field in
             ('title', 'problems', 'pace', 'reason', 'signal', 'equipment', 'resource')]
    words += [str(item) for item in step.get('drills') or []]
    words += [str(item) for item in step.get('success') or []]
    words += [str(part.get('what') or '') for part in step.get('plan') or [] if isinstance(part, dict)]
    return words


def guard(steps: List[Dict[str, Any]], ranked_for: Callable[[Dict[str, Any]], List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """Every step with free links only, and at least one where the catalog has
    something for its subject. See the note at the top.

    `ranked_for(step)` is the sorted catalog for that step's subject (empty
    for a subject the catalog doesn't cover). Steps are returned as new dicts;
    nothing is changed in place.
    """
    out = []
    for step in steps:
        if not isinstance(step, dict):
            continue
        # A saved step built on another productivity app goes, not just its
        # link: "Weekly review with Todoist" is still about Todoist.
        if names_competitor(' '.join(_words(step))):
            continue
        kept = []
        dropped = 0
        for link in step.get('resources') or []:
            if not isinstance(link, dict) or not link.get('url'):
                continue
            if competitor(link['url']):
                dropped += 1
                continue
            signup = 'none' if link.get('yours') else signup_for(link['url'])
            if signup is None:
                dropped += 1
                continue
            kept.append({**link, 'signup': signup})
        # Each dropped link is replaced, and a step with none at all gets one.
        wanted = min(dropped, MAX_LINKS - len(kept))
        if not kept:
            wanted = max(wanted, 1)
        if wanted > 0:
            ranked = ranked_for(step) or []
            for _ in range(wanted):
                row = best_for(step, ranked, [link['url'] for link in kept])
                if not row:
                    break
                kept.append({'name': row['name'], 'url': row['url'], 'yours': False,
                             'signup': row['signup'], 'picked': True})
        out.append({**step, 'resources': kept[:MAX_LINKS]})
    return out
