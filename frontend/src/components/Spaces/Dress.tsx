/**
 * What a space's page wears: an icon, a cover and a background.
 *
 * An icon is an emoji, at the head of the title row and beside the space's
 * name in the rail. A cover is one of eight gradients across the top of the
 * page, or any colour with any fade (./fill), and can carry a line of words
 * in a colour of its own. The background is the page behind everything, in
 * any colour and fade. All of it is optional and all of it saves with the page.
 */
import { useCallback, useState } from 'react';
import { useDismiss } from './useDismiss';
import { COVERS, ICONS, type CoverAlign, type SpaceDoc } from './blocks';
import { ColorField, ColorPop, FillPicker } from './ColorPicker';
import { fillProps, inkOn, type Fill } from './fill';
import { RULES } from '@/utils/sharedRules';

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

/** One colour from each preset, standing in for it when picking readable words. */
const COVER_BASE: Record<string, string> = {
  sunrise: '#fbb97a', ocean: '#78cffe', meadow: '#b5f08d', dusk: '#bea7de',
  ember: '#f375b3', forest: '#23ae78', slate: '#b9c5d2', sand: '#e6d0b7',
};

/** The cover as a fill, whichever kind it is — what its words are read against. */
export function coverFill(doc: Pick<SpaceDoc, 'cover' | 'coverFill'>): Fill {
  if (doc.cover === 'custom' && doc.coverFill) return doc.coverFill;
  return { color: COVER_BASE[doc.cover] ?? '#cfd9df', style: 'solid' };
}

const ALIGNS: CoverAlign[] = RULES.spaces.cover_aligns as CoverAlign[];
const TEXT_MAX: number = RULES.spaces.cover_text_max;

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

export interface CoverProps {
  doc: SpaceDoc;
  disabled: boolean;
  /** Changes to the page's cover fields, merged into the page. */
  onDoc: (change: Partial<SpaceDoc>) => void;
}

/** The cover band, its words, and its own Change, Text and Remove on hover. */
export function Cover({ doc, disabled, onDoc }: CoverProps) {
  const [open, setOpen] = useState<'cover' | 'text' | null>(null);
  const close = useCallback(() => setOpen(null), []);
  if (!doc.cover) return null;
  const custom = doc.cover === 'custom' && doc.coverFill;
  const painted = custom ? fillProps(doc.coverFill!) : null;
  const ink = doc.coverInk ?? inkOn(coverFill(doc));
  const name = custom ? 'Custom' : COVER_NAMES[doc.cover] ?? 'Cover';
  return (
    <div
      className={`sp-cover ${painted ? painted.className : `sp-cover-${doc.cover}`}`}
      style={painted?.style}
      role="img"
      aria-label={doc.coverText ? `${name} cover: ${doc.coverText}` : `${name} cover`}
    >
      {doc.coverText && (
        <p className={`sp-cover-text is-${doc.coverAlign ?? 'left'}`} style={{ color: ink }}>
          {doc.coverText}
        </p>
      )}
      {!disabled && (
        <div className="sp-cover-tools">
          <button type="button" className="sp-chip-btn" aria-haspopup="dialog" aria-expanded={open === 'cover'} onClick={() => setOpen(open === 'cover' ? null : 'cover')}>
            Change cover
          </button>
          <button type="button" className="sp-chip-btn" aria-haspopup="dialog" aria-expanded={open === 'text'} onClick={() => setOpen(open === 'text' ? null : 'text')}>
            {doc.coverText ? 'Edit text' : 'Add text'}
          </button>
          <button type="button" className="sp-chip-btn" onClick={() => onDoc({ cover: '', coverFill: undefined })}>
            Remove
          </button>
          {open === 'cover' && <CoverPicker doc={doc} onDoc={onDoc} onClose={close} />}
          {open === 'text' && <CoverTextPicker doc={doc} ink={ink} onDoc={onDoc} onClose={close} />}
        </div>
      )}
    </div>
  );
}

