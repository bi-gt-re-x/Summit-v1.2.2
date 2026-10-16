/**
 * "What You'll Do Today" — the month view's right-hand column.
 *
 * The day's focus note is pinned above a scrolling list of cards. Events get a
 * clock icon and can be edited; tasks get a numbered badge, a difficulty pill
 * and — while they are unfinished — a name you can click to finish them. The
 * ring that counts the day off is not here: it belongs under the month grid,
 * in the other column (see DayProgress).
 *
 * The times on a card are only the ones the entry actually has. A to-do that
 * reached the day by being finished has no start, and shows a lone end rather
 * than an empty field beside a dash.
 *
 * The daily goal sits above the list, because it is what the list is *for*:
 * the cards say what there is to do and the bar says how much of the day's
 * target the finished ones have already bought. It is the same goal the
 * dashboard's XP panel and the settings page hold — one number, three places
 * that read it.
 */
import { useEffect, useState } from 'react';
import { xpToDifficulty, xpToPriority, type XpBand } from '@/utils/priority';
import type { DayEntry } from './entries';
import type { TaskPriority } from '@/types';

export interface DayPanelProps {
  entries: DayEntry[];
  /**
   * The account's daily XP target, and what this day has banked against it.
   *
   * Only meaningful on today — a goal is a thing about the day you are in —
   * so `goalDay` says whether to draw it at all rather than the panel guessing
   * from the entries.
   */
  goalXp: number;
  earnedXp: number;
  goalDay: boolean;
  focusText: string;
  onFocusChange: (text: string) => void;
  onAddEvent: () => void;
  onEditEvent: (entry: DayEntry) => void;
  onRemoveEvent: (entry: DayEntry) => void;
  onRenameEvent: (entry: DayEntry, name: string) => void;
  onRetimeEvent: (entry: DayEntry, field: 'startTime' | 'endTime', value: string) => void;
  onComplete: (taskId: string) => void;
  completingId?: string | null;
  /**
   * Start the focus session. Drawn on the first unfinished task of the day and
   * nowhere else: a Start on every card is six ways to begin the same one
   * timer, and the next thing is the only one anybody means.
   *
   * The session is the account's, not the task's — the same one the dashboard's
   * Focus panel and the Day view's ring drive. Nothing here claims otherwise.
   */
  onStart?: () => void;
  /** Whether that session is already running, which makes Start a no-op. */
  focusRunning?: boolean;
  /**
   * A card has been picked up, and put down again.
   *
   * The month grid beside this list is the drop target — the coarse gesture a
   * month view is for is "this goes on the 14th", and until now the only way
   * to say it was to open the day, delete the thing and make it again on the
   * other one. Absent when nothing can be dropped anywhere, and the cards are
   * then not draggable at all rather than draggable onto nothing.
   */
  onDragEntry?: (entry: DayEntry) => void;
  onDragEnd?: () => void;
  /**
   * The same move, asked for rather than performed.
   *
   * A drag is a pointer gesture and nothing else, so a card that can only be
   * moved by dragging cannot be moved at all by a reader using a keyboard.
   * This puts the same thing in the menu that is already on the card: it arms
   * the grid, and the next day picked there is where the card goes.
   */
  onMoveEntry?: (entry: DayEntry) => void;
}

/**
 * The band a card is labelled with, and the tone it is drawn in.
 *
 * Two values because there are now two scales and they are different sizes.
 * The **band** is one of six words — Easy through Very Challenging — and it is
 * a fact about the XP, so it is always read off the XP. The **tone** is the
 * three-value priority the card is coloured by, and that still prefers the
 * task's own `priority` column, so a card cannot be tinted one way here and
 * another way on the grid or in the Week view's chart.
 *
 * The card used to return one word for both, which worked while the two scales
 * had the same three steps. Six band names cannot come out of a three-value
 * column, so a task worth 210 XP would have read "High" — true of its priority
 * and no longer the name of its band. An event has no priority column, so its
 * tone is read off the XP as well.
 */
function difficulty(xp: number, priority?: string): { band: XpBand; tone: TaskPriority } {
  const tone: TaskPriority =
    priority === 'high' || priority === 'medium' || priority === 'low'
      ? priority
      : xpToPriority(xp);
  return { band: xpToDifficulty(xp), tone };
}

/**
 * "07:30 AM" — a stored `HH:MM` as the card prints it.
 *
 * The card used to hand the string to a disabled `<input type="time">` and let
 * the browser format it, which draws its own spinner chrome and clips the
 * meridiem off the end in a narrow column. Empty in, empty out: a to-do that
 * reached the day by being finished has no start and shows only an end.
 */
