/**
 * One pattern: what it is, how often it comes up, whether it comes back, the fix, whether
 * the fix worked, and where it stands, with the sessions behind each figure as dots.
 *
 * The figures are worked out on the server (backend/tracking/behavior.py). This draws
 * them, and holds the four things you do to a pattern: log a session, start or end a
 * fix, mark it resolved, and edit or put it away.
 */
import { Check, CircleDot, Flag, Pencil, Plus, RotateCcw, Trash2, Wrench, X } from 'lucide-react';
import { useState } from 'react';
import { behavior as service } from '@/services';
import type { Behavior, BehaviorStatus } from '@/services/behavior';
import { Compare, beforeAfter } from './Compare';
import { FixPicker } from './FixPicker';
import { PatternForm, type PatternFields } from './PatternForm';

const STAGES: { key: BehaviorStatus; label: string }[] = [
  { key: 'identified', label: 'Identified' },
  { key: 'intervening', label: 'Intervening' },
  { key: 'improving', label: 'Improving' },
  { key: 'resolved', label: 'Resolved' },
];

type Mode = null | 'log' | 'fix' | 'end' | 'edit' | 'delete';

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** What the stage means for this pattern, in a line. */
function stageWhy(one: Behavior): string {
  if (one.status === 'resolved') return one.resolved_label ? `You called it done on ${one.resolved_label}.` : 'You called it done.';
  if (one.returned_label) return `It came back on ${one.returned_label}, after you marked it resolved.`;
  if (one.status === 'identified') return 'Named, with no fix yet. Knowing is the first step, not the last.';
  if (one.status === 'improving') return 'The fix is running and it comes up less.';
  return "The fix is running. It's too early, or it isn't coming up less yet.";
}

