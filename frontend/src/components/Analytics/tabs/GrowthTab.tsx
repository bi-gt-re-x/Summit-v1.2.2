/**
 * Growth — how the account has changed, over a period the reader chooses.
 *
 * ## The question, and why it is not the dashboard's
 *
 * The dashboard answers *how am I doing right now*: today's XP, the streak, the
 * tasks still open. This tab answers *how have I changed*, and the difference
 * is not one of detail — it is that every figure here is two figures. A period
 * and the equivalent period before it, a score and the score it moved from, a
 * grade and the grade it was. A panel that can only state a current value
 * belongs on the other page.
 *
 * That is also why the tab is built around a *period* rather than the analytics
 * page's window picker. The picker scopes what the other six tabs describe;
 * this one needs the window *and* the window before it, which is a different
 * control asking a different question, so it has its own — see `PeriodRow`.
 *
 * ## Where the figures come from
 *
 * One request, and it is the page's only one that is scoped to a tab. The five
 * graded measures — productivity, quality, consistency, efficiency, focus — are
 * scored server-side over every window this tab offers, by the same
 * `score_window` that grades the report card. The long reasons are on the
 * endpoint in backend/api/analytics.py and in ../useGrowthPeriods; the short
 * one is that focus cannot be scored in the browser at all, because the growth
 * series carries the minutes logged and not the goal they were against.
 *
 * **Nothing in this tab computes a score.** It draws differences between scores
 * it was handed, and every sentence on it is assembled from those figures
 * rather than written, so no claim here can drift from the number beside it.
 *
 * ## The year-on-year half is still here, folded
 *
 * The tab used to be only that: the account a calendar year at a time, with
 * execution set against difficulty to separate getting better from picking
 * easier work. It is a genuinely different reading — self-rated, over years,
 * about the *work* rather than about the record — and it survives at the foot
 * of the page in a group of its own. What it is not is the answer to "how have
 * I changed lately", which is the question people arrive with.
 */
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Panel, PanelGroup, type Tone } from '../charts';
import { ConsistencyPanel } from '../Breakdown';
import { GrowthLine, type LineMark, type LineSeries } from '../GrowthLine';
import { YearOnYear } from '../GrowthYears';
import {
  METRIC_META,
  METRIC_ORDER,
  MetricStrip,
  MilestoneFeed,
  MoverPanel,
  PeriodCards,
  PeriodTabs,
  ThenNow,
  milestones,
  movers,
  whatChanged,
} from '../GrowthPeriod';
import { Building } from '../Building';
import { hourLabel } from '@/utils/behaviour';
import { useGrowthPeriods } from '../useGrowthPeriods';
import type { AnalyticsModel } from '../useAnalyticsModel';
import type { PeriodMetric } from '@/services/analytics';

/** "12 Aug" — the x axis and the milestone feed. Short, because it repeats. */
function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Which lines the chart opens with.
 *
 * Overall alone. Five lines at once is the wall this tab is meant to replace —
 * the reader arrives wanting to know whether they got better, and five
 * crossing lines is a puzzle rather than an answer. The five are one press
 * away, and pressing one is what a reader does *after* the overall line has
 * raised a question.
 */
const OPENS_WITH: Array<PeriodMetric | 'overall'> = [
  'productivity',
  'consistency',
  'quality',
  'efficiency',
];

/**
 * The overall line's colour.
 *
 * Not one of the five, because it is their mean: a sixth hue would put it in
 * the same visual class as its own terms, and borrowing one of the five would
 * give it a colour that already means a measure everywhere else on the page.
 * So it is a near-neutral of its own, and the line is drawn dashed on top of
 * that so it reads as a summary rather than as another reading.
 *
 * It briefly *was* `pink`, which is Focus's tone — so Focus quietly rendered
 * grey on every bar, toggle and line it appeared in. Hence the separate token.
 */
const OVERALL_COLOR = 'var(--ax-gp-overall)';

/** The tone a series falls back to when it has no colour of its own. */
const OVERALL_TONE: Tone = 'pink';

