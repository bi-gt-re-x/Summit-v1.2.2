/**
 * The spaces of one kind and their folders, for the rail and the space page.
 *
 * Starts on the defaults ("Space 1", "Team Space 1" …) so the rail draws at
 * once, then takes the account's when they land. Hears a change the page saves
 * (SPACES_CHANGED) without asking again, and reads the list again when a page
 * is added, deleted or filed, or a folder changes (SPACES_RELOAD).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  SPACES_CHANGED,
  SPACES_RELOAD,
  defaultSpaces,
  list,
  type Folder,
  type Space,
  type SpaceKind,
  type SpacesChanged,
} from '@/services/spaces';

export function useSpaces(
  enabled = true,
  kind: SpaceKind = 'personal',
): { spaces: Space[]; folders: Folder[]; ready: boolean; reload: () => void } {
  const [spaces, setSpaces] = useState<Space[]>(() => defaultSpaces(kind));
  const [folders, setFolders] = useState<Folder[]>([]);
  const [ready, setReady] = useState(false);
  const [round, setRound] = useState(0);
  const reload = useCallback(() => setRound((n) => n + 1), []);

  useEffect(() => {
    setSpaces(defaultSpaces(kind));
    setFolders([]);
    setReady(false);
  }, [kind]);

  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    // Not ready again until this read lands, so a page can tell a list that
    // hasn't caught up yet from one that really doesn't have it.
    setReady(false);
    list(kind)
      .then((result) => {
        if (!live || !result.success || !Array.isArray(result.spaces)) return;
        setSpaces(result.spaces);
        setFolders(Array.isArray(result.folders) ? result.folders : []);
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
  }, [enabled, kind, round]);

  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<SpacesChanged>).detail;
      if (!detail || detail.kind !== kind) return;
      setSpaces((was) => was.map((row) => (row.id === detail.space.id ? { ...row, ...detail.space } : row)));
    };
    const again = (event: Event) => {
      if ((event as CustomEvent<SpaceKind>).detail === kind) reload();
    };
    window.addEventListener(SPACES_CHANGED, changed);
    window.addEventListener(SPACES_RELOAD, again);
    return () => {
      window.removeEventListener(SPACES_CHANGED, changed);
      window.removeEventListener(SPACES_RELOAD, again);
    };
  }, [kind, reload]);

  return { spaces, folders, ready, reload };
}