export function PatternCard({ one, onChanged, subjects }: {
  one: Behavior;
  onChanged: () => void;
  subjects: { id: string; name: string }[];
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const stage = STAGES.findIndex((row) => row.key === one.status);

  /** Run a change, then read the page again. */
  const act = async (run: () => Promise<{ success: boolean; message?: string }>) => {
    setBusy(true);
    setProblem(null);
    try {
      const result = await run();
      if (!result.success) {
        setProblem(result.message || "That didn't save. Try it again.");
        return;
      }
      setMode(null);
      onChanged();
    } catch {
      setProblem("Couldn't reach the server. Nothing changed.");
    } finally {
      setBusy(false);
    }
  };

  const effect = one.effect;
  return (
    <article className={`bh-card is-${one.status}`} aria-labelledby={`bh-title-${one.id}`}>
      <header className="bh-card-head">
        <div className="bh-card-name">
          <h3 id={`bh-title-${one.id}`}>{one.title}</h3>
          <p className="bh-card-meta">
            <span className="bh-chip">{one.scope_label}</span>
            <span>{one.source_label}</span>
            <span>Named {one.identified_label}</span>
            {one.came_back > 0 && <span className="bh-chip is-bad">Came back {one.came_back === 1 ? 'once' : `${one.came_back} times`}</span>}
          </p>
          {one.detail && <p className="bh-card-detail">{one.detail}</p>}
        </div>
        <ol className="bh-stages" aria-label={`Stage: ${one.status_label}`}>
          {STAGES.map((row, at) => (
            <li key={row.key} className={at < stage ? 'is-past' : at === stage ? 'is-now' : undefined}
              aria-current={at === stage ? 'step' : undefined}>
              <span className="bh-stage-dot" aria-hidden="true" />
              <span className="bh-stage-word">{row.label}</span>
            </li>
          ))}
        </ol>
      </header>

      <dl className="bh-metrics">
        <div>
          <dt>How often</dt>
          <dd>
            <b>{one.frequency.times === 1 ? '1 time' : `${one.frequency.times} times`}</b>
            <small>{one.frequency.checked
              ? `in ${one.frequency.sessions} of ${one.frequency.checked} checked sessions, last ${one.frequency.days} days`
              : `no checked sessions in the last ${one.frequency.days} days`}</small>
          </dd>
        </div>
        <div>
          <dt>Comes back</dt>
          <dd>
            {one.recurrence ? (
              <>
                <b>{one.recurrence.percent}%</b>
                <small>{one.recurrence.hits} of {one.recurrence.of} sessions since you named it</small>
              </>
            ) : (
              <>
                <b>Not yet checked</b>
                <small>Log a session or answer the question after a task</small>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Fix</dt>
          <dd>
            {one.fix ? (
              <>
                <b>{one.fix.title}</b>
                <small>
                  Since {one.fix.started_label}
                  {one.fix.used && one.fix.used.of > 0 && `, done in ${one.fix.used.done} of ${one.fix.used.of} sessions`}
                </small>
              </>
            ) : (
              <>
                <b>None yet</b>
                <small>Pick one to try</small>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Did it work</dt>
          <dd>
            {effect ? (
              <>
                <b className={`bh-tone is-${effect.tone}`}>{effect.headline}</b>
                <small>{effect.evidence ? effect.evidence : effect.tip}</small>
              </>
            ) : (
              <>
                <b>Nothing to judge</b>
                <small>Start a fix to find out</small>
              </>
            )}
          </dd>
        </div>
      </dl>

      <p className="bh-stage-why">{stageWhy(one)}</p>

      {effect && one.fix && (effect.before.of > 0 || effect.during.of > 0) && (
        <section className="bh-block" aria-label="Before the fix and since">
          <h4>Before the fix and since</h4>
          <Compare chart={beforeAfter(effect.before, effect.during, one.fix.started_label)} label="How often it came up" />
          {effect.tip && effect.evidence && <p className="bh-note">{effect.tip}</p>}
          {effect.split && <p className="bh-note">{effect.split.line}{effect.split.evidence ? ` (${effect.split.evidence.toLowerCase()})` : ''}</p>}
        </section>
      )}

      <section className="bh-block" aria-label="When it shows up">
        <h4>When it shows up</h4>
        {one.when.found ? (
          <>
            <p className="bh-line">{one.when.found.line}</p>
            <Compare chart={one.when.found.chart} label="When it shows up" />
            {one.when.found.suggests && <p className="bh-suggest">{one.when.found.suggests}</p>}
          </>
        ) : (
          <p className="bh-note">
            {one.when.need > 0
              ? `${one.when.need} more checked ${one.when.need === 1 ? 'session' : 'sessions'} with a task or a name behind ${one.when.need === 1 ? 'it' : 'them'}, and Summit can start to see when it shows up.`
              : "Nothing stands out yet. It comes up about as often whatever the session's like."}
          </p>
        )}
        {one.when.quiet.length > 0 && (
          <p className="bh-note">Doesn&apos;t seem to matter: {one.when.quiet.join(', ')}.</p>
        )}
      </section>

      {one.recent.length > 0 && (
        <section className="bh-block" aria-label="Recent sessions">
          <h4>Recent sessions</h4>
          <ol className="bh-dots">
            {one.recent.map((dot, at) => {
              const what = dot.times > 0 ? `happened${dot.times > 1 ? ` ${dot.times} times` : ''}` : 'clean';
              const used = dot.used === null ? '' : dot.used ? ', fix done' : ', fix skipped';
              const name = `${dot.day_label}${dot.label ? `: ${dot.label}` : ''}, ${what}${used}`;
              return (
                <li key={`${dot.day}-${at}`} className={`bh-dot ${dot.times > 0 ? 'is-hit' : 'is-clean'}${dot.used ? ' is-used' : ''}`}
                  title={name} aria-label={name}>
                  {dot.times > 1 ? dot.times : ''}
                </li>
              );
            })}
          </ol>
          <p className="bh-legend">
            <span className="bh-dot is-hit" aria-hidden="true" /> It happened
            <span className="bh-dot is-clean" aria-hidden="true" /> Clean
            <span className="bh-dot is-clean is-used" aria-hidden="true" /> Fix done
            {one.from_record && <span className="bh-legend-note">Also read from your tasks</span>}
          </p>
        </section>
      )}

      {one.ready_to_resolve && one.status !== 'resolved' && mode === null && (
        <div className="bh-ready" role="status">
          <Check aria-hidden="true" />
          <span>It&apos;s been clean for every recent session since the fix. Call it resolved? If it comes back, Summit opens it again.</span>
          <button type="button" className="bh-btn is-primary" disabled={busy} onClick={() => void act(() => service.setStatus(one.id, 'resolved'))}>
            Mark resolved
          </button>
        </div>
      )}

      {problem && <p className="bh-problem" role="alert">{problem}</p>}

      {mode === 'log' && <LogSession one={one} busy={busy} onCancel={() => setMode(null)}
        onSave={(session) => void act(() => service.logSession({ ...session, behavior_id: one.id }))} />}
      {mode === 'fix' && <FixPicker fixes={one.fixes} busy={busy} replacing={one.fix?.title ?? null}
        onCancel={() => setMode(null)} onStart={(fix) => fix && void act(() => service.startFix(one.id, fix.title, fix.how))} />}
      {mode === 'end' && one.fix && (
        <div className="bh-form" role="group" aria-label="End the fix">
          <p className="bh-form-lead">Stop &ldquo;{one.fix.title}&rdquo;?</p>
          <div className="bh-row">
            <button type="button" className="bh-btn" disabled={busy} onClick={() => void act(() => service.endFix(one.id, 'kept'))}>
              It helped, I&apos;ll keep doing it
            </button>
            <button type="button" className="bh-btn" disabled={busy} onClick={() => void act(() => service.endFix(one.id, 'dropped'))}>
              Drop it
            </button>
            <button type="button" className="bh-btn is-quiet" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </div>
      )}
      {mode === 'edit' && (
        <PatternForm
          heading="Edit this pattern"
          submit="Save"
          busy={busy}
          subjects={subjects}
          start={{ title: one.title, detail: one.detail, scope: one.scope, subject: one.subject, words: one.words.join(', ') }}
          onCancel={() => setMode(null)}
          onSubmit={(fields: PatternFields) => void act(() => service.update(one.id, {
            title: fields.title, detail: fields.detail, scope: fields.scope, subject: fields.subject,
            words: fields.words.split(',').map((word) => word.trim()).filter(Boolean),
          }))}
        />
      )}
      {mode === 'delete' && (
        <div className="bh-form is-danger" role="alertdialog" aria-label="Delete this pattern">
          <p className="bh-form-lead">
            Delete &ldquo;{one.title}&rdquo; and its {one.checks === 1 ? 'session' : `${one.checks} sessions`}? This can&apos;t be undone.
            Archive it instead to keep the record.
          </p>
          <div className="bh-row">
            <button type="button" className="bh-btn is-danger" disabled={busy} onClick={() => void act(() => service.remove(one.id))}>Delete it</button>
            <button type="button" className="bh-btn" disabled={busy} onClick={() => void act(() => service.setStatus(one.id, 'archived'))}>Archive instead</button>
            <button type="button" className="bh-btn is-quiet" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </div>
      )}

      {mode === null && (
        <div className="bh-actions">
          <button type="button" className="bh-btn is-primary" onClick={() => setMode('log')}>
            <Plus aria-hidden="true" /> Log a session
          </button>
          {one.status !== 'resolved' && (
            <button type="button" className="bh-btn" onClick={() => setMode('fix')}>
              <Wrench aria-hidden="true" /> {one.fix ? 'Try a different fix' : 'Start a fix'}
            </button>
          )}
          {one.fix && <button type="button" className="bh-btn is-quiet" onClick={() => setMode('end')}>
            <X aria-hidden="true" /> End the fix
          </button>}
          {one.status === 'resolved' ? (
            <button type="button" className="bh-btn is-quiet" disabled={busy} onClick={() => void act(() => service.setStatus(one.id, 'open'))}>
              <RotateCcw aria-hidden="true" /> Open it again
            </button>
          ) : !one.ready_to_resolve && (
            <button type="button" className="bh-btn is-quiet" disabled={busy} onClick={() => void act(() => service.setStatus(one.id, 'resolved'))}>
              <Flag aria-hidden="true" /> Mark resolved
            </button>
          )}
          <span className="bh-actions-end">
            <button type="button" className="bh-icon" aria-label={`Edit ${one.title}`} title="Edit" onClick={() => setMode('edit')}>
              <Pencil aria-hidden="true" />
            </button>
            <button type="button" className="bh-icon" aria-label={`Delete ${one.title}`} title="Delete or archive" onClick={() => setMode('delete')}>
              <Trash2 aria-hidden="true" />
            </button>
          </span>
        </div>
      )}

      {one.past_fixes.length > 0 && (
        <details className="bh-past">
          <summary>{one.past_fixes.length === 1 ? '1 fix tried before' : `${one.past_fixes.length} fixes tried before`}</summary>
          <ul>
            {one.past_fixes.map((fix) => (
              <li key={fix.id}>
                <b>{fix.title}</b>
                <span>{fix.started_label} to {fix.ended_label}. {fix.headline}.{' '}
                  {fix.outcome === 'kept' ? 'You kept it.' : fix.outcome === 'dropped' ? 'You dropped it.' : fix.outcome === 'replaced' ? 'Replaced by the next one.' : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

/** One session logged by hand: what it was, when, whether it happened and how often. */
function LogSession({ one, busy, onSave, onCancel }: {
  one: Behavior;
  busy: boolean;
  onSave: (session: { day: string; times: number; used: boolean | null; label: string }) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState('');
  const [day, setDay] = useState(today());
  const [happened, setHappened] = useState<boolean | null>(null);
  const [times, setTimes] = useState(1);
  const [used, setUsed] = useState<boolean | null>(null);
  return (
    <form
      className="bh-form"
      aria-label="Log a session"
      onSubmit={(event) => {
        event.preventDefault();
        if (happened === null) return;
        onSave({ day, times: happened ? times : 0, used: one.fix ? used : null, label });
      }}
    >
      <p className="bh-form-lead">A session where &ldquo;{one.title}&rdquo; could have happened.</p>
      <div className="bh-row">
        <label className="bh-field is-grow">
          What was it?
          <input value={label} maxLength={80} placeholder="AMC 10 mock, school quiz, practice set" onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label className="bh-field">
          When
          <input type="date" value={day} max={today()} onChange={(event) => setDay(event.target.value)} />
        </label>
      </div>
      <fieldset className="bh-choice">
        <legend>Did it happen?</legend>
        <button type="button" aria-pressed={happened === false} onClick={() => setHappened(false)}>No, it was clean</button>
        <button type="button" aria-pressed={happened === true} onClick={() => setHappened(true)}>Yes</button>
        {happened && (
          <label className="bh-times">
            How many times
            <input type="number" min={1} max={50} value={times} onChange={(event) => setTimes(Math.max(1, Math.min(50, Number(event.target.value) || 1)))} />
          </label>
        )}
      </fieldset>
      {one.fix && (
        <fieldset className="bh-choice">
          <legend>Did you do &ldquo;{one.fix.title}&rdquo;?</legend>
          <button type="button" aria-pressed={used === true} onClick={() => setUsed(used === true ? null : true)}>Yes</button>
          <button type="button" aria-pressed={used === false} onClick={() => setUsed(used === false ? null : false)}>No</button>
        </fieldset>
      )}
      <div className="bh-row">
        <button type="submit" className="bh-btn is-primary" disabled={busy || happened === null}>
          <CircleDot aria-hidden="true" /> Save the session
        </button>
        <button type="button" className="bh-btn is-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
