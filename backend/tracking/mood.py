"""How the day felt, against what the day did.

The Log is where the reader says how things are going. Analytics is where the
record says how things went. This module puts the two side by side, day by
day, and only says what the days actually show.

## Where a day's mood comes from

Two places, and the page always says which:

- **Said.** The check-in row on the Log page: mood 1-5 and energy 1-3,
  tapped by the reader. This is the reader's own answer and always wins.
- **Read.** An entry with no check-in is read for feeling words with a fixed
  word list (LEXICON below), so it's the same answer every time and the page
  can show which words it found. "Not tired" doesn't count as tired; "so
  tired" counts double; "not motivated" counts as down. A day whose words
  say nothing has no mood, rather than a neutral one.

Several entries on one day are one day: the check-ins are averaged, and
without one the words from every entry are added up.

## What it compares

For every day with a mood, what happened that day and the next: finished
tasks, focus minutes, and the execution rating of rated tasks. Then:

- **Bands.** Rough, okay and good days (mood below, at and above the middle),
  each against the reader's usual day.
- **Feelings.** Each kind of feeling word (tired, stressed, down, good,
  driven) on the days it was written against the logged days it wasn't, and
  the day after against the usual day.
- **Perception.** Lines that say how much got done ("got nothing done",
  "super productive") against how much the record says got done.
- **Energy**, **recovery** after a rough day, and **mood by weekday**, each
  only once there are enough days.
- **Low times.** Every moment energy or output dropped, with its date and, when
  there is one, its time, and which parts of the day and which weekdays they
  land on. See `low_times`.

## What it won't say

Nothing from fewer than MIN_DAYS days on either side of a comparison, and a
difference under SMALL_CHANGE percent is reported as "about the same", not as
a finding. Every result carries its day counts and a confidence word from
those counts, the same way the Observations on the Insights tab do. It never
reads health from the words (no illness, no diagnoses), the rule the Log's
own reader keeps (backend/tracking/journal.py).

`usual` is the median tasks on the reader's active days in the last USUAL_DAYS
days, the same "a day you worked" rule the rest of Analytics uses.
"""
import re
from collections import defaultdict
from datetime import date, timedelta
from statistics import mean, median
from typing import Dict, Iterable, List, Optional, Tuple

from backend.tracking.review_sessions import reviewable

#: How far back logged days are read.
WINDOW_DAYS = 180
#: The stretch the "usual day" is measured over.
USUAL_DAYS = 90
#: The fewest days either side of a comparison may have.
MIN_DAYS = 3
#: A difference smaller than this, in percent, is "about the same".
SMALL_CHANGE = 15
#: Days drawn on the timeline.
SERIES_DAYS = 60
#: Perception checks shown.
CHECKS_SHOWN = 6
#: Low times listed per side.
LOW_SHOWN = 8
#: A day under this share of the usual day is a slow one.
SLOW_SHARE = 0.5
#: A rating at or below this is low.
LOW_RATING = 2
#: The reason a task was done on low energy (shared/rules.json).
LOW_ENERGY_REASON = 'low-energy'
#: The parts of the day, by the hour each starts. Same hours as `PART_OF_DAY`
#: in frontend/src/utils/habits.ts.
PARTS = (('Morning', 5), ('Afternoon', 12), ('Evening', 17), ('Late hours', 22))

BANDS = (
    ('rough', 'Rough days', lambda mood: mood <= -1),
    ('okay', 'Okay days', lambda mood: mood == 0),
    ('good', 'Good days', lambda mood: mood >= 1),
)

#: Feeling words, by kind, with the way each moves the mood. Patterns are
#: matched as whole words, case-insensitive.
LEXICON = {
    'tired': (-1, 'Tired', (
        r'tired', r'exhausted', r'drained', r'sleepy', r'worn out', r'burn(?:ed|t) out',
        r'burnout', r'fatigued', r'no energy', r'low energy', r'wiped(?: out)?', r'running on empty')),
    'stressed': (-1, 'Stressed', (
        r'stressed', r'stressful', r'overwhelmed', r'anxious', r'nervous', r'panick(?:ed|ing)',
        r'under pressure', r'worried', r'freaking out', r'swamped')),
    'down': (-1, 'Down', (
        r'sad', r'(?:feeling|felt|feel|so|pretty|kind of|kinda) down', r'down today', r'upset', r'frustrated', r'frustrating', r'annoyed', r'discouraged',
        r'bored', r'unmotivated', r'lazy', r'meh', r'rough day', r'bad day', r'awful',
        r'terrible', r'miserable', r'stuck')),
    'good': (1, 'Good', (
        r'happy', r'great', r'good day', r'excited', r'proud', r'grateful', r'calm',
        r'relaxed', r'fun', r'amazing', r'awesome', r'fantastic', r'feeling good', r'felt good')),
    'driven': (1, 'Driven', (
        r'motivated', r'(?:felt|feel|feeling|was|so|super|really|very) focused', r'energi[sz]ed', r'in the zone', r'determined',
        r'locked in', r'on fire', r'pumped', r'inspired', r'flow state', r'dialed in')),
}

