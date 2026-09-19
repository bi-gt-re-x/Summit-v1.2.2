"""Analytics — the deeper cuts of a user's own data.

Most of the page is computed on the client from the growth series, which is why
this module stayed a stub long after the page existed: one endpoint already
carried everything a single account needs.

`/api/standing` is the exception, and the reason is structural rather than a
matter of taste. It is the one figure on the page that cannot be derived from
the reader's own record at all — it needs every other account's, which the
client has no business seeing. The rules live in backend/tracking/standing.py.

`/api/baseline` is the other, and it is the opposite case: it is the one thing
on the page that is not derived from anything, because the account has to say
it. Every other figure the analytics page draws needs weeks of record before it
means anything, which left a new account with a page of countdowns and nothing
to do. A baseline is what somebody can answer on their first day — how often
they mean to work, how long a sitting is, what it is for — and it turns the
tabs from "come back in three weeks" into "here is what you said, here is what
happened". It goes in `user_settings` — the key/value table that already exists
for exactly this, a preference rather than a measurement — under BASELINE_KEY.

`/api/adopted_advice` is the third, and it exists to answer the question the
Recommendations tab could not: *did the change work.* The tab would compute
that closing your three-day gaps was worth four thousand XP a year, the reader
would agree and press the button, and then nothing ever came back. A page built
entirely on "here is the number behind this claim" was missing the only number
that would have proved any of it.

**What is stored is an id and a date, and nothing else.** Not the measurement
at the time — that would be a figure written once and never checkable again.
The day series already holds every day this account has ever had, so the
"before" side of the comparison can be recomputed from it whenever it is asked
for, which means the verdict can never drift out of step with the arithmetic
that produced it. The same rule the goals table follows: progress is derived,
never accumulated. The measuring itself lives on the client in
utils/followup.ts, next to the rules whose promises it is checking.
"""
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.database import connection as db
from backend.goal_matcher import store as goal_store
from backend.tracking import analytics as analytics_tracking
from backend.tracking import standing as standing_tracking
from backend.tracking import subject_brief
from backend.tracking import goal_plan
from backend.tracking import subject_goal
from backend.tracking.auth import load_user

router = APIRouter(tags=['analytics'])


class SetBaseline(BaseModel):
    """What a reader can state about their own intentions on day one.

    No `username`: the account is the signed-in one and nothing else — see
    backend/api/guard.py. The field used to ride in the body here because every
    other POST in this app sent one; none of them do now.
    """

    #: Days a week they mean to work. 1-7.
    active_days: Optional[int] = None
    #: What a normal sitting is, in minutes.
    session_minutes: Optional[int] = None
    #: The subject this is mostly for, by id. Empty means "no one subject".
    focus_subject: Optional[str] = None


#: What the two numbers are allowed to be. Bounds rather than validation for
#: its own sake: a baseline of 0 days or 900-minute sittings would flow into
#: every comparison the page draws and make each of them nonsense.
ACTIVE_DAYS = (1, 7)
SESSION_MINUTES = (5, 480)

#: Where the baseline lives in `user_settings`.
BASELINE_KEY = 'analytics_baseline'

#: Where the adopted recommendations live in `user_settings`.
ADOPTED_KEY = 'analytics_adopted'

#: How many adoptions one account may carry.
#:
#: A cap rather than a rule about behaviour: every one of these is measured on
#: every render of the tab, and an account that pressed every button on every
#: visit for a year would be asking the page to run a hundred before/after
#: comparisons to draw one panel. Fifty is far more than anybody will adopt and
#: still a number. The oldest fall off first — see `_remember`.
ADOPTED_LIMIT = 50


class AdoptAdvice(BaseModel):
    """A recommendation the reader has said they will act on.

    The title rides along and is stored beside the id on purpose. Ids are
    stable but the rules behind them are not — a rule can be retitled, retuned
    or deleted between the day somebody adopts it and the day they come back to
    see whether it worked — and a follow-up panel that could only say
    "close-gaps" about a rule that no longer exists would be worse than one that
    remembers what the reader actually agreed to.
    """

    id: str = ''
    title: str = ''


class DropAdvice(BaseModel):
    id: str = ''


