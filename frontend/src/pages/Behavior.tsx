/**
 * Behavior: the mistakes you already know you make, tracked until they stop.
 *
 * Analytics says your scores dropped. This is for when you already know why ("I rush the
 * last problems", "I miss the easy ones") and the problem is that knowing hasn't stopped
 * it. Each pattern you name is checked against the sessions it can show up in, gets one
 * fix at a time, and is judged by whether it comes up less once the fix starts. The top
 * of the page asks the blunt question: of the mistakes you named, how many came back?
 *
 * Sessions come from the question after a task (components/Tasks/RatePrompt), from
 * sessions logged here by hand (a test at school Summit never saw), and, for patterns
 * Summit spotted in the record, from the tasks themselves. The rules are
 * backend/tracking/behavior.py; every figure is worked out there.
 */
import { BellRing, Lightbulb, Plus, Repeat } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PatternCard } from '@/components/Behavior/PatternCard';
import { PatternForm, type PatternFields } from '@/components/Behavior/PatternForm';
import { ErrorState, Loading } from '@/components/PageState';
import { useAuth, useSubjects } from '@/hooks';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { behavior as service } from '@/services';
import type { BehaviorPage, BehaviorSource, BehaviorStatus, Fix, Suggestion } from '@/services/behavior';
import '@/styles/behavior.css';

/** Patterns people already know about themselves, to start from. */
const STARTERS: { title: string; scope: PatternFields['scope'] }[] = [
  { title: 'I make impulsive decisions on tests', scope: 'tests' },
  { title: 'I overlook problems that look easy', scope: 'study' },
  { title: 'I own up to a mistake, then make it again', scope: 'study' },
  { title: 'I log hours without focused work', scope: 'study' },
];

interface Adding {
  start: Partial<PatternFields>;
  source: BehaviorSource;
  source_ref: string;
  heading: string;
}

type Filter = 'all' | BehaviorStatus;

