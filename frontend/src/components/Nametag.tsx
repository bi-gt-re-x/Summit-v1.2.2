/**
 * The nametag's two halves, shared by the top bar's account button and the
 * plate at the foot of the rail — see hooks/useNametag for why they share.
 *
 * `NametagText` is "<title> <name>", title first. `TitleChoices` is the list a
 * title is picked from; the rail shows it as a menu off its three dots, and
 * the top bar's account menu as a select (`TitleSelect`), because a menu
 * already open cannot open another one over itself.
 */
import { AUTOMATIC } from '@/utils/rankTitle';
import type { Nametag } from '@/hooks/useNametag';
import '@/styles/nametag.css';

export function NametagText({ title, name, className = '' }: { title: string | null; name: string; className?: string }) {
  return (
    <span className={`nametag ${className}`.trim()}>
      {title && <span className="nametag-title">{title}</span>}
      {title && name ? ' ' : null}
      <span className="nametag-name">{name}</span>
    </span>
  );
}

/** The choices as menu items. `onPicked` runs after the pick is written. */
export function TitleChoices({ tag, onPicked }: { tag: Nametag; onPicked?: () => void }) {
  const pick = (title: string) => {
    tag.choose(title);
    onPicked?.();
  };
  return (
    <>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={tag.chosen === AUTOMATIC}
        className={`title-opt${tag.chosen === AUTOMATIC ? ' active' : ''}`}
        onClick={() => pick(AUTOMATIC)}
      >
        <span>Automatic</span>
        <small>{tag.automatic}</small>
      </button>
      {tag.titles.map((name) => (
        <button
          key={name}
          type="button"
          role="menuitemradio"
          aria-checked={tag.chosen === name}
          className={`title-opt${tag.chosen === name ? ' active' : ''}`}
          onClick={() => pick(name)}
        >
          <span>{name}</span>
        </button>
      ))}
    </>
  );
}

/** The same choices as a select, for inside a menu that is already open. */
export function TitleSelect({ tag, className = '' }: { tag: Nametag; className?: string }) {
  /* A pick the account can no longer justify shows as Automatic, which is
     what is being worn in its place. */
  const value = tag.titles.includes(tag.chosen) ? tag.chosen : AUTOMATIC;
  return (
    <label className={className}>
      <span>Title</span>
      <select value={value} onChange={(event) => tag.choose(event.target.value)}>
        <option value={AUTOMATIC}>Automatic ({tag.automatic})</option>
        {tag.titles.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
