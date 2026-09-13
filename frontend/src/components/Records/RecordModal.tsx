/**
 * Logging a record or a milestone.
 *
 * One dialog for both, because they are the same form with the figure left
 * out — and because the difference between them is a thing the reader decides
 * at the moment of writing, not before. The kind switch is therefore the first
 * control rather than two separate buttons on the page behind it.
 *
 * ## Adding to a record you already have
 *
 * The name field offers what you have logged before. That is the whole trick
 * of this page: beating your AMC 8 score is not a new record, it is a new
 * *entry* on the same one, and the evolution only draws if the names match. A
 * free-text field with no memory would give "AMC 8" and "AMC8" and two
 * separate charts, so picking an existing name fills the category and the unit
 * from the last entry too — the fields that have to agree for the series to
 * mean anything.
 *
 * ## Why the value is a plain number with a unit beside it
 *
 * Rather than a text field taking "4h 18m". Storing what somebody typed makes
 * a record that cannot be compared to the one before it, and comparison is the
 * entire point — see utils/records. So the unit is chosen and the figure is a
 * number, and the page prints "4h 18m" back out.
 *
 * ## And why "which way is better" is asked here
 *
 * It is the one fact about a record that nothing can work out for you — a mile
 * time wants the smallest number and minutes practised wants the largest, and
 * they carry the same unit. So it is a control, sitting beside the figure it
 * describes, and it is asked once: adding to a record you already have takes
 * the answer from the last entry along with the category and the unit, because
 * two entries of one record that disagree about which way is better are two
 * halves of a chart pointing opposite ways.
 */
import { useEffect, useMemo, useState } from 'react';
import { directionOf, formatValue } from '@/utils/records';
import type { Direction, RecordDraft, RecordKind, RecordRow } from '@/services/records';

/**
 * The units on offer.
 *
 * Short, because a units list long enough to browse is a decision nobody wants
 * in front of logging a score. "points" is the default and prints bare — a
 * score of 25 does not want the word "points" after it.
 */
export const UNITS: Array<{ id: string; label: string }> = [
  { id: 'points', label: 'Score / points' },
  { id: 'minutes', label: 'Time (minutes)' },
  { id: 'days', label: 'Days' },
  { id: 'problems', label: 'Problems' },
  { id: 'lines', label: 'Lines' },
  { id: 'level', label: 'Level' },
  { id: 'rating', label: 'Rating' },
  { id: '', label: 'No unit' },
];

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
};

export interface RecordModalProps {
  open: boolean;
  /** The row being edited, or undefined to create. */
  entry?: RecordRow;
  /** What a fresh dialog opens as. */
  kind?: RecordKind;
  /** Everything logged so far, for the name and category suggestions. */
  rows: RecordRow[];
  busy: boolean;
  onClose: () => void;
  onSave: (draft: RecordDraft) => void;
  onDelete?: (entry: RecordRow) => void;
}

