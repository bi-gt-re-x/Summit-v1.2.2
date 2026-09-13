/**
 * The time grid: what a day's blocks are, and where they sit.
 *
 * The Week view and the Day view are the same grid — seven columns or one —
 * so this is the arithmetic both of them share, with no React in it: given a
 * date, the account's tasks and the event store, it returns the blocks that
 * day is carrying, already positioned.
 *
 * **The day runs 6 AM to 5 AM.** Hours after midnight are counted on past 24
 * (29 is 5 AM the next morning), which is what keeps an evening block that
 * runs past midnight in one piece on the column it started on instead of
 * breaking in two across the boundary.
 *
 * Ported from the rendering half of calendar-week.js.
 */
import { hmText, hourText, rangeText, timeText } from './clock';
import { familyForSection } from './calendarColors';
import { familyForSubject, type Family } from './eventPalette';
import { eventFamilyKey, taskFamilyKey } from './calendarFamilies';
import { isoOf, monthKey, type CalendarData } from './calendarStore';
import type { Subject } from '@/services/subjects';
import type { Task } from '@/types';

// --------------------------------------------------------------------------
// Geometry
// --------------------------------------------------------------------------
export const START_HOUR = 6;
/** 5 AM the next day. */
export const END_HOUR = 29;
/**
 * Pixels per hour. The stylesheets are sized to match.
 *
 * 72 was half again the 48 the design draws at. 48 put seventeen labels from
 * 6 AM to 10 PM across about 800px of grid, which read as the right density on
 * paper and as a cramped one on screen — an hour was barely taller than the two
 * lines of text a block wants to carry, and the rows a reader drags between
 * were a thumb's width apart. It was 141 before that, nearly three times 48,
 * and the consequence was not a roomier grid but a much smaller one: four hours
 * on screen at a time out of a day the reader is trying to see the shape of.
 *
 * 86 is 72 stretched by the fifth asked for — 86.4, taken to a whole pixel so
 * the twenty-four hour rules and the seven day columns they cross land on
 * device pixels rather than being drawn a fifth of one either side of them.
 * Every measurement on the grid comes off this number, so the day separators
 * grow with the rows and the blocks stay where the clock puts them.
 */
export const HOUR_H = 86;
/**
 * The floor for a very short block, so its one row actually fits.
 *
 * A quarter of an hour is 21.5px at 86px an hour — 17.5 after the 4px a block
 * gives back to its neighbours — and the row inside it is an 11px line at 1.25
 * (13.75px) between 3px of padding top and bottom, so 20px of content in 17.5px
 * of block clipped the name and the time along their middles. 22 is that
 * content plus a pixel either side. It does mean a 15 minute block draws a few
 * pixels taller than a quarter of an hour of grid,
 * which is the trade this floor has always made: a block that cannot be read
 * is not worth drawing to scale.
 */
const COMPACT_MIN_H = 22;
/**
 * Under this many minutes a block is one strip: the name and the whole range
 * on a single row, and nothing else.
 *
 * Thirty is where the two-line layout starts to have room rather than to
 * merely clear a minimum. Those two lines are an 11px line at 1.25 each
 * (13.75px) between 5px of padding top and bottom, so they need 37.5px; a
 * block of `m` minutes is `(m / 60) * HOUR_H - 4` pixels tall. That is 31.8 at
 * twenty-five minutes — nearly six pixels short — 37.57 at twenty-nine, which
 * clears it by seven hundredths of a pixel and is not room by any useful
 * meaning of the word, and 39 at thirty, which is.
 *
 * It was 20, and the ten minutes between the two numbers were the bug: a
 * twenty-five minute block is 31.8px, so it was drawn with a name *and* a
 * floor for its time and had six pixels less than the pair needed. Nothing
 * overflowed visibly, because `.wk-event` is `overflow: hidden` — the time
 * simply had its lower half cut off, on every short block on the grid, which
 * is the failure that looks like a rendering glitch rather than a layout that
 * was asked for too much.
 *
 * One strip is the honest answer at that height. The name truncates, which is
 * the trade `.wk-event-head` already documents for narrow columns, and a
 * truncated name beats a bisected time: the reader can tell a truncated word
 * is truncated, and cannot tell that half a clipped one is missing.
 */
