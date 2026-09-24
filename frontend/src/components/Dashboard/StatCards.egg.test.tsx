/**
 * The mark in the Focus card's corner: the hidden chain's front door.
 *
 * Almost all of this is about the door staying shut. It is a logo on a card
 * anybody might click, so the tests that matter are the ones that prove it
 * does nothing — for the first three clicks, and for ever once the chain has
 * paid the account its title. The silence is asserted as carefully as the
 * shake, because a secret that answers the first click is a button with a
 * strange icon.
 *
 * What is *not* a gate any more is the theme. There was a dark-mode check
 * here and another on the pentagon, and between them they made the chain
 * unfindable rather than hidden: ten clicks in the light did nothing and
 * explained nothing. One test below stands where that one did, and asserts
 * the opposite.
 *
 * The escalation is pinned by value and not merely by direction. "It shakes
 * harder each time" is true of a straight line too, and a straight line is
 * what this replaced: six even steps from a twitch to a shake read as a
 * control with a rate rather than as a build. The figures below are the
 * squared curve — see the note on `shake` in hooks/useMarkEgg.ts.
 *
 * The storage keys are written out literally rather than built from
 * utils/easterEgg.ts, because their exact spelling is a contract with three
 * scripts that cannot import a module — frontend/secret/pentagon-egg.js,
 * frontend/secret/void.js and frontend/secret/engine.js all rebuild them by
 * hand. A test that derived the key the same way the code does would agree
 * with a rename and let the rest of the chain go quiet.
 */
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FocusCard } from './StatCards';
import { renderWithProviders } from '@/test/render';
import { EGG_UNLOCKED } from '@/utils/easterEgg';
import type { UseFocusSession } from '@/hooks/useFocusSession';

const TODAY = new Date('2026-08-30T21:00:00');

/* The signed-in account, not 'Default'. Two accounts on one browser get two
   chains, which is the whole point of the key carrying a name — see
   hooks/useChainAccount.ts. */
const KEY = 'easterEgg:myles:2026-08-30';

function session(): UseFocusSession {
  return {
    goalHours: 4,
    focused: 0,
    percent: 0,
    running: false,
    start: vi.fn(),
    stop: vi.fn(),
    setGoalHours: vi.fn(),
  };
}

function draw() {
  return renderWithProviders(<FocusCard session={session()} usualHours={1.3} />);
}

/** The door. Deliberately not a button, so it is found by its class. */
function mark() {
  return document.querySelector('.dash-focus-mark') as HTMLElement;
}

function dark(on: boolean) {
  document.documentElement.setAttribute('data-theme', on ? 'dark' : 'light');
}

/** n clicks on the mark, at whatever pace: there is no streak to keep. */
function click(n: number) {
  for (let i = 0; i < n; i++) mark().click();
}

/** The current shake amplitude, as the keyframes in dashboard.css read it. */
function wob() {
  return document.documentElement.style.getPropertyValue('--wob');
}

let announced = 0;
const count = () => {
  announced += 1;
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TODAY);
  localStorage.clear();
  dark(true);
  announced = 0;
  window.addEventListener(EGG_UNLOCKED, count);
});

afterEach(() => {
  window.removeEventListener(EGG_UNLOCKED, count);
  vi.useRealTimers();
  document.body.className = '';
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-theme');
});

