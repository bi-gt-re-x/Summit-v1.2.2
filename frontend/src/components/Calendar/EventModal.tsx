/**
 * Add or edit an event — the dialog the calendar has always called "section".
 *
 * One component for both, because the fields are the same and the only real
 * difference is what happens on confirm: a new event may recur, an edited one
 * asks instead whether the change is for this day or the whole series (its
 * recurrence pattern is already fixed, and re-writing it would mean deleting
 * and re-creating every copy).
 *
 * Overlaps are deliberately not blocked here. The grid stops the reader when
 * two blocks clash and makes them delete one; refusing the save would pre-empt
 * that with a worse message — see ConflictDialog.
 */
import { useEffect, useState } from 'react';
import { RecurrencePicker } from './RecurrencePicker';
import { TimePicker, spanMinutes } from './TimePicker';
import type { EventDraft, Scope } from '@/hooks/useCalendarStore';
import type { RecurrenceType } from '@/utils/calendarStore';

export interface EventModalProps {
  /** Filled in when editing; absent when adding. */
  initial?: { name: string; startTime: string; endTime: string };
  /** True when the event being edited lands on more than one day. */
  recurring?: boolean;
  /** Pre-filled times, from the day the dialog was opened for. */
  defaults?: { startTime: string; endTime: string; name?: string };
  onSave: (draft: EventDraft, scope: Scope) => void;
  onClose: () => void;
  /** The week grid opens this twice as wide, so a seven-day row fits. */
  wide?: boolean;
}

export function EventModal({
  initial,
  recurring,
  defaults,
  onSave,
  onClose,
  wide,
}: EventModalProps) {
  const editing = Boolean(initial);

  const [name, setName] = useState(initial?.name ?? defaults?.name ?? '');
  const [startTime, setStartTime] = useState(initial?.startTime ?? defaults?.startTime ?? '');
  const [endTime, setEndTime] = useState(initial?.endTime ?? defaults?.endTime ?? '');
  const [recurrence, setRecurrence] = useState<RecurrenceType>('none');
  const [days, setDays] = useState<number[]>([]);
  const [scope, setScope] = useState<Scope>('one');
  const [showErrors, setShowErrors] = useState(false);

  // Escape closes, as it does on every other dialog in the app.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const missingName = !name.trim();
  const missingTimes = !startTime || !endTime;
  const badSpan = !missingTimes && spanMinutes(startTime, endTime) <= 0;
  const missingDays = recurrence !== 'none' && days.length === 0;

  const save = () => {
    if (missingName || missingTimes || badSpan || missingDays) {
      setShowErrors(true);
      return;
    }
    onSave(
      {
        name: name.trim(),
        startTime,
        endTime,
        recurrence: editing ? 'none' : recurrence,
        recurrenceDays: editing ? [] : days,
      },
      scope,
    );
  };

  return (
    <div
      className={`modal${wide ? ' from-week' : ''}`}
      style={{ display: 'block' }}
      role="dialog"
      aria-modal="true"
      aria-label={editing ? 'Edit event' : 'Add new event'}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h3>{editing ? 'Edit Section' : 'Add new section'}</h3>
          <span className="close-btn" role="button" tabIndex={0} onClick={onClose}>
            ×
          </span>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="timeframeName">Timeframe Name:</label>
            <input
              id="timeframeName"
              type="text"
              className={showErrors && missingName ? 'invalid-input' : ''}
              placeholder="e.g., Morning Workout"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>

          <TimePicker
            id="start"
            label="Start Time:"
            value={startTime}
            onChange={setStartTime}
            invalid={showErrors && (!startTime || badSpan)}
          />
          <TimePicker
            id="end"
            label="End Time:"
            value={endTime}
            onChange={setEndTime}
            invalid={showErrors && (!endTime || badSpan)}
          />

          {editing
            ? recurring && (
                <div className="form-group">
                  <label>Apply changes to:</label>
                  <div className="radio-group">
                    <label>
                      <input
                        type="radio"
                        name="eventEditScope"
                        checked={scope === 'one'}
                        onChange={() => setScope('one')}
                      />{' '}
                      This occurrence
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="eventEditScope"
                        checked={scope === 'all'}
                        onChange={() => setScope('all')}
                      />{' '}
                      All occurrences
                    </label>
                  </div>
                </div>
              )
            : (
              <RecurrencePicker
                name="recurrenceType"
                type={recurrence}
                days={days}
                onChange={(type, chosen) => {
                  setRecurrence(type);
                  setDays(chosen);
                }}
                invalid={showErrors && missingDays}
              />
            )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-confirm" onClick={save}>
            {editing ? 'Save Changes' : 'Add Section'}
          </button>
        </div>
      </div>
    </div>
  );
}
