/**
 * Who is signed in.
 *
 * The session is a cookie this code cannot read, so "who is signed in" is
 * answered by asking the server. `verify_status` reports the username, whether
 * the session is live, whether the address is confirmed, and whether the
 * profile is finished.
 *
 * **The gate reads `signed_in`, not `verified`.** It used to read `verified`,
 * which was correct only while an unconfirmed address meant a refused sign-in.
 * It does not any more: an account works with its address unconfirmed, and the
 * confirmation is asked for by a banner over the app rather than by a locked
 * door in front of it. Gating on `verified` today would sign such an account
 * out on its next page load — the server would keep letting it in and this
 * provider would keep calling it a stranger.
 *
 * The username in localStorage is a cache and never an identity. The server
 * reads who you are off the session cookie and nothing else — see
 * backend/api/guard.py — so this copy cannot grant access to anything; it
 * exists so a page can label itself before `verify_status` comes back. When
 * the server disagrees, the server wins.
 *
 * `status` distinguishes "still asking" from "asked, nobody home" — a
 * distinction the gate depends on, or a signed-in user is bounced to the
 * sign-in popup for the moment before the answer arrives.
 *
 * The hook is in src/hooks/useAuth.ts and the context in ./contexts.ts — see
 * the note there for why this file exports only a component.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from './contexts';
import type { AuthStatus } from './contexts';
import { api, auth } from '@/services';
import { FALLBACK_AVATAR, avatarPath } from '@/services/avatars';
import { forgetLook } from '@/utils/themeLook';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [username, setUsername] = useState<string | null>(auth.storedUsername);
  const [profileComplete, setProfileComplete] = useState(true);
  /* Assumed true until the server says otherwise, so the banner does not
     flash over the app for the one render before the first answer lands. */
  const [emailVerified, setEmailVerified] = useState(true);
  const [avatar, setAvatar] = useState(() => avatarPath(FALLBACK_AVATAR));

  const refresh = useCallback(async () => {
    try {
      const result = await auth.verifyStatus();
      if (result.success && result.signed_in) {
        setStatus('signed-in');
        setProfileComplete(result.profile_complete);
        setEmailVerified(result.verified);
        // The server's answer wins over the cached one, and is the only answer
        // at all when this browser has no cache — storage cleared, or another
        // browser holding the same session cookie.
        setUsername(result.username);
        setAvatar(result.avatar);
        auth.rememberUsername(result.username);
        return;
      }
    } catch {
      // The network is down, or the backend is not up. Treat it as signed out
      // rather than hanging on 'loading' forever — the pages that matter are
      // gated server-side anyway, so nothing is exposed by guessing wrong.
    }
    setStatus('signed-out');
    setUsername(null);
    setEmailVerified(true);
    auth.forgetUsername();
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /* A 401 from anywhere means the session is gone — expired, signed out in
     another tab, or the server restarted with a different SECRET_KEY. The
     endpoints answer it themselves now that they read the account off the
     session rather than off a parameter (backend/api/guard.py), so this is
     the app's one place to react: drop to signed-out, which the route gate
     turns into the sign-in popup with `next` set to where the reader was.

     Guarded on `status` so a 401 arriving while already signed out — the
     verify_status poll on the landing page — does not re-render every
     subscriber for no change. */
  useEffect(() => {
    api.onUnauthorized(() => {
      setStatus((current) => (current === 'signed-in' ? 'signed-out' : current));
      setUsername((current) => {
        if (current) auth.forgetUsername();
        return null;
      });
    });
    return () => api.onUnauthorized(null);
  }, []);

  const signIn = useCallback(
    async (identifier: string, password: string): Promise<string | null> => {
      const result = await auth.login(identifier, password);
      if (!result.success) {
        return result.message;
      }
      setUsername(result.user.username);
      setProfileComplete(result.profile_complete);
      setEmailVerified(!result.unverified);
      setStatus('signed-in');
      return null;
    },
    [],
  );

  const signOut = useCallback(async () => {
    await auth.logout();
    /* The remembered accent and palette go with the session. They are read by
       the inline script in index.html, which runs before anything knows who
       is here — so leaving them behind would tint the signed-out landing page
       with the last account's theme. Deliberately only on this path and not on
       a lapsed session; see `forgetLook`. */
    forgetLook();
    setUsername(null);
    setProfileComplete(true);
    setEmailVerified(true);
    setAvatar(avatarPath(FALLBACK_AVATAR));
    setStatus('signed-out');
  }, []);

  const value = useMemo(
    () => ({ status, username, profileComplete, emailVerified, avatar, signIn, signOut, refresh }),
    [status, username, profileComplete, emailVerified, avatar, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
