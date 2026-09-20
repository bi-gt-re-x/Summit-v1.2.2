/**
 * The tasks page's parts.
 *
 * `board.ts` is every decision the page makes about what to show and in what
 * order, and nothing that draws. The components draw it and hold no arithmetic
 * — which is why the ordering rules, the buckets, the reconstructed trends and
 * the streak arithmetic can all be read in one file rather than found across
 * five render functions.
 */
export { Composer } from './Composer';
export type { ComposerProps } from './Composer';
export { GoalField, linkableGoals, MATCH_BY_NAME } from './GoalField';
export type { GoalFieldProps } from './GoalField';
export { DayComplete } from './DayComplete';
export type { DayCompleteProps } from './DayComplete';
export { TaskRow } from './TaskRow';
export type { TaskRowProps } from './TaskRow';
export { StatCards } from './Stats';
export type { StatCardsProps } from './Stats';
export { Sidebar } from './Sidebar';
export type { SidebarProps } from './Sidebar';
export { BulkBar, Toolbar } from './Toolbar';
export type { BulkBarProps, ToolbarProps } from './Toolbar';
export {
  BUCKETS,
  GROUPS,
  HORIZON_DAYS,
  EMPTY_QUERY,
  PRIORITIES,
  SORTS,
  TREND_DAYS,
  beyondHorizon,
  activeFilters,
  bucketOf,
  plannedSeconds,
  dueLabel,
  dueLine,
  filterTasks,
  groupTasks,
  isFiltered,
  sortTasks,
  spellDuration,
  statSeries,
  streaks,
  taskCounts,
  timeLabel,
  trendPct,
  upcoming,
} from './board';
export type {
  Bucket,
  GroupKey,
  SortKey,
  StatSeries,
  StatusFilter,
  Streak,
  TaskCounts,
  TaskGroup,
  TaskQuery,
} from './board';

/** The one question the app asks back, once, when a task is marked done. */
export { RatePrompt } from './RatePrompt';
export type { RatePromptProps } from './RatePrompt';
