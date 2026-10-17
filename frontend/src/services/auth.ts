/**
 * Accounts: signing in, signing up, and who is signed in now.
 *
 * The session is a cookie the backend sets and reads; nothing here can see it,
 * which is the point — it is httpOnly-adjacent in effect, and the client never
 * holds a credential. What the client does keep is the *username*, in
 * localStorage, because almost every other endpoint takes it as a parameter
 * and the pages would otherwise need a round trip before their first fetch.
 *
 * Backend: backend/routes/auth.py.
 */
import { get, post } from './api';
import { USERNAME_KEY } from './constants';
import type { ApiResult, PublicUser, Theme } from '@/types';

// --------------------------------------------------------------------------
// The remembered username
// --------------------------------------------------------------------------
/** The signed-in username as this browser last knew it, or null. */
export function storedUsername(): string | null {
  try {
    return localStorage.getItem(USERNAME_KEY) || null;
  } catch {
    // Storage can be blocked outright (private mode, a strict cookie policy).
    // The session cookie still works, so this is a lost convenience, not a
    // lost sign-in.
    return null;
  }
}

export function rememberUsername(username: string): void {
  try {
    localStorage.setItem(USERNAME_KEY, username);
  } catch {
    /* see storedUsername */
  }
}

export function forgetUsername(): void {
  try {
    localStorage.removeItem(USERNAME_KEY);
  } catch {
    /* see storedUsername */
  }
}

// --------------------------------------------------------------------------
// Signing in
// --------------------------------------------------------------------------
export interface LoginResult {
  message: string;
  user: { username: string; id?: string; theme: Theme };
  profile_complete: boolean;
  /** The account is in, but its address has still not been confirmed. */
  unverified?: boolean;
  email?: string | null;
}

/**
 * What `/api/login` answers.
 *
 * `unverified` used to ride on the *failure* envelope: an unconfirmed address
 * was a refused sign-in, and the popup turned it into "check your inbox". It
 * rides on the success envelope now, because an unconfirmed address no longer
 * refuses anything — it signs in and wears a banner. See the note on `login`
 * in backend/routes/auth.py.
 */
export type LoginAnswer = ApiResult<LoginResult> & {
  unverified?: boolean;
  email?: string | null;
};

/**
 * Sign in with a username or an e-mail address, and the password.
 *
 * Accounts made before the e-mail flow stored their password in the clear;
 * those still open, and the backend quietly upgrades each one to a real hash
 * the first time it is used.
 */
export async function login(
  identifier: string,
  password: string,
): Promise<LoginAnswer> {
  const result: LoginAnswer = await post<LoginResult>('/api/login', {
    username: identifier,
    password,
  });
  if (result.success) {
    rememberUsername(result.user.username);
  }
  return result;
}

export async function logout(): Promise<ApiResult<{ message: string }>> {
  const result = await post<{ message: string }>('/api/logout');
  forgetUsername();
  return result;
}

// --------------------------------------------------------------------------
// Signing up
// --------------------------------------------------------------------------
export interface Providers {
  /** Whether "Continue with Google" can actually work. */
  google: boolean;
  /** Whether verification e-mail is really sent, or printed to the console. */
  mail: boolean;
}

export function providers(): Promise<ApiResult<Providers>> {
  return get<Providers>('/api/auth/providers');
}

export interface SignupResult {
  email: string;
  sent: boolean;
  /**
   * The verification link, to click here rather than in an inbox.
   *
   * Only ever set in development — the server gates it on SUMMIT_DEV rather
   * than on the send having failed, because a token confirming an address is
   * not something to hand whoever asked for it. See `dev_mode` in
   * backend/config/settings.py.
   */
  dev_link: string | null;
  /** The mail did not go out, and there is no link to show instead. */
  mail_failed?: boolean;
  message: string;
  /**
   * Signing up now signs the account in, so these two are what the popup
   * needs to carry straight on to Complete Profile rather than parking the
   * reader on "check your inbox". See `signup` in backend/routes/auth.py.
   */
  username?: string;
  profile_complete?: boolean;
}

export function signup(
  name: string,
  email: string,
  password: string,
): Promise<ApiResult<SignupResult>> {
  return post<SignupResult>('/api/auth/signup', { name, email, password });
}

/**
 * Whether an address can still sign up: `valid` is false for something that
 * isn't an address yet, `available` false when an account already has it (or
 * another spelling of the same inbox). A POST so the address stays out of the
 * URL. See `email_check` in backend/routes/auth.py.
 */
export function checkEmail(email: string): Promise<ApiResult<{ valid: boolean; available: boolean }>> {
  return post<{ valid: boolean; available: boolean }>('/api/auth/email_check', { email });
}

export function resendVerification(
  email?: string,
): Promise<ApiResult<SignupResult & { already?: boolean }>> {
  return post('/api/auth/resend', { email });
}

export interface VerifyStatus {
  /**
   * The *address* is confirmed. Not the same question as `signed_in`, and no
   * longer what decides whether the app opens — it decides whether the app
   * wears the "confirm your e-mail" banner.
   */
  verified: boolean;
  /** The *session* is live. This is the app's answer to "am I signed in?". */
  signed_in: boolean;
  profile_complete: boolean;
  /** Who the session belongs to. */
  username: string;
  /** Their profile picture, as a path under /static. */
  avatar: string;
}

/**
 * Who is signed in, and whether their account is finished.
 *
 * Two jobs. The "check your inbox" screen polls it, so clicking the link in
 * another tab moves this one along on its own. And it is how the app learns
 * who it is talking to on load: the session is a cookie this code cannot read,
 * so the username has to come from the server.
 */
export function verifyStatus(): Promise<ApiResult<VerifyStatus>> {
  return get<VerifyStatus>('/api/auth/verify_status');
}

export async function completeProfile(fields: {
  username?: string;
  theme?: Theme;
  daily_goal?: number;
}): Promise<ApiResult<{ user: PublicUser; message: string }>> {
  const result = await post<{ user: PublicUser; message: string }>(
    '/api/auth/complete_profile',
    fields,
  );
  if (result.success) {
    rememberUsername(result.user.username);
  }
  return result;
}

// --------------------------------------------------------------------------
// The rest of the account
// --------------------------------------------------------------------------
/** Pick the account's profile picture, from the fifty. */
export function setAvatar(avatar: string): Promise<ApiResult<{ avatar: string }>> {
  return post<{ avatar: string }>('/api/avatar', { avatar });
}

/**
 * Store the theme.
 *
 * The backend replies with a `theme` cookie, which is what makes a
 * server-rendered page arrive already in the right theme. Applying it to the
 * live document is ThemeContext's job, not this one's.
 */
export function setTheme(theme: Theme): Promise<ApiResult<{ persisted: boolean }>> {
  return post<{ persisted: boolean }>('/api/set_theme', { theme });
}

/** Where to send the browser for Google sign-in. A full page redirect. */
export function googleSignInUrl(next = ''): string {
  return `/auth/google${next ? `?next=${encodeURIComponent(next)}` : ''}`;
}
