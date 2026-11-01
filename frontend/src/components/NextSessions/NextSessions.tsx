/**
 * Three next sessions, of whichever kind you pick.
 *
 * The subject page's Recommendations panel (components/Subject/NextSteps),
 * offered where there is no subject page behind it: at the foot of the
 * dashboard, above the quote, and on the analytics Recommendations tab, under
 * the projection chart. A model reads the finished work and suggests three
 * exact sessions. Each can be planned on its own ("Plan my next session") or
 * all three at once ("Plan all 3"), which books them one after another into
 * the next free calendar slots.
 *
 * A row of pills says what the three are for: general, expansion (your
 * strongest topics), weakness (your weakest topics), review, or new topics.
 * Each kind keeps its own three (backend/tracking/session_kinds.py). Under the
 * pills, the big row searches for subjects and topics, and a row of topic pills
 * filters by topic. What's picked is remembered in this browser, per account.
 *
 * The brief is counted on the server from the tasks
 * (backend/tracking/next_sessions.py), since neither page has the figures the
 * subject page sends. General steps live in the same ledger as the subject
 * page's, so three suggested for Mathematics here are the three the
 * Mathematics page shows, and planning works the same way: the step is
 * locked to its task until the task is finished (done) or deleted (open).
 *
 * A booked session is written onto the shared task list at once
 * (utils/plannedTask), so the Tasks page and the calendar show it.
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
  type SessionKind,
  type SessionSubject,
  type SessionTopic,
  type SuggestedSession,
} from '@/services/analytics';
import { announceStatsChanged } from '@/utils/statsBus';
import { withPlannedTask } from '@/utils/plannedTask';
import { useSubjects } from '@/hooks/useSubjects';
import { PickSearch, type PickOption } from './PickSearch';
import '@/styles/subject-state.css';
import '@/styles/next-sessions.css';

export interface NextSessionsPanelProps {
  /** Which page it is on — only the heading's wording and the class change. */
  where: 'dashboard' | 'analytics';
}

const KINDS: Array<{ id: SessionKind; label: string; line: string; nothing: string }> = [
  {
    id: 'general',
    label: 'General',
    line: 'Three study sessions picked from your recent work',
    nothing: '',
  },
  {
    id: 'expansion',
    label: 'Expansion',
    line: 'Three sessions that push your strongest topics further',
    nothing: 'No strong topics yet. Name the topic in your tasks and rate a few.',
  },
  {
    id: 'weakness',
    label: 'Weakness',
    line: 'Three sessions on your weakest topics',
    nothing: 'No weak topics yet. Name the topic in your tasks and rate a few.',
  },
  {
    id: 'review',
    label: 'Review',
    line: 'Three sessions that go back over recent work, rough sessions and hard stuff you never redid',
    nothing: "Nothing's due for another look right now.",
  },
  {
    id: 'new',
    label: 'New topics',
    line: "Three sessions on topics you haven't touched yet",
    nothing: 'No new topics to suggest here yet. Pick a subject with a skill tree.',
  },
];

/** Topics shown as pills. The rest are a search away. */
const TOPIC_PILLS = 12;

interface Picks {
  kind: SessionKind;
  subjects: PickOption[];
  topics: PickOption[];
}

const NOTHING_PICKED: Picks = { kind: 'general', subjects: [], topics: [] };

/** Where the kind, subjects and topics picked are remembered. */
const picksKey = (username: string) => `nsPicks:${username}`;

function readPicks(username: string | null): Picks {
  if (!username) return NOTHING_PICKED;
  try {
    const saved = JSON.parse(localStorage.getItem(picksKey(username)) || '{}') as Partial<Picks>;
    return {
      kind: KINDS.some((one) => one.id === saved.kind) ? saved.kind! : 'general',
      subjects: Array.isArray(saved.subjects) ? saved.subjects : [],
      topics: Array.isArray(saved.topics) ? saved.topics : [],
    };
  } catch {
    return NOTHING_PICKED;
  }
}

function writePicks(username: string, picks: Picks) {
  try {
    localStorage.setItem(picksKey(username), JSON.stringify(picks));
  } catch {
    /* Private window or blocked storage: the choice lasts the visit. */
  }
}

/** What the topic list says beside a name: where it sits, and how it's going. */
function topicHint(topic: SessionTopic) {
  const standing = topic.status === 'weak' ? 'weak' : topic.status === 'strong' ? 'strong' : '';
  return [topic.area || topic.subject_label, standing].filter(Boolean).join(' · ');
}

