/**
 * The small pieces every AMC page shares: difficulty pips, status pills, the
 * category dot, a problem row, a page header, and the answer panel.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORY_TONE, type CategoryId, type Pill, type ProblemSummary, type Status } from '@/services/amc';
import { MathText } from './MathText';

/**
 * Difficulty: five pips for where it would sit on a real AMC 10 (1 = #1-5,
 * 5 = #21-25 and up), and the AoPS competition-scale rating beside them.
 */
export function Difficulty({ value, rating, label = true }: { value: number; rating?: number | null; label?: boolean }) {
  const text = rating != null ? `AoPS rating ${rating} (difficulty ${value} of 5)` : `Difficulty ${value} of 5`;
  return (
    <span className="am-diff" title={text} aria-label={text}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= value ? 'on' : ''} />
      ))}
      {label && <span className="am-diff-num">{rating != null ? `AoPS ${rating}` : value}</span>}
    </span>
  );
}

const STATUS_LABEL: Record<Status, string> = {
  new: 'New',
  solved: 'Solved',
  missed: 'Missed',
  review: 'In review',
};

export function StatusPill({ status }: { status: Status }) {
  return <span className={`am-pill am-pill-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function CategoryDot({ category }: { category: CategoryId }) {
  return <i className={`am-dot am-tone-${CATEGORY_TONE[category]}`} aria-hidden="true" />;
}

export function ProblemRow({ problem, extra }: { problem: ProblemSummary; extra?: ReactNode }) {
  return (
    <Link to={`/problems/${problem.id}`} className="am-row">
      <div className="am-row-main">
        <div className="am-row-head">
          <CategoryDot category={problem.category} />
          <strong>{problem.source}</strong>
          <span className="am-muted">{problem.topic_name}</span>
        </div>
        <p className="am-row-preview">{problem.preview}</p>
      </div>
      <div className="am-row-side">
        {extra}
        <Difficulty value={problem.difficulty} rating={problem.rating} label={false} />
        <StatusPill status={problem.status} />
      </div>
    </Link>
  );
}

/** The page's heading, standing on the page as the paper look's headers do. */
export function PageHeader({
  title,
  kicker,
  children,
  actions,
}: {
  title: string;
  kicker?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="am-hero">
      <div>
        {kicker && <p className="am-kicker">{kicker}</p>}
        <h1 className="am-title">{title}</h1>
        {children && <div className="am-hero-text">{children}</div>}
      </div>
      {actions && <div className="am-hero-actions">{actions}</div>}
    </header>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="am-empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

/** A bar from 0 to 1. */
export function Meter({ value, tone = 'sage' }: { value: number; tone?: string }) {
  const width = Math.max(0, Math.min(1, value)) * 100;
  return (
    <span className={`am-meter am-meter-${tone}`} role="progressbar" aria-valuenow={Math.round(width)}
          aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${width}%` }} />
    </span>
  );
}

/**
 * Five choice buttons, or an integer box for an AIME problem. Controlled:
 * `value` is the letter or the digits, and `locked` freezes it once graded.
 */
export function AnswerInput({
  choices,
  value,
  onChange,
  locked = false,
  correct,
  given,
  onSubmit,
  autoFocus = false,
}: {
  choices: string[] | null;
  value: string;
  onChange: (value: string) => void;
  locked?: boolean;
  correct?: string | number;
  given?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
}) {
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus && !choices) box.current?.focus();
  }, [autoFocus, choices]);

  if (!choices) {
    const right = correct != null && given != null ? String(correct) === given : null;
    return (
      <div className="am-int">
        <input
          ref={box}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          placeholder="000"
          aria-label="Your answer, an integer from 000 to 999"
          className={right == null ? '' : right ? 'is-right' : 'is-wrong'}
          value={value}
          disabled={locked}
          onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && onSubmit) onSubmit();
          }}
        />
        {correct != null && right === false && (
          <span className="am-int-key">Answer: {String(correct).padStart(3, '0')}</span>
        )}
      </div>
    );
  }
  return (
    <div className="am-choices" role="radiogroup" aria-label="Answer choices">
      {choices.map((choice, i) => {
        const letter = 'ABCDE'.charAt(i);
        const picked = value === letter;
        let state = '';
        if (correct != null) {
          if (letter === correct) state = ' is-right';
          else if (letter === given) state = ' is-wrong';
        }
        return (
          <button
            key={letter}
            type="button"
            role="radio"
            aria-checked={picked}
            className={`am-choice${picked ? ' is-picked' : ''}${state}`}
            disabled={locked}
            onClick={() => onChange(picked ? '' : letter)}
          >
            <span className="am-choice-letter">{letter}</span>
            <MathText text={choice} className="am-choice-text" />
          </button>
        );
      })}
    </div>
  );
}

