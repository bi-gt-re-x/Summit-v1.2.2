/**
 * The short version of the whole page, at the top of the Overview.
 *
 * ## Why this replaced three things rather than joining them
 *
 * The Overview used to open with three summaries stacked: a one-line strip
 * saying what the score did, then a banner carrying the score, its letter, two
 * paragraphs of derivation and five labelled bars, then five stat tiles with
 * deltas and sparklines under them. Fifteen-odd figures and two paragraphs
 * before the reader reached anything that was not a summary — and a reader who
 * does not want to read everything was being asked to read three openings to
 * find out whether they wanted to read the fourth.
 *
 * So this is not a fourth. It is those three collapsed into one, and the two
 * that had the least claim on the top of the page gave up their slots: the
 * strip's sentence is row two here, and the banner is gone (see `scoreMovement`
 * in ./Header, and the note in ./index about what happened to the banner's
 * bars). `Tiles` stays exactly where it was — it is scanned rather than read,
 * which is a different job from this one.
 *
 * ## Five rows, and what makes them readable
 *
 * One sentence each, with the figure bolded **inside** the sentence rather than
 * broken out as a tile — a number in a box is a thing to look up, a number in a
 * sentence is a thing that has already been interpreted for you. No sparkline,
 * no bar, no delta chip anywhere in here; those belong to the row of tiles
 * below, which is built for exactly that and does it better.
 *
 * **A row with nothing honest to say is dropped, not filled.** No advice yet
 * means four rows, not a fifth reading "no recommendations". That is the page's
 * standing rule against invented figures, applied to prose — see the note at
 * the top of pages/Analytics.
 *
 * **Five is the cap, and there are six candidates.** Rows one to three
 * reorganise what the Overview already said; the rest are the point of the
 * thing, because "what to do", "how the goals are doing" and "why the record
 * looks like this" each live a tab away and a reader who wanted the short
 * version was never going to find them. They are pushed in the order they are
 * worth reading and cut at `MAX_ROWS`, so the softest one falls off rather
 * than the block growing — a seventh candidate would mean something here has
 * stopped earning its place.
 *
 * Every row links to the tab that proves it. The summary is deliberately not
 * arguable on its own: it states, and hands off to the panel that shows the
 * working.
 *
 * ## The derivation is still on the page
 *
 * The banner kept `howItIsCalculated` in open prose on the argument that a
 * grade with no stated derivation is a verdict, and a verdict from software
 * about somebody's study habits is worth very little. That argument is right
 * and the sentence is kept — one disclosure down, closed, in the footer. The
 * difference is that it is now a sentence the reader chooses, rather than the
 * second paragraph standing between them and the page.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { gradeClass } from './metrics';
import type { ScoreMovement } from './Header';
import {
  GRADE_BANDS,
  GRADE_MEANING,
  bandLabel,
  howItIsCalculated,
  type AnalyticalScore,
} from '@/utils/analyticalScore';
import { toneRules } from '@/utils/analyticsPrefs';
import type { AnalyticsTone } from '@/services/settings';

export interface SummaryProps {
  /** The score, its letter and its five parts. */
  score: AnalyticalScore;
  /** What the score did, or null when there is nothing honest to compare to. */
  movement: ScoreMovement | null;
  /** The highest-value recommendation's title, or null when there are none. */
  topAdvice: string | null;
  /** How many there are in total, for the row's hand-off. */
  adviceCount: number;
  /** The behavioural phase — "Building", "Dormant" — from `currentState`. */
  phase: string | null;
  /** Live goals and how many of them are behind, or null when there are none. */
  goals: { active: number; behind: number } | null;
  /**
   * How much record the score rests on, while that is still worth saying.
   *
   * Null once the account is past the point where the answer is "enough". The
   * score is the mean of five measures and it moves a long way on one good
   * week early on — which is a fact about the score, not a hedge, and belongs
   * beside it rather than in a tooltip. See utils/dataMaturity.
   */
  basis?: string | null;
  /**
   * How blunt the block is allowed to be about the five measures.
   *
   * It reorders one pair of rows, and that is now all it does. Everything
   * stated is stated at every setting — the score, the letter, the distance to
   * the next letter, the weakest measure and its figure — but a reader who
   * asked for a gentle page is told what is carrying the score before what is
   * holding it back. See utils/analyticsPrefs.
   *
   * It used to add a clause too: how far the weak measure was from the next
   * grade, on the blunt page only. That is in the lead sentence now and every
   * reader gets it, because a distance is arithmetic rather than a judgement
   * and the gentle page is the one that needed it most.
   */
  tone?: AnalyticsTone;
}

