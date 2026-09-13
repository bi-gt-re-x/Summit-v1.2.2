/**
 * One subject, on its own.
 *
 * ## What this page is for, and why it is not a tab
 *
 * The analytics page has a Subjects tab already, and it answers a different
 * question: it ranks the account's subjects against each other, so a reader
 * can see which of them is getting the work. This page answers the question
 * that ranking cannot — *how is this one going* — with the whole screen given
 * to a single subject rather than a row in a table of them.
 *
 * It is a page rather than an eighth tab because there is one of these per
 * followed subject. Tabs are a fixed set the reader learns; four of them
 * appearing because somebody answered a wizard question would make the tab bar
 * a different shape on every account, and the bar is already at seven. The
 * rail's Analytics entry unfolds into the list instead — Overall, then one row
 * per subject — which is the control that can grow without the page changing
 * shape. See `analytics_subjects` in services/settings.
 *
 * ## Where the numbers come from, and where they do not
 *
 * Two calls, and no more: `/api/analytics/tasks` — the same sixteen columns
 * the analytics page reads — and the goals. Nothing is fetched per panel and
 * nothing is fetched per subject: the filter is a comparison on
 * `task.subject`, so opening four of these pages costs what opening one does.
 * The arithmetic is in ./components/Subject/model, a pure function of the
 * tasks, the goals, the window and the day; this file lays out what it worked
 * out.
 *
 * The goals are the second call because **what to do next is read against what
 * the subject is for**. A page that ranks its advice by whichever of its own
 * measures is lowest is ranking by its arithmetic rather than by the reader's
 * intention — "Quality is the measure holding the grade down" is a true
 * sentence answering a question nobody asked. A goal on this subject leads the
 * recommendations, and the measures explain why it will or will not land.
 *
 * ## The skill tree is beside the record, not mixed into it
 *
 * Each subject opens a lattice (skills/subjectTrees), and the wizard lets a
 * reader name the branch of it they want to go deeper into. That tree is
 * **authored** — every node is written by hand and its state is illustrative —
 * so it is drawn as a route map next to the record rather than as a reading of
 * it. Mixing the two would put a designer's guess in the same panel as counted
 * evidence, and nothing on screen would say which was which.
 *
 * **The sections are the ones that were asked for. The figures are the ones
 * that are true.** A page about Mathematics wants to say "Geometry 68%,
 * Algebra 94%", and Summit has no evidence for either: tasks carry a subject
 * and nothing finer, and the skill trees that do name sub-skills are authored
 * hierarchies whose states are illustrative. So the sub-skill breakdown is the
 * *difficulty bands*, which are recorded on every rated task, and the mistake
 * analysis is the *twelve reasons*, which exist as a closed vocabulary
 * precisely so they can be counted. The model's own note has the full mapping.
 * Nothing on this page is a placeholder, and nothing is invented — which is
 * the rule the analytics page states about itself and the reason its figures
 * are worth reading at all.
 *
 * ## A panel that has nothing to say does not draw
 *
 * Every section below is gated on its own evidence rather than on the page
 * having loaded. A subject with no rated tasks has no quality figure, no
 * bands and no reasons, and the honest page for it is a short one that says
 * what it is waiting for — not eight panels of dashes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Ambient, ErrorState, Loading, PageHero, type HeroTone } from '@/components';
import { AreaChart } from '@/components/Analytics';
import { WINDOWS, type WindowKey } from '@/components/Analytics/data';
import { gradeFor } from '@/utils/analyticalScore';
import { subjectModel, type SubjectGoal } from '@/components/Subject/model';
import { subjectState } from '@/components/Subject/state';
import { Curve } from '@/components/Subject/Curve';
import { Dimensions, Ring } from '@/components/Subject/Dimensions';
import { NextSteps } from '@/components/Subject/NextSteps';
import { BottleneckPanel, ObjectiveBand, WhatMatters } from '@/components/Subject/Opening';
import { bottleneckFrom, evidenceFrom, objectiveFrom } from '@/components/Subject/objective';
import { Reading } from '@/components/Subject/Reading';
import { performance } from '@/components/Subject/performance';
import { latticeFor } from '@/components/Subject/lattice';
import { loadProgress } from '@/utils/skillProgress';
import { treeStanding } from '@/skills/standing';
import { useApi, useAuth, useDocumentTitle, useSettings, useSubjectIndex } from '@/hooks';
import {
  analyticsTasks,
  saveSubjectMilestones,
  subjectBriefAvailable,
  readSubject,
  subjectMilestones,
  subjectReadingAvailable,
  savedSubjectReading,
  subjectRecommendations,
  suggestSubjectGoal,
  takeRecommendation,
  writeGoalPlan,
  writeSubjectBrief,
  type GoalDraft,
  type GoalPlan,
  type NextStep,
  type StepOutcome,
  type SubjectBrief,
  type SubjectMilestone,
  type SubjectReading,
} from '@/services/analytics';
import { getGoals } from '@/services/goals';
import { createTask } from '@/services/tasks';
import { format } from '@/utils';
import '@/styles/analytics.css';
import '@/styles/subject.css';
import '@/styles/subject-state.css';
import '@/styles/subject-objective.css';

/** Today, as the ISO day every window here is measured back from. */
function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** A signed percentage, with the arrow the spec's own tables use. */
function Delta({ value, unit = '%' }: { value: number | null; unit?: string }) {
  if (value === null) return <span className="sb-delta is-flat">—</span>;
  if (value === 0) return <span className="sb-delta is-flat">→ no change</span>;
  return (
    <span className={`sb-delta ${value > 0 ? 'is-up' : 'is-down'}`}>
      {value > 0 ? '↑' : '↓'} {Math.abs(value)}
      {unit}
    </span>
  );
}

/** A 0-100 bar. Labelled by its row, so it is decoration and hidden. */
function Bar({ percent }: { percent: number }) {
  return (
    <span className="sb-bar" aria-hidden="true">
      <span className="sb-bar-fill" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </span>
  );
}

/** 0-100, for a width or an offset written straight into a style. */
function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** A figure with more than a couple of significant digits is noise here. */
function per(value: number): string {
  return value >= 10 ? Math.round(value).toLocaleString() : value.toFixed(1);
}

/**
 * The counted figures under one goal.
 *
 * Assembled rather than written out as JSX because every one of them is
 * conditional on its own evidence — a goal with no date has no days left, a
 * milestone goal has no quantity to be short of — and a grid of dashes is
 * worse than a shorter grid. Nothing here is computed: the model works all of
 * it out (components/Subject/model), and this decides which of it can honestly
 * be printed and what to call it.
 */
function planFacts(goal: SubjectGoal): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = [];

  if (goal.numeric && goal.target > 0) {
    facts.push({
      label: 'Still to go',
      value: `${per(goal.remaining ?? 0)} ${goal.unit}`,
    });
  }
  if (goal.stagesTotal > 0) {
    facts.push({
      label: 'Checkpoints',
      value: `${goal.stagesDone} of ${goal.stagesTotal}`,
    });
  }
  if (goal.daysLeft !== null) {
    facts.push({
      label: goal.daysLeft < 0 ? 'Overdue by' : 'Days left',
      value: `${Math.abs(goal.daysLeft)} ${Math.abs(goal.daysLeft) === 1 ? 'day' : 'days'}`,
    });
  }
  if (goal.need !== null) {
    facts.push({ label: 'Needs a week', value: `${per(goal.need * 7)} ${goal.unit}` });
  }
  if (goal.have !== null) {
    facts.push({ label: 'Getting a week', value: `${per(goal.have * 7)} ${goal.unit}` });
  }
  if (goal.lands && goal.deadline) {
    facts.push({ label: 'Lands', value: goal.lands });
  }
  /* The two that are this page's alone. Every other figure above is on the
     goals page too; these say what *this subject* has put into it, which is
     the thing a page about one subject can answer and a goal card cannot. */
  facts.push({
    label: 'Aimed at it',
    value: goal.ofFinished
      ? `${goal.aimed} of ${goal.ofFinished} tasks`
      : 'nothing finished here',
  });
  /* The fortnight is named in the value rather than the label, because it is
     the one figure here measured over something other than the page's window
     and a reader who missed that would read it as a share of the year. */
  facts.push({ label: 'Days worked', value: `${goal.recentDays} of last 14` });

  return facts;
}

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ax-panel sb-panel">
      <div className="ax-panel-head">
        <div className="ax-panel-title">
          <h2>{title}</h2>
        </div>
      </div>
      {note && <p className="ax-panel-note">{note}</p>}
      {children}
    </section>
  );
}