export function GrowthTab({ model }: { model: AnalyticsModel }) {
  const { clock, heatRows, rhythmRate } = model;
  const { period, setPeriod, periods } = useGrowthPeriods();
  const [lines, setLines] = useState<Array<PeriodMetric | 'overall'>>(OPENS_WITH);

  const data = periods.data;

  const toggle = (key: PeriodMetric | 'overall') =>
    setLines((current) =>
      current.includes(key)
        ? // Never down to nothing: an empty chart box reads as a chart that
          // broke rather than as one the reader emptied.
          current.length === 1
          ? current
          : current.filter((entry) => entry !== key)
        : [...current, key],
    );

  const series: LineSeries[] = useMemo(() => {
    if (!data) return [];
    const chosen: LineSeries[] = [];
    if (lines.includes('overall')) {
      chosen.push({
        key: 'overall',
        label: 'Overall',
        tone: OVERALL_TONE,
        color: OVERALL_COLOR,
        values: data.series.map((point) => point.overall),
      });
    }
    METRIC_ORDER.forEach((metric) => {
      if (!lines.includes(metric)) return;
      chosen.push({
        key: metric,
        label: METRIC_META[metric].label,
        tone: METRIC_META[metric].tone,
        values: data.series.map((point) => point[metric]),
      });
    });
    return chosen;
  }, [data, lines]);

  const moved = useMemo(() => (data ? movers(data) : { best: null, worst: null }), [data]);
  const feed = useMemo(() => (data ? milestones(data) : []), [data]);

  /* The same milestones, placed on the line they were found in. A feed under
     the chart and a rule on it are two readings of one list, and deriving both
     from `feed` is what stops them disagreeing about which days matter. */
  const marks: LineMark[] = useMemo(() => {
    if (!data) return [];
    return feed
      .map((entry) => ({
        at: data.series.findIndex((point) => point.date === entry.date),
        label: entry.headline,
        glyph: entry.kind === 'best' ? '★' : '◆',
      }))
      .filter((mark) => mark.at >= 0);
  }, [data, feed]);
  const changes = useMemo(() => (data ? whatChanged(data) : []), [data]);

  if (periods.error && !data) {
    return (
      /* A failed request, not a short record — so `kind` rather than the
         waiting state this used to borrow with need=1, have=0. That produced
         a meter reading "0 / 1" and told somebody whose request had errored
         that they needed one more day of work. See ../Building. */
      <Building
        title="Growth"
        kind="problem"
        headline="Summit could not load your graded record."
        promise="Nothing is missing from your history — this one request failed. Try again in a moment."
        asksLead="When it loads, Growth answers:"
        asks={[
          'Which period did you actually do best in?',
          'Which measure moved furthest, and why?',
          'What changed underneath the score?',
          'Where does this month sit in all of it?',
        ]}
        action={
          <Link to="/analytics" className="ax-btn">
            See totals
          </Link>
        }
      />
    );
  }

  return (
    <>
      {!data && periods.loading && (
        <section className="ax-section">
          <p className="ax-empty">Scoring your record…</p>
        </section>
      )}

      {data && (
        <>
          {/* The sum and its five terms on one line, so the headline can be
              checked against the arithmetic without moving. */}
          <section className="ax-section">
            <MetricStrip data={data} />
          </section>

          {/* The line. The period control lives in this panel's header because
              the period is a property of the chart before it is a property of
              anything else on the tab. */}
          <section className="ax-section ax-hero ax-gp-timeline">
            <Panel
              title="Growth timeline"
              note={
                `Each point is scored over the ${data.trend_window} days behind it, so the `
                + 'line is a moving average rather than a daily reading'
              }
              aside={
                <PeriodTabs
                  cards={data.periods}
                  active={period}
                  onPick={setPeriod}
                  busy={periods.refreshing}
                />
              }
            >
              <div className="ax-gp-toggles" role="group" aria-label="Metrics on the chart">
                {([...METRIC_ORDER, 'overall'] as Array<PeriodMetric | 'overall'>).map((key) => {
                  const overall = key === 'overall';
                  const meta = overall ? { label: 'Overall' } : METRIC_META[key];
                  const on = lines.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={
                        `ax-gp-toggle ${overall ? 'is-overall' : `ax-tone-${METRIC_META[key].tone}`}`
                        + (on ? ' is-on' : '')
                      }
                      aria-pressed={on}
                      onClick={() => toggle(key)}
                    >
                      <span className="ax-gp-check" aria-hidden="true" />
                      {meta.label}
                    </button>
                  );
                })}
              </div>

              <GrowthLine
                series={series}
                dates={data.series.map((point) => point.date)}
                labels={data.series.map((point) => shortDate(point.date))}
                marks={marks}
              />
            </Panel>
          </section>

          {/*
            The comparison beside the two measures at its extremes.

            The movers are stacked in one column rather than each taking a row
            of its own, and that is a height decision as much as a reading one:
            panels in a row are stretched to the tallest of them, and "then and
            now" is five metrics with a bar and a sentence each while a mover is
            one metric with three. Set one against one, the short panel carried
            a band of nothing half its own height again. Two against one is the
            arrangement where both columns end at about the same place, and it
            also happens to be the right reading order — the comparison, then
            what came top and bottom of it.
          */}
          <section className="ax-section ax-grid ax-grid-halves-even">
            <Panel
              title="Then and now"
              note={
                data.previous
                  ? `${data.label} against the ${data.days} days before it`
                  : 'Your whole record — there is nothing before it to compare against'
              }
            >
              <ThenNow data={data} />
            </Panel>

            <div className="ax-gp-stack">
              <MoverPanel
                kind="best"
                mover={moved.best}
                now={data.current}
                then={data.previous}
                data={data}
              />
              <MoverPanel
                kind="worst"
                mover={moved.worst}
                now={data.current}
                then={data.previous}
                data={data}
              />
            </div>
          </section>

          <section className="ax-section">
            <Panel
              title="What changed underneath"
              note="Assembled from the same figures the scores were graded on"
            >
              {changes.length === 0 ? (
                <p className="ax-empty">
                  {data.previous
                    ? 'Nothing moved far enough to be worth calling a change.'
                    : 'This period reaches back to the day you started, so there is nothing '
                      + 'before it to have changed from.'}
                </p>
              ) : (
                <ul className="ax-gp-changes">
                  {changes.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              )}
            </Panel>
          </section>

          {/* Every period at once. Not a second copy of the segmented control:
              that shows one answer and this shows six, and pressing a card is
              asking for the detail behind a figure just read. */}
          <section className="ax-section">
            <h2 className="ax-gp-heading">Growth by period</h2>
            <PeriodCards
              cards={data.periods}
              active={period}
              onPick={setPeriod}
              busy={periods.refreshing}
            />
          </section>

          {/* The two readings that explain the five above rather than restating
              them: what the underlying quantities did, and when the score
              crossed a letter. Folded, because they are the follow-up. */}
          <section className="ax-section">
            <PanelGroup
              title="Your milestones"
              note="The days the overall score crossed into a new grade"
            >
              <Panel
                title="Milestones"
                note="Found in the record rather than stored, so they cannot go out of date"
              >
                <MilestoneFeed entries={feed} format={shortDate} />
              </Panel>
            </PanelGroup>

            {/* The same year of days the Overview draws, and deliberately the
                same component rather than a second one: consistency is one of
                the five scores above, and the panel that shows it as days is
                where a reader goes to see *which* days. Always a year,
                whatever period is selected — a heatmap of the last seven days
                is seven squares. */}
            <PanelGroup
              title="When the work actually happens"
              note="The shape of your day, from the hours you finish things in"
            >
              <WhenPanel clock={clock} />
            </PanelGroup>

            <PanelGroup
              title="Every day of the last year"
              note="The consistency score above, drawn as the days themselves"
            >
              <ConsistencyPanel
                rate={rhythmRate.rate}
                previousRate={rhythmRate.previousRate}
                rows={heatRows}
                compareLabel="the year before"
              />
            </PanelGroup>

            <PanelGroup
              title="The work itself, year by year"
              note="How hard it was and how well it went, as you rated it"
            >
              <YearOnYear model={model} />
            </PanelGroup>
          </section>
        </>
      )}
    </>
  );
}

