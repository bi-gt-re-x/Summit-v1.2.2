/**
 * The Day view's right-hand column: the month, what is next, how the day is
 * booked, the day's numbers, and what is left to do.
 *
 * Everything here answers a question the grid beside it is bad at. A column of
 * blocks says *when* very well and says "how much of my day is spoken for",
 * "what happens next" and "is it worth staying at the desk" not at all — and
 * those are the three things somebody looking at today actually wants. The
 * arithmetic is in utils/dayShape, so the panels here are only the drawing.
 *
 * Focus Time is the one number that changes meaning with the day. On today it
 * *is* the focus goal — the same one the dashboard's Focus panel sets — and
 * clicking it lets you type a new one, so the two pages can never disagree. On
 * any other day there is no goal to speak of, so it shows what that day has
 * been planned to hold, and is read-only.
 */
import { useState } from 'react';
import { MiniMonth } from './MiniMonth';
import { Overview } from './Overview';
import type { DayLoad } from '@/utils/calendarBusy';
import { iconUrlFor } from '@/utils/calendarIcons';
import { bandStyle, hourLabel, spanLabel, type DayShape } from '@/utils/dayShape';
import type { TaskBlock } from '@/utils/calendarGrid';

export interface DayStats {
  /** The day's tasks, and how many are done — not a rendered "2 / 5".
      The shared overview writes the fraction, so every view writes it alike. */
  tasks: number;
  done: number;
  /** Already formatted: "1h 30m". */
  focusTime: string;
  /** Null while the ledger is still being asked. */
  xp: number | null;
  streak: number;
}

export interface DaySidebarProps {
  miniYear: number;
  miniMonth: number;
  selectedIso: string;
  /** The day the account's weeks open on — see MiniMonth. */
  weekStart: 0 | 1;
  /** Which days of the month on show have anything on them. See MiniMonth. */
  miniLoad?: DayLoad;
  onMiniStep: (delta: number) => void;
  onPickDate: (iso: string) => void;

  /** The shared focus session, as the dashboard's panel reports it. */
  focus: { focused: string; goal: string; percent: number };
  /** Only today's goal can be typed into. */
  goalEditable: boolean;
  onSetGoalHours: (hours: number) => void;

  stats: DayStats;
  /**
   * What the day comes to — see utils/dayShape. The two panels it feeds are
   * the ones the grid cannot answer: what is next, and where the room is.
   */
  shape: DayShape;
  /** True on today, which is the only day "next" and "now" mean anything on. */
  isToday: boolean;
  /** The day's unfinished blocks, earliest first. Five are shown. */
  pending: TaskBlock[];
  onComplete: (taskId: string) => void;
  completingId?: string | null;
  onAddTask: () => void;
}

/** "2h", "1h 30m" or "45m" back to hours; anything unreadable is rejected. */
function parseGoalHours(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  const hoursAndMinutes = /^(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)\s*m?)?$/.exec(text);
  if (hoursAndMinutes) {
    return Number(hoursAndMinutes[1]) + Number(hoursAndMinutes[2] ?? 0) / 60;
  }
  const minutesOnly = /^(\d+)\s*m$/.exec(text);
  if (minutesOnly) return Number(minutesOnly[1]) / 60;

  const bare = Number(text);
  return Number.isFinite(bare) ? bare : null;
}

