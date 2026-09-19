/**
 * The three cards along the bottom: the week, what to do next, what was done.
 *
 * Each one is a summary with a way out of it — the card answers the question at
 * a glance and the link at its foot goes to the page that answers it properly.
 *
 * Two of the three now arrive somewhere finished: /analytics and /tasks. This
 * note used to name /tasks as unbuilt and it has been pages/Tasks.tsx for a
 * while — the link needed no rewiring when that happened, which is the whole
 * argument for pointing at the real path from the start.
 *
 * /history is still routed-but-unbuilt and the link points at it anyway, for
 * the same reason. That is not the dead end components/Analytics/charts.tsx
 * argues against: those eleven footers had no handler and no href and went
 * nowhere at all, whereas this one lands on pages/Unbuilt, which says what the
 * page will be and which files it will be built from.
 */
import { timeText } from '@/utils/clock';
import { Link } from 'react-router-dom';
import { useCountUp } from '@/hooks';
import { format } from '@/utils';
import type { Activity, WeekSummary } from './summary';
import { Card } from '@/components/ui';

// --------------------------------------------------------------------------
// Weekly Overview
// --------------------------------------------------------------------------
/**
 * The week's four numbers, in a two-by-two block.
 *
 * These are the figures the mock-up this page was built from showed under
 * *Today's Progress* as well — they are the week's, and they are shown once,
 * here.
 *
 * Completed and XP Earned are what was finished between Monday and Sunday,
 * whatever week the task was scheduled for; see `weekSummary` for why that is
 * the only reading of those two labels that is true.
 */
/**
 * "+2 on last week" — one figure against the same point of the week before.
 *
 * A count is compared as a count and a percentage as points, because "20% more
 * than 20%" is a sentence with two readings and only one of them is right. No
 * arrow: four of these sit in a small grid and four arrows is a texture, so
 * the sign carries it.
 *
 * **The words are said once, under the grid, not four times inside it.** Every
 * cell used to end "on last week" — the same four words, repeated, in the
 * smallest type on the page, which is how a card of four figures came to have
 * twelve lines in it. What each cell needs is the number; what the reader needs
 * once is what it is against.
 *
 * Silent when there is nothing on the other side — a first week is not an
 * infinite improvement on the void before it — and when nothing moved, because
 * "+0" is a fact nobody needs.
 */
function Against({ now, was, unit }: { now: number; was?: number; unit?: string }) {
  if (was === undefined) return null;
  const change = Math.round(now - was);
  if (change === 0) return null;
  return (
    <span
      className={`dash-week-vs${change > 0 ? ' is-up' : ' is-down'}`}
      title={`${change > 0 ? 'Up' : 'Down'} ${Math.abs(change)}${unit ?? ''} on the same days last week`}
    >
      {change > 0 ? '+' : '−'}
      {Math.abs(change)}
      {unit ?? ''}
    </span>
  );
}

export function WeeklyOverview({
  week,
  before,
}: {
  week: WeekSummary;
  /** The same week before, to the same depth. Absent on a first week. */
  before?: WeekSummary;
}) {
  // Counted up on arrival and travelled between values after, like the stat row
  // above — completing one task moves all four of these at once, and four
  // figures that jump together are four figures nobody watches. One hook call
  // per cell rather than a loop, because hooks cannot be called from one.
  const total = useCountUp(week.total);
  const done = useCountUp(week.done);
  const rate = useCountUp(week.rate);
  const xp = useCountUp(week.xp);

  /* Each figure carries what it was last week at the same point. That is the
     whole difference between this card and the four at the top of the page:
     those are today, this is the stretch today sits in, and a stretch is only
     worth reporting against the one before it. A cell with nothing to compare
     to shows the figure alone rather than "up ∞%". */
  const figures = [
    { value: format.number(total), label: 'Total Tasks', now: week.total, was: before?.total },
    { value: format.number(done), label: 'Completed', now: week.done, was: before?.done },
    { value: `${Math.round(rate)}%`, label: 'Completion Rate', now: week.rate, was: before?.rate, unit: 'pt' },
    { value: format.number(xp), label: 'XP Earned', now: week.xp, was: before?.xp },
  ];

  return (
    <Card className="dash-panel dash-insight">
      <h2 className="dash-panel-title dash-insight-title">
        <span className="dash-stat-ico dash-ico-week" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
          </svg>
        </span>
        Weekly Overview
      </h2>

      <dl className="dash-week-grid">
        {figures.map(({ value, label, now, was, unit }) => (
          <div className="dash-week-cell" key={label}>
            <dd>{value}</dd>
            <dt>{label}</dt>
            <Against now={now} was={was} unit={unit} />
          </div>
        ))}
      </dl>

      {/* Said once for all four, and only when there is a comparison to
          explain. "the same days" is the honest part: three days of this week
          are held against three of last, never against seven. */}
      {before && <p className="dash-week-vs-note">against the same days last week</p>}

      {/* A promise rather than a destination label.
          "View full analytics" names a page; it does not say why anybody would
          open it, and this card has just answered the question most readers
          came with. What is through the link is the part this card cannot do —
          the comparison, the pattern, the thing to change — and a reader who
          is never told that has no reason to find out. It is the only place
          outside the analytics page itself that says analytics exist. */}
      <Link className="dash-panel-link" to="/analytics">
        See what changed<span aria-hidden="true"> →</span>
      </Link>
      <p className="dash-panel-lede">
        Trends, what you repeat, and what to change next.
      </p>
    </Card>
  );
}

/* Top Priorities stood here: the day's three highest-priority tasks, ranked.
   It is gone because it was the panel above it read twice — the same rows from
   the same bucket, re-sorted, one screen lower, so on the common day of two or
   three tasks it was the task list again with numbers on it. The one thing it
   did that the list does not is order by priority, and that is a control the
   list should grow rather than a card of its own. The row it left is the
   goals card (./GoalsCard), which says something nothing else on the page
   does. */

// --------------------------------------------------------------------------
// Recent Activity
// --------------------------------------------------------------------------
export function RecentActivity({ entries }: { entries: Activity[] }) {
  return (
    <Card className="dash-panel dash-insight">
      <h2 className="dash-panel-title dash-insight-title">
        <span className="dash-stat-ico dash-ico-pulse" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12h4l3 8 4-16 3 8h6" />
          </svg>
        </span>
        Recent Activity
      </h2>

      {entries.length === 0 ? (
        <p className="dash-task-empty">Nothing completed yet.</p>
      ) : (
        <ul className="dash-activity-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <svg className="dash-activity-ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="m8.5 12 2.5 2.5 4.5-5" />
              </svg>
              <span className="dash-activity-name">
                Completed <strong>&ldquo;{entry.title}&rdquo;</strong>
              </span>
              <span className="dash-activity-xp">+{format.number(entry.xp)} XP</span>
              <span className="dash-activity-at">
                {timeText(entry.at)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Link className="dash-panel-link" to="/history">
        View all activity<span aria-hidden="true"> →</span>
      </Link>
    </Card>
  );
}
