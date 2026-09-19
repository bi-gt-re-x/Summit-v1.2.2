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
import { formatValue, isBetter, personalBests } from '@/utils/records';
import type { Direction, RecordDraft, RecordKind, RecordRow } from '@/services/records';
import { Icon } from '@/components/Icon';

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
            comparison_direction:
              entry.comparison_direction === 'lower' ? 'lower' : 'higher',
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

  /**
   * The records already logged, each reduced to its best.
   *
   * Through `personalBests` rather than by keeping one row per name here,
   * which is what this did and why the hint below was wrong: it kept the
   * *newest* entry and called it "best so far". Those are the same row only
   * while you never have a bad day, and on a record measured downward they are
   * routinely different. The best of a record is one function and this is not
   * a second copy of it.
   *
   * The row being edited is left out. Its own figure is the one in the form,
   * so counting it would make every edit look like it was competing with
   * itself — and "a new personal best" would never appear on the entry that
   * actually holds the record.
   */
  const knownRecords = useMemo(
    () => personalBests(rows.filter((row) => row.id !== entry?.id)),
    [entry?.id, rows],
  );

  /** Milestone names, so a second one is not typed slightly differently. */
  const knownMilestones = useMemo(() => {
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.kind !== 'milestone') continue;
      const name = row.name.trim();
      if (name) seen.add(name);
    }
    return [...seen];
  }, [rows]);

  const names = draft.kind === 'milestone'
    ? knownMilestones
    : knownRecords.map((best) => best.name);

  const knownCategories = useMemo(
    () => [...new Set(rows.map((row) => row.category.trim()).filter(Boolean))],
    [rows],
  );

  if (!open) return null;

  const isMilestone = draft.kind === 'milestone';

  /** Picking a name you already use carries its category and unit across. */
  const takeName = (name: string) => {
    const held = knownRecords.find((best) => best.name.trim() === name.trim());
    setDraft((current) => ({
      ...current,
      name,
      ...(held
        ? {
            category: current.category || held.category,
            unit: current.unit || held.unit,
            target: current.target || held.target,
            // Not `||`-ed against what is already typed, unlike the three
            // above: 'higher' is a real answer and also the default, so there
            // is no "unset" value to test for. The record's own answer wins.
            comparison_direction: held.direction,
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

  /** The record this entry is joining, if it is joining one. */
  const joining = knownRecords.find((best) => best.name.trim() === draft.name.trim());

  /** Whether what is typed would beat that record, in its own direction. */
  const typed = Number(draft.value);
  const beats =
    !isMilestone &&
    joining !== undefined &&
    draft.value !== undefined &&
    !Number.isNaN(typed) &&
    isBetter(typed, joining.value, joining.direction);

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
              {names.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {joining && !isMilestone && (
              <em className="rc-field-hint">
                {entry ? 'Part of' : 'Adds to'} your “{joining.name}” — best so far{' '}
                {formatValue(joining.value, joining.unit, joining.target)}
                {joining.direction === 'lower' ? ', and lower is better' : ''}.
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

          {!isMilestone && draft.value !== undefined && !Number.isNaN(typed) && (
            <p className={`rc-modal-preview${beats ? ' is-record' : ''}`}>
              Will read as{' '}
              <strong>{formatValue(typed, draft.unit ?? '', Number(draft.target) || 0)}</strong>
              {/* Said here rather than discovered on the page afterwards. It
                  is also the one place the direction is visibly doing
                  something at the moment it is chosen, which is what makes a
                  wrong answer to it correctable before it is saved. */}
              {beats && <span className="rc-modal-beats"> — a new personal best <Icon name="trophy" /></span>}
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
