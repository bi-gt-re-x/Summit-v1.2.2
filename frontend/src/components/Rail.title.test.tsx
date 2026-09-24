/**
 * The title in the rail's foot, and the menu that chooses it.
 *
 * This was Rail.egg.test.tsx, and most of it was about the hidden chain: ten
 * clicks on the title opened it, so the tests had to prove that the first
 * three did nothing, that the count ignored the light, and that the three dots
 * beside it were not a way in by accident. The door is on the dashboard now —
 * hooks/useQuoteEgg.ts, and components/Dashboard/DailyQuote.test.tsx — and the
 * title is only a title, so what is left here is the menu.
 *
 * The chain has not left entirely, and the two tests that keep it are the
 * point of the seam: the ADMIN ROOM at the end of it hands out a title, and
 * the rail is where that prize is worn. Those keys are spelled out literally
 * rather than built from utils/easterEgg.ts, because their exact spelling is a
 * contract with frontend/secret/hidden-engine.js, which cannot import a
 * module. A test that derived them the same way the code does would agree with
 * a rename and let the prize go quiet.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Rail } from './Rail';
import { renderWithProviders } from '@/test/render';
import { setMatchMedia } from '@/test/media';
import { stats } from '@/test/factories';

const PHONE = '(max-width: 640px)';

/** 100 x n per level, so level 12 is 100 x (1+…+11). Level 12 is Apprentice. */
const LEVEL_12 = 6600;

const TODAY = new Date('2026-08-30T21:00:00');

function draw(xp = LEVEL_12) {
  return renderWithProviders(<Rail />, { stats: { stats: stats({ xp }) } });
}

/** The rail's title. Deliberately not a button, so it is found by its class. */
function title() {
  return document.querySelector('.rail-rank-title') as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TODAY);
  setMatchMedia({ [PHONE]: false });
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.removeAttribute('data-theme');
  document.body.className = '';
});

describe('choosing a title', () => {
  it('offers every band reached, best first, and never one ahead', async () => {
    const user = userEvent.setup();
    draw(); // level 12 — Beginner, Novice, Apprentice

    await user.click(screen.getByRole('button', { name: 'Choose your title' }));
    const menu = screen.getByRole('menu');
    const names = within(menu)
      .getAllByRole('menuitemradio')
      .map((el) => el.textContent);

    expect(names).toEqual([
      'AutomaticApprentice',
      'Apprentice',
      'Novice',
      'Beginner',
    ]);
    expect(within(menu).queryByText('Adept')).not.toBeInTheDocument();
  });

  it('prints the one that is picked, and remembers it', async () => {
    const user = userEvent.setup();
    draw();
    expect(title()).toHaveTextContent('Apprentice');

    await user.click(screen.getByRole('button', { name: 'Choose your title' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Novice' }));

    expect(title()).toHaveTextContent('Novice');
    expect(localStorage.getItem('summitRankTitle:myles')).toBe('Novice');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('goes back to following the level, and stops storing a choice', async () => {
    const user = userEvent.setup();
    localStorage.setItem('summitRankTitle:myles', 'Beginner');
    draw();
    expect(title()).toHaveTextContent('Beginner');

    await user.click(screen.getByRole('button', { name: 'Choose your title' }));
    await user.click(screen.getByRole('menuitemradio', { name: /Automatic/ }));

    expect(title()).toHaveTextContent('Apprentice');
    expect(localStorage.getItem('summitRankTitle:myles')).toBeNull();
  });

  it('offers the title the hidden chain hands out, ahead of the bands', async () => {
    const user = userEvent.setup();
    localStorage.setItem('summitTitle:myles', 'Admin');
    draw();

    await user.click(screen.getByRole('button', { name: 'Choose your title' }));
    const names = within(screen.getByRole('menu'))
      .getAllByRole('menuitemradio')
      .map((el) => el.textContent);

    expect(names[1]).toBe('Admin');
  });

  it('wears the chain’s title, rather than filing it in the menu', () => {
    // What frontend/secret/hidden-engine.js writes when the ADMIN ROOM's
    // button is pressed, spelled the way that script spells it. Both keys, and
    // the second is the point: the room says TITLE EQUIPPED, so the rail has to
    // have changed by the time the reader is looking at it again.
    localStorage.setItem('summitTitle:myles', 'Admin');
    localStorage.setItem('summitRankTitle:myles', 'Admin');
    draw();

    expect(title()).toHaveTextContent('Admin');
  });

  it('lets a worn secret title be traded back for a band', async () => {
    // Equipped on arrival is a default, not a sentence.
    const user = userEvent.setup();
    localStorage.setItem('summitTitle:myles', 'Admin');
    localStorage.setItem('summitRankTitle:myles', 'Admin');
    draw();

    await user.click(screen.getByRole('button', { name: 'Choose your title' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Novice' }));

    expect(title()).toHaveTextContent('Novice');
    expect(localStorage.getItem('summitRankTitle:myles')).toBe('Novice');
  });

  it('falls back to the band when a chosen title is no longer held', () => {
    // The secret title was picked and then cleared out of storage — by the
    // engine, or by a browser wipe. The rail says what is true now.
    localStorage.setItem('summitRankTitle:myles', 'Admin');
    draw();
    expect(title()).toHaveTextContent('Apprentice');
  });

  it('is not a way into the hidden chain any more', async () => {
    // It was, for ten clicks in the dark, and the chain is per-account
    // per-day under this key. In the dark is where it would still open if the
    // handler had been left behind, so that is where this asks.
    const user = userEvent.setup();
    document.documentElement.setAttribute('data-theme', 'dark');
    draw();

    for (let i = 0; i < 12; i++) await user.click(title());

    expect(localStorage.getItem('easterEgg:myles:2026-08-30')).toBeNull();
    expect(document.body.className).not.toContain('easter-wobble');
  });
});
