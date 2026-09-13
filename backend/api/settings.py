"""Settings — the preferences an account can change about itself.

## One declared schema, two stores

`FIELDS` below is the whole list of what a preference is: its default, and what
counts as a valid value. Adding one is a line there and nothing else here —
validation, defaults and the read shape all come off it.

Where a value is *kept* is a separate question, and a historical one:

    users.name, users.theme, users.daily_goal      on the user row
    everything else                                user_settings, as key/value

The first three are on the user row because they existed before there was
anywhere else to put them, and data/sql/settings.sql says as much. The page
does not know or care: one GET, one POST, one flat object.

## Only what is sent is written

`model_fields_set`, the same rule tasks.py applies. A page of independent
controls needs it — otherwise changing the theme would write back whatever
stale value the client happened to hold for every other preference.

## What is deliberately not here

No integrations, API keys, webhooks or leaderboards. This app has no OAuth
broker, no job runner and no second account to compare against, so each of
those would be a control that stores a value nothing reads. A settings page
whose switches do nothing is worse than a shorter one.

The notification switches are the counter-example that proves the rule. They
are here because there is something to switch: the sweep in
backend/tracking/notify.py reads every one of them, and a channel that is off
is not swept rather than being swept and hidden.

## Undoing things

The other half of this module is `/api/settings/reset`, which is the only
endpoint in the app that removes data on purpose. Everything it can do is
declared in `RESETS`, one entry per scope, and the ones that cannot be taken
back are listed in `TYPED` — those refuse to run unless the request repeats the
account's own username back, which is the server holding the line rather than
trusting a dialog to have asked.

Deleting rows is not as simple as filtering a table, because `write_table`
turns foreign keys off while it swaps the rows in (it has to — see the note on
it) and so no ON DELETE cascade ever fires. A task removed without also
clearing the notes that point at it leaves a reference to a row that no longer
exists, and the *next* write of the notes table fails its integrity check. So
`_forget_tasks` and `_forget_goals` below unpick the references first, in
order, and the delete is the last step rather than the only one.
"""
import re
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel

from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.config.settings import THEME_COOKIE_MAX_AGE
from backend.database import connection as db
from backend.tracking import avatar as avatars
from backend.tracking.auth import load_user

router = APIRouter(tags=['settings'])

NAME_MAX = 60
GOAL_MIN, GOAL_MAX = 10, 2000

#: How many subjects an account may nominate as the ones it most wants to work
#: on. Four rather than "as many as you like", and the number is a design
#: decision rather than a storage limit: the list becomes a menu under
#: Analytics in the rail (frontend/src/components/Rail.tsx), and a rail entry
#: that unfolds into eleven rows is a rail entry nobody opens twice. Four also
#: fits the setup screen's grid without it becoming a scrolling list.
ANALYTICS_SUBJECTS_MAX = 4


def _one_of(*allowed):
    """A validator for a fixed set of strings."""
    def check(value):
        return value if value in allowed else None
    return check


def _boolean(value):
    return bool(value) if isinstance(value, bool) else None


def _whole(low, high):
    def check(value):
        try:
            number = int(value)
        except (TypeError, ValueError):
            return None
        # Clamped rather than rejected: a reader who typed 5000 into a field
        # marked 10-2000 meant "as high as it goes", not "fail my save".
        return max(low, min(high, number))
    return check


def _fraction(low, high, step=0.25):
    """A number that is allowed a fractional part — the focus goal, in hours.

    Snapped to `step` as well as clamped, so the stored value is one a control
    can actually return to: 2.4 hours is not a thing the page can draw on a
    quarter-hour scale, and storing it would leave a select showing nothing
    selected.
    """
    def check(value):
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        snapped = round(round(number / step) * step, 2)
        return max(low, min(high, snapped))
    return check


def _id_list(limit, item_max=64):
    """A short, ordered, de-duplicated list of ids.

    The one field here that holds a *set* rather than a value, so it is the one
    that has to say what a set is allowed to be. Order is kept because it is
    the reader's own ordering — the rail draws the menu in it — and duplicates
    go because a menu with the same row twice is a bug the reader can see.

    **Over the limit is truncated; the wrong shape is refused.** Those are
    different mistakes. A client that sent five ids meant "these", the same way
    somebody typing 5000 into a field marked 10-2000 meant "as high as it
    goes", and `_whole` clamps that rather than failing the save. A client that
    sent a string where a list belongs has a bug, and a save that quietly
    stored something else would hide it.

    Ids are not checked against the account's catalogue. They cannot be: the
    catalogue is per-account and a subject can be deleted the day after it is
    nominated. Every reader of this list joins it against the catalogue anyway
    and drops what it does not recognise, which degrades to a shorter menu
    instead of a save that fails months later.
    """
    def check(value):
        if not isinstance(value, list):
            return None
        kept = []
        for entry in value:
            if not isinstance(entry, str):
                return None
            ident = entry.strip()[:item_max]
            if ident and ident not in kept:
                kept.append(ident)
        return kept[:limit]
    return check


