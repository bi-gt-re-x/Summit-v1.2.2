/**
 * The Recommendations page's panels — what to do differently, and what it is worth.
 *
 * The Insights page describes; this one prescribes, from the same numbers. Each
 * card is an instruction, the finding that produced it, the concrete first
 * step, and the arithmetic behind the figure attached to it — that last part
 * matters most: a page that tells someone their habit is worth 12,000 XP a year
 * and will not say how it got there is asking to be believed rather than read.
 *
 * Same `Panel`, same grid, same tiles as the analytics page, so the three pages
 * are one place.
 */

import { AreaChart, Panel, toneVar } from '@/components/Analytics';
import {
  PRIORITY_LABEL,
  PRIORITY_TONE,
  difficultyLabel,
  type Advice,
  type Outlook,
} from '@/utils/advice';
import { compact } from '@/utils/growthSummary';

/*
 * Five series colours and six kinds, so `load` takes `--ax-bad` rather than a
 * sixth series tone. That is not a shortage worked around: burnout is the one
 * kind here that is a warning rather than an opportunity — every other card
 * offers something to gain and these offer something to stop — and the page's
 * own "this went the wrong way" colour is the honest one to say it in.
 */
const KIND_TONE: Record<Advice['kind'], string> = {
  frequency: 'violet',
  timing: 'blue',
  depth: 'green',
  balance: 'amber',
  quality: 'pink',
  load: 'bad',
};

/*
 * Which recommendations the reader has adopted used to live in localStorage,
 * under `summit:advice-trying`, as a set of ids and nothing else.
 *
 * It is on the account now (backend/api/analytics.py). Two reasons, and the
 * second is the one that mattered: a decision recorded in one browser was
 * invisible in every other, and — more importantly — a set of ids carries no
 * date, so there was no way to ask what had changed *since* the reader decided
 * anything. The follow-up panel needs the day, so the day is what is stored.
 *
 * Nothing migrates the old key. It held at most a handful of ids with no dates
 * attached, which is exactly the data the new record cannot use.
 */

// --------------------------------------------------------------------------
// A recommendation
// --------------------------------------------------------------------------
/**
 * One recommendation, with everything needed to decide on it and nothing else.
 *
 * The card answers five questions in the order a reader asks them: what, how
 * much is it worth, what do I actually do, why does Summit think so, and what is
 * the evidence. The last of those is the one most pages like this omit, and it
 * is the reason this one can be argued with — a card that claims a habit is
 * worth twelve thousand XP a year and will not show its arithmetic is asking to
 * be believed rather than read.
 *
 * The priority chip ranks; the XP figure quantifies. They are both here because
 * they answer different questions — "which of these first" and "is this worth
 * anything at all" — and an account with five low-impact ones should be able to
 * see that at a glance without doing five divisions.
 */
export function AdviceCard({
  item,
  rank,
  onAdopt,
  adopting,
  adopted,
}: {
  item: Advice;
  rank: number;
  /** Makes the task and starts the clock on measuring it. See the button. */
  onAdopt: (item: Advice) => Promise<boolean>;
  /** The id currently being written, so only its own button shows the wait. */
  adopting: string | null;
  /**
   * Whether this one is already being tracked.
   *
   * From the account rather than from the browser — see the note at the top of
   * this file — which is what makes a card open marked on a second device and
   * what gives the follow-up panel a date to measure from.
   */
  adopted: boolean;
}) {
  const tone = KIND_TONE[item.kind];
  const chosen = adopted;
  const busy = adopting === item.id;

  return (
    <article className={`ax-panel ax-advice${chosen ? ' is-trying' : ''}`}>
      <header className="ax-advice-head">
        <span className="ax-advice-rank" style={{ background: toneVar(tone) }}>
          {rank}
        </span>
        <div>
          {/* The category alone. It used to read "Consistency · How often",
              and the second half was a word from this file's taxonomy rather
              than anything the reader needed — the title underneath already
              says what kind of change it is. */}
          <span className="ax-advice-kind" style={{ color: toneVar(tone) }}>
            {item.category}
          </span>
          <h2>{item.title}</h2>
        </div>
        {item.impact > 0 && (
          <span className="ax-advice-impact">
            <strong>+{compact(item.impact)}</strong>
            <span className="ax-muted ax-small">XP / year</span>
          </span>
        )}
      </header>

      <div className="ax-advice-chips">
        <span
          className="ax-advice-priority"
          style={{ color: toneVar(PRIORITY_TONE[item.priority]), borderColor: toneVar(PRIORITY_TONE[item.priority]) }}
        >
          {PRIORITY_LABEL[item.priority]}
        </span>
        {/* One reading of effort, not two. The five dots beside this said
            exactly what the word says, in a scale nobody had been shown the
            key to — and being decorative they were aria-hidden, so the word is
            also the only one of the pair a screen reader ever had. */}
        <span className="ax-advice-chip">{difficultyLabel(item.effort)}</span>
      </div>

      {/* The finding, then the instruction, each named.

          This card ran three tagged paragraphs once — Why, Try, Expect — and
          the labels came off because a reader looking for the instruction had
          to find it among two others and read past a label to reach it. Expect
          stayed gone: it was the title and the XP figure saying it a third
          time.

          Two of them are back, for a reason the old arrangement did not have.
          Unlabelled, `because` read as justification prose — the sort of
          sentence any productivity app prints under any tip — and a reader had
          no way to tell it was a finding *from their own record*. That is the
          only thing making this page different from a list of study advice,
          and it was the one thing the card did not say.

          So the order is the causal one and both halves are named: what was
          noticed, then what to do about it. The instruction stays the card's
          own text and the finding stays quieter, which is what keeps the
          original objection answered — the eyebrow is a two-word label above a
          small line, not a paragraph competing with the action. */}
      <p className="ax-advice-label">Why</p>
      <p className="ax-advice-why">{item.because}</p>
      <p className="ax-advice-label">What to do</p>
      <p className="ax-advice-do">{item.action}</p>

      <footer className="ax-advice-foot">
        <details className="ax-advice-evidence">
          <summary>Show the numbers</summary>
          <span>{item.evidence}</span>
          <span>{item.workings}</span>
        </details>
        {/* **This makes a task and starts a measurement.** It used to set a
            flag in localStorage and nothing else: the page would compute that a
            change was worth five thousand XP a year, the reader would agree
            with it, press the button — and then have to go and act on it
            somewhere else, from memory, with nothing ever coming back to say
            whether it had worked. A recommendation that cannot be accepted is
            an essay; one that is never checked is a guess.

            Once adopted the button stops being a control. Untracking happens on
            the follow-up panel, where the thing being given up is visible —
            here it would sit under a card the reader is reading for the first
            time, one slip away from discarding three weeks of comparison. */}
        {chosen ? (
          <span className="ax-try is-on">✓ Tracking</span>
        ) : (
          <button
            type="button"
            className="ax-try"
            disabled={busy}
            onClick={() => void onAdopt(item)}
          >
            {busy ? 'Adding…' : 'Add to tasks'}
          </button>
        )}
      </footer>
    </article>
  );
}

