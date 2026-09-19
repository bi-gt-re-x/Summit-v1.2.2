/**
 * The Insights page's panels — what the record says about how this person works.
 *
 * Every panel here is a finding and the sentence that explains it. That is the
 * whole difference between this page and the analytics one: analytics draws the
 * number and trusts the reader to interpret it, and a page called Insights that
 * did the same would be a second dashboard. So each panel states the finding in
 * words first, shows the chart it came from, and says what it means — and when
 * the record cannot support a finding, it says that instead of hedging one.
 *
 * The layout is the analytics page's, deliberately: same `Panel`, same grid,
 * same tiles, so moving between the two pages is not a change of scenery.
 */
import { Columns, Panel, StatRow, type Column, type Stat } from '@/components/Analytics';
import { hourLabel, WEEKDAYS_SHORT } from '@/utils/behaviour';
import type { BalanceShape, ClockShape, RhythmShape, WeekShape } from '@/utils/behaviour';

/** Minutes as "1h 20m", or "45m". */
function hm(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}


// --------------------------------------------------------------------------
// The headline
// --------------------------------------------------------------------------
export interface HeadlineTilesProps {
  week: WeekShape;
  clock: ClockShape;
  rhythm: RhythmShape;
  balance: BalanceShape;
  /**
   * Focus hours logged across the window.
   *
   * What qualifies the sitting beside it. A typical sitting of forty minutes
   * is a different fact over four hours of logged time than over eighty, and
   * the tile stated the first number without ever stating the second — so the
   * one figure on this row drawn from time rather than from task counts had no
   * scale on it at all. Optional because a caller with no session record has
   * nothing to add, and `0` is a real answer rather than a missing one.
   */
  hours?: number | null;
}

export function HeadlineTiles({ week, clock, rhythm, balance, hours }: HeadlineTilesProps) {
  /* "Best was 2h 10m" alone, when there is no total to put behind it; "Best
     was 2h 10m · 41h logged" when there is. Rounded to the hour because this
     is a note under a figure, not the figure. */
  const logged = typeof hours === 'number' && hours > 0
    ? `${Math.round(hours).toLocaleString()}h logged`
    : null;
  const sessionNote = rhythm.longestSession
    ? [`Best was ${hm(rhythm.longestSession.minutes)}`, logged].filter(Boolean).join(' · ')
    : logged ?? 'No focus time logged';

  const stats: Stat[] = [
    {
      key: 'day',
      label: 'Strongest day',
      value: week.best ? week.best.label : '—',
      note: week.best ? `${Math.round(week.best.avgXp).toLocaleString()} XP on an average one` : 'No pattern yet',
      tone: 'violet' as const,
      series: week.stats.map((stat) => stat.avgXp),
    },
    {
      key: 'hour',
      label: 'Peak hour',
      value: clock.peak ? clock.peak.label : '—',
      note: clock.peak ? `${clock.peak.tasks.toLocaleString()} tasks finished then` : 'No timings recorded',
      tone: 'blue' as const,
      series: clock.hours.map((hour) => hour.tasks),
    },
    {
      key: 'session',
      label: 'Typical sitting',
      value: hm(rhythm.typicalSession),
      note: sessionNote,
      tone: 'green' as const,
      series: [],
    },
    {
      key: 'balance',
      label: 'Widest subject',
      value: balance.leader ?? '—',
      note: balance.leader
        ? `${balance.concentration}% of your XP, across ${balance.carrying} live subjects`
        : 'No subjects on your tasks',
      tone: 'amber' as const,
      series: [],
    },
  ];

  return <StatRow stats={stats} />;
}

// --------------------------------------------------------------------------
// The week
// --------------------------------------------------------------------------
export function WeekPanel({ week }: { week: WeekShape }) {
  const columns: Column[] = week.stats.map((stat) => ({
    label: WEEKDAYS_SHORT[stat.index]!,
    value: stat.avgXp,
    text: Math.round(stat.avgXp).toLocaleString(),
    peak: week.best?.index === stat.index,
  }));

  return (
    <Panel title="When you do your best work" note="Average XP per weekday">
      <Columns columns={columns} label="Average XP per weekday" />
      <p className="ax-prose">
        {week.best && week.worst && week.best.index !== week.worst.index ? (
          <>
            {week.best.label} outproduces {week.worst.label} by{' '}
            <strong>
              {week.worst.avgXp > 0
                ? `${Math.round((week.best.avgXp / week.worst.avgXp - 1) * 100)}%`
                : 'a wide margin'}
            </strong>
            . {week.spread > 1.6
              ? 'A lopsided week. Lose that day and you lose the week.'
              : 'An even week. No single day is load-bearing.'}
          </>
        ) : (
          'Not enough of the week worked to compare days yet.'
        )}
      </p>
      {week.weekendGap !== null && (
        <p className="ax-prose">
          {week.weekendGap <= -20 ? (
            <>
              Weekends run <strong>{Math.abs(week.weekendGap)}% lighter</strong>. Two of every seven
              days are close to unavailable — plan around it.
            </>
          ) : week.weekendGap >= 20 ? (
            <>
              Weekends run <strong>{week.weekendGap}% heavier</strong>. You are catching up at the
              end of the week rather than keeping pace through it.
            </>
          ) : (
            <>
              Weekends and weekdays are within{' '}
              <strong>{Math.abs(week.weekendGap)}%</strong> of each other. A flat week is what makes
              long streaks possible.
            </>
          )}
        </p>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// The clock
// --------------------------------------------------------------------------
export function ClockPanel({ clock }: { clock: ClockShape }) {
  // Nine at night to eight in the morning is dead space on most accounts and
  // eleven of the twenty-four columns; the panel draws the working day and says
  // what it left out rather than drawing a row of empty bars.
  const shown = clock.hours.filter((hour) => hour.hour >= 6 && hour.hour <= 23);
  const columns: Column[] = shown.map((hour) => ({
    label: hour.hour % 3 === 0 ? hourLabel(hour.hour).replace(' ', '') : '',
    /* Every hour, not every third: the drawn label is thinned so eighteen of
       them fit, and the spoken one has no such constraint. See `name` on
       `Column`. */
    name: hourLabel(hour.hour),
    value: hour.tasks,
    text: hour.tasks ? String(hour.tasks) : '',
    peak: clock.peak?.hour === hour.hour,
  }));

  return (
    <Panel title="The clock you keep" note="Tasks finished, by hour">
      <Columns columns={columns} tone="blue" label="Tasks finished by hour of the day" />
      <p className="ax-prose">
        {clock.coreWindow ? (
          <>
            You finish half your tasks between{' '}
            <strong>
              {hourLabel(clock.coreWindow.from)} and {hourLabel(clock.coreWindow.to)}
            </strong>
            . {clock.coreWindow.share >= 60
              ? 'Keep this time free for work.'
              : 'The rest is spread across the day.'}
          </>
        ) : (
          'No finished task carries a completion time yet.'
        )}
      </p>
      {clock.lateShare > 0 && (
        <p className="ax-prose">
          <strong>{clock.lateShare}%</strong> of your work lands after 10 PM or before 5 AM.{' '}
          {clock.lateShare >= 25
            ? 'Late work is the first thing to go when you are tired or busy.'
            : 'Occasional rather than structural.'}
        </p>
      )}
    </Panel>
  );
}
