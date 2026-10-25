/**
 * The summary at the top of Analytics' Overview: the last 7, 30 or 365 days in
 * a few short bullets, against the same stretch before it.
 *
 * Four groups, in the order people ask them:
 *
 *   Consistency   how many days you worked, your longest run and longest break
 *   Effort        tasks, XP, timer hours, how hard the work was
 *   What changed  only the moves big enough to mean something
 *   Subjects      each subject you worked on, improving, slipping or steady
 *
 * Rolling windows, like utils/weekTrend: "week" is the last seven days ending
 * today, so a Tuesday isn't compared with a whole week. Everything is read off
 * the day series and the task list the page already has; nothing is fetched.
 *
 * A comparison is only made when the account's record reaches back over the
 * whole earlier stretch. A first week isn't "up 100%" on nothing.
 */
import type { GrowthDay, Task } from '@/types';
import { isActiveDay } from './activeDay';

export type SummaryPeriod = 'week' | 'month' | 'year';

export const PERIOD_DAYS: Record<SummaryPeriod, number> = { week: 7, month: 30, year: 365 };

const BEFORE: Record<SummaryPeriod, string> = {
  week: 'the week before',
  month: 'the month before',
  year: 'the year before',
};

export type Tone = 'up' | 'down' | 'flat';

export interface SummaryLine {
  /** Bold lead-in, like "Days worked". */
  label: string;
  text: string;
  tone: Tone;
}

export interface SummaryGroup {
  id: 'consistency' | 'effort' | 'changed' | 'subjects';
  title: string;
  lines: SummaryLine[];
}

export interface PeriodSummary {
  period: SummaryPeriod;
  from: string;
  to: string;
  /** False when the record doesn't reach back over the stretch before. */
  compared: boolean;
  groups: SummaryGroup[];
  /** Nothing at all was done in the period. */
  empty: boolean;
}

const DAY_MS = 86_400_000;
const num = (value: unknown) => Number(value) || 0;

