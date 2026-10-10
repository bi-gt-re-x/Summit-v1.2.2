/**
 * The theme cards, shared by Settings > Appearance and the Finish your
 * profile step of sign-up, so a new account picks from the same six themes it
 * will later find in Settings.
 */
import type { ThemeSkin } from '@/services/settings';
import type { Theme } from '@/types';
import '@/styles/themePicker.css';

/**
 * The six themes, in the order the grid draws them.
 *
 * Two bases and four palettes. Light and dark are the neutral grounds you then
 * pick an `Accent` on — they are unchanged by any of this, and an account on
 * one of them sees exactly what it saw before the other four existed. The
 * four skins are the other trade: a ground and an accent pair chosen together,
 * which is why picking one switches the accent row off rather than leaving a
 * control on screen that no longer does anything.
 *
 * No colours here. The swatch is painted from `--skin-*` in
 * styles/preferences.css, which is also where the rules that apply a skin read
 * them from — so a card cannot advertise a colour the theme does not use. All
 * this list carries is which base each one pins, and the words.
 */
export const THEMES: { skin: ThemeSkin; base: Theme; label: string; hint: string }[] = [
  { skin: '', base: 'light', label: 'Light', hint: 'The neutral ground. Pick your own accent below.' },
  { skin: '', base: 'dark', label: 'Dark', hint: 'The neutral ground. Pick your own accent below.' },
  { skin: 'midnight', base: 'dark', label: 'Midnight', hint: 'Deep navy, periwinkle and cyan.' },
  { skin: 'sunset', base: 'dark', label: 'Sunset', hint: 'Warm near-black, orange and gold.' },
  { skin: 'meadow', base: 'light', label: 'Meadow', hint: 'Soft green ground, green and amber.' },
  { skin: 'orchid', base: 'light', label: 'Orchid', hint: 'Pale blush, magenta and teal.' },
];

/**
 * One theme card: four bands of the theme's own colours, its name, and whether
 * it is the one running.
 *
 * The bands are `data-skin-preview`, not inline styles — the stylesheet owns
 * the palette and this reads it back. Light and dark have preview blocks of
 * their own there for the same reason, holding the values their sheets already
 * use.
 */
export function ThemeCard({
  label,
  hint,
  preview,
  on,
  busy,
  onPick,
}: {
  label: string;
  hint: string;
  preview: string;
  on: boolean;
  busy: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className={`st-theme${on ? ' is-on' : ''}`}
      aria-pressed={on}
      title={hint}
      disabled={busy}
      onClick={onPick}
    >
      <span className="st-theme-bands" data-skin-preview={preview} aria-hidden="true">
        <i className="st-band-ground" />
        <i className="st-band-surface" />
        <i className="st-band-accent" />
        <i className="st-band-accent-2" />
      </span>
      <span className="st-theme-foot">
        <span className="st-theme-name">{label}</span>
        {on && <span className="st-theme-live">Active</span>}
      </span>
    </button>
  );
}


/**
 * All six, for a page that just needs to pick one: the sign-up step. Settings
 * draws its own grid from `THEMES` and `ThemeCard`, because its cards also
 * answer to the account's saved preferences.
 */
export function ThemePicker({
  skin,
  theme,
  onPick,
  className = 'tp-compact',
}: {
  skin: ThemeSkin;
  theme: Theme;
  onPick: (skin: ThemeSkin, base: Theme) => void;
  className?: string;
}) {
  return (
    <div className={className} role="group" aria-label="Theme">
      {THEMES.map((entry) => (
        <ThemeCard
          key={entry.skin || entry.base}
          label={entry.label}
          hint={entry.hint}
          preview={entry.skin || entry.base}
          on={entry.skin ? skin === entry.skin : !skin && theme === entry.base}
          busy={false}
          onPick={() => onPick(entry.skin, entry.base)}
        />
      ))}
    </div>
  );
}