export function RecordModal({
  open,
  entry,
  kind = 'record',
  rows,
  busy,
  onClose,
  onSave,
  onDelete,
}: RecordModalProps) {
  const [draft, setDraft] = useState<RecordDraft>({ kind, name: '' });
  const [error, setError] = useState<string | null>(null);

  /* Reset every time it opens. A dialog that remembers the last thing typed
     into it is a dialog that saves the wrong record eventually. */
  useEffect(() => {
    if (!open) return;
    setError(null);
    setDraft(
      entry
        ? {
            id: entry.id,
            kind: entry.kind,
            name: entry.name,
            category: entry.category,
            value: entry.value,
            target: entry.target,
            unit: entry.unit,
            comparison_direction: directionOf([entry]),
            note: entry.note,
            achieved_on: entry.achieved_on,
          }
        : {
            kind,
            name: '',
            category: '',
            value: undefined,
            target: 0,
            unit: 'points',
            comparison_direction: 'higher',
            note: '',
            achieved_on: todayIso(),
          },
    );
  }, [entry, kind, open]);

  /** Names already logged, so a new entry can join an existing record. */
  const names = useMemo(() => {
    const seen = new Map<string, RecordRow>();
    for (const row of rows) {
      if (row.kind !== draft.kind) continue;
      const key = row.name.trim();
      if (!key) continue;
      const held = seen.get(key);
      if (!held || row.achieved_on > held.achieved_on) seen.set(key, row);
    }
    return [...seen.values()];
  }, [draft.kind, rows]);

  const knownCategories = useMemo(
    () => [...new Set(rows.map((row) => row.category.trim()).filter(Boolean))],
    [rows],
  );

  if (!open) return null;

  const isMilestone = draft.kind === 'milestone';

  /** Picking a name you already use carries its category and unit across. */
  const takeName = (name: string) => {
    const previous = names.find((row) => row.name.trim() === name.trim());
    setDraft((current) => ({
      ...current,
      name,
      ...(previous
        ? {
            category: current.category || previous.category,
            unit: current.unit || previous.unit,
            target: current.target || previous.target,
            // Not `||`-ed against what is already typed, unlike the three
            // above: 'higher' is a real answer and also the default, so there
            // is no "unset" value to test for. The record's own answer wins.
            comparison_direction: directionOf([previous]),
          }
        : {}),
    }));
  };

  const submit = () => {
    if (!draft.name.trim()) {
      setError('Give it a name — "AMC 8", "Longest coding session".');
      return;
    }
    if (!isMilestone && (draft.value === undefined || Number.isNaN(Number(draft.value)))) {
      setError('A record needs a figure. A milestone does not — switch it above.');
      return;
    }
    setError(null);
    onSave({
      ...draft,
      name: draft.name.trim(),
      value: isMilestone ? 0 : Number(draft.value),
      target: isMilestone ? 0 : Number(draft.target) || 0,
      comparison_direction: isMilestone ? 'higher' : (draft.comparison_direction ?? 'higher'),
    });
  };

  const previous = names.find((row) => row.name.trim() === draft.name.trim());

  return (
    <div className="rc-modal-back" role="dialog" aria-modal="true" aria-label="Log a record">
      <div className="rc-modal" onClick={(event) => event.stopPropagation()}>
        <header className="rc-modal-head">
          <h2>{entry ? 'Edit this entry' : isMilestone ? 'Log a milestone' : 'Log a record'}</h2>
          <button type="button" className="rc-modal-x" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="rc-modal-body">
          {/* Kind first: it decides which of the fields below exist. */}
          <div className="rc-kind" role="group" aria-label="What kind of entry">
            {(['record', 'milestone'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={draft.kind === option ? 'is-on' : ''}
                aria-pressed={draft.kind === option}
                onClick={() => setDraft((current) => ({ ...current, kind: option }))}
              >
                {option === 'record' ? 'Record' : 'Milestone'}
                <em>{option === 'record' ? 'A figure you can beat' : 'A thing you did once'}</em>
              </button>
            ))}
          </div>

          <label className="rc-field">
            <span>What is it?</span>
            <input
              list="rc-known-names"
              value={draft.name}
              maxLength={120}
              autoFocus
              placeholder={isMilestone ? 'First AIME problem solved' : 'AMC 8'}
              onChange={(event) => takeName(event.target.value)}
            />
            <datalist id="rc-known-names">
              {names.map((row) => (
                <option key={row.id} value={row.name} />
              ))}
            </datalist>
            {previous && !entry && (
              <em className="rc-field-hint">
                Adds to your existing “{previous.name}” — best so far{' '}
                {formatValue(previous.value, previous.unit, previous.target)}.
              </em>
            )}
          </label>

          {!isMilestone && (
            <div className="rc-field-row">
              <label className="rc-field">
                <span>Result</span>
                <input
                  type="number"
                  step="any"
                  value={draft.value ?? ''}
                  placeholder="25"
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      value: event.target.value === '' ? undefined : Number(event.target.value),
                    })
                  }
                />
              </label>

              <label className="rc-field">
                <span>Out of</span>
                <input
                  type="number"
                  step="any"
                  value={draft.target || ''}
                  placeholder="optional"
                  onChange={(event) => setDraft({ ...draft, target: Number(event.target.value) || 0 })}
                />
              </label>

              <label className="rc-field">
                <span>Measured in</span>
                <select
                  value={draft.unit ?? 'points'}
                  onChange={(event) => setDraft({ ...draft, unit: event.target.value })}
                >
                  {UNITS.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {!isMilestone && (
            <div className="rc-field" role="group" aria-label="Which way is better">
              <span>Better is</span>
              <div className="rc-dir">
                {([
                  ['higher', 'Higher', 'A score, a streak, a level'],
                  ['lower', 'Lower', 'A mile time, a solve time'],
                ] as Array<[Direction, string, string]>).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    className={(draft.comparison_direction ?? 'higher') === value ? 'is-on' : ''}
                    aria-pressed={(draft.comparison_direction ?? 'higher') === value}
                    onClick={() => setDraft({ ...draft, comparison_direction: value })}
                  >
                    {label}
                    <em>{hint}</em>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rc-field-row">
            <label className="rc-field">
              <span>Category</span>
              <input
                list="rc-known-categories"
                value={draft.category ?? ''}
                maxLength={120}
                placeholder="Competitive Math"
                onChange={(event) => setDraft({ ...draft, category: event.target.value })}
              />
              <datalist id="rc-known-categories">
                {knownCategories.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>

            <label className="rc-field">
              <span>{isMilestone ? 'Reached on' : 'Set on'}</span>
              <input
                type="date"
                value={draft.achieved_on ?? ''}
                onChange={(event) => setDraft({ ...draft, achieved_on: event.target.value })}
              />
              {isMilestone && (
                <em className="rc-field-hint">Leave it empty for one you are still chasing.</em>
              )}
            </label>
          </div>

          <label className="rc-field">
            <span>Note</span>
            <textarea
              rows={2}
              maxLength={500}
              value={draft.note ?? ''}
              placeholder="What made it happen, or what to do differently next time."
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
            />
          </label>

          {!isMilestone && draft.value !== undefined && !Number.isNaN(Number(draft.value)) && (
            <p className="rc-modal-preview">
              Will read as{' '}
              <strong>
                {formatValue(Number(draft.value), draft.unit ?? '', Number(draft.target) || 0)}
              </strong>
            </p>
          )}

          {error && <p className="rc-modal-error">{error}</p>}
        </div>

        <footer className="rc-modal-foot">
          {entry && onDelete && (
            <button
              type="button"
              className="rc-btn is-bad"
              disabled={busy}
              onClick={() => onDelete(entry)}
            >
              Delete
            </button>
          )}
          <button type="button" className="rc-btn" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="rc-btn is-primary" disabled={busy} onClick={submit}>
            {busy ? 'Saving…' : entry ? 'Save changes' : isMilestone ? 'Log milestone' : 'Log record'}
          </button>
        </footer>
      </div>
    </div>
  );
}
