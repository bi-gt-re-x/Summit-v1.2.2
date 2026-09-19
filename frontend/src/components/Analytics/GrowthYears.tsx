/**
 * The other Growth reading: the work itself, a calendar year at a time.
 *
 * ## Why this is not the rest of the tab
 *
 * Everything above it on the Growth tab is the *record* — XP earned, days
 * turned up on, deadlines met, hours logged — graded 0-100 against goals the
 * account set, over a period the reader picks. This is the reader's own account
 * of the work, on two rows they fill in by hand after finishing something, over
 * calendar years they do not pick.
 *
 * The two can disagree, and that is the point of keeping both. A stretch of
 * flawless deadline-keeping on easy work grades well above and says nothing
 * here; a year of hard things half-finished does the reverse.
 *
 * ## Totals are not improvement
 *
 * The trap this half is built to avoid. An account that did exactly the same
 * work at exactly the same standard every week for five years has a rising XP
 * line, a rising task count and a rising hours-logged figure, and has improved
 * at nothing: those all grow because time passes. So the figures that carry the
 * claim here are the two the reader supplies themselves — how hard the work was
 * and how well it went — and the totals sit beside them as context.
 *
 * The headline is `growthArc`, and the reason it names difficulty and execution
 * in the same breath is that either alone is misleading. Execution rising on
 * its own is what happens both when somebody gets better and when they start
 * picking easier things, and a page that showed the rise without the other half
 * would be flattering the reader with a number they could have got by lowering
 * their standards. See utils/growthYears, which will say so out loud when that
 * is what the record shows.
 *
 * ## Partial years are marked rather than dropped
 *
 * The first year begins when the account did and the last one is still running,
 * so both are short. The table prints their totals with the rest — they are
 * real — and every comparison made here is per active day, because a year with
 * four months in it has a smaller total than the year before it and that is not
 * a decline.
 */
import { useMemo } from 'react';
import { AreaChart, Panel, PanelNote, type Tone } from './charts';
import { StatRow, type Stat } from './StatRow';
import { MOVE, growthArc, growthYears } from '@/utils/growthYears';
import { benchHero } from '@/utils/growthBench';
import { longDate } from '@/utils/growthChapters';
import { number as fmtNumber } from '@/utils/format';
import type { AnalyticsModel } from './useAnalyticsModel';
import type { GrowthArc, GrowthYear } from '@/utils/growthYears';

/**
 * Calendar years the account has been present for before this half will draw.
 *
 * Two, and it is a count of years rather than of days on purpose: a reading
 * whose every row is a year cannot say anything with one row, and no number of
 * days inside a single calendar year produces a second one.
 */
const NEED_YEARS = 2;

/**
 * The tab's original question, kept: did the work get harder, and did it get
 * better?
 *
 * It is not a restatement of anything above it. Everything above is the
 * *record* — XP, days, deadlines, hours — graded against goals the account set.
 * This is the reader's own account of the work itself, on two rows they fill in
 * by hand after finishing something, and the two can disagree: a period of
 * flawless deadline-keeping on easy work reads well above and says nothing
 * here.
 *
 * The trap it exists to avoid is the same one it always did. Execution rising
 * on its own is what happens both when somebody gets better and when they start
 * picking easier things, so difficulty is named in the same breath every time.
 * See utils/growthYears, which will say so out loud when that is what the
 * record shows.
 */