def _id_map(limit, item_max=64):
    """A short map of id to id — which sub-tree a followed subject opens on.

    The second field here that holds a structure rather than a value, and it is
    a map rather than a longer list for the reason the two questions are
    separate in the wizard: the follow list is *which* subjects, this is *where
    inside* each of them, and encoding the pair as "maths>algebra" in one list
    would make every reader of either answer parse the other one's.

    Same split as `_id_list` on what is refused. A key past the cap is dropped
    and so is an entry whose value is empty — that is a reader who un-chose a
    depth, which is a real answer meaning "the whole subject". A value that is
    not a string at all is a client bug, and is refused rather than coerced.

    Nothing here checks that the key is a followed subject or that the value
    names a tree that exists. It cannot: both lists move independently of this
    one. Every reader joins against the live catalogue and the live tree
    registry and drops what does not resolve.
    """
    def check(value):
        if not isinstance(value, dict):
            return None
        kept = {}
        for key, target in value.items():
            if not isinstance(key, str) or not isinstance(target, str):
                return None
            ident = key.strip()[:item_max]
            where = target.strip()[:item_max]
            # An empty value is "no sub-tree", which is the default and so is
            # stored as absence rather than as an empty string.
            if ident and where and len(kept) < limit:
                kept[ident] = where
        return kept
    return check


#: How long a stated aim or level may be. Long enough for a sentence, short
#: enough that it cannot carry a paragraph into a model prompt.
AMBITION_TEXT_MAX = 240


def _ambition_map(limit):
    """What the account says it is chasing in a subject, and where it is now.

    Keyed by subject id, valued by `{aim, level}` — two short strings. It is a
    third structural validator rather than a reuse of `_id_map` because the
    value is a record and not an id: squeezing two fields into one delimited
    string would make every reader parse it, and the first reader to forget
    would silently show somebody their level where their aim should be.

    Both fields are free text and neither is required. An entry with nothing in
    either is dropped rather than stored, because a subject the reader skipped
    is a subject with no ambition set, and an empty record would read to the
    model as an aim it could not make out.

    Nothing here checks the subject is followed or even exists. It cannot —
    the follow list moves independently — and every reader joins against the
    live catalogue.
    """
    def check(value):
        if not isinstance(value, dict):
            return None
        kept = {}
        for key, record in value.items():
            if not isinstance(key, str) or not isinstance(record, dict):
                return None
            ident = key.strip()[:64]
            aim = str(record.get('aim') or '').strip()[:AMBITION_TEXT_MAX]
            level = str(record.get('level') or '').strip()[:AMBITION_TEXT_MAX]
            if ident and (aim or level) and len(kept) < limit:
                kept[ident] = {'aim': aim, 'level': level}
        return kept
    return check


#: How many subjects may hold a connected goal. Wider than the follow list,
#: because a subject page opens for any subject in the catalogue and not only
#: the four in the rail — and a connection has to survive a subject being
#: unfollowed and followed again.
SUBJECT_GOALS_MAX = 64


_ISO_DAY = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def _iso_day(value):
    """An ISO date, or the empty string for "never".

    The empty string is a real answer and not a missing one: it is what an
    account that has never opened the dashboard holds, and it is what tells the
    catch-up prompt it has no gap to ask about yet.
    """
    text = str(value or '').strip()
    if not text:
        return ''
    return text if _ISO_DAY.match(text) else None


