/**
 * The drifting field behind the page, and the surge cycle it can run.
 *
 * Lifted out of components/Ambient.tsx, which renders the layer and owns the
 * cursor glow. This is the part with rules in it — a state machine per dot and
 * a draw loop — and it was the part with no way to test it: a canvas closure
 * inside a component is reachable only by mounting the component and looking.
 * Everything here is a plain function over plain objects, so
 * utils/ambientField.test.ts can run a dot through a whole cycle without a
 * canvas, a DOM or a frame.
 *
 * The loop's rules are unchanged and are stated in Ambient's own header: one
 * canvas, one rAF, stopped when the tab is hidden or the page is scrolled past
 * the dots, and nothing at all when the machine has asked for less motion.
 */

/** Enough to read as a field and cheap enough to be free; fewer where they crowd. */
const PARTICLES = typeof window !== 'undefined' && window.innerWidth < 720 ? 18 : 40;

export interface Dot {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
  /** Where the dot is in the surge cycle. Always `drift` without `surge`. */
  mode: 'drift' | 'run' | 'halt' | 'hold';
  /** Seconds left in `mode`. */
  left: number;
  /** Speed multiplier, eased toward `want`. 1 is the dot's own drift. */
  fast: number;
  /** What `fast` is heading for. */
  want: number;
  /** How far toward the accent colour, 0-1. */
  blue: number;
}

/* The surge cycle, in seconds and multiples of a dot's own drift speed.
 *
 * `RUN_ODDS` is per dot per second, so with 40 dots something is breaking into
 * a run every few seconds and any one dot spends most of its life drifting —
 * which is the point. Raising it turns the field into traffic.
 *
 * The stop is longer than the run. A dot that accelerated and then immediately
 * carried on reads as a glitch; one that arrives somewhere, stops, and sits
 * there for a beat reads as having gone there on purpose. */
const RUN_ODDS = 0.055;
const RUN_FAST = 9;
const RUN_FOR = [0.8, 1.6] as const;
const HALT_FOR = 0.5;
const HOLD_FOR = [0.5, 1.1] as const;
/** How fast `fast` and `blue` chase their targets, as a fraction per second. */
const EASE = 6;

const between = ([lo, hi]: readonly [number, number]) => lo + Math.random() * (hi - lo);

/**
 * One dot, placed at random in a `w` x `h` field.
 *
 * Exported so a test can make one without a canvas. Every dot starts in
 * `drift` with no boost and no colour, whether or not the field is running the
 * surge cycle — a field with `surge` off simply never leaves that state.
 */
export function newDot(w: number, h: number): Dot {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    r: 0.8 + Math.random() * 1.6,
    // Pixels per second. Slow: a dot crosses the screen in about two minutes.
    vx: (Math.random() - 0.5) * 12,
    vy: -4 - Math.random() * 10,
    a: 0.1 + Math.random() * 0.22,
    mode: 'drift',
    left: 0,
    fast: 1,
    want: 1,
    blue: 0,
  };
}

/**
 * One dot, one frame of the surge cycle.
 *
 * `fast` and `blue` are eased toward their targets rather than set, so the
 * acceleration and the colour are things that happen over a moment instead
 * of switches that flip. That easing is also what makes the stop work: `halt`
 * asks for zero and the dot takes the rest of the half second to get there.
 */
export function advance(d: Dot, dt: number) {
  d.left -= dt;
  if (d.left <= 0) {
    if (d.mode === 'drift' && Math.random() < RUN_ODDS * dt * 60) {
      d.mode = 'run';
      d.left = between(RUN_FOR);
      d.want = RUN_FAST;
    } else if (d.mode === 'run') {
      d.mode = 'halt';
      d.left = HALT_FOR;
      d.want = 0;
    } else if (d.mode === 'halt') {
      d.mode = 'hold';
      d.left = between(HOLD_FOR);
      d.want = 0;
    } else if (d.mode === 'hold') {
      d.mode = 'drift';
      d.left = 0;
      d.want = 1;
    }
  }

  // Blue while it is going somewhere and while it is stopped there; back to
  // the ordinary colour only once it is drifting again.
  const wantBlue = d.mode === 'drift' ? 0 : 1;
  const step = Math.min(1, EASE * dt);
  d.fast += (d.want - d.fast) * step;
  d.blue += (wantBlue - d.blue) * step;
}

