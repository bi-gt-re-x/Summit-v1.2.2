"""First-week quests: six first things, each worth some XP once.

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
"""
from datetime import date, datetime

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


def _done(quest, facts, joined, today):
    if quest['fact'] is None:
        return today > joined
    return bool(facts.get(quest['fact']))


def status(username, today=None):
    """The quest line as the card draws it, or None for an unknown account."""
    _, user = load_user(username)
    if not user:
        return None
    today = today or date.today()
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

    amount = quest['xp']
    if not db.claim_quest(username, quest_id, amount, datetime.now().isoformat()):
        # Another request got there between the read above and this write.
        return {'success': False, 'message': 'Already claimed.', 'claimed': True}

    was = xp_tracking.level_for_total_xp(user.get('xp'))['level']
    xp_tracking.log_event(username, amount, 'quest:' + quest_id,
                          tasks_completed=0, day=today.isoformat())
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