const COMPACT_UNDER = 30;
/**
 * Under this many minutes a block is too short for its full layout.
 *
 * A task at full size is four lines with air between them — name, start time,
 * XP, and the end time on the floor — which needs about 84 pixels. This was
 * where the layout actually stopped fitting: at 72px an hour, 80 minutes was 92
 * pixels. At 86 it is 119, so the number is now the conservative side of the
 * fit rather than the edge of it — a block of about an hour has the room for
 * four lines and is still drawn with three. Left where it is deliberately: the
 * taller row was asked for to give the grid air, and spending all of it on
 * putting XP back onto shorter blocks would hand it straight back.
 * Under the threshold a block gives up the XP and puts its range on the floor,
 * which is two lines and fits from thirty minutes up; under `COMPACT_UNDER` it
 * gives up the second line too and says everything on one. The XP is always
 * what goes first: the time is what a calendar is for, and a block that cannot
 * say when it runs is not worth drawing.
 */
const SNUG_MINUTES = 80;

export const GRID_HEIGHT = (END_HOUR - START_HOUR) * HOUR_H;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// --------------------------------------------------------------------------
// Labels
// --------------------------------------------------------------------------
/* Every label below writes whichever clock the account chose. The twelve-hour
   arithmetic these used to do inline is in utils/clock now — one copy, and the
   note there says why the preference is read rather than passed in. */

/** "6 AM" for a grid hour, counting 24–29 back into the small hours. */
export function hourLabel(hour: number): string {
  return hourText(hour);
}

/** "6:40 PM". */
export function timeLabel(date: Date): string {
  return timeText(date);
}

/** "6 PM" on the hour, "6:40 PM" otherwise — the compact layout's form. */
export function timeLabelShort(date: Date): string {
  return timeText(date, true);
}

/** "Jul 15, 6:40 PM" — a task block's due date. */
export function dueLabel(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${timeLabel(date)}`;
}

/** "Jul 15 6:40 PM" — a completion that happened on another day. */
export function shortDateTime(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()} ${timeLabel(date)}`;
}

/** "6:40 PM" from a stored "18:40". */
export function hmLabel(hm: string): string {
  const [hours = 0, minutes = 0] = String(hm).split(':').map(Number);
  return hmText(hours, minutes);
}

/** As above, dropping ":00" on the hour. */
export function hmLabelShort(hm: string): string {
  const [hours = 0, minutes = 0] = String(hm).split(':').map(Number);
  return hmText(hours, minutes, true);
}

/**
 * "7:40 – 8:40 AM" for a block's two ends.
 *
 * The meridiem is written once when both ends share it, which is how the design
 * writes a range and how anyone says one out loud. It matters more here than it
 * reads: a block is a seventh of the grid wide, and "7:40 AM – 8:40 AM" is four
 * characters longer than the column can show.
 */
export function rangeLabel(from: Date, to: Date): string {
  return rangeText(from, to);
}

/** A stored "18:40" as a Date today, so a range can be written from two of them. */
export function hmToDate(hm: string): Date {
  const [hours = 0, minutes = 0] = String(hm).split(':').map(Number);
  const at = new Date();
  at.setHours(hours, minutes, 0, 0);
  return at;
}

/** "18:40" as 18.667 — hours, for placing a block. */
export function hmToHour(hm: string): number {
  const [hours = 0, minutes = 0] = String(hm).split(':').map(Number);
  return hours + minutes / 60;
}

