/**
 * "Open the search" — asked by the rail's search box, answered by the top bar.
 *
 * The panel lives in components/Topbar, beside the magnifier that has always
 * opened it. The rail is a sibling of the bar rather than a child, so it asks
 * by event instead of reaching for the bar's state: one direction, no reply,
 * the same shape as STATS_CHANGED in utils/statsBus.
 */
export const OPEN_SEARCH = 'summit:open-search';

export function openSearch(): void {
  window.dispatchEvent(new CustomEvent(OPEN_SEARCH));
}