export default function Behavior() {
  useDocumentTitle('Behavior');
  const { username } = useAuth();
  const subjectRows = useSubjects(username);
  const subjects = useMemo(() => subjectRows.map((one) => ({ id: one.id, name: one.name })), [subjectRows]);

  const [data, setData] = useState<BehaviorPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<Adding | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [hidden, setHidden] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const result = await service.read();
      if (!result.success) {
        setError(result.message);
        return;
      }
      setData(result);
      setError(null);
    } catch {
      setError("Couldn't reach the server.");
    }
  }, []);

  useEffect(() => {
    if (username) void load();
  }, [load, username]);

  const startAdding = (start: Partial<PatternFields> = {}, source: BehaviorSource = 'own', ref = '', heading = 'Name a pattern') => {
    setProblem(null);
    setAdding({ start, source, source_ref: ref, heading });
    window.setTimeout(() => document.getElementById('bh-add')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }), 0);
  };

  const track = (one: Suggestion) =>
    startAdding({ title: one.title, detail: one.detail, scope: one.scope }, one.source, one.source_ref, 'Track this pattern');

  const add = async (fields: PatternFields, fix: Fix | null) => {
    if (!adding) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await service.add({
        title: fields.title, detail: fields.detail, scope: fields.scope, subject: fields.subject,
        words: fields.words.split(',').map((word) => word.trim()).filter(Boolean),
        source: adding.source, source_ref: adding.source_ref,
        fix_title: fix?.title ?? '', fix_how: fix?.how ?? '',
      });
      if (!result.success) {
        setProblem(result.message);
        return;
      }
      setAdding(null);
      setFilter('all');
      await load();
    } catch {
      setProblem("Couldn't reach the server. Nothing was added.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return <Loading label="Loading your patterns" />;

  const { summary } = data;
  const shown = data.behaviors.filter((one) => filter === 'all' || one.status === filter);
  const suggestions = data.suggestions.filter((one) => !hidden.includes(`${one.source}:${one.source_ref}`));

  return (
    <div className="bh-page page-shell">
      <header className="bh-head">
        <span className="bh-mark" aria-hidden="true"><Repeat /></span>
        <div className="bh-head-text">
          <h1>Behavior</h1>
          <p>
            The mistakes you already know you make, tracked until they stop. Name one, pick a fix, and Summit checks
            whether it actually comes up less, not whether you meant well.
          </p>
        </div>
        {!adding && (
          <button type="button" className="bh-btn is-primary bh-head-add" onClick={() => startAdding()}>
            <Plus aria-hidden="true" /> Name a pattern
          </button>
        )}
      </header>

      {summary.named > 0 && summary.headline && (
        <section className="bh-summary" aria-label="How it's going">
          <h2>{summary.headline}</h2>
          <div className="bh-tiles">
            <div><b>{summary.named}</b><span>named</span></div>
            <div>
              <b>{summary.repeat ? `${summary.repeat.hits} of ${summary.repeat.of}` : 'Too new'}</b>
              <span>{summary.repeat ? 'came back after you named them' : 'to say whether they come back'}</span>
            </div>
            <div><b>{summary.fixes.of ? `${summary.fixes.working} of ${summary.fixes.of}` : 'None'}</b><span>fixes working</span></div>
            <div><b>{summary.counts.resolved}</b><span>resolved</span></div>
          </div>
          {summary.figures && <p className="bh-figures">{summary.figures}</p>}
          {summary.shared && <p className="bh-figures">{summary.shared}</p>}
          {summary.suggests && (
            <p className="bh-suggest"><Lightbulb aria-hidden="true" /><span>{summary.suggests}</span></p>
          )}
        </section>
      )}

      {data.today.length > 0 && (
        <section className="bh-today" aria-label="Before today's sessions">
          <h2><BellRing aria-hidden="true" /> Before today&apos;s sessions</h2>
          <ul>
            {data.today.map((one) => (
              <li key={one.behavior_id}>
                <b>{one.fix}</b>
                <span>
                  On {one.tasks.map((title) => `"${title}"`).join(', ')}{one.more ? ` and ${one.more} more` : ''}, for &ldquo;{one.title}&rdquo;.
                  {one.how && ` ${one.how}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {adding && (
        <section id="bh-add" className="bh-adding">
          <PatternForm
            heading={adding.heading}
            submit="Start tracking"
            busy={busy}
            start={adding.start}
            subjects={subjects}
            withFix
            onSubmit={(fields, fix) => void add(fields, fix)}
            onCancel={() => setAdding(null)}
          />
          {problem && <p className="bh-problem" role="alert">{problem}</p>}
        </section>
      )}

      {suggestions.length > 0 && (
        <section className="bh-noticed" aria-label="Summit noticed">
          <h2>Summit noticed</h2>
          <ul>
            {suggestions.map((one) => (
              <li key={`${one.source}:${one.source_ref}`}>
                <div>
                  <b>{one.title}</b>
                  <span>{one.based_on}</span>
                </div>
                <div className="bh-row">
                  <button type="button" className="bh-btn" onClick={() => track(one)}>Track it</button>
                  <button type="button" className="bh-btn is-quiet"
                    onClick={() => setHidden((was) => [...was, `${one.source}:${one.source_ref}`])}>Not now</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.behaviors.length === 0 && !adding ? (
        <section className="bh-empty">
          <h2>Start with one you already know</h2>
          <p>
            You probably don&apos;t need Summit to tell you what goes wrong. You need something that notices whether it
            stopped. Pick one of these, or write your own.
          </p>
          <div className="bh-starters">
            {STARTERS.map((one) => (
              <button key={one.title} type="button" className="bh-btn" onClick={() => startAdding({ title: one.title, scope: one.scope })}>
                {one.title}
              </button>
            ))}
          </div>
          <p className="bh-hint">
            Patterns your <Link to="/log">Log</Link> picks up show up under &ldquo;Summit noticed&rdquo;, and on the Log&apos;s
            &ldquo;What Summit has learned&rdquo; panel.
          </p>
        </section>
      ) : data.behaviors.length > 0 && (
        <>
          <nav className="bh-filter" aria-label="Show patterns at one stage">
            <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              All <span>{data.behaviors.length}</span>
            </button>
            {data.statuses.map((stage) => (
              <button key={stage.key} type="button" aria-pressed={filter === stage.key}
                onClick={() => setFilter(filter === stage.key ? 'all' : stage.key)}>
                {stage.label} <span>{summary.counts[stage.key]}</span>
              </button>
            ))}
          </nav>
          <div className="bh-list">
            {shown.length === 0 ? (
              <p className="bh-hint">Nothing at this stage right now.</p>
            ) : shown.map((one) => <PatternCard key={one.id} one={one} subjects={subjects} onChanged={() => void load()} />)}
          </div>
        </>
      )}

      <details className="bh-how">
        <summary>How this works</summary>
        <ul>
          <li><b>How often:</b> the times it happened in the last 30 days, and in how many of the sessions that were checked.</li>
          <li><b>Comes back:</b> the share of checked sessions since you named it where it happened again. Naming it is day one, not the cure.</li>
          <li><b>Fix:</b> one change at a time, so you can tell which one worked. A new fix ends the old one, and its result is kept.</li>
          <li><b>Did it work:</b> how often it came up before the fix against since. Fewer than 4 sessions says nothing, 4 to 9 is a first sign, and a gap that could be chance is called no difference.</li>
          <li><b>When it shows up:</b> evening or morning, long sessions, hard or easy work, after a full day, low-energy days from your Log, tests. Only a gap the numbers can tell from chance is named, and it means the two go together, not that one causes the other.</li>
          <li><b>Where the sessions come from:</b> the question after a task in the pattern&apos;s scope, sessions you log here, and for patterns Summit spotted, your tasks themselves.</li>
        </ul>
      </details>
    </div>
  );
}
