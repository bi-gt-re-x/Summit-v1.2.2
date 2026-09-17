/**
 * The analytics page's parts — the long view of an account.
 *
 * Split along what each piece owns: `data.ts` is every figure the page states
 * and nothing that draws, `charts.tsx` is every mark the page makes and nothing
 * that knows what a subject is, and the four panel files sit between them. A
 * panel file holds the panels that share a row, because that is the unit that
 * changes together when the layout does.
 *
 * The graded report card that used to be this page is gone. `GradeCard` and
 * `MetricRow` were kept for a while on the argument that they were the only
 * thing explaining how a score is arrived at — but nothing rendered them, and
 * that explanation had already moved to `ScoringDetails`, which the Trajectory
 * panel opens in place. Two files nobody could reach, justified by a job
 * something else was doing. `metrics.ts` stays for `gradeClass`, which
 * `Summary` colours the letter with.
 *
 * `ScoreBanner` went the same way for the same reason. It opened the Overview
 * with the score, its letter, two paragraphs of derivation and five labelled
 * bars — and the bars were the same five measures `ScorePanel` draws a few
 * rows further down, on the same tab, from a second implementation of the same
 * arithmetic (`./score` scores them out of ten, `utils/analyticalScore` out of
 * a hundred). One row of bars is enough, and the one that sits with the chart
 * of the score over time is the one that earns its place. `Summary` took the
 * slot, kept the derivation behind a disclosure, and left the bars behind.
 */
/** The Goals tab, which replaced Trends. See ./GoalsView. */
export {
  PortfolioPanel as GoalPortfolioPanel,
  PacePanel as GoalPacePanel,
  NotesPanel as GoalNotesPanel,
  SuggestPanel as GoalSuggestPanel,
} from './GoalsView';

export { Summary } from './Summary';
export type { SummaryProps } from './Summary';
export { NextActions } from './NextActions';
export type { NextActionsProps } from './NextActions';
export { DiagnosisCards, DiagnosisEmpty } from './Diagnosis';
export { Patterns as DiscoveredPatterns } from './Patterns';
export type { PatternsProps as DiscoveredPatternsProps } from './Patterns';

export { scoreMovement } from './Header';
export type { ScoreMovement, ScoreReading } from './Header';
export { Header, ViewTabs, Controls, TabOpening, VIEWS, viewFor } from './Header';
export type { HeaderProps, ViewTabsProps, ControlsProps, View, ViewKey } from './Header';

export {
  HabitTiles,
  HabitCard,
  HabitCards,
  HabitCalendarPanel,
  PatternsPanel,
  ConsistencyPanel as HabitConsistencyPanel,
  TimelinePanel,
  HabitOpening,
  habitLead,
} from './Habits';

/* The Trends tab's four panels were exported from ./Trends, which is gone with
   the tab — see ./GoalsView for what took its slot, and utils/trends went with
   it since nothing else read it.

   `CompoundingPanel`, `MilestonePanel` and Growth's `LongTermChapter` are the
   three the removal left unrendered. They are still exported below and from
   their own files, which have live siblings: each is a real panel about the
   pace of the record rather than about goals, and Records is the tab that
   would want them. Left placed rather than deleted, deliberately, and named
   here so the next person does not have to work out why nothing draws them. */

/** What a tab shows instead of inventing figures it does not have. */
/* The one panel at the early stages allowed to state a tendency rather than a
   total. Its restraint lives in utils/observations, not in the component. */
export { ObservationNote } from './Observation';

/* What the page has worked out about the reader, as opposed to about the
   window. See the note at the top of utils/knows. */
export { Knows } from './Knows';

/* The one moment on this page allowed to take the screen. See the note at the
   top of StageReached for why arriving is different from every other part of
   the ladder. */
export { StageReached } from './StageReached';

export { Building } from './Building';
export type { BuildingProps } from './Building';

/* The stage before `Building` has anything to gate. See the note at the top of
   Collecting for why the two are different components rather than one with a
   flag: a room still being furnished and an empty one are not the same thing
   to stand in. */
