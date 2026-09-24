/**
 * The hidden quote — what the ten clicks on the Focus card's mark are for.
 *
 * When the chain is unlocked, the day's quote at the foot of the dashboard
 * slips away and is replaced, for the rest of the day, by a cryptic clue. The
 * swap is sleek: the old line glides out, the new one rises in with an ominous
 * glow, the rest of the screen goes dark for a beat, and the whole page shakes.
 *
 * This hook is the *room*, not the door. The counting lives in
 * hooks/useMarkEgg.ts, on the mark in the corner of the Focus card, and the
 * tenth click there sends `EGG_UNLOCKED`. Both are children of
 * pages/Dashboard.tsx and are on screen together, so the news arrives the
 * moment it is sent and there is nothing to hold it over. All this file
 * decides is which of the three states the line is in:
 *
 *   * the tenth click just landed — play the whole thing
 *   * unlocked earlier          — the clue, plainly, no theatrics
 *   * neither                   — the day's quote, untouched
 *
 * One consequence worth naming: Settings can hide this line (`show_quote` in
 * pages/Dashboard.tsx), and it can hide the stat cards the door sits on
 * (`show_stats`). Either switch breaks the chain's first step — one takes away
 * the door, the other the room it opens — and neither says so, because a
 * setting that explained itself would be advertising the secret.
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
import { EGG_UNLOCKED, earnedTitle, unlockedToday } from '@/utils/easterEgg';

/** What the day's quote is replaced by. The pentagon is on the landing page. */
const CLUE = '"The pentagon is the key, find it" -Mysterious,,';

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
}

export function useQuoteEgg(): UseQuoteEgg {
  const quoteRef = useRef<HTMLParagraphElement>(null);
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

  /* The tenth click, from the mark in the Focus card's corner. Nothing is
     held over between the two: both are on the dashboard, so by the time this
     is sent the quote is already mounted and listening. The unlock is written
     by the door before it announces itself, which is why this asks about the
     title and not about the day — the day is the thing that just changed. */
  useEffect(() => {
    const onUnlocked = () => {
      if (account === null || earnedTitle(account)) return;
      reveal();
    };
    window.addEventListener(EGG_UNLOCKED, onUnlocked);
    return () => window.removeEventListener(EGG_UNLOCKED, onUnlocked);
  }, [reveal, account]);

  const containerClass =
    (clue ? ' quote-ominous' : '') + (spotlight ? ' quote-spotlight' : '');

  return { clue, containerClass, quoteRef };
}
