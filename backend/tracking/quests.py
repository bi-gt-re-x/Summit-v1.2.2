"""Quests: six first things worth XP once, then one small one a day.

A new account opens Analytics to a page that needs days of data before it
can say much. These give the first few days something to aim at instead: a
short list of real actions, each ticked by the action itself and paid in XP.
The card is frontend/src/components/Dashboard/FirstWeek.tsx.

## How a quest is checked

Never by the browser saying so. Each quest names a fact in
`db.first_week_facts`, which looks for the row the action leaves behind: a
finished task, a focus sitting, a skill attempt, a Log entry with a mood on
it, a goal. "Come back tomorrow" is the one with no row; it is done when today
is a later day than the one the account was made on.

## How a quest is paid

`claim` writes the quest_claims row first and pays only if that write was the
one that made it, so the table's primary key is the whole double-claim guard.
The XP goes in the ledger as one `quest:<id>` event and onto the account with
`add_to_row`, the same two writes a finished task makes, so the level, the XP
card and the growth chart all see it with nothing else to update.

## When the line retires

All claimed, or the account is past its first week. The second is decided in
the browser from `activeDays` (utils/dataMaturity), the count every other
"how new is this account" gate reads. The server only answers the cheap half:
an account with XP on SEASONED_XP_DAYS days already has at least that many
active days, so it is retired here and the browser never fetches a growth
series to find out.

## Today's quest

After the first week's six, days three to ten still have nothing to aim at
while Analytics fills in. So a young account gets one small quest a day from
DAILY: a real action, ticked the same way (the rows it left today, per
`db.daily_quest_facts`) and paid once a day. The claim row is
`daily:<iso day>` in the same quest_claims table, so the primary key blocks a
second claim on the same day, and the XP is logged as `quest:daily`.

The pick is a hash of the account and the day, so a reload never changes it,
drawn from the actions the account hasn't done in the LATELY days before
today. Only days before today go into that, so doing today's quest can't swap
it for another one. The card is frontend/src/components/Dashboard/TodayQuest.tsx.
"""
import hashlib
from datetime import date, datetime, timedelta

from backend.database import connection as db
from backend.tracking import xp as xp_tracking
from backend.tracking.auth import created_date_for, load_user

#: The quests, in the order the card lists them. `fact` is the key in
#: `db.first_week_facts`; `to` is the page where it's done (None for the one
#: done by showing up). Copy is user-facing: short, plain, contractions.
QUESTS = (
    {'id': 'task', 'fact': 'task', 'xp': 30, 'to': '/tasks',
     'title': 'Finish your first task',
     'hint': 'Add one, then tick it off.'},
    {'id': 'focus', 'fact': 'focus', 'xp': 40, 'to': '/timer',
     'title': 'Run a focus timer',
     'hint': 'Even one minute counts.'},
    {'id': 'practice', 'fact': 'practice', 'xp': 40, 'to': '/skill-trees',
     'title': 'Answer a practice problem',
     'hint': 'Pick a skill and try one.'},
    {'id': 'log', 'fact': 'log', 'xp': 30, 'to': '/log',
     'title': 'Write a Log entry',
     'hint': 'Tap a mood before you save.'},
    {'id': 'goal', 'fact': 'goal', 'xp': 40, 'to': '/goals',
     'title': 'Set a goal',
     'hint': 'Something you want by a date.'},
    {'id': 'back', 'fact': None, 'xp': 50, 'to': None,
     'title': 'Come back tomorrow',
     'hint': 'Open Summit again on another day.'},
)

BY_ID = {quest['id']: quest for quest in QUESTS}

#: Days with XP on them past which the line is retired without asking the
#: browser. Matches the card's own limit on active days, FIRST_WEEK_DAYS in
#: components/Dashboard/FirstWeek.tsx.
SEASONED_XP_DAYS = 7


#: The daily pool. `did` says whether one day's counts (a value from
#: `db.daily_quest_facts`) meet it. Copy is user-facing, same rules as above.
DAILY = (
    {'id': 'tasks2', 'xp': 30, 'to': '/tasks',
     'title': 'Finish 2 tasks',
     'hint': 'Any two. Small ones count.',
     'did': lambda day: day['tasks'] >= 2},
    {'id': 'focus15', 'xp': 30, 'to': '/timer',
     'title': 'Focus for 15 minutes',
     'hint': 'One timer or a few short ones.',
     'did': lambda day: day['focus_minutes'] >= 15 or day['focus_seconds'] >= 15 * 60},
    {'id': 'practice3', 'xp': 30, 'to': '/skill-trees',
     'title': 'Answer 3 practice problems',
     'hint': 'Pick any skill and go.',
     'did': lambda day: day['practice'] >= 3},
    {'id': 'log', 'xp': 25, 'to': '/log',
     'title': 'Write a Log entry',
     'hint': 'A few lines about your day.',
     'did': lambda day: day['log'] >= 1},
    {'id': 'subject', 'xp': 25, 'to': '/tasks',
     'title': 'Finish a task with a subject',
     'hint': 'Pick a subject when you add it.',
     'did': lambda day: day['subject_tasks'] >= 1},
    {'id': 'plan', 'xp': 20, 'to': '/tasks',
     'title': 'Plan tomorrow',
     'hint': 'Add a task that\'s due tomorrow.',
     'did': lambda day: day['planned'] >= 1},
)

DAILY_BY_ID = {quest['id']: quest for quest in DAILY}

#: Days before today that count as "lately" when picking.
LATELY = 3

#: Days with XP past which there's no daily quest. The card's own limit is
#: DAILY_DAYS in components/Dashboard/TodayQuest.tsx, on active days.
DAILY_XP_DAYS = 10


