/**
 * Overview: how am I doing, in the order a reader needs it.
 *
 * The score and what's holding it back open the tab, in the page's opening slot.
 * Then trouble, what changed, whether each goal will make it, and only then the
 * tiles and charts. Worse comes before better wherever the two sit together.
 *
 * Every panel is on the tab because no other tab can say it. Records are on
 * Growth, the goal lens on Recommendations and sign-up answers in Settings. A
 * space's page can still draw those and the difficulty grid.
 */
import {
  BaselinePanel,
  ActiveDayPrinciple,
  AwayNotice,
  Collecting,
  ConsistencyPanel,
  StageNote,
  Upcoming,
  EarlyRead,
  DepthPicker,
  QualityPanel,
  SubjectPanel,
  Tiles,
  Trajectory,
} from '../index';
import type { Stat } from '../StatRow';
import type { Task } from '@/types';
import { number as fmtNumber } from '@/utils/format';
import { ObservationNote } from '../Observation';
import { stageShows } from '@/utils/dataMaturity';
import { SOLID_AT } from '../milestones';

/** No earlier period to compare a subject against. Shared, so it is one object. */
const EMPTY_PREVIOUS = new Map<string, number>();
import type { AnalyticsData } from '../useAnalyticsData';
import type { AnalyticsModel } from '../useAnalyticsModel';
import { WhatYouToldUs } from '../WhatYouToldUs';
import { GoalsFinished } from '../GoalsFinished';
import { GoalForecast } from '../GoalForecast';
import { SlumpAlert, WhatChangedPanel } from '../WeekTrend';
import { PeriodSummary } from '../PeriodSummary';
import { moveReads, rangeLabel } from '@/utils/weekTrend';

