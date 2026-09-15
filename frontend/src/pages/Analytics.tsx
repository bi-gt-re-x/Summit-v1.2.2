/**
 * Analytics — one page, seven tabs, and the first one is the point.
 *
 * This page was the graded report card, then the long view of an account, and
 * it is now the place the app does its thinking. Analysis split across separate
 * pages in the rail was pages nobody moved between, and the value of the
 * analysis is in the movement — what I do, then why, then what to change. One
 * bar makes that sequence a click instead of a navigation.
 *
 * ## The seven tabs
 *
 * - **Recommendations — how I improve.** Instructions, ranked by what each is
 *   worth, with the arithmetic attached. It never re-states a finding as news.
 *   It leads the bar and owns the rail entry, because it is the only tab that
 *   ends in a button and it used to sit five clicks behind four screens of
 *   description.
 * - **Overview** — productivity, consistency and quality, their trajectory, the
 *   score, and where the account stands. The three rates lead every panel on
 *   this tab; the totals they came from sit behind them. See `Tiles` for why.
 * - **Trends** — the derivative rather than the level, plus the long-term
 *   projection that was the growth page's Long Term chapter.
 * - **Habits — what I do.** Recurring behaviour, counted, plus the growth
 *   page's Focus chapter: whether it can be executed reliably. It never says
 *   *why*: the moment it does, the next tab has no reason to exist.
 * - **Insights — why and how.** Two counts put together, with the evidence for
 *   the connection graded and printed. It never says what to do.
 * - **Subjects** — mastery. The growth page's Subject chapter.
 * - **Records** — achievement, against the reader's own best and their goals.
 *
 * Keeping the middle boundaries sharp is the design decision this page is built
 * around: three tabs that all show cards of numbers are one tab with a broken
 * picker.
 *
 * ## How it holds together
 *
 * **Five calls, one window, seven tabs.** The whole day series (`days: 0`), the
 * account's stats and tasks, the report card, where this account stands against
 * the others, and the baseline. Every panel is arithmetic over the first three
 * — nothing here fetches per tab — and every tab is scoped by the one window
 * picker, so two tabs can never quietly be describing different periods. The
 * exceptions are deliberate: the Overview heatmap always draws a year and the
 * Habits calendar carries its own zoom, because a map of 91 squares and a map
 * of 730 are not the same picture.
 *
 * Standing is the odd call and stays separate: it is the only thing here
 * computed from anybody else's record, so it cannot be arithmetic over the
 * series, and it is unscoped by the window because "where you stand" is a
 * question about the account rather than about a quarter of it.
 *
 * **A tab is a route.** Seven paths render this component and differ only in
 * which view opens. That is what makes the rail, the back button and a pasted
 * link agree about which tab is showing — local state would have broken all
 * three. `/growth` redirects here; see App.tsx.
 *
 * **Everything computes on every render, and that is on purpose.** All of it is
 * memoised against the slice, so switching tabs recomputes nothing; the cost of
 * running the arithmetic for a hidden tab is a few hundred array passes once
 * per window change, and the alternative — children each holding their own
 * memos — would put the arithmetic out of reach of the page that has to decide,
 * before rendering a tab, whether that tab has anything to say.
 *
 * ## Where the page ends and its parts begin
 *
 * This file was 1,879 lines and held the fetching, the arithmetic, the tab
 * bodies and the shell at once, which meant changing one tab's layout required
 * reading all of it. Three seams, in the order a reader meets them:
 *
 * - **`./useAnalyticsData`** — the eight calls and the three writes. How many
 *   requests a visit costs is now a question with a file to open.
 * - **`./useAnalyticsModel`** — every figure the page states. Deliberately one
 *   hook and not seven: the gates and the opening sentence below have to read a
 *   tab's figures *before* deciding whether to render it, and a memo living
 *   inside a tab is a memo the gate cannot see. Two tabs also cannot disagree
 *   about a number that is computed once.
 * - **`./tabs/*`** — seven components that lay out what the model worked out.
 *   They fetch nothing and calculate nothing.
 *
 * What is left here is the shell: the window picker, the gates, the one-sentence
 * opening every tab shares, the baseline screen, and the export.
 *
 * ## The question phase
 *
 * A new account answers six or eight questions before this page draws
 * anything: the three that make a baseline, and the five that decide what the
 * page is — how the reader records work, how blunt it may be, how much of it
 * to draw, which tab opens, and which subjects are worth a page of their own.
 * See ./components/Analytics/Setup for why that is a sequence of screens
 * rather than a card, utils/analyticsPrefs for what each answer changes, and
 * `firstRun` below for the three conditions that decide somebody has genuinely
 * never answered.
 *
 * Every one of the five is read by something the reader can see. Four of them
 * by this page; the fifth — the followed subjects — by the rail, which unfolds
 * the Analytics entry into a page per subject (pages/SubjectAnalytics). That
 * is the rule the settings page is held to and it holds here: a question that
 * stored a value nothing looked at would be worse than not asking it.
 *
 * **Every figure on this page is this account's own.** There is no sample data
 * and no placeholder mode. Four tabs used to fall back to invented figures
 * behind a small chip when the record was too short to fill them; that made a
 * new account's first impression of the analysis a page of numbers about
 * somebody who does not exist, and taught the reader to discount the real ones
 * that arrived later. A tab that cannot be filled now says what it is waiting
 * for and when it opens — see `Building` — and a new account is offered the one
 * thing it can actually do here, which is answer the questions above.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Ambient, ErrorState, Loading, PageHero } from '@/components';
import { stageShows } from '@/utils/dataMaturity';
import {
  AnalyticsSetup,
  Controls,
  GoalsTab,
  habitLead,
  HabitsTab,
  Header,
  InsightsTab,
  OverviewTab,
  RecommendationsTab,
  GrowthTab,
  scoreMovement,
  SubjectsTab,
  Summary,
  TabOpening,
  useAnalyticsData,
  useAnalyticsModel,
  VIEWS,
  ViewTabs,
  viewFor,
  type SetupAnswers,
  type View,
} from '@/components/Analytics';
import { useDocumentTitle, useSettings, useSubjectIndex } from '@/hooks';
import { saveSubjectMilestones } from '@/services/analytics';
import { PATTERN_DAYS, RECENT_DAYS } from '@/utils/recent';
import { buildReport, reportFilename } from '@/utils/report';
import { buildSeriesCsv, seriesFilename } from '@/utils/seriesCsv';
import '@/styles/analytics.css';
/**
 * The chapters' own stylesheet, which came with them.
 *
 * Their markup is `gr-*` classes and its rules read a block of tokens that used
 * to be scoped to `#growthCard` — the id on the growth page's outer card. That
 * card is gone, and the token block and the rules that depended on the ancestor
 * now answer to `.gr-scope`, which the four chapter tabs render inside. See the
 * note at `.gr-scope` in the stylesheet.
 *
 * The `#growthCard` half is gone from the sheet too, along with the rest of the
 * pre-React page it belonged to — its header, its dropdowns, its donut, its tab
 * strip and its `.growth-card` shell, none of which anything has rendered since
 * `/growth` became a React route. That was 1,300 lines, or nearly half the
 * file: a plain `.css` import in Vite is global, so those rules were being
 * shipped and matched against every page in the app, not just this one.
 */
