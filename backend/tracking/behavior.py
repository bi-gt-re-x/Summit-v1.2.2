"""Behavior: the mistakes you already know you make, tracked until they stop.

## Why this exists

Ordinary analytics says your scores fell. It doesn't say why, and when you already know
why ("I rush the last few problems", "I miss the easy ones"), it doesn't help you stop.
Knowing a mistake and not making it again are different things, and most of the gap is
that nothing checks. So this keeps, for each pattern you name:

    What it is        "Impulsive answers on tests", in your words, and where it shows up.
    How often         How many times it came up in the last month, and in how many sessions.
    Does it come back The share of checked sessions since you named it where it happened.
    The fix           What you're trying (an intervention), since when, and how often you
                      actually did it.
    Did the fix work  How often it came up before the fix against since, through the
                      evidence tiers, so three good days are never called a cure.
    Where it stands   Identified, Intervening, Improving, Resolved.

and across all of them, how many named mistakes came back after being named. That figure
is the honest answer to "does acknowledging a mistake stop it?"

## Where the sessions come from

A rate needs the clean sessions as much as the slips, so every session is a check:

- **The question after a task.** When a finished task is the kind of work a pattern
  shows up in, the rating prompt asks whether it happened, and whether the fix was used.
- **Logged by hand.** A test at school that Summit never saw: what it was, the date, how
  many times it happened.
- **The record itself.** A pattern Summit spotted from a struggle reason, from points
  lost on easy work, or from long sessions that went badly is measured from the tasks
  too, back to before it was named, so it has a "before" from the first day.

A check made by hand beats the record's reading of the same task.

## Why it happens

"When it shows up" compares checked sessions by time of day, length, difficulty, how many
tasks came before it that day, your Log check-in's energy and mood, and tests against
other work. Only a gap the evidence can tell from noise is named, and it's said as two
things that go together, never as a cause.

Pure: rows and dates in, words and numbers out. backend/api/behavior.py stores them.
"""
import re
from collections import Counter, defaultdict
from datetime import date, timedelta
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from backend.config.shared import RULES
from backend.tracking import evidence, experiments, next_sessions, record, time_spent
from backend.tracking.measures import kind_of

RULE = RULES['behavior']
RECENT_DAYS = RULE['recent_days']
CLEAN_RUN = RULE['clean_run']
RESOLVE_DAYS = RULE['resolve_days']
REPEAT_MIN_DAYS = RULE['repeat_min_days']
TITLE_MAX = RULE['title_max']
DETAIL_MAX = RULE['detail_max']
LABEL_MAX = RULE['label_max']
DETECT = RULE['detect']
LONG_SESSION = RULE['long_session_minutes'] * 60
LATE_AFTER = RULE['late_after_tasks']
SCOPES = {row['key']: row['label'] for row in RULE['scopes']}
STATUSES = {row['key']: row['label'] for row in RULE['statuses']}
LIBRARY = RULE['interventions']
SOURCES = ('own', 'log', 'reason', 'easy', 'length')
SOURCE_LABEL = {'own': 'You named it', 'log': 'From your Log', 'reason': 'Spotted in your ratings',
                'easy': 'Spotted in your scores', 'length': 'Spotted in your sessions'}

#: How far back the record is read for patterns measured from it.
RECORD_DAYS = 180
#: How far back a fix's "before" reaches.
BEFORE_DAYS = 60
#: Sessions drawn as dots on a pattern's card.
RECENT_SHOWN = 14

_TEST = re.compile(r'\b(?:{})\b'.format('|'.join(re.escape(word) for word in RULE['test_words'])), re.I)
_TEST_ACRONYM = re.compile(r'\b(?:{})\b'.format('|'.join(re.escape(word) for word in RULE['test_acronyms'])))


def _day(raw: Any) -> Optional[date]:
    return record._day(raw)


def _short(day: date) -> str:
    return '{} {}'.format(day.strftime('%b'), day.day)


def _times(count: int, word: str = 'time') -> str:
    return '1 {}'.format(word) if count == 1 else '{:,} {}s'.format(count, word)


def _sessions(count: int) -> str:
    return _times(count, 'session')


def _percent(part: int, whole: int) -> int:
    return round(part / whole * 100) if whole else 0


def is_test(text: str) -> bool:
    """Whether a task's name says it's a test or a contest."""
    text = str(text or '')
    return bool(_TEST.search(text) or _TEST_ACRONYM.search(text))


def words_of(raw: Any) -> List[str]:
    """A pattern's words for the 'words' scope, lowercased, from a list or a comma list."""
    if isinstance(raw, str):
        raw = raw.split(',')
    if not isinstance(raw, (list, tuple)):
        return []
    found = []
    for one in raw:
        word = str(one or '').strip().lower()[:40]
        if word and word not in found:
            found.append(word)
    return found[:8]


