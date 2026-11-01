"""Why a dated goal is where it is, read from the work itself.

The forecast (backend/tracking/forecast.py) says when a goal finishes at this
pace. This says why: one lead sentence naming the main cause, and up to five
short points behind it. "Will you make it?" draws both. Nothing here calls a
model, so the same work always gets the same answer.

## What it looks at

- **Task names.** A finished task is direct work on a goal when it's linked to
  it, names its contest or course, sits on its syllabus, or shares a real word
  with its title or checkpoints ("Violin lesson" for "Violin ARCT"). Everything
  else in the goal's subject is only nearby. See `is_direct`.
- **The next step.** Whether anything lately names the first step still open.
- **Slowing down.** The last two weeks on the goal against the two before, and
  against all your work over the same days, which says if it's this goal or
  everything.
- **When it gets done.** Which part of the day and which days, and whether the
  ratings are better at one time than another.
- **How it's going.** Ratings on this work moving down, the struggle reason you
  pick most, the topic rated lowest, and booked sessions sitting overdue.

Each point waits for its own floor, so a thin goal gets fewer points and no
guesses.
"""
from collections import Counter, defaultdict
from datetime import timedelta
from functools import lru_cache
from statistics import mean

from backend.tracking import next_sessions, record
from backend.tracking import topics as topic_tracking
from backend.tracking.mood import PARTS, WEEKDAYS, _part_of

#: How far back "lately" reads.
RECENT_DAYS = 28
#: Each side of the slowing-down comparison.
TREND_DAYS = 14
#: Fewer sessions than this on the earlier side and there's no slowdown to call.
TREND_FLOOR = 3
#: This share of the two weeks before is a real drop.
DROP_SHARE = 0.6
#: How far back the timing and the ratings read.
HABIT_DAYS = 90
#: Sessions needed before saying when the work happens.
TIMING_FLOOR = 5
#: Rated sessions needed on each side of a ratings comparison.
RATED_FLOOR = 3
#: Gap in rating points that's worth saying.
RATING_GAP = 0.5
#: Below this share of a subject's work, the goal isn't getting the subject's time.
DIRECT_SHARE = 0.5
#: Points shown under the lead.
MOST_POINTS = 5

#: Words in goal titles that say nothing about what the work is.
GENERIC = frozenset(topic_tracking.words('''
    reach become build earn get complete finish master learn improve start make
    from scratch rating score level users user first second third goal target
    solved without fluent unassisted hints consistent sat cleared ready present
    core features feature launch page
'''))


@lru_cache(maxsize=20000)
def _title_facts(title, subject):
    """A task name's words, the contests it names and the topic it files under."""
    return (frozenset(word for word in topic_tracking.words(title)
                      if len(word) >= 3 and word not in GENERIC and word not in topic_tracking.STOP),
            tuple(topic_tracking.contexts_in(title)),
            topic_tracking.classify(title, '', subject or '')['topic'])


def _real_titles(goal):
    """The goal's checkpoint and step titles, leaving out the stand-ins."""
    from backend.api.goals import PLACEHOLDERS  # goals.py imports record
    found = []
    for stone in goal.get('milestones') or []:
        found.append(str(stone.get('title') or ''))
        found += [str(step.get('title') or '') for step in stone.get('steps') or []
                  if isinstance(step, dict) and str(step.get('title') or '').strip() not in PLACEHOLDERS]
    return [title for title in found if title.strip()]


def _terms(text):
    return frozenset(word for word in topic_tracking.words(text)
                     if len(word) >= 3 and word not in GENERIC and word not in topic_tracking.STOP)


def goal_terms(goal):
    """What a goal is about, ready for `is_direct`."""
    scope = topic_tracking.scope(goal)
    steps = frozenset()
    for title in _real_titles(goal):
        steps |= _terms(title)
    return {'title': _terms(str(goal.get('title') or '')), 'steps': steps,
            'contexts': tuple(scope['contexts']),
            'topics': frozenset(scope['syllabus']) | frozenset(scope['also'])}


def is_direct(task, goal, terms):
    """Whether this task is work on this goal, going by its link and its name."""
    if record._links(task, goal.get('id')):
        return True
    title = str(task.get('title') or '')
    if not title.strip():
        return False
    words, contexts, topic = _title_facts(title, task.get('subject') or '')
    if words & terms['title']:
        return True
    if any(one.startswith(mine) or mine.startswith(one) for one in contexts for mine in terms['contexts']):
        return True
    if topic and topic in terms['topics']:
        return True
    return len(words & terms['steps']) >= 2


