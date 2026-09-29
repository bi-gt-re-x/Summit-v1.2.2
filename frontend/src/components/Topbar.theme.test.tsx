/**
 * The light/dark switch in the top bar, and whether it is still there on the
 * next load.
 *
 * It applied the theme and stopped, which looked right and was not: the colour
 * changed, the cookie and the account's `theme` were written, and then two
 * preferences the reader had set earlier talked over it the next time the page
 * opened.
 *
 * `theme_mode` defaults to `'system'`, and context/SettingsProvider follows
 * the device whenever it is — so on a default account the toggle survived
 * exactly until the next refresh, which reads as the theme not saving at all.
 * A skin is the same failure with a shorter fuse: it pins the base it was
 * drawn against and re-pins it on every render, so under Midnight or Sunset
 * the toggle sprang back immediately.
 *
 * Neither is a bug in the thing doing the overriding. Both are the reader's
 * own earlier instructions still being obeyed, so what the switch has to do is
 * update them — which is what pages/Settings already does from its own light
 * and dark cards. These tests pin that the two controls agree, because the two
 * of them disagreeing is invisible until a refresh.
 */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Topbar } from './Topbar';
import { renderWithProviders } from '@/test/render';
import type { Prefs } from '@/services/settings';

function bar(theme: 'light' | 'dark', prefs: Partial<Prefs> = {}) {
  const setTheme = vi.fn();
  const update = vi.fn(async () => null);
  renderWithProviders(<Topbar />, {
    theme: { theme, setTheme },
    settings: { update, prefs },
  });
  return { setTheme, update, press: () => fireEvent.click(screen.getByLabelText(/dark mode/i)) };
}

describe('pressing the switch', () => {
  it('applies the other theme', () => {
    const { setTheme, press } = bar('light');
    press();
    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('goes back the other way too', () => {
    const { setTheme, press } = bar('dark');
    press();
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  /**
   * The regression this file exists for. Without the second write the choice
   * is applied, persisted, and then overwritten by the device on the next
   * load — a theme that appears not to save, on every account that has never
   * opened Settings.
   */
  it('records that light and dark were chosen rather than followed', () => {
    const { update, press } = bar('light', { theme_mode: 'system' });
    press();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ theme_mode: 'dark' }));
  });

  it('clears a skin, which would otherwise pin the base straight back', () => {
    const { update, press } = bar('dark', { theme_skin: 'sunset' });
    press();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ theme_skin: '' }));
  });

  /** One save, not two: the pair is what keeps the account self-consistent. */
  it('writes both in a single update', () => {
    const { update, press } = bar('light');
    press();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ theme_mode: 'dark', theme_skin: '' });
  });
});