export function startParticles(
  canvas: HTMLCanvasElement | null,
  surge: boolean,
): (() => void) | undefined {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;

  let dots: Dot[] = [];
  let w = 0;
  let h = 0;
  let frame: number | null = null;
  let last = 0;

  /**
   * Returns false when there is nothing to measure yet. A canvas sized while
   * the page is laid out at zero — loaded in a background tab, or in a window
   * that has not been presented — stays zero for good otherwise, and the field
   * never appears. The draw loop retries.
   */
  function resize(): boolean {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas!.clientWidth || window.innerWidth || 0;
    h = canvas!.clientHeight || window.innerHeight || 0;
    if (!w || !h) return false;
    canvas!.width = Math.round(w * dpr);
    canvas!.height = Math.round(h * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function seed() {
    dots = [];
    for (let i = 0; i < PARTICLES; i++) dots.push(newDot(w, h));
  }

  /**
   * The dot colour and the colour a running dot turns, as rgb triples.
   *
   * Read every frame rather than cached, because the theme can change under a
   * canvas that is already running and a field that stayed dark-mode white on
   * a white page would be invisible.
   */
  function palette(): { base: [number, number, number]; hot: [number, number, number] } {
    // `surge` is the focus sitting and the focus sitting paints over a tint
    // that is dark in both themes — see `.pom-sit-scrim` in styles/timer.css.
    // So the field is read against *that* ground rather than against the
    // account's theme: the light-theme dots are near-black and would be a
    // canvas of nothing on it.
    if (surge) return { base: [226, 232, 240], hot: [125, 185, 255] };
    return document.documentElement.getAttribute('data-theme') === 'dark'
      ? { base: [255, 255, 255], hot: [125, 185, 255] }
      : { base: [30, 41, 59], hot: [37, 110, 235] };
  }


  function draw(now: number) {
    frame = requestAnimationFrame(draw);

    // Nothing measurable yet — try again next frame rather than drawing into a
    // zero-sized canvas forever.
    if (!w || !h) {
      if (!resize()) return;
      seed();
    }

    if (!last) last = now;
    // Seconds since the last frame, clamped so a backgrounded tab does not
    // teleport every dot when it comes back.
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    ctx!.clearRect(0, 0, w, h);
    const { base, hot } = palette();
    dots.forEach((d) => {
      if (surge) advance(d, dt);
      d.x += d.vx * dt * d.fast;
      d.y += d.vy * dt * d.fast;
      // Off one edge, back on the other.
      if (d.y < -8) {
        d.y = h + 8;
        d.x = Math.random() * w;
      }
      if (d.x < -8) d.x = w + 8;
      if (d.x > w + 8) d.x = -8;

      // A running dot is brighter as well as bluer: at these sizes a hue
      // change alone is not visible against a tinted page.
      const mix = (at: 0 | 1 | 2) => Math.round(base[at] + (hot[at] - base[at]) * d.blue);
      const alpha = Math.min(0.85, d.a * (1 + d.blue * 1.6));

      ctx!.beginPath();
      ctx!.arc(d.x, d.y, d.r + d.blue * 0.7, 0, Math.PI * 2);
      ctx!.fillStyle = `rgba(${mix(0)}, ${mix(1)}, ${mix(2)}, ${alpha})`;
      ctx!.fill();
    });
  }

  function play() {
    if (frame) return;
    last = 0;
    frame = requestAnimationFrame(draw);
  }
  function pause() {
    if (!frame) return;
    cancelAnimationFrame(frame);
    frame = null;
  }

  if (resize()) seed();
  play();

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  const onResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (resize()) seed();
    }, 150);
  };
  window.addEventListener('resize', onResize);

  // A hidden tab paints nothing, and neither should this.
  const onVisibility = () => (document.hidden ? pause() : play());
  document.addEventListener('visibilitychange', onVisibility);

  // The layer is fixed, so once the reader is a couple of screens down the dots
  // are still being drawn behind content that covers them. Stop there and pick
  // up again on the way back.
  let scrollTimer: ReturnType<typeof setTimeout> | null = null;
  const onScroll = () => {
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (window.scrollY > window.innerHeight * 2) pause();
      else if (!document.hidden) play();
    }, 120);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  return () => {
    pause();
    if (resizeTimer) clearTimeout(resizeTimer);
    if (scrollTimer) clearTimeout(scrollTimer);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
