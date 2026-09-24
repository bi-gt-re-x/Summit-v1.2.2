/**
 * The line at the foot of the dashboard, and the secret that replaces it.
 *
 * Two things are being protected. The first is that the quote is a quote: it
 * paints immediately, it improves when the fetch lands, and it survives the
 * fetch never landing. The second is the reveal — which is not triggered here.
 * The ten clicks are on the mark in the Focus card's corner
 * (hooks/useMarkEgg.ts and components/Dashboard/StatCards.egg.test.tsx), and
 * what this file pins is the one message that reaches the quote from there.
 *
 * There is no latch to test any more. There was one while the door was the
 * rail's title and the tenth click could land on a page with no quote on it;
 * both ends are on the dashboard now, so the announcement is heard when it is
 * made or not at all.
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
import { EGG_UNLOCKED } from '@/utils/easterEgg';

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

/** What the door does on its tenth click: writes the day, then says so. */
async function tenthClick() {
  localStorage.setItem(KEY, '1');
  await act(async () => {
    window.dispatchEvent(new CustomEvent(EGG_UNLOCKED));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TODAY);
  localStorage.clear();
  daily.mockResolvedValue({ success: true, quote: 'Keep going.', author: 'Anon' });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.className = '';
  document.documentElement.className = '';
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

describe('the hidden quote', () => {
  it('plays the whole reveal when the door announces itself', async () => {
    renderWithProviders(<DailyQuote />);
    expect(screen.queryByText(CLUE)).not.toBeInTheDocument();

    await tenthClick();

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

  it('shows the clue again on the next visit, without the theatrics', () => {
    localStorage.setItem(KEY, '1');
    renderWithProviders(<DailyQuote />);

    expect(screen.getByText(CLUE)).toBeInTheDocument();
    expect(document.body.className).not.toContain('easter-shake');
    expect(document.getElementById('dailyQuote')).not.toHaveClass('quote-slide-out');
  });

  it('is retired once the chain has handed out a title', async () => {
    localStorage.setItem('summitTitle:myles', 'Admin');
    renderWithProviders(<DailyQuote />);

    await tenthClick();
    await act(() => vi.advanceTimersByTimeAsync(WHOLE_REVEAL));

    expect(screen.queryByText(CLUE)).not.toBeInTheDocument();
  });

  it('leaves nothing on the page when the dashboard is left mid-reveal', async () => {
    const view = renderWithProviders(<DailyQuote />);
    await tenthClick();

    view.unmount();
    await act(() => vi.advanceTimersByTimeAsync(WHOLE_REVEAL));

    expect(document.body.className).not.toContain('easter-');
    expect(document.getElementById('easterDark')).toBeNull();
  });

  it('stops listening once it is gone', async () => {
    const view = renderWithProviders(<DailyQuote />);
    view.unmount();

    // An announcement after the dashboard has been left must not reach into a
    // page that no longer has a quote on it.
    await tenthClick();
    await act(() => vi.advanceTimersByTimeAsync(WHOLE_REVEAL));

    expect(document.getElementById('easterDark')).toBeNull();
    expect(document.body.className).not.toContain('easter-');
  });
});
