/**
 * "What Summit has learned": every insight the Log has produced, grouped by
 * kind, each one removable. A drawer over the Log page (pages/Log.tsx).
 *
 * Removing one takes it out of every prompt straight away
 * (backend/api/journal.py), and Summit won't learn it again.
 */
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Insight, InsightKind } from '@/services/log';
import { RULES } from '@/utils/sharedRules';
import { entryDate } from './entry';

const KINDS = RULES.log.kinds as Array<{ key: InsightKind; label: string }>;
const TOPICS = new Map(RULES.log.topics.map((topic) => [topic.key, topic.label]));

/** Group headings, plural. */
const HEADINGS: Record<InsightKind, string> = {
  goal: 'Long-term goals',
  pattern: 'Recurring patterns',
  preference: 'Preferences',
  feeling: 'Passing feelings',
};

interface Props {
  insights: Insight[];
  /** Whether a model is set up at all. */
  learning: boolean;
  /** Entries saved but not read yet. */
  waiting: number;
  onRemove: (insight: Insight) => Promise<boolean>;
  onClose: () => void;
}

export function LearnedPanel({ insights, learning, waiting, onRemove, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showOld, setShowOld] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const active = insights.filter((insight) => insight.status === 'active');
  const old = insights.filter((insight) => insight.status === 'retired');

  const remove = async (insight: Insight) => {
    setBusy(insight.id);
    await onRemove(insight);
    setBusy(null);
  };

  const row = (insight: Insight) => (
    <li key={insight.id} className="lg-insight">
      <div>
        <p>{insight.text}</p>
        <small>
          {TOPICS.get(insight.topic) ?? 'How you work'}
          {' · '}
          {insight.sources.length === 1 ? 'from 1 entry' : `from ${insight.sources.length} entries`}
          {insight.kind === 'feeling' && insight.expires_at && insight.status === 'active'
            ? ` · fades ${entryDate(insight.expires_at)}`
            : ''}
        </small>
      </div>
      <button
        type="button"
        className="lg-x"
        aria-label={`Remove: ${insight.text}`}
        title="Remove"
        disabled={busy === insight.id}
        onClick={() => void remove(insight)}
      >
        <X aria-hidden="true" />
      </button>
    </li>
  );

  return (
    <div className="lg-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="lg-drawer" role="dialog" aria-modal="true" aria-labelledby="lg-learned-title">
        <header className="lg-drawer-head">
          <h2 id="lg-learned-title">What Summit has learned</h2>
          <button ref={closeRef} type="button" className="lg-x" aria-label="Close" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <p className="lg-drawer-lead">
          Summit picks these up from your entries and uses them to fit your plans, sessions and goal
          ideas to you. Remove anything that's wrong or that you'd rather it didn't use.
        </p>

        <ul className="lg-rules">
          <li><strong>Private:</strong> Only you can see your entries. They never show up in Spaces or to anyone else.</li>
          <li><strong>Passing feelings:</strong> They fade after {RULES.log.feeling_days} days and never count as facts about you.</li>
          <li><strong>Never kept:</strong> Health, religion, politics, sexuality and anything like them.</li>
          <li><strong>Deleting an entry:</strong> Also removes anything Summit learned only from it.</li>
        </ul>

        {!learning && (
          <p className="lg-drawer-note">
            Learning is off right now because no AI service is set up. Your entries still save.
          </p>
        )}
        {learning && waiting > 0 && (
          <p className="lg-drawer-note" role="status">
            {waiting === 1 ? 'Reading your latest entry…' : `Reading ${waiting} entries…`}
          </p>
        )}

        {active.length === 0 ? (
          <p className="lg-drawer-empty">
            Nothing yet. Write an entry and Summit will pick up what matters.
          </p>
        ) : (
          KINDS.map(({ key }) => {
            const group = active.filter((insight) => insight.kind === key);
            if (group.length === 0) return null;
            return (
              <section key={key} className="lg-group" aria-label={HEADINGS[key]}>
                <h3>{HEADINGS[key]}</h3>
                <ul>{group.map(row)}</ul>
              </section>
            );
          })
        )}

        {old.length > 0 && (
          <section className="lg-group is-old">
            <button type="button" className="lg-fold" aria-expanded={showOld} onClick={() => setShowOld((was) => !was)}>
              No longer current ({old.length})
            </button>
            {showOld && (
              <>
                <p className="lg-drawer-lead">A later entry said these stopped being true, so Summit doesn't use them.</p>
                <ul>{old.map(row)}</ul>
              </>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}
