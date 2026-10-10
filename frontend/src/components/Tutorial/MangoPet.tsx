/**
 * Mango at rest: sitting on top of the dashboard's first card between tours.
 *
 * It does small things on its own (looks around, walks along the edge, hops,
 * naps, waves, stretches, blows a bubble) and nothing that competes with the
 * page. Every action is slow and short, there are long pauses between them,
 * and it naps while you type. Its eyes follow the pointer. Click it and it
 * says something nice.
 *
 * `energy` is the account's Mango setting: calm (the default) does something
 * every 9 to 16 seconds, lively every 4 to 8, still never moves on its own.
 * Reduced motion is treated as still.
 *
 * Timers, not animation frames, drive the routine, so it costs nothing while
 * it sits, and CSS (styles/tutorial.css, "Mango at rest") does the moving.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { reduced } from '@/utils/homePlay';
import { MangoFigure } from './Mango';
import '@/styles/tutorial.css';

type Act = 'sit' | 'look' | 'walk' | 'jump' | 'sleep' | 'wave' | 'stretch' | 'spin' | 'bubble';

const SIZE = 46;

const LINES = [
  "You've got this.",
  'One task at a time.',
  'Nice work today.',
  "I'm rooting for you!",
  'Take a sip of water.',
  'Small steps still count.',
  "Don't forget a break.",
  'Keep that streak going!',
];

/** How long each act lasts, in ms. Walk is worked out from the distance. */
const LENGTH: Record<Exclude<Act, 'walk' | 'sit'>, number> = {
  look: 3200,
  jump: 900,
  sleep: 16000,
  wave: 2000,
  stretch: 1600,
  spin: 1100,
  bubble: 2600,
};

/** What a calm Mango picks, and how often. Lively walks and hops more. */
const CALM: Exclude<Act, 'sit'>[] = ['look', 'look', 'sleep', 'walk', 'stretch', 'wave', 'bubble', 'look', 'sleep', 'jump'];
const LIVELY: Exclude<Act, 'sit'>[] = ['walk', 'walk', 'jump', 'look', 'spin', 'wave', 'bubble', 'stretch', 'sleep', 'jump'];

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!;
const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export interface MangoPetProps {
  /** The card to sit on. */
  anchor: string;
  energy: 'calm' | 'lively' | 'still';
}

