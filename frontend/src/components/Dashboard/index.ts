/**
 * The dashboard's parts.
 *
 * Four stat cards across the top, the Tasks panel and the Focus panel beneath
 * them, three summary cards along the bottom, and the four overlays — the Add
 * Task dialog, the level-up celebration, the one for reaching a daily goal,
 * and the catch-up prompt that asks about the days the app did not see.
 * What every one of them is counted from lives in `summary.ts`, which is
 * imported from its own path because it exports functions rather than
 * components.
 */
export { CatchUp } from './CatchUp';
export type { CatchUpEntry, CatchUpProps } from './CatchUp';
export { FocusCard, StreakCard, TodayCard, XpCard } from './StatCards';
export { DailyQuote } from './DailyQuote';
export { FocusPanel } from './FocusPanel';
export type { FocusPanelProps } from './FocusPanel';
export { RecentActivity, WeeklyOverview } from './InsightCards';
export { GoalReached, useCrossing } from './GoalReached';
export type { GoalKind, GoalNews, GoalReachedProps } from './GoalReached';
export { GoalsCard } from './GoalsCard';
export type { GoalsCardProps } from './GoalsCard';
export { LevelUp } from './LevelUp';
export type { LevelUpProps } from './LevelUp';
export { TaskModal } from './TaskModal';
export type { TaskModalProps } from './TaskModal';
export { TaskPanel } from './TaskPanel';
export type { TaskPanelProps, TaskTab } from './TaskPanel';
export { TaskRow } from './TaskRow';
export type { TaskRowProps } from './TaskRow';
