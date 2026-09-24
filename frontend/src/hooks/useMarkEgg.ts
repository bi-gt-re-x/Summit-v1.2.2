/**
 * The hidden chain's front door — ten clicks on the mark in the Focus card's
 * corner.
 *
 * Nothing at all for the first three, so a reader who taps the logo twice out
 * of idleness never learns there is anything there. From the fourth the mark
 * bounces and the screen shakes with it, and both climb steeply: the fourth is
 * a twitch, the ninth throws the page about. The tenth writes the day's unlock
 * and announces it, and the quote at the foot of the dashboard does the rest —
 * see hooks/useQuoteEgg.ts.
 *
 * ## Why the door and the room are separate again
 *
 * They were one hook for a while, when the door was the mark sitting directly
 * over the quote. The door is in the corner of the Focus card now, which is a
 * different component, so the two need a word between them — `EGG_UNLOCKED` in
 * utils/easterEgg.ts. It carries no payload and expects no answer, because
 * there is exactly one thing to say.
 *
 * What it does *not* need is the latch that went with it the first time round.
 * That existed when the door was the rail's title and the tenth click could
 * land on a page with no quote on it, so the reveal had to be owed across a
 * navigation. Both ends are on the dashboard now and are mounted together.
 *
 * ## There is no dark-mode gate any more
 *
 * There was, here and on the pentagon this door leads to, and between them
 * they made the chain unfindable rather than hidden. A reader in the light
 * theme clicked the mark ten times, got nothing at all, and had no way to
 * learn that the theme was the reason — which is the one state a secret must
 * not be in: not mysterious, just broken. Both gates are gone, so the door
 * answers in whichever theme the reader is actually using.
 *
 * The silence of the first three clicks is what hides it, and that is enough:
 * it is a count nobody arrives at by accident, and the mark gives no other
 * sign — no pointer cursor, no tooltip, no role.
 *
 * The bounce is `.dash-focus-mark.easter-pop` and the screen's shake is
 * `body.easter-wobble`, both in styles/dashboard.css.
 */
import { useCallback, useEffect, useRef } from 'react';

import { useChainAccount } from '@/hooks/useChainAccount';
import { EGG_UNLOCKED, earnedTitle, markUnlockedToday, unlockedToday } from '@/utils/easterEgg';

/** Clicks to unlock. */
const NEEDED = 10;

/**
 * Clicks that do nothing at all.
 *
 * Three, because two is inside the range of an accidental double-click and
 * four is enough clicks that somebody who meant them has already stopped. The
 * silence is the point: a secret that answers the first click is a button.
 */
const SILENT = 3;

/** How long a bounce and its shake run before the page is let still again. */
const SHAKE = 340;

export interface UseMarkEgg {
  /** Put this on the mark. */
  markRef: React.RefObject<HTMLImageElement | null>;
  /** The ten clicks land here. */
  onMarkClick: () => void;
}

export function useMarkEgg(): UseMarkEgg {
  const markRef = useRef<HTMLImageElement>(null);
  /* Whose ten clicks these are. `null` until the session check lands, which is
     also the only state in which this door stays shut for a reason that is not
     about the reader — see hooks/useChainAccount.ts. */
  const account = useChainAccount();

  /* Not state: the count is read and written inside one click and never
     rendered, so putting it in state would re-render the card nine times to
     show nothing. */
  const clicks = useRef(0);

  const timers = useRef<number[]>([]);
  useEffect(() => {
    const started = timers.current;
    return () => {
      started.forEach(window.clearTimeout);
      document.body.classList.remove('easter-wobble');
      document.documentElement.classList.remove('easter-shake-clip');
    };
  }, []);

  /**
   * Click n of ten, from the fourth.
   *
   * Both amplitudes are measured from the first click that shows anything, so
   * the fourth is a twitch rather than arriving a third of the way up the
   * scale — and both are squared, which is the shape the escalation wants. A
   * straight line from a twitch to a shake divides the climb into six even
   * steps, and six even steps do not read as a build; they read as a control
   * with a rate. Squared, the first three of the six are barely more than the
   * twitch and the last three arrive quickly, so the ninth is plainly the last
   * thing before something gives.
   *
   * The ceiling is the reveal's own shake, which peaks at 30px and 2deg in
   * `easterShake`. The ninth click lands just under both: the thing that comes
   * next has to be bigger than the thing that led up to it.
   */
  const shake = useCallback((n: number) => {
    const felt = n - SILENT;
    const force = felt * felt;

    const mark = markRef.current;
    if (mark) {
      mark.style.setProperty('--pop', (1 + felt * 0.07).toFixed(2));
      mark.classList.remove('easter-pop');
      void mark.offsetWidth; // restart the animation
      mark.classList.add('easter-pop');
    }

    const root = document.documentElement;
    root.style.setProperty('--wob', `${(force * 0.7).toFixed(2)}px`);
    root.style.setProperty('--wob-rot', `${(force * 0.055).toFixed(3)}deg`);
    root.classList.add('easter-shake-clip');
    document.body.classList.remove('easter-wobble');
    void document.body.offsetWidth; // restart the animation
    document.body.classList.add('easter-wobble');

    timers.current.push(
      window.setTimeout(() => {
        document.body.classList.remove('easter-wobble');
        root.classList.remove('easter-shake-clip');
        mark?.classList.remove('easter-pop');
      }, SHAKE),
    );
  }, []);

  const onMarkClick = useCallback(() => {
    /* Nothing to find: nobody is known yet, the clue is out for today, or the
       chain has already paid out this account's title. Either way the mark is
       just a logo. */
    if (account === null) return;
    if (unlockedToday(account) || earnedTitle(account)) return;

    clicks.current += 1;
    if (clicks.current < NEEDED) {
      if (clicks.current > SILENT) shake(clicks.current);
      return;
    }

    clicks.current = 0;
    /* The shake from the ninth is still on the body and would fight the
       reveal's own, bigger one for the same animation slot. The quote's reveal
       clears it as its first move; this leaves the root's clip alone, because
       that is what stops the reveal's offsets surfacing a scrollbar. */
    document.body.classList.remove('easter-wobble');
    markUnlockedToday(account);
    window.dispatchEvent(new CustomEvent(EGG_UNLOCKED));
  }, [account, shake]);

  return { markRef, onMarkClick };
}
