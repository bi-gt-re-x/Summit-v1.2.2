/**
 * Mango's note for the day: the one thing that matters most right now, and a
 * button to do something about it.
 *
 * It says what the plan says. The item comes from `/api/next_actions`
 * (backend/tracking/next_actions.py), so Mango and the Recommendations tab can
 * never disagree, and nothing here decides what's important. It only decides
 * whether something is worth interrupting for (`WORTH_SAYING`).
 *
 * The note opens by itself once a day per account, in this browser, and never
 * while you're typing. With nothing worth saying, Mango stays quiet. Clicking
 * Mango brings the note back any time. Settings, Mango can turn it off.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { bookSessions, nextActions, type ActionKind, type NextAction, type Plan } from '@/services/next';
import { announceStatsChanged, STATS_CHANGED } from '@/utils/statsBus';

/** How long after the page settles Mango speaks up. */
export const NUDGE_DELAY_MS = 1500;
/** Typing this recently means wait. */
const TYPING_MS = 8000;
/** How long to wait before looking again. */
const RETRY_MS = 4000;
/** The longest "why" Mango reads out, in characters. */
const WHY_MAX = 150;

/** Kinds worth bringing up unasked. Small wins like XP pace can wait for the plan. */
const WORTH_SAYING: ActionKind[] = [
  'deadline', 'triage', 'overdue', 'due', 'misses', 'stuck', 'check', 'streak',
  'goal', 'goal-quiet', 'slipping', 'weak-subject', 'neglected', 'review', 'skill',
];

/** The plan's best item that's worth bringing up, or null to say nothing. */
export function pickNudge(plan: Plan): NextAction | null {
  return [plan.top, ...plan.actions, ...plan.more].find(
    (item): item is NextAction => Boolean(item && WORTH_SAYING.includes(item.kind)),
  ) ?? null;
}

const plainQuotes = (text: string) => text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

/** The reason, cut at a sentence so it stays short enough to read in a glance. */
export function shortWhy(because: string): string {
  const text = plainQuotes(because).trim();
  if (text.length <= WHY_MAX) return text;
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  let kept = '';
  for (const sentence of sentences) {
    if (kept && (kept + sentence).length > WHY_MAX) break;
    kept += sentence;
  }
  if (kept && kept.length <= WHY_MAX) return kept.trim();
  return `${text.slice(0, WHY_MAX).replace(/\s+\S*$/, '')}...`;
}

export type NudgeMove =
  | { type: 'book'; label: string; goalId: string }
  | { type: 'link'; label: string; to: string };

/** The button under the note: book it here, or go where it gets done. */
export function nudgeMove(item: NextAction): NudgeMove {
  if (item.book && item.book.count > 0 && item.goalId) {
    const { count } = item.book;
    return { type: 'book', label: `Book ${count} ${count === 1 ? 'session' : 'sessions'}`, goalId: item.goalId };
  }
  if (item.to) return { type: 'link', label: "Let's go", to: item.to };
  if (item.taskId) return { type: 'link', label: 'Open it', to: `/tasks?task=${encodeURIComponent(item.taskId)}` };
  if (item.goalId) return { type: 'link', label: 'See the goal', to: '/goals' };
  return { type: 'link', label: 'See the plan', to: '/recommendations' };
}

const saidKey = (username: string) => `summit:mango-said:${username}`;

function todayStamp(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function saidToday(username: string) {
  try {
    return localStorage.getItem(saidKey(username)) === todayStamp();
  } catch {
    return false;
  }
}

function markSaid(username: string) {
  try {
    localStorage.setItem(saidKey(username), todayStamp());
  } catch {
    /* Private window or blocked storage: the note may open once more. */
  }
}

export interface MangoNudgeState {
  /** What Mango has to say, or null when there's nothing. */
  item: NextAction | null;
  open: boolean;
  show: () => void;
  hide: () => void;
  /** It's been dealt with, so there's nothing left to bring back. */
  clear: () => void;
}

export function useMangoNudge(username: string | null, enabled: boolean): MangoNudgeState {
  const [item, setItem] = useState<NextAction | null>(null);
  const [open, setOpen] = useState(false);
  const typedAt = useRef(0);

  const load = useCallback(async () => {
    const result = await nextActions().catch(() => null);
    if (!result?.success) return null;
    const found = pickNudge(result.plan);
    setItem(found);
    // What it was talking about got done, so the note goes with it.
    if (!found) setOpen(false);
    return found;
  }, []);

  useEffect(() => {
    if (!enabled || !username) {
      setItem(null);
      setOpen(false);
      return undefined;
    }
    let live = true;
    let timer = 0;
    const typed = () => { typedAt.current = Date.now(); };
    const speak = () => {
      if (!live) return;
      if (Date.now() - typedAt.current < TYPING_MS) {
        timer = window.setTimeout(speak, RETRY_MS);
        return;
      }
      void load().then((found) => {
        if (!live || !found || saidToday(username)) return;
        markSaid(username);
        setOpen(true);
      });
    };
    const refresh = () => { void load(); };
    window.addEventListener('keydown', typed);
    window.addEventListener(STATS_CHANGED, refresh);
    timer = window.setTimeout(speak, NUDGE_DELAY_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
      window.removeEventListener('keydown', typed);
      window.removeEventListener(STATS_CHANGED, refresh);
    };
  }, [enabled, load, username]);

  return {
    item,
    open: open && item !== null,
    show: useCallback(() => setOpen(true), []),
    hide: useCallback(() => setOpen(false), []),
    clear: useCallback(() => {
      setOpen(false);
      setItem(null);
    }, []),
  };
}

export function NudgeCard({ item, left, onClose, onDone }: {
  item: NextAction;
  /** Where it sits along the card Mango is on, in px. */
  left: number;
  onClose: () => void;
  /** The move worked, so there's nothing left to bring back. */
  onDone: () => void;
}) {
  const move = nudgeMove(item);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);

  const book = async (goalId: string) => {
    setBusy(true);
    setNote(null);
    const result = await bookSessions(goalId).catch(() => null);
    setBusy(false);
    if (!result) {
      setNote("That didn't work. Try again.");
      return;
    }
    if (!result.success) {
      setNote(result.message ?? "That didn't work. Try again.");
      return;
    }
    const count = result.booked.length;
    setBooked(true);
    setNote(`Booked ${count} ${count === 1 ? 'session' : 'sessions'}. They're on your calendar.`);
    announceStatsChanged();
  };

  return (
    <div className="mango-nudge" style={{ left }} role="status" aria-label="A note from Mango">
      <p className="mango-nudge-title">{plainQuotes(item.title)}</p>
      <p className="mango-nudge-why">{shortWhy(item.because)}</p>
      {note && <p className="mango-nudge-note">{note}</p>}
      <div className="mango-nudge-acts">
        {booked ? (
          <button type="button" className="mango-nudge-go" onClick={onDone}>Nice</button>
        ) : (
          <>
            {move.type === 'book' ? (
              <button type="button" className="mango-nudge-go" disabled={busy} onClick={() => void book(move.goalId)}>
                {busy ? 'Booking...' : move.label}
              </button>
            ) : (
              <Link className="mango-nudge-go" to={move.to} onClick={onClose}>{move.label}</Link>
            )}
            <button type="button" className="mango-nudge-later" onClick={onClose}>Later</button>
          </>
        )}
      </div>
    </div>
  );
}
