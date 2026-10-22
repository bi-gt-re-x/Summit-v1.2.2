/**
 * The five figures across the top, each over its own two weeks.
 *
 * A count on its own cannot tell a backlog that has been at fifty-six all month
 * from one that was at twenty a week ago, and those are opposite situations
 * wearing the same number. The line under each figure is the difference, and it
 * is reconstructed rather than recorded — see `statSeries` in ./board for what
 * that costs and why it is still worth drawing.
 *
 * `Open` is the only card carrying a stated change in words, because it is the
 * only one where the direction is unambiguous: fewer overdue is better, a
 * higher completion rate is better, but more XP on the table is neither good
 * nor bad and a card that decorated it with a red arrow would be inventing an
 * opinion the number does not hold.
 */
import type { ReactNode } from 'react';
import { useCountUp } from '@/hooks';
import type { StatSeries, TaskCounts } from './board';
import { trendPct } from './board';

type Tone = 'violet' | 'amber' | 'red' | 'green';

/**
 * A line with no axis and no scale, scaled to its own extent.
 *
 * `preserveAspectRatio="none"` stretches the box to whatever width the card
 * has, and `vector-effect` keeps the stroke from stretching with it. There is
 * deliberately no `pathLength` here and no dashed reveal: the two together do
 * not survive the non-uniform scale, and the lines on the analytics page spent
 * a long time stopping partway across because of it.
 */
function Spark({ values, tone }: { values: number[]; tone: Tone }) {
  const width = 100;
  const height = 22;
  if (values.length < 2) return <svg className="tk-spark" viewBox={`0 0 ${width} ${height}`} />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const d = values
    .map((value, index) => {
      const x = index * step;
      const y = height - 2 - ((value - min) / span) * (height - 4);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      className={`tk-spark is-${tone}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={d} fill="none" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * A figure that travels to its value rather than appearing at it.
 *
 * Its own component because `useCountUp` is a hook and the cards are built in a
 * loop — five calls in a map is the one thing the rules of hooks will not have.
 * Fed the number at the precision it is shown at, which is what keeps a
 * completion rate from animating on a decimal nobody can see.
 */
function Value({ value, suffix }: { value: number; suffix?: string }) {
  const shown = useCountUp(value);
  return (
    <strong className="tk-stat-value">
      {Math.round(shown).toLocaleString()}
      {suffix}
    </strong>
  );
}

/**
 * A line drawing per card, for the paper look, which leads each card with one.
 * The other looks hide it (styles/tasks.css) and keep the card as it was.
 */
const ICONS: Record<string, ReactNode> = {
  open: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.2l2.4 2.4 4.6-5" />
    </svg>
  ),
  today: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" />
    </svg>
  ),
  overdue: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  ),
  rate: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M5 20v-4M10 20v-8M15 20v-11M20 20V5" />
    </svg>
  ),
  xp: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8z" />
    </svg>
  ),
};

export interface StatCardsProps {
  counts: TaskCounts;
  series: StatSeries;
}

export function StatCards({ counts, series }: StatCardsProps) {
  const move = trendPct(series.open);

  const cards: Array<{
    key: string;
    value: number;
    suffix?: string;
    label: string;
    hint: string;
    tone: Tone;
    line: number[];
    badge?: boolean;
  }> = [
    {
      key: 'open',
      value: counts.open,
      label: 'Open',
      hint:
        move === null
          ? "Everything that's still open"
          : `${move > 0 ? '+' : ''}${move}% from last week`,
      tone: 'violet',
      line: series.open,
    },
    {
      key: 'today',
      value: counts.today,
      label: 'Due today',
      hint:
        counts.todayHigh > 0
          ? `${counts.todayHigh} high priority`
          : counts.today > 0
            ? 'Nothing high priority'
            : 'Nothing due today',
      tone: 'amber',
      line: series.dueToday,
    },
    {
      key: 'overdue',
      value: counts.overdue,
      label: 'Overdue',
      hint: counts.overdue > 0 ? 'Get back on track' : 'Nothing overdue',
      tone: 'red',
      line: series.overdue,
    },
    {
      key: 'rate',
      value: counts.completionRate,
      suffix: '%',
      label: 'Done this week',
      hint: 'This week',
      tone: 'green',
      line: series.completion,
    },
    {
      key: 'xp',
      value: counts.openXp,
      label: 'XP up for grabs',
      hint: 'Finish tasks to earn',
      tone: 'violet',
      line: series.openXp,
      badge: true,
    },
  ];

  return (
    <div className="tk-stats">
      {cards.map((card) => (
        <article className={`tk-stat is-${card.tone}`} key={card.key}>
          <span className="tk-stat-ico" aria-hidden="true">{ICONS[card.key]}</span>
          <Value value={card.value} suffix={card.suffix} />
          <span className="tk-stat-label">{card.label}</span>
          <span className="tk-stat-hint">{card.hint}</span>
          {card.badge && (
            <span className="tk-stat-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3l2.4 6.3L21 12l-6.6 2.7L12 21l-2.4-6.3L3 12l6.6-2.7z" />
              </svg>
            </span>
          )}
          <Spark values={card.line} tone={card.tone} />
        </article>
      ))}
    </div>
  );
}