// --------------------------------------------------------------------------
// Filtering
// --------------------------------------------------------------------------
/**
 * The category row, built from what is actually on the page.
 *
 * Not from the full list of categories: an account with three suggestions in
 * two categories should see two chips, because six greyed-out ones say nothing
 * except that the page has a taxonomy.
 */
export function CategoryFilter({
  items,
  chosen,
  onChoose,
}: {
  items: Advice[];
  chosen: string;
  onChoose: (category: string) => void;
}) {
  const present = [...new Set(items.map((item) => item.category))];
  if (present.length < 2) return null;

  return (
    <div className="ax-chips ax-chips-inline" role="group" aria-label="Category">
      <button
        type="button"
        className={`ax-chip${chosen === '' ? ' is-on' : ''}`}
        aria-pressed={chosen === ''}
        onClick={() => onChoose('')}
      >
        Everything ({items.length})
      </button>
      {present.map((category) => (
        <button
          key={category}
          type="button"
          className={`ax-chip${chosen === category ? ' is-on' : ''}`}
          aria-pressed={chosen === category}
          onClick={() => onChoose(category)}
        >
          {category} ({items.filter((item) => item.category === category).length})
        </button>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------
// The projection
// --------------------------------------------------------------------------
export function OutlookPanel({ outlook }: { outlook: Outlook }) {
  const peak = Math.max(...outlook.improvedLine, 1);
  const ticks: string[] = [];
  for (let step = 4; step >= 0; step--) ticks.push(compact((peak / 4) * step));

  return (
    /* No note: it read "Your pace now, and with every change made", which is
       what the three figures immediately below it already say, in the same
       words, with the numbers attached. */
    <Panel title="Five years, both ways">
      <div className="ax-figures">
        <div className="ax-figure">
          <span className="ax-muted">At today&rsquo;s pace</span>
          <strong>{compact(outlook.current)}</strong>
          <span className="ax-muted ax-small">XP a year</span>
        </div>
        <div className="ax-figure">
          <span className="ax-muted">With the changes</span>
          <strong>{compact(outlook.improved)}</strong>
          <span className="ax-muted ax-small">XP a year</span>
        </div>
        <div className="ax-figure">
          <span className="ax-muted">Difference</span>
          <strong>+{compact(outlook.improved - outlook.current)}</strong>
          <span className="ax-muted ax-small">XP a year</span>
        </div>
      </div>

      <AreaChart
        id="ax-outlook"
        height={180}
        label="Banked XP over the next five years, at today's pace and with the changes made"
        /* Six points and six marks, and they are the same six — this is the one
           chart on the page whose axis labels already name every point it
           carries, because the x axis is five round years rather than a
           sampling of days. */
        readout={{
          labels: ['Now', 'In 1 year', 'In 2 years', 'In 3 years', 'In 4 years', 'In 5 years'],
          names: ['With the changes', "At today's pace"],
          format: (value) => `${compact(value)} XP`,
        }}
        series={[
          { values: outlook.improvedLine, tone: 'green' },
          { values: outlook.currentLine, tone: 'violet', muted: true },
        ]}
        ticks={ticks}
        marks={['Now', '1 yr', '2 yr', '3 yr', '4 yr', '5 yr']}
      />

      <div className="ax-legend">
        <span className="ax-legend-item">
          <i className="ax-legend-line" style={{ background: toneVar('green') }} />
          With the changes
        </span>
        <span className="ax-legend-item">
          <i className="ax-legend-line ax-legend-muted" />
          At today&rsquo;s pace
        </span>
      </div>

      <p className="ax-prose">
        Both lines start from what you have banked. The gap is the claim.
      </p>
    </Panel>
  );
}

