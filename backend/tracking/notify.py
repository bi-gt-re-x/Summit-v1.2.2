"""Notifications: the rules that decide the app has something to say.

## Derived, never scheduled

There is no job runner here, so nothing writes a notification at 3am about a
state that has since changed. `sweep` runs when somebody asks for the list,
reads the record as it stands, and writes down what is true *now*. An account
in good order comes back with nothing, which is the whole reason a badge on the
bell is worth looking at — see the note in frontend/src/components/Topbar.tsx,
where that argument was already being made about a bell with three derived
counts behind it.

This is that bell grown up. What it could not do before is the part a reader
actually wants: keep a notification around after the fact that caused it has
moved, say something about the week rather than the minute, and — above all —
be thrown away. A derived count cannot be deleted, because there is nothing to
delete; it is recomputed on the next render and it is back.

## The fingerprint is what makes a delete stick

Every candidate below carries one, and it names the *situation* rather than the
moment: 'overdue:2026-09-01', 'goal-due:1755:2026-09-01', 'streak-milestone:30'.
The insert ignores a collision, so a sweep that finds the same situation on
every poll writes one row and then nothing. Deleting that row leaves a
tombstone under the same fingerprint (data/sql/notifications.sql), so the sweep
cannot put it back — and the bell stays empty until something genuinely new
turns up, which is exactly what the reader asked for by deleting it.

The day-scoped ones are the awkward case: "3 tasks are past their date" is true
all day and the 3 moves. Putting the count in the fingerprint would mean a new
notification every time a task was finished, so the count is not in it and the
row's words are brought up to date in place instead (`db.refresh_notification`).
One overdue notification a day, always current, and deletable for good.

They also end with their day. Each carries `for_day`, and the sweep retires the
live ones whose day has passed (`db.retire_notifications`) — otherwise a reader
who leaves three tasks late for a week finds seven notifications about them,
six of which are stale counts.

## The first sweep says nothing about the past

An account that has been using the app for a year has a level, a streak and a
shelf of badges, none of which are news. So the first sweep an account ever
gets writes the one-shot situations — a level reached, a milestone passed, a
badge earned — straight to the tombstone state: remembered, never shown. The
ongoing ones (what is late, what is on today, how the week went) are shown,
because those are about now rather than about a backlog.

## Six channels, six switches

Each candidate declares a channel, and Settings has a switch per channel plus a
master one — see FIELDS in backend/api/settings.py. A channel that is off is
never swept, so turning one off does not just hide its notifications; it stops
writing them, and turning it back on starts from the situations that are true
then rather than replaying two weeks.
"""
from datetime import date, timedelta

from backend.database import connection as db
from backend.tracking import xp as xp_tracking

#: The switchable groups. Mirrors the `notify_*` keys in
#: backend/api/settings.py and CHANNELS in frontend/src/services/notifications.ts.
CHANNELS = ('tasks', 'calendar', 'analytics', 'goals', 'streak', 'progress')

#: Situations that describe a moving count and so are worth rewording in place
#: rather than re-raising. Everything else is a fact that does not change once
#: it is true. Matched on the part of the fingerprint before the first colon.
REFRESHABLE = ('overdue', 'due-today', 'due-tomorrow', 'calendar-today')

#: Where a fingerprint has no more chance of recurring, so its tombstone is
#: holding nothing back. Comfortably past the longest-lived day-scoped key.
TOMBSTONE_DAYS = 60

#: Streak lengths worth saying something about. Round enough to feel earned and
#: far enough apart that the app is not applauding every other morning.
STREAK_MILESTONES = (3, 7, 14, 30, 50, 75, 100, 150, 200, 365)

#: How long a gap has to be before the app mentions it. Two days off is a
#: weekend; four is a habit coming apart, and that is worth one sentence.
QUIET_DAYS = 4

#: How near a goal's deadline has to be before it is raised as a deadline.
GOAL_SOON_DAYS = 7

#: How far ahead the calendar looks for "your next block". An hour: near enough
#: that the reader can still do something about it.
CALENDAR_SOON_MINUTES = 60


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------
def _day(value, fallback=None):
    """A `YYYY-MM-DD` string as a date, or `fallback` if it is not one."""
    try:
        return date.fromisoformat(str(value or '')[:10])
    except ValueError:
        return fallback


