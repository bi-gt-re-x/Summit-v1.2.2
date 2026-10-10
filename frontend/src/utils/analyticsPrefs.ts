/**
 * What the analytics preferences actually do.
 *
 * The values themselves are declared in services/settings, beside every other
 * preference, and validated in backend/api/settings.py. This module is the
 * other half: the one place that turns a stored word into a decision the page
 * makes. Nothing here fetches, renders or remembers anything.
 *
 * ## Why the rules are a table and not an `if` in each panel
 *
 * Three preferences — tone, detail and log style — are each read in four or
 * five places. Written inline they would be fifteen conditions spread across
 * the tabs, and the failure mode is the one the page has been bitten by
 * before: two surfaces disagreeing about the same reader's setting, one of
 * them softening a shortfall that the other has just called a shortfall. A
 * table means a level is defined once and every surface reads the same row.
 *
 * ## The line tone does not cross
 *
 * **Tone never changes an arithmetic.** The score is the mean of five
 * measures at every setting, a percentage against a baseline is the same
 * percentage, and no rule stops producing a recommendation because the reader
 * asked for a gentle page. What it changes is editorial: how much of a miss
 * is worth calling a miss, how many problems are put in front of somebody at
 * once, and which half of a comparison the sentence leads with.
 *
 * That distinction is the whole reason a harshness setting is safe to offer.
 * A setting that quietly moved the numbers would make the page's figures a
 * function of the reader's mood, and the one thing this page sells is that
 * its figures are not.
 */
import type { AnalyticsDetail, AnalyticsTone, LogStyle } from '@/services/settings';

// --------------------------------------------------------------------------
// Harshness
// --------------------------------------------------------------------------

export interface ToneRules {
  /**
   * How much under a target still reads as met, in percentage points.
   *
   * A baseline is a stated intention rather than a contract, and 96% of a
   * five-day aim is five days in most weeks and four in one. Gentle gives that
   * two weeks' worth of slack, harsh gives it none.
   */
  grace: number;
  /** Recommendations given a card of their own before the rest go in a list. */
  headlines: number;
  /** Diagnosis cards drawn at once. The list is already worst-first. */
  diagnoses: number;
  /**
   * Whether a comparison leads with what went well.
   *
   * Gentle states the strongest measure first and the weakest second; harsh
   * does the reverse and names the gap. Both sentences contain both figures —
   * this is the order, not the content.
   */
  leadWithStrength: boolean;
}

export const TONE_RULES: Record<AnalyticsTone, ToneRules> = {
  gentle: { grace: 15, headlines: 2, diagnoses: 2, leadWithStrength: true },
  balanced: { grace: 5, headlines: 3, diagnoses: 4, leadWithStrength: false },
  harsh: { grace: 0, headlines: 5, diagnoses: 8, leadWithStrength: false },
};

export const TONE_LABEL: Record<AnalyticsTone, string> = {
  gentle: 'Gentle',
  balanced: 'Balanced',
  harsh: 'Blunt',
};

/** What each level changes, in the words the setup screen and settings use. */
export const TONE_HINT: Record<AnalyticsTone, string> = {
  gentle:
    'Near enough counts. A target missed by under 15% reads as met, two changes are put in '
    + 'front of you at a time, and a comparison names what is working before what is not.',
  balanced:
    'A miss is a miss past 5%. Three changes at a time, and the weak measure is named first.',
  harsh:
    'No rounding in your favor. Every shortfall is stated as one, every change the record '
    + 'supports is shown at once, and the sentence leads with what is worst.',
};

export function toneRules(tone: AnalyticsTone | undefined): ToneRules {
  return TONE_RULES[tone ?? 'balanced'] ?? TONE_RULES.balanced;
}

/**
 * Whether a figure counts as having met its target, and what to call it.
 *
 * `pct` is the actual as a percentage of the aim — the same number the
 * baseline rows already print, so the verdict and the bar beside it cannot
 * disagree. The only thing tone moves is where the line is drawn, and the word
 * chosen says which side of it the reader is on rather than how to feel.
 */
export interface Verdict {
  met: boolean;
  label: string;
}

export function verdict(tone: AnalyticsTone | undefined, pct: number): Verdict {
  const { grace } = toneRules(tone);
  if (pct >= 100) return { met: true, label: 'Met' };
  if (pct >= 100 - grace) return { met: true, label: 'Near enough' };
  // The gap, not a grade. A reader who set the target is the one qualified to
  // say whether missing it by nine points matters.
  return { met: false, label: `${Math.max(1, Math.round(100 - pct))}% short` };
}

// --------------------------------------------------------------------------
// How much of the page is drawn
// --------------------------------------------------------------------------

export interface DetailRules {
  /** The quality pair on the Overview — what the reader said about the work. */
  quality: boolean;
  /** The two tallies that say when the work happens and what gets finished. */
  tallies: boolean;
  /** Panels that live in full on another tab, repeated here for convenience. */
  extras: boolean;
  /**
   * How many rows a *supporting* list prints before it stops.
   *
   * Three of these four fields were booleans about the Overview, which is
   * where the setting was born and for a while the only tab that read it. A
   * reader who asked the page for essentials and then opened Insights got the
   * same fifteen findings as somebody who asked for everything — the setting
   * was called "detail" and governed one tab.
   *
   * **This is not `ToneRules.headlines`, and the two are not redundant.** Tone
   * caps how many *problems* are put in front of somebody: it is about being
   * confronted, and blunt raises it. Detail caps how much *supporting
   * evidence* is drawn under whatever is being said: it is about page length,
   * and essentials lowers it. A blunt reader who wants a short page sets
   * `harsh` and `essentials` and gets every shortfall named, each with the
   * short version of its workings — which is a coherent thing to want and was
   * not expressible while one number did both jobs.
   */
  rows: number;
}

