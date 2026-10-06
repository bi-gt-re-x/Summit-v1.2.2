/**
 * The last of the landing page's motion — the port of home-final.js.
 *
 * Five small things, none of which needed a component of its own:
 *
 *   philosophy      the four line icons stroke themselves on, and the cards
 *                   stagger in 150ms apart
 *   tech stack      the cards rise, their icons untwist, each named technology
 *                   arrives on its own, and wires draw between the boxes in
 *                   order — frontend, then backend, then database
 *   trend arrows    the little green triangles slide up into place while their
 *                   percentages count from zero
 *   theme           the switch fades over 500ms instead of cutting, by putting
 *                   a class on <html> for exactly as long as the fade lasts
 *   the closing CTA the glow behind it comes up, the button breathes every four
 *                   seconds, and a ripple opens where it is clicked
 *
 * The wires are the only fiddly part. They are drawn between the *measured*
 * centres of the cards, so they follow the grid however it reflows — two
 * columns on a narrow screen, four on a wide one — and they are redrawn on
 * resize rather than being written down as coordinates that would only be right
 * at one width. That measurement is why this is a hook over the rendered page
 * and not markup: there is nothing to render until the grid has been laid out.
 *
 * Unlike the original, nothing here rewrites content. The tech cards' `· `
 * separated lists and the trend arrows' arrow-and-number are rendered as those
 * parts in the first place (see sections.tsx and Trend.tsx); this only moves
 * what is already there.
 */
import { useEffect, type RefObject } from 'react';
import { countThrough, onView, reduced, type Counter } from '@/utils/homePlay';

const SVG_NS = 'http://www.w3.org/2000/svg';

type Teardown = () => void;

export function useFinalMotion(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const undo = [
      philosophy(host),
      tech(host),
      trends(host),
      themeFade(),
      finalCta(host),
    ];
    return () => undo.forEach((fn) => fn());
  }, [root]);
}

// --------------------------------------------------------------------------
// Philosophy
// --------------------------------------------------------------------------
function philosophy(host: HTMLElement): Teardown {
  const grid = host.querySelector<HTMLElement>('#philoGrid');
  if (!grid) return () => {};

  const cards = Array.from(grid.querySelectorAll<HTMLElement>('.lp-phi'));
  const paths = Array.from(grid.querySelectorAll<SVGPathElement>('.ph-ico path'));

  // Each path gets its own dash length, or the short strokes finish long before
  // the long ones start.
  paths.forEach((path) => {
    let len = 120;
    try {
      len = Math.ceil(path.getTotalLength());
    } catch {
      // Keep the default: a path that cannot be measured still draws, just
      // over a length that is close enough.
    }
    path.style.setProperty('--ph-len', String(len));
  });

  /** How many icon strokes belong to one card. */
  const perCard = paths.length / (cards.length || 1) || 1;

  function reset() {
    grid!.classList.add('ph-armed');
    cards.forEach((c) => (c.style.transitionDelay = ''));
    paths.forEach((p) => (p.style.transitionDelay = ''));
  }

  function play() {
    cards.forEach((c, i) => (c.style.transitionDelay = `${i * 150}ms`));
    // The icon draws once its card has arrived.
    paths.forEach((p, i) => {
      p.style.transitionDelay = `${260 + Math.floor(i / perCard) * 150}ms`;
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => grid!.classList.remove('ph-armed'));
    });
  }

  reset();
  return onView(grid, {
    play,
    reset,
    still: () => grid.classList.remove('ph-armed'),
    threshold: 0.25,
  });
}

