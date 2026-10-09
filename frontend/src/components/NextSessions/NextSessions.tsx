/**
 * Three next sessions — for every subject at once, or one picked from a list.
 *
 * The subject page's Recommendations panel (components/Subject/NextSteps),
 * offered where there is no subject page behind it: at the foot of the
 * dashboard, above the quote, and on the analytics Recommendations tab, under
 * the projection chart. A model reads the finished work — every subject's,
 * or the one chosen — and suggests three exact sessions. Each can be planned
 * on its own ("Plan my next session") or all three at once ("Plan all 3"),
 * which books them one after another into the next free calendar slots.
 *
 * The brief is counted on the server from the tasks
 * (backend/tracking/next_sessions), since neither page has the figures the
 * subject page sends. The steps live in the same ledger as the subject
 * page's, so three suggested for Mathematics here are the three the
 * Mathematics page shows, and planning works the same way: the step is
 * locked to its task until the task is finished (done) or deleted (open).
 *
 * A booked session is written onto the shared task list at once
 * (utils/plannedTask), so the Tasks page and the calendar show it.
 *
 * Across every subject, a pill bar picks which subjects the three are drawn
 * from. It remembers the ones left out (in this browser, per account), so a
 * subject that gains work later is in by default.
 */
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext, UserDataContext } from '@/context/contexts';
import { NextSteps, BATCH } from '@/components/Subject/NextSteps';
import {
  nextSessions,
  planSession,
  suggestNextSessions,
  takeRecommendation,
  type NextStep,
  type SessionSubject,
  type SuggestedSession,
} from '@/services/analytics';
import { announceStatsChanged } from '@/utils/statsBus';
import { withPlannedTask } from '@/utils/plannedTask';
import '@/styles/subject-state.css';
import '@/styles/next-sessions.css';

export interface NextSessionsPanelProps {
  /** Which page it is on — only the heading's wording and the class change. */
  where: 'dashboard' | 'analytics';
}

/** Where the subjects left out of "All subjects" are remembered. */
const leftOutKey = (username: string) => `nsLeftOut:${username}`;

function readLeftOut(username: string | null): Set<string> {
  if (!username) return new Set();
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(leftOutKey(username)) || '[]');
    return new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeLeftOut(username: string, ids: Set<string>) {
  try {
    localStorage.setItem(leftOutKey(username), JSON.stringify([...ids]));
  } catch {
    /* Private window or blocked storage: the choice lasts the visit. */
  }
}