export function YearOnYear({ model }: { model: AnalyticsModel }) {
  const { all, tasks } = model;

  const years = useMemo(() => growthYears(all, tasks), [all, tasks]);
  const arc = useMemo(() => growthArc(years), [years]);
  const hero = useMemo(() => benchHero(all), [all]);

  /* Years with something on them. A year the account existed through and did
     nothing in is kept in the table — a gap in the middle is a fact — but it
     cannot be one of the two the gate is counting. */
  const worked = years.filter((year) => year.activeDays > 0);

  if (worked.length < NEED_YEARS) {
    return (
      <Panel title="Year on year" note="How hard the work was, and how well it went">
        <p className="ax-empty">
          Year-on-year comparisons need two calendar years of data. The periods above work from day
          one.
        </p>
      </Panel>
    );
  }

  return (
    <>
      <Verdict arc={arc} />
      <ThenAndNow years={worked} />
      <RatingLines years={worked} />
      <StandingPanel hero={hero} />
      <YearTable years={years} />
    </>
  );
}

/**
 * Which way the year-on-year news runs, for colouring the block.
 *
 * `kind` alone cannot answer this, and the reason is the same one that puts a
 * `headline` on `GrowthArc` at all: `harder` covers two opposite readings.
 * "The difficulty you took on went 3.0 to 3.6 and your execution held" is
 * somebody taking on more and coping; "your execution rose but the difficulty
 * fell" is a rise that is partly an artefact. Only the sign of
 * `difficultyShift` separates them.
 */
function arcTone(arc: GrowthArc): Tone {
  if (arc.kind === 'slipped') return 'amber';
  if (arc.kind === 'harder') return (arc.difficultyShift ?? 0) < 0 ? 'amber' : 'green';
  if (arc.kind === 'flat') return 'blue';
  return 'green';
}

/**
 * A move on the five-point rating scale, in words.
 *
 * Under `MOVE` it is not reported as a rise or a fall at all. Both rows are
 * integers a person picks after finishing something, so a year's mean drifting
 * by a tenth is the population changing slightly and not the reader changing —
 * and a tile that prints "+0.1" invites a reader to read it as improvement.
 * `growthArc` uses the same threshold for the same reason; this is the one
 * constant the two share rather than two numbers that happen to agree.
 */
function moveNote(shift: number | null): string {
  if (shift === null) return 'not rated at both ends';
  if (Math.abs(shift) < MOVE) return 'held level';
  return `${shift > 0 ? '+' : '−'}${Math.abs(shift).toFixed(1)} on the five-point scale`;
}

/**
 * The year-on-year claim, in three lengths: five words, the two pairs of
 * figures they were read off, then the full sentence.
 *
 * Execution is drawn first and difficulty beside it, in the same type, because
 * the *pair* is the claim — a block that set the rising figure large and the
 * steady one as a footnote would be the flattery this reading exists to avoid.
 *
 * Nothing draws without an arc: `growthArc` returns one only when two separate
 * years each carry at least `MIN_RATED` ratings, and a headline invented from
 * less than that is a page making something up in large type.
 */
function Verdict({ arc }: { arc: GrowthArc }) {
  if (!arc.headline || !arc.from || !arc.to) return null;

  return (
    <section className={`ax-gy-verdict ax-tone-${arcTone(arc)}`}>
      <p className="ax-gy-eyebrow">
        {arc.from.label} <span aria-hidden="true">→</span> {arc.to.label}
      </p>
      <h4 className="ax-gy-headline">{arc.headline}</h4>

      <div className="ax-gy-moves">
        <Move
          label="Execution"
          note="how well the work went"
          from={arc.from.execution}
          to={arc.to.execution}
          shift={arc.executionGain}
          tone="green"
        />
        <Move
          label="Difficulty"
          note="how hard it was"
          from={arc.from.difficulty}
          to={arc.to.difficulty}
          shift={arc.difficultyShift}
          tone="violet"
        />
      </div>

      {/* The sentence, assembled in utils/growthYears. It is the one thing here
          that names both figures in one breath, which is the whole argument, so
          it is the last word rather than a caption. */}
      {arc.sentence && <p className="ax-gy-lead">{arc.sentence}</p>}
    </section>
  );
}