#: Every preference kept in user_settings: default, and what a valid value is.
#: A key absent from the table is a real state — see `db.user_setting` — so the
#: default is applied on read rather than written at signup.
FIELDS: Dict[str, Any] = {
    # Appearance. 'system' follows the device rather than storing a colour.
    'theme_mode':        ('system', _one_of('system', 'light', 'dark')),
    #: One of the four built palettes, or '' for plain light/dark.
    #:
    #: A skin is a *whole* look — its own ground and its own accent pair — so
    #: it is stored beside `theme_mode` rather than inside it: the mode still
    #: says which of light and dark the app is in, because every stylesheet in
    #: the app keys off that and a skin does not change the answer. A skin
    #: pins the mode to the one it was built against, which is what
    #: SettingsProvider does with it.
    #:
    #: `accent` below is ignored while one of these is set, and the settings
    #: page says so rather than leaving a dead control on screen. A palette
    #: that let you swap its accent out would not be a palette.
    'theme_skin':        ('', _one_of('', 'midnight', 'sunset', 'meadow', 'orchid')),
    'accent':            ('violet', _one_of('violet', 'blue', 'green', 'amber', 'rose', 'slate')),
    'reduce_motion':     (False, _boolean),
    'show_ambient':      (True, _boolean),
    'nav_collapsed':     (False, _boolean),

    # Where the app opens. Signing in lands here, and so does '/'.
    'home_page':         ('dashboard', _one_of('dashboard', 'tasks', 'calendar',
                                               'goals', 'analytics', 'notes')),

    #: Which clock every time in the app is written on.
    #:
    #: It was twelve-hour everywhere, in about a dozen formatters, and three of
    #: them passed 'en-US' to toLocaleTimeString explicitly — so a device set to
    #: a language that writes 18:40 was told 6:40 PM anyway. Most of the world
    #: writes 18:40.
    #:
    #: '12h' is the default because it is what the app did before this existed,
    #: so no account's calendar changes shape until it is asked to. What reads
    #: it is frontend/src/utils/clock.ts, which is the only place the choice is
    #: known — see the note there on why it is read rather than passed down.
    'clock_format':      ('12h', _one_of('12h', '24h')),

    # Dashboard.
    'show_stats':        (True, _boolean),
    'show_insights':     (True, _boolean),
    'show_focus':        (True, _boolean),
    'show_quote':        (True, _boolean),

    # Tasks. The four `task_*` keys are what the page opens on, not what it
    # stays on: the controls above the list still change the view for a visit.
    'default_priority':  ('medium', _one_of('low', 'medium', 'high')),
    'default_xp':        (30, _whole(5, 500)),
    #: How much the app asks after a task is finished, and therefore how much
    #: the report card has to go on. See REASONS in backend/api/tasks.py and
    #: the note in backend/tracking/analytics.py on what quality is measured
    #: from. 'ratings' is the default and is what the app has always done.
    'rating_depth':      ('ratings', _one_of('none', 'ratings', 'reasons')),
    'confirm_delete':    (True, _boolean),
    'task_status':       ('open', _one_of('open', 'done', 'all')),
    'task_sort':         ('due', _one_of('due', 'priority', 'xp', 'created', 'title')),
    'task_group':        ('due', _one_of('due', 'priority', 'band', 'subject',
                                         'status', 'none')),
    'task_horizon':      ('week', _one_of('week', 'all')),

    # Calendar.
    'calendar_view':     ('week', _one_of('day', 'week', 'month')),
    'week_starts_on':    ('monday', _one_of('monday', 'sunday')),

    #: Records. What the history column under the personal bests opens ordered
    #: by — the same shape as the four `task_*` keys above, and for the same
    #: reason: the toolbar still changes the order for a visit, and this is
    #: where the visit starts. See `filterRows` in
    #: frontend/src/utils/records.ts for what each one means.
    'records_sort':      ('newest', _one_of('newest', 'oldest', 'improvement')),

    #: Whether the pomodoro page has been set up. The exact parallel of
    #: `analytics_setup_done` below, and it is here because it used to be a
    #: localStorage flag keyed by username — which made "have I set this up"
    #: a fact about the browser rather than about the account, so the wizard
    #: greeted you again on every new device. False is a real state and not a
    #: missing one: it is what puts the setup questions in front of the page.
    'timer_setup_done':  (False, _boolean),

    # Focus. The goal is per day and kept in the browser; this is what a day
    # that has not been given one of its own starts from.
    'focus_goal_hours':  (2.0, _fraction(0.5, 12)),
    'focus_dim':         (True, _boolean),
    #: Whether the dashboard asks, on the first visit of a day, about the days
    #: since the last one — hours the reader worked and never tracked. Off is
    #: a supported answer and the whole prompt disappears; see
    #: frontend/src/components/Dashboard/CatchUp.tsx.
    'catchup_prompt':    (True, _boolean),
    #: The last day the prompt was put (or found nothing to put), ISO. This is
    #: what makes it once a day rather than once a page load, and what defines
    #: the gap it asks about. Written by the dashboard, never by the reader —
    #: it is state rather than a preference, and it is here because
    #: `user_settings` is where an account's small facts already live.
    'catchup_seen_on':   ('', _iso_day),

    # Analytics.
    #
    # The first is where the page opens; the six below it are the answers to
    # the setup questions a new account is asked before the page will draw
    # anything (frontend/src/components/Analytics/Setup.tsx). Every one of them
    # is read by the page — see the note on each — because a preference nothing
    # looks at is worse than no preference at all.
    'analytics_window':  ('1y', _one_of('7d', '30d', '90d', '1y', '2y', 'all')),
    #: Whether the question phase has been answered. False is a real state and
    #: not a missing one: it is what puts the setup screen in front of the page.
    #: An account that set a baseline before this key existed is treated as done
    #: by the page rather than by a migration here.
    'analytics_setup_done': (False, _boolean),
    #: Which tab the page opens on. The same seven keys as VIEWS in
    #: frontend/src/components/Analytics/Header.tsx.
    'analytics_home_tab': ('overview', _one_of('recommendations', 'overview', 'goals',
                                               'habits', 'insights', 'subjects', 'growth')),
    #: How the account records work, and therefore which figure leads the row
    #: of tiles: the tasks it finished, the hours it sat, or both.
    'analytics_log_style': ('both', _one_of('tasks', 'sessions', 'both')),
    #: How blunt the page is allowed to be. It never changes an arithmetic —
    #: the score is the score — but it changes how much of a shortfall is
    #: called a shortfall, and how many problems are put in front of the reader
    #: at once. See frontend/src/utils/analyticsPrefs.ts.
    'analytics_tone':    ('balanced', _one_of('gentle', 'balanced', 'harsh')),
    #: How many panels the page draws. 'essentials' is the shortest honest
    #: answer, 'everything' adds the panels a reader has to visit another tab
    #: for.
    'analytics_detail':  ('standard', _one_of('essentials', 'standard', 'everything')),
    #: Whether the page is allowed to rank this account against everybody
    #: else. Off hides the percentile panel outright.
    'analytics_standing': (True, _boolean),
    #: The subjects the account said it most wants to work on, by id, at most
    #: ANALYTICS_SUBJECTS_MAX of them. Empty is the honest default and a real
    #: state: an account that named none gets the one Analytics entry it has
    #: always had, rather than a menu with a single row in it.
    #:
    #: This is the one analytics preference that is not about how the page
    #: reads. It is about what the app *offers* — each id becomes a row under
    #: Analytics in the rail, opening that subject's own page.
    'analytics_subjects': ([], _id_list(ANALYTICS_SUBJECTS_MAX)),
    #: For a followed subject, the skill tree it should open on — the sub-part
    #: of it the reader said they want to go deeper into. Keyed by subject id,
    #: valued by tree id (frontend/src/skills/subjectTrees.ts).
    #:
    #: Absent is the answer for most subjects and means "the whole thing": a
    #: reader following Mathematics without naming a branch gets the subject's
    #: own root tree, which is what `treeForSubject` already returns.
    'analytics_subject_depth': ({}, _id_map(ANALYTICS_SUBJECTS_MAX)),
    #: What the account is chasing in each followed subject, and where it says
    #: it is now. `{subject_id: {aim, level}}`.
    #:
    #: **This is not a goal and never becomes one.** A goal on the goals page
    #: is a commitment with a number, a date and progress read off the record;
    #: this is the sentence that says what the work is *for*, which most people
    #: can write long before any of that. It lives here because its only reader
    #: is the analytics page and the model that writes that page's read-out —
    #: putting it on the goals page would turn "get to Mathcounts Nationals"
    #: into a row with a progress bar nobody can honestly fill in.
    'analytics_ambitions': ({}, _ambition_map(ANALYTICS_SUBJECTS_MAX)),
    #: The one goal each subject page is connected to. `{subject_id: goal_id}`.
    #:
    #: One per subject, by construction: a map holds one value per key, so
    #: connecting a second goal *replaces* the first rather than adding to it.
    #: That is the point — a subject page reads its milestones and its
    #: completion chart off a single goal, and two would be two answers to
    #: "what is this subject for".
    #:
    #: Absent is a real state and not an error. A subject with exactly one
    #: active goal naming it is read as connected to that goal without an
    #: entry here; this only records the reader's choice when there is one to
    #: make. Nothing checks the goal still exists — goals are deleted on their
    #: own page — so the reader joins against the live goal list and falls
    #: back when the id no longer resolves.
    'analytics_subject_goal': ({}, _id_map(SUBJECT_GOALS_MAX)),

    # Notifications.
    #
    # One master switch, one switch for the on-screen half, and one per
    # channel. Every one of them is read by the sweep rather than by the panel:
    # a channel that is off is not swept at all (`CHANNELS` in
    # backend/tracking/notify.py), so turning it off stops the rows being
    # written rather than hiding rows that were written anyway. That is the
    # difference between a preference and a filter, and it is why turning a
    # channel back on starts from what is true then instead of replaying a
    # fortnight of backlog.
    #: The master. Off means nothing is swept, nothing is raised, and the bell
    #: shows the account's own list as empty — the switches below are still
    #: honoured the moment it comes back on.
    'notifications_enabled': (True, _boolean),
    #: Whether a new notification also appears on screen when it arrives. Off
    #: leaves the bell doing its job and takes away the interruption, which is
    #: the half of this feature people actually turn off.
    'notify_popups': (True, _boolean),
    #: The six channels. See the candidate functions in
    #: backend/tracking/notify.py for exactly what each one can say.
    'notify_tasks': (True, _boolean),
    'notify_calendar': (True, _boolean),
    'notify_analytics': (True, _boolean),
    'notify_goals': (True, _boolean),
    'notify_streak': (True, _boolean),
    'notify_progress': (True, _boolean),
}


