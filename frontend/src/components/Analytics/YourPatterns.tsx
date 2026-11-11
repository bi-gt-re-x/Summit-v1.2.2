/**
 * Your patterns: the mistakes you already know you make, tracked until they
 * stop. This was the Behavior page; it lives on the Insights tab now as one
 * folded group, because "why did that go wrong" belongs next to the rest of
 * the why.
 *
 * Kept short on purpose. The group's head is one line when shut. Open, it says
 * how it's going in a sentence, then lists each pattern as a row (name, stage,
 * the one figure that matters). A row opens to the full card with the fix, the
 * before and after, and the sessions behind it. The figures are all worked out
 * on the server (backend/tracking/behavior.py).
 *
 * `/behavior` redirects to `/insights#patterns`, which opens this group and
 * scrolls to it.
 */
import { BellRing, ChevronDown, Lightbulb, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PatternCard } from '@/components/Behavior/PatternCard';
import { PatternForm, type PatternFields } from '@/components/Behavior/PatternForm';
import { useAuth, useSubjects } from '@/hooks';
import { behavior as service } from '@/services';
import type { Behavior, BehaviorPage, BehaviorSource, Fix, Suggestion } from '@/services/behavior';
import { PanelGroup } from './charts';
import '@/styles/behavior.css';

/** Patterns people already know about themselves, to start from. */
const STARTERS: { title: string; scope: PatternFields['scope'] }[] = [
  { title: 'I make impulsive decisions on tests', scope: 'tests' },
  { title: 'I overlook problems that look easy', scope: 'study' },
  { title: 'I own up to a mistake, then make it again', scope: 'study' },
  { title: 'I log hours without focused work', scope: 'study' },
];

/** Live ones first, the ones you've beaten last. */
const ORDER: Record<Behavior['status'], number> = { identified: 0, intervening: 1, improving: 2, resolved: 3 };

interface Adding {
  start: Partial<PatternFields>;
  source: BehaviorSource;
  source_ref: string;
  heading: string;
}

/** The one figure a row shows: did the fix work, else does it come back, else how often. */
function rowLine(one: Behavior): string {
  if (one.effect && one.fix) return `${one.fix.title}: ${one.effect.headline}`;
  if (one.recurrence) return `Came back in ${one.recurrence.hits} of ${one.recurrence.of} sessions since you named it`;
  if (one.frequency.checked) return `${one.frequency.times} ${one.frequency.times === 1 ? 'time' : 'times'} in the last ${one.frequency.days} days`;
  return 'Not checked yet';
}