/**
 * How many points to the next letter up, or null at the top.
 *
 * Read off the same band table the letter itself comes from, so the clause and
 * the grade beside it cannot disagree about where a boundary is.
 */
function toNextGrade(value: number): { points: number; grade: string } | null {
  const above = [...GRADE_BANDS].reverse().find(([floor]) => floor > value);
  if (!above) return null;
  return { points: above[0] - value, grade: above[1] };
}

/** Five is the cap. See the note at the top for why, and `goals` for how. */
const MAX_ROWS = 5;

interface Row {
  key: string;
  text: ReactNode;
  /** The tab that shows the working. A hash is an anchor on this same tab. */
  href: string;
  label: string;
}

export function Summary({
  score,
  movement,
  topAdvice,
  adviceCount,
  phase,
  goals,
  basis = null,
  tone,
}: SummaryProps) {
  const { value, grade, weakest, strongest } = score;
  const { leadWithStrength } = toneRules(tone);

  /* No score is not a broken panel — it is a new account, and it deserves the
     same answer the banner gave it: what the score needs before it exists.
     Kept verbatim, because it was the one thing on the old banner that spoke
     to the reader who had least to go on. */
  if (value === null || grade === null) {
    return (
      <section className="ax-panel ax-summary is-empty">
        <p className="ax-empty">
          No score yet. It needs a few days of activity first.
        </p>
      </section>
    );
  }

  const rows: Row[] = [];

  if (movement) {
    rows.push({
      key: 'moved',
      text:
        movement.direction === 'held' ? (
          <>
            It has held at <strong>{movement.now}</strong> for <strong>{movement.days}</strong>{' '}
            days.
          </>
        ) : (
          <>
            That is <strong>{movement.direction}</strong> from {movement.previous}
            {/* A comma, because the two figures are otherwise adjacent — "up
                from 61 12 days ago" reads as one number twice. */}
            {movement.days === 1 ? ' yesterday' : <>, {movement.days} days ago</>}.
          </>
        ),
      // Trends was this row's destination and is gone. The score over time is
      // drawn by `ScorePanel` on this same tab, which is where the movement
      // this row states can actually be looked at.
      href: '#trajectory',
      label: 'See it over time',
    });
  }

  /* On a gentle page, what is working comes first. Only when there is a real
     gap between the two: five measures within a point of each other produce
     "focus is carrying it at 61, focus is holding it back at 61", which is the
     sentence pattern talking rather than the record. The same guard
     `howItIsCalculated` applies, and for the same reason. */
  const spread = strongest && weakest ? strongest.score - weakest.score : 0;
  if (leadWithStrength && strongest && weakest && strongest.name !== weakest.name && spread >= 5) {
    rows.push({
      key: 'strongest',
      text: (
        <>
          What is carrying it is <strong>{strongest.label.toLowerCase()}</strong>, at{' '}
          <strong>{Math.round(strongest.score)}</strong> out of 100 — {strongest.raw}.
        </>
      ),
      href: '#trajectory',
      label: 'See all five',
    });
  }

  if (weakest) {
    /* How far the letter is from the next one used to be a clause here, and
       only on the blunt page. It is in the lead sentence now, at every tone —
       see the note there. This row is the measure alone again. */
    rows.push({
      key: 'weakest',
      text: (
        <>
          The measure holding it back is <strong>{weakest.label.toLowerCase()}</strong>, at{' '}
          <strong>{Math.round(weakest.score)}</strong> out of 100 — {weakest.raw}.
        </>
      ),
      href: '#trajectory',
      label: 'See all five',
    });
  }

  if (topAdvice) {
    rows.push({
      key: 'advice',
      text: (
        <>
          The change worth most right now is <strong>{topAdvice.toLowerCase()}</strong>
          {adviceCount > 1 ? <>, one of {adviceCount} worth making</> : null}.
        </>
      ),
      href: '/recommendations',
      label: 'See what to change',
    });
  }

  /* Above the phase row, and that ordering is the whole of how the cap holds:
     rows are pushed in the order they are worth reading and the list is cut at
     five, so on an account with something to say about every one of them the
     phase — the softest of the six — is what falls off. A goal behind its date
     outranks a description of how the last three weeks have felt. */
  if (goals && goals.active > 0) {
    rows.push({
      key: 'goals',
      text:
        goals.behind > 0 ? (
          <>
            <strong>{goals.behind}</strong> of your <strong>{goals.active}</strong>{' '}
            {goals.active === 1 ? 'goal' : 'goals'}{' '}
            {goals.behind === 1 ? 'is' : 'are'} behind.
          </>
        ) : (
          <>
            All <strong>{goals.active}</strong> of your{' '}
            {goals.active === 1 ? 'goal is' : 'goals are'} on track.
          </>
        ),
      href: '/analytics/goals',
      label: 'See the goals',
    });
  }

  if (phase) {
    rows.push({
      key: 'phase',
      text: (
        <>
          You are working in a <strong>{phase.toLowerCase()}</strong> phase.
        </>
      ),
      href: '/insights',
      label: 'See why',
    });
  }

  /* Null at S, where there is no band above to climb to. */
  const next = value !== null ? toNextGrade(value) : null;

  return (
    <section className={`ax-panel ax-summary ${gradeClass(grade)}`}>
      <div className="ax-summary-head">
        <div className="ax-summary-grade" title={`${bandLabel(grade)} out of 100`}>
          <span aria-hidden="true">{grade}</span>
          <span className="ax-sr">Grade {grade}</span>
        </div>
        {/* The letter, and then the next one up and what it costs.

            The sentence used to stop at the meaning, which made it a verdict
            and nothing else: a reader shown "62/100 — two or three of the five
            are low" has been told where they stand and given nowhere to go.
            Every other line on this panel points somewhere; this one, the one
            printed largest and read first, did not.

            The distance existed already — it was a clause on the weakest row,
            and only at the two blunter tones, which put it in front of exactly
            the readers least in need of encouragement and hid it from the ones
            who had asked for the gentle page. It is arithmetic off the same
            band table the letter came from rather than a judgement, so there
            was never a reason to ration it by tone. */}
        <p className="ax-summary-lead">
          Your analytical score is{' '}
          <strong>
            {value}
            <em>/100</em>
          </strong>{' '}
          — {GRADE_MEANING[grade].toLowerCase()}.
          {next && (
            <>
              {' '}
              <span className="ax-summary-next">
                <strong>{next.points}</strong>{' '}
                {next.points === 1 ? 'point' : 'points'} to {next.grade}.
              </span>
            </>
          )}
        </p>
      </div>

      {rows.length > 0 && (
        <ul className="ax-summary-rows">
          {rows.slice(0, MAX_ROWS).map((row) => (
            <li key={row.key}>
              <p>{row.text}</p>
              {/* A hash is an anchor on the tab that is already open; anything
                  else is another tab, and `Link` keeps the router in charge of
                  it. Two elements rather than one branch inside a `Link`,
                  because a router link to "#trajectory" resolves against the
                  route and navigates away from it. */}
              {row.href.startsWith('#') ? (
                <a className="ax-summary-more" href={row.href}>
                  {row.label}
                </a>
              ) : (
                <Link className="ax-summary-more" to={row.href}>
                  {row.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* What it is read from, on an account young enough for that to change
          the answer. Above the workings rather than inside them: a reader who
          never opens the disclosure is exactly the reader who should be told
          how much is behind the number. */}
      {basis && <p className="ax-summary-basis">{basis}</p>}

      <details className="ax-summary-how">
        <summary>How this is worked out</summary>
        <p>{howItIsCalculated(score)}</p>
      </details>
    </section>
  );
}
