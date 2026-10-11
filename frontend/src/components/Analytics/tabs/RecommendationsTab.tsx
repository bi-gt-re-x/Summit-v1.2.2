/**
 * Recommendations — what to change, ranked by what each is worth.
 *
 * The tab that leads the bar, and the only one that ends in a button.
 *
 * Two things here are deliberately outside the gate below. The plan is gated on
 * nothing: an account three days old still has overdue work and a goal with a
 * deadline, and those are the days when being told what to do is worth most.
 * And the follow-up sits above the gate because "is there anything to suggest"
 * and "is there anything to report on" are different questions — an account
 * that adopted three changes and then went quiet has nothing to recommend and
 * three results waiting, and hiding those behind the same gate would lose the
 * one thing this tab promised to come back and tell you.
 */
import { Link } from 'react-router-dom';
import { NextSessionsPanel } from '@/components/NextSessions/NextSessions';
import { AdviceCard, CategoryFilter, FollowupPanel, OutlookPanel } from '@/components/Recommendations';
import { DiagnosisCards, DiagnosisEmpty } from '../Diagnosis';
import { NextActions } from '../NextActions';
import { Panel, PanelGroup } from '../charts';
import { XpPulse } from '../XpPulse';
import { LimiterCard } from '../Limiter';
import { LensCard } from '../Lens';
import { Knows, useKnows } from '../Knows';
import { Building } from '../Building';
import { SETTLE } from '@/utils/followup';
import { NEED_DAYS } from '../useAnalyticsModel';
import { whyFor } from '../milestones';
import type { AnalyticsData } from '../useAnalyticsData';
import type { AnalyticsModel } from '../useAnalyticsModel';