export function NextSessionsPanel({ where }: NextSessionsPanelProps) {
  /* Read without `useAuth`, which throws outside a provider: a page drawn
     with nobody signed in (or in a test of the page around it) simply has
     no panel. */
  const username = useContext(AuthContext)?.username ?? null;
  const shared = useContext(UserDataContext);
  const [picks, setPicks] = useState<Picks>(() => readPicks(username));
  const { kind } = picks;
  const [worked, setWorked] = useState<SessionSubject[]>([]);
  const [topics, setTopics] = useState<SessionTopic[]>([]);
  /* Every subject in the catalog, so the search can plan first sessions for
     one with no work yet (the server writes starter sessions for those). */
  const catalog = useSubjects(username);
  const [steps, setSteps] = useState<SuggestedSession[]>([]);
  const [due, setDue] = useState<number | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  /** The step being planned or recorded. */
  const [busy, setBusy] = useState('');
  /** "Plan all" is working through the open steps. */
  const [all, setAll] = useState(false);
  const working = asking || all || busy !== '';
  const [error, setError] = useState('');

  const update = useCallback(
    (change: (was: Picks) => Picks) => {
      setPicks((was) => {
        const next = change(was);
        if (username) writePicks(username, next);
        return next;
      });
    },
    [username],
  );

  const subjectIds = useMemo(() => picks.subjects.map((one) => one.id), [picks.subjects]);
  const scopeKey = subjectIds.join(',');
  /** One subject has its own three. Several share the kind's across-all three. */
  const subjectId = subjectIds.length === 1 ? subjectIds[0]! : '';

  useEffect(() => {
    if (!username) return undefined;
    let live = true;
    setLoading(true);
    setError('');
    void nextSessions(subjectId, kind, scopeKey ? scopeKey.split(',') : []).then((result) => {
      if (!live) return;
      setLoading(false);
      if (!result.success) {
        setError(result.message || "Couldn't load your suggested sessions.");
        setSteps([]);
        return;
      }
      setSteps(result.steps);
      setAvailable(result.available);
      setDue(result.due ?? null);
      if (result.subjects.length || !subjectId) setWorked(result.subjects);
      const offered = result.topics ?? [];
      setTopics(offered);
      // A topic picked under another kind or subject that isn't on offer here
      // would quietly plan from nothing, so it goes.
      update((was) => {
        const kept = was.topics.filter((one) => offered.some((topic) => topic.id === one.id));
        return kept.length === was.topics.length ? was : { ...was, topics: kept };
      });
    });
    return () => {
      live = false;
    };
  }, [kind, scopeKey, subjectId, update, username]);

  /** Subjects with work first, then the whole catalog. */
  const subjectOptions = useMemo<PickOption[]>(() => {
    const seen = new Set(worked.map((one) => one.id));
    return [
      ...worked.map((one) => ({ id: one.id, label: one.name, hint: `${one.count} done lately` })),
      ...catalog.filter((one) => !seen.has(one.id)).map((one) => ({ id: one.id, label: one.name })),
    ];
  }, [catalog, worked]);

  const topicOptions = useMemo<PickOption[]>(
    () => topics.map((one) => ({ id: one.id, label: one.label, hint: topicHint(one) })),
    [topics],
  );

  const topicIds = picks.topics.map((one) => one.id);
  const status = useMemo(
    () => new Map(steps.map((step) => [step.id, { state: step.state, task: step.task }])),
    [steps],
  );
  const open = steps.filter((step) => step.state === 'open');
  const about = KINDS.find((one) => one.id === kind)!;

  const pickSubject = (option: PickOption) =>
    update((was) => ({ ...was, subjects: [...was.subjects, { id: option.id, label: option.label }] }));
  const dropSubject = (id: string) =>
    update((was) => ({ ...was, subjects: was.subjects.filter((one) => one.id !== id) }));
  const pickTopic = (option: PickOption) =>
    update((was) => ({ ...was, topics: [...was.topics, { id: option.id, label: option.label }] }));
  const dropTopic = (id: string) =>
    update((was) => ({ ...was, topics: was.topics.filter((one) => one.id !== id) }));

  const suggest = async () => {
    setAsking(true);
    setError('');
    const result = await suggestNextSessions(subjectId, {
      kind,
      subjects: subjectIds.length > 1 ? subjectIds : [],
      topics: topicIds,
    });
    setAsking(false);
    if (!result.success) {
      setError(result.message || "Couldn't suggest sessions. Try again.");
      return;
    }
    setSteps(result.steps);
  };

  /** Book one. Returns whether it was booked, for "Plan all". */
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
  const scope =
    picks.subjects.length === 0
      ? 'all your subjects'
      : picks.subjects.length === 1
        ? picks.subjects[0]!.label
        : picks.subjects.length === 2
          ? `${picks.subjects[0]!.label} and ${picks.subjects[1]!.label}`
          : `${picks.subjects.length} subjects`;
  const nothingToDo = due === 0 && topicIds.length === 0;
  const dueLine =
    kind === 'review' && due
      ? ` ${due} ${due === 1 ? 'piece of work is' : 'pieces of work are'} due for another look.`
      : '';
  const pills = topics.filter((one) => !topicIds.includes(one.id)).slice(0, TOPIC_PILLS);

  return (
    <section className={`ns-panel ns-on-${where}`} aria-label={heading}>
      <header className="ns-head">
        <div className="ns-title">
          <h2>{heading}</h2>
          <p>
            {about.line} in {scope}.{dueLine} Add one to your calendar or add all three.
          </p>
        </div>
      </header>

      <div className="ns-kinds" role="radiogroup" aria-label="Kind of session">
        {KINDS.map((one) => (
          <button
            key={one.id}
            type="button"
            role="radio"
            aria-checked={one.id === kind}
            className={`ns-kind${one.id === kind ? ' is-on' : ''}`}
            onClick={() => update((was) => ({ ...was, kind: one.id }))}
            disabled={working}
          >
            {one.label}
          </button>
        ))}
      </div>

      <div className="ns-finder">
        <PickSearch
          label="Subjects"
          placeholder="Search subjects"
          options={subjectOptions}
          picked={subjectIds}
          onPick={pickSubject}
          disabled={working}
          empty="No subject matches that."
        />
        <PickSearch
          label="Topics"
          placeholder="Search topics"
          options={topicOptions}
          picked={topicIds}
          onPick={pickTopic}
          disabled={working}
          empty={topics.length ? 'No topic matches that.' : 'No topics here yet.'}
        />
      </div>

      {(picks.subjects.length > 0 || picks.topics.length > 0) && (
        <div className="ns-chips" role="group" aria-label="Picked">
          {picks.subjects.map((one) => (
            <button
              key={one.id}
              type="button"
              className="ns-chip"
              onClick={() => dropSubject(one.id)}
              disabled={working}
              aria-label={`Remove ${one.label}`}
            >
              {one.label}
              <span className="ns-chip-x" aria-hidden="true">✕</span>
            </button>
          ))}
          {picks.topics.map((one) => (
            <button
              key={one.id}
              type="button"
              className="ns-chip"
              onClick={() => dropTopic(one.id)}
              disabled={working}
              aria-label={`Remove ${one.label}`}
            >
              {one.label}
              <span className="ns-chip-x" aria-hidden="true">✕</span>
            </button>
          ))}
        </div>
      )}

      {pills.length > 0 && (
        <div className="ns-pills" role="group" aria-label="Filter by topic">
          <span className="ns-pills-label">Filter by topic</span>
          {pills.map((one) => (
            <button
              key={one.id}
              type="button"
              className="ns-pill"
              onClick={() => pickTopic({ id: one.id, label: one.label })}
              disabled={working}
              title={topicHint(one)}
            >
              <span className="ns-pill-mark" aria-hidden="true">+</span>
              {one.label}
            </button>
          ))}
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
            disabled={working || loading || nothingToDo}
          >
            {asking ? 'Loading…' : steps.length ? `Suggest ${BATCH} different ones` : `Suggest ${BATCH} sessions`}
          </button>
          {open.length > 0 && (
            <button type="button" className="ns-btn" onClick={() => void planAll()} disabled={working}>
              {all ? 'Adding…' : open.length === BATCH ? `Plan all ${BATCH}` : `Plan the other ${open.length}`}
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
        <p className="ns-note">Loading suggestions…</p>
      ) : steps.length > 0 ? (
        <NextSteps
          steps={steps}
          status={status}
          busy={busy}
          onPlan={(step) => void planOne(step)}
          onDidIt={(step) => void didIt(step)}
          firstOpen={where !== 'analytics'}
        />
      ) : (
        available !== false && (
          <p className="ns-note">
            {nothingToDo
              ? about.nothing
              : `Nothing suggested ${subjectId ? `for ${scope} ` : ''}yet. Press Suggest ${BATCH} sessions and you'll get three based on your work.`}
          </p>
        )
      )}
    </section>
  );
}
