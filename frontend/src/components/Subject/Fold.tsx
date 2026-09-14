/**
 * A section of the evidence, shut until it is wanted.
 *
 * ## What this is fixing
 *
 * The subject page was fourteen panels deep. Every one of them was true and
 * counted, and the whole of it was about eight screens — so the reader who
 * came to find out how a subject was going scrolled past twelve panels they
 * had not asked for to reach the two they had. Length was doing the opposite
 * of what all that evidence was for: a page nobody reaches the bottom of is a
 * page whose bottom half may as well not be counted.
 *
 * The answer is not to delete the evidence. It is to stop making the reader
 * *walk through* it. Everything above the Evidence rule stays open and is the
 * page; everything below it is one of these, and a reader opens the two they
 * want to argue with.
 *
 * ## The headline is the point, not the chevron
 *
 * A row of collapsed titles is a filing cabinet. `figures` is what keeps this
 * from being one: the shut row states its own answer — "falls off at Hard",
 * "12.4h", "3 of 4 reached" — so the reader learns what is inside without
 * opening it, and opens only the one whose figure surprised them. A disclosure
 * that has to be opened to find out whether it is worth opening has moved the
 * work rather than saved it.
 *
 * `lead` is the same idea one level in: the first line inside is the reading,
 * and the charts and tables under it are why. Both halves of "important
 * information at the top" — the top of the page, and the top of every fold.
 *
 * ## Shut has to mean shut
 *
 * The collapse is a grid row going to `0fr` with `overflow: hidden`, which
 * hides the content from the eye and from nothing else — it stays in the
 * accessibility tree and in the tab order. `inert` is what actually closes it.
 * Same bargain, and the same reasoning, as `PanelGroup` in
 * components/Analytics/charts; the tests for that are in
 * components/Analytics/disclosure.test.tsx.
 *
 * This is a second component rather than a use of that one because the head
 * is a different object: `PanelGroup` has a title and a note, and the figures
 * are the whole reason this exists.
 */
import { useState, type ReactNode } from 'react';

export interface FoldFigure {
  /** What it is. Two or three words — it sits under the value at 11px. */
  label: string;
  /** The figure itself. Already formatted; this draws what it is given. */
  value: string;
  /**
   * Colours the value. `plain` is the default and is most of them — a row
   * where every figure is coloured is a row with no emphasis in it.
   */
  tone?: 'plain' | 'good' | 'warn' | 'bad';
}

export function Fold({
  title,
  note,
  figures = [],
  lead,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** One short line saying what the fold answers. Always visible. */
  note: string;
  /** Up to three, and three is already a lot. Visible while shut. */
  figures?: FoldFigure[];
  /** The reading, at the top of the body. The rest of the body is why. */
  lead?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`sb-fold${open ? ' is-open' : ''}`}>
      {/* The button sits *inside* the heading rather than round it: the title
          is what a reader moving by heading is looking for, and a heading
          wrapping the control is the shape that gives them both. */}
      <h3 className="sb-fold-heading">
        <button
          type="button"
          className="sb-fold-head"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        >
          <span className="sb-fold-name">
            <strong>{title}</strong>
            <span className="sb-fold-note">{note}</span>
          </span>

          {figures.length > 0 && (
            <span className="sb-fold-figures">
              {figures.map((figure) => (
                <span key={figure.label} className={`sb-fold-figure is-${figure.tone ?? 'plain'}`}>
                  <strong>{figure.value}</strong>
                  <em>{figure.label}</em>
                </span>
              ))}
            </span>
          )}

          <span className="sb-fold-toggle" aria-hidden="true">
            <svg viewBox="0 0 12 12" width="12" height="12">
              <path d="M2 4.5 L6 8.5 L10 4.5" fill="none" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      </h3>

      <div className="sb-fold-body" inert={!open}>
        <div>
          {lead && <p className="sb-fold-lead">{lead}</p>}
          {children}
        </div>
      </div>
    </section>
  );
}
