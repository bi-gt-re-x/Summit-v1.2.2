/**
 * Records — the account's hall of fame.
 *
 * ## The question this page answers
 *
 * Not "how am I doing" and not "what should I do" — the other pages have
 * those. This one answers **look how far I have come**, and every decision
 * here follows from that. It is why the evolution chart exists and there is no
 * average, no standard deviation and no percentile: "18 → 20 → 21 → 23 → 25"
 * is the story, and "mean 21.4, σ 2.3" is the same numbers with the story
 * taken out.
 *
 * ## Two kinds of record, and both are real
 *
 * **Logged** — what the account writes down. AMC 8 25/25, RCM 9, a
 * ten-thousand-line project. Summit cannot know any of it; none of it happened
 * inside the app. These live in the `records` table and are what the two Log
 * buttons write.
 *
 * **Derived** — what Summit counted itself: best XP day, heaviest task, longest
 * streak, and how close today is to beating each. This was the entire page
 * before, and it is kept exactly as it was, below the logged ones. Neither
 * replaces the other and they are visibly separated, because a record you set
 * and a record the app noticed are different claims and running them together
 * would make the page's numbers unclear about which is which.
 *
 * ## One row is one entry
 *
 * The shape everything rests on, and it is explained where it lives —
 * utils/records. In short: beating your AMC 8 score writes a *new row* rather
 * than editing the old one, which is what makes the evolution drawable at all.
 *
 * ## Milestones fold, and the category is what they fold into
 *
 * Eleven milestones is a scroll, and a scroll is not a summary. So the section
 * draws *key* milestones — one per category with more than one thing in it —
 * and each opens onto the smaller ones it is made of. Nothing new is stored to
 * do it: the account already types a category, and a heading with several
 * things under it is what a key milestone is. The rule, and why a category of
 * one stays a plain row, is in utils/records — see `keyMilestones`.
 *
 * The whole section folds too, from its own title. Both start shut: the counts
 * ride on the header and on every key row, so the closed state says how much
 * is behind it rather than merely hiding it.
 *
 * The figures count up from zero on arrival. Not decoration here in the way it
 * would be on a settings page: this is the one screen whose entire content is
 * numbers somebody is proud of, and a page of high scores that simply appears
 * reads as a table. Nothing moves under `prefers-reduced-motion` — see
 * hooks/useCountUp.
 *
 * **Why this is not the analytics page.** There was a Records tab under
 * Analytics, about *standing*: where the last thirty days rank against every
 * other thirty. It is the Growth tab now
 * (components/Analytics/tabs/GrowthTab), which asks how far the account has
 * come across its whole life and kept that percentile as one panel. This page
 * is about the high scores themselves. All three read the same history and ask
 * different things of it.
 */
import { useCallback, useMemo, useState } from 'react';
import { ErrorState, Loading, PageHero } from '@/components';
import { Glyph } from '@/components/Growth/GrowthPanels';
import { RecordModal } from '@/components/Records/RecordModal';
import { useApi, useCountUp, useDocumentTitle, usePageEntrance, useUserData } from '@/hooks';
import { growth as growthService, records as recordService } from '@/services';
import type { GrowthSeries } from '@/services/growth';
import type { RecordDraft, RecordKind, RecordRow } from '@/services/records';
import { longDate } from '@/utils/growthChapters';
import {
  categories as categoriesOf,
  filterRows,
  formatOn,
  formatValue,
  gainText,
  headline,
  keyMilestones,
  personalBests,
  tally,
  timeline,
  type Best,
  type KeyMilestone,
  type Show,
  type Sort,
} from '@/utils/records';
import {
  personalRecords,
  recordChase,
  type BestRecord,
  type RecordChase,
} from '@/utils/growthBench';
import type { GrowthDay } from '@/types';
import '@/styles/records.css';

/** Below this there is no derived record worth the name — see the empty state. */
const NEED_DAYS = 3;

/** How many best-cards the top row draws before the rest go to the list below. */
const TOP_BESTS = 8;