def scope_label(row: Dict[str, Any], name_of: Callable[[str], str] = lambda key: key) -> str:
    scope = row.get('scope') or 'study'
    if scope == 'subject' and row.get('subject'):
        return name_of(row['subject'])
    if scope == 'words':
        words = words_of(row.get('words'))
        if words:
            return 'Tasks named "{}"'.format('" or "'.join(words[:3]))
    return SCOPES.get(scope, SCOPES['study'])


def in_scope(row: Dict[str, Any], task: Dict[str, Any]) -> bool:
    """Whether a task is the kind of work this pattern can show up in."""
    scope = row.get('scope') or 'study'
    title = str(task.get('title') or '')
    if scope == 'words':
        lowered = title.lower()
        return any(word in lowered for word in words_of(row.get('words')))
    if kind_of(task) != 'study':
        return False
    if scope == 'tests':
        return is_test(title)
    if scope == 'subject':
        return bool(row.get('subject')) and task.get('subject') == row.get('subject')
    return True


# ---------------------------------------------------------------------------
# The sessions checked
# ---------------------------------------------------------------------------
def _from_reason(row: Dict[str, Any], task: Dict[str, Any]) -> Optional[int]:
    if experiments._rating(task) is None:
        return None
    return 1 if task.get('reason') == row.get('source_ref') else 0


def _from_easy(row: Dict[str, Any], task: Dict[str, Any]) -> Optional[int]:
    level = experiments._level(task)
    score = record.score_of(task)
    if level is None or level > 2 or not score:
        return None
    got, of = score
    return 1 if got < of else 0


def _from_length(row: Dict[str, Any], task: Dict[str, Any]) -> Optional[int]:
    seconds, rating = _spent(task), experiments._rating(task)
    if seconds is None or rating is None or seconds <= DETECT['long_minutes'] * 60:
        return None
    return 1 if rating <= 2 else 0


#: Patterns the record can measure on its own, and how each reads one task.
FROM_RECORD = {'reason': _from_reason, 'easy': _from_easy, 'length': _from_length}


def _flag(value: Any) -> Optional[bool]:
    """A stored yes/no: 1, 0, or NULL for "not asked"."""
    if value is None or value == '':
        return None
    try:
        return bool(int(value))
    except (TypeError, ValueError):
        return bool(value)


def checks_of(row: Dict[str, Any], stored: Sequence[Dict[str, Any]], tasks: Sequence[Dict[str, Any]],
              today: date) -> List[Dict[str, Any]]:
    """Every session checked for this pattern, oldest first.

    The checks the reader made, plus, for a pattern the record can measure, every
    finished task in its scope that the reader didn't check by hand."""
    by_id = {str(task.get('id')): task for task in tasks}
    out = []
    asked = set()
    for check in stored:
        if str(check.get('behavior_id')) != str(row.get('id')):
            continue
        day = _day(check.get('day'))
        if day is None:
            continue
        task_id = str(check.get('task_id') or '')
        if task_id:
            asked.add(task_id)
        out.append({
            'id': check.get('id'), 'day': day, 'times': max(0, int(check.get('times') or 0)),
            'used': _flag(check.get('used')), 'task_id': task_id, 'task': by_id.get(task_id),
            'label': str(check.get('label') or ''), 'note': str(check.get('note') or ''),
            'from': 'task' if task_id else 'logged', 'intervention_id': str(check.get('intervention_id') or ''),
            'created_at': str(check.get('created_at') or ''),
        })
    reads = FROM_RECORD.get(row.get('source') or '')
    if reads:
        since = today - timedelta(days=RECORD_DAYS)
        for task in tasks:
            task_id = str(task.get('id'))
            if task.get('status') != 'done' or task_id in asked:
                continue
            day = _day(task.get('completed_at'))
            if day is None or day < since or day > today or not in_scope(row, task):
                continue
            times = reads(row, task)
            if times is None:
                continue
            out.append({'id': None, 'day': day, 'times': times, 'used': None, 'task_id': task_id, 'task': task,
                        'label': '', 'note': '', 'from': 'record', 'intervention_id': '',
                        'created_at': str(task.get('completed_at') or '')})
    out.sort(key=lambda check: (check['day'], check['created_at']))
    return out


def _spent(task: Dict[str, Any]) -> Optional[float]:
    """Seconds a task really took, or None (backend/tracking/time_spent.py: never the raw
    `completion_seconds`, which is how long it sat on the list)."""
    return time_spent.seconds_spent(task)


def _hits(checks: Sequence[Dict[str, Any]]) -> int:
    return sum(1 for check in checks if check['times'] > 0)