class UpdateSettings(BaseModel):
    """Every field optional; only the ones actually sent are applied.

    The keyed preferences arrive under `values` as one object rather than as a
    field each, so adding a preference to FIELDS does not also mean adding a
    line to this model.
    """
    name: Optional[str] = None
    theme: Optional[str] = None
    daily_goal: Optional[int] = None
    values: Optional[Dict[str, Any]] = None


def _inherited(username, key):
    """An older preference's answer, where a newer key replaced it.

    `rating_depth` replaced `ask_rating`, and the old switch's "off" is exactly
    what the new key calls 'none'. An account that turned the prompt off before
    the three levels existed should not have it come back because the key it
    said so under is no longer read.

    Returns None when there is nothing to inherit, which is the usual answer.
    """
    if key != 'rating_depth':
        return None
    old = db.user_setting(username, 'ask_rating')
    if old is None:
        return None
    return 'none' if str(old).lower() in ('0', 'false', '') else 'ratings'


#: Stored values that named something which has since been renamed.
#:
#: Nothing here validates a stored value on the way out — a setting written
#: when it was legal keeps coming back after the allowed set changes, which is
#: usually harmless and once was not. The analytics page's Records tab became
#: Growth, and an account that had chosen Records as its opening tab would ask
#: for a tab that no longer exists: the page itself shrugs and opens on the
#: Overview, but the picker in Settings would have shown an empty box.
#:
#: Mapped on read rather than migrated in place, because a rename is a fact
#: about this release and not about the account's data, and because the write
#: path above already refuses the old spelling — so this only ever has to hold
#: for values stored before the rename.
ALIASES = {
    'analytics_home_tab': {'records': 'growth'},
}