export function OverviewTab({
  model,
  data,
  onEditBaseline,
}: {
  model: AnalyticsModel;
  data: AnalyticsData;
  /** Opens the baseline screen. The flag it sets belongs to the page. */
  onEditBaseline: () => void;
}) {
  const {
    all,
    background,
    nameOf,
    breakdown,
    observed,
    compareLabel,
    figures,
    maturity,
    streak,
    tasks,
    grain,
    heatRows,
    sparks,
    metric,
    previousSpanText,
    qualitySummary,
    ratingBands,
    ratingDepth,
    ratingRows,
    rhythm,
    setDepth,
    setGrain,
    setMetric,
    slice,
    spanText,
    /* What the account asked this page to be — see utils/analyticsPrefs. Three
       reads on this tab: which volume the tiles print, which panels are drawn
       at all, and how blunt the baseline's verdict is. */
    detail,
    logStyle,
    tone,
    weeks,
    thisWeek,
    slump,
    moves,
    recent,
    shownDiagnoses,
    reasons,
  } = model;
  const { baseline } = data;
  const aim = baseline.data?.baseline ?? null;
  /* Booking from the goal card changes what's on the calendar, so the whole
     account is read again. */
  const refreshAfterBooking = () => {
    data.refresh();
    model.setNudge((at) => at + 1);
  };

  /*
   * What the page has worked out about the reader, as opposed to about the
   * window — see the note at the top of utils/knows.
   *
   * Computed above the stage split because both branches draw it: the facts
   * carry their own floors, so a young account gets the two that are true and
   * a long one gets four, without this file deciding which stage deserves a
   * profile.
   */

  /*
   * Day 0-7, in one path that gains panels rather than two that replace each
   * other.
   *
   * The stages differ by what is added, never by what is rearranged: the
   * heading block, the counts, the subject split and the hand-off are in the
   * same order and the same components at every stage, and `early` puts two
   * more panels between the counts and the split. A reader crossing from one
   * stage to the next sees a page they recognise with something new on it,
   * which is the point — five layouts would be five products.
   *
   * Day 0-3: the tab, minus every panel that would be drawing a slope through
   * two points.
   *
   * What is dropped is exactly the set that needs a *second* period to mean
   * anything — `Tiles` prints a delta against the window before, `Trajectory`
   * is a line, the quality panels need rated tasks, and `ConsistencyPanel` is
   * a calendar with nothing on it yet. What stays
   * is what is already true: the counts, and where the work went.
   *
   * The tab is not replaced. It is the same file, the same sections and the
   * same components underneath — see the note at the top of Collecting for why
   * this is not a second dashboard.
   */
  if (maturity.stage === 'new' || maturity.stage === 'early') {
    const basics = basicStats(figures, streak, tasks);

    return (
      <div className="ax-ov">
        {/* Before anything else, when there is a gap to explain. A reader
            coming back to a page of zeros is owed the reason before they are
            shown the zeros. */}
        <AwayNotice maturity={maturity} />

        {/* A new account can be in a slump too, and it outranks every chart. */}
        {slump && slump.steps.length > 0 && (
          <section className="ax-section">
            <SlumpAlert slump={slump} />
          </section>
        )}

        {/* The last week (or month, or year) in a few bullets. */}
        <section id="summary" className="ax-section">
          <PeriodSummary all={all} tasks={tasks} nameOf={nameOf} />
        </section>

        {/* A dated goal is a fact on day one. Draws nothing without one. */}
        <GoalForecast onBooked={refreshAfterBooking} reload={model.nudge} />

        <section id="overview" className="ax-section">
          <Collecting maturity={maturity} stats={basics} />
        </section>

        {/* What the account said about itself at sign-up, and what it counts
            for while the record is short. */}
        <section className="ax-section">
          <WhatYouToldUs background={background} credit={maturity.credit ?? 0} waiting nameOf={nameOf} />
        </section>

        {/* The one inference allowed this early, and only once it is earned.
            The restraint is in utils/observations: a floor, an effect size, and
            a tier that has to be earned on both. */}
        {observed[0] && (
          <section className="ax-section">
            <ObservationNote observation={observed[0]} />
          </section>
        )}

        {/* Where the work went. A share of a total is true on day one. No
            `previous`: an empty map says there's no earlier period. */}
        <section className="ax-section">
          <SubjectPanel rows={breakdown.rows} previous={EMPTY_PREVIOUS} />
        </section>

        <GoalsFinished />

        <ActiveDayPrinciple />
      </div>
    );
  }

  /*
   * Day 7 and up: the real tab.
   *
   * Everything from here is the analytics page as it always was, and the one
   * stage flag below decides only *when* part of it starts rather than what
   * any of it looks like. That is the line this whole feature is built on —
   * five stages of one page, not five pages.
   *
   * Reaching this point already means a week of recorded work, so the panels
   * that are *about the record* — what happened, how often, where it went, and
   * how that compares with the period before — all draw from here. A week is
   * where those stop being noise, and the components already refuse the
   * comparison when the two windows are different lengths; see
   * `summaryFigures`.
   *
   * `judgement` holds back the ones that grade the *person*: the score, its
   * letter, the percentile against everybody else, the quality readings. A
   * two weeks is the floor for those, because being told you are a C-minus on
   * your ninth day is a claim about somebody the app has barely met.
   *
   * Read from `stageShows` rather than spelled out here. The page's opening
   * slot makes the same call about `Summary`, and when the two were written
   * separately they were the same rule from opposite ends — the kind of pair
   * that drifts silently into a grade on the page opening above a tab still
   * holding the panel it came from.
   */
  const { judgement, note } = stageShows(maturity.stage);
  const enoughRecord = recent.previous.length === recent.current.length && recent.current.length >= 14;
  const nowRange = recent.current.length
    ? rangeLabel(recent.current[0]!.date, recent.current[recent.current.length - 1]!.date)
    : '';
  const wasRange = recent.previous.length
    ? rangeLabel(recent.previous[0]!.date, recent.previous[recent.previous.length - 1]!.date)
    : '';

  return (
    <div className="ax-ov">
      <AwayNotice maturity={maturity} />

      {/* Trouble first: what to do about a slump matters more than any chart. */}
      {slump && slump.steps.length > 0 && (
        <section className="ax-section">
          <SlumpAlert slump={slump} />
        </section>
      )}

      {/* "How did it go", answered before any chart. See ../PeriodSummary. */}
      <section id="summary" className="ax-section">
        <PeriodSummary all={all} tasks={tasks} nameOf={nameOf} />
      </section>

      {/* Whether this week is up or down, and what moved over the last two. */}
      <section id="changed" className="ax-section">
        <WhatChangedPanel
          move={thisWeek}
          blocks={weeks}
          moves={moves}
          diagnoses={shownDiagnoses ?? []}
          enoughRecord={enoughRecord}
          nowRange={nowRange}
          wasRange={wasRange}
          reported={
            reasons.struggle[0]
              ? { phrase: reasons.struggle[0].phrase, count: reasons.struggle[0].count }
              : null
          }
          reads={moveReads(moves, shownDiagnoses ?? [])}
        />
      </section>

      {/* Will each dated goal finish in time. See ../GoalForecast. */}
      <GoalForecast onBooked={refreshAfterBooking} reload={model.nudge} />

      {note && (
        <section className="ax-section">
          <StageNote maturity={maturity} />
          {/* What the rest of the page is still working on, as locked cards. */}
          <Upcoming activeDays={maturity.activeDays} />
        </section>
      )}

      <section id="overview" className="ax-section">
        {/* The week-on-week deltas open at five work days now, so they say
            how thin the comparison is until the old seven. */}
        <EarlyRead days={maturity.activeDays} solidAt={SOLID_AT.trends} />
        <Tiles
          figures={figures}
          sparks={sparks}
          compareLabel={compareLabel}
          logStyle={logStyle}
        />
      </section>

      {/* Stays a section of its own: `Summary` links to `#trajectory`. */}
      <section id="trajectory" className="ax-section">
        <Trajectory
          current={slice.current}
          previous={slice.previous}
          metric={metric}
          onMetric={setMetric}
          grain={grain}
          onGrain={setGrain}
          spanLabel={spanText}
          previousSpanLabel={previousSpanText}
        />
      </section>

      {/* The reader's own target: four days a week is excellent against a
          three-day aim and a miss against a six-day one. */}
      <section className="ax-section">
        {aim ? (
          <BaselinePanel
            aim={aim}
            setOn={aim.set_on}
            activeRate={rhythm.activeRate}
            typicalSession={rhythm.typicalSession}
            span={spanText}
            tone={tone}
            onEdit={onEditBaseline}
          />
        ) : (
          /* No baseline and enough record that the setup screen did not take
             the page: the offer belongs beside the totals it gives a meaning to. */
          <section className="ax-baseline-offer">
            <strong>No targets set yet.</strong>
            <button type="button" className="ax-btn ax-btn-primary" onClick={onEditBaseline}>
              Set targets
            </button>
          </section>
        )}
      </section>

      {/* The only measure here the reader produced rather than the app. It draws
          itself away when nothing has been rated; see ../Quality. */}
      {judgement && detail.quality && (
        <section className="ax-section">
          <QualityPanel
            summary={qualitySummary}
            findings={ratingRows}
            bands={ratingBands}
            span={spanText}
            depth={ratingDepth}
            aside={<DepthPicker value={ratingDepth} onPick={setDepth} />}
          />
        </section>
      )}

      {/* The calendar of days worked. The rate is the Consistency tile above. */}
      <section id="standing" className="ax-section">
        <ConsistencyPanel rows={heatRows} />
      </section>

      {/* The celebration links here by `#goals-finished`. Draws nothing until
          there's a goal to show. */}
      <GoalsFinished />
    </div>
  );
}