export default function SubjectAnalytics() {
  const { subjectId = '' } = useParams();
  const { username } = useAuth();
  const { prefs, update } = useSettings();
  const catalogue = useSubjectIndex(username);
  const subject = catalogue.get(subjectId);

  /* The window opens on the account's own analytics preference, so this page
     and the analytics page agree about what "recently" means on arrival. It is
     local state after that: the two pages are read in sequence and a picker
     that wrote back would change the other page under the reader. */
  const [span, setSpan] = useState<WindowKey>(prefs.analytics_window);

  const call = useMemo(
    () =>
      username
        ? analyticsTasks
        : () => Promise.resolve({ success: false as const, message: 'Sign in to see a subject.' }),
    [username],
  );
  const tasks = useApi(call, [username]);

  /* The second and last call. Goals lead the recommendations — what to do next
     is read against what the subject is *for* rather than against whichever
     internal measure is lowest — and there is no way to know that from tasks
     alone: the link is `subject_ids` on the goal. */
  const goalCall = useMemo(
    () =>
      username
        ? getGoals
        : () => Promise.resolve({ success: false as const, message: 'Sign in to see goals.' }),
    [username],
  );
  const goals = useApi(goalCall, [username]);

  const today = todayIso();

  /**
   * The deterministic state — where the reader stands, and why.
   *
   * The whole architecture in one line: **this counts, and the model reads
   * what this counted.** Every figure in the hero, the seven dimension cards,
   * the difficulty curve and the time analysis is arithmetic over the
   * account's own tasks (components/Subject/state), computed here in the
   * browser from the same task list the panels below already use. Nothing is
   * fetched for it and nothing is asked of a model to produce it.
   *
   * That is what makes the reading below it safe to show: the model is handed
   * these numbers and forbidden any others, which is only a workable
   * instruction because they all exist before it is called.
   */
  const state = useMemo(
    () => subjectState(tasks.data?.tasks ?? [], subjectId, span, today),
    [span, subjectId, tasks.data, today],
  );

  const model = useMemo(
    () =>
      subjectModel(
        tasks.data?.tasks ?? [],
        subjectId,
        span,
        today,
        goals.data?.goals ?? [],
      ),
    [goals.data, span, subjectId, tasks.data, today],
  );

  /* The four relationships, hoisted out of the brief's request body.
     They were computed there and only there, which was fine while the model
     was their only reader — the objective band and the evidence cards read
     them too now, and a second call would be a second answer to the same
     question. */
  const perf = useMemo(
    () =>
      performance(
        state,
        model.rates.find((rate) => rate.key === 'quality')?.delta ?? null,
      ),
    [model.rates, state],
  );

  /**
   * The model's write-up, and whether it can be asked for at all.
   *
   * Pressed rather than automatic, and that is not a performance decision: the
   * call costs the account's owner money, and a panel that spent it on every
   * page load would be spending it on every reader who came to look at a
   * number. Nothing on this page depends on it — the write-up is a reading of
   * findings that are already all on screen.
   */
  const [brief, setBrief] = useState<SubjectBrief | null>(null);
  const [writing, setWriting] = useState(false);
  const [briefError, setBriefError] = useState('');
  const [canWrite, setCanWrite] = useState(false);

  /* Asked once, so an install with no key draws no button at all. A control
     that is always there and says "no key" when pressed is a worse answer
     than no control. */
  useEffect(() => {
    if (!username) return;
    let live = true;
    void subjectBriefAvailable().then((result) => {
      if (live) setCanWrite(result.success && result.available);
    });
    return () => {
      live = false;
    };
  }, [username]);

  /* Cleared when the window or the subject changes: a reading of the last
     ninety days sitting under a page now showing seven is prose about figures
     that are no longer on screen. */
  useEffect(() => {
    setBrief(null);
    setBriefError('');
  }, [span, subjectId]);

  const write = useCallback(async () => {
    if (!subject) return;
    setWriting(true);
    setBriefError('');
    /* Exactly what the page is showing, and nothing it is not. The server
       sends these to the model and forbids it any number that is not among
       them — so a figure here that the page did not draw would be a figure
       the reader cannot check. */
    const result = await writeSubjectBrief({
      subject: subject.name,
      span: WINDOWS.find((option) => option.key === span)?.label ?? '',
      /* What this subject is for, in the reader's own words. It is what turns
         "your hardest band is weakest" into "and here is what to chase next" —
         without it the model is reading a table with no destination. */
      aim: ambition?.aim ?? '',
      level: ambition?.level ?? '',
      checkpoints: milestones.filter((entry) => !entry.done).map((entry) => entry.title),
      score: model.score,
      grade: model.grade,
      finished: model.finished,
      finished_before: model.finishedBefore,
      streak: model.streak,
      rates: model.rates
        .filter((rate) => rate.known)
        .map((rate) => ({ label: rate.label, now: Math.round(rate.now) })),
      bands: model.bands
        .filter((band) => band.done > 0)
        .map((band) => ({
          label: band.label,
          done: band.done,
          holding: band.holding === null ? null : Math.round(band.holding),
        })),
      struggles: model.struggles.map((driver) => ({
        label: driver.label,
        share: driver.share,
        count: driver.count,
      })),
      goals: model.goals.map((goal) => ({
        title: goal.title,
        progress: Math.round(goal.progress),
        deadline: goal.deadline,
        drift: goal.drift,
      })),
    });
    setWriting(false);
    if (result.success) setBrief(result.brief);
    else setBriefError(result.message || 'Could not write this up.');
  }, [model, span, subject]);

  /**
   * The lattice this subject opens on, and what the reader has practised of it.
   *
   * Read from the practice store rather than fetched — it is local to the
   * browser (utils/skillProgress), so this costs no request. Recomputed when
   * the subject or the chosen branch changes and not otherwise: the store only
   * moves on the skill tree page, which is a navigation away from here.
   */
  const lattice = useMemo(
    () =>
      subject
        ? latticeFor(
            subjectId,
            subject.group,
            prefs.analytics_subject_depth[subjectId],
            loadProgress(username),
          )
        : null,
    [prefs.analytics_subject_depth, subject, subjectId, username],
  );

  /**
   * How far into this subject's lattice the account's own work has got.
   *
   * The panel below says what the tree *contains*, which is authored and the
   * same for everybody. This is the half that is about the reader: XP filed
   * under every subject that opens this tree, against what the tree is worth.
   * See skills/standing, which is also what the Subjects tab and the Mastery
   * badges read, so the three cannot disagree about the same account.
   *
   * Counted over every finished task rather than over the window this page is
   * scoped to. Everything else here is a statement about the window and this
   * is not, deliberately: a lattice is a curriculum rather than a quarter.
   *
   * Sibling subjects count. Algebra and Geometry open the Mathematics tree, so
   * a reader on the Algebra page is told where *the tree* stands, not where
   * their algebra tasks alone stand — the tree is the thing being measured.
   */
  const standing = useMemo(() => {
    const xp = new Map<string, number>();
    for (const task of tasks.data?.tasks ?? []) {
      const key = task.subject ?? '';
      if (task.status !== 'done' || !key) continue;
      xp.set(key, (xp.get(key) ?? 0) + (Number(task.xp_value) || 0));
    }
    const rows = treeStanding([...xp].map(([key, total]) => ({ key, xp: total })));
    return rows.find((tree) => tree.subjects.includes(subjectId))
      ?? rows.find((tree) => tree.title === lattice?.title)
      ?? null;
  }, [lattice?.title, subjectId, tasks.data]);

  /**
   * The checkpoints set against this subject, and the goal drafted from them.
   *
   * Checkpoints first, goal second, which is the order people actually work
   * in: everybody knows roughly what the stages of a subject are long before
   * they have settled on a target, a date and a number. The draft turns the
   * stages into the goal, and the goal is what orders the recommendations at
   * the top of this page — so the loop closes here.
   */
  const ambition = prefs.analytics_ambitions[subjectId];
  const [milestones, setMilestones] = useState<SubjectMilestone[]>([]);
  const [adding, setAdding] = useState('');
  const [draft, setDraft] = useState<GoalDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [created, setCreated] = useState(false);

  useEffect(() => {
    if (!username || !subjectId) return;
    let live = true;
    void subjectMilestones().then((result) => {
      if (live && result.success) setMilestones(result.milestones[subjectId] ?? []);
    });
    return () => {
      live = false;
    };
  }, [subjectId, username]);

  /* Applied here and stored in the background, the way the rail's collapse is:
     a checkbox that waited for a round trip before ticking feels broken, and
     there is nothing to roll back to — the list on screen is what was sent. */
  const putMilestones = useCallback(
    (next: SubjectMilestone[]) => {
      setMilestones(next);
      void saveSubjectMilestones(subjectId, next);
    },
    [subjectId],
  );

  const askForGoal = useCallback(async () => {
    if (!subject) return;
    setDrafting(true);
    setDraftError('');
    setCreated(false);
    const result = await suggestSubjectGoal({
      subject: subject.name,
      finished: model.finished,
      days: model.span.days,
      active_days: new Set(
        model.done.map((task) => String(task.completed_at ?? '').slice(0, 10)).filter(Boolean),
      ).size,
      hours: Math.round((model.invested / 3600) * 10) / 10,
      milestones: milestones.map((entry) => entry.title),
      /* The same evidence the write-up and the route are given. Without it
         this panel drafted from volume alone, which sizes a target and cannot
         pitch it: "forty tasks" is met just as well at the difficulty
         somebody has already cleared as at the one they keep falling off. */
      aim: ambition?.aim ?? '',
      level: ambition?.level ?? '',
      rates: model.rates
        .filter((rate) => rate.known)
        .map((rate) => ({ label: rate.label, now: Math.round(rate.now) })),
      bands: model.bands
        .filter((band) => band.done > 0)
        .map((band) => ({
          label: band.label,
          done: band.done,
          holding: band.holding === null ? null : Math.round(band.holding),
        })),
      struggles: model.struggles.map((driver) => ({
        label: driver.label,
        share: driver.share,
        count: driver.count,
      })),
    });
    setDrafting(false);
    if (result.success) setDraft(result.draft);
    else setDraftError(result.message || 'Could not draft a goal.');
  }, [ambition, milestones, model, subject]);

  /**
   * Keeping a draft writes it here, not to the goals page.
   *
   * It drafted a goal through `/api/add_goal` for one commit, and that was the
   * wrong store. A goal on the goals page is a commitment with a number, a
   * date and progress read off the record; "get to Mathcounts Nationals" is
   * none of those, and putting it there would have given it a progress bar
   * nobody can honestly fill in. What it actually is is the sentence that says
   * what this subject is *for* — so it lands in `analytics_ambitions`, beside
   * the aim the setup questions ask for, where the read-out above can read it.
   *
   * The stages become this subject's checkpoints, which is the same store the
   * list above already edits.
   */
  const keepDraft = useCallback(async () => {
    if (!draft) return;
    const saved = await update({
      analytics_ambitions: {
        ...prefs.analytics_ambitions,
        [subjectId]: {
          aim: `${draft.title} — ${draft.target} ${draft.unit} over ${draft.weeks} weeks`,
          level: prefs.analytics_ambitions[subjectId]?.level ?? '',
        },
      },
    });
    if (!saved) {
      setDraftError('Could not keep that. Try again.');
      return;
    }
    if (draft.milestones.length > 0) {
      putMilestones(
        draft.milestones.map((title, at) => ({ id: `d${at}-${Date.now()}`, title, done: false })),
      );
    }
    setCreated(true);
    setDraft(null);
  }, [draft, prefs.analytics_ambitions, putMilestones, subjectId, update]);

  /**
   * The route to one goal, written by a model, kept per goal.
   *
   * ## Why this is a second model call and not part of the write-up
   *
   * The write-up below is about the *subject*: how it is going, and what to
   * practise. This is about one goal, and a reader with two goals on a subject
   * gets two different plans — which is the whole point, and is not something
   * one panel about the subject can do.
   *
   * What the model adds is the thing the arithmetic cannot. `leversFor` in
   * components/Subject/model can work out that a goal needs 1.6 points a week
   * and is getting 1.2. It cannot know what a point on the AMC 8 is made of,
   * and so it cannot turn that into an order to do the work in. That requires
   * knowing what the goal names, which is knowledge about the world rather
   * than a claim about the reader — the argument backend/tracking/goal_plan.py
   * makes at length, and the same one backend/tracking/subject_brief.py makes
   * for the write-up.
   *
   * ## Pressed, per goal, and never on load
   *
   * It costs the account's owner money. A panel that spent that on every page
   * load would be spending it on every reader who came to look at a number,
   * and keyed by goal so that pressing it on the second goal does not throw
   * away the first one's answer.
   */
  const [plans, setPlans] = useState<Record<string, GoalPlan>>({});
  const [planning, setPlanning] = useState('');
  const [planError, setPlanError] = useState<Record<string, string>>({});

  /* Cleared with the window, for the reason the write-up is: a route argued
     from ninety days of record, sitting under a page now showing seven, is
     prose about figures that are no longer on screen. */
  useEffect(() => {
    setPlans({});
    setPlanError({});
  }, [span, subjectId]);

  const planFor = useCallback(
    async (goal: SubjectGoal) => {
      if (!subject) return;
      setPlanning(goal.id);
      setPlanError((was) => ({ ...was, [goal.id]: '' }));
      /* Exactly what the panel above it is showing. The server forbids the
         model any figure that is not among these, so a number in the plan
         that the page did not draw would be a number the reader cannot
         check — the rule the whole subject page is built on. */
      const result = await writeGoalPlan({
        goal: goal.title,
        subject: subject.name,
        standing: goal.numeric && goal.target > 0
          ? `${goal.current} of ${goal.target} ${goal.unit}`
          : `${Math.round(goal.progress)}% done`,
        deadline: goal.deadline,
        days_left: goal.daysLeft,
        need_weekly: goal.need === null ? '' : `${(goal.need * 7).toFixed(1)} ${goal.unit}`,
        have_weekly: goal.have === null ? '' : `${(goal.have * 7).toFixed(1)} ${goal.unit}`,
        lands: goal.lands ?? '',
        expected: goal.expected === null ? null : Math.round(goal.expected),
        stages: milestones.filter((entry) => !entry.done).map((entry) => entry.title),
        // The app's own conclusions, in the words it wrote them in. Handing
        // over the sentences rather than the raw counts is what stops the
        // model re-deriving them and getting a different answer.
        levers: goal.levers.map((lever) => `${lever.title} — ${lever.fact}`),
        aim: ambition?.aim ?? '',
        level: ambition?.level ?? '',
        span: WINDOWS.find((option) => option.key === span)?.label ?? '',
        score: model.score,
        grade: model.grade,
        finished: model.finished,
        aimed: goal.aimed,
        recent_days: goal.recentDays,
        bands: model.bands
          .filter((band) => band.done > 0)
          .map((band) => ({
            label: band.label,
            done: band.done,
            holding: band.holding === null ? null : Math.round(band.holding),
          })),
        struggles: model.struggles.map((driver) => ({
          label: driver.label,
          share: driver.share,
          count: driver.count,
        })),
      });
      setPlanning('');
      if (result.success) setPlans((was) => ({ ...was, [goal.id]: result.plan }));
      else {
        setPlanError((was) => ({
          ...was,
          [goal.id]: result.message || 'Could not plan a route.',
        }));
      }
    },
    [ambition, milestones, model, span, subject],
  );

  /**
   * WHAT SHOULD I DO NEXT — the reading, and the loop that checks it.
   *
   * ## Why this is one call and not a panel per question
   *
   * Diagnosis, priorities, next steps and insights come back together because
   * they are one act of reasoning. A model asked separately for "what is wrong"
   * and "what to do" produces an answer to the second that does not follow
   * from its answer to the first, and the reader has no way to see the join.
   * Asked once, the steps are argued from the findings and the page can show
   * that argument.
   *
   * ## Pressed, not automatic
   *
   * It costs the account's owner money, so it never fires on load. The spec's
   * own rule — use the model for expensive synthesis and the backend for
   * everything frequent — is the rule here: the seven dimensions, the curve
   * and the time analysis are recomputed on every keystroke of the window
   * picker and cost nothing, and this is asked for once when the reader wants
   * it.
   *
   * ## The loop
   *
   * Every step that comes back is stored server-side (backend/api/subject_ai.py)
   * so that "did this kind of session actually move anything" is a question
   * with an answer later. `taken` is the set already acted on, which is what
   * keeps a step from offering itself twice inside one visit.
   */
  const [reading, setReading] = useState<SubjectReading | null>(null);
  const [thinking, setThinking] = useState(false);
  const [readError, setReadError] = useState('');
  const [canRead, setCanRead] = useState(false);
  const [outcomes, setOutcomes] = useState<StepOutcome[]>([]);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [stepBusy, setStepBusy] = useState('');

  /* ---- WHAT ARE YOU TRYING TO ACCOMPLISH -------------------------------
     The band the page opens on, and the facts that bear on it.

     Both are counted first and overlaid with the reading when there is one,
     which is what lets the first section of the page exist before anybody has
     pressed anything — see components/Subject/objective for why that matters
     more here than anywhere else on the page. */
  const objective = useMemo(
    () => objectiveFrom(state, perf, model.goals, ambition ?? null, today,
                        reading?.goal_read ?? null),
    [ambition, model.goals, perf, reading, state, today],
  );

  const evidenceCards = useMemo(
    () => evidenceFrom(state, perf, model.goals, reading?.goal_evidence ?? null),
    [model.goals, perf, reading, state],
  );

  /* ---- WHAT IS THE BOTTLENECK -----------------------------------------
     Null is a real answer, and the section does not draw for it. A subject
     whose figures do not agree on one has no bottleneck, and naming one at
     0.3 confidence is how a reader spends a month on the wrong thing. */
  const bottleneck = useMemo(
    () => bottleneckFrom(state, perf, reading?.bottleneck ?? null),
    [perf, reading, state],
  );

  /* Asked once, so an install with no key draws no button at all — the same
     bargain the write-up keeps, for the same reason. */
  useEffect(() => {
    if (!username) return;
    let live = true;
    void subjectReadingAvailable().then((result) => {
      if (live) setCanRead(result.success && result.available);
    });
    return () => {
      live = false;
    };
  }, [username]);

  /* What has been recommended here before, and how each kind has gone. Read
     on arrival rather than with the reading: it is cheap, it is the half of
     the loop that is about the past, and it should be on screen before
     anybody presses anything. */
  /* Keyed on the subject's *name* rather than on the subject object. The
     catalogue is a Map rebuilt whenever its source list changes, so depending
     on the object here would re-run this effect on any render that produced a
     new Map — which sets state, which renders again. The name is what the
     request is actually keyed on, and it is a string. */
  const subjectName = subject?.name ?? '';
  useEffect(() => {
    if (!username || !subjectName) return;
    let live = true;
    void subjectRecommendations(subjectName).then((result) => {
      if (!live || !result.success) return;
      setOutcomes(result.outcomes);
      setTaken(new Set(result.recommendations.filter((row) => row.taken).map((row) => row.id)));
    });
    return () => {
      live = false;
    };
  }, [subjectName, username]);

  /* Cleared with the window and the subject, then restored from the server if
     one was written for this exact pair.

     Both halves of that are the same rule. A diagnosis argued from ninety
     days, sitting over a page now showing seven, is a reading of figures that
     are no longer on screen — so it is cleared when the window moves, and a
     saved one is only put back when the window it was argued from is the one
     being shown. The span is stored beside the reading for that comparison.

     The restore is what stops a refresh throwing away a reading the reader
     paid a call for. It used to live here and nowhere else. */
  const spanLabel = WINDOWS.find((option) => option.key === span)?.label ?? '';
  useEffect(() => {
    setReading(null);
    setReadError('');
    if (!username || !subjectName || !spanLabel) return;
    let live = true;
    void savedSubjectReading(subjectName).then((result) => {
      if (!live || !result.success || !result.reading) return;
      if (result.span && result.span !== spanLabel) return;
      setReading(result.reading);
    });
    return () => {
      live = false;
    };
  }, [span, spanLabel, subjectId, subjectName, username]);

  const askForReading = useCallback(async () => {
    if (!subject) return;
    setThinking(true);
    setReadError('');

    const result = await readSubject({
      subject: subject.name,
      span: WINDOWS.find((option) => option.key === span)?.label ?? '',
      aim: ambition?.aim ?? '',
      level: ambition?.level ?? '',
      overall: state.overall,
      finished: state.finished,
      finished_before: state.finishedBefore,
      rated: state.ratedCount,
      active_days: state.activeDays,
      dimensions: state.dimensions.map((entry) => ({
        label: entry.label,
        value: entry.value,
        meaning: entry.meaning,
        evidence: entry.evidence,
      })),
      curve: {
        rungs: state.curve.rungs.map((rung) => ({
          level: rung.level,
          label: rung.label,
          done: rung.done,
          execution: rung.execution,
          quality: rung.quality,
          cleared: rung.cleared,
          minutes: rung.minutes,
        })),
        best: state.curve.best,
        threshold: state.curve.threshold,
        drop: state.curve.drop,
      },
      time: { ...state.time },
      momentum: { ...state.momentum },
      mistakes: state.mistakes.map((entry) => ({
        label: entry.label,
        count: entry.count,
        share: entry.share,
      })),
      /* Worked out here rather than by the model, because it is arithmetic and
         arithmetic is the half of this page that is checkable. What goes over
         the wire is conclusions rather than more figures — which measure is
         carrying the shortfall, whether what goes wrong is about knowing the
         work or about the sitting, where the difficulty filed and the result
         disagree, and whether capability is running ahead of the score. A
         model handed only the raw table restates it; handed these it has to
         reason from them. See components/Subject/performance. */
      performance: perf as unknown as Record<string, unknown>,
      goals: model.goals.map((goal) => ({
        title: goal.title,
        progress: Math.round(goal.progress),
        deadline: goal.deadline,
        standing:
          goal.drift === null
            ? 'no projection'
            : goal.drift > 0
              ? `projected ${goal.drift} days late`
              : 'projected on time or early',
        levers: goal.levers.map((lever) => `${lever.title} — ${lever.fact}`),
      })),
      /* The curriculum's own words, and nothing more. These are the authored
         tree's area names — identical on every account, carrying no
         measurement of this reader — so the model has a vocabulary to
         recommend in without having to invent one. The prompt is explicit
         that naming an area is allowed and claiming a level in it is not. */
      vocabulary: lattice
        ? [lattice.title, ...lattice.branches.map((branch) => branch.title)]
        : [],
    });

    setThinking(false);
    if (result.success) setReading(result.reading);
    else setReadError(result.message || 'Could not read this subject.');
  }, [ambition, lattice, model.goals, span, state, subject]);

  /** Record a step as acted on, however it was acted on. */
  const record = useCallback(async (step: NextStep, taskId = '') => {
    setStepBusy(step.id);
    const result = await takeRecommendation(step.id, taskId);
    setStepBusy('');
    if (!result.success) return;
    setTaken((was) => new Set(was).add(step.id));
    /* Kept in step locally rather than refetched: the outcome figure cannot
       have moved — no execution has been recorded between the click and now —
       and a request that can only return what is already on screen is a
       request not worth making. */
    setOutcomes((was) =>
      was.some((entry) => entry.type === step.type)
        ? was.map((entry) =>
            entry.type === step.type ? { ...entry, taken: entry.taken + 1 } : entry,
          )
        : [...was, { type: step.type, given: 1, taken: 1, change: null }],
    );
  }, []);

  /**
   * Turn a step into a real task.
   *
   * A real one, in the ordinary system, filed under this subject — not a note
   * to self. That is what closes the loop: finishing an ordinary task raises
   * the rating prompt, the rating is what the dimensions above are made of,
   * and the next reading is therefore argued from evidence this one produced.
   * A recommendation that lives only on this page generates no data and can
   * never be checked.
   */
  const makeTask = useCallback(
    async (step: NextStep) => {
      setStepBusy(step.id);
      const made = await createTask({
        name: step.title,
        subject: subjectId,
        priority: step.difficulty >= 4 ? 'high' : 'medium',
      });
      setStepBusy('');
      if (!made.success) {
        setReadError('Could not add that task. Try again.');
        return;
      }
      await record(step, made.task_id);
      // The record the page is drawn from has changed, so it is re-read
      // rather than patched: the new task is open rather than finished, and
      // guessing at how it lands in a dozen figures is how a page starts
      // disagreeing with its own database.
      tasks.reload();
    },
    [record, subjectId, tasks],
  );

  /* The volume chart's own ceiling. A floor of 1 keeps a window with a single
     quiet period from producing a "0" top tick over a line that is not flat. */
  const seriesPeak = Math.max(...model.series.done, 1);

  useDocumentTitle(subject ? subject.name : 'Subject');

  /* The catalogue is cached module-wide and read by a dozen components, so on
     every navigation after the first it is already here. On the first it is
     empty for a tick — and an empty catalogue is indistinguishable from one
     that does not hold this id, so the "no such subject" message has to wait
     for it or it would flash on a perfectly good link. */
  const naming = catalogue.size === 0;

  /* Which band this subject is standing in, named once.
   *
   * It was written inline on the standing card and is now read twice, because
   * the sky over the page is the same verdict as the ring under it. That is
   * the point of putting it there: a reader arriving from the rail knows how
   * this subject is going before they have read a word, and two pages for two
   * subjects do not look like the same page with the noun changed.
   *
   * The thresholds are the standing card's own and stay here rather than in
   * components/Subject/state, because they are a statement about colour rather
   * than about the account — nothing below reads them. */
  const band =
    state.overall === null
      ? 'none'
      : state.overall >= 80
        ? 'high'
        : state.overall >= 65
          ? 'good'
          : state.overall >= 50
            ? 'fair'
            : 'low';

  /** The four gradings as skies, and the plain one for a subject with no verdict yet. */
  const BAND_TONE: Record<typeof band, HeroTone> = {
    high: 'green',
    good: 'blue',
    fair: 'amber',
    low: 'rose',
    none: 'violet',
  };

  return (
    /* `sb-page` alongside `ax-page`: this page is a guest in the analytics
       palette and reads its tokens, but its own spacing scale has to hang off
       a class this stylesheet owns. A bare `.ax-page` rule in subject.css is
       two sheets writing one class, and whichever Vite loads second wins —
       scripts/check_css.mjs fails the build for exactly that. */
    <div className="ax-page sb-page">
      <Ambient />
      <div className="ax-shell page-shell">
        {/* The range is seeded on the subject's own id, so every subject page
            is a different place — which is the one thing a page whose whole
            layout is identical across a dozen subjects could not otherwise
            say. The sky is the standing band; see `band` above. */}
        <PageHero variant={`subject-${subjectId}`} tone={BAND_TONE[band]}>
          <header className="ax-head">
            <div>
              <span className="peak-eyebrow">Subject</span>
              <h1>{subject ? subject.name : 'Subject'}</h1>
              <p className="ax-muted ax-head-purpose">
                {subject
                  ? 'How this one is going, and what to do about it.'
                  : 'This page is about one subject at a time.'}
              </p>
            </div>
            <div className="ax-head-actions">
              {/* On every state including the error. A reader who followed a dead
                  link should land somewhere useful in one click. */}
              <Link className="ax-btn" to="/analytics">
                Overall analytics
              </Link>
            </div>
          </header>
        </PageHero>

        {naming || tasks.loading ? (
          <Loading label="Reading your record" />
        ) : !subject ? (
          <p className="ax-opening is-flat">
            No subject with that id is in your catalogue. It may have been deleted since you
            picked it. You can pick the subjects you follow again in{' '}
            <Link className="ax-link" to="/analytics?setup">the analytics setup</Link>.
          </p>
        ) : !tasks.data ? (
          <ErrorState message={tasks.error ?? 'Could not read your tasks.'} onRetry={tasks.reload} />
        ) : !model.any ? (
          <p className="ax-opening is-flat">
            Nothing is filed under {subject.name} yet. File a few tasks here and this page
            will have something to measure.
          </p>
        ) : (
          <>
            <div className="ax-controls">
              <div className="ax-chips" role="group" aria-label="Time window">
                {WINDOWS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`ax-chip${option.key === span ? ' is-on' : ''}`}
                    aria-pressed={option.key === span}
                    onClick={() => setSpan(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ---- WHAT ARE YOU TRYING TO ACCOMPLISH ------------------- */}
            {/* First, and at the size of a heading, because everything under
                it is an answer to it. The page used to open on four figures of
                equal weight — quality, execution, consistency, momentum — all
                counted, all true, and none of them a statement about what the
                reader came here to do. A dashboard leaves the interpreting to
                the reader, and interpreting is the part they wanted.

                The figures have not gone anywhere. They are the evidence under
                the cards below and the panels further down. What changed is
                that they stopped being the protagonist. */}
            <ObjectiveBand subject={subject.name} objective={objective} />

            {/* ---- WHAT EVIDENCE MATTERS FOR THAT --------------------- */}
            {/* Three at most, each a claim with its counted figures beneath.
                The model's when there is a reading, because choosing which of
                thirty figures bears on qualifying for a particular competition
                needs to know what that competition is; the app's own rules
                otherwise, which is always. */}
            <WhatMatters cards={evidenceCards} />

            {/* ---- WHAT IS THE BOTTLENECK ----------------------------- */}
            {/* The page's only outright judgement, and the section the two
                above it exist to support. One, never two: a page with two
                bottlenecks on it has none.

                It sits above Do This Next rather than beside it because the
                steps are an answer to it — a reader who disagrees with the
                naming should disagree before reading the prescription, not
                after acting on it. */}
            <BottleneckPanel bottleneck={bottleneck} />

            {/* ---- WHAT SHOULD I DO NEXT ------------------------------- */}
            {/* The section the rest of the page exists to produce, and it is
                now fourth on the page rather than below two screens of
                figures.

                That move is the point of the restructure. The old order asked
                the reader to read a dashboard, infer a problem from it, and
                then find the advice — which is three jobs, two of which the
                page is better at than they are. Goal, then what bears on it,
                then the one thing in the way, then what to do about it. The
                figures did not go anywhere; they are the working, and the
                working goes under the answer.

                Two halves, and the order is the argument. The app's own ranked
                advice is first and is pure arithmetic — it is always there,
                costs nothing, and is what the page says when nobody presses
                anything. The model's steps are second, and they are the ones
                that can name what a task at this difficulty in this subject
                should actually contain, which no table here knows.

                Which half is which is stated rather than left to be inferred:
                a reader has to know what is counted before deciding what to
                act on. */}
            <section className="ax-panel sb-panel" aria-label="What to do next">
              <div className="ax-panel-head">
                <div className="ax-panel-title">
                  <h2>Do this next</h2>
                </div>
              </div>

              {model.advice.length > 0 && (
                <>
                  <p className="ax-panel-note">
                    Ranked by what it is worth, with the figure behind each one. All from
                    your own tasks.
                  </p>
                  <ol className="sb-advice">
                    {model.advice.map((item, at) => (
                      <li key={item.id} className={`sb-advice-item is-${item.weight}`}>
                        <span className="sb-advice-rank" aria-hidden="true">
                          {at + 1}
                        </span>
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.detail}</p>
                          <p className="sb-advice-why">
                            <span>Why:</span> {item.why}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </>
              )}

              {canRead && (
                <div className="sb-draft">
                  <div className="sx-ask">
                    <div>
                      <strong>Plan the next sessions</strong>
                      <p>Written by a model from the figures above. It adds no numbers of its own.</p>
                    </div>
                    <button
                      type="button"
                      className="ax-btn"
                      onClick={() => void askForReading()}
                      disabled={thinking}
                    >
                      {thinking ? 'Reading…' : reading ? 'Read it again' : 'Plan my next sessions'}
                    </button>
                  </div>

                  {readError && (
                    <p className="sx-ask-err" role="alert">
                      {readError}
                    </p>
                  )}

                  {reading && (
                    <div className="sb-draft-body">
                      <NextSteps
                        steps={reading.next_steps}
                        outcomes={outcomes}
                        taken={taken}
                        busy={stepBusy}
                        onMakeTask={(step) => void makeTask(step)}
                        onDidIt={(step) => void record(step)}
                      />
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* ---- The reading behind those steps ---------------------- */}
            {reading &&
              (reading.diagnosis.length > 0 ||
                reading.priorities.length > 0 ||
                reading.insights.length > 0) && (
                <Panel
                  title="What the record says"
                  note="Written by a model from the figures above. Each finding shows what it rests on."
                >
                  <Reading
                    diagnosis={reading.diagnosis}
                    priorities={reading.priorities}
                    insights={reading.insights}
                  />
                </Panel>
              )}

            {/* ---- WHERE AM I ----------------------------------------- */}
            {/* The page answers three questions in order — where am I, why am
                I there, what should I do next — and this is the first, in one
                card, before anything is scrolled. The ring is the mean of
                every measured dimension; the sentence under it is the model's
                own verdict from ./model. Everything below is the working.

                It borrows the Timer's surfaces on purpose: two radial washes,
                a stroked ring, badges. Those are the two pages somebody sits
                in front of rather than passes through. See styles/subject-state.css. */}
            <section
              className="sx-hero"
              aria-label="Where this subject stands"
              data-band={band}
            >
              {/* The letter is derived from the figure the ring draws, not
                  from ./model's own score. Two composites on one card — a 59
                  with an F beside it — is the page disagreeing with itself in
                  the one place a reader looks first. */}
              <Ring
                value={state.overall}
                size={168}
                label={state.overall === null ? 'unrated' : gradeFor(state.overall)}
                sub={`${state.finished} finished`}
              />

              <div className="sx-hero-say">
                <p className="sx-hero-verdict">{model.headline.verdict}</p>

                <div className="sx-hero-badges">
                  {state.momentum.known && (
                    <span className={`sx-badge is-${state.momentum.direction}`}>
                      {state.momentum.direction === 'climbing'
                        ? '↑'
                        : state.momentum.direction === 'slipping'
                          ? '↓'
                          : '→'}{' '}
                      {(state.momentum.change ?? 0) > 0 ? '+' : ''}
                      {state.momentum.change} pts across this window
                    </span>
                  )}
                  {state.curve.threshold && (
                    <span className="sx-badge">
                      Falls off at {state.curve.threshold.label}
                    </span>
                  )}
                  {model.goals[0] && (
                    <span className="sx-badge is-goal">
                      Chasing {model.goals[0].title}
                    </span>
                  )}
                  {state.time.hours > 0 && (
                    <span className="sx-badge">{state.time.hours}h logged</span>
                  )}
                </div>

                {/* What the reader said this is all for. Quieter than the
                    verdict, because it is their sentence rather than a
                    reading of their record. */}
                {ambition?.aim && (
                  <p className="sb-topline-aim">
                    <span>Chasing</span> {ambition.aim}
                    {ambition.level && <em> · at {ambition.level} now</em>}
                  </p>
                )}
              </div>
            </section>

            {/* The seven, kept separate on purpose. A single blended score
                cannot tell "reaching past what you can land" from "coasting
                below what you could" — see the note in Subject/Dimensions. */}
            <Dimensions dimensions={state.dimensions} />

            {/* ---- The path, under the verdict --------------------- */}
            {/* On top, because "how am I doing" and "at what" are one question
                and the page was answering only the first for two screens. It
                is a strip rather than a panel: the reader is oriented by it on
                the way past, and the tree itself is one click away. */}
            {lattice && (
              <div className="sb-path">
                <nav className="sb-path-crumbs" aria-label="Where this subject sits">
                  {lattice.path.map((step, at) => (
                    <span key={step.id}>
                      {at > 0 && <i aria-hidden="true">›</i>}
                      <b className={at === lattice.path.length - 1 ? 'is-here' : undefined}>
                        {step.title}
                      </b>
                    </span>
                  ))}
                </nav>
                {/* One figure, and it is the reader's. The strip used to
                    carry four — skills, core, branches, practised — three of
                    which are the curriculum's size and belong in the tree
                    panel at the foot of the page, where they now are. A strip
                    read on the way past has room for the answer, not for the
                    working. */}
                {standing && (
                  <p className="sb-path-facts">
                    <span className="is-yours">
                      <strong>{standing.percent}%</strong> of this tree
                    </span>
                  </p>
                )}
                <Link className="sb-path-open" to="/skill-trees">
                  Open the tree →
                </Link>
              </div>
            )}

            {/* ---- WHY AM I THERE: the curve --------------------------- */}
            {/* Before the recommendations, because it is what most of them
                are argued from. An average over five difficulty levels is the
                same number for somebody uniformly middling and somebody who
                is excellent until they are not — and those two want opposite
                instructions. See components/Subject/Curve. */}
            {state.curve.rungs.some((rung) => rung.done > 0) && (
              <Panel
                title="Where it starts to go"
                note="Execution at each difficulty, and the level it falls off at."
              >
                <Curve curve={state.curve} />
              </Panel>
            )}

            {/* ---- The shape of it ---------------------------------- */}
            {/* Two charts, not two lines on one axis. Tasks finished runs 0 to
                about ten and quality runs 0 to 100 — sharing a scale squashed
                the volume line flat along the floor and left the y-axis
                labelled with the volume's peak while the axis was really the
                quality's. A chart whose ticks do not describe its own line is
                worse than no chart. */}
            {model.series.any && (
              <Panel
                title="Over this window"
                note="Tasks finished, and the quality you rated them at."
              >
                {/* Side by side rather than stacked. They are the same
                    periods on the same dates, so the interesting reading is
                    across them — did the month the volume climbed cost
                    anything in quality — and that reading was two screens
                    apart when one sat under the other. Stacking also spent
                    three hundred vertical pixels on two charts that are mostly
                    air. They wrap to one column under `sb-charts`. */}
                <div className="sb-charts">
                  <div>
                    <h3 className="sb-sub">Tasks finished</h3>
                    <AreaChart
                      id={`sb-done-${subjectId}`}
                      label={`Tasks finished in ${subject.name} over ${
                        WINDOWS.find((option) => option.key === span)?.label ?? 'the window'
                      }`}
                      height={150}
                      series={[{ values: model.series.done, tone: 'violet' }]}
                      ticks={[String(seriesPeak), String(Math.round(seriesPeak / 2)), '0']}
                      marks={model.series.marks}
                      readout={{
                        labels: model.series.labels,
                        names: ['Finished'],
                        format: (value) => `${Math.round(value)} tasks`,
                      }}
                    />
                  </div>

                  {model.series.quality.some((value) => value !== null) && (
                    <div>
                      <h3 className="sb-sub">Quality</h3>
                      <AreaChart
                        id={`sb-quality-${subjectId}`}
                        label={`Quality rated in ${subject.name} over the same periods`}
                        height={150}
                        /* Nulls are real and stay null: a period with nothing
                           rated has no quality, and the chart breaks its line
                           there rather than drawing a zero nobody recorded. */
                        series={[{ values: model.series.quality, tone: 'blue' }]}
                        /* The real ceiling, so a run that never passes 60% is
                           not stretched to fill the box and read as excellent. */
                        max={100}
                        ticks={['100', '50', '0']}
                        marks={model.series.marks}
                        readout={{
                          labels: model.series.labels,
                          names: ['Quality'],
                          format: (value) => `${Math.round(value)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              </Panel>
            )}

            {/* ---- Everything else: the working -------------------- */}
            <h2 className="sb-detail-head">The detail</h2>

            {/* The grade is not a tile. It was, and it was the third place on
                one screen the same letter appeared — the verdict states it at
                the top, and the panel below breaks it into the four rates the
                tile was listing in prose. A tile that repeats what is already
                on screen is a tile that costs a column and says nothing. */}
            <div className="sb-tiles">
              <div className="sb-tile">
                <span className="sb-tile-label">Finished</span>
                <strong className="sb-tile-value">{model.finished}</strong>
                <span className="sb-tile-note">
                  against {model.finishedBefore} the window before
                </span>
              </div>
              <div className="sb-tile">
                <span className="sb-tile-label">Time on it</span>
                <strong className="sb-tile-value">
                  {model.invested > 0 ? format.duration(model.invested) : '—'}
                </strong>
                <span className="sb-tile-note">
                  {model.invested > 0
                    ? 'logged against the tasks you finished'
                    : 'no time logged against these tasks'}
                </span>
              </div>
              <div className="sb-tile">
                <span className="sb-tile-label">Streak</span>
                <strong className="sb-tile-value">{model.streak}</strong>
                <span className="sb-tile-note">
                  {model.streak === 1 ? 'day running' : 'days running'} in this subject
                </span>
              </div>
            </div>

            {model.insight && <p className="ax-opening is-down sb-insight">{model.insight}</p>}

            {/* ---- Time, and whether it bought anything ---------------- */}
            {/* The rule this panel exists for: fast is not good. Thirty
                minutes of work finished in eighteen and rated poorly is a task
                that was abandoned, not an efficient one — so the figure is a
                composite of speed and how it was rated, and the two cases it
                exists to separate are counted out beneath it.

                "Usual" is the account's own median at that difficulty, because
                Summit never asks for an estimate. See `timeAnalysis` in
                components/Subject/state for why that is the better baseline
                anyway. */}
            {state.time.known && (
              <Panel
                title="What the time bought"
                note="Against your own usual pace at each difficulty. Summit never asks you for an estimate."
              >
                <ul className="sb-rows">
                  <li className="sb-row">
                    <span className="sb-row-name">Usual task</span>
                    <strong>{state.time.typical} min</strong>
                    <span className="sb-row-note">median across this window</span>
                  </li>
                  <li className="sb-row">
                    <span className="sb-row-name">Against that</span>
                    <strong>
                      {state.time.drift === null
                        ? '—'
                        : state.time.drift < 0
                          ? `${Math.abs(state.time.drift)} min under`
                          : `${state.time.drift} min over`}
                    </strong>
                    <span className="sb-row-note">
                      {state.time.quicker}% of tasks came in quicker than usual
                    </span>
                  </li>
                  <li className="sb-row">
                    <span className="sb-row-name">Finished fast, rated poorly</span>
                    <strong>{state.time.rushed}</strong>
                    <span className="sb-row-note">
                      {state.time.rushed === 0
                        ? 'none, so speed here is not costing quality'
                        : 'quick, but rated badly for it'}
                    </span>
                  </li>
                  <li className="sb-row">
                    <span className="sb-row-name">Took longer, landed it</span>
                    <strong>{state.time.thorough}</strong>
                    <span className="sb-row-note">the extra time paid off</span>
                  </li>
                </ul>
              </Panel>
            )}

            {/* ---- Standings ------------------------------------------- */}
            {/* Not awards. Every one is a threshold over the same counted
                evidence the figures above are made of, recomputed each time
                rather than stored — which is what stops a badge from
                disagreeing with the record it claims to describe. An unreached
                one shows its distance, because a target with a number on it is
                worth more than a greyed-out box. */}
            <Panel
              title="Standings"
              note="Counted from the same record as everything else, and worked out again every visit."
            >
              <ul className="sx-standings">
                {state.standings.map((entry) => (
                  <li
                    key={entry.id}
                    className={`sx-standing${entry.reached ? ' is-reached' : ''}`}
                  >
                    <div className="sx-standing-head">
                      <strong>{entry.title}</strong>
                      <span className="sx-standing-at">
                        {entry.reached ? 'reached' : entry.at}
                      </span>
                    </div>
                    <p>{entry.detail}</p>
                    <span className="sx-standing-bar" aria-hidden="true">
                      <span style={{ width: `${entry.progress}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>


            {/* ---- What this subject is for ------------------------- */}
            {/* The goal, and the record read against it.
                
                This panel used to be a list of bars. A bar answers "how far
                along", which is the one question about a goal that cannot be
                acted on — 40% is fine with 60% of the time left and a disaster
                with a week to go, and either way it does not say what to do on
                Tuesday. So each goal now carries three things a bar cannot: the
                calendar's own position on the same track, the figures this
                subject has actually put into it, and the levers — what would
                have to change, hardest constraint first, each with the count
                behind it. The arithmetic is `goalsFor` and `leversFor` in
                components/Subject/model. */}
            {model.goals.length > 0 && (
              <Panel
                title="What this subject is for"
                note="Each goal that names this subject, and what your record here says about reaching it."
              >
                <ul className="sb-goals">
                  {model.goals.map((goal) => (
                    <li key={goal.id} className="sb-goal">
                      <div className="sb-goal-head">
                        <strong>{goal.title}</strong>
                        <span
                          className={`sb-goal-state ${
                            goal.drift === null ? 'is-flat' : goal.drift > 0 ? 'is-late' : 'is-early'
                          }`}
                        >
                          {goal.drift === null
                            ? 'no projection yet'
                            : goal.drift > 0
                              ? `${goal.drift} ${goal.drift === 1 ? 'day' : 'days'} late`
                              : goal.drift < 0
                                ? `${Math.abs(goal.drift)} ${Math.abs(goal.drift) === 1 ? 'day' : 'days'} early`
                                : 'on the day'}
                        </span>
                      </div>

                      {/* The bar, with where the calendar has got to marked on
                          it. One track rather than two bars: the whole reading
                          is the distance between the fill and the mark, and
                          that reading does not survive being split across two
                          rows the eye has to measure between. */}
                      <span
                        className="sb-goal-track"
                        role="img"
                        aria-label={
                          goal.expected === null
                            ? `${Math.round(goal.progress)}% done`
                            : `${Math.round(goal.progress)}% done, ${Math.round(goal.expected)}% `
                              + 'of its time gone'
                        }
                      >
                        <span
                          className="sb-goal-track-fill"
                          style={{ width: `${clampPct(goal.progress)}%` }}
                        />
                        {goal.expected !== null && (
                          <span
                            className="sb-goal-track-mark"
                            style={{ left: `${clampPct(goal.expected)}%` }}
                          />
                        )}
                      </span>

                      <p className="sb-goal-meta">
                        {Math.round(goal.progress)}% done
                        {goal.expected !== null && (
                          <> · the calendar is at {Math.round(goal.expected)}%</>
                        )}
                        {goal.deadline && <> · due {goal.deadline}</>}
                      </p>

                      {/* The counted figures, and only the ones that exist.
                          A row of dashes is how a reader learns to stop
                          reading a panel. */}
                      <dl className="sb-plan">
                        {planFacts(goal).map((fact) => (
                          <div key={fact.label} className="sb-plan-fact">
                            <dt>{fact.label}</dt>
                            <dd>{fact.value}</dd>
                          </div>
                        ))}
                      </dl>

                      <ul className="sb-levers">
                        {goal.levers.map((lever) => (
                          <li key={lever.id} className={`sb-lever is-${lever.weight}`}>
                            <strong>{lever.title}</strong>
                            <p>{lever.fact}</p>
                          </li>
                        ))}
                      </ul>

                      {/* ---- The route, written by a model --------------- */}
                      {/* Everything above this line is counted. This is not,
                          and the divider and the note say so before the
                          button is pressed rather than after — a reader has
                          to know which half of a panel is arithmetic and
                          which half is prose before they decide what to act
                          on. Same bargain as the write-up at the foot of the
                          page. */}
                      {canWrite && (
                        <div className="sb-route">
                          <div className="sb-route-head">
                            <div>
                              <strong>Plan the route to this</strong>
                              <p>
                                A model reads the figures above and lays out the stages between
                                now and the date. It works from those numbers and no others.
                              </p>
                            </div>
                            <button
                              type="button"
                              className="ax-btn"
                              onClick={() => void planFor(goal)}
                              disabled={planning === goal.id}
                            >
                              {planning === goal.id
                                ? 'Planning…'
                                : plans[goal.id]
                                  ? 'Plan it again'
                                  : 'Plan the route'}
                            </button>
                          </div>

                          {planError[goal.id] && (
                            <p className="sb-brief-error" role="alert">
                              {planError[goal.id]}
                            </p>
                          )}

                          {plans[goal.id] && (
                            <div className="sb-route-body">
                              {plans[goal.id]!.route && (
                                <p className="sb-route-read">{plans[goal.id]!.route}</p>
                              )}

                              {plans[goal.id]!.phases.length > 0 && (
                                <ol className="sb-phases">
                                  {plans[goal.id]!.phases.map((phase) => (
                                    <li key={phase.title} className="sb-phase">
                                      <div className="sb-phase-head">
                                        <strong>{phase.title}</strong>
                                        {/* Labelled as the model's, because it
                                            is the one number here it supplied
                                            rather than one the app counted. */}
                                        <span className="sb-phase-weeks">
                                          ~{phase.weeks} {phase.weeks === 1 ? 'week' : 'weeks'}
                                        </span>
                                      </div>
                                      {phase.outcome && (
                                        <p className="sb-phase-out">{phase.outcome}</p>
                                      )}
                                      {phase.focus.length > 0 && (
                                        <ul className="sb-phase-focus">
                                          {phase.focus.map((item) => (
                                            <li key={item}>{item}</li>
                                          ))}
                                        </ul>
                                      )}
                                    </li>
                                  ))}
                                </ol>
                              )}

                              {plans[goal.id]!.week.length > 0 && (
                                <div className="sb-route-week">
                                  <h4>This week</h4>
                                  <ul>
                                    {plans[goal.id]!.week.map((item) => (
                                      <li key={item}>{item}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="ax-panel-note ax-panel-note-foot">
                  {/* The line said "every figure here is counted" before the
                      route was added, and stopped being true the moment it
                      was. The join is what the reader needs, and it is the
                      whole reason the route sits behind a dashed rule. */}
                  The figures are counted from your own tasks in this subject. Anything under a
                  "Plan the route" heading was written by a model from those same figures.{' '}
                  <Link className="ax-link" to="/goals">Your goals</Link>
                </p>
              </Panel>
            )}

            <div className="sb-grid">
              {/* ---- Progress ----------------------------------------- */}
              <Panel
                title="Your progress"
                note="Against the window immediately before, same length."
              >
                <ul className="sb-rows">
                  {model.growth.map((entry) => (
                    <li key={entry.key} className="sb-row">
                      <span className="sb-row-name">{entry.label}</span>
                      <Delta value={entry.change} />
                      <span className="sb-row-note">{entry.note}</span>
                    </li>
                  ))}
                </ul>
              </Panel>

              {/* ---- The four rates ----------------------------------- */}
              <Panel
                title="What the score is made of"
                note="Four rates. The letter above is their mean."
              >
                <ul className="sb-rows">
                  {model.rates.map((entry) => (
                    <li key={entry.key} className="sb-row sb-row-rate">
                      <span className="sb-row-name">{entry.label}</span>
                      {entry.known ? (
                        <>
                          <strong className="sb-row-value">{Math.round(entry.now)}%</strong>
                          <Bar percent={entry.now} />
                          <Delta value={entry.delta} unit="pts" />
                        </>
                      ) : (
                        <span className="sb-row-value is-none">not measurable yet</span>
                      )}
                      <span className="sb-row-note">{entry.note}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>

            {/* ---- The difficulty bands ------------------------------- */}
            {model.bands.some((band) => band.done > 0) && (
              <Panel
                title="How you do at each difficulty"
                note="Difficulty bands. A star is the finest thing your tasks record."
              >
                <div className="sb-table-wrap">
                  <table className="sb-table">
                    <thead>
                      <tr>
                        <th scope="col">Difficulty</th>
                        <th scope="col">Finished</th>
                        <th scope="col">How it went</th>
                        <th scope="col">vs before</th>
                        <th scope="col">Typical time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.bands
                        .filter((band) => band.done > 0)
                        .map((band) => (
                          <tr
                            key={band.level}
                            className={band.level === model.weakest?.level ? 'is-weak' : undefined}
                          >
                            <th scope="row">{band.label}</th>
                            <td>{band.done}</td>
                            <td>
                              {band.holding === null ? (
                                <span className="is-none">not rated</span>
                              ) : (
                                <span className="sb-cell-bar">
                                  <strong>{Math.round(band.holding)}%</strong>
                                  <Bar percent={band.holding} />
                                </span>
                              )}
                            </td>
                            <td>
                              <Delta value={band.delta} unit="pts" />
                            </td>
                            <td>
                              {band.seconds === null ? (
                                <span className="is-none">—</span>
                              ) : (
                                <>
                                  {format.duration(Math.round(band.seconds))}
                                  {band.secondsDelta !== null && band.secondsDelta !== 0 && (
                                    <em className="sb-cell-aside">
                                      {band.secondsDelta < 0 ? '↓' : '↑'}{' '}
                                      {format.duration(Math.abs(band.secondsDelta))}
                                    </em>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {model.weakest && model.strongest && model.weakest.level !== model.strongest.level && (
                  <p className="ax-panel-note ax-panel-note-foot">
                    <strong>Weakest:</strong> {model.weakest.label.toLowerCase()} at{' '}
                    {Math.round(model.weakest.holding!)}%. <strong>Strongest:</strong>{' '}
                    {model.strongest.label.toLowerCase()} at {Math.round(model.strongest.holding!)}%.
                  </p>
                )}
              </Panel>
            )}

            <div className="sb-grid">
              {/* ---- What drives it --------------------------------- */}
              {(model.struggles.length > 0 || model.wentWell.length > 0) && (
                <Panel
                  title="What makes it go badly, and well"
                  note="From the reason you gave when you rated each task."
                >
                  {model.struggles.length > 0 && (
                    <>
                      <h3 className="sb-sub">When it went badly</h3>
                      <ul className="sb-rows">
                        {model.struggles.map((driver) => (
                          <li key={driver.key} className="sb-row sb-row-rate">
                            <span className="sb-row-name">{driver.label}</span>
                            <strong className="sb-row-value">{driver.share}%</strong>
                            <Bar percent={driver.share} />
                            <span className="sb-row-note">
                              {driver.count} {driver.count === 1 ? 'task' : 'tasks'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {model.wentWell.length > 0 && (
                    <>
                      <h3 className="sb-sub">When it went well</h3>
                      <ul className="sb-rows">
                        {model.wentWell.map((driver) => (
                          <li key={driver.key} className="sb-row sb-row-rate">
                            <span className="sb-row-name">{driver.label}</span>
                            <strong className="sb-row-value">{driver.share}%</strong>
                            <Bar percent={driver.share} />
                            <span className="sb-row-note">
                              {driver.count} {driver.count === 1 ? 'task' : 'tasks'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </Panel>
              )}

              {/* ---- The run --------------------------------------- */}
              {model.run.readings.length > 0 && (
                <Panel
                  title="Your last few sessions"
                  note="Difficulty × execution on each rated task, oldest first."
                >
                  <ol className="sb-run">
                    {model.run.readings.map((reading) => (
                      <li key={reading.id}>
                        <span
                          className={`sb-run-dot ${
                            reading.percent >= 80
                              ? 'is-good'
                              : reading.percent >= 60
                                ? 'is-mid'
                                : 'is-poor'
                          }`}
                          aria-hidden="true"
                        />
                        <span className="sb-run-value">{reading.percent}%</span>
                        <span className="sb-run-day">{reading.on.slice(5)}</span>
                      </li>
                    ))}
                  </ol>
                  {model.run.trend !== null && (
                    <p className="ax-panel-note ax-panel-note-foot">
                      <strong>Trend:</strong>{' '}
                      {model.run.trend > 0
                        ? `improving. The later half of this run averages ${model.run.trend} points above the earlier half.`
                        : model.run.trend < 0
                          ? `slipping. The later half averages ${Math.abs(model.run.trend)} points below the earlier half.`
                          : 'flat. Both halves of this run average the same.'}
                    </p>
                  )}
                </Panel>
              )}
            </div>

            {/* ---- Checkpoints, and the goal they become ----------- */}
            <Panel
              title="Checkpoints for this subject"
              note="The stages, in the order you mean to reach them. No target or date needed."
            >
              <ul className="sb-miles">
                {milestones.map((entry, at) => (
                  <li key={entry.id} className={entry.done ? 'is-done' : undefined}>
                    <label>
                      <input
                        type="checkbox"
                        checked={entry.done}
                        onChange={() =>
                          putMilestones(
                            milestones.map((row, index) =>
                              index === at ? { ...row, done: !row.done } : row,
                            ),
                          )
                        }
                      />
                      <span>{entry.title}</span>
                    </label>
                    <button
                      type="button"
                      className="sb-miles-drop"
                      aria-label={`Remove ${entry.title}`}
                      onClick={() => putMilestones(milestones.filter((_, i) => i !== at))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>

              <form
                className="sb-miles-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  const title = adding.trim();
                  if (!title) return;
                  putMilestones([
                    ...milestones,
                    { id: `m${Date.now()}`, title, done: false },
                  ]);
                  setAdding('');
                }}
              >
                <input
                  value={adding}
                  onChange={(event) => setAdding(event.target.value)}
                  placeholder="A stage you mean to reach"
                  aria-label="New checkpoint"
                  maxLength={120}
                />
                <button type="submit" className="ax-btn" disabled={!adding.trim()}>
                  Add
                </button>
              </form>

              {canWrite && (
                <div className="sb-draft">
                  <div className="sb-draft-head">
                    <div>
                      <strong>Turn these into a goal</strong>
                      <p>
                        A model reads your checkpoints and your work here, and drafts a goal
                        over them: a title, a target and a horizon. Nothing is saved until you
                        say so.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ax-btn"
                      onClick={() => void askForGoal()}
                      disabled={drafting}
                    >
                      {drafting ? 'Drafting…' : draft ? 'Draft another' : 'Draft a goal'}
                    </button>
                  </div>

                  {draftError && (
                    <p className="sb-brief-error" role="alert">
                      {draftError}
                    </p>
                  )}

                  {created && (
                    <p className="sb-draft-made" role="status">
                      Kept. This subject is aimed at it now, and its stages are in the list
                      above. Nothing was added to your goals page.
                    </p>
                  )}

                  {draft && (
                    <div className="sb-draft-body">
                      <strong className="sb-draft-title">{draft.title}</strong>
                      <p className="sb-draft-why">{draft.why}</p>
                      <p className="sb-draft-terms">
                        <span>
                          <b>{draft.target}</b> {draft.unit}
                        </span>
                        <span>
                          over <b>{draft.weeks}</b> {draft.weeks === 1 ? 'week' : 'weeks'}
                        </span>
                      </p>
                      {draft.milestones.length > 0 && (
                        <ol className="sb-draft-miles">
                          {draft.milestones.map((title) => (
                            <li key={title}>{title}</li>
                          ))}
                        </ol>
                      )}
                      <div className="sb-tree-actions">
                        <button type="button" className="ax-btn ax-btn-primary" onClick={() => void keepDraft()}>
                          Keep this as what I am chasing
                        </button>
                        <button type="button" className="ax-btn ax-btn-quiet" onClick={() => setDraft(null)}>
                          Discard
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Panel>

            {/* ---- The write-up ------------------------------------ */}
            {canWrite && (
              <section className="ax-panel sb-panel sb-brief">
                <div className="ax-panel-head">
                  <div className="ax-panel-title">
                    <h2>Read this back to me</h2>
                  </div>
                  <button
                    type="button"
                    className="ax-btn"
                    onClick={() => void write()}
                    disabled={writing}
                  >
                    {writing ? 'Writing…' : brief ? 'Write it again' : 'Write it up'}
                  </button>
                </div>
                <p className="ax-panel-note">
                  {/* Said before the button is pressed, not after. A reader
                      has to know which half of this page is counted and which
                      half is written before they decide what to trust. */}
                  Everything above is counted from your own tasks. This panel is written by a
                  model from those same figures, and it adds no numbers of its own, so it can
                  say what they mean but nothing they do not. It costs an API call and is not
                  saved.
                </p>

                {briefError && (
                  <p className="sb-brief-error" role="alert">
                    {briefError}
                  </p>
                )}

                {brief && (
                  <div className="sb-brief-body">
                    {brief.reading && <p className="sb-brief-reading">{brief.reading}</p>}
                    {brief.practice.length > 0 && (
                      <ol className="sb-brief-practice">
                        {brief.practice.map((item) => (
                          <li key={item.title}>
                            <div className="sb-brief-practice-head">
                              <strong>{item.title}</strong>
                              <span className="sb-brief-minutes">{item.minutes} min</span>
                            </div>
                            {item.focus.length > 0 && (
                              <ul className="sb-brief-focus">
                                {item.focus.map((point) => (
                                  <li key={point}>{point}</li>
                                ))}
                              </ul>
                            )}
                            {item.why && (
                              <p className="sb-brief-why">
                                <span>Why:</span> {item.why}
                              </p>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* ---- Recent work ------------------------------------- */}
            {model.recent.length > 0 && (
              <Panel
                title="Recent work"
                note="Newest first."
              >
                <ul className="sb-recent">
                  {model.recent.map((entry) => (
                    <li key={entry.id}>
                      <div className="sb-recent-head">
                        <strong>{entry.title}</strong>
                        <span className={`sb-verdict is-${entry.verdict.replace(/\s+/g, '-')}`}>
                          {entry.verdict}
                        </span>
                      </div>
                      <p className="sb-recent-meta">
                        {entry.on}
                        {entry.quality !== null && <> · scored {entry.quality}/25</>}
                        {entry.seconds !== null && <> · {format.duration(entry.seconds)}</>}
                      </p>
                    </li>
                  ))}
                </ul>
                {model.goalAimed !== null && (
                  <p className="ax-panel-note ax-panel-note-foot">
                    <strong>{model.goalAimed}%</strong> of what you finished here in this window
                    was aimed at a goal.
                  </p>
                )}
              </Panel>
            )}

            {/* ---- The lattice ------------------------------------- */}
            {lattice && (
              <Panel
                title="The skill tree"
                note="Where you stand in it, and what it holds."
              >
                {/* The reader's half, first and largest. Everything under it
                    is the curriculum — authored, and the same on every
                    account. Keeping the two apart is the whole design of this
                    panel: "6 practised" printed beside "42 skills" reads as a
                    claim about the reader that the authored states cannot
                    support, which is what the old footnote was apologising
                    for at length. A measured bar says it instead. */}
                {standing && (
                  <div className="sb-standing">
                    <span className="sb-standing-pct">{standing.percent}%</span>
                    <div className="sb-standing-main">
                      <span className="sb-standing-bar" aria-hidden="true">
                        <span style={{ width: `${standing.percent}%` }} />
                      </span>
                      <span className="sb-standing-sub">
                        {standing.xp.toLocaleString()} of {standing.worth.toLocaleString()} XP
                        {' '}across everything that opens {standing.title}
                      </span>
                    </div>
                  </div>
                )}

                <div className="sb-tree">
                  <div>
                    <strong>{lattice.title}</strong>
                    <p>{lattice.blurb}</p>
                    <p className="sb-tree-choice">
                      {lattice.nodes} skills, {lattice.core} core
                      {lattice.practised > 0 && <> · {lattice.practised} marked practised</>}
                      {lattice.chosen && <> · your chosen branch</>}
                    </p>
                  </div>
                  <div className="sb-tree-actions">
                    <Link className="ax-btn ax-btn-primary" to="/skill-trees">
                      Open the tree
                    </Link>
                    <Link className="ax-btn ax-btn-quiet" to="/analytics?setup">
                      Change the branch
                    </Link>
                  </div>
                </div>

                {/* Where it forks. Named rather than counted, because the
                    branch names are the useful part: they say what the subject
                    turns into once its foundations are behind you, and one of
                    them is the answer to the setup question. */}
                {lattice.branches.length > 0 && (
                  <ul className="sb-branches">
                    {lattice.branches.map((branch) => (
                      <li key={branch.id}>
                        <span>{branch.title}</span>
                        <em>{branch.nodes} skills</em>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
          </>
        )}
      </div>
    </div>
  );
}
