/**
 * The Month view — the map on the left, the month and the chosen day on the right.
 *
 * The grid was a date picker with shading: thirty bare numbers, coloured by
 * load, with a ring underneath describing whichever one was selected. Every
 * question a reader actually brings to a month view — which days were heavy,
 * what a day is worth, how the month is going against the last one — had to be
 * answered by clicking a square and reading the other column. The grid now
 * carries each day's own counts, the strip below it carries the month, and the
 * column on the right carries the month's shape as well as the day's plan.
 *
 * Everything on the page is scoped to the month on screen, the way the Week
 * view scopes itself to its seven days: stepping a month steps the grid, the
 * summary strip, the overview tiles, the ranked days and the insight together.
 * A column of figures answering questions about different months would be worse
 * than no column at all.
 *
 * The day panel is derived, not stored. The original wrote each task into the
 * event store so the list could show it, then filtered those entries out again
 * on save; a task deleted elsewhere left its card behind until the day was
 * re-opened, and a task with no block to sit under vanished. Here the list is
 * computed on render from the store and the database (see
 * components/Calendar/entries.ts), so there is nothing to leave behind.
 */
import { timeText } from '@/utils/clock';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarShell,
  DayPanel,
  MonthGrid,
  MonthSidebar,
  MonthSummaryBar,
  MonthTools,
  ViewSwitcher,
  dayEntries,
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
  useSettings,
} from '@/hooks';
import { useBlockActions } from '@/hooks/useBlockActions';
import { useFocusSession } from '@/hooks/useFocusSession';
import { focus as focusService, goals as goalService } from '@/services';
import { weekStartDay } from '@/services/settings';
import { dates } from '@/utils';
import { isCalendarPlaced } from '@/utils/calendarGrid';
import { isoOf } from '@/utils/calendarStore';
import { monthFigures, monthInsight } from '@/utils/monthSummary';
import type { DayEntry, Upcoming } from '@/components/Calendar';
import type { FocusHistory, Goal } from '@/types';
/* The frame, the dialogs, then this view's own. week.css is gone from this
   list: the Month view draws no time grid and carried four and a half thousand
   lines of it for eight rules of chooser and confirmation, which live in
   dialogs.css now. day.css stays for one rule — `.day-panel-head`, the heading
   on the day panel, which this view's DayPanel and the Day view's DaySidebar
   both wear. Colour last, so it has the final word on every block. */
import '@/styles/calendar/shell.css';
import '@/styles/calendar/dialogs.css';
import '@/styles/calendar/overview.css';
import '@/styles/calendar/day.css';
import '@/styles/calendar/month.css';
import '@/styles/calendar/palette.css';

