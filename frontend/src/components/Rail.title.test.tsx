/**
 * The nametag in the rail's foot, and the same one in the top bar.
 *
 * Both corners read hooks/useNametag: the account's picture, then
 * "<title> <name>". The title is the level's band by default, the one the
 * hidden chain hands out once it has been earned, or whichever of them the
 * reader picks — from the rail's three dots or the top bar's account menu.
 *
 * The chain's keys are spelled out literally rather than built from
 * utils/easterEgg.ts or utils/rankTitle.ts, because their exact spelling is a
 * contract with frontend/secret/hidden-engine.js, which cannot import a
 * module. A test that derived them the same way the code does would agree with
 * a rename and let the prize go quiet — which is also why the last block here
 * runs the room's own script.
 */
import { readFileSync } from 'node:fs';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Rail } from './Rail';
import { Topbar } from './Topbar';
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

/** Both corners at once, as every app page has them. */
function drawBoth(xp = LEVEL_12) {
  return renderWithProviders(
    <>
      <Topbar />
      <Rail />
    </>,
    { stats: { stats: stats({ xp }) } },
  );
}

/** The rail's nametag. Deliberately not a button, so it is found by its class. */
function title() {
  return document.querySelector('.rail-rank-title') as HTMLElement;
}

/** The top bar's nametag, inside the account button. */
function topTag() {
  return document.querySelector('.topbar-account .nametag') as HTMLElement;
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

describe('the nametag', () => {
  it('puts the band the level has reached before the name', () => {
    draw();
    expect(title()).toHaveTextContent('Apprentice Myles');
    expect(title().querySelector('.nametag-title')).toHaveTextContent('Apprentice');
    expect(title().querySelector('.nametag-name')).toHaveTextContent('Myles');
  });

  it("wears the account's own picture, not a silhouette", () => {
    draw();
    expect(document.querySelector('.rail-avatar')).toHaveAttribute('src', '/static/images/avatars/star.svg');
  });

  it('matches the top bar: same picture, same title, same name', () => {
    localStorage.setItem('summitTitle:myles', 'Admin');
    drawBoth();
    expect(title()).toHaveTextContent('Admin Myles');
    expect(topTag()).toHaveTextContent('Admin Myles');
    expect(document.querySelector('.rail-avatar')?.getAttribute('src')).toBe(
      document.querySelector('.topbar-avatar')?.getAttribute('src'),
    );
  });

  it('wears the title the hidden chain hands out, once it is earned', () => {
    // What frontend/secret/hidden-engine.js writes when the ADMIN ROOM's
    // button is pressed, spelled the way that script spells it.
    localStorage.setItem('summitTitle:myles', 'Admin');
    draw();
    expect(title()).toHaveTextContent('Admin Myles');
  });
});

describe('Settings in the foot', () => {
  it('is a gear beside the nametag, not a row in Core', () => {
    draw();
    const gear = screen.getByRole('link', { name: 'Settings' });
    expect(gear).toHaveAttribute('href', '/settings');
    expect(gear.closest('.rail-rank')).not.toBeNull();
    expect(gear.closest('.rail-links')).toBeNull();
  });
});

describe('choosing the title', () => {
  it('offers the bands reached, best first, and none ahead', async () => {
    const user = userEvent.setup();
    draw();
    await user.click(screen.getByRole('button', { name: 'Choose your title' }));
    const menu = screen.getByRole('menu', { name: 'Title' });
    expect(within(menu).getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      'AutomaticApprentice',
      'Apprentice',
      'Novice',
      'Beginner',
    ]);
    expect(within(menu).getByRole('menuitemradio', { name: /Automatic/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('puts the pick before the name in both corners, and keeps it', async () => {
    const user = userEvent.setup();
    drawBoth();
    await user.click(screen.getByRole('button', { name: 'Choose your title' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Novice' }));
    expect(screen.queryByRole('menu', { name: 'Title' })).not.toBeInTheDocument();
    expect(title()).toHaveTextContent('Novice Myles');
    expect(topTag()).toHaveTextContent('Novice Myles');
    expect(localStorage.getItem('summitRankTitle:myles')).toBe('Novice');
  });

  it('can be chosen from the top bar too, and the rail follows', async () => {
    const user = userEvent.setup();
    drawBoth();
    await user.click(document.querySelector('.topbar-account') as HTMLElement);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Title' }), 'Beginner');
    expect(topTag()).toHaveTextContent('Beginner Myles');
    expect(title()).toHaveTextContent('Beginner Myles');
  });

  it('offers the earned title first, and Automatic wears it', async () => {
    const user = userEvent.setup();
    localStorage.setItem('summitTitle:myles', 'Admin');
    draw();
    await user.click(screen.getByRole('button', { name: 'Choose your title' }));
    const items = within(screen.getByRole('menu', { name: 'Title' })).getAllByRole('menuitemradio');
    expect(items.map((item) => item.textContent)).toEqual([
      'AutomaticAdmin', 'Admin', 'Apprentice', 'Novice', 'Beginner',
    ]);
    await user.click(screen.getByRole('menuitemradio', { name: 'Apprentice' }));
    expect(title()).toHaveTextContent('Apprentice Myles');
  });

  it('falls back when the picked title can no longer be justified', () => {
    localStorage.setItem('summitRankTitle:myles', 'Overlord');
    draw();
    expect(title()).toHaveTextContent('Apprentice Myles');
  });

  it('carries a pick over from before the rename', () => {
    localStorage.setItem('ascenRankTitle:myles', 'Novice');
    draw();
    expect(title()).toHaveTextContent('Novice Myles');
    expect(localStorage.getItem('summitRankTitle:myles')).toBe('Novice');
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

/**
 * The room at the end of the chain, run as itself. It is a plain script with
 * no exports, so it is evaluated here the way a `<script>` tag would run it.
 */
describe('the hidden room equips the title', () => {
  function runRoom() {
    // The rain behind SUMMIT CORE draws on a canvas jsdom does not have.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: () => {},
      fillText: () => {},
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(window, 'setInterval').mockReturnValue(0 as unknown as ReturnType<typeof setInterval>);
    const src = readFileSync('frontend/secret/hidden-engine.js', 'utf8');
    new Function(src)();
    return (window as unknown as { SummitHiddenEngine: { summitCore: (he?: unknown) => void } })
      .SummitHiddenEngine;
  }

  afterEach(() => {
    document.getElementById('summitCore')?.remove();
    vi.restoreAllMocks();
  });

  it('over a band picked earlier, and both corners wear it', () => {
    localStorage.setItem('currentUser', 'myles');
    localStorage.setItem('summitRankTitle:myles', 'Novice');
    const room = runRoom();
    room.summitCore();
    const input = document.getElementById('acTitle') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'The Architect' } });
    act(() => {
      (document.getElementById('acSetTitle') as HTMLButtonElement).click();
    });
    expect(localStorage.getItem('summitTitle:myles')).toBe('The Architect');
    expect(localStorage.getItem('summitRankTitle:myles')).toBe('The Architect');
    document.getElementById('summitCore')?.remove();

    drawBoth();
    expect(title()).toHaveTextContent('The Architect Myles');
    expect(topTag()).toHaveTextContent('The Architect Myles');
  });
});