describe('the mark on the Focus card', () => {
  it('is there, and says nothing to a screen reader', () => {
    draw();
    expect(mark()).toBeInTheDocument();
    expect(mark()).toHaveAttribute('alt', '');
    // Not a button, not focusable, and carrying no tooltip: three ways it
    // would otherwise announce that it is worth clicking.
    expect(mark()).not.toHaveAttribute('role');
    expect(mark()).not.toHaveAttribute('tabindex');
    expect(mark()).not.toHaveAttribute('title');
    expect(screen.queryByRole('button', { name: /summit/i })).not.toBeInTheDocument();
  });

  it('does nothing at all for the first three clicks', () => {
    draw();

    click(3);

    expect(mark()).not.toHaveClass('easter-pop');
    expect(document.body.className).not.toContain('easter-wobble');
    expect(wob()).toBe('');
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(announced).toBe(0);
  });

  it('shakes a little on the fourth, and much harder by the ninth', () => {
    draw();

    click(4); // a twitch
    expect(mark()).toHaveClass('easter-pop');
    expect(mark().style.getPropertyValue('--pop')).toBe('1.07');
    expect(wob()).toBe('0.70px');

    click(1); // a bit more
    expect(wob()).toBe('2.80px');

    click(1); // a bit more again
    expect(wob()).toBe('6.30px');

    click(3); // nine in total — the page is being thrown about
    expect(wob()).toBe('25.20px');
    expect(mark().style.getPropertyValue('--pop')).toBe('1.42');
  });

  it('builds rather than climbing evenly', () => {
    // The point of the curve: the second half of the run adds far more than
    // the first. A straight line would make these two gaps equal.
    draw();
    click(6); // clicks 4, 5, 6 shown
    const early = parseFloat(wob());
    click(3); // …and 7, 8, 9
    const late = parseFloat(wob());

    expect(early).toBeLessThan(late / 3);
  });

  it('never out-shakes the reveal that follows it', () => {
    // easterShake in styles/dashboard.css peaks at 30px and 2deg. The ninth
    // click has to land under both, or the tenth is an anticlimax.
    draw();
    click(9);

    expect(parseFloat(wob())).toBeLessThan(30);
    expect(
      parseFloat(document.documentElement.style.getPropertyValue('--wob-rot')),
    ).toBeLessThan(2);
  });

  it('opens on the tenth: writes the day, and tells the quote', () => {
    draw();

    click(9);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(announced).toBe(0);

    click(1);
    expect(localStorage.getItem(KEY)).toBe('1');
    expect(announced).toBe(1);
    // The ninth click's shake is cleared, so it cannot fight the reveal's own.
    expect(document.body.className).not.toContain('easter-wobble');
  });

  it('opens once — the eleventh click is not a second announcement', () => {
    draw();
    click(10);
    expect(announced).toBe(1);

    click(5);
    expect(announced).toBe(1);
    expect(document.body.className).not.toContain('easter-wobble');
  });

  it('opens in the light as readily as in the dark', () => {
    // It did not, and the theme was the only reason — ten clicks in the light
    // did nothing and said nothing, which is a secret nobody can tell from a
    // broken logo. The gate came off here and off the pentagon this leads to
    // (frontend/secret/pentagon-egg.js).
    dark(false);
    draw();

    click(4);
    expect(mark()).toHaveClass('easter-pop');

    click(6);
    expect(localStorage.getItem(KEY)).toBe('1');
    expect(announced).toBe(1);
  });

  it('is retired once the chain has handed out a title', () => {
    localStorage.setItem('summitTitle:myles', 'Admin');
    draw();

    click(12);

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(announced).toBe(0);
  });

  it('is not retired by somebody else’s title', () => {
    // The bug this guards: one account finishing the chain closed it for
    // everybody who signed in on that browser afterwards, and the only symptom
    // was a mark that did nothing and a pentagon that did nothing either.
    localStorage.setItem('summitTitle:ada', 'Admin');
    localStorage.setItem('summitTitle:Default', 'Admin');
    draw();

    click(10);

    expect(localStorage.getItem(KEY)).toBe('1');
  });

  it('tells the scripts whose chain this is', () => {
    // frontend/secret/pentagon-egg.js has no way to ask React, so the unlock
    // has to be written where it will go looking: `easterEgg:<currentUser>:<day>`.
    draw();
    click(10);

    expect(localStorage.getItem('currentUser')).toBe('myles');
    const asTheScriptReadsIt =
      'easterEgg:' + (localStorage.getItem('currentUser') || 'Default') + ':2026-08-30';
    expect(localStorage.getItem(asTheScriptReadsIt)).toBe('1');
  });

  it('leaves no shake on the page when the card goes', async () => {
    const view = draw();
    click(5);

    view.unmount();
    await vi.advanceTimersByTimeAsync(1000);

    expect(document.body.className).not.toContain('easter-wobble');
    expect(document.documentElement.className).not.toContain('easter-shake-clip');
  });
});
