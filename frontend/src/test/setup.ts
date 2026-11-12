/**
 * What every test file gets before it runs.
 *
 * Matchers, a cleanup between tests, and the two browser APIs the environment
 * does not hand over working: `matchMedia` and `localStorage`. Anything else a
 * single suite needs belongs in that suite, where a reader can see it.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Testing Library only auto-cleans when it can find a global `afterEach`, and
// only for its own configured setup. Doing it here is explicit and does not
// depend on that detection: without it, a component from one test is still in
// the document during the next, and `getByText` starts finding two of things.
afterEach(cleanup);


/**
 * jsdom has no `matchMedia`, and the rail calls it on its first render.
 *
 * The default is "no query matches", which is the desktop layout — the same
 * answer `useMediaQuery`'s own server snapshot gives, so a component tested
 * without any media setup behaves as it does on a laptop. A suite that wants a
 * phone calls `setMatchMedia` from `./media`.
 */
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      media: query,
      matches: false,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  });
}

/**
 * A `localStorage` that stores things.
 *
 * jsdom has a perfectly good one; it does not survive to the test. Node 26
 * ships its own experimental `localStorage` global, disabled unless the
 * process was started with `--localstorage-file`, and it wins: `window
 * .localStorage` resolves through an accessor that returns `undefined`, while
 * `sessionStorage` — which Node does not define — comes through as jsdom's.
 *
 * So this replaces it with an in-memory Storage. The app reads and writes it
 * on the first render of the rail, so without one, every test of a preference
 * that is cached locally would be exercising nothing but the catch block.
 *
 * `configurable: true` on purpose: a test that wants to know what happens in
 * private mode spies on these methods and makes them throw.
 */
if (!window.localStorage) {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(String(key), String(value));
    },
    removeItem: (key: string) => {
      store.delete(String(key));
    },
    clear: () => store.clear(),
  };

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => storage,
  });
}
