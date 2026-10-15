/**
 * How many problems a task's title says it holds, or null.
 *
 * When there is a count, the rating prompt asks "how many did you get right?"
 * with the count already filled in as the total. That one number is the only
 * measure in the app that is not the student grading themselves, and it is
 * what lets the plan say which work went wrong (backend/tracking/record.py).
 *
 * The server's copy is `problem_count` in backend/tracking/record.py; both run
 * shared/cases/problem_count.json.
 */

/** The biggest set a title is believed to describe. "#1-500" is a page range. */
const MOST_PROBLEMS = 100;

const DASH = '[-–—]';
const NOUN = '(?:problems?|questions?|exercises?|qs?|exs?\\.?|drills?|cards?|flashcards?|items?)';
/** "#1-10", "# 3 - 8", "#4–#9" */
const HASH_RANGE = new RegExp(`#\\s*(\\d+)\\s*${DASH}\\s*#?\\s*(\\d+)`);
/** "problems 1-6", "Q3–12", "ex. 4-9" */
const NOUN_RANGE = new RegExp(`\\b${NOUN}\\s*(\\d+)\\s*${DASH}\\s*(\\d+)`, 'i');
/** "10 problems", "5 DP problems", "20 vocab cards" */
const COUNT = new RegExp(`\\b(\\d+)\\s+(?:[A-Za-z][\\w-]*\\s+){0,2}?${NOUN}\\b`, 'i');

export function problemCount(title: string | null | undefined): number | null {
  const text = String(title ?? '');
  for (const pattern of [HASH_RANGE, NOUN_RANGE]) {
    const found = pattern.exec(text);
    if (found) {
      const first = Number(found[1]);
      const last = Number(found[2]);
      if (first > 0 && first <= last && last - first + 1 <= MOST_PROBLEMS) return last - first + 1;
      return null;
    }
  }
  const found = COUNT.exec(text);
  if (found) {
    const count = Number(found[1]);
    return count > 0 && count <= MOST_PROBLEMS ? count : null;
  }
  return null;
}