# The task fields the analytics page reads, and nothing else.
#
# Every panel on all seven tabs is arithmetic over three responses, and this is
# one of them. The page used to get it from `/api/get_user_data` — the whole
# task list, every column, which the provider warns is megabytes and which is
# turned on for the rest of the session by the first component that asks.
# Opening Analytics paid that in full for sixteen fields.
#
# The list is the union of what the page's utils actually touch, checked
# against them rather than guessed: subject and XP for the breakdown, the two
# stamps and `completion_seconds` for the rates, the ratings pair and `reason`
# for quality, the goal pointers for the Records tab, and title, priority and
# `due_date` for the plan. What it leaves behind is `description` — free text
# with no ceiling, on every row, that no panel here has ever read.
#
# Adding a field to this list is how a new panel gets its data. Adding one that
# nothing reads is how this endpoint slowly becomes the old one again.
ANALYTICS_TASK_FIELDS = (
    'id',
    'title',
    'status',
    'priority',
    'subject',
    'xp_value',
    'created_at',
    'completed_at',
    'due_date',
    'completion_seconds',
    'met_deadline',
    'difficulty',
    'execution',
    'reason',
    'goal_id',
    'milestone_id',
)


#: The order `tasks (user_id, completed_at DESC)` already holds.
#:
#: A literal, and it has to stay one: `order` is interpolated into the SQL by
#: `columns_for`, so it is the one argument there that must never be built from
#: anything a caller sent.
TASK_ORDER = 'completed_at DESC'


@router.get('/api/analytics/tasks')
def get_analytics_tasks(username: str = Depends(current_username)):
    """Every task the account owns, in the sixteen columns this page reads.

    Unwindowed, and that is deliberate. The window picker slices in the browser
    so that changing it costs nothing, and several panels are not scoped by it
    at all — the goal-aimed share and the habit history both look at the whole
    record. Pushing the window into this query would trade an instant control
    for a round trip per click and still need a second, unwindowed call for the
    panels that ignore it.

    What was worth moving was the *width* of each row, not the number of them.
    See ANALYTICS_TASK_FIELDS.

    ## The order is not decoration

    `columns_for` defaults to `ORDER BY rowid`, and on this table that costs a
    sort of every row the account owns: the index it reads is
    `tasks (user_id, completed_at DESC)`, so rowid order is an order the index
    cannot supply and SQLite builds a temp B-tree to produce it — about a
    quarter of the query's time on a five-year account, and a sort buffer the
    width of the result while it does.

    Asking for the order the index already holds removes the sort outright
    (`EXPLAIN QUERY PLAN` drops "USE TEMP B-TREE FOR ORDER BY"). Newest first is
    also the more useful order for a reader who stops reading early, and nothing
    on the page depends on which order it arrives in — every panel filters by
    date before it counts.

    ## Columns, not rows

    The response is `{fields, rows}` rather than a list of objects, and on the
    largest account here that is 3.44 MB instead of 5.99 MB for exactly the
    same data. Two thirds of the old payload was the sixteen field names
    repeated twenty thousand times, which JSON has no way to say once.

    The client zips them straight back into the objects every panel already
    expects — see `rehydrate` in frontend/src/services/analytics.ts — so this
    is a change to the wire and to nothing else. It also parses about twice as
    fast, which is the half of the saving a reader actually feels.
    """
    fields, rows = db.columns_table_for('tasks', username, ANALYTICS_TASK_FIELDS,
                                        order=TASK_ORDER)
    # Which goals each task counts toward, as stored when the task was
    # written: {task_id: [goal_id, ...]}, only for tasks that have any. Kept
    # beside the rows rather than as a seventeenth column, because on a big
    # account nearly every row would carry a null for it. Nothing is matched
    # here — see backend/goal_matcher.
    return ok(fields=fields, rows=rows, goal_links=goal_store.goal_links(username))


@router.get('/api/standing')
def get_standing(username: str = Depends(current_username)):
    """Where this account places against the others, measure by measure.

    Returns the placements, the size of the cohort behind them, and whether
    that cohort was big enough to place against at all — see the module note in
    tracking/standing.py for why the last of those is a field rather than an
    assumption.
    """

    placement = standing_tracking.standing(username)
    if placement is None:
        return fail('User not found')
    return ok(**placement)


