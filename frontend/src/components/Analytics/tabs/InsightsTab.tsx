/**
 * Insights: what's going on, and why.
 *
 * What changed comes first, with the problems at the head of it, then why, then
 * the habits with the ones slipping first. Everything after that is folded.
 *
 * This was two tabs, Habits and Insights, and they were one argument: what you
 * repeat, and what it's worth. It has no gate of its own. Habits need 14 days to
 * say what repeats and the findings need 18 to compare two stretches, so between
 * the two it's a real page rather than a notice.
 *
 * Every finding here ends in what it suggests and what to try. Recommendations
 * is still where the day's plan lives; this tab says why.
 *
 * Panels that only restated another or named things worth no decision are gone
 * from here, though a space's page can still draw them: the quick reads past the
 * first weeks, patterns in what you do, your best and worst tasks, what moves
 * with what, and your steadiest habits.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FollowupPanel } from '@/components/Recommendations';
import { ChangedPanel, ClockPanel, HowPanel, WeekPanel, WhyPanel } from '@/components/Insights';
import { HabitCards, HabitOpening, HabitTiles, TimelinePanel } from '../Habits';
import { Building } from '../Building';
import { ObservationNote } from '../Observation';
import { ReasonsPanel } from '../Quality';
import { FinishPanel, WhenPanel } from '../Early';
import { FocusChapter } from '@/components/Growth/FocusChapter';
import { PanelGroup } from '../charts';
import { partsOfDay, type Habit } from '@/utils/habits';
import { unlock } from '@/utils/insight';
import { NEED_DAYS } from '../useAnalyticsModel';
import { SOLID_AT, whyFor } from '../milestones';
import { EarlyRead } from '../Upcoming';
import type { AnalyticsModel } from '../useAnalyticsModel';
import type { AnalyticsData } from '../useAnalyticsData';
import { SayVsDo, sayVsDoHasNews } from '../SayVsDo';
import { LowTimesPanel } from '../LowTimes';
import { FirstReads } from '../FirstReads';
import type { SubjectIndex } from '@/hooks/useSubjects';

/** Habit cards drawn before "Show all". They're the tallest thing on the tab. */
const CARDS_SHOWN = 4;

/** The ones in trouble first, and the rest in the order they came: strongest first. */
function slippingFirst(habits: Habit[]): Habit[] {
  return [...habits].sort(
    (a, b) => Number(b.strength === 'declining') - Number(a.strength === 'declining'),
  );
}

