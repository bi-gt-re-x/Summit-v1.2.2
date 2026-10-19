/**
 * The dashboard's once-a-day question about the days it did not see.
 *
 * All of the sequencing for the catch-up prompt: deciding whether there is
 * anything to ask, reading what is already recorded so it does not ask twice,
 * writing the answers, and stamping the day either way. The dialog itself is
 * components/Dashboard/CatchUp and the rule about *which* days is
 * utils/catchUp — this is the part that talks to the server, and it is a hook
 * so that neither of those has to.
 *
 * ## It runs once per mount, and usually does nothing
 *
 * The check fires when the preferences arrive and never again for that
 * account: `asked` is the guard, and it has to be a ref rather than state
 * because `update` writes the new `catchup_seen_on` into the context
 * immediately, which re-renders this hook with the very value the check reads.
 * Without the guard that is a loop.
 *
 * It holds the username rather than a boolean, so signing out and back in as
 * somebody else asks that account its own question. A plain `true` would have
 * meant the second account was never asked at all, and only on the machines
 * where two people share a browser — which is exactly the shape of bug that
 * never turns up until it is in front of somebody.
 *
 * The common outcome is no dialog at all. An account that tracks its focus
 * has nothing unrecorded to be asked about, an account on its second load of
 * the day has already been asked, and an account that has turned the prompt
 * off in Settings is never asked. Each of those still stamps the day, so the
 * three "nothing to do" paths and the answered one all leave the account in
 * the same state.
 *
 * ## The stamp is not conditional on the answer
 *
 * Submitting, dismissing and finding nothing all write today into
 * `catchup_seen_on`. A day the reader chose not to log is a day they chose not
 * to log; asking again tomorrow would make the prompt a debt collector, and
 * the one thing it must not become is something people click past without
 * reading. See the note at the top of the dialog.
 *
 * ## A failed write does not lose the dialog
 *
 * If the entries cannot be sent the prompt stays up with what was typed still
 * in it and says so, and the day is not stamped — that is the one case where
 * the reader has said something the app failed to keep, and it is worth the
 * second ask.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettings } from './useSettings';
import { focus as focusService } from '@/services';
import { CATCHUP_WINDOW_DAYS, catchUpDays } from '@/utils/catchUp';
import { addDays, isoDate } from '@/utils/dates';
import type { CatchUpEntry } from '@/components/Dashboard/CatchUp';
import type { CatchUpDay } from '@/utils/catchUp';

export interface UseCatchUp {
  /** The days to ask about, or null when there is nothing to ask. */
  days: CatchUpDay[] | null;
  /** True while the entries are being written. */
  saving: boolean;
  /** Set when a write failed and the dialog is still up because of it. */
  failure: string | null;
  submit: (entries: CatchUpEntry[]) => void;
  dismiss: () => void;
}

export function useCatchUp(username: string | null, onSaved?: () => void): UseCatchUp {
  const { prefs, ready, update } = useSettings();
  const [days, setDays] = useState<CatchUpDay[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const asked = useRef<string | null>(null);
  /* Called once hours land, so the page under the dialog re-reads the figures
     they feed. Held in a ref so a new function each render does not rebuild
     `submit`. */
  const saved = useRef(onSaved);
  saved.current = onSaved;

  /* The account's default goal, for a backfilled day that has no row of its
     own yet. A day that already has one keeps it — see `log_day` in
     backend/tracking/focus.py — so this is only ever the goal a day that was
     never opened gets given. */
  const goalHours = prefs.focus_goal_hours;

  /** Today, into `catchup_seen_on`. Every path here ends with this. */
  const stamp = useCallback(() => {
    void update({ catchup_seen_on: isoDate() });
  }, [update]);

  useEffect(() => {
    if (!ready || !username || asked.current === username) return;
    asked.current = username;
    setDays(null);
    setFailure(null);

    if (!prefs.catchup_prompt) return;

    const today = isoDate();
    const seenOn = prefs.catchup_seen_on;

    /* Never asked before, or already asked today. The first visit an account
       makes records the day and asks nothing: an account with no recorded
       visit is not one with a week of unlogged days, it is one this has never
       met, and opening with a week of empty boxes would be the app guessing. */
    if (!seenOn || seenOn >= today) {
      if (seenOn !== today) stamp();
      return;
    }

    /* What is already recorded across the widest stretch the prompt could
       ask about. Asked for here rather than filtered afterwards because the
       whole point of the read is to keep days that were tracked off the list
       — a prompt that asks about a day the reader spent two hours timing is
       a prompt that has not been paying attention. */
    const from = isoDate(addDays(new Date(), -CATCHUP_WINDOW_DAYS));
    const until = isoDate(addDays(new Date(), -1));

    void focusService
      .history(from, until)
      .then((result) => {
        const logged = new Set<string>();
        if (result.success) {
          for (const [iso, record] of Object.entries(result.days ?? {})) {
            if ((Number(record.seconds) || 0) > 0) logged.add(iso);
          }
        }
        // A history that failed to arrive is not a reason to skip the
        // question — it is a reason to ask about a day or two more than
        // strictly needed, which the reader can leave blank.
        const list = catchUpDays({ today, seenOn, logged });
        if (list.length === 0) {
          stamp();
          return;
        }
        setDays(list);
      })
      .catch((cause: unknown) => {
        console.error('Dashboard: reading focus history for the catch-up failed', cause);
      });
  }, [prefs.catchup_prompt, prefs.catchup_seen_on, ready, stamp, username]);

  const dismiss = useCallback(() => {
    setDays(null);
    setFailure(null);
    stamp();
  }, [stamp]);

  const submit = useCallback(
    (entries: CatchUpEntry[]) => {
      if (entries.length === 0) {
        dismiss();
        return;
      }
      setSaving(true);
      setFailure(null);
      /* One call per day rather than one call with a list. They are
         independent writes to independent rows, the count is at most seven,
         and a batch endpoint would need to answer the question of what a
         half-failed batch means — which is a question this does not have,
         because a day that did not land is simply a day still unlogged. */
      void Promise.all(
        entries.map((entry) => focusService.logDay(entry.iso, entry.minutes, goalHours)),
      )
        .then((results) => {
          const failed = results.filter((result) => !result.success).length;
          if (failed === results.length) {
            setFailure("Couldn't save that. Try again.");
            return;
          }
          setDays(null);
          stamp();
          saved.current?.();
        })
        .catch((cause: unknown) => {
          console.error('Dashboard: logging catch-up hours failed', cause);
          setFailure("Couldn't save that. Try again.");
        })
        .finally(() => setSaving(false));
    },
    [dismiss, goalHours, stamp],
  );

  return { days, saving, failure, submit, dismiss };
}
