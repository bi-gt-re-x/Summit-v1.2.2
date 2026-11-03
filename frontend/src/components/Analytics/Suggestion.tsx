/**
 * The last part of every insight: what the figures suggest, and what to try.
 *
 * An insight here reads in three parts. The headline says what's going on, the
 * figures back it up, and this row says what it means and where to go next.
 * Without this row a card is only a fact, and the reader has to do the work.
 */
import { Figures } from './Figures';

export function Suggestion({ text }: { text: string }) {
  return (
    <p className="ax-suggest">
      <svg
        className="ax-suggest-icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 18h6M10 21h4" />
        <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" />
      </svg>
      <span>
        <Figures text={text} />
      </span>
    </p>
  );
}
