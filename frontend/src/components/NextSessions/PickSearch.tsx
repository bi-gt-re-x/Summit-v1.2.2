/**
 * A search box that picks things: type, then click or press Enter on a match.
 * Next sessions' big row has two, one for subjects and one for topics. It only
 * lists; what's picked is kept and drawn by the panel around it.
 */
import { useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';

export interface PickOption {
  id: string;
  label: string;
  /** Said beside the name in the list: where it sits, or how it's going. */
  hint?: string;
}

/** Matches shown at once. Typing narrows the rest. */
const SHOWN = 30;

export function PickSearch({ label, placeholder, options, picked, onPick, disabled, empty }: {
  label: string;
  placeholder: string;
  options: PickOption[];
  picked: string[];
  onPick: (option: PickOption) => void;
  disabled?: boolean;
  /** Said when nothing matches. */
  empty: string;
}) {
  const listId = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    return options
      .filter((one) => !picked.includes(one.id))
      .filter((one) => {
        const said = `${one.label} ${one.hint ?? ''}`.toLowerCase();
        return words.every((word) => said.includes(word));
      })
      .slice(0, SHOWN);
  }, [options, picked, text]);

  const choose = (option: PickOption | undefined) => {
    if (!option) return;
    onPick(option);
    setText('');
    setActive(0);
  };

  return (
    <div className="ns-search">
      <label className="ns-search-label" htmlFor={`${listId}-input`}>{label}</label>
      <div className="ns-search-box">
        <Search aria-hidden="true" />
        <input
          id={`${listId}-input`}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={placeholder}
          value={text}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActive((at) => Math.min(at + 1, matches.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((at) => Math.max(at - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              if (open) choose(matches[active]);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
      </div>
      {open && (
        <ul className="ns-search-list" id={listId} role="listbox" aria-label={label}>
          {matches.length === 0 && <li className="ns-search-none">{empty}</li>}
          {matches.map((one, at) => (
            <li
              key={one.id}
              role="option"
              aria-selected={at === active}
              className={`ns-search-option${at === active ? ' is-active' : ''}`}
              /* Before the input's blur closes the list. */
              onMouseDown={(event) => {
                event.preventDefault();
                choose(one);
              }}
            >
              <span>{one.label}</span>
              {one.hint && <small>{one.hint}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
