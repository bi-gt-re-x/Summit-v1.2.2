/**
 * Whether a skill check is on screen.
 *
 * The check takes the whole window, so the guided tour stands down while it's
 * up, the way it does for a focus sitting (components/Timer/FocusSitting.tsx).
 * Its own small module so the tour, which ships with every page, doesn't pull
 * the check into the first download.
 */
import { useSyncExternalStore } from 'react';

let shown = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function tell() {
  listeners.forEach((listener) => listener());
}

export function useCheckShown(): boolean {
  return useSyncExternalStore(subscribe, () => shown > 0, () => false);
}

/** Count one check as open. Returns the undo, for an effect's cleanup. */
export function markCheckShown(): () => void {
  shown += 1;
  tell();
  return () => {
    shown -= 1;
    tell();
  };
}