def _keyed(username):
    """The user_settings half, defaults filled in and types made honest.

    SQLite has no boolean, so a stored `True` comes back as 1 and a stored
    `False` as 0 — or as '0', which is the dangerous one: a string is truthy in
    the browser, and a toggle bound to it would read as on forever. Anything
    whose default is a bool is coerced back to one here, so what leaves this
    module is the type the page thinks it is getting.

    Renamed values are translated on the way out; see ALIASES.
    """
    out = {}
    for key, (fallback, _) in FIELDS.items():
        stored = db.user_setting(username, key)
        if stored is None:
            # Copied rather than handed over: the defaults in FIELDS are
            # module-level objects, and passing the same list or dict to every
            # account would make one caller's mutation everybody's.
            out[key] = _inherited(username, key) or (
                type(fallback)(fallback) if isinstance(fallback, (list, dict)) else fallback
            )
        elif isinstance(fallback, bool):
            out[key] = str(stored).lower() not in ('0', 'false', '')
        elif isinstance(stored, (list, dict)):
            # A stored list is not a renamed string, and `dict.get` on an
            # unhashable key raises rather than missing. ALIASES translates
            # words; there is nothing here for it to translate.
            out[key] = stored
        else:
            out[key] = ALIASES.get(key, {}).get(stored, stored)
    return out


def _shape(user):
    username = user['username']
    return {
        'name': user.get('name') or '',
        'theme': user.get('theme') or 'light',
        'daily_goal': user.get('daily_goal') or 100,
        **_keyed(username),
        # Read-only, so the page can show whose account it is editing.
        'username': username,
        'email': user.get('email') or '',
        'created_at': user.get('created_at') or '',
        'level': int(user.get('level') or 1),
        'xp': int(user.get('xp') or 0),
        'avatar': '/static/' + avatars.avatar_path(avatars.avatar_for(user)),
    }


@router.get('/api/settings')
def get_settings(username: str = Depends(current_username)):
    _, user = load_user((username or '').strip())
    if not user:
        return fail('Account not found')
    return ok(settings=_shape(user))


@router.post('/api/settings')
def update_settings(request: Request, body: UpdateSettings,
                    username: str = Depends(current_username)):
    users, user = load_user(username)
    if not user:
        return fail('Account not found')

    sent = body.model_fields_set
    theme_changed = None

    if 'name' in sent:
        user['name'] = (body.name or '').strip()[:NAME_MAX]

    if 'theme' in sent:
        if body.theme not in ('light', 'dark'):
            return fail("Theme must be 'light' or 'dark'.", status=400)
        user['theme'] = body.theme
        theme_changed = body.theme

    if 'daily_goal' in sent:
        goal = _whole(GOAL_MIN, GOAL_MAX)(body.daily_goal)
        if goal is None:
            return fail('Daily goal must be a number.', status=400)
        user['daily_goal'] = goal

    for key, value in (body.values or {}).items():
        if key not in FIELDS:
            # An unknown key is dropped rather than rejected, for the reason
            # `_link` in tasks.py gives: a client one version ahead should not
            # fail the whole save over a preference this build has never heard
            # of. What it does not do is store it.
            continue
        checked = FIELDS[key][1](value)
        if checked is None:
            return fail('That is not a valid value for {}.'.format(key), status=400)
        db.set_user_setting(user['username'], key, checked)

    db.save_user(user)

    payload = ok(settings=_shape(user))
    if theme_changed is None:
        return payload
    # The stored theme is durable; the cookie is what every request reads. A
    # change has to touch both or the next page load renders the old one.
    response = JSONResponse(payload)
    response.set_cookie('theme', theme_changed,
                        max_age=THEME_COOKIE_MAX_AGE, samesite='lax')
    return response