export function DaySidebar({
  miniYear,
  miniMonth,
  selectedIso,
  weekStart,
  miniLoad,
  onMiniStep,
  onPickDate,
  focus,
  goalEditable,
  onSetGoalHours,
  stats,
  shape,
  isToday,
  pending,
  onComplete,
  completingId,
  onAddTask,
}: DaySidebarProps) {
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalText, setGoalText] = useState('');

  const commitGoal = () => {
    const hours = parseGoalHours(goalText);
    if (hours !== null) onSetGoalHours(hours);
    setEditingGoal(false);
  };

  return (
    <aside className="day-sidebar" id="daySidebar">
      <MiniMonth
        year={miniYear}
        month={miniMonth}
        selectedIso={selectedIso}
        weekStart={weekStart}
        load={miniLoad}
        onStep={onMiniStep}
        onPick={onPickDate}
      />

      <section className="wk-panel">
        <div className="day-panel-head">
          <h3 className="wk-panel-title">Focus</h3>
        </div>
        <div className="day-focus-row">
          <span className="day-focus-icon">
            <i
              className="cal-ico"
              style={{
                ['--ico' as string]: `url(${iconUrlFor('focus')})`,
                width: '18px',
                height: '18px',
              }}
            />
          </span>
          <div className="day-focus-main">
            <div className="day-focus-name">Deep Work</div>
            <div className="day-focus-sub">{focus.focused}</div>
          </div>
          <div className="day-focus-time">{focus.goal}</div>
        </div>
        <div className="day-focus-barrow">
          <span>Today&apos;s focus time</span>
          <span className="day-focus-pct">{focus.percent}%</span>
        </div>
        <div className="wk-progress">
          <div className="wk-progress-bar" style={{ width: `${focus.percent}%` }} />
        </div>
      </section>

      {/* ---- What is next -------------------------------------------------
          The grid draws every block and leaves the reader to find the one that
          matters right now against a red line. This says it. On a day that is
          not today there is no "now", so it names the day's first thing
          instead — which is the same question asked of a day you are
          planning rather than living. */}
      {shape.next && (
        <section className="wk-panel day-next">
          <div className="day-panel-head">
            <h3 className="wk-panel-title">{isToday ? 'Up next' : 'Starts the day'}</h3>
            <span className="day-next-when">
              {!isToday || shape.next.away === 0
                ? hourLabel(shape.next.start)
                : `in ${spanLabel(shape.next.away)}`}
            </span>
          </div>
          <div className={`day-next-card${shape.next.running ? ' is-running' : ''}`}>
            <span className="day-next-icon">
              <i
                className="cal-ico"
                style={{ ['--ico' as string]: `url(${iconUrlFor(shape.next.title)})` }}
              />
            </span>
            <div className="day-next-main">
              <div className="day-next-name">{shape.next.title}</div>
              <div className="day-next-sub">
                {hourLabel(shape.next.start)} – {hourLabel(shape.next.end)}
                {shape.next.running && isToday ? ' · on now' : ''}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ---- Where the room is ---------------------------------------------
          One band from the day's first start to its last end, with the booked
          runs drawn on it — overlaps merged, so what is left really is left.
          The sentence under it is about the gap rather than the total, because
          the total is a tile in the panel below and saying it twice would make
          this a picture of a number the reader has already read. */}
      {shape.bands.length > 0 && (
        <section className="wk-panel">
          <div className="day-panel-head">
            <h3 className="wk-panel-title">How the day is booked</h3>
            <span className="day-band-span">
              {hourLabel(shape.from)} – {hourLabel(shape.to)}
            </span>
          </div>
          <div className="day-band" role="img" aria-label={`${spanLabel(shape.booked)} booked between ${hourLabel(shape.from)} and ${hourLabel(shape.to)}`}>
            {shape.bands.map((band) => (
              <span
                key={`${band.start}-${band.end}`}
                className={`day-band-run${band.done ? ' is-done' : ''}`}
                style={bandStyle(shape, band)}
              />
            ))}
          </div>
          <p className="day-band-note">
            {shape.gapAt !== null && shape.gap >= 0.5 ? (
              <>
                Longest clear stretch: <strong>{spanLabel(shape.gap)}</strong> from{' '}
                {hourLabel(shape.gapAt)}.
              </>
            ) : (
              <>Back to back — nothing clear between the two ends.</>
            )}
          </p>
        </section>
      )}

      {/* The panel all three views share — components/Calendar/Overview.tsx.
          This one was six `.wk-stat` blocks under the heading "Daily Overview",
          answering the same three questions as the Week and Month columns in
          different words and a different shape. Three of the six were those
          questions and have gone into the shared panel; the streak is the
          view's own fourth, and the two below it are the two things only a
          single day can be asked — what is still on the table, and how much of
          the day is already spoken for. */}
      <Overview
        scale="day"
        tasks={stats.tasks}
        done={stats.done}
        /* On today this is the goal the reader set rather than what the grid
           holds; `Booked` below is the grid. The Day view has always drawn the
           distinction and the tile keeps it. */
        focused={
          editingGoal ? (
            <input
              type="text"
              value={goalText}
              autoFocus
              onChange={(event) => setGoalText(event.target.value)}
              onBlur={commitGoal}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitGoal();
                if (event.key === 'Escape') setEditingGoal(false);
              }}
            />
          ) : (
            <span
              className={goalEditable ? 'is-editable' : undefined}
              title={goalEditable ? 'Click to set your focus time' : ''}
              onClick={() => {
                if (!goalEditable || editingGoal) return;
                setGoalText(stats.focusTime);
                setEditingGoal(true);
              }}
            >
              {stats.focusTime}
            </span>
          )
        }
        planned={focus.goal}
        xp={stats.xp ?? 0}
        extra={{
          icon: (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9z" />
            </svg>
          ),
          label: 'Streak',
          value: String(stats.streak),
          sub: stats.streak === 1 ? 'day running' : 'days running',
        }}
      >
        <div className="wk-stats day-stats cal-overview-extra">
          {/* The other half of XP earned, and the one that is about the rest of
              the day rather than the part already behind you. */}
          <div className="wk-stat">
            <div className="wk-stat-label">Still to earn</div>
            <div className="wk-stat-num day-stat-purple">
              {shape.onTheTable.toLocaleString()}
            </div>
            <div className="wk-stat-sub">
              {shape.left === 1 ? 'in 1 task' : `across ${shape.left} tasks`}
            </div>
          </div>
          <div className="wk-stat">
            <div className="wk-stat-label">Booked</div>
            <div className="wk-stat-num">{shape.booked > 0 ? spanLabel(shape.booked) : '—'}</div>
            <div className="wk-stat-sub">of the day</div>
          </div>
        </div>
      </Overview>

      <section className="wk-panel">
        <div className="day-panel-head">
          <h3 className="wk-panel-title">Tasks Left</h3>
          <span className="day-panel-link" role="button" tabIndex={0} onClick={onAddTask}>
            + Add Task
          </span>
        </div>
        <ul className="day-tasks-left">
          {pending.length === 0 ? (
            <li className="day-tasks-empty">Nothing left — you’re all caught up.</li>
          ) : (
            pending.slice(0, 5).map((block) => {
              const priority = String(block.priority || '').toLowerCase();
              const className =
                priority === 'high' ? 'high' : priority === 'medium' ? 'med' : 'low';
              const label = priority
                ? priority.charAt(0).toUpperCase() + priority.slice(1)
                : '—';

              const busy = completingId === block.id;

              return (
                <li
                  key={block.id}
                  className={`day-task-item${busy ? ' is-completing' : ''}`}
                  data-id={block.id}
                >
                  {/* The ring is the control, and for a long time it was a
                      decoration: a circle the exact size and shape of a
                      checkbox, beside a task, that did nothing when clicked.
                      The only thing that finished the task was clicking its
                      *name*, which nobody guesses and which reads as a link to
                      somewhere. Both work now, and this is the one that looks
                      like what it does. */}
                  <button
                    type="button"
                    className="day-task-ring"
                    role="checkbox"
                    aria-checked={false}
                    aria-label={`Mark “${block.title}” complete`}
                    title="Mark complete"
                    disabled={busy}
                    onClick={() => onComplete(block.id)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  </button>
                  <i
                    className="cal-ico"
                    style={{ ['--ico' as string]: `url(${iconUrlFor(block.title)})` }}
                  />
                  <span
                    className="day-task-name wk-task-name"
                    role="button"
                    tabIndex={0}
                    title="Mark complete"
                    onClick={() => onComplete(block.id)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      onComplete(block.id);
                    }}
                  >
                    {block.title}
                  </span>
                  <span className="day-task-xp">+{(Number(block.xp) || 0).toLocaleString()}</span>
                  <span className={`day-task-diff ${className}`}>{label}</span>
                </li>
              );
            })
          )}
        </ul>
      </section>
    </aside>
  );
}
