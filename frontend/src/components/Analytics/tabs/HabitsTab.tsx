/**
 * Habits — what the reader repeats, and what each repetition is worth.
 *
 * The one tab gated on two things rather than one: enough record *and* a habit
 * actually found in it. Both arms lead to the same `Building`, which says which
 * of the two it is waiting on.
 *
 * ## Behaviour, then consequence
 *
 * This tab used to stop at counting: how often, how finished, how long a run.
 * That is a diary, and a reader already knows what is in their own diary — so
 * every card now carries three more lines, which are the point of it. This week
 * against last week, the condition the habit goes best under, and what it is
 * associated with: "+14% on how the work goes". See utils/habitEffects for how
 * each is measured and what it refuses to claim.
 *
 * The rule this tab was written under was that it never says *why*, because the
 * moment it did the Insights tab had no reason to exist. That rule is narrower
 * now rather than gone: **this tab says what one behaviour of yours costs or
 * buys; Insights says what is true across the whole record.** A per-habit effect
 * has nowhere else it could live — putting it on Insights would mean repeating
 * every habit's name over there to hang it off.
 */
import { Link } from 'react-router-dom';
import {
  HabitCalendarPanel,
  HabitCards,
  ConsistencyPanel as HabitConsistencyPanel,
  HabitOpening,
  HabitTiles,
  PatternsPanel,
  TimelinePanel,
} from '../Habits';
import { Building } from '../Building';
import { LimiterLine } from '../Limiter';
import { FinishPanel, WhenPanel } from '../Early';
import { partsOfDay } from '@/utils/habits';
import { PanelGroup } from '../charts';
import { FocusChapter } from '@/components/Growth';
import { NEED_DAYS } from '../useAnalyticsModel';
import { whyFor } from '../milestones';
import { SkillColdPanel } from '../SkillView';
import type { AnalyticsModel } from '../useAnalyticsModel';
import type { SubjectIndex } from '@/hooks/useSubjects';

