/**
 * A space's icon and cover — the two things Notion lets a page wear. An
 * icon is an emoji, at the head of the title row and beside the space's name
 * in the rail; a cover is one of eight gradients across the top of the page.
 * Both are optional, and both save with the page.
 */
import { useCallback, useState } from 'react';
import { useDismiss } from './BlockEditor';
import { COVERS, ICONS } from './blocks';

export const COVER_NAMES: Record<string, string> = {
  sunrise: 'Sunrise',
  ocean: 'Ocean',
  meadow: 'Meadow',
  dusk: 'Dusk',
  ember: 'Ember',
  forest: 'Forest',
  slate: 'Slate',
  sand: 'Sand',
};

const random = <T,>(list: readonly T[], not?: T): T => {
  const pool = list.length > 1 ? list.filter((item) => item !== not) : list;
  return pool[Math.floor(Math.random() * pool.length)]!;
};

export interface DressProps {
  icon: string;
  cover: string;
  disabled: boolean;
  onIcon: (icon: string) => void;
  onCover: (cover: string) => void;
}

/** The cover band, with its own Change and Remove on hover. */
export function Cover({ cover, disabled, onCover }: Omit<DressProps, 'icon' | 'onIcon'>) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!cover) return null;
  return (
    <div className={`sp-cover sp-cover-${cover}`} role="img" aria-label={`${COVER_NAMES[cover as keyof typeof COVER_NAMES] ?? 'Cover'} cover`}>
      {!disabled && (
        <div className="sp-cover-tools">
          <button type="button" className="sp-chip-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
            Change cover
          </button>
          <button type="button" className="sp-chip-btn" onClick={() => onCover('')}>
            Remove
          </button>
          {open && <CoverPicker current={cover} onPick={(next) => { onCover(next); close(); }} onClose={close} />}
        </div>
      )}
    </div>
  );
}

/** The page's icon at the head of the title row; a click opens the picker. */
export function PageIcon({ icon, disabled, onIcon }: Pick<DressProps, 'icon' | 'disabled' | 'onIcon'>) {
  const [picking, setPicking] = useState(false);
  const close = useCallback(() => setPicking(false), []);
  if (!icon) return null;
  return (
    <div className="sp-icon-wrap">
      <button
        type="button"
        className="sp-icon"
        aria-label="Change icon"
        aria-haspopup="dialog"
        aria-expanded={picking}
        disabled={disabled}
        onClick={() => setPicking(!picking)}
      >
        {icon}
      </button>
      {picking && (
        <IconPicker
          current={icon}
          onPick={(next) => {
            onIcon(next);
            close();
          }}
          onClose={close}
        />
      )}
    </div>
  );
}

/** "Add icon" and "Add cover", at the end of the title row, for whichever is missing. */
export function DressTools({ icon, cover, disabled, onIcon, onCover }: DressProps) {
  if (disabled || (icon && cover)) return null;
  return (
    <div className="sp-dress-tools">
      {!icon && (
        <button type="button" className="sp-ghost" onClick={() => onIcon(random(ICONS))}>
          <span aria-hidden="true">☺</span> Add icon
        </button>
      )}
      {!cover && (
        <button type="button" className="sp-ghost" onClick={() => onCover(random(COVERS))}>
          <span aria-hidden="true">▭</span> Add cover
        </button>
      )}
    </div>
  );
}

function IconPicker({ current, onPick, onClose }: { current: string; onPick: (icon: string) => void; onClose: () => void }) {
  const ref = useDismiss(true, onClose);
  return (
    <div className="sp-pop sp-icon-pop" role="dialog" aria-label="Choose an icon" ref={ref}>
      <div className="sp-pop-bar">
        <span className="sp-pop-head">Icon</span>
        <button type="button" className="sp-ghost" onClick={() => onPick(random(ICONS, current))}>Random</button>
        <button type="button" className="sp-ghost" onClick={() => onPick('')}>Remove</button>
      </div>
      <div className="sp-emoji-grid">
        {ICONS.map((icon) => (
          <button
            key={icon}
            type="button"
            className={`sp-emoji${icon === current ? ' is-on' : ''}`}
            aria-label={`Icon ${icon}`}
            aria-pressed={icon === current}
            onClick={() => onPick(icon)}
          >
            {icon}
          </button>
        ))}
      </div>
    </div>
  );
}

function CoverPicker({ current, onPick, onClose }: { current: string; onPick: (cover: string) => void; onClose: () => void }) {
  const ref = useDismiss(true, onClose);
  return (
    <div className="sp-pop sp-cover-pop" role="dialog" aria-label="Choose a cover" ref={ref}>
      <p className="sp-pop-head">Gradients</p>
      <div className="sp-cover-grid">
        {COVERS.map((cover) => (
          <button
            key={cover}
            type="button"
            className={`sp-cover-swatch sp-cover-${cover}${cover === current ? ' is-on' : ''}`}
            aria-label={COVER_NAMES[cover]}
            aria-pressed={cover === current}
            onClick={() => onPick(cover)}
          />
        ))}
      </div>
    </div>
  );
}
