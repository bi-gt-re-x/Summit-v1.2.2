/**
 * "No recurrence / days of week / days of month", and the days themselves.
 *
 * Shared by the event dialog and the task dialog, which asked the same
 * question in two nearly-identical copies of the same markup. The horizon —
 * twelve months — is the store's, and the note says so because a repeat that
 * quietly stops a year out is worse than one that says it will.
 */
import type { RecurrenceType } from '@/utils/calendarStore';

export interface RecurrencePickerProps {
  type: RecurrenceType;
  days: number[];
  onChange: (type: RecurrenceType, days: number[]) => void;
  /** Distinguishes the two dialogs' radio groups when both are in the DOM. */
  name: string;
  /** Set when a repeat was asked for and no day was chosen. */
  invalid?: boolean;
}

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function RecurrencePicker({
  type,
  days,
  onChange,
  name,
  invalid,
}: RecurrencePickerProps) {
  const toggle = (day: number) =>
    onChange(
      type,
      days.includes(day) ? days.filter((other) => other !== day) : [...days, day],
    );

  return (
    <>
      <div className="form-group">
        <label>Repeat</label>
        <p className="recurrence-note">Repeats for the next 12 months</p>
        <div className="radio-group">
          {(
            [
              ['none', "Doesn't repeat"],
              ['weekly', 'Days of week'],
              ['monthly', 'Days of month'],
            ] as Array<[RecurrenceType, string]>
          ).map(([value, text]) => (
            <label key={value}>
              <input
                type="radio"
                name={name}
                value={value}
                checked={type === value}
                onChange={() => onChange(value, [])}
              />{' '}
              {text}
            </label>
          ))}
        </div>
      </div>

      {type === 'weekly' && (
        <div className={`form-group${invalid ? ' invalid-input' : ''}`}>
          <label>Which days of the week</label>
          <div className="checkbox-group">
            {WEEKDAYS.map((weekday, index) => (
              <label key={weekday}>
                <input
                  type="checkbox"
                  checked={days.includes(index)}
                  onChange={() => toggle(index)}
                />{' '}
                {weekday}
              </label>
            ))}
          </div>
        </div>
      )}

      {type === 'monthly' && (
        <div className={`form-group${invalid ? ' invalid-input' : ''}`}>
          <label>Which days of the month</label>
          {/* A number is not a weekday name. `is-numeric` packs the columns to
              the width of "31" instead of the width of "Wednesday", so
              thirty-one of them are four rows rather than eight. */}
          <div className="checkbox-group is-numeric">
            {MONTH_DAYS.map((day) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={days.includes(day)}
                  onChange={() => toggle(day)}
                />{' '}
                {day}
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