@router.get('/api/metric_history')
def get_metric_history(username: str = Depends(current_username), metric: str = 'overall'):
    """Past grades for one metric, oldest first.

    The snapshots have been accumulating since the report card existed — every
    read of `/api/get_growth_ratings` files a dated row per metric — and until
    now nothing read them back out. The analytics page drew its "score over
    time" line from a generated shape with the real score pinned on the end,
    which is the sort of thing that is fine right up until somebody notices.

    What it is actually for is the harder question the page could not answer:
    *what changed since I was last here.* One score is a status; two scores a
    week apart is a reason to come back.
    """

    rows = analytics_tracking.history(username, metric)
    return ok(metric=metric, points=[
        {'date': row.get('date'), 'score': row.get('score'), 'grade': row.get('grade')}
        for row in rows if row.get('date') is not None
    ])


@router.get('/api/metric_histories')
def get_metric_histories(username: str = Depends(current_username)):
    """Every graded metric's past readings at once, grouped by metric.

    The endpoint above answers about one metric and is what the score panel
    reads. This answers about all of them, and exists for the follow-up on the
    Recommendations tab: a reader who adopted "your consistency score is the one
    holding the grade down" needs that metric's history to find out whether it
    moved, and which metric it is depends on what they adopted.

    One call rather than one per adopted metric. The rows all come out of the
    same table read either way, so fanning out would be several round trips to
    answer a question one already can.
    """

    series: dict = {}
    for row in analytics_tracking.history(username):
        name = row.get('metric')
        if not name or row.get('date') is None:
            continue
        series.setdefault(name, []).append({
            'date': row.get('date'),
            'score': row.get('score'),
            'grade': row.get('grade'),
        })

    return ok(series=series)


def _clean(raw):
    """A stored baseline, or None if there isn't a usable one.

    Reads defensively because the value is written by one endpoint and read by
    a page that draws comparisons off it: a hand-edited store or an older shape
    should leave the page saying "no baseline set" rather than dividing by a
    string.
    """
    if not isinstance(raw, dict):
        return None

    try:
        active_days = int(raw.get('active_days'))
        session_minutes = int(raw.get('session_minutes'))
    except (TypeError, ValueError):
        return None

    if not (ACTIVE_DAYS[0] <= active_days <= ACTIVE_DAYS[1]):
        return None
    if not (SESSION_MINUTES[0] <= session_minutes <= SESSION_MINUTES[1]):
        return None

    return {
        'active_days': active_days,
        'session_minutes': session_minutes,
        'focus_subject': str(raw.get('focus_subject') or ''),
        'set_on': str(raw.get('set_on') or ''),
    }


@router.get('/api/baseline')
def get_baseline(username: str = Depends(current_username)):
    """What this account said it was aiming at, or nothing.

    `baseline: null` is a real answer and the page depends on it — it is what
    puts a new reader on the setup screen instead of a wall of countdowns.
    """

    _, user = load_user(username)
    if not user:
        return fail('User not found')

    return ok(baseline=_clean(db.user_setting(username, BASELINE_KEY)))


@router.post('/api/baseline')
def set_baseline(body: SetBaseline, username: str = Depends(current_username)):
    """Record what the account is aiming at.

    Both numbers are required and bounded. `focus_subject` is not: a reader who
    works across four subjects evenly has no one answer, and forcing one would
    put a wrong figure into every comparison drawn from it.

    Writing a baseline stamps the day it was set, which is the field that makes
    it worth anything later — a target set eight months ago and never revisited
    is a different thing from one set last week, and the page says which.
    """

    if body.active_days is None or body.session_minutes is None:
        return fail('A baseline needs both how often and how long.')

    if not (ACTIVE_DAYS[0] <= body.active_days <= ACTIVE_DAYS[1]):
        return fail('Days a week must be between {} and {}.'.format(*ACTIVE_DAYS))

    if not (SESSION_MINUTES[0] <= body.session_minutes <= SESSION_MINUTES[1]):
        return fail('A sitting must be between {} and {} minutes.'.format(*SESSION_MINUTES))

    _, user = load_user(username)
    if not user:
        return fail('User not found')

    stored = db.set_user_setting(username, BASELINE_KEY, {
        'active_days': int(body.active_days),
        'session_minutes': int(body.session_minutes),
        'focus_subject': str(body.focus_subject or ''),
        'set_on': date.today().isoformat(),
    })

    return ok(baseline=_clean(stored))


