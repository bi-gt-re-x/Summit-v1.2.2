/**
 * The Day view — one column of the same grid, and what the day amounts to.
 *
 * Ported from the `renderDay` half of calendar-week.js
 * (calendar-day.js was already a no-op pointing there) and the `#dayView` part
 * of the calendar.html template. The column is built by the same code as a
 * Week column, so the two views cannot disagree about what a day holds.
 *
 * The sidebar is where this view earns its place. The mini-month keeps its own
 * cursor so you can look ahead without leaving the day; Focus Time *is* the
 * dashboard's focus goal on today and this day's planned block time on any
 * other; and XP Earned comes from the ledger, so it means "since midnight"
 * rather than "since something last recomputed".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarShell,
  ConflictDialog,
  CreateChooser,
  DayColumn,
  DaySidebar,
  TimeLabels,
  minutesToTime,
} from '@/components/Calendar';
import { BlockDialogs } from '@/components/Calendar/BlockDialogs';
import { RatePrompt } from '@/components/Tasks';
import { ErrorState, Loading, RefreshButton } from '@/components';
import {
  useCalendarCursor,
  useCalendarKeys,
  useCalendarStore,
  useCalendarTasks,
  useDayFocus,
  useDocumentTitle,
  useNow,
  useNowScroll,
  useSettings,
  useSubjectIndex,
} from '@/hooks';
import { useBlockActions } from '@/hooks/useBlockActions';
import { busyDays } from '@/utils/calendarBusy';
import { planFamilies, weekOf } from '@/utils/calendarFamilies';
import { dayShape } from '@/utils/dayShape';
import {
  useGridDrag,
  type DraggedSlot,
  type DroppedBlock,
} from '@/hooks/useGridDrag';
import { fmtHM, useFocusSession } from '@/hooks/useFocusSession';
import {
  MAX_DAY_FOCUSES,
  focusList,
  joinFocuses,
} from '@/hooks/useDayFocus';
import { events as eventService } from '@/services';
import { weekStartDay } from '@/services/settings';
import { dates } from '@/utils';
import { iconUrlFor } from '@/utils/calendarIcons';
import {
  blockLabel,
  blockWhen,
  dayEventBlocks,
  dayTaskBlocks,
  hmLabel,
  layOut,
  nowOffset,
  type Block,
  type TaskBlock,
} from '@/utils/calendarGrid';
import { monthKey } from '@/utils/calendarStore';
/* The frame, the dialogs, then the two sheets this view is made of: the time
   grid is week.css, because a day is one column of the week's, and everything
   around it is day.css. Colour last, as everywhere. */
import '@/styles/calendar/shell.css';
import '@/styles/calendar/dialogs.css';
import '@/styles/calendar/overview.css';
import '@/styles/calendar/week.css';
import '@/styles/calendar/day.css';
import '@/styles/calendar/palette.css';
import { Icon } from '@/components/Icon';

