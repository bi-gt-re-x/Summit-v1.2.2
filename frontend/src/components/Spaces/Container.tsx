/**
 * The top of a container: its name, its colour, and a way to add a block in.
 *
 * A container is a framed box on the page grid. The blocks indented under it
 * are drawn inside the frame and go wherever it is dragged; dragging a block
 * onto it drops the block in (./canvas `dropInto`), and dragging one out by
 * its handle takes it back out. The frame itself is the item's (styles in
 * spaces.css, `.sp-item.is-container`); this is only the strip along its top.
 */
import { useState, type KeyboardEvent } from 'react';
import type { Block } from './blocks';
import { ColorField, ColorPop } from './ColorPicker';

export interface ContainerHeadProps {
  one: Block;
  disabled: boolean;
  /** Whether anything is inside yet. An empty one says where things go. */
  empty: boolean;
  register: (node: HTMLDivElement | null) => void;
  onChange: (change: Partial<Block>) => void;
  onAdd: () => void;
  onKey: (event: KeyboardEvent<HTMLDivElement>) => void;
}

/** What a new container is tinted with, before anybody picks. */
export const CONTAINER_TINT = '#6366f1';

export function ContainerHead({ one, disabled, empty, register, onChange, onAdd, onKey }: ContainerHeadProps) {
  const [pop, setPop] = useState(false);
  const tint = one.fill?.color ?? CONTAINER_TINT;
  return (
    <div
      ref={register}
      className="sp-box-head"
      role="group"
      tabIndex={disabled ? -1 : 0}
      aria-label={`Container: ${one.text || 'untitled'}`}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget) onKey(event);
      }}
    >
      <input
        className="sp-box-title"
        value={one.text}
        placeholder="Container"
        aria-label="Container name"
        maxLength={120}
        disabled={disabled}
        onChange={(event) => onChange({ text: event.target.value })}
      />
      {!disabled && (
        <>
          <button type="button" className="sp-live-btn" aria-label="Container colour" title="Colour" aria-expanded={pop} onClick={() => setPop((was) => !was)}>
            <span className="sp-box-dot" style={{ background: tint }} aria-hidden="true" />
          </button>
          <button type="button" className="sp-live-btn" aria-label="Add a block inside" title="Add a block inside" onClick={onAdd}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </>
      )}
      {pop && (
        <ColorPop
          label="Container colour"
          onClose={() => setPop(false)}
          tools={
            <button type="button" className="sp-ghost" onClick={() => onChange({ fill: undefined })}>
              Default
            </button>
          }
        >
          <ColorField value={tint} label="Container colour" onChange={(color) => onChange({ fill: { color, style: 'solid' } })} />
        </ColorPop>
      )}
      {empty && (
        <p className="sp-box-empty">
          {disabled ? 'Nothing in here yet.' : 'Drag blocks in here, or press + to add one.'}
        </p>
      )}
    </div>
  );
}