export {
  ActiveDayNote,
  ActiveDayPrinciple,
  AwayNotice,
  Collecting,
  FirstMilestone,
  StageLadder,
  StageNote,
  LearningStrip,
} from './Collecting';
export type { LearningItem } from './Collecting';
export type { CollectingProps } from './Collecting';

/* Day 4-7. Tallies that stand up on a handful of days, and the mark that says
   how many days that is. */
export { EarlyMark, WhenPanel, FinishPanel } from './Early';
export type { WhenPanelProps, FinishPanelProps } from './Early';

/** The one thing on this page an account can do on its first day. */
export { BaselinePanel } from './Baseline';
export type { BaselinePanelProps, BaselineValues } from './Baseline';

/**
 * The questions that produce it, and the three preferences asked alongside.
 *
 * `BaselineSetup` used to live in ./Baseline and ask three of these on one
 * card. It is gone rather than kept beside its replacement — see the header of
 * ./Setup for the argument, which is that the four questions added to it are
 * choices rather than recollections and a choice needs its consequence stated
 * beside it.
 */
export { AnalyticsSetup } from './Setup';
export type { AnalyticsSetupProps, SetupAnswers, SetupPrefs } from './Setup';

export { StatRow } from './StatRow';
export type { Stat, StatRowProps } from './StatRow';
export { Tiles } from './Tiles';
export type { TilesProps } from './Tiles';

/** The panels drawn from the one optional thing in the app. See ./Quality. */
export { DepthPicker, QualityPanel, QualityGridPanel, RatedTasksPanel, ReasonsPanel } from './Quality';
export type {
  DepthPickerProps,
  QualityPanelProps,
  QualityGridPanelProps,
  ReasonsPanelProps,
  RatedTasksPanelProps,
} from './Quality';

export { Trajectory, ScorePanel } from './Trajectory';
export type { TrajectoryProps, ScorePanelProps } from './Trajectory';

export { SubjectPanel, ConsistencyPanel } from './Breakdown';
export type { SubjectPanelProps, ConsistencyPanelProps } from './Breakdown';

export {
  StreaksPanel,
  InsightsPanel,
  StandingPanel,
} from './Longterm';
export type { StreaksPanelProps, StandingPanelProps } from './Longterm';

export {
  AreaChart,
  Columns,
  Panel,
  PanelGroup,
  Radar,
  Scatter,
  Sparkline,
  Delta,
  TONES,
  asTone,
  toneVar,
} from './charts';
export type { Tone, PanelProps, AreaSeries, Column, RadarAxis, ScatterProps } from './charts';

/**
 * The Growth Score — its five factors, and where a score places.
 *
 * `SCORE_SCALE` used to be declared here on its own, back when the score was
 * one division of the backend's `overall`. It moved into ./score with the
 * arithmetic that uses it: the score is now assembled from the five metrics it
 * is the mean of, so the scale, the weighting and the parts belong together.
 */
export {
  SCORE_SCALE,
  WEIGHT as SCORE_WEIGHT,
  formatPercentile,
  growthScore,
  percentileFor,
  percentileLabel,
} from './score';
export type { GrowthScore, ScoreFactor } from './score';

// The report card, no longer rendered. See the note at the top.
export { ScoringDetails } from './ScoringDetails';
export { gradeClass } from './metrics';

/**
 * The page's fetching and its arithmetic, each in one place.
 *
 * Exported from here so the page imports its parts the same way it imports its
 * panels. Neither is a component; both are the page's own and are not meant to
 * be reached from anywhere else.
 */
export { useAnalyticsData } from './useAnalyticsData';
export { useAnalyticsModel, NEED_DAYS } from './useAnalyticsModel';
export type { AnalyticsModel } from './useAnalyticsModel';
export type { AnalyticsData } from './useAnalyticsData';

/** The six tab bodies. Each lays out what the model already worked out. */
export { OverviewTab } from './tabs/OverviewTab';
export { GoalsTab } from './tabs/GoalsTab';
export { HabitsTab } from './tabs/HabitsTab';
export { InsightsTab } from './tabs/InsightsTab';
export { RecommendationsTab } from './tabs/RecommendationsTab';
export { GrowthTab } from './tabs/GrowthTab';
export { SubjectsTab } from './tabs/SubjectsTab';
