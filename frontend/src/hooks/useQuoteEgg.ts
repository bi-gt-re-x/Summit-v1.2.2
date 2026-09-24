/**
 * The hidden chain's front door, and the room behind it.
 *
 * At the foot of the dashboard, beside the day's quote, sits a small Summit
 * mark. Ten clicks on it in the dark and the quote slips away, replaced for
 * the rest of the day by a cryptic clue. The swap is sleek: the old line
 * glides out, the new one rises in with an ominous glow, the rest of the
 * screen goes dark for a beat, and the whole page shakes.
 *
 * ## Why one hook and not two
 *
 * The counting used to live in `hooks/useTitleEgg.ts`, on the rail's title,
 * and the rail is mounted outside the router — so the tenth click could land
 * on any page, and getting the reveal played on a dashboard that might not be
 * mounted yet took a navigation, an in-memory latch and a window event
 * between two components that never shared a parent.
 *
 * The door is on the dashboard now, in the same element as the quote it
 * opens, so none of that has anywhere left to go: the tenth click calls
 * `reveal()` directly. The latch and the event were deleted with it rather
 * than left standing, because a mechanism whose reason has gone is worse than
 * no mechanism — it reads like it is still load-bearing.
 *
 * The door is silent for its first three clicks (see SILENT), and the whole
 * chain only lives in the dark: the pentagon in frontend/secret/pentagon-egg.js
 * checks the same thing before the next clue will wake up, so a chain
 * half-open in the light would dead-end.
 *
 * One consequence worth naming: Settings can hide the quote
 * (`show_quote` in pages/Dashboard.tsx), and hiding it hides the door with
 * it. That is the right way round — the clue has nowhere to appear without
 * the line it replaces — but it does mean the chain has no entrance for a
 * reader who has switched the quote off.
 *
 * ## Where the theatre lives
 *
 * The animation classes go on the element by hand rather than through
 * `className`, and that is deliberate on both counts. Restarting a CSS
 * animation needs the class removed, the layout flushed and the class added
 * again — `void el.offsetWidth` between the two — which is not something a
 * render pass can express. And because React is given no `className` for the
 * quote element at all (see components/Dashboard/DailyQuote.tsx), it never
 * touches the class attribute, so the two never fight over it. What React does
 * own is the text and the container's classes, which change once and stay.
 *
 * The styles are the HIDDEN QUOTE EASTER EGG block in styles/dashboard.css.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useChainAccount } from '@/hooks/useChainAccount';
import { earnedTitle, markUnlockedToday, unlockedToday } from '@/utils/easterEgg';

/** What the day's quote is replaced by. The pentagon is on the landing page. */
const CLUE = '"The pentagon is the key, find it" -Mysterious,,';

/** Clicks on the mark to unlock. */
const NEEDED = 10;

/**
 * Clicks that do nothing at all.
 *
 * Three, because two is inside the range of an accidental double-click and
 * four is enough clicks that somebody who meant them has already stopped. The
 * silence is the point: a secret that answers the first click is a button.
 */
const SILENT = 3;

/** How long a pop and its wobble run before the page is let still again. */
const POP = 340;

/* The reveal's beats, in ms. SLIDE_OUT matches the transition on #dailyQuote
   in styles/dashboard.css; the rest are measured from the swap. */
const SLIDE_OUT = 560;
const SHAKE_ENDS = 900;
const RISE_ENDS = 1050;
const SCRIM_LIFTS = 2400;
const SPOTLIGHT_ENDS = 3350;

export interface UseQuoteEgg {
  /** The clue, once the egg owns the line; null while the daily quote does. */
  clue: string | null;
  /** Classes for `.quote-container` — the ominous dress, and the spotlight. */
  containerClass: string;
  /** Put this on the quote element; the egg drives its classes directly. */
  quoteRef: React.RefObject<HTMLParagraphElement | null>;
  /** Put this on the mark beside it; the egg drives its classes too. */
  markRef: React.RefObject<HTMLImageElement | null>;
  /** The ten clicks land here. */
  onMarkClick: () => void;
}

