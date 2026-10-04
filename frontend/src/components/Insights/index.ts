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
export { WeekPanel, ClockPanel } from './Panels';

export { ChangedPanel } from './Changed';
export type { ChangedPanelProps } from './Changed';

export {
  FindingCard,
  WhyPanel,
  HowPanel,
  RelationshipsPanel,
} from './Deep';
