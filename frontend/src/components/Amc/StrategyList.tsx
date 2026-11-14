/**
 * A topic's problems grouped by strategy, as an expandable list.
 *
 * Each strategy is a row you open: its name, what the strategy is, how many of
 * its problems you have solved, and a strip of status dots. Opened, it lists
 * every problem in full: the label, where it is from, its rating, your status
 * and the statement itself, with the math rendered. The first group starts
 * open; "Expand all" opens the rest.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MathText } from './MathText';
import { Difficulty, StatusPill } from './bits';
import type { StrategyGroup, TopicRow } from '@/services/amc';

type Group = Omit<StrategyGroup, 'pills'> & { pills: TopicRow[] };

export function StrategyList({ groups }: { groups: Group[] }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(groups.slice(0, 1).map((g) => g.id)));
  const allOpen = open.size === groups.length;
  const total = groups.reduce((n, g) => n + g.pills.length, 0);

  const toggle = (id: string) => setOpen((now) => {
    const next = new Set(now);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="am-slist">
      <div className="am-slist-bar">
        <span className="am-muted">{total} problem{total === 1 ? '' : 's'} · {groups.length} strateg{groups.length === 1 ? 'y' : 'ies'}</span>
        <button type="button" className="am-btn am-btn-ghost am-btn-sm"
                onClick={() => setOpen(allOpen ? new Set() : new Set(groups.map((g) => g.id)))}>
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      {groups.map((g) => {
        const isOpen = open.has(g.id);
        const solved = g.pills.filter((p) => p.status === 'solved').length;
        const panel = `am-slist-${g.id}`;
        return (
          <section key={g.id} className={`am-slist-group${isOpen ? ' is-open' : ''}`}>
            <button type="button" className="am-slist-head" aria-expanded={isOpen} aria-controls={panel}
                    onClick={() => toggle(g.id)}>
              <span className="am-slist-chev" aria-hidden="true" />
              <span className="am-slist-name">
                <strong>{g.name}</strong>
                <span>{g.idea}</span>
              </span>
              <span className="am-slist-side">
                <span className="am-slist-dots" aria-hidden="true">
                  {g.pills.map((p) => <i key={p.id} className={`is-${p.status}`} />)}
                </span>
                <span className="am-slist-count">{solved}/{g.pills.length} solved</span>
              </span>
            </button>
            {isOpen && (
              <ol id={panel} className="am-slist-rows">
                {g.pills.map((p) => (
                  <li key={p.id}>
                    <Link to={`/problems/${p.id}`} className={`am-slist-row is-${p.status}`}>
                      <div className="am-slist-meta">
                        <strong>{p.short}</strong>
                        <span className="am-slist-source">{p.source}</span>
                        <span className="am-slist-tags">
                          <Difficulty value={p.difficulty} rating={p.rating} />
                          <StatusPill status={p.status} />
                        </span>
                      </div>
                      <MathText text={p.statement} as="div" className="am-slist-statement" />
                    </Link>
                  </li>
                ))}
                {g.id !== 'official' && (
                  <li className="am-slist-more">
                    <Link className="am-link" to={`/topics?view=strategy#tech-${g.id}`}>Every problem using {g.name.toLowerCase()} →</Link>
                  </li>
                )}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}
