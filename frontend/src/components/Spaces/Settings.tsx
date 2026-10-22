/**
 * The controls a block's settings are made of: a row of choices, a row of
 * numbers, and a row of things to tick. Shared by live blocks (./LiveBlock)
 * and panel blocks (./PanelBlock), so a setting looks and works the same
 * whichever kind of block it is on.
 */

/** A row of buttons, one per choice, the chosen one pressed. */
export function Words({ label, value, choices, name, onPick }: {
  label: string;
  value: string;
  choices: readonly string[];
  name: (choice: string) => string;
  onPick: (choice: string) => void;
}) {
  return (
    <div className="sp-live-field">
      {label}
      <div className="sp-chart-kinds" role="radiogroup" aria-label={label}>
        {choices.map((choice) => (
          <button key={choice} type="button" role="radio" aria-checked={value === choice} className="sp-chart-kind" onClick={() => onPick(choice)}>
            {name(choice)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The same, for numbers. */
export function Choice({ label, value, choices, onPick, name = String }: {
  label: string;
  value: number;
  choices: readonly number[];
  onPick: (n: number) => void;
  name?: (n: number) => string;
}) {
  return (
    <Words label={label} value={String(value)} choices={choices.map(String)} name={(n) => name(Number(n))} onPick={(n) => onPick(Number(n))} />
  );
}

/**
 * A row of things to tick, any number of them. `atLeast` keeps the last one
 * from being unticked: a chart with no lines or a panel with no parts reads as
 * broken rather than as emptied.
 */
export function Ticks({ label, value, choices, name, onPick, atLeast = 0, hint }: {
  label: string;
  value: readonly string[];
  choices: readonly string[];
  name: (choice: string) => string;
  onPick: (next: string[]) => void;
  atLeast?: number;
  hint?: string;
}) {
  const toggle = (choice: string) => {
    const on = value.includes(choice);
    if (on && value.length <= atLeast) return;
    // Kept in the order the choices are listed, whatever order they were ticked.
    onPick(choices.filter((one) => (one === choice ? !on : value.includes(one))));
  };
  return (
    <div className="sp-live-field">
      {label}
      {hint && <span className="sp-live-field-hint">{hint}</span>}
      <div className="sp-chart-kinds sp-ticks" role="group" aria-label={label}>
        {choices.map((choice) => {
          const on = value.includes(choice);
          return (
            <button key={choice} type="button" aria-pressed={on} className={`sp-chart-kind sp-tick${on ? ' is-on' : ''}`} onClick={() => toggle(choice)}>
              <span className="sp-tick-box" aria-hidden="true">{on ? '✓' : ''}</span>
              {name(choice)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
