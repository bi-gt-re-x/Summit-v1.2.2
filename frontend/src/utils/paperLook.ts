/**
 * Loading the paper look on demand. See styles/paperLook.ts for why it is not
 * part of the stylesheet every route waits on.
 *
 * One promise for the whole visit, so asking twice costs nothing. Vite's
 * dynamic import resolves only once the CSS it brings has loaded, which is
 * what lets main.tsx and App.tsx wait on it and never show an app page in the
 * wrong colours. A failed load still resolves: a page in the plain look is
 * better than a page that never appears.
 */
let ready = false;
let pending: Promise<void> | null = null;

export function loadPaper(): Promise<void> {
  pending ??= import('@/styles/paperLook').then(
    () => {
      ready = true;
    },
    () => {
      ready = true;
    },
  );
  return pending;
}

/** Whether the sheets are in, so a render can skip waiting. */
export function paperLoaded(): boolean {
  return ready;
}

/** The two routes that never use it: the landing page and the sign-in page. */
export function skipsPaper(pathname: string): boolean {
  return pathname === '/home' || pathname === '/login';
}
