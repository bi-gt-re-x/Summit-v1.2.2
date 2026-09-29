/**
 * The four chapters that were the growth page.
 *
 * There is no growth page any more. It carried five tabs: an Overview built
 * from the panels in GrowthPanels, and four chapters. The Overview answered
 * "how am I doing" with a chart, a donut, a heatmap and a milestone list —
 * every one of which the analytics page already answered at higher resolution
 * on a tab built for it — so it went, and its panels went with it. The four
 * chapters are the part that was doing real work, and they are tabs of
 * /analytics now: Long Term under Trends, Focus under Habits, and Subjects and
 * Records as tabs of their own.
 *
 * They kept their shape on the way across. Each is handed the day series, the
 * tasks, the subject index and the streak — all of which the analytics page has
 * for its own panels — and none of them fetches. Their arithmetic is in
 * utils/growthFocus, growthSkills, growthBench and growthChapters, and they
 * share their furniture through ChapterParts so the four read as one system.
 *
 * A fifth thing used to be described here: `GrowthChart`, the canvas the
 * Overview's chart panel drew into, kept along with its renderer in
 * utils/growthChart.ts because it was the only drawing code for the five XP
 * and focus series. The component was deleted with the rest of the unrendered
 * ones and this paragraph outlived it, still saying it was "still exported" —
 * which is how its 675-line renderer went on being kept for a caller that no
 * longer existed. Both are gone now. If those five series are ever wanted
 * again they are five reads of the day series, not a lost renderer.
 */
export { FocusChapter } from './FocusChapter';
export type { FocusChapterProps, FocusPanel } from './FocusChapter';
export { SkillsChapter } from './SkillsChapter';
export type { SkillsChapterProps } from './SkillsChapter';
/** What the chapters share — see the note at the top of GrowthPanels. */
export { CountValue, Glyph, Hint } from './GrowthPanels';
