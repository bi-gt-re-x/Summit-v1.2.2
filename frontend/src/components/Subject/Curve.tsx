/**
 * Performance as a function of difficulty — the most useful chart on the page.
 *
 * ## Why this beats an average
 *
 * "Your execution is 74%" is one number over five very different populations.
 * It is the same figure for somebody who is uniformly middling and somebody
 * who is excellent through Fair and falls apart at Hard, and those two people
 * need opposite instructions: the first should raise their standard, the
 * second should stop reaching and drill the level below their ceiling.
 *
 * The curve tells them apart, and the threshold — the rung where execution
 * has fallen by `CLIFF` points from its best — is the single figure a
 * recommendation is actually about. It is marked on the chart rather than
 * left to be read off it, because a reader who has to find the cliff
 * themselves is a reader who will not.
 *
 * ## Bars rather than a line
 *
 * A line implies the space between the levels is continuous and that the
 * points are samples of it. They are not: there are exactly five levels, they
 * are ordinal, and each carries a different number of tasks. Bars with their
 * counts on them say what this actually is — five buckets of unequal size —
 * and a rung under the floor draws as an outline rather than as a short bar,
 * because "three tasks is not a finding" is different from "you scored low".
 */
import { RUNG_FLOOR, type DifficultyCurve } from './state';

export function Curve({ curve }: { curve: DifficultyCurve }) {
  const drawn = curve.rungs.filter((rung) => rung.done > 0);
  if (!drawn.length) return null;

  return (
    <div className="sx-curve">
      <div className="sx-curve-plot" role="img" aria-label={curveLabel(curve)}>
        {drawn.map((rung) => {
          const measured = rung.execution !== null;
          const isCliff = curve.threshold?.level === rung.level;
          /* The level that is holding, marked green — it is the one the
             sentence tells the reader to work, so it has to be findable on
             the chart. Falls back to the best-executed rung when nothing
             falls away. */
          const isBest = (curve.holds ?? curve.best)?.level === rung.level && !isCliff;
          return (
            <div
              key={rung.level}
              className={`sx-rung${measured ? '' : ' is-thin'}${
                isCliff ? ' is-cliff' : ''
              }${isBest ? ' is-best' : ''}`}
            >
              <span className="sx-rung-value">
                {measured ? `${rung.execution}%` : `${rung.done}`}
              </span>
              <span className="sx-rung-bar">
                <span style={{ height: `${measured ? rung.execution : 6}%` }} />
              </span>
              <span className="sx-rung-name">{rung.label}</span>
              <span className="sx-rung-count">
                {measured
                  ? `${rung.done} rated`
                  : `${rung.done} — under ${RUNG_FLOOR}`}
              </span>
            </div>
          );
        })}
      </div>

      <p className="sx-curve-read">
        {curve.threshold && curve.holds ? (
          <>
            Holds at <b>{curve.holds.execution}%</b> through <b>{curve.holds.label}</b>,
            drops <b>{curve.drop} points</b> to <b>{curve.threshold.execution}%</b> at{' '}
            <b>{curve.threshold.label}</b>. Work at <b>{curve.holds.label}</b> until it
            stops costing you.
          </>
        ) : curve.any && curve.best ? (
          <>
            Nothing falls away. Best at <b>{curve.best.label}</b> at{' '}
            <b>{curve.best.execution}%</b>, and it holds across the rest — room to go up
            a level.
          </>
        ) : (
          <>
            One rated level is not a curve. Rate a few more tasks and this fills in.
          </>
        )}
      </p>
    </div>
  );
}

/** The chart in a sentence, for a reader who cannot see it. */
function curveLabel(curve: DifficultyCurve): string {
  const parts = curve.rungs
    .filter((rung) => rung.execution !== null)
    .map((rung) => `${rung.label} ${rung.execution}%`);
  return parts.length
    ? `Execution by difficulty: ${parts.join(', ')}.`
    : 'Not enough rated work to draw a difficulty curve.';
}