/** One rating's *then → now*: the two figures, with the older one set back. */
function Move({
  label,
  note,
  from,
  to,
  shift,
  tone,
}: {
  label: string;
  note: string;
  from: number | null;
  to: number | null;
  shift: number | null;
  tone: Tone;
}) {
  return (
    <article className={`ax-gy-move ax-tone-${tone}`}>
      <p className="ax-gy-move-label">
        {label} <em>{note}</em>
      </p>
      <p className="ax-gy-figures">
        <span className="ax-gy-was">{from === null ? '—' : from.toFixed(1)}</span>
        <span className="ax-gy-arrow" aria-hidden="true">→</span>
        <strong className="ax-gy-now">{to === null ? '—' : to.toFixed(1)}</strong>
        <em className="ax-gy-of">/ 5</em>
      </p>
      <p className="ax-gy-move-note">{moveNote(shift)}</p>
    </article>
  );
}

/**
 * Execution and difficulty across the years, on one five-point axis.
 *
 * **What the two lines are not.** They are not a race. Both rows are scored out
 * of five, which is what lets them share an axis, but they answer different
 * questions — how hard was it, how well did it go — so the point at which one
 * crosses the other means nothing at all. Only the slopes are comparable, and
 * the legend and the note under the chart both say so.
 *
 * The axis is pinned to five rather than to the tallest reading. Left to scale
 * itself the chart would run 0 to 3.7 on this account, and a five-point scale
 * drawn as a 3.7-point one exaggerates every wobble in the flat line — which is
 * the one line whose flatness is the point.
 */
const RATING_SCALE = 5;

/**
 * How tall the ratings box is drawn.
 *
 * It was 155, and the reasoning was that ratings live in a narrow band near the
 * top of a five-point axis — nothing on the account this was built against goes
 * below 2.8 — so most of a tall box would be empty. That was right while the
 * box held two bare lines. With a marker on every year the lines are a set of
 * *readings*, and at 155 a five-year rise of 0.9 points is a climb of about
 * thirty pixels: a real finding drawn as a rounding error.
 *
 * The empty band under the lines is the cost, and it is the correct cost. It is
 * the room a rating could have fallen into and did not.
 */
const RATING_HEIGHT = 220;

