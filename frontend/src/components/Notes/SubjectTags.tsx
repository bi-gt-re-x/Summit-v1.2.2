/**
 * Tagging a note with what it is about, and putting it on a shelf.
 *
 * ## Why the subject catalogue and not free text
 *
 * A free-text tag box gives you "calc", "Calc", "calculus" and "Calculus 1"
 * inside two weeks, and then a tag filter that finds a quarter of what it
 * should. The app already has the answer: a hundred subjects in
 * backend/config/subjects.py that tasks, the calendar and the skill trees all
 * key off. A note tagged from that same list is a note the rest of Summit can
 * see — the same id, the same colour, the same name everywhere.
 *
 * The cost is that the list is fixed, which is the right trade here and is not
 * a dead end either: an account can add its own subjects in the subject
 * library, and they arrive in this picker like any other because both read
 * `useSubjects`.
 *
 * ## Colour is not decoration
 *
 * A pill takes its family from `familyForSubject`, which is the same function
 * the calendar colours a block with. So a note about Physics is the colour
 * Physics is on the week grid, and the colour means the subject rather than
 * meaning "tag". Six ramps per family exist; a pill uses the 300 for its text
 * and a wash of it behind, which is the pairing that stays legible in both
 * themes.
 *
 * ## The shelf is one of the catalogue's own groups
 *
 * Rather than a second vocabulary to invent and maintain. Subjects already
 * carry a `group` — "Computing", "Creative", "Sciences" — so the notebook list
 * is those names, and every note filed under one is filed under a word that
 * already means something in this app.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { familyForSubject } from '@/utils/eventPalette';
import type { Subject } from '@/services/subjects';
/* The `--event-<family>-*` ramps the pills colour themselves from. They are
   declared on :root in the calendar's palette sheet, which until now only
   reached the pages that draw a calendar — that file is named for where the
   colours were first needed, not for who is allowed to read them. Imported
   here rather than in the page because this is what draws a pill. */
import '@/styles/calendar/palette.css';

/** Matches SUBJECT_MAX in backend/api/notes.py, which enforces it on write. */
export const SUBJECT_MAX = 8;

export interface SubjectTagsProps {
  /** The ids currently on the note. */
  ids: string[];
  catalogue: Subject[];
  disabled?: boolean;
  onChange: (ids: string[]) => void;
}

/** The catalogue row for an id, when the catalogue still has one. */
export function subjectOf(id: string, catalogue: Subject[]): Subject | undefined {
  return catalogue.find((subject) => subject.id === id);
}

/**
 * One subject, as a pill.
 *
 * `data-family` rather than an inline colour so the stylesheet owns the two
 * shades and the dark theme can move them — an inline style would win over
 * both. An id the catalogue no longer has is still drawn, under its own id:
 * see the note on validation in backend/api/notes.py.
 */
export function SubjectPill({
  id,
  catalogue,
  onRemove,
}: {
  id: string;
  catalogue: Subject[];
  onRemove?: () => void;
}) {
  const subject = subjectOf(id, catalogue);
  return (
    <span className="nt-tag" data-family={familyForSubject(id)}>
      <span>{subject?.label ?? id}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${subject?.name ?? id}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  );
}

export function SubjectTags({ ids, catalogue, disabled, onChange }: SubjectTagsProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  /* Closes on a click anywhere outside it, and on Escape — the two ways
     everybody expects a popover to go away. */
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  const full = ids.length >= SUBJECT_MAX;

  /**
   * The pickable list: what is not already on the note, matching the search.
   *
   * The catalogue arrives ordered by how much this account uses each subject,
   * so an unsearched list is already the useful one and nothing re-sorts it.
   */
  const choices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalogue
      .filter((subject) => !ids.includes(subject.id))
      .filter(
        (subject) =>
          !needle ||
          subject.name.toLowerCase().includes(needle) ||
          subject.label.toLowerCase().includes(needle) ||
          subject.group.toLowerCase().includes(needle),
      )
      .slice(0, 60);
  }, [catalogue, ids, query]);

  return (
    <div className="nt-tags" ref={box}>
      {ids.length > 0 && (
        <div className="nt-tag-row">
          {ids.map((id) => (
            <SubjectPill
              key={id}
              id={id}
              catalogue={catalogue}
              onRemove={disabled ? undefined : () => onChange(ids.filter((held) => held !== id))}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        className="nt-add-tag"
        disabled={disabled || full}
        title={full ? `A note takes at most ${SUBJECT_MAX} subjects` : 'Tag this note with a subject'}
        aria-expanded={open}
        onClick={() => setOpen((on) => !on)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        {ids.length === 0 ? 'Add tag' : 'Add another'}
      </button>

      {open && (
        <div className="nt-picker">
          <input
            ref={field}
            type="search"
            className="nt-picker-search"
            placeholder="Search subjects…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {choices.length === 0 ? (
            <p className="nt-picker-none">
              {query.trim() ? `Nothing matches “${query.trim()}”.` : 'Every subject is already on.'}
            </p>
          ) : (
            <ul className="nt-picker-list">
              {choices.map((subject) => (
                <li key={subject.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange([...ids, subject.id]);
                      setQuery('');
                      // Left open: tagging one note with three subjects is the
                      // common case, and reopening the popover each time is
                      // three extra clicks to no purpose.
                      if (ids.length + 1 >= SUBJECT_MAX) setOpen(false);
                    }}
                  >
                    <i data-family={familyForSubject(subject.id)} aria-hidden="true" />
                    <span className="nt-picker-name">{subject.name}</span>
                    <span className="nt-picker-group">{subject.group}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The shelf
// ---------------------------------------------------------------------------
/** The catalogue's group names, in the order the catalogue lists them. */
export function notebooks(catalogue: Subject[]): string[] {
  const seen: string[] = [];
  for (const subject of catalogue) {
    if (subject.group && !seen.includes(subject.group)) seen.push(subject.group);
  }
  return seen.sort((a, b) => a.localeCompare(b));
}

export function NotebookPicker({
  value,
  catalogue,
  disabled,
  onChange,
}: {
  value: string;
  catalogue: Subject[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const options = useMemo(() => notebooks(catalogue), [catalogue]);

  return (
    <div className="nt-select-wrap">
      <select
        className="nt-select"
        value={value}
        disabled={disabled}
        aria-label="Which notebook this note is filed under"
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Unfiled</option>
        {/* A shelf the catalogue no longer offers is still selectable while it
            is the one in use, so opening an old note cannot silently refile it. */}
        {value && !options.includes(value) && <option value={value}>{value}</option>}
        {options.map((group) => (
          <option key={group} value={group}>
            {group}
          </option>
        ))}
      </select>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
