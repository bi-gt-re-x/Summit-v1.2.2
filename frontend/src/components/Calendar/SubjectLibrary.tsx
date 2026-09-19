/**
 * The Subject Library — what the Week view's overview column becomes.
 *
 * It is a panel about *colour*, not about tasks, and that is what decides its
 * shape. Every subject the account can file work under is a row: a swatch, a
 * name, and a count of how much work is under it. Pressing the swatch opens
 * the twelve families and picking one repaints every block on the grid beside
 * this — which is the reason the library lives in the calendar's column rather
 * than on a settings page. You change a colour where you can see the colour.
 *
 * **The account's own subjects come first**, in their own section, above a
 * hundred rows of catalogue. That is not a sort order, it is the point of
 * them: somebody who made a subject did so because the hundred did not have
 * the one they wanted, and a made subject that lands at position forty has
 * been made for nothing. The section stays even when it is empty, holding the
 * field that adds one, so the way to make a subject is where the made ones
 * are rather than hidden behind a button somewhere else.
 *
 * **Colour is a family, never a hex.** The palette is twelve families of six
 * shades and the calendar picks the rung it needs per surface — a block's
 * tint, its edge, its ink, the dot beside its name. A hex would be one of
 * those six and would leave the other five to be guessed at. See
 * utils/eventPalette.
 *
 * **A colour set here is a preference, not a verdict**, and this panel does not
 * pretend otherwise. utils/calendarFamilies plans a whole week at a time so
 * that two things on one grid are not the same colour, which can move a
 * subject off the family chosen here on a busy week. The note at the foot says
 * so, because a reader who sets Mathematics to indigo and finds one Tuesday
 * block teal deserves an explanation rather than a bug report.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { iconUrl, type Subject } from '@/services/subjects';
import { create, remove, setColor } from '@/services/subjects';
import { refreshSubjects } from '@/hooks/useSubjects';
import { useConfirm } from '@/components/ui';
import {
  FAMILIES,
  FAMILY_MEANING,
  PALETTE,
  familyForSubject,
  type Family,
} from '@/utils/eventPalette';

export interface SubjectLibraryProps {
  subjects: Subject[];
  username: string | null;
  /** Back to the overview. */
  onClose: () => void;
}

/** The rung a swatch draws. Mid-family: legible on white and in the dark. */
const SWATCH_RUNG = 3;

function swatchColor(family: Family): string {
  return PALETTE[family][SWATCH_RUNG]!;
}

/**
 * The twelve, as a grid of discs.
 *
 * Every one carries its meaning as a title — "study", "admin" — because the
 * families are not arbitrary and a reader choosing between indigo and blue is
 * better served by what this app already uses them for than by their names.
 */
function FamilyPicker({
  current,
  chosen,
  onPick,
  onClear,
}: {
  current: Family;
  /** True when the account has actually chosen, rather than inherited. */
  chosen: boolean;
  onPick: (family: Family) => void;
  onClear: () => void;
}) {
  return (
    <div className="sl-picker" role="group" aria-label="Colour">
      <div className="sl-swatches">
        {FAMILIES.map((family) => (
          <button
            key={family}
            type="button"
            className={`sl-swatch${family === current ? ' is-current' : ''}`}
            style={{ ['--sw' as string]: swatchColor(family) }}
            aria-label={`${family} — ${FAMILY_MEANING[family]}`}
            aria-pressed={family === current}
            title={`${family} · ${FAMILY_MEANING[family]}`}
            onClick={() => onPick(family)}
          />
        ))}
      </div>
      {chosen && (
        <button type="button" className="sl-reset" onClick={onClear}>
          Back to the default
        </button>
      )}
    </div>
  );
}

function SubjectRow({
  subject,
  open,
  busy,
  onToggle,
  onPick,
  onClear,
  onDelete,
}: {
  subject: Subject;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onPick: (family: Family) => void;
  onClear: () => void;
  onDelete?: () => void;
}) {
  // What the calendar would actually draw it as, which is the account's choice
  // when there is one and the palette's answer when there is not. The swatch
  // shows the drawn colour either way — a row that showed "unset" would be
  // showing something the reader has never seen on the grid.
  const family = familyForSubject(subject.id);

  return (
    <li className={`sl-row${open ? ' is-open' : ''}${busy ? ' is-busy' : ''}`}>
      <div className="sl-rowhead">
        <button
          type="button"
          className="sl-dot"
          style={{ ['--sw' as string]: swatchColor(family) }}
          aria-expanded={open}
          aria-label={`Colour for ${subject.name}`}
          onClick={onToggle}
        />
        <button type="button" className="sl-name" onClick={onToggle} title={subject.name}>
          <img className="sl-ico" src={iconUrl(subject)} alt="" width={16} height={16} />
          <span>{subject.name}</span>
        </button>
        {subject.used > 0 && (
          <span className="sl-count" title={`${subject.used} task${subject.used === 1 ? '' : 's'}`}>
            {subject.used}
          </span>
        )}
        {onDelete && (
          <button
            type="button"
            className="sl-del"
            aria-label={`Delete ${subject.name}`}
            title="Delete this subject"
            onClick={onDelete}
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <FamilyPicker
          current={family}
          chosen={Boolean(subject.family)}
          onPick={onPick}
          onClear={onClear}
        />
      )}
    </li>
  );
}

