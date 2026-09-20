/**
 * Goals — what you are ultimately trying to accomplish.
 *
 * ## What this page is for, and what it is not
 *
 * The app has six pages that could all become a list of things to do, so the
 * line between them is drawn deliberately and this one is the strategic end of
 * it: the Dashboard answers *what should I do right now*, the Calendar answers
 * *when*, Analytics answers *why is this going the way it is*, Growth answers
 * *how capable am I becoming*, and this answers *what am I trying to accomplish
 * and what gets me there*. It connects to those without duplicating them —
 * which is why there is no task list here, no chart of XP over time, and no
 * skill levels.
 *
 * The hierarchy the whole page is built on:
 *
 *     GOAL       the outcome                Reach USACO Gold
 *      → MILESTONE   the checkpoint          Master Silver DP
 *         → TASK        the action           Solve ten DP problems
 *
 * A milestone is not a small task and a task is not a small milestone. The
 * checkpoint is a state the goal reaches; the tasks are evidence it is being
 * reached. That distinction is enforced everywhere: milestones drive the
 * percentage, tasks drive the health.
 *
 * ## Where the truth lives
 *
 * Nowhere on this page. `progress`, `status` and the checkpoint order are the
 * server's (backend/api/goals.py recomputes them after every write); health
 * and the readings are utils/goalHealth and utils/goalAnalytics. Every write
 * here is followed by a re-read rather than a patch, which is the rule the old
 * page already followed and the reason its numbers could not drift.
 *
 * ## The counters
 *
 * Earn N XP, reach an N-day streak, finish N tasks, log N hours. They predate
 * everything above and they are still kept, because an account that has been
 * using them has them and deleting somebody's data to tidy up a page is not a
 * refactor. What has gone is the page they used to be drawn on: they are the
 * System Goals tab now, rebuilt in this page's own tokens, and `GoalCard`,
 * `MilestonesPanel` and the 1,819 lines of dark-glass CSS behind them went
 * when the last thing rendering them did. New goals are outcomes; the counters
 * are kept, not extended.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActiveGoalCard,
  Band,
  GoalDetail,
  GoalInsights,
  GoalModal,
  GrowthAreas,
  Trajectory,
  GoalStats,
  GoalTable,
  GoalTabs,
  HealthBreakdown,
  GoalChain,
  GoalsCta,
  Spark,
  HealthRing,
  MilestoneCalendar,
  NewGoalWizard,
  NextMilestones,
  OverviewStrip,
  SystemVerdict,
  RecentlyCompleted,
  SystemGoalWizard,
  SystemGoals,
  GoalsState,
  fillSteps,
  goalNumbers,
  isOverdue,
  measureOf,
  msUntilNextDeadline,
  planGoal,
} from '@/components/Goals';
import type { MilestoneDraftRequest } from '@/components/Goals';
import { Ambient, ErrorState, Loading, PageHero, RefreshButton } from '@/components';
import {
  forgetLinkableGoals,
  useAuth,
  useDocumentTitle,
  usePageEntrance,
  useSubjectIndex,
  useSubjects,
  useUserData,
} from '@/hooks';
import { goals as goalService, tasks as taskService } from '@/services';
import type { NewGoal } from '@/services/goals';
import type { Goal, Milestone, MilestoneStatus, MilestoneStep, Task } from '@/types';
import { goalHealth } from '@/utils/goalHealth';
import type { TabId } from '@/components/Goals';
import { fromTitles, stepProgress } from '@/utils/milestoneSteps';
import { ConfirmDialog } from '@/components/ui';
import '@/styles/goals.css';
import { announceStatsChanged } from '@/utils/statsBus';

/** How often to re-read while a focus goal is running. */
const FOCUS_POLL_MS = 30_000;

/**
 * How many goals the ladder and the timelines draw.
 *
 * Not a rendering budget — a statement about how many things can actually be
 * pursued at once. Past ten, a goals page stops being a plan and becomes a
 * list of things you feel bad about, and the eleventh goal is never the one
 * being worked on. Anything beyond it is still there, still counted in the
 * stats, and reachable from the quiet list below the ladder.
 */
const LIST_GOALS = 10;

/** Rows on one goal's rail. Same reasoning as above, applied to checkpoints. */
const TIMELINE_ROWS = 10;

