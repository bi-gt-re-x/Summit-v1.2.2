/**
 * The one place a network call is made.
 *
 * Everything else in services/ is built on `get`, `post`, `put` and `del`, so
 * the three rules that matter are enforced once, here, rather than remembered
 * at each of the ~50 call sites:
 *
 * 1. **`credentials: 'include'`** — the session lives in a cookie, and a fetch
 *    without this sends no cookie, so every signed-in call would come back
 *    signed out.
 *
 * 2. **`cache: 'no-store'`** — the backend is the source of truth for XP,
 *    levels and streaks. Without it a second tab can show a stale number that
 *    never corrects itself. The old scripts set this on every read for the same
 *    reason; it is not optional.
 *
 * 3. **A failure is HTTP 200.** The backend answers `{success: false}` with a
 *    200, so `response.ok` is nearly meaningless here — the flag is the answer.
 *    These helpers return the envelope rather than throwing on it, and callers
 *    narrow on `.success`. `ApiError` is thrown only when the network itself
 *    failed or the body was not JSON, which are the cases no caller can handle
 *    field-by-field anyway.
 *
 * ## The one exception: 401
 *
 * Every endpoint that touches an account now derives it from the session
 * cookie rather than a `username` parameter (backend/api/guard.py), and
 * answers 401 when there is no session behind the request. That is the single
 * status code this layer reads, because it is the only failure the *app* acts
 * on rather than displays: a session that expired mid-visit should put the
 * reader in front of the sign-in popup, not leave twelve panels each showing
 * "Sign in to continue." in their own error state.
 *
 * `onUnauthorized` is how it gets there. AuthProvider registers a callback on
 * mount; this module calls it once per 401 and still returns the envelope, so
 * a caller that wants to render something in the meantime can.
 *
 * ## And one header: the task list changed
 *
 * The browser keeps copies of the account's tasks — the shared list Tasks,
 * the calendar and the dashboard read (context/UserDataProvider) and the
 * analytics history (services/taskHistory). They used to go stale whenever a
 * page changed a task and forgot to say so. The server now marks every
 * response from a request that wrote the task list
 * (`X-Summit-Tasks-Changed`, backend/middleware/writes.py), and this is where
 * it is read: the change is announced once (utils/statsBus), and the copies
 * refresh themselves off that. No caller has to remember.
 */
import { ApiError } from '@/types';
import type { ApiResult } from '@/types';
import { announceStatsChanged } from '@/utils/statsBus';
import { API_BASE } from './constants';

/** Set by the server on a response from a request that changed the task list. */
export const TASKS_CHANGED_HEADER = 'X-Summit-Tasks-Changed';

/**
 * What to do when the server says nobody is signed in.
 *
 * A module-level slot rather than a parameter threaded through ~50 call sites,
 * and a slot rather than an event because there is exactly one thing that
 * should ever react to it. AuthProvider owns it; nothing else should set it.
 */
let unauthorized: (() => void) | null = null;

export function onUnauthorized(handler: (() => void) | null): void {
  unauthorized = handler;
}

type Query = Record<string, string | number | boolean | undefined | null>;

/** Build a URL, dropping params that have no value. */
function url(path: string, query?: Query): string {
  const full = `${API_BASE}${path}`;
  if (!query) return full;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${full}?${qs}` : full;
}

async function request<T>(
  path: string,
  init: RequestInit,
  query?: Query,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url(path, query), {
      credentials: 'include',
      cache: 'no-store',
      ...init,
    });
  } catch (cause) {
    throw new ApiError(
      cause instanceof Error ? cause.message : 'Network request failed',
    );
  }

  // Before the body is even parsed: whatever this call was, the answer is that
  // the reader is signed out, and every other call in flight is about to say
  // the same thing. Telling AuthProvider once is what turns twelve failures
  // into one sign-in popup.
  if (response.status === 401) {
    unauthorized?.();
  }

  // The task list changed on the server: say so, whoever called. Read before
  // the body, because the change happened whatever the body turns out to be.
  if (response.headers?.get?.(TASKS_CHANGED_HEADER)) {
    announceStatsChanged();
  }

  const body = await response.text();
  if (!body) {
    throw new ApiError('The server returned an empty response', response.status);
  }

  try {
    return JSON.parse(body) as ApiResult<T>;
  } catch {
    // An HTML error page, a proxy timeout, a crash — anything but the contract.
    throw new ApiError(
      `The server returned ${response.status} but not JSON`,
      response.status,
    );
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function get<T>(path: string, query?: Query): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'GET' }, query);
}

export function post<T>(path: string, body?: unknown, query?: Query): Promise<ApiResult<T>> {
  return request<T>(
    path,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body ?? {}),
    },
    query,
  );
}

export function put<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  return request<T>(path, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body ?? {}),
  });
}

/**
 * A change to part of a resource, where PUT would mean "and the rest is as
 * sent". The subject library's colour endpoint is the first of these: it
 * changes one field of a subject and must not be read as a description of the
 * whole one.
 */
export function patch<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  return request<T>(path, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body ?? {}),
  });
}

export function del<T>(path: string, query?: Query): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'DELETE' }, query);
}