# --------------------------------------------------------------------------
# Adopted recommendations
# --------------------------------------------------------------------------
def _adopted(raw) -> List[dict]:
    """The stored adoptions, oldest first, with anything unusable dropped.

    Defensive for the same reason `_clean` is, and with one addition that
    matters more here: a row without a readable date is discarded rather than
    kept, because the date is the entire basis of the comparison drawn from it.
    An adoption with no date cannot be measured, and a row that cannot be
    measured but still appears in the list would be a permanent "waiting" entry
    that never resolves.
    """
    if not isinstance(raw, list):
        return []

    out = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        ident = str(item.get('id') or '')
        on = str(item.get('on') or '')
        if not ident or not on:
            continue
        try:
            date.fromisoformat(on)
        except ValueError:
            continue
        out.append({'id': ident, 'title': str(item.get('title') or ident), 'on': on})

    out.sort(key=lambda row: row['on'])
    return out


def _remember(rows: List[dict], ident: str, title: str) -> List[dict]:
    """Add an adoption, keeping the original date if there already is one.

    Pressing the button twice on the same card is not a new decision, and
    re-stamping it with today would quietly reset a comparison that had been
    accumulating for three weeks. The title *is* refreshed, so a rule that has
    been reworded since reads as its current self.
    """
    for row in rows:
        if row['id'] == ident:
            row['title'] = title or row['title']
            return rows

    rows.append({'id': ident, 'title': title or ident, 'on': date.today().isoformat()})
    return rows[-ADOPTED_LIMIT:]


@router.get('/api/adopted_advice')
def get_adopted(username: str = Depends(current_username)):
    """Every recommendation this account has said it would act on, oldest first."""

    _, user = load_user(username)
    if not user:
        return fail('User not found')

    return ok(adopted=_adopted(db.user_setting(username, ADOPTED_KEY)))


@router.post('/api/adopt_advice')
def adopt_advice(body: AdoptAdvice, username: str = Depends(current_username)):
    """Record that the reader is acting on a recommendation, dated today.

    Dated today rather than tomorrow, even though the task this creates is due
    tomorrow: the decision is what is being recorded here, and the comparison
    that follows wants the day the reader changed their mind about how they
    work. A day either way is inside the noise of a fortnight-long window
    anyway, and "the day I pressed the button" is the one a reader can
    remember.
    """
    if not username or not body.id:
        return fail('Username and id required')

    _, user = load_user(username)
    if not user:
        return fail('User not found')

    rows = _adopted(db.user_setting(username, ADOPTED_KEY))
    stored = db.set_user_setting(
        username, ADOPTED_KEY, _remember(rows, body.id, body.title))

    return ok(adopted=_adopted(stored))


@router.post('/api/drop_advice')
def drop_advice(body: DropAdvice, username: str = Depends(current_username)):
    """Forget an adoption.

    This deletes the record of the decision and nothing else — any task the
    adoption created stays where it is. Undoing "I said I would do this" is not
    the same as undoing the work, and silently deleting somebody's task on a
    second click is not what either button meant.
    """
    if not username or not body.id:
        return fail('Username and id required')

    _, user = load_user(username)
    if not user:
        return fail('User not found')

    rows = [row for row in _adopted(db.user_setting(username, ADOPTED_KEY))
            if row['id'] != body.id]
    stored = db.set_user_setting(username, ADOPTED_KEY, rows)

    return ok(adopted=_adopted(stored))


