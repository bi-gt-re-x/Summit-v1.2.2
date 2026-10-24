/**
 * What to review: three review sessions, above Next sessions on the
 * Recommendations tab.
 *
 * Next sessions' twin, pointed backwards. A model reads the work that's due
 * for another look (finished about 1, 3, 7, 14 or 30 days ago, went badly, or
 * hard and never revisited; backend/tracking/review_sessions.py) and writes
 * three exact sessions on the same planning rules: what to do, how hard, how
 * long, a timed plan and a way to check it went well. Each can be booked on
 * its own or all three at once, into the next free calendar slots.
 *
 * A row of pills picks the subject: all of them, or one. The sessions are
 * kept per pick on the server, under their own ledger key, so this panel and
 * Next sessions never show each other's three.
 */
import { useCallback, useContext, useEffect, useState } from 'react';
import { AuthContext, UserDataContext } from '@/context/contexts';
import { NextSteps, BATCH } from '@/components/Subject/NextSteps';
import {
  planSession,
  reviewSessions,
  suggestReviewSessions,
  takeRecommendation,
  type NextStep,
  type SessionSubject,
  type SuggestedSession,
} from '@/services/analytics';
import { announceStatsChanged } from '@/utils/statsBus';
import { withPlannedTask } from '@/utils/plannedTask';
import '@/styles/subject-state.css';
import '@/styles/next-sessions.css';

export function WhatToReviewPanel() {
  const username = useContext(AuthContext)?.username ?? null;
  const shared = useContext(UserDataContext);
  const [subjectId, setSubjectId] = useState('');
  const [subjects, setSubjects] = useState<SessionSubject[]>([]);
  const [steps, setSteps] = useState<SuggestedSession[]>([]);
  const [due, setDue] = useState(0);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState('');
  const [all, setAll] = useState(false);
  const [error, setError] = useState('');
  const working = asking || all || busy !== '';

  useEffect(() => {
    if (!username) return undefined;
    let live = true;
    setLoading(true);
    setError('');
    void reviewSessions(subjectId).then((result) => {
      if (!live) return;
      setLoading(false);
      if (!result.success) {
        setError(result.message || "Couldn't load your review sessions.");
        setSteps([]);
        return;
      }
      setSteps(result.steps);
      setDue(result.due);
      setAvailable(result.available);
      if (result.subjects.length || !subjectId) setSubjects(result.subjects);
    });
    return () => {
      live = false;
    };
  }, [subjectId, username]);

  const status = new Map(steps.map((step) => [step.id, { state: step.state, task: step.task }]));
  const open = steps.filter((step) => step.state === 'open');
  const subjectName = subjects.find((one) => one.id === subjectId)?.name ?? '';

  const suggest = async () => {
    setAsking(true);
    setError('');
    const result = await suggestReviewSessions(subjectId);
    setAsking(false);
    if (!result.success) {
      setError(result.message || "Couldn't suggest review sessions. Try again.");
      return;
    }
    setSteps(result.steps);
  };

  const plan = useCallback(
    async (step: NextStep): Promise<boolean> => {
      const made = await planSession(step.id, subjectId);
      if (!made.success) {
        setError(made.message || "Couldn't plan that session. Try again.");
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

  // One after another: each booking takes the next free slot, and the server
  // only sees a slot as taken once the one before it is written.
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

  const scope = subjectId ? subjectName || 'this subject' : 'all your subjects';
  const dueLine =
    due > 0
      ? `${due} ${due === 1 ? 'piece of work is' : 'pieces of work are'} due for another look.`
      : "Nothing's due for another look right now.";

  return (
    <section className="ns-panel ns-on-analytics ns-review" aria-label="What to review">
      <header className="ns-head">
        <div className="ns-title">
          <h2>What to review</h2>
          <p>
            Three review sessions for {scope}, picked from work you did 1, 3, 7, 14 or 30 days ago,
            work that went badly, and hard work you never went back to. {dueLine}
          </p>
        </div>
      </header>

      {subjects.length > 0 && (
        <div className="ns-pills" role="radiogroup" aria-label="Subject to review">
          {[{ id: '', name: 'All subjects' }, ...subjects].map((one) => {
            const on = one.id === subjectId;
            return (
              <button
                key={one.id || 'all'}
                type="button"
                role="radio"
                className={`ns-pill${on ? ' is-on' : ''}`}
                aria-checked={on}
                onClick={() => setSubjectId(one.id)}
                disabled={working}
              >
                {one.name}
              </button>
            );
          })}
        </div>
      )}

      {available === false ? (
        <p className="ns-note">
          Suggestions need an AI key. Add a free GROQ_API_KEY or an ANTHROPIC_API_KEY to .env and restart the server.
        </p>
      ) : (
        <div className="ns-actions">
          <button
            type="button"
            className="ns-btn is-primary"
            onClick={() => void suggest()}
            disabled={working || loading || due === 0}
          >
            {asking ? 'Loading...' : steps.length ? `Suggest ${BATCH} different ones` : `Suggest ${BATCH} review sessions`}
          </button>
          {open.length > 0 && (
            <button type="button" className="ns-btn" onClick={() => void planAll()} disabled={working}>
              {all ? 'Adding...' : open.length === BATCH ? `Plan all ${BATCH}` : `Plan the other ${open.length}`}
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
        <p className="ns-note">Loading review sessions...</p>
      ) : steps.length > 0 ? (
        <NextSteps
          steps={steps}
          status={status}
          busy={busy}
          onPlan={(step) => void planOne(step)}
          onDidIt={(step) => void didIt(step)}
          firstOpen={false}
        />
      ) : (
        available !== false &&
        due > 0 && (
          <p className="ns-note">
            Nothing suggested {subjectId ? `for ${scope} ` : ''}yet. Press Suggest {BATCH} review sessions and
            you'll get three based on what's due.
          </p>
        )
      )}
    </section>
  );
}