export function InsightsTab({
  model,
  data,
  subjects,
}: { model: AnalyticsModel; data?: AnalyticsData } & { subjects: SubjectIndex }) {
  const mood = data?.mood?.data ?? null;
  const said = data?.said?.data ?? null;
  const goalList = useMemo(() => data?.goals?.data?.goals ?? [], [data?.goals?.data]);
  const {
    all, changes, changeWindow, clock, effects, fromIso, habits, historyDays, how,
    maturity, observed, ratingDepth, reasonRows, reasons,
    shifts, slice, spanText, summary, tasks, toIso, waitFor, week, why,
    /* How much of the page is drawn, and how bluntly: see utils/analyticsPrefs.
       Neither moves a figure. */
    detail, toneRules,
    reviews, reviewSummary,
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
          credit={model.maturity.credit ?? 0}
          headStart={model.headStart}
          title="Insights"
          remaining={waitFor('habits')}
          need={NEED_DAYS.habits}
          have={historyDays}
          promise={whyFor(NEED_DAYS.habits)}
          spanDays={maturity.spanDays}
          asksLead="Once you've got more days in, Insights shows you:"
          asks={[
            'Which routines stuck?',
            'When do you work best?',
            'Which habits are slipping?',
            'Which hard tasks go well?',
            'What changed lately?',
          ]}
          emptyMessage="Nothing repeats often enough to be a habit yet."
          preview="habits"
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
            title="What's already true"
            note="Just the basics for now. More shows up after a few more days."
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

      {/* What changed, with the problems first. Capped the way every other
          finding list is, so a reader who asked for a short page gets a short one. */}
      {insightsReady && (
        <section className="ax-section">
          <EarlyRead days={historyDays} solidAt={SOLID_AT.insights} />
          <ChangedPanel changes={changes.slice(0, findings)} window={changeWindow} />
        </section>
      )}

      {/* The quick reads off tasks and goals are for a record too short to say
          more. Past that, the panels below say it with more behind them. */}
      {data && !insightsReady && (
        <section className="ax-section">
          <FirstReads tasks={tasks} goals={goalList} />
        </section>
      )}

      {/* Why, straight under what. It's the tab's whole claim, so it opens. */}
      {insightsReady && (
        <section className="ax-section">
          <PanelGroup title="Why it happens" note="What lines up with your best and worst work" defaultOpen>
            <div className="ax-grid ax-grid-halves-even">
              <WhyPanel
                findings={why.slice(0, findings)}
                notice={unlock(slice.current.length, NEED_DAYS.insights, 'why your last stretch went the way it did')}
              />
              <HowPanel
                findings={how.slice(0, findings)}
                notice={unlock(slice.current.length, NEED_DAYS.insights, 'how you tend to work')}
              />
            </div>
            {/* The only panel that answers *why* from what the reader said. It
                draws nothing unless the account has asked to be asked. */}
            <ReasonsPanel
              reasons={reasons}
              findings={reasonRows}
              depth={ratingDepth}
              span={spanText}
            />
          </PanelGroup>
        </section>
      )}

      {/* Whether the changes you made helped. Draws nothing until you've made one. */}
      {reviews.length > 0 && data && (
        <section className="ax-section">
          <FollowupPanel
            reviews={reviews.slice(0, detail.rows)}
            summary={reviewSummary}
            onDrop={data.dropAdopted}
            dropping={data.dropping}
          />
        </section>
      )}

      <section className="ax-section">
        {habitsReady && (
          <PanelGroup
            title="Your habits"
            note="Times per week, the ones slipping first"
            defaultOpen
          >
            <EarlyRead days={historyDays} solidAt={SOLID_AT.habits} />
            <HabitTiles summary={summary} span={spanText} />
            <div className="ax-grid ax-grid-halves-even">
              <HabitOpening
                summary={summary}
                span={spanText}
                leadWithStrength={toneRules.leadWithStrength}
              />
              <TimelinePanel habits={slippingFirst(habits)} shifts={shifts} />
            </div>
            <HabitCards
              habits={slippingFirst(habits)}
              limit={CARDS_SHOWN}
              todayIso={toIso}
              effects={effects}
            />
          </PanelGroup>
        )}

        {/* When energy and output dropped, with the date and time of each. Waits
            for no gate: one Drained tap is already worth keeping. */}
        {data && mood?.low_times && (
          <PanelGroup
            title="Low productivity and low energy"
            note="When your work or your energy dropped"
            defaultOpen={mood.low_times.energy.count + mood.low_times.output.count > 0}
          >
            <LowTimesPanel low={mood.low_times} windowDays={mood.window_days} />
          </PanelGroup>
        )}

        {/* What you say vs. what you do: the Log and your About you answers, held
            against the record (../SayVsDo). Every comparison inside waits for its
            own floor. Opens when it has something to say. */}
        {data && (
          <PanelGroup
            title="Say vs. do"
            note="Your mood and notes next to what got done"
            defaultOpen={sayVsDoHasNews(mood, said)}
          >
            <SayVsDo mood={mood} said={said} reloadSaid={() => data.said?.reload()} />
          </PanelGroup>
        )}

        {insightsReady && (
          <PanelGroup
            title="When you work"
            note="The hours and days you get things done"
          >
            <div className="ax-grid ax-grid-halves-even">
              <ClockPanel clock={clock} />
              <WeekPanel week={week} />
            </div>
          </PanelGroup>
        )}

        {/* The Focus chapter, less the calendar and the two habit panels this
            tab draws already. See `FocusPanel`. */}
        {habitsReady && (
          <PanelGroup
            title="Do you follow through?"
            note="Planned vs. done, and how fast you bounce back"
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
    </>
  );
}