@router.get('/api/growth_periods')
def get_growth_periods(username: str = Depends(current_username), period: str = '30d'):
    """The five metrics over one period, the period before it, and a line.

    The Growth tab's whole data source. It asks a different question from
    `/api/get_growth_ratings` — that one says how the account is doing *now*,
    scored over a fixed trailing ninety days, and this one says how it has
    *changed*, over whichever window the reader picked.

    ## Why the client cannot do this itself

    Every other figure the analytics page draws is arithmetic over the day
    series in the browser, and the page's oldest rule is that a tab costs no
    request. This is the exception, for two reasons that are both about the
    data rather than about the arithmetic.

    The first is that two of the five metrics are not derivable from what the
    browser has. Efficiency needs each task's `met_deadline`, which the task
    list does carry — but focus needs each *day's* focus goal, and the growth
    series sends the minutes logged and not the goal they were against. A
    client-side scorer would have had to drop focus or invent it.

    The second is the rule in backend/tracking/analytics.py: there is one
    scoring computation in this app. Mirroring five formulas in TypeScript to
    save a request would have created the second one, and the first thing to
    drift would have been the thing nobody checks — a clamp, a fallback, the
    quality basis.

    So `score_window` is parameterised and called from here for every window
    the tab needs, which is six periods, their six predecessors and up to sixty
    points of line. That is one read of the record and a walk over its days: on
    the five-year account in this repository the whole response takes about
    seventy milliseconds.

    ## The snapshot log is not what this reads

    Worth stating, because it is the obvious place to look. `metric_snapshots`
    accumulates a dated row per metric — but only when somebody *opens* the
    report card, so it is a log of visits rather than of days. On the account
    here it covers three weeks against five years of record. It is right for
    "what changed since I was last here" (`/api/metric_history`) and cannot
    answer "how have I changed since I started", which is this tab's question.
    """

    scores = analytics_tracking.period_scores(username, period)
    if scores is None:
        return fail('User not found')
    return ok(**scores)


# --------------------------------------------------------------------------
# Writing one subject up, with a model
# --------------------------------------------------------------------------
#: How many of each list the brief will carry, whatever the page sends.
#:
#: A bound rather than trust. The body of this request is figures the page has
#: already computed and is asking to have read back — the account's own
#: numbers, going to a model and coming back as prose — so nothing here is a
#: permission decision. What it is is an unbounded payload from a client, and
#: the cost of the call scales with it, so the lists are cut before anything
#: is spent on them.
BRIEF_RATES = 8
BRIEF_BANDS = 8
BRIEF_REASONS = 8
BRIEF_GOALS = 4
#: Long enough for a subject name and a window label; short enough that no
#: single field can carry a paragraph into the prompt.
BRIEF_TEXT = 120


class BriefFinding(BaseModel):
    """One row of the findings — a rate, a band, a reason or a goal.

    Deliberately one loose model rather than four strict ones. Every field is
    optional because the four kinds of row share this shape and each fills a
    different half of it, and the alternative is four near-identical models
    plus a discriminator that would exist only to make this file longer.
    """

    label: Optional[str] = None
    title: Optional[str] = None
    now: Optional[float] = None
    done: Optional[int] = None
    holding: Optional[float] = None
    share: Optional[int] = None
    count: Optional[int] = None
    progress: Optional[float] = None
    deadline: Optional[str] = None
    drift: Optional[int] = None


class SubjectBrief(BaseModel):
    """What the subject page has worked out, on its way to being written up."""

    subject: str = ''
    span: str = ''
    #: What the reader said they are chasing here, and where they say they are.
    #: Their words, not a measurement — see `analytics_ambitions` in settings.
    aim: str = ''
    level: str = ''
    checkpoints: List[str] = []
    score: Optional[int] = None
    grade: Optional[str] = None
    finished: Optional[int] = None
    finished_before: Optional[int] = None
    streak: Optional[int] = None
    rates: List[BriefFinding] = []
    bands: List[BriefFinding] = []
    struggles: List[BriefFinding] = []
    goals: List[BriefFinding] = []


def _rows(rows, most):
    """The first `most` rows, as plain dicts with the empty fields dropped."""
    return [{key: value for key, value in row.model_dump().items() if value is not None}
            for row in (rows or [])[:most]]


@router.get('/api/subject_brief')
def subject_brief_available(username: str = Depends(current_username)):
    """Whether the write-up button can do anything.

    Asked so the page can leave the button out entirely rather than draw one
    that fails when pressed. A button that always exists and sometimes says
    "no key" is a worse answer than no button on an install that has no key.
    """

    _, user = load_user(username)
    if not user:
        return fail('User not found')
    return ok(available=subject_brief.configured())