# --------------------------------------------------------------------------
# Taking your data with you
# --------------------------------------------------------------------------
#: What an export covers, and the column order each table is written in. Named
#: explicitly rather than dumped from the schema so an export is a promise
#: about shape rather than whatever the database happens to hold today.
EXPORTS = {
    'tasks': ('id', 'title', 'status', 'priority', 'xp_value', 'subject',
              'due_date', 'created_at', 'completed_at', 'goal_id'),
    'goals': ('id', 'title', 'description', 'goal_type', 'status', 'category',
              'priority', 'deadline', 'created_at'),
    'records': ('id', 'kind', 'name', 'category', 'value', 'target', 'unit',
                'note', 'achieved_on'),
    'notes': ('id', 'title', 'body', 'created_at', 'updated_at'),
    'focus_days': ('date', 'seconds', 'goal_hours'),
}


def _mine(table, username):
    return [row for row in db.read_table(table) if row.get('user_id') == username]


def _rows_for(table, username):
    """One table's rows, for the JSON export.

    A table in `EXPORTS` is narrowed to the columns named there — that list is
    a choice about what is worth reading, and it is the same shape the CSV of
    that table has, so the two formats agree about what a task is.

    Everything else goes out whole. Curating columns for the other twelve would
    mean a second copy of each table's schema in this file, and a copy of a
    schema is a thing that goes stale silently: the column added next year is
    missing from the export and nobody finds out until somebody needs it. The
    row as stored is the honest answer and it cannot drift.
    """
    rows = _mine(table, username)
    columns = EXPORTS.get(table)
    if not columns:
        return rows
    return [{column: row.get(column) for column in columns} for row in rows]


def _csv_cell(value):
    text = '' if value is None else str(value)
    if any(ch in text for ch in ',"\n'):
        return '"{}"'.format(text.replace('"', '""'))
    return text


@router.get('/api/settings/export')
def export_data(username: str = Depends(current_username), table: str = 'all', format: str = 'json'):
    """Everything this account has, as JSON or CSV.

    `table=all` in JSON is the whole account in one object. CSV is one table at
    a time, because a CSV file with five different row shapes in it is not a
    CSV file — asking for `all` as CSV therefore returns the tasks, which is
    the table anybody exporting a productivity app actually wants.

    ## What "everything" covers, and what it used to

    `EXPORTS` held five tables and this endpoint offered those five, under a
    button that said "Export everything". The account owns seventeen —
    `ACCOUNT_TABLES` below is the list, and it is authoritative because it is
    what deleting an account clears. So the app would delete twelve tables of
    somebody's work that it had no way of handing back: every calendar entry
    and event, the XP ledger the level is counted from, the checkpoints under
    each goal, the subjects, the badges, the analytics snapshots and the
    preferences. A goal came out without its milestones, which is half a goal.

    So `all` now means all of it. `ACCOUNT_TABLES` is read rather than a second
    list kept beside it, because two lists disagree eventually and the way they
    would disagree here is the failure this paragraph is about — a table added
    to one and not the other is data that can be destroyed and not retrieved.
    It is defined further down the module and resolved when this runs, which is
    why the forward reference is fine.

    The `users` row itself is not in that list and is not exported: it holds the
    password hash and the verification token, and neither is the reader's data
    in any sense worth handing them a copy of.
    """
    name = (username or '').strip()
    _, user = load_user(name)
    if not user:
        return fail('Account not found')

    if table != 'all' and table not in EXPORTS and table not in ACCOUNT_TABLES:
        return fail('Nothing here is called {}.'.format(table), status=400)

    if format == 'csv':
        wanted = table if table in EXPORTS else 'tasks'
        columns = EXPORTS[wanted]
        lines = [','.join(columns)]
        for row in _mine(wanted, name):
            lines.append(','.join(_csv_cell(row.get(column)) for column in columns))
        return PlainTextResponse(
            '\n'.join(lines) + '\n',
            media_type='text/csv',
            headers={'Content-Disposition':
                     'attachment; filename="summit-{}.csv"'.format(wanted)},
        )

    names = ACCOUNT_TABLES if table == 'all' else (table,)
    body = ok(export={
        'account': name,
        'tables': {key: _rows_for(key, name) for key in names},
    })
    # Named on the way out, the way the CSV branch above is. The link that
    # asks for this carries `download`, so the browser saves it either way —
    # but without this it saves it as "export", with no extension.
    return JSONResponse(body, headers={
        'Content-Disposition':
            'attachment; filename="summit-{}.json"'.format(table)})


