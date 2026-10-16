/**
 * What you told us: the facts filed from the About you answers at sign-up.
 *
 * Grouped the way they were filed (backend/tracking/background.py): what the
 * reader has done, the figures they gave, what they do, what they want, and
 * what they said about themselves. Each names its subject when it has one.
 *
 * For an account that has not answered, a note saying what answering buys —
 * shown only while there is still a wait for it to shorten.
 */
import { Link } from 'react-router-dom';
import { Panel } from './charts';
import type { Background, Fact } from '@/services/background';
import { MOST_HEAD_START } from '@/utils/background';

const GROUPS: Array<{ kind: Fact['kind']; title: string }> = [
  { kind: 'achievement', title: "What you've done" },
  { kind: 'stat', title: 'Your numbers' },
  { kind: 'activity', title: 'What you do' },
  { kind: 'aim', title: 'What you want to improve' },
  { kind: 'about', title: 'About you' },
];

export function WhatYouToldUs({
  background,
  credit,
  waiting,
  nameOf,
}: {
  background: Background | null;
  /** Days the answers are counting for right now. */
  credit: number;
  /** Whether any part of Analytics is still waiting on days. */
  waiting: boolean;
  nameOf: (id: string) => string;
}) {
  const facts = background?.facts ?? [];

  if (facts.length === 0) {
    if (!waiting) return null;
    return (
      <section className="ax-panel ax-told is-empty">
        <p className="ax-told-ask">
          <strong>Tell Summit about yourself</strong> and Analytics opens up to {MOST_HEAD_START} days sooner, with study plans that fit where you're at.{' '}
          <Link to="/settings/about" className="ax-link">
            Answer four questions
          </Link>
        </p>
      </section>
    );
  }

  const headStart = background?.detail.head_start ?? 0;
  const note =
    headStart > 0
      ? credit > 0
        ? `From your sign-up answers. They cover ${credit} of the days Analytics needs, up to ${headStart} as you keep logging.`
        : `From your sign-up answers. They count for up to ${headStart} days toward Analytics as you log.`
      : 'From your sign-up answers. Add more detail to open Analytics sooner.';

  return (
    <Panel
      title="What you told us"
      note={note}
      className="ax-told"
      aside={
        <Link to="/settings/about" className="ax-link">
          Edit
        </Link>
      }
    >
      <div className="ax-told-groups">
        {GROUPS.map((group) => {
          const rows = facts.filter((fact) => fact.kind === group.kind);
          if (rows.length === 0) return null;
          return (
            <div className="ax-told-group" key={group.kind}>
              <h3 className="ax-told-title">{group.title}</h3>
              <ul>
                {rows.map((fact) => (
                  <li key={fact.id}>
                    <span>{fact.text}</span>
                    {fact.subject && <em className="ax-told-subject">{nameOf(fact.subject)}</em>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
