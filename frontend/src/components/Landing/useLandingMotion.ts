/**
 * The landing page's scroll motion.
 *
 * Every `[data-reveal]` block fades up as it comes into view, and any chart
 * inside it draws itself (styles/landing.css keys both off `is-in`). Every
 * `[data-count]` number counts up from zero the first time its block arrives.
 *
 * `ld-armed` goes on the page only once this has decided to run, and the
 * stylesheet hides nothing without it — so with no IntersectionObserver
 * (an old browser, a test), or with reduced motion asked for, the page is
 * simply shown as it is.
 */
import { useEffect, type RefObject } from 'react';

const COUNT_MS = 1200;

function format(value: number, decimals: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function countUp(el: HTMLElement) {
  const target = Number(el.dataset.count);
  if (!Number.isFinite(target)) return;
  const decimals = Number(el.dataset.decimals ?? 0);
  const prefix = el.dataset.prefix ?? '';
  const suffix = el.dataset.suffix ?? '';
  const started = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - started) / COUNT_MS);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = `${prefix}${format(target * eased, decimals)}${suffix}`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function useLandingMotion(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const page = root.current;
    if (!page) return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced || typeof IntersectionObserver === 'undefined') return undefined;

    page.classList.add('ld-armed');
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const block = entry.target as HTMLElement;
          block.classList.add('is-in');
          block.querySelectorAll<HTMLElement>('[data-count]').forEach(countUp);
          seen.unobserve(block);
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -20px 0px' },
    );
    page.querySelectorAll('[data-reveal]').forEach((block) => seen.observe(block));
    return () => {
      seen.disconnect();
      page.classList.remove('ld-armed');
    };
  }, [root]);
}