/**
 * The five counts an account has from its first day: tasks finished, focus
 * time, XP, the streak and the completion rate. The Overview leads with them
 * until there are enough days for rates, and a panel on a space's page
 * (components/Spaces/PanelBlock) shows them whenever it's asked.
 */
export function basicStats(figures: AnalyticsModel['figures'], streak: number, tasks: Task[]): Stat[] {
  const finished = tasks.filter((task) => task.status === 'done').length;

  /* Against every task on the books, not against the ones that went well.
     Expired tasks count in the denominator — a rate that quietly drops the
     ones you missed is not a completion rate. */
  const completion = tasks.length > 0 ? Math.round((finished / tasks.length) * 100) : null;

  const basics: Stat[] = [
    {
      key: 'tasks',
      label: 'Tasks finished',
      value: fmtNumber(figures.tasks.value),
      short: `${fmtNumber(figures.tasks.value)} ${figures.tasks.value === 1 ? 'task' : 'tasks'}`,
      tone: 'green',
      glyph: 'check',
    },
    {
      key: 'focus',
      label: 'Focus time',
      value: figures.focusHours.value.toFixed(1),
      unit: 'h',
      short: `${figures.focusHours.value.toFixed(1)}h focused`,
      tone: 'blue',
      glyph: 'clock',
    },
    {
      key: 'xp',
      label: 'XP earned',
      value: fmtNumber(figures.xp.value),
      tone: 'violet',
      glyph: 'sparkle',
    },
    {
      key: 'streak',
      label: 'Current streak',
      value: String(streak),
      unit: streak === 1 ? 'day' : 'days',
      /* Dropped from the digest at zero rather than printed as "0-day
         streak", which reads as a rebuke on somebody's first morning. */
      ...(streak > 0 ? { short: `${streak}-day streak` } : {}),
      tone: 'amber',
      glyph: 'flame',
    },
    /* Only with tasks to divide by. "0%" over an empty list is not a rate,
       it is a division nobody did. */
    ...(completion === null
      ? []
      : [
          {
            key: 'completion',
            label: 'Completion rate',
            value: `${completion}%`,
            short: `${completion}% completion`,
            tone: 'pink' as const,
            glyph: 'target' as const,
            note: `${finished} of ${tasks.length} finished`,
          },
        ]),
  ];
  return basics;
}