@router.post('/api/subject_brief')
def write_subject_brief(body: SubjectBrief, username: str = Depends(current_username)):
    """A model's reading of one subject's findings. Writes nothing.

    The same contract as `/api/suggest_milestones` in goals.py: a draft rather
    than a record, and every failure comes back as a readable message instead
    of an error status, because the page prints it in the panel. A write-up
    that cannot be made is not a broken request — the page underneath it was
    already complete.

    **The figures come from the client, and that is the right way round here.**
    They are the account's own numbers, computed by the page from the account's
    own tasks (frontend/src/components/Subject/model.ts), and this endpoint
    sends them to a model and hands the prose back to the same page that sent
    them. Nothing is stored, nothing is authorised off them, and no other
    account can see them. Recomputing them here would mean a second
    implementation of eighty figures that would drift from the first, and the
    page would then be showing one set and quoting another.
    """

    _, user = load_user(username)
    if not user:
        return fail('User not found')

    name = (body.subject or '').strip()[:BRIEF_TEXT]
    if not name:
        return fail('There is no subject to write about.')

    findings = {
        'subject': name,
        'span': (body.span or '').strip()[:BRIEF_TEXT],
        'aim': (body.aim or '').strip()[:BRIEF_TEXT * 2],
        'level': (body.level or '').strip()[:BRIEF_TEXT * 2],
        'checkpoints': [str(entry).strip()[:BRIEF_TEXT]
                        for entry in (body.checkpoints or [])[:12] if str(entry).strip()],
        'score': body.score,
        'grade': body.grade,
        'finished': body.finished,
        'finished_before': body.finished_before,
        'streak': body.streak,
        'rates': _rows(body.rates, BRIEF_RATES),
        'bands': _rows(body.bands, BRIEF_BANDS),
        'struggles': _rows(body.struggles, BRIEF_REASONS),
        'goals': _rows(body.goals, BRIEF_GOALS),
    }

    try:
        written = subject_brief.write(findings)
    except subject_brief.BriefUnavailable as exc:
        return fail(str(exc))
    return ok(brief=written)


class GoalPlanBrief(BaseModel):
    """One goal, and the subject record it is read against.

    The figures are the ones the page already drew — `goalsFor` and
    `leversFor` in frontend/src/components/Subject/model.ts — sent back so the
    model can be told to use those and no others. Everything is optional
    because a goal with no target has no rate and a subject with nothing rated
    has no bands, and an absent line is better than a null the model has to
    interpret.
    """

    goal: str = ''
    subject: str = ''
    why: str = ''
    standing: str = ''
    deadline: str = ''
    days_left: Optional[int] = None
    need_weekly: str = ''
    have_weekly: str = ''
    lands: str = ''
    expected: Optional[int] = None
    stages: List[str] = []
    #: What `leversFor` concluded is in the way, as the sentences it wrote.
    levers: List[str] = []

    #: The subject's own record, the same rows `SubjectBrief` carries.
    aim: str = ''
    level: str = ''
    span: str = ''
    score: Optional[int] = None
    grade: Optional[str] = None
    finished: Optional[int] = None
    aimed: Optional[int] = None
    recent_days: Optional[int] = None
    bands: List[BriefFinding] = []
    struggles: List[BriefFinding] = []