export function MangoPet({ anchor, energy }: MangoPetProps) {
  const still = energy === 'still' || reduced;
  const perch = useRef<HTMLDivElement | null>(null);
  const [spot, setSpot] = useState<{ left: number; top: number; width: number } | null>(null);
  const [x, setXState] = useState(0);
  const xNow = useRef(0);
  const setX = useCallback((to: number) => {
    xNow.current = to;
    setXState(to);
  }, []);
  const [walkMs, setWalkMs] = useState(0);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [act, setAct] = useState<Act>('sit');
  const [blink, setBlink] = useState(false);
  const [look, setLook] = useState({ x: 0, y: 0.35 });
  const [line, setLine] = useState<string | null>(null);
  const typedAt = useRef(0);
  const me = useRef<HTMLButtonElement | null>(null);

  // ---- Sitting on the card's top edge, wherever the card is ---------------
  useLayoutEffect(() => {
    const el = perch.current;
    const card = document.querySelector<HTMLElement>(anchor);
    if (!el || !card) return undefined;
    const place = () => {
      const parent = (el.offsetParent as HTMLElement | null) ?? document.body;
      const p = parent.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      setSpot((was) => {
        const next = { left: Math.round(c.left - p.left), top: Math.round(c.top - p.top), width: Math.round(c.width) };
        return was && was.left === next.left && was.top === next.top && was.width === next.width ? was : next;
      });
    };
    place();
    const watcher = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    watcher?.observe(card);
    window.addEventListener('resize', place);
    const settle = window.setInterval(place, 2000);
    return () => {
      watcher?.disconnect();
      window.removeEventListener('resize', place);
      window.clearInterval(settle);
    };
  }, [anchor]);

  // Start near the right-hand end, out of the way of the greeting.
  const room = Math.max(0, (spot?.width ?? 0) - SIZE - 24);
  const placed = useRef(false);
  useEffect(() => {
    if (!spot || placed.current) return;
    placed.current = true;
    setX(Math.round(room * 0.82));
  }, [spot, room, setX]);

  // ---- Eyes follow the pointer, gently -------------------------------------
  useEffect(() => {
    let last = 0;
    const move = (event: PointerEvent) => {
      const now = performance.now();
      if (now - last < 120 || !me.current) return;
      last = now;
      const r = me.current.getBoundingClientRect();
      const dx = event.clientX - (r.left + r.width / 2);
      const dy = event.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy) || 1;
      setLook({ x: (dx / len) * facing, y: Math.max(-0.6, dy / len) });
    };
    const typed = () => { typedAt.current = Date.now(); };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('keydown', typed);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('keydown', typed);
    };
  }, [facing]);

  // ---- Blinking ------------------------------------------------------------
  useEffect(() => {
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 140);
        next();
      }, between(2800, 6500));
    };
    next();
    return () => window.clearTimeout(timer);
  }, []);

  // ---- The routine ----------------------------------------------------------
  useEffect(() => {
    if (still || !spot) return undefined;
    let timer = 0;
    const rest = () => (energy === 'lively' ? between(4000, 8000) : between(9000, 16000));
    const go = () => {
      // Someone is typing: nap instead of moving about.
      const busy = Date.now() - typedAt.current < 8000;
      const next: Exclude<Act, 'sit'> = busy ? 'sleep' : pick(energy === 'lively' ? LIVELY : CALM);
      if (next === 'walk') {
        const from = xNow.current;
        const to = Math.round(between(0, room));
        const ms = Math.max(900, (Math.abs(to - from) / 38) * 1000);
        setFacing(to >= from ? 1 : -1);
        setWalkMs(ms);
        setAct('walk');
        setX(to);
        timer = window.setTimeout(() => {
          setAct('sit');
          timer = window.setTimeout(go, rest());
        }, ms);
        return;
      }
      setAct(next);
      if (next === 'look') {
        setLook({ x: -1, y: 0 });
        window.setTimeout(() => setLook({ x: 1, y: -0.2 }), 1100);
        window.setTimeout(() => setLook({ x: 0, y: 0.35 }), 2300);
      }
      timer = window.setTimeout(() => {
        setAct('sit');
        timer = window.setTimeout(go, rest());
      }, LENGTH[next]);
    };
    timer = window.setTimeout(go, rest());
    return () => window.clearTimeout(timer);
  }, [still, spot, energy, room, setX]);

  // ---- Clicking it -----------------------------------------------------------
  const poke = useCallback(() => {
    const woke = act === 'sleep';
    setAct(still ? 'sit' : 'jump');
    setLine(woke ? 'Huh? Oh, hi!' : pick(LINES));
    window.setTimeout(() => setAct('sit'), LENGTH.jump);
    window.setTimeout(() => setLine(null), 2600);
  }, [act, still]);

  const sleeping = act === 'sleep';
  const arm = act === 'wave' ? -55 : null;
  const mouth = act === 'bubble' || act === 'jump' ? 'o' : sleeping ? 'flat' : 'smile';

  return (
    <div
      ref={perch}
      className="mango-perch"
      style={spot ? { left: spot.left, top: spot.top, width: spot.width } : { visibility: 'hidden' }}
    >
      <button
        ref={me}
        type="button"
        className={`mango-pet is-${act}${facing < 0 ? ' is-left' : ''}`}
        style={{
          width: SIZE,
          height: SIZE * 1.1,
          transform: `translateX(${x}px)`,
          transitionDuration: act === 'walk' ? `${walkMs}ms` : '0ms',
        }}
        aria-label="Mango. Say hi"
        title="Mango"
        onClick={poke}
      >
        <span className="mango-pet-inner">
          <MangoFigure
            look={sleeping ? undefined : look}
            eyes={sleeping || blink ? 'closed' : 'open'}
            arm={arm}
            mouth={mouth}
          />
        </span>
        {sleeping && (
          <span className="mango-zz" aria-hidden="true">
            <i>z</i><i>z</i><i>Z</i>
          </span>
        )}
        {act === 'bubble' && <span className="mango-bubble" aria-hidden="true" />}
        {line && <span className="mango-say" role="status">{line}</span>}
      </button>
    </div>
  );
}
