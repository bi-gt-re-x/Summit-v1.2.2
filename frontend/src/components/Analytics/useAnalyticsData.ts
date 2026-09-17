/**
 * Everything the analytics page asks the server for, and everything it writes.
 *
 * Pulled out of the page rather than invented here: these are the same eight
 * calls and three writes the page has always made, in the same order, with
 * their reasoning intact. What changed is that they are no longer interleaved
 * with four hundred lines of arithmetic, so the page's fetching can be read as
 * one thing and audited as one thing — how many requests a visit costs is now
 * a question with a file to open rather than a grep.
 *
 * **Nothing here is per tab.** Every tab is arithmetic over the first three
 * calls, and that is the page's oldest rule: opening a tab costs no request.
 * A future tab that wants its own call should have to argue with this comment
 * first.
 *
 * The writes live here too, beside the reads they invalidate. `adopt` reloads
 * `adopted`, `saveBaseline` reloads `baseline` — putting the write next to the
 * read it moves is what keeps that pairing from drifting.
 */
import { useCallback, useState } from 'react';
import { useApi, useStats } from '@/hooks';
import { taskHistory } from '@/services/taskHistory';
import {
  analytics as analyticsService,
  goals as goalsService,
  growth as growthService,
  tasks as taskService,
} from '@/services';
import type {
  AdoptedResult,
  AnalyticsTasksResult,
  BaselineResult,
  MetricHistories,
  MetricHistory,
  Standing,
} from '@/services/analytics';
import type { BaselineValues } from './Baseline';
import type { Advice } from '@/utils/advice';
import type { Ratings } from '@/types';

/** What an adopted suggestion is worth as a task. Its own habit is the reward. */
const DEFAULT_ADVICE_XP = 25;

