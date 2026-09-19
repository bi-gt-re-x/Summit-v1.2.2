/**
 * The Week view — seven columns, 6 AM to 5 AM, with the overview beside them.
 *
 * Ported from calendar-week.js and the `#weekView` half
 * of the calendar.html template. The markup and class names are the
 * originals, so styles/calendar/week.css dresses this unchanged.
 *
 * Everything on the page is scoped to the week on screen — the grid, the
 * overview figures, the per-day XP line, the streak dots, the priorities, the
 * focus time — because a column of figures answering questions about different
 * weeks is worse than no column at all. Stepping a week steps all of it.
 *
 * The one exception is Upcoming, which is deliberately about what comes *after*
 * the shown week: everything inside it is already drawn on the grid, and a list
 * repeating that would be the same thing twice.
 *
 * A past week's overview is frozen: its numbers come from the snapshot saved
 * while it was the current week, so editing a task months later cannot rewrite
 * what that week amounted to. The current week keeps its snapshot fresh, and
 * whatever it holds when the week ends is what stays.
 */
import { hmText } from '@/utils/clock';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarShell,
  ConflictDialog,
  CreateChooser,
  DayColumn,
  SubjectLibrary,
  TimeLabels,
  ViewSwitcher,
  WeekSidebar,
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
  useSubjects,
} from '@/hooks';
import { useBlockActions } from '@/hooks/useBlockActions';
import { busyDays } from '@/utils/calendarBusy';
import { planFamilies } from '@/utils/calendarFamilies';
import { useFocusSession } from '@/hooks/useFocusSession';
import {
  useGridDrag,
  type DraggedSlot,
  type DroppedBlock,
} from '@/hooks/useGridDrag';
import { focus as focusService } from '@/services';
import { weekStartDay } from '@/services/settings';
import { dates } from '@/utils';
import {
  blockLabel,
  blockWhen,
  dayEventBlocks,
  dayTaskBlocks,
  layOut,
  nowOffset,
  type Block,
} from '@/utils/calendarGrid';
import { iconUrlFor } from '@/utils/calendarIcons';
import {
  isoOf,
  loadWeekSnapshots,
  monthKey,
  saveWeekSnapshot,
} from '@/utils/calendarStore';
import { subjectXp } from '@/utils/subjectXp';
import type { FocusHistory } from '@/types';
/* The frame, then the dialogs every view opens, then this view's own — and
   the colour system last, so it has the final word on every block.
   day.css is here for the mini-month in the overview column, which the Day
   view owns and this view borrows. */
import '@/styles/calendar/shell.css';
import '@/styles/calendar/dialogs.css';
import '@/styles/calendar/overview.css';
import '@/styles/calendar/week.css';
import '@/styles/calendar/day.css';
import '@/styles/calendar/palette.css';
import type { IconName } from '@/components/Icon';

/**
 * The first day of the week a date falls in.
 *
 * Which day that *is* is the account's to say (Settings, Calendar), so this
 * takes it rather than assuming Monday. Everything else on the page counts
 * seven days forward from whatever comes back, so the grid, the overview, the
 * per-day XP line and the title all move together when it changes.
 */
function weekOf(date: Date, startsOn: 0 | 1): Date {
  return dates.startOfWeek(date, startsOn);
}

/** "16:30" on the account's clock. Empty in, "All Day" out — an entry with no
    time has none. The twelve-hour arithmetic this did itself is utils/clock's
    now, which is what lets it be twenty-four-hour too. */
function clockLabel(hhmm: string): string {
  const [hours, minutes] = hhmm.split(':').map(Number);
  if (hours === undefined || Number.isNaN(hours) || minutes === undefined) return 'All Day';
  return hmText(hours, minutes);
}

/** "July 13 – July 19, 2026". */
function weekTitle(opens: Date): string {
  const closes = dates.addDays(opens, 6);
  const long = (date: Date) => dates.formatDate(date, { month: 'long', day: 'numeric' });
  return `${long(opens)} – ${long(closes)}, ${closes.getFullYear()}`;
}