/** The store's key for a date: unpadded, as it has always been. */
function keyOf(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export default function Month() {
  useDocumentTitle('Calendar · Month');

  const account = useCalendarTasks();
  const {
    tasks,
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
  const navigate = useNavigate();
  const { prefs, dailyGoal } = useSettings();

  /**
   * The day the panel is showing, and — as the month containing it — the grid.
   *
   * These were two pieces of state: a `cursor` for the grid's month and a
   * `selectedKey` for the panel, moved independently, so stepping the month
   * left the right-hand column describing a day that was no longer on screen.
   * That contradicted this file's own first principle, which is that
   * everything on the page is scoped to the month in front of the reader.
   *
   * One cursor now, and it is the calendar's rather than this view's
   * (hooks/useCalendarCursor) — so picking the 14th here and pressing Day
   * opens the 14th, which is the whole reason the switcher exists.
   */
  const { date: cursor, iso: selectedIso, goTo } = useCalendarCursor();
  const selectedKey = keyOf(cursor);
  const [history, setHistory] = useState<FocusHistory>({});
  /* The account's goals, for the Goals Progress card under the grid. Read once
     per account rather than per month: a goal is not a fact about September,
     and stepping the grid should not re-ask for one. */
  const [goals, setGoals] = useState<Goal[]>([]);

  const actions = useBlockActions(username, store, tasks, account);

  useEffect(() => {
    if (!username) return;
    let live = true;
    void goalService.getGoals().then((result) => {
      if (live && result.success) setGoals(result.goals ?? []);
    });
    return () => {
      live = false;
    };
  }, [username]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  /**
   * Focus records covering the month on screen *and* the month before it.
   *
   * One call rather than two: the summary strip is entirely comparisons, so
   * the previous month is never optional, and asking for both ends in a single
   * range means the two halves of every delta always come from the same
   * response.
   */
  useEffect(() => {
    if (!username) return;
    let live = true;
    const start = dates.isoDate(new Date(year, month - 1, 1));
    const end = dates.isoDate(new Date(year, month + 1, 0));
    void focusService.history(start, end).then((result) => {
      if (live && result.success) setHistory(result.days);
    });
    return () => {
      live = false;
    };
  }, [month, username, year]);

  /**
   * Today's focus, folded into the record the server returned.
   *
   * The live session has not been written back yet, but the server can be
   * ahead of it when today was tracked in another browser — so the larger of
   * the two wins, which is the rule the Week view's figures use as well.
   */
  const focusHistory = useMemo(() => {
    const todayIso = dates.isoDate();
    const stored = history[todayIso];
    return {
      ...history,
      [todayIso]: {
        seconds: Math.max(session.focused, Number(stored?.seconds) || 0),
        goal_hours: session.goalHours || Number(stored?.goal_hours) || 0,
      },
    };
  }, [history, session.focused, session.goalHours]);

  const figures = useMemo(
    () => monthFigures(year, month, tasks, store.data, focusHistory),
    [focusHistory, month, store.data, tasks, year],
  );

  /**
   * How far into the month on screen the reader has actually got, and the same
   * depth into the month before it.
   *
   * The strip and the insight card are all comparisons, and comparing eight
   * days of August against the whole of July says only that July had more
   * month in it — every delta reads as a collapse until the 31st. So the
   * previous month is counted to the same depth: eight days in, it is July
   * 1–8. A month already finished is compared in full, and one that has not
   * started has nothing on either side.
   *
   * February is why `compared` is a `min`: thirty-one days into March, there
   * are only twenty-eight to hold it against.
   */
  const { compared, previousLength } = useMemo(() => {
    const now = new Date();
    const length = new Date(year, month + 1, 0).getDate();
    const prevLength = new Date(year, month, 0).getDate();
    const sameMonth = now.getFullYear() === year && now.getMonth() === month;
    const started = new Date(year, month, 1) <= now;
    const elapsed = sameMonth ? now.getDate() : started ? length : 0;
    return { compared: Math.min(elapsed, prevLength), previousLength: prevLength };
  }, [month, year]);

  const previous = useMemo(
    () =>
      monthFigures(
        new Date(year, month - 1, 1).getFullYear(),
        new Date(year, month - 1, 1).getMonth(),
        tasks,
        store.data,
        focusHistory,
        new Date(),
        compared,
      ),
    [compared, focusHistory, month, store.data, tasks, year],
  );

  const previousMonthName = dates.formatDate(new Date(year, month - 1, 1), {
    month: 'short',
  });

  /**
   * "Jul", or "Jul 1–8" when only part of it is on the other side.
   *
   * A month that has not started compares against nothing, so there is no
   * stretch to name and it falls back to the month — every delta beside it is
   * absent anyway, both sides being zero.
   */
  const previousName =
    compared >= previousLength || compared === 0
      ? previousMonthName
      : `${previousMonthName} 1${compared === 1 ? '' : `–${compared}`}`;

  const insight = useMemo(() => {
    const first = new Date(year, month, 1);
    const future = first > new Date();
    const against =
      compared >= previousLength || compared === 0
        ? 'last month'
        : `the first ${compared === 1 ? 'day' : `${compared} days`} of last month`;
    return monthInsight(figures, previous, future, against);
  }, [compared, figures, month, previous, previousLength, year]);

  const entries = useMemo(
    () => dayEntries(selectedKey, store.data[selectedKey]?.timestamps ?? [], tasks),
    [selectedKey, store.data, tasks],
  );

  /**
   * What is coming, forwards from today.
   *
   * Deliberately not scoped to the month on screen, unlike everything else on
   * this page: a deadline four days out matters just as much when it falls
   * after the 30th, and a panel called Next Up that stops at a month boundary
   * is answering the calendar's question rather than the reader's.
   *
   * Tasks come from the database and events from the store, which is the same
   * split the grid draws from — and the same rule applies to both: only what
   * the calendar was told about (`show_on_calendar`) is a dated thing.
   */
  const upcoming = useMemo<Upcoming[]>(() => {
    const todayIso = dates.isoDate();
    const rows: Upcoming[] = [];

    tasks.forEach((task) => {
      if (!isCalendarPlaced(task) || task.status === 'done' || !task.due_date) return;
      const at = new Date(task.due_date);
      if (Number.isNaN(at.getTime())) return;
      const iso = dates.isoDate(at);
      if (iso < todayIso) return;
      rows.push({
        key: `t:${task.id}`,
        name: task.title,
        iso,
        at: timeText(at),
        kind: 'task',
      });
    });

    Object.entries(store.data).forEach(([key, day]) => {
      const iso = isoOf(key);
      if (iso < todayIso) return;
      day.timestamps.forEach((section, index) => {
        if (section.isDashboardTask) return;
        rows.push({
          key: `e:${key}:${index}`,
          name: section.task || 'An event',
          iso,
          at: section.startTime || '',
          kind: 'event',
        });
      });
    });

    return rows.sort((a, b) => a.iso.localeCompare(b.iso) || a.at.localeCompare(b.at));
  }, [store.data, tasks]);

  const editEvent = useCallback(
    (entry: DayEntry) => {
      if (!entry.section) return;
      actions.open({ type: 'edit-event', iso: selectedIso, section: entry.section });
    },
    [actions, selectedIso],
  );

  const removeEntry = useCallback(
    (entry: DayEntry) => {
      if (entry.kind === 'event') {
        if (!entry.section) return;
        actions.open({ type: 'delete-event', iso: selectedIso, section: entry.section });
        return;
      }
      const task = tasks.find((candidate) => String(candidate.id) === entry.taskId);
      if (task) actions.open({ type: 'delete-task', iso: selectedIso, task });
    },
    [actions, selectedIso, tasks],
  );

  /**
   * Stepping the grid a month, and taking the panel with it.
   *
   * The day it lands on is the first of the target month, or today when that
   * month is this one — a reader stepping back to September wants September,
   * and a reader pressing it twice more and coming back wants the day they
   * started on to be the obvious one. Carrying the day-of-month across instead
   * would drift: the 31st of January steps to the 28th of February and back to
   * the 28th of January.
   */
  const stepMonth = useCallback(
    (delta: number) => {
      const at = new Date(year, month + delta, 1);
      const now = new Date();
      const isThisMonth =
        at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth();
      goTo(isThisMonth ? now : at);
    },
    [goTo, month, year],
  );

  const goToday = useCallback(() => goTo(new Date()), [goTo]);

  // --- dragging a day's things onto another day ---------------------------
  /**
   * The card currently in the reader's hand, if any.
   *
   * The Week and Day views drag on a *time* grid — pixels to minutes, with
   * overlap refused before the fact (hooks/useGridDrag) — and none of that
   * applies here, because a month cell is a day and has no time axis to land
   * on. So this is the browser's own drag and drop, and what it means is
   * narrower and more useful: keep the clock times, change the date.
   *
   * That is the gesture a month view exists for. Rescheduling to the hour is a
   * decision you make once, on a grid that shows hours; moving something to
   * next Tuesday is the one you make constantly, and until now it took
   * deleting the thing and making it again on the other day.
   */
  const [dragging, setDragging] = useState<DayEntry | null>(null);
  /**
   * The same thing, waiting for a day rather than following a pointer.
   *
   * A drag is a pointer gesture and cannot be performed any other way, so a
   * card that could only be moved by dragging could not be moved at all
   * without a mouse. `Move to a day…` in the card's own menu arms this, the
   * grid becomes a day picker (`pending` on MonthGrid), and the next day
   * picked — clicked, or arrowed to and entered — is where the card goes.
   *
   * The two are one gesture with two ways in: both end at `moveTo` below.
   */
  const [pending, setPending] = useState<DayEntry | null>(null);

  /** "09:30" on a given day, as a real moment. */
  const at = useCallback((day: Date, time: string): Date => {
    const [hours, minutes] = time.split(':').map(Number);
    const when = new Date(day);
    when.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    return when;
  }, []);

  /**
   * Put an entry on a day, keeping the clock times it already had.
   *
   * The one thing a month view can say about time that a week view cannot say
   * better, and the whole of what a drop here means. `retime` is the same call
   * the Week and Day views commit their drags with (hooks/useBlockActions), so
   * an event goes to the store and a task is rewritten through the API,
   * exactly as they are when a block is dragged across an hour.
   */
  const moveTo = useCallback(
    (entry: DayEntry | null, day: Date) => {
      setDragging(null);
      setPending(null);
      if (!entry) return;

      const toIso = dates.isoDate(day);
      // Dropping a card back on the day it came from is not a move.
      if (toIso === selectedIso) return;

      if (entry.kind === 'event') {
        if (!entry.section) return;
        actions.retime({
          fromIso: selectedIso,
          toIso,
          section: entry.section,
          startTime: entry.startTime,
          endTime: entry.endTime,
        });
        return;
      }

      const task = tasks.find((candidate) => String(candidate.id) === entry.taskId);
      if (!task || !entry.startTime || !entry.endTime) return;

      const startAt = at(day, entry.startTime);
      const endAt = at(day, entry.endTime);
      // A task that ran past midnight keeps its length rather than collapsing
      // to a negative one — the end is on the day after the start, as it was.
      if (endAt <= startAt) endAt.setDate(endAt.getDate() + 1);

      actions.retime({ fromIso: selectedIso, toIso, task, startAt, endAt });
    },
    [actions, at, selectedIso, tasks],
  );

  /* Picking a day means two different things depending on whether the grid is
     holding something, and this is the only place that can know: MonthGrid is
     told it is a picker, not what it is picking for. */
  const pickDay = useCallback(
    (day: Date) => {
      if (pending) moveTo(pending, day);
      else goTo(day);
    },
    [goTo, moveTo, pending],
  );

  /* J / K / T, on the same three controls the grid's header carries. */
  useCalendarKeys({ onStep: stepMonth, onToday: goToday, enabled: !actions.dialog });

  if (loading) return <Loading label="Loading your month" />;
  if (!hasData) return <ErrorState message={error ?? 'No data came back.'} onRetry={refresh} />;

  return (
    <CalendarShell paneId="monthView" ownSwitcher>
      {error && <ErrorState message={error} onRetry={refresh} />}

      <div className="mv-body">
        {/* The switcher rides in the grid's own header, on the line with the
            month and the arrows, rather than floating in the card's corner —
            one bar of controls for the view instead of two. */}
        <MonthGrid
          year={year}
          month={month}
          selectedKey={selectedKey}
          weekStart={weekStartDay(prefs)}
          days={figures.days}
          /* Each day's primary focus, under its date — the same note the
             panel's field on the right edits for the selected day. */
          focusOn={dayFocus.primary}
          onStep={stepMonth}
          onToday={goToday}
          /* A day in the corner of the grid belongs to a neighbouring month,
             and picking it steps there — the grid follows the cursor's month,
             so there is nothing extra to do and both props are the same call.
             They stay two props because MonthGrid still has to know which
             cells are the month's own, and only it can. */
          onSelect={(key) => pickDay(dates.fromIsoDate(isoOf(key)))}
          onSelectOther={pickDay}
          onDropDay={(day) => moveTo(dragging, day)}
          dropping={Boolean(dragging)}
          pending={pending?.name ?? null}
          onCancelPending={() => setPending(null)}
          tools={
            <>
              <ViewSwitcher />
              {/* The only thing on this page that re-reads the account. */}
              <RefreshButton busy={refreshing} onRefresh={refresh} />
            </>
          }
        >
          <MonthSummaryBar
            settled={figures.settled}
            scheduled={figures.scheduled}
            xpEarned={figures.xpEarned}
            avgGoal={figures.avgGoal}
            previous={previous}
            previousName={previousName}
            streak={Number(account.stats.current_streak) || 0}
            bestStreak={Number(account.stats.best_streak) || 0}
            onViewAnalytics={() => navigate('/analytics')}
          />

          <MonthTools
            upcoming={upcoming}
            goals={goals}
            onAddTask={() =>
              actions.open({
                type: 'add-task',
                iso: selectedIso,
                defaults: { startTime: '09:00', endTime: '10:00' },
              })
            }
            onAddEvent={() =>
              actions.open({
                type: 'add-event',
                iso: selectedIso,
                defaults: { startTime: '09:00', endTime: '10:00' },
              })
            }
          />
        </MonthGrid>

        <aside className="mv-side">
          <section className="mv-card mv-card-plan">
            {/* `focusText` is the *primary* of the day's focuses. A day can
                carry five now — the Day view is where the rest are written —
                and this field edits the first without disturbing them. */}
            <DayPanel
              entries={entries}
              /* The account's daily XP target — the same one the dashboard's
                 panel fills and Settings sets. `figures.days` already counts
                 what each day banked, so the earned half is a lookup rather
                 than a second sum. */
              goalXp={dailyGoal}
              earnedXp={
                figures.days.find((day) => day.key === selectedKey)?.earned ?? 0
              }
              goalDay={selectedKey === keyOf(new Date())}
              focusText={dayFocus.primary(selectedIso)}
              onFocusChange={(text) => dayFocus.setPrimary(selectedIso, text)}
              onAddEvent={() =>
                actions.open({
                  type: 'add-event',
                  iso: selectedIso,
                  defaults: { startTime: '09:00', endTime: '10:00' },
                })
              }
              onEditEvent={editEvent}
              onRemoveEvent={removeEntry}
              onRenameEvent={(entry, name) => {
                if (entry.index === undefined) return;
                store.patchSection(selectedKey, entry.index, { task: name });
              }}
              onRetimeEvent={(entry, field, value) => {
                if (entry.index === undefined) return;
                store.patchSection(selectedKey, entry.index, { [field]: value });
              }}
              onComplete={complete}
              completingId={completing}
              /* The account's focus session — the same one the dashboard's
                 panel and the Day view's ring drive. The button on the next
                 task begins it; it does not claim to be timing that task. */
              onStart={session.start}
              focusRunning={session.running}
              onDragEntry={setDragging}
              onDragEnd={() => setDragging(null)}
              onMoveEntry={setPending}
            />
          </section>

          <MonthSidebar
            tasks={figures.tasks}
            done={figures.done}
            focused={figures.focused}
            planned={figures.planned}
            xpEarned={figures.xpEarned}
            best={figures.best}
            top={figures.top}
            insight={insight}
            onViewAll={() => navigate('/analytics')}
          />
        </aside>
      </div>

      <BlockDialogs actions={actions} username={username} />

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