# ---------------------------------------------------------------------------
# Whether a fix worked
# ---------------------------------------------------------------------------
#: What the page says for each reading of a fix: a headline and what to do now.
VERDICTS = {
    'working': ("It's working", 'It comes up less since the fix started. Keep it.'),
    'leaning_better': ("Looks like it's helping", 'Not proven yet. Keep it going a little longer.'),
    'no_change': ('No real difference yet', "It comes up about as often as before. Check you're really doing it, or try another fix."),
    'leaning_worse': ('Looks worse, not proven', 'Give it a few more sessions. If it stays this way, try another fix.'),
    'worse': ("It's coming up more", "This fix isn't helping. Try a different one."),
    'early': ('Too early to tell', ''),
    'rare': ('Too rare to tell', 'It barely came up either way. Keep the fix if it feels better.'),
    'clean': ("Hasn't come up since", "There's nothing from before the fix to compare with, but it's been clean."),
    'no_baseline': ('Nothing to compare with yet', "There are no checked sessions from before the fix. Keep checking and it'll show the trend."),
}
TONE = {'working': 'good', 'leaning_better': 'good', 'clean': 'good', 'no_change': 'flat', 'early': 'flat',
        'rare': 'flat', 'no_baseline': 'flat', 'leaning_worse': 'bad', 'worse': 'bad'}


def _verdict(read: Dict[str, Any], better: bool) -> str:
    if read['tier'] == evidence.INSUFFICIENT:
        return 'no_change' if read['noise'] else 'early'
    if not read['clear']:
        return 'leaning_better' if better else 'leaning_worse'
    return 'working' if better else 'worse'


def _span(fix: Dict[str, Any], today: date) -> Tuple[date, date]:
    start = _day(fix.get('started_on')) or today
    end = _day(fix.get('ended_on')) or today
    return start, max(start, end)


def effect(checks: Sequence[Dict[str, Any]], fix: Dict[str, Any], today: date) -> Dict[str, Any]:
    """How often it came up before a fix against since, and whether that's a real change."""
    start, end = _span(fix, today)
    before = [check for check in checks if start - timedelta(days=BEFORE_DAYS) <= check['day'] < start]
    during = [check for check in checks if start <= check['day'] <= end]
    hb, nb, hd, nd = _hits(before), len(before), _hits(during), len(during)
    asked = [check for check in during if check['used'] is not None]
    done = sum(1 for check in asked if check['used'])
    out = {'before': {'hits': hb, 'of': nb, 'percent': _percent(hb, nb)},
           'during': {'hits': hd, 'of': nd, 'percent': _percent(hd, nd)},
           'used': {'done': done, 'of': len(asked)} if asked else None,
           'evidence': None, 'split': None}
    if nd < evidence.FLOOR:
        verdict = 'early'
        need = evidence.FLOOR - nd
    elif nb == 0:
        verdict = 'clean' if hd == 0 else 'no_baseline'
        need = 0
    else:
        read = evidence.rates(hb, nb, hd, nd)
        if hb + hd < evidence.FLOOR:
            verdict = 'rare'
        else:
            verdict = _verdict(read, hd / nd < hb / nb)
            if evidence.speaks(read):
                out['evidence'] = read['label']
        need = 0
    # Sessions with the fix against the ones without it, inside the same weeks: a fairer
    # test than before and after, when both sides have enough.
    yes = [check for check in during if check['used'] is True]
    no = [check for check in during if check['used'] is False]
    if min(len(yes), len(no)) >= evidence.FLOOR:
        read = evidence.rates(_hits(no), len(no), _hits(yes), len(yes))
        line = 'With the fix it came up in {} of {} sessions, without it in {} of {}.'.format(
            _hits(yes), len(yes), _hits(no), len(no))
        out['split'] = {'line': line, 'evidence': read['label'] if evidence.speaks(read) else None,
                        'helps': evidence.speaks(read) and _hits(yes) / len(yes) < _hits(no) / len(no)}
    out['verdict'] = verdict
    out['tone'] = TONE[verdict]
    out['headline'], tip = VERDICTS[verdict]
    if verdict == 'early':
        tip = '{} more checked {} since the fix and it can start to say.'.format(
            need, 'session' if need == 1 else 'sessions')
    out['tip'] = tip
    return out


# ---------------------------------------------------------------------------
# When it shows up
# ---------------------------------------------------------------------------
def _energy_by_day(entries: Sequence[Dict[str, Any]]) -> Dict[date, Tuple[Optional[int], Optional[int]]]:
    """The Log check-in for each day: the lowest mood and energy said that day."""
    out: Dict[date, Tuple[Optional[int], Optional[int]]] = {}
    for entry in entries:
        day = _day(entry.get('created_at'))
        if day is None:
            continue
        mood = entry.get('mood') if isinstance(entry.get('mood'), (int, float)) and entry.get('mood') else None
        energy = entry.get('energy') if isinstance(entry.get('energy'), (int, float)) and entry.get('energy') else None
        was = out.get(day, (None, None))
        out[day] = (min(filter(None, (was[0], mood)), default=None), min(filter(None, (was[1], energy)), default=None))
    return out


