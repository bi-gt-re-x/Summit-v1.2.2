/**
 * The three spaces of one kind, for the rail and the space page.
 *
 * Starts on the defaults ("Space 1", "Team Space 1" …) so the rail draws at
 * once, then takes the account's when they land, and hears a change the page
 * saves (SPACES_CHANGED) without asking again.
 */
import { useEffect, useState } from 'react';
import {
  SPACES_CHANGED,
  defaultSpaces,
  list,
  type Space,
  type SpaceKind,
  type SpacesChanged,
} from '@/services/spaces';

export function useSpaces(
  enabled = true,
  kind: SpaceKind = 'personal',
): { spaces: Space[]; ready: boolean } {
  const [spaces, setSpaces] = useState<Space[]>(() => defaultSpaces(kind));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSpaces(defaultSpaces(kind));
    setReady(false);
    if (!enabled) return undefined;
    let live = true;
    list(kind)
      .then((result) => {
        if (live && result.success && Array.isArray(result.spaces)) setSpaces(result.spaces);
      })
      .catch(() => {
        /* the defaults stand */
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [enabled, kind]);

  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<SpacesChanged>).detail;
      if (!detail || detail.kind !== kind) return;
      setSpaces((was) => was.map((row) => (row.id === detail.space.id ? detail.space : row)));
    };
    window.addEventListener(SPACES_CHANGED, changed);
    return () => window.removeEventListener(SPACES_CHANGED, changed);
  }, [kind]);

  return { spaces, ready };
}
