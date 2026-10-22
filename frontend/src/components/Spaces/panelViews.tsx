/**
 * What each panel kind draws, with the component its own page uses.
 *
 * Nothing here works a figure out. Every view takes what the Analytics page's
 * model already worked out (./SpaceData shares one per time range and
 * subject), what the page's one focus clock says, or what its own page would
 * have read, and hands it to the panel that page draws. A setting on the block
 * is passed where the page would have passed its own picker's value, so a
 * chart set to "Tasks by month" here is the same chart Analytics draws when
 * its pickers say so. A control inside a panel that the block also has as a
 * setting (the trend chart's measure, the plan's minutes, the growth period,
 * the timeline's lines) writes the block's setting, so it sticks.
 *
 * ./PanelBlock draws the frame around these and the settings above them;
 * ./panels lists the kinds and what each can be set to.
 */
import { useCallback, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import '@/styles/analytics.css';
import '@/styles/growth.css';
import '@/styles/timer.css';
import { NEED_DAYS, type AnalyticsModel } from '@/components/Analytics/useAnalyticsModel';
import { Summary } from '@/components/Analytics/Summary';
import { TabOpening, scoreMovement } from '@/components/Analytics/Header';
import { ActiveDayPrinciple, AwayNotice, FirstMilestone, StageLadder, StageNote } from '@/components/Analytics/Collecting';
import { EarlyRead, Upcoming } from '@/components/Analytics/Upcoming';
import { SOLID_AT } from '@/components/Analytics/milestones';
import { Tiles } from '@/components/Analytics/Tiles';
import { StatRow } from '@/components/Analytics/StatRow';
import { Trajectory } from '@/components/Analytics/Trajectory';
import { ConsistencyPanel, SubjectPanel } from '@/components/Analytics/Breakdown';
import { DepthPicker, QualityGridPanel, QualityPanel, RatedTasksPanel, ReasonsPanel } from '@/components/Analytics/Quality';
import { BaselinePanel } from '@/components/Analytics/Baseline';
import { FirstReads } from '@/components/Analytics/FirstReads';
import { GoalsFinished } from '@/components/Analytics/GoalsFinished';
import { WhatYouToldUs } from '@/components/Analytics/WhatYouToldUs';
import { ObservationNote } from '@/components/Analytics/Observation';
import { NextActions } from '@/components/Analytics/NextActions';
import { DiagnosisCards, DiagnosisEmpty } from '@/components/Analytics/Diagnosis';
import { Knows, useKnows } from '@/components/Analytics/Knows';
import { LensCard, LensLine } from '@/components/Analytics/Lens';
import { XpPulse } from '@/components/Analytics/XpPulse';
import {
  ConsistencyPanel as HabitConsistencyPanel,
  HabitCards,
  HabitOpening,
  habitLead,
  HabitTiles,
  PatternsPanel,
  TimelinePanel,
} from '@/components/Analytics/Habits';
import { SayVsDo } from '@/components/Analytics/SayVsDo';
import { FinishPanel, WhenPanel } from '@/components/Analytics/Early';
import { Panel } from '@/components/Analytics/charts';
import { SkillGrowthPanel, TimeProgressPanel } from '@/components/Analytics/SkillGrowth';
import { SkillLevelsPanel } from '@/components/Analytics/SkillLevels';
import { SkillShapePanel } from '@/components/Analytics/SkillView';
import { YearOnYear } from '@/components/Analytics/GrowthYears';
import {
  MilestoneFeed,
  MoverPanel,
  PeriodCards,
  PeriodTabs,
  ThenNow,
  milestones,
  movers,
} from '@/components/Analytics/GrowthPeriod';
import { basicStats } from '@/components/Analytics/tabs/OverviewTab';
import { CoreHoursPanel, GrowthTimelinePanel, ScoreChangesPanel, useSkillGrowth } from '@/components/Analytics/tabs/GrowthTab';
import { GoalLines, SubjectOpensPanel, SubjectsOpening, TreeDepthPanel, limitersShown } from '@/components/Analytics/tabs/SubjectsTab';
import { ChangedPanel, ClockPanel, HowPanel, RelationshipsPanel, WeekPanel, WhyPanel } from '@/components/Insights';
import { FocusChapter, type FocusPanel as FocusPart } from '@/components/Growth/FocusChapter';
import { SkillsChapter } from '@/components/Growth';
import { NextSessionsPanel } from '@/components/NextSessions/NextSessions';
import { FollowupPanel } from '@/components/Recommendations';
import { FocusPanel } from '@/components/Dashboard/FocusPanel';
import { MethodPicker, Recommend, RecentSessions, TaskPicker, TodaySittings, iso, shift } from '@/components/Timer/panels';
import { byTask, recommend } from '@/components/Timer/intervals';
import { BadgeTile, pickBadges } from '@/components/Achievements/BadgeWall';
import { useApi, useAuth, useSkillAttempts, useUserData } from '@/hooks';
import { achievements as badgeService, analytics as analyticsService, next as nextService } from '@/services';
import { NO_PLAN, type NextResult } from '@/services/next';
import type { GrowthPeriods, PeriodKey, PeriodMetric } from '@/services/analytics';
import { heatmapGrid, type HeatWindowKey } from '@/utils/growthSummary';
import { partsOfDay } from '@/utils/habits';
import { unlock } from '@/utils/insight';
import type { Grain, MetricKey } from '@/components/Analytics/data';
import { Columns, LineChart } from './LiveCharts';
import { list, text, whole, type PanelConfig, type PanelKind } from './panels';
import { useClock, usePanelModel, useShared, type Clock, type Shared } from './SpaceData';

/** Change some of the block's settings. */
export type SetPanel = (patch: Record<string, unknown>) => void;

interface Base {
  config: PanelConfig;
  set: SetPanel;
}

interface ModelProps extends Base {
  model: AnalyticsModel;
  shared: Shared;
}

interface ClockProps extends Base {
  clock: Clock;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="sp-live-note">{children}</p>;
}

/** The tasks a model's subject narrows to, for the panels that take raw tasks. */
const subjectTasks = (model: AnalyticsModel) =>
  model.subject ? model.tasks.filter((task) => task.subject === model.subject) : model.tasks;

// --------------------------------------------------------------------------
// From the Analytics model
// --------------------------------------------------------------------------
const MODEL_VIEWS: Partial<Record<PanelKind, (props: ModelProps) => ReactNode>> = {
  summary: ({ model }) => (
    <Summary
      score={model.analytical}
      movement={scoreMovement(model.recorded)}
      goals={model.goalSet.active > 0 ? { active: model.goalSet.active, behind: model.goalSet.behind } : null}
    />
  ),
  tiles: ({ model, config }) => (
    <>
      <EarlyRead days={model.maturity.activeDays} solidAt={SOLID_AT.trends} />
      <Tiles figures={model.figures} sparks={model.sparks} compareLabel={model.compareLabel} logStyle={model.logStyle} only={list(config, 'show')} />
    </>
  ),
  basics: ({ model, config }) => {
    const show = list(config, 'show');
    return <StatRow stats={basicStats(model.figures, model.streak, model.tasks).filter((stat) => show.includes(stat.key))} />;
  },
  trajectory: ({ model, config, set }) => (
    <Trajectory
      current={model.slice.current}
      previous={model.slice.previous}
      metric={text(config, 'metric') as MetricKey}
      onMetric={(metric) => set({ metric })}
      grain={text(config, 'grain') as Grain}
      onGrain={(grain) => set({ grain })}
      spanLabel={model.spanText}
      previousSpanLabel={model.previousSpanText}
    />
  ),
  heat: HeatView,
  'subject-xp': ({ model, config }) =>
    !model.breakdown.rows.length ? (
      <Note>No XP in this time range yet.</Note>
    ) : text(config, 'style') === 'line' ? (
      <SubjectsOpening rows={model.breakdown.rows} span={model.spanText} />
    ) : (
      <SubjectPanel rows={model.breakdown.rows} previous={model.previousBySubject} linked />
    ),
  quality: ({ model }) => (
    <QualityPanel
      summary={model.qualitySummary}
      findings={model.ratingRows}
      bands={model.ratingBands}
      span={model.spanText}
      depth={model.ratingDepth}
      aside={<DepthPicker value={model.ratingDepth} onPick={model.setDepth} />}
    />
  ),
  'quality-grid': ({ model }) => <QualityGridPanel cells={model.ratingGrid} summary={model.qualitySummary} depth={model.ratingDepth} />,
  targets: TargetsView,
  'first-reads': ({ model, shared }) => <FirstReads tasks={model.tasks} goals={shared.data.goals.data?.goals ?? []} />,
  'told-us': ({ model }) =>
    model.background && model.background.facts.length > 0 ? (
      <WhatYouToldUs
        background={model.background}
        credit={model.maturity.credit ?? 0}
        waiting={model.waitFor('recommendations') > 0 || model.waitFor('insights') > 0}
        nameOf={model.nameOf}
      />
    ) : (
      <Note>Nothing here yet. Your About you answers show up here.</Note>
    ),
  stage: ({ model, config }) => {
    const show = list(config, 'show');
    return (
      <div className="sp-panel-stack">
        {show.includes('away') && <AwayNotice maturity={model.maturity} />}
        {show.includes('ladder') && <StageLadder maturity={model.maturity} />}
        {show.includes('next') && (
          <>
            <FirstMilestone maturity={model.maturity} />
            <StageNote maturity={model.maturity} />
            <Upcoming activeDays={model.maturity.activeDays} />
          </>
        )}
        {show.includes('note') && <ActiveDayPrinciple />}
      </div>
    );
  },
  observations: ({ model, config }) =>
    model.observed.length ? (
      <div className="ax-observe-stack">
        {model.observed.slice(0, whole(config, 'limit')).map((finding) => (
          <ObservationNote key={finding.key} observation={finding} />
        ))}
      </div>
    ) : (
      <Note>Nothing holds up yet. A few more days of work and patterns show up here.</Note>
    ),

  plan: PlanView,
  diagnosis: ({ model, config }) => {
    const items = model.diagnoses.slice(0, whole(config, 'limit'));
    const struggle = model.reasons.struggle[0];
    return items.length ? (
      <DiagnosisCards items={items} />
    ) : (
      <DiagnosisEmpty
        enoughRecord={model.recent.previous.length >= 7}
        reported={struggle ? { phrase: struggle.phrase, count: struggle.count } : null}
      />
    );
  },
  followup: ({ model, shared, config }) => model.reviews.length === 0 ? (
    <Note>Nothing to follow up on yet. When you take up a suggestion, how it went shows up here.</Note>
  ) : (
    <FollowupPanel
      reviews={model.reviews.slice(0, whole(config, 'limit'))}
      summary={model.reviewSummary}
      onDrop={shared.data.dropAdopted}
      dropping={shared.data.dropping}
    />
  ),
  coach: CoachView,
  lens: ({ model, config }) =>
    model.lens ? (
      text(config, 'style') === 'line' ? <LensLine lens={model.lens} /> : <LensCard lens={model.lens} />
    ) : (
      <Note>No goal to build the plan around yet. Add one with a deadline.</Note>
    ),
  'xp-pulse': ({ model }) => <XpPulse all={model.all} current={model.slice.current} />,

  changed: ({ model, config }) =>
    model.waitFor('insights') > 0 ? (
      <Note>{`This opens after ${model.waitFor('insights')} more days of work.`}</Note>
    ) : (
      <>
        <EarlyRead days={model.historyDays} solidAt={SOLID_AT.insights} />
        <ChangedPanel changes={model.changes.slice(0, whole(config, 'limit'))} window={model.changeWindow} />
      </>
    ),
  'habit-tiles': ({ model }) => (
    <>
      <EarlyRead days={model.historyDays} solidAt={SOLID_AT.habits} />
      <HabitTiles summary={model.summary} span={model.spanText} />
    </>
  ),
  'habit-lead': ({ model, config }) =>
    !model.habits.length ? (
      <Note>Nothing repeats often enough to be a habit yet.</Note>
    ) : text(config, 'style') === 'line' ? (
      <TabOpening>{habitLead(model.summary, model.spanText)}</TabOpening>
    ) : (
      <HabitOpening summary={model.summary} span={model.spanText} leadWithStrength={model.toneRules.leadWithStrength} />
    ),
  'habit-patterns': ({ model, config }) => <PatternsPanel patterns={model.patterns} limit={whole(config, 'limit')} />,
  habits: ({ model, config }) => (
    <HabitCards habits={model.habits.slice(0, whole(config, 'limit'))} todayIso={model.toIso} effects={model.effects} />
  ),
  'habit-steady': ({ model }) => <HabitConsistencyPanel habits={model.habits} />,
  'habit-timeline': ({ model }) => <TimelinePanel habits={model.habits} shifts={model.shifts} />,
  'say-do': ({ shared }) => (
    <SayVsDo mood={shared.data.mood.data ?? null} said={shared.data.said.data ?? null} reloadSaid={() => shared.data.said.reload()} />
  ),
  'best-worst': ({ model }) => <RatedTasksPanel rated={model.rated} summary={model.qualitySummary} />,
  why: ({ model, config }) => (
    <WhyPanel
      findings={model.why.slice(0, whole(config, 'limit'))}
      notice={unlock(model.slice.current.length, NEED_DAYS.insights, 'why your last stretch went the way it did')}
    />
  ),
  how: ({ model, config }) => (
    <HowPanel
      findings={model.how.slice(0, whole(config, 'limit'))}
      notice={unlock(model.slice.current.length, NEED_DAYS.insights, 'how you tend to work')}
    />
  ),
  links: ({ model }) => (
    <RelationshipsPanel relationships={model.links} notice={unlock(model.slice.current.length, NEED_DAYS.insights, 'what goes with what')} />
  ),
  reasons: ({ model }) =>
    model.ratingDepth === 'reasons' ? (
      <ReasonsPanel reasons={model.reasons} findings={model.reasonRows} depth={model.ratingDepth} span={model.spanText} />
    ) : (
      <div className="sp-panel-ask">
        <Note>Pick "+ Reasons" to be asked what made a task go well or badly. Your answers fill this in.</Note>
        <DepthPicker value={model.ratingDepth} onPick={model.setDepth} />
      </div>
    ),
  clock: ({ model }) => <ClockPanel clock={model.clock} />,
  week: ({ model }) => <WeekPanel week={model.week} />,
  'early-when': ({ model }) => (
    <WhenPanel parts={partsOfDay(subjectTasks(model), model.fromIso, model.toIso)} days={model.maturity.activeDays} />
  ),
  finishes: ({ model }) => <FinishPanel tasks={model.tasks} days={model.maturity.activeDays} />,
  'follow-through': ({ model, shared, config }) => {
    const show = list(config, 'show');
    const omit = (['scores', 'calendar', 'planned', 'depth', 'stability', 'trail', 'recovery'] as FocusPart[]).filter((part) => !show.includes(part));
    return (
      <div className="gr-scope">
        <FocusChapter all={model.all} tasks={model.tasks} subjects={shared.subjects} omit={omit} />
      </div>
    );
  },

  'skills-chapter': ({ model, shared }) => (
    <div className="gr-scope">
      <SkillsChapter all={model.all} tasks={model.tasks} subjects={shared.subjects} />
    </div>
  ),
  'goal-lines': ({ model }) => {
    const limiters = limitersShown(model.goalLimits, model.breakdown.rows);
    return model.namedSubjects.total > 0 || limiters.length > 0 ? (
      <GoalLines named={model.namedSubjects} limiters={limiters} />
    ) : (
      <Note>No subjects worked in this time range yet.</Note>
    );
  },
  'tree-depth': ({ model, config }) => (
    <TreeDepthPanel tasks={model.tasks} limit={whole(config, 'limit')} empty={<Note>No skill tree XP yet. Finish a task in a subject to start.</Note>} />
  ),
  'subject-opens': ({ model, shared, config }) => (
    <SubjectOpensPanel
      rows={model.breakdown.rows}
      subjects={shared.subjects}
      username={shared.data.username}
      limit={whole(config, 'limit')}
      empty={<Note>No subjects worked in this time range yet.</Note>}
    />
  ),
  'skill-growth': SkillGrowthView,
  'skill-levels': SkillLevelsView,
  'time-progress': TimeProgressView,
  'skill-shape': ({ model }) => <SkillShapePanel rows={model.skills} nameOf={model.nameOf} />,
  'core-hours': ({ model }) => <CoreHoursPanel clock={model.clock} />,
  years: ({ model }) => (
    <div className="gr-scope">
      <YearOnYear model={model} />
    </div>
  ),
};

function HeatView({ model, config }: ModelProps) {
  const range = text(config, 'range') as HeatWindowKey;
  const rows = useMemo(() => heatmapGrid(model.all, range), [model.all, range]);
  return <ConsistencyPanel rows={rows} />;
}

function TargetsView({ model, shared }: ModelProps) {
  const navigate = useNavigate();
  const aim = shared.data.baseline.data?.baseline ?? null;
  const edit = () => navigate('/analytics?setup=1');
  if (!aim) {
    return (
      <section className="ax-baseline-offer">
        <strong>No targets set yet.</strong>
        <button type="button" className="ax-btn ax-btn-primary" onClick={edit}>
          Set targets
        </button>
      </section>
    );
  }
  return (
    <BaselinePanel
      aim={aim}
      setOn={aim.set_on}
      activeRate={model.rhythm.activeRate}
      typicalSession={model.rhythm.typicalSession}
      span={model.spanText}
      tone={model.tone}
      onEdit={edit}
    />
  );
}

/** The plan reads its own minutes, so two plans on one page can be set differently. */
function PlanView({ model, config, set }: ModelProps) {
  const budget = whole(config, 'budget');
  const limit = whole(config, 'limit');
  const { username } = useAuth();
  const call = useCallback(
    () => (username ? nextService.nextActions(budget) : Promise.resolve({ success: false as const, message: 'Sign in to see what to do next.' })),
    [budget, username],
  );
  const next = useApi<NextResult>(call, [budget, username]);
  const plan = next.data?.plan ?? NO_PLAN;
  if (next.loading && !next.data) return <Note>Loading…</Note>;
  return (
    <NextActions
      plan={{ ...plan, actions: plan.actions.slice(0, limit) }}
      onBudget={(minutes) => set({ budget: minutes })}
      typicalSession={model.rhythm.typicalSession}
      onRefresh={() => next.reload()}
    />
  );
}

function CoachView({ model, config }: ModelProps) {
  const facts = useKnows(model);
  return <Knows facts={facts.slice(0, whole(config, 'limit'))} />;
}

function SkillGrowthView({ model, config }: ModelProps) {
  const { tracks, context, periodText } = useSkillGrowth(model, text(config, 'period') as PeriodKey);
  return (
    <Panel title="Skill growth" note={`How your level in each subject moved over ${periodText}`}>
      <SkillGrowthPanel tracks={tracks} periodText={periodText} limit={whole(config, 'limit')} context={context} />
    </Panel>
  );
}

function SkillLevelsView({ shared, config }: ModelProps) {
  const practice = useSkillAttempts(shared.data.username);
  return (
    <Panel title="Skills by level" note="Each skill tree step, based on problems you got right or wrong">
      <SkillLevelsPanel practice={practice} periodText="all your work" limit={whole(config, 'limit')} />
    </Panel>
  );
}

function TimeProgressView({ model, config }: ModelProps) {
  const { progress, periodText } = useSkillGrowth(model, text(config, 'period') as PeriodKey);
  return (
    <Panel title="Time vs. progress" note="Hours in, work out, and whether the level moved with them">
      <TimeProgressPanel progress={progress} periodText={periodText} />
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Read on their own
// --------------------------------------------------------------------------
/** The growth periods, for the period the block is set to. */
function usePeriods(period: PeriodKey) {
  const { username } = useAuth();
  const call = useCallback(
    () => (username ? analyticsService.growthPeriods(period) : Promise.resolve({ success: false as const, message: 'Sign in to see your growth.' })),
    [period, username],
  );
  return useApi<GrowthPeriods>(call, [period, username]);
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function PeriodsView({ config, set }: Base) {
  const period = text(config, 'period') as PeriodKey;
  const periods = usePeriods(period);
  const data = periods.data;
  if (!data) return <Note>{periods.error ?? 'Loading…'}</Note>;
  const pick = (next: PeriodKey) => set({ period: next });
  switch (config.kind) {
    case 'growth-line':
      return (
        <GrowthTimelinePanel
          data={data}
          lines={list(config, 'show') as Array<PeriodMetric | 'overall'>}
          onLines={(show) => set({ show })}
          aside={<PeriodTabs cards={data.periods} active={period} onPick={pick} busy={periods.refreshing} />}
        />
      );
    case 'then-now':
      return (
        <Panel
          title="Then and now"
          note={data.previous ? `${data.label} vs. the ${data.days} days before` : "All your work. There's nothing earlier to compare with."}
        >
          <ThenNow data={data} />
        </Panel>
      );
    case 'movers':
      return <MoversView data={data} show={list(config, 'show')} />;
    case 'score-changes':
      return <ScoreChangesPanel data={data} />;
    case 'periods':
      return <PeriodCards cards={data.periods} active={period} onPick={pick} busy={periods.refreshing} />;
    default:
      return (
        <Panel title="Milestones" note="Days your score hit a new grade">
          <MilestoneFeed entries={milestones(data, whole(config, 'limit'))} format={shortDate} />
        </Panel>
      );
  }
}

function MoversView({ data, show }: { data: GrowthPeriods; show: string[] }) {
  const moved = useMemo(() => movers(data), [data]);
  return (
    <div className="ax-gp-stack">
      {show.includes('best') && <MoverPanel kind="best" mover={moved.best} now={data.current} then={data.previous} data={data} />}
      {show.includes('worst') && <MoverPanel kind="worst" mover={moved.worst} now={data.current} then={data.previous} data={data} />}
    </div>
  );
}

function BadgesView({ config }: Base) {
  const { username } = useAuth();
  const call = useCallback(
    () => (username ? badgeService.getAchievements() : Promise.resolve({ success: false as const, message: 'Sign in to see your badges.' })),
    [username],
  );
  const badges = useApi(call, [username]);
  const which = text(config, 'which') as 'earned' | 'next' | 'all';
  const shown = useMemo(
    () => pickBadges(badges.data?.achievements ?? [], { category: text(config, 'category'), which, limit: whole(config, 'limit') }),
    [badges.data, config, which],
  );
  if (!badges.data) return <Note>{badges.error ?? 'Loading…'}</Note>;
  if (!shown.length) return <Note>{which === 'earned' ? 'No badges earned here yet.' : 'Nothing left to earn here.'}</Note>;
  return (
    <div className="sp-ac">
      <ul className="ac-grid">
        {shown.map((badge) => (
          <BadgeTile badge={badge} key={badge.id} />
        ))}
      </ul>
    </div>
  );
}

const SELF_VIEWS: Partial<Record<PanelKind, (props: Base) => ReactNode>> = {
  sessions: () => <NextSessionsPanel where="analytics" />,
  'goals-finished': () => <GoalsFinishedView />,
  badges: BadgesView,
  'growth-line': PeriodsView,
  'then-now': PeriodsView,
  movers: PeriodsView,
  'score-changes': PeriodsView,
  periods: PeriodsView,
  milestones: PeriodsView,
};

/** Goals finished draws nothing until there is one, which on a page reads as a broken block. */
function GoalsFinishedView() {
  return <GoalsFinished empty={<Note>No goals finished yet. Goals you mark done show up here.</Note>} />;
}

// --------------------------------------------------------------------------
// From the focus clock
// --------------------------------------------------------------------------
const CLOCK_VIEWS: Partial<Record<PanelKind, (props: ClockProps) => ReactNode>> = {
  timer: ({ clock, config }) => {
    const { pomodoro, session } = clock;
    const show = list(config, 'show');
    return (
      <div className="sp-timer">
        <FocusPanel session={session} pomodoro={pomodoro} />
        {show.includes('task') && (
          <p className="sp-timer-task">
            <span>Working on</span>
            <strong>{pomodoro.task ? pomodoro.task.title : 'No task picked'}</strong>
          </p>
        )}
        {show.includes('method') && (
          <MethodPicker levelId={pomodoro.level.id} styleId={pomodoro.style.id} onLevel={pomodoro.setLevel} onStyle={pomodoro.choose} />
        )}
      </div>
    );
  },
  'timer-task': TaskView,
  'timer-today': ({ clock, config }) => {
    const days = whole(config, 'days');
    const today = new Date();
    const rows = byTask(clock.pomodoro.intervals, iso(shift(today, 1 - days)), iso(today));
    return <TodaySittings rows={rows} days={days} />;
  },
  'timer-recent': ({ clock, config }) => <RecentSessions rows={clock.pomodoro.intervals} limit={whole(config, 'limit')} />,
  'timer-suggest': ({ clock }) => {
    const { pomodoro } = clock;
    const at = recommend(pomodoro.intervals, pomodoro.kind) ?? recommend(pomodoro.intervals);
    return <Recommend at={at} sittings={pomodoro.intervals.length} current={pomodoro.style.id} onUse={pomodoro.choose} />;
  },
  'timer-chart': FocusChartView,
};

function TaskView({ clock, config }: ClockProps) {
  const account = useUserData();
  const { pomodoro } = clock;
  const limit = whole(config, 'limit');
  const today = useMemo(() => new Date(), []);
  const choices = useMemo(() => {
    const open = (account.data?.tasks ?? [])
      .filter((task) => task.status !== 'done')
      .sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'));
    const picked = pomodoro.task ? open.find((task) => task.id === pomodoro.task!.id) : undefined;
    return (picked ? [picked, ...open.filter((task) => task.id !== picked.id)] : open).slice(0, limit);
  }, [account.data, limit, pomodoro.task]);
  if (!account.data) return <Note>Loading…</Note>;
  return <TaskPicker tasks={choices} picked={pomodoro.task?.id ?? null} onPick={pomodoro.setTask} today={today} />;
}

/** Focus minutes or sessions per day, from the session log. */
function FocusChartView({ clock, config }: ClockProps) {
  const days = whole(config, 'days');
  const metric = text(config, 'metric');
  const style = text(config, 'style');
  const { intervals } = clock.pomodoro;
  const { values, labels, dates } = useMemo(() => {
    const today = new Date();
    const dates = Array.from({ length: days }, (_, at) => iso(shift(today, at - days + 1)));
    const values = dates.map((day) => {
      const rows = intervals.filter((row) => row.day === day);
      return metric === 'sessions' ? rows.length : rows.reduce((sum, row) => sum + row.minutes, 0);
    });
    const labels = dates.map((day) => new Date(`${day}T00:00:00`).toLocaleDateString('en-US', days > 7 ? { month: 'numeric', day: 'numeric' } : { weekday: 'short' }));
    return { values, labels, dates };
  }, [days, intervals, metric]);
  const total = values.reduce((sum, value) => sum + value, 0);
  const unit = metric === 'sessions' ? 'sessions' : 'min';
  const title = `Focus ${metric === 'sessions' ? 'sessions' : 'minutes'} per day, last ${days} days`;
  return (
    <div className="sp-timer-chart">
      <p className="sp-live-kicker">
        <strong>{total.toLocaleString()} {unit}</strong> in the last {days} days
      </p>
      {style === 'area' ? (
        <LineChart series={[{ values, kind: 'area', label: title }]} from={shortDate(dates[0]!)} to="Today" title={title} />
      ) : (
        <Columns values={values} labels={labels} title={title} format={(value) => (metric === 'sessions' ? String(value) : `${value}m`)} />
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Which view, and what it waits for
// --------------------------------------------------------------------------
/** The body of a panel block: the right view, or a line saying what it's waiting for. */
export function PanelView({ config, set }: Base) {
  if (MODEL_VIEWS[config.kind]) return <ModelView config={config} set={set} />;
  if (CLOCK_VIEWS[config.kind]) return <ClockView config={config} set={set} />;
  const Self = SELF_VIEWS[config.kind];
  return Self ? <Self config={config} set={set} /> : <Note>This panel isn't here anymore.</Note>;
}

function ModelView({ config, set }: Base) {
  const shared = useShared();
  const model = usePanelModel(config);
  if (!shared || shared.waiting || !model) return <Note>Loading…</Note>;
  if (!shared.data.series.data) return <Note>{shared.data.series.error ?? "Couldn't load this."}</Note>;
  const View = MODEL_VIEWS[config.kind]!;
  return <View config={config} set={set} model={model} shared={shared} />;
}

function ClockView({ config, set }: Base) {
  const clock = useClock();
  if (!clock) return <Note>Loading…</Note>;
  const View = CLOCK_VIEWS[config.kind]!;
  return (
    <div className="sp-pom">
      <View config={config} set={set} clock={clock} />
    </div>
  );
}

/** Every kind has exactly one view. The registry test holds this. */
export const VIEW_KINDS: ReadonlySet<PanelKind> = new Set([
  ...Object.keys(MODEL_VIEWS),
  ...Object.keys(CLOCK_VIEWS),
  ...Object.keys(SELF_VIEWS),
] as PanelKind[]);
