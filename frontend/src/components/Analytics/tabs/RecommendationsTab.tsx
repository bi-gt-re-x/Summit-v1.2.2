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
import { AdviceCard, CategoryFilter, FollowupPanel, OutlookPanel } from '@/components/Recommendations';
import { DiagnosisCards, DiagnosisEmpty } from '../Diagnosis';
import { NextActions } from '../NextActions';
import { PanelGroup } from '../charts';
import { LimiterCard } from '../Limiter';
import { LensCard } from '../Lens';
import { Building } from '../Building';
import { SETTLE } from '@/utils/followup';
import { NEED_DAYS } from '../useAnalyticsModel';
import { whyFor } from '../milestones';
import type { AnalyticsData } from '../useAnalyticsData';
import { SkillLimitPanel } from '../SkillView';
import type { AnalyticsModel } from '../useAnalyticsModel';

export function RecommendationsTab({ model, data }: { model: AnalyticsModel } & { data: AnalyticsData }) {
  const {
    adoptedIds, advice, category, goalAdvice, goalLimits, historyDays, lens, maturity, observed, plan, projection, recent, reviewSummary,
    reviews, setBudget, setCategory, setNudge, shown, shownDiagnoses, toneRules, waitFor, weekLeft,
    /* The three inputs this tab was not reading. `rhythm` carries the reader's
       typical sitting, drawn from their logged focus time; `reasons` is what
       they type after a task; `detail` is how much supporting evidence they
       asked to be shown. None of the three changes which recommendations exist
       or how they are ranked — see the note on `headlines` below, which is the
       same rule. */
    detail, reasons, rhythm,
    /* The skill model's weakest part per subject. The one place in the app
       allowed to turn a skill figure into something to do — see the note at
       the top of utils/skillFindings. */
    skills, nameOf,
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

  return (
    <>
      {/* Above the plan, because it is the reason the plan is in this order.
          A reader who meets the ranking first and the explanation second has
          already decided the ranking is arbitrary. */}
      {lens && (
        <section className="ax-section">
          <LensCard lens={lens} />
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

      {/* What is capping each subject, between the plan and the diagnosis.
          The plan above is about the next week's tasks; this is about the one
          of six parts that is holding a skill down, which is a slower thing to
          act on and belongs beside the reasons rather than beside the chores. */}
      <section className="ax-section">
        <SkillLimitPanel rows={skills} nameOf={nameOf} limit={headlines} />
      </section>

      {/* Then the diagnosis: what the fortnight means, before what to change
          about it. A reader who understands why the numbers are moving reads
          the recommendations below as reasons rather than as chores. */}
      <section className="ax-section">
        {diagnoses.length > 0 ? (
          <DiagnosisCards items={diagnoses} />
        ) : (
          <DiagnosisEmpty enoughRecord={recent.previous.length >= 7} reported={reported} />
        )}
      </section>

      {/* Why each goal is or is not moving, before what to do about it.

          This sits above the goals' own advice rather than inside it, and the
          two are different kinds of sentence. `goalAdvice` is an instruction
          drawn from a goal's pace and its silences; a limiter names the
          *subject* carrying the shortfall, which is the one reading on this
          page a reader can act on without first deciding where to start. So it
          ends in a way in rather than in a link back to the goals page.

          Capped by the tone setting, same as the cards below: this is a
          diagnosis and how many of those a reader meets at once is exactly
          what that setting is about. See utils/analyticsPrefs. */}
      {/* Both shut groups in one section, and that is a spacing fix rather
          than a tidy-up. This tab sets a `--space-8` gap between sections —
          right for panels of prose, and wrong for a shut group, which is two
          lines of text and a chevron. One per section put forty pixels above
          and below each of them, so two collapsed headers floated in a white
          field looking like a page that had failed to load its middle. Stacked
          inside one section they fall under `.ax-group + .ax-group`, which is
          the rhythm every other group stack in the app already uses. */}
      {(goalLimits.length > 0 || goalAdvice.length > 0) && (
        <section className="ax-section">
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

          {/* The goals' own advice, kept separate from the ranked list below
              rather than merged into it. `advice` is ranked by XP a year and
              these are not comparable to that — a goal drifting past its date
              is not worth "1,200 XP", it is worth the goal. Two rows at most:
              this is a pointer to the goals page, not a second copy of it. */}
          {goalAdvice.length > 0 && (
            <PanelGroup
              title="From your goals"
              note="Goals that need attention. Goals on track are not listed."
            >
              <ul className="ax-goal-advice">
                {goalAdvice.map((row) => (
                  <li key={row.id} className={`is-${row.tone}`}>
                    <strong>{row.title}</strong>
                    <span className="ax-muted">{row.because}</span>
                    <Link to="/goals" className="ax-link">
                      {row.goalTitle}
                    </Link>
                  </li>
                ))}
              </ul>
            </PanelGroup>
          )}
        </section>
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

      {(waitFor('recommendations') > 0 || advice.length === 0) && (
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
      )}

      {waitFor('recommendations') === 0 && advice.length > 0 && (
        <>
          {/* The projection alone, across the width. It used to share the row
              with an opening panel restating the same figures in prose, which
              left the chart — the thing the tab opens on — squeezed into half
              a screen beside a column of text saying what it already showed. */}
          <section className="ax-section">
            <OutlookPanel outlook={projection} />
          </section>
          {justAdopted && (
            <p className="ax-adopted" role="status">
              <strong>{justAdopted}</strong> is on your task list for tomorrow, and this tab will
              tell you in {SETTLE} days whether it moved. <Link to="/tasks">Open Tasks</Link>
            </p>
          )}
          <section className="ax-section">
            {/* What this tab is, said once above the cards.
                Each card names the finding behind it, but the cards are a grid
                of them and the shape they share — measured, then understood,
                then acted on, then measured again — is only visible from
                above. Without it a reader has a list of tips; with it they
                have the output of the rest of the page. */}
            <p className="ax-loop">
              <span className="ax-loop-step">You work</span>
              <span className="ax-loop-step">Summit measures</span>
              <span className="ax-loop-step is-here">It notices something</span>
              <span className="ax-loop-step is-here">You get a change to try</span>
              <span className="ax-loop-back">and the next reading says whether it worked</span>
            </p>
            <CategoryFilter items={advice} chosen={category} onChoose={setCategory} />
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
          </section>
        </>
      )}
    </>
  );
}
