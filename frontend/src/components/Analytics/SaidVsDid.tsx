/**
 * Your goals and routines: the subjects the reader named, held up against
 * the last 30 days of finished tasks.
 *
 * One row per subject, however many lines named it, ranked by how often it
 * comes up in what they wrote (About you and the Log). The top five show;
 * the rest fold behind "Show more", so a long About you answer doesn't turn
 * into a wall of rows. Under the list, a few moves built from those figures
 * (backend/tracking/said_did.py `suggestions`), then timing, the topics
 * inside each subject, and unfiled tasks with a button to file them.
 *
 * A new account is getting started, not falling short: until it has a few
 * weeks or a few dozen tasks behind it, a subject with nothing logged reads
 * "Not on record yet" in grey rather than "Nothing yet" in red.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Lightbulb } from 'lucide-react';
import * as said from '@/services/said';
import type { NamedRow, SaidVsDid as Reading, Suggestion, Verdict } from '@/services/said';
import { Panel } from './charts';

const VERDICT: Record<Verdict, string> = {
  strong: 'Getting real time',
  some: 'Getting some time',
  little: 'Barely touched',
  none: 'Nothing yet',
  started: 'Started',
  not_yet: 'Not on record yet',
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

function NamedItem({ row, rank, total, open, onToggle }: {
  row: NamedRow;
  rank: number;
  total: number;
  open: boolean;
  onToggle: () => void;
}) {
  const more = row.lines.length - 1;
  return (
    <li className={`ax-said-item is-${row.verdict}${open ? ' is-open' : ''}`}>
      <span className="ax-said-rank" aria-hidden="true">{rank}</span>
      <div className="ax-said-main">
        <p className="ax-said-name">
          <b>{row.name}</b>
          <span className={`ax-said-kind is-${row.kind}`}>{row.kind === 'goal' ? 'Goal' : 'You do this'}</span>
          <span className="ax-said-count">
            {row.mentions === 1 ? 'named once' : `named ${row.mentions} times`}
          </span>
        </p>
        <p className="ax-said-line" title={row.text}>
          "{row.text}"
          {more > 0 && (
            <button type="button" className="ax-said-more" aria-expanded={open} onClick={onToggle}>
              {open ? 'less' : `+${more} more`}
            </button>
          )}
        </p>
        {open && (
          <ul className="ax-said-lines">
            {row.lines.slice(1).map((line) => (
              <li key={line.text}>"{line.text}" <small>{line.source}</small></li>
            ))}
          </ul>
        )}
      </div>
      <div className="ax-said-fig">
        <span className="ax-said-tasks">
          {row.tasks === 0 ? (
            'No tasks yet'
          ) : (
            <>
              <b>{row.tasks}</b> of {total} {total === 1 ? 'task' : 'tasks'}
              <small> {row.share}%</small>
            </>
          )}
        </span>
        <span className={`ax-said-chip is-${row.verdict}`}>{VERDICT[row.verdict]}</span>
      </div>
    </li>
  );
}

function Suggestions({ items }: { items: Suggestion[] }) {
  if (items.length === 0) return null;
  return (
    <div className="ax-said-group ax-said-help">
      <h3 className="ax-said-title">
        <Lightbulb aria-hidden="true" /> What would help
      </h3>
      <ol className="ax-said-tips">
        {items.map((item, at) => (
          <li key={item.key} className="ax-said-tip">
            <span className="ax-said-tip-num" aria-hidden="true">{at + 1}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
              {item.action && (
                <Link to={item.action.to} className="ax-link">
                  {item.action.label} →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function SaidVsDid({ data, reload }: { data: Reading | null; reload: () => void }) {
  const [filing, setFiling] = useState<string | null>(null);
  const [filedNote, setFiledNote] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);

  if (!data) return null;
  const { named, timing, topics, unfiled, days, month_tasks: total, stage, top, suggestions } = data;
  const nothingSaid = named.length === 0 && timing.length === 0;
  const unfiledGroups = unfiled.groups.filter((group) => group.ids.length > 0);
  if (nothingSaid && topics.length === 0 && unfiledGroups.length === 0) return null;

  const shown = showAll ? named : named.slice(0, top);
  const hidden = named.length - top;

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
          {stage === 'new' && (
            <p className="ax-said-start">
              <b>You're just getting started.</b> {plural(data.total_tasks, 'task')} on record so far, so
              this is where you're headed, not a report card. Each subject fills in as you finish tasks filed
              under it.
            </p>
          )}

          {named.length > 0 && (
            <div className="ax-said-group">
              <h3 className="ax-said-title">What you talk about most</h3>
              <ol className="ax-said-list">
                {shown.map((row, at) => (
                  <NamedItem
                    key={row.subject}
                    row={row}
                    rank={at + 1}
                    total={total}
                    open={openRow === row.subject}
                    onToggle={() => setOpenRow(openRow === row.subject ? null : row.subject)}
                  />
                ))}
              </ol>
              {hidden > 0 && (
                <button
                  type="button"
                  className="ax-said-all"
                  aria-expanded={showAll}
                  onClick={() => setShowAll(!showAll)}
                >
                  <ChevronDown aria-hidden="true" className={showAll ? 'is-up' : ''} />
                  {showAll ? `Show the top ${top}` : `Show ${hidden} more you named`}
                </button>
              )}
            </div>
          )}

          <Suggestions items={suggestions} />

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
          <h3 className="ax-said-title">{plural(unfiled.total, 'finished task')} with no subject</h3>
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
