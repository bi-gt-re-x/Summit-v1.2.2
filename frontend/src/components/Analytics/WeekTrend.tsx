/**
 * The Overview's week-by-week read: the slump alert at the top of the tab,
 * and the "What changed" panel under the productivity chart.
 *
 * The arithmetic is all in utils/weekTrend. This draws it.
 *
 * "What changed" has three layers, most recent first:
 *
 *   This week     Up, down or level against last week, with the last eight
 *                 weeks as a strip so a single week is seen in context.
 *   Two weeks     Every metric that moved more than its own noise, with both
 *                 figures, good news and bad news marked as such.
 *   Tensions      The diagnosis cards, when two readings of the same weeks
 *                 disagree (utils/diagnosis).
 */
import { Link } from 'react-router-dom';
import { Panel } from './charts';
import { DiagnosisCards } from './Diagnosis';
import type { Diagnosis } from '@/utils/diagnosis';
import {
  moveSentence,
  rangeLabel,
  directionOf,
  type Slump,
  type TrackedMove,
  type WeekBlock,
  type WeekMove,
} from '@/utils/weekTrend';

const fmt = (value: number) => Math.round(value).toLocaleString('en-US');

// --------------------------------------------------------------------------
// The slump alert
// --------------------------------------------------------------------------
export function SlumpAlert({ slump }: { slump: Slump }) {
  const lead =
    slump.now === 0
      ? `You haven't earned any XP in the last 7 days. Your usual week is about ${fmt(slump.usual)} XP.`
      : `You earned ${fmt(slump.now)} XP in the last 7 days, ${slump.drop}% under your usual ${fmt(slump.usual)}.`;

  return (
    <section className="ax-slump" role="alert" aria-labelledby="ax-slump-title">
      <header className="ax-slump-head">
        <span className="ax-slump-flag">Important</span>
        <h2 id="ax-slump-title" className="ax-slump-title">
          You're in a slump. Here's how to get out of it.
        </h2>
        <p className="ax-slump-lead">
          {lead} Slumps happen to everyone. The fix is to make starting easy, so do these in
          order.
        </p>
      </header>
      <ol className="ax-slump-steps">
        {slump.steps.map((step, index) => (
          <li key={step.id} className="ax-slump-step">
            <span className="ax-slump-num" aria-hidden="true">
              {index + 1}
            </span>
            <div className="ax-slump-body">
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </div>
            {step.to && (
              <Link to={step.to} className="ax-slump-go">
                {step.link ?? 'Go'}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

// --------------------------------------------------------------------------
// This week
// --------------------------------------------------------------------------
const HEADLINE = {
  up: 'Productivity is up this week',
  down: 'Productivity is down this week',
  level: 'Productivity is steady this week',
} as const;

function WeekRead({ move, blocks }: { move: WeekMove; blocks: WeekBlock[] }) {
  const { direction, now, was, pct, run, best } = move;
  const change =
    pct === null
      ? was.xp === 0 && now.xp > 0
        ? 'up from nothing the week before'
        : 'the same as the week before'
      : direction === 'level'
        ? `about the same as the ${fmt(was.xp)} the week before`
        : now.xp === 0
          ? `down from ${fmt(was.xp)} XP the week before`
          : `${direction} ${Math.round(Math.abs(pct))}% from ${fmt(was.xp)} the week before`;

  const extra = [
    best && blocks.length >= 4 ? `Your best week of the last ${blocks.length}.` : null,
    run >= 2 && direction !== 'level' ? `${direction === 'up' ? 'Up' : 'Down'} ${run} weeks in a row.` : null,
  ].filter(Boolean);

  const top = Math.max(1, ...blocks.map((block) => block.xp));

  return (
    <div className={`ax-week is-${direction}`}>
      <div className="ax-week-lead">
        <span className="ax-week-mark" aria-hidden="true">
          {direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→'}
        </span>
        <div>
          <h3 className="ax-week-title">{HEADLINE[direction]}</h3>
          <p className="ax-week-text">
            {fmt(now.xp)} XP and {now.tasks} {now.tasks === 1 ? 'task' : 'tasks'} in the last 7
            days, {change}. {extra.join(' ')}
          </p>
        </div>
      </div>

      {/* Eight weeks side by side, each marked up or down against the one
          before it, so this week is read against a run rather than alone. */}
      <ol className="ax-week-strip" aria-label="XP by week">
        {blocks.map((block, index) => {
          const prev = blocks[index - 1];
          const way = prev ? directionOf(block.xp, prev.xp) : 'level';
          const last = index === blocks.length - 1;
          return (
            <li
              key={block.from}
              className={`ax-week-col is-${way}${last ? ' is-now' : ''}`}
              title={`${rangeLabel(block.from, block.to)}: ${fmt(block.xp)} XP, ${block.tasks} tasks, ${block.active} days worked`}
            >
              <span className="ax-week-val">{fmt(block.xp)}</span>
              <span className="ax-week-bar">
                <i style={{ height: `${Math.max(3, (block.xp / top) * 100)}%` }} />
              </span>
              <span className="ax-week-way" aria-hidden="true">
                {prev ? (way === 'up' ? '↑' : way === 'down' ? '↓' : '·') : ''}
              </span>
              <span className="ax-week-date">{last ? 'This week' : rangeLabel(block.from, block.to).split(' to ')[0]}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// --------------------------------------------------------------------------
// What changed
// --------------------------------------------------------------------------
export interface WhatChangedProps {
  move: WeekMove | null;
  blocks: WeekBlock[];
  moves: TrackedMove[];
  diagnoses: Diagnosis[];
  /** Whether there are two whole weeks before the last two to compare with. */
  enoughRecord: boolean;
  /** The two windows, for the note. */
  nowRange: string;
  wasRange: string;
  /**
   * The obstacle the reader named most after finishing tasks, and how often.
   * Shown when the numbers found nothing: what they typed is still a record.
   */
  reported?: { phrase: string; count: number } | null;
}

export function WhatChangedPanel({
  move,
  blocks,
  moves,
  diagnoses,
  enoughRecord,
  nowRange,
  wasRange,
  reported,
}: WhatChangedProps) {
  const good = moves.filter((row) => row.good);
  const bad = moves.filter((row) => !row.good);

  return (
    <Panel
      title="What changed"
      note={enoughRecord ? `Your last two weeks (${nowRange}) against the two before (${wasRange}).` : undefined}
      className="ax-what-changed"
    >
      {move && <WeekRead move={move} blocks={blocks} />}

      {!enoughRecord ? (
        <p className="ax-empty">
          This compares two weeks with the two before, so it needs about a month of work. It'll
          fill in as you go.
        </p>
      ) : moves.length === 0 ? (
        <p className="ax-empty">
          Nothing moved enough to count over the last two weeks. Small ups and downs are left out
          so the real changes stand out.
        </p>
      ) : (
        <div className="ax-moves">
          {good.length > 0 && <MoveList title="Better" rows={good} tone="good" />}
          {bad.length > 0 && <MoveList title="Worse" rows={bad} tone="bad" />}
        </div>
      )}

      {enoughRecord && moves.length === 0 && reported && (
        <p className="ax-empty">
          You reported <strong>{reported.phrase}</strong> after {reported.count}{' '}
          {reported.count === 1 ? 'task' : 'tasks'} in the last two weeks.
        </p>
      )}

      {diagnoses.length > 0 && (
        <div className="ax-moves-diag">
          <DiagnosisCards items={diagnoses} />
        </div>
      )}
    </Panel>
  );
}

function MoveList({ title, rows, tone }: { title: string; rows: TrackedMove[]; tone: 'good' | 'bad' }) {
  return (
    <div className={`ax-moves-col is-${tone}`}>
      <p className="ax-moves-head">{title}</p>
      <ul className="ax-moves-list">
        {rows.map((row) => (
          <li key={row.id} className="ax-moves-row">
            <span className="ax-moves-mark" aria-hidden="true">
              {row.up ? '↑' : '↓'}
            </span>
            <div>
              <strong>{row.label}</strong>
              <p>{moveSentence(row)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
