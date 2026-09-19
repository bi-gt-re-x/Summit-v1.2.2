/**
 * The interpretive half of the Insights tab — why, how, and what is working.
 *
 * The panels in ./Panels describe a shape: this weekday against that one, the
 * hours the work lands in. These take two shapes and put them together, which
 * is a different and more dangerous job, and the components are arranged around
 * that danger rather than around the layout.
 *
 * **Every finding wears its evidence.** The strength chip is not decoration and
 * is never assigned by hand — `strengthOf` computes it from the sample size and
 * the coefficient, and it is printed in the same place on every card so a
 * reader can discount a whole panel at a glance.
 *
 * **A weak relationship is drawn as a weak relationship.** The scatter gets no
 * line of fit unless the evidence carries one. A confident diagonal through a
 * smear, sitting under a chip that says "possible, not established", would be
 * the page arguing with itself.
 *
 * **Expandable, because the detail is long and the headline is the point.** The
 * claim is always visible; the arithmetic behind it opens on request. That is
 * the only way to put this much prose on a tab without it reading as a wall.
 */
import { useState } from 'react';
import { Panel, Scatter, asTone, toneVar } from '@/components/Analytics';
import {
  STRENGTH_HUE,
  STRENGTH_TEXT,
  type CurrentState,
  type Finding,
  type Relationship,
  type Unlock,
  type Win,
} from '@/utils/insight';

// --------------------------------------------------------------------------
// Shared furniture
// --------------------------------------------------------------------------
function StrengthChip({ strength }: { strength: Finding['strength'] }) {
  const hue = STRENGTH_HUE[strength];
  return (
    <span
      className="ax-evidence"
      style={{ color: toneVar(hue), borderColor: toneVar(hue) }}
      title="How reliable this finding is"
    >
      {STRENGTH_TEXT[strength]}
    </span>
  );
}

/** The waiting state, which is not an error and is not styled as one. */
function Waiting({ notice }: { notice: Unlock }) {
  return (
    <div className="ax-waiting">
      <span className="ax-waiting-mark" aria-hidden="true" />
      <p>{notice.message}</p>
    </div>
  );
}

/**
 * A finding: the claim, the chip, and the workings behind a disclosure.
 *
 * The headline is a full sentence and stands alone — a reader who never opens
 * one of these should still have read the finding. What opens is the evidence,
 * which is where the hedging and the denominators live.
 */
export function FindingCard({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`ax-finding${open ? ' is-open' : ''}`}>
      <button type="button" className="ax-finding-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="ax-dot" style={{ background: toneVar(finding.tone) }} />
        <strong>{finding.headline}</strong>
        <span className="ax-finding-mark" aria-hidden="true" />
      </button>
      {/*
        One wrapper, and it has to stay one: the collapse is a grid row going
        to 0fr, and a second child would land in an implicit auto row that the
        0fr never touches. See `.ax-finding-body` in styles/analytics.css.

        `inert` while shut, because that collapse hides the evidence from the
        eye and from nothing else — `overflow: hidden` leaves it in the
        accessibility tree, so `aria-expanded="false"` claimed the finding was
        folded away while a screen reader read the workings out anyway.
      */}
      <div className="ax-finding-body" inert={!open}>
        <div>
          <p className="ax-prose">{finding.detail}</p>
          <StrengthChip strength={finding.strength} />
        </div>
      </div>
    </li>
  );
}

