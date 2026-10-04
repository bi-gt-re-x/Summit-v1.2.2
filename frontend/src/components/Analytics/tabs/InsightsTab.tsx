/**
 * Insights — what you do, and what it is worth.
 *
 * This was two tabs. Habits answered "what do I repeat" and Insights answered
 * "why does the record look like this", and they were one argument split down
 * the middle: a reader who checked both twice concluded one of them was
 * redundant, because from the outside a tendency and the condition it holds
 * under are the same subject. Seven tabs was also one more than the bar can
 * carry — see the note on `VIEWS`.
 *
 * ## What the merge actually merged
 *
 * Not a concatenation. The two tabs carried ten panel groups between them and
 * this carries eight, because five things existed twice:
 *
 *   - **One "building" card.** Both tabs had one, with different thresholds
 *     and overlapping promises. There is one now, on the earlier of the two
 *     gates, and it lists what each half will say.
 *   - **One "What is already true".** Both tabs showed an early panel under
 *     that exact heading — one the observations, one the two raw counts. They
 *     were the same idea answered from two directions and are one group now.
 *   - **One place for the goal limiter.** Habits printed `LimiterLine`, a
 *     single line, precisely because a card about goals would have made it a
 *     tab about goals. That reasoning does not survive the merge: the cards
 *     are already here under "Why it happens", where a limiter belongs,
 *     so the line is gone rather than sitting a screen above them saying
 *     less.
 *   - **One group for steadiness.** "Every day you worked" was a calendar and
 *     "Holding or slipping" was consistency and start dates. Both answer
 *     whether a habit is keeping its shape over time, so the calendar moved
 *     in beside them.
 *   - **One group for subjects.** `SubjectInsights`, `SkillColdPanel` and
 *     `SkillFindingsPanel` were three separate sections across two tabs, all
 *     of them about which subject is doing what. One group.
 *
 * ## The two pattern panels are not a duplicate, and stay apart
 *
 * `PatternsPanel` says what recurs — "Usually finishes before 5pm", with the
 * denominator it was read off. `Patterns` says what your better work is
 * *associated* with — "execution is 14% higher on tasks finished before 5pm",
 * with the strength of the split behind it. Behaviour and consequence. They
 * read as the same panel in a summary and as two quite different claims on
 * screen, so each stays where its own group is: the first under "Your habits",
 * the second under "Why it happens".
 *
 * ## One group opens, and it is the habits
 *
 * The old Insights opened "What is true now" by default. It does not here, and
 * the reason is that `StateOverview` directly above already prints the weakest
 * measure and the strongest improvement, which is most of what that group
 * restates — two open things saying the same thing is how a merged page gets
 * long without getting fuller. So the page opens on the state, what changed,
 * and the habits themselves; everything else is a click.
 *
 * ## Two gates, because the halves need different amounts of record
 *
 * Habits need 21 days to say what repeats; insights need 28 to compare two
 * stretches. Both halves gate themselves, so between the two the tab is a real
 * page rather than a notice — which is the whole reason the thresholds were
 * never unified.
 *
 * It never says what to do. That is the Recommendations tab.
 */
import { Link } from 'react-router-dom';
import { ChangedPanel, ClockPanel, HowPanel, RelationshipsPanel, WeekPanel, WhyPanel } from '@/components/Insights';
import {
  HabitCards,
  ConsistencyPanel as HabitConsistencyPanel,
  HabitOpening,
  HabitTiles,
  PatternsPanel,
  TimelinePanel,
} from '../Habits';
import { Building } from '../Building';
import { ObservationNote } from '../Observation';
import { RatedTasksPanel, ReasonsPanel } from '../Quality';
import { FinishPanel, WhenPanel } from '../Early';
import { FocusChapter } from '@/components/Growth/FocusChapter';
import { PanelGroup } from '../charts';
import { partsOfDay } from '@/utils/habits';
import { unlock } from '@/utils/insight';
import { NEED_DAYS } from '../useAnalyticsModel';
import { whyFor } from '../milestones';
import type { AnalyticsModel } from '../useAnalyticsModel';
import type { SubjectIndex } from '@/hooks/useSubjects';

