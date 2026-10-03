/**
 * Growth, as a section of the Records page.
 *
 * This was the analytics page's Growth tab. Records already answers "how far
 * have I come", so the year-on-year view, the period cards and the milestones
 * live under it now rather than on a sixth tab beside four others asking the
 * same question.
 *
 * It builds the same model the analytics page does — the same calls and the
 * same arithmetic — so a figure here and the same figure on the Overview cannot
 * disagree. See ./useAnalyticsData and ./useAnalyticsModel.
 */
import { Loading } from '@/components';
import { useSettings, useSubjectIndex, useSubjectsReady } from '@/hooks';
import { GrowthTab } from './tabs/GrowthTab';
import { useAnalyticsData } from './useAnalyticsData';
import { useAnalyticsModel } from './useAnalyticsModel';
import '@/styles/analytics.css';
import '@/styles/growth.css';

export function GrowthSection() {
  const data = useAnalyticsData();
  const { username, series } = data;
  const subjects = useSubjectIndex(username);
  const subjectsReady = useSubjectsReady(username);
  const { ready } = useSettings();

  // The same wait the analytics page uses: the model is told to hold until
  // every call it reads has answered. See `waiting` in pages/Analytics.
  const waiting =
    [
      data.tasks, series, data.ratings, data.goals,
      data.baseline, data.adopted, data.gradedLog, data.scoreLog,
    ].some((call) => call.loading)
    || !ready
    || !subjectsReady;
  const model = useAnalyticsModel(data, subjects, waiting);

  if (waiting) return <Loading label="Reading your growth" />;
  if (!series.data) return null;

  return (
    <section className="ax-page rc-growth" aria-label="Growth">
      <div className="ax-shell ax-view-growth">
        <h2 className="ax-gp-heading">Growth</h2>
        <GrowthTab model={model} />
      </div>
    </section>
  );
}
