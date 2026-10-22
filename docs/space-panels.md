# Analytics, Timer and Achievements panels in Spaces

A Space page (`/spaces/:id`, `/team/:id`) can hold **panel blocks**: one of the
app's own panels, drawn by the same component its page uses, from the
account's live numbers, with settings of its own. They're in the `/` menu under
Analytics, Suggestions, Insights and habits, Growth and subjects, Timer, and
Goals & records.

- Kinds and the settings each takes: `shared/rules.json` `spaces.panels`.
- Cleaning (both sides, pinned by `shared/cases/space_panels.json`):
  `frontend/src/components/Spaces/panels.ts`, `backend/tracking/panels.py`.
- Block frame and settings: `frontend/src/components/Spaces/PanelBlock.tsx`.
- What each kind draws: `frontend/src/components/Spaces/panelViews.tsx`.
- Shared reads (one Analytics fetch, one model per time range and subject,
  one focus clock per page): `frontend/src/components/Spaces/SpaceData.tsx`.

A block stores only `{kind, ...settings}`. Nothing it shows is saved. It reads
again when the account changes (the same `X-Summit-Live` header and revision
poll live blocks use), and a control inside a panel that is also a setting
(what the trend chart plots and how it groups days, the plan's minutes, the growth
period, the timeline's lines) writes the setting, so it sticks after a reload.

The existing live blocks (goal, goals, records, record, calendar,
productivity, growth, skills, heatmap, rhythm, subjects) are unchanged, except
that the **Records** block can now be set to show only the records you tick and
sorted newest best, most improved, most logged or A to Z, and the **All goals**
block can show only the goals you tick.

## Inventory: the Analytics page

Every panel, card, chart and suggestion box on the five Analytics tabs
(`frontend/src/pages/Analytics.tsx` and `components/Analytics/tabs/*`), and
the block that puts it on a Space. Settings are what the block lets you
change; every block can also be renamed, resized and moved.

**70 of 72 elements are available as Space blocks (97%).** The two that aren't
are gate cards, listed at the end with the reason. The page's own chrome (title
bar, tab bar, the time range and subject pickers, the export buttons, the setup
questions and the "you reached a new stage" overlay) isn't counted: those are
controls, and every block has its own time range and subject instead.

### Recommendations (7 of 7)

| Element | Component | Block kind | Settings |
| --- | --- | --- | --- |
| Why the plan is in this order | `LensCard` | `lens` | style: full panel or one line |
| XP pulse | `XpPulse` | `xp-pulse` | time range |
| What to do next (the plan) | `NextActions` | `plan` | minutes (15 to 120), how many rows |
| What's going on (diagnosis) | `DiagnosisCards` / `DiagnosisEmpty` | `diagnosis` | how many |
| Changes you're trying | `FollowupPanel` | `followup` | how many |
| Sessions to plan | `NextSessionsPanel` | `sessions` | its own subject picker |
| What Summit knows (coach) | `Knows` | `coach` | how many |

### Overview (20 of 20)

| Element | Component | Block kind | Settings |
| --- | --- | --- | --- |
| Score and grade (opening) | `Summary` | `summary` | none |
| Early read tag | `EarlyRead` | inside `tiles` | (follows the account) |
| Headline tiles | `Tiles` | `tiles` | time range; which of productivity, consistency, quality, tasks, focus |
| Trend chart | `Trajectory` | `trajectory` | time range, what it plots (6), group by day, week or month |
| What your work says | `FirstReads` | `first-reads` | none |
| Goals finished | `GoalsFinished` | `goals-finished` | none |
| Your targets | `BaselinePanel` / set targets | `targets` | time range |
| Quality | `QualityPanel` + `DepthPicker` | `quality` | time range, subject |
| How hard vs. how well | `QualityGridPanel` | `quality-grid` | time range, subject |
| Consistency calendar | `ConsistencyPanel` | `heat` | 30 days, 90 days or a year |
| Goal lens line | `LensLine` | `lens` (one line) | style |
| What you told us | `WhatYouToldUs` | `told-us` | none |
| The basics (early accounts) | `Collecting`'s counts via `StatRow` | `basics` | time range; which of tasks, focus, XP, streak, completion |
| What's already true | `ObservationNote` | `observations` | how many |
| Where the work went | `SubjectPanel` | `subject-xp` | time range; full panel or one line |
| Time away notice | `AwayNotice` | `stage` | which parts show |
| Stage ladder | `StageLadder` | `stage` | which parts show |
| Stage note | `StageNote` (+ `FirstMilestone`) | `stage` | which parts show |
| Up next | `Upcoming` | `stage` | which parts show |
| How days count | `ActiveDayPrinciple` | `stage` | which parts show |

### Insights (22 of 23)

