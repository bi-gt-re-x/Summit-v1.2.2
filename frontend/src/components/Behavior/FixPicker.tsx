/**
 * Picking a fix for a pattern: the ones that fit it (ranked by the words in its name,
 * from the library in shared/rules.json), or one in your own words.
 */
import { Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Fix } from '@/services/behavior';

/** Pick a fix: the ones that fit this pattern, or your own. */
export function FixPicker({ fixes, busy, replacing, onStart, onCancel, compact = false, start = 0 }: {
  fixes: Fix[];
  busy: boolean;
  replacing: string | null;
  /** Full form: the Start button. Compact (inside the add form): every change of choice. */
  onStart: (fix: Fix | null) => void;
  onCancel?: () => void;
  compact?: boolean;
  /** Which suggestion starts picked; null for none. */
  start?: number | null;
}) {
  /* By title, not position: the list reorders as the pattern's name is typed. */
  const [picked, setPicked] = useState<string | 'own' | null>(
    fixes.length ? (start === null ? null : fixes[start]?.title ?? null) : 'own');
  const [title, setTitle] = useState('');
  const [how, setHow] = useState('');
  const chosen = picked === 'own' ? { title: title.trim(), how: how.trim() }
    : picked === null ? null : fixes.find((fix) => fix.title === picked) ?? null;
  const key = chosen ? `${chosen.title}|${chosen.how}` : '';
  useEffect(() => {
    if (compact) onStart(chosen && chosen.title ? chosen : null);
    // Reported when the choice changes, not on every render of the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, key]);
  return (
    <div className={`bh-form${compact ? ' is-compact' : ''}`} role="group" aria-label="Pick a fix">
      {!compact && (
        <p className="bh-form-lead">
          {replacing ? `This replaces "${replacing}". Summit keeps how that one went.` : 'Pick one thing to do differently, every session it can show up in.'}
        </p>
      )}
      <ul className="bh-fixes">
        {fixes.map((fix) => (
          <li key={fix.title}>
            <button type="button" aria-pressed={picked === fix.title}
              onClick={() => setPicked(compact && picked === fix.title ? null : fix.title)}>
              <b>{fix.title}</b>
              <span>{fix.how}</span>
            </button>
          </li>
        ))}
        <li>
          <button type="button" aria-pressed={picked === 'own'} onClick={() => setPicked(compact && picked === 'own' ? null : 'own')}>
            <b>Write your own</b>
            <span>A rule you&apos;ll follow every time, in your words.</span>
          </button>
        </li>
      </ul>
      {picked === 'own' && (
        <div className="bh-row">
          <label className="bh-field is-grow">
            The fix
            <input value={title} maxLength={120} placeholder="Circle the question's last line before answering" onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="bh-field is-grow">
            How you&apos;ll do it
            <input value={how} maxLength={300} placeholder="Every problem, before I write an answer down" onChange={(event) => setHow(event.target.value)} />
          </label>
        </div>
      )}
      {!compact && (
        <div className="bh-row">
          <button type="button" className="bh-btn is-primary" disabled={busy || !chosen || !chosen.title}
            onClick={() => chosen && chosen.title && onStart(chosen)}>
            <Wrench aria-hidden="true" /> Start this fix
          </button>
          {onCancel && <button type="button" className="bh-btn is-quiet" onClick={onCancel}>Cancel</button>}
        </div>
      )}
    </div>
  );
}