/** Seconds since mount, paused while the tab is hidden. */
export function useStopwatch(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);
  return [seconds, setSeconds] as const;
}

export function clock(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return h ? `${h}:${mm}:${String(sec).padStart(2, '0')}` : `${mm}:${String(sec).padStart(2, '0')}`;
}

export function Solution({
  solution,
  insight,
  trap,
}: {
  solution?: string | string[] | null;
  insight?: string | null;
  trap?: string | null;
}) {
  if (!solution || (Array.isArray(solution) && !solution.length)) return null;
  const steps = Array.isArray(solution) ? solution : [solution];
  return (
    <div className="am-solution">
      {insight && (
        <div className="am-callout am-callout-insight">
          <span>Key insight</span>
          <MathText text={insight} as="p" />
        </div>
      )}
      <div className="am-solution-body">
        <h3>Solution</h3>
        {steps.length === 1 ? (
          <MathText text={steps[0] ?? ''} as="p" />
        ) : (
          <ol className="am-steps-solution">
            {steps.map((step, i) => (
              <li key={i}>
                <span className="am-step-num">Step {i + 1}</span>
                <MathText text={step} as="div" />
              </li>
            ))}
          </ol>
        )}
      </div>
      {trap && (
        <div className="am-callout am-callout-trap">
          <span>The trap</span>
          <MathText text={trap} as="p" />
        </div>
      )}
    </div>
  );
}

/**
 * An official problem's figure. Asymptote can't be drawn in the browser, so the
 * page says so plainly and keeps the source a click away for anyone who reads
 * Asymptote.
 */
export function DiagramNote({ diagram }: { diagram: string }) {
  return (
    <div className="am-callout am-callout-trap am-diagram">
      <span>Figure</span>
      <p>This problem comes with a diagram that Summit can't draw yet. Sketch it from the description.</p>
      {diagram !== 'image' && (
        <details>
          <summary>Asymptote source</summary>
          <pre>{diagram}</pre>
        </details>
      )}
    </div>
  );
}

/**
 * A topic's or a strategy's problems as wrapping rows of pills: the short
 * label, coloured by status, easiest first. Each pill opens the problem.
 */
export function ProblemPills({ pills, empty = 'No problems yet.' }: { pills: Pill[]; empty?: string }) {
  if (!pills.length) return <p className="am-muted am-pills-empty">{empty}</p>;
  return (
    <div className="am-pills">
      {pills.map((p) => (
        <Link key={p.id} to={`/problems/${p.id}`} className={`am-pill-link is-${p.status}`}
              title={`${p.title} — ${STATUS_LABEL[p.status]}, AoPS rating ${p.rating ?? p.difficulty}`}>
          <i className={`am-pill-diff d${p.difficulty}`} aria-hidden="true" />
          {p.short}
        </Link>
      ))}
    </div>
  );
}

/** What the pill colours mean. */
export function PillLegend() {
  return (
    <div className="am-pill-legend" aria-label="Pill colours">
      {(['new', 'solved', 'missed', 'review'] as Status[]).map((s) => (
        <span key={s}><i className={`am-pill-swatch is-${s}`} />{STATUS_LABEL[s]}</span>
      ))}
      <span className="am-muted">Bar = difficulty</span>
    </div>
  );
}
