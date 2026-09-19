/**
 * The account gate, client side.
 *
 * The backend gate (backend/middleware/gate.py) is the one that matters — it
 * is what actually stops a signed-out request, and it cannot be got around.
 * This is the same rule expressed in the router so a signed-out visitor sees
 * the sign-in page instead of a page that renders empty and then errors.
 *
 * Waiting on `status` rather than treating unknown as signed-out is the whole
 * point of having three states: without it, a signed-in visitor is bounced to
 * /login for the moment before the session check comes back.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loading } from '@/components';
import { useAuth } from '@/hooks';

export function RequireAccount() {
  const { status, profileComplete } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <Loading label="Checking your account" />;
  }

  // `next` carries where they were headed, so finishing the flow lands them
  // there rather than on the home page — same contract as the backend gate.
  //
  // The whole URL, not just the path. The backend's version cannot do better
  // than the path, because a fragment is never sent to a server; this one can
  // see it, and dropping it would send the reader back to a page that has
  // forgotten what they asked it for. `/calendar#void` is the case that
  // matters — see hooks/useVoid.ts — and it is a link somebody can arrive on
  // with an expired session like any other.
  const next = encodeURIComponent(location.pathname + location.search + location.hash);

  if (status === 'signed-out') {
    return <Navigate to={`/login?auth=login&next=${next}`} replace />;
  }

  if (!profileComplete) {
    return <Navigate to={`/login?auth=profile&next=${next}`} replace />;
  }

  return <Outlet />;
}
