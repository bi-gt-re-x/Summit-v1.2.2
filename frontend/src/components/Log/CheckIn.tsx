/**
 * How's today: the Log's check-in row.
 *
 * Five moods and three energy levels, each one tap, tapped again to clear.
 * Optional, and nothing is assumed when it's skipped: Analytics reads the
 * entry's own words instead and says so (backend/tracking/mood.py). The
 * reader's tap always wins over the words.
 */
import { Annoyed, BatteryFull, BatteryLow, BatteryMedium, Frown, Laugh, Meh, Smile } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const MOODS: Array<{ value: number; label: string; icon: LucideIcon }> = [
  { value: 1, label: 'Rough', icon: Frown },
  { value: 2, label: 'Low', icon: Annoyed },
  { value: 3, label: 'Okay', icon: Meh },
  { value: 4, label: 'Good', icon: Smile },
  { value: 5, label: 'Great', icon: Laugh },
];

export const ENERGIES: Array<{ value: number; label: string; icon: LucideIcon }> = [
  { value: 1, label: 'Drained', icon: BatteryLow },
  { value: 2, label: 'Steady', icon: BatteryMedium },
  { value: 3, label: 'Charged', icon: BatteryFull },
];

/** The face for a stored mood, for the entry list. */
export function moodOf(value: number | null | undefined) {
  return MOODS.find((mood) => mood.value === value) ?? null;
}

export function CheckIn({
  mood,
  energy,
  onChange,
}: {
  mood: number | null;
  energy: number | null;
  onChange: (next: { mood?: number | null; energy?: number | null }) => void;
}) {
  return (
    <div className="lg-checkin" role="group" aria-label="How's today?">
      <span className="lg-checkin-ask">How's today?</span>
      <div className="lg-checkin-row" role="radiogroup" aria-label="Mood">
        {MOODS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mood === value}
            className={`lg-mood is-m${value}${mood === value ? ' is-on' : ''}`}
            title={mood === value ? `${label} (tap again to clear)` : label}
            onClick={() => onChange({ mood: mood === value ? null : value })}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="lg-checkin-row is-energy" role="radiogroup" aria-label="Energy">
        {ENERGIES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={energy === value}
            className={`lg-energy${energy === value ? ' is-on' : ''}`}
            title={energy === value ? `${label} (tap again to clear)` : label}
            onClick={() => onChange({ energy: energy === value ? null : value })}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