// --------------------------------------------------------------------------
// Why
// --------------------------------------------------------------------------
export function WhyPanel({
  findings,
  notice,
}: {
  findings: Finding[];
  notice: Unlock;
}) {
  return (
    <Panel
      title="Why the last stretch went the way it did"
      note="What accounts for the change"
    >
      {!notice.ready ? (
        <Waiting notice={notice} />
      ) : findings.length === 0 ? (
        <p className="ax-empty">
          Nothing moved far enough to have a cause worth naming.
        </p>
      ) : (
        <ul className="ax-findings">
          {findings.map((finding) => (
            <FindingCard key={finding.id} finding={finding} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// How
// --------------------------------------------------------------------------
export function HowPanel({
  findings,
  notice,
}: {
  findings: Finding[];
  notice: Unlock;
}) {
  return (
    <Panel
      title="How you tend to work"
      note="Associations, not mechanisms"
    >
      {!notice.ready ? (
        <Waiting notice={notice} />
      ) : findings.length === 0 ? (
        <p className="ax-empty">
          Not enough spread yet to separate conditions that produce different results.
        </p>
      ) : (
        <ul className="ax-findings">
          {findings.map((finding) => (
            <FindingCard key={finding.id} finding={finding} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// What is working
// --------------------------------------------------------------------------
/**
 * The measured improvements, and only the measured ones.
 *
 * A page that only ever finds faults gets closed, and an account improving on
 * four counts has earned being told so in the same voice the problems are
 * stated in. Nothing here is generated on a schedule — every line is a real
 * delta against the previous period of the same length, so a genuinely flat
 * stretch produces nothing and the panel says exactly that rather than
 * reaching for an encouragement.
 */
export function WorkingPanel({ wins }: { wins: Win[] }) {
  return (
    <Panel
      title="What’s working right now"
      note="Against the period before"
    >
      {wins.length === 0 ? (
        <p className="ax-empty">
          Nothing improved measurably against the previous period.
        </p>
      ) : (
        <ul className="ax-wins">
          {wins.map((win) => (
            <li key={win.id}>
              <span className="ax-win-mark" style={{ background: toneVar(win.tone) }} aria-hidden="true" />
              <div>
                <strong>{win.text}</strong>
                <span className="ax-muted ax-small">{win.figure}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Relationships
// --------------------------------------------------------------------------
/**
 * Pairs of variables that move together, drawn as their observations.
 *
 * The reader picks a pair and gets the cloud, the coefficient, the sample size
 * and a sentence that never says "because". The line of fit appears only where
 * the strength chip is not "possible, not established" — see the note on
 * `Scatter`.
 */
export function RelationshipsPanel({
  relationships,
  notice,
}: {
  relationships: Relationship[];
  notice: Unlock;
}) {
  const [chosen, setChosen] = useState(0);
  const active = relationships[Math.min(chosen, relationships.length - 1)];

  return (
    <Panel
      title="What moves with what"
      note="Correlation, not cause"
    >
      {!notice.ready || !active ? (
        <Waiting
          notice={
            notice.ready
              ? {
                  ready: false,
                  message:
                    'Not enough paired days yet — these need both focus time and finished tasks.',
                }
              : notice
          }
        />
      ) : (
        <>
          <div className="ax-chips ax-chips-inline" role="group" aria-label="Relationship">
            {relationships.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                className={`ax-chip${index === chosen ? ' is-on' : ''}`}
                aria-pressed={index === chosen}
                onClick={() => setChosen(index)}
              >
                {entry.pair}
              </button>
            ))}
          </div>

          <div className="ax-relationship">
            <Scatter
              points={active.points}
              tone={asTone(active.tone)}
              xLabel={active.pair.split('→')[0]?.trim() ?? ''}
              yLabel={active.pair.split('→')[1]?.trim() ?? ''}
              trend={active.strength !== 'weak' && active.r !== 0}
            />
            <div className="ax-relationship-read">
              <div className="ax-figures ax-figures-tight">
                <div className="ax-figure">
                  <span className="ax-muted">Correlation</span>
                  <strong>{active.r === 0 ? '—' : active.r.toFixed(2)}</strong>
                  <span className="ax-muted ax-small">Pearson’s r</span>
                </div>
                <div className="ax-figure">
                  <span className="ax-muted">Observations</span>
                  <strong>{active.n}</strong>
                  <span className="ax-muted ax-small">pairs behind it</span>
                </div>
              </div>
              <StrengthChip strength={active.strength} />
              <p className="ax-prose">{active.reading}</p>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// You, right now
// --------------------------------------------------------------------------
/**
 * The snapshot that opens the tab: where this account currently is.
 *
 * Assembled from the same figures the panels below are drawn from, so it cannot
 * drift from them, and it names the single weakest thing rather than listing
 * every weakness — one problem a reader remembers beats four they skim.
 */
export function CurrentStatePanel({ state, span }: { state: CurrentState; span: string }) {
  return (
    <Panel
      title="You, right now"
      note={span}
      aside={
        <span className="ax-phase-badge" style={{ color: toneVar(state.tone), borderColor: toneVar(state.tone) }}>
          {state.phase}
        </span>
      }
    >
      {/* `state.sentence` is not here: it is the tab's opening line, in the
          slot above the first section. This panel is what follows from it. */}
      <p className="ax-prose ax-prose-lead">{state.weakness}</p>
    </Panel>
  );
}