# --------------------------------------------------------------------------
# Undoing things
# --------------------------------------------------------------------------
#: Every table that belongs to an account, keyed on `user_id`. Deleting an
#: account means clearing each of these by hand: `write_table` swaps rows with
#: foreign keys off, so the ON DELETE CASCADE each of them declares never
#: fires, and dropping the user row alone would leave every one of them behind
#: pointing at a username that no longer exists.
ACCOUNT_TABLES = (
    'tasks', 'goals', 'goal_milestones', 'xp_events', 'focus_days',
    'day_focus_notes', 'calendar_entries', 'calendar_events', 'notes',
    'records', 'metric_snapshots', 'user_achievements', 'activity_log',
    'library_items', 'user_subjects', 'user_settings',
    # Not content the account made, but entirely derived from content it made:
    # every row is a sentence about a task, a goal or a badge that is being
    # removed here. Left behind they would be notifications about a record that
    # no longer exists — and their tombstones would go on suppressing the ones
    # the emptied account earns next.
    'notifications',
)

#: What `progress` puts an account's counters back to. The XP ledger and the
#: metric snapshots are cleared alongside these, because a level of 1 over a
#: ledger holding six thousand XP is two answers to the same question.
FRESH = {
    'xp': 0, 'level': 1, 'tasks_completed': 0,
    'current_streak': 0, 'best_streak': 0,
    'last_task_date': None, 'day_state': None, 'charge': 0,
}


def _drop(table, keep):
    """Rewrite `table` with only the rows `keep` accepts. Returns how many went."""
    rows = db.read_table(table)
    left = [row for row in rows if keep(row)]
    gone = len(rows) - len(left)
    if gone:
        db.write_table(table, left)
    return gone


def _clear_column(table, column, ids):
    """Blank `column` on every row of `table` whose value is in `ids`.

    For the two references that are ON DELETE SET NULL rather than CASCADE: a
    note about a task outlives the task, but it cannot go on naming it.
    """
    rows = db.read_table(table)
    touched = False
    for row in rows:
        if str(row.get(column) or '') in ids:
            row.pop(column, None)
            touched = True
    if touched:
        db.write_table(table, rows)


def _forget_tasks(doomed):
    """Remove some tasks, and unpick everything that points at them first.

    Order matters and is the whole reason this is a function. See the note at
    the top of the module: a reference left behind does not fail this write, it
    fails the next write to the table holding it.
    """
    if not doomed:
        return 0
    _drop('library_task_links', lambda row: str(row.get('task_id') or '') not in doomed)
    _drop('calendar_entries', lambda row: str(row.get('task_id') or '') not in doomed)
    _clear_column('notes', 'task_id', doomed)
    return _drop('tasks', lambda row: str(row.get('id') or '') not in doomed)


def _forget_goals(doomed):
    """The same for goals: checkpoints and links first, the goals last.

    The tasks stay, and lose the link — the rule DELETE /api/goals applies, for
    the reason given there: work done for a goal was still done.
    """
    if not doomed:
        return 0
    _drop('goal_milestones', lambda row: str(row.get('goal_id') or '') not in doomed)
    _clear_column('notes', 'goal_id', doomed)
    rows = db.tasks()
    touched = False
    for task in rows:
        if str(task.get('goal_id') or '') in doomed:
            task['goal_id'] = None
            task['milestone_id'] = None
            touched = True
    if touched:
        db.save_tasks(rows)
    return _drop('goals', lambda row: str(row.get('id') or '') not in doomed)


def _task_ids(username, done_only=False):
    return {str(row.get('id')) for row in _mine('tasks', username)
            if not done_only or row.get('status') == 'done'}


#: Rows in user_settings that are not preferences, and what each is.
#:
#: The table is the app's general key/value store, not this page's — the
#: profile picture lives in it (backend/tracking/avatar.py) and so does the
#: analytics baseline and the advice an account has adopted
#: (backend/api/analytics.py). "Put every preference back" therefore cannot be
#: "empty this table for me": doing that would take the reader's avatar and
#: their starting line with it, neither of which is on this page at all.
PROFILE_KEYS = ('avatar',)

#: Keys FIELDS no longer holds but that are still read — see `_inherited`.
#: Listed so "reset every preference" clears them too: leaving `ask_rating`
#: behind would have an account inherit its own superseded answer back the
#: moment the key that replaced it was cleared.
RETIRED_KEYS = ('ask_rating',)


def _settings_of(username, keys):
    """Drop this account's user_settings rows for `keys`."""
    return _drop('user_settings',
                 lambda row: not (row.get('user_id') == username
                                  and row.get('key') in keys))


