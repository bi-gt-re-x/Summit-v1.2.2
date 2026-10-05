/**
 * The three Personal spaces, for the rail and the space page.
 *
 * Starts on the defaults ("Space 1" to "Space 3") so the rail draws at once,
 * then takes the account's names when they land, and hears a rename the page
 * saves (SPACES_CHANGED) without asking again.
 */
import { useEffect, useState } from 'react';
import { DEFAULT_SPACES, SPACES_CHANGED, list, type Space } from '@/services/spaces';

export function useSpaces(enabled = true): { spaces: Space[]; ready: boolean } {
  const [spaces, setSpaces] = useState<Space[]>(DEFAULT_SPACES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    list()
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
  }, [enabled]);

  useEffect(() => {
    const changed = (event: Event) => {
      const space = (event as CustomEvent<Space>).detail;
      if (!space) return;
      setSpaces((was) => was.map((row) => (row.id === space.id ? space : row)));
    };
    window.addEventListener(SPACES_CHANGED, changed);
    return () => window.removeEventListener(SPACES_CHANGED, changed);
  }, []);

  return { spaces, ready };
}