export default function Goals() {
  useDocumentTitle('Goals');
  const { username } = useAuth();
  const account = useUserData();

  const [list, setList] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /* The goal or checkpoint the model is currently drafting a plan under, so
     the card it belongs to can say so. Its own flag rather than `busy`: a
     model call runs for seconds and holding the page's busy flag for it would
     disable every other goal's buttons while one of them thinks — the same
     reason `suggestMilestones` below is not routed through `write`. */
  const [planning, setPlanning] = useState<string | null>(null);
  /* The arrival cascade, which runs once — the shared one every page uses now.
     It has to stop: the bands remount when the tab changes, and a class still
     on the shell would replay the whole page every time somebody switched tab.
     See hooks/usePageEntrance for why it is bound to the read. */
  const entering = usePageEntrance(!loading);

  const [openId, setOpenId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  /** The wizard was opened by "Draft a goal", so it opens on the idea box. */
  const [draftFirst, setDraftFirst] = useState(false);
  /* The counters' own setup. See components/Goals/SystemGoalWizard for why it
     is not the wizard above. */
  const [systemOpen, setSystemOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | undefined>(undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Goal | null>(null);
  /**
   * A goal whose ladder the reader has asked to redraft, waiting on the ask.
   *
   * Only for a goal that already has checkpoints. `set_milestones` reuses rows
   * by position — a rung that keeps its place keeps its id, its status and the
   * tasks pointed at it — so this renames rather than deletes, and the wording
   * below says exactly that rather than threatening worse. It is still the
   * reader's own words being replaced, which is not something a menu item
   * should do on one click.
   */
  const [pendingDraft, setPendingDraft] = useState<Goal | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  /** Bumped when a deadline passes, so the cards that just went overdue redraw. */
  const [, setTick] = useState(0);

  const load = useCallback(
    async (quiet = false) => {
      if (!username) {
        setLoading(false);
        setError('Sign in to see your goals.');
        return;
      }
      if (!quiet) setLoading(true);
      const result = await goalService.getGoals();
      if (result.success) {
        setList(result.goals ?? []);
        setError(null);
        /* The calendar's dialogs hold their own cached copy of this list, for
           the "counts toward" field — see hooks/useLinkableGoals. Every create,
           edit and delete on this page ends in a re-read, so this is the one
           line that keeps that copy honest without a subscription. Dropped
           rather than replaced: the cache stores only the linkable subset and
           rebuilding it here would put that filter in two places. */
        forgetLinkableGoals();
      } else {
        setError(result.message);
      }
      setLoading(false);
    },
    [username],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const hasRunningFocus = useMemo(
    () => list.some((goal) => measureOf(goal) === 'focus' && goal.status === 'active'),
    [list],
  );

  useEffect(() => {
    if (!hasRunningFocus) return;
    const timer = setInterval(() => void load(true), FOCUS_POLL_MS);
    return () => clearInterval(timer);
  }, [hasRunningFocus, load]);

  useEffect(() => {
    const wait = msUntilNextDeadline(list);
    if (wait === null) return;
    const timer = setTimeout(() => setTick((n) => n + 1), Math.max(wait, 0));
    return () => clearTimeout(timer);
  }, [list]);

  /** Every write goes through here: do it, then re-read rather than patching. */
  const write = useCallback(
    async (action: () => Promise<{ success: boolean; message?: string }>) => {
      setBusy(true);
      try {
        const result = await action();
        if (!result.success) {
          setError(result.message ?? 'That did not work.');
          return false;
        }
        await load(true);
        return true;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const tasks = useMemo(() => account.data?.tasks ?? [], [account.data]);

  /* The catalogue, so a chart that groups by subject can print "Competitive
     Math" rather than `competitive_math`. Falls back to a tidied id when a task
     names a subject the catalogue no longer has. */
  const subjects = useSubjectIndex(username);
  /* The same catalogue as a list, in the order the backend sent it — most-used
     first — which is the order the picker's rail wants. `useSubjectIndex` is
     built from `useSubjects` and both read one cache, so this is free. */
  const catalogue = useSubjects(username);
  const subjectName = useCallback(
    (id: string) => subjects.get(id)?.name ?? id.replace(/_/g, ' '),
    [subjects],
  );

  /**
   * Tick off one of the next moves.
   *
   * Goes through the tasks service exactly as the dashboard does, so the XP,
   * the streak and the goal's own progress all move the way they would have if
   * it had been ticked off there — this is a second door onto the same act,
   * not a second implementation of it. Both reads are refreshed after: the
   * task list is the account's, and the goal's percentage is the server's.
   */
  const completeMove = useCallback(
    async (task: Task) => {
      if (!username || busy) return;
      setBusy(true);
      const result = await taskService.completeTask(task.id);
      setBusy(false);
      if (!result.success) {
        setError(result.message ?? 'That task could not be completed.');
        return;
      }
      // The rail's level and the bell did not hear about completions made
      // here. See utils/statsBus.
      announceStatsChanged();
      await Promise.all([load(true), account.reload()]);
    },
    [account, busy, load, username],
  );

  /**
   * Point a task that already exists at this goal.
   *
   * The card no longer creates tasks — "add" there means adding a step to a
   * checkpoint's checklist, and a step is not a task. What is left is the
   * half that was always the more useful one: work is usually written down
   * before the goal it turns out to serve is, and retyping it would leave two
   * tasks where there is one piece of work. The link is written through
   * the edit the tasks page already uses — so the task keeps its due date, its
   * subject and its history, and simply starts counting here.
   */
  const linkTask = useCallback(
    async (goal: Goal, task: Task, milestoneId?: string) => {
      if (!username) return;
      const result = await taskService.updateTask(task.id, {
        goal_id: goal.id,
        milestone_id: milestoneId ?? null,
      });
      if (!result.success) {
        setError(result.message ?? 'That task could not be linked.');
        return;
      }
      await Promise.all([load(true), account.reload()]);
    },
    [account, load, username],
  );

  // ---- Goal writes --------------------------------------------------------
  /**
   * Make the goal, then have the model fill in the plan under it.
   *
   * The two halves are deliberately not one `write`. The goal is saved and the
   * wizard closes on the first, because a new goal appearing should not wait
   * several seconds on a model call — and if the call fails, or there is no
   * key configured, what is left behind is a perfectly ordinary goal, and the
   * page says why its plan is missing rather than leaving it to be guessed.
   *
   * The plan is components/Goals/plan: the checkpoints the reader wrote in
   * the wizard are kept — this used to rename every one of them to the
   * model's — the model drafts checkpoints only for a goal that arrived with
   * none, and every checkpoint then gets its steps drafted, which used to
   * happen only to one added by hand in the drawer. The model proposes; the
   * account owns it — every row is editable afterwards.
   */
  const createGoal = useCallback(
    async (draft: NewGoal) => {
      if (!username) return;
      const created = await goalService.addGoal(draft);
      if (!created.success) {
        setError(created.message ?? 'That did not work.');
        return;
      }
      setWizardOpen(false);
      await load(true);

      const goalId = created.id;
      if (!goalId) return;
      setPlanning(goalId);
      try {
        const plan = await planGoal(goalId);
        // Only when nothing at all was drafted. A plan with one checklist
        // missing is a plan; the checkpoint shows its empty rows and the
        // drawer can draft it again.
        if (plan.problem && !plan.milestones && !plan.checklists) setError(plan.problem);
        await load(true);
      } finally {
        setPlanning(null);
      }
    },
    [username, load],
  );

  /** The wizard's "Suggest with AI", for a goal that is not written yet. */
  const suggestDraft = useCallback(async (draft: MilestoneDraftRequest) => {
    const result = await goalService.suggestMilestones(draft);
    return result.success
      ? { milestones: result.milestones ?? [] }
      : { problem: result.message ?? 'No checkpoints came back.' };
  }, []);

  /**
   * The wizard's "Draft it all", from one sentence and before any field is
   * filled. Creates nothing — the answer lands in the wizard's own boxes.
   */
  const draftWholeGoal = useCallback(async (idea: string) => {
    const result = await goalService.draftGoal(idea);
    return result.success
      ? { goal: { title: result.title, why: result.why, category: result.category,
                  deadline: result.deadline, milestones: result.milestones ?? [] } }
      : { problem: result.message ?? 'That could not be drafted.' };
  }, []);

  /**
   * A counter from SystemGoalWizard. An ordinary `write`, and no model: a
   * counter has nothing to plan — see components/Goals/SystemGoals.
   */
  const createSystemGoal = useCallback(
    async (draft: NewGoal) => {
      if (!username) return;
      const ok = await write(() => goalService.addGoal(draft));
      if (ok) setSystemOpen(false);
    },
    [username, write],
  );

  const saveGoal = useCallback(
    async (draft: NewGoal) => {
      if (!username) return;
      const ok = await write(() =>
        draft.id
          ? goalService.updateGoal(draft.id, {
              title: draft.title,
              description: draft.description,
              goal_type: draft.goal_type,
              priority: draft.priority,
              deadline: draft.deadline,
              target_xp: draft.target_xp,
              target_streak: draft.target_streak,
              target_tasks: draft.target_tasks,
              target_focus: draft.target_focus,
            })
          : goalService.addGoal(draft),
      );
      if (ok) {
        setModalOpen(false);
        setEditing(undefined);
      }
    },
    [username, write],
  );

  const setValue = useCallback(
    (goal: Goal, value: number) => {
      if (!username) return;
      void write(() => goalService.updateGoal(goal.id, { current_value: value }));
    },
    [username, write],
  );

  /* Which chart a card draws. Written like any other edit, so the card redraws
     from what the server kept rather than from what was clicked. */
  const setChart = useCallback(
    (goal: Goal, chart: string) => {
      if (!username) return;
      void write(() => goalService.updateGoal(goal.id, { chart }));
    },
    [username, write],
  );

  const confirmDelete = useCallback(async () => {
    if (!username || !pendingDelete) return;
    const gone = pendingDelete.id;
    await write(() => goalService.deleteGoal(gone));
    setPendingDelete(null);
    // The drawer was showing the goal that no longer exists.
    setOpenId((current) => (current === gone ? null : current));
  }, [username, pendingDelete, write]);

  // ---- Milestone writes ---------------------------------------------------
  /**
   * Add the checkpoint, then have the model draft its checklist.
   *
   * Same shape as `createGoal` above and for the same reasons: the checkpoint
   * lands immediately, the checklist arrives after, and a failure anywhere in
   * the second half leaves the three empty rows `add_milestone` seeds — which
   * is exactly what a checkpoint used to be created with.
   */
  const addMilestone = useCallback(
    async (goal: Goal, title: string) => {
      if (!username) return;
      const created = await goalService.addMilestone(goal.id, { title });
      if (!created.success) {
        setError(created.message ?? 'That did not work.');
        return;
      }
      await load(true);

      const milestoneId = created.id;
      if (!milestoneId) return;
      setPlanning(milestoneId);
      try {
        const drafted = await goalService.suggestSteps({ milestoneId });
        if (!drafted.success || !drafted.steps?.length) return;
        await goalService.updateMilestone(milestoneId, {
          steps: fromTitles(drafted.steps),
        });
        await load(true);
      } finally {
        setPlanning(null);
      }
    },
    [username, load],
  );

  const setMilestoneStatus = useCallback(
    (milestone: Milestone, status: MilestoneStatus) => {
      if (!username) return;
      void write(() => goalService.updateMilestone(milestone.id, { status }));
    },
    [username, write],
  );

  /**
   * Make one checkpoint the focus — the one the card draws under "Current
   * focus" and the one new actions are linked to by default.
   *
   * `active` is the status that means it, and until now nothing in the app
   * ever set it: the card fell back to the first unfinished checkpoint, which
   * is a reasonable guess and was the only thing on offer. The API demotes any
   * other active checkpoint on the same goal, so this is a move rather than an
   * addition — see update_milestone in backend/api/goals.py.
   */
  const focusMilestone = useCallback(
    (milestone: Milestone) => {
      if (!username || milestone.status === 'done') return;
      void write(() => goalService.updateMilestone(milestone.id, { status: 'active' }));
    },
    [username, write],
  );

  /**
   * Call the goal itself finished.
   *
   * Only offered once every checkpoint is reached, and it is a request rather
   * than an assertion: the backend re-derives status from the goal's own truth
   * on every write, so a milestone goal is already completed by the time this
   * is reachable and this is the confirmation. What it genuinely decides is
   * the goals with no target to measure against, which arithmetic cannot
   * finish and only the reader can. See `_recompute` in backend/api/goals.py.
   */
  const completeGoal = useCallback(
    (goal: Goal) => {
      if (!username || goal.status === 'completed') return;
      void write(() => goalService.updateGoal(goal.id, { status: 'completed' }));
    },
    [username, write],
  );

  /** The checkpoint's own checklist, written whole. See utils/milestoneSteps. */
  const setMilestoneSteps = useCallback(
    (milestone: Milestone, steps: MilestoneStep[]) => {
      if (!username) return;
      void write(() => goalService.updateMilestone(milestone.id, { steps }));
    },
    [username, write],
  );

  /** When a checkpoint is meant to be reached. Empty string clears it. */
  const setMilestoneDate = useCallback(
    (milestone: Milestone, date: string) => {
      if (!username) return;
      void write(() => goalService.updateMilestone(milestone.id, { target_date: date }));
    },
    [username, write],
  );

  const removeMilestone = useCallback(
    (milestone: Milestone) => {
      if (!username) return;
      void write(() => goalService.deleteMilestone(milestone.id));
    },
    [username, write],
  );

  const reorder = useCallback(
    (goal: Goal, order: string[]) => {
      if (!username) return;
      void write(() => goalService.reorderMilestones(goal.id, order));
    },
    [username, write],
  );

  /**
   * Ask the model to break a goal into its five checkpoints.
   *
   * Deliberately not routed through `write`: nothing is saved, so there is
   * nothing to re-read, and holding the page's busy flag for the length of a
   * model call would disable every other goal's buttons while one goal thinks.
   * The ladder owns its own spinner for exactly that reason.
   *
   * A failure here is a sentence on the page — no key configured, model
   * unreachable, an answer that could not be read — so it lands in `error`
   * beside every other message rather than throwing.
   */
  const suggestMilestones = useCallback(
    async (goal: Goal): Promise<string[] | null> => {
      if (!username) return null;
      const result = await goalService.suggestMilestones({ goalId: goal.id });
      if (!result.success) {
        setError(result.message);
        return null;
      }
      setError(null);
      return result.milestones ?? null;
    },
    [username],
  );

  /**
   * Draft the checklist under one checkpoint, asked for on the card.
   *
   * The card offers this only on a checkpoint with no *named* steps, and the
   * reason is the write: `updateMilestone` takes the whole `steps` column and
   * replaces it, so run over a checklist somebody has written this would be a
   * suggestion quietly deleting their plan. The guard is on the card because
   * that is where the button is; it is restated here because a second caller
   * would not be able to see it from this side.
   *
   * On `planning` rather than `busy`, and not routed through `write`, for the
   * reason `suggestMilestones` gives: a model call holds for several seconds
   * and the rest of the page stays usable while one checkpoint thinks.
   */
  const suggestSteps = useCallback(
    async (milestone: Milestone) => {
      if (!username || stepProgress(milestone.steps ?? []).total > 0) return;
      setPlanning(milestone.id);
      try {
        const drafted = await goalService.suggestSteps({ milestoneId: milestone.id });
        if (!drafted.success) {
          setError(drafted.message ?? 'Those steps could not be drafted.');
          return;
        }
        if (!drafted.steps?.length) {
          setError('The model returned no steps. Try again.');
          return;
        }
        const saved = await goalService.updateMilestone(milestone.id, {
          steps: fromTitles(drafted.steps),
        });
        if (!saved.success) {
          setError(saved.message ?? 'Those steps could not be saved.');
          return;
        }
        setError(null);
        await load(true);
      } finally {
        setPlanning(null);
      }
    },
    [username, load],
  );

  /**
   * Draft steps for every checkpoint on a goal that has none written.
   *
   * Behind the save rather than inside it, and on the `planning` flag rather
   * than `busy`, for the reasons `createGoal` gives: the ladder is saved and
   * drawn at once, and its checklists arrive a few seconds later.
   */
  const draftChecklists = useCallback(
    async (goalId: string) => {
      setPlanning(goalId);
      try {
        const filled = await fillSteps(goalId);
        if (filled.problem && !filled.checklists) setError(filled.problem);
        if (filled.checklists) await load(true);
      } finally {
        setPlanning(null);
      }
    },
    [load],
  );

  /**
   * Write a goal's whole checkpoint list, then break down any rung that is new.
   *
   * This is where the card's drafted ladder is accepted, and it used to stop
   * at the titles — five checkpoints, each with three empty prompts. A rung
   * the reader has already written steps into is left alone (see
   * components/Goals/plan), so re-saving a ladder after renaming one costs
   * nothing and overwrites nothing.
   */
  const saveMilestones = useCallback(
    async (goal: Goal, titles: string[]) => {
      if (!username) return false;
      const ok = await write(() => goalService.setMilestones(goal.id, titles));
      if (ok) void draftChecklists(goal.id);
      return ok;
    },
    [draftChecklists, username, write],
  );

  /**
   * Draft a ladder for a goal that already has one, from the card's menu.
   *
   * The panels' own offers appear only where there is nothing to lose, which
   * is right — and meant that on an account whose goals all have checkpoints
   * the feature was nowhere on screen. This is the way back to it. A goal with
   * no ladder is drafted straight away; one with a ladder asks first.
   */
  const redraftStones = useCallback(
    (goal: Goal) => {
      if ((goal.milestones ?? []).length) {
        setPendingDraft(goal);
        return;
      }
      void suggestMilestones(goal).then((titles) =>
        titles && titles.length ? saveMilestones(goal, titles) : null,
      );
    },
    [saveMilestones, suggestMilestones],
  );

  const confirmRedraft = useCallback(async () => {
    const goal = pendingDraft;
    setPendingDraft(null);
    if (!goal) return;
    const titles = await suggestMilestones(goal);
    if (titles && titles.length) await saveMilestones(goal, titles);
  }, [pendingDraft, saveMilestones, suggestMilestones]);


  // ---- What goes where ----------------------------------------------------
  const active = useMemo(
    () =>
      list
        .filter((goal) => goal.status !== 'completed')
        .sort((a, b) => {
          // Overdue first, then by how much it matters, then by how close the
          // date is — which is the order a reader would put them in themselves.
          const overdue = Number(isOverdue(b)) - Number(isOverdue(a));
          if (overdue) return overdue;
          const weight = (Number(b.priority) || 5) - (Number(a.priority) || 5);
          if (weight) return weight;
          return (a.deadline || '9999') < (b.deadline || '9999') ? -1 : 1;
        }),
    [list],
  );

  /** The outcome goals — what this page is now about. */
  const outcomes = useMemo(
    () => active.filter((goal) => ['number', 'milestones'].includes(measureOf(goal))),
    [active],
  );
  /**
   * The goals the header's third line counts, and the ones it filters to.
   *
   * At risk or off track — not "not started". A goal with nothing against it
   * yet is a goal nobody has begun, which is a different problem with a
   * different answer, and putting it here would fill the reader's one
   * "show me the problem" view with goals whose problem is that they have not
   * happened. `goalHealth` says why each one is here; see `reasonFor` there.
   */
  const needsAttention = useMemo(
    () =>
      outcomes.filter((goal) => {
        const state = goalHealth(goal, tasks).state;
        return state === 'at-risk' || state === 'off-track';
      }),
    [outcomes, tasks],
  );

  /**
   * Whether the header's filter is on.
   *
   * Not persisted, and deliberately: it is a way of looking at the page for
   * the next thirty seconds, not a preference. A filter that survived a reload
   * would be a reader coming back tomorrow to a Goals page that silently omits
   * every goal that is going well.
   */
  const [attention, setAttention] = useState(false);

  /* It clears itself when there is nothing left to show. Ticking the last
     at-risk goal back into shape while filtered would otherwise leave an empty
     tab under a header that had just stopped saying anything was wrong. */
  useEffect(() => {
    if (attention && needsAttention.length === 0) setAttention(false);
  }, [attention, needsAttention.length]);

  /** The ones drawn as ladders and given their own rail. See LIST_GOALS. */
  const shown = useMemo(
    () => (attention ? needsAttention : outcomes.slice(0, LIST_GOALS)),
    [attention, needsAttention, outcomes],
  );

  /** The four counters the app feeds itself. Kept, not extended. */
  const counters = useMemo(
    () => active.filter((goal) => !['number', 'milestones'].includes(measureOf(goal))),
    [active],
  );

  /**
   * Which part of the page is showing.
   *
   * State rather than a route — see components/Goals/GoalTable for why. Every
   * band below is still built on every tab; only which of them render moves,
   * so switching tabs costs nothing and loses no scroll position within one.
   */
  const [tab, setTab] = useState<TabId>('active');
  const on = (...ids: TabId[]) => ids.includes(tab);

  /* "New goal" makes the kind of goal the tab is about. On the System tab
     that is a counter, and the outcome wizard there would ask for a subject
     and a reason and then draft checkpoints under "earn 50,000 XP". */
  const startGoal = () => {
    setDraftFirst(false);
    return tab === 'system' ? setSystemOpen(true) : setWizardOpen(true);
  };

  const open = list.find((goal) => goal.id === openId) ?? null;

  if (loading) return <Loading label="Reading your goals" />;
  if (error && !list.length) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="gx-page">
      <Ambient />
      <div className={`gx-shell page-shell${entering ? ' pg-enter' : ''}`}>
        {/* This header was already a card of its own — a tinted strip with a
            border and a shadow. It keeps its layout and gives up its surface to
            the hero, because a card inside a card is a box in a box; see the
            `.peak-hero .gx-head` rule in styles/goals.css. */}
        <PageHero variant="goals" tone="amber">
          <header className="gx-head">
            <div>
              <h1>
                <span className="gx-head-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="12" r="4.5" />
                    <circle cx="12" cy="12" r="1" />
                  </svg>
                </span>
                Goals
              </h1>
              {/* State, not narration. Three lines: how much, what kind, and
                  what to look at first — and the third is the page's only
                  header control. See `GoalsState` in components/Goals/Outcome. */}
              <GoalsState
                goals={outcomes}
                tasks={tasks}
                on={attention}
                onAttention={() => {
                  /* The cards it filters are on the Active tab, so pressing it
                     from Stats or Timeline has to go there — a filter applied
                     to a tab you are not looking at is a button that does
                     nothing. */
                  setTab('active');
                  setAttention((was) => !was);
                }}
              />
            </div>
            <div className="gx-head-tools">
              <RefreshButton busy={busy} onRefresh={() => void load(true)} />
              <button
                type="button"
                className="gx-btn"
                onClick={() => setShowCompleted((shown) => !shown)}
              >
                {showCompleted ? 'Hide completed' : 'View completed'}
              </button>
              {/* The second door to the wizard, and the only one that says
                  out loud that a model can write the whole goal.

                  Not a second feature: it opens the same wizard on the same
                  first step, with the cursor already in the box that takes a
                  sentence. The offer has been in there since it was built and
                  nobody found it, because "+ New Goal" promises a form and a
                  reader who wants the shortcut has no reason to open a form
                  looking for it. A door has to be labelled with what is behind
                  it.

                  Outcomes only. A counter has no title to write, no field and
                  no checkpoints — see SystemGoalWizard. */}
              {tab !== 'system' && (
                <button
                  type="button"
                  className="gx-btn gx-btn-ai"
                  onClick={() => { setDraftFirst(true); setWizardOpen(true); }}
                >
                  <Spark />
                  Draft a goal
                </button>
              )}
              <button type="button" className="gx-btn is-primary" onClick={startGoal}>
                {tab === 'system' ? '+ New System Goal' : '+ New Goal'}
              </button>
            </div>
          </header>
        </PageHero>

        <GoalTabs tab={tab} onTab={setTab} />

        {error && <ErrorState message={error} onRetry={() => void load()} />}

        <div className="gx-main pg-stagger">

        {/* ---- Active Goals ---------------------------------------------
            One card per goal, at full width, and the card carries what used
            to be four separate bands: the ladder, the trajectory, the next
            moves against that goal, and its dates. See
            components/Goals/ActiveGoalCard. */}
        {on('active') && (
          <>
            {/* What the reader is looking at, and the way back. A filtered list
                that does not say it is filtered is a list with goals missing
                from it, and the header button is small and above the tabs —
                the state has to be stated where the cards are. */}
            {attention && (
              <div className="gx-filtered" role="status">
                <span className="gx-filtered-what">
                  <strong>{shown.length}</strong>{' '}
                  {shown.length === 1 ? 'goal needs' : 'goals need'} attention
                  <span className="gx-quiet">
                    {' '}· behind pace, gone quiet, or past their date
                  </span>
                </span>
                <button type="button" className="gx-btn" onClick={() => setAttention(false)}>
                  Show all {outcomes.length}
                </button>
              </div>
            )}

            {shown.length === 0 ? (
              <p className="gx-empty">
                No outcome goals yet. Something you either reached or did not — reach USACO
                Gold, ship Summit v2, read 24 books.
                <button type="button" className="gx-link" onClick={() => setWizardOpen(true)}>
                  Set your first
                </button>
              </p>
            ) : (
              <div className="ag-list">
                {shown.map((goal) => (
                  <ActiveGoalCard
                    key={goal.id}
                    goal={goal}
                    tasks={tasks}
                    busy={busy}
                    onOpen={(entry) => setOpenId(entry.id)}
                    onEdit={(entry) => {
                      setEditing(entry);
                      setModalOpen(true);
                    }}
                    onDelete={setPendingDelete}
                    onComplete={(task) => void completeMove(task)}
                    onLinkTask={(entry, task, milestoneId) =>
                      void linkTask(entry, task, milestoneId)
                    }
                    onSuggest={suggestMilestones}
                    onRedraftStones={redraftStones}
                    onFillSteps={(entry) => void draftChecklists(entry.id)}
                    onSuggestSteps={(stone) => void suggestSteps(stone)}
                    /* Only while filtered. The health chip carries its reason
                       as a tooltip everywhere else, which is enough when the
                       reader chose the goal; it is not enough when the page
                       chose it for them and they are owed the because. */
                    explain={attention}
                    /* The goal itself, or any checkpoint under it: the ladder
                       being drafted is the same ladder either way. */
                    planning={
                      planning === goal.id ||
                      (goal.milestones ?? []).some((stone) => stone.id === planning)
                    }
                    onSaveStones={saveMilestones}
                    onFocusMilestone={focusMilestone}
                    onMilestoneSteps={setMilestoneSteps}
                    onMilestoneStatus={setMilestoneStatus}
                    onCompleteGoal={completeGoal}
                    nameOf={subjectName}
                    onChart={setChart}
                  />
                ))}
              </div>
            )}

            {/* The eleventh goal onward. Still reachable, still counted — just
                not drawn as something being actively pursued. Not while the
                filter is on: every goal it holds is one the filter just said
                was fine, so listing them under the problem ones puts the
                answer back on screen directly below the question. */}
            {!attention && outcomes.length > LIST_GOALS && (
              <Band
                title={`Also carrying · ${outcomes.length - LIST_GOALS} ${
                  outcomes.length - LIST_GOALS === 1 ? 'goal' : 'goals'
                }`}
                hint="Still counted, not drawn as cards"
              >
                {/* Rows, not cards, and that is the whole point of the band:
                    these are the goals that did not make the ladder, and a
                    second card system underneath the first would put them back
                    in competition with it. Each row carries the three things
                    that decide whether you want to go and look — what it is,
                    how far in, and whether it is in trouble — and nothing else.

                    The health dot is the addition. Without it the list sorted
                    by eye into nothing: fourteen goals at assorted percentages,
                    with no way to tell the one that is quietly failing from the
                    one that is simply long. It is the same reading and the same
                    colours as the chip on a card, so the two cannot disagree. */}
                <ul className="gx-rest">
                  {outcomes.slice(LIST_GOALS).map((goal) => {
                    const numbers = goalNumbers(goal);
                    const health = goalHealth(goal, tasks);
                    return (
                      <li key={goal.id}>
                        <button type="button" onClick={() => setOpenId(goal.id)}>
                          <span className="gx-rest-title">{goal.title}</span>
                          <span className="gx-rest-pct">{Math.round(numbers.progress)}%</span>
                          <i className={`gx-rest-dot is-${health.state}`} aria-hidden="true" />
                          <span className="gx-sr">{health.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Band>
            )}
          </>
        )}

        {/* ---- Timeline ---------------------------------------------------
            When things land. One rail per goal rather than a single merged
            one: a combined timeline answers "what happens next to me", which
            Next Milestones already says; a rail per goal answers "how does
            this one land", and that is a question about one goal at a time.
            The calendar under them is the same checkpoints as months — the
            widest view of the smallest thing, so it goes last. */}
        {on('timeline') && (
          <>
            <Band title="Next Milestones" hint="What each goal is on now">
              <NextMilestones goals={list} tasks={tasks} onOpen={(goal) => setOpenId(goal.id)} />
            </Band>

            {shown.length > 0 && (
              <Band
                title="The plan, goal by goal"
                hint="Checkpoints in order. Their dates are on the calendar below."
              >
                <div className="gx-rails">
                  {shown.map((goal) => (
                    <section className="gx-rail" key={goal.id}>
                      <button
                        type="button"
                        className="gx-rail-head"
                        onClick={() => setOpenId(goal.id)}
                      >
                        <span className="gx-rail-title">{goal.title}</span>
                        <span className="gx-quiet">{Math.round(goalNumbers(goal).progress)}%</span>
                      </button>
                      <GoalChain
                        goal={goal}
                        onOpen={(entry) => setOpenId(entry.id)}
                        limit={TIMELINE_ROWS}
                      />
                    </section>
                  ))}
                </div>
              </Band>
            )}

            <Band
              title="Milestone Calendar"
              hint="Darker days carry more"
            >
              <MilestoneCalendar goals={list} onOpen={(goal) => setOpenId(goal.id)} />
            </Band>
          </>
        )}

        {/* ---- System Goals -----------------------------------------------
            The counters the app keeps: XP, streak, tasks, focus. A tab of
            their own because they are a different kind of goal rather than a
            second view of the same ones — see components/Goals/SystemGoals.

            The band carries no hint, unlike every other one here: `SystemGoals`
            opens with the sentence saying what one of these is, and a subtitle
            above it making the same point more briefly would be the page
            saying it twice and landing it neither time. */}
        {on('system') && (
          <Band title="System Goals">
            <SystemGoals
              counters={counters}
              onEdit={(goal) => {
                setEditing(goal);
                setModalOpen(true);
              }}
              onDelete={setPendingDelete}
              onNew={() => setSystemOpen(true)}
            />
          </Band>
        )}

        {/* ---- Stats ------------------------------------------------------
            Where you stand and what moves it. Everything here is commentary
            on the cards in the first tab, which is why none of it is on them:
            a card says how one goal is going, and these say how the set of
            them is going. */}
        {on('stats') && (
          <>
            {/* The answer, before any of the analysis of it. Everything under
                this is a different cut of the same set, and a reader arriving
                at seven panels had to assemble the headline themselves —
                which is the shape a page takes when it is built out of the
                components that exist rather than from the question asked. */}
            <Band title="How this is going">
              <SystemVerdict goals={list} tasks={tasks} />
            </Band>

            <Band
              title="Where you stand"
              hint="Counted off your goals"
            >
              <GoalStats goals={list} />
              <OverviewStrip goals={list} tasks={tasks} />
            </Band>

            <Band
              title="Your trajectory"
              hint="How far each one has to go"
            >
              <Trajectory goals={outcomes} onOpen={(goal) => setOpenId(goal.id)} />
            </Band>

            <div className="gx-two">
              <Band title="Goal Insights" hint="From linked work only">
                <GoalInsights goals={list} tasks={tasks} onOpen={(goal) => setOpenId(goal.id)} />
              </Band>

              <Band title="Goal Health" hint="Goal by goal, and why">
                <HealthRing goals={list} tasks={tasks} />
                <HealthBreakdown
                  goals={outcomes}
                  tasks={tasks}
                  onOpen={(goal) => setOpenId(goal.id)}
                />
              </Band>
            </div>

            <Band
              title="Growth areas"
              hint="Where the work you have left is, by subject"
            >
              <GrowthAreas
                goals={outcomes}
                nameOf={subjectName}
                onOpen={(goal) => setOpenId(goal.id)}
              />
            </Band>

            <Band
              title="All Goals"
              hint="Same columns for every goal"
            >
              <GoalTable
                goals={outcomes}
                tasks={tasks}
                onOpen={(goal) => setOpenId(goal.id)}
                onEdit={(goal) => {
                  setEditing(goal);
                  setModalOpen(true);
                }}
              />
            </Band>
          </>
        )}

        {/* ---- What has been reached --------------------------------------
            Not a tab of its own: it is one band, and the header button that
            reveals it works from wherever you are. */}
        {showCompleted && (
          <Band title="Recently Completed" hint="Already behind you">
            <RecentlyCompleted goals={list} />
          </Band>
        )}

        <GoalsCta onNew={startGoal} />
        </div>
      </div>


      {open && (
        <GoalDetail
          goal={open}
          tasks={tasks}
          busy={busy}
          onClose={() => setOpenId(null)}
          onEdit={(goal) => {
            setEditing(goal);
            setModalOpen(true);
          }}
          onDelete={setPendingDelete}
          onAddMilestone={addMilestone}
          onMilestoneStatus={setMilestoneStatus}
          onFocusMilestone={focusMilestone}
          onMilestoneSteps={setMilestoneSteps}
          onMilestoneDate={setMilestoneDate}
          onDeleteMilestone={removeMilestone}
          onReorder={reorder}
          onValue={setValue}
          /* The same two calls the card makes, at the other door. Drafting a
             ladder from here saves it and re-reads, so the drawer redraws
             around the reader with the checkpoints in it. */
          onSuggestStones={(entry) => {
            void suggestMilestones(entry).then((titles) =>
              titles && titles.length ? saveMilestones(entry, titles) : null,
            );
          }}
          onSuggestSteps={(stone) => void suggestSteps(stone)}
          /* The two the drawer's own row needs. `redraftStones` confirms where
             a ladder exists; `draftChecklists` is additive and does not. Both
             already existed for the card's menu — see the note on
             `redraftStones` — and the drawer is where a plan is actually
             built, so it is the door that most wanted them. */
          onRedraftStones={redraftStones}
          onFillSteps={(entry) => void draftChecklists(entry.id)}
          planning={
            planning === open.id
            || (open.milestones ?? []).some((stone) => stone.id === planning)
          }
          nameOf={subjectName}
        />
      )}

      <NewGoalWizard
        open={wizardOpen}
        busy={busy}
        subjects={catalogue}
        focusIdea={draftFirst}
        onClose={() => { setDraftFirst(false); setWizardOpen(false); }}
        onSave={(draft) => void createGoal(draft)}
        onSuggest={suggestDraft}
        onDraft={draftWholeGoal}
      />

      <SystemGoalWizard
        open={systemOpen}
        busy={busy}
        counters={counters}
        onClose={() => setSystemOpen(false)}
        onSave={(draft) => void createSystemGoal(draft)}
      />

      <GoalModal
        open={modalOpen}
        goal={editing}
        busy={busy}
        subjects={catalogue}
        onClose={() => {
          setModalOpen(false);
          setEditing(undefined);
        }}
        onSave={saveGoal}
      />

      <ConfirmDialog
        open={pendingDraft !== null}
        title="Redraft this goal's checkpoints?"
        body={
          `The model writes five new ones over the ${(pendingDraft?.milestones ?? []).length} `
          + 'already here. A rung keeps its place, so anything already reached stays '
          + 'reached and any task pointed at one keeps its link — it is the wording '
          + 'that changes. Checklists you have written are left alone.'
        }
        confirmLabel="Redraft"
        busy={busy}
        onCancel={() => setPendingDraft(null)}
        onConfirm={() => void confirmRedraft()}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        danger
        title="Delete this goal?"
        body="Its checkpoints are deleted too. Linked tasks are kept."
        confirmLabel="Delete"
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
