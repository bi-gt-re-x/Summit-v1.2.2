/**
 * Every figure the analytics page states, worked out once.
 *
 * ## Why this is one hook and not seven
 *
 * The page's oldest rule is that a tab costs no request and no second
 * implementation: every panel on all seven tabs is arithmetic over the same
 * three responses, so two tabs cannot quietly disagree about a number. Moving
 * the arithmetic *into* the tabs would have given that up — each tab holding
 * its own memos means the same figure computed twice, from two call sites that
 * drift apart the first time one of them is edited.
 *
 * It would also have broken the page. Before rendering a tab, the page has to
 * decide whether that tab has anything to say — the `Building` gates and the
 * opening sentence both read figures belonging to the tab they are gating. A
 * memo that lives inside the tab is a memo the gate cannot see.
 *
 * So the split is the one the page needed rather than the obvious one:
 * **calculations centralised here, presentation in the tab components.** This
 * file knows nothing about layout and renders nothing; the tabs know nothing
 * about where a figure came from.
 *
 * Everything below is memoised against the window slice, so switching tabs
 * recomputes nothing. Computing a hidden tab's figures costs a pass or two over
 * an array already in memory, once per window change, which is the price of the
 * paragraph above.
 *
 * ## What that price actually is
 *
 * Measured rather than estimated, because "seventy-nine memos" is the sort of
 * number that invites a rewrite on principle. Over the largest account in the
 * database — 8,268 tasks, 1,100 days — the two things a reader can press:
 *
 *     window picker moves    ~9 ms    (the slice, and everything keyed on it)
 *     subject picker moves  ~10 ms    (the twelve memos keyed on `bySubject`)
 *
 * Both are inside a frame, and both happen on a click rather than on a render.
 * Two of the nineteen calls behind those totals account for half of each —
 * `relationships` and `subjectQuality`, which are the two that walk the tasks
 * and the days together — so the shape of any future work here is those two
 * functions, not the memo boundaries.
 *
 * The subject axis is worth naming because it is not obvious: `subject` narrows
 * `bySubject`, and only what reads `bySubject` recomputes when it moves. The
 * goal panels, the clock's own rhythm, the day-series figures and everything
 * keyed on `tasks` directly are all untouched by it.
 *
 * ## Two windows, on purpose
 *
 * Most of this is scoped by the picker. The advice half is not — see "The
 * recent window" below, which is the single most surprising thing in this file
 * and the comment to read before changing anything in it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '@/hooks';
import {
  consistency,
  sliceWindow,
  pointLabel,
  spanLabel,
  windowOption,
  type Grain,
  type MetricKey,
  type WindowKey,
} from './data';
import { growthScore } from './score';
import {
  growthInsights,
  heatmapGrid,
  summaryFigures,
  tileSeries,
} from '@/utils/growthSummary';
import { subjectXp } from '@/utils/subjectXp';
import {
  balanceShape,
  clockShape,
  rhythmShape,
  subjectQuality,
  weekShape,
} from '@/utils/behaviour';
import {
  buildHabits,
  habitDays,
  habitPatterns,
  habitShifts,
  habitSummary,
} from '@/utils/habits';
import {
  currentState,
  howFindings,
  relationships,
  whatsWorking,
  whyFindings,
} from '@/utils/insight';
import { goalActions, goalNotes, goalsOverview } from '@/utils/goalAnalytics';
import { goalLimiters } from '@/utils/goalLimiter';
import { leadingLens } from '@/utils/goalLens';
import { goalHealth } from '@/utils/goalHealth';
import {
  checkpointsByMonth,
  effortAgainstPriority,
  goalHeadline,
  goalWorkShare,
  paceMap,
  suggestGoals,
} from '@/utils/goalSuggest';
import {
  qualityBands,
  qualityGrid,
  ratedTasks,
  ratingFindings,
  reasonFindings,
  summariseRatings,
  summariseReasons,
} from '@/utils/ratings';
import { outlook, recommendations } from '@/utils/advice';
import { PATTERN_DAYS, RECENT_DAYS, daysUntilNextWeek, recentWindow, weekStamp } from '@/utils/recent';
import { dataMaturity } from '@/utils/dataMaturity';
import { detailRules, toneRules } from '@/utils/analyticsPrefs';
import { diagnose, vitals } from '@/utils/diagnosis';
import { analyticalScore } from '@/utils/analyticalScore';
import { discoverPatterns } from '@/utils/patterns';
import { DEFAULT_BUDGET, buildPlan } from '@/utils/nextActions';
import { reviewAdopted, summarise } from '@/utils/followup';
import type { AnalyticsData } from './useAnalyticsData';
import type { SubjectIndex } from '@/hooks/useSubjects';
import { observations } from '@/utils/observations';
import type { Task } from '@/types';
import type { Prefs } from '@/services/settings';

/** How many named subjects get a spoke before Other takes the rest. */
const RADAR_SUBJECTS = 6;