/**
 * One number, counted up, printed at the precision it was measured to.
 *
 * `useCountUp` is fed the rounded value rather than the raw one, which is what
 * its own note asks for: a figure shown to one decimal should not animate the
 * digits below it.
 */
function Counted({ amount, decimals, unit }: { amount: number; decimals: number; unit: string }) {
  const shown = useCountUp(amount);
  const text = decimals > 0 ? shown.toFixed(decimals) : Math.round(shown).toLocaleString();

  return (
    <span className="rc-figure">
      <span className="rc-num">{text}</span>
      {unit && <span className="rc-unit">{unit}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Logged records
// ---------------------------------------------------------------------------
/** The one chevron this page folds things with, pointing right until open. */
function Caret() {
  return (
    <svg className="rc-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.4" aria-hidden="true">
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A key milestone, and the smaller ones underneath it once it is opened.
 *
 * The head is a row in its own right and not only a label: it carries the tick
 * the children carry, filled only when every one of them is reached, and the
 * "2 of 5" that makes the shut state worth reading. Which category becomes a
 * key milestone is decided in utils/records — see `keyMilestones`.
 */
function KeyRow({
  entry,
  open,
  onToggle,
  onPick,
}: {
  entry: KeyMilestone;
  open: boolean;
  onToggle: () => void;
  onPick: (row: RecordRow) => void;
}) {
  const total = entry.children.length;
  const done = entry.reached === total;

  return (
    <li className={`rc-key${open ? ' is-open' : ''}${done ? ' is-done' : ''}`}>
      <button type="button" className="rc-key-head" aria-expanded={open} onClick={onToggle}>
        <Caret />
        <span className="rc-mile-tick" aria-hidden="true">{done ? '✓' : ''}</span>
        <span className="rc-mile-name">{entry.name}</span>
        <span className="rc-key-n">
          {entry.reached} of {total}
        </span>
      </button>

      {open && (
        <ul className="rc-key-kids">
          {entry.children.map((row) => (
            <li key={row.id} className={row.achieved_on ? 'is-done' : ''}>
              <button type="button" onClick={() => onPick(row)}>
                <span className="rc-mile-tick" aria-hidden="true">
                  {row.achieved_on ? '✓' : ''}
                </span>
                <span className="rc-mile-name">{row.name}</span>
                <span className="rc-mile-when">{formatOn(row.achieved_on)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function BestCard({ best, onOpen }: { best: Best; onOpen: () => void }) {
  return (
    <li className={`rc-best${best.fresh ? ' is-fresh' : ''}`}>
      <button type="button" onClick={onOpen}>
        <span className="rc-best-cat">{best.category || 'Uncategorised'}</span>
        <span className="rc-best-name">{best.name}</span>
        <span className="rc-best-value">{formatValue(best.value, best.unit, best.target)}</span>
        <span className="rc-best-label">Personal best</span>

        {best.fresh ? (
          <span className="rc-best-new">NEW RECORD 🔥</span>
        ) : best.gain > 0 ? (
          <span className="rc-best-gain">
            ↑ {gainText(best)} from first record
          </span>
        ) : (
          <span className="rc-best-gain is-quiet">
            {best.entries > 1 ? 'No gain yet' : 'First entry'}
          </span>
        )}

        <span className="rc-best-when">{formatOn(best.on)}</span>
      </button>
    </li>
  );
}

/**
 * The evolution of one record, as a line.
 *
 * Drawn rather than charted with a library: it is one series of at most a
 * dozen points and the whole thing is forty lines of SVG. The y-axis is padded
 * off the range rather than starting at zero — a score that went 18 to 25 on a
 * 0-30 axis is a flat line, and the flatness would be a lie about a 39%
 * improvement.
 */
function Evolution({ best }: { best: Best }) {
  const points = best.history.filter((row) => row.achieved_on);
  if (points.length < 2) {
    return (
      <p className="rc-empty">
        One entry so far. Log “{best.name}” again when you beat it and the line appears here.
      </p>
    );
  }

  const values = points.map((row) => row.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = (high - low || Math.abs(high) || 1) * 0.2;
  const floor = low - pad;
  const ceil = high + pad;

  const W = 640;
  const H = 190;
  const L = 44;
  const B = 26;

  const x = (i: number) => L + (i * (W - L - 14)) / Math.max(1, points.length - 1);
  const y = (v: number) => H - B - ((v - floor) / (ceil - floor || 1)) * (H - B - 14);

  const path = points.map((row, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(row.value)}`).join(' ');
  const area = `${path} L${x(points.length - 1)},${H - B} L${x(0)},${H - B} Z`;

  return (
    <div className="rc-ev">
      <svg viewBox={`0 0 ${W} ${H}`} className="rc-ev-svg" role="img"
           aria-label={`${best.name} over time, from ${values[0]} to ${values[values.length - 1]}`}>
        <defs>
          <linearGradient id="rc-ev-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".26" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((step) => {
          const value = floor + (ceil - floor) * (1 - step);
          return (
            <g key={step}>
              <line className="rc-ev-grid" x1={L} y1={14 + step * (H - B - 14)} x2={W - 8}
                    y2={14 + step * (H - B - 14)} />
              <text className="rc-ev-axis" x={L - 8} y={18 + step * (H - B - 14)} textAnchor="end">
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        <path className="rc-ev-area" d={area} fill="url(#rc-ev-fill)" />
        <path className="rc-ev-line" d={path} />

        {points.map((row, i) => (
          <g key={row.id}>
            <circle className={`rc-ev-dot${i === points.length - 1 ? ' is-last' : ''}`}
                    cx={x(i)} cy={y(row.value)} r={i === points.length - 1 ? 6 : 4} />
            <text className="rc-ev-point" x={x(i)} y={y(row.value) - 12} textAnchor="middle">
              {Math.round(row.value * 10) / 10}
            </text>
            <text className="rc-ev-when" x={x(i)} y={H - 8} textAnchor="middle">
              {row.achieved_on.slice(5).replace('-', '/')}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Derived records — the page as it was
// ---------------------------------------------------------------------------
function DerivedCard({ record }: { record: BestRecord }) {
  const unset = record.amount <= 0;
  return (
    <li className={`rc-card${unset ? ' is-unset' : ''}`}>
      <span className="rc-ico" aria-hidden="true">
        <Glyph name={record.icon} />
      </span>
      <span className="rc-label">{record.label}</span>
      {unset ? (
        <span className="rc-none">Not set yet</span>
      ) : (
        <Counted amount={record.amount} decimals={record.decimals} unit={record.unit} />
      )}
      {record.on && <span className="rc-when">{longDate(record.on)}</span>}
    </li>
  );
}

function ChaseRow({ row }: { row: RecordChase }) {
  const shown = useCountUp(row.percent);
  const remaining =
    row.decimals > 0 ? row.remaining.toFixed(row.decimals) : Math.round(row.remaining).toLocaleString();
  const target =
    row.decimals > 0 ? row.target.toFixed(row.decimals) : Math.round(row.target).toLocaleString();

  return (
    <li className={`rc-chase${row.held ? ' is-held' : ''}`}>
      <div className="rc-chase-head">
        <span className="rc-chase-ico" aria-hidden="true">
          <Glyph name={row.icon} />
        </span>
        <span className="rc-chase-label">{row.label}</span>
        <span className="rc-chase-target">
          {target}
          {row.unit ? ` ${row.unit}` : ''}
        </span>
      </div>

      <div className="rc-track" role="progressbar" aria-valuenow={Math.round(row.percent)}
           aria-valuemin={0} aria-valuemax={100}
           aria-label={`${row.label}: ${row.current} of ${row.target}`}>
        <i style={{ width: `${shown}%` }} />
      </div>

      <p className="rc-chase-foot">
        {row.held ? (
          <strong>Holding it — {row.window} is your best yet.</strong>
        ) : (
          <>
            <strong>
              {remaining}
              {row.unit ? ` ${row.unit}` : ''} to go
            </strong>{' '}
            — {row.window} stands at{' '}
            {row.decimals > 0 ? row.current.toFixed(row.decimals) : row.current.toLocaleString()}
            {row.unit ? ` ${row.unit}` : ''}.
          </>
        )}
      </p>
    </li>
  );
}

// ---------------------------------------------------------------------------
export default function Records() {
  useDocumentTitle('Records');

  const account = useUserData();
  const { username } = account;

  const seriesCall = useCallback(
    () =>
      username
        ? growthService.series(0)
        : Promise.resolve({ success: false as const, message: 'Sign in to see your records.' }),
    [username],
  );
  const series = useApi<GrowthSeries>(seriesCall, [username]);

  const listCall = useCallback(
    () =>
      username
        ? recordService.list()
        : Promise.resolve({ success: false as const, message: 'Sign in to see your records.' }),
    [username],
  );
  const logged = useApi<{ records: RecordRow[] }>(listCall, [username]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; kind: RecordKind; entry?: RecordRow }>({
    open: false,
    kind: 'record',
  });

  const [category, setCategory] = useState('All');
  const [pick, setPick] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [sort, setSort] = useState<Sort>('newest');

  /* The milestones section, and which key milestones inside it are open.
     Both start shut. A key milestone that opened by default would put the page
     back where it was — eleven rows — and the header and each key row carry
     their own counts, so nothing is hidden without saying how much. */
  const [milesShut, setMilesShut] = useState(false);
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
  const toggleKey = useCallback(
    (key: string) => setOpenKeys((open) => ({ ...open, [key]: !open[key] })),
    [],
  );

  const rows = useMemo(() => logged.data?.records ?? [], [logged.data]);
  const bests = useMemo(() => personalBests(rows), [rows]);
  /** The record the hero states. Null until something has actually moved. */
  const lead = useMemo(() => headline(rows), [rows]);
  const counts = useMemo(() => tally(rows), [rows]);
  const cats = useMemo(() => categoriesOf(rows), [rows]);
  const recent = useMemo(() => timeline(rows), [rows]);
  const milestones = useMemo(() => rows.filter((row) => row.kind === 'milestone'), [rows]);
  const { keys: keyMiles, loose: looseMiles } = useMemo(() => keyMilestones(rows), [rows]);

  /** The record the evolution chart is drawing. Defaults to the richest one. */
  const evolving = useMemo(() => {
    const withHistory = bests.filter((best) => best.history.length > 1);
    const chosen = bests.find((best) => best.name === pick);
    return chosen ?? withHistory[0] ?? bests[0] ?? null;
  }, [bests, pick]);

  const shownBests = useMemo(
    () => (category === 'All' ? bests : bests.filter((best) => best.category === category)),
    [bests, category],
  );

  const listed = useMemo(
    () => filterRows(rows, { query, show, sort }),
    [query, rows, show, sort],
  );

  // ---- writes -------------------------------------------------------------
  const write = useCallback(
    async (action: () => Promise<{ success: boolean; message?: string }>) => {
      setBusy(true);
      try {
        const result = await action();
        if (!result.success) {
          setError(result.message ?? 'That did not work.');
          return false;
        }
        setError(null);
        await logged.reload();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [logged],
  );

  const saveRecord = useCallback(
    async (draft: RecordDraft) => {
      if (!username) return;
      const ok = await write(() => recordService.save(draft));
      if (ok) setModal({ open: false, kind: draft.kind });
    },
    [username, write],
  );

  const deleteRecord = useCallback(
    async (entry: RecordRow) => {
      if (!username) return;
      const ok = await write(() => recordService.remove(entry.id));
      if (ok) setModal({ open: false, kind: entry.kind });
    },
    [username, write],
  );

  // ---- derived, as before -------------------------------------------------
  const all: GrowthDay[] = useMemo(() => series.data?.growth_data ?? [], [series.data]);
  const streak = Number(account.data?.stats?.current_streak) || 0;
  const tasks = useMemo(() => account.data?.tasks ?? [], [account.data]);
  const derived = useMemo(() => personalRecords(all, tasks, streak), [all, streak, tasks]);
  const chase = useMemo(() => recordChase(all, streak), [all, streak]);

  /* The arrival cascade. All three reads have to land before there is a page
     to animate — see hooks/usePageEntrance. */
  const entering = usePageEntrance(
    !series.loading && !account.loading && !logged.loading,
  );

  if (series.loading || account.loading || logged.loading) {
    return <Loading label="Reading your record" />;
  }
  if (series.error && !rows.length) {
    return <ErrorState message={series.error} onRetry={series.reload} />;
  }

  const open = (kind: RecordKind, entry?: RecordRow) => setModal({ open: true, kind, entry });

  return (
    <div className={`rc-page${entering ? ' pg-enter' : ''}`}>
      {/* ---- 1. Hero ------------------------------------------------------
          The page's question, answered before anybody scrolls. "Your best, and
          the day you hit it" was accurate and it was also a label; the thing
          this page is actually for is the distance, so the distance is the
          headline and the record that travelled furthest supplies it — see
          `headline` in utils/records for which one that is and why it is
          chosen on the share of the start rather than the raw gain.

          The buttons drop to secondary underneath. They are how the page gets
          filled and they are not what it is about.

          The trophy stays: it is this page's own mark and it sits in the
          corner the range leaves empty. */}
      <PageHero variant="records" tone="violet" className="rc-top">
        <header className="rc-hero">
          <div className="rc-hero-text">
            <h1 className="rc-title">Your Records</h1>
            {lead ? (
              <>
                <p className="rc-sub is-thesis">Look how far you’ve come.</p>
                <p className="rc-lead">
                  <span className="rc-lead-span">
                    <span className="rc-lead-from">{formatValue(lead.first, lead.unit)}</span>
                    <span className="rc-lead-arrow" aria-hidden="true">→</span>
                    <span className="rc-lead-to">{formatValue(lead.value, lead.unit)}</span>
                  </span>
                  <span className="rc-lead-tail">
                    on <strong>{lead.name}</strong>
                    <span className="rc-lead-dot" aria-hidden="true">·</span>
                    <span className="rc-lead-gain">{gainText(lead)}</span> since your first
                    attempt
                  </span>
                </p>
              </>
            ) : (
              <p className="rc-sub">Your best, and the day you hit it.</p>
            )}
            <div className="rc-hero-tools">
              <button type="button" className="rc-btn is-primary" onClick={() => open('record')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                Add record
              </button>
              <button type="button" className="rc-btn" onClick={() => open('milestone')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                Add milestone
              </button>
            </div>
          </div>
          <div className="rc-hero-art" aria-hidden="true">🏆</div>
        </header>
      </PageHero>

      {error && <p className="rc-error">{error}</p>}

      {/* ---- Four figures ------------------------------------------------- */}
      <ul className="rc-tiles">
        {[
          { icon: '🏆', n: counts.records, label: 'Personal Records', tone: 'violet' },
          { icon: '🥇', n: counts.milestones, label: 'Milestones', tone: 'amber' },
          { icon: '🗂️', n: counts.categories, label: 'Categories', tone: 'blue' },
          { icon: '📈', n: counts.thisMonth, label: 'All-Time Bests This Month', tone: 'green' },
        ].map((tile) => (
          <li className={`rc-tile tone-${tile.tone}`} key={tile.label}>
            <span className="rc-tile-ico" aria-hidden="true">{tile.icon}</span>
            <Counted amount={tile.n} decimals={0} unit="" />
            <span className="rc-tile-label">{tile.label}</span>
          </li>
        ))}
      </ul>

      {/* ---- 2. Personal bests -------------------------------------------- */}
      <section className="rc-section">
        <div className="rc-section-head">
          <h2 className="rc-section-title">🏆 Personal bests</h2>
        </div>

        {bests.length === 0 ? (
          <p className="rc-empty">
            Nothing logged yet. “Add record” takes a name, a figure and a date.
          </p>
        ) : (
          <ul className="rc-bests">
            {shownBests.slice(0, TOP_BESTS).map((best) => (
              <BestCard key={best.name} best={best}
                        onOpen={() => open('record', best.history[best.history.length - 1])} />
            ))}
          </ul>
        )}
      </section>

      {/* ---- 3. Category records ------------------------------------------ */}
      {cats.length > 0 && (
        <section className="rc-section">
          <div className="rc-section-head">
            <h2 className="rc-section-title">📚 Category records</h2>
            <div className="rc-chips">
              {['All', ...cats].map((name) => (
                <button key={name} type="button"
                        className={`rc-chip${category === name ? ' is-on' : ''}`}
                        onClick={() => setCategory(name)}>
                  {name}
                </button>
              ))}
            </div>
          </div>

          <ul className="rc-cats">
            {(category === 'All' ? cats : [category]).map((name) => {
              const inside = bests.filter((best) => best.category === name);
              if (inside.length === 0) return null;
              return (
                <li className="rc-cat" key={name}>
                  <h3>{name}</h3>
                  <ul>
                    {inside.slice(0, 6).map((best) => (
                      <li key={best.name}>
                        <button type="button" onClick={() => { setPick(best.name); }}>
                          <span>{best.name}</span>
                          <strong>{formatValue(best.value, best.unit, best.target)}</strong>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---- 4 & 5. Timeline and milestones ------------------------------- */}
      <div className="rc-two">
        <section className="rc-section">
          <h2 className="rc-section-title">📜 Record timeline</h2>
          {recent.length === 0 ? (
            <p className="rc-empty">Nothing dated yet.</p>
          ) : (
            <ol className="rc-timeline">
              {recent.map((row) => (
                <li key={row.id} className={row.kind === 'milestone' ? 'is-milestone' : ''}>
                  <span className="rc-tl-when">
                    {formatOn(row.achieved_on).replace(/, \d{4}$/, '').toUpperCase()}
                  </span>
                  <span className="rc-tl-dot" aria-hidden="true" />
                  <button type="button" className="rc-tl-body" onClick={() => open(row.kind, row)}>
                    <span className="rc-tl-name">
                      {row.name}
                      {row.kind === 'record' && (
                        <em> — {formatValue(row.value, row.unit, row.target)}</em>
                      )}
                    </span>
                    <span className="rc-tl-cat">{row.category || (row.kind === 'milestone' ? 'Milestone' : 'Record')}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rc-section">
          <div className="rc-section-head">
            <button
              type="button"
              className="rc-fold"
              aria-expanded={!milesShut}
              title={milesShut ? 'Show the milestones' : 'Hide the milestones'}
              onClick={() => setMilesShut((shut) => !shut)}
            >
              <Caret />
              <h2 className="rc-section-title">🏅 Milestones</h2>
              {milestones.length > 0 && <span className="rc-fold-n">{milestones.length}</span>}
            </button>
            <button type="button" className="rc-link" onClick={() => open('milestone')}>
              + Add
            </button>
          </div>
          {milesShut ? null : milestones.length === 0 ? (
            <p className="rc-empty">
              Something that happened once — no figure, just the fact.
            </p>
          ) : (
            <ul className="rc-miles">
              {keyMiles.map((key) => (
                <KeyRow
                  key={key.key}
                  entry={key}
                  open={Boolean(openKeys[key.key])}
                  onToggle={() => toggleKey(key.key)}
                  onPick={(row) => open('milestone', row)}
                />
              ))}
              {looseMiles.map((row) => (
                <li key={row.id} className={row.achieved_on ? 'is-done' : ''}>
                  <button type="button" onClick={() => open('milestone', row)}>
                    <span className="rc-mile-tick" aria-hidden="true">
                      {row.achieved_on ? '✓' : ''}
                    </span>
                    <span className="rc-mile-name">{row.name}</span>
                    <span className="rc-mile-when">{formatOn(row.achieved_on)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ---- 6. Record evolution ------------------------------------------ */}
      {bests.length > 0 && evolving && (
        <section className="rc-section">
          <div className="rc-section-head">
            <h2 className="rc-section-title">📈 Record evolution</h2>
            <select className="rc-select" value={evolving.name}
                    aria-label="Which record to plot"
                    onChange={(event) => setPick(event.target.value)}>
              {bests.map((best) => (
                <option key={best.name} value={best.name}>
                  {best.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rc-ev-wrap">
            <dl className="rc-ev-figs">
              <div>
                <dt>First record</dt>
                <dd>{formatValue(evolving.first, evolving.unit)}</dd>
              </div>
              <div>
                <dt>Latest best</dt>
                <dd>{formatValue(evolving.value, evolving.unit)}</dd>
              </div>
              <div>
                <dt>Improvement</dt>
                <dd className={evolving.gain > 0 ? 'is-up' : undefined}>
                  {evolving.gain > 0
                    ? gainText(evolving)
                    : formatValue(evolving.value - evolving.first, evolving.unit)}
                </dd>
              </div>
              {evolving.gain > 0 && evolving.percent > 0 && (
                <div>
                  <dt>Since the start</dt>
                  <dd className="is-up">↑ {Math.round(evolving.percent * 10) / 10}%</dd>
                </div>
              )}
            </dl>
            <Evolution best={evolving} />
          </div>
        </section>
      )}

      {/* ---- 7. Search and sort ------------------------------------------- */}
      {rows.length > 0 && (
        <section className="rc-section">
          <div className="rc-bar">
            <label className="rc-bar-field">
              <span>Search</span>
              <input type="search" placeholder="Search records…" value={query}
                     onChange={(event) => setQuery(event.target.value)} />
            </label>

            <div className="rc-bar-field">
              <span>Show</span>
              <div className="rc-chips">
                {([
                  ['all', 'All'],
                  ['records', 'Personal bests'],
                  ['milestones', 'Milestones'],
                ] as const).map(([value, label]) => (
                  <button key={value} type="button"
                          className={`rc-chip${show === value ? ' is-on' : ''}`}
                          onClick={() => setShow(value)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <label className="rc-bar-field">
              <span>Sort by</span>
              <select className="rc-select" value={sort}
                      onChange={(event) => setSort(event.target.value as Sort)}>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="improvement">Biggest improvement</option>
                <option value="category">Category</option>
              </select>
            </label>
          </div>

          {listed.length === 0 ? (
            <p className="rc-empty">Nothing matches that.</p>
          ) : (
            <ul className="rc-rows">
              {listed.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => open(row.kind, row)}>
                    <span className="rc-row-kind" aria-hidden="true">
                      {row.kind === 'milestone' ? '🏅' : '🏆'}
                    </span>
                    <span className="rc-row-name">{row.name}</span>
                    <span className="rc-row-cat">{row.category}</span>
                    <span className="rc-row-value">
                      {row.kind === 'record' ? formatValue(row.value, row.unit, row.target) : ''}
                    </span>
                    <span className="rc-row-when">{formatOn(row.achieved_on)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---- What Summit counted itself ------------------------------------
          The page as it was, kept whole and kept separate. See the header. */}
      <section className="rc-section rc-derived">
        <h2 className="rc-section-title">⚙️ Tracked automatically</h2>
        <p className="rc-note">
          Summit's own count. Nothing here is logged by hand.
        </p>

        {all.length < NEED_DAYS ? (
          <p className="rc-empty">
            Nothing to beat yet. Finish some work and this fills in.
          </p>
        ) : (
          <>
            <ul className="rc-cards">
              {derived.map((record) => (
                <DerivedCard key={record.key} record={record} />
              ))}
            </ul>

            {chase.length > 0 && (
              <>
                <h3 className="rc-sub-title">Next records to go for</h3>
                <ul className="rc-chases">
                  {chase.map((row) => (
                    <ChaseRow key={row.key} row={row} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>

      <RecordModal
        open={modal.open}
        entry={modal.entry}
        kind={modal.kind}
        rows={rows}
        busy={busy}
        onClose={() => setModal({ open: false, kind: modal.kind })}
        onSave={(draft) => void saveRecord(draft)}
        onDelete={(entry) => void deleteRecord(entry)}
      />
    </div>
  );
}