def next_step(goal):
    """The first step still open, by its title, or None if none has a real one."""
    from backend.api.goals import PLACEHOLDERS  # goals.py imports record
    for stone in sorted(goal.get('milestones') or [], key=lambda one: one.get('position') or 0):
        if stone.get('status') == 'done':
            continue
        for step in stone.get('steps') or []:
            title = str(step.get('title') or '').strip() if isinstance(step, dict) else ''
            if title and title not in PLACEHOLDERS and not step.get('done'):
                return title
        return str(stone.get('title') or '').strip() or None
    return None


# --------------------------------------------------------------------------
# Words
# --------------------------------------------------------------------------
def _count(number, word):
    return '{} {}{}'.format(number, word, '' if number == 1 else 's')


def _num(value):
    return '{:g}'.format(round(float(value), 1))


def _ago(day, today):
    gap = (today - day).days
    if gap >= 365:
        return 'over {} ago'.format(_count(gap // 365, 'year'))
    if gap >= 60:
        return 'about {} months ago'.format(round(gap / 30))
    return 'today' if gap == 0 else 'yesterday' if gap == 1 else '{} days ago'.format(gap)


def _in_part(name):
    return {'Morning': 'in the morning', 'Afternoon': 'in the afternoon',
            'Evening': 'in the evening', 'Late hours': 'late at night'}[name]


def _rating(task):
    value = task.get('execution')
    return float(value) if isinstance(value, (int, float)) and 1 <= value <= 5 else None


def _finished_on(task):
    return record._day(task.get('completed_at')) if task.get('status') == 'done' else None


def _between(rows, today, start_back, stop_back):
    """Rows finished from `start_back` days ago up to `stop_back` days ago."""
    return [task for task in rows
            if (day := _finished_on(task)) and stop_back <= (today - day).days < start_back]


# --------------------------------------------------------------------------
# The points
# --------------------------------------------------------------------------
def _session_word(count, subject_name):
    return '{} {}'.format(subject_name, 'session' if count == 1 else 'sessions')


def _direct_point(direct, nearby, subject_name):
    if not direct and not nearby:
        return None
    if not nearby:
        return {'label': 'Direct work', 'tone': 'good',
                'text': 'All {} lately went right at this goal.'.format(_count(len(direct), 'session'))}
    total = len(direct) + len(nearby)
    top = Counter(next_sessions.name_family(task.get('title')) for task in nearby).most_common(2)
    names = ' and '.join(name for name, _ in top)
    if len(direct) / total >= DIRECT_SHARE:
        return {'label': 'Direct work', 'tone': 'good',
                'text': '{} of your {} {} sessions lately went right at this goal.'.format(
                    len(direct), total, subject_name)}
    if not direct:
        return {'label': 'Direct work', 'tone': 'bad',
                'text': 'None of your {} {} lately went at this goal. They went to {}.'.format(
                    total, _session_word(total, subject_name), names)}
    return {'label': 'Direct work', 'tone': 'bad',
            'text': 'Only {} of your {} {} sessions lately went at this goal. The rest went to {}.'.format(
                len(direct), total, subject_name, names)}


def _step_point(goal, direct, terms_of):
    step = next_step(goal)
    if not step:
        return None
    wanted = terms_of(step)
    if not wanted:
        return None
    hits = [task for task in direct
            if wanted & _title_facts(str(task.get('title') or ''), task.get('subject') or '')[0]]
    if hits:
        return {'label': 'Next step', 'tone': 'good',
                'text': '{} lately named your next step: {}.'.format(_count(len(hits), 'task'), step)}
    return {'label': 'Next step', 'tone': 'bad',
            'text': 'Nothing lately names your next step: {}.'.format(step)}


def _slump_point(direct_rows, all_done, today):
    now = len(_between(direct_rows, today, TREND_DAYS, 0))
    was = len(_between(direct_rows, today, TREND_DAYS * 2, TREND_DAYS))
    if was < TREND_FLOOR or now > was * DROP_SHARE:
        return None, False
    all_now = len(_between(all_done, today, TREND_DAYS, 0))
    all_was = len(_between(all_done, today, TREND_DAYS * 2, TREND_DAYS))
    everything = all_was > 0 and all_now <= all_was * DROP_SHARE
    if everything:
        text = '{} in the last two weeks, down from {}. All your work fell too ({} tasks, down from {}), so this is a bigger slump.'.format(
            _count(now, 'session'), was, all_now, all_was)
    else:
        text = '{} in the last two weeks, down from {}. The rest of your work held up ({} tasks vs. {}), so this goal got pushed out.'.format(
            _count(now, 'session'), was, all_now, all_was)
    return {'label': 'Slump', 'tone': 'bad', 'text': text}, everything


def _timing_point(rows):
    stamped = [task for task in rows if str(task.get('completed_at') or '')[11:13]]
    if len(stamped) < TIMING_FLOOR:
        return None
    parts = defaultdict(list)
    days = Counter()
    for task in stamped:
        parts[_part_of(task['completed_at'])].append(task)
        days[record._day(task['completed_at']).weekday()] += 1
    usual, usual_rows = max(parts.items(), key=lambda item: len(item[1]))
    text = 'You mostly do this {} ({} of {})'.format(_in_part(usual), len(usual_rows), len(stamped))
    top_days = [WEEKDAYS[index] for index, count in days.most_common(2) if count >= 2]
    text += ', usually on {}.'.format(' and '.join(top_days)) if top_days else '.'

    rated = {name: [value for value in map(_rating, parts.get(name, [])) if value is not None]
             for name, _ in PARTS}
    fair = {name: mean(values) for name, values in rated.items() if len(values) >= RATED_FLOOR}
    tone = 'flat'
    if len(fair) >= 2:
        best = max(fair, key=fair.get)
        worst = min(fair, key=fair.get)
        if fair[best] - fair[worst] >= RATING_GAP:
            text += ' It goes better {}: {} of 5 vs. {} {}.'.format(
                _in_part(best), _num(fair[best]), _num(fair[worst]), _in_part(worst))
            tone = 'bad' if usual == worst else 'good'
    return {'label': 'Timing', 'tone': tone, 'text': text}


def _quality_point(rows, today):
    recent = [value for value in map(_rating, _between(rows, today, TREND_DAYS * 2, 0)) if value is not None]
    earlier = [value for value in map(_rating, _between(rows, today, HABIT_DAYS, TREND_DAYS * 2)) if value is not None]
    if len(recent) >= RATED_FLOOR and len(earlier) >= RATED_FLOOR and mean(earlier) - mean(recent) >= RATING_GAP:
        return {'label': 'How it went', 'tone': 'bad',
                'text': 'Your ratings on this dropped to {} of 5, down from {}.'.format(
                    _num(mean(recent)), _num(mean(earlier)))}
    reasons = Counter(next_sessions.STRUGGLES[task['reason']] for task in rows
                      if task.get('reason') in next_sessions.STRUGGLES)
    if reasons and reasons.most_common(1)[0][1] >= RATED_FLOOR:
        label, count = reasons.most_common(1)[0]
        return {'label': 'How it went', 'tone': 'bad',
                'text': 'The reason you pick most on this work: {} ({} times).'.format(label.lower(), count)}
    return None


def _topic_point(rows):
    """The topic rated lowest in this work, when it's well under the rest."""
    tax = topic_tracking.taxonomy()
    groups = defaultdict(list)
    every = []
    for task in rows:
        value = _rating(task)
        if value is None:
            continue
        every.append(value)
        topic = _title_facts(str(task.get('title') or ''), task.get('subject') or '')[2]
        if topic:
            groups[topic].append(value)
    fair = {topic: values for topic, values in groups.items() if len(values) >= RATED_FLOOR}
    if not fair or len(every) < RATED_FLOOR * 2:
        return None
    topic = min(fair, key=lambda one: mean(fair[one]))
    if mean(every) - mean(fair[topic]) < RATING_GAP:
        return None
    return {'label': 'Weak spot', 'tone': 'bad',
            'text': '{} is your lowest here: {} of 5 vs. {} on everything else for this goal.'.format(
                tax.label(topic), _num(mean(fair[topic])), _num(mean(every)))}


def _overdue_point(goal, tasks, terms, today):
    late = [task for task in tasks if task.get('status') != 'done'
            and (day := record._day(task.get('due_date'))) and day < today and is_direct(task, goal, terms)]
    if not late:
        return None
    return {'label': 'Overdue', 'tone': 'bad',
            'text': '{} on this {} past due and still open.'.format(
                _count(len(late), 'task'), 'is' if len(late) == 1 else 'are')}


# --------------------------------------------------------------------------
# The lead
# --------------------------------------------------------------------------
def _lead(row, today, direct, nearby, slump, everything, last_day, subject_name):
    from backend.tracking.forecast import say_day
    state = row['state']
    per_week, need = row.get('per_week'), row.get('need_per_week')
    finish = record._day(row.get('finish'))
    ends = record._day(row.get('deadline'))
    late = (finish - ends).days if finish and ends else 0
    total = len(direct) + len(nearby)
    off_target = total >= TIMING_FLOOR and len(direct) / total < DIRECT_SHARE

    if state == 'stalled':
        if last_day:
            head = 'No session on this since {}.'.format(say_day(last_day, today))
        else:
            head = 'No session on this lately.'
        if nearby:
            return '{} You kept going on other {} work, so it got pushed out.'.format(head, subject_name)
        return head
    if state == 'behind':
        if row.get('out_of_reach'):
            return "It's too much for the time left, even at two sessions a day. Think about moving the date."
        when = "You'd finish {} {} late".format(late, 'day' if late == 1 else 'days') if 0 < late < 3650 \
            else "You'd miss the date by a long way"
        if off_target:
            return '{} because most of your {} time isn\'t going to this.'.format(when, subject_name)
        if slump and everything:
            return '{} because all your work slowed down lately.'.format(when)
        if slump:
            return '{} because you\'ve slowed down on this one.'.format(when)
        if per_week is not None and need is not None:
            return '{} because you do {} a week and it needs {}.'.format(
                when, _count_float(per_week), _num(need))
        return '{}.'.format(when)
    if state == 'on_track':
        lead = "You'll make it because you do {} a week and it only needs {}.".format(
            _count_float(per_week), _num(need))
        if finish and ends and late < 0:
            lead += ' That finishes {} early.'.format(_count(-late, 'day'))
        return lead
    # 'done' and 'missing' already say the one thing that matters.
    text = row['line']
    prefix = 'Due {}. '.format(say_day(ends, today)) if ends else ''
    return text[len(prefix):] if prefix and text.startswith(prefix) else text


def _count_float(value):
    return '{} {}'.format(_num(value), 'session' if round(float(value), 1) == 1 else 'sessions')


def read(goal, tasks, row, today, name_of=lambda key: key):
    """`{lead, points}` for one goal. `row` is its forecast."""
    if row['state'] == 'done':
        return {'lead': _lead(row, today, [], [], None, False, None, ''), 'points': []}

    terms = goal_terms(goal)
    subjects = record.subject_ids(goal)
    done = [task for task in tasks if task.get('status') == 'done' and task.get('completed_at')]
    direct_all = [task for task in done if is_direct(task, goal, terms)]
    direct = _between(direct_all, today, RECENT_DAYS, 0)
    direct_ids = {str(task.get('id')) for task in direct}
    # The subject this work is really filed under, which can differ from the one
    # linked to the goal. That's what it's competing with for time.
    filed = Counter(task.get('subject') for task in (direct or direct_all) if task.get('subject'))
    area = [filed.most_common(1)[0][0]] if filed else subjects
    subject_name = ', '.join(name_of(one) for one in area[:2]) or 'other'
    nearby = [task for task in _between(done, today, RECENT_DAYS, 0)
              if task.get('subject') in area and str(task.get('id')) not in direct_ids]
    habit = _between(direct_all, today, HABIT_DAYS, 0)
    last_day = max((_finished_on(task) for task in direct_all), default=None)

    slump, everything = _slump_point(direct_all, done, today)
    last = ({'label': 'Last session', 'tone': 'bad',
             'text': 'Your last task on this was {}.'.format(_ago(last_day, today))}
            if not direct and last_day else None)
    timing = _timing_point(habit)
    points = [point for point in (
        last, slump, _direct_point(direct, nearby, subject_name), _step_point(goal, direct, _terms),
        _overdue_point(goal, tasks, terms, today), _topic_point(habit), _quality_point(habit, today),
    ) if point]
    # When the work happens always makes the cut, whatever else there is to say.
    points = points[:MOST_POINTS - 1 if timing else MOST_POINTS] + ([timing] if timing else [])
    return {'lead': _lead(row, today, direct, nearby, slump, everything, last_day, subject_name),
            'points': points}
