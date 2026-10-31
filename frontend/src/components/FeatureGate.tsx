/**
 * The note in front of an advanced page the account has not opened yet.
 *
 * A layout route in App.tsx: every advanced page sits under it, so a link
 * from the dashboard, a search result, a bookmark and the rail all arrive at
 * the same place. When the page is unlocked it renders the page and nothing
 * else.
 *
 * Locked pages aren't in the rail, so this is what a typed URL, a bookmark or
 * a search result lands on. It says what the page is, why it waits and when
 * it opens, and sends the reader back. Opening it anyway is still there, for
 * good, as the quieter button. See utils/starter for when a page is locked.
 */
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Loading } from './PageState';
import { useStarter } from '@/hooks/useStarter';
import { daysOfTasks, featureForPath } from '@/utils/starter';
import '@/styles/starter.css';

export function FeatureGate() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const starter = useStarter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const feature = featureForPath(pathname);
  if (!feature) return <Outlet />;
  if (!starter.ready) return <Loading />;
  if (!starter.isLocked(feature.id)) return <Outlet />;

  const back = () => {
    /* Back where the reader came from when there is somewhere to go back to;
       the dashboard when they arrived here first, from a bookmark. */
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/dashboard');
  };

  const openIt = async () => {
    setBusy(true);
    setFailure(null);
    const problem = await starter.open(feature.id);
    setBusy(false);
    if (problem) setFailure(problem);
  };

  return (
    <div className="gs-page">
      <section className="gs-card" aria-labelledby="gs-title">
        <span className="gs-badge" aria-hidden="true">
          <Lock />
        </span>
        <p className="gs-eyebrow">Opens soon</p>
        <h1 id="gs-title">{feature.name}</h1>
        <p className="gs-what">{feature.what}</p>

        <div className="gs-why">
          <strong>Why the wait?</strong>
          <p>{feature.why}</p>
        </div>

        <p className="gs-when">
          {feature.name} opens after {daysOfTasks(feature.after - starter.taskDays)}. Any day you finish a task
          counts. Until then, Dashboard, Calendar and Log are all you need.
        </p>

        {failure && <p className="gs-bad" role="alert">{failure}</p>}

        <div className="gs-actions">
          <button type="button" className="gs-btn is-primary" disabled={busy} onClick={back}>
            Go back
          </button>
          <button type="button" className="gs-btn" disabled={busy} onClick={() => void openIt()}>
            {busy ? 'Opening…' : `Open ${feature.name} anyway`}
          </button>
        </div>
        <p className="gs-foot">
          Once you open it, it stays open. To unlock everything now, go to Settings, then Getting started.
        </p>
      </section>
    </div>
  );
}
