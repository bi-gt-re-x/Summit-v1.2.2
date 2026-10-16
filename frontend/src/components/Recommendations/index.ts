/**
 * The Recommendations tab's panels.
 *
 * The recommendations themselves are generated in utils/advice, which reads
 * utils/behaviour — the same functions the Insights tab states its findings
 * from. Whether any of them worked is decided in utils/followup, which measures
 * the same quantities a second time. These components only render what those
 * three decided.
 */
export { FollowupPanel } from './Followup';
export type { FollowupPanelProps } from './Followup';
