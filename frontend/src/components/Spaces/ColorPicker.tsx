/**
 * The colour picker every colourable thing on a space's page uses.
 *
 * `ColorField` is a classic picker for one colour: a square for saturation
 * (across) and brightness (down), a hue slider under it, a hex box and a row
 * of quick picks. Both the square and the slider drag, and both are sliders
 * for the keyboard too.
 *
 * `FillPicker` is that, plus the fade styles (./fill) drawn in the chosen
 * colour, so the choice is "this colour, like this".
 *
 * `ColorPop` is the floating box either one sits in.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useDismiss } from './useDismiss';
import {
  FILL_STYLES,
  STYLE_HINT,
  STYLE_LABEL,
  SWATCHES,
  fillProps,
  hexToHsv,
  hsvToHex,
  readHex,
  type Fill,
  type FillStyle,
  type Hsv,
} from './fill';

/** Follow a pointer from press to release, anywhere on the screen. */
function track(event: ReactPointerEvent<HTMLElement>, at: (x: number, y: number, box: DOMRect) => void) {
  const node = event.currentTarget;
  const box = node.getBoundingClientRect();
  event.preventDefault();
  at(event.clientX, event.clientY, box);
  const move = (moved: PointerEvent) => at(moved.clientX, moved.clientY, node.getBoundingClientRect());
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export interface ColorFieldProps {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
}

/** One colour: a saturation/brightness square, a hue slider, a hex box, quick picks. */
export function ColorField({ value, onChange, label = 'Colour' }: ColorFieldProps) {
  /* Kept here rather than read back from the hex, so the hue survives a trip
     through grey (where every hue is the same hex). */
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [draft, setDraft] = useState(value);
  const last = useRef(value);

  useEffect(() => {
    if (value === last.current) return;
    last.current = value;
    setHsv(hexToHsv(value));
    setDraft(value);
  }, [value]);

  const set = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    last.current = hex;
    setDraft(hex);
    onChange(hex);
  };

  const squareKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, Partial<Hsv>> = {
      ArrowLeft: { s: clamp01(hsv.s - step) },
      ArrowRight: { s: clamp01(hsv.s + step) },
      ArrowUp: { v: clamp01(hsv.v + step) },
      ArrowDown: { v: clamp01(hsv.v - step) },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    set({ ...hsv, ...move });
  };

  const hueKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 15 : 3;
    const by = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[event.key];
    if (by === undefined) return;
    event.preventDefault();
    set({ ...hsv, h: (hsv.h + by + 360) % 360 });
  };

  return (
    <div className="sp-color" role="group" aria-label={label}>
      <div
        className="sp-color-square"
        style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
        role="slider"
        tabIndex={0}
        aria-label={`${label}: saturation and brightness`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        onPointerDown={(event) =>
          track(event, (x, y, box) =>
            set({ h: hsv.h, s: clamp01((x - box.left) / (box.width || 1)), v: clamp01(1 - (y - box.top) / (box.height || 1)) }),
          )
        }
        onKeyDown={squareKey}
      >
        <span
          className="sp-color-knob"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv) }}
        />
      </div>

      <div
        className="sp-color-hue"
        role="slider"
        tabIndex={0}
        aria-label={`${label}: hue`}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onPointerDown={(event) =>
          track(event, (x, _y, box) => set({ ...hsv, h: clamp01((x - box.left) / (box.width || 1)) * 359.9 }))
        }
        onKeyDown={hueKey}
      >
        <span className="sp-color-hue-knob" style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h}, 100%, 50%)` }} />
      </div>

      <div className="sp-color-row">
        <span className="sp-color-preview" style={{ background: value }} aria-hidden="true" />
        <input
          className="sp-color-hex"
          value={draft}
          spellCheck={false}
          maxLength={7}
          aria-label={`${label}: hex`}
          onChange={(event) => {
            setDraft(event.target.value);
            const hex = readHex(event.target.value);
            if (hex) {
              last.current = hex;
              setHsv(hexToHsv(hex));
              onChange(hex);
            }
          }}
          onBlur={() => setDraft(value)}
        />
      </div>

      <div className="sp-color-swatches">
        {SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            className={`sp-color-swatch${hex === value ? ' is-on' : ''}`}
            style={{ background: hex }}
            aria-label={`Use ${hex}`}
            aria-pressed={hex === value}
            onClick={() => {
              last.current = hex;
              setHsv(hexToHsv(hex));
              setDraft(hex);
              onChange(hex);
            }}
          />
        ))}
      </div>
    </div>
  );
}

export interface FillPickerProps {
  value: Fill;
  onChange: (fill: Fill) => void;
  label?: string;
}

/** One colour and how it fades. */
export function FillPicker({ value, onChange, label = 'Colour' }: FillPickerProps) {
  return (
    <div className="sp-fill-picker">
      <ColorField value={value.color} label={label} onChange={(color) => onChange({ ...value, color })} />
      <p className="sp-pop-head">Style</p>
      <div className="sp-fill-styles" role="radiogroup" aria-label={`${label}: style`}>
        {FILL_STYLES.map((style: FillStyle) => {
          const preview = fillProps({ color: value.color, style });
          return (
            <button
              key={style}
              type="button"
              role="radio"
              aria-checked={value.style === style}
              title={STYLE_HINT[style]}
              className="sp-fill-style"
              onClick={() => onChange({ ...value, style })}
            >
              <span className={`sp-fill-chip ${preview.className}`} style={preview.style} aria-hidden="true" />
              <span>{STYLE_LABEL[style]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A floating box that shuts on a click outside or Escape. */
export function ColorPop({
  label,
  onClose,
  children,
  className = '',
  tools,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Buttons for the head row, such as Remove or Default. */
  tools?: ReactNode;
}) {
  const ref = useDismiss(true, onClose);
  return (
    <div className={`sp-pop sp-color-pop ${className}`} role="dialog" aria-label={label} ref={ref}>
      <div className="sp-pop-bar">
        <span className="sp-pop-head">{label}</span>
        {tools}
      </div>
      {children}
    </div>
  );
}
