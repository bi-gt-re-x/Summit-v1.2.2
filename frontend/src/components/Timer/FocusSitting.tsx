/**
 * The sitting, as a whole screen: the field, the tint over the window, and
 * components/Timer/FocusView on top.
 *
 * Two pages show it. The Timer page swaps itself for this while a focus phase
 * runs, and the dashboard does the same when Start Focus is pressed in its
 * Focus panel. One component so the two cannot drift: a sitting started from
 * the dashboard has to look like the one the Timer page taught the reader to
 * expect, and a second copy of this markup would be a second thing to keep
 * true.
 *
 * ## Why it tells the shell it is here
 *
 * The sitting renders its own <Ambient surge />, lifted over the tint (see
 * `.pom-page--sitting .hm-ambient` in styles/timer.css). The shell renders one
 * too, on every page but the Timer, and two canvases are two rAF loops drawing
 * one field nobody can tell apart. `useSittingShown` is how App.tsx knows to
 * stand its own down while this is on screen, wherever it was opened from.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { Ambient } from '@/components';
import { FocusView, type FocusViewProps } from '@/components/Timer/FocusView';
import '@/styles/timer.css';

let shown = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether a sitting is on screen, for the shell's ambient layer. */
export function useSittingShown(): boolean {
  return useSyncExternalStore(subscribe, () => shown > 0, () => false);
}

export interface FocusSittingProps extends FocusViewProps {
  /** On its way out: fades rather than cuts. See `useHandover`. */
  leaving: boolean;
}

export function FocusSitting({ leaving, ...view }: FocusSittingProps) {
  useEffect(() => {
    shown += 1;
    listeners.forEach((listener) => listener());
    return () => {
      shown -= 1;
      listeners.forEach((listener) => listener());
    };
  }, []);

  return (
    <div className={`pom-page pom-page--sitting${leaving ? ' is-going' : ''}`}>
      <Ambient cursor surge />
      <div className="pom-sit-scrim" aria-hidden="true" />
      <FocusView {...view} />
    </div>
  );
}