export function InsightsTab({
  model,
  subjects,
}: { model: AnalyticsModel } & { subjects: SubjectIndex }) {
  const {
    all, changes, changeWindow, clock, effects, fromIso, habits, historyDays, how,
    links, maturity, observed, patterns, qualitySummary, rated, ratingDepth, reasonRows, reasons,
    shifts, slice, spanText, summary, tasks, toIso, waitFor, week, why,
    /* How much of the page is drawn, and how bluntly — see utils/analyticsPrefs.
       Neither moves a figure on either half: the habit counts and the findings
       are computed in full and ranked the same way at every setting. */
    detail, toneRules,
  } = model;

  /*
   * How many findings a panel prints, and which of a pair leads.
   *
   * `diagnoses` is the tone's cap — two on gentle, eight on blunt — and it is
   * the right one for both halves: a "finding" here is a thing that is wrong
   * or notable about the record, which is exactly what that number is about
   * being shown at once. `rows` is the detail setting, and caps the supporting
   * lists that are evidence rather than diagnosis. Whichever is smaller wins —
   * asking for a short page and a blunt one should get a short blunt page, not
   * the larger of the two.
   */
  const findings = Math.min(toneRules.diagnoses, detail.rows);

  /** The two halves, each waiting on its own amount of record. */
  const habitsReady = waitFor('habits') === 0 && habits.length > 0;
  const insightsReady = waitFor('insights') === 0;

  return (
    <>
      {/* One card for both halves. It fires on the earlier gate, because that
          is when the tab first has nothing at all to say; past it the habits
          draw while the findings are still filling, which is a page rather
          than a notice. The asks are the two lists interleaved so a reader
          sees what the whole tab will become, not half of it. */}
      {(waitFor('habits') > 0 || habits.length === 0) && (
        <Building
          title="Insights"
          remaining={waitFor('habits')}
          need={NEED_DAYS.habits}
          have={historyDays}
          promise={whyFor(NEED_DAYS.habits)}
          spanDays={maturity.spanDays}
          asksLead="Summit will look for what repeats in your work, and what it is worth:"
          asks={[
            'Which routines have actually stuck?',
            'When do you perform best?',
            'Is a habit holding, or quietly slipping?',
            'Where does perceived difficulty differ from execution?',
            'What changed between your last two stretches?',
          ]}
          emptyMessage="Nothing repeats often enough yet to count as a habit."
          action={
            <Link to="/tasks" className="ax-btn">
              Open Tasks
            </Link>
          }
        />
      )}

      {/* What the tab can already say, under the card explaining what it
          cannot — and this was written twice, once per tab, under the same
          heading.

          Habits are what *repeats*, and four days cannot say what repeats.
          Insights compares two stretches, and needs two. But the raw material
          of both is a count of when work landed and what got finished, which
          is exact from the first task, plus whatever findings already clear
          their own floor in utils/observations — each wearing the sample it
          came from. A tab that shows nothing at all until day twenty-one is a
          tab that teaches a reader not to open it. */}
      {(waitFor('habits') > 0 || (!insightsReady && observed.length > 0)) && (
        <section className="ax-section">
          <PanelGroup
            title="What is already true"
            note="Just the counts and what already clears its own floor. The rest needs more history."
            defaultOpen
          >
            {/* The raw counts stop at the habits gate, because past it the
                habit cards say the same thing with more behind them. The
                observations run to the *insights* gate, which is a week
                later — merging the two early panels on to one heading must
                not quietly shorten the one that ran longer. */}
            {waitFor('habits') > 0 && (
              <div className="ax-grid ax-grid-halves-even">
                <WhenPanel parts={partsOfDay(tasks, fromIso, toIso)} days={maturity.activeDays} />
                <FinishPanel tasks={tasks} days={maturity.activeDays} />
              </div>
            )}
            {!insightsReady && observed.length > 0 && (
              <div className="ax-observe-stack">
                {observed.map((finding) => (
                  <ObservationNote key={finding.key} observation={finding} />
                ))}
              </div>
            )}
          </PanelGroup>
        </section>
      )}

      {/* The state meters that opened here — the five measures, the grade,
          the streak, the best improvement and the weakest area — are the
          Overview, the Growth tab and Achievements. They are not repeated. */}

      {/* What changed. The tab's own claim, and the only section here that is
          neither a shape nor a chart: see `ChangedPanel`. Capped the way every
          other finding list is, so a reader who asked for a short page gets
          three cards rather than nine. */}
      {insightsReady && (
        <section className="ax-section">
          <ChangedPanel changes={changes.slice(0, findings)} window={changeWindow} />
        </section>
      )}

      <section className="ax-section">
        {/* The one group that opens. It names the thing the tab is about and
            it is the concrete half — the abstract half is directly above it in
            two panels that need no disclosure. */}
        {habitsReady && (
          <PanelGroup
            title="Your habits"
            note="What each one is worth, not just how often it happens"
            defaultOpen
          >
            <HabitTiles summary={summary} span={spanText} />
            <div className="ax-grid ax-grid-halves-even">
              <HabitOpening
                summary={summary}
                span={spanText}
                leadWithStrength={toneRules.leadWithStrength}
              />
              <PatternsPanel patterns={patterns} limit={toneRules.diagnoses} />
            </div>
            {/* `habits` is already ordered strongest-first by `buildHabits`, so
                a cap takes the tail rather than an arbitrary slice. Four is the
                floor: a tab that draws three cards on an account with twenty is
                a shorter page, but one that draws one is a broken one. */}
            <HabitCards
              habits={habits.slice(0, Math.max(4, detail.rows))}
              todayIso={toIso}
              effects={effects}
            />
          </PanelGroup>
        )}

        {/* "What is true now" also held the current state, what improved and a
            list of key findings. Each was said elsewhere — the tab's opening,
            "What changed", the Overview's tiles, the personal bests — and the
            findings carried advice, which is the Recommendations tab. What is
            left is the one panel that names individual tasks. */}
        {insightsReady && (
          <PanelGroup title="Your best and worst work" note="The tasks at either end of your ratings">
            <RatedTasksPanel rated={rated} summary={qualitySummary} />
          </PanelGroup>
        )}

        {insightsReady && (
          <PanelGroup title="Why it happens" note="Conditions, correlations and causes">
            {/* The discovered-patterns panel that opened this group printed
                the same findings as the "Hidden pattern" cards in What changed,
                with a "worth trying" line under each. */}
            <div className="ax-grid ax-grid-halves-even">
              <WhyPanel
                findings={why.slice(0, findings)}
                notice={unlock(slice.current.length, NEED_DAYS.insights, 'the “why” behind your last stretch')}
              />
              <HowPanel
                findings={how.slice(0, findings)}
                notice={unlock(slice.current.length, NEED_DAYS.insights, 'how you tend to work')}
              />
            </div>
            {/* The one hero here: the only panel that draws raw observations
                rather than an aggregate over them. */}
            <div className="ax-hero">
              <RelationshipsPanel
                relationships={links}
                notice={unlock(slice.current.length, NEED_DAYS.insights, 'behavioural relationships')}
              />
            </div>
            {/* The only panel that answers *why* from what the reader said
                rather than from what they did, and the only one that exists at
                one rating depth and not the others. It draws nothing at all
                unless the account has asked to be asked. */}
            <ReasonsPanel
              reasons={reasons}
              findings={reasonRows}
              depth={ratingDepth}
              span={spanText}
            />

            {/* The goal limiter that sat here is on Recommendations, which is
                the one tab that says what to do about a goal. */}
          </PanelGroup>
        )}

        {/* Steadiness over time, which was two groups on the old Habits tab.
            The calendar was "Every day you worked" and the other two were
            "Holding or slipping"; all three answer whether a habit is keeping
            its shape, and a reader who wanted that had to open two headings to
            get it. */}
        {habitsReady && (
          <PanelGroup
            title="Holding or slipping"
            note="How steady each habit is, and when each began"
          >
            <div className="ax-grid ax-grid-halves-even">
              <HabitConsistencyPanel habits={habits} />
              <TimelinePanel habits={habits} shifts={shifts} />
            </div>
          </PanelGroup>
        )}

        {insightsReady && (
          <PanelGroup
            title="When and what you work on"
            note="The hours and the days your work lands on"
          >
            {/* The headline tiles here restated the two charts below, and the
                subject web is the Subjects tab. */}
            <div className="ax-grid ax-grid-halves-even">
              <ClockPanel clock={clock} />
              <WeekPanel week={week} />
            </div>
          </PanelGroup>
        )}

        {/* The per-subject group that sat here went with the subject score
            it was built on; where each subject stands is the Subjects tab. */}

        {/* The growth page's Focus chapter, three panels lighter.

            It draws eight, and on this tab three of them were answers this
            page had already given: its calendar is `HabitCalendarPanel`, its
            habit-stability list is `HabitConsistencyPanel`, and its
            consistency trail is `TimelinePanel` — all three directly above
            under "Holding or slipping", at a different size and over a
            different window. A reader opened one heading and met the same
            calendar twice.

            What is left is what only this chapter has: the scores, the
            planned-against-finished grid, focus depth, and the recovery after
            a miss. See `FocusPanel` for why it is an opt-out rather than a
            split — the Growth page still wants all eight. */}
        {habitsReady && (
          <PanelGroup
            title="Can you execute it reliably"
            note="Planned against finished, focus depth, and recovery after a miss"
          >
            <div className="gr-scope">
              <FocusChapter
                all={all}
                tasks={tasks}
                subjects={subjects}
                omit={['calendar', 'stability', 'trail']}
              />
            </div>
          </PanelGroup>
        )}
      </section>

      {/* The share of finished work aimed at a goal was a line here. Which
          subjects have a goal aimed at them is the Subjects tab's opening line,
          and the two said the same thing from two ends. */}
    </>
  );
}
