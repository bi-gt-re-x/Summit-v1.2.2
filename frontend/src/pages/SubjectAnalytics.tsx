/**
 * One subject, read against the goal it feeds.
 *
 * ## What this page is for
 *
 * The analytics page's Subjects tab ranks subjects against each other. This answers
 * what that ranking can't: what is this subject for, does the plan need it right now,
 * and did the work here actually go at the goal? A subject's own averages can't say
 * that, so the page opens on the goal and its figures are "The numbers", one tab over.
 *
 * ## Where its parts come from
 *
 * The goal reading is backend/tracking/subject_read.py, on the server because it needs
 * the plan's decision, the forecast and every task's link to a goal. It goes by where
 * the work is rather than where a goal is filed, and takes its order and pace from the
 * plan, so this page and the plan can't disagree. The figures on "The numbers" are
 * arithmetic over the task history (./components/Subject/model and state). The
 * sessions are written by a model, on request, for the goal the page leads with.
 *
 * It's a page rather than an eighth tab because there's one per followed subject: the
 * rail's Analytics entry unfolds into the list. See `analytics_subjects` in
 * services/settings.
 *
 * ## A panel with nothing to say doesn't draw
 *
 * Readings are gated on the evidence table on the server, and each fold on "The
 * numbers" on its own data. Each shut fold states its answer on its row, so a reader
 * opens the one whose figure surprised them. See components/Subject/Fold.
 */
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorState, Loading, PageHero, type HeroTone } from '@/components';
import { AreaChart } from '@/components/Analytics';
import { WINDOWS, type WindowKey } from '@/components/Analytics/data';
import type { CalendarKey } from '@/utils/habits';

/** The work calendar follows the page's one range picker rather than its own. */
const HEAT_WINDOW: Record<WindowKey, CalendarKey> = {
  '7d': '7', '30d': '30', '90d': '90', '1y': '365', '2y': 'all', all: 'all',
};
import { subjectModel } from '@/components/Subject/model';
import { subjectState } from '@/components/Subject/state';
import { recentWork, workGroups } from '@/components/Subject/recentWork';
import { Dimensions } from '@/components/Subject/Dimensions';
import { Fold } from '@/components/Subject/Fold';
import { SubjectHeat } from '@/components/Subject/Heat';
import { LinkGoal } from '@/components/Subject/LinkGoal';
import { GoalLead } from '@/components/Subject/GoalLead';
import { GoalInsights } from '@/components/Subject/GoalInsights';
import { TopicLibrary } from '@/components/Subject/TopicLibrary';
import { buildTopics, topicLibrary, type TopicLibrary as TopicLibraryData } from '@/services/topics';
import { subjectGoalRead } from '@/services/subjectGoal';
import { effortPoints, weekLoad } from '@/components/Subject/graphs';
import { performance } from '@/components/Subject/performance';
import { latticeFor, treeReading } from '@/components/Subject/lattice';
import { practicedFrom } from '@/utils/skillProgress';
import { useSkillReading } from '@/hooks/useSkillReading';
import { useApi, useAuth, useDocumentTitle, useSettings, useSubjectIndex } from '@/hooks';
import { taskHistory } from '@/services/taskHistory';
import { UserDataContext } from '@/context/contexts';
import { announceStatsChanged } from '@/utils/statsBus';
import { withPlannedTask } from '@/utils/plannedTask';
import {
  readSubject,
  subjectReadingAvailable,
  savedSubjectReading,
  subjectRecommendations,
  planSession,
  takeRecommendation,
  type NextStep,
  type PlannedSession,
  type StepState,
  type SubjectReading,
} from '@/services/analytics';
import { getGoals, updateGoal } from '@/services/goals';
import { BATCH, MAX_STEPS, NextSteps } from '@/components/Subject/NextSteps';
import { measureOf } from '@/components/Goals';
import { format } from '@/utils';
import { correlationEvidence, speaks } from '@/utils/evidence';
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
  if (value === null) return <span className="sb-delta is-flat">-</span>;
  if (value === 0) return <span className="sb-delta is-flat">→ no change</span>;
  return (
    <span className={`sb-delta ${value > 0 ? 'is-up' : 'is-down'}`}>
      {value > 0 ? '↑' : '↓'} {Math.abs(value)}
      {unit}
    </span>
  );
}