export function YourPatterns() {
  const { username } = useAuth();
  const { hash } = useLocation();
  const subjectRows = useSubjects(username);
  const subjects = useMemo(() => subjectRows.map((one) => ({ id: one.id, name: one.name })), [subjectRows]);

  const [data, setData] = useState<BehaviorPage | null>(null);
  const [adding, setAdding] = useState<Adding | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [opened, setOpened] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await service.read();
      if (result.success) setData(result);
    } catch {
      /* The group just doesn't draw. The rest of the tab is still there. */
    }
  }, []);

  useEffect(() => {
    if (username) void load();
  }, [load, username]);

  const linked = hash === '#patterns';
  useEffect(() => {
    /* The router doesn't scroll to a hash, and the group isn't there until
       its read answers. Not smooth: the panels above are still settling, and
       a smooth scroll gets cut short by them. */
    if (!linked || !data) return;
    const timer = window.setTimeout(() => document.getElementById('patterns')?.scrollIntoView?.({ block: 'start' }), 0);
    return () => window.clearTimeout(timer);
  }, [linked, data]);

  const startAdding = (start: Partial<PatternFields> = {}, source: BehaviorSource = 'own', ref = '', heading = 'Name a pattern') => {
    setProblem(null);
    setAdding({ start, source, source_ref: ref, heading });
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
      await load();
    } catch {
      setProblem("Couldn't reach the server. Nothing was added.");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;

  const { summary } = data;
  const patterns = [...data.behaviors].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const suggestions = data.suggestions.filter((one) => !hidden.includes(`${one.source}:${one.source_ref}`));
  const facts = summary.named > 0
    ? [
        `${summary.named} named`,
        summary.repeat ? `${summary.repeat.hits} of ${summary.repeat.of} came back` : null,
        summary.fixes.of
          ? `${summary.fixes.working} of ${summary.fixes.of} ${summary.fixes.of === 1 ? 'fix' : 'fixes'} working`
          : summary.fixes.waiting
            ? `${summary.fixes.waiting} ${summary.fixes.waiting === 1 ? 'fix' : 'fixes'} too new to judge`
            : null,
        summary.counts.resolved ? `${summary.counts.resolved} resolved` : null,
      ].filter(Boolean)
    : [];

  return (
    <PanelGroup
      id="patterns"
      className="bh-scope"
      title="Your patterns"
      note="Mistakes you named, and whether they stopped"
      defaultOpen={linked || data.today.length > 0}
    >
      <div className="bh-body">
        {summary.named > 0 && (summary.headline || facts.length > 0) && (
          <div className="bh-lead">
            {summary.headline && <p className="bh-lead-line">{summary.headline}</p>}
            {facts.length > 0 && <p className="bh-facts">{facts.join(' · ')}</p>}
            {summary.suggests && (
              <p className="bh-suggest"><Lightbulb aria-hidden="true" /><span>{summary.suggests}</span></p>
            )}
          </div>
        )}

        {data.today.length > 0 && (
          <div className="bh-today">
            <p className="bh-subhead"><BellRing aria-hidden="true" /> Before today&apos;s sessions</p>
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
          </div>
        )}

        {patterns.length > 0 ? (
          <ul className="bh-rows">
            {patterns.map((one) => {
              const open = opened === one.id;
              return (
                <li key={one.id} className={`bh-item is-${one.status}${open ? ' is-open' : ''}`}>
                  <button
                    type="button"
                    className="bh-item-head"
                    aria-expanded={open}
                    onClick={() => setOpened(open ? null : one.id)}
                  >
                    <span className="bh-item-name">
                      <b>{one.title}</b>
                      <span>{rowLine(one)}</span>
                    </span>
                    <span className={`bh-chip is-${one.status}`}>{one.status_label}</span>
                    <ChevronDown className="bh-item-chev" aria-hidden="true" />
                  </button>
                  {open && (
                    <PatternCard one={one} subjects={subjects} bare onChanged={() => void load()} />
                  )}
                </li>
              );
            })}
          </ul>
        ) : !adding && (
          <div className="bh-start">
            <p className="bh-note">
              Name a mistake you already know you make, and Summit checks whether it actually comes up less. Start
              with one of these, or write your own.
            </p>
            <div className="bh-starters">
              {STARTERS.map((one) => (
                <button key={one.title} type="button" className="bh-btn" onClick={() => startAdding({ title: one.title, scope: one.scope })}>
                  {one.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="bh-noticed">
            <p className="bh-subhead">Summit noticed</p>
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
          </div>
        )}

        {adding ? (
          <div className="bh-adding">
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
          </div>
        ) : (
          <div className="bh-foot">
            <button type="button" className="bh-btn" onClick={() => startAdding()}>
              <Plus aria-hidden="true" /> Name a pattern
            </button>
            <details className="bh-how">
              <summary>How this works</summary>
              <ul>
                <li><b>Comes back:</b> how many checked sessions since you named it had it again.</li>
                <li><b>Fix:</b> one change at a time, so you can tell which one worked.</li>
                <li><b>Did it work:</b> how often it came up before the fix against since. Under 4 sessions says nothing yet.</li>
                <li><b>Sessions</b> come from the question after a task, ones you log here, and your tasks themselves.</li>
              </ul>
            </details>
          </div>
        )}
      </div>
    </PanelGroup>
  );
}
