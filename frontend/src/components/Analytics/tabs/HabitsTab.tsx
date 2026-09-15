/**
 * Habits — what the reader repeats, counted.
 *
 * The one tab gated on two things rather than one: enough record *and* a habit
 * actually found in it. Both arms lead to the same `Building`, which says which
 * of the two it is waiting on.
 *
 * It never says *why*. The moment it does, the Insights tab has no reason to
 * exist.
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
import { PanelGroup } from '../charts';
import { FocusChapter } from '@/components/Growth';
import { NEED_DAYS } from '../useAnalyticsModel';
import type { AnalyticsModel } from '../useAnalyticsModel';
import type { SubjectIndex } from '@/hooks/useSubjects';

export function HabitsTab({ model, subjects }: { model: AnalyticsModel } & { subjects: SubjectIndex }) {
  const {
    all, figures, habits, historyDays, patterns, shifts, spanText, streak, summary, tasks, toIso, byDate, waitFor,
    /* How much of the page is drawn. This tab ignored the detail setting
       entirely: an account with thirty habits handed a reader thirty cards
       whether they had asked for essentials or for everything. */
    detail,
    /* What the account asked this page to be — see utils/analyticsPrefs. Two
       reads on this tab: which of the two habits the opening names first, and
       how many patterns are put in front of somebody at once. Neither moves a
       figure; `habitSummary` counts the same days at every setting. */
    toneRules,
  } = model;

  return (
    <>
      {(waitFor('habits') > 0 || habits.length === 0) && (
        <Building
          title="Habits"
          remaining={waitFor('habits')}
          need={NEED_DAYS.habits}
          have={historyDays}
          promise="A habit needs weeks of repetition before there is one to find."
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
              note="Every routine found in your record, and how each is holding"
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