function clockLabel(value: string): string {
  const [hours, minutes] = String(value || '').split(':');
  const hour = Number(hours);
  if (!Number.isFinite(hour) || minutes === undefined) return '';
  const suffix = hour < 12 ? 'AM' : 'PM';
  const clock = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(clock).padStart(2, '0')}:${minutes.slice(0, 2)} ${suffix}`;
}

function EventIcon() {
  return (
    <span className="event-icon">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5V12l3 1.8" />
      </svg>
    </span>
  );
}

function CheckIcon({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function DayPanel({
  entries,
  goalXp,
  earnedXp,
  goalDay,
  focusText,
  onFocusChange,
  onAddEvent,
  onEditEvent,
  onRemoveEvent,
  onRenameEvent,
  onRetimeEvent,
  onComplete,
  completingId,
  onStart,
  focusRunning = false,
  onDragEntry,
  onDragEnd,
  onMoveEntry,
}: DayPanelProps) {
  let taskNumber = 0;
  let nextClaimed = false;

  // Only one card's menu is open at a time, and a click anywhere else closes
  // it — including a click on one of its own items, which has already acted.
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenu]);

  return (
    <div className="calendar-right">
      <div className="calendar-bottom-section">
        <div className="calendar-bottom-box full-width">
          <div className="day-panel-head">
            <h3>Today&apos;s plan</h3>
            {/* The original only ever made an event by dragging a slot on the
                week grid, which left the month view with no way to add one at
                all. It has one now. */}
            <button type="button" className="dp-add" onClick={onAddEvent}>
              + Add
            </button>
          </div>

          {/* What the day is worth against what it is meant to be worth. Drawn
              only on today: on any other day the bar would be measuring a
              finished day against a target nobody was holding at the time. */}
          {goalDay && goalXp > 0 && (
            <div className="dp-goal">
              <span className="dp-goal-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="8.5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="12" cy="12" r="1" />
                </svg>
              </span>
              <span className="dp-goal-main">
                <span className="dp-goal-row">
                  <span className="dp-goal-label">Daily goal</span>
                  <span className="dp-goal-figs">
                    <strong>{earnedXp.toLocaleString()}</strong> / {goalXp.toLocaleString()} XP
                  </span>
                </span>
                <span className="dp-goal-track">
                  <i
                    className={`dp-goal-fill${earnedXp >= goalXp ? ' is-met' : ''}`}
                    style={{ width: `${Math.min(100, Math.round((earnedXp / goalXp) * 100))}%` }}
                  />
                </span>
              </span>
            </div>
          )}

          <div className="daily-focus-holder">
            <input
              type="text"
              className="daily-focus-input"
              placeholder="Today's focus..."
              value={focusText}
              onChange={(event) => onFocusChange(event.target.value)}
            />
          </div>

          {/* month.css dresses the list and the ring by id, so both keep the
              ones they have always had. */}
          <ul id="dailyTasks">
            {entries.length === 0 && (
              <li className="no-events-message">Nothing scheduled yet</li>
            )}

            {entries.map((entry) => {
              const isTask = entry.kind === 'task';
              if (isTask) taskNumber += 1;

              const canComplete = isTask && !entry.completed && Boolean(entry.taskId);
              /* The first thing still to do. `nextUp` is claimed once and then
                 stays claimed, so exactly one card carries the Start. */
              const isNext = canComplete && !nextClaimed;
              if (isNext) nextClaimed = true;
              const level = difficulty(entry.xp, entry.priority);
              const classes = [
                'task-section',
                isTask ? 'dashboard-task' : 'calendar-event',
                isTask ? `priority-${level.tone}` : '',
                entry.completed ? 'task-completed' : 'task-in-progress',
                entry.hasConflict && !isTask ? 'conflict' : '',
                canComplete ? 'can-complete' : '',
                completingId && completingId === entry.taskId ? 'is-completing' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                // The colour family rides on the card; the tint, the edge and
                // the left accent come from styles/calendar/palette.css. The
                // `priority-*` class no longer paints anything — difficulty is
                // the word in the pill above the title and nowhere a colour.
                <li
                  className={classes}
                  data-family={entry.family}
                  key={entry.key}
                  /* A finished thing does not move. Rescheduling something you
                     have already done is not a plan, it is a lie about when it
                     happened — and the XP is already banked on the day it was
                     banked on. */
                  draggable={Boolean(onDragEntry) && !entry.completed}
                  onDragStart={(event) => {
                    if (!onDragEntry) return;
                    /* Firefox will not start a drag without a payload, and
                       the text is what a drop outside the app would paste —
                       so it says what the thing is rather than an id. */
                    event.dataTransfer.setData('text/plain', entry.name);
                    event.dataTransfer.effectAllowed = 'move';
                    onDragEntry(entry);
                  }}
                  onDragEnd={() => onDragEnd?.()}
                >
                  {!isTask && <EventIcon />}

                  <div className="card-body">
                    {isTask && (
                      <div className="card-tags">
                        <span className="task-kind-badge">Task {taskNumber}</span>
                        {/* The band, on its own. It used to print
                            "{level} Priority", which was already naming a
                            difficulty badge after the priority scale and reads
                            as nonsense against the six bands — "Very
                            Challenging Priority". The colour still carries the
                            priority; this carries the band. */}
                        <span className={`difficulty-badge difficulty-${level.tone}`}>
                          {level.band}
                        </span>
                      </div>
                    )}

                    {/* A task's name is text and an event's is a field, which
                        is what each of them actually is. The task's was an
                        `<input readOnly>` — a box with a caret and no ellipsis,
                        pretending to be editable and looking like a form on a
                        card that is not one. */}
                    {isTask ? (
                      <span
                        className="task-title"
                        role={canComplete ? 'button' : undefined}
                        tabIndex={canComplete ? 0 : undefined}
                        title={canComplete ? 'Click to mark complete' : entry.name}
                        onClick={() => {
                          if (canComplete && entry.taskId) onComplete(entry.taskId);
                        }}
                        onKeyDown={(event) => {
                          if (!canComplete || !entry.taskId) return;
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          onComplete(entry.taskId);
                        }}
                      >
                        {entry.name}
                      </span>
                    ) : (
                      <input
                        type="text"
                        className="task-input-inline"
                        value={entry.name}
                        placeholder="What will you do..."
                        onChange={(event) => onRenameEvent(entry, event.target.value)}
                      />
                    )}

                    {/* The card's foot: the times on the left, what to do
                        about it on the right. Both used to float over this row
                        absolutely, which meant every card carried a
                        `padding-right` guessed against the width of a word —
                        and a card in a narrower column ran one under the
                        other. A row cannot overlap itself. */}
                    <div className="card-foot">
                      <div className="timestamp-section">
                        {/* A task's times are plain text, because a task's
                            times are not editable here — a disabled
                            `<input type="time">` draws the browser's own
                            spinner chrome and clips "07:30 AM" to "07:30 A"
                            the moment the column narrows. An event's stay
                            fields, because an event's times *are* editable. */}
                        {isTask ? (
                          <span className="task-times">
                            {clockLabel(entry.startTime)}
                            {entry.startTime && entry.endTime && (
                              <span className="task-times-dash">-</span>
                            )}
                            {clockLabel(entry.endTime)}
                          </span>
                        ) : (
                          <>
                            {entry.startTime && (
                              <input
                                type="time"
                                className="start-time"
                                value={entry.startTime}
                                onChange={(event) =>
                                  onRetimeEvent(entry, 'startTime', event.target.value)
                                }
                              />
                            )}
                            {entry.startTime && entry.endTime && <span>-</span>}
                            {entry.endTime && (
                              <input
                                type="time"
                                className="end-time"
                                value={entry.endTime}
                                onChange={(event) =>
                                  onRetimeEvent(entry, 'endTime', event.target.value)
                                }
                              />
                            )}
                          </>
                        )}
                      </div>

                      {isTask && entry.completed && (
                        <span className="completed-badge">
                          Completed <CheckIcon className="completed-check" />
                        </span>
                      )}
                      {isNext && onStart ? (
                        <button
                          type="button"
                          className="dp-start"
                          onClick={(event) => {
                            event.stopPropagation();
                            onStart();
                          }}
                        >
                          {focusRunning ? 'Focusing' : 'Start'}
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M8 5.5v13l11-6.5z" />
                          </svg>
                        </button>
                      ) : (
                        canComplete && (
                          <span className="complete-hint">
                            Mark complete <CheckIcon className="completed-check" />
                          </span>
                        )
                      )}
                    </div>
                  </div>

                  {/* Events can be edited; a task's card can only be taken off
                      the day, because the task itself belongs to the database. */}
                  <div className="card-menu-wrap">
                    <button
                      type="button"
                      className="card-menu-btn"
                      aria-label="More options"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenMenu((current) => (current === entry.key ? null : entry.key));
                      }}
                    >
                      ⋮
                    </button>
                    <div className={`card-menu${openMenu === entry.key ? ' open' : ''}`}>
                      {!isTask && (
                        <button
                          type="button"
                          className="card-menu-item"
                          onClick={() => onEditEvent(entry)}
                        >
                          Edit
                        </button>
                      )}
                      {/* Same rule as the drag: a finished thing does not
                          move, so the item is not offered on one. */}
                      {onMoveEntry && !entry.completed && (
                        <button
                          type="button"
                          className="card-menu-item"
                          onClick={() => onMoveEntry(entry)}
                        >
                          Move to a day…
                        </button>
                      )}
                      <button
                        type="button"
                        className="card-menu-item"
                        onClick={() => onRemoveEvent(entry)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {entry.subtasks && entry.subtasks.length > 0 && (
                    <ul className="subtasks-list">
                      {entry.subtasks.map((subtask, subIndex) => {
                        const text = typeof subtask === 'string' ? subtask : subtask.text;
                        return (
                          <li className="subtask-item" key={`${entry.key}-sub-${subIndex}`}>
                            <span className="bullet">•</span>
                            <input
                              type="text"
                              className="subtask-input"
                              value={text}
                              readOnly
                            />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

    </div>
  );
}
