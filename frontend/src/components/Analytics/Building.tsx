/**
 * What a tab shows while it is still filling up.
 *
 * ## Not a lock
 *
 * This was called `Locked`, and the word was wrong in a way that cost more
 * than it looks. A lock is a feature entitlement — something exists, someone
 * else has it, and you do not. None of that is true here. The tab is empty
 * because the *answer does not exist yet*, and there is no version of this
 * product where paying, clicking or asking produces it sooner. The only thing
 * that fills it is the reader's own record getting longer.
 *
 * A padlock told them the opposite: that Summit was holding something back.
 * So the vocabulary is `building` throughout — on screen, in the class names
 * and in this file's name — because a reader who thinks a tab is withheld
 * reads every empty panel as a sales page, and one who knows it is filling
 * reads the same panel as a reason to come back.
 *
 * It replaces the sample data that came before either name. Four tabs used to
 * fall back to invented figures behind a small chip, which was the wrong trade
 * twice over: a new account's first impression of the analysis was a screen of
 * numbers that were not about them, and the chip was a footnote against a full
 * page of confident charts. The lesson a reader took from it was that the
 * figures here are set dressing — and that lesson stuck to the real ones later.
 *
 * ## Saying what it will answer, not what it will contain
 *
 * The list used to name parts — "Routines, counted", "Your hours, week and
 * rhythm". Those describe a panel to somebody who has already seen it, and
 * mean nothing to the reader who has not. A reader on day two does not want to
 * know that a tab contains a correlation table; they want to know whether it
 * will tell them when they work best.
 *
 * So the list is **questions**, in the reader's own terms, and it is the most
 * persuasive thing on the screen — the one place the product gets to say what
 * it is for while it cannot yet demonstrate it. `asksLead` sets the grammar so
 * the items can stay short.
 *
 * ## The three states
 *
 * - **Building** (`kind: 'history'`, `remaining` > 0). The record is too
 *   short. Show what it will answer, then how far along it is. Not a date: the
 *   count is in days with work on them, and how soon that is depends on how
 *   often the reader turns up.
 * - **Nothing found** (`kind: 'history'`, `remaining` = 0). The record is long
 *   enough and the analysis genuinely produced nothing. That is a real result
 *   and gets said plainly rather than dressed as a wait: an account with an
 *   even week and no gaps has nothing to fix on those counts, and deserves to
 *   hear it.
 * - **Problem** (`kind: 'problem'`). Something failed. Deliberately separate,
 *   because the other two are about a record that is simply short and this one
 *   is not — Growth used to borrow the waiting state for a failed load, with
 *   `need` and `have` set to 1 and 0 so the meter would read "0 / 1", and told
 *   a reader whose request had errored that they needed to work one more day.
 *   No meter here, and no day count: there is no number of days that fixes it.
 */
import { ActiveDayNote } from './Collecting';
import type { ReactNode } from 'react';

export interface BuildingProps {
  /** The tab's own name, as the reader sees it in the bar. */
  title: string;
  /**
   * Why this tab has nothing on it. See the three states above.
   *
   * `'history'` is the default and the case the thresholds exist for.
   * `'problem'` is a failure, and takes none of the day-count furniture.
   */
  kind?: 'history' | 'problem';
  /**
   * Days of history still needed, or 0 when the record is long enough and the
   * analysis simply found nothing. Ignored when `kind` is `'problem'`.
   */
  remaining?: number;
  /** How many days this tab needs in total — printed as the bar's end. */
  need?: number;
  /** How many the account has. */
  have?: number;
  /**
   * The opening line, when the default is not true.
   *
   * Only `'problem'` should need this: the building state's headline is the
   * same sentence every time on purpose, because it is the one thing every
   * gated tab has to get across and four wordings of it would read as four
   * different policies.
   */
  headline?: string;
  /** A short clause on why the wait is this long. Kept to one line. */
  promise: string;
  /** One line introducing the list, and setting its grammar. */
  asksLead: string;
  /** What this tab will answer, as questions the reader would ask. */
  asks: string[];
  /**
   * What to say when there are enough days and still no findings. Required for
   * that state, because the honest sentence is different every time and a
   * generic one would be the placeholder problem again in one line.
   */
  emptyMessage?: string;
  /** A way out of the dead end — usually a link to something to go do. */
  action?: ReactNode;
}