/** Minutes past midnight as "18:40". */
export function minutesToHm(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// --------------------------------------------------------------------------
// A day on this grid is not a day on the clock
// --------------------------------------------------------------------------
/**
 * A time as minutes down the column, rather than minutes past midnight.
 *
 * A column here runs 6 AM to 5 AM — `START_HOUR` to `END_HOUR` — so the small
 * hours belong to the day that *began* the evening before, and they sort after
 * 11 PM rather than before 7 AM. That is the whole of the difference: 05:00 is
 * 1740 minutes down the column, not 300.
 *
 * Everything that has to decide whether one time is "after" another on this
 * calendar goes through here. Comparing "HH:MM" strings, or raw minutes past
 * midnight, says 05:00 comes before 23:00 — which is true of the clock and
 * false of the grid, and is what used to make an 11 PM to 5 AM block look like
 * a negative span and be refused.
 */
export function columnMinutes(hm: string): number {
  const [hours = 0, minutes = 0] = String(hm).split(':').map(Number);
  const total = hours * 60 + minutes;
  return total < START_HOUR * 60 ? total + 1440 : total;
}

/**
 * How long a span is in minutes, read down the column.
 *
 * Positive for any span that fits inside one column, **including one that
 * crosses midnight**: 23:00 to 05:00 is six hours. Zero or negative means the
 * end does not follow the start on this day — 23:00 to 06:00 would have to run
 * past the bottom of the column into tomorrow, and there is no such block.
 */
export function columnSpanMinutes(start: string, end: string): number {
  return columnMinutes(end) - columnMinutes(start);
}

/**
 * Whether a time sits on the calendar day after the one the column is named
 * for — 1 for the small hours, 0 for the rest.
 *
 * A block drawn at the bottom of Tuesday's column ends at 2 AM on *Wednesday*,
 * and a task written with Tuesday's date and 02:00 is a task on the wrong day:
 * it falls before Tuesday's column even starts, so it draws on Monday.
 */
export function dayOffsetOf(hm: string): number {
  return columnMinutes(hm) >= 1440 ? 1 : 0;
}

/** `iso` moved on by `days`, as an ISO date. */
export function shiftIso(iso: string, days: number): string {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number);
  const at = new Date(year, month - 1, day + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/**
 * The timestamp a time on `iso`'s column really stands for.
 *
 * "2026-08-04" + "02:00" is 2 AM on the *5th*, because 2 AM is the tail of the
 * 4th's column. Used for both ends of a task, so an overnight one is stored
 * with a due date after its start rather than eighteen hours before it.
 */
export function columnStamp(iso: string, hm: string): string {
  return `${shiftIso(iso, dayOffsetOf(hm))}T${hm}:00`;
}

// --------------------------------------------------------------------------
// Pixels ↔ time — what dragging on the grid is made of
// --------------------------------------------------------------------------
/**
 * The step everything a drag produces lands on: a quarter of an hour.
 *
 * Fifteen minutes rather than five. Five was a finer grid than anyone schedules
 * on — the times it produced were 8:35 and 9:10, and hitting a round one meant
 * landing a three-pixel target — and it is also the shortest a block could be
 * made. A quarter hour is the unit a day is actually planned in, and at
 * `HOUR_H` it is a step the pointer can feel.
 */
export const MIN_STEP_MINUTES = 15;
/** That step in pixels. */
export const MIN_STEP_PX = (HOUR_H * MIN_STEP_MINUTES) / 60;

/**
 * The gap a block is drawn short by, so neighbours do not touch.
 *
 * `layOut` above takes 4px off every block's height. A drag has to work in the
 * **true** span — the rendered height plus this — or a drop lands a minute or
 * two inside its neighbour and the grid meets it with the overlap dialog the
 * moment it redraws.
 */
export const BLOCK_GAP = 4;

/** Round a pixel offset to the nearest quarter hour. */
export function snapPx(px: number): number {
  return Math.round(px / MIN_STEP_PX) * MIN_STEP_PX;
}

/**
 * Pixels down a column as minutes past midnight, snapped to the quarter hour.
 *
 * The column starts at START_HOUR, so pixels past the 18-hour mark wrap into
 * the small hours — 6 AM plus 19 hours is 1 AM, not 25 o'clock.
 */
export function pxToClockMinutes(px: number): number {
  const gridMinutes = START_HOUR * 60 + (px / HOUR_H) * 60;
  const snapped = Math.round(gridMinutes / MIN_STEP_MINUTES) * MIN_STEP_MINUTES;
  return ((snapped % 1440) + 1440) % 1440;
}

/**
 * Pixels down a column as the real moment they stand for.
 *
 * Unlike `pxToClockMinutes` this keeps the date, which is what an overnight
 * task needs: 11 PM plus three hours is 2 AM *tomorrow*, and a task whose
 * due_date says otherwise is a task on the wrong day.
 */
export function pxToDate(iso: string, px: number): Date {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number);
  const at = new Date(year, month - 1, day, START_HOUR, 0, 0, 0);
  const minutes =
    Math.round(((px / HOUR_H) * 60) / MIN_STEP_MINUTES) * MIN_STEP_MINUTES;
  return new Date(at.getTime() + minutes * 60000);
}

/** "2026-08-04T09:15:00" — the shape the task API stores times in. */
export function isoStamp(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `T${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
  );
}

// --------------------------------------------------------------------------
// Blocks
// --------------------------------------------------------------------------
interface BlockBase {
  /** Grid hours, 6…29. */
  start: number;
  end: number;
  /** Filled in by `layOut`. */
  top: number;
  height: number;
  compact: boolean;
  /** Room for a title and one line under it, but not for all three. */
  snug: boolean;
}

export interface TaskBlock extends BlockBase {
  kind: 'task';
  id: string;
  title: string;
  xp: number;
  done: boolean;
  priority: string;
  /**
   * The icon file for the subject the task is filed under, if it has one.
   *
   * Carried on the block rather than looked up when it is drawn, so the
   * arithmetic in this file stays the one place that knows what a block is.
   * Absent when the task has no subject, and the block falls back to the icon
   * guessed from its name — see utils/calendarIcons.
   */
  subjectIcon?: string;
  /** "Chem" — the subject's short label, for the block's tooltip. */
  subjectLabel?: string;
  /**
   * The colour family, from the subject the task is filed under.
   *
   * Looked up rather than assigned, so every Chemistry task on the account is
   * the same teal and a task keeps its colour through a drag — which rewrites
   * the row under a new id and would lose anything held per task. Work filed
   * under nothing is gray, which is the family that means exactly that. See
   * utils/eventPalette.
   */
  family: Family;
  /** Past its due time and not done. The block says so; see palette.css. */
  overdue: boolean;
  startDT: Date;
  dueDT: Date | null;
  completedDT: Date | null;
  /** Set when the task runs past this column: the day it continues on. */
  contDT: Date | null;
  /** True when the task began before this column — this is its tail. */
  cont: boolean;
}

export interface EventBlock extends BlockBase {
  kind: 'event';
  name: string;
  startHM: string;
  endHM: string;
  /** The family the event was given when it was made. See `familyForSection`. */
  family: Family;
}

export type Block = TaskBlock | EventBlock;

export function blockLabel(block: Block): string {
  return block.kind === 'event' ? block.name : block.title;
}

/** A grid hour (6…29) as a clock time today, so a range can be written of two. */
function gridHourDate(hour: number): Date {
  const at = new Date();
  at.setHours(Math.floor(hour) % 24, Math.round((hour % 1) * 60), 0, 0);
  return at;
}

/**
 * "9 – 10:30 AM" — the span a block actually occupies on the column.
 *
 * Read off the laid-out hours rather than off the underlying task or event, so
 * it is the span the reader can see. That matters where it is used: the overlap
 * dialog has to describe two blocks precisely enough that the reader can find
 * them on the grid behind it.
 */
export function blockWhen(block: Block): string {
  return rangeLabel(gridHourDate(block.start), gridHourDate(block.end));
}

function toDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The account's tasks that fall in this column, sized by their real span.
 *
 * A task runs from when it was created to when it is due, shrinking to the
 * completion time if it was finished early — but never growing past the due
 * time when it was finished late, because a block is what was scheduled, not
 * how long it overran. Only tasks placed on the calendar are here at all: a
 * dashboard to-do is a list item, not an appointment.
 *
 * `subjects` is optional and the block simply goes without an icon of its own
 * when it is missing, which is what the catalogue not having arrived yet looks
 * like — a grid that waits for it would be a grid that flashes empty.
 */
export function dayTaskBlocks(
  iso: string,
  tasks: Task[],
  /** The subject catalogue keyed by id — see hooks/useSubjects. */
  subjects?: Map<string, Subject>,
  /**
   * The week's colour plan — see utils/calendarFamilies. Optional, and the
   * block falls back to its subject's own family without it, which is what an
   * unplanned view (or one drawn before the plan is built) looks like rather
   * than a view that waits.
   */
  plan?: Map<string, Family>,
): TaskBlock[] {
  const gridStart = new Date(`${iso}T00:00:00`);
  gridStart.setHours(START_HOUR, 0, 0, 0);
  const gridEnd = new Date(gridStart.getTime() + (END_HOUR - START_HOUR) * 3_600_000);

  const out: TaskBlock[] = [];

  tasks.forEach((task) => {
    if (!isCalendarPlaced(task)) return;

    const startDT = toDate(task.created_at) || toDate(task.due_date);
    if (!startDT) return;

    const dueDT = toDate(task.due_date);
    const completedDT = task.status === 'done' ? toDate(task.completed_at) : null;

    // **A block is the span that was booked, and nothing moves it.**
    //
    // It used to shrink to the completion time when a task was finished early
    // and grow to nothing when it was finished late, so a block drawn at 8:30
    // to 9:00 became 8:30 to 8:41 the moment it was ticked off — the times on
    // it changed under the reader after they had put it there. The end is the
    // due time, period: what was dragged out is what stays on the grid. When it
    // was actually finished is a different fact, and the tick and the green
    // name are where that is said.
    let endDT = dueDT || new Date(startDT.getTime() + 3_600_000);
    if (endDT <= startDT) endDT = new Date(startDT.getTime() + 3_600_000);
    if (endDT <= gridStart || startDT >= gridEnd) return;

    const hourInColumn = (date: Date) =>
      START_HOUR + (date.getTime() - gridStart.getTime()) / 3_600_000;
    const clamp = (hour: number) => Math.max(START_HOUR, Math.min(hour, END_HOUR));

    const subject = (task.subject && subjects?.get(task.subject)) || null;
    const id = String(task.id);

    out.push({
      kind: 'task',
      id,
      start: clamp(startDT < gridStart ? START_HOUR : hourInColumn(startDT)),
      end: clamp(endDT > gridEnd ? END_HOUR : hourInColumn(endDT)),
      top: 0,
      height: 0,
      compact: false,
      snug: false,
      title: task.title || 'Task',
      xp: Number(task.xp_value) || 0,
      done: task.status === 'done',
      priority: String(task.priority || '').toLowerCase(),
      ...(subject ? { subjectIcon: subject.icon, subjectLabel: subject.label } : {}),
      family: plan?.get(taskFamilyKey(task)) ?? familyForSubject(task.subject),
      overdue: task.status !== 'done' && !!dueDT && dueDT.getTime() < Date.now(),
      startDT,
      dueDT,
      completedDT,
      contDT: endDT > gridEnd ? new Date(gridStart.getTime() + 86_400_000) : null,
      cont: startDT < gridStart,
    });
  });

  return out.sort((a, b) => a.start - b.start);
}

/**
 * Only a task placed on the calendar may be drawn on one.
 *
 * Two tests, and a task has to pass both.
 *
 * **The flag.** It arrives as a boolean from the API and as `1` or `"true"`
 * from older rows, so it is compared loosely on purpose — the alternative is a
 * calendar that silently loses everything created before the column was
 * normalised.
 *
 * **A deadline.** A block is a span and a span needs two ends; without a due
 * date there is no second end, and the grid used to invent one an hour after
 * the task was typed. Every task the calendar's own dialogs create has both
 * times, so this costs a real calendar entry nothing — what it catches is a
 * to-do that carries the flag because it was made before the dashboard's
 * dialog started saying otherwise (see components/Dashboard/TaskModal), and
 * a to-do has no hour on a calendar at all.
 */
export function isCalendarPlaced(
  task: Pick<Task, 'show_on_calendar' | 'due_date'>,
): boolean {
  const value = task.show_on_calendar as unknown;
  const flagged = value === true || value === 1 || value === '1' || value === 'true';
  return flagged && Boolean(task.due_date);
}

/** The events stored on this day, sized by their times. */
export function dayEventBlocks(
  iso: string,
  data: CalendarData,
  /** The week's colour plan — see `dayTaskBlocks` above. */
  plan?: Map<string, Family>,
): EventBlock[] {
  const day = data[monthKey(iso)];
  if (!day?.timestamps) return [];

  const clamp = (hour: number) => Math.max(START_HOUR, Math.min(hour, END_HOUR));
  const out: EventBlock[] = [];

  day.timestamps.forEach((section) => {
    if (section.isDashboardTask) return;
    if (!section.startTime || !section.endTime) return;

    // Both ends are lifted past midnight together, so an event that starts at
    // 10:35 PM and ends at 12:05 AM stays one block on this column.
    let startHour = hmToHour(section.startTime);
    if (startHour < START_HOUR) startHour += 24;
    let endHour = hmToHour(section.endTime);
    if (endHour < START_HOUR) endHour += 24;
    if (endHour <= startHour) endHour = startHour + 1;

    out.push({
      kind: 'event',
      start: clamp(startHour),
      end: clamp(endHour),
      top: 0,
      height: 0,
      compact: false,
      snug: false,
      name: section.task || 'Event',
      startHM: section.startTime,
      endHM: section.endTime,
      family:
        plan?.get(
          eventFamilyKey(section.task || 'Event', section.startTime, section.endTime),
        ) ?? familyForSection(section),
    });
  });

  return out;
}

/**
 * Position a day's blocks, and say whether two of them clash.
 *
 * Everything keeps full width and layers where it overlaps, longer blocks
 * beneath so a short one is never buried. The clash is reported rather than
 * drawn around: the views stop the reader and make them delete one side,
 * because two things booked at once is not something the grid should quietly
 * paint over.
 */
export function layOut(blocks: Block[]): { blocks: Block[]; conflict: [Block, Block] | null } {
  const positioned = blocks.map((block) => {
    const minutes = (block.end - block.start) * 60;
    const height = Math.max(2, (block.end - block.start) * HOUR_H - 4);
    return {
      ...block,
      top: (block.start - START_HOUR) * HOUR_H,
      height: minutes < COMPACT_UNDER ? Math.max(height, COMPACT_MIN_H) : height,
      compact: minutes < COMPACT_UNDER,
      snug: minutes >= COMPACT_UNDER && minutes < SNUG_MINUTES,
    };
  });

  // A completed task is a record of what happened, not a claim on the time,
  // so it cannot clash with anything.
  const live = positioned.filter(
    (block) => block.kind === 'event' || !block.done,
  );
  let conflict: [Block, Block] | null = null;
  for (let i = 0; i < live.length && !conflict; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (a && b && overlaps(a, b)) {
        conflict = [a, b];
        break;
      }
    }
  }

  // Longer blocks first, so they paint beneath; ties keep the earlier start
  // underneath, which staggers the titles rather than stacking them.
  positioned.sort((a, b) =>
    a.height !== b.height ? b.height - a.height : a.top - b.top,
  );

  return { blocks: positioned, conflict };
}

/** A real overlap, not two blocks merely touching at 2–3 and 3–4. */
function overlaps(a: Block, b: Block): boolean {
  const EPSILON = 0.001;
  return Math.min(a.end, b.end) - Math.max(a.start, b.start) > EPSILON;
}

// --------------------------------------------------------------------------
// The clock
// --------------------------------------------------------------------------
/** Where "now" sits on the grid, or null when it is outside the window. */
export function nowOffset(now: Date = new Date()): number | null {
  let hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  if (hour < START_HOUR) hour += 24;
  if (hour > END_HOUR) return null;
  return (hour - START_HOUR) * HOUR_H;
}

/**
 * "6:40" for the badge beside the now line — no meridiem.
 *
 * It was "6:40 PM", and those three characters were the whole problem: the
 * badge then needed more of the hour rail than the rail has spare, so it landed
 * on top of whichever hour label it passed and that label had to be hidden to
 * get out of its way. Twice an hour the rail was missing an hour. Without the
 * meridiem the badge fits in the gap the rail already leaves, and nothing has
 * to give. Nothing is lost with it: the badge sits on a line between two
 * labelled hours that both say AM or PM.
 */
export function nowLabel(now: Date = new Date()): string {
  return `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** Every hour the grid draws a label for. */
export function gridHours(): number[] {
  const hours: number[] = [];
  for (let hour = START_HOUR; hour <= END_HOUR; hour++) hours.push(hour);
  return hours;
}

/** The seven ISO dates of the week a date falls in, Monday first. */
export function weekDays(monday: Date): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    out.push(isoOf(`${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`));
  }
  return out;
}
