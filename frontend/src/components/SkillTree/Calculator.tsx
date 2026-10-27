/**
 * The calculator a problem can offer (`aids.tools` includes 'calculator').
 *
 * A scientific one, because the problems that need it are trig, logs and
 * square roots, not shopping. Type into it or tap the keys; Enter works it out
 * and "Use" drops the result into the answer box. The arithmetic is
 * utils/calc, which parses rather than evals, so nothing typed here runs.
 *
 * Its keys stop at the panel: Enter here works out the line rather than
 * submitting the answer, and Escape clears the line rather than closing the
 * check.
 */
import { useRef, useState } from 'react';
import { CalcError, evaluate, formatResult } from '@/utils/calc';
import '@/styles/problemaids.css';

interface Key {
  label: string;
  /** What the key types. Absent for the keys that do something instead. */
  insert?: string;
  action?: 'clear' | 'back' | 'equals';
  wide?: boolean;
  kind?: 'fn' | 'op' | 'eq';
}

const KEYS: Key[] = [
  { label: 'sin', insert: 'sin(', kind: 'fn' },
  { label: 'cos', insert: 'cos(', kind: 'fn' },
  { label: 'tan', insert: 'tan(', kind: 'fn' },
  { label: '(', insert: '(', kind: 'fn' },
  { label: ')', insert: ')', kind: 'fn' },
  { label: '⌫', action: 'back', kind: 'fn' },
  { label: 'sin⁻¹', insert: 'asin(', kind: 'fn' },
  { label: 'cos⁻¹', insert: 'acos(', kind: 'fn' },
  { label: 'tan⁻¹', insert: 'atan(', kind: 'fn' },
  { label: 'xʸ', insert: '^', kind: 'fn' },
  { label: '√', insert: 'sqrt(', kind: 'fn' },
  { label: 'C', action: 'clear', kind: 'fn' },
  { label: '7', insert: '7' },
  { label: '8', insert: '8' },
  { label: '9', insert: '9' },
  { label: '÷', insert: '/', kind: 'op' },
  { label: 'π', insert: 'pi', kind: 'fn' },
  { label: 'ln', insert: 'ln(', kind: 'fn' },
  { label: '4', insert: '4' },
  { label: '5', insert: '5' },
  { label: '6', insert: '6' },
  { label: '×', insert: '*', kind: 'op' },
  { label: 'e', insert: 'e', kind: 'fn' },
  { label: 'log', insert: 'log(', kind: 'fn' },
  { label: '1', insert: '1' },
  { label: '2', insert: '2' },
  { label: '3', insert: '3' },
  { label: '−', insert: '-', kind: 'op' },
  { label: 'x²', insert: '^2', kind: 'fn' },
  { label: 'ans', insert: 'ans', kind: 'fn' },
  { label: '0', insert: '0' },
  { label: '.', insert: '.' },
  { label: 'n!', insert: '!', kind: 'fn' },
  { label: '+', insert: '+', kind: 'op' },
  { label: '=', action: 'equals', wide: true, kind: 'eq' },
];

/** What a key is read out as, where its face is a symbol. */
const SPOKEN: Record<string, string> = {
  '⌫': 'Delete',
  'sin⁻¹': 'inverse sine',
  'cos⁻¹': 'inverse cosine',
  'tan⁻¹': 'inverse tangent',
  'xʸ': 'power',
  '√': 'square root',
  C: 'Clear',
  '÷': 'divide',
  '×': 'times',
  '−': 'minus',
  'x²': 'squared',
  'n!': 'factorial',
};

