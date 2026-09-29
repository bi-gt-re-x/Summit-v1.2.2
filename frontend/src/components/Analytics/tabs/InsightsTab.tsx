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
import {
  ChangedPanel,
  ClockPanel,
  CurrentStatePanel,
  HeadlineTiles,
  HowPanel,
  RelationshipsPanel,
  StateOverview,
  SubjectInsights,
  WeekPanel,
  WhyPanel,
  WorkingPanel,
} from '@/components/Insights';
import {
  HabitCalendarPanel,
  HabitCards,
  ConsistencyPanel as HabitConsistencyPanel,
  HabitOpening,
  HabitTiles,
  PatternsPanel,
  TimelinePanel,
} from '../Habits';
import { Patterns as DiscoveredPatterns } from '../Patterns';
import { Building } from '../Building';
import { ObservationNote } from '../Observation';
import { RatedTasksPanel, ReasonsPanel } from '../Quality';
import { SubjectPanel } from '../Breakdown';
import { InsightsPanel } from '../Longterm';
import { FinishPanel, WhenPanel } from '../Early';
import { FocusChapter } from '@/components/Growth';
import { PanelGroup } from '../charts';
import { LimiterCard } from '../Limiter';
import { partsOfDay } from '@/utils/habits';
import { unlock } from '@/utils/insight';
import { PATTERN_DAYS } from '@/utils/recent';
import { NEED_DAYS } from '../useAnalyticsModel';
import { whyFor } from '../milestones';
import { SkillColdPanel, SkillFindingsPanel } from '../SkillView';
import type { AnalyticsModel } from '../useAnalyticsModel';
import type { SubjectIndex } from '@/hooks/useSubjects';