/**
 * Three levels, and only the middle one is the page as it was.
 *
 * `essentials` removes panels rather than shortening them: the figures that
 * are left are the same figures. What goes is what a reader can get in full
 * one tab away — the quality pair belongs to the ratings, the two tallies hand
 * over to Habits anyway. What stays is the row of tiles, the trajectory, the
 * baseline and the consistency pair, which is the shortest set that still
 * answers "how am I doing".
 *
 * `everything` goes the other way and pulls two panels *onto* the Overview
 * that otherwise need a second tab: where the work went, and the findings
 * list. Both are already computed for other tabs, so this costs no request and
 * no second arithmetic.
 */
export const DETAIL_RULES: Record<AnalyticsDetail, DetailRules> = {
  essentials: { quality: false, tallies: false, extras: false, rows: 3 },
  standard: { quality: true, tallies: true, extras: false, rows: 6 },
  everything: { quality: true, tallies: true, extras: true, rows: 12 },
};

export const DETAIL_LABEL: Record<AnalyticsDetail, string> = {
  essentials: 'Essentials',
  standard: 'Standard',
  everything: 'Everything',
};

export const DETAIL_HINT: Record<AnalyticsDetail, string> = {
  essentials:
    'The four panels that answer the question on their own: the figures, the trajectory, your '
    + 'baseline, and how often you turn up. Everything else is still one tab away.',
  standard: 'Those, plus what you said about the work and the two tallies about when you do it.',
  everything:
    'All of the above, and the subject split and findings list pulled onto the Overview so you '
    + 'do not have to open another tab for them.',
};

/**
 * How many rows of supporting evidence a list prints, at this setting.
 *
 * Read by every tab rather than the Overview alone. `most` is for the handful
 * of lists where three rows is not a shorter answer but a useless one — a
 * ranked set whose point is the ranking — and it holds a floor under the
 * essentials setting instead of a different number for each caller to invent.
 */
export function detailRows(detail: AnalyticsDetail | undefined, most = Infinity): number {
  return Math.min(detailRules(detail).rows, most);
}

export function detailRules(detail: AnalyticsDetail | undefined): DetailRules {
  return DETAIL_RULES[detail ?? 'standard'] ?? DETAIL_RULES.standard;
}

// --------------------------------------------------------------------------
// The subjects the account is following
// --------------------------------------------------------------------------

/**
 * How many subjects an account may nominate as the ones it most wants to work
 * on — `analytics_subjects`.
 *
 * Four, and the number is a design decision rather than a storage limit. The
 * list becomes a menu under Analytics in the rail, and a rail entry that
 * unfolds into eleven rows is a rail entry nobody opens twice; four also fits
 * the setup screen's grid without it turning into a scrolling list. The server
 * holds the same bound and truncates past it — ANALYTICS_SUBJECTS_MAX in
 * backend/api/settings.py. If one moves, move the other.
 */
export const SUBJECTS_MAX = 4;

/**
 * The nominated subjects that still exist, in the order they were picked.
 *
 * Every reader of `analytics_subjects` needs this and none of them should
 * write it twice. The stored list is ids and nothing else, and an id can
 * outlive the subject it named — a catalogue is per-account and editable, so a
 * subject nominated in the wizard can be deleted the afternoon after. Dropping
 * what the catalogue does not recognise degrades to a shorter menu, which is
 * the right failure: the alternatives are a rail row that opens a page about
 * nothing, or a save that fails months after the mistake was made.
 *
 * `catalogue` is the same map `useSubjectIndex` returns, so the rail and the
 * analytics page are reading one source rather than two.
 */
export function followedSubjects(
  ids: string[] | undefined,
  catalogue: Map<string, { id: string; name: string; label: string }>,
): Array<{ id: string; name: string; label: string }> {
  return (ids ?? [])
    .slice(0, SUBJECTS_MAX)
    .map((id) => catalogue.get(id))
    .filter((subject): subject is { id: string; name: string; label: string } => Boolean(subject));
}

// --------------------------------------------------------------------------
// What the account actually records
// --------------------------------------------------------------------------

export const LOG_STYLE_LABEL: Record<LogStyle, string> = {
  tasks: 'Tasks',
  sessions: 'Sessions',
  both: 'Both',
};

export const LOG_STYLE_HINT: Record<LogStyle, string> = {
  tasks:
    'You tick things off. The volume figure beside the three rates is the number of tasks you '
    + 'finished.',
  sessions:
    'You log the time. The volume figure is the hours you sat, and the tiles lead with that '
    + 'rather than with a count of tasks.',
  both: 'Both figures get a tile of their own.',
};

/** Whether the tile row prints a task count, focus hours, or both. */
export function showsTaskVolume(style: LogStyle | undefined): boolean {
  return (style ?? 'both') !== 'sessions';
}

export function showsSessionVolume(style: LogStyle | undefined): boolean {
  return (style ?? 'both') !== 'tasks';
}
