/**
 * Overview — the long view of the account.
 *
 * Productivity, consistency and quality; their trajectory; the score; and where
 * the account stands. The three rates lead every panel here and the totals they
 * came from sit behind them — see `Tiles` for why.
 *
 * This tab used to run four rows longer: a subject radar, a milestone list, a
 * year-on-year chart, the compounding projection and four insights, all before
 * the reader reached the bottom. Every one of them exists in full on a tab
 * built for it, and the Overview was answering "how am I doing" by restating
 * the other tabs at lower resolution. What is left is the shortest honest
 * answer, and three links out to whichever question the reader actually has.
 *
 * The score, its letter and what moved used to open here in a banner of their
 * own. They still open the tab — as `Summary`, in the shared opening slot the
 * page owns, alongside the two things this tab could never say: what to change,
 * and why.
 *
 * It builds its own quality and baseline blocks rather than being handed them.
 * They were props back when this was a function at the bottom of the page and
 * the page held the figures; the model holds them now, so the only thing left
 * to pass is the one callback that opens a screen the page owns.
 */
import { PanelGroup } from '../charts';
import {
  BaselinePanel,
  ActiveDayPrinciple,
  AwayNotice,
  Collecting,
  ConsistencyPanel,
  LearningStrip,
  StageNote,
  DepthPicker,
  QualityGridPanel,
  QualityPanel,
  SubjectPanel,
  Tiles,
  Trajectory,
} from '../index';
import type { Stat } from '../StatRow';
import { number as fmtNumber } from '@/utils/format';
import { NEED_DAYS } from '../useAnalyticsModel';
import { ObservationNote } from '../Observation';
import { LensLine } from '../Lens';
import { stageShows } from '@/utils/dataMaturity';
import type { LearningItem } from '../index';

