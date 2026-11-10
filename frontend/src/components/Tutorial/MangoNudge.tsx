/**
 * Mango's note: a short loop of three to five tips. The plan's rows worth
 * saying come first, each with a button to do something about it, then what
 * to leave alone, then general tips (`GENERAL_TIPS`) to fill it out.
 *
 * Plan rows come from `/api/next_actions` (backend/tracking/next_actions.py),
 * so Mango and the Recommendations tab can never disagree, and nothing here
 * decides what's important. It only decides whether something is worth
 * interrupting for (`WORTH_SAYING`).
 *
 * The note opens by itself once a day per account, in this browser, and never
 * while you're typing, and only when the plan has something worth saying.
 * Clicking Mango opens it any time, on the next tip each time. Settings,
 * Mango can turn the plan part off; the general tips stay.
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

/** One thing Mango can say: a row from the plan, or a general tip. */
export interface Tip {
  id: string;
  title: string;
  why: string;
  /** The plan row behind it. Only these get a button that does something. */
  action?: NextAction;
}

/** How many tips Mango loops through, at most and at least. */
export const MAX_TIPS = 5;
const FILL_TO = 4;
/** Plan rows go first, but leave room for one other thing. */
const MAX_PLAN = 4;

type General = { id: string; title: string; why: string; when?: 'morning' | 'evening' };

/** Advice that holds for anyone, for when the plan has less to say. Short,
 *  concrete, and something you can do in the next few minutes. */
export const GENERAL_TIPS: General[] = [
  {
    id: 'start-small',
    title: "Give the task you're avoiding 10 minutes.",
    why: "Starting is the hard part. Set a timer for 10 and let yourself stop after. Most days you'll keep going.",
  },
  {
    id: 'recall',
    title: 'Quiz yourself before you reread.',
    why: 'Pulling it from memory sticks better than reading it again. Cover your notes, try first, then check.',
  },
  {
    id: 'next-step',
    title: 'Write your next step before you stop.',
    why: "One line is enough. Next time you'll know where to start and skip the warm up.",
  },
  {
    id: 'phone',
    title: 'Put your phone in another room.',
    why: 'Even face down it pulls at you. Try one session without it and see how it goes.',
  },
  {
    id: 'split',
    title: 'Split anything over an hour.',
    why: 'Big tasks are easy to put off. Break it into pieces you can finish in 20 to 30 minutes.',
  },
  {
    id: 'spacing',
    title: 'Spread a topic over a few days.',
    why: 'Three short sessions on different days beat one long cram. Your memory needs the gaps.',
  },
  {
    id: 'break',
    title: 'Take a real break every 45 minutes.',
    why: "Get up for 5. Walk, drink some water, look out a window. Scrolling doesn't count.",
  },
  {
    id: 'hard-first',
    title: 'Do the hardest thing first.',
    why: "Your focus is best early on. Save the easy stuff for when you're tired.",
    when: 'morning',
  },
  {
    id: 'tomorrow',
    title: "Pick tomorrow's first task tonight.",
    why: 'Mornings go faster when the choice is already made. It takes a minute.',
    when: 'evening',
  },
  {
    id: 'mistakes',
    title: 'Go back over what you got wrong.',
    why: "Misses show you exactly what to work on. Redo one today while it's fresh.",
  },
];

/** General tips for this time of day. The order turns over each day, so
 *  Mango doesn't open with the same one every morning. */
export function generalTips(now = new Date()): Tip[] {
  const hour = now.getHours();
  const fits = GENERAL_TIPS.filter((tip) =>
    !tip.when || (tip.when === 'morning' ? hour < 12 : hour >= 18));
  const day = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 86_400_000);
  const shift = fits.length ? day % fits.length : 0;
  // Time-of-day tips lead when they apply: they're the most "right now".
  const timed = fits.filter((tip) => tip.when);
  const rest = fits.filter((tip) => !tip.when);
  const turned = [...rest.slice(shift % Math.max(1, rest.length)), ...rest.slice(0, shift % Math.max(1, rest.length))];
  return [...timed, ...turned].map(({ id, title, why }) => ({ id: `tip-${id}`, title, why }));
}

/** The loop Mango works through: the plan's rows worth saying, what to leave
 *  alone, then general tips until there are a few. Never more than five. */
export function pickTips(plan: Plan | null, now = new Date()): Tip[] {
  const tips: Tip[] = [];
  const seen = new Set<string>();
  const add = (tip: Tip) => {
    const key = tip.title.trim().toLowerCase();
    if (seen.has(tip.id) || seen.has(key) || tips.length >= MAX_TIPS) return;
    seen.add(tip.id);
    seen.add(key);
    tips.push(tip);
  };
  if (plan) {
    for (const item of [plan.top, ...plan.actions, ...plan.more]) {
      if (tips.length >= MAX_PLAN) break;
      if (!item || !WORTH_SAYING.includes(item.kind)) continue;
      add({ id: item.id, title: plainQuotes(item.title), why: shortWhy(item.because), action: item });
    }
    const leave = plan.priority?.not_now?.[0];
    if (leave?.why) add({ id: `leave-${leave.key}`, title: plainQuotes(`Leave ${leave.title} for now.`), why: shortWhy(leave.why) });
  }
  for (const tip of generalTips(now)) {
    if (tips.length >= FILL_TO) break;
    add(tip);
  }
  return tips;
}