| Element | Component | Block kind | Settings |
| --- | --- | --- | --- |
| Opening line | `habitLead` in `TabOpening` | `habit-lead` (one line) | time range, subject, style |
| Time of day (early) | `WhenPanel` (Early) | `early-when` | time range, subject |
| How tasks end (early) | `FinishPanel` | `finishes` | none |
| What changed | `ChangedPanel` (+ `EarlyRead`) | `changed` | how many |
| Habit numbers | `HabitTiles` | `habit-tiles` | time range, subject |
| Your habits in short | `HabitOpening` | `habit-lead` | time range, subject, style |
| Habit patterns | `PatternsPanel` | `habit-patterns` | time range, subject, how many |
| Habit cards | `HabitCards` | `habits` | time range, subject, how many |
| Say vs. do | `SayVsDo` | `say-do` | none |
| Best and worst work | `RatedTasksPanel` | `best-worst` | time range, subject |
| Why it went that way | `WhyPanel` | `why` | time range, how many |
| How you work | `HowPanel` | `how` | time range, subject, how many |
| What goes with what | `RelationshipsPanel` | `links` | time range, subject |
| Your reasons | `ReasonsPanel` | `reasons` | time range, subject (and the depth picker when reasons are off) |
| How steady each habit is | `ConsistencyPanel` (Habits) | `habit-steady` | time range, subject |
| When each habit began | `TimelinePanel` | `habit-timeline` | time range, subject |
| Hours you work | `ClockPanel` | `clock` | time range, subject |
| Days you work | `WeekPanel` | `week` | time range |
| Follow-through: scores | `FocusChapter` | `follow-through` | which parts show |
| Follow-through: planned vs. done | `FocusChapter` | `follow-through` | which parts show |
| Follow-through: focus depth | `FocusChapter` | `follow-through` | which parts show |
| Follow-through: bouncing back | `FocusChapter` | `follow-through` | which parts show |
| Not covered: the "Insights opens after N days" card | `Building` | none | see below |

The follow-through block can also show the three parts of the chapter the
Insights tab leaves out (its calendar, habit stability and the trail over
time), which the Growth page used to draw. They aren't counted above.

### Subjects (7 of 7)

| Element | Component | Block kind | Settings |
| --- | --- | --- | --- |
| Opening line | `SubjectsOpening` | `subject-xp` (one line) | time range, style |
| Skills and subjects chapter (skill cards, how it's going, growth, balance, mastery track, moving and waiting, how it's counted) | `SkillsChapter` | `skills-chapter` | its own subject and window pickers |
| Goals on your subjects | `GoalLines` | `goal-lines` | time range |
| What each goal runs into | `LimiterLine` (in `GoalLines`) | `goal-lines` | time range |
| Where the work went (linked) | `SubjectPanel` | `subject-xp` | time range |
| How far into each tree | `TreeDepthPanel` | `tree-depth` | how many |
| What each subject opens | `SubjectOpensPanel` | `subject-opens` | time range, how many |

The skills chapter counts as one element here, with its seven parts named.
They come as one block because the chapter's own picker drives all seven.

### Growth (14 of 15)

| Element | Component | Block kind | Settings |
| --- | --- | --- | --- |
| Skill growth | `SkillGrowthPanel` | `skill-growth` | time range, how many |
| Skills by level | `SkillLevelsPanel` | `skill-levels` | how many |
| Time vs. progress | `TimeProgressPanel` | `time-progress` | time range |
| Skill shape | `SkillShapePanel` | `skill-shape` | none |
| Growth timeline | `GrowthTimelinePanel` + `PeriodTabs` | `growth-line` | time range; which lines (productivity, consistency, quality, efficiency, focus, overall) |
| Then and now | `ThenNow` | `then-now` | time range |
| Biggest improvement | `MoverPanel` (best) | `movers` | time range; which of the two show |
| Needs attention | `MoverPanel` (worst) | `movers` | time range; which of the two show |
| What changed behind the scores | `ScoreChangesPanel` | `score-changes` | time range |
| Growth by period | `PeriodCards` | `periods` | time range (pressing a card sets it) |
| Score milestones | `MilestoneFeed` | `milestones` | time range, how many |
| Core hours | `CoreHoursPanel` | `core-hours` | time range, subject |
| Every day of the last year | `ConsistencyPanel` | `heat` | range |
| Year by year | `YearOnYear` | `years` | none |
| Not covered: "couldn't load your grades" card | `Building` (problem) | none | see below |

### Not covered, and why

- **Insights' "opens after N days" card** (`Building`). It's the tab's empty
  state, not a panel. Each block for an Insights panel says on its own what
  it's waiting for ("This opens after 4 more days of work").
- **Growth's "couldn't load your grades" card** (`Building`, problem). It's an
  error state. A Growth block that can't load says so in its own body.

Not counted at all: the per-subject pages (`/analytics/subject/:id`,
`pages/SubjectAnalytics.tsx`) are their own pages, not Analytics tabs. Every
block with a subject setting shows that panel for one subject.

## Timer blocks

From `frontend/src/pages/Timer.tsx`; the shared pieces now live in
`frontend/src/components/Timer/panels.tsx` and the Timer page imports them.
One focus clock runs per Space page, so two timer blocks never log a session
twice.

| Block kind | What it is | Settings |
| --- | --- | --- |
| `timer` | The focus clock (`FocusPanel`): start, pause, skip, reset, today's count | which extras show: what you're working on, the method pickers |
| `timer-task` | What you're working on (`TaskPicker`) | how many tasks |
| `timer-today` | Sessions by task (`TodaySittings`) | today, 7 days or 30 days |
| `timer-recent` | Recent sessions with their pause strips (`RecentSessions`) | how many |
| `timer-suggest` | Suggested session length (`Recommend`), with a button to use it | none |
| `timer-chart` | Focus per day, from the session log | 7, 14 or 30 days; minutes or sessions; bars or area |

## Goals & records

| Block kind | What it is | Settings |
| --- | --- | --- |
| `badges` | Badges (`BadgeTile` from the badge wall) | category, earned / up next / all, how many |
| Records (live) | Personal bests | only the records you tick, category, sort, how many, style |
| All goals (live) | Goals and their pace | only the goals you tick, or open / all / finished, style |