def _low_day(said: Optional[Tuple[Optional[int], Optional[int]]]) -> Optional[bool]:
    """Whether a day's Log check-in said low energy or a rough mood. None when it said neither."""
    if not said or (said[0] is None and said[1] is None):
        return None
    mood, energy = said
    return energy == 1 or (mood is not None and mood <= 2)


def _before_in_day(tasks: Sequence[Dict[str, Any]]) -> Dict[str, int]:
    """For each finished study task, how many came before it the same day."""
    by_day: Dict[date, List[Dict[str, Any]]] = defaultdict(list)
    for task in tasks:
        day = _day(task.get('completed_at'))
        if task.get('status') == 'done' and day and kind_of(task) == 'study':
            by_day[day].append(task)
    out = {}
    for rows in by_day.values():
        for at, task in enumerate(sorted(rows, key=lambda row: str(row.get('completed_at')))):
            out[str(task.get('id'))] = at
    return out


#: Each thing a session can be, the words for both sides, and what it suggests when
#: the pattern shows up more with it. Each test takes (check, context) and returns
#: True, False, or None when it can't be told.
CONDITIONS = [
    ('evening', ('evening and late sessions', 'earlier ones'),
     lambda c, x: None if not c['task'] or experiments.part_of(c['task']) is None
     else experiments.part_of(c['task']) in ('Evening', 'Late hours'),
     'This suggests it shows up when you\'re tired, so do the fix first thing in evening sessions, or move the work that matters earlier.'),
    ('morning', ('morning sessions', 'later ones'),
     lambda c, x: None if not c['task'] or experiments.part_of(c['task']) is None
     else experiments.part_of(c['task']) == 'Morning',
     'This suggests mornings are when your guard is down, maybe from starting cold. Try a two-minute warm-up before the real work.'),
    ('long', ('sessions over an hour', 'shorter ones'),
     lambda c, x: None if not c['task'] or _spent(c['task']) is None
     else _spent(c['task']) > LONG_SESSION,
     'This suggests it creeps in as a session drags on. Try stopping at an hour, or doing the fix again at the halfway point.'),
    ('hard', ('hard tasks', 'easier ones'),
     lambda c, x: None if not c['task'] or experiments._level(c['task']) is None
     else experiments._level(c['task']) >= 4,
     'This suggests it comes from pressure on hard work. Use the fix hardest where the problems are hardest.'),
    ('easy', ('easy tasks', 'harder ones'),
     lambda c, x: None if not c['task'] or experiments._level(c['task']) is None
     else experiments._level(c['task']) <= 2,
     'This suggests it comes from easing off when the work looks easy. Easy work is where the fix matters most.'),
    ('late', ('sessions after 3 or more tasks that day', 'earlier ones'),
     lambda c, x: None if not c['task_id'] or c['task_id'] not in x['order'] else x['order'][c['task_id']] >= LATE_AFTER,
     'This suggests it comes with a full day behind you. Put the work it shows up in before the rest, not after.'),
    ('low_energy', ('days you logged low energy or a rough mood', 'other days'),
     lambda c, x: _low_day(x['energy'].get(c['day'])),
     'This suggests it\'s tied to how you feel going in. On low days, slow the first few problems right down, or move the work to a better day.'),
    ('test', ('tests and contests', 'other work'),
     lambda c, x: is_test((c['task'] or {}).get('title') or c['label']) if (c['task'] or c['label']) else None,
     'This suggests it\'s pressure from being tested, more than the work itself. Practice under timed test conditions with the fix, so it\'s automatic on the day.'),
]


def when(checks: Sequence[Dict[str, Any]], context: Dict[str, Any]) -> Dict[str, Any]:
    """The one condition the pattern shows up with most, when the evidence can say so."""
    found = []
    quiet = []
    for key, (with_words, without_words), test, suggests in CONDITIONS:
        yes, no = [], []
        for check in checks:
            value = test(check, context)
            if value is True:
                yes.append(check)
            elif value is False:
                no.append(check)
        if min(len(yes), len(no)) < evidence.FLOOR:
            continue
        hy, hn = _hits(yes), _hits(no)
        read = evidence.rates(hn, len(no), hy, len(yes))
        if read['noise']:
            quiet.append(with_words)
            continue
        if not evidence.speaks(read) or hy / len(yes) <= hn / len(no):
            continue
        gap = hy / len(yes) - hn / len(no)
        found.append((gap, {
            'key': key,
            'line': 'It came up in {} of {} {}, and {} of {} {}.'.format(hy, len(yes), with_words, hn, len(no), without_words),
            'suggests': evidence.hedge(suggests, read['tier']),
            'evidence': read['label'],
            'chart': {'type': 'compare', 'max': 100, 'unit': '%', 'rows': [
                {'label': with_words[0].upper() + with_words[1:], 'value': _percent(hy, len(yes)), 'text': '{}/{}'.format(hy, len(yes))},
                {'label': without_words[0].upper() + without_words[1:], 'value': _percent(hn, len(no)), 'text': '{}/{}'.format(hn, len(no))}]},
        }))
    linked = sum(1 for check in checks if check['task'] or check['label'])
    if not found:
        need = max(0, evidence.FLOOR * 2 - linked)
        return {'found': None, 'quiet': quiet[:2], 'need': need, 'linked': linked}
    found.sort(key=lambda pair: -pair[0])
    return {'found': found[0][1], 'quiet': quiet[:2], 'need': 0, 'linked': linked}