export default function Week() {
  useDocumentTitle('Calendar · Week');

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
  // The same catalogue as a list, for the library. Both hooks read one cache,
  // so this is not a second request — see hooks/useSubjects.
  const subjectList = useSubjects(username);
  const now = useNow();
  const navigate = useNavigate();
  const { prefs } = useSettings();

  /* The day the week starts on, from the account's preferences. It arrives a
     moment after the page does — which is why the week is *derived* from the
     cursor on every render rather than stored: a stored week would have to be
     re-anchored by an effect when the preference lands, and would be showing
     the wrong seven days until it did.

     The cursor is a day, not a week (hooks/useCalendarCursor). This view shows
     the week containing it and keeps the day itself untouched, so stepping out
     to a week from Wednesday and back into a day lands on Wednesday rather
     than on whichever day the week happens to open with. */
  const startsOn = weekStartDay(prefs);
  const { date: anchor, goTo } = useCalendarCursor();
  const opens = useMemo(() => weekOf(anchor, startsOn), [anchor, startsOn]);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('wkSidebarCollapsed') === '1';
    } catch {
      return false;
    }
  });
  /**
   * The overview's mini-month cursor.
   *
   * Its own, like the Day view's: paging to March must not drag the week
   * along, or the panel is a second set of week arrows rather than a way to
   * look around. Stepping the week re-syncs it below, so the month on show is
   * always the month the banded week is in unless the reader has gone
   * wandering.
   */
  const [mini, setMini] = useState(() => ({
    year: opens.getFullYear(),
    month: opens.getMonth(),
  }));
  /* Re-synced as an effect rather than inside the step, because the week can
     now move without this view asking it to: the switcher arrives from a day
     or a month carrying `?date=`, and Back steps the week too. Both have to
     bring the mini-month with them, and only an effect sees all three. */
  useEffect(() => {
    setMini({ year: opens.getFullYear(), month: opens.getMonth() });
  }, [opens]);
  /** True while the overview column is showing the subject library instead. */
  const [library, setLibrary] = useState(false);
  const [history, setHistory] = useState<FocusHistory>({});
  /** The day whose focus chip is currently an input, if any. */
  const [focusEditing, setFocusEditing] = useState<string | null>(null);

  const actions = useBlockActions(username, store, tasks, account);
  const scroller = useRef<HTMLDivElement>(null);

  const opensIso = dates.isoDate(opens);
  const closesIso = dates.isoDate(dates.addDays(opens, 6));
  const todayIso = dates.isoDate(now);
  const thisWeekIso = dates.isoDate(weekOf(now, startsOn));
  const thisWeek = opensIso === thisWeekIso;

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = dates.addDays(opens, index);
        return {
          date,
          iso: dates.isoDate(date),
          name: dates.formatDate(date, { weekday: 'short' }),
          label: dates.formatDate(date, { month: 'short', day: 'numeric' }),
        };
      }),
    [opens],
  );

  useEffect(() => {
    if (!username) return;
    let live = true;
    void focusService.history(opensIso, closesIso).then((result) => {
      if (live && result.success) setHistory(result.days);
    });
    return () => {
      live = false;
    };
  }, [opensIso, closesIso, username]);

  /** Opening the week lands on the current hour — see hooks/useNowScroll. */
  const centerOnNow = useNowScroll(scroller, !loading && thisWeek);

  // One colour plan for the whole week, so nothing on it shares a family until
  // the week has more than twelve distinct things on it — and so the Day view
  // and the Week view agree, both planning the same seven days. See
  // utils/calendarFamilies.
  const plan = useMemo(
    () => planFamilies(days.map((day) => day.iso), tasks, store.data),
    [days, store.data, tasks],
  );

  const columns = useMemo(
    () =>
      days.map((day) => ({
        ...day,
        ...layOut([
          ...dayTaskBlocks(day.iso, tasks, subjects, plan),
          ...dayEventBlocks(day.iso, store.data, plan),
        ]),
      })),
    [days, plan, store.data, subjects, tasks],
  );

  /** The first clash anywhere this week; the reader has to resolve it. */
  const clash = columns.find((column) => column.conflict);

  /**
   * Put the clashing pair on screen.
   *
   * A week is seven columns of a 23-hour day and the clash can be on any of
   * them, at an hour the reader has not scrolled to — so the dialog's "Show me
   * on the grid" scrolls the earlier of the two to the middle of the window.
   * The pair are ringed as well, by `flagged` on the column below, which is
   * what makes the scroll land on something the eye can find.
   */
  const revealClash = useCallback(() => {
    const box = scroller.current;
    const pair = clash?.conflict;
    if (!box || !pair) return;
    const top = Math.min(pair[0].top, pair[1].top);
    const bottom = Math.max(pair[0].top + pair[0].height, pair[1].top + pair[1].height);
    box.scrollTo({
      top: Math.max(0, (top + bottom) / 2 - box.clientHeight / 2),
      behavior: 'smooth',
    });
  }, [clash]);

  const overview = useMemo(() => {
    const inWeek = (stamp: string | undefined) => {
      const day = (stamp || '').slice(0, 10);
      return Boolean(day) && day >= opensIso && day <= closesIso;
    };

    const weekTasks = tasks.filter((task) => inWeek(task.created_at));
    const done = weekTasks.filter((task) => task.status === 'done');
    const live = {
      total: weekTasks.length,
      done: done.length,
      rate: weekTasks.length ? Math.round((done.length / weekTasks.length) * 100) : 0,
      xp: done.reduce((sum, task) => sum + (Number(task.xp_value) || 0), 0),
    };

    const past = opensIso < thisWeekIso;
    const frozen = loadWeekSnapshots(username)[opensIso];
    if (past && frozen) return frozen;
    // A past week seen for the first time freezes now; the current week keeps
    // its snapshot current. A future week has nothing to record.
    if (opensIso <= thisWeekIso) saveWeekSnapshot(username, opensIso, live);
    return live;
  }, [thisWeekIso, opensIso, closesIso, tasks, username]);

  /**
   * Focused against planned.
   *
   * Today comes from the live session, which the server has not been told
   * about yet — but the server can be ahead when today's focus was tracked in
   * another browser, so the larger of the two wins.
   */
  const focus = useMemo(() => {
    let focusedSeconds = 0;
    let plannedHours = 0;

    Object.entries(history).forEach(([iso, day]) => {
      if (iso === todayIso) return;
      focusedSeconds += Number(day.seconds) || 0;
      plannedHours += Number(day.goal_hours) || 0;
    });

    const today = history[todayIso];
    if (todayIso >= opensIso && todayIso <= closesIso) {
      focusedSeconds += Math.max(session.focused, Number(today?.seconds) || 0);
      plannedHours += session.goalHours;
    } else if (today) {
      focusedSeconds += Number(today.seconds) || 0;
      plannedHours += Number(today.goal_hours) || 0;
    }

    return { focused: focusedSeconds, planned: plannedHours * 3600 };
  }, [history, opensIso, session.focused, session.goalHours, closesIso, todayIso]);

  /**
   * The seven days, as the sidebar's sparkline and streak dots need them.
   *
   * XP is counted from completion stamps rather than from due dates: the
   * question the line answers is "when did the work happen", and a task
   * finished on Friday is Friday's whatever day it was scheduled for. A day
   * with a completion is a day the streak dot is filled — the same test, so the
   * line and the dots can never tell different stories about the same day.
   */
  const weekDays = useMemo(
    () =>
      days.map((day) => {
        let xp = 0;
        let done = 0;
        tasks.forEach((task) => {
          if (task.status !== 'done') return;
          if ((task.completed_at || '').slice(0, 10) !== day.iso) return;
          done += 1;
          xp += Number(task.xp_value) || 0;
        });

        // Focus, day by day, on the same rule the week's total above uses:
        // today's figure is whichever of the live session and the server's
        // record is larger, because the session has not been written back yet
        // but the server can be ahead if today was tracked in another browser.
        const entry = history[day.iso];
        const isToday = day.iso === todayIso;
        const focused = isToday
          ? Math.max(session.focused, Number(entry?.seconds) || 0)
          : Number(entry?.seconds) || 0;
        const planned = isToday
          ? session.goalHours * 3600
          : (Number(entry?.goal_hours) || 0) * 3600;

        return {
          initial: day.name.charAt(0),
          name: day.name,
          xp,
          focused,
          planned,
          active: done > 0,
          future: day.iso > todayIso,
          today: isToday,
        };
      }),
    [days, history, session.focused, session.goalHours, tasks, todayIso],
  );

  /**
   * Where the week's XP went, by subject.
   *
   * Counted on `completed_at` like the sparkline and the streak dots above it,
   * rather than on `created_at` like the overview: this panel is about work
   * that happened, and the day it happened on is the day it was finished.
   */
  const breakdown = useMemo(
    () => subjectXp(tasks, subjects, opensIso, closesIso),
    [opensIso, subjects, closesIso, tasks],
  );

  /**
   * The week's tasks split by priority — how much of the week is hard.
   *
   * Counted on `created_at` like the overview above, so the panel and the
   * figures beside it are answering about the same set of tasks. XP is what
   * was *earned*, not what was on offer: an unfinished high-priority task is a
   * count without a score, which is the honest reading of a week in progress.
   */
  const priorities = useMemo(() => {
    const order = [
      { key: 'low', label: 'Low' },
      { key: 'medium', label: 'Medium' },
      { key: 'high', label: 'High' },
    ];
    const counts = new Map(order.map((row) => [row.key, { count: 0, done: 0, xp: 0 }]));

    tasks.forEach((task) => {
      const day = (task.created_at || '').slice(0, 10);
      if (!day || day < opensIso || day > closesIso) return;
      // Anything unrecognised counts as low, which is how the grid colours it.
      const key = String(task.priority || '').toLowerCase();
      const bucket = counts.get(key) ?? counts.get('low');
      if (!bucket) return;
      bucket.count += 1;
      if (task.status === 'done') {
        bucket.done += 1;
        bucket.xp += Number(task.xp_value) || 0;
      }
    });

    return order.map((row) => ({ ...row, ...counts.get(row.key)! }));
  }, [opensIso, closesIso, tasks]);

  /**
   * What is coming after the week on screen — tasks by due date, events by the
   * day they sit on, soonest first.
   *
   * Deliberately *after* the shown week rather than after today: everything
   * inside the week is already drawn on the grid beside this, and repeating it
   * in a list headed "Upcoming" would be the same thing twice.
   */
  const upcoming = useMemo(() => {
    const day = (stamp: string | undefined) => (stamp || '').slice(0, 10);
    const pretty = (iso: string) =>
      dates.formatDate(dates.fromIsoDate(iso), {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

    const entries = tasks
      .filter((task) => task.status === 'todo' && day(task.due_date) > closesIso)
      .map((task) => ({
        id: `task-${task.id}`,
        iso: day(task.due_date),
        sortAt: `${day(task.due_date)} ${(task.due_date || '').slice(11, 16) || '99:99'}`,
        icon: 'pin' as IconName,
        title: task.title || 'Untitled',
        when: clockLabel((task.due_date || '').slice(11, 16)),
      }));

    Object.entries(store.data).forEach(([key, entry]) => {
      const iso = isoOf(key);
      if (iso <= closesIso) return;
      entry.timestamps.forEach((section, index) => {
        if (section.isDashboardTask) return; // already counted as a task
        entries.push({
          id: `event-${key}-${index}`,
          iso,
          sortAt: `${iso} ${section.startTime || '99:99'}`,
          icon: 'calendar' as IconName,
          title: section.task || 'Untitled',
          when: clockLabel(section.startTime),
        });
      });
    });

    return entries
      .sort((a, b) => (a.sortAt < b.sortAt ? -1 : a.sortAt > b.sortAt ? 1 : 0))
      .slice(0, 4)
      .map(({ id, icon, title, when, iso }) => ({
        id,
        icon,
        title,
        when,
        date: pretty(iso),
      }));
  }, [store.data, closesIso, tasks]);

  /** A block's menu, resolved back to the thing the dialogs work on. */
  const openFor = useCallback(
    (block: Block, iso: string, intent: 'edit' | 'delete') => {
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
    [actions, store.data, tasks],
  );

  /**
   * Dragging on the grid — the only way something is added here now that the
   * bar under it is gone, and a better one: the gesture says when the thing
   * runs as part of saying that it exists.
   *
   * A drag on empty grid parks the slot and asks whether it is an event or a
   * task; the answer opens that dialog with the times already filled in. A drag
   * on a block commits straight away, with no dialog at all — the reader has
   * said what they want by putting it there.
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

  const daycols = useGridDrag({
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

  /* Seven days on the *anchor*, not on the week's opening day, so the
     day-of-week the reader came in on is carried along: Wednesday to
     Wednesday, whatever the week starts on. Either lands in the same seven
     days; only one of them survives a trip through the Day view. */
  const stepWeek = useCallback(
    (weeks: number) => goTo(dates.addDays(anchor, weeks * 7)),
    [anchor, goTo],
  );

  /** Back to the current week, and to the hour it is on the grid. */
  const goToday = useCallback(() => {
    goTo(new Date());
    centerOnNow();
  }, [centerOnNow, goTo]);

  const stepMini = useCallback(
    (delta: number) =>
      setMini((current) => {
        const at = new Date(current.year, current.month + delta, 1);
        return { year: at.getFullYear(), month: at.getMonth() };
      }),
    [],
  );

  /* Which days the mini-month should mark. Every day the account has anything
     on, not only the month on show — the panel is paged without re-rendering
     this view, so scoping it to one month would leave March blank until
     something else happened to move. It is a map of a few hundred entries at
     the very most. */
  const miniLoad = useMemo(() => busyDays(tasks, store.data), [store.data, tasks]);

  const toggleSidebar = useCallback(() => {
    setCollapsed((was) => {
      try {
        localStorage.setItem('wkSidebarCollapsed', was ? '' : '1');
      } catch {
        /* private mode: the choice lasts as long as the tab does */
      }
      return !was;
    });
  }, []);

  /* J / K / T, on the same three controls the header carries. Off while a
     dialog, the drag chooser or the conflict prompt is up. */
  useCalendarKeys({
    onStep: stepWeek,
    onToday: goToday,
    enabled: !actions.dialog && !slot && !clash?.conflict,
  });

  if (loading) return <Loading label="Loading your week" />;
  // Only when there is no week to show. A refresh that fails keeps the one
  // already on screen and says so in the banner below — throwing the grid away
  // because the second read timed out is the reader's work for the worse.
  if (!hasData) return <ErrorState message={error ?? 'No data came back.'} onRetry={refresh} />;

  return (
    <CalendarShell paneId="weekView" ownSwitcher>
      {/* One row: what week it is and how to move through it on the left, how
          to look at it and what to do with it on the right. The switcher is
          here rather than in the shell above so the view has a single bar of
          controls instead of two stacked ones. */}
      <div className={`wk-header${collapsed ? ' sidebar-collapsed' : ''}`}>
        <div className="wk-headmain">
          <h2 className="wk-title">{weekTitle(opens)}</h2>
          <div className="wk-nav">
            <button
              type="button"
              className="wk-arrow"
              aria-label="Previous week"
              title="Previous week (K)"
              aria-keyshortcuts="K"
              onClick={() => stepWeek(-1)}
            >
              ‹
            </button>
            {/* Not in the design, which has only a back arrow — a week view
                that can be left but not returned from is a trap. */}
            <button
              type="button"
              className="wk-arrow"
              aria-label="Next week"
              title="Next week (J)"
              aria-keyshortcuts="J"
              onClick={() => stepWeek(1)}
            >
              ›
            </button>
          </div>
          {/* Not disabled on the current week, unlike the Month view's: there
              it would step to a month you are already on and do nothing, but
              here it also puts the now line back in the middle of the grid,
              which is worth a press however far the reader has scrolled. */}
          <button
            type="button"
            className="wk-today"
            title="This week, and back to the hour it is (T)"
            aria-keyshortcuts="T"
            onClick={goToday}
          >
            Today
          </button>
        </div>

        <div className="wk-headtools">
          <ViewSwitcher />
          {/* The only thing on this page that re-reads the account. Everything
              else — renaming, resizing, dragging, completing — changes what is
              on screen and leaves the server call to the reader. */}
          <RefreshButton
            className="wk-icon-btn"
            busy={refreshing}
            onRefresh={refresh}
          />
          <button
            className="wk-icon-btn"
            id="wkSidebarToggle"
            type="button"
            aria-expanded={!collapsed}
            aria-controls="wkSidebar"
            title={`${collapsed ? 'Show' : 'Hide'} the overview column`}
            onClick={toggleSidebar}
          >
            {/* A panel, not the design's funnel: this shows and hides the
                column on the right, and there is nothing here to filter. */}
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M15 4v16" />
            </svg>
          </button>
          <button
            type="button"
            className="wk-icon-btn"
            title="Settings"
            onClick={() => navigate('/settings')}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
            </svg>
          </button>
        </div>
      </div>

      {/* A refresh that failed, over the week it failed to change rather than
          in place of it. */}
      {error && <ErrorState message={error} onRetry={refresh} />}

      <div className={`wk-main${collapsed ? ' sidebar-collapsed' : ''}`}>
        <div className="wk-gridwrap">
          <div className="wk-grid-head">
            <div className="wk-corner" />
            <div className="wk-dayhead-row">
              {days.map((day) => (
                <div className="wk-dayhead" key={day.iso}>
                  <div className="wk-dayname">{day.name}</div>
                  <div className={`wk-daydate${day.iso === todayIso ? ' today' : ''}`}>
                    {day.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* One chip per day — the same note the Day and Month views show,
              with the icon guessed from what it says, becoming the input it
              always was when it is clicked. A day with nothing on it offers
              the word instead.
              A day can carry up to five focuses (see hooks/useDayFocus) and a
              column this narrow can show one, so the chip shows the primary
              and counts the rest. Editing here edits the primary and leaves
              the others alone; the Day view is where the whole list lives. */}
          <div className="wk-allday-row">
            <div className="wk-allday-label">Focus</div>
            <div className="wk-allday-cells">
              {days.map((day) => {
                const all = dayFocus.list(day.iso);
                const text = all[0] ?? '';
                const more = Math.max(0, all.length - 1);
                const editing = focusEditing === day.iso;
                return (
                  <div className="wk-allday-cell" key={day.iso}>
                    {editing ? (
                      <input
                        className="wk-day-focus"
                        type="text"
                        autoFocus
                        data-date={day.iso}
                        value={text}
                        placeholder="Focus…"
                        aria-label={`Focus for ${day.name} ${day.label}`}
                        onChange={(event) =>
                          dayFocus.setPrimary(day.iso, event.target.value)
                        }
                        onBlur={() => setFocusEditing(null)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === 'Escape') {
                            event.currentTarget.blur();
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className={`wk-focus-chip${text ? '' : ' is-empty'}`}
                        aria-label={
                          more
                            ? `Focus for ${day.name} ${day.label}: ${all.join(', ')}`
                            : `Focus for ${day.name} ${day.label}`
                        }
                        /* Always something, and something that says the chip
                           is a control: it looks like a label, and a reader
                           who does not know it can be clicked has no way to
                           find out. The extras were the only case that said
                           anything at all before. */
                        title={
                          all.length
                            ? `${all.join('\n')}\n\nClick to edit`
                            : 'Click to set a focus for this day'
                        }
                        onClick={() => setFocusEditing(day.iso)}
                      >
                        {text ? (
                          <i
                            className="cal-ico"
                            style={{ ['--ico' as string]: `url(${iconUrlFor(text)})` }}
                            aria-hidden="true"
                          />
                        ) : (
                          <span className="wk-focus-chip-plus" aria-hidden="true">+</span>
                        )}
                        <span className="wk-focus-chip-text">{text || 'Focus'}</span>
                        {more > 0 && (
                          <span className="wk-focus-chip-more" aria-hidden="true">
                            +{more}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="wk-scroll" ref={scroller}>
            <TimeLabels now={thisWeek ? nowOffset(now) : null} at={now} />
            <div className="wk-daycols" ref={daycols}>
              {/* The now line belongs to the week, not to Monday. Drawn on the
                  day column it marks, it stopped dead at that column's edge —
                  a 250px dash in the middle of a grid, easy to mistake for part
                  of a block. One line across all seven columns is what a reader
                  can find without looking for it, and it sits above the blocks
                  rather than behind them so a busy morning cannot swallow it.
                  The Day view still draws its own, inside its single column. */}
              {thisWeek && nowOffset(now) !== null && (
                <div className="wk-nowline" style={{ top: nowOffset(now) as number }} />
              )}
              {columns.map((column) => (
                <DayColumn
                  key={column.iso}
                  iso={column.iso}
                  blocks={column.blocks}
                  today={column.iso === todayIso}
                  onEdit={(block) => openFor(block, column.iso, 'edit')}
                  onDelete={(block) => openFor(block, column.iso, 'delete')}
                  onComplete={complete}
                  completingId={completing}
                  flagged={column.conflict}
                />
              ))}
            </div>
          </div>

        </div>
        {/* One column, two things it can be. The library replaces the overview
            rather than opening over it: they are the same panel of the same
            width, and a dialog would put the grid behind a scrim at exactly
            the moment the reader wants to watch it change colour. */}
        {library && !collapsed ? (
          <SubjectLibrary
            subjects={subjectList}
            username={username}
            onClose={() => setLibrary(false)}
          />
        ) : (
        <WeekSidebar
          mini={{
            year: mini.year,
            month: mini.month,
            from: opensIso,
            to: closesIso,
            weekStart: startsOn,
            load: miniLoad,
            onStep: stepMini,
            onPick: (iso) => goTo(dates.fromIsoDate(iso)),
          }}
          onOpenLibrary={() => setLibrary(true)}
          stats={overview}
          streak={Number(stats.current_streak) || 0}
          focus={focus}
          days={weekDays}
          breakdown={breakdown}
          priorities={priorities}
          upcoming={upcoming}
          onViewMonth={() => navigate('/calendar/month')}
          onViewAnalytics={() => navigate('/analytics')}
          collapsed={collapsed}
        />
        )}
      </div>

      <BlockDialogs actions={actions} username={username} wide />

      {slot && (
        <CreateChooser
          when={`${dates.formatDate(dates.fromIsoDate(slot.iso), {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })} · ${clockLabel(slot.startTime)} – ${clockLabel(slot.endTime)}`}
          onChoose={(kind) => openDragged(kind === 'event' ? 'add-event' : 'add-task')}
          onCancel={() => setSlot(null)}
        />
      )}

      {clash?.conflict && (
        <ConflictDialog
          where={dates.formatDate(dates.fromIsoDate(clash.iso), {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}
          sides={[
            {
              name: blockLabel(clash.conflict[0]),
              when: blockWhen(clash.conflict[0]),
              kind: clash.conflict[0].kind,
            },
            {
              name: blockLabel(clash.conflict[1]),
              when: blockWhen(clash.conflict[1]),
              kind: clash.conflict[1].kind,
            },
          ]}
          onReveal={revealClash}
          onDelete={(which) => {
            const pair = clash.conflict;
            if (pair) openFor(pair[which], clash.iso, 'delete');
          }}
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
