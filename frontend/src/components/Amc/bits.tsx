/**
 * The small pieces every AMC page shares: difficulty pips, status pills, the
 * category dot, a problem row, a page header, and the answer panel.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORY_TONE, type CategoryId, type ProblemSummary, type Status } from '@/services/amc';
import { MathText } from './MathText';

export function Difficulty({ value, label = true }: { value: number; label?: boolean }) {
  return (
    <span className="am-diff" title={`Difficulty ${value} of 5`} aria-label={`Difficulty ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= value ? 'on' : ''} />
      ))}
      {label && <span className="am-diff-num">{value}</span>}
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
        <Difficulty value={problem.difficulty} label={false} />
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
  solution?: string;
  insight?: string;
  trap?: string;
}) {
  if (!solution) return null;
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
        <MathText text={solution} as="p" />
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
