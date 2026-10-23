/**
 * The landing page's parts.
 *
 * Split the way the original's scripts were: the written sections in one file,
 * and each demonstration that moves in a file of its own, named after the
 * home-*.js it was ported from. The hooks are the same split for
 * the motion that belongs to no single section — the opening, the reveals, the
 * charts, the loops, and the last of it. Tour.tsx is the product tour: the
 * sections that say what each part of the app does.
 */
export { Analytics } from './Analytics';
export { CalendarDemo } from './CalendarDemo';
export { DashboardDemo } from './DashboardDemo';
export { Performance } from './Performance';
export { RidgeChart } from './RidgeChart';
export type { RidgeSeries } from './RidgeChart';
export { StreakLevel } from './StreakLevel';
export { TaskDemo } from './TaskDemo';
export { Trend } from './Trend';
export { useCharts } from './useCharts';
export { useFinalMotion } from './useFinalMotion';
export { useIntro } from './useIntro';
export { useCountUps, useLoops, useReveals } from './useReveals';
export {
  FinalCta,
  Footer,
  Hero,
  Philosophy,
  Pricing,
  SectionHead,
  TaskStats,
  TechStack,
} from './sections';
export {
  Facts,
  Faq,
  FeatureGrid,
  GoalsTour,
  HowItWorks,
  MoreTour,
  Numbers,
  SkillsTour,
  SpacesTour,
  TimerTour,
} from './Tour';