@router.post('/api/goal_plan')
def write_goal_plan(body: GoalPlanBrief, username: str = Depends(current_username)):
    """A model's route from here to one goal. Writes nothing.

    The same contract as `/api/subject_brief` above, and the same reasoning
    about where the figures come from: they are the account's own numbers,
    computed by the page from the account's own tasks, sent here to be given
    to a model and handed back to the page that sent them. Nothing is stored
    and nothing is authorised off them.

    Availability is not a second endpoint. Both this and the write-up need an
    Anthropic key and nothing else, so the page asks `/api/subject_brief`
    once and draws both buttons or neither — see `subject_brief.configured`,
    which is what `goal_plan.configured` also calls.
    """

    _, user = load_user(username)
    if not user:
        return fail('User not found')

    title = (body.goal or '').strip()[:BRIEF_TEXT]
    if not title:
        return fail('There is no goal to plan a route to.')

    findings = {
        'goal': title,
        'subject': (body.subject or '').strip()[:BRIEF_TEXT],
        'why': (body.why or '').strip()[:BRIEF_TEXT * 2],
        'standing': (body.standing or '').strip()[:BRIEF_TEXT],
        'deadline': (body.deadline or '').strip()[:BRIEF_TEXT],
        'days_left': body.days_left,
        'need_weekly': (body.need_weekly or '').strip()[:BRIEF_TEXT],
        'have_weekly': (body.have_weekly or '').strip()[:BRIEF_TEXT],
        'lands': (body.lands or '').strip()[:BRIEF_TEXT],
        'expected': body.expected,
        # Bounded here as well as in the module: these are unbounded lists
        # from a client and the cost of the call scales with them.
        'stages': [str(entry).strip()[:BRIEF_TEXT]
                   for entry in (body.stages or [])[:12] if str(entry).strip()],
        'levers': [str(entry).strip()[:BRIEF_TEXT * 3]
                   for entry in (body.levers or [])[:6] if str(entry).strip()],
        'aim': (body.aim or '').strip()[:BRIEF_TEXT * 2],
        'level': (body.level or '').strip()[:BRIEF_TEXT * 2],
        'span': (body.span or '').strip()[:BRIEF_TEXT],
        'score': body.score,
        'grade': body.grade,
        'finished': body.finished,
        'aimed': body.aimed,
        'recent_days': body.recent_days,
        'bands': _rows(body.bands, BRIEF_BANDS),
        'struggles': _rows(body.struggles, BRIEF_REASONS),
    }

    try:
        written = goal_plan.plan(findings)
    except goal_plan.BriefUnavailable as exc:
        return fail(str(exc))
    return ok(plan=written)


class SubjectGoalDraft(BaseModel):
    """What the subject page knows, on its way to a drafted goal.

    The four counts at the top size the target and the four below it pitch it.
    That second half was missing while this panel drafted from volume alone,
    which is how it produced goals a reader could meet without getting any
    better at the subject — see `brief_from` in tracking/subject_goal. The
    write-up and the route were already given these; this is the same evidence
    in the same shape.
    """

    subject: str = ''
    finished: Optional[int] = None
    days: Optional[int] = None
    active_days: Optional[int] = None
    hours: Optional[float] = None
    milestones: List[str] = []
    aim: str = ''
    level: str = ''
    rates: List[Dict[str, Any]] = []
    bands: List[Dict[str, Any]] = []
    struggles: List[Dict[str, Any]] = []


@router.post('/api/suggest_subject_goal')
def suggest_subject_goal(body: SubjectGoalDraft, username: str = Depends(current_username)):
    """A goal drafted for one subject, from its checkpoints. Writes nothing.

    The same contract as `/api/suggest_milestones` in goals.py — a draft rather
    than a record, and every failure comes back as a readable message rather
    than an error status, because the page prints it beside the button.

    What comes back is not a goal. The page shows it, and only the reader
    pressing Create sends it to `/api/add_goal`, which validates it like any
    other goal. Nothing here bypasses that.
    """

    _, user = load_user(username)
    if not user:
        return fail('User not found')

    name = (body.subject or '').strip()[:BRIEF_TEXT]
    if not name:
        return fail('There is no subject to draft a goal for.')

    try:
        drafted = subject_goal.draft({
            'subject': name,
            'finished': body.finished,
            'days': body.days,
            'active_days': body.active_days,
            'hours': body.hours,
            # Bounded here as well as in the module: this is an unbounded list
            # from a client and the cost of the call scales with it.
            'milestones': [str(entry).strip()[:BRIEF_TEXT]
                           for entry in (body.milestones or [])[:12] if str(entry).strip()],
            'aim': (body.aim or '').strip()[:BRIEF_TEXT],
            'level': (body.level or '').strip()[:BRIEF_TEXT],
            # Same bound and same reason as the checkpoints above. Five rates,
            # five difficulty bands and twelve reasons are the whole of what
            # the page can hold, so anything past that is a client saying
            # something the app never asks it to say.
            'rates': (body.rates or [])[:8],
            'bands': (body.bands or [])[:8],
            'struggles': (body.struggles or [])[:12],
        })
    except subject_goal.BriefUnavailable as exc:
        return fail(str(exc))
    return ok(draft=drafted)