#: Lines about how much got done. Low first, because "unproductive" contains
#: "productive" and is matched before it.
CLAIMS = (
    ('low', (
        r'got nothing done', r"didn'?t get (?:anything|much|a lot) done", r'did nothing',
        r'unproductive', r'not productive', r'wasted (?:the|my|a|today|this)',
        r'procrastinat\w*', r'fell behind', r'barely did', r'got little done',
        r'nothing got done', r'zero progress', r'no progress')),
    ('high', (
        r'(?:so|very|super|really) productive', r'productive day', r'got (?:a lot|so much|tons) done',
        r'crushed it', r'killed it', r'on a roll', r'got everything done', r'so much done')),
)

NEGATORS = re.compile(r"\b(?:not|no|never|hardly|barely|isn'?t|wasn'?t|didn'?t|don'?t|"
                      r"doesn'?t|aren'?t|weren'?t|without)\b(?:\s+\w+){0,2}\s*$")
BOOST = re.compile(r'\b(?:so|really|very|super|extremely|completely|totally|incredibly)\s*$')

WEEKDAYS = ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')


# ---------------------------------------------------------------------------
# Reading the words
# ---------------------------------------------------------------------------
def _plain(text: str) -> str:
    """Markdown and links stripped, for reading and for quoting."""
    text = re.sub(r'!\[[^\]]*\]\([^)]*\)', ' ', text or '')
    text = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', text)
    text = re.sub(r'[*_`>#~=]+', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def read_words(text: str) -> dict:
    """The feeling words in a piece of writing.

    `{score, kinds: {kind: weight}, words: [matched phrase, ...]}`. `score`
    is the words added up, before any clamping.
    """
    lowered = _plain(text).lower()
    kinds: Dict[str, int] = defaultdict(int)
    words: List[str] = []
    taken: List[Tuple[int, int]] = []
    for kind, (sign, _, patterns) in LEXICON.items():
        for pattern in patterns:
            for match in re.finditer(r'(?<![a-z]){}(?![a-z])'.format(pattern), lowered):
                start, end = match.span()
                if any(start < b and a < end for a, b in taken):
                    continue
                before = lowered[max(0, start - 40):start]
                weight = 2 if BOOST.search(before) else 1
                if NEGATORS.search(before):
                    if sign > 0:
                        # "Not motivated" is a down day, not a driven one.
                        kinds['down'] += weight
                        words.append('not ' + match.group(0))
                    taken.append((start, end))
                    continue
                kinds[kind] += weight
                words.append(match.group(0))
                taken.append((start, end))
    score = sum(LEXICON[kind][0] * weight for kind, weight in kinds.items())
    return {'score': score, 'kinds': dict(kinds), 'words': words}


def claim_in(text: str) -> Optional[Tuple[str, str]]:
    """A line that says how much got done: `(low|high, the sentence)`."""
    plain = _plain(text)
    lowered = plain.lower()
    for side, patterns in CLAIMS:
        for pattern in patterns:
            match = re.search(r'(?<![a-z]){}(?![a-z])'.format(pattern), lowered)
            if not match:
                continue
            # The sentence it sits in, as the reader wrote it.
            start = max(lowered.rfind('.', 0, match.start()), lowered.rfind('!', 0, match.start()),
                        lowered.rfind('?', 0, match.start())) + 1
            ends = [i for i in (lowered.find('.', match.end()), lowered.find('!', match.end()),
                                lowered.find('?', match.end())) if i != -1]
            end = min(ends) + 1 if ends else len(plain)
            quote = plain[start:end].strip()
            if len(quote) > 140:
                quote = quote[:137].rsplit(' ', 1)[0] + '…'
            return side, quote
    return None


# ---------------------------------------------------------------------------
# Days
# ---------------------------------------------------------------------------
def _clamp(value: float) -> int:
    return int(max(-2, min(2, round(value))))


def mood_days(entries: Iterable[dict]) -> Dict[str, dict]:
    """One reading per day that has a Log entry.

    `{day: {mood, source, energy, kinds, words, claim, entries}}`, where
    `mood` is -2..2 or None and `source` is 'said', 'read' or None.
    """
    grouped: Dict[str, List[dict]] = defaultdict(list)
    for entry in entries:
        day = str(entry.get('created_at') or '')[:10]
        if day:
            grouped[day].append(entry)

    out = {}
    for day, rows in grouped.items():
        said = [int(row['mood']) for row in rows
                if isinstance(row.get('mood'), int) and 1 <= row['mood'] <= 5]
        energy = [int(row['energy']) for row in rows
                  if isinstance(row.get('energy'), int) and 1 <= row['energy'] <= 3]
        text = '\n'.join('{} {}'.format(row.get('title') or '', row.get('body') or '') for row in rows)
        read = read_words(text)
        if said:
            mood, source = _clamp(mean(said) - 3), 'said'
        elif read['words']:
            mood, source = _clamp(read['score']), 'read'
        else:
            mood, source = None, None
        out[day] = {
            'mood': mood,
            'source': source,
            'energy': round(mean(energy)) if energy else None,
            'kinds': read['kinds'],
            'words': read['words'],
            'claim': claim_in(text),
            'entries': len(rows),
        }
    return out


def output_days(tasks: Iterable[dict], focus: Dict[str, dict]) -> Dict[str, dict]:
    """What each day did: `{day: {tasks, xp, focus_min, execution}}`."""
    days: Dict[str, dict] = defaultdict(lambda: {'tasks': 0, 'xp': 0, 'focus_min': 0, 'rated': []})
    for task in tasks:
        if task.get('status') != 'done':
            continue
        day = str(task.get('completed_at') or '')[:10]
        if not day:
            continue
        row = days[day]
        row['tasks'] += 1
        row['xp'] += int(float(task.get('xp_value') or 0))
        execution = task.get('execution')
        if isinstance(execution, (int, float)) and 1 <= execution <= 5:
            row['rated'].append(float(execution))
    for day, record in (focus or {}).items():
        seconds = float((record or {}).get('seconds') or 0)
        if seconds > 0:
            days[str(day)[:10]]['focus_min'] = round(seconds / 60)
    out = {}
    for day, row in days.items():
        out[day] = {'tasks': row['tasks'], 'xp': row['xp'], 'focus_min': row['focus_min'],
                    'execution': round(mean(row['rated']), 2) if row['rated'] else None}
    return out


def _empty_day() -> dict:
    return {'tasks': 0, 'xp': 0, 'focus_min': 0, 'execution': None}


def _confidence(*counts: int) -> str:
    low = min(counts)
    if low >= 12:
        return 'solid'
    if low >= 6:
        return 'pattern'
    return 'early'


def _change(value: float, base: float) -> Optional[int]:
    if base <= 0:
        return None
    return int(round((value - base) / base * 100))


def _avg(values: List[float]) -> float:
    return round(mean(values), 1) if values else 0.0


def _shift(day: str, by: int) -> str:
    return (date.fromisoformat(day) + timedelta(days=by)).isoformat()


# ---------------------------------------------------------------------------
# The whole reading
# ---------------------------------------------------------------------------
def _part_of(stamp: str) -> Optional[str]:
    """Which part of the day a timestamp falls in, or None with no time on it."""
    try:
        hour = int(str(stamp)[11:13])
    except ValueError:
        return None
    named = [label for label, start in PARTS if hour >= start]
    return named[-1] if named else PARTS[-1][0]


def _weekday(day: str) -> str:
    return WEEKDAYS[date.fromisoformat(day).weekday()]


def _low_mark(stamp: str, label: str, detail: str) -> dict:
    return {'day': str(stamp)[:10], 'time': str(stamp)[11:16], 'label': label, 'detail': detail}


def _worst(rows: List[dict], field: str) -> Optional[str]:
    """The one row with the most, or None on a tie or too few to tell."""
    top = max((row[field] for row in rows), default=0)
    leaders = [row for row in rows if row[field] == top]
    return leaders[0]['name'] if top >= MIN_DAYS and len(leaders) == 1 else None


def low_times(entries: Iterable[dict], tasks: Iterable[dict], output: Dict[str, dict],
              usual_tasks: float, usual_focus: int, since: str, today_iso: str) -> dict:
    """When energy and output dropped, as a record of moments.

    **Low energy** is a Drained tap on the Log, a tired word in an entry with
    no tap that says otherwise, or a task marked "Low energy" when it was
    rated. **Low productivity** is a finished day under SLOW_SHARE of the usual
    day (a day with deep focus doesn't count), a line like "got nothing done",
    or a study task rated LOW_RATING or lower. Slow days have no time on them; the
    parts of the day come from the rated tasks.
    """
    tired = LEXICON['tired'][2]
    energy, said_low = [], []
    for entry in entries:
        stamp = str(entry.get('created_at') or '')
        if not since <= stamp[:10] <= today_iso:
            continue
        text = '{} {}'.format(entry.get('title') or '', entry.get('body') or '')
        # A check-in with no writing is only ever changed by tapping it, so its
        # last edit is when the tap happened.
        if entry.get('updated_at') and not text.strip():
            stamp = str(entry['updated_at'])
        if entry.get('energy') == 1:
            energy.append(_low_mark(stamp, 'Drained', 'You tapped Drained on the Log.'))
        elif not entry.get('energy'):
            words = [word for word in read_words(text)['words']
                     if any(re.fullmatch(pattern, word) for pattern in tired)]
            if words:
                energy.append(_low_mark(stamp, 'Tired', 'You wrote "{}".'.format(words[0])))
        claim = claim_in(text)
        if claim and claim[0] == 'low':
            said_low.append(_low_mark(stamp, 'You said so', '"{}"'.format(claim[1])))

    rated_by_part: Dict[str, List[int]] = {label: [0, 0] for label, _ in PARTS}
    low_rated = []
    for task in tasks:
        stamp = str(task.get('completed_at') or '')
        if task.get('status') != 'done' or not since <= stamp[:10] <= today_iso:
            continue
        title = str(task.get('title') or 'A task').strip()[:80]
        if task.get('reason') == LOW_ENERGY_REASON:
            energy.append(_low_mark(stamp, 'Low energy', '{} was done on low energy.'.format(title)))
        execution = task.get('execution')
        # A dinner that went badly isn't low productivity.
        if isinstance(execution, (int, float)) and 1 <= execution <= 5 and reviewable(task.get('subject')):
            part = _part_of(stamp)
            if part:
                rated_by_part[part][0] += 1
            if execution <= LOW_RATING:
                if part:
                    rated_by_part[part][1] += 1
                low_rated.append(_low_mark(stamp, 'Rated low', '{} was rated {:g} of 5.'.format(title, execution)))

    # Slow days run from the first day with any work: the empty weeks before an
    # account started aren't slow days.
    started = min((day for day, row in output.items() if row['tasks'] or row['focus_min']), default=today_iso)
    slow_days, day_total = [], defaultdict(int)
    for back in range((date.fromisoformat(today_iso) - date.fromisoformat(max(since, started))).days, 0, -1):
        day = _shift(today_iso, -back)
        did = output.get(day) or _empty_day()
        day_total[_weekday(day)] += 1
        if usual_tasks and did['tasks'] < usual_tasks * SLOW_SHARE \
                and not (usual_focus and did['focus_min'] >= usual_focus):
            slow_days.append(_low_mark(day, 'Slow day', '{} vs. your usual {:g}.'.format(
                '1 task' if did['tasks'] == 1 else '{} tasks'.format(did['tasks']), usual_tasks)))

    def newest(marks: List[dict]) -> List[dict]:
        return sorted(marks, key=lambda mark: (mark['day'], mark['time']), reverse=True)

    energy_parts = [{'name': label, 'count': sum(1 for mark in energy if _part_of(mark['day'] + 'T' + mark['time']) == label)}
                    for label, _ in PARTS]
    energy_days = [{'name': name, 'count': sum(1 for mark in energy if _weekday(mark['day']) == name)}
                   for name in WEEKDAYS]
    slow_by_day = [{'name': name, 'count': sum(1 for mark in slow_days if _weekday(mark['day']) == name),
                    'of': day_total[name]} for name in WEEKDAYS]
    low_parts = [{'name': label, 'rated': rated_by_part[label][0], 'count': rated_by_part[label][1],
                  'share': round(100 * rated_by_part[label][1] / rated_by_part[label][0])
                  if rated_by_part[label][0] else 0}
                 for label, _ in PARTS]
    # Most low ratings would just be the part of the day with the most work, so
    # the worst part is the one with the biggest share.
    fair = [row for row in low_parts if row['rated'] >= MIN_DAYS and row['count']]
    worst_rated = max(fair, key=lambda row: row['share'], default=None)
    tied = worst_rated and sum(1 for row in fair if row['share'] == worst_rated['share']) > 1
    # A couple of points over the rest isn't a finding, the same floor as
    # every other comparison here.
    rated_total = sum(row['rated'] for row in low_parts)
    overall = 100 * len(low_rated) / rated_total if rated_total else 0
    clear = worst_rated and worst_rated['share'] >= overall * (1 + SMALL_CHANGE / 100)
    marks = said_low + low_rated + slow_days
    return {
        'energy': {
            'count': len(energy),
            'parts': energy_parts,
            'weekdays': energy_days,
            'worst_part': _worst(energy_parts, 'count'),
            'worst_day': _worst(energy_days, 'count'),
            'latest': newest(energy)[:LOW_SHOWN],
        },
        'output': {
            'count': len(marks),
            'slow_days': len(slow_days),
            'low_rated': len(low_rated),
            'said': len(said_low),
            'parts': low_parts,
            'weekdays': slow_by_day,
            'worst_part': worst_rated['name'] if clear and not tied else None,
            'worst_day': _worst(slow_by_day, 'count'),
            'latest': newest(marks)[:LOW_SHOWN],
        },
    }


def readings(entries: Iterable[dict], tasks: Iterable[dict], focus: Dict[str, dict],
             today: date = None) -> dict:
    entries, tasks = list(entries), list(tasks)
    today = today or date.today()
    since = (today - timedelta(days=WINDOW_DAYS - 1)).isoformat()
    usual_since = (today - timedelta(days=USUAL_DAYS - 1)).isoformat()
    today_iso = today.isoformat()

    every = {day: row for day, row in mood_days(entries).items() if since <= day <= today_iso}
    # Today isn't over, so its output is half a day's. It's drawn on the
    # timeline and compared with nothing.
    moods = {day: row for day, row in every.items() if day < today_iso}
    output = output_days(tasks, focus)
    day_of = lambda day: output.get(day) or _empty_day()

    # The usual day: the median over active days lately, or over every day
    # with output when the recent stretch is empty.
    active = [row for day, row in output.items()
              if usual_since <= day <= today_iso and (row['tasks'] or row['focus_min'])]
    if not active:
        active = [row for row in output.values() if row['tasks'] or row['focus_min']]
    usual_tasks = round(median([row['tasks'] for row in active]), 1) if active else 0.0
    usual_focus = round(median([row['focus_min'] for row in active])) if active else 0

    rated = {day: row for day, row in moods.items() if row['mood'] is not None}
    said_days = sum(1 for row in rated.values() if row['source'] == 'said')

    # ---- bands -----------------------------------------------------------
    bands = []
    for key, label, test in BANDS:
        days = sorted(day for day, row in rated.items() if test(row['mood']))
        outs = [day_of(day) for day in days]
        executions = [row['execution'] for row in outs if row['execution'] is not None]
        tasks_avg = _avg([row['tasks'] for row in outs])
        bands.append({
            'key': key, 'label': label, 'days': len(days),
            'tasks_avg': tasks_avg,
            'focus_avg': round(mean([row['focus_min'] for row in outs])) if outs else 0,
            'execution_avg': round(mean(executions), 1) if executions else None,
            'vs_usual': _change(tasks_avg, usual_tasks) if days else None,
            'enough': len(days) >= MIN_DAYS,
        })
    by_band = {band['key']: band for band in bands}

    # ---- feelings ----------------------------------------------------------
    feelings = []
    for kind, (sign, label, _) in LEXICON.items():
        with_days = sorted(day for day, row in moods.items() if row['kinds'].get(kind))
        without = [day for day in moods if day not in set(with_days)]
        if len(with_days) < MIN_DAYS or len(without) < MIN_DAYS:
            if with_days:
                feelings.append({'kind': kind, 'label': label, 'days': len(with_days),
                                 'enough': False, 'need': MIN_DAYS})
            continue
        on = _avg([day_of(day)['tasks'] for day in with_days])
        off = _avg([day_of(day)['tasks'] for day in without])
        after = _avg([day_of(_shift(day, 1))['tasks'] for day in with_days
                      if _shift(day, 1) < today_iso])
        words = sorted({word for day in with_days for word in moods[day]['words']
                        if any(re.fullmatch(p, word) for p in LEXICON[kind][2])})[:4]
        feelings.append({
            'kind': kind, 'label': label, 'sign': sign, 'days': len(with_days),
            'other_days': len(without), 'tasks_avg': on, 'other_avg': off,
            'change': _change(on, off), 'next_day_avg': after,
            'next_change': _change(after, usual_tasks),
            'words': words, 'confidence': _confidence(len(with_days), len(without)),
            'enough': True,
        })
    feelings.sort(key=lambda row: (not row['enough'], -abs(row.get('change') or 0)))

    # ---- perception --------------------------------------------------------
    checks = []
    for day in sorted(moods, reverse=True):
        claim = moods[day]['claim']
        if not claim:
            continue
        side, quote = claim
        did = day_of(day)
        verdict = _verdict(side, did, usual_tasks, usual_focus)
        checks.append({'day': day, 'side': side, 'quote': quote, 'tasks': did['tasks'],
                       'focus_min': did['focus_min'], 'usual': usual_tasks, 'verdict': verdict})
        if len(checks) >= CHECKS_SHOWN:
            break
    harsher = sum(1 for row in checks if row['verdict'] == 'harsher')

    # ---- energy ------------------------------------------------------------
    energy = []
    # The Log check-in's own words (frontend/src/components/Log/CheckIn).
    for level, label in ((1, 'Drained'), (2, 'Steady'), (3, 'Charged')):
        days = [day for day, row in moods.items() if row['energy'] == level]
        if days:
            energy.append({'level': level, 'label': label, 'days': len(days),
                           'tasks_avg': _avg([day_of(day)['tasks'] for day in days]),
                           'enough': len(days) >= MIN_DAYS})
    if sum(1 for row in energy if row['enough']) < 2:
        energy = [row for row in energy if row['days']]
        energy_ready = False
    else:
        energy_ready = True

    # ---- recovery ----------------------------------------------------------
    gaps = []
    for day in sorted(day for day, row in rated.items() if row['mood'] <= -1):
        for ahead in range(1, 8):
            later = _shift(day, ahead)
            if later >= today_iso:
                break
            if usual_tasks and day_of(later)['tasks'] >= usual_tasks:
                gaps.append(ahead)
                break
    recovery = ({'days': median(gaps), 'lows': len(gaps)} if len(gaps) >= MIN_DAYS else None)

    # ---- weekdays ----------------------------------------------------------
    by_weekday: Dict[int, List[int]] = defaultdict(list)
    for day, row in rated.items():
        by_weekday[date.fromisoformat(day).weekday()].append(row['mood'])
    weekdays = []
    if len(rated) >= 10:
        for index, name in enumerate(WEEKDAYS):
            values = by_weekday.get(index, [])
            if len(values) >= 2:
                weekdays.append({'day': name, 'mood': round(mean(values), 2), 'days': len(values)})

    # ---- the timeline ------------------------------------------------------
    series = []
    for back in range(SERIES_DAYS - 1, -1, -1):
        day = (today - timedelta(days=back)).isoformat()
        row = every.get(day)
        did = day_of(day)
        series.append({'day': day, 'mood': row['mood'] if row else None,
                       'source': row['source'] if row else None,
                       'tasks': did['tasks'], 'focus_min': did['focus_min']})

    found = {
        'window_days': WINDOW_DAYS,
        'logged_days': len(every),
        'today': ({'mood': every[today_iso]['mood'], 'source': every[today_iso]['source']}
                  if today_iso in every else None),
        'mood_days': len(rated),
        'said_days': said_days,
        'read_days': len(rated) - said_days,
        'usual': {'tasks': usual_tasks, 'focus_min': usual_focus, 'days': USUAL_DAYS},
        'bands': bands,
        'feelings': feelings,
        'checks': checks,
        'harsher': harsher,
        'energy': energy,
        'energy_ready': energy_ready,
        'recovery': recovery,
        'weekdays': weekdays,
        'series': series,
        'low_times': low_times(entries, tasks, output, usual_tasks, usual_focus, since, today_iso),
        'min_days': MIN_DAYS,
        'small_change': SMALL_CHANGE,
    }
    found['headline'] = headline(found, by_band)
    return found


def _verdict(side: str, did: dict, usual: float, usual_focus: int) -> str:
    """How a line about the day's output compares with the day's output."""
    tasks = did['tasks']
    if side == 'low':
        if usual and tasks >= usual:
            return 'harsher'
        if not usual or tasks < usual * 0.5:
            return 'matches'
        return 'close'
    if usual and tasks >= usual:
        return 'matches'
    if usual_focus and did['focus_min'] >= usual_focus:
        return 'deep'
    if usual and tasks < usual * 0.6:
        return 'generous'
    return 'close'


def _num(value: float) -> str:
    """6 rather than 6.0, 2.5 as 2.5."""
    return '{:g}'.format(round(float(value), 1))


def _times(high: float, low: float) -> str:
    if low <= 0:
        return ''
    ratio = high / low
    return '{} times as many'.format(_num(ratio)) if ratio >= 1.5 else ''


def headline(found: dict, by_band: Dict[str, dict]) -> Optional[dict]:
    """The one sentence the section opens on: the strongest thing the days
    show, or what's still needed if they show nothing yet."""
    rough, good = by_band['rough'], by_band['good']
    if rough['enough'] and good['enough'] and rough['tasks_avg'] != good['tasks_avg']:
        gap = _change(good['tasks_avg'], rough['tasks_avg']) if rough['tasks_avg'] else None
        sure = _confidence(rough['days'], good['days'])
        if gap is None or abs(gap) >= SMALL_CHANGE:
            if good['tasks_avg'] > rough['tasks_avg']:
                times = _times(good['tasks_avg'], rough['tasks_avg'])
                text = 'On good days you finish {} tasks. On rough days, just {}.{}'.format(
                    _num(good['tasks_avg']), _num(rough['tasks_avg']),
                    ' That\'s {}.'.format(times) if times else '')
            else:
                text = ('You get more done on rough days: {} tasks vs. {} on good days. '
                        'Hard days seem to push you to work.').format(
                            _num(rough['tasks_avg']), _num(good['tasks_avg']))
            return {'text': text, 'tone': 'insight', 'confidence': sure}
        return {'text': 'Rough days and good days look about the same: '
                        '{} tasks vs. {}. Bad days don\'t seem to slow you down.'.format(
                            _num(rough['tasks_avg']), _num(good['tasks_avg'])),
                'tone': 'steady', 'confidence': sure}

    strong = [row for row in found['feelings'] if row.get('enough') and row.get('change') is not None
              and abs(row['change']) >= SMALL_CHANGE]
    if strong:
        row = strong[0]
        direction = 'more' if row['change'] > 0 else 'fewer'
        return {'text': 'On days you write that you feel {}, you finish {}% {} tasks.'.format(
                    row['label'].lower(), abs(row['change']), direction),
                'tone': 'insight', 'confidence': row['confidence']}

    if found['harsher'] >= 2:
        return {'text': 'You\'re harder on yourself than your numbers are. {} times you wrote that '
                        'the day was a write-off and still did your usual or more.'.format(found['harsher']),
                'tone': 'insight', 'confidence': 'early'}

    need = max(0, MIN_DAYS * 2 - found['mood_days'])
    if found['mood_days'] == 0:
        return None
    return {'text': '{} days with a mood so far. A few more{} and this starts showing how your '
                    'mood and your work move together.'.format(
                        found['mood_days'], ' ({} or so)'.format(need) if need else ''),
            'tone': 'building', 'confidence': 'early'}


def brief_lines(found: dict) -> List[str]:
    """The findings worth a model's attention, as lines for an AI brief.

    Only what has at least a pattern's worth of days behind it.
    """
    lines = []
    head = found.get('headline')
    if head and head.get('tone') != 'building' and head.get('confidence') != 'early':
        lines.append('Mood vs output: {}'.format(head['text']))
    for row in found.get('feelings') or []:
        if row.get('enough') and row.get('confidence') != 'early' and row.get('change') is not None \
                and abs(row['change']) >= SMALL_CHANGE:
            lines.append('On days they write about feeling {}, they finish {}% {} tasks ({} days).'.format(
                row['label'].lower(), abs(row['change']), 'more' if row['change'] > 0 else 'fewer',
                row['days']))
    return lines[:3]


def entry_rows(rows: Iterable[dict]) -> List[dict]:
    """Just the columns this module reads."""
    return [{key: row.get(key) for key in ('title', 'body', 'mood', 'energy', 'created_at', 'updated_at')}
            for row in rows]