# ---------------------------------------------------------------------------
# One pattern, read
# ---------------------------------------------------------------------------
def _fixes(row: Dict[str, Any], interventions: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    mine = [one for one in interventions if str(one.get('behavior_id')) == str(row.get('id'))]
    return sorted(mine, key=lambda one: (str(one.get('started_on')), str(one.get('created_at'))))


def _live(fixes: Sequence[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    return next((one for one in reversed(fixes) if not one.get('ended_on')), None)


def status_of(row: Dict[str, Any], checks: Sequence[Dict[str, Any]], live: Optional[Dict[str, Any]],
              found: Optional[Dict[str, Any]], today: date) -> str:
    """Identified, Intervening, Improving or Resolved."""
    if row.get('status') == 'resolved':
        return 'resolved'
    if live is None:
        return 'identified'
    start, _ = _span(live, today)
    since = [check for check in checks if check['day'] >= start]
    if found and found['verdict'] in ('working', 'leaning_better', 'clean'):
        return 'improving'
    if len(since) >= evidence.FLOOR and not _hits(since[-evidence.FLOOR:]):
        return 'improving'
    return 'intervening'


def ready_to_resolve(checks: Sequence[Dict[str, Any]], live: Optional[Dict[str, Any]], today: date) -> bool:
    """Clean for CLEAN_RUN checked sessions in a row, on a fix that's run RESOLVE_DAYS."""
    if live is None:
        return False
    start, _ = _span(live, today)
    since = [check for check in checks if check['day'] >= start]
    return ((today - start).days >= RESOLVE_DAYS and len(since) >= CLEAN_RUN
            and not _hits(since[-CLEAN_RUN:]))


def fixes_for(row: Dict[str, Any]) -> List[Dict[str, str]]:
    """Fixes worth trying for a pattern, best match first: its struggle reason's own fix,
    then the library's by the words in its name, then an if-then plan."""
    out = []
    if row.get('source') == 'reason' and row.get('source_ref') in experiments.FOR_REASON:
        title, how = experiments.FOR_REASON[row['source_ref']]
        out.append({'key': 'reason', 'title': title, 'how': how})
    text = '{} {}'.format(row.get('title') or '', row.get('detail') or '').lower()
    scored = []
    for at, one in enumerate(LIBRARY):
        hits = sum(1 for word in one['words'] if re.search(r'\b{}'.format(re.escape(word)), text))
        if hits:
            scored.append((-hits, at, one))
    if row.get('source') == 'easy':
        scored.append((-9, -1, next(one for one in LIBRARY if one['key'] == 'easy-recheck')))
    if row.get('source') == 'length':
        scored.append((-9, -1, next(one for one in LIBRARY if one['key'] == 'focus-blocks')))
    for _, _, one in sorted(scored, key=lambda item: (item[0], item[1])):
        if all(one['title'] != have['title'] for have in out):
            out.append({'key': one['key'], 'title': one['title'], 'how': one['how']})
    fallback = next(one for one in LIBRARY if one['key'] == 'if-then')
    if all(fallback['title'] != have['title'] for have in out):
        out.append({'key': fallback['key'], 'title': fallback['title'], 'how': fallback['how']})
    return out[:4]


def _returned(row: Dict[str, Any], checks: Sequence[Dict[str, Any]]) -> Optional[date]:
    """The first day it came up after it was marked resolved."""
    if row.get('status') != 'resolved':
        return None
    resolved = _day(row.get('resolved_on'))
    if resolved is None:
        return None
    return next((check['day'] for check in checks if check['day'] > resolved and check['times'] > 0), None)


def describe(row: Dict[str, Any], stored: Sequence[Dict[str, Any]], interventions: Sequence[Dict[str, Any]],
             tasks: Sequence[Dict[str, Any]], context: Dict[str, Any], today: date,
             name_of: Callable[[str], str] = lambda key: key) -> Dict[str, Any]:
    """A stored pattern as the page draws it."""
    checks = checks_of(row, stored, tasks, today)
    named = _day(row.get('identified_on')) or today
    recent = [check for check in checks if check['day'] > today - timedelta(days=RECENT_DAYS)]
    since = [check for check in checks if check['day'] >= named]
    fixes = _fixes(row, interventions)
    live = _live(fixes)
    found = effect(checks, live, today) if live else None
    returned = _returned(row, checks)
    status = status_of(row, checks, live, found, today)
    if status == 'resolved' and returned:
        status = 'intervening' if live else 'identified'

    times = sum(check['times'] for check in recent)
    hit_recent = _hits(recent)
    if recent:
        frequency_line = '{} in the last {} days, in {} of {} checked {}.'.format(
            _times(times).capitalize(), RECENT_DAYS, hit_recent, len(recent), 'session' if len(recent) == 1 else 'sessions')
    else:
        frequency_line = 'No checked sessions in the last {} days.'.format(RECENT_DAYS)
    recurrence = None
    if since:
        hits = _hits(since)
        recurrence = {'hits': hits, 'of': len(since), 'percent': _percent(hits, len(since)),
                      'evidence': evidence.counted(len(since))['label'] if evidence.speaks(evidence.counted(len(since))) else None,
                      'line': 'It came back in {} of {} checked {} since you named it on {}.'.format(
                          hits, len(since), 'session' if len(since) == 1 else 'sessions', _short(named))}

    fix = None
    if live:
        start, _ = _span(live, today)
        fix = {'id': live.get('id'), 'title': live.get('title') or '', 'how': live.get('how') or '',
               'started_on': start.isoformat(), 'started_label': _short(start), 'days': (today - start).days,
               'used': found['used'] if found else None}
    past = []
    for one in fixes:
        if one is live:
            continue
        start, end = _span(one, today)
        read = effect(checks, one, today)
        past.append({'id': one.get('id'), 'title': one.get('title') or '', 'how': one.get('how') or '',
                     'started_label': _short(start), 'ended_label': _short(end),
                     'outcome': one.get('outcome') or '', 'verdict': read['verdict'], 'headline': read['headline']})

    shown = checks[-RECENT_SHOWN:]
    return {
        'id': row.get('id'), 'title': row.get('title') or '', 'detail': row.get('detail') or '',
        'scope': row.get('scope') or 'study', 'scope_label': scope_label(row, name_of),
        'subject': row.get('subject') or '', 'words': words_of(row.get('words')),
        'source': row.get('source') or 'own', 'source_label': SOURCE_LABEL.get(row.get('source') or 'own', ''),
        'from_record': (row.get('source') or '') in FROM_RECORD,
        'stored_status': row.get('status') or 'open', 'status': status, 'status_label': STATUSES[status],
        'identified_on': named.isoformat(), 'identified_label': _short(named),
        'resolved_label': _short(_day(row['resolved_on'])) if _day(row.get('resolved_on')) else None,
        'came_back': int(row.get('came_back') or 0) + (1 if returned else 0),
        'returned_label': _short(returned) if returned else None,
        'frequency': {'times': times, 'sessions': hit_recent, 'checked': len(recent), 'days': RECENT_DAYS,
                      'line': frequency_line},
        'recurrence': recurrence,
        'fix': fix,
        'effect': found,
        'past_fixes': past[::-1],
        'when': when(checks, context),
        'recent': [{'id': check['id'], 'day': check['day'].isoformat(), 'day_label': _short(check['day']),
                    'times': check['times'], 'used': check['used'], 'from': check['from'],
                    'label': check['label'] or str((check['task'] or {}).get('title') or '')[:LABEL_MAX]}
                   for check in shown],
        'checks': len(checks),
        'ready_to_resolve': status != 'resolved' and ready_to_resolve(checks, live, today),
        'fixes': fixes_for(row),
    }


# ---------------------------------------------------------------------------
# All of them
# ---------------------------------------------------------------------------
def summary(read: Sequence[Dict[str, Any]], today: date) -> Dict[str, Any]:
    """The page's opening: how many came back after being named, and how the fixes are doing.

    A headline that reads the figures, the figures, then what they suggest."""
    live = [one for one in read if one['stored_status'] != 'archived']
    counts = Counter(one['status'] for one in live)
    # A pattern can only "come back" once there's been time for it to.
    old = [one for one in live if (today - date.fromisoformat(one['identified_on'])).days >= REPEAT_MIN_DAYS
           and one['recurrence'] and one['recurrence']['of'] > 0]
    came_back = [one for one in old if one['recurrence']['hits'] > 0]
    running = [one for one in live if one['effect']]
    # A fix that can't be judged yet is neither working nor failing.
    fixes = [one for one in running if one['effect']['verdict'] not in ('early', 'no_baseline', 'rare')]
    working = [one for one in fixes if one['effect']['verdict'] in ('working', 'leaning_better', 'clean')]
    waiting = len(running) - len(fixes)
    failing = [one for one in fixes if one['effect']['verdict'] in ('no_change', 'worse', 'leaning_worse')]
    unfixed = [one for one in live if one['status'] == 'identified']
    out = {'named': len(live), 'counts': {key: counts.get(key, 0) for key in STATUSES},
           'repeat': {'hits': len(came_back), 'of': len(old), 'percent': _percent(len(came_back), len(old))} if old else None,
           'fixes': {'working': len(working), 'of': len(fixes), 'waiting': waiting},
           'headline': None, 'figures': None, 'suggests': None}
    if not live:
        return out
    if old and len(came_back) * 2 >= len(old):
        out['headline'] = "Naming a mistake hasn't stopped it yet."
    elif old:
        out['headline'] = 'Most of what you named is staying away.'
    elif working:
        out['headline'] = 'Your fixes are starting to hold.'
    else:
        out['headline'] = 'Each pattern needs checked sessions before it can say much.'
    parts = []
    if len(old) == 1:
        parts.append('The pattern you named at least a week ago {}.'.format(
            'came back afterward' if came_back else "hasn't come back since"))
    elif old:
        parts.append('{} of the {} patterns you named at least a week ago came back afterward.'.format(
            len(came_back), len(old)))
    if len(fixes) == 1:
        parts.append('Your one judged fix {} so far.'.format('is working' if working else "isn't working yet"))
    elif fixes:
        parts.append('{} of {} judged fixes are working so far.'.format(len(working), len(fixes)))
    if waiting:
        parts.append('One fix is too new to judge.' if waiting == 1 else '{} fixes are too new to judge.'.format(waiting))
    if counts.get('resolved'):
        parts.append('{} resolved.'.format(counts['resolved']))
    out['figures'] = ' '.join(parts) or '{} named, nothing checked yet.'.format(len(live))
    worst = max((one for one in live if one['status'] != 'resolved'),
                key=lambda one: (one['frequency']['times'], one['frequency']['sessions']), default=None)
    if unfixed and worst and worst['status'] == 'identified':
        out['suggests'] = ('This suggests knowing isn\'t the hard part, doing something different is. '
                           '"{}" came up most and has no fix yet, so start there.').format(worst['title'])
    elif failing:
        one = failing[0]
        out['suggests'] = ('This suggests "{}" isn\'t doing its job for "{}". Check you really do it every time, '
                           'or swap it for a different fix.').format(one['fix']['title'] if one['fix'] else 'the fix', one['title'])
    elif working:
        out['suggests'] = 'This suggests the fixes you\'re doing are worth keeping. Keep checking until each one is clean for {} sessions in a row.'.format(CLEAN_RUN)
    else:
        out['suggests'] = 'This suggests nothing yet. Answer the question after each task, or log a session, and it will.'
    shared = Counter(one['when']['found']['key'] for one in live if one['when'] and one['when']['found'])
    if shared:
        key, count = shared.most_common(1)[0]
        if count >= 2:
            words = next(words for name, words, _, _ in CONDITIONS if name == key)[0]
            out['shared'] = '{} of your patterns show up more in {}. That may be one problem, not {}.'.format(
                'Two' if count == 2 else str(count), words, count)
    return out


# ---------------------------------------------------------------------------
# What Summit spots
# ---------------------------------------------------------------------------
def suggest(tasks: Sequence[Dict[str, Any]], insights: Sequence[Dict[str, Any]], tracked: Sequence[Dict[str, Any]],
            today: date) -> List[Dict[str, Any]]:
    """Patterns worth tracking that aren't tracked yet, strongest first: from the Log, from
    struggle reasons that keep coming up, from points lost on easy work and from long
    sessions that went badly. Each says what it's based on."""
    taken = {(str(row.get('source')), str(row.get('source_ref'))) for row in tracked
             if row.get('status') != 'archived'}
    titles = {str(row.get('title') or '').strip().lower() for row in tracked if row.get('status') != 'archived'}
    since = today - timedelta(days=DETECT['lookback_days'])
    done = [task for task in tasks if task.get('status') == 'done' and (_day(task.get('completed_at')) or date.min) >= since
            and kind_of(task) == 'study']
    out = []

    for insight in insights:
        # A pattern the Log filed as a challenge. "Practices violin every day" is a
        # pattern too, but nothing to stop.
        if (insight.get('kind') != 'pattern' or insight.get('topic') not in (None, '', 'challenges')
                or insight.get('status') not in (None, 'active')):
            continue
        text = str(insight.get('text') or '').strip()
        if not text or ('log', str(insight.get('id'))) in taken or text.lower() in titles:
            continue
        out.append({'source': 'log', 'source_ref': str(insight.get('id')), 'title': text[:TITLE_MAX],
                    'detail': '', 'based_on': 'Your Log picked this up from what you wrote.',
                    'scope': 'tests' if is_test(text) else 'study', 'score': 50.0})

    rated = [task for task in done if experiments._rating(task) is not None]
    named = Counter(task.get('reason') for task in rated if task.get('reason') in next_sessions.STRUGGLES)
    for key, count in named.most_common():
        if count < DETECT['reason_min'] or ('reason', key) in taken:
            continue
        label = next_sessions.STRUGGLES[key]
        out.append({'source': 'reason', 'source_ref': key, 'title': label,
                    'detail': '', 'scope': 'study', 'score': float(count),
                    'based_on': '"{}" came up in {} of your {} rated sessions in the last {} days.'.format(
                        label, count, len(rated), DETECT['lookback_days'])})

    easy = [task for task in done if (experiments._level(task) or 9) <= 2 and record.score_of(task)]
    lost = [task for task in easy if record.score_of(task)[0] < record.score_of(task)[1]]
    if len(lost) >= DETECT['easy_min'] and ('easy', '') not in taken:
        out.append({'source': 'easy', 'source_ref': '', 'title': 'Losing points on easy work', 'detail': '',
                    'scope': 'study', 'score': float(len(lost)),
                    'based_on': 'You lost points on {} of {} easy scored tasks in the last {} days.'.format(
                        len(lost), len(easy), DETECT['lookback_days'])})

    long_ = [task for task in done if (_spent(task) or 0) > DETECT['long_minutes'] * 60
             and experiments._rating(task) is not None]
    bad = [task for task in long_ if experiments._rating(task) <= 2]
    if (len(bad) >= DETECT['long_min'] and len(bad) / len(long_) >= DETECT['long_share']
            and ('length', '') not in taken):
        out.append({'source': 'length', 'source_ref': '', 'title': 'Long sessions that go nowhere', 'detail': '',
                    'scope': 'study', 'score': float(len(bad)),
                    'based_on': '{} of your {} sessions over {} minutes in the last {} days rated 2 or lower.'.format(
                        len(bad), len(long_), DETECT['long_minutes'], DETECT['lookback_days'])})

    for one in out:
        one['fixes'] = fixes_for(one)
        one['scope_label'] = SCOPES[one['scope']]
    out.sort(key=lambda one: -one['score'])
    return out[:4]


def reminders(rows: Sequence[Dict[str, Any]], interventions: Sequence[Dict[str, Any]],
              tasks: Sequence[Dict[str, Any]], today: date) -> List[Dict[str, Any]]:
    """Today's work that a pattern with a live fix can show up in, so the fix is in mind
    before the session rather than remembered after it."""
    out = []
    for row in rows:
        live = _live(_fixes(row, interventions))
        if not live or row.get('status') != 'open':
            continue
        if (row.get('scope') or 'study') == 'study':
            # "Every study session" would be every task, every day: a reminder that
            # always shows stops being read.
            continue
        due = []
        for task in tasks:
            if task.get('status') == 'done':
                continue
            day = _day(task.get('due_date')) or _day(task.get('created_at') if task.get('show_on_calendar') else None)
            if day == today and in_scope(row, task):
                due.append(str(task.get('title') or 'A task'))
        if due:
            out.append({'behavior_id': row.get('id'), 'title': row.get('title') or '', 'fix': live.get('title') or '',
                        'how': live.get('how') or '', 'tasks': due[:3], 'more': max(0, len(due) - 3)})
    return out


def for_task(rows: Sequence[Dict[str, Any]], interventions: Sequence[Dict[str, Any]],
             stored: Sequence[Dict[str, Any]], task: Dict[str, Any]) -> List[Dict[str, Any]]:
    """The open patterns a finished task can be checked against, for the question after it."""
    out = []
    task_id = str(task.get('id'))
    for row in rows:
        if row.get('status') == 'archived' or not in_scope(row, task):
            continue
        live = _live(_fixes(row, interventions))
        had = next((check for check in stored if str(check.get('behavior_id')) == str(row.get('id'))
                    and str(check.get('task_id') or '') == task_id), None)
        out.append({'id': row.get('id'), 'title': row.get('title') or '',
                    'fix': {'id': live.get('id'), 'title': live.get('title') or ''} if live else None,
                    'times': int(had['times']) if had else None,
                    'used': _flag(had.get('used')) if had else None})
    return out[:4]


def context_for(tasks: Sequence[Dict[str, Any]], entries: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """What "when it shows up" needs about the record, read once for every pattern."""
    return {'order': _before_in_day(tasks), 'energy': _energy_by_day(entries)}