export function Calculator({ onUse, onClose }: { onUse?: (value: string) => void; onClose?: () => void }) {
  const [line, setLine] = useState('');
  const [degrees, setDegrees] = useState(true);
  const [result, setResult] = useState<{ text: string; value: number | null } | null>(null);
  const [tape, setTape] = useState<{ line: string; text: string }[]>([]);
  const [ans, setAns] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const type = (text: string) => {
    const field = input.current;
    const start = field?.selectionStart ?? line.length;
    const end = field?.selectionEnd ?? line.length;
    const next = line.slice(0, start) + text + line.slice(end);
    setLine(next);
    setResult(null);
    requestAnimationFrame(() => {
      field?.focus();
      const caret = start + text.length;
      field?.setSelectionRange(caret, caret);
    });
  };

  const equals = () => {
    if (!line.trim()) return;
    try {
      const value = evaluate(line, { degrees, ans });
      const text = formatResult(value);
      setResult({ text, value: Number.isFinite(value) ? value : null });
      if (Number.isFinite(value)) {
        setAns(value);
        setTape((was) => [{ line, text }, ...was].slice(0, 3));
      }
    } catch (error) {
      setResult({ text: error instanceof CalcError ? error.message : "That didn't work out.", value: null });
    }
  };

  const press = (key: Key) => {
    if (key.action === 'clear') {
      setLine('');
      setResult(null);
      input.current?.focus();
    } else if (key.action === 'back') {
      const field = input.current;
      const start = field?.selectionStart ?? line.length;
      const end = field?.selectionEnd ?? line.length;
      const from = start === end ? Math.max(0, start - 1) : start;
      setLine(line.slice(0, from) + line.slice(end));
      setResult(null);
      requestAnimationFrame(() => {
        field?.focus();
        field?.setSelectionRange(from, from);
      });
    } else if (key.action === 'equals') {
      equals();
    } else if (key.insert) {
      type(key.insert);
    }
  };

  return (
    <section className="pcalc" aria-label="Calculator">
      <header className="pcalc-head">
        <span className="pcalc-title">Calculator</span>
        <div className="pcalc-mode" role="group" aria-label="Angle unit">
          <button type="button" className={degrees ? 'is-on' : ''} aria-pressed={degrees} onClick={() => setDegrees(true)}>
            DEG
          </button>
          <button type="button" className={degrees ? '' : 'is-on'} aria-pressed={!degrees} onClick={() => setDegrees(false)}>
            RAD
          </button>
        </div>
        {onClose && (
          <button type="button" className="pcalc-close" aria-label="Close the calculator" onClick={onClose}>
            ×
          </button>
        )}
      </header>
      {tape.length > 0 && (
        <ol className="pcalc-tape" aria-label="Recent results">
          {tape
            .slice()
            .reverse()
            .map((row, at) => (
              <li key={at}>
                <span>{row.line}</span> = <b>{row.text}</b>
              </li>
            ))}
        </ol>
      )}
      <input
        ref={input}
        className="pcalc-line"
        value={line}
        aria-label="Expression"
        placeholder="e.g. 12 sin(35)"
        autoComplete="off"
        spellCheck={false}
        inputMode="decimal"
        onChange={(event) => {
          setLine(event.target.value);
          setResult(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            equals();
          } else if (event.key === 'Escape') {
            event.stopPropagation();
            setLine('');
            setResult(null);
          }
        }}
      />
      <div className={`pcalc-result ${result && result.value === null ? 'is-error' : ''}`} aria-live="polite">
        {result ? (
          <>
            <span>{result.value === null ? result.text : `= ${result.text}`}</span>
            {onUse && result.value !== null && (
              <button type="button" className="pcalc-use" onClick={() => onUse(result.text)}>
                Use
              </button>
            )}
          </>
        ) : (
          <span className="pcalc-quiet">{degrees ? 'Trig in degrees' : 'Trig in radians'}</span>
        )}
      </div>
      <div className="pcalc-keys">
        {KEYS.map((key) => (
          <button
            key={key.label}
            type="button"
            className={`pcalc-key ${key.kind ? `is-${key.kind}` : ''} ${key.wide ? 'is-wide' : ''}`}
            aria-label={SPOKEN[key.label] ?? key.label}
            onClick={() => press(key)}
          >
            {key.label}
          </button>
        ))}
      </div>
    </section>
  );
}
