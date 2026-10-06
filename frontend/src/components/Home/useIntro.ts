/**
 * The landing page's opening — the port of home-intro.js.
 *
 * A single timeline, run once when the page arrives:
 *
 *      0ms   the black curtain starts lifting (600ms)
 *    420ms   the greeting rises
 *    560ms   the date follows it
 *    700ms   the headline arrives a word at a time, 55ms apart
 *      +150  the subtitle rises behind the last word
 *      +150  the buttons grow from 92% to full size
 *
 * How the "before" state is handled matters more than the timings. Everything
 * is written in CSS in its *finished* form; this adds `.hm-armed` to <html>,
 * which is what puts the pieces back to their starting position, and removes it
 * a frame later to let them all transition forward. So if this never runs, or
 * the machine asks for less motion, the hero is simply the hero — there is no
 * state in which the page is left blank waiting for a script.
 *
 * Two things the original did are gone rather than ported. It drew the brand
 * mark stroke by stroke, but that logo lived in the landing page's own header,
 * and this page has no header of its own — the app's top bar is rendered above
 * every route (see App.tsx), so there is one bar and it is not this page's to
 * animate. And it read the account's name out of localStorage for the greeting;
 * that comes from `useAuth` here, which is the same answer from the server
 * rather than from whatever this browser last cached.
 *
 * The headline is still split into words here rather than in the JSX, because
 * splitting it in the markup would mean writing the sentence as a list of words
 * — unreadable, and it would break the <em> the headline carries.
 */
import { useEffect, type RefObject } from 'react';
import { reduced } from '@/utils/homePlay';

const T = {
  greeting: 420,
  date: 560,
  headline: 700,
  wordGap: 55,
  subAfter: 150, // after the last word starts
  buttonsAfter: 150, // after the subtitle
};

export function useIntro(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const host = root.current;
    if (!host?.querySelector('.lp-hero')) return;

    const glow = buttonGlow(host);
    if (reduced) return glow; // everything else is static and already correct

    const greet = host.querySelector<HTMLElement>('.lp-greet');
    const date = host.querySelector<HTMLElement>('.lp-eyebrow');
    const title = host.querySelector<HTMLElement>('.lp-hero-title');
    const sub = host.querySelector<HTMLElement>('.lp-hero-sub');
    const actions = host.querySelector<HTMLElement>('.lp-hero-actions');
    // Splitting is a change to the DOM React rendered, and it is not undone on
    // cleanup — there is nothing to gain by putting the sentence back together
    // only to take it apart again. So a second run reuses the first run's
    // words; splitting them twice would wrap each word in a second span.
    const already = Array.from(title?.querySelectorAll<HTMLElement>('.hm-word') ?? []);
    const words = already.length ? already : title ? splitWords(title) : [];

    // Arm: CSS moves every piece back to its starting position.
    const page = document.documentElement;
    page.classList.add('hm-armed');

    const curtain = document.createElement('div');
    curtain.className = 'hm-curtain';
    curtain.setAttribute('aria-hidden', 'true');
    document.body.appendChild(curtain);

    // Two frames, so the browser has certainly painted the armed state before
    // the delays that release it are applied.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        curtain.classList.add('hm-lift');

        delay(greet, T.greeting);
        delay(date, T.date);
        words.forEach((word, i) => delay(word, T.headline + i * T.wordGap));

        const last = T.headline + Math.max(0, words.length - 1) * T.wordGap;
        delay(sub, last + T.subAfter);
        delay(actions, last + T.subAfter + T.buttonsAfter);

        // Disarm on the next frame: the delays are already on the elements, so
        // each one starts when its turn comes.
        requestAnimationFrame(() => page.classList.remove('hm-armed'));
      });
    });

    // Take the curtain out of the document once it has finished, rather than
    // leaving a full-screen element on top of the page forever.
    const sweep = setTimeout(() => curtain.remove(), 900);

    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
      clearTimeout(sweep);
      curtain.remove();
      page.classList.remove('hm-armed');
      // The delays are what stagger the opening. Left behind, a second run
      // would start each piece against the last run's clock.
      [greet, date, sub, actions, ...words].forEach((el) => delay(el, 0));
      glow();
    };
  }, [root]);
}

function delay(el: HTMLElement | null, ms: number): void {
  if (el) el.style.transitionDelay = `${ms}ms`;
}

/**
 * Walks the heading and wraps each word in its own span, in place, so the <em>
 * in the headline keeps its element and its styling. The spaces stay as real text
 * nodes between the spans — wrap them too and the line would stop breaking
 * where it should.
 */
function splitWords(root: HTMLElement): HTMLElement[] {
  const words: HTMLElement[] = [];

  function walk(node: Node) {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
        return;
      }
      if (child.nodeType !== Node.TEXT_NODE) return;

      const text = child.nodeValue ?? '';
      if (!text.trim()) return;

      const frag = document.createDocumentFragment();
      // Keep the separators: split on the spaces, not between them.
      text.split(/(\s+)/).forEach((piece) => {
        if (!piece) return;
        if (/^\s+$/.test(piece)) {
          frag.appendChild(document.createTextNode(piece));
          return;
        }
        const span = document.createElement('span');
        span.className = 'hm-word';
        span.textContent = piece;
        frag.appendChild(span);
        words.push(span);
      });
      child.parentNode?.replaceChild(frag, child);
    });
  }

  walk(root);
  return words;
}

/**
 * The light inside the primary buttons follows the pointer across them. Two
 * custom properties, read by .lp-btn-primary::after.
 */
function buttonGlow(host: HTMLElement): () => void {
  const undo: (() => void)[] = [];
  host.querySelectorAll<HTMLElement>('.lp-btn-primary').forEach((btn) => {
    const move = (event: PointerEvent) => {
      const box = btn.getBoundingClientRect();
      btn.style.setProperty('--hm-mx', `${((event.clientX - box.left) / box.width) * 100}%`);
      btn.style.setProperty('--hm-my', `${((event.clientY - box.top) / box.height) * 100}%`);
    };
    btn.addEventListener('pointermove', move, { passive: true });
    undo.push(() => btn.removeEventListener('pointermove', move));
  });
  return () => undo.forEach((fn) => fn());
}
