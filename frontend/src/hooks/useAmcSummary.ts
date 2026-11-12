/**
 * The dashboard's numbers, for the chrome: the rail's foot and review badge,
 * and the top bar's account menu.
 *
 * One request shared by every caller (a module-level promise), refreshed when
 * an answer, a mock or a plan change announces AMC_CHANGED. The rail and the
 * bar are mounted outside the router and never unmount, so without the event
 * they would show the numbers the session opened with.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { AMC_CHANGED, amc, type Dashboard } from '@/services/amc';

let shared: Promise<Dashboard | null> | null = null;
let latest: Dashboard | null = null;

function load(force = false): Promise<Dashboard | null> {
  if (!shared || force) {
    shared = amc
      .dashboard()
      .then((reply) => {
        latest = reply.success ? reply : null;
        return latest;
      })
      .catch(() => latest);
  }
  return shared;
}

/** Drop the shared answer (tests, and signing out). */
export function forgetAmcSummary(): void {
  shared = null;
  latest = null;
}

export function useAmcSummary(): Dashboard | null {
  const { status } = useAuth();
  const signedIn = status === 'signed-in';
  const [data, setData] = useState<Dashboard | null>(latest);

  useEffect(() => {
    if (!signedIn) {
      shared = null;
      latest = null;
      setData(null);
      return undefined;
    }
    let live = true;
    void load().then((d) => {
      if (live) setData(d);
    });
    const refresh = () => {
      void load(true).then((d) => {
        if (live) setData(d);
      });
    };
    window.addEventListener(AMC_CHANGED, refresh);
    return () => {
      live = false;
      window.removeEventListener(AMC_CHANGED, refresh);
    };
  }, [signedIn]);

  return signedIn ? data : null;
}
