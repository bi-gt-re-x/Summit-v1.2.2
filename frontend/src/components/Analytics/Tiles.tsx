/**
 * The figures across the top, each with its own days drawn under it.
 *
 * The Work Score was one of them, and it is not any more: the summary above
 * leads with it and the score panel below charts it, so a tile was the third
 * copy of one number on one tab.
 *
 * They are the page's thesis in one row, and the order is the argument: how
 * much work a day, how often at all, how much each piece was worth — then the
 * volume behind those three, and the grade that comes out of all of it.
 *
 * It used to open on totals: XP banked, hours logged, tasks finished. Totals
 * are the one thing on this page that cannot go down, so a row of them reads as
 * progress on every window a reader picks, including the bad ones — an account
 * that halved its output still shows a larger lifetime figure than last month.
 * Productivity, consistency and quality are rates, and a rate can fall. That is
 * the whole reason they lead: they are the three figures that can tell the
 * reader something they did not want to hear.
 *
 * The deltas are the window against the equal-length window before it, which is
 * `summaryFigures`' own rule — so a tile and the comparison panel further down
 * cannot disagree. A window with no period before it says so rather than
 * printing a rise from nothing as an infinite one.
 */
import { StatRow, type Stat } from './StatRow';
import { showsSessionVolume, showsTaskVolume } from '@/utils/analyticsPrefs';
import type { LogStyle } from '@/services/settings';
import type { GrowthSummaryFigures, TileSeries } from '@/utils/growthSummary';

export interface TilesProps {
  figures: GrowthSummaryFigures;
  sparks: TileSeries;
  /** "vs previous 2 years" — the window's own words for its baseline. */
  compareLabel: string;
  /**
   * Which volume the row prints behind the three rates.
   *
   * The three rates never move: they are the argument, and they are the same
   * three at every setting. What the account said it records decides what sits
   * behind them — a count of tasks for somebody who ticks things off, hours for
   * somebody who logs the time, both for somebody who does both. A reader who
   * never finishes a task and works four hours a day was being shown a volume
   * of zero as the fourth figure on the page. See utils/analyticsPrefs.
   */
  logStyle?: LogStyle;
  /**
   * Which tiles to draw, by key, when somebody chose. A panel on a space's
   * page (components/Spaces/PanelBlock) lets the reader pick; given, it
   * replaces what `logStyle` would have decided.
   */
  only?: readonly string[];
}

export function Tiles({
  figures,
  sparks,
  compareLabel,
  logStyle,
  only,
}: TilesProps) {
  const stats: Stat[] = [
    {
      key: 'productivity',
      glyph: 'trend',
      label: 'Activity',
      value: Math.round(figures.xpPerDay.value).toLocaleString(),
      unit: 'XP/day',
      delta: figures.xpPerDay.delta,
      series: sparks.xp,
      tone: 'violet',
      hint: 'XP per day in this window. Days off pull it down.',
    },
    {
      key: 'consistency',
      glyph: 'flame',
      label: 'Consistency',
      value: `${Math.round(figures.consistency.value)}%`,
      delta: figures.consistency.delta,
      series: sparks.consistency,
      tone: 'amber',
      hint:
        'How many days in this window you did any work. Your work score always reads the last 90 days.',
    },
    {
      key: 'quality',
      glyph: 'target',
      // The one tile whose figure the app cannot measure — it is what the
      // reader said, and it reads "—" rather than 0 when they said nothing.
      // Rating is optional and a zero here would be the page inventing a bad
      // review out of a skipped dialog. See utils/ratings.
      label: 'Quality',
      value: figures.ratedTasks === 0 ? '-' : figures.quality.value.toFixed(1),
      unit: figures.ratedTasks === 0 ? undefined : '/ 25',
      delta: figures.ratedTasks === 0 ? null : figures.quality.delta,
      series: figures.ratedTasks === 0 ? [] : sparks.quality,
      tone: 'pink',
      hint:
        figures.ratedTasks === 0
          ? 'How hard times how well, from your task ratings. Optional.'
          : `How hard times how well, out of 25. From the ${figures.ratedTasks.toLocaleString()} of ${figures.finishedTasks.toLocaleString()} tasks you rated.`,
    },
    ...((only ? only.includes('tasks') : showsTaskVolume(logStyle))
      ? [
          {
            key: 'tasks',
            glyph: 'check' as const,
            label: 'Tasks done',
            value: figures.tasks.value.toLocaleString(),
            delta: figures.tasks.delta,
            series: sparks.tasks,
            tone: 'green' as const,
            hint: 'Tasks you finished, on the day you finished them.',
          },
        ]
      : []),
    ...((only ? only.includes('focus') : showsSessionVolume(logStyle))
      ? [
          {
            key: 'focus',
            glyph: 'clock' as const,
            label: 'Focus time',
            value: figures.focusHours.value.toFixed(1),
            unit: 'h',
            delta: figures.focusHours.delta,
            series: sparks.focusHours,
            tone: 'blue' as const,
            hint: 'Hours you logged in this window.',
          },
        ]
      : []),
  ];

  const shown = only ? stats.filter((stat) => only.includes(stat.key)) : stats;

  return (
    <>
      <StatRow stats={shown} compare={compareLabel} />
    </>
  );
}
