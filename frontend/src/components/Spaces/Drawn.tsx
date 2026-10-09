/**
 * Sticky notes and shapes — blocks that are drawn more than written.
 *
 * Both are filled from one colour and a fade style (./fill), both carry words
 * in a colour of their own, and both have a height in grid rows that the
 * bottom edge drags (snapping a row at a time, like everything on the page).
 * A shape is one of eight outlines cut from the same fill, with an optional
 * label across its middle.
 *
 * The small bar on each (Colour, Text, and Shape on a shape) shows on hover
 * and on focus. Each opens the picker from ./ColorPicker.
 */
import { useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { SHAPE_KINDS, SHAPE_LABEL, cleanRows, type Block, type ShapeKind } from './blocks';
import { GAP_PX, ROW_PX } from './canvas';
import { ColorField, ColorPop, FillPicker } from './ColorPicker';
import { fillProps, inkOn, type Fill } from './fill';

type Pop = 'fill' | 'ink' | 'shape' | null;

export interface DrawnProps {
  one: Block;
  disabled: boolean;
  register: (node: HTMLDivElement | null) => void;
  onChange: (change: Partial<Block>) => void;
  /** Keys on the block itself (not its words): leaving it, deleting it. */
  onKey: (event: KeyboardEvent<HTMLDivElement>) => void;
}

/** The pixel height a block of `rows` is drawn at, so it measures as exactly that many. */
const heightOf = (rows: number) => rows * ROW_PX - GAP_PX;

/** The bottom edge: drag it, or use the arrow keys, to make the block taller or shorter. */
function TallHandle({ rows, onRows }: { rows: number; onRows: (rows: number) => void }) {
  const down = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const from = rows;
    const move = (moved: PointerEvent) => onRows(cleanRows(from + Math.round((moved.clientY - startY) / ROW_PX), from));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <span
      className="sp-tall"
      role="slider"
      tabIndex={0}
      aria-label="Height in rows"
      aria-orientation="vertical"
      aria-valuenow={rows}
      title="Drag to change the height"
      onPointerDown={down}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 4 : 1;
        const by = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
        if (!by) return;
        event.preventDefault();
        event.stopPropagation();
        onRows(cleanRows(rows + by, rows));
      }}
    />
  );
}

/** Colour, Text and (on a shape) Shape, and whichever pop-up is open. */
function Tools({ one, fill, onChange, withShape }: { one: Block; fill: Fill; onChange: (change: Partial<Block>) => void; withShape: boolean }) {
  const [pop, setPop] = useState<Pop>(null);
  const close = () => setPop(null);
  const toggle = (which: Pop) => setPop(pop === which ? null : which);
  return (
    <div className={`sp-drawn-tools${pop ? ' is-open' : ''}`}>
      <button type="button" className="sp-drawn-tool" aria-haspopup="dialog" aria-expanded={pop === 'fill'} onClick={() => toggle('fill')}>
        <span className={`sp-drawn-dot ${fillProps(fill).className}`} style={fillProps(fill).style} aria-hidden="true" />
        Colour
      </button>
      <button type="button" className="sp-drawn-tool" aria-haspopup="dialog" aria-expanded={pop === 'ink'} onClick={() => toggle('ink')}>
        <span className="sp-drawn-a" style={{ color: one.color ?? inkOn(fill) }} aria-hidden="true">A</span>
        Text
      </button>
      {withShape && (
        <button type="button" className="sp-drawn-tool" aria-haspopup="dialog" aria-expanded={pop === 'shape'} onClick={() => toggle('shape')}>
          Shape
        </button>
      )}

      {pop === 'fill' && (
        <ColorPop label={one.type === 'sticky' ? 'Note colour' : 'Shape colour'} onClose={close}>
          <FillPicker value={fill} label={one.type === 'sticky' ? 'Note colour' : 'Shape colour'} onChange={(next) => onChange({ fill: next })} />
        </ColorPop>
      )}
      {pop === 'ink' && (
        <ColorPop
          label="Text colour"
          onClose={close}
          tools={
            <button type="button" className="sp-ghost" onClick={() => onChange({ color: undefined })}>
              Auto
            </button>
          }
        >
          <ColorField value={one.color ?? inkOn(fill)} label="Text colour" onChange={(color) => onChange({ color })} />
        </ColorPop>
      )}
      {pop === 'shape' && (
        <ColorPop label="Shape" onClose={close} className="sp-shape-pop">
          <div className="sp-shape-grid" role="radiogroup" aria-label="Shape">
            {SHAPE_KINDS.map((kind: ShapeKind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={one.shape === kind}
                aria-label={SHAPE_LABEL[kind]}
                title={SHAPE_LABEL[kind]}
                className="sp-shape-choice"
                onClick={() => onChange({ shape: kind })}
              >
                <span className={`sp-shape sp-shape-${kind}`} aria-hidden="true" />
              </button>
            ))}
          </div>
        </ColorPop>
      )}
    </div>
  );
}

/** A post-it: a coloured square with words on it. */
export function StickyBlock({ one, disabled, register, onChange, onKey }: DrawnProps) {
  const fill = one.fill!;
  const rows = one.rows ?? 22;
  const painted = fillProps(fill);
  const ink = one.color ?? inkOn(fill);
  return (
    <div
      ref={register}
      className={`sp-sticky ${painted.className}`}
      style={{ ...painted.style, height: heightOf(rows), color: ink } as CSSProperties}
      role="note"
      tabIndex={disabled ? -1 : 0}
      aria-label={one.text ? `Sticky note: ${one.text.slice(0, 40)}` : 'Sticky note'}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget) onKey(event);
      }}
    >
      <textarea
        className="sp-sticky-text"
        value={one.text}
        placeholder="Write a note"
        aria-label="Note"
        disabled={disabled}
        style={{ color: ink }}
        onChange={(event) => onChange({ text: event.target.value })}
      />
      {!disabled && (
        <>
          <Tools one={one} fill={fill} onChange={onChange} withShape={false} />
          <TallHandle rows={rows} onRows={(next) => onChange({ rows: next })} />
        </>
      )}
    </div>
  );
}

/** A shape cut from a fill, with an optional label across its middle. */
export function ShapeBlock({ one, disabled, register, onChange, onKey }: DrawnProps) {
  const fill = one.fill!;
  const rows = one.rows ?? 20;
  const kind = one.shape ?? 'rectangle';
  const painted = fillProps(fill);
  const ink = one.color ?? inkOn(fill);
  return (
    <div
      ref={register}
      className="sp-shape-block"
      style={{ height: heightOf(rows) }}
      role="group"
      tabIndex={disabled ? -1 : 0}
      aria-label={`${SHAPE_LABEL[kind]}${one.text ? `: ${one.text}` : ''}`}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget) onKey(event);
      }}
    >
      <span className={`sp-shape sp-shape-${kind} ${painted.className}`} style={painted.style} aria-hidden="true" />
      <input
        className="sp-shape-text"
        value={one.text}
        placeholder={disabled ? '' : 'Label'}
        aria-label="Shape label"
        disabled={disabled}
        maxLength={120}
        style={{ color: ink }}
        onChange={(event) => onChange({ text: event.target.value })}
      />
      {!disabled && (
        <>
          <Tools one={one} fill={fill} onChange={onChange} withShape />
          <TallHandle rows={rows} onRows={(next) => onChange({ rows: next })} />
        </>
      )}
    </div>
  );
}