/** Words across the cover: what they say, where they sit, what colour they are. */
function CoverTextPicker({ doc, ink, onDoc, onClose }: { doc: SpaceDoc; ink: string; onDoc: CoverProps['onDoc']; onClose: () => void }) {
  return (
    <ColorPop
      label="Cover text"
      onClose={onClose}
      className="sp-cover-pop"
      tools={
        doc.coverText ? (
          <button type="button" className="sp-ghost" onClick={() => onDoc({ coverText: undefined })}>
            Remove
          </button>
        ) : null
      }
    >
      <input
        className="sp-cover-input"
        value={doc.coverText ?? ''}
        maxLength={TEXT_MAX}
        placeholder="Say something on the cover"
        aria-label="Cover text"
        autoFocus
        onChange={(event) => onDoc({ coverText: event.target.value || undefined })}
      />
      <div className="sp-cover-aligns" role="radiogroup" aria-label="Text position">
        {ALIGNS.map((align) => (
          <button
            key={align}
            type="button"
            role="radio"
            aria-checked={(doc.coverAlign ?? 'left') === align}
            className="sp-width"
            onClick={() => onDoc({ coverAlign: align })}
          >
            {align === 'left' ? 'Left' : align === 'center' ? 'Centre' : 'Right'}
          </button>
        ))}
      </div>
      <div className="sp-pop-bar">
        <span className="sp-pop-head">Text colour</span>
        {doc.coverInk && (
          <button type="button" className="sp-ghost" onClick={() => onDoc({ coverInk: undefined })}>
            Auto
          </button>
        )}
      </div>
      <ColorField value={ink} label="Cover text colour" onChange={(coverInk) => onDoc({ coverInk })} />
    </ColorPop>
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

/** "Add icon" and "Add cover" for whichever is missing, and the page's Background. */
export function DressTools({
  icon,
  cover,
  disabled,
  onIcon,
  onCover,
  background,
  onBackground,
}: DressProps & { background?: Fill; onBackground: (fill: Fill | undefined) => void }) {
  const [picking, setPicking] = useState(false);
  const close = useCallback(() => setPicking(false), []);
  if (disabled) return null;
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
      <button type="button" className="sp-ghost" aria-haspopup="dialog" aria-expanded={picking} onClick={() => setPicking(!picking)}>
        <span
          className={`sp-bg-dot ${background ? fillProps(background).className : ''}`}
          style={background ? fillProps(background).style : undefined}
          aria-hidden="true"
        />
        Background
      </button>
      {picking && (
        <ColorPop
          label="Page background"
          onClose={close}
          className="sp-bg-pop"
          tools={
            background ? (
              <button type="button" className="sp-ghost" onClick={() => onBackground(undefined)}>
                Remove
              </button>
            ) : null
          }
        >
          <FillPicker
            value={background ?? { color: '#e0e7ff', style: 'fade' }}
            label="Page background"
            onChange={(fill) => onBackground(fill)}
          />
        </ColorPop>
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

/** The eight ready-made gradients, or any colour with any fade. */
function CoverPicker({ doc, onDoc, onClose }: { doc: SpaceDoc; onDoc: CoverProps['onDoc']; onClose: () => void }) {
  const current = doc.cover;
  return (
    <ColorPop label="Choose a cover" onClose={onClose} className="sp-cover-pop">
      <p className="sp-pop-head">Gradients</p>
      <div className="sp-cover-grid">
        {COVERS.map((cover) => (
          <button
            key={cover}
            type="button"
            className={`sp-cover-swatch sp-cover-${cover}${cover === current ? ' is-on' : ''}`}
            aria-label={COVER_NAMES[cover]}
            aria-pressed={cover === current}
            onClick={() => onDoc({ cover, coverFill: undefined })}
          />
        ))}
      </div>
      <p className="sp-pop-head">Your own</p>
      <FillPicker
        value={doc.coverFill ?? { ...coverFill(doc), style: 'diagonal' }}
        label="Cover colour"
        onChange={(fill) => onDoc({ cover: 'custom', coverFill: fill })}
      />
    </ColorPop>
  );
}
