/**
 * Recommendations — what to change, ranked by what each is worth.
 *
 * The tab that leads the bar, and the only one that ends in a button.
 *
 * The plan is gated on nothing: an account three days old still has overdue
 * work and a goal with a deadline, and those are the days when being told what
 * to do is worth most. "What changed" and "What happened after" live on
 * Overview, under the productivity chart.
 */
import { NextSessionsPanel } from '@/components/NextSessions/NextSessions';
import { WhatToReviewPanel } from '@/components/NextSessions/WhatToReview';
import { SlumpAlert } from '../WeekTrend';
import { NextActions } from '../NextActions';
import { XpPulse } from '../XpPulse';
import { LensCard } from '../Lens';
import { Knows, useKnows } from '../Knows';
import type { AnalyticsData } from '../useAnalyticsData';
import type { AnalyticsModel } from '../useAnalyticsModel';

export function RecommendationsTab({ model, data }: { model: AnalyticsModel } & { data: AnalyticsData }) {
  const {
    all, lens, plan, setBudget, setNudge, slice, slump,
    /* `rhythm` carries the reader's typical sitting, drawn from their logged
       focus time. It changes nothing about what the plan suggests. */
    rhythm,
  } = model;

  const { refresh } = data;
  const knows = useKnows(model);

  return (
    <>
      {/* A slump outranks everything else on this tab. Same card as the top of
          Overview, so the advice reads the same in both places. */}
      {slump && slump.steps.length > 0 && (
        <section className="ax-section">
          <SlumpAlert slump={slump} />
        </section>
      )}

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

      {/* "What changed" (the diagnosis) and "What happened after" (the
          follow-up on adopted changes) are on Overview now, under the
          productivity chart, beside the week-by-week read they belong with. */}

      {/* "Five years, both ways", the XP projection, was here. Cut: a
          five-year XP forecast changes nothing about this week. */}

      {/* Three exact sessions to plan, for every subject or one picked, where
          the cards above are changes to habits. Drawn whether or not there is
          advice yet — it is read from finished work, not from the weeks of
          history the cards wait for. See components/NextSessions. */}
      {/* What to review, right above: the same kind of sessions, pointed at
          work already done so it sticks. See components/NextSessions/WhatToReview. */}
      <section className="ax-section">
        <WhatToReviewPanel />
      </section>

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
