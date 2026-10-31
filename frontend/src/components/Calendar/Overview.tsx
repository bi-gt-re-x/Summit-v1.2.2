/**
 * What the period on screen came to — the same figures, in the same order,
 * under the same words, at all three magnifications.
 *
 * The three views each grew their own version of this panel and each invented
 * its own vocabulary for it. Laid side by side they were:
 *
 *     Week   This Week Progress   Tasks · Completed · XP Earned
 *     Day    Daily Overview       Tasks · Focus Time · XP Earned · Streak
 *     Month  Monthly Overview     Tasks · Focus Time · XP Earned · Best Day
 *
 * — three names for the panel, two different meanings for "Tasks" (a count in
 * one, a fraction in the other two), a Focus Time the Week view did not have at
 * all, and three sets of markup to draw them in. A reader moving between the
 * views had to re-learn the column each time, and could not hold a day against
 * its week because the two were not saying the same thing.
 *
 * ## What is shared and what is not
 *
 * Two of the three tiles are fixed, because they are the two questions every
 * period answers: how much of what I planned did I finish, and what did it
 * earn. They read identically at every scale; only the
 * sub-line changes, and it changes to name the period, which is the one thing
 * that differs.
 *
 * The fourth is the view's own, and deliberately so. A day has a streak and a
 * month does not; a month has a best day and a day cannot. Forcing a fourth
 * shared figure would have meant either dropping all three or inventing one
 * nobody asked for — so the slot is a prop, and each view fills it with the
 * thing only it can say.
 *
 * `lead` is the same argument for the panel's head: the Week view opens with a
 * completion ring, which is its own and belongs above the tiles rather than
 * squeezed into one.
 *
 * Drawn by styles/calendar/overview.css, which all three views import.
 */
import type { ReactNode } from 'react';

/** Which period the panel is describing. Decides its title and its sub-lines. */
export type OverviewScale = 'day' | 'week' | 'month';

const TITLE: Record<OverviewScale, string> = {
  day: 'Today',
  week: 'This week',
  month: 'This month',
};

/**
 * The word each tile ends on.
 *
 * Sentence case and the period named outright, rather than the "Completed" /
 * "Total" / "of 6h planned" the three panels used between them: a sub-line
 * that says *what* is being counted and not *when* is the half of the label
 * that was already obvious.
 */
const WHEN: Record<OverviewScale, string> = {
  day: 'today',
  week: 'this week',
  month: 'this month',
};

export interface OverviewTile {
  /** One of the four colour tones in styles/calendar/overview.css. */
  tone: 'tasks' | 'xp' | 'extra';
  icon: ReactNode;
  label: string;
  /** A node, so a view can make one figure a field — see `focused` below. */
  value: ReactNode;
  sub: string;
}

export interface OverviewProps {
  scale: OverviewScale;
  /** Tasks landing in the period, and how many are done. */
  tasks: number;
  done: number;
  xp: number;
  /**
   * The view's own fourth figure: a streak, a best day, whatever only this
   * magnification can say. Omitted, the panel is two tiles and still reads.
   */
  extra?: Omit<OverviewTile, 'tone'>;
  /** Anything that belongs above the tiles — the Week view's ring. */
  lead?: ReactNode;
  /** Anything below them: a sparkline, a link. */
  children?: ReactNode;
}

/* Line icons rather than emoji, at one weight, so four tiles read as a set.
   They are inline here rather than in a sprite because there are four of them
   and a sprite is a second file to keep in step. */
const TASKS_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 11.5 11 13.5 15.5 9" />
    <rect x="4" y="4" width="16" height="16" rx="4" />
  </svg>
);
const XP_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m12 4 2.4 5 5.6.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.6-.8z" />
  </svg>
);

function Tile({ tone, icon, label, value, sub }: OverviewTile) {
  return (
    <div className={`cal-tile tone-${tone}`}>
      <span className="cal-tile-ico" aria-hidden="true">
        {icon}
      </span>
      <span className="cal-tile-label">{label}</span>
      <span className="cal-tile-value">{value}</span>
      <span className="cal-tile-sub">{sub}</span>
    </div>
  );
}

export function Overview({
  scale,
  tasks,
  done,
  xp,
  extra,
  lead,
  children,
}: OverviewProps) {
  return (
    <section className="wk-panel cal-overview">
      <h3 className="wk-panel-title">{TITLE[scale]}</h3>
      {lead}
      <div className="cal-tiles">
        {/* A fraction, at every scale. The Week view printed a bare count for
            Tasks and a second figure for Completed, which spends two of three
            tiles on one fact and still makes the reader do the division. */}
        <Tile
          tone="tasks"
          icon={TASKS_ICON}
          label="Tasks"
          value={`${done} / ${tasks}`}
          sub={tasks ? `done ${WHEN[scale]}` : `nothing on ${WHEN[scale]}`}
        />
        <Tile
          tone="xp"
          icon={XP_ICON}
          label="XP earned"
          value={xp.toLocaleString()}
          sub={WHEN[scale]}
        />
        {extra && <Tile tone="extra" {...extra} />}
      </div>
      {children}
    </section>
  );
}