/**
 * The questions, under their lead. Shared by all three states: a tab that
 * failed to load and a tab that is still filling are both worth explaining,
 * and the explanation is the same one.
 */
function Asks({ lead, asks }: { lead: string; asks: string[] }) {
  if (asks.length === 0) return null;
  return (
    <div className="ax-building-asks">
      <p className="ax-building-asks-lead">{lead}</p>
      <ul className="ax-building-list">
        {asks.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

export function Building({
  title,
  kind = 'history',
  remaining = 0,
  need = 0,
  have = 0,
  headline,
  promise,
  asksLead,
  asks,
  emptyMessage,
  action,
}: BuildingProps) {
  // Something failed. Not a wait, and nothing here counts days.
  if (kind === 'problem') {
    return (
      <section className="ax-building ax-building-problem">
        <div className="ax-building-body">
          <p className="ax-building-eyebrow">{title}</p>
          <h2>{headline ?? 'Summit could not read your record for this.'}</h2>
          <p className="ax-building-lead">{promise}</p>
          <Asks lead={asksLead} asks={asks} />
          {action && <div className="ax-building-action">{action}</div>}
        </div>
      </section>
    );
  }

  // Enough history, nothing found. Not a wait — a result.
  if (remaining <= 0) {
    return (
      <section className="ax-building ax-building-empty">
        <div className="ax-building-body">
          <h2>Nothing to report.</h2>
          <p className="ax-building-lead">
            {emptyMessage ?? 'Your record is long enough. Nothing in it stands out.'}
          </p>
          {action && <div className="ax-building-action">{action}</div>}
        </div>
      </section>
    );
  }

  const pct = Math.max(0, Math.min(100, Math.round((have / need) * 100)));

  return (
    <section className="ax-building">
      <div className="ax-building-body">
        <p className="ax-building-eyebrow">
          {title}
          <span className="ax-building-chip">Building</span>
        </p>

        {/* The same sentence on every gated tab, and the whole point of the
            rename: what is missing is the reader's history, not a permission.
            The number used to be the headline, which answered "how long" to
            somebody who had not yet been told "why". It is still here, under
            the meter, where a countdown belongs. */}
        <h2>Summit needs more of your history to answer this.</h2>
        <p className="ax-building-lead">{promise}</p>

        {/* Before the meter, not after it. This is the reason to wait, and a
            reader who has already read a progress bar has decided how they
            feel about the tab by the time they reach it. */}
        <Asks lead={asksLead} asks={asks} />

        <div
          className="ax-building-meter"
          role="img"
          aria-label={`${have} of ${need} days with work on them`}
        >
          <span className="ax-building-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="ax-building-count">
          <strong>
            {have} / {need}
          </strong>{' '}
          active days
        </p>
        {/* No date. This used to read "Opens November 3", computed as today
            plus `remaining` — which was only ever right for somebody who works
            every single day, and told everybody else a date that came and went
            with the tab still shut. `remaining` counts days with work on them
            now (see utils/dataMaturity), so the honest sentence is the one
            that names the condition instead of guessing when it is met. */}
        <p className="ax-building-remaining">
          {remaining === 1 ? 'One more day' : `${remaining} more days`} with work on{' '}
          {remaining === 1 ? 'it' : 'them'}, whenever you do them.
        </p>
        {/* What "with work on them" means, spelled out. The count above is the
            only number on this screen and a reader has no way to check it
            against their own week without the rule. See ./Collecting. */}
        <ActiveDayNote />

        {action && <div className="ax-building-action">{action}</div>}
      </div>
    </section>
  );
}