function shift(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

const doneOn = (task: Task) => (task.status === 'done' ? String(task.completed_at || '').slice(0, 10) : '');

function count(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function hours(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h >= 100) return `${count(h)} hours`;
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

/** "up 20%", "down 15%", or '' for a move under `noise` of where it started. */
function moved(now: number, was: number, noise = 0.1): { tone: Tone; words: string } {
  if (was <= 0) return now > 0 ? { tone: 'up', words: 'up from none' } : { tone: 'flat', words: '' };
  const change = (now - was) / was;
  if (Math.abs(change) < noise) return { tone: 'flat', words: 'about the same' };
  const pct = Math.round(Math.abs(change) * 100);
  return change > 0 ? { tone: 'up', words: `up ${pct}%` } : { tone: 'down', words: `down ${pct}%` };
}

interface Window {
  days: GrowthDay[];
  tasks: Task[];
}

function windowOf(all: GrowthDay[], tasks: Task[], from: string, to: string): Window {
  return {
    days: all.filter((day) => day.date >= from && day.date <= to),
    tasks: tasks.filter((task) => {
      const day = doneOn(task);
      return Boolean(day) && day >= from && day <= to;
    }),
  };
}

/** The days with work on them: active in the day series, or with a task
 *  finished. Either alone can miss one (a task finished with no XP logged). */
function workedDays(window: Window): Set<string> {
  const worked = new Set(window.days.filter(isActiveDay).map((day) => day.date));
  for (const task of window.tasks) worked.add(doneOn(task));
  return worked;
}

/** Longest run of worked days and longest break between them, inside a window. */
function runs(worked: Set<string>, from: string, to: string): { run: number; gap: number } {
  let run = 0;
  let gap = 0;
  let curRun = 0;
  let curGap = 0;
  let seenWork = false;
  for (let day = from; day <= to; day = shift(day, 1)) {
    if (worked.has(day)) {
      curRun += 1;
      run = Math.max(run, curRun);
      if (seenWork) gap = Math.max(gap, curGap);
      curGap = 0;
      seenWork = true;
    } else {
      curRun = 0;
      curGap += 1;
    }
  }
  return { run, gap };
}

function rated(tasks: Task[], field: 'execution' | 'difficulty'): number[] {
  return tasks.map((task) => num(task[field])).filter((value) => value >= 1 && value <= 5);
}

/**
 * The summary for one period ending `today`. `nameOf` turns a subject id into
 * its name.
 */
export function periodSummary(
  all: GrowthDay[],
  tasks: Task[],
  period: SummaryPeriod,
  today: string,
  nameOf: (id: string) => string,
): PeriodSummary {
  const span = PERIOD_DAYS[period];
  const from = shift(today, -(span - 1));
  const wasTo = shift(from, -1);
  const wasFrom = shift(from, -span);
  const now = windowOf(all, tasks, from, today);
  const was = windowOf(all, tasks, wasFrom, wasTo);
  const firstDay = all[0]?.date ?? today;
  const compared = firstDay <= wasFrom;
  const before = BEFORE[period];
  const unit = period === 'week' ? 'week' : period === 'month' ? 'month' : 'year';

  // ---- Consistency --------------------------------------------------------
  const workedNow = workedDays(now);
  const activeNow = workedNow.size;
  const activeWas = workedDays(was).size;
  const daysShown = Math.min(span, Math.max(1, Math.round((Date.parse(today) - Date.parse(firstDay)) / DAY_MS) + 1));
  const consistency: SummaryLine[] = [];
  const dayMove = activeNow - activeWas;
  consistency.push({
    label: 'Days worked',
    text:
      `${activeNow} of ${daysShown}` +
      (compared
        ? dayMove === 0
          ? `, same as ${before}.`
          : `, ${dayMove > 0 ? 'up' : 'down'} from ${activeWas}.`
        : '.'),
    tone: !compared || dayMove === 0 ? 'flat' : dayMove > 0 ? 'up' : 'down',
  });
  const { run, gap } = runs(workedNow, from, today);
  if (run >= 2) {
    consistency.push({ label: 'Longest run', text: `${run} days in a row.`, tone: run >= Math.min(5, span) ? 'up' : 'flat' });
  }
  if (gap >= 2) {
    consistency.push({ label: 'Longest break', text: `${gap} days off in a row.`, tone: gap >= 4 ? 'down' : 'flat' });
  }

  // ---- Effort -------------------------------------------------------------
  const effort: SummaryLine[] = [];
  const xpNow = now.days.reduce((sum, day) => sum + num(day.xp_earned), 0);
  const focusNow = now.days.reduce((sum, day) => sum + num(day.focus_minutes), 0);
  const focusWas = was.days.reduce((sum, day) => sum + num(day.focus_minutes), 0);
  const taskMove = moved(now.tasks.length, was.tasks.length);
  effort.push({
    label: 'Done',
    text:
      `${count(now.tasks.length)} task${now.tasks.length === 1 ? '' : 's'}${xpNow > 0 ? ` and ${count(xpNow)} XP` : ''}` +
      (!compared || !taskMove.words
        ? '.'
        : taskMove.tone === 'flat'
          ? `, about the same as ${before}.`
          : was.tasks.length === 0
            ? `, up from none ${before}.`
            : `, ${taskMove.words} on ${before}.`),
    tone: compared ? taskMove.tone : 'flat',
  });
  if (focusNow > 0 || focusWas > 0) {
    const focusMove = moved(focusNow, focusWas);
    effort.push({
      label: 'Focus',
      text:
        `${hours(focusNow)} on the timer` +
        (compared && focusWas > 0 && focusMove.tone !== 'flat' ? `, ${focusMove.tone === 'up' ? 'up' : 'down'} from ${hours(focusWas)}.` : '.'),
      tone: compared ? focusMove.tone : 'flat',
    });
  }
  const hardNow = mean(rated(now.tasks, 'difficulty'));
  const hardWas = mean(rated(was.tasks, 'difficulty'));
  if (hardNow !== null && rated(now.tasks, 'difficulty').length >= 3) {
    const shifted = compared && hardWas !== null && Math.abs(hardNow - hardWas) >= 0.2;
    effort.push({
      label: 'Difficulty',
      text: shifted
        ? `${hardNow.toFixed(1)} out of 5 on average, ${hardNow > hardWas! ? 'harder' : 'easier'} than ${before} (${hardWas!.toFixed(1)}).`
        : `${hardNow.toFixed(1)} out of 5 on average.`,
      tone: shifted ? (hardNow > hardWas! ? 'up' : 'down') : 'flat',
    });
  }

  // ---- What changed -------------------------------------------------------
  const changed: SummaryLine[] = [];
  const rateNow = mean(rated(now.tasks, 'execution'));
  const rateWas = mean(rated(was.tasks, 'execution'));
  if (compared) {
    if (
      rateNow !== null &&
      rateWas !== null &&
      rated(now.tasks, 'execution').length >= 3 &&
      rated(was.tasks, 'execution').length >= 3 &&
      Math.abs(rateNow - rateWas) >= 0.2
    ) {
      changed.push({
        label: 'How it went',
        text: `You rated your work ${rateNow.toFixed(1)} out of 5, ${rateNow > rateWas ? 'up' : 'down'} from ${rateWas.toFixed(1)}.`,
        tone: rateNow > rateWas ? 'up' : 'down',
      });
    }
    const late = (list: Task[]) => {
      const due = list.filter((task) => task.met_deadline === true || task.met_deadline === false);
      return { due: due.length, met: due.filter((task) => task.met_deadline === true).length };
    };
    const lateNow = late(now.tasks);
    const lateWas = late(was.tasks);
    if (lateNow.due >= 3 && lateWas.due >= 3) {
      const shareNow = lateNow.met / lateNow.due;
      const shareWas = lateWas.met / lateWas.due;
      if (Math.abs(shareNow - shareWas) >= 0.15) {
        changed.push({
          label: 'Deadlines',
          text: `Met ${lateNow.met} of ${lateNow.due} deadlines, ${shareNow > shareWas ? 'up' : 'down'} from ${Math.round(shareWas * 100)}% to ${Math.round(shareNow * 100)}%.`,
          tone: shareNow > shareWas ? 'up' : 'down',
        });
      }
    }
    const subjectsOf = (list: Task[]) => {
      const out = new Map<string, number>();
      for (const task of list) if (task.subject) out.set(task.subject, (out.get(task.subject) ?? 0) + 1);
      return out;
    };
    const subjNow = subjectsOf(now.tasks);
    const subjWas = subjectsOf(was.tasks);
    const started = [...subjNow.keys()].filter((id) => !subjWas.has(id));
    const stopped = [...subjWas.entries()].filter(([id, n]) => !subjNow.has(id) && n >= 3).map(([id]) => id);
    if (started.length) {
      changed.push({
        label: 'New',
        text: `Picked up ${started.slice(0, 3).map(nameOf).join(', ')}${started.length > 3 ? ` and ${started.length - 3} more` : ''}.`,
        tone: 'up',
      });
    }
    if (stopped.length) {
      changed.push({
        label: 'Dropped off',
        text: `No ${stopped.slice(0, 3).map(nameOf).join(', ')} this ${unit}${stopped.length > 3 ? `, and ${stopped.length - 3} more` : ''}.`,
        tone: 'down',
      });
    }
    if (changed.length === 0) {
      changed.push({ label: 'Not much', text: `About the same as ${before}.`, tone: 'flat' });
    }
  }

  // ---- Subjects -------------------------------------------------------------
  const subjects: SummaryLine[] = [];
  const bySubject = new Map<string, { now: Task[]; was: Task[] }>();
  for (const task of now.tasks) {
    if (!task.subject) continue;
    const entry = bySubject.get(task.subject) ?? { now: [], was: [] };
    entry.now.push(task);
    bySubject.set(task.subject, entry);
  }
  for (const task of was.tasks) {
    const entry = bySubject.get(task.subject ?? '');
    if (entry) entry.was.push(task);
  }
  const ranked = [...bySubject.entries()].sort((a, b) => b[1].now.length - a[1].now.length);
  const SHOW = 5;
  for (const [id, entry] of ranked.slice(0, SHOW)) {
    const rNow = rated(entry.now, 'execution');
    const rWas = rated(entry.was, 'execution');
    const aNow = mean(rNow);
    const aWas = mean(rWas);
    const n = entry.now.length;
    const m = entry.was.length;
    let tone: Tone = 'flat';
    let verdict = 'steady';
    let detail = `${n} task${n === 1 ? '' : 's'}`;
    if (!compared) {
      verdict = '';
    } else if (m === 0) {
      verdict = 'new';
      tone = 'up';
    } else if (aNow !== null && aWas !== null && rNow.length >= 2 && rWas.length >= 2 && Math.abs(aNow - aWas) >= 0.2) {
      tone = aNow > aWas ? 'up' : 'down';
      verdict = tone === 'up' ? 'improving' : 'slipping';
      detail += `, rated ${aWas.toFixed(1)} → ${aNow.toFixed(1)}`;
    } else {
      const volume = moved(n, m, 0.25);
      if (volume.tone !== 'flat') {
        tone = volume.tone;
        verdict = volume.tone === 'up' ? 'more work' : 'less work';
        detail += ` (${m} before)`;
      } else if (aNow !== null) {
        detail += `, rated ${aNow.toFixed(1)}`;
      }
    }
    subjects.push({
      label: nameOf(id),
      text: verdict ? `${verdict[0]!.toUpperCase()}${verdict.slice(1)}. ${detail[0]!.toUpperCase()}${detail.slice(1)}.` : `${detail[0]!.toUpperCase()}${detail.slice(1)}.`,
      tone,
    });
  }
  if (ranked.length > SHOW) {
    const rest = ranked.slice(SHOW).reduce((sum, [, entry]) => sum + entry.now.length, 0);
    subjects.push({ label: `${ranked.length - SHOW} more`, text: `${count(rest)} task${rest === 1 ? '' : 's'} between them.`, tone: 'flat' });
  }

  const groups: SummaryGroup[] = [
    { id: 'consistency', title: 'Consistency', lines: consistency },
    { id: 'effort', title: 'Effort', lines: effort },
    { id: 'changed', title: 'What changed', lines: changed },
    { id: 'subjects', title: 'By subject', lines: subjects },
  ];
  return {
    period,
    from,
    to: today,
    compared,
    groups: groups.filter((group) => group.lines.length > 0),
    empty: activeNow === 0 && now.tasks.length === 0,
  };
}