export function NextSessionsPanel({ where }: NextSessionsPanelProps) {
  /* Read without `useAuth`, which throws outside a provider: a page drawn
     with nobody signed in (or in a test of the page around it) simply has
     no panel. */
  const username = useContext(AuthContext)?.username ?? null;
  const shared = useContext(UserDataContext);
  const [subjectId, setSubjectId] = useState('');
  const [subjects, setSubjects] = useState<SessionSubject[]>([]);
  const [leftOut, setLeftOut] = useState<Set<string>>(() => readLeftOut(username));
  const [steps, setSteps] = useState<SuggestedSession[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  /** The step being planned or recorded. */
  const [busy, setBusy] = useState('');
  /** "Plan all" is working through the open steps. */
  const [all, setAll] = useState(false);
  const working = asking || all || busy !== '';
  const [error, setError] = useState('');

  useEffect(() => {
    if (!username) return undefined;
    let live = true;
    setLoading(true);
    setError('');
    void nextSessions(subjectId).then((result) => {
      if (!live) return;
      setLoading(false);
      if (!result.success) {
        setError(result.message || 'Could not read the suggested sessions.');
        setSteps([]);
        return;
      }
      setSteps(result.steps);
      setAvailable(result.available);
      // The picker keeps a subject it already lists even when this read is
      // of that subject, so choosing one never empties the list around it.
      if (result.subjects.length || !subjectId) setSubjects(result.subjects);
    });
    return () => {
      live = false;
    };
  }, [subjectId, username]);

  const status = useMemo(
    () => new Map(steps.map((step) => [step.id, { state: step.state, task: step.task }])),
    [steps],
  );
  const open = steps.filter((step) => step.state === 'open');
  const subjectName = subjectId ? subjects.find((one) => one.id === subjectId)?.name ?? 'this subject' : '';
  /** Across every subject, the ones the pills have on. */
  const included = subjects.filter((one) => !leftOut.has(one.id));
  const narrowed = !subjectId && included.length < subjects.length;

  const toggle = (id: string) => {
    setLeftOut((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (username) writeLeftOut(username, next);
      return next;
    });
  };

  const suggest = async () => {
    setAsking(true);
    setError('');
    const result = narrowed
      ? await suggestNextSessions('', included.map((one) => one.id))
      : await suggestNextSessions(subjectId);
    setAsking(false);
    if (!result.success) {
      setError(result.message || 'Could not suggest sessions. Try again.');
      return;
    }
    setSteps(result.steps);
  };

  /** Book one. Returns whether it was booked, for "Plan all". */
  const plan = useCallback(
    async (step: NextStep): Promise<boolean> => {
      const made = await planSession(step.id, subjectId);
      if (!made.success) {
        setError(made.message || 'Could not plan that session. Try again.');
        return false;
      }
      setSteps((was) => was.map((row) => (row.id === step.id ? { ...row, state: 'planned', task: made.task } : row)));
      shared?.mutate((current) => withPlannedTask(current, made.task, step.title, subjectId));
      return true;
    },
    [shared, subjectId],
  );

  const planOne = async (step: NextStep) => {
    if (working) return;
    setBusy(step.id);
    setError('');
    if (await plan(step)) announceStatsChanged();
    setBusy('');
  };

  /* One after another, not at once: each booking takes the next free slot,
     and the server can only see a slot as taken once the one before it is
     written. */
  const planAll = async () => {
    setAll(true);
    setError('');
    let booked = 0;
    for (const step of open) {
      setBusy(step.id);
      if (!(await plan(step))) break;
      booked += 1;
    }
    if (booked) announceStatsChanged();
    setBusy('');
    setAll(false);
  };

  const didIt = async (step: NextStep) => {
    if (working) return;
    setBusy(step.id);
    const result = await takeRecommendation(step.id);
    setBusy('');
    if (result.success) {
      setSteps((was) => was.map((row) => (row.id === step.id ? { ...row, state: 'done', task: null } : row)));
    }
  };

  if (!username) return null;

  const heading = where === 'dashboard' ? 'Your next sessions' : 'Next sessions';
  const scope = subjectId
    ? subjectName
    : narrowed
      ? included.length === 1
        ? included[0]!.name
        : 'the subjects chosen below'
      : 'all your subjects';

  return (
    <section className={`ns-panel ns-on-${where}`} aria-label={heading}>
      <header className="ns-head">
        <div className="ns-title">
          <h2>{heading}</h2>
          <p>
            Three study sessions chosen from the work you have finished in {scope}, each with
            what to do, how hard it is and how long it takes. Put one on your calendar, or all
            three at once.
          </p>
        </div>
        <label className="ns-pick">
          <span>Plan for</span>
          <select
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            disabled={working}
          >
            <option value="">All subjects</option>
            {subjects.map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {!subjectId && subjects.length > 1 && (
        <div className="ns-pills" role="group" aria-label="Subjects to include">
          {subjects.map((one) => {
            const on = !leftOut.has(one.id);
            return (
              <button
                key={one.id}
                type="button"
                className={`ns-pill${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => toggle(one.id)}
                disabled={working}
              >
                <span className="ns-pill-mark" aria-hidden="true">{on ? '✓' : '+'}</span>
                {one.name}
              </button>
            );
          })}
        </div>
      )}

      {available === false ? (
        <p className="ns-note">
          Suggesting sessions needs a model key. Add a free GROQ_API_KEY (or an ANTHROPIC_API_KEY)
          to .env and restart the server.
        </p>
      ) : (
        <div className="ns-actions">
          <button type="button" className="ns-btn is-primary" onClick={() => void suggest()} disabled={working || loading || (!subjectId && subjects.length > 0 && !included.length)}>
            {asking ? 'Thinking…' : steps.length ? `Suggest ${BATCH} different ones` : `Suggest ${BATCH} sessions`}
          </button>
          {open.length > 0 && (
            <button type="button" className="ns-btn" onClick={() => void planAll()} disabled={working}>
              {all ? 'Adding to calendar…' : open.length === BATCH ? `Plan all ${BATCH}` : `Plan the other ${open.length}`}
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="ns-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="ns-note">Reading what has been suggested…</p>
      ) : steps.length > 0 ? (
        <NextSteps
          steps={steps}
          status={status}
          busy={busy}
          onPlan={(step) => void planOne(step)}
          onDidIt={(step) => void didIt(step)}
        />
      ) : (
        available !== false && (
          <p className="ns-note">
            Nothing suggested {subjectId ? `for ${subjectName} ` : ''}yet. Press Suggest {BATCH} sessions
            and three will be picked from your recent work.
          </p>
        )
      )}
    </section>
  );
}
