/**
 * "Redo what you missed": the review queue, on the Recommendations tab.
 *
 * Everything you got wrong comes back after 1 day, then 3, 7 and 14, until
 * it sticks (backend/tracking/review.py). This panel is where it's done: the
 * list opens each one to its own question (components/Review/ReviewList).
 *
 * It draws nothing for an account that has never missed anything, so a new
 * reader isn't shown an empty box. Once there's history it stays, saying when
 * the next one's back, because "all caught up" is worth knowing too.
 */
import { useCallback, useEffect, useState } from 'react';
import { Panel, PanelNote } from './charts';
import { ReviewList } from '@/components/Review/ReviewList';
import { reviewQueue, type ReviewItem, type ReviewQueue } from '@/services/review';

/** "Thursday" inside a week, "Oct 24" past it. */
export function dayWord(iso: string, today: Date = new Date()): string {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number);
  const when = new Date(year, month - 1, day);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const gap = Math.round((when.getTime() - start.getTime()) / 86400000);
  if (gap <= 0) return 'today';
  if (gap === 1) return 'tomorrow';
  if (gap < 7) return when.toLocaleDateString('en-US', { weekday: 'long' });
  return when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ComingBack({ items }: { items: ReviewItem[] }) {
  if (items.length === 0) return null;
  const shown = items.slice(0, 8);
  return (
    <details className="rq-later">
      <summary>Coming back ({items.length})</summary>
      <ul>
        {shown.map((item) => (
          <li key={item.key}>
            <span className="rq-later-title">{item.kind === 'set' ? `"${item.title}"` : item.title}</span>
            <span className="rq-later-when">{item.due ? dayWord(item.due) : ''}</span>
          </li>
        ))}
      </ul>
      {items.length > shown.length && <p className="rq-note">And {items.length - shown.length} more.</p>}
    </details>
  );
}

/**
 * Read once when the tab opens. Answers made here don't re-read it: the row
 * keeps saying "Back in 3 days" where it was, and the count goes down here,
 * which is what a reader working down the list wants to see. `onChanged` lets
 * the plan above catch up.
 */
export function ReviewPanel({ onChanged }: { onChanged?: () => void }) {
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  /* Keys answered on this visit. */
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set());

  const load = useCallback(async () => {
    const result = await reviewQueue();
    if (result.success) {
      setQueue(result);
      setAnswered(new Set());
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* A link to /recommendations#review lands here once the list has drawn:
     the router doesn't scroll to a hash, and the panel isn't there on the
     first paint anyway. */
  const drawn = queue !== null;
  useEffect(() => {
    if (drawn && window.location.hash === '#review') {
      document.getElementById('review')?.scrollIntoView({ block: 'start' });
    }
  }, [drawn]);

  if (!queue) return null;
  const { due, later, due_count: dueCount, sitting, minutes, cleared_lately: cleared, next_due: nextDue } = queue;
  if (dueCount === 0 && later.length === 0 && cleared === 0) return null;
  const left = Math.max(0, dueCount - answered.size);
  const sittingLeft = due.slice(0, sitting).filter((item) => !answered.has(item.key));
  const minutesLeft = sittingLeft.reduce((sum, item) => sum + item.minutes, 0);

  const note = [
    dueCount > 0 && left === 0
      ? 'All done for today. Nice work.'
      : left > 0
        ? `${left} due · about ${minutesLeft || minutes} min`
        : nextDue
          ? `All caught up. The next one's back ${dayWord(nextDue)}.`
          : 'All caught up.',
    cleared > 0 ? `${cleared} cleared lately` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="ax-section" id="review">
      <Panel
        title="Redo what you missed"
        note={note}
        footer={
          <PanelNote label="How this works">
            <ul className="ax-tips">
              <li><b>Back on a schedule:</b> Anything you miss comes back the next day, then 3, 7 and 14 days after each time you get it right.</li>
              <li><b>Miss it again:</b> It starts over from the next day.</li>
              <li><b>Done for good:</b> Get it right four times in a row and it's cleared.</li>
              <li><b>Where it comes from:</b> Skill tree problems you mark Missed it, practice you log with misses, and tasks you score below full.</li>
            </ul>
          </PanelNote>
        }
      >
        {dueCount > 0 && (
          <>
            <ReviewList
              items={due.slice(0, sitting)}
              onAnswered={(item) => {
                setAnswered((was) => new Set(was).add(item.key));
                onChanged?.();
              }}
            />
            {dueCount > sitting && (
              <p className="rq-note">{dueCount - sitting} more after these. Start with these. They've waited longest.</p>
            )}
          </>
        )}
        <ComingBack items={later} />
      </Panel>
    </section>
  );
}
