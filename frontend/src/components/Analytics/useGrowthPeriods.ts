/**
 * The Growth tab's period, and the scores for it.
 *
 * ## Why this is not in useAnalyticsData
 *
 * That file is "everything the analytics page asks the server for", and the
 * rule it opens with is that a tab costs no request: every panel on the other
 * six tabs is arithmetic over the same three responses, so opening a tab is
 * free and two tabs cannot disagree about a figure.
 *
 * This call would have broken that rule if it lived there. It is scoped to a
 * period the *Growth tab* owns — no other tab has that control — and it
 * refetches whenever the reader presses a different one, so putting it beside
 * the shared reads would have made every visit to Recommendations pay for six
 * windows of scoring it never looks at.
 *
 * So it lives here and is called from the tab, which the page only mounts when
 * the tab is open (see pages/Analytics). The rule survives with one stated
 * exception rather than being quietly abandoned, and the exception is one file
 * with its reasons in it.
 *
 * ## Why the scoring is not on the client
 *
 * The long answer is on the endpoint in backend/api/analytics.py. The short
 * one is that two of the five metrics cannot be computed from what the browser
 * holds — focus needs each day's goal, which the growth series does not carry —
 * and mirroring the other three in TypeScript would create a second scoring
 * implementation, which backend/tracking/analytics.py has one rule against.
 *
 * ## The page's window picker drives it
 *
 * The time window at the top of the analytics page scopes every tab, and on
 * this one it did nothing: the tab kept a period of its own, so pressing 1Y
 * at the top left every Growth panel reading "the last 30 days". Now the
 * picker *is* the period — the six windows are the same six on both sides
 * (see PERIODS in backend/tracking/analytics.py) — and the tab's own period
 * controls, the timeline's segmented row and the "Growth by period" cards,
 * press the picker back. One period on the whole page, whichever control
 * the reader used.
 *
 * The hook still holds the period itself rather than reading the picker
 * straight through, so a pick on the tab answers at once and the picker
 * catches up on the next render; and it follows the picker whenever the
 * picker moves.
 *
 * ## The period is not written back
 *
 * Same decision the window picker makes in useAnalyticsModel, for the same
 * reason: pressing a period is a reader changing their mind for one visit, and
 * saving it would turn every glance into a preference.
 */
import { useCallback, useEffect, useState } from 'react';
import { useApi, useStats } from '@/hooks';
import { analytics as analyticsService } from '@/services';
import type { GrowthPeriods, PeriodKey } from '@/services/analytics';
import type { WindowKey } from './data';

/** The page's window, as the period the Growth scores are asked for. */
export const PERIOD_FOR_WINDOW: Record<WindowKey, PeriodKey> = {
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
  '1y': '365d',
  '2y': '730d',
  all: 'all',
};

/** And back, for the tab's own controls to press the picker. */
export const WINDOW_FOR_PERIOD: Record<PeriodKey, WindowKey> = {
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
  '365d': '1y',
  '730d': '2y',
  all: 'all',
};

const periodFor = (span: string | undefined): PeriodKey =>
  PERIOD_FOR_WINDOW[span as WindowKey] ?? DEFAULT_PERIOD;

/**
 * Which period the tab opens on.
 *
 * Thirty days, because it is the shortest window that answers "have I changed"
 * rather than "how was my week" — seven days is a week's noise, and a reader
 * who wants that presses it. It is also the only window on the row whose
 * previous equivalent almost always exists, so the tab opens with a comparison
 * rather than with a dash.
 */
export const DEFAULT_PERIOD: PeriodKey = '30d';

export function useGrowthPeriods(span?: WindowKey, chooseSpan?: (next: WindowKey) => void) {
  /* `useStats`, not `useUserData`. Both carry the name; only one of them
     charges the account's whole task list for it, and reaching for it here
     would have turned that request back on for the Growth tab alone — after
     the rest of this page had just stopped making it. The warning is in
     hooks/useUserData's own doc comment. */
  const { username } = useStats();
  const [period, setLocal] = useState<PeriodKey>(() => periodFor(span));

  // Follow the picker whenever it moves.
  useEffect(() => {
    if (span) setLocal(periodFor(span));
  }, [span]);

  // And press it when the tab's own controls are used.
  const setPeriod = useCallback(
    (next: PeriodKey) => {
      setLocal(next);
      chooseSpan?.(WINDOW_FOR_PERIOD[next]);
    },
    [chooseSpan],
  );

  const call = useCallback(
    () =>
      username
        ? analyticsService.growthPeriods(period)
        : Promise.resolve({ success: false as const, message: 'Sign in to see your growth.' }),
    [period, username],
  );

  const periods = useApi<GrowthPeriods>(call, [period, username]);

  return { period, setPeriod, periods };
}

export type GrowthPeriodsState = ReturnType<typeof useGrowthPeriods>;
