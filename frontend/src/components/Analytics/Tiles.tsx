/**
 * The five figures across the top, each with its own days drawn under it.
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
  /** Out of 10, or null while the report card has not answered. */
  score: number | null;
  scoreSeries: number[];
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
   * The chosen subject's name, when one is chosen — and the reason this row
   * has to mention it.
   *
   * Every figure here is read off the day series, where XP and focus minutes
   * are stored per day and not per subject. So the subject filter cannot reach
   * any of them, and choosing one used to leave all six sitting unchanged
   * beside panels that *had* narrowed — the quality tile reading 13.8 with the
   * quality panel below it reading 14.2 for the same account on the same
   * screen. Two answers to one question, with nothing on the page admitting
   * it.
   *
   * Saying so is the honest fix rather than the small one. The alternative is
   * to stop offering a filter these figures cannot honour, and that would cost
   * the reader the panels it genuinely does narrow.
   */
  scopedOut?: string | null;
}

export function Tiles({
  figures,
  sparks,
  score,
  scoreSeries,
  compareLabel,
  logStyle,
  scopedOut = null,
}: TilesProps) {
  const stats: Stat[] = [
    {
      key: 'productivity',
      glyph: 'trend',
      label: 'Productivity',
      value: Math.round(figures.xpPerDay.value).toLocaleString(),
      unit: 'XP/day',
      delta: figures.xpPerDay.delta,
      series: sparks.xp,
      tone: 'violet',
      hint: 'XP per day of the window, not per day worked. Time off pulls it down.',
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
        'Share of days you did any work.',
    },
    {
      key: 'quality',
      glyph: 'target',
      // The one tile whose figure the app cannot measure — it is what the
      // reader said, and it reads "—" rather than 0 when they said nothing.
      // Rating is optional and a zero here would be the page inventing a bad
      // review out of a skipped dialog. See utils/ratings.
      label: 'Quality',
      value: figures.ratedTasks === 0 ? '—' : figures.quality.value.toFixed(1),
      unit: figures.ratedTasks === 0 ? undefined : '/ 25',
      delta: figures.ratedTasks === 0 ? null : figures.quality.delta,
      series: figures.ratedTasks === 0 ? [] : sparks.quality,
      tone: 'pink',
      hint:
        figures.ratedTasks === 0
          ? 'Difficulty × execution, from the star rows after a task. Optional.'
          : `Difficulty × execution out of 25, over the ${figures.ratedTasks} of ${figures.finishedTasks} tasks you rated.`,
    },
    ...(showsTaskVolume(logStyle)
      ? [
          {
            key: 'tasks',
            glyph: 'check' as const,
            label: 'Tasks Completed',
            value: figures.tasks.value.toLocaleString(),
            delta: figures.tasks.delta,
            series: sparks.tasks,
            tone: 'green' as const,
            hint: 'Tasks finished, counted on the day you finished them.',
          },
        ]
      : []),
    ...(showsSessionVolume(logStyle)
      ? [
          {
            key: 'focus',
            glyph: 'clock' as const,
            label: 'Focus Time',
            value: figures.focusHours.value.toFixed(1),
            unit: 'h',
            delta: figures.focusHours.delta,
            series: sparks.focusHours,
            tone: 'blue' as const,
            hint: 'The hours logged in the window — the other volume behind the three rates.',
          },
        ]
      : []),
    {
      key: 'score',
      glyph: 'sparkle',
      label: 'Growth Score',
      value: score === null ? '—' : score.toFixed(1),
      unit: score === null ? undefined : '/10',
      // The score has no recorded history to compare against — see SAMPLE in
      // ./data. A tile with no baseline says so rather than inventing one.
      delta: null,
      series: scoreSeries,
      tone: 'blue',
      hint: 'The mean of productivity, quality, consistency, efficiency and focus.',
    },
  ];

  return (
    <>
      <StatRow stats={stats} compare={compareLabel} />
      {scopedOut && (
        /* Under the row rather than on each tile: it is one fact about all six,
           and six copies of it would be louder than the figures. */
        <p className="ax-tiles-scope">
          These six count <strong>every subject</strong> — XP and focus minutes are
          recorded per day, not per subject, so the filter on{' '}
          <strong>{scopedOut}</strong> cannot narrow them. The quality, subject and
          goal panels below it can, and do.
        </p>
      )}
    </>
  );
}