export function RecommendationsTab({ model, data }: { model: AnalyticsModel } & { data: AnalyticsData }) {
  const {
    adoptedIds, advice, all, category, goalAdvice, goalLimits, historyDays, lens, maturity, observed, plan, projection, recent, reviewSummary,
    reviews, setBudget, setCategory, setNudge, shown, slice, shownDiagnoses, toneRules, waitFor, weekLeft,
    /* The three inputs this tab was not reading. `rhythm` carries the reader's
       typical sitting, drawn from their logged focus time; `reasons` is what
       they type after a task; `detail` is how much supporting evidence they
       asked to be shown. None of the three changes which recommendations exist
       or how they are ranked — see the note on `headlines` below, which is the
       same rule. */
    detail, reasons, rhythm,
  } = model;

  /**
   * The obstacle reported most often, for the diagnosis panel's empty state.
   *
   * `summariseReasons` orders both sides by count, so the head of the struggle
   * list is the most reported. Nothing is claimed from it beyond the count —
   * see `DiagnosisEmpty`.
   */
  const reported = reasons.struggle[0]
    ? { phrase: reasons.struggle[0].phrase, count: reasons.struggle[0].count }
    : null;

  /*
   * How many problems this tab puts in front of the reader at once.
   *
   * Both numbers come from the harshness setting rather than from a constant
   * here — two cards and two tensions on gentle, five and eight on blunt. What
   * does *not* change is which recommendations exist or how they are ranked:
   * every rule the record supports still fires, and the list under the cards
   * is the same list. This is how much of it leads the tab.
   *
   * `shownDiagnoses` is capped in the model rather than here, because the
   * export writes the uncapped set and both have to come off one decision.
   * See utils/analyticsPrefs.
   */
  const headlines = toneRules?.headlines ?? 3;
  const diagnoses = shownDiagnoses ?? [];
  const { adopt, adopting, dropAdopted, dropping, justAdopted, refresh } = data;
  const knows = useKnows(model);

  const ready = waitFor('recommendations') === 0 && advice.length > 0;

  /* The goals' own rows: why each is moving the way it is, and the goals that
     need attention. With the changes on screen they sit under the cards in the
     same panel; while the changes are still building they keep a panel of
     their own. */
  const goalRows = (goalLimits.length > 0 || goalAdvice.length > 0) && (
    <>
      {goalLimits.length > 0 && (
        <PanelGroup
          title="Why your goals are moving the way they are"
          note="The subject holding each goal back the most."
        >
          <div className="ax-limiters">
            {goalLimits.slice(0, headlines).map((row) => (
              <LimiterCard key={row.goalId} row={row} />
            ))}
          </div>
        </PanelGroup>
      )}

      {/* The goals' own advice, kept separate from the ranked cards rather
          than merged into them. `advice` is ranked by XP a year and these are
          not comparable to that — a goal drifting past its date is not worth
          "1,200 XP", it is worth the goal. */}
      {goalAdvice.length > 0 && (
        <PanelGroup
          title="From your goals"
          note="Goals that need attention. Goals on track are not listed."
        >
          <ul className="ax-goal-advice">
            {goalAdvice.map((row) => (
              <li key={`${row.goalId}:${row.id}`} className={`is-${row.tone}`}>
                {/* The goal first, so two goals stalled for the same reason
                    don't open with the same two lines. */}
                <Link to="/goals" className="ax-goal-advice-goal">
                  {row.goalTitle}
                </Link>
                <strong>{row.title}</strong>
                <span className="ax-muted">{row.because}</span>
              </li>
            ))}
          </ul>
        </PanelGroup>
      )}
    </>
  );

  return (
    <>
      {/* Above the plan, because it is the reason the plan is in this order.
          A reader who meets the ranking first and the explanation second has
          already decided the ranking is arbitrary. The XP card beside it is
          the figure the lens is about. */}
      {(lens || all.length > 0) && (
        <section className="ax-section">
          <div className={`ax-panel ax-rec-top${lens ? '' : ' is-solo'}`}>
            {lens && <LensCard lens={lens} />}
            <XpPulse all={all} current={slice.current} />
          </div>
        </section>
      )}

      <section className="ax-section">
        <NextActions
          plan={plan}
          onBudget={setBudget}
          weekLeft={weekLeft}
          typicalSession={rhythm.typicalSession}
          /* Both halves: `refresh` re-reads the account so a task finished
             elsewhere leaves the plan, and the nudge re-asks the clock so
             what counts as overdue is worked out again. */
          onRefresh={() => {
            refresh();
            setNudge((at) => at + 1);
          }}
        />
      </section>

      {/* Then the diagnosis: what the two weeks means, before what to change
          about it. A reader who understands why the numbers are moving reads
          the recommendations below as reasons rather than as chores. */}
      <section className="ax-section">
        {diagnoses.length > 0 ? (
          <DiagnosisCards items={diagnoses} />
        ) : (
          <DiagnosisEmpty enoughRecord={recent.previous.length >= 7} reported={reported} />
        )}
      </section>

      {/* The ranked changes, and the goals that need attention, in one panel.
          The opening line's chevron lands here. */}
      {ready ? (
        <section className="ax-section" id="ax-changes">
          <Panel
            title="Your goals"
            note="The changes worth making, best first, and the goals that need attention. Goals on track are not listed."
            className="ax-changes"
            aside={<CategoryFilter items={advice} chosen={category} onChoose={setCategory} />}
          >
            {justAdopted && (
              <p className="ax-adopted" role="status">
                <strong>{justAdopted}</strong> is on your task list for tomorrow, and this tab will
                tell you in {SETTLE} days whether it moved. <Link to="/tasks">Open Tasks</Link>
              </p>
            )}
            {shown.length > 0 && (
              <div className="ax-grid ax-grid-three">
                {shown.slice(0, headlines).map((item, index) => (
                  <AdviceCard
                    key={item.id}
                    item={item}
                    rank={index + 1}
                    onAdopt={adopt}
                    adopting={adopting}
                    adopted={adoptedIds.has(item.id)}
                  />
                ))}
              </div>
            )}
            {goalRows && <div className="ax-goal-groups">{goalRows}</div>}
          </Panel>
        </section>
      ) : (
        <>
          {goalRows && (
            <section className="ax-section">
              <div className="ax-panel ax-goal-groups">{goalRows}</div>
            </section>
          )}
          <Building
            title="Recommendations"
            remaining={waitFor('recommendations')}
            need={NEED_DAYS.recommendations}
            have={historyDays}
            promise={whyFor(NEED_DAYS.recommendations)}
            observation={observed[0] ?? null}
            spanDays={maturity.spanDays}
            asksLead="Summit will work out what to change, and what it is worth:"
            asks={[
              'Which single change would buy you the most?',
              'What is that worth, in your own figures?',
              'How hard would it actually be?',
              'Did the last change you made work?',
            ]}
            emptyMessage="No long gaps, no dead weekend, no late shift worth moving. Nothing to fix."
            action={
              <Link to="/analytics" className="ax-btn">
                See totals
              </Link>
            }
          />
        </>
      )}

      <section className="ax-section">
        {/* What happened to changes already adopted is evidence, not diagnosis,
            so the list follows the detail setting rather than the tone one. It
            is ordered by the model. */}
        <FollowupPanel
          reviews={reviews.slice(0, detail.rows)}
          summary={reviewSummary}
          onDrop={dropAdopted}
          dropping={dropping}
        />
      </section>

      {ready && (
        <section className="ax-section">
          <OutlookPanel outlook={projection} />
        </section>
      )}

      {/* Three exact sessions to plan, for every subject or one picked, where
          the cards above are changes to habits. Drawn whether or not there is
          advice yet — it is read from finished work, not from the weeks of
          history the cards wait for. See components/NextSessions. */}
      <section className="ax-section">
        <NextSessionsPanel where="analytics" />
      </section>

      {/* Your coach's read: what Summit makes of the reader, each fact ending
          in something to do. Each fact carries its own floor, so this is empty
          on a brand new account. */}
      <section className="ax-section">
        <Knows facts={knows} />
      </section>
    </>
  );
}
