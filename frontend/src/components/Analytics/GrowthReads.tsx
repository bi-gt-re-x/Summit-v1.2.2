/**
 * "Your growth, specifically": the top of the Growth tab.
 *
 * Findings only this account's record can produce, in three short groups:
 * where you grew (a topic whose ratings climbed, harder work held, new
 * topics), when you work best (the subject that owns an hour, the part of the
 * day a subject goes best, the session length your best work comes in) and
 * what to watch (a topic slipping, when the usual problem shows up). The
 * reading is backend/tracking/growth_reads.py; this draws it over the page's
 * window, with the shortest window it accepts being 30 days.
 */
import { useCallback } from 'react';
import { useApi } from '@/hooks';
import { growthReads } from '@/services/topics';
import { Panel } from './charts';
import { windowOption, type WindowKey } from './data';

const MARK = { good: '↑', bad: '!', flat: '·' } as const;

/** The window's days for the read: All time is two years, 7 days becomes 30. */
export function readDays(span: WindowKey): number {
  const days = windowOption(span).days ?? 730;
  return Math.max(30, Math.min(730, days));
}

export function GrowthReadsPanel({ span }: { span: WindowKey }) {
  const days = readDays(span);
  const call = useCallback(() => growthReads(days), [days]);
  const reads = useApi(call, [days]);
  const data = reads.data;

  if (!data) {
    return reads.loading ? <p className="ax-empty">Reading your record…</p> : null;
  }
  const shown = days >= 730 ? 'the last two years' : days >= 365 ? 'the last year' : `the last ${days} days`;

  return (
    <Panel
      title="Your growth, specifically"
      note={`From ${data.sessions.toLocaleString('en-US')} sessions over ${shown}: what got better, when you work best and what to watch.`}
      className="ax-growth-reads"
    >
      {data.groups.length === 0 ? (
        <p className="ax-empty">
          Nothing stands out yet. This fills in as you rate more sessions and name the topic in your tasks.
        </p>
      ) : (
        <div className="ax-period-groups">
          {data.groups.map((group) => (
            <div key={group.id} className="ax-period-group">
              <h3 className="ax-tips-head">{group.title}</h3>
              <ul className="ax-period-list">
                {group.items.map((item) => (
                  <li key={item.id} className={`is-${item.tone === 'good' ? 'up' : item.tone === 'bad' ? 'down' : 'flat'}`}>
                    <span className="ax-period-mark" aria-hidden="true">
                      {MARK[item.tone]}
                    </span>
                    <span>
                      <b>{item.title}.</b> {item.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
