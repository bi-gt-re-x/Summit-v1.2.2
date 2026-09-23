/**
 * The graph-paper background — the port of home-ambient.js.
 *
 * One fixed layer behind everything, holding four quiet things: a grid, a slow
 * colour gradient, a field of drifting particles, and a glow that follows the
 * cursor. The first two are pure CSS (styles/ambient.css); this renders the
 * layer, runs the particle canvas, and moves the glow.
 *
 * **The cursor glow is opt-in, and only the landing page opts in.** A light
 * that chases the pointer suits a page being read top to bottom; on a page
 * being *worked* it follows every trip to a checkbox, and a working surface
 * should hold still under the hand. It was the other way round — on by default,
 * switched off per page — which meant every new app page inherited a drifting
 * purple blob until somebody remembered to turn it off. Defaulting to off makes
 * the rule hold for pages nobody has written yet.
 *
 * The rules it plays by, because a background that costs anything is a
 * background that should not exist:
 *
 *   one canvas, one rAF loop, and the loop stops entirely when the tab is
 *   hidden or the page is scrolled past the point where particles are visible;
 *   the glow is moved with a transform on a promoted layer, never with top/left,
 *   and it eases toward the pointer instead of tracking it exactly, so it reads
 *   as light rather than as a cursor;
 *   nothing runs at all when the machine asks for less motion, or on a device
 *   with no fine pointer (the glow).
 *
 * Unlike the original this is a real element in the tree rather than a div
 * inserted at the top of <body>, so it comes and goes with the page instead of
 * outliving it — leaving a canvas running behind a page that has moved on was
 * never the intent, it just could not be expressed before.
 *
 * **It can be turned off entirely** (Settings, Appearance). Off means nothing
 * is rendered at all rather than a hidden layer: the point of the switch is a
 * page with no canvas and no loop behind it, which a `display: none` would not
 * have given. `reduced` already stops the motion; this is for a reader who
 * wants the plain background as well.
 *
 * ## `surge`, and why it is opt-in too
 *
 * With `surge` a dot occasionally breaks its drift: it accelerates, turns
 * blue, coasts, brakes to a full stop, holds there, and fades back to its
 * ordinary colour before drifting on. One sitting's worth of that reads as a
 * field with something going on in it rather than as wallpaper.
 *
 * It is off everywhere except the focus sitting (pages/Timer.tsx), and for the
 * same reason the cursor glow is: movement with a beginning and an end pulls
 * the eye, which is right behind a clock somebody is watching on purpose and
 * wrong behind a task list somebody is reading. Nothing accelerates when the
 * machine has asked for less motion — `reduced` stops the whole loop before
 * any of this is reached.
 */
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { startParticles } from '@/utils/ambientField';
import { reduced } from '@/utils/homePlay';
import '@/styles/ambient.css';

export interface AmbientProps {
  /** Whether the glow follows the pointer. The landing page, and nothing else. */
  cursor?: boolean;
  /**
   * Whether dots break into a run, turn blue and stop. The focus sitting, and
   * nothing else — see the note at the top of this file.
   */
  surge?: boolean;
}

export function Ambient({ cursor = false, surge = false }: AmbientProps) {
  const { prefs } = useSettings();
  const on = prefs.show_ambient;
  const layer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  /** Fades the whole layer in one beat after the page itself arrives. */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), reduced ? 0 : 260);
    return () => clearTimeout(timer);
  }, []);

  // `on` is a dependency for the same reason `cursor` is: turning the
  // background off has to stop the loop, not just stop drawing it.
  useEffect(() => {
    if (reduced || !on) return;
    return startParticles(canvas.current, surge);
  }, [on, surge]);

  // `cursor` is a dependency rather than a guard inside the effect, so turning
  // it off unbinds the pointer listeners instead of leaving them running over
  // an element that is no longer there.
  useEffect(() => {
    if (reduced || !cursor || !on) return;
    return startCursorGlow(glow.current);
  }, [cursor, on]);

  if (!on) return null;

  return (
    <div
      className={`hm-ambient${ready ? ' hm-ready' : ''}${reduced ? '' : ' hm-animate'}`}
      ref={layer}
      aria-hidden="true"
    >
      <div className="hm-gradient" />
      <div className="hm-grid" />
      <canvas className="hm-particles" ref={canvas} />
      {cursor && <div className="hm-cursor" ref={glow} />}
    </div>
  );
}

function startCursorGlow(glow: HTMLDivElement | null): (() => void) | undefined {
  if (!glow) return;
  // Touch and pen have no hovering cursor to follow.
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  let tx = 0;
  let ty = 0; // where the pointer is
  let cx = 0;
  let cy = 0; // where the light has got to
  let running = false;
  let seen = false;
  let frame: number | null = null;

  function loop() {
    // Ease a tenth of the remaining distance each frame: the light trails the
    // cursor slightly instead of being welded to it.
    cx += (tx - cx) * 0.1;
    cy += (ty - cy) * 0.1;
    glow!.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0)`;
    // Close enough to stopped — park the loop until the pointer moves.
    if (Math.abs(tx - cx) < 0.4 && Math.abs(ty - cy) < 0.4) {
      running = false;
      frame = null;
      return;
    }
    frame = requestAnimationFrame(loop);
  }

  const onMove = (event: PointerEvent) => {
    tx = event.clientX;
    ty = event.clientY;
    if (!seen) {
      // First sighting: drop the light straight onto the pointer rather than
      // sliding it in from the corner.
      seen = true;
      cx = tx;
      cy = ty;
      glow.style.transform = `translate3d(${cx}px,${cy}px,0)`;
      glow.classList.add('hm-cursor-on');
    }
    if (!running) {
      running = true;
      frame = requestAnimationFrame(loop);
    }
  };
  const onLeave = () => glow.classList.remove('hm-cursor-on');
  const onEnter = () => {
    if (seen) glow.classList.add('hm-cursor-on');
  };

  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);
  document.addEventListener('pointerenter', onEnter);

  return () => {
    if (frame) cancelAnimationFrame(frame);
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerleave', onLeave);
    document.removeEventListener('pointerenter', onEnter);
  };
}
