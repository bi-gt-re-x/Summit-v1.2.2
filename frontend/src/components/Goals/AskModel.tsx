/**
 * The one control on the goals page that asks a model for something.
 *
 * Four places offer a draft now — the card's two panels, the drawer's
 * checkpoint list, and the creation wizard — and they are all the same
 * promise: press it, and words you can edit appear where there were none. So
 * they are one component rather than four buttons that happen to look alike,
 * because the moment they stop looking alike the star stops meaning anything.
 *
 * The star is the mark. It is used by everything here that calls a model and
 * by nothing else in the app, so a reader learns it once.
 *
 * Nothing in this file knows what is being drafted or where it will be saved.
 * It takes a label, a busy flag and a function — the caller owns the request,
 * the write and the failure message, because those differ at all four doors
 * and the button does not.
 */

/** The four-point star. See the note above: it means "a model wrote this". */
export function Spark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.6l1.9 5.3a4 4 0 002.2 2.2l5.3 1.9-5.3 1.9a4 4 0 00-2.2 2.2L12 21.4l-1.9-5.3a4 4 0 00-2.2-2.2L2.6 12l5.3-1.9a4 4 0 002.2-2.2z" />
      <path d="M19 2.6l.7 1.9a1.6 1.6 0 00.9.9l1.9.7-1.9.7a1.6 1.6 0 00-.9.9L19 9.6l-.7-1.9a1.6 1.6 0 00-.9-.9L15.5 6l1.9-.7a1.6 1.6 0 00.9-.9z" opacity=".5" />
    </svg>
  );
}

export interface AskModelProps {
  label: string;
  /** A draft is on its way: the star turns and the label says so. */
  busy: boolean;
  onAsk: () => void;
  /**
   * Unpressable, but nothing is happening — an empty box above it, a page-wide
   * write in flight.
   *
   * Separate from `busy` on purpose, and the separation is not cosmetic:
   * folding "there is nothing to send yet" into the busy flag makes the button
   * read **Thinking…** while it sits there doing nothing, which is the app
   * claiming to be working on a request nobody made.
   */
  disabled?: boolean;
  /** The filled variant, for an empty panel where it is the only thing to do. */
  primary?: boolean;
  /** Overrides the default "a draft you can edit" tooltip where a door needs its own. */
  title?: string;
}

export function AskModel({
  label,
  busy,
  onAsk,
  disabled = false,
  primary = false,
  title,
}: AskModelProps) {
  return (
    <button
      type="button"
      className={`gx-ai${primary ? ' is-primary' : ''}${busy ? ' is-busy' : ''}`}
      disabled={busy || disabled}
      onClick={onAsk}
      /* Said on the control rather than in a line of body text beside it. The
         one thing a reader needs to know before pressing this is that nothing
         is final, and a sentence saying so at every door would be the same
         sentence three times on one screen. */
      title={title ?? `${label} — a draft you can rename, retime or delete`}
    >
      <span className="gx-ai-mark" aria-hidden="true">
        <Spark />
      </span>
      {busy ? 'Thinking…' : label}
    </button>
  );
}