// --------------------------------------------------------------------------
// Technology stack
// --------------------------------------------------------------------------
function tech(host: HTMLElement): Teardown {
  const grid = host.querySelector<HTMLElement>('#techGrid');
  if (!grid) return () => {};
  const wires = grid.querySelector<SVGSVGElement>('#techWires');

  const cards = Array.from(grid.querySelectorAll<HTMLElement>('.lp-techitem'));
  const bits = Array.from(grid.querySelectorAll<HTMLElement>('.tech-bit'));

  /**
   * One wire between each neighbouring pair of cards, measured off the grid as
   * it currently is. Cards that have wrapped onto another row are skipped — a
   * wire running backwards across the grid reads as a mistake rather than a
   * connection.
   */
  function drawWires() {
    if (!wires) return;
    while (wires.firstChild) wires.removeChild(wires.firstChild);

    const box = grid!.getBoundingClientRect();
    wires.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);

    for (let i = 0; i < cards.length - 1; i++) {
      const a = cards[i]!.getBoundingClientRect();
      const b = cards[i + 1]!.getBoundingClientRect();
      if (b.left < a.left) continue; // wrapped to the next row

      const x1 = a.right - box.left;
      const x2 = b.left - box.left;
      const y1 = a.top - box.top + a.height / 2;
      const y2 = b.top - box.top + b.height / 2;

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('class', 'tech-wire');
      const len = Math.max(1, x2 - x1);
      line.style.setProperty('--wire-len', String(len));
      line.style.strokeDasharray = String(len);
      line.style.transitionDelay = `${700 + i * 240}ms`;
      wires.appendChild(line);

      /* The gap between two cards is only as wide as the grid's gutter, so a
       * bare line is a stub you would not notice. A node at the midpoint,
       * popping in as the wire lands, is what makes it read as a connection. */
      const node = document.createElementNS(SVG_NS, 'circle');
      node.setAttribute('cx', String((x1 + x2) / 2));
      node.setAttribute('cy', String((y1 + y2) / 2));
      node.setAttribute('r', '3.5');
      node.setAttribute('class', 'tech-node');
      node.style.transitionDelay = `${1000 + i * 240}ms`;
      wires.appendChild(node);
    }
  }

  function reset() {
    grid!.classList.add('tech-armed');
    cards.forEach((c) => (c.style.transitionDelay = ''));
    bits.forEach((b) => (b.style.transitionDelay = ''));
    drawWires();
  }

  function play() {
    drawWires();
    cards.forEach((c, i) => (c.style.transitionDelay = `${i * 120}ms`));
    bits.forEach((b, i) => (b.style.transitionDelay = `${420 + i * 90}ms`));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => grid!.classList.remove('tech-armed'));
    });
  }

  reset();
  const unwatch = onView(grid, {
    play,
    reset,
    still: () => {
      drawWires();
      grid.classList.remove('tech-armed');
    },
    threshold: 0.25,
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  const onResize = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(drawWires, 150);
  };
  window.addEventListener('resize', onResize);

  return () => {
    unwatch();
    window.removeEventListener('resize', onResize);
    if (timer) clearTimeout(timer);
    if (wires) while (wires.firstChild) wires.removeChild(wires.firstChild);
  };
}

// --------------------------------------------------------------------------
// Trend arrows
// --------------------------------------------------------------------------
function trends(host: HTMLElement): Teardown {
  const undo: Teardown[] = [];

  host.querySelectorAll<HTMLElement>('.lp-trend.up').forEach((trend) => {
    const num = trend.querySelector<HTMLElement>('.tr-num');
    if (!num) return;
    const target = parseFloat(num.textContent ?? '');
    if (isNaN(target)) return;

    const final = num.textContent ?? '';
    const card = trend.closest<HTMLElement>('.lp-card') ?? trend;
    let counter: Counter | null = null;

    const spec = {
      threshold: 0.4,
      reset() {
        counter?.cancel();
        card.classList.add('tr-armed');
        num.textContent = '0';
      },
      play() {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => card.classList.remove('tr-armed'));
        });
        counter = countThrough(num, [0, target], { duration: 900 });
      },
      still() {
        card.classList.remove('tr-armed');
        num.textContent = final;
      },
    };

    spec.reset();
    const unwatch = onView(card, spec);
    undo.push(() => {
      unwatch();
      counter?.cancel();
      card.classList.remove('tr-armed');
      num.textContent = final;
    });
  });

  return () => undo.forEach((fn) => fn());
}

// --------------------------------------------------------------------------
// Theme
// --------------------------------------------------------------------------
/**
 * ThemeContext flips data-theme on <html>. Watch for that and put
 * `.theme-shift` on for the length of the fade, so the surfaces cross over
 * instead of cutting — and take it off again, because leaving those transitions
 * on would make every hover half a second late.
 */
function themeFade(): Teardown {
  const root = document.documentElement;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const watcher = new MutationObserver(() => {
    root.classList.add('theme-shift');
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => root.classList.remove('theme-shift'), 560);
  });
  watcher.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  return () => {
    watcher.disconnect();
    if (timer) clearTimeout(timer);
    root.classList.remove('theme-shift');
  };
}

// --------------------------------------------------------------------------
// The closing call to action
// --------------------------------------------------------------------------
function finalCta(host: HTMLElement): Teardown {
  const section = host.querySelector<HTMLElement>('.lp-final');
  if (!section) return () => {};
  const button = section.querySelector<HTMLElement>('.lp-btn-lg');

  let breathe: ReturnType<typeof setTimeout> | null = null;

  const unwatch = onView(section, {
    threshold: 0.4,
    reset() {
      if (breathe) clearTimeout(breathe);
      section.classList.remove('is-lit');
      button?.classList.remove('is-breathing');
    },
    play() {
      section.classList.add('is-lit');
      // Only once it has settled — a button breathing while its section is
      // still arriving looks like a glitch.
      breathe = setTimeout(() => button?.classList.add('is-breathing'), 1200);
    },
    still() {
      section.classList.add('is-lit');
    },
  });

  if (!button || reduced) {
    return () => {
      unwatch();
      if (breathe) clearTimeout(breathe);
    };
  }

  const ripple = (event: PointerEvent) => {
    const box = button.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = 'cta-ripple';
    // Big enough to cover the button from wherever it was clicked.
    const size = Math.max(box.width, box.height) * 2.4;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.left = `${event.clientX - box.left}px`;
    el.style.top = `${event.clientY - box.top}px`;
    button.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  };
  button.addEventListener('pointerdown', ripple);

  return () => {
    unwatch();
    if (breathe) clearTimeout(breathe);
    button.removeEventListener('pointerdown', ripple);
  };
}