/** See the note on `waitFor` below for why these are three numbers and not one. */
export const NEED_DAYS = { habits: 21, insights: 28, recommendations: 14 };

export function useAnalyticsModel(data: AnalyticsData, subjects: SubjectIndex) {
  const { stats, tasks: taskCall, series, ratings, goals, adopted, gradedLog, scoreLog } = data;

  /* Opens on the account's chosen period. Not kept in step with it after
     that: the control on this page is the reader changing their mind for one
     visit, and writing that back would make every glance a preference.

     `ready` is what makes "opens on" true. The preferences are read near the
     root and arrive a moment after this page mounts, so the initial state
     below is the built-in default rather than the account's answer as often as
     not — the page opened on a year for somebody who had chosen thirty days.
     Following the preference until the reader touches the control fixes that
     without going back on the paragraph above. */
  const { prefs, ready, update } = useSettings();
  const [span, setSpan] = useState<WindowKey>(prefs.analytics_window);
  const spanChosen = useRef(false);
  useEffect(() => {
    if (ready && !spanChosen.current) setSpan(prefs.analytics_window);
  }, [prefs.analytics_window, ready]);

  const chooseSpan = useCallback((next: WindowKey) => {
    spanChosen.current = true;
    setSpan(next);
  }, []);

  /*
   * The four analytics preferences the page reads, resolved once.
   *
   * The stored values are words; what a word *means* is utils/analyticsPrefs'
   * business, and resolving here rather than in each panel is the same
   * argument the rest of this file is built on — a tab holding its own copy of
   * "what does gentle mean" is a second implementation waiting to disagree
   * with the first. Tone changes no arithmetic below it; see that module.
   */
  const tone = prefs.analytics_tone;
  const rules = useMemo(() => toneRules(tone), [tone]);
  const detail = useMemo(() => detailRules(prefs.analytics_detail), [prefs.analytics_detail]);
  const logStyle = prefs.analytics_log_style;
  const showStanding = prefs.analytics_standing;
  // Productivity rather than total XP, and weekly rather than daily. The pair
  // is one decision: the chart opens on a rate, and a rate at daily grain over
  // a year is scatter. See METRICS in components/Analytics/data.
  const [metric, setMetric] = useState<MetricKey>('productivity');
  const [grain, setGrain] = useState<Grain>('weekly');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('');

  const all = useMemo(() => series.data?.growth_data ?? [], [series.data]);
  const slice = useMemo(() => sliceWindow(all, span), [all, span]);
  const option = windowOption(span);
  const spanText = spanLabel(slice.current);

  /* The sixteen columns, not the whole row. Assignable to `Task`, which is why
     nothing downstream of here changed — see `AnalyticsTask` in
     services/analytics. */
  const tasks: Task[] = useMemo(() => taskCall.data?.tasks ?? [], [taskCall.data]);
  const fromIso = slice.current[0]?.date ?? '';
  const toIso = slice.current[slice.current.length - 1]?.date ?? '';
  const wasFrom = slice.previous[0]?.date ?? '';
  const wasTo = slice.previous[slice.previous.length - 1]?.date ?? '';

  const nameOf = useCallback((id: string) => subjects.get(id)?.name ?? id, [subjects]);

  /* `custom` rides along because one consumer has to tell an account's own
     subject from a catalogue one: the setup wizard, whose answers decide which
     subjects get a skill tree and a page, and there is no tree behind an
     invented name. Everything else here keeps them — a label to file work
     under is all the filters need. See `latticeSubjects` in skills/subjectMap. */
  const subjectOptions = useMemo(
    () =>
      [...subjects.values()]
        .filter((entry) => entry.used > 0)
        .map((entry) => ({ id: entry.id, label: entry.name, custom: entry.custom })),
    [subjects],
  );

  /** The chosen subject's own name, or null when the filter is off.
   *
   *  The id is what the panels filter on; this is what the page is allowed to
   *  say out loud. A panel that cannot honour the filter has to name the
   *  subject it is *not* narrowed to, and printing the raw id there —
   *  `computer_science` — would be the page talking to itself. */
  const subjectLabel = useMemo(
    () => (subject ? subjects.get(subject)?.name ?? subject : null),
    [subject, subjects],
  );

  /** The subject filter narrows the tasks a panel counts, nothing else — XP and
   *  focus minutes are recorded per day, not per subject, so the tiles and the
   *  day-series charts cannot honour it and do not pretend to. */
  const bySubject = useMemo(
    () => (subject ? tasks.filter((task) => task.subject === subject) : tasks),
    [subject, tasks],
  );

  /** The same, narrowed to tasks actually finished inside the window. */
  const finished = useMemo(
    () =>
      bySubject.filter((task) => {
        const day = String(task.completed_at || '').slice(0, 10);
        return Boolean(day) && day >= fromIso && day <= toIso;
      }),
    [bySubject, fromIso, toIso],
  );

  // ---- Overview -----------------------------------------------------------
  const figures = useMemo(() => summaryFigures(slice), [slice]);
  const sparks = useMemo(() => tileSeries(slice), [slice]);
  const insights = useMemo(() => growthInsights(slice), [slice]);
  const rhythmRate = useMemo(() => consistency(slice), [slice]);
  // Always a year, whatever the window says — see the note at the top.
  const heatRows = useMemo(() => heatmapGrid(all, '365'), [all]);

  // The score and the five metrics it is the mean of, assembled from the report
  // card rather than read off `overall` — see components/Analytics/score.
  const card = useMemo(() => growthScore(ratings.data ?? null), [ratings.data]);
  const score = card.value;

  /**
   * The same five metrics, out of a hundred, with a letter on them.
   *
   * Not a second score. `growthScore` above and this are one calculation shown
   * at two scales — the tile prints the mean over ten, this prints it over a
   * hundred — so they cannot disagree. See utils/analyticalScore.
   */
  const analytical = useMemo(() => analyticalScore(ratings.data ?? null), [ratings.data]);
  /**
   * The score's line: its own recorded readings, and nothing else.
   *
   * This used to fall back to `scoreHistory` — a generated climb with the real
   * score pinned on the last point — on the grounds that a panel titled "over
   * time" with one point in it is worse than one with a shape. It is not. That
   * curve was the last invented figure on the page, and it sat on the one tab
   * that never wore a chip, which made it the least honest thing here rather
   * than the most forgivable. An account with fewer than two readings gets no
   * line and a sentence saying why; see `ScorePanel`.
   */
  const recorded = scoreLog.data?.points ?? [];
  const scoreLine = useMemo(() => recorded.map((point) => point.score / 10), [recorded]);
  const scoreMarks = useMemo(
    () => (recorded.length >= 2 ? ['First reading', '', '', 'Now'] : []),
    [recorded],
  );
  /* When each reading was taken, for the chart's readout. `scoreMarks` cannot
     serve: it is four labels for however many readings there are, two of them
     deliberately blank. See `dates` on `ScorePanelProps`. */
  const scoreDates = useMemo(() => recorded.map((point) => pointLabel(point.date)), [recorded]);


  const breakdown = useMemo(
    () => subjectXp(bySubject, subjects, fromIso, toIso, RADAR_SUBJECTS),
    [bySubject, fromIso, subjects, toIso],
  );

  /*
   * What can honestly be said about this reader as a tendency, strongest
   * first — see the note at the top of utils/observations for the floors.
   *
   * Here rather than in the tabs that draw it, for the reason at the top of
   * this file: four tabs want it now (Overview at its early stages, and the
   * three gated ones, which show the strongest finding while they are still
   * filling) and four call sites would be four chances to pass a different
   * task list and print a different finding on each.
   */
  const observed = useMemo(() => observations(tasks), [tasks]);

  /** The same subjects over the period before, keyed for the per-row change. */
  const previousBySubject = useMemo(() => {
    const map = new Map<string, number>();
    if (!wasFrom) return map;
    subjectXp(bySubject, subjects, wasFrom, wasTo, RADAR_SUBJECTS).rows.forEach((row) =>
      map.set(row.key, row.xp),
    );
    return map;
  }, [bySubject, subjects, wasFrom, wasTo]);

  // ---- Ratings ------------------------------------------------------------
  /**
   * What the reader said about the work, over the window on screen.
   *
   * Scoped by the window like everything else, and by the subject filter,
   * because these are tasks and the filter narrows tasks. Every one of these is
   * safe on an account that has never rated anything — see utils/ratings, where
   * "nothing rated" is a first-class answer rather than a zero.
   */
  const qualitySummary = useMemo(
    () => summariseRatings(bySubject, fromIso, toIso),
    [bySubject, fromIso, toIso],
  );
  const rated = useMemo(() => ratedTasks(bySubject, fromIso, toIso), [bySubject, fromIso, toIso]);
  const ratingRows = useMemo(() => ratingFindings(qualitySummary, rated), [rated, qualitySummary]);
  const ratingBands = useMemo(() => qualityBands(rated), [rated]);
  const ratingGrid = useMemo(() => qualityGrid(rated), [rated]);

  /* The third question's answers, at rating_depth 'reasons'. Counted from the
     same tasks as everything above — an account on the other two levels has
     none, and the panel that reads these draws nothing rather than a row of
     zeroes. */
  const reasons = useMemo(
    () => summariseReasons(bySubject, fromIso, toIso),
    [bySubject, fromIso, toIso],
  );
  const reasonRows = useMemo(() => reasonFindings(reasons), [reasons]);

  /* How much the prompt asks, changeable from here. It is the same preference
     the settings page owns; this is the surface where the difference between
     the three levels is actually visible, so it is the second place that owns
     it — the arrangement the rail's collapse button already has. */
  const setDepth = useCallback(
    (next: Prefs['rating_depth']) => {
      void update({ rating_depth: next });
    },
    [update],
  );
  // ---- The behavioural shapes, shared by three tabs -----------------------
  const week = useMemo(() => weekShape(slice.current), [slice]);
  const clock = useMemo(() => clockShape(finished), [finished]);
  const rhythm = useMemo(() => rhythmShape(slice.current), [slice]);
  const balance = useMemo(
    () => balanceShape(tasks, nameOf, fromIso, toIso),
    [fromIso, nameOf, tasks, toIso],
  );

  // ---- The recent window, which advice reads instead of the picker --------
  /**
   * Everything below this line ignores the window picker on purpose.
   *
   * The picker answers "how far back do I want to look", and for a total or a
   * trajectory that is the reader's call. Advice is a different kind of claim:
   * a recommendation drawn from a year of record describes a person who may not
   * exist any more — the term ended, the instrument changed, the timetable
   * moved. What to do this week has to come from the weeks either side of it.
   *
   * So Next Actions, the diagnosis, the patterns and the recommendations all
   * read a fixed recent window from utils/recent — a fortnight for the things
   * that say what to do, a month for the things that claim a pattern, because
   * splitting a fortnight in two leaves a week on each side and a week is not
   * enough to tell a real difference from a good Tuesday.
   */
  const recent = useMemo(() => recentWindow(all, RECENT_DAYS), [all]);
  const patternWindow = useMemo(() => recentWindow(all, PATTERN_DAYS), [all]);

  /**
   * The week this advice belongs to, and the button that re-reads it.
   *
   * `stamp` is the ISO week. Anything keyed on it holds still for seven days
   * and then moves on its own — which is the point: advice that reshuffles on
   * every page load cannot be acted on, because the thing you decided to do
   * this morning is gone by lunchtime.
   *
   * `nudge` is what the plan's own refresh button bumps, and it exists for the
   * half of the problem a re-fetch does not solve. Re-fetching brings in tasks
   * finished since the page opened, and the memos below recompute on their own
   * when it lands. But the plan also reads the *clock* — what is overdue, what
   * is due today, whether anything is logged yet — and none of that changes
   * just because the data did. Bumping the nudge is what re-asks the clock.
   *
   * Neither is a re-roll. Within one week the same record gives the same
   * answer, because the answer is derived rather than shuffled.
   */
  const [nudge, setNudge] = useState(0);
  const stamp = useMemo(() => weekStamp(new Date()), []);
  const weekLeft = useMemo(() => daysUntilNextWeek(new Date()), []);

  /* Tasks finished inside the recent window, and inside the pattern window.
     Unfiltered by subject, unlike `finished` above: advice about which subject
     to change cannot be computed from one subject. */
  const recentFinished = useMemo(
    () =>
      tasks.filter((task) => {
        const at = String(task.completed_at || '').slice(0, 10);
        return Boolean(at) && at >= recent.fromIso && at <= recent.toIso;
      }),
    [recent, tasks],
  );
  const patternFinished = useMemo(
    () =>
      tasks.filter((task) => {
        const at = String(task.completed_at || '').slice(0, 10);
        return Boolean(at) && at >= patternWindow.fromIso && at <= patternWindow.toIso;
      }),
    [patternWindow, tasks],
  );

  /* The same behavioural shapes the picker-scoped tabs read, taken over the
     fortnight instead. Recommendations reads these; Habits and Insights keep
     the picker-scoped ones above, because those tabs report rather than
     advise. */
  const recentWeek = useMemo(() => weekShape(recent.current), [recent]);
  const recentClock = useMemo(() => clockShape(recentFinished), [recentFinished]);
  const recentRhythm = useMemo(() => rhythmShape(recent.current), [recent]);
  const recentBalance = useMemo(
    () => balanceShape(tasks, nameOf, recent.fromIso, recent.toIso),
    [nameOf, recent, tasks],
  );
  const recentSubjects = useMemo(
    () => subjectQuality(tasks, nameOf, recent.fromIso, recent.toIso),
    [nameOf, recent, tasks],
  );
  const recentQuality = useMemo(
    () => summariseRatings(tasks, recent.fromIso, recent.toIso),
    [recent, tasks],
  );
  const recentReasons = useMemo(
    () => summariseReasons(tasks, recent.fromIso, recent.toIso),
    [recent, tasks],
  );

  // ---- Growth diagnosis ---------------------------------------------------
  /**
   * The fortnight against the one before it, as tensions rather than scores.
   *
   * Both halves read the same task list so every comparison is like against
   * like, and both recompute on their own when a re-read brings new tasks in —
   * nothing here reads the clock, so unlike the plan below it needs no nudge.
   */
  const nowVitals = useMemo(() => vitals(recent.current, tasks), [recent, tasks]);
  const beforeVitals = useMemo(() => vitals(recent.previous, tasks), [recent, tasks]);
  const diagnoses = useMemo(
    () => diagnose(nowVitals, beforeVitals),
    [beforeVitals, nowVitals],
  );

  /* How many of them the tab actually draws. `diagnoses` stays whole because
     the export writes all of them — a downloaded report is read once, at
     leisure, and is the wrong place to be protecting somebody from the third
     tension in their own fortnight. The screen is where the cap belongs. */
  const shownDiagnoses = useMemo(
    () => diagnoses.slice(0, rules.diagnoses),
    [diagnoses, rules.diagnoses],
  );

  // ---- Discovered patterns ------------------------------------------------
  const discovered = useMemo(
    () =>
      discoverPatterns({
        days: patternWindow.current,
        finished: patternFinished,
        nameOf,
      }),
    [nameOf, patternFinished, patternWindow],
  );

  /* Declared here rather than down in the Goals block because `lens` below is
     its first reader, and the plan under that reads the lens. */
  const liveGoals = useMemo(() => goals.data?.goals ?? [], [goals.data]);

  /**
   * Which reading of this record the reader's goals call for.
   *
   * The page has always printed its five metrics in one order on every
   * account, which is a guess about what the reader came for — and the same
   * guess whether they are trying to stop losing easy marks or trying to solve
   * harder problems than they currently can. See utils/goalLens.
   *
   * Above `plan` because the plan reads it. Null on most accounts and on every
   * young one, and the page then behaves exactly as it did.
   *
   * Not scoped by the window picker, deliberately, and for the reason the goal
   * panels are not either: what somebody is aiming at does not change because
   * they looked at thirty days instead of a year.
   */
  const lens = useMemo(() => leadingLens(liveGoals, tasks), [liveGoals, tasks]);

  // ---- What to do next ----------------------------------------------------
  const [budget, setBudget] = useState<number>(DEFAULT_BUDGET);
  const plan = useMemo(
    () =>
      buildPlan({
        tasks,
        goals: goals.data?.goals ?? [],
        days: recent.current,
        nameOf,
        budget,
        stamp,
        lens,
      }),
    // `nudge` re-reads the plan against the clock: a task finished since the
    // page opened should leave it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [budget, goals.data, lens, nameOf, recent, stamp, tasks, nudge],
  );

  // ---- Habits -------------------------------------------------------------
  const habits = useMemo(
    () => buildHabits(bySubject, nameOf, fromIso, toIso),
    [bySubject, fromIso, nameOf, toIso],
  );

  /** The calendar carries its own zoom, so it is fed the whole account rather
   *  than the page's window — a year of squares scoped to a 7-day window would
   *  be 358 blanks and one live week. */
  const byDate = useMemo(
    () => habitDays(bySubject, all[0]?.date ?? '', toIso),
    [all, bySubject, toIso],
  );
  const patterns = useMemo(
    () => habitPatterns(bySubject, habits, fromIso, toIso),
    [bySubject, fromIso, habits, toIso],
  );
  const shifts = useMemo(() => habitShifts(habits, toIso), [habits, toIso]);
  const summary = useMemo(() => habitSummary(habits, slice.current), [habits, slice]);

  // ---- Insights -----------------------------------------------------------
  const why = useMemo(() => whyFindings(slice.current), [slice]);
  const how = useMemo(
    () => howFindings(slice.current, finished, clock, rhythm),
    [clock, finished, rhythm, slice],
  );
  const wins = useMemo(() => whatsWorking(slice.current, habits), [habits, slice]);
  const links = useMemo(
    () => relationships(slice.current, bySubject, week),
    [bySubject, slice, week],
  );
  const state = useMemo(
    () => currentState(slice.current, rhythm, week, balance),
    [balance, rhythm, slice, week],
  );

  // ---- Goals --------------------------------------------------------------
  /* All of these read the goals fetched for the Records tab, so this tab costs
     no request of its own — the same rule the rest of the page follows.
     `liveGoals` itself is declared above, beside `lens`, which is its first
     reader and runs before this block. */
  const goalSet = useMemo(() => goalsOverview(liveGoals, tasks), [liveGoals, tasks]);
  const goalRows = useMemo(() => goalNotes(liveGoals, tasks), [liveGoals, tasks]);
  const goalIdeas = useMemo(
    () =>
      suggestGoals({
        goals: liveGoals,
        tasks,
        days: slice.current,
        // The window's subject split, as shares — the same rows the Subjects
        // tab draws, so a suggestion about a subject and the bar chart of it
        // cannot disagree.
        subjects: breakdown.rows
          .filter((row) => row.key !== 'other')
          .map((row) => ({
            id: row.key,
            label: row.name ?? row.label,
            xp: row.xp,
            share: breakdown.total > 0 ? row.xp / breakdown.total : 0,
          })),
        currentStreak: stats.stats?.current_streak ?? 0,
      }),
    [breakdown, liveGoals, slice, stats.stats, tasks],
  );

  /** How much of the account's finished work is aimed at a goal. */
  const aimedShare = useMemo(() => goalWorkShare(tasks), [tasks]);

  /**
   * The two rows of advice the goals themselves produce.
   *
   * `goalActions` is per goal and returns nothing for a goal that is simply
   * going well, so this is empty on a healthy account. Urgent first, then one
   * per goal at most — three rows about the same drifting goal is the goals
   * page, which is one link away.
   */
  const goalAdvice = useMemo(() => {
    const seen = new Set<string>();
    return liveGoals
      .filter((goal) => goal.status !== 'completed')
      .flatMap((goal) =>
        goalActions(goal, tasks)
          .filter((action) => action.tone === 'urgent' || action.tone === 'nudge')
          .slice(0, 1)
          .map((action) => ({ ...action, goalTitle: goal.title, goalId: goal.id })),
      )
      .filter((row) => (seen.has(row.goalId) ? false : seen.add(row.goalId)))
      .sort((a, b) => Number(b.tone === 'urgent') - Number(a.tone === 'urgent'))
      .slice(0, 2);
  }, [liveGoals, tasks]);

  /**
   * What is most holding each goal up, and where to go about it.
   *
   * The one goal reading on this page that names a *subject* rather than a
   * signal: `goalAdvice` above says the pace is short or the goal has gone
   * quiet, and neither sentence can tell a reader which part of the work to
   * open. Five tabs print this, at two sizes — see ./Limiter — and all five
   * read the same array, so none of them can quietly disagree about which
   * subject is the limiter.
   *
   * Empty on most accounts, and that is the design rather than a gap in it:
   * utils/goalLimiter will not name a culprit off a pile too small to have
   * one.
   */
  const goalLimits = useMemo(
    () => goalLimiters(liveGoals, tasks, nameOf, (id) => subjects.get(id)?.group),
    [liveGoals, nameOf, subjects, tasks],
  );

  /** Subject ids some live goal names, for the line on the Subjects tab. */
  const goalSubjects = useMemo(
    () =>
      new Set(
        liveGoals
          .filter((goal) => goal.status !== 'completed')
          .flatMap((goal) =>
            String(goal.subject_ids || '')
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean),
          ),
      ),
    [liveGoals],
  );

  /* The three charts. All arithmetic over `liveGoals` and `tasks`, both of
     which the page already had — no tab on this page fetches for itself. */
  const goalPace = useMemo(
    () => paceMap(liveGoals, (goal) => goalHealth(goal, tasks).state),
    [liveGoals, tasks],
  );
  const goalEffort = useMemo(() => effortAgainstPriority(liveGoals, tasks), [liveGoals, tasks]);
  const goalCheckpoints = useMemo(() => checkpointsByMonth(liveGoals), [liveGoals]);

  /**
   * The dozen words at the head of the tab.
   *
   * The subject clause names the one the most goal-aimed work went to, and
   * only when it is actually the leader rather than the first row of a tie —
   * see `goalHeadline` for why the sentence would rather be short than hedge.
   */
  const goalLead = useMemo(() => {
    const top = breakdown.rows.find((row) => row.key !== 'other' && row.xp > 0);
    const leads = top !== undefined && breakdown.total > 0 && top.xp / breakdown.total >= 0.3;
    return goalHeadline({
      active: goalSet.active,
      behind: goalSet.atRisk + goalSet.offTrack,
      completed: goalSet.completed,
      focusSubject: leads && top ? (top.name ?? top.label) : null,
      aimedShare: aimedShare ? aimedShare.share : null,
      // Which half of the count it opens on. See utils/analyticsPrefs.
      leadWithStrength: rules.leadWithStrength,
    });
  }, [aimedShare, breakdown, goalSet, rules.leadWithStrength]);

  /** How many of the window's live subjects a goal actually names. */
  const namedSubjects = useMemo(() => {
    const worked = breakdown.rows.filter((row) => row.key !== 'other' && row.xp > 0);
    return {
      total: worked.length,
      named: worked.filter((row) => goalSubjects.has(row.key)).length,
    };
  }, [breakdown, goalSubjects]);

  // ---- Recommendations ----------------------------------------------------
  const advice = useMemo(
    () =>
      recommendations({
        // The fortnight, not the picker — see "The recent window" above.
        days: recent.current,
        week: recentWeek,
        clock: recentClock,
        rhythm: recentRhythm,
        balance: recentBalance,
        subjects: recentSubjects,
        ratings: ratings.data ?? null,
        // The same summary the Overview's quality panels draw, so the Execution
        // and Quality cards cannot say something the picture beside them
        // contradicts. Safe on an account that has never rated anything: every
        // rule reading it checks `rated` first.
        quality: recentQuality,
        // Empty on the two shallower depths, because the question is never put
        // — the one rule that reads it produces nothing rather than guessing.
        reasons: recentReasons,
      }),
    [
      ratings.data,
      recent,
      recentBalance,
      recentClock,
      recentQuality,
      recentReasons,
      recentRhythm,
      recentSubjects,
      recentWeek,
    ],
  );

  const banked = Number(all[all.length - 1]?.cumulative_xp) || 0;
  /* The same fortnight the advice came from, not the picker's window. Both
     halves of this chart have to describe one stretch of time: the baseline is
     "XP a year at the pace you are going" and the gain is the impacts of the
     items below, each of which was already scaled to a year *from the
     fortnight*. Feeding a 90-day baseline into a fortnight's gains draws a gap
     between two different accounts. */
  const projection = useMemo(
    () => outlook(recent.current, advice, banked),
    [advice, banked, recent],
  );

  const shown = useMemo(
    () => (category ? advice.filter((item) => item.category === category) : advice),
    [advice, category],
  );

  /**
   * What happened after each adopted change.
   *
   * Fed the *whole* series rather than the window, and that is the one thing
   * about this call that matters: a follow-up is anchored to the day the change
   * was adopted and needs the days on both sides of it, which the page's window
   * picker knows nothing about. A reader looking at the last 30 days should
   * still see the verdict on a change they made in March.
   */
  const reviews = useMemo(
    () =>
      reviewAdopted({
        adopted: adopted.data?.adopted ?? [],
        days: all,
        tasks,
        graded: gradedLog.data?.series ?? {},
      }),
    [adopted.data, all, gradedLog.data, tasks],
  );
  const reviewSummary = useMemo(() => summarise(reviews), [reviews]);

  /** The ids already being tracked, so a card knows whether it is one of them. */
  const adoptedIds = useMemo(
    () => new Set((adopted.data?.adopted ?? []).map((row) => row.id)),
    [adopted.data],
  );

  // ---- How much record each gated tab needs ------------------------------
  /**
   * How much history a tab needs before it will say anything at all.
   *
   * Not one number, because the tabs ask different things of the record: a
   * habit needs weeks of repetition to be a habit at all, an explanation needs
   * two comparable periods, and a recommendation needs an average worth
   * projecting from. Stated here rather than buried in each tab so the three
   * can be read against each other and raised together.
   *
   * `recommendations` is 14 because that is the floor the rules themselves
   * apply — see the guard at the top of `recommendations` in utils/advice. The
   * number lives in both places on purpose: the rule enforces it, and this is
   * what the page counts down to, and a page counting to a different number
   * than the one that unlocks it would be worse than the duplication.
   */
  /**
   * How much this account has actually recorded, and what that earns.
   *
   * The whole history rather than the window on screen, because "how much do
   * we know about you" is a question about the account. Counting the window
   * would mean the countdown moved when the reader touched the range picker —
   * telling somebody with four months of data that they need eleven more days
   * because they happened to be looking at a week.
   */
  const maturity = useMemo(() => dataMaturity(all), [all]);

  /**
   * The figure every gate on this page reads.
   *
   * It was `all.length`, and that was wrong in a way nothing on the page could
   * show: `growth_data` is built by walking every calendar day since the
   * account opened and padding the empty ones with zeros, so its length is the
   * account's *age*. An account opened five weeks ago and used twice cleared a
   * gate asking for three weeks of record, and got confident analysis drawn
   * over two days of data.
   *
   * Active days instead — see utils/dataMaturity. This makes the existing
   * gates stricter for anyone whose use has been patchy, which is the correct
   * direction: the gates exist because a slope through four points is not a
   * trend, and four points do not become a trend by being spread over a month.
   */
  const historyDays = maturity.activeDays;

  /**
   * Days still needed for a tab, or 0 once the record is long enough.
   *
   * Days with work on them, now that `historyDays` counts those — which is why
   * `Building` no longer names the date a tab opens on. It cannot: the answer
   * depends on how often the reader turns up, and a date computed as if every
   * day from here were a working one is a promise to break.
   */
  const waitFor = useCallback(
    (key: keyof typeof NEED_DAYS) => Math.max(0, NEED_DAYS[key] - historyDays),
    [historyDays],
  );

  /** The streak, which three of the chapters read and none of them fetch. */
  const streak = stats.stats?.current_streak ?? 0;

  return {
    // What the account asked this page to be. See utils/analyticsPrefs.
    tone,
    toneRules: rules,
    detail,
    logStyle,
    showStanding,

    // The gates
    historyDays,
    maturity,
    waitFor,
    streak,

    // The window, and the controls that move it
    span,
    chooseSpan,
    option,
    spanText,
    previousSpanText: spanLabel(slice.previous),
    compareLabel: `vs ${option.compare.toLowerCase()}`,
    metric,
    setMetric,
    grain,
    setGrain,
    subject,
    setSubject,
    subjectOptions,
    subjectLabel,
    category,
    setCategory,

    // The record, and the slice of it on screen
    all,
    slice,
    tasks,
    fromIso,
    toIso,
    nameOf,

    // Overview
    observed,
    figures,
    sparks,
    insights,
    rhythmRate,
    heatRows,
    card,
    score,
    analytical,
    /** Whether the report card has arrived. What enables the Export button —
     *  a downloaded file full of dashes is worse than no file. */
    hasReportCard: ratings.data !== null,
    recorded,
    scoreLine,
    scoreDates,
    scoreMarks,
    breakdown,
    previousBySubject,

    // Ratings
    qualitySummary,
    rated,
    ratingRows,
    ratingBands,
    ratingGrid,
    reasons,
    reasonRows,
    ratingDepth: prefs.rating_depth,
    setDepth,

    // The behavioural shapes three tabs share
    week,
    clock,
    rhythm,
    balance,

    // The recent window, which advice reads instead of the picker
    recent,
    weekLeft,
    diagnoses,
    shownDiagnoses,
    discovered,
    plan,
    setBudget,
    nudge,
    setNudge,

    // Habits
    habits,
    byDate,
    patterns,
    shifts,
    summary,

    // Insights
    why,
    how,
    wins,
    links,
    state,

    // Goals
    liveGoals,
    goalSet,
    goalRows,
    goalIdeas,
    aimedShare,
    goalAdvice,
    goalLimits,
    lens,
    goalPace,
    goalEffort,
    goalCheckpoints,
    goalLead,
    namedSubjects,

    // Recommendations
    advice,
    recentSubjects,
    banked,
    projection,
    shown,
    reviews,
    reviewSummary,
    adoptedIds,
  };
}

export type AnalyticsModel = ReturnType<typeof useAnalyticsModel>;
