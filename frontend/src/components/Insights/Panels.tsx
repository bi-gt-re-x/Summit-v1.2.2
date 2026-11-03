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
import { Columns, Panel, type Column } from '@/components/Analytics';
import { hourLabel, WEEKDAYS_SHORT } from '@/utils/behaviour';
import type { ClockShape, WeekShape } from '@/utils/behaviour';
import { Suggestion } from '@/components/Analytics/Suggestion';

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
    <Panel title="Your best days of the week" note="Average XP per weekday">
      <Columns columns={columns} label="Average XP per weekday" />
      {week.best && week.worst && week.best.index !== week.worst.index ? (
        <>
          <p className="ax-prose">
            {week.spread > 1.6
              ? `Your week leans hard on ${week.best.label}. It `
              : `Your week is fairly even. ${week.best.label} `}
            outproduces {week.worst.label} by{' '}
            <strong>
              {week.worst.avgXp > 0
                ? `${Math.round((week.best.avgXp / week.worst.avgXp - 1) * 100)}%`
                : 'a wide margin'}
            </strong>
            {week.weekendGap !== null && Math.abs(week.weekendGap) >= 20 ? (
              <>
                , and weekends run{' '}
                <strong>
                  {Math.abs(week.weekendGap)}% {week.weekendGap < 0 ? 'lighter' : 'heavier'}
                </strong>
              </>
            ) : null}
            .
          </p>
          <Suggestion
            text={
              week.weekendGap !== null && week.weekendGap >= 20
                ? "This suggests you're catching up at the end of the week. Move one task from the weekend to midweek, so it isn't all riding on those two days."
                : week.spread > 1.6
                  ? `This suggests one day is holding up your week, so missing it costs a lot. Move one task from ${week.best.label} to ${week.worst.label} and see if the week evens out.`
                  : `This suggests no single day carries your week, so a missed day won't sink it. Use ${week.best.label} for your hardest work, since that's when you do the most.`
            }
          />
        </>
      ) : (
        <p className="ax-prose">Not enough days worked to compare yet.</p>
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
    <Panel title="When you finish things" note="Tasks finished, by hour">
      <Columns columns={columns} tone="blue" label="Tasks finished by hour of the day" />
      {/* The hours that hold half the work are a finding under "Why it
          happens" (`HowPanel`), so the chart does not say them again. */}
      {clock.lateShare > 0 && (
        <>
          <p className="ax-prose">
            <strong>{clock.lateShare}%</strong> of your work happens after 10 PM or before 5 AM.
          </p>
          <Suggestion
            text={
              clock.lateShare >= 25
                ? "This suggests your day's work is getting pushed late, when you're tired and it's the first thing to go. Try your hardest task before dinner, and leave the late slot for easy stuff."
                : "This suggests late work is the exception for you. You can leave it alone unless it starts to grow."
            }
          />
        </>
      )}
    </Panel>
  );
}