export interface MangoNudgeState {
  /** Everything Mango has to say, in the order it says it. Always a few. */
  tips: Tip[];
  /** The one showing, or would show next. */
  tip: Tip | null;
  index: number;
  open: boolean;
  /** Whether the plan has something worth bringing up unasked. */
  urgent: boolean;
  /** Open the note. If it's been open before, it moves on to the next tip. */
  show: () => void;
  /** The next tip, looping back to the first. */
  next: () => void;
  hide: () => void;
  /** The tip's move worked, so it goes from the loop. */
  done: () => void;
}

export function useMangoNudge(username: string | null, enabled: boolean): MangoNudgeState {
  const [tips, setTips] = useState<Tip[]>(() => pickTips(null));
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const shown = useRef(false);
  const typedAt = useRef(0);
  const current = useRef<Tip | null>(null);
  current.current = tips[index] ?? null;
  const openNow = useRef(false);
  openNow.current = open;

  /** Swap in a new list. An open note stays on its tip if it's still there;
   *  a closed one starts again from the top, the most pressing. */
  const take = useCallback((list: Tip[]) => {
    const was = openNow.current ? current.current : null;
    const at = was ? list.findIndex((tip) => tip.id === was.id) : -1;
    setTips(list);
    if (at >= 0) {
      setIndex(at);
    } else {
      setIndex(0);
      // What it was talking about got done, so the note goes with it.
      if (was?.action) setOpen(false);
    }
  }, []);

  const load = useCallback(async () => {
    const result = await nextActions().catch(() => null);
    if (!result?.success) return false;
    take(pickTips(result.plan));
    return pickNudge(result.plan) !== null;
  }, [take]);

  useEffect(() => {
    if (!enabled || !username) {
      take(pickTips(null));
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
      void load().then((urgent) => {
        if (!live || !urgent || saidToday(username)) return;
        markSaid(username);
        shown.current = true;
        setIndex(0);
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
  }, [enabled, load, take, username]);

  const count = tips.length;
  const next = useCallback(() => setIndex((at) => (count ? (at + 1) % count : 0)), [count]);
  const show = useCallback(() => {
    if (shown.current) next();
    shown.current = true;
    setOpen(true);
  }, [next]);

  const tip = tips[index] ?? tips[0] ?? null;
  return {
    tips,
    tip,
    index: tip ? tips.indexOf(tip) : 0,
    open: open && tip !== null,
    urgent: tips.some((item) => item.action),
    show,
    next,
    hide: useCallback(() => setOpen(false), []),
    done: useCallback(() => {
      setOpen(false);
      setTips((list) => {
        const was = current.current;
        const left = list.filter((item) => item.id !== was?.id);
        return left.length ? left : pickTips(null);
      });
      setIndex(0);
    }, []),
  };
}

export function NudgeCard({ tip, at, of, left, onNext, onClose, onDone }: {
  tip: Tip;
  /** Which tip this is in the loop, from 0, and how many there are. */
  at: number;
  of: number;
  /** Where it sits along the card Mango is on, in px. */
  left: number;
  onNext: () => void;
  onClose: () => void;
  /** The move worked, so it goes from the loop. */
  onDone: () => void;
}) {
  const item = tip.action ?? null;
  const move = item ? nudgeMove(item) : null;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);

  // A new tip starts clean.
  useEffect(() => {
    setBusy(false);
    setNote(null);
    setBooked(false);
  }, [tip.id]);

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

  const many = of > 1;
  return (
    <div className="mango-nudge" style={{ left }} role="status" aria-label="A note from Mango">
      <div key={tip.id} className="mango-nudge-body">
        <p className="mango-nudge-title">{tip.title}</p>
        <p className="mango-nudge-why">{tip.why}</p>
      </div>
      {note && <p className="mango-nudge-note">{note}</p>}
      <div className="mango-nudge-acts">
        {booked ? (
          <button type="button" className="mango-nudge-go" onClick={onDone}>Nice</button>
        ) : (
          <>
            {move?.type === 'book' && (
              <button type="button" className="mango-nudge-go" disabled={busy} onClick={() => void book(move.goalId)}>
                {busy ? 'Booking...' : move.label}
              </button>
            )}
            {move?.type === 'link' && (
              <Link className="mango-nudge-go" to={move.to} onClick={onClose}>{move.label}</Link>
            )}
            {many && (
              <button type="button" className={move ? 'mango-nudge-later' : 'mango-nudge-go'} onClick={onNext}>
                Next tip
              </button>
            )}
            <button type="button" className="mango-nudge-later" onClick={onClose}>{move || many ? 'Later' : 'Thanks'}</button>
          </>
        )}
        {many && (
          <span className="mango-nudge-count" aria-label={`Tip ${at + 1} of ${of}`}>
            {Array.from({ length: of }, (_, i) => (
              <i key={i} className={i === at ? 'is-on' : undefined} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