// --------------------------------------------------------------------------
// When the work happens
// --------------------------------------------------------------------------
/**
 * The hours the work lands in, and how concentrated they are.
 *
 * The one reading on this tab that is not a score, and it is here because it
 * answers the question the five scores raise and cannot settle: consistency
 * says how many days you turned up, and this says what turning up looks like.
 *
 * `coreWindow` is the *narrowest run of hours holding half the finished work*,
 * which is deliberately a different thing from a peak hour. A peak overstates
 * how concentrated a habit is — one unusual evening can own it — and a run
 * survives that and describes the shape of a day rather than a spike in it.
 * See utils/behaviour.
 *
 * Scoped to the page's recent window rather than to the selected period, and
 * that is a limitation stated rather than hidden: the model computes this once
 * over its own recent slice, and re-deriving it per period would mean a second
 * pass over the hour of every finished task that the model already holds. The
 * panel's note says which days it is describing.
 */
function WhenPanel({ clock }: { clock: AnalyticsModel['clock'] }) {
  const core = clock.coreWindow;

  return (
    <Panel
      title="When you work"
      note="Over your recent record, not the period above"
      claim={
        core
          ? `Half of everything you finish lands between ${hourLabel(core.from)} and `
            + `${hourLabel(core.to)}.`
          : undefined
      }
    >
      {core === null ? (
        <p className="ax-empty">
          A shape needs a few weeks of finished tasks with times on them. This fills in on
          its own.
        </p>
      ) : (
        <ul className="ax-gy-notes">
          <li>
            <span>Your core hours</span>
            <strong>
              {hourLabel(core.from)} – {hourLabel(core.to)}
            </strong>
          </li>
          <li>
            <span>Share of finished work in them</span>
            <strong>{Math.round(core.share)}%</strong>
          </li>
          {clock.peak && (
            <li>
              <span>Busiest single hour</span>
              <strong>
                {clock.peak.label} <em>{clock.peak.tasks} tasks</em>
              </strong>
            </li>
          )}
          <li>
            <span>Finished after 10 PM or before 5 AM</span>
            <strong>{Math.round(clock.lateShare)}%</strong>
          </li>
        </ul>
      )}
    </Panel>
  );
}
