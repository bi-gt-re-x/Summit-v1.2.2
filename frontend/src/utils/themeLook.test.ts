/**
 * The look this browser remembers between loads.
 *
 * Light and dark already survived a refresh — the backend sets a cookie and
 * the inline script in index.html reads it before the first paint. The accent
 * and the palette did not: both live in the account's preferences, which
 * arrive after the auth round trip, so every load painted violet on the
 * built-in ground and then snapped to the reader's real theme. On Midnight or
 * Sunset that is the whole page changing colour after it has been read.
 *
 * Two things are worth pinning here and neither is the happy path.
 *
 * The first is that **nothing throws**. This is read in the document head on
 * every single load, and Safari's private mode raises on `localStorage`
 * instead of returning null — a look that cannot be remembered has to degrade
 * to a flash, never to a blank page.
 *
 * The second is the key itself. It is written down twice, here and in the
 * inline script, which cannot import from a module because it runs before any
 * module is fetched. That duplication is load-bearing and invisible: rename it
 * in one place and the theme silently stops being restored, with nothing
 * failing anywhere. The last test in this file reads index.html and is the
 * only thing standing between that and a silent regression.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOOK_KEY, forgetLook, rememberLook, rememberedLook } from './themeLook';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('remembering', () => {
  it('reads back what it wrote', () => {
    rememberLook({ accent: 'blue', skin: 'midnight' });
    expect(rememberedLook()).toEqual({ accent: 'blue', skin: 'midnight' });
  });

  it('keeps the plain look too, so it can override a stale one', () => {
    // Not an absence: somebody moving from Midnight back to plain Dark has to
    // have that written down, or the next load restores Midnight.
    rememberLook({ accent: 'violet', skin: '' });
    expect(rememberedLook()).toEqual({ accent: 'violet', skin: '' });
  });

  it('is empty before anything has been stored', () => {
    expect(rememberedLook()).toEqual({});
  });

  it('is empty again after a sign-out', () => {
    rememberLook({ accent: 'rose', skin: 'orchid' });
    forgetLook();
    expect(rememberedLook()).toEqual({});
  });
});

describe('when the browser will not cooperate', () => {
  /** Safari in private mode: the accessor itself raises. */
  const throwing = (method: 'getItem' | 'setItem' | 'removeItem') =>
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new DOMException('denied');
    });

  it('reads as empty rather than throwing into the head script', () => {
    throwing('getItem');
    expect(() => rememberedLook()).not.toThrow();
    expect(rememberedLook()).toEqual({});
  });

  it('writes are a no-op rather than an error', () => {
    throwing('setItem');
    expect(() => rememberLook({ accent: 'green', skin: 'meadow' })).not.toThrow();
  });

  it('so is forgetting', () => {
    throwing('removeItem');
    expect(() => forgetLook()).not.toThrow();
  });
});

describe('when what is stored is nonsense', () => {
  it('survives a value that is not JSON', () => {
    window.localStorage.setItem(LOOK_KEY, 'not json {{{');
    expect(rememberedLook()).toEqual({});
  });

  it('survives JSON that is not an object', () => {
    window.localStorage.setItem(LOOK_KEY, '"midnight"');
    expect(rememberedLook()).toEqual({});
  });

  it('survives null, which is valid JSON and not an object', () => {
    window.localStorage.setItem(LOOK_KEY, 'null');
    expect(rememberedLook()).toEqual({});
  });

  it('drops a field of the wrong type and keeps the other', () => {
    window.localStorage.setItem(LOOK_KEY, JSON.stringify({ accent: 7, skin: 'sunset' }));
    expect(rememberedLook()).toEqual({ skin: 'sunset' });
  });

  /**
   * Deliberately not validated against the list of real skins. The value is
   * handed to `setAttribute` and the stylesheet has a block only for the names
   * it knows, so an unrecognised one selects nothing and the page renders
   * plain — the right failure, and one that does not need a third copy of the
   * list of palettes to achieve.
   */
  it('passes an unknown name through for the stylesheet to ignore', () => {
    window.localStorage.setItem(LOOK_KEY, JSON.stringify({ skin: 'graphite' }));
    expect(rememberedLook()).toEqual({ skin: 'graphite' });
  });
});

describe('the key, which is written down twice', () => {
  it('is the one the inline script in index.html reads', () => {
    // That script runs in the head before any module is fetched, so it cannot
    // import LOOK_KEY. If this fails, the theme has silently stopped being
    // restored and no other test in the suite would notice.
    const html = readFileSync('frontend/index.html', 'utf8');
    expect(html).toContain(`localStorage.getItem('${LOOK_KEY}')`);
  });

  it('and that script still restores both halves of the look', () => {
    const html = readFileSync('frontend/index.html', 'utf8');
    expect(html).toContain("setAttribute('data-accent'");
    expect(html).toContain("setAttribute('data-skin'");
  });
});
