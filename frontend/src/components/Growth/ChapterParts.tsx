/**
 * The shapes every chapter is built from.
 *
 * Four tabs that are not Overview, one set of parts. They were private to
 * Chapters.tsx while Long Term was the only chapter with anything in it; they
 * are here now because Focus, Skills and Benchmarks all draw the same tiles,
 * the same bar rows and the same insight notes, and three copies of a bar row
 * is how three tabs stop looking like one product.
 *
 * Nothing in this file computes anything. Every figure arrives worked out — see
 * utils/growthChapters, growthFocus, growthSkills, growthBench — and these turn
 * figures into rows and coordinates. That split is the same one GrowthPanels
 * keeps, and it is what stops two panels on one screen disagreeing about a
 * number they both show.
 */
import type { ReactNode } from 'react';
import { CountValue, Glyph, Hint } from './GrowthPanels';

/** The box the small charts draw into. Arbitrary; only ratios survive. */
export const W = 100;
export const H = 100;

/** One tone per position, so four tiles in a row are four colours. */
const TONES = ['xp', 'tasks', 'perday', 'focus'] as const;

// --------------------------------------------------------------------------
// Panel head
// --------------------------------------------------------------------------
export interface PanelHeadProps {
  title: string;
  /** The ⓘ text. Every panel that counts something in a particular way has one. */
  hint?: string;
  /** A glyph before the title. */
  icon?: string;
  /** The quiet line at the right end — a scope, usually. */
  note?: string;
  /** Anything else that belongs on the right: a segmented control, a link. */
  children?: ReactNode;
}

/**
 * A title, what it is counting, and whatever governs it.
 *
 * One component rather than the four-line block it replaced, because a chapter
 * is fifteen panels and every one of them was rebuilding the same flex row.
 */
export function PanelHead({ title, hint, icon, note, children }: PanelHeadProps) {
  return (
    <div className="gr-panel-head">
      <h2 className="gr-panel-title">
        {icon && (
          <span className="gr-panel-ico" aria-hidden="true">
            <Glyph name={icon} size={14} />
          </span>
        )}
        {title}
        {hint && <Hint text={hint} />}
      </h2>
      {note && <span className="gr-panel-note">{note}</span>}
      {children}
    </div>
  );
}

// --------------------------------------------------------------------------
// The hero row
// --------------------------------------------------------------------------
export interface HeroSpec {
  key: string;
  label: string;
  /** Null when nothing in the account backs it — the card says so rather than
   *  printing a zero, which would read as a bad score instead of no score. */
  value: number | null;
  /**
   * A figure that is already a string, for the ones that are not whole numbers.
   * The count-up settles on `Math.round`, which turns a continuous level of
   * 4.37 into a 4 — so a card showing one hands the text over instead and gives
   * up the tween.
   */
  text?: string;
  /** "%" — what sits immediately after the figure, in the same type. */
  suffix?: string;
  /** "/ 100" — the quiet denominator beside it, where the figure is a score. */
  scale?: string;
  /** A letter, where the figure is a score. */
  grade?: string | null;
  /**
   * Points against an earlier reading of the same figure.
   *
   * Three states, and the difference matters: a number is the change, `null` is
   * "this figure has an earlier reading and there is not enough history for
   * one yet", and leaving it off is "this figure is not the kind of thing that
   * has one" — a pace or a level today is a statement about now, and a card
   * that says "no earlier reading" under it is answering a question nobody
   * asked.
   */
  delta?: number | null;
  /** What the delta is measured against: "vs 3 months ago". */
  against?: string;
  /** The sentence the figure is. */
  foot: string;
  icon: string;
}

export interface HeroRowProps {
  cards: HeroSpec[];
}

/**
 * The four large figures a chapter opens on.
 *
 * Deliberately not the tile grid the panels use. A chapter's opening line
 * should read as a headline and a tile reads as a statistic, and the difference
 * between the two is mostly size: these are one row of four across the whole
 * page, at twice the type, with the letter grade beside the number.
 *
 * The figures count up on arrival for the reason every figure on this page does
 * — see `CountValue` — and a card with no value shows a dash, because an
 * account that has never planned a task has no follow-through score and a zero
 * would be a different claim entirely.
 */
