/**
 * "What is this about?" — the optional subject on a new task.
 *
 * It has two states and the difference between them is the whole design.
 *
 * **Closed** it is a single button: the chosen subject's icon and name, or the
 * invitation to pick one. That is all a finished field needs to be, and a
 * dialog with three rows of pills sitting under a question already answered is
 * a dialog that looks unfinished.
 *
 * **Open** it is a text input with the catalogue laid out beneath it as one
 * scrolling row of pills. The row opens on the subjects this account uses most
 * — the backend orders the list that way (see backend/api/subjects.py) — so
 * the first thing a returning reader sees is their own five or six, not the
 * letter A. Typing in the input filters the row rather than searching a
 * separate dropdown: what is being narrowed stays visible while it narrows.
 *
 * Picking a pill closes it back to the button. There is no confirm step,
 * because there is nothing to confirm: the choice *is* the click, and the
 * button that replaces the row is the receipt.
 *
 * On a task the whole thing is optional. `null` is a first-class value here —
 * the button offers to clear the choice once one has been made, and a task
 * saved with no subject is an ordinary task rather than an incomplete one.
 *
 * On a *goal* it is not, and that is why the label's word is a prop rather
 * than a constant. `subject_ids` is the only link between a goal and the
 * record of the work being done toward it (see the note at the top of
 * components/Goals/NewGoalWizard), so a goal without one is invisible to the
 * page that would have explained it — a different thing from a task with no
 * subject, which is merely unfiled.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { iconUrl, type Subject } from '@/services/subjects';
import '@/styles/subject-picker.css';

export interface SubjectPickerProps {
  subjects: Subject[];
  /** The chosen subject's id, or null. */
  value: string | null;
  onChange: (subjectId: string | null) => void;
  /** The field's label. "Subject:" unless a dialog wants its own wording. */
  label?: string;
  /** The dialog's id prefix, so two pickers on one page keep distinct ids. */
  id?: string;
  /**
   * Whether leaving it unset is a legitimate answer. True on a task, false on
   * a goal — see the note above. Only changes the word beside the label; the
   * caller is what enforces it, because the caller is what knows what an
   * unanswered field costs.
   */
  optional?: boolean;
}

/**
 * Whether a subject answers what has been typed.
 *
 * Both the full name and the short label are matched, because the reader can
 * see only one of them: someone looking at a pill that says "CompSci" will
 * type "compsci", and someone who knows the subject as Computer Science will
 * type that. Matching anywhere in the string rather than only at the start is
 * what lets "sci" find both Computer Science and Data Science.
 */
function matches(subject: Subject, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    subject.name.toLowerCase().includes(needle) ||
    subject.label.toLowerCase().includes(needle)
  );
}

function SubjectIcon({ subject }: { subject: Subject }) {
  return (
    <i
      className="sp-ico"
      style={{ ['--ico' as string]: `url(${iconUrl(subject)})` }}
      aria-hidden="true"
    />
  );
}

export function SubjectPicker({
  subjects,
  value,
  onChange,
  label = 'Subject:',
  id = 'subject',
  optional = true,
}: SubjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const rail = useRef<HTMLDivElement>(null);

  const chosen = useMemo(
    () => subjects.find((subject) => subject.id === value) ?? null,
    [subjects, value],
  );

  const shown = useMemo(
    () => subjects.filter((subject) => matches(subject, query)),
    [query, subjects],
  );

  // Opening puts the cursor in the field: the reader clicked to type, and a
  // click that turns a button into an input they then have to click again is
  // two clicks for one intention.
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // A fresh query starts the row at its beginning. Filtering while scrolled
  // halfway along otherwise leaves the reader looking at empty rail with the
  // matches off to the left.
  useEffect(() => {
    if (rail.current) rail.current.scrollLeft = 0;
  }, [query]);

  const choose = (subject: Subject) => {
    onChange(subject.id);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="subject-picker">
      <label className="sp-label" htmlFor={`${id}Search`}>
        {label}{' '}
        <span className={optional ? 'sp-optional' : 'sp-optional is-required'}>
          {optional ? 'optional' : 'required'}
        </span>
      </label>

      {!open ? (
        <div className="sp-closed">
          <button
            type="button"
            id={`${id}Button`}
            className={`sp-chosen${chosen ? ' is-set' : ''}`}
            title={chosen ? chosen.name : 'Choose a subject'}
            onClick={() => setOpen(true)}
          >
            {chosen ? (
              <>
                <SubjectIcon subject={chosen} />
                <span className="sp-chosen-name">{chosen.name}</span>
              </>
            ) : (
              <>
                <span className="sp-plus" aria-hidden="true">
                  +
                </span>
                <span className="sp-chosen-name">Choose a subject</span>
              </>
            )}
          </button>

          {/* Clearing is its own control rather than a second meaning for the
              button: a click on a chosen subject should reopen the row, which
              is what a reader changing their mind wants. */}
          {chosen && (
            <button
              type="button"
              className="sp-clear"
              aria-label={`Clear subject ${chosen.name}`}
              onClick={() => onChange(null)}
            >
              ×
            </button>
          )}
        </div>
      ) : (
        <div className="sp-open">
          <input
            ref={input}
            id={`${id}Search`}
            type="text"
            className="sp-search"
            placeholder="Type to filter subjects…"
            value={query}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setQuery('');
                setOpen(false);
                return;
              }
              // Enter takes the first pill still standing, so a reader who
              // knows what they want never has to leave the keyboard.
              if (event.key === 'Enter') {
                event.preventDefault();
                const first = shown[0];
                if (first) choose(first);
              }
            }}
          />

          {shown.length === 0 ? (
            <p className="sp-empty">No subject matches "{query.trim()}".</p>
          ) : (
            <div className="sp-rail" ref={rail}>
              {shown.map((subject) => (
                <button
                  type="button"
                  key={subject.id}
                  className={`sp-pill${subject.id === value ? ' is-active' : ''}`}
                  // The pill prints the short label; the full name is here for
                  // anyone who needs to know what "Philos" is.
                  title={subject.name}
                  aria-label={subject.name}
                  onClick={() => choose(subject)}
                >
                  <SubjectIcon subject={subject} />
                  <span>{subject.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
