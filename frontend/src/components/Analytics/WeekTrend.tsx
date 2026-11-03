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
 *                 figures, and what the lot of them add up to (`moveReads`).
 *   Tensions      When two readings of the same weeks disagree, with what that
 *                 suggests and what to try (utils/diagnosis). Mixed readings
 *                 sit beside Worse, and the warnings get a card of their own.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from './charts';
import { Figures } from './Figures';
import { Suggestion } from './Suggestion';
import type { Diagnosis } from '@/utils/diagnosis';
import {
  moveSentence,
  rangeLabel,
  directionOf,
  type MoveReads,
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
  const one = slump.workedWeeks === 1;
  const lead =
    slump.now === 0
      ? `No XP in the last 7 days. ${one ? 'Your last working week was' : 'Your usual week is'} about ${fmt(slump.usual)} XP.`
      : `You earned ${fmt(slump.now)} XP in the last 7 days, ${slump.drop}% under ${one ? 'your last working week of' : 'your usual'} ${fmt(slump.usual)}.`;

  return (
    <section className="ax-slump" role="alert" aria-labelledby="ax-slump-title">
      <header className="ax-slump-head">
        <span className="ax-slump-flag">Important</span>
        <h2 id="ax-slump-title" className="ax-slump-title">
          You're in a slump. Try these to get back on track.
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
  up: 'Activity is up this week',
  down: 'Activity is down this week',
  level: 'Activity is steady this week',
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
            <strong>{fmt(now.xp)} XP</strong> and <strong>{now.tasks} {now.tasks === 1 ? 'task' : 'tasks'}</strong> in the last 7
            days, {change}. {extra.join(' ')}
          </p>
        </div>
      </div>

      {/* Eight weeks side by side, the color marking the ones that moved, so
          this week is read against a run rather than alone. */}
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
                <i style={{ height: `${Math.max(4, (block.xp / top) * 100)}%` }} />
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
  /** What the worse and better lists add up to. See `moveReads`. */
  reads?: MoveReads;
}

/* One mark per card, in a tinted circle: a warning for worse, a trend line for
   mixed, a tick for better, and a circled ! for what needs attention. */
const CARD_ICON = {
  worse: (
    <>
      <path d="M12 4 2.8 20h18.4L12 4Z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </>
  ),
  mixed: (
    <>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  better: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.6 2.5L16 9.5" />
    </>
  ),
  attention: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V13M12 16.5v.01" />
    </>
  ),
} as const;

type CardKind = keyof typeof CARD_ICON;

function ChangeCard({
  kind,
  title,
  wide,
  children,
}: {
  kind: CardKind;
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`ax-moves-col is-${kind}${wide ? ' is-wide' : ''}`}>
      <h3 className="ax-moves-head">
        <span className="ax-moves-icon" aria-hidden="true">
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {CARD_ICON[kind]}
          </svg>
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
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
  reads,
}: WhatChangedProps) {
  const better = moves.filter((row) => row.good);
  const worse = moves.filter((row) => !row.good);
  const attention = diagnoses.filter((row) => row.tone === 'warning');
  const mixed = diagnoses.filter((row) => row.tone === 'tension');
  const going = diagnoses.filter((row) => row.tone === 'good');
  const hasBetter = better.length > 0 || going.length > 0;

  return (
    <Panel
      title="What changed"
      note={enoughRecord ? `Your last two weeks (${nowRange}) vs. the two before (${wasRange}).` : undefined}
      className="ax-what-changed"
    >
      {move && <WeekRead move={move} blocks={blocks} />}

      {!enoughRecord ? (
        <p className="ax-empty">
          This compares two weeks with the two before, so it needs about a month of work. It'll
          fill in as you go.
        </p>
      ) : moves.length === 0 && diagnoses.length === 0 ? (
        <p className="ax-empty">
          Nothing moved enough to count over the last two weeks. Small ups and downs are left out
          so only real changes show up.
        </p>
      ) : null}

      {enoughRecord && moves.length === 0 && reported && (
        <p className="ax-empty">
          You reported <strong>{reported.phrase}</strong> after {reported.count}{' '}
          {reported.count === 1 ? 'task' : 'tasks'} in the last two weeks.
        </p>
      )}

      {(worse.length > 0 || mixed.length > 0 || hasBetter || attention.length > 0) && (
        <div className="ax-moves">
          {worse.length > 0 && (
            <ChangeCard kind="worse" title="Worse">
              <MoveList rows={worse} />
              {reads?.worse && <Suggestion text={reads.worse} />}
            </ChangeCard>
          )}
          {mixed.length > 0 && (
            <ChangeCard kind="mixed" title="Mixed">
              <ReadList items={mixed} />
            </ChangeCard>
          )}
          {attention.length > 0 && (
            <ChangeCard kind="attention" title="Needs attention" wide>
              <ReadList items={attention} />
            </ChangeCard>
          )}
          {hasBetter && (
            <ChangeCard kind="better" title="Better">
              {better.length > 0 && <MoveList rows={better} />}
              {reads?.better && <Suggestion text={reads.better} />}
              {going.length > 0 && <ReadList items={going} />}
            </ChangeCard>
          )}
        </div>
      )}
    </Panel>
  );
}

function MoveList({ rows }: { rows: TrackedMove[] }) {
  return (
    <ul className="ax-moves-list">
      {rows.map((row) => (
        <li key={row.id} className="ax-moves-row">
          <div>
            <strong className="ax-moves-name">{row.label}</strong>
            <p><Figures text={moveSentence(row)} /></p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The two readings that don't line up: the claim, the figures, what to try. */
function ReadList({ items }: { items: Diagnosis[] }) {
  return (
    <ul className="ax-moves-list">
      {items.map((item) => (
        <li key={item.id} className="ax-moves-row">
          <div>
            <strong className="ax-moves-name">{item.headline}</strong>
            <p>
              <Figures text={item.detail} />
              {item.points[0] ? (
                <>
                  {' '}
                  <Figures text={item.points[0]} />
                </>
              ) : null}
            </p>
            <Suggestion text={`${item.means} ${item.action}`} />
          </div>
        </li>
      ))}
    </ul>
  );
}