export function HabitsTab({ model, subjects }: { model: AnalyticsModel } & { subjects: SubjectIndex }) {
  const {
    all, effects, figures, fromIso, goalLimits, habits, historyDays, maturity, patterns, shifts, spanText, streak, summary, tasks, toIso, byDate, waitFor,
    /* How much of the page is drawn. This tab ignored the detail setting
       entirely: an account with thirty habits handed a reader thirty cards
       whether they had asked for essentials or for everything. */
    detail,
    /* What the account asked this page to be — see utils/analyticsPrefs. Two
       reads on this tab: which of the two habits the opening names first, and
       how many patterns are put in front of somebody at once. Neither moves a
       figure; `habitSummary` counts the same days at every setting. */
    toneRules,
    /* Which subjects have gone quiet. A habits tab that only counts days
       worked cannot say *what* was dropped, and dropping a subject is the
       habit failure that costs a skill score. */
    skills, nameOf,
  } = model;

  return (
    <>
      {(waitFor('habits') > 0 || habits.length === 0) && (
        <Building
          title="Habits"
          remaining={waitFor('habits')}
          need={NEED_DAYS.habits}
          have={historyDays}
          promise={whyFor(NEED_DAYS.habits)}
          spanDays={maturity.spanDays}
          asksLead="Summit will look for what repeats in your work:"
          asks={[
            'Which routines have actually stuck?',
            'Which days can you count on yourself?',
            'Is a habit holding, or quietly slipping?',
            'When did each one start?',
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
          cannot.

          Habits are what *repeats*, and four days cannot say what repeats —
          which is why the tab is gated and why nothing below claims a
          tendency. But the raw material of a habit is a count of when work
          landed and what got finished, and those are exact from the first
          task. A tab that shows nothing at all until day twenty-one is a tab
          that teaches a reader not to open it.

          The same two panels the Overview shows at its early stages, for the
          same reason and from the same constructors — see Early. */}
      {waitFor('habits') > 0 && (
        <section className="ax-section">
          <PanelGroup
            title="What is already true"
            note="Just the counts for now. Habits appear once you have more history."
            defaultOpen
          >
            <div className="ax-grid ax-grid-halves-even">
              <WhenPanel parts={partsOfDay(tasks, fromIso, toIso)} days={maturity.activeDays} />
              <FinishPanel tasks={tasks} days={maturity.activeDays} />
            </div>
          </PanelGroup>
        </section>
      )}

      {waitFor('habits') === 0 && habits.length > 0 && (
        <>
          <section className="ax-section">
            <HabitTiles summary={summary} span={spanText} hours={figures.focusHours.value} />
          </section>
          <section className="ax-section ax-grid ax-grid-halves-even">
            <HabitOpening
              summary={summary}
              span={spanText}
              leadWithStrength={toneRules.leadWithStrength}
            />
            <PatternsPanel patterns={patterns} limit={toneRules.diagnoses} />
          </section>
          {/*
            The habits themselves, and then three layers of detail under them.

            The tab used to run all four of these out flat, the last of them an
            entire chapter of the old growth page. A reader who wanted the
            answer to "what do I repeat" — which the tiles and the opening
            above have already given — scrolled past a card per habit, a
            year-long calendar, two charts and a planned-against-finished grid
            to reach the end of it.

            `Your habits` opens by default and the three below it do not. It is
            the one that names the thing the tab is about; the rest answer a
            question a reader has only once they have read it. The two that
            carried an `ax-band` heading keep the same words as their group
            title, so nothing a reader was scanning for has changed its name.
          */}
          <section className="ax-section">
            <PanelGroup
              title="Your habits"
              note="What each one is worth, not just how often it happens"
              defaultOpen
            >
              {/* `habits` is already ordered strongest-first by `buildHabits`,
                  so a cap takes the tail rather than an arbitrary slice. Four
                  is the floor: a tab called Habits that draws three cards on
                  an account with twenty is a shorter page, but one that draws
                  one is a broken one. */}
              <HabitCards
                habits={habits.slice(0, Math.max(4, detail.rows))}
                todayIso={toIso}
                effects={effects}
              />
            </PanelGroup>

            <PanelGroup
              title="Every day you worked"
              note="The whole account as a calendar"
            >
              <div className="ax-hero">
                <HabitCalendarPanel byDate={byDate} lastIso={toIso} accountDays={all.length} />
              </div>
            </PanelGroup>

            <PanelGroup
              title="Holding or slipping"
              note="How steady each habit is, and when each began"
            >
              <div className="ax-grid ax-grid-halves-even">
                <HabitConsistencyPanel habits={habits} />
                <TimelinePanel habits={habits} shifts={shifts} />
              </div>
            </PanelGroup>

            {/* The growth page's Focus chapter. Habits counts what you repeat;
                this is whether you can execute it reliably — the planned-
                against-finished grid, the focus scores, the recovery after a
                miss. Same question one layer down, which is why it belongs on
                this tab rather than on a page nobody navigated to — and why it
                is the last thing opened rather than the last thing scrolled
                past. */}
            {/* What all this repeating is in aid of, once.

                Habits counts what recurs; it never says why, and this does not
                start. What it does is name the one subject a goal's shortfall
                is concentrated in — which is the difference between a reader
                leaving this tab knowing they are consistent and leaving it
                knowing what to be consistent *at*. One line and one link, for
                the reason `LimiterLine` gives: a card about goals on this tab
                would make it a tab about goals. */}
            {goalLimits[0] && (
              <section className="ax-section">
                <LimiterLine row={goalLimits[0]} />
              </section>
            )}

            {/* Between the two chapters: the rhythm above is about whether
                you turn up, and this is about what you turn up *to*. */}
            <PanelGroup
              title="What has been left alone"
              note="Subjects you have scored, and how long since each had work in it"
            >
              <SkillColdPanel rows={skills} nameOf={nameOf} />
            </PanelGroup>

            <PanelGroup
              title="Can you execute it reliably"
              note="Planned against finished, focus scores, and recovery after a miss"
            >
              <div className="gr-scope">
                <FocusChapter all={all} tasks={tasks} subjects={subjects} streak={streak} />
              </div>
            </PanelGroup>
          </section>
        </>
      )}
    </>
  );
}