/** The whole hidden chain only lives in the dark. */
function isDark(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

export function useQuoteEgg(): UseQuoteEgg {
  const quoteRef = useRef<HTMLParagraphElement>(null);
  const markRef = useRef<HTMLImageElement>(null);
  const [clue, setClue] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState(false);

  /* Every timer this hook starts, so unmounting mid-reveal does not leave
     callbacks writing classes onto a page that has navigated away. */
  const timers = useRef<number[]>([]);
  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    const started = timers.current;
    return () => {
      started.forEach(window.clearTimeout);
      /* The body and root carry the shake. They outlive this component, so
         anything left on them would follow the reader to the next page. */
      document.body.classList.remove('easter-wobble', 'easter-shake');
      document.documentElement.classList.remove('easter-shake-clip');
      document.getElementById('easterDark')?.remove();
    };
  }, []);

  /** Out with the day's quote, in with the clue. */
  const reveal = useCallback(() => {
    /* A full-viewport scrim, so the rest of the page can go dark while the
       quote stays lit. It is appended to the body rather than rendered because
       it covers the whole document, not the dashboard's corner of it. */
    let dark = document.getElementById('easterDark');
    if (!dark) {
      dark = document.createElement('div');
      dark.id = 'easterDark';
      dark.setAttribute('aria-hidden', 'true');
      document.body.appendChild(dark);
    }
    const scrim = dark;

    // 1) Sleek slide-out of the current quote.
    document.body.classList.remove('easter-wobble');
    quoteRef.current?.classList.add('quote-slide-out');

    after(SLIDE_OUT, () => {
      const el = quoteRef.current;

      /* 2) Swap in the clue, dressed ominously and lifted above the scrim.
            `flushSync` because the next three lines are animation restarts
            that have to run against the *new* text: left to batch, React would
            paint the rise-in on the old line and swap it a frame later. */
      flushSync(() => {
        setClue(CLUE);
        setSpotlight(true);
      });
      el?.classList.remove('quote-slide-out');

      // 3) The rest of the screen turns dark.
      void scrim.offsetWidth;
      scrim.classList.add('show');

      // 4) The biggest shake yet, and the ominous rise-in.
      if (el) {
        void el.offsetWidth;
        el.classList.add('quote-slide-in');
      }
      document.documentElement.classList.add('easter-shake-clip');
      document.body.classList.remove('easter-wobble');
      void document.body.offsetWidth;
      document.body.classList.add('easter-shake');

      after(SHAKE_ENDS, () => {
        document.body.classList.remove('easter-shake');
        document.documentElement.classList.remove('easter-shake-clip');
      });
      after(RISE_ENDS, () => quoteRef.current?.classList.remove('quote-slide-in'));

      /* 5) Hold the darkness a beat, then lift it — leaving the clue glowing
            in the restored dashboard. */
      after(SCRIM_LIFTS, () => scrim.classList.remove('show'));
      after(SPOTLIGHT_ENDS, () => {
        setSpotlight(false);
        scrim.remove();
      });
    });
  }, [after]);

  /* On arrival: show the clue if it was found earlier today, and otherwise
     leave the line alone. No theatrics either way — the reveal plays once,
     from the tenth click below, and a reader coming back to the dashboard an
     hour later wants the clue sitting there rather than crashing in again.
     The clue is retired for good once the chain has paid out its title.

     Both of those questions are about an account, so neither can be asked
     until there is one. On a cold load the session check is still in flight
     when this first runs, and answering then means answering about the wrong
     person: a reader who found the clue an hour ago would get the ordinary
     quote back. `null` is hooks/useChainAccount.ts saying "not yet", and it is
     the account and not merely the status, so switching accounts inside one
     session asks again for the new one. */
  const account = useChainAccount();
  useEffect(() => {
    if (account === null) return;
    if (earnedTitle(account)) return;
    if (unlockedToday(account)) setClue(CLUE);
  }, [account]);

  /* --- The door ---------------------------------------------------------- */

  /* Not state: the count is read and written inside one click and never
     rendered, so putting it in state would re-render the dashboard's footer
     nine times to show nothing. */
  const clicks = useRef(0);

  /**
   * Click n of ten, from the fourth: the mark bounces and the screen shakes
   * with it, both harder each time. Both amplitudes are measured from the
   * first click that shows anything, so the fourth is a twitch rather than
   * arriving already a third of the way up the scale.
   */
  const pop = useCallback(
    (n: number) => {
      const felt = n - SILENT;

      const mark = markRef.current;
      if (mark) {
        mark.style.setProperty('--pop', (1 + felt * 0.06).toFixed(2));
        mark.classList.remove('easter-pop');
        void mark.offsetWidth; // restart the animation
        mark.classList.add('easter-pop');
      }

      const root = document.documentElement;
      root.style.setProperty('--wob', `${(felt * 2.2).toFixed(2)}px`);
      root.style.setProperty('--wob-rot', `${(felt * 0.24).toFixed(2)}deg`);
      root.classList.add('easter-shake-clip');
      document.body.classList.remove('easter-wobble');
      void document.body.offsetWidth; // restart the animation
      document.body.classList.add('easter-wobble');

      after(POP, () => {
        document.body.classList.remove('easter-wobble');
        root.classList.remove('easter-shake-clip');
        mark?.classList.remove('easter-pop');
      });
    },
    [after],
  );

  const onMarkClick = useCallback(() => {
    /* Nothing to find: nobody is known yet, the clue is out for today, or the
       chain has already paid out this account's title. Either way the mark is
       just a logo. */
    if (account === null) return;
    if (unlockedToday(account) || earnedTitle(account)) return;
    // In the light it is a logo too. The count does not survive the trip.
    if (!isDark()) {
      clicks.current = 0;
      return;
    }

    clicks.current += 1;
    if (clicks.current < NEEDED) {
      if (clicks.current > SILENT) pop(clicks.current);
      return;
    }

    clicks.current = 0;
    markUnlockedToday(account);
    /* The pop's wobble is still on the body and would fight the reveal's own,
       bigger shake for the same animation slot. `reveal()` clears it first. */
    reveal();
  }, [account, pop, reveal]);

  const containerClass =
    (clue ? ' quote-ominous' : '') + (spotlight ? ' quote-spotlight' : '');

  return { clue, containerClass, quoteRef, markRef, onMarkClick };
}
