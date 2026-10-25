/**
 * Weekly summary: the top of Analytics' Overview.
 *
 * The last 7 days in a few short bullets (consistency, effort, what changed,
 * each subject), with a switch for the last 30 or 365 days instead. The
 * arithmetic is utils/periodSummary; this draws it. The choice is kept in this
 * browser so the tab opens on the one you read.
 */
import { useMemo, useState } from 'react';
import type { GrowthDay, Task } from '@/types';
import { isoDate } from '@/utils/dates';
import { periodSummary, type SummaryPeriod, type Tone } from '@/utils/periodSummary';
import { rangeLabel } from '@/utils/weekTrend';
import { Panel } from './charts';

const PERIODS: { key: SummaryPeriod; label: string; title: string }[] = [
  { key: 'week', label: 'Week', title: 'Weekly summary' },
  { key: 'month', label: 'Month', title: 'Monthly summary' },
  { key: 'year', label: 'Year', title: 'Yearly summary' },
];

const KEY = 'summit.analytics.summaryPeriod';
const MARK: Record<Tone, string> = { up: '↑', down: '↓', flat: '·' };

function withYear(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function stored(): SummaryPeriod {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'month' || value === 'year' ? value : 'week';
  } catch {
    return 'week';
  }
}

export function PeriodSummary({
  all,
  tasks,
  nameOf,
}: {
  /** The day series, oldest first, ending today. */
  all: GrowthDay[];
  tasks: Task[];
  nameOf: (id: string) => string;
}) {
  const [period, setPeriod] = useState<SummaryPeriod>(stored);
  const today = all[all.length - 1]?.date ?? isoDate();
  const summary = useMemo(() => periodSummary(all, tasks, period, today, nameOf), [all, tasks, period, today, nameOf]);

  const pick = (next: SummaryPeriod) => {
    setPeriod(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* Private window: the choice just isn't remembered. */
    }
  };

  const title = PERIODS.find((entry) => entry.key === period)!.title;
  // A year's range spans two calendar years, so it says them.
  const range =
    period === 'year'
      ? `${withYear(summary.from)} to ${withYear(summary.to)}`
      : rangeLabel(summary.from, summary.to);
  const note = summary.compared
    ? `${range}, against the ${period} before.`
    : `${range}. Not enough history yet to compare with the ${period} before.`;

  return (
    <Panel
      title={title}
      note={note}
      className="ax-period"
      aside={
        <div className="ax-depth" role="group" aria-label="Summary period">
          {PERIODS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={`ax-depth-pick${period === entry.key ? ' is-on' : ''}`}
              aria-pressed={period === entry.key}
              onClick={() => pick(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      }
    >
      {summary.empty ? (
        <p className="ax-empty">Nothing done in this stretch yet. Finish a task and it starts filling in.</p>
      ) : (
        <div className="ax-period-groups">
          {summary.groups.map((group) => (
            <div key={group.id} className="ax-period-group">
              <h3 className="ax-tips-head">{group.title}</h3>
              <ul className="ax-period-list">
                {group.lines.map((line) => (
                  <li key={line.label} className={`is-${line.tone}`}>
                    <span className="ax-period-mark" aria-hidden="true">
                      {MARK[line.tone]}
                    </span>
                    <span>
                      <b>{line.label}:</b> {line.text}
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
