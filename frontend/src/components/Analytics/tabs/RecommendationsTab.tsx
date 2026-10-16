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
import { NextSessionsPanel } from '@/components/NextSessions/NextSessions';
import { FollowupPanel } from '@/components/Recommendations';
import { DiagnosisCards, DiagnosisEmpty } from '../Diagnosis';
import { NextActions } from '../NextActions';
import { XpPulse } from '../XpPulse';
import { LensCard } from '../Lens';
import { Knows, useKnows } from '../Knows';
import type { AnalyticsData } from '../useAnalyticsData';
import type { AnalyticsModel } from '../useAnalyticsModel';

export function RecommendationsTab({ model, data }: { model: AnalyticsModel } & { data: AnalyticsData }) {
  const {
    all, lens, plan, recent, reviewSummary, reviews, setBudget, setNudge, slice, shownDiagnoses,
    /* The three inputs this tab was not reading. `rhythm` carries the reader's
       typical sitting, drawn from their logged focus time; `reasons` is what
       they type after a task; `detail` is how much supporting evidence they
       asked to be shown. None of the three changes what the plan suggests. */
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

  /* `shownDiagnoses` is capped in the model by the harshness setting, because
     the export writes the uncapped set and both have to come off one
     decision. See utils/analyticsPrefs. */
  const diagnoses = shownDiagnoses ?? [];
  const { dropAdopted, dropping, refresh } = data;
  const knows = useKnows(model);

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

      {/* The "Changes Worth Making" cards were here: each change ranked by the
          XP it would add over a year. Cut, because a yearly XP figure is not
          something a student is trying to learn, and the cards contradicted
          other tabs ("0% rated" against 88% on Overview). The plan above says
          what to do next. */}

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

      {/* "Five years, both ways", the XP projection, was here. Cut: a
          five-year XP forecast changes nothing about this week. */}

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