export function SubjectLibrary({ subjects, username, onClose }: SubjectLibraryProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const field = useRef<HTMLInputElement>(null);

  const mine = useMemo(() => subjects.filter((s) => s.custom), [subjects]);
  const rest = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const catalogue = subjects.filter((s) => !s.custom);
    if (!needle) return catalogue;
    return catalogue.filter(
      (s) => s.name.toLowerCase().includes(needle) || s.label.toLowerCase().includes(needle),
    );
  }, [query, subjects]);

  // A message about a name that has been changed since is stale. Clearing it
  // as the reader types is what makes the field feel like it is listening.
  useEffect(() => setError(null), [name]);

  const recolour = useCallback(
    async (subjectId: string, family: Family | null) => {
      if (!username) return;
      setBusyId(subjectId);
      const result = await setColor(subjectId, family);
      if (!result.success) setError(result.message);
      // Re-read either way: a failed write means the list on screen may already
      // disagree with the server, and this is the cheap way to find out.
      await refreshSubjects(username);
      setBusyId(null);
    },
    [username],
  );

  const add = useCallback(async () => {
    if (!username) return;
    const typed = name.trim();
    if (!typed) {
      field.current?.focus();
      return;
    }
    setAdding(true);
    // No colour at creation: the row appears with the palette's default and the
    // swatch beside it is one press away. Asking for a name *and* a colour
    // before anything exists is two decisions to make something the reader can
    // already see how to change.
    const result = await create(typed, null);
    if (result.success) {
      setName('');
      await refreshSubjects(username);
      setOpenId(result.subject.id);
    } else {
      setError(result.message);
    }
    setAdding(false);
  }, [name, username]);

  const drop = useCallback(
    async (subject: Subject) => {
      if (!username) return;
      const used = subject.used > 0
        ? `${subject.used} task${subject.used === 1 ? '' : 's'} filed under it will keep the work but lose the subject.`
        : undefined;
      const sure = await confirm({
        title: `Delete “${subject.name}”?`,
        body: used,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!sure) return;
      setBusyId(subject.id);
      const result = await remove(subject.id);
      if (!result.success) setError(result.message);
      await refreshSubjects(username);
      setBusyId(null);
    },
    [username, confirm],
  );

  const row = (subject: Subject, deletable: boolean) => (
    <SubjectRow
      key={subject.id}
      subject={subject}
      open={openId === subject.id}
      busy={busyId === subject.id}
      onToggle={() => setOpenId((id) => (id === subject.id ? null : subject.id))}
      onPick={(family) => void recolour(subject.id, family)}
      onClear={() => void recolour(subject.id, null)}
      onDelete={deletable ? () => void drop(subject) : undefined}
    />
  );

  return (
    <aside className="wk-sidebar sl-sidebar" id="wkSidebar" aria-label="Subject library">
      <div className="sl-head">
        <h3 className="sl-title">Subject Library</h3>
        <button type="button" className="sl-back" onClick={onClose}>
          Done
        </button>
      </div>

      {error && <p className="sl-error" role="alert">{error}</p>}

      <section className="wk-panel sl-panel">
        <h4 className="sl-section">Yours</h4>

        <div className="sl-add">
          <input
            ref={field}
            className="sl-add-field"
            type="text"
            value={name}
            maxLength={40}
            placeholder="Name a subject…"
            aria-label="New subject name"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void add();
              }
            }}
          />
          <button
            type="button"
            className="sl-add-btn"
            disabled={adding || !name.trim()}
            onClick={() => void add()}
          >
            Add
          </button>
        </div>

        {mine.length === 0 ? (
          <p className="sl-empty">
            Nothing yet. What you add here leads every subject picker.
          </p>
        ) : (
          <ul className="sl-list">{mine.map((subject) => row(subject, true))}</ul>
        )}
      </section>

      <section className="wk-panel sl-panel">
        <h4 className="sl-section">The catalogue</h4>
        <input
          className="sl-search"
          type="search"
          value={query}
          placeholder="Find a subject…"
          aria-label="Search the catalogue"
          onChange={(event) => setQuery(event.target.value)}
        />
        {rest.length === 0 ? (
          <p className="sl-empty">Nothing matches “{query.trim()}”.</p>
        ) : (
          <ul className="sl-list">{rest.map((subject) => row(subject, false))}</ul>
        )}
      </section>

      <p className="sl-note">
        A colour set here is what the subject prefers. Busy weeks may shift some apart.
      </p>
      {confirmDialog}
    </aside>
  );
}