export function useAnalyticsData() {
  /*
   * The account's numbers — the streak, and who this is.
   *
   * `useStats` and not `useUserData`, and the difference is the largest single
   * saving on this page. Calling `useUserData` is what turns the app's biggest
   * request on for the rest of the session (see hooks/useUserData): every task
   * the account owns, every column, `description` included. This page reads six
   * integers off the stats block and sixteen columns off the tasks, and it now
   * asks for exactly those two things.
   *
   * The stats are already in flight before this page mounts — the rail reads
   * them on every page — so in practice this costs nothing at all.
   */
  const stats = useStats();
  const { username } = stats;

  /*
   * The tasks, in the sixteen fields the panels actually count.
   *
   * Through `taskHistory` rather than straight at the service: this is the
   * largest response the app makes and the subject page wants the same one, so
   * opening a subject from here and coming back used to be three downloads of
   * identical bytes. See services/taskHistory.
   *
   * See `analyticsTasks` in services/analytics and ANALYTICS_TASK_FIELDS on the
   * other side of it. Still the whole record rather than the window: the picker
   * slices in the browser so that changing it is instant, and the goal and
   * habit panels are not scoped by it at all. What moved to the server is how
   * wide each row is, not how many of them there are.
   */
  const tasksCall = useCallback(
    () =>
      username
        ? taskHistory(username)
        : Promise.resolve({ success: false as const, message: 'Sign in to see your analytics.' }),
    [username],
  );
  const tasks = useApi<AnalyticsTasksResult>(tasksCall, [username]);

  // The whole history, sliced here. Same reason the growth page does it: the
  // comparisons need the period *before* the one on screen, and the milestone
  // dates are read out of the running total since the account was created.
  const seriesCall = useCallback(
    () =>
      username
        ? growthService.series(0)
        : Promise.resolve({ success: false as const, message: 'Sign in to see your analytics.' }),
    [username],
  );
  const series = useApi(seriesCall, [username]);

  // The report card, for the Growth Score tile and the weakest-metric
  // suggestion. Reading it files a dated snapshot per metric
  // (backend/tracking/analytics.py), which is why it is called once on open and
  // not on a timer.
  const ratingsCall = useCallback(
    () =>
      username
        ? growthService.ratings()
        : Promise.resolve({ success: false as const, message: 'Sign in to see your score.' }),
    [username],
  );
  const ratings = useApi<Ratings>(ratingsCall, [username]);

  // The fourth call, and the only one that reads anything but this account:
  // "Where You Stand" ranks the reader against every other account with a
  // comparable record, which is arithmetic the client cannot do and should not
  // have the data for. Unscoped by the window picker on purpose — the panel
  // asks where this account stands, not where it stood over a quarter.
  const standingCall = useCallback(
    () =>
      username
        ? analyticsService.standing()
        : Promise.resolve({ success: false as const, message: 'Sign in to see where you stand.' }),
    [username],
  );
  const standing = useApi<Standing>(standingCall, [username]);

  // The goals, for the Records tab and nothing else. A goal is the only place
  // this account records a target somebody chose — every other benchmark on
  // that tab is the reader's own record — so it is worth a call of its own, and
  // the chapter waits on it rather than claiming there are none.
  const goalsCall = useCallback(
    () =>
      username
        ? goalsService.getGoals()
        : Promise.resolve({ success: false as const, message: 'Sign in to see your goals.' }),
    [username],
  );
  const goals = useApi(goalsCall, [username]);

  // What the account said it was aiming at — the only thing on this page it
  // states rather than the page measuring, and the one half of the setup
  // questions that is not a preference. `baseline: null` is a real answer and
  // is half of what opens the question phase; see `AnalyticsSetup` in ./Setup
  // and `firstRun` in pages/Analytics for the other half.
  const baselineCall = useCallback(
    () =>
      username
        ? analyticsService.baseline()
        : Promise.resolve({ success: false as const, message: 'Sign in to set a baseline.' }),
    [username],
  );
  const baseline = useApi<BaselineResult>(baselineCall, [username]);

  // What the reader has said they will act on, and when they said it. Two
  // fields and a date; everything the follow-up draws from it is recomputed
  // off the series here. See utils/followup.
  const adoptedCall = useCallback(
    () =>
      username
        ? analyticsService.adoptedAdvice()
        : Promise.resolve({ success: false as const, message: 'Sign in to see your changes.' }),
    [username],
  );
  const adopted = useApi<AdoptedResult>(adoptedCall, [username]);

  // Every graded metric's dated readings, for the follow-up on a recommendation
  // about the report card. Which metric matters depends on what was adopted,
  // which is why this is all of them in one call rather than one per id.
  const gradedCall = useCallback(
    () =>
      username
        ? analyticsService.metricHistories()
        : Promise.resolve({ success: false as const, message: 'Sign in to see your history.' }),
    [username],
  );
  const gradedLog = useApi<MetricHistories>(gradedCall, [username]);

  // The score's own recorded past. See the note on `scoreMovement` for what it is
  // for, and services/analytics for why it took an endpoint to reach it.
  const historyCall = useCallback(
    () =>
      username
        ? analyticsService.metricHistory('overall')
        : Promise.resolve({ success: false as const, message: 'Sign in to see your history.' }),
    [username],
  );
  const scoreLog = useApi<MetricHistory>(historyCall, [username]);
  // ---- Accepting a recommendation ----------------------------------------
  /**
   * Turn a recommendation into a task, and start the clock on measuring it.
   *
   * Two writes, and the second is the one that makes this page worth coming
   * back to. The task is what a reader acts on; the dated adoption record is
   * what lets the tab answer, three weeks later, whether the thing it promised
   * would move actually moved. The button used to do only the first, which left
   * the page making a confident claim about four thousand XP a year and then
   * never mentioning it again.
   *
   * The task is due tomorrow rather than today because every recommendation
   * here is a change to how the *next* stretch of work goes — "claim one
   * weekend day", "move one session earlier" — and dropping it onto a day
   * already half spent makes it the thing you failed at tonight rather than the
   * thing you are trying next.
   *
   * **The task is the required half.** If the task write fails there is nothing
   * to adopt and the whole thing reports failure; if the task lands and the
   * record does not, the reader still gets what they pressed the button for and
   * loses only the follow-up. Failing the visible half because the bookkeeping
   * half failed would be the wrong way round.
   */
  const [adopting, setAdopting] = useState<string | null>(null);
  const [justAdopted, setJustAdopted] = useState<string | null>(null);

  const adopt = useCallback(
    async (item: Advice) => {
      if (!username) return false;
      setAdopting(item.id);
      setJustAdopted(null);
      try {
        const due = new Date();
        due.setDate(due.getDate() + 1);
        const result = await taskService.createTask({
          name: item.title,
          priority: item.priority === 'high' ? 'high' : item.priority === 'medium' ? 'medium' : 'low',
          xp_reward: DEFAULT_ADVICE_XP,
          due_date: due.toISOString().slice(0, 10),
        });
        if (!result.success) return false;

        await analyticsService.adoptAdvice(item.id, item.title);
        adopted.reload();
        setJustAdopted(item.title);
        return true;
      } catch {
        return false;
      } finally {
        setAdopting(null);
      }
    },
    [adopted, username],
  );

  /**
   * Stop measuring a change.
   *
   * Removes the record of the decision and leaves any task it created alone —
   * see the endpoint. A reader who has decided a recommendation was not for
   * them wants it off this panel, not their task list rewritten under them.
   */
  const [dropping, setDropping] = useState<string | null>(null);

  const dropAdopted = useCallback(
    async (id: string) => {
      if (!username) return;
      setDropping(id);
      try {
        await analyticsService.dropAdvice(id);
        adopted.reload();
      } finally {
        setDropping(null);
      }
    },
    [adopted, username],
  );

  /**
   * Write the account's target.
   *
   * Returns whether it landed. Closing the setup screen on success is the
   * page's business, not this hook's — the flag that decides whether the screen
   * is showing has three states and two of them have nothing to do with a
   * write. See `editingBaseline` in the page.
   */
  const saveBaseline = useCallback(
    async (values: BaselineValues) => {
      if (!username) return false;
      const result = await analyticsService.setBaseline(values);
      if (!result.success) return false;
      baseline.reload();
      return true;
    },
    [baseline, username],
  );

  /**
   * Re-read everything a visit can change.
   *
   * Five of the eight, not all of them. Standing, the baseline and the graded
   * log do not move because the reader pressed a button on this page — the
   * first is other people's records, and the other two only change when this
   * page itself writes them, which reloads them on its own above.
   */
  const refresh = useCallback(() => {
    series.reload();
    tasks.reload();
    ratings.reload();
    goals.reload();
    adopted.reload();
  }, [adopted, goals, ratings, series, tasks]);

  return {
    stats,
    tasks,
    username,
    series,
    ratings,
    standing,
    goals,
    baseline,
    adopted,
    gradedLog,
    scoreLog,
    refresh,
    adopt,
    adopting,
    justAdopted,
    dropAdopted,
    dropping,
    saveBaseline,
  };
}

export type AnalyticsData = ReturnType<typeof useAnalyticsData>;