def _reset_preferences(user):
    return {'preferences': _settings_of(
        user['username'], set(FIELDS) | set(RETIRED_KEYS))}


def _reset_completed(user):
    return {'tasks': _forget_tasks(_task_ids(user['username'], done_only=True))}


def _reset_tasks(user):
    return {'tasks': _forget_tasks(_task_ids(user['username']))}


def _reset_progress(user):
    """Back to level 1 with nothing behind it. The work itself is left alone.

    Deliberately not a delete of the tasks: an account that wants to start the
    ladder again usually still wants its list. Clearing the ledger and the
    snapshots as well is what stops analytics from redrawing the history the
    level no longer has.
    """
    username = user['username']
    user.update(FRESH)
    return {
        'xp_events': _drop('xp_events', lambda row: row.get('user_id') != username),
        'snapshots': _drop('metric_snapshots', lambda row: row.get('user_id') != username),
        'achievements': _drop('user_achievements', lambda row: row.get('user_id') != username),
    }


def _reset_content(user):
    """Everything the account has made, and its progression with it.

    What survives: the account, its e-mail and password, and its preferences.
    Signing back in lands on an app that works and has nothing in it.
    """
    username = user['username']
    counts = {'tasks': _forget_tasks(_task_ids(username)),
              'goals': _forget_goals({str(row.get('id')) for row in _mine('goals', username)})}
    # A saved resource can be linked to a task; the tasks are gone, so any link
    # left is a reference to a row that is not there.
    mine = {str(row.get('id')) for row in _mine('library_items', username)}
    _drop('library_task_links', lambda row: str(row.get('item_id') or '') not in mine)

    for table in ACCOUNT_TABLES:
        # The two already handled are done, and user_settings is not content —
        # it holds the preferences, which a reader clearing their work has not
        # asked to lose, and the avatar, which is not on this page at all.
        if table in ('user_settings', 'tasks', 'goals', 'goal_milestones'):
            continue
        gone = _drop(table, lambda row: row.get('user_id') != username)
        if gone:
            counts[table] = gone

    # The two keyed rows that *are* content: where the account was measured
    # from, and the advice it has taken up.
    kept = set(FIELDS) | set(PROFILE_KEYS) | set(RETIRED_KEYS)
    gone = _drop('user_settings',
                 lambda row: not (row.get('user_id') == username
                                  and row.get('key') not in kept))
    if gone:
        counts['analytics'] = gone

    user.update(FRESH)
    return counts


def _reset_account(user):
    """The account itself. Nothing about it is left anywhere."""
    username = user['username']
    counts = _reset_content(user)
    counts['preferences'] = _drop(
        'user_settings', lambda row: row.get('user_id') != username)
    counts['account'] = 1
    return counts


#: Every scope `/api/settings/reset` accepts: what it does, and what it says it
#: did. One entry per row in the danger zone on the settings page.
RESETS = {
    'preferences': (_reset_preferences, 'Every preference is back to its default.'),
    'completed': (_reset_completed, 'Finished tasks removed.'),
    'tasks': (_reset_tasks, 'Every task removed.'),
    'progress': (_reset_progress, 'Level, XP and streak reset.'),
    'content': (_reset_content, 'Everything you had made has been removed.'),
    'account': (_reset_account, 'The account and everything in it is gone.'),
}

#: The scopes that will not run on a click alone. The request has to carry the
#: account's own username back, which is the server insisting rather than the
#: dialog — an endpoint that deletes an account on an empty POST is one stray
#: fetch away from doing it by accident.
TYPED = ('tasks', 'progress', 'content', 'account')


class ResetRequest(BaseModel):
    scope: Optional[str] = None
    #: The username, typed again, for the scopes in TYPED.
    confirm: Optional[str] = None


@router.post('/api/settings/reset')
def reset_data(request: Request, body: ResetRequest,
               username: str = Depends(current_username)):
    users, user = load_user(username)
    if not user:
        return fail('Account not found')

    scope = (body.scope or '').strip()
    if scope not in RESETS:
        return fail('There is nothing called {}.'.format(scope or 'that'), status=400)

    if scope in TYPED:
        typed = (body.confirm or '').strip()
        if typed.lower() != str(user['username']).lower():
            return fail('Type {} to confirm.'.format(user['username']), status=400)

    run, said = RESETS[scope]
    removed = run(user)

    if scope == 'account':
        # ON DELETE CASCADE carries every owned table with it, which is the
        # whole point of deleting the row rather than filtering it out of a
        # copy of the table and writing that back with foreign keys switched
        # off — the way `write_table` has to do it.
        db.delete_row('users', user['id'])
        # The session names an account that no longer exists; leaving it set
        # would send the next request into the gate as a signed-in nobody.
        request.session.clear()
        return ok(message=said, removed=removed, signed_out=True)

    db.save_user(user)
    return ok(message=said, removed=removed, settings=_shape(user))
