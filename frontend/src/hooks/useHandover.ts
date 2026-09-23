/**
 * One view handing the screen to another, without either of them jumping.
 *
 * React unmounts a branch the frame the condition flips, which is the whole
 * problem: the thing on its way out gets no chance to animate, so however
 * carefully the incoming view fades in, what the reader actually sees is the
 * old screen vanishing and a gap. Putting an animation on the arriving side
 * only ever fixes half of it.
 *
 * So `shown` lags `on` by `ms`, in both directions, and `leaving` is true for
 * exactly that gap. Whatever is on screen during it is on its way out and can
 * be given an exit animation of the same length; when the timer fires the swap
 * happens and the arriving side plays its own entrance. Sequential rather than
 * a cross-fade, because a cross-fade needs both views stacked and absolutely
 * positioned, and these two are different heights.
 *
 * `ms` is the *exit* length and nothing else. The entrance is whatever CSS the
 * arriving side already has, and the two do not need to match.
 *
 * ## Reversing mid-swap
 *
 * Somebody who pauses and immediately starts again flips `on` back before the
 * timer fires. The effect's cleanup cancels it and `shown` never moves, so the
 * view that was leaving simply stops leaving — no unmount, no second entrance,
 * and no state to unwind. That is the reason the lag is a cancelled timer
 * rather than a queue.
 *
 * ## Less motion
 *
 * `ms` of 0 makes this a pass-through: `shown` follows `on` in the same tick
 * and `leaving` is never true. Callers pass 0 when `reduced` (utils/homePlay)
 * says so, which is also what takes their exit animations off.
 */
import { useEffect, useState } from 'react';

export interface Handover {
  /** Which side to render. Follows `on`, `ms` behind it. */
  shown: boolean;
  /** Whether the side currently rendered is on its way out. */
  leaving: boolean;
}

export function useHandover(on: boolean, ms: number): Handover {
  const [shown, setShown] = useState(on);

  useEffect(() => {
    if (on === shown) return;
    if (ms <= 0) {
      setShown(on);
      return;
    }
    const swap = window.setTimeout(() => setShown(on), ms);
    return () => window.clearTimeout(swap);
  }, [on, shown, ms]);

  return { shown, leaving: on !== shown };
}