def reader_day(value, today=None):
    """The reader's own day from a `YYYY-MM-DD`, or the server's.

    Their clock decides when today ends, but only within a day of the server's,
    so nobody claims a quest for last week by sending its date.
    """
    today = today or date.today()
    try:
        day = date.fromisoformat(str(value or '').strip()[:10])
    except ValueError:
        return today
    return day if abs((day - today).days) <= 1 else today


def _did(quest, counts):
    return bool(counts) and quest['did'](counts)


def pick_daily(username, day, history):
    """The day's quest: one the account hasn't done lately, chosen by a hash.

    `history` is `db.daily_quest_facts` over at least the LATELY days before
    `day`. Today's own counts are never read here.
    """
    lately = [(day - timedelta(days=back)).isoformat() for back in range(1, LATELY + 1)]
    fresh = [quest for quest in DAILY
             if not any(_did(quest, history.get(iso)) for iso in lately)]
    pool = fresh or list(DAILY)
    seed = hashlib.sha256('{}:{}'.format(username, day.isoformat()).encode()).digest()
    return pool[int.from_bytes(seed[:4], 'big') % len(pool)]


def _daily_facts(username, day):
    return db.daily_quest_facts(
        username, (day - timedelta(days=LATELY)).isoformat(), day.isoformat())


def daily_status(username, day, claims, xp_days):
    """Today's quest as the card draws it, or None once the account is past it."""
    if xp_days >= DAILY_XP_DAYS:
        return None
    history = _daily_facts(username, day)
    quest = pick_daily(username, day, history)
    quest_id = 'daily:' + day.isoformat()
    claimed = claims.get(quest_id)
    return {
        'id': quest_id,
        'day': day.isoformat(),
        'action': quest['id'],
        'title': quest['title'],
        'hint': quest['hint'],
        'to': quest['to'],
        'xp': claimed['xp'] if claimed else quest['xp'],
        'done': bool(claimed) or _did(quest, history.get(day.isoformat())),
        'claimed': bool(claimed),
    }


def _done(quest, facts, joined, today):
    if quest['fact'] is None:
        return today > joined
    return bool(facts.get(quest['fact']))


def status(username, today=None, day=None):
    """The quest line as the card draws it, or None for an unknown account.

    `day` is the reader's, for today's quest (see `reader_day`)."""
    _, user = load_user(username)
    if not user:
        return None
    today = today or date.today()
    day = reader_day(day, today)
    joined = created_date_for(user)
    facts = db.first_week_facts(username)
    claims = facts['claims']

    quests = []
    for quest in QUESTS:
        claimed = claims.get(quest['id'])
        quests.append({
            'id': quest['id'],
            'title': quest['title'],
            'hint': quest['hint'],
            'to': quest['to'],
            # What it paid if claimed, so a reward changed later doesn't
            # rewrite what the card says somebody got.
            'xp': claimed['xp'] if claimed else quest['xp'],
            'done': bool(claimed) or _done(quest, facts, joined, today),
            'claimed': bool(claimed),
        })

    every = all(quest['claimed'] for quest in quests)
    return {
        'quests': quests,
        'retired': every or facts['xp_days'] >= SEASONED_XP_DAYS,
        'joined': joined.isoformat(),
        'daily': daily_status(username, day, claims, facts['xp_days']),
    }


def claim(username, quest_id, today=None):
    """Pay one quest's XP, once. Returns a dict with `success` and, when paid,
    the XP added, the new lifetime total and the level."""
    quest = BY_ID.get(quest_id)
    if not quest:
        return {'success': False, 'message': "That quest doesn't exist."}
    _, user = load_user(username)
    if not user:
        return {'success': False, 'message': 'User not found'}

    today = today or date.today()
    facts = db.first_week_facts(username)
    if quest_id in facts['claims']:
        return {'success': False, 'message': 'Already claimed.', 'claimed': True}
    if not _done(quest, facts, created_date_for(user), today):
        return {'success': False, 'message': "That one isn't done yet."}

    return _pay(username, user, quest_id, quest['xp'], 'quest:' + quest_id, today)


def claim_daily(username, day=None, today=None):
    """Pay today's quest once, if the rows say it's done."""
    _, user = load_user(username)
    if not user:
        return {'success': False, 'message': 'User not found'}
    day = reader_day(day, today)
    quest_id = 'daily:' + day.isoformat()
    history = _daily_facts(username, day)
    quest = pick_daily(username, day, history)
    if not _did(quest, history.get(day.isoformat())):
        return {'success': False, 'message': "That one isn't done yet."}
    return _pay(username, user, quest_id, quest['xp'], 'quest:daily', day)


def _pay(username, user, quest_id, amount, reason, day):
    """Write the claim row, then the XP, the same two writes a task makes."""
    if not db.claim_quest(username, quest_id, amount, datetime.now().isoformat()):
        # Claimed already, maybe by a request racing this one.
        return {'success': False, 'message': 'Already claimed.', 'claimed': True}

    was = xp_tracking.level_for_total_xp(user.get('xp'))['level']
    xp_tracking.log_event(username, amount, reason, tasks_completed=0, day=day.isoformat())
    row = db.add_to_row('users', user['id'], {'xp': amount})
    total = (row or {}).get('xp', (user.get('xp') or 0) + amount)
    levels = xp_tracking.level_for_total_xp(total)
    if levels['level'] != user.get('level'):
        db.update_row('users', user['id'], {'level': levels['level']})

    return {
        'success': True,
        'quest': quest_id,
        'xp_earned': amount,
        'total_xp': total,
        'new_level': levels['level'],
        'leveled_up': levels['level'] > was,
    }
