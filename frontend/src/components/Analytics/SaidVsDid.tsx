/**
 * Said vs did: the reader's own words, held up against their record.
 *
 * What they told Summit at sign-up (About you) and what the Log has learned
 * from their journal, each checked against the last 30 days of finished
 * tasks: aims against the time they got, things they said they do against
 * whether any of it shows up, and when they say they work best against the
 * hours their tasks actually get done. Under that, the topics inside each
 * subject that task names reveal, and unfiled tasks whose names say where
 * they belong, with a button to file them.
 *
 * Every figure is counted (backend/tracking/said_did.py). A line that names
 * no subject is left out rather than matched to the nearest thing.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as said from '@/services/said';
import type { SaidItem, SaidVsDid as Reading, Verdict } from '@/services/said';
import { Panel } from './charts';

const VERDICT: Record<Verdict, string> = {
  strong: 'Getting real time',
  some: 'Getting some time',
  little: 'Barely touched',
  none: 'Nothing yet',
};

const WINDOW: Record<string, string> = {
  morning: 'the morning',
  afternoon: 'the afternoon',
  evening: 'the evening',
  night: 'late at night',
};

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function Row({ item, days, total }: { item: SaidItem; days: number; total: number }) {
  return (
    <li className={`ax-said-row is-${item.verdict}`}>
      <p className="ax-said-quote">
        "{item.text}"<span className="ax-said-src">{item.source}</span>
      </p>
      <p className="ax-said-did">
        <b>{item.name}:</b> {item.tasks} of {plural(total, 'task')} in {days} days ({item.share}%)
        {item.rank ? `, #${item.rank} of ${item.of} subjects` : ''}.
        <span className={`ax-said-chip is-${item.verdict}`}>{VERDICT[item.verdict]}</span>
      </p>
    </li>
  );
}

export function SaidVsDid({ data, reload }: { data: Reading | null; reload: () => void }) {
  const [filing, setFiling] = useState<string | null>(null);
  const [filedNote, setFiledNote] = useState('');

  if (!data) return null;
  const { aims, activities, timing, topics, unfiled, days, month_tasks: total } = data;
  const nothingSaid = aims.length === 0 && activities.length === 0 && timing.length === 0;
  const unfiledGroups = unfiled.groups.filter((group) => group.ids.length > 0);
  if (nothingSaid && topics.length === 0 && unfiledGroups.length === 0) return null;

  const file = async (subject: string, ids: string[], name: string) => {
    setFiling(subject);
    const result = await said.fileInferred(subject, ids).catch(() => null);
    setFiling(null);
    if (result?.success) {
      setFiledNote(`Filed ${plural(result.filed, 'task')} under ${name}.`);
      reload();
    }
  };

  return (
    <Panel
      title="Your goals and routines"
      className="ax-said"
      note={`What you named in your Log and About you, checked against your last ${days} days.`}
    >
      {nothingSaid ? (
        <p className="ax-said-empty">
          Tell Summit what you're aiming for and this checks it against what you do.{' '}
          <Link to="/log" className="ax-link">Write in your Log</Link> or{' '}
          <Link to="/settings/about" className="ax-link">answer About you</Link>.
        </p>
      ) : (
        <>
          {aims.length > 0 && (
            <div className="ax-said-group">
              <h3 className="ax-said-title">What you want vs. where your time went</h3>
              <ul>
                {aims.map((item) => (
                  <Row key={`${item.source}-${item.subject}-${item.text}`} item={item} days={days} total={total} />
                ))}
              </ul>
            </div>
          )}

          {activities.length > 0 && (
            <div className="ax-said-group">
              <h3 className="ax-said-title">What you said you do</h3>
              <ul>
                {activities.map((item) => (
                  <Row key={`${item.source}-${item.subject}-${item.text}`} item={item} days={days} total={total} />
                ))}
              </ul>
            </div>
          )}

          {timing.length > 0 && (
            <div className="ax-said-group">
              <h3 className="ax-said-title">When you said you work best</h3>
              <ul>
                {timing.map((row) => (
                  <li key={row.text} className={`ax-said-row ${row.matches ? 'is-strong' : 'is-little'}`}>
                    <p className="ax-said-quote">"{row.text}"<span className="ax-said-src">Log</span></p>
                    <p className="ax-said-did">
                      {row.matches
                        ? `That matches. ${WINDOW[row.busiest]} is your busiest time, with ${row.busiest_share}% of your tasks.`
                        : `${row.share}% of your tasks get done in ${WINDOW[row.said]}. Your busiest time is ${WINDOW[row.busiest]} (${row.busiest_share}%).`}
                      <span className="ax-said-basis"> From {plural(row.tasks, 'task')} in 60 days.</span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {topics.length > 0 && (
        <div className="ax-said-group">
          <h3 className="ax-said-title">Inside your subjects, from task names</h3>
          <ul className="ax-said-topics">
            {topics.map((row) => (
              <li key={row.subject}>
                <b>{row.name}</b>
                <span>
                  {row.topics.map((topic) => `${topic.name} ${topic.tasks}`).join(' · ')}
                  <small> of {row.tasks}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {unfiledGroups.length > 0 && (
        <div className="ax-said-group">
          <h3 className="ax-said-title">
            {plural(unfiled.total, 'finished task')} with no subject
          </h3>
          <ul className="ax-said-topics">
            {unfiledGroups.map((group) => (
              <li key={group.subject}>
                <span>
                  {plural(group.ids.length, 'name')} {group.ids.length === 1 ? 'says' : 'say'} <b>{group.name}</b>
                </span>
                <button
                  type="button"
                  className="ax-said-file"
                  disabled={filing !== null}
                  onClick={() => void file(group.subject, group.ids, group.name)}
                >
                  {filing === group.subject ? 'Filing…' : 'File them'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {filedNote && <p className="ax-said-basis" role="status">{filedNote}</p>}
    </Panel>
  );
}