def _minutes(value):
    """'HH:MM' as minutes past midnight, or None."""
    text = str(value or '').strip()
    if len(text) < 4 or ':' not in text:
        return None
    hours, _, mins = text.partition(':')
    try:
        return int(hours) * 60 + int(mins[:2])
    except ValueError:
        return None


def _clock(minutes):
    """Minutes past midnight back as 'HH:MM'."""
    return '{:02d}:{:02d}'.format((minutes // 60) % 24, minutes % 60)


def _count(number, singular, plural=None):
    """"1 task" / "4 tasks", with the number written out."""
    word = singular if number == 1 else (plural or singular + 's')
    return '{:,} {}'.format(number, word)


def _hours(seconds):
    """Focus seconds as the phrase the analytics page would use."""
    hours = round((seconds or 0) / 3600, 1)
    return '{:g}h'.format(hours)


def _change(now, before):
    """"12 more than the week before", "9 fewer", or "the same"."""
    if before == now:
        return 'the same as the week before'
    return '{:,} {} than the week before'.format(
        abs(now - before), 'more' if now > before else 'fewer')


def _calendar_key(when):
    """The unpadded `YYYY-M-D` key the calendar document is written under.

    Deliberately not ISO. The store has always used this shape and every
    calendar any account has is keyed by it — see the warning in
    frontend/src/utils/calendarStore.ts.
    """
    return '{}-{}-{}'.format(when.year, when.month, when.day)


# --------------------------------------------------------------------------
# The candidates, one channel at a time
# --------------------------------------------------------------------------
def _task_candidates(facts, day):
    out = []
    if facts['late']:
        out.append({
            'fingerprint': 'overdue:{}'.format(day),
            'channel': 'tasks',
            'tone': 'urgent',
            'for_day': day,
            'title': '{} past its date'.format(_count(facts['late'], 'task'))
                     if facts['late'] == 1
                     else '{} past their dates'.format(_count(facts['late'], 'task')),
            'body': 'Including “{}”. Give it a new date or finish it.'.format(
                facts['late_title'] or 'one of them'),
            'link': '/tasks',
        })

    if facts['due_today']:
        out.append({
            'fingerprint': 'due-today:{}'.format(day),
            'channel': 'tasks',
            'tone': 'warn',
            'for_day': day,
            'title': '{} due today'.format(_count(facts['due_today'], 'task')),
            'body': 'Starting with “{}”.'.format(facts['due_today_title'] or ''),
            'link': '/tasks',
        })

    if facts['due_tomorrow']:
        out.append({
            'fingerprint': 'due-tomorrow:{}'.format(day),
            'channel': 'tasks',
            'tone': 'info',
            'for_day': day,
            'title': '{} due tomorrow'.format(_count(facts['due_tomorrow'], 'task')),
            'body': 'Including “{}”. Today is when there is still room for it.'.format(
                facts['due_tomorrow_title'] or ''),
            'link': '/tasks',
        })
    return out


def _calendar_candidates(username, day, now_minutes):
    """What is on the reader's own calendar today, and what is about to start.

    The calendar is a per-account document rather than a table of events —
    `db.calendar_document`, and data/sql/events.sql for why — so this reads the
    one day it needs out of it rather than aggregating in SQL like everything
    else here.
    """
    today = _day(day)
    if not today:
        return []

    document = db.calendar_document(username)
    entry = document.get(_calendar_key(today)) or {}
    blocks = [b for b in (entry.get('timestamps') or [])
              if isinstance(b, dict) and not b.get('isDashboardTask')]
    if not blocks:
        return []

    timed = sorted(
        ((_minutes(b.get('startTime')), b) for b in blocks
         if _minutes(b.get('startTime')) is not None),
        key=lambda pair: pair[0])

    out = [{
        'fingerprint': 'calendar-today:{}'.format(day),
        'channel': 'calendar',
        'tone': 'info',
        'for_day': day,
        'title': '{} on today’s calendar'.format(_count(len(blocks), 'block')),
        'body': 'First up: “{}” at {}.'.format(
            timed[0][1].get('task') or 'an event', _clock(timed[0][0]))
            if timed else 'None of them have a time on them yet.',
        'link': '/calendar/day',
    }]

    # The next one to start, if it starts soon enough to be worth saying. Only
    # when the caller sent its clock: without one there is no "soon".
    if now_minutes is not None:
        for start, block in timed:
            if now_minutes <= start <= now_minutes + CALENDAR_SOON_MINUTES:
                out.append({
                    'fingerprint': 'calendar-soon:{}:{}'.format(day, _clock(start)),
                    'channel': 'calendar',
                    'tone': 'warn',
                    'for_day': day,
                    'title': '“{}” starts at {}'.format(
                        block.get('task') or 'An event', _clock(start)),
                    'body': 'In {}.'.format(
                        _count(max(1, start - now_minutes), 'minute')),
                    'link': '/calendar/day',
                })
                break
    return out


def _analytics_candidates(facts, day):
    """The three things the record can say that a count cannot.

    None of them is urgent and none of them is a nudge about doing better —
    that was the line drawn when the bell held three counts, and it holds. A
    week that went well and a week that did not are both reported the same way:
    the figures, and what they are next to.
    """
    today = _day(day)
    out = []

    # One digest per ISO week, on whichever day the account first turns up in
    # it. A week is the shortest window where a change means anything.
    #
    # Only when there is something in either week to report. Two weeks of
    # zeroes is not a summary of anything, and telling a brand new account that
    # it finished no tasks and earned no XP is the app's first sentence to
    # somebody who has not had a chance to do either.
    if (facts['done_this_week'] or facts['done_last_week']
            or facts['xp_this_week'] or facts['focus_this_week']):
        year, week, _ = today.isocalendar()
        out.append({
            'fingerprint': 'week-review:{}-W{:02d}'.format(year, week),
            'channel': 'analytics',
            'tone': 'info',
            'title': 'Your last seven days',
            'body': '{} finished, {} — {:,} XP and {} focused.'.format(
                _count(facts['done_this_week'], 'task'),
                _change(facts['done_this_week'], facts['done_last_week']),
                int(facts['xp_this_week']),
                _hours(facts['focus_this_week'])),
            'link': '/analytics',
        })

    # A gap, stated rather than scolded about.
    last = _day(facts.get('last_active_day'))
    if last and (today - last).days >= QUIET_DAYS:
        out.append({
            'fingerprint': 'quiet:{}'.format(day),
            'channel': 'analytics',
            'tone': 'warn',
            'for_day': day,
            'title': 'Nothing recorded since {}'.format(last.strftime('%-d %B')),
            'body': '{} with no XP on them. The consistency score reads the '
                    'gap, so the way back is one task rather than a big day.'.format(
                        _count((today - last).days, 'day')),
            'link': '/analytics',
        })

    # The one piece of good news the ledger can prove.
    if facts['xp_today'] and facts['xp_today'] > facts['xp_best_day'] > 0:
        out.append({
            'fingerprint': 'best-day:{}'.format(day),
            'channel': 'analytics',
            'tone': 'good',
            'for_day': day,
            'title': 'Best day you have had',
            'body': '{:,} XP today, past the {:,} that stood before it.'.format(
                int(facts['xp_today']), int(facts['xp_best_day'])),
            'link': '/analytics',
        })
    return out


def _goal_candidates(facts, day):
    today = _day(day)
    out = []
    for goal in facts['goals']:
        title = goal.get('title') or 'A goal'
        progress = int(goal.get('progress') or 0)
        deadline = _day(goal.get('deadline'))

        if progress >= 100:
            out.append({
                'fingerprint': 'goal-done:{}'.format(goal['id']),
                'channel': 'goals',
                'tone': 'good',
                'title': '“{}” is finished'.format(title),
                'body': 'Every part of it is done. It is still open — close it '
                        'when you want it off the ladder.',
                'link': '/goals',
            })
            continue

        if not deadline:
            continue

        left = (deadline - today).days
        if left < 0:
            out.append({
                'fingerprint': 'goal-overdue:{}:{}'.format(goal['id'], day),
                'channel': 'goals',
                'tone': 'urgent',
                'for_day': day,
                'title': '“{}” is past its date'.format(title),
                'body': '{} ago, and it stands at {}%. Move the date or cut '
                        'the target — a goal nobody moves is one nobody '
                        'reads.'.format(_count(-left, 'day'), progress),
                'link': '/goals',
            })
        elif left <= GOAL_SOON_DAYS:
            out.append({
                'fingerprint': 'goal-due:{}:{}'.format(goal['id'], deadline.isoformat()),
                'channel': 'goals',
                'tone': 'warn',
                'title': '“{}” is due in {}'.format(title, _count(left, 'day'))
                         if left else '“{}” is due today'.format(title),
                'body': 'It stands at {}%.'.format(progress),
                'link': '/goals',
            })
    return out


def _long_day(day):
    """'October 29' — no year, since every date these name is within a month."""
    return '{:%B} {}'.format(day, day.day)


def _streak_candidates(user, facts, day):
    """The streak's notifications, read off the streak as the reader's day leaves it.

    `user` is the row as stored, which may be a night behind: the decay runs on
    `/api/stats` (backend/api/dashboard.py), and nothing orders that call
    before this one. So the streak is refreshed here on a copy, for `day`, and
    never written — a run that ended overnight is not warned about, and a grace
    day spent overnight is reported the first time anybody looks.
    """
    today = date.fromisoformat(day)
    live = dict(user)
    xp_tracking.refresh_streak(live, today)
    streak = int(live.get('current_streak') or 0)
    finished = facts['finished_today']
    out = []

    # Today's warning. Never on a vacation day — that is what the vacation is
    # for — and worded for the first day back when one has just ended, so the
    # reader gets one notification about it rather than two.
    if streak and not finished and not xp_tracking.on_vacation(live, today):
        # "It resets at midnight" is only true when there is no grace day to
        # catch it. Said to a run that would survive the night, it is a false
        # alarm — and a warning that cries wolf is one people learn to swipe.
        covered = xp_tracking.grace_covers_today(live, today)
        keeps = ('If today slips, your grace day covers it.' if covered
                 else 'It resets at midnight.')
        back = [last for _, last in xp_tracking.vacations(live)
                if last == today - timedelta(days=1)]
        if back:
            out.append({
                'fingerprint': 'vacation-over:{}'.format(back[0].isoformat()),
                'channel': 'streak',
                'tone': 'info',
                'for_day': day,
                'title': 'Welcome back — your {}-day streak is live again'.format(streak),
                'body': 'Your vacation ended yesterday. Anything finished today '
                        'carries the run on. {}'.format(keeps),
                'link': '/dashboard',
            })
        else:
            out.append({
                'fingerprint': 'streak-risk:{}'.format(day),
                'channel': 'streak',
                'tone': 'warn' if covered else 'urgent',
                'for_day': day,
                'title': 'Your {}-day streak has nothing on it yet'.format(streak),
                'body': ('Anything finished today adds to it. {}'.format(keeps)
                         if covered else
                         'Anything finished today keeps it. {}'.format(keeps)),
                'link': '/dashboard',
            })

    # The save itself. Raised once per forgiven day, from the morning after it
    # (when the run is first seen to have survived) through the day after
    # that, so somebody who did not open the app on the first morning still
    # hears about it.
    grace = xp_tracking.parse_day(live.get('streak_grace_day'))
    if streak and grace and 1 <= (today - grace).days <= 2:
        still_to_do = (today - grace).days == 1 and not finished
        out.append({
            'fingerprint': 'grace-saved:{}'.format(grace.isoformat()),
            'channel': 'streak',
            'tone': 'good',
            'title': 'Your grace day saved your {}-day streak'.format(streak),
            'body': 'You missed {:%A}, and the run carried on.{} Your next grace '
                    'day is ready from {}.'.format(
                        grace,
                        ' Finish something today to keep it going.' if still_to_do else '',
                        _long_day(xp_tracking.grace_back_on(grace))),
            'link': '/dashboard',
        })

    if streak in STREAK_MILESTONES:
        best = 'Your best is {}.'.format(
            _count(int(live.get('best_streak') or streak), 'day'))
        if streak == xp_tracking.GRACE_EARNED_AT:
            # The day the grace day is earned. Saying so here, rather than in a
            # notification of its own, is what makes it read as the reward for
            # the week rather than as one more thing in the bell.
            best += (' You have also earned a grace day: from now on, a single '
                     'missed day will not end the run.')
        out.append({
            'fingerprint': 'streak-milestone:{}'.format(streak),
            'channel': 'streak',
            'tone': 'good',
            'title': '{} days in a row'.format(streak),
            'body': best,
            'link': '/dashboard',
        })
    return out


def _progress_candidates(user, facts):
    """Levels, badges and records — the three things the app hands out.

    All one-shot, which is why the first sweep files them as read rather than
    showing them: an account arriving here with 61 levels and forty badges did
    not earn any of them in the last minute.
    """
    level = xp_tracking.level_for_total_xp(user.get('xp') or 0)['level']
    out = [{
        'fingerprint': 'level:{}'.format(level),
        'channel': 'progress',
        'tone': 'good',
        'title': 'Level {}'.format(level),
        'body': '{:,} XP in total.'.format(int(user.get('xp') or 0)),
        'link': '/dashboard',
    }]

    for badge in facts['badges']:
        out.append({
            'fingerprint': 'badge:{}'.format(badge['id']),
            'channel': 'progress',
            'tone': 'good',
            'title': 'Badge earned: {}'.format(badge.get('name') or badge['id']),
            'body': badge.get('description') or '',
            'link': '/achievements/badges',
        })

    for record in facts['records']:
        value = record.get('value')
        out.append({
            'fingerprint': 'record:{}'.format(record['id']),
            'channel': 'progress',
            'tone': 'good',
            'title': 'New record: {}'.format(record.get('name') or 'one of yours'),
            'body': '{:g}{}{}'.format(
                float(value or 0),
                ' ' + record['unit'] if record.get('unit') else '',
                ', on {}'.format(record['achieved_on']) if record.get('achieved_on') else ''),
            'link': '/achievements',
        })
    return out


#: Which candidates are about a backlog rather than about now. The first sweep
#: files these without showing them; see the note at the top.
ONE_SHOT = ('level', 'badge', 'record', 'streak-milestone', 'goal-done',
            'grace-saved')


# --------------------------------------------------------------------------
# The sweep
# --------------------------------------------------------------------------
def sweep(user, day, at=None, channels=CHANNELS):
    """Bring one account's notifications up to date. Returns the new rows.

    `day` is the reader's local ISO day and `at` their local 'HH:MM', both for
    the reason every date parameter in this backend is passed in: stored stamps
    carry no zone (backend/tracking/xp.py), so only the caller knows what today
    is. `channels` is the subset whose switch in Settings is on — a channel
    that is off is not swept at all, so it writes nothing rather than writing
    rows nobody will see.
    """
    username = user['username']
    today = _day(day, date.today())
    day = today.isoformat()
    wanted = set(channels or ())
    if not wanted:
        return []

    facts = db.notification_facts(
        username,
        day,
        (today + timedelta(days=1)).isoformat(),
        (today - timedelta(days=7)).isoformat(),
        (today - timedelta(days=14)).isoformat())

    candidates = []
    if 'tasks' in wanted:
        candidates += _task_candidates(facts, day)
    if 'calendar' in wanted:
        candidates += _calendar_candidates(username, day, _minutes(at))
    if 'analytics' in wanted:
        candidates += _analytics_candidates(facts, day)
    if 'goals' in wanted:
        candidates += _goal_candidates(facts, day)
    if 'streak' in wanted:
        candidates += _streak_candidates(user, facts, day)
    if 'progress' in wanted:
        candidates += _progress_candidates(user, facts)

    known = db.live_fingerprints(username)
    settling = not known

    fresh = [c for c in candidates if c['fingerprint'] not in known]
    for candidate in candidates:
        head = candidate['fingerprint'].split(':', 1)[0]
        if candidate['fingerprint'] in known and head in REFRESHABLE:
            db.refresh_notification(username, candidate['fingerprint'],
                                    candidate['title'], candidate['body'])

    written = db.add_notifications(username, fresh)

    # Today's streak warning, withdrawn once it stops being true: something
    # was finished, or a vacation was started after it was raised. Left up, it
    # would go on saying the run ends at midnight for the rest of a day on
    # which it does not. Only the day-scoped streak rows — a grace day saved or
    # a milestone stays true once it has happened.
    if 'streak' in wanted:
        standing = {c['fingerprint'] for c in candidates}
        stale = [row['id'] for row in db.notifications_for(username, ['streak'])
                 if row.get('for_day') == day and row['fingerprint'] not in standing]
        if stale:
            db.delete_notifications(username, stale)

    # The backlog, on the account's very first sweep: filed under its
    # fingerprint so it is never raised again, and never put on screen.
    if settling:
        backlog = [row['id'] for row in written
                   if row['fingerprint'].split(':', 1)[0] in ONE_SHOT]
        if backlog:
            db.delete_notifications(username, backlog)
            written = [row for row in written if row['id'] not in backlog]

    # Yesterday's counts, retired now today's are written. A bell that keeps
    # one "3 tasks are late" per day accumulates a week of them while the
    # reader looks at the same three tasks; `for_day` is what marks the ones
    # that end with their day.
    db.retire_notifications(username, day)
    db.prune_notifications(
        username, (today - timedelta(days=TOMBSTONE_DAYS)).isoformat())
    return written