/** "Friday, August 1, 2026". */
function dayTitle(date: Date): string {
  return dates.formatDate(date, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function Day() {
  useDocumentTitle('Calendar · Day');

  const account = useCalendarTasks();
  const {
    tasks,
    stats,
    username,
    loading,
    hasData,
    refreshing,
    error,
    refresh,
    completing,
    complete,
    rating,
    ratingDepth,
    saveRating,
    closeRating,
  } = account;
  const store = useCalendarStore(username);
  const dayFocus = useDayFocus(username);
  const session = useFocusSession(username);
  const subjects = useSubjectIndex(username);
  const now = useNow();
  const { prefs } = useSettings();

  /**
   * `?date=` and `?task=` — the day somebody was sent to, and what for.
   *
   * The top bar's search takes a task to where the task actually *is*, and for
   * a task the calendar draws that is a day rather than a list
   * (components/Search/Panel.tsx). So this view has to be openable on a day
   * that is not today, and has to be able to find one block in a grid
   * twenty-four hours tall.
   *
   * The day used to be `useState`, seeded from `?date=` at mount and re-synced
   * from it by an effect. It is read straight off the URL now — the parameter
   * is the state, not a hint about it — which is what lets the Week and Month
   * views share it (hooks/useCalendarCursor) and what makes stepping between
   * two search matches on one mounted page an ordinary re-render rather than
   * an effect chasing a prop.
   */
  const [params, setParams] = useSearchParams();
  const wanted = params.get('task');
  const { date: cursor, iso, goTo } = useCalendarCursor();

  /** The mini-month's own cursor: paging it does not move the day. */
  const [mini, setMini] = useState(() => ({
    year: cursor.getFullYear(),
    month: cursor.getMonth(),
  }));
  const [xpEarned, setXpEarned] = useState<number | null>(null);

  const actions = useBlockActions(username, store, tasks, account);
  const scroller = useRef<HTMLDivElement>(null);

  const todayIso = dates.isoDate(now);
  const isToday = iso === todayIso;

  /** Opening the day lands on the current hour — see hooks/useNowScroll. */
  const centerOnNow = useNowScroll(scroller, !loading && isToday);

  /**
   * The day's focuses, as the row above the grid is editing them.
   *
   * Held here rather than read straight off the store on every render, because
   * the two disagree about one thing on purpose: an empty field. The store
   * keeps a *list of focuses* and drops blanks, so a row the reader has just
   * opened with + is not in it and would vanish from under the cursor before
   * they could type into it. This is the editor's version, which keeps it.
   *
   * They are re-seeded whenever the store says something the row does not
   * already say — a different day, or the account's notes arriving from the
   * server. Writing through does not trip that: what comes back is what was
   * just sent, so a half-opened blank row survives its own keystroke.
   */
  const stored = dayFocus.get(iso);
  const [focuses, setFocuses] = useState<string[]>(() => {
    const list = focusList(stored);
    return list.length ? list : [''];
  });

  useEffect(() => {
    if (joinFocuses(focuses) === stored) return;
    const list = focusList(stored);
    setFocuses(list.length ? list : ['']);
    // `focuses` is read but deliberately not a dependency: it is the thing
    // being corrected, and depending on it would re-run this on every
    // keystroke to conclude that nothing needs correcting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, stored]);

  // The next list is worked out before anything is set, rather than inside the
  // updater: writing to the store is a side effect, and an updater React is
  // free to call twice is not the place for one.
  const writeFocus = useCallback(
    (index: number, value: string) => {
      const next = focuses.map((item, at) => (at === index ? value : item));
      setFocuses(next);
      dayFocus.setList(iso, next);
    },
    [dayFocus, focuses, iso],
  );

  /** An empty field the reader can type into. Nothing is stored until they do. */
  const addFocus = useCallback(() => {
    if (focuses.length >= MAX_DAY_FOCUSES) return;
    setFocuses([...focuses, '']);
  }, [focuses]);

  const dropFocus = useCallback(
    (index: number) => {
      const kept = focuses.filter((_, at) => at !== index);
      // A day always offers a first field, even with nothing written in it.
      const next = kept.length ? kept : [''];
      setFocuses(next);
      dayFocus.setList(iso, next);
    },
    [dayFocus, focuses, iso],
  );

  /* Moving the day re-syncs the mini-month to that day's month.
     The cursor itself is the URL's, so this is the only thing left to do when
     it changes — and it is done as an effect rather than inside `goTo` because
     the day can now move without this view asking it to: the switcher arrives
     from a week or a month carrying `?date=`, and the mini-month has to follow
     that as well as a press of the arrows. */
  useEffect(() => {
    setMini({ year: cursor.getFullYear(), month: cursor.getMonth() });
  }, [cursor]);

  /**
   * `?task=` — scroll the grid to the block and mark it for a moment.
   *
   * The grid is twenty-four hours tall and opens on the current hour
   * (hooks/useNowScroll), so arriving on the right *day* is not the same as
   * arriving at the thing. The block is found by the attributes it already
   * carries — `data-kind` and `data-id` on components/Calendar/GridBlock —
   * rather than by threading a ref down through the column.
   *
   * The scroll itself is below the day's blocks, because it has to wait for
   * them — see the note there.
   */
  const [marked, setMarked] = useState<string | null>(null);

  useEffect(() => {
    setMarked(wanted);
  }, [wanted, iso]);

  // XP is the ledger's answer for this date, re-asked whenever the day
  // changes or a completion has just moved the total.
  useEffect(() => {
    if (!username) return;
    let live = true;
    setXpEarned(null);
    void eventService.xpEarnedOn(iso).then((result) => {
      if (live) setXpEarned(result.success ? Number(result.xp_earned) || 0 : 0);
    });
    return () => {
      live = false;
    };
  }, [completing, iso, username]);

  // One colour plan for the whole week, so nothing on it shares a family until
  // the week has more than twelve distinct things on it — and so the Day view
  // and the Week view agree, both planning the same seven days. See
  // utils/calendarFamilies.
  const plan = useMemo(
    () => planFamilies(weekOf(iso), tasks, store.data),
    [iso, store.data, tasks],
  );

  const { blocks, conflict } = useMemo(
    () =>
      layOut([
        ...dayTaskBlocks(iso, tasks, subjects, plan),
        ...dayEventBlocks(iso, store.data, plan),
      ]),
    [iso, plan, store.data, subjects, tasks],
  );

  /**
   * The `?task=` half: scroll the grid to the block, then let the mark go.
   *
   * `blocks` is a dependency and that is the whole reason this sits below
   * them: the day's blocks arrive with the account's tasks, a frame or several
   * after the page does, so the first run finds nothing in the grid to scroll
   * to. Depending on them means it runs again when there is — and the two and
   * a half seconds the ring is up start from then rather than from an empty
   * grid.
   */
  useEffect(() => {
    if (!marked || !scroller.current) return;
    const frame = window.requestAnimationFrame(() => {
      const block = scroller.current?.querySelector<HTMLElement>(
        `[data-kind="task"][data-id="${CSS.escape(marked)}"]`,
      );
      if (!block || !scroller.current) return;
      /* Centred in the scroller by hand rather than with `scrollIntoView`: the
         grid is a scroll container inside a page that also scrolls, and asking
         the element to bring itself into view moves both. */
      scroller.current.scrollTop = Math.max(
        0,
        block.offsetTop - scroller.current.clientHeight / 2 + block.offsetHeight / 2,
      );
    });
    const timer = window.setTimeout(() => {
      setMarked(null);
      /* The parameters go with the mark. Left in the URL they would re-scroll
         on every reload, and `date` would pin the view to a day the reader has
         since walked away from. Replaced, so neither becomes a history entry. */
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete('task');
          next.delete('date');
          return next;
        },
        { replace: true },
      );
    }, 2400);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [blocks, marked, setParams]);

  /**
   * Scroll the clashing pair into the middle of the window.
   *
   * One column here rather than seven, but the same problem: the clash can be
   * at an hour the reader has not scrolled to, and a dialog naming two blocks
   * they cannot see is a question they cannot answer. The pair are ringed too —
   * `flagged` on the column below.
   */
  const revealConflict = useCallback(() => {
    const box = scroller.current;
    if (!box || !conflict) return;
    const top = Math.min(conflict[0].top, conflict[1].top);
    const bottom = Math.max(
      conflict[0].top + conflict[0].height,
      conflict[1].top + conflict[1].height,
    );
    box.scrollTo({
      top: Math.max(0, (top + bottom) / 2 - box.clientHeight / 2),
      behavior: 'smooth',
    });
  }, [conflict]);

  /** Every task that belongs to this day, finished or not. */
  const tally = useMemo(() => {
    let total = 0;
    let done = 0;
    tasks.forEach((task) => {
      const when = task.due_date || task.created_at;
      if (!when || dates.isoDate(new Date(when)) !== iso) return;
      total += 1;
      if (task.status === 'done') done += 1;
    });
    return { total, done };
  }, [iso, tasks]);

  /**
   * Focus Time. On today it is the goal the dashboard's panel sets — the same
   * number, editable in both places. On any other day there is no goal to
   * speak of, so it is what that day has been planned to hold.
   */
  const plannedHours = blocks.reduce((sum, block) => sum + (block.end - block.start), 0);
  const focusTime = isToday
    ? fmtHM(session.goalHours * 3600)
    : fmtHM(plannedHours * 3600);

  const pending = useMemo(
    () =>
      blocks
        .filter((block): block is TaskBlock => block.kind === 'task' && !block.done)
        .sort((a, b) => a.start - b.start),
    [blocks],
  );

  /**
   * What the day comes to, for the sidebar's two new panels.
   *
   * `now` is a grid hour on today and null on any other day — see
   * utils/dayShape, which is where the arithmetic lives. The minute is in the
   * dependency by way of `now`, so "in 25 minutes" counts down rather than
   * standing still until something else re-renders the page.
   */
  const shape = useMemo(
    () =>
      dayShape(
        blocks,
        isToday ? now.getHours() + now.getMinutes() / 60 : null,
      ),
    [blocks, isToday, now],
  );

  const openFor = useCallback(
    (block: Block, intent: 'edit' | 'delete') => {
      if (block.kind === 'event') {
        const section = store.data[monthKey(iso)]?.timestamps.find(
          (entry) =>
            entry.task === block.name &&
            entry.startTime === block.startHM &&
            entry.endTime === block.endHM,
        );
        if (!section) return;
        actions.open({
          type: intent === 'edit' ? 'edit-event' : 'delete-event',
          iso,
          section,
        });
        return;
      }
      const task = tasks.find((entry) => String(entry.id) === block.id);
      if (!task) return;
      actions.open({ type: intent === 'edit' ? 'edit-task' : 'delete-task', iso, task });
    },
    [actions, iso, store.data, tasks],
  );

  /**
   * The same three drags the Week view offers, on the one column this view has.
   * See pages/Calendar/Week.tsx — the wiring is the same, minus the day the
   * pointer is over, because here there is only ever this one.
   */
  const [slot, setSlot] = useState<DraggedSlot | null>(null);

  const onDrop = useCallback(
    (drop: DroppedBlock) => {
      if (drop.kind === 'event') {
        const section = store.data[monthKey(drop.fromIso)]?.timestamps.find(
          (entry) =>
            !entry.isDashboardTask &&
            entry.task === drop.id &&
            entry.startTime === drop.fromStartTime &&
            entry.endTime === drop.fromEndTime,
        );
        if (!section) return;
        actions.retime({
          fromIso: drop.fromIso,
          toIso: drop.toIso,
          section,
          startTime: drop.startTime,
          endTime: drop.endTime,
        });
        return;
      }
      const task = tasks.find((entry) => String(entry.id) === drop.id);
      if (!task) return;
      actions.retime({
        fromIso: drop.fromIso,
        toIso: drop.toIso,
        task,
        startAt: drop.startAt,
        endAt: drop.endAt,
      });
    },
    [actions, store.data, tasks],
  );

  const daycol = useGridDrag({
    scroller,
    enabled: !actions.dialog && !slot,
    onCreate: setSlot,
    onDrop,
  });

  const openDragged = useCallback(
    (type: 'add-task' | 'add-event') => {
      if (!slot) return;
      actions.open({
        type,
        iso: slot.iso,
        defaults: { startTime: slot.startTime, endTime: slot.endTime },
      });
      setSlot(null);
    },
    [actions, slot],
  );

  /** The next clear hour on the shown day — 9 AM when it is not today. */
  const addTask = useCallback(() => {
    const startMinutes = Math.min(isToday ? (now.getHours() + 1) * 60 : 9 * 60, 22 * 60);
    actions.open({
      type: 'add-task',
      iso,
      defaults: {
        startTime: minutesToTime(startMinutes),
        endTime: minutesToTime(startMinutes + 60),
      },
    });
  }, [actions, isToday, iso, now]);

  /* Which days the mini-month should mark — see the note on the Week view's
     copy of this. */
  const miniLoad = useMemo(() => busyDays(tasks, store.data), [store.data, tasks]);

  const stepDay = useCallback(
    (days: number) => goTo(dates.addDays(cursor, days)),
    [cursor, goTo],
  );

  /** Back to today *and* to the hour it is — the landing the view opens on. */
  const goToday = useCallback(() => {
    goTo(new Date());
    centerOnNow();
  }, [centerOnNow, goTo]);

  /* J / K / T, on the same three controls the header carries. Off while a
     dialog or the drag chooser is up, for the reason hooks/useCalendarKeys
     gives. */
  useCalendarKeys({
    onStep: stepDay,
    onToday: goToday,
    enabled: !actions.dialog && !slot,
  });

  if (loading) return <Loading label="Loading your day" />;
  if (!hasData) return <ErrorState message={error ?? 'No data came back.'} onRetry={refresh} />;

  return (
    <CalendarShell paneId="dayView">
      <div className="wk-header day-header">
        <div className="wk-titlegroup">
          <h2 className="wk-title">{dayTitle(cursor)}</h2>
          <div className="wk-nav">
            <button
              type="button"
              className="wk-arrow"
              aria-label="Previous day"
              title="Previous day (K)"
              aria-keyshortcuts="K"
              onClick={() => stepDay(-1)}
            >
              <Icon name="chevron-left" />
            </button>
            <button
              type="button"
              className="wk-arrow"
              aria-label="Next day"
              title="Next day (J)"
              aria-keyshortcuts="J"
              onClick={() => stepDay(1)}
            >
              <Icon name="chevron-right" />
            </button>
          </div>
          {/* Back to today *and* to the hour it is — the same landing the view
              makes when it is opened. */}
          <button
            type="button"
            className="wk-today"
            title="Today, and back to the hour it is (T)"
            aria-keyshortcuts="T"
            onClick={goToday}
          >
            Today
          </button>
        </div>

        {/* The one control on this page that asks the server again. */}
        <RefreshButton className="wk-icon-btn" busy={refreshing} onRefresh={refresh} />
      </div>

      {error && <ErrorState message={error} onRetry={refresh} />}

      <div className="day-layout">
        <div className="day-gridpane">
          {/* The day's focuses: a primary, then up to four more. The same note
              the Week row and the Month view's field show — they show the
              primary; this is where the whole list is written. */}
          <div className="day-allday">
            <div className="wk-allday-label">Focus</div>
            <div className="day-allday-field">
              {focuses.map((text, index) => (
                <div
                  className={`day-focus-item${index === 0 ? ' is-primary' : ''}`}
                  key={index}
                >
                  {/* Guessed from what has been typed, so it answers as the
                      words appear. An empty field has nothing to guess from
                      and shows the ring instead of the catch-all clock. */}
                  {text.trim() ? (
                    <i
                      className="cal-ico day-focus-ico"
                      style={{ ['--ico' as string]: `url(${iconUrlFor(text)})` }}
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="day-focus-ico is-empty" aria-hidden="true" />
                  )}
                  <input
                    type="text"
                    className="day-allday-input"
                    placeholder={
                      index === 0
                        ? "What's your main focus for this day?"
                        : 'And also…'
                    }
                    aria-label={
                      index === 0 ? 'Primary focus' : `Focus ${index + 1}`
                    }
                    value={text}
                    onChange={(event) => writeFocus(index, event.target.value)}
                  />
                  {/* The primary has no remove: a day always has a first line,
                      and clearing the field is what empties it. */}
                  {index > 0 && (
                    <button
                      type="button"
                      className="day-focus-drop"
                      aria-label={`Remove focus ${index + 1}`}
                      title="Remove"
                      onClick={() => dropFocus(index)}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}

              {focuses.length < MAX_DAY_FOCUSES && (
                <button
                  type="button"
                  className="day-focus-add"
                  onClick={addFocus}
                  title={`Add another focus (${focuses.length} of ${MAX_DAY_FOCUSES})`}
                >
                  <span aria-hidden="true">+</span>
                  <span className="day-focus-add-label">Focus</span>
                </button>
              )}
            </div>
          </div>

          <div className="wk-scroll day-scroll" ref={scroller}>
            <TimeLabels now={isToday ? nowOffset(now) : null} at={now} />
            {/* No `today`: the wash it paints exists to pick one column out of
                the Week view's seven. Here there is only the one, the title
                above already says which day it is, and the now line is what
                marks today — a tinted ground behind every block was the page
                saying "this is today" in a way nothing on it could contradict. */}
            <DayColumn
              hostRef={daycol}
              iso={iso}
              blocks={blocks}
              now={isToday ? nowOffset(now) : null}
              className="day-col"
              onEdit={(block) => openFor(block, 'edit')}
              onDelete={(block) => openFor(block, 'delete')}
              onComplete={complete}
              completingId={completing}
              flagged={conflict}
              markedTaskId={marked}
            />
          </div>
        </div>

        <DaySidebar
          miniLoad={miniLoad}
          miniYear={mini.year}
          miniMonth={mini.month}
          selectedIso={iso}
          weekStart={weekStartDay(prefs)}
          onMiniStep={(delta) =>
            setMini((current) => {
              const stepped = new Date(current.year, current.month + delta, 1);
              return { year: stepped.getFullYear(), month: stepped.getMonth() };
            })
          }
          onPickDate={(picked) => goTo(dates.fromIsoDate(picked))}
          focus={{
            focused: fmtHM(session.focused),
            goal: fmtHM(session.goalHours * 3600),
            percent: session.percent,
          }}
          goalEditable={isToday}
          onSetGoalHours={session.setGoalHours}
          stats={{
            tasks: tally.total,
            done: tally.done,
            focusTime,
            xp: xpEarned,
            streak: Number(stats.current_streak) || 0,
          }}
          shape={shape}
          isToday={isToday}
          pending={pending}
          onComplete={complete}
          completingId={completing}
          onAddTask={addTask}
        />
      </div>

      {/* The Day view acts on one task at a time — its dialogs never offer a
          repeat, exactly as the original's did not. */}
      <BlockDialogs actions={actions} username={username} allowTaskRecurrence={false} />

      {slot && (
        <CreateChooser
          when={`${dates.formatDate(dates.fromIsoDate(slot.iso), {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })} · ${hmLabel(slot.startTime)} – ${hmLabel(slot.endTime)}`}
          onChoose={(kind) => openDragged(kind === 'event' ? 'add-event' : 'add-task')}
          onCancel={() => setSlot(null)}
        />
      )}

      {conflict && (
        <ConflictDialog
          where={dayTitle(cursor)}
          sides={[
            {
              name: blockLabel(conflict[0]),
              when: blockWhen(conflict[0]),
              kind: conflict[0].kind,
            },
            {
              name: blockLabel(conflict[1]),
              when: blockWhen(conflict[1]),
              kind: conflict[1].kind,
            },
          ]}
          onReveal={revealConflict}
          onDelete={(which) => openFor(conflict[which], 'delete')}
        />
      )}

      {/* The same question the dashboard and the tasks page ask after a
          completion, from the same component — a task finished on a grid
          block goes into the record with the same two numbers against it as
          one ticked off a list. Raised by useCalendarTasks, which honours the
          account's rating_depth and never opens this at 'none'. */}
      {rating && (
        <RatePrompt
          taskName={rating.name}
          depth={ratingDepth}
          onSubmit={saveRating}
          onClose={closeRating}
        />
      )}
    </CalendarShell>
  );
}
