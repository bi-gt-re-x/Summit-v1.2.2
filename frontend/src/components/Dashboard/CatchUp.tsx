/**
 * "What did you do on the days I did not see?"
 *
 * ## The hole this fills
 *
 * Focus time only exists in this app if a timer was running for it. Everything
 * built on top of it — the consistency score, the focus score, the growth
 * series, the streak of active days, every gate on the analytics page — is
 * therefore a measure of two things at once: how much somebody worked, and how
 * reliably they remembered to press start. The second one is not what any of
 * those figures claim to be about, and for a reader who works hard and tracks
 * badly it is the one that dominates. Their page says they do not show up.
 *
 * So once a day, on the first load of the dashboard, the app asks. What comes
 * back is written into `focus_days` beside the timed hours (services/focus
 * `logDay`, which adds rather than replaces) and from that moment is
 * indistinguishable from them. Nothing downstream needs to know, or should:
 * the record is meant to be what happened.
 *
 * ## Once a day, and never about today
 *
 * `catchup_seen_on` is the whole of the bookkeeping — the last day this was
 * put, or found nothing to put. It advances whether the reader fills anything
 * in or not, so a dismissed prompt is not asked again in the same breath, and
 * a day nobody wanted to log is simply not logged. The offer is not a debt.
 *
 * Today is never on the list. It is not over, and the timer is still the right
 * way to record it.
 *
 * Which days remain after those rules is `catchUpDays` in utils/catchUp, kept
 * out of here because it is the actual decision and deserves to be testable
 * without a dashboard around it.
 *
 * ## Three names for one day
 *
 * Every row says "Yesterday · Friday · August 28", and all three earn their
 * place. The reader holds the day as "two days ago", recognises it as "Friday",
 * and can only check it against the date. One of them alone is either
 * ambiguous or unmemorable.
 *
 * ## Hours and minutes, not a decimal
 *
 * Two fields, because that is how the answer exists in somebody's head — "about
 * an hour and a half", not "1.5". They are added up here and sent as minutes,
 * so there is one figure for the server to bound.
 *
 * ## Nothing here blocks anything
 *
 * Escape closes it, the backdrop closes it, "Not now" closes it, and all three
 * still stamp the day. The dashboard underneath is fully usable and this is a
 * question rather than a gate — the same rule the rating prompt follows, for
 * the same reason: a prompt that stands between somebody and their page is one
 * they learn to dismiss without reading, which poisons the data it exists to
 * collect.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { agoLabel } from '@/utils/catchUp';
import type { CatchUpDay } from '@/utils/catchUp';
import { Button } from '@/components/ui';
import '@/styles/catch-up.css';

export interface CatchUpEntry {
  iso: string;
  /** Hours and minutes added together. Always > 0 — empty rows are dropped. */
  minutes: number;
}

export interface CatchUpProps {
  /** The days to ask about, most recent first. Never empty when this is shown. */
  days: CatchUpDay[];
  /** True while the entries are being written. */
  busy?: boolean;
  /**
   * Set when a write failed, in which case this stays up with what was typed
   * still in it. The one case worth a second ask: the reader has said
   * something and the app did not keep it.
   */
  failure?: string | null;
  /** Whatever was filled in. An empty array is a legitimate answer. */
  onSubmit: (entries: CatchUpEntry[]) => void;
  /** Dismissal, by any of its three routes. Still stamps the day. */
  onClose: () => void;
}

/** What one row holds while it is being typed. Strings, so a field can be empty. */
interface Draft {
  hours: string;
  minutes: string;
}

const EMPTY: Draft = { hours: '', minutes: '' };

/** A field's contents as a number, with blank and junk both reading as zero. */
function count(text: string): number {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Total minutes for one row, capped at a day. */
function totalFor(draft: Draft | undefined): number {
  if (!draft) return 0;
  return Math.min(1440, count(draft.hours) * 60 + count(draft.minutes));
}

function readable(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes - hours * 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export function CatchUp({ days, busy = false, failure = null, onSubmit, onClose }: CatchUpProps) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  // Escape closes, like every other dialog in the app.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = useCallback((iso: string, field: keyof Draft, value: string) => {
    setDrafts((current) => ({
      ...current,
      // Digits only, and short. A minutes box is not a place anybody needs to
      // paste, and the alternative to trimming here is a number arriving at
      // the server for it to reject after the dialog has closed.
      [iso]: { ...(current[iso] ?? EMPTY), [field]: value.replace(/\D/g, '').slice(0, 4) },
    }));
  }, []);

  /* What is about to be sent, and the line at the bottom that says so. Shown
     while it is still being typed rather than after: a reader who has just
     said they did nine hours on a Tuesday should see nine hours before they
     press the button, not find it on the analytics page next week. */
  const entries = useMemo(
    () =>
      days
        .map((day) => ({ iso: day.iso, minutes: totalFor(drafts[day.iso]) }))
        .filter((entry) => entry.minutes > 0),
    [days, drafts],
  );
  const filled = entries.reduce((sum, entry) => sum + entry.minutes, 0);

  return (
    <div
      className="cu-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="cu-popup" role="dialog" aria-modal="true" aria-labelledby="cu-title">
        <h3 className="cu-title" id="cu-title">
          Did you work on{' '}
          {days.length === 1 ? 'this day' : `any of these ${days.length} days`}?
        </h3>
        <p className="cu-lead">
          Time you did not have the timer running for. It counts exactly the same
          once it is in — leave a day blank if there was nothing on it.
        </p>

        <ul className="cu-rows">
          {days.map((day) => {
            const draft = drafts[day.iso] ?? EMPTY;
            const total = totalFor(draft);
            return (
              <li key={day.iso} className={`cu-row${total > 0 ? ' is-filled' : ''}`}>
                <div className="cu-when">
                  <strong>{agoLabel(day.ago)}</strong>
                  <span>
                    {day.weekday} · {day.date}
                  </span>
                </div>
                <div className="cu-fields">
                  <label className="cu-field">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={draft.hours}
                      placeholder="0"
                      disabled={busy}
                      aria-label={`Hours worked on ${day.weekday} ${day.date}`}
                      onChange={(event) => set(day.iso, 'hours', event.target.value)}
                    />
                    <span>h</span>
                  </label>
                  <label className="cu-field">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={draft.minutes}
                      placeholder="0"
                      disabled={busy}
                      aria-label={`Minutes worked on ${day.weekday} ${day.date}`}
                      onChange={(event) => set(day.iso, 'minutes', event.target.value)}
                    />
                    <span>m</span>
                  </label>
                </div>
              </li>
            );
          })}
        </ul>

        {failure && (
          <p className="cu-failed" role="alert">
            {failure}
          </p>
        )}

        <div className="cu-actions">
          {/* The running total, where the reader can see it against the button
              that sends it. Blank until something is typed, so the dialog does
              not open with a zero in it. */}
          <p className="cu-total" aria-live="polite">
            {filled > 0
              ? `${readable(filled)} across ${entries.length} ${
                  entries.length === 1 ? 'day' : 'days'
                }`
              : ''}
          </p>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Not now
          </Button>
          <Button variant="primary" disabled={busy || filled === 0} onClick={() => onSubmit(entries)}>
            {busy ? 'Saving…' : 'Log it'}
          </Button>
        </div>
      </div>
    </div>
  );
}