function RatingLines({ years }: { years: GrowthYear[] }) {
  const rated = years.filter((year) => year.execution !== null && year.difficulty !== null);

  // Two points is a line; one is a dot with a caption. Below that the panel
  // says so, because an empty chart box reads as a chart that failed.
  if (rated.length < 2) {
    return (
      <Panel title="Execution against difficulty" note="Both out of five, as you rated them">
        <p className="ax-empty">
          Two years with ratings on them draws this. Rating a task after finishing it is what
          fills it in.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Execution against difficulty"
      note="Both out of five, as you rated them"
      /* The legend goes in the title row rather than under the box. It names
         which line is which, which is the first question anybody asks of a
         two-line chart, and a key below the drawing is answered after the
         question has already been guessed at. */
      aside={
        <ul className="ax-gy-legend">
          <li className="ax-tone-green">
            <span className="ax-gy-key" aria-hidden="true" />
            Execution
          </li>
          <li className="ax-tone-violet">
            <span className="ax-gy-key is-muted" aria-hidden="true" />
            Difficulty
          </li>
        </ul>
      }
    >
      <AreaChart
        id="ax-gy-ratings"
        height={RATING_HEIGHT}
        max={RATING_SCALE}
        label="Execution and difficulty, your own ratings out of five, by year"
        /* One reading a year, so the x label *is* the year — no date formatting
           and no sampling, unlike every other chart drawn with this. */
        readout={{
          labels: rated.map((year) => year.label),
          names: ['Execution', 'Difficulty'],
          format: (value) => `${value.toFixed(1)} out of 5`,
        }}
        ticks={['5', '4', '3', '2', '1', '0']}
        marks={rated.map((year) => year.label)}
        series={[
          /* Marked, on both lines. A year is one reading here, not a sample of
             a continuous thing, and without a dot on it a reader cannot tell
             which bend in the line is a year and which is the line passing
             through one. See `dots` in components/Analytics/charts. */
          { values: rated.map((year) => year.execution), tone: 'green', dots: true },
          {
            values: rated.map((year) => year.difficulty),
            tone: 'violet',
            muted: true,
            dots: true,
            // Unfilled: two washes on one box leave a middle band belonging to
            // neither, and this line is a reference for the other rather than a
            // quantity in its own right.
            fill: false,
          },
        ]}
      />
      <PanelNote label="Reading this">
        The solid line is execution (how well it went) and the lighter line is difficulty. Both are
        your ratings out of 5. Compare each line's shape, not which is higher.
      </PanelNote>
    </Panel>
  );
}

/**
 * The first worked year against the latest, as four tiles.
 *
 * Rates rather than totals for the two volume figures: both ends of this
 * comparison are usually partial years — the first begins when the account did
 * and the last is still running — and their totals are not comparable while
 * their per-active-day figures are.
 *
 * `delta` is left off every tile. The row's deltas are percentages against a
 * previous period, and these are a first-to-latest comparison across several
 * years — the same word for a different thing.
 */
function ThenAndNow({ years }: { years: GrowthYear[] }) {
  const first = years[0]!;
  const last = years[years.length - 1]!;

  const rated = years.filter((year) => year.execution !== null && year.difficulty !== null);

  const shift = (from: number | null, to: number | null, digits = 1) =>
    from === null || to === null
      ? 'not rated then'
      : `${from.toFixed(digits)} in ${first.label}`;

  const stats: Stat[] = [
    {
      key: 'execution',
      series: rated.map((year) => year.execution!),
      label: 'Execution',
      value: last.execution === null ? '—' : last.execution.toFixed(1),
      unit: last.execution === null ? undefined : '/ 5',
      note: shift(first.execution, last.execution),
      tone: 'green',
      glyph: 'sparkle',
      hint: 'How well the work went, as you rated it after finishing. Averaged over the tasks '
        + 'carrying both a difficulty and an execution.',
    },
    {
      key: 'difficulty',
      series: rated.map((year) => year.difficulty!),
      label: 'Difficulty',
      value: last.difficulty === null ? '—' : last.difficulty.toFixed(1),
      unit: last.difficulty === null ? undefined : '/ 5',
      note: shift(first.difficulty, last.difficulty),
      tone: 'violet',
      glyph: 'target',
      hint: 'How hard the work was, as you rated it. The figure that says whether a rising '
        + 'execution score is improvement or easier work.',
    },
    {
      key: 'pace',
      series: years.map((year) => year.tasksPerActiveDay),
      label: 'Tasks a working day',
      value: last.tasksPerActiveDay.toFixed(1),
      note: `${first.tasksPerActiveDay.toFixed(1)} in ${first.label}`,
      tone: 'blue',
      glyph: 'check',
      hint: 'Per day you actually worked, not per day on the calendar — so a part-year is '
        + 'comparable with a whole one.',
    },
    {
      key: 'hours',
      series: years.map((year) => year.focusHours),
      label: 'Hours logged',
      value: fmtNumber(Math.round(last.focusHours)),
      unit: last.partial ? 'so far' : undefined,
      note: `${fmtNumber(Math.round(first.focusHours))} in ${first.label}`,
      tone: 'amber',
      glyph: 'clock',
    },
  ];

  return <StatRow stats={stats} />;
}

/** A dash, not a zero: nothing recorded is not a reading of nothing. */
const orDash = (value: string | number | null | undefined) =>
  value === null || value === undefined ? '—' : String(value);

/**
 * The standing panel's one-line claim.
 *
 * A percentile of 100 is not a sentence anybody says. It means the last thirty
 * days are the best thirty the account has had, and "ranks above 100% of your
 * 1,819 stretches" is a roundabout and slightly wrong way of putting that —
 * the current window is one of the 1,819 and does not rank above itself.
 */
function standingClaim(hero: { percentile: number | null; windows: number }): string | undefined {
  if (hero.percentile === null) return undefined;
  if (hero.percentile >= 100) {
    return 'The last 30 days are the best 30 you have had.';
  }
  return `Your last 30 days rank above ${hero.percentile}% of the ${fmtNumber(hero.windows)} `
    + '30-day stretches on your record.';
}

/** Where the last 30 days sit against every other 30 the account has had. */
function StandingPanel({ hero }: { hero: ReturnType<typeof benchHero> }) {
  return (
    <Panel
      title="Where this month sits in all of it"
      note="The last 30 days against every other 30 you have had"
      claim={standingClaim(hero)}
    >
      {hero.percentile === null ? (
        <p className="ax-empty">
          A ranking needs more than one 30-day stretch to rank against. This fills in on its
          own.
        </p>
      ) : (
        <ul className="ax-gy-notes">
          <li>
            <span>These 30 days</span>
            <strong>{fmtNumber(hero.currentXp)} XP</strong>
          </li>
          <li>
            <span>Your best 30</span>
            <strong>
              {fmtNumber(hero.bestXp)} XP
              {hero.bestEndedOn ? <em> to {longDate(hero.bestEndedOn)}</em> : null}
            </strong>
          </li>
          {hero.fromBaseline !== null && (
            <li>
              <span>Against your first 30</span>
              {/* As a multiple past a couple of doublings. "+1228%" is a
                  figure a reader has to do arithmetic on before it means
                  anything, and the arithmetic is "about thirteen times". */}
              <strong>
                {hero.fromBaseline >= 200
                  ? `${((hero.fromBaseline + 100) / 100).toFixed(1)}× as much`
                  : `${hero.fromBaseline >= 0 ? '+' : ''}${hero.fromBaseline}%`}
              </strong>
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}

/**
 * Every year the account has been present for, oldest first.
 *
 * A table rather than a chart, and deliberately. Six rows of eight figures is
 * not a shape — it is a set of readings a person wants to compare across two
 * axes at once, which is the one job a table does better than any picture.
 */
function YearTable({ years }: { years: GrowthYear[] }) {
  return (
    /* No XP column. It is tasks multiplied by their average value, and on a
       page about improvement it moves for the same reason the task count does
       — so it was a second copy of a column already there, in bigger numbers. */
    <Panel
      title="Year by year"
      note="Volume from your XP ledger; the two ratings from the tasks that carry both"
    >
      <div className="ax-gy-scroll">
        <table className="ax-gy">
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Days worked</th>
              <th scope="col">Tasks</th>
              <th scope="col">A working day</th>
              <th scope="col">Hours</th>
              <th scope="col">Rated</th>
              <th scope="col">Difficulty</th>
              <th scope="col">Execution</th>
            </tr>
          </thead>
          <tbody>
            {years.map((year) => (
              <tr key={year.year} className={year.activeDays === 0 ? 'is-quiet' : undefined}>
                <th scope="row">
                  {year.label}
                  {/* Marked, not hidden. Its totals are real and lower than a
                      full year's, and the reader has to know which is which. */}
                  {year.partial && <span className="ax-gy-part">part year</span>}
                </th>
                <td>{fmtNumber(year.activeDays)}</td>
                <td>{fmtNumber(year.tasks)}</td>
                <td>{year.tasksPerActiveDay.toFixed(1)}</td>
                <td>{fmtNumber(Math.round(year.focusHours))}</td>
                {/* The evidence base for the two columns after it, set back
                    because it qualifies them rather than being a reading of
                    its own. */}
                <td className="is-aside">{fmtNumber(year.rated)}</td>
                <td>{orDash(year.difficulty?.toFixed(1))}</td>
                <td className="is-lead">{orDash(year.execution?.toFixed(1))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
