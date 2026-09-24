/**
 * The line at the foot of the dashboard, the mark above it, and the secret
 * that connects them.
 *
 * Three things are being protected. The first is that the quote is a quote: it
 * paints immediately, it improves when the fetch lands, and it survives the
 * fetch never landing. The second is that the mark is a logo — silent for its
 * first three clicks, silent in the light, and silent for ever once the chain
 * has paid out. The third is the reveal itself, which now happens here rather
 * than arriving from somewhere else: the door moved off the rail's title and
 * onto this mark, so the latch and the window event that used to carry the
 * news between two components went with it (hooks/useQuoteEgg.ts).
 *
 * The storage key is asserted literally rather than through
 * utils/easterEgg.ts, because its exact spelling is a contract with three
 * scripts that cannot import it — frontend/secret/pentagon-egg.js,
 * frontend/secret/void.js and frontend/secret/engine.js all rebuild it by
 * hand. A test that computed the key the same way the code does would agree
 * with a rename and let the rest of the chain go quiet.
 */
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DailyQuote } from './DailyQuote';
import { renderWithProviders } from '@/test/render';

const daily = vi.hoisted(() => vi.fn());
vi.mock('@/services', () => ({ quote: { daily } }));

const CLUE = '"The pentagon is the key, find it" -Mysterious,,';

const TODAY = new Date('2026-08-30T21:00:00');

/* The signed-in account, not 'Default': the chain is per-account, and 'myles'
   is who components/../test/render.tsx signs in as. A test that still passed
   against 'Default' would be a test that had stopped noticing whose progress
   it was reading. */
const KEY = 'easterEgg:myles:2026-08-30';

/** The whole reveal, from the slide-out to the spotlight lifting. */
const WHOLE_REVEAL = 4000;

/** The door. Deliberately not a button, so it is found by its class. */
function mark() {
  return document.querySelector('.quote-mark') as HTMLElement;
}

function dark(on: boolean) {
  document.documentElement.setAttribute('data-theme', on ? 'dark' : 'light');
}

/** n clicks on the mark, at whatever pace: there is no streak to keep. */
function click(n: number) {
  for (let i = 0; i < n; i++) mark().click();
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TODAY);
  localStorage.clear();
  dark(true);
  daily.mockResolvedValue({ success: true, quote: 'Keep going.', author: 'Anon' });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.className = '';
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-theme');
  document.getElementById('easterDark')?.remove();
});

