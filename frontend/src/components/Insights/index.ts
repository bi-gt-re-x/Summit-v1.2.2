/**
 * The Insights tab's panels.
 *
 * Split by what they claim. `./Panels` describes one shape at a time — this
 * weekday against that one, the hours the work lands in — and reads
 * utils/behaviour. `./Deep` puts two shapes together and says what the
 * connection looks like, which is the tab's actual job, and reads utils/insight
 * for the evidence grading that makes such a claim safe to print.
 *
 * Both are shared with the Recommendations tab through utils/advice, so a
 * finding here and the advice derived from it can never be computed two
 * different ways.
 */
export { HeadlineTiles, WeekPanel, ClockPanel } from './Panels';
export type { HeadlineTilesProps } from './Panels';

/* The tab's opening and the section under it. Both are about the *account*
   rather than about one shape of its behaviour, which is why they are their own
   files rather than two more panels in ./Panels — see the note at the top of
   each. */
export { StateOverview } from './Overview';
export type { StateOverviewProps } from './Overview';

export { ChangedPanel } from './Changed';
export type { ChangedPanelProps } from './Changed';

/* The section that ends in a skill tree rather than in a sentence. */
export { SubjectInsights } from './Subjects';
export type { SubjectInsightsProps } from './Subjects';

export {
  FindingCard,
  WhyPanel,
  HowPanel,
  WorkingPanel,
  RelationshipsPanel,
  CurrentStatePanel,
} from './Deep';
