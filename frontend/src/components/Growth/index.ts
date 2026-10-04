/**
 * What is left of the growth page.
 *
 * There is no growth page any more. It carried five tabs: an Overview built
 * from the panels in GrowthPanels, and four chapters. The Overview answered
 * "how am I doing" with a chart, a donut, a heatmap and a milestone list —
 * every one of which the analytics page already answered at higher resolution
 * on a tab built for it — so it went, and its panels went with it. The four
 * chapters went to /analytics. Two are left: Focus, which the Insights tab
 * imports directly, and Skills, exported here.
 *
 * Skills is the Subjects tab's chapter. It is handed the day series, the tasks
 * and the subject index — all of which the analytics page has for its own
 * panels — and does not fetch. Its arithmetic is in utils/growthSkills, and it
 * shares furniture with the rest of the page through ChapterParts.
 */
export { SkillsChapter } from './SkillsChapter';
export type { SkillsChapterProps } from './SkillsChapter';
/** What the chapters share — see the note at the top of GrowthPanels. */
export { CountValue, Glyph, Hint } from './GrowthPanels';
