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

import { useMemo, useState } from 'react';
import { AreaChart, Panel, toneVar } from '@/components/Analytics';
import {
  PRIORITY_LABEL,
  PRIORITY_TONE,
  difficultyLabel,
  type Advice,
  type Outlook,
} from '@/utils/advice';
import { compact } from '@/utils/growthSummary';
import { levelForTotalXp } from '@/utils/format';
import { monthFrom, outlookMilestones, sooner } from '@/utils/outlookMilestones';
import type { Goal } from '@/types';

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
  adopted,
}: {
  item: Advice;
  rank: number;
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
  /* Shut by default: the rank, the change, what it is worth and how hard it
     is are enough to choose between three cards side by side. The finding, the
     instruction and the numbers open under the chevron. */
  const [open, setOpen] = useState(false);

  return (
    <article className={`ax-panel ax-advice${chosen ? ' is-trying' : ''}${open ? ' is-open' : ''}`}>
      <header className="ax-advice-head" onClick={() => setOpen(!open)}>
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
        <button
          type="button"
          className="ax-advice-toggle"
          aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Show'} why and what to do`}
          onClick={(event) => {
            event.stopPropagation();
            setOpen(!open);
          }}
        >
          <span className="ax-finding-mark" aria-hidden="true" />
        </button>
      </header>

      <div className="ax-advice-meta">
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
          {chosen && !open && <span className="ax-advice-chip is-tracking">✓ Tracking</span>}
        </div>
        {item.impact > 0 && (
          <span className="ax-advice-impact">
            <strong>+{compact(item.impact)}</strong>
            <span className="ax-muted ax-small">XP / year</span>
          </span>
        )}
      </div>

      {open && (
        <div className="ax-advice-more">
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
            {/* Changes adopted before the Add to tasks button was taken off
                still say so; What happened after reports on them. */}
            {chosen && <span className="ax-try is-on">✓ Tracking</span>}
          </footer>
        </div>
      )}
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

  /* A dropdown in the panel's corner rather than a row of chips over the
     cards, so the cards start right under the heading. */
  return (
    <label className="ax-category-pick">
      <span>Show</span>
      <select value={chosen} onChange={(event) => onChoose(event.target.value)}>
        <option value="">Everything ({items.length})</option>
        {present.map((category) => (
          <option key={category} value={category}>
            {category} ({items.filter((item) => item.category === category).length})
          </option>
        ))}
      </select>
    </label>
  );
}

/** "Now", "In 3 months", "In 1 year", "In 1 year 6 months" for the 21 quarterly points. */
const QUARTERS = Array.from({ length: 21 }, (_, step) => {
  if (step === 0) return 'Now';
  const years = Math.floor(step / 4);
  const months = (step % 4) * 3;
  const y = years ? `${years} year${years === 1 ? '' : 's'}` : '';
  const m = months ? `${months} months` : '';
  return `In ${[y, m].filter(Boolean).join(' ')}`;
});

/** A total XP as a level with its fraction, so the line climbs smoothly. */
const asLevel = (xp: number) => {
  const at = levelForTotalXp(xp);
  return at.level + at.percent / 100;
};

export function OutlookPanel({
  outlook,
  advice,
  goals,
}: {
  outlook: Outlook;
  advice: Advice[];
  goals: Goal[];
}) {
  /* Total XP or level. Level is the number the rest of the app shows, and a
     line of XP in the hundreds of thousands says less about a year than
     "Level 47 instead of 41". */
  const [view, setView] = useState<'xp' | 'level'>('xp');
  const banked = outlook.currentLine[0] ?? 0;
  const gain = outlook.improved - outlook.current;

  const improvedLine = view === 'xp' ? outlook.improvedLine : outlook.improvedLine.map(asLevel);
  const currentLine = view === 'xp' ? outlook.currentLine : outlook.currentLine.map(asLevel);
  const peak = Math.max(...improvedLine, 1);
  const ticks: string[] = [];
  for (let step = 4; step >= 0; step--) {
    const value = (peak / 4) * step;
    ticks.push(view === 'xp' ? compact(value) : `L${Math.round(value)}`);
  }
  const write = view === 'xp'
    ? (value: number) => `${compact(value)} XP`
    : (value: number) => `Level ${Math.floor(value)}`;

  const milestones = useMemo(
    () => outlookMilestones({ banked, current: outlook.current, improved: outlook.improved, goals }),
    [banked, goals, outlook.current, outlook.improved],
  );

  /* Where the gap between the lines comes from: each change's share of it. */
  const sources = advice
    .filter((item) => item.impact > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5);

  const levelNow = levelForTotalXp(banked).level;
  const levelAt = (line: number[]) => levelForTotalXp(line[line.length - 1] ?? banked).level;

  return (
    <Panel
      title="Five years, both ways"
      note={`Where you'll be at today's pace, and with every change above made. You're Level ${levelNow} with ${compact(banked)} XP banked.`}
      className="ax-outlook"
      aside={
        <div className="ax-outlook-view" role="group" aria-label="Show the chart in">
          {(['xp', 'level'] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={`ax-plan-budget-btn${view === key ? ' is-on' : ''}`}
              aria-pressed={view === key}
              onClick={() => setView(key)}
            >
              {key === 'xp' ? 'Total XP' : 'Level'}
            </button>
          ))}
        </div>
      }
    >
      <div className="ax-figures">
        <div className="ax-figure">
          <span className="ax-muted">At today&rsquo;s pace</span>
          <strong>{compact(outlook.current)}</strong>
          <span className="ax-muted ax-small">XP a year · Level {levelAt(outlook.currentLine)} in 5 years</span>
        </div>
        <div className="ax-figure">
          <span className="ax-muted">With the changes</span>
          <strong>{compact(outlook.improved)}</strong>
          <span className="ax-muted ax-small">XP a year · Level {levelAt(outlook.improvedLine)} in 5 years</span>
        </div>
        <div className="ax-figure">
          <span className="ax-muted">Difference</span>
          <strong>+{compact(gain)}</strong>
          <span className="ax-muted ax-small">
            XP a year · {levelAt(outlook.improvedLine) - levelAt(outlook.currentLine)} more levels
          </span>
        </div>
      </div>

      <AreaChart
        id="ax-outlook"
        height={180}
        label={
          view === 'xp'
            ? "Banked XP over the next five years, at today's pace and with the changes made"
            : "Your level over the next five years, at today's pace and with the changes made"
        }
        readout={{
          labels: QUARTERS,
          names: ['With the changes', "At today's pace"],
          format: write,
        }}
        series={[
          { values: improvedLine, tone: 'green' },
          { values: currentLine, tone: 'violet', muted: true },
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

      {/* The dates the two paces give for things worth reaching. */}
      {milestones.length > 0 && (
        <div className="ax-outlook-block">
          <h3 className="ax-outlook-sub">When you&rsquo;d get there</h3>
          <table className="ax-outlook-table">
            <thead>
              <tr>
                <th scope="col">Milestone</th>
                <th scope="col">At today&rsquo;s pace</th>
                <th scope="col">With the changes</th>
                <th scope="col">Difference</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <span className="ax-outlook-name">{row.label}</span>
                    <span className="ax-muted ax-small">
                      {compact(row.needed)} XP to go
                      {row.deadline ? ` · due ${monthFrom(Math.round((Date.parse(row.deadline) - Date.now()) / 86_400_000))}` : ''}
                    </span>
                  </th>
                  <td data-label="At today's pace">{row.atPace === null ? 'Over 10 years' : monthFrom(row.atPace)}</td>
                  <td data-label="With the changes" className="is-better">{row.withChanges === null ? 'Over 10 years' : monthFrom(row.withChanges)}</td>
                  <td data-label="Difference" className="ax-muted">
                    {row.withChanges === null
                      ? '–'
                      : row.atPace === null
                        ? 'Within reach'
                        : sooner(row.atPace - row.withChanges)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Which change is worth what share of the gap. */}
      {sources.length > 0 && gain > 0 && (
        <div className="ax-outlook-block">
          <h3 className="ax-outlook-sub">Where the extra comes from</h3>
          <ul className="ax-outlook-sources">
            {sources.map((item) => {
              const share = Math.round((item.impact / gain) * 100);
              return (
                <li key={item.id}>
                  <span className="ax-outlook-source-name">{item.title}</span>
                  <span className="ax-outlook-bar" aria-hidden="true">
                    <i style={{ width: `${Math.max(2, share)}%` }} />
                  </span>
                  <span className="ax-outlook-source-value">
                    +{compact(item.impact)} <span className="ax-muted">({share}%)</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="ax-prose">
        Both lines start from what you have banked. Each change&rsquo;s figure is worked out from
        your last two weeks; open its card for the numbers.
      </p>
    </Panel>
  );
}
