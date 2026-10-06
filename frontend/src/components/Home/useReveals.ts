/**
 * Scroll reveals and count-up statistics — the port of the first two halves of
 * home-fx.js.
 *
 * Reveals: sections and cards slide in from the side as they enter the
 * viewport and slide back out when they leave. Which way each one comes from is
 * decided here rather than written into the markup, so the JSX stays about what
 * the page says and this stays about how it arrives.
 *
 * Counters: a number animates up from zero the first time it scrolls into view,
 * once, and then stays put.
 *
 * The hero is deliberately left out of both. useIntro choreographs those same
 * elements, and two things animating one element's opacity and transform would
 * fight over it. The calendar is left alone for the same reason: it plays a
 * drag across itself and needs its transforms to itself.
 *
 * The other three parts of home-fx.js did not survive as imperative code, and
 * should not have: the Daily/Weekly tabs are state in Performance, the theme
 * swatches are handlers in Pricing, and a feature card is clickable because it
 * navigates, not because a listener rewrites window.location.
 */
import { useEffect, type RefObject } from 'react';
import { reduced } from '@/utils/homePlay';

type Direction = 'left' | 'right' | 'up';

/** The grids whose children alternate in from the sides. */
const GRIDS = '.lp-strip, .lp-split, .lp-perf, .lp-ax, .lp-streak-grid, .lp-philo, .lp-tech';

export function useReveals(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    if (reduced || !('IntersectionObserver' in window)) return;

    const marked: HTMLElement[] = [];

    function mark(el: Element | null, dir: Direction, delay = 0) {
      if (!(el instanceof HTMLElement) || el.classList.contains('rv')) return;
      el.classList.add('rv');
      el.setAttribute('data-rv', dir);
      if (delay) el.style.transitionDelay = `${delay}ms`;
      marked.push(el);
    }

    mark(host.querySelector('.lp-hero-art'), 'right');

    // Section headers drift up; grid children alternate left/right with a small
    // stagger so each row cascades in.
    host.querySelectorAll('.lp-head').forEach((el) => mark(el, 'up'));
    host.querySelectorAll(GRIDS).forEach((grid) => {
      Array.from(grid.children).forEach((el, i) => {
        mark(el, i % 2 ? 'right' : 'left', (i % 4) * 80);
      });
    });

    mark(host.querySelector('.lp-final'), 'up');

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Toggling both ways makes elements slide back out to their side as
          // they leave the viewport.
          entry.target.classList.toggle('rv-in', entry.isIntersecting);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -5% 0px' },
    );
    marked.forEach((el) => io.observe(el));

    return () => {
      io.disconnect();
      marked.forEach((el) => {
        el.classList.remove('rv', 'rv-in');
        el.removeAttribute('data-rv');
        el.style.transitionDelay = '';
      });
    };
  }, [root]);
}

/** The statistics that count up: totals, metrics, and the hero's overall score. */
const COUNTED = '.lp-stat-v b, .lp-metric-num, .lp-prev-overall strong';

export function useCountUps(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const host = root.current;
    if (!host || !('IntersectionObserver' in window)) return;

    const frames: number[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);
          animate(entry.target as HTMLElement, frames);
        });
      },
      { threshold: 0.6 },
    );

    host.querySelectorAll<HTMLElement>(COUNTED).forEach((el) => {
      // Only pure numbers (possibly with , and .) — the number is the element's
      // first text node; suffixes like " hrs" live in <small>.
      const node = el.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) return;
      const text = node.nodeValue?.trim() ?? '';
      if (!/^\d[\d,]*(?:\.\d+)?$/.test(text)) return;
      el.dataset.countTo = text;
      io.observe(el);
    });

    return () => {
      io.disconnect();
      frames.forEach((frame) => cancelAnimationFrame(frame));
    };
  }, [root]);
}

function animate(el: HTMLElement, frames: number[]): void {
  const raw = el.dataset.countTo;
  const node = el.firstChild;
  if (!raw || !node) return;

  const target = parseFloat(raw.replace(/,/g, ''));
  const decimals = (raw.split('.')[1] ?? '').length;
  const grouped = raw.includes(',');
  const format = (value: number) =>
    grouped ? Math.round(value).toLocaleString('en-US') : value.toFixed(decimals);

  if (reduced) {
    node.nodeValue = format(target);
    return;
  }

  const duration = 900;
  let t0: number | null = null;

  function step(now: number) {
    if (t0 === null) t0 = now;
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    node!.nodeValue = format(target * eased);
    if (p < 1) frames.push(requestAnimationFrame(step));
  }
  frames.push(requestAnimationFrame(step));
}