describe('the daily quote', () => {
  it('paints a line before the fetch lands, and the fetched one after', async () => {
    renderWithProviders(<DailyQuote />);
    expect(screen.getByText(/getting started/)).toBeInTheDocument();
    expect(await screen.findByText(/Keep going\./)).toBeInTheDocument();
  });

  it('keeps the built-in line when the call fails', async () => {
    daily.mockRejectedValue(new Error('offline'));
    renderWithProviders(<DailyQuote />);
    await waitFor(() => expect(daily).toHaveBeenCalled());
    expect(screen.getByText(/getting started/)).toBeInTheDocument();
  });

  it('is not a way in on its own — clicking the line does nothing', () => {
    renderWithProviders(<DailyQuote />);
    const line = document.getElementById('dailyQuote')!;
    for (let i = 0; i < 12; i++) line.click();
    expect(screen.queryByText(CLUE)).not.toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe('the way into the hidden chain', () => {
  it('does nothing at all for the first three clicks', () => {
    renderWithProviders(<DailyQuote />);

    click(3);

    // No bounce, no wobble, and nothing written down. As far as anyone
    // clicking a logo twice out of idleness can tell, it is a logo.
    expect(mark()).not.toHaveClass('easter-pop');
    expect(document.body.className).not.toContain('easter-wobble');
    expect(document.documentElement.style.getPropertyValue('--wob')).toBe('');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('starts bouncing on the fourth, and harder with each one after', () => {
    renderWithProviders(<DailyQuote />);

    click(4);
    expect(mark()).toHaveClass('easter-pop');
    // The fourth is the first that shows anything, so it is the smallest.
    expect(mark().style.getPropertyValue('--pop')).toBe('1.06');
    expect(document.documentElement.style.getPropertyValue('--wob')).toBe('2.20px');

    click(5); // nine in total
    expect(mark().style.getPropertyValue('--pop')).toBe('1.36');
    expect(document.documentElement.style.getPropertyValue('--wob')).toBe('13.20px');
  });

  it('opens on the tenth, and plays the whole reveal there and then', async () => {
    renderWithProviders(<DailyQuote />);

    click(9);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(screen.queryByText(CLUE)).not.toBeInTheDocument();

    click(1);
    expect(localStorage.getItem(KEY)).toBe('1');

    // The old line leaves first; the clue is not there yet.
    expect(document.getElementById('dailyQuote')).toHaveClass('quote-slide-out');
    expect(screen.queryByText(CLUE)).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(screen.getByText(CLUE)).toBeInTheDocument();
    expect(document.body.className).toContain('easter-shake');
    expect(document.getElementById('easterDark')).toHaveClass('show');

    // …and the page is handed back: no shake, no scrim, the clue still lit.
    await act(() => vi.advanceTimersByTimeAsync(WHOLE_REVEAL));
    expect(screen.getByText(CLUE)).toBeInTheDocument();
    expect(document.body.className).not.toContain('easter-shake');
    expect(document.getElementById('easterDark')).toBeNull();
  });

  it('plays it once — the eleventh click is not a second show', async () => {
    renderWithProviders(<DailyQuote />);

    click(10);
    await act(() => vi.advanceTimersByTimeAsync(WHOLE_REVEAL));

    click(5);
    expect(document.getElementById('dailyQuote')).not.toHaveClass('quote-slide-out');
    expect(document.body.className).not.toContain('easter-wobble');
    expect(screen.getByText(CLUE)).toBeInTheDocument();
  });

  it('stays shut in the light, however many times it is clicked', () => {
    dark(false);
    renderWithProviders(<DailyQuote />);

    click(12);

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(screen.queryByText(CLUE)).not.toBeInTheDocument();
    expect(mark()).not.toHaveClass('easter-pop');
  });

  it('is retired once the chain has handed out a title', () => {
    localStorage.setItem('summitTitle:myles', 'Admin');
    renderWithProviders(<DailyQuote />);

    click(12);

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(screen.queryByText(CLUE)).not.toBeInTheDocument();
  });

  it('is not retired by somebody else’s title', () => {
    // The bug this guards: one account finishing the chain closed it for
    // everybody who signed in on that browser afterwards, and the only symptom
    // was a mark that did nothing and a pentagon that did nothing either.
    localStorage.setItem('summitTitle:ada', 'Admin');
    localStorage.setItem('summitTitle:Default', 'Admin');
    renderWithProviders(<DailyQuote />);

    click(10);

    expect(localStorage.getItem(KEY)).toBe('1');
  });

  it('tells the scripts whose chain this is', () => {
    // frontend/secret/pentagon-egg.js has no way to ask React, so the unlock
    // has to be written where it will go looking: `easterEgg:<currentUser>:<day>`.
    renderWithProviders(<DailyQuote />);
    click(10);

    expect(localStorage.getItem('currentUser')).toBe('myles');
    const asTheScriptReadsIt =
      'easterEgg:' + (localStorage.getItem('currentUser') || 'Default') + ':2026-08-30';
    expect(localStorage.getItem(asTheScriptReadsIt)).toBe('1');
  });
});

describe('the hidden quote', () => {
  it('shows the clue again on the next visit, without the theatrics', () => {
    localStorage.setItem(KEY, '1');
    renderWithProviders(<DailyQuote />);

    expect(screen.getByText(CLUE)).toBeInTheDocument();
    expect(document.body.className).not.toContain('easter-shake');
    expect(document.getElementById('dailyQuote')).not.toHaveClass('quote-slide-out');
  });

  it('is retired once the chain has handed out a title', () => {
    localStorage.setItem(KEY, '1');
    localStorage.setItem('summitTitle:myles', 'Admin');
    renderWithProviders(<DailyQuote />);

    expect(screen.queryByText(CLUE)).not.toBeInTheDocument();
  });

  it('leaves nothing on the page when the dashboard is left mid-reveal', async () => {
    const view = renderWithProviders(<DailyQuote />);
    click(10);

    view.unmount();
    await act(() => vi.advanceTimersByTimeAsync(WHOLE_REVEAL));

    expect(document.body.className).not.toContain('easter-');
    expect(document.getElementById('easterDark')).toBeNull();
  });
});
