/**
 * About you, in Settings: the sign-up answers, loaded and editable.
 *
 * The same form as the last step of sign-up (./AboutYou), filled with what
 * was saved, and a line after each save saying what it now counts for.
 */
import { useEffect, useState } from 'react';
import * as backgroundService from '@/services/background';
import type { Background } from '@/services/background';
import { AboutYou } from './AboutYou';

export function AboutYouSettings() {
  const [saved, setSaved] = useState<Background | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [done, setDone] = useState('');

  useEffect(() => {
    let live = true;
    void backgroundService
      .read()
      .then((result) => {
        if (!live) return;
        if (result.success) setSaved(result);
        setLoaded(true);
      })
      .catch(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, []);

  if (!loaded) return <p className="ay-hint">Loading your answers…</p>;

  return (
    <div className="ay-settings">
      <AboutYou
        key={saved?.updated_at ?? 'new'}
        initial={saved?.answers}
        submitLabel="Save"
        onDone={(next) => {
          setSaved(next);
          setDone(
            `Saved. Summit pulled ${next.facts.length} ${next.facts.length === 1 ? 'fact' : 'facts'} from it` +
              (next.detail.head_start > 0
                ? `, and it counts for up to ${next.detail.head_start} days toward Analytics.`
                : '.'),
          );
        }}
      />
      {done && (
        <p className="ay-saved" role="status">
          {done}
        </p>
      )}
    </div>
  );
}