export function InsightsTab({
  model,
  subjects,
}: { model: AnalyticsModel } & { subjects: SubjectIndex }) {
  const {
    aimedShare, all, analytical, balance, breakdown, byDate, changes, changeWindow, clock,
    discovered, effects, figures, focus, fromIso, goalLimits, habits, historyDays, how, insights,
    links, maturity, nameOf, observed, patterns, previousBySubject, qualitySummary, rated,
    ratingDepth, reasonRows, reasons, rhythm, shifts, skills, skillNotes, slice, spanText, state,
    streak, summary, tasks, toIso, waitFor, week, weekChange, wins, why,
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

      {/* Your overall state. Above every group and outside the disclosure,
          because a reader who opens this tab and folds everything shut should
          still be left with the answer. */}
      {insightsReady && (
        <section className="ax-section">
          <StateOverview
            analytical={analytical}
            streak={streak}
            weekChange={weekChange}
            /* The strongest measured improvement, which is `wins` already
               ranked — the same list the "What's working" panel below draws
               from, so the tile and that panel cannot name different
               winners. */
            improvement={wins[0] ? { text: wins[0].text, figure: wins[0].figure } : null}
            /* The weakest of the report card's five, with the sentence from
               `currentState` naming what is behind it. Two sources on one tile
               deliberately: the metric says which measure, and the sentence
               says what in the record made it that. */
            weakness={
              analytical.weakest
                ? {
                    label: analytical.weakest.label,
                    score: analytical.weakest.score,
                    note: state.weakness,
                  }
                : null
            }
          />
        </section>
      )}

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
            <HabitTiles summary={summary} span={spanText} hours={figures.focusHours.value} />
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

        {/* Shut, unlike on the old Insights tab. `StateOverview` above prints
            the weakest measure and the strongest improvement already, and
            these two panels are the long form of exactly that pair — open,
            they were the same answer twice on one screen. */}
        {insightsReady && (
          <PanelGroup title="What is true now" note="Where the account stands, and what is working">
            {/* Which of the pair leads. `CurrentStatePanel` prints the single
                weakest thing, named plainly; `WorkingPanel` prints what
                improved. That is the comparison `leadWithStrength` governs
                everywhere else on the page: gentle states the strongest first
                and the weakest second, blunt does the reverse. Both are drawn
                either way and neither's content changes; this is the order,
                which is the only thing tone is ever allowed to move. */}
            <div className="ax-grid ax-grid-halves-even">
              {toneRules.leadWithStrength ? (
                <>
                  <WorkingPanel wins={wins} />
                  <CurrentStatePanel state={state} span={spanText} />
                </>
              ) : (
                <>
                  <CurrentStatePanel state={state} span={spanText} />
                  <WorkingPanel wins={wins} />
                </>
              )}
            </div>
            {/* The one panel here that names individual tasks. Every other
                finding is an aggregate, and an aggregate cannot answer the
                question a reader has straight after reading one — which tasks
                were those. */}
            <div className="ax-grid ax-grid-halves-even ax-compact">
              <RatedTasksPanel rated={rated} summary={qualitySummary} />
              {/* Evidence rather than diagnosis, so this one follows the detail
                  setting alone. */}
              <InsightsPanel insights={insights.slice(0, detail.rows)} />
            </div>
          </PanelGroup>
        )}

        {insightsReady && (
          <PanelGroup title="Why it happens" note="Conditions, correlations and causes">
            {/* The one panel that answers "why am I improving" with a
                condition rather than a correlation, and what a reader opening
                this tab is actually looking for. It reads its own month-long
                window rather than the picker — see "The recent window".

                Its sibling is `PatternsPanel`, under "Your habits": that one
                says what recurs, this one says what the recurring is worth.
                Behaviour there, consequence here. */}
            <DiscoveredPatterns items={discovered.slice(0, findings)} window={PATTERN_DAYS} />
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

            {/* Why a *goal* looks like this, in the group about why anything
                does. A limiter is a cause, and the panels beside it are the
                other causes this tab found; the difference is only that this
                one is attached to something the reader chose, which makes it
                the finding they are most likely to act on.

                The old Habits tab printed the first of these as a bare line,
                a screen above here, because a card about goals would have made
                a tab about behaviour into a tab about goals. One tab later
                that is no longer a risk and the line was saying less than the
                card directly below it, so it is gone.

                No instruction here — that is the Recommendations tab. The card
                names what is true and opens the door; it does not say to walk
                through it. */}
            {goalLimits.length > 0 && (
              <div className="ax-limiters">
                {goalLimits.slice(0, findings).map((row) => (
                  <LimiterCard key={row.goalId} row={row} />
                ))}
              </div>
            )}
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
            note="How steady each habit is, when each began, and the whole account as a calendar"
          >
            <div className="ax-grid ax-grid-halves-even">
              <HabitConsistencyPanel habits={habits} />
              <TimelinePanel habits={habits} shifts={shifts} />
            </div>
            <div className="ax-hero">
              <HabitCalendarPanel byDate={byDate} lastIso={toIso} accountDays={all.length} />
            </div>
          </PanelGroup>
        )}

        {insightsReady && (
          <PanelGroup
            title="When and what you work on"
            note="The shape of the week, and where the effort goes"
          >
            {/* Tiles that describe how the work happens rather than how it is
                going, which is this group's subject and not the tab's opening
                question. */}
            <HeadlineTiles
              week={week}
              clock={clock}
              rhythm={rhythm}
              balance={balance}
              hours={figures.focusHours.value}
            />
            <div className="ax-grid ax-grid-halves-even">
              <ClockPanel clock={clock} />
              <WeekPanel week={week} />
            </div>
            {/* The web, its legend and the concentration reading in one panel
                across the full width — see `SubjectPanel`, which absorbed the
                half of the balance panel that was not already here. */}
            <div className="ax-hero">
              <SubjectPanel
                rows={breakdown.rows}
                previous={previousBySubject}
                balance={balance}
              />
            </div>
          </PanelGroup>
        )}

        {/* Three sections across two tabs, all of them about which subject is
            doing what: the per-subject figures and their tree branches, the
            ones that have gone quiet, and what the record says about the
            reader as a learner. The rhythm groups above are about whether you
            turn up; this is about what you turn up *to*. */}
        {(habitsReady || insightsReady) && (
          <PanelGroup
            title="Subjects, and what has been left alone"
            note="Where each subject stands, how long since each had work in it, and what that says"
          >
            {insightsReady && <SubjectInsights rows={focus} />}
            {habitsReady && <SkillColdPanel rows={skills} nameOf={nameOf} />}
            {insightsReady && <SkillFindingsPanel findings={skillNotes} />}
          </PanelGroup>
        )}

        {/* The growth page's Focus chapter. The groups above count what you
            repeat; this is whether you can execute it reliably — the planned-
            against-finished grid, the focus scores, the recovery after a miss.
            Same question one layer down, which is why it is the last thing
            opened rather than the last thing scrolled past. */}
        {habitsReady && (
          <PanelGroup
            title="Can you execute it reliably"
            note="Planned against finished, focus scores, and recovery after a miss"
          >
            <div className="gr-scope">
              <FocusChapter all={all} tasks={tasks} subjects={subjects} streak={streak} />
            </div>
          </PanelGroup>
        )}
      </section>

      {/* One line, not a panel. This tab is about what conditions the reader's
          better work shows up under, and "was it aimed at anything" is one such
          condition — but it is a single figure, and a titled card around a
          single figure is how a tab about behaviour becomes a tab about
          goals. */}
      {insightsReady && aimedShare && (
        <section className="ax-section">
          <p className="ax-goal-line">
            <strong>{Math.round(aimedShare.share * 100)}%</strong> of the{' '}
            {aimedShare.total} tasks you finished were aimed at a goal
            {aimedShare.share < 0.5 ? (
              <>
                {' '}— most of your work is not, which is worth knowing before you read the
                rest of this tab as being about progress.
              </>
            ) : (
              <>, so most of what you do is pointed somewhere.</>
            )}{' '}
            <Link to="/analytics/goals" className="ax-link">
              See the goals
            </Link>
          </p>
        </section>
      )}
    </>
  );
}