/** No earlier period to compare a subject against. Shared, so it is one object. */
const EMPTY_PREVIOUS = new Map<string, number>();
import type { AnalyticsData } from '../useAnalyticsData';
import type { AnalyticsModel } from '../useAnalyticsModel';

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
    breakdown,
    lens,
    observed,
    compareLabel,
    figures,
    subjectLabel,
    historyDays,
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
    ratingGrid,
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
  } = model;
  const { baseline } = data;
  const aim = baseline.data?.baseline ?? null;

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

    return (
      <>
        {/* Before anything else, when there is a gap to explain. A reader
            coming back to a page of zeros is owed the reason before they are
            shown the zeros. */}
        <AwayNotice maturity={maturity} />

        <section id="overview" className="ax-section">
          <Collecting maturity={maturity} stats={basics} />
        </section>

        {/* The one inference allowed this early, and only once it is earned.
            Everything else at this stage is a tally, which is the right
            default and also the reason an account can spend a fortnight being
            handed totals and never once told anything about itself. The
            restraint is in utils/observations — a floor, an effect size, and a
            tier that has to be earned on both — so this renders nothing at all
            until there is something honest to render. */}
        {observed[0] && (
          <section className="ax-section">
            <ObservationNote observation={observed[0]} />
          </section>
        )}

        {/* The two day-4-to-7 tallies (when you work, how sessions end) are
            the Insights tab's "What is already true" now. */}
        {/* Where the work went. A share of a total is true on day one — it is
            a description of what is on record, not a claim about a trend — so
            this is the one panel from the mature tab that survives intact. */}
        <section className="ax-section">
          {/* No `previous`: there is no earlier period to compare against, and
              an empty map is how this component is told so. */}
          <SubjectPanel rows={breakdown.rows} previous={EMPTY_PREVIOUS} />
        </section>

        <ActiveDayPrinciple />
      </>
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
   * fortnight is the floor for those, because being told you are a C-minus on
   * your ninth day is a claim about somebody the app has barely met.
   *
   * Read from `stageShows` rather than spelled out here. The page's opening
   * slot makes the same call about `Summary`, and when the two were written
   * separately they were the same rule from opposite ends — the kind of pair
   * that drifts silently into a grade on the page opening above a tab still
   * holding the panel it came from.
   */
  const { judgement, note } = stageShows(maturity.stage);

  /* The gated tab, from its own `NEED_DAYS` rather than from a table
     here — one source for what each needs, so a threshold changed there shows
     up in this strip without anybody remembering to update it. */
  const learning: LearningItem[] = [
    { label: 'Recommendations', have: historyDays, need: NEED_DAYS.recommendations, href: '/recommendations' },
  ];

  return (
    <>
      <AwayNotice maturity={maturity} />

      {note && (
        <section className="ax-section">
          <StageNote maturity={maturity} />
          {/* What the rest of the page is still working on. Named rather than
              left silent: a reader who does not know Habits exists cannot look
              forward to it. See the note at the top of LearningStrip. */}
          <LearningStrip items={learning} />
        </section>
      )}

      {/* The score, its letter and what moved used to open here, in a banner
          of their own. They open the tab still — but as `Summary`, in the
          shared opening slot a few lines up in this file, alongside the two
          things this tab could never say: what to change, and why. */}
      <section id="overview" className="ax-section">
        <Tiles
          figures={figures}
          sparks={sparks}
          compareLabel={compareLabel}
          logStyle={logStyle}
          scopedOut={subjectLabel}
        />
      </section>

      {/* The growth score panel that sat beside this is the Growth tab now,
          so the line has the row to itself. */}
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

      {/* The reader's own target, before the panels that measure against
          nothing. A total is not good or bad on its own — four days a week is
          excellent against a three-day aim and a miss against a six-day one —
          so the thing that makes the rest of this tab legible goes above it. */}
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
             the page — the offer belongs beside the totals it would give a
             meaning to, not in front of them. */
          <section className="ax-baseline-offer">
            <strong>No target behind these numbers.</strong>
            <button type="button" className="ax-btn ax-btn-primary" onClick={onEditBaseline}>
              Set a baseline
            </button>
          </section>
        )}
      </section>

      {/*
        The detail, in named groups the reader opens.

        Everything above this point is the tab's answer to "how am I doing":
        what moved, the trajectory, the score, and the target all of it is
        measured against. Everything below is the follow-up question, and there
        were four rows of it — quality in two panels, consistency and streaks
        and the percentile, the two tallies, and the extras an account asked to
        have here — all at the same weight as the answer, all needing to be
        scrolled past by a reader who only wanted the answer.

        **All four start shut, which is not what Insights does.** There the
        three groups *are* the tab, so one has to be open or the tab reads as
        broken; here they sit under a screen of tiles, a chart and a baseline,
        so a row of shut headings reads as what it is — more, if you want it.
        Each states what it holds in a line that stays visible whether it is
        open or not, which is the part that makes a closed group an offer
        rather than a locked door.

        `#trajectory` deliberately stays outside: `Summary` links to it from
        three of its rows (see Summary.tsx), and an anchor that lands on a
        collapsed section is a link that appears to do nothing.
      */}
      <section id="standing" className="ax-section">
        {/* Quality is the only one of the three measures this tab leads with
            whose figure the app did not produce — the reader did. Two panels:
            what they said, and where the tasks they said it about landed. Both
            are self-effacing when nothing has been rated; see
            components/Analytics/Quality. */}
        {judgement && detail.quality && (
          <PanelGroup
            title="Quality"
            note="What your ratings said, and where those tasks landed"
          >
            <div className="ax-grid ax-grid-halves-even">
              <QualityPanel
                summary={qualitySummary}
                findings={ratingRows}
                bands={ratingBands}
                span={spanText}
                depth={ratingDepth}
                aside={<DepthPicker value={ratingDepth} onPick={setDepth} />}
              />
              <QualityGridPanel cells={ratingGrid} summary={qualitySummary} depth={ratingDepth} />
            </div>
          </PanelGroup>
        )}

        {/* The calendar of days worked. The rate itself is the Consistency
            tile above and is printed nowhere else on the page; the streaks
            that sat beside this are personal bests on Achievements. */}
        <PanelGroup
          title="Consistency"
          note="Which days you showed up"
        >
          <ConsistencyPanel rows={heatRows} />
        </PanelGroup>

        {/* "When you work" and "Findings" were here too. The first is the
            Insights tab's opening while habits are still filling, and the
            second is all figures other tabs print, with advice under them. */}
      </section>

      {lens && (
        <section className="ax-section">
          <LensLine lens={lens} />
        </section>
      )}

      {/* "Your coach's read" ended every fact in something to do, so it is on
          Recommendations now. */}
      {/* The rule every "active days" figure above depends on, at the length
          it can be left on screen permanently. The full note only appears
          beside a countdown, so an account past the staged tabs has not seen
          it in months. See `ActiveDayPrinciple`. */}
      <ActiveDayPrinciple />
    </>
  );
}
