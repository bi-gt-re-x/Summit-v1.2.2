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
import { useMemo, useState, type ReactNode } from 'react';
import { Panel, PanelGroup, type Tone } from '../charts';
import { ConsistencyPanel } from '../Breakdown';
import { GrowthLine, type LineMark, type LineSeries } from '../GrowthLine';
import { YearOnYear } from '../GrowthYears';
import {
  METRIC_META,
  METRIC_ORDER,
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
import { SkillGrowthPanel, TimeProgressPanel } from '../SkillGrowth';
import { SkillLevelsPanel } from '../SkillLevels';
import { skillTrajectory, timeToProgress } from '@/utils/skillGrowth';
import { hourLabel } from '@/utils/behaviour';
import { useGrowthPeriods } from '../useGrowthPeriods';
import { useSkillAttempts, useSkillReading, useStats } from '@/hooks';
import type { GrowthPeriods, PeriodKey } from '@/services/analytics';
import { SkillShapePanel } from '../SkillView';
import { GrowthReadsPanel } from '../GrowthReads';
import { RecordsGrowthSection, type RecordsRead } from '../RecordsAnalysis';
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
export const OPENS_WITH: Array<PeriodMetric | 'overall'> = [
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

/**
 * How long each period is, for the two panels computed in the browser.
 *
 * The five graded measures are scored server-side over these same windows —
 * see ../useGrowthPeriods — and these two are not, because they are functions
 * of the task list the page already holds. The numbers are written here rather
 * than parsed off the key so a period added on one side and not the other
 * fails to compile rather than silently drawing a month.
 *
 * `all` is null, meaning "from the first finished task", which the trajectory
 * works out for itself.
 */
export const PERIOD_DAYS: Record<PeriodKey, number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
  '730d': 730,
  all: null,
};

/** How the period reads inside a sentence. */
export const PERIOD_TEXT: Record<PeriodKey, string> = {
  '7d': 'the last week',
  '30d': 'the last 30 days',
  '90d': 'the last 3 months',
  '365d': 'the last year',
  '730d': 'the last 2 years',
  all: 'all your work',
};

/**
 * Every subject's level across a period, and what the time bought.
 *
 * The two figures the Growth tab works out in the browser rather than asks
 * the server for, in one hook so the tab and a panel on a space's page
 * (components/Spaces/PanelBlock) work them out the same way.
 */
export function useSkillGrowth(model: AnalyticsModel, period: PeriodKey) {
  const { all: dayRows, nameOf, tasks, liveGoals } = model;
  /* The reader's marked skill-tree problems, once for the tab: the subject
     cards read them for the tree tile and "Skills by level" reads them whole.
     `useStats` for the name, for the reason ../useGrowthPeriods gives. */
  const { username } = useStats();
  const practice = useSkillAttempts(username);
  const { reading: skillReading } = useSkillReading(username);

  /* `Record<PeriodKey, …>` is total, so the lookup cannot miss — the
     assertions are for TypeScript's index signature rather than for a case
     that can happen. */
  const windowDays = PERIOD_DAYS[period] ?? null;
  const periodText = PERIOD_TEXT[period] ?? 'this period';
  const toIso = dayRows[dayRows.length - 1]?.date ?? '';

  /**
   * Every subject's level across the chosen period.
   *
   * Computed here rather than fetched: `skillScores` is a pure function of the
   * reader's finished, rated tasks, and this page already holds them. A second
   * request for a number the browser can work out would also be a second
   * scoring implementation the moment the two drifted.
   */
  const tracks = useMemo(
    () => skillTrajectory({ tasks, nameOf, days: windowDays, toIso }),
    [tasks, nameOf, windowDays, toIso],
  );

  /**
   * The tasks finished inside the period, for the output half.
   *
   * Guarded on `toIso` before any date arithmetic. An account whose series has
   * not arrived has no last day, and `new Date(NaN).toISOString()` does not
   * return a bad string — it throws, which takes the whole tab down rather
   * than drawing an empty panel.
   */
  const finishedInPeriod = useMemo(() => {
    const toMs = Date.parse(`${toIso}T00:00:00Z`);
    if (!toIso || Number.isNaN(toMs)) return [];
    const from = windowDays === null
      ? ''
      : new Date(toMs - windowDays * 86400000).toISOString().slice(0, 10);
    return tasks.filter((task) => {
      if (task.status !== 'done') return false;
      const done = task.completed_at?.slice(0, 10);
      return done !== undefined && done <= toIso && (from === '' || done >= from);
    });
  }, [tasks, toIso, windowDays]);

  /* Everything the subject cards need beyond the score. One object, memoised,
     so a card's own memos only rerun when the period or the record moves. */
  const context = useMemo(
    () => ({
      tasks,
      goals: liveGoals ?? [],
      windowDays,
      toIso,
      periodText,
      levels: practice.levels,
      username,
      reading: skillReading,
    }),
    [tasks, liveGoals, windowDays, toIso, periodText, practice.levels, username, skillReading],
  );

  const progress = useMemo(
    () => timeToProgress({ days: dayRows, finished: finishedInPeriod, tracks, windowDays }),
    [dayRows, finishedInPeriod, tracks, windowDays],
  );

  return { tracks, progress, context, practice, periodText };
}

/** The lines the timeline draws, from the periods and which lines are on. */
export function growthSeries(data: GrowthPeriods, lines: ReadonlyArray<PeriodMetric | 'overall'>): LineSeries[] {
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
}

/**
 * The growth timeline: the chosen scores as lines, with the days a score hit
 * a new grade marked on them, and a toggle per line.
 *
 * The milestones are placed on the line they were found in. A feed under the
 * chart and a rule on it are two readings of one list, and deriving both from
 * `milestones` is what stops them disagreeing about which days matter.
 *
 * `onToggle` never empties the chart: an empty chart box reads as a chart
 * that broke rather than as one the reader emptied, so the last line on stays
 * on. `aside` is the period control on the tab.
 */
export function GrowthTimelinePanel({
  data,
  lines,
  onLines,
  aside,
}: {
  data: GrowthPeriods;
  lines: ReadonlyArray<PeriodMetric | 'overall'>;
  onLines: (next: Array<PeriodMetric | 'overall'>) => void;
  aside?: ReactNode;
}) {
  const series = useMemo(() => growthSeries(data, lines), [data, lines]);
  const marks: LineMark[] = useMemo(
    () =>
      milestones(data)
        .map((entry) => ({
          at: data.series.findIndex((point) => point.date === entry.date),
          label: entry.headline,
          glyph: entry.kind === 'best' ? '★' : '◆',
        }))
        .filter((mark) => mark.at >= 0),
    [data],
  );
  const toggle = (key: PeriodMetric | 'overall') =>
    onLines(
      lines.includes(key)
        ? lines.length === 1
          ? [...lines]
          : lines.filter((entry) => entry !== key)
        : [...lines, key],
    );

  return (
    <Panel
      title="Growth timeline"
      note={
        `Each point covers the ${data.trend_window} days before it, so the line is smooth instead of jumping day to day`
      }
      aside={aside}
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
  );
}

/** What the underlying numbers did, in sentences, beside the scores they moved. */
export function ScoreChangesPanel({ data }: { data: GrowthPeriods }) {
  const changes = useMemo(() => whatChanged(data), [data]);
  return (
    <Panel
      title="What changed behind the scores"
      note="From the same numbers your scores use"
    >
      {changes.length === 0 ? (
        <p className="ax-empty">
          {data.previous
            ? 'Nothing moved enough to call it a change.'
            : "This period starts on your first day, so there's nothing"
              + ' earlier to compare with.'}
        </p>
      ) : (
        <ul className="ax-gp-changes">
          {changes.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function GrowthTab({ model, records }: { model: AnalyticsModel; records?: RecordsRead }) {
  const { detail, heatRows, nameOf, skills, clock } = model;
  /* The page's window picker drives the period — see ../useGrowthPeriods. */
  const { period, setPeriod, periods } = useGrowthPeriods(model.span, model.chooseSpan);
  const { tracks, progress, context: subjectContext, practice, periodText } = useSkillGrowth(model, period);
  const [lines, setLines] = useState<Array<PeriodMetric | 'overall'>>(OPENS_WITH);

  const data = periods.data;

  const moved = useMemo(() => (data ? movers(data) : { best: null, worst: null }), [data]);
  const feed = useMemo(() => (data ? milestones(data) : []), [data]);

  if (periods.error && !data) {
    return (
      /* A failed request, not a short record — so `kind` rather than the
         waiting state this used to borrow with need=1, have=0. That produced
         a meter reading "0 / 1" and told somebody whose request had errored
         that they needed one more day of work. See ../Building. */
      <Building
        credit={model.maturity.credit ?? 0}
        headStart={model.headStart}
        title="Growth"
        kind="problem"
        headline="Summit couldn't load your grades."
        promise="Your history is safe. This just failed to load. Try again in a moment."
        asksLead="When it loads, Growth shows you:"
        asks={[
          'Which period was your best?',
          'Which score moved the most, and why?',
          'What changed behind the score?',
          'How does this month rank?',
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
          <p className="ax-empty">Loading your scores…</p>
        </section>
      )}

      {/* First: the things only this record can say. Not "Chemistry went
          Competent → Strong" but which topic improved, when each subject goes
          best and what keeps going wrong. Its own request, so it doesn't wait
          on the grades below. See ../GrowthReads. */}
      <section className="ax-section">
        <GrowthReadsPanel span={model.span} />
      </section>

      {/* The records: what each personal best is about, read from its name,
          set against the work on the same contest or subject and the goals
          that name it. Before the grades because it is about the reader's own
          results; the page fetched it with everything else. See
          ../RecordsAnalysis and backend/tracking/record_reads.py. */}
      {records && <RecordsGrowthSection read={records} />}

      {data && (
        <>
          {/* Skill growth leads, and the five graded measures no longer do.
              The tab is called Growth and every one of those five reads
              *output* — how much got done, how often, how fast, how well it
              was rated. An account can hold all five steady for a term and
              have climbed two bands in Mathematics, and this page used to
              report that as a flat month. The one figure here about the
              reader rather than their record is the skill score, so it opens
              the tab. See utils/skillGrowth. */}
          <section className="ax-section">
            <Panel
              title="Skill growth"
              note={`How your level in each subject moved over ${periodText}`}
            >
              <SkillGrowthPanel
                tracks={tracks}
                periodText={periodText}
                limit={detail.rows}
                context={subjectContext}
              />
            </Panel>
          </section>

          {/* The same question one level down: not Mathematics but Factor
              Simple Quadratics, read from problems the reader marked right or
              wrong on the skill tree. The subject panel above cannot go finer
              than a subject, because that is all a task records. */}
          <section className="ax-section">
            <Panel
              title="Skills by level"
              note="Each skill tree step, based on problems you got right or wrong"
            >
              <SkillLevelsPanel
                practice={practice}
                periodText="all your work"
                limit={detail.rows}
              />
            </Panel>
          </section>

          {/* And what the time bought. The reader already knows how many hours
              they spent; what they cannot work out for themselves is whether
              those hours moved anything. */}
          <section className="ax-section">
            <Panel
              title="Time vs. progress"
              note="Hours in, work out, and whether the level moved with them"
            >
              <TimeProgressPanel progress={progress} periodText={periodText} />
            </Panel>
          </section>

          {/* The five graded measures and an overall grade were here: a second
              report card that came out different from Overview's (8.7 against
              8.1, and B against S for the same measure). Overview keeps the
              one grade; the timeline below still reads the same periods. */}

          {/* The shape of the strongest subject. It sits under the strip for
              the same reason it always did: the strip says how the account is
              doing overall and this says what one skill is made of. */}
          <section className="ax-section">
            <SkillShapePanel rows={skills} nameOf={nameOf} />
          </section>

          {/* The line. The period control lives in this panel's header because
              the period is a property of the chart before it is a property of
              anything else on the tab. */}
          <section className="ax-section ax-hero ax-gp-timeline">
            <GrowthTimelinePanel
              data={data}
              lines={lines}
              onLines={setLines}
              aside={
                <PeriodTabs
                  cards={data.periods}
                  active={period}
                  onPick={setPeriod}
                  busy={periods.refreshing}
                />
              }
            />
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
                  ? `${data.label} vs. the ${data.days} days before`
                  : "All your work. There's nothing earlier to compare with."
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
            <ScoreChangesPanel data={data} />
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
              note="Days your score hit a new grade"
            >
              <Panel
                title="Milestones"
                note="Worked out fresh each time, so they never go stale"
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
              title="When you get work done"
              note="Your day, by the hours you finish things"
            >
              <CoreHoursPanel clock={clock} />
            </PanelGroup>

            <PanelGroup
              title="Every day of the last year"
              note="One square for each day"
            >
              <ConsistencyPanel rows={heatRows} />
            </PanelGroup>

            <PanelGroup
              title="Your work, year by year"
              note="How hard it was and how well it went, by your ratings"
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
export function CoreHoursPanel({ clock }: { clock: AnalyticsModel['clock'] }) {
  const core = clock.coreWindow;

  return (
    <Panel
      title="When you work"
      note="Based on your recent work"
      claim={
        core
          ? `Half your finished work happens between ${hourLabel(core.from)} and ${hourLabel(core.to)}.`
          : undefined
      }
    >
      {core === null ? (
        <p className="ax-empty">
          This needs a few weeks of finished tasks.
        </p>
      ) : (
        <ul className="ax-gy-notes">
          <li>
            <span>Your core hours</span>
            <strong>
              {hourLabel(core.from)} to {hourLabel(core.to)}
            </strong>
          </li>
          <li>
            <span>Share of your work in them</span>
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
