/**
 * The one made-up student every figure on the landing page is read from.
 *
 * Kept together so no two cards can disagree: 8,610 XP is level 13 with 810 of
 * 1,300 toward 14 (level N costs N × 100, utils/format), the four pillars
 * average to the growth score, and the streak is the same six days wherever it
 * is printed. Change one and change the rest with it. None of this is anybody's
 * account; the page says it is a demonstration where it matters.
 */
export const STUDENT = {
  xp: 8610,
  level: 13,
  levelShare: 62,
  growth: 83,
  streak: 6,
  bestStreak: 14,
  pillars: [
    { name: 'Productivity', value: 92 },
    { name: 'Consistency', value: 78 },
    { name: 'Quality', value: 81 },
    { name: 'Efficiency', value: 83 },
  ],
  /** Daily XP for a term: six slow weeks, then six good ones. */
  term: [
    { name: 'Weeks 1–6', values: [40, 65, 30, 75, 55, 90, 60], colour: '#93C5FD' },
    { name: 'Weeks 7–12', values: [95, 140, 110, 175, 130, 210, 165], colour: '#2563EB' },
  ],
  /** Hours a day this week: all of it, and the part spent focused. */
  week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  hoursTotal: [3.2, 4.4, 6.2, 4.6, 4.8, 6.0, 3.8],
  hoursFocused: [2.4, 3.6, 5.6, 3.4, 4.0, 5.2, 3.0],
  /** Today's list. */
  today: [
    { name: 'Math Practice', minutes: 90, done: false },
    { name: 'Violin Practice', minutes: 60, done: true },
    { name: 'Read', minutes: 20, done: false },
    { name: 'Workout', minutes: 60, done: false },
    { name: 'English Essay', minutes: 45, done: false },
  ],
} as const;

/** "1h 30m", "20m". */
export function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/**
 * XP for each of the last `days` days, ending today, oldest first — so the
 * chart is always full and always ends on the day it is read. Deterministic,
 * so the picture does not change on every load.
 */
export function recentXp(now: Date, days = 31): { date: Date; xp: number }[] {
  return Array.from({ length: days }, (_, at) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - at));
    const n = date.getDate() + date.getMonth() * 31;
    const wave = Math.sin(n * 1.7) * 0.5 + Math.sin(n * 0.6) * 0.5;
    return { date, xp: Math.round(150 + wave * 120 + (n % 7 === 3 ? 90 : 0)) };
  });
}

/** Whether a day of the month had work on it, for the calendar's dots. */
export function hadWork(day: number): boolean {
  return day % 3 !== 0 || day % 5 === 0;
}

/** "Good afternoon", by the clock. */
export function partOfDay(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