const TABS = [
  {
    key: 'overview' as const,
    label: 'Overview',
    purpose: "What this subject is for and what to do next.",
  },
  {
    key: 'evidence' as const,
    label: 'The numbers',
    purpose: 'All the numbers behind it.',
  },
];

/** A 0-100 bar. Labelled by its row, so it is decoration and hidden. */
function Bar({ percent }: { percent: number }) {
  return (
    <span className="sb-bar" aria-hidden="true">
      <span className="sb-bar-fill" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </span>
  );
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
  const { prefs } = useSettings();
  const catalogue = useSubjectIndex(username);
  const subject = catalogue.get(subjectId);

  /* The window opens on the account's own analytics preference. Local after that. */
  const [span, setSpan] = useState<WindowKey>(prefs.analytics_window);

  /* Not in the URL: the tab is a way of looking at one page rather than a place,
     and the window picker beside it isn't either. */
  const [tab, setTab] = useState<'overview' | 'evidence'>('overview');

  /* Through `taskHistory`, which is the same request the analytics page makes
     and the largest one the app makes at all. A reader arrives here *from* that
     page, so this used to be a second full download of bytes that were already
     parsed a moment ago — and going back was a third. See
     services/taskHistory. */
  const call = useMemo(
    () =>
      username
        ? () => taskHistory(username)
        : () => Promise.resolve({ success: false as const, message: 'Sign in to see a subject.' }),
    [username],
  );
  const tasks = useApi(call, [username]);

  /* The goals, for the sessions' brief and the "link a goal" list. What the page says
     about them comes from the read below, which has the plan's order and pace. */
  const goalCall = useMemo(
    () =>
      username
        ? getGoals
        : () => Promise.resolve({ success: false as const, message: 'Sign in to see goals.' }),
    [username],
  );
  const goals = useApi(goalCall, [username]);

  /* What this subject is for. See backend/tracking/subject_read.py. */
  const goalReadCall = useMemo(
    () => () => subjectGoalRead(subjectId),
    [subjectId],
  );
  const goalRead = useApi(goalReadCall, [subjectId, username]);

  /* The topic library: read what's stored, and rebuild it when it's out of
     date (new tasks, a goal linked or renamed). The read never writes, so the
     rebuild is its own POST. Asked again whenever the goals change, because a
     goal's links decide which topics feed it. */
  const [topics, setTopics] = useState<TopicLibraryData | null>(null);
  const [topicsBusy, setTopicsBusy] = useState(false);
  const goalKey = (goals.data?.goals ?? [])
    .map((goal) => `${goal.id}:${goal.title}:${goal.subject_ids ?? ''}`)
    .join('|');
  const goalsSettled = !goals.loading;
  useEffect(() => {
    // After the goals arrive, so the read isn't made once without them and
    // again with them.
    if (!username || !subjectId || !goalsSettled) return;
    let live = true;
    void topicLibrary(subjectId).then((read) => {
      if (!live || !read.success) return;
      setTopics(read);
      if (read.built && !read.stale) return;
      setTopicsBusy(true);
      void buildTopics(subjectId).then((built) => {
        if (!live) return;
        setTopicsBusy(false);
        if (built.success) setTopics(built);
      });
    });
    return () => {
      live = false;
    };
  }, [subjectId, username, goalKey, goalsSettled]);

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

  /* Everything filed under this subject, unwindowed: the calendar and the charts
     pick their own range from it. */
  const mine = useMemo(
    () => (tasks.data?.tasks ?? []).filter((task) => task.subject === subjectId),
    [subjectId, tasks.data],
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
   * The lattice this subject opens on, and what the reader has practiced of it.
   *
   * "Practiced" is read from the account's own work: the skill tree's
   * reading (hooks/useSkillReading), shared with the tree page so the two
   * count the same nodes.
   */
  const ambition = prefs.analytics_ambitions[subjectId];
  const { reading: skillReading } = useSkillReading(username);
  const lattice = useMemo(
    () =>
      subject
        ? latticeFor(
            subjectId,
            subject.group,
            prefs.analytics_subject_depth[subjectId],
            practicedFrom(skillReading),
          )
        : null,
    [prefs.analytics_subject_depth, subject, subjectId, skillReading],
  );

  const [reading, setReading] = useState<SubjectReading | null>(null);
  const [asking, setAsking] = useState<'' | 'fresh' | 'more'>('');
  const thinking = asking !== '';
  const [readError, setReadError] = useState('');
  const [canRead, setCanRead] = useState(false);
  /* Where each recommendation stands — open, planned as a task, or done — so a
     step does not offer twice, and the one a button is busy on. */
  const [stepState, setStepState] = useState<
    Map<string, { state: StepState; task: PlannedSession | null }>
  >(new Map());
  const [stepBusy, setStepBusy] = useState('');

  /** How many steps are on screen, 0 to MAX_STEPS. */
  const shown = Math.min(reading?.next_steps.length ?? 0, MAX_STEPS);

  /* What the tree says about the reader, as sentences rather than as counts.
     Null lattice means no tree for this subject and no panel to read. */
  const treeRead = useMemo(() => (lattice ? treeReading(lattice) : null), [lattice]);



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

  /* Keyed on the subject's *name* rather than on the subject object. The
     catalogue is a Map rebuilt whenever its source list changes, so depending
     on the object here would re-run this effect on any render that produced a
     new Map — which sets state, which renders again. The name is what the
     request is actually keyed on, and it is a string. */
  const subjectName = subject?.name ?? '';

  /* Where each recommendation here stands. Cheap, and read on arrival and
     whenever the tasks change, so a planned session that was finished or
     deleted elsewhere unlocks (or counts as done) the moment the page sees it.
     The server works the state out from the task itself. */
  const tasksStamp = tasks.data;
  useEffect(() => {
    if (!username || !subjectName) return;
    let live = true;
    void subjectRecommendations(subjectName).then((result) => {
      if (!live || !result.success) return;
      setStepState(new Map(result.recommendations.map((row) => [
        row.id,
        { state: row.state ?? (row.taken ? 'done' : 'open'), task: row.task ?? null },
      ])));
    });
    return () => {
      live = false;
    };
  }, [subjectName, username, tasksStamp]);

  /* Cleared with the subject, then restored from the server — one saved
     reading per account and subject, whatever window it was written under.

     It used to be put back only when the window on screen matched the one it
     was argued from, so a reader whose default window differed (or who
     switched windows once) saw their recommendations disappear. The steps are
     a plan for this subject, not a reading of one window's figures, and the
     reader paid a call for them; they stay until replaced. */
  useEffect(() => {
    setReading(null);
    setReadError('');
    if (!username || !subjectName) return;
    let live = true;
    void savedSubjectReading(subjectName).then((result) => {
      if (!live || !result.success || !result.reading) return;
      setReading(result.reading);
    });
    return () => {
      live = false;
    };
  }, [subjectId, subjectName, username]);

  /**
   * Ask the model. `fresh` replaces the steps on screen with three new ones, and
   * `more` adds three under them (the server stops at six). The server writes them
   * for the goal this page leads with.
   */
  const askForReading = useCallback(async (mode: 'fresh' | 'more' = 'fresh') => {
    if (!subject) return;
    setAsking(mode);
    setReadError('');

    /* `finally`, because a request that throws — a server error, a dropped
       connection — would otherwise leave the button saying "Planning…" for
       good, with nothing to press. */
    let result: Awaited<ReturnType<typeof readSubject>>;
    try {
      result = await readSubject({
        subject: subject.name,
        subject_id: subjectId,
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
              ? 'no estimate yet'
              : goal.drift > 0
                ? `on pace to be ${goal.drift} days late`
                : 'on pace to finish on time',
          levers: goal.levers.map((lever) => `${lever.title}: ${lever.fact}`),
        })),
        /* The curriculum's own words, and nothing more. These are the authored
           tree's area names — identical on every account, carrying no
           measurement of this reader — so the model has a vocabulary to
           recommend in without having to invent one. The prompt is explicit
           that naming an area is allowed and claiming a level in it is not. */
        vocabulary: lattice
          ? [lattice.title, ...lattice.branches.map((branch) => branch.title)]
          : [],
        /* The work itself, and the only thing going up that is not a
           measurement. Everything above it describes the *shape* of the record
           — execution is 47, the curve falls off at Hard — and a model given
           only that writes the shape back as an instruction: "Focused Easy
           Execution Practice. Solve 10 Easy problems." The titles are what make
           it possible to say which Easy problems, and that the answer is to
           stop doing them. See components/Subject/recentWork. */
        recent_work: recentWork(tasks.data?.tasks ?? [], subjectId, span, today),
        /* Every finished task in the window, grouped by name, with how each
           group went, how hard it was filed and how long it took — so a step
           can name the material that is or is not working, and the next range
           of it. */
        work_groups: workGroups(tasks.data?.tasks ?? [], subjectId, span, today),
        mode,
      });
    } catch {
      result = { success: false, message: "Couldn't reach the server. Try again." } as typeof result;
    } finally {
      setAsking('');
    }

    if (result.success) setReading(result.reading);
    else setReadError(result.message || "Couldn't load this subject.");
  }, [ambition, lattice, model.goals, span, state, subject, subjectId, tasks.data, today]);

  /** Record a step as done without planning it — the work happened elsewhere. */
  const record = useCallback(async (step: NextStep) => {
    setStepBusy(step.id);
    const result = await takeRecommendation(step.id);
    setStepBusy('');
    if (result.success) {
      setStepState((was) => new Map(was).set(step.id, { state: 'done', task: null }));
    }
  }, []);

  /**
   * Plan my next session: the server estimates the length and XP, books the
   * next free calendar slot as a task filed under this subject, and locks the
   * step to it until that task is completed (done) or deleted (open again).
   *
   * Finishing the task raises the rating prompt, and the rating is what the
   * next batch is argued from — that is the loop.
   */
  /* The app-wide task list, read without asking for it: `useUserData` would
     start a megabytes-long read this page has no use for. */
  const shared = useContext(UserDataContext);
  const planStep = useCallback(
    async (step: NextStep) => {
      setStepBusy(step.id);
      setReadError('');
      const made = await planSession(step.id, subjectId);
      setStepBusy('');
      if (!made.success) {
        setReadError(made.message || "Couldn't plan that session. Try again.");
        return;
      }
      setStepState((was) => new Map(was).set(step.id, { state: 'planned', task: made.task }));
      /* The Tasks page and the calendar share one task list, read once a
         session (context/UserDataProvider), so the new task is written onto
         it — otherwise neither shows the session until the page is reloaded.
         A no-op when nothing has read the list yet: that first read has it. */
      const booked = made.task;
      shared?.mutate((current) => withPlannedTask(current, booked, step.title, subjectId));
      // Drops the cached task history, which `tasks.reload` would otherwise
      // hand back unchanged. Re-read rather than patched: the new task
      // changes a dozen figures on this page.
      announceStatsChanged();
      tasks.reload();
    },
    [shared, subjectId, tasks],
  );

  /* The volume chart's own ceiling. A floor of 1 keeps a window with a single
     quiet period from producing a "0" top tick over a line that is not flat. */
  const seriesPeak = Math.max(...model.series.done, 1);

  const week = useMemo(() => weekLoad(model.done), [model.done]);
  const cloud = useMemo(() => effortPoints(model.done), [model.done]);

  /* Whether longer sessions go better, said only as far as the evidence allows. */
  const sessionLength = useMemo(() => {
    if (cloud.correlation === null) return '';
    const read = correlationEvidence(cloud.correlation, cloud.count);
    if (!speaks(read)) return '';
    const said = cloud.correlation > 0 ? 'Longer sessions tend to go better here' : 'Longer sessions tend to go worse here';
    return `${said}, over ${cloud.count.toLocaleString('en-US')} timed, rated tasks. How sure: ${read.label.toLowerCase()}.`;
  }, [cloud]);

  /* The busiest weekday, named on the shut row of "Over time". */
  const busiest = useMemo(() => week.find((day) => day.peak && day.value > 0) ?? null, [week]);


  /* The two ends of the web, so the fold can say which measure is carrying the
     subject and which is holding it back without the reader reading seven
     bars. Momentum is out for the reason components/Subject/graphs gives:
     it is centred on 50 and means change, so it is not comparable with the
     rest. */
  const dimRange = useMemo(() => {
    const known = state.dimensions.filter(
      (entry) => entry.key !== 'momentum' && entry.known && entry.value !== null,
    );
    const sorted = [...known].sort((a, b) => a.value! - b.value!);
    const low = sorted[0];
    const high = sorted[sorted.length - 1];
    return low && high && low !== high ? { low, high } : null;
  }, [state.dimensions]);

  /* Where the work actually sits, which is not the same question as where it
     goes well — the curve answers that one. */
  const peakBand = useMemo(
    () => model.bands.reduce<typeof model.bands[number] | null>(
      (best, band) => (band.done > (best?.done ?? 0) ? band : best),
      null,
    ),
    [model.bands],
  );

  /* ---- Pointing this subject at a goal ---------------------------------
     For a subject nothing feeds yet. Counters are left out: "Earn 250,000 XP" is
     fed by every task on the account, so aiming a subject at one says nothing. */
  const [linking, setLinking] = useState('');
  const [linkError, setLinkError] = useState('');

  const linkable = useMemo(
    () =>
      (goals.data?.goals ?? [])
        .filter((goal) => goal.status === 'active')
        .filter((goal) => ['number', 'milestones'].includes(measureOf(goal)))
        .map((goal) => ({
          id: goal.id,
          title: goal.title,
          subjects: String(goal.subject_ids ?? '')
            .split(',')
            .map((id) => catalogue.get(id.trim())?.name ?? '')
            .filter(Boolean),
        })),
    [catalogue, goals.data],
  );

  /* Filing, moving and unfiling are the same write: the goal's subject list with
     this id taken out, and put back or replaced by where its work really is. Both
     reads are asked again: the server decides what a goal covers. */
  const setLinked = useCallback(
    async (goalId: string, on: boolean, moveTo = '') => {
      const goal = goals.data?.goals.find((one) => one.id === goalId);
      if (!goal) return;
      setLinking(goalId);
      setLinkError('');
      const ids = String(goal.subject_ids ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .filter((id) => id !== subjectId);
      if (on) ids.push(subjectId);
      if (moveTo && !ids.includes(moveTo)) ids.push(moveTo);
      const result = await updateGoal(goalId, { subject_ids: ids.join(',') });
      setLinking('');
      if (!result.success) {
        setLinkError(result.message || "Couldn't change that goal.");
        return;
      }
      goals.reload();
      goalRead.reload();
    },
    [goalRead, goals, subjectId],
  );


  /* The goal the page reads against, and the sessions below are written for. */
  const leadTitle = goalRead.data?.goals.find((row) => row.goal_id === goalRead.data?.lead)?.title ?? '';
  const stale = Boolean(goalRead.data?.lead && shown > 0 && reading?.for_goal !== goalRead.data.lead);
  const weakTopics = (topics?.rows ?? []).filter((row) => row.topic && row.status === 'weak').length;
  const topReason = model.struggles[0] ?? null;
  const topStrength = model.wentWell[0] ?? null;

  useDocumentTitle(subject ? subject.name : 'Subject');

  /* The catalogue is cached module-wide and read by a dozen components, so on
     every navigation after the first it is already here. On the first it is
     empty for a tick — and an empty catalogue is indistinguishable from one
     that does not hold this id, so the "no such subject" message has to wait
     for it or it would flash on a perfectly good link. */
  const naming = catalogue.size === 0;

  /** How the goal is going, as a sky. Plain with no goal yet. */
  const HERO_TONE: Record<'good' | 'bad' | 'flat' | 'none', HeroTone> = {
    good: 'green',
    bad: 'rose',
    flat: 'amber',
    none: 'violet',
  };

  return (
    /* `sb-page` alongside `ax-page`: this page is a guest in the analytics
       palette and reads its tokens, but its own spacing scale has to hang off
       a class this stylesheet owns. A bare `.ax-page` rule in subject.css is
       two sheets writing one class, and whichever Vite loads second wins —
       scripts/check_css.mjs fails the build for exactly that. */
    <div className="ax-page sb-page">
      <div className="ax-shell page-shell">
        {/* The range is seeded on the subject's own id, so every subject page is a
            different place. The sky is how the goal here is going. */}
        <PageHero variant={`subject-${subjectId}`} tone={HERO_TONE[goalRead.data?.card.tone ?? 'none']}>
          <header className="ax-head">
            <div>
              <span className="peak-eyebrow">Subject</span>
              <h1>{subject ? subject.name : 'Subject'}</h1>
              <p className="ax-muted ax-head-purpose">
                {subject
                  ? "What it's for, whether it's working and what to do next."
                  : 'One subject at a time here.'}
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
          <Loading label="Loading your work" />
        ) : !subject ? (
          <p className="ax-opening is-flat">
            We can't find that subject. It may have been deleted. You can pick your subjects again in{' '}
            <Link className="ax-link" to="/analytics?setup">the analytics setup</Link>.
          </p>
        ) : !tasks.data ? (
          <ErrorState message={tasks.error ?? "Couldn't load your tasks."} onRetry={tasks.reload} />
        ) : !model.any ? (
          <>
            <p className="ax-opening is-flat">
              No tasks under {subject.name} yet. Add a few tasks to fill this page.
            </p>
          </>
        ) : (
          <>
            {/* The goal reading covers fixed periods and says which, so the window
                picker only sits on the tab it changes. */}
            <div className="ax-controls sb-controls">
              <nav className="ax-tabs ax-tabs-major" aria-label="Subject sections">
                {TABS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`ax-tab${option.key === tab ? ' is-on' : ''}`}
                    aria-current={option.key === tab ? 'page' : undefined}
                    title={option.purpose}
                    onClick={() => setTab(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </nav>
              {tab === 'evidence' && (
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
              )}
            </div>

            {tab === 'overview' && (
              <>
            {goalRead.error && !goalRead.data ? (
              <ErrorState message={goalRead.error} onRetry={goalRead.reload} />
            ) : goalRead.data ? (
              <>
                <GoalLead
                  read={goalRead.data}
                  subject={subject.name}
                  busy={linking}
                  error={linkError}
                  onFile={(goalId) => void setLinked(goalId, true)}
                  onMove={(goalId, home) => void setLinked(goalId, false, home)}
                />

                {/* Only with nothing feeding this subject. A goal whose work is here
                    is named above with its own way to file it. */}
                {goalRead.data.goals.length === 0 && (
                  <LinkGoal
                    linked={[]}
                    options={linkable}
                    busy={linking}
                    error={linkError}
                    onLink={(goalId) => void setLinked(goalId, true)}
                    onUnlink={(goalId) => void setLinked(goalId, false)}
                  />
                )}

                <GoalInsights insights={goalRead.data.insights} goal={leadTitle} subject={subject.name} />
              </>
            ) : (
              <Loading label="Reading your goals" />
            )}

            {/* The model's sessions, for the goal above. It's handed the work on that
                goal, grouped by name with how each went, and has to say exactly which
                problems, at what pace and from where. Three at a time, up to six. */}
            <section className="ax-panel sb-panel" aria-label="Recommendations">
              <div className="ax-panel-head">
                <div className="ax-panel-title">
                  <h2>{leadTitle ? `Sessions for ${leadTitle}` : 'Recommendations'}</h2>
                </div>
              </div>
              {canRead ? (
                <div className="sb-draft">
                  <div className="sx-ai-invite">
                    <div>
                      <strong>
                        {stale
                          ? `These weren't written for ${leadTitle}`
                          : shown === 0
                            ? `Get ${BATCH} sessions planned with AI`
                            : shown < MAX_STEPS
                              ? `Done with these? Get ${BATCH} more`
                              : `That's ${MAX_STEPS}, the max at once`}
                      </strong>
                      <p>
                        {stale
                          ? `They came before this page read your goal. Start over and AI plans ${BATCH} sessions that go straight at it.`
                          : shown < MAX_STEPS
                            ? `AI looks at the work you've done ${leadTitle ? 'on this goal' : 'here'} and plans ${BATCH} sessions: which problems, how fast to go and where to find them.`
                            : `Try a few of these, or start over with ${BATCH} new ones.`}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ax-btn"
                      onClick={() =>
                        void askForReading(!stale && shown > 0 && shown < MAX_STEPS ? 'more' : 'fresh')
                      }
                      disabled={thinking}
                    >
                      {thinking
                        ? 'Planning…'
                        : stale
                          ? `Start over with ${BATCH}`
                          : shown === 0
                            ? `Generate ${BATCH} with AI`
                            : shown < MAX_STEPS
                              ? `Generate ${BATCH} more`
                              : `Start over with ${BATCH}`}
                    </button>
                  </div>

                  {readError && (
                    <p className="sx-ask-err" role="alert">
                      {readError}
                    </p>
                  )}

                  {shown > 0 && reading && (
                    <div className="sb-draft-body">
                      <p className="sx-batch-note">
                        {shown} of {MAX_STEPS}, written by AI from your tasks. Open one for the pace, where to find it and why.
                      </p>
                      <NextSteps
                        steps={reading.next_steps}
                        status={stepState}
                        busy={stepBusy}
                        onPlan={(step) => void planStep(step)}
                        onDidIt={(step) => void record(step)}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <p className="ax-panel-note">
                  No AI key yet, so no AI sessions. Add one to .env and restart the server.
                </p>
              )}
            </section>
              </>
            )}

            {/* ---- THE WORKING ---------------------------------------- */}
            {tab === 'evidence' && (
              <>
            <p className="sb-detail-note sb-detail-lead">
              The numbers behind the overview, from your tasks.
            </p>

            <div className="sb-folds">
              {/* The topic library's slice for this subject: every area and topic the
                  task names say, rated against the subject. */}
              {topics && (
                <Fold
                  title="Topics"
                  note="Everything your task names mention here, and how each one rates."
                  defaultOpen
                  figures={weakTopics > 0
                    ? [{ label: 'Weak', value: String(weakTopics), tone: 'warn' as const }]
                    : []}
                >
                  <TopicLibrary
                    library={topics}
                    busy={topicsBusy}
                    goalTitles={Object.fromEntries((goals.data?.goals ?? []).map((goal) => [goal.id, goal.title]))}
                  />
                </Fold>
              )}

              <Fold
                title="Where you stand"
                note="The seven parts your work here is rated on."
                figures={state.overall === null ? [] : [{ label: 'Average', value: String(state.overall) }]}
                lead={
                  dimRange ? (
                    <>
                      Strongest on <b>{dimRange.high.label.toLowerCase()}</b> at{' '}
                      {dimRange.high.value}, weakest on <b>{dimRange.low.label.toLowerCase()}</b>{' '}
                      at {dimRange.low.value}.
                    </>
                  ) : undefined
                }
              >
                <Dimensions dimensions={state.dimensions} />
              </Fold>

              {/* ---- Difficulty ---------------------------------------- */}
              {(state.curve.rungs.some((rung) => rung.done > 0)
                || model.bands.some((entry) => entry.done > 0)) && (
                <Fold
                  title="Difficulty"
                  note="Each difficulty, how it goes and how much you do."
                  figures={[
                    {
                      label: 'Falls off at',
                      value: state.curve.threshold?.label ?? 'nowhere',
                      tone: state.curve.threshold ? 'warn' : 'good',
                    },
                  ]}
                  lead={
                    peakBand && peakBand.done > 0 ? (
                      <>
                        You mostly work at <b>{peakBand.label.toLowerCase()}</b>:{' '}
                        {peakBand.done} of {model.finished} finished tasks.
                      </>
                    ) : undefined
                  }
                >
                  {/* "Where it starts to go" charted execution per level, which
                      is the "How it went" column of the table below. */}
                  {model.bands.some((band) => band.done > 0) && (
                    <Panel
                      title="How you do at each difficulty"
                      note="Based on your star ratings."
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
                                      <span className="is-none">-</span>
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
                      {/* The line under the table compared the best and worst
                          level and said what to work on. The comparison is the
                          verdict at the top of the Overview, and what to work
                          on is the Recommendations tab. */}
                    </Panel>
                  )}
                </Fold>
              )}

              {/* ---- Over time ----------------------------------------- */}
              {mine.length > 0 && (
                <Fold
                  title="Over time"
                  note="How much you did and how well, over time."
                  /* Momentum is the badge at the top of the Overview tab, and
                     this window against the one before is "Your progress"
                     inside this fold, so the shut row names the busiest day. */
                  figures={[{ label: 'Busiest', value: busiest?.label ?? '-' }]}
                  lead={
                    state.momentum.known ? (
                      <>
                        Quality is{' '}
                        <b>
                          {state.momentum.direction === 'climbing'
                            ? 'climbing'
                            : state.momentum.direction === 'slipping'
                              ? 'slipping'
                              : 'flat'}
                        </b>{' '}
                        in this window. {state.momentum.earlier} early, {state.momentum.later}{' '}
                        late.
                      </>
                    ) : undefined
                  }
                >
                  {model.series.any && (<Panel
                    title="Your trend"
                    note="How much you did and how you rated it."
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
                  </Panel>)}

                  <SubjectHeat mine={mine} today={today} subject={subject.name} window={HEAT_WINDOW[span]} />


                  {model.series.any && (<Panel
                    title="Your progress"
                    note="Compared with the same number of days before."
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
                  </Panel>)}
                </Fold>
              )}

              {/* ---- Time spent ---------------------------------------- */}
              {state.time.known && (
                <Fold
                  title="Time spent"
                  note="Did the extra time help?"
                  figures={[
                    { label: 'Logged', value: `${state.time.hours}h` },
                    {
                      label: 'Rushed',
                      value: String(state.time.rushed),
                      tone: state.time.rushed > 0 ? 'bad' : 'good',
                    },
                  ]}
                  lead={
                    sessionLength ? <>{sessionLength}</> : undefined
                  }
                >
                  <Panel
                    title="What your time got you"
                    note="Compared with your usual pace. No guessing how long things take."
                  >
                    <ul className="sb-rows">
                      <li className="sb-row">
                        <span className="sb-row-name">Usual task</span>
                        <strong>{state.time.typical} min</strong>
                        <span className="sb-row-note">typical in this window</span>
                      </li>
                      <li className="sb-row">
                        <span className="sb-row-name">Compared with that</span>
                        <strong>
                          {state.time.drift === null
                            ? '-'
                            : state.time.drift < 0
                              ? `${Math.abs(state.time.drift)} min faster`
                              : `${state.time.drift} min slower`}
                        </strong>
                        <span className="sb-row-note">
                          {state.time.quicker}% of tasks went faster than usual
                        </span>
                      </li>
                      <li className="sb-row">
                        <span className="sb-row-name">Fast but rated low</span>
                        <strong>{state.time.rushed}</strong>
                        <span className="sb-row-note">
                          {state.time.rushed === 0
                            ? "none, so speed isn't hurting quality"
                            : 'fast but rated low'}
                        </span>
                      </li>
                      <li className="sb-row">
                        <span className="sb-row-name">Took longer and went well</span>
                        <strong>{state.time.thorough}</strong>
                        <span className="sb-row-note">the extra time paid off</span>
                      </li>
                    </ul>
                  </Panel>

                </Fold>
              )}

              {/* ---- Why it goes well or badly ------------------------- */}
              {(model.struggles.length > 0 || model.wentWell.length > 0) && (
                <Fold
                  title="Why it goes well or badly"
                  note="From the reasons you picked after each task."
                  figures={[
                    ...(topReason
                      ? [{ label: 'Goes wrong', value: topReason.label, tone: 'bad' as const }]
                      : []),
                    ...(topStrength
                      ? [{ label: 'Goes right', value: topStrength.label, tone: 'good' as const }]
                      : []),
                  ]}
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
                </Fold>
              )}

              {/* ---- Recent sessions ----------------------------------- */}
              {(model.run.readings.length > 0 || model.recent.length > 0) && (
                <Fold
                  title="Recent sessions"
                  note="The last few, newest first."
                  figures={[
                    {
                      label: 'Trend',
                      value: model.run.trend === null
                        ? '-'
                        : model.run.trend === 0
                          ? 'flat'
                          : `${model.run.trend > 0 ? '+' : ''}${model.run.trend} pts`,
                      tone: (model.run.trend ?? 0) > 0
                        ? 'good'
                        : (model.run.trend ?? 0) < 0
                          ? 'bad'
                          : 'plain',
                    },
                    { label: 'Last worked', value: model.recent[0]?.on ?? '-' },
                  ]}
                >
                  {model.recent.length > 0 && (
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
                  )}
                </Fold>
              )}

              {/* ---- The lattice --------------------------------------- */}
              {lattice && treeRead && (
                <Fold
                  title="Skill tree"
                  note="Where this fits in the skill tree."
                  lead={treeRead.touched}
                >
                  {treeRead.next && <p className="sb-tree-read-next">{treeRead.next}</p>}

                  <div className="sb-tree">
                    <div>
                      <strong>{lattice.title}</strong>
                      {lattice.chosen && <p className="sb-tree-choice">Your branch</p>}
                    </div>
                    <div className="sb-tree-actions">
                      <Link className="ax-btn ax-btn-primary" to="/skill-trees">
                        Open the tree
                      </Link>
                    </div>
                  </div>
                </Fold>
              )}
            </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
