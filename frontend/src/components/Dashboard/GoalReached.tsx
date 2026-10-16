/**
 * The two moments a day can be won, and the celebration for them.
 *
 * The dashboard has asked for a daily XP goal since the account was made and a
 * daily focus goal since the panel existed, and until now reaching either of
 * them looked exactly like not reaching it: a bar arrived at its end and
 * nothing said so. A goal nobody is told they have met is a number, not a goal.
 *
 * ## Crossing, not exceeding
 *
 * `useCrossing` fires on the *transition* — the reading before was under and
 * this one is not. That distinction is the whole of the bookkeeping, and it is
 * why none of this needs to be remembered anywhere. Reload the page at 300 XP
 * against a 200 goal and the first reading is already over the line, so there
 * is no crossing and no popup; finish the task that takes you from 180 to 210
 * with the page open and there is. Nothing is written to storage, nothing is
 * counted, and the same day cannot be celebrated twice by refreshing it.
 *
 * The first reading is deliberately never a crossing. Both figures start at a
 * placeholder — today's XP is zero until the account's tasks land, and a focus
 * total is read from localStorage before the server confirms it — and treating
 * that first jump as a crossing would fire the popup on every load for anyone
 * who had already met their goal.
 *
 * ## The popup lets go on its own
 *
 * A focus goal is usually crossed *while somebody is working*, which is the
 * worst possible moment to demand a click. So the card dismisses itself after a
 * few seconds, and Escape, the button and the backdrop all take it away sooner.
 * It is not `aria-modal` and it traps nothing: the page underneath is still the
 * page, and this is an announcement rather than a question.
 *
 * The confetti is skipped outright when the reader has asked for less motion,
 * rather than being animated at the near-zero duration the global rule in
 * styles/preferences.css would give it — forty nodes flickering into existence
 * and out again is not a quieter version of the same thing.
 */
import { useEffect, useMemo, useRef } from 'react';
import { reduced } from '@/utils/homePlay';

export type GoalKind = 'xp' | 'focus';

/** How long the card stays before it takes itself away. */
const SHOW_MS = 5200;

/** Enough to read as a shower and cheap enough to be free. */
const PIECES = 46;

const COLOURS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#38bdf8', '#a855f7'];

const WORDS: Record<GoalKind, { title: string; line: (reached: string, target: string) => string }> = {
  xp: {
    title: 'Daily goal reached',
    line: (reached, target) => `${reached} today. Your goal was ${target}.`,
  },
  focus: {
    title: 'Focus goal reached',
    line: (reached, target) => `${reached} focused today. Your goal was ${target}.`,
  },
};

export interface GoalReachedProps {
  kind: GoalKind;
  /** The goal, spelled the way the reader set it — "200 XP", "2h". */
  target: string;
  /** Where they actually got to, which is usually past it. */
  reached: string;
  onClose: () => void;
}

export function GoalReached({ kind, target, reached, onClose }: GoalReachedProps) {
  const words = WORDS[kind];

  // Rolled once: re-rolling on a re-render would make every piece jump to a
  // new column mid-fall. The same reason LevelUp rolls its sparks once.
  const pieces = useMemo(() => {
    if (reduced) return [];
    return Array.from({ length: PIECES }, (_, index) => ({
      left: Number((Math.random() * 100).toFixed(2)),
      drift: Math.round(Math.random() * 160 - 80),
      spin: Math.round(Math.random() * 900 - 450),
      delay: Number((Math.random() * 1.1).toFixed(2)),
      fall: Number((2.2 + Math.random() * 1.6).toFixed(2)),
      size: Math.round(6 + Math.random() * 5),
      colour: COLOURS[index % COLOURS.length] as string,
      round: index % 4 === 0,
    }));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(onClose, SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);

  return (
    <div className="goalfx" onMouseDown={onClose}>
      <div className="goalfx-sky" aria-hidden="true">
        {pieces.map((piece, index) => (
          <i
            key={index}
            className={`goalfx-bit${piece.round ? ' is-round' : ''}`}
            style={
              {
                left: `${piece.left}%`,
                width: `${piece.size}px`,
                height: `${piece.size}px`,
                background: piece.colour,
                animationDelay: `${piece.delay}s`,
                animationDuration: `${piece.fall}s`,
                '--drift': `${piece.drift}px`,
                '--spin': `${piece.spin}deg`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div
        className="goalfx-card"
        role="status"
        aria-live="polite"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="goalfx-mark" aria-hidden="true">
          {kind === 'xp' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="4.5" />
              <circle cx="12" cy="12" r="0.6" />
            </svg>
          )}
        </span>
        <h2 className="goalfx-title">{words.title}</h2>
        <p className="goalfx-line">{words.line(reached, target)}</p>
        <button type="button" className="goalfx-go" onClick={onClose}>
          Keep going
        </button>
      </div>
    </div>
  );
}

/**
 * Call `onCross` the moment `value` goes from under `goal` to at or over it.
 *
 * `live` is what holds the ground reading back until the figure means
 * something: called with false, nothing is recorded at all, so the first
 * reading taken once it turns true is the real one rather than the placeholder
 * that was on screen before the data landed.
 *
 * `onCross` should be stable, but nothing breaks if it is not — a second run
 * over an unchanged value compares the value against itself and finds no
 * crossing.
 */
export function useCrossing(
  value: number,
  goal: number,
  live: boolean,
  onCross: () => void,
): void {
  const before = useRef<number | null>(null);

  useEffect(() => {
    if (!live || !(goal > 0)) return;
    const previous = before.current;
    before.current = value;
    if (previous === null) return;
    if (previous < goal && value >= goal) onCross();
  }, [goal, live, onCross, value]);
}

/** What one crossing has to say for itself. */
export interface GoalNews {
  kind: GoalKind;
  target: string;
  reached: string;
}