export function HeroRow({ cards }: HeroRowProps) {
  return (
    <div className="gr-hero">
      {cards.map((card, index) => {
        const tone = TONES[index % TONES.length]!;
        return (
          <section className={`gr-hero-card tone-${tone}`} key={card.key}>
            <div className="gr-hero-top">
              <span className={`gr-hero-ico tone-${tone}`} aria-hidden="true">
                <Glyph name={card.icon} size={16} />
              </span>
              <span className="gr-hero-label">{card.label}</span>
            </div>

            <div className="gr-hero-figure">
              {card.value === null ? (
                <strong className="gr-hero-value is-none">—</strong>
              ) : card.text !== undefined ? (
                <strong className="gr-hero-value">{card.text}</strong>
              ) : (
                <CountValue
                  className="gr-hero-value"
                  value={card.value}
                  suffix={card.suffix ?? ''}
                />
              )}
              {card.value !== null && card.scale && (
                <span className="gr-hero-scale">{card.scale}</span>
              )}
              {card.grade && <span className={`gr-hero-grade g-${card.grade[0]}`}>{card.grade}</span>}
            </div>

            <p className="gr-hero-foot">{card.foot}</p>

            {card.delta === undefined ? null : card.delta === null ? (
              <span className="gr-hero-trend is-quiet">no earlier reading</span>
            ) : (
              <span className={`gr-hero-trend${card.delta >= 0 ? ' is-up' : ' is-down'}`}>
                <span aria-hidden="true">{card.delta >= 0 ? '↑' : '↓'}</span>{' '}
                {Math.abs(card.delta)} {Math.abs(card.delta) === 1 ? 'pt' : 'pts'}
                {card.against ? ` ${card.against}` : ''}
              </span>
            )}
          </section>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------------
// Tiles, bars, notes
// --------------------------------------------------------------------------
export interface TileSpec {
  key: string;
  label: string;
  value: number;
  suffix?: string;
  icon: string;
  foot?: string;
}

/**
 * The four-up figure grid the Growth Summary uses, without the sparklines.
 *
 * The values count up on arrival for the reason the summary's do — see
 * `CountValue` — and the tone follows position rather than meaning, because
 * these tiles hold different things on every chapter and a fixed colour per
 * concept would need a concept list this component cannot have.
 */
export function Tiles({ tiles }: { tiles: TileSpec[] }) {
  return (
    <div className="gr-tiles">
      {tiles.map((tile, index) => {
        const tone = TONES[index % TONES.length]!;
        return (
          <div className={`gr-tile tone-${tone}`} key={tile.key}>
            <div className="gr-tile-top">
              <span className={`gr-tile-ico tone-${tone}`} aria-hidden="true">
                <Glyph name={tile.icon} size={15} />
              </span>
              <CountValue
                className="gr-tile-value"
                value={tile.value}
                suffix={tile.suffix ?? ''}
              />
            </div>
            <span className="gr-tile-label">{tile.label}</span>
            {tile.foot && <span className="gr-tile-foot is-quiet">{tile.foot}</span>}
          </div>
        );
      })}
    </div>
  );
}

export interface BarRow {
  key: string;
  name: string;
  /** The figure printed between the name and the bar. */
  note: string;
  /** 0-100. */
  percent: number;
  /** What is printed at the right end. */
  tail: string;
  tone?: string;
}

/** The Skills Progress row — name, figure, bar, tail — with real numbers in it. */
export function Bars({ rows }: { rows: BarRow[] }) {
  return (
    <ul className="gr-skill-list">
      {rows.map((row) => (
        <li className="gr-skill" key={row.key}>
          <span className="gr-skill-name">{row.name}</span>
          <span className="gr-skill-level">{row.note}</span>
          <span className="gr-skill-track">
            <i
              className={`gr-skill-fill${row.tone ? ` tone-${row.tone}` : ''}`}
              style={{ width: `${Math.max(0, Math.min(100, row.percent))}%` }}
            />
          </span>
          <span className="gr-skill-pct">{row.tail}</span>
        </li>
      ))}
    </ul>
  );
}

export interface NoteRow {
  tone: 'good' | 'watch' | 'note';
  icon: string;
  head: string;
  hint: string;
}

/** The Insights row — an icon, a headline, a line of explanation. */
export function Notes({ rows }: { rows: NoteRow[] }) {
  return (
    <ul className="gr-insight-list">
      {rows.map((row) => (
        <li className={`gr-insight tone-${row.tone}`} key={row.head}>
          <span className={`gr-insight-ico tone-${row.tone}`} aria-hidden="true">
            <Glyph name={row.icon} size={15} />
          </span>
          <div>
            <p className="gr-insight-head">{row.head}</p>
            <p className="gr-insight-hint">{row.hint}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A panel with nothing to draw yet, in the page's own voice. */
export function Empty({ title, message }: { title: string; message: string }) {
  return (
    <section className="gr-panel">
      <h2 className="gr-panel-title">{title}</h2>
      <p className="gr-empty">{message}</p>
    </section>
  );
}

/** A whole chapter with nothing to draw yet. */
export function EmptyChapter({ title, message }: { title: string; message: string }) {
  return (
    <div className="gr-grid">
      <Empty title={title} message={message} />
    </div>
  );
}

// --------------------------------------------------------------------------
// Segmented control
// --------------------------------------------------------------------------
export interface SegProps<T extends string> {
  value: T;
  options: ReadonlyArray<{ key: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}

/** The 30/90 switch the heatmap carries, for any panel with a window of its own. */
export function Seg<T extends string>({ value, options, onChange, label }: SegProps<T>) {
  return (
    <div className="gr-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          className={`gr-seg-opt${option.key === value ? ' is-active' : ''}`}
          aria-pressed={option.key === value}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------
// Axis labels
// --------------------------------------------------------------------------
/**
 * Which points on a bucketed axis get their month printed under them.
 *
 * The same rule `LongTermChart` uses, and worth keeping identical: print a
 * label only where the month changes, and only if there is room since the last
 * one. Two rules combined with AND rather than one after the other is what
 * printed a single label on a two-year axis — a bucket has to be both a new
 * month *and* on a multiple of n, and those rarely coincide.
 */
export function monthMarks(labels: string[]): Array<{ label: string; index: number }> {
  const every = Math.max(1, Math.ceil(labels.length / 6));
  const marks: Array<{ label: string; index: number }> = [];
  labels.forEach((label, index) => {
    const last = marks[marks.length - 1];
    if (last && (label === last.label || index - last.index < every)) return;
    marks.push({ label, index });
  });
  return marks;
}