import '@/styles/growth.css';


export default function Analytics() {
  const location = useLocation();
  const navigate = useNavigate();
  const view = viewFor(location.pathname);

  useDocumentTitle(view.title);

  /**
   * Every call this page makes, and every write it does. See ./useAnalyticsData.
   *
   * One hook rather than eight `useApi`s inline, because how many requests a
   * visit to this page costs is a question worth being able to answer by
   * opening one file. Nothing about the calls changed in moving them.
   */
  const data = useAnalyticsData();
  const { username, series, baseline, refresh } = data;

  /**
   * Every figure the page states. See ./useAnalyticsModel.
   *
   * Centralised rather than pushed into the tabs, and that is the whole design
   * of this page: the gates and the opening sentence below have to read a
   * tab's figures *before* deciding whether to render it, which a memo living
   * inside the tab could not provide. The tabs get the answers as props and do
   * nothing but lay them out.
   */
  const subjects = useSubjectIndex(username);
  const model = useAnalyticsModel(data, subjects);

  /**
   * Which tab a bare visit lands on.
   *
   * `/analytics` is the Overview's own path, so an account that asked to open
   * on Recommendations has to be sent there — once, replacing the entry rather
   * than pushing one, or the back button would bounce off this page forever.
   *
   * Three guards. `ready` is what makes "opens on" true at all: preferences
   * arrive a moment after this page mounts, so acting on the built-in default
   * would send everybody to the Overview and then, for anyone who had chosen
   * otherwise, somewhere else a tick later. The ref makes it once per mount,
   * so a reader who navigates back to the Overview on purpose stays there. And
   * it only fires on the Overview's own path — the other six were asked for.
   *
   * The same shape as FrontDoor's redirect for `home_page`, and for the same
   * reason: a redirect cannot be taken back.
   */
  const { prefs, ready, update } = useSettings();
  /**
   * Whether the reader asked for the questions outright.
   *
   * `/analytics?setup=1`, which is what the settings page links to. A query
   * rather than a preference because there is nothing to store: "show me the
   * questions" is a request, not a setting, and storing it would mean
   * remembering to unstore it. It also makes the flow linkable, which the
   * baseline panel's Edit button never was.
   */
  const askedSetup = new URLSearchParams(location.search).get('setup') !== null;

  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || !ready) return;
    landed.current = true;
    // Somebody who followed a link *to the questions* is not making a bare
    // visit, and sending them to their opening tab would drop the request.
    if (askedSetup || view.key !== 'overview') return;
    if (prefs.analytics_home_tab === 'overview') return;
    const target = VIEWS.find((entry) => entry.key === prefs.analytics_home_tab);
    if (target) navigate(target.path, { replace: true });
  }, [askedSetup, navigate, prefs.analytics_home_tab, ready, view.key]);
  /* The page reads a dozen of the model's eighty figures — the gates, the
     opening sentence and the export. Everything else goes to a tab whole. */
  const {
    span, chooseSpan, option, spanText, subject, setSubject, subjectOptions, waitFor,
    maturity, streak, analytical, hasReportCard, figures, insights, breakdown, banked, recentSubjects,
    discovered, diagnoses, advice, plan, recorded, state, goalSet, habits, summary,
  } = model;
  // ---- The shell ----------------------------------------------------------

  /**
   * The written report the Export button downloads.
   *
   * A callback rather than a value: building it costs a few milliseconds of
   * string work and there is no reason to pay that on every render of a page
   * whose export most visits never touch. Returns null when there is no report
   * card yet, which is what disables the button — a file full of dashes is
   * worse than no file.
   *
   * Everything below is already derived by the module that owns it. This only
   * gathers, so a figure in the export and the same figure on screen are the
   * same figure by construction rather than by two people remembering to keep
   * them in step.
   */
  const report = useCallback((): string | null => {
    if (!hasReportCard) return null;
    return buildReport({
      username: username ?? 'account',
      generatedAt: new Date(),
      span: spanText,
      adviceDays: RECENT_DAYS,
      patternDays: PATTERN_DAYS,
      score: analytical,
      figures,
      insights,
      streak,
      bankedXp: banked,
      subjectRows: breakdown.rows,
      subjectQuality: recentSubjects.rows,
      patterns: discovered,
      diagnoses,
      advice,
      plan: plan.actions,
      planBudget: plan.budget,
    });
  }, [
    advice,
    analytical,
    banked,
    breakdown.rows,
    diagnoses,
    discovered,
    figures,
    insights,
    plan,
    hasReportCard,
    recentSubjects.rows,
    spanText,
    streak,
    username,
  ]);

  /**
   * The rows behind the report, for the reader who wants to check it.
   *
   * The window's own days and not the whole record, so this file and the
   * written one describe the same period — see utils/seriesCsv. A callback for
   * the same reason `report` is: most visits never press either button, and
   * joining ten thousand strings on every render to be ready for one that
   * usually does not come is work nobody asked for.
   */
  const exportData = useCallback(() => buildSeriesCsv(model.slice.current), [model.slice]);

  const openView = useCallback((next: View) => navigate(next.path), [navigate]);

  // ---- The question phase -------------------------------------------------
  /**
   * Whether the setup screen is showing.
   *
   * Three states rather than two, which is why this is not just a boolean off
   * the stored flag. A first-run account is shown the screen because it has
   * nothing else to do here; an account that skipped is shown the page,
   * because insisting would be a wall rather than an offer; and an account
   * that has answered can open the screen again from the baseline panel to
   * change its answers. `null` means "decide from the record", which is the
   * first-run case.
   */
  const [editingSetup, setEditingSetup] = useState<boolean | null>(null);
  const aim = baseline.data?.baseline ?? null;

  /**
   * The one write the screen makes, and it is deliberately one.
   *
   * Eight questions, two stores — the baseline is a table of its own
   * (backend/api/analytics.py) and the five preferences are keyed rows beside
   * every other preference. Both go out from here, and the flag that closes
   * the screen for good travels with the preferences rather than as a third
   * write: an account whose preferences landed and whose flag did not would be
   * asked the whole thing again next visit.
   *
   * The baseline is the required half. It is what the panels measure against,
   * so if it fails there is nothing to show and the screen says so; the
   * preferences all have defaults that are already in force, so losing them
   * costs the reader a trip to settings rather than the page.
   */
  const saveSetup = useCallback(
    async (answers: SetupAnswers) => {
      const saved = await data.saveBaseline(answers.baseline);
      if (!saved) return false;
      await update({ ...answers.prefs, analytics_setup_done: true });
      /* Three stores now, and the third is the loosest of them on purpose.
         Checkpoints are their own row rather than a preference, so they are
         their own call — and a failure here is a subject whose stages did not
         save, over a page that is otherwise fully configured. That is worth
         far less than blocking the flow on it, which is why nothing waits on
         the result and the screen closes either way. */
      await Promise.all(
        Object.entries(answers.milestones).map(([subject, titles]) =>
          saveSubjectMilestones(
            subject,
            titles.map((title, at) => ({ id: `m${at}-${Date.now()}`, title, done: false })),
          ),
        ),
      );
      setEditingSetup(false);
      return true;
    },
    [data, update],
  );


  /**
   * Whether the setup screen takes the page over.
   *
   * Only on an account that has genuinely never answered. Three conditions,
   * and each rules out a different way of being wrong about that:
   *
   * - the preferences have to have arrived, or the flag being false is the
   *   built-in default rather than this account's answer, and every reader
   *   gets the wizard for a tick on the way in;
   * - the baseline call has to have answered, for the same reason;
   * - an account that set a baseline *before* the flag existed has answered
   *   the questions that matter and is left alone. That is the whole of the
   *   migration, and it lives here rather than in a backfill because the
   *   condition is a statement about what the page knows rather than about
   *   what is in the table.
   */
  const firstRun =
    ready &&
    !prefs.analytics_setup_done &&
    !baseline.loading &&
    baseline.data !== null &&
    aim === null;
  const showSetup = editingSetup ?? (firstRun || askedSetup);

  if (series.loading) return <Loading label="Reading your history" />;
  if (!series.data) {
    return (
      <ErrorState
        message={series.error ?? 'No analytics yet.'}
        onRetry={username ? refresh : undefined}
      />
    );
  }

  /*
   * The tab's opening line — one sentence, one slot, all seven tabs.
   *
   * None of these sentences is written here. Each is assembled somewhere that
   * already knew how, from that tab's own figures, and three of them used to be
   * the lead paragraph of a panel further down their own tab. Those panels gave
   * them up rather than printing them twice.
   *
   * Guarded by the same conditions the tab bodies use, so a tab still waiting
   * for record does not open with a confident sentence sitting above a notice
   * saying it has nothing to say yet.
   */
  const opening = ((): React.ReactNode => {
    switch (view.key) {
      case 'overview':
        /* Nothing until a fortnight of recorded work. `Summary` leads with a
           score out of a hundred and a letter grade, and that is the most
           confident claim the page makes about a person — on day two it is
           arithmetic over an empty record, and on day nine it is a verdict
           passed on somebody the app has barely met.
           
           Suppressed for the same three stages that hold `ScorePanel` and
           `StandingPanel` back on the tab itself, so the grade, its chart and
           its percentile all arrive together rather than one of them turning
           up a week before the other two. The tab's own opening below a
           fortnight is `Collecting` or `StageNote`, which say the true thing
           instead. See utils/dataMaturity. */
        if (!stageShows(maturity.stage).judgement) return null;
        /* The one tab whose opening is a block rather than a line. Everything
           it states is already in scope here — which is why it lives in this
           slot rather than inside `OverviewView`, which would need four more
           props to say the same thing. */
        return (
          <Summary
            score={analytical}
            movement={scoreMovement(recorded)}
            /* Reorders one pair of rows and adds one clause — see the prop's
               own note. No figure in the block changes with it. */
            tone={model.tone}
            topAdvice={advice[0]?.title ?? null}
            adviceCount={advice.length}
            phase={waitFor('insights') === 0 ? state.phase : null}
            /* What it is read from, until "enough" is the honest answer. The
               score is the mean of five measures and it swings a long way on
               one good week at this length — a fact about the number rather
               than a hedge, so it sits beside it. */
            basis={
              stageShows(maturity.stage).note
                ? `Read from ${maturity.activeDays} days of your work. It will settle as you record more.`
                : null
            }
            goals={
              goalSet.active > 0
                ? { active: goalSet.active, behind: goalSet.atRisk + goalSet.offTrack }
                : null
            }
          />
        );
      case 'goals':
        return goalSet.active > 0 ? (
          <TabOpening tone={goalSet.atRisk + goalSet.offTrack > 0 ? 'down' : 'up'}>
            <strong>{goalSet.active}</strong> {goalSet.active === 1 ? 'goal is' : 'goals are'}{' '}
            live
            {goalSet.atRisk + goalSet.offTrack > 0 ? (
              <>
                , and <strong>{goalSet.atRisk + goalSet.offTrack}</strong> of them{' '}
                {goalSet.atRisk + goalSet.offTrack === 1 ? 'is' : 'are'} behind.
              </>
            ) : (
              <>, and none of them is behind.</>
            )}
          </TabOpening>
        ) : null;
      case 'habits':
        return waitFor('habits') === 0 && habits.length > 0 ? (
          <TabOpening>{habitLead(summary, spanText)}</TabOpening>
        ) : null;
      case 'insights':
        return waitFor('insights') === 0 ? <TabOpening>{state.sentence}</TabOpening> : null;
      case 'recommendations':
        return advice.length > 0 ? (
          <TabOpening>
            {advice.length} {advice.length === 1 ? 'change is' : 'changes are'} worth making here.
            The first is <strong>{advice[0]!.title.toLowerCase()}</strong>.
          </TabOpening>
        ) : null;
      case 'subjects':
        return breakdown.rows.length > 0 ? (
          <TabOpening>
            <strong>{breakdown.rows.length}</strong>{' '}
            {breakdown.rows.length === 1 ? 'subject has' : 'subjects have'} XP in {spanText}, and{' '}
            <strong>{breakdown.rows[0]!.label}</strong> is the furthest along.
          </TabOpening>
        ) : null;
      case 'growth':
        /* Nothing. This is the one tab whose opening line is the reading
           itself — `growthArc`, drawn by the tab — and a streak count above it
           would be a second, shorter, unrelated headline competing with the
           sentence the whole page exists to state. */
        return null;
      default:
        return null;
    }
  })();


  return (
    <div className="ax-page">
      <Ambient />
      {/* No `pg-enter` here, unlike every other page. This one has its own
          arrival and always did — `.ax-panel` and the tiles carry `ax-enter`,
          which is the same fade and the same ten pixels, and the charts inside
          them wipe on after it (styles/analytics.css, "Arriving"). Adding the
          shared cascade on top ran both at once: the panel would reach half
          opacity behind a section at half opacity and travel the distance
          twice. One entrance per page, and this page already had a richer one. */}
      {/* The view rides on the shell so a tab can tune its own rhythm without
          reaching for the other six. Recommendations is the one that needs it:
          it is the only tab whose panels are read rather than scanned, and at
          the shared 18px the plan, the diagnosis and the cards ran together as
          one wall. */}
      <div className={`ax-shell page-shell ax-view-${view.key}`}>
        {/* Every control on this page, in one card, over that tab's own range.
            The title row, the seven tabs and the window picker were three bare
            bands stacked with gaps between them, so the page opened with three
            seams before it said anything — and the two questions a reader
            actually arrives with, *where am I* and *what am I looking at*, sat
            on opposite sides of one of them. In one card they read as one
            piece of chrome, and the sky changes with the tab, so pressing one
            is something the reader *sees* rather than something they confirm
            by re-reading the title. See components/Hero.tsx. */}
        <PageHero variant={`analytics-${view.key}`} tone={view.tone} className="ax-hero">
          <Header
            view={view}
            span={spanText}
            onExport={report}
            exportName={reportFilename(username ?? 'account', new Date())}
            onExportData={model.slice.current.length > 0 ? exportData : undefined}
            dataName={seriesFilename(username ?? 'account', new Date())}
          />
          <ViewTabs active={view.key} onView={openView} />
          {/* Not during setup, for the same reason the tab body is not: a
              window picker over a page with nothing in it to scope is a
              control that does nothing. The tabs stay, because they are the
              way out. */}
          {!showSetup && (
            <Controls
              chosen={span}
              onWindow={chooseSpan}
              subject={subject}
              onSubject={setSubject}
              subjects={subjectOptions}
              compareLabel={option.compare}
            />
          )}
        </PageHero>

        {/* The setup screen is the only thing under the hero when it is open —
            that is the whole point of it. The controls it used to replace are
            in the hero now and hidden from there. */}
        {showSetup ? (
          <AnalyticsSetup
            subjects={subjectOptions}
            current={aim}
            setOn={aim?.set_on ?? ''}
            prefs={prefs}
            onSave={saveSetup}
            onSkip={() => setEditingSetup(false)}
          />
        ) : (
          <>
        {/* One sentence, same place, every tab. See `TabOpening`. */}
        {opening}

        {view.key === 'overview' && (
          <OverviewTab model={model} data={data} onEditBaseline={() => setEditingSetup(true)} />
        )}

        {view.key === 'goals' && <GoalsTab model={model} />}
        {view.key === 'habits' && <HabitsTab model={model} subjects={subjects} />}
        {view.key === 'insights' && <InsightsTab model={model} />}
        {view.key === 'recommendations' && <RecommendationsTab model={model} data={data} />}
        {view.key === 'subjects' && (
          <SubjectsTab model={model} subjects={subjects} username={username} />
        )}
        {view.key === 'growth' && <GrowthTab model={model} />}
          </>
        )}
      </div>
    </div>
  );
}
