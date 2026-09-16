/**
 * Insights — why the record looks like this, with the evidence.
 *
 * Fifteen panels, in three named groups, and the grouping is the point: the tab
 * answers three questions — what is true now, why it is true, and when and on
 * what you work — and a reader scrolling eight rows of equal weight had to work
 * out for themselves which one each panel was answering.
 *
 * It never says what to do. That is the Recommendations tab.
 */
import { Link } from 'react-router-dom';
import {
  ClockPanel,
  CurrentStatePanel,
  HeadlineTiles,
  HowPanel,
  RelationshipsPanel,
  WeekPanel,
  WhyPanel,
  WorkingPanel,
} from '@/components/Insights';
import { Patterns as DiscoveredPatterns } from '../Patterns';
import { Building } from '../Building';
import { RatedTasksPanel, ReasonsPanel } from '../Quality';
import { SubjectPanel } from '../Breakdown';
import { InsightsPanel } from '../Longterm';
import { PanelGroup } from '../charts';
import { unlock } from '@/utils/insight';
import { PATTERN_DAYS } from '@/utils/recent';
import { NEED_DAYS } from '../useAnalyticsModel';
import { whyFor } from '../milestones';
import type { AnalyticsModel } from '../useAnalyticsModel';

export function InsightsTab({ model }: { model: AnalyticsModel }) {
  const {
    aimedShare, balance, breakdown, clock, discovered, figures, historyDays, how, insights, links, previousBySubject,
    qualitySummary, rated, ratingDepth, reasonRows, reasons, rhythm, slice, spanText, state, waitFor, week,
    wins, why,
    /* What the account asked this page to be — see utils/analyticsPrefs. This
       tab read neither of these until now, which is how a reader who had asked
       for essentials and a gentle page got fifteen findings led by their
       weakest measure. Neither moves a figure: `why` and `how` are computed in
       full and ranked the same way at every setting. */
    detail, toneRules,
  } = model;

  /*
   * How many findings a panel prints, and which of the opening pair leads.
   *
   * `diagnoses` is the tone's cap — two on gentle, eight on blunt — and it is
   * the right one here for the same reason it is right on Habits: a "finding"
   * on this tab is a thing that is wrong or notable about the record, which is
   * exactly what that number is about being shown at once. `rows` is the
   * detail setting, and caps the supporting lists that are evidence rather
   * than diagnosis. Whichever is smaller wins — asking for a short page and a
   * blunt one should get a short blunt page, not the larger of the two.
   */
  const findings = Math.min(toneRules.diagnoses, detail.rows);

  return (
    <>
      {waitFor('insights') > 0 && (
        <Building
          title="Insights"
          remaining={waitFor('insights')}
          need={NEED_DAYS.insights}
          have={historyDays}
          promise={whyFor(NEED_DAYS.insights)}
          asksLead="Summit will look for relationships across your work:"
          asks={[
            'When do you perform best?',
            'Which subjects are improving fastest?',
            'Where does perceived difficulty differ from execution?',
            'What changed between your last two stretches?',
          ]}
          action={
            <Link to="/habits" className="ax-btn">
              See habits
            </Link>
          }
        />
      )}

      {waitFor('insights') === 0 && (
        <>
          <section className="ax-section">
            <HeadlineTiles
              week={week}
              clock={clock}
              rhythm={rhythm}
              balance={balance}
              hours={figures.focusHours.value}
            />
          </section>

          {/* Three groups, and the grouping is the point.

              This tab carried fifteen panels in eight rows of equal weight,
              and a reader scrolling it had to work out for themselves which
              of the tab's three questions each one was answering. It answers
              three: what is true now, why it is true, and when and on what
              you work. So the three are named, and each panel lives in the
              one it belongs to. The first is open because a tab of three
              shut headings looks broken; the other two are a click, which is
              the whole of what "fifteen cards" cost. See `PanelGroup`. */}
          <section className="ax-section">
            <PanelGroup
              title="What is true now"
              note="Where the account stands, and what is working"
              defaultOpen
            >
              {/* Which of the pair leads.

                  `CurrentStatePanel` prints `state.weakness` — the single
                  weakest thing, named plainly — and `WorkingPanel` prints what
                  improved. That is exactly the comparison `leadWithStrength`
                  governs everywhere else on the page: gentle states the
                  strongest first and the weakest second, blunt does the
                  reverse. Both panels are drawn either way and neither's
                  content changes; this is the order, which is the only thing
                  tone is ever allowed to move. */}
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
              {/* The one panel on this tab that names individual tasks. Every
                  other finding here is an aggregate, and an aggregate cannot
                  answer the question a reader has straight after reading one
                  — which tasks were those. */}
              <div className="ax-grid ax-grid-halves-even ax-compact">
                <RatedTasksPanel rated={rated} summary={qualitySummary} />
                {/* Evidence rather than diagnosis, so this one follows the
                    detail setting alone. */}
                <InsightsPanel insights={insights.slice(0, detail.rows)} />
              </div>
            </PanelGroup>

            <PanelGroup title="Why it happens" note="Conditions, correlations and causes">
              {/* Patterns lead: this is the one panel on the tab that answers
                  "why am I improving" with a condition rather than a
                  correlation, and it is what a reader opening Insights is
                  actually looking for. It reads its own month-long window
                  rather than the picker — see "The recent window". */}
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
              {/* The tab's one hero: the only panel here that draws raw
                  observations rather than an aggregate over them. */}
              <div className="ax-hero">
                <RelationshipsPanel
                  relationships={links}
                  notice={unlock(slice.current.length, NEED_DAYS.insights, 'behavioural relationships')}
                />
              </div>
              {/* The only panel on the page that answers *why* from what the
                  reader said rather than from what they did, and the only one
                  that exists at one rating depth and not the others. It draws
                  nothing at all unless the account has asked to be asked. */}
              <ReasonsPanel
                reasons={reasons}
                findings={reasonRows}
                depth={ratingDepth}
                span={spanText}
              />
            </PanelGroup>

            <PanelGroup title="When and what you work on" note="The shape of the week, and where the effort goes">
              <div className="ax-grid ax-grid-halves-even">
                <ClockPanel clock={clock} />
                <WeekPanel week={week} />
              </div>
              {/* The web, its legend and the concentration reading in one
                  panel across the full width — see `SubjectPanel`, which
                  absorbed the half of the balance panel that was not already
                  here. */}
              <div className="ax-hero">
                <SubjectPanel
                  rows={breakdown.rows}
                  previous={previousBySubject}
                  balance={balance}
                />
              </div>
            </PanelGroup>
          </section>
        </>
      )}

      {/* The follow-up sits above the branch, not inside it, and this is the
          only panel on the page that does.

          The two arms below are about whether there is anything to *suggest*
          — a fortnight of record, and a rule that fired. Whether there is
          anything to *report on* is a different question with a different
          answer: an account that adopted three changes and then went quiet
          for a month has nothing to recommend and three results waiting, and
          hiding those behind the same gate would mean the one thing this tab
          promised to come back and tell you disappears exactly when it
          finally has something to say. */}
      {/* The plan comes first, above even the follow-ups, and it is the only
          panel on this page about the next hour rather than the last
          fortnight. It is gated on nothing: an account three days old still
          has overdue work and a goal with a deadline, and those are exactly
          the days when being told what to do is worth most. */}
      {/* One line, not a panel. The Insights tab is about what conditions
          the reader's better work shows up under, and "was it aimed at
          anything" is one such condition — but it is a single figure, and a
          titled card around a single figure is how a tab about behaviour
          becomes a tab about goals. */}
      {waitFor('insights') === 0 && aimedShare && (
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
