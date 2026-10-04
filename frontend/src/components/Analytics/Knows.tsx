/**
 * The section that makes the page a model of somebody rather than a set of charts.
 *
 * Everything else here reads a *period*. This reads the reader — see the note
 * at the top of utils/knows for why that distinction is the whole point, for
 * the floor under each fact, and for why each one now ends in something to do.
 *
 * Deliberately plain. No tiles, no sparklines, no deltas: these are sentences,
 * and dressing a sentence as a metric is how it stops being read as one. The
 * heading above each is a label rather than a measure name, so the block scans
 * as a short profile instead of a fifth row of statistics.
 *
 * ## The fact is set under the advice, not over it
 *
 * The figure used to be the whole entry, in body ink, and it read as four more
 * numbers on a page that already had ninety. It is still here — advice with no
 * evidence under it is a horoscope — but it is set small and muted beneath the
 * instruction it produced, so the eye takes the instruction first and the
 * number only when it wants to check the working. Same two sentences either
 * way round; the order is what decides whether the block coaches or recites.
 */
import { useMemo } from 'react';
import { whatSummitKnows, type Knowledge } from '@/utils/knows';
import { OTHER_KEY } from '@/utils/subjectXp';
import type { AnalyticsModel } from './useAnalyticsModel';

/**
 * The facts, worked out from the model. Lives here rather than in a tab
 * because the block moved from the Overview to Recommendations — every fact
 * ends in something to do, and doing is that tab's job.
 */
export function useKnows(model: AnalyticsModel): Knowledge[] {
  const { breakdown, maturity, nameOf, tasks, toIso } = model;
  return useMemo(() => {
    /* The recent leader, for the "current focus" line. Fourteen days rather
       than the picker's window, because the point of the line is that it can
       disagree with the all-time answer beside it — reading both off the same
       range would make that impossible by construction. */
    const cutoff = new Date(Date.parse(`${toIso}T00:00:00`) - 13 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const lately = new Map<string, number>();
    tasks.forEach((task) => {
      if (task.status !== 'done' || !task.subject) return;
      const day = (task.completed_at || '').slice(0, 10);
      if (!day || day < cutoff || day > toIso) return;
      lately.set(task.subject, (lately.get(task.subject) ?? 0) + 1);
    });
    let recentTop: string | null = null;
    let most = 0;
    lately.forEach((count, id) => {
      if (count > most) {
        most = count;
        recentTop = nameOf(id);
      }
    });

    return whatSummitKnows({
      finished: tasks.filter((task) => task.status === 'done').length,
      activeDays: maturity.activeDays,
      spanDays: maturity.spanDays,
      subjects: breakdown.rows.map((row) => ({
        name: row.name ?? row.label,
        count: row.count,
        /* The tail bucket. It belongs in the total and cannot be the leader —
           see `lumped` in utils/knows. */
        lumped: row.key === OTHER_KEY,
      })),
      recentTop,
    });
  }, [breakdown.rows, maturity.activeDays, maturity.spanDays, nameOf, tasks, toIso]);
}

export function Knows({ facts }: { facts: Knowledge[] }) {
  if (facts.length === 0) return null;

  return (
    <section className="ax-knows" aria-label="What Summit makes of your record">
      <p className="ax-knows-head">Your coach's read</p>
      <dl>
        {facts.map((fact) => (
          <div key={fact.key}>
            <dt>{fact.heading}</dt>
            <dd>
              <span className="ax-knows-do">{fact.advice}</span>
              <span className="ax-knows-fact">{fact.text}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
