/**
 * The page's own chrome: its title row, its major tabs, and its controls.
 *
 * Overview used to carry a second bar under this one — Overview / Long Term /
 * Milestones / Goals Progress / Trajectory / Benchmarks — that scrolled to a
 * block rather than opening one. It is gone. Two tab bars stacked on one screen
 * read as one broken control: the top row swapped the page and the row directly
 * under it did not, and nothing about the two told a reader which was which.
 * The bar was also lying in two places — Goals Progress pointed at Long Term
 * because this page has no goals panel, and its labels were in a different
 * order than the sections they named. Overview is one continuous argument and
 * scrolls like one.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { HeroTone } from '@/components';
import { WINDOWS, type WindowKey } from './data';

// --------------------------------------------------------------------------
// The major tabs
// --------------------------------------------------------------------------
export type ViewKey =
  | 'recommendations'
  | 'overview'
  | 'goals'
  | 'habits'
  | 'insights'
  | 'subjects'
  | 'growth';

export interface View {
  key: ViewKey;
  label: string;
  /** Its own URL, so a tab can be linked to and the back button works. */
  path: string;
  /**
   * The one-line statement of what this tab is for and what it is not.
   *
   * Printed under the page title, so it is on screen for the tab that is open
   * rather than only in a tooltip on the six that are not. Each view used to
   * carry a second, shorter `blurb` for that slot — "Where you stand." against
   * "The long view: totals, trajectory and where the account stands" — two
   * sentences saying one thing at two lengths, and the longer, more useful one
   * was the one nobody saw. It took the slot; the short one went.
   */
  purpose: string;
  title: string;
  /**
   * The sky over this tab, and the range drawn under it.
   *
   * Seven tabs share one page, one title row and one set of controls, so the
   * only thing that tells a reader the page changed when they pressed a tab is
   * what is written in it — and on the three that all show cards of numbers,
   * that is not much. A tab's colour changes the whole hero the moment it
   * opens, which makes the switch something you see rather than something you
   * verify by reading. See components/Hero.tsx for the eight, and
   * styles/summit.css for what each one is made of.
   *
   * The pairings are not arbitrary: Recommendations is amber because it is the
   * only tab that asks for something, Subjects is green because that is what
   * growth is coloured everywhere else in the app, and Overview keeps the
   * violet the page has always been.
   */
  tone: HeroTone;
}

/**
 * The seven views, in the order they are meant to be read.
 *
 * **Recommendations leads, and that is a change from how this page was built.**
 * The old order was an editorial sequence — the long view, then the direction,
 * then what I do, then why, then what to change — which is the right order for
 * somebody with a year of record and the wrong one for everybody else. It put
 * the only tab that ends in a button five clicks from the rail, behind four
 * screens of description. A reader who never reaches it got a report; a reader
 * who opens on it gets something to do. The sequence still exists for anyone
 * who wants it, and every tab still hands off to the next.
 *
 * The three tabs in the middle have deliberately sharp boundaries, because
 * three tabs that all show cards of numbers are one tab with a broken picker:
 *
 * - **Habits — what I do.** Counts of recurring behaviour. Visual, historical.
 *   Never says why.
 * - **Insights — why and how I do it.** Two counts put together and what the
 *   connection looks like, with the evidence graded. Never says what to do.
 * - **Recommendations — how I improve.** Instructions with a number and the
 *   arithmetic behind it attached. Never re-states a finding as news.
 *
 * **Subjects and Records came from the growth page**, which no longer exists as
 * a page of its own. It carried five tabs drawn from the same fetch as this one
 * and overlapping it in four places — its own heatmap, its own milestones, its
 * own donut, its own insight list, each a lower-resolution copy of a panel that
 * is on one of these tabs already. Its Overview dissolved into this one's; its
 * Long Term chapter went to Trends and its Focus chapter to Habits, which is
 * where each of them was answering the same question at higher resolution. Ten
 * tabs across two pages, one rail entry apiece, became seven here.
 *
 * Each is a route rather than local state so that the rail, the browser's back
 * button and a pasted link all agree about which tab is open.
 */
export const VIEWS: View[] = [
  {
    key: 'recommendations',
    label: 'Recommendations',
    path: '/recommendations',
    purpose: 'What to change, ranked by what it would actually be worth.',
    title: 'Recommendations',
    tone: 'amber',
  },
  {
    key: 'overview',
    label: 'Overview',
    path: '/analytics',
    purpose: 'The long view — totals, trajectory and where the account stands.',
    title: 'Overview',
    tone: 'violet',
  },
  {
    key: 'goals',
    label: 'Goals',
    // A level down from `/goals`, which is the goals page — the same split
    // `/analytics/records` makes against `/records`. That page is where a goal
    // is made, edited and worked; this tab is about the set of them.
    path: '/analytics/goals',
    purpose: 'Whether what you aimed at is going to happen, and what you have not aimed at.',
    title: 'Goals',
    tone: 'blue',
  },
  {
    key: 'habits',
    label: 'Habits',
    path: '/habits',
    purpose: 'What you do — the routines, streaks and rhythms in your own record.',
    title: 'Habits',
    tone: 'teal',
  },
  {
    key: 'insights',
    label: 'Insights',
    path: '/insights',
    purpose: 'Why and how you work — what conditions your better work shows up under.',
    title: 'Insights',
    tone: 'indigo',
  },
  {
    key: 'subjects',
    label: 'Subjects',
    path: '/subjects',
    purpose: 'What you are getting good at — every subject as a level, counted off your own tasks.',
    title: 'Subjects',
    tone: 'green',
  },
  {
    key: 'growth',
    label: 'Growth',
    /*
     * This slot was Records, and the question changed rather than the answer
     * being rearranged.
     *
     * That tab asked where the last thirty days *stand* — a percentile against
     * every other thirty, a pace on each dated goal, a ladder of round
     * numbers. Two of those three had a better home already: goal pacing is
     * the Goals tab's whole job, and the round numbers are what the /records
     * page is for. Only the percentile was a statement about the account over
     * time rather than about this month, and it came across to this tab.
     *
     * `/analytics/records` redirects here rather than 404ing, for the reason
     * `/trends` redirects to `/analytics/goals`: it was a tab with its own URL
     * for long enough to be bookmarked. Note that `/growth` — the old
     * server-rendered path — still redirects to `/analytics`, so the short
     * path and the tab named Growth are not the same destination.
     */
    path: '/analytics/growth',
    purpose: 'How far you have actually come — every year side by side, and what changed.',
    title: 'Growth',
    tone: 'rose',
  },
];

export function viewFor(pathname: string): View {
  return VIEWS.find((view) => view.path === pathname) ?? VIEWS[0]!;
}

export interface ViewTabsProps {
  active: ViewKey;
  onView: (view: View) => void;
  /**
   * How far along each tab that has a threshold is, keyed by view.
   *
   * Passed rather than computed here: `NEED_DAYS` and the account's active-day
   * count both live on the model, and a bar that worked them out again would
   * be a second answer to a question the tab underneath already answers.
   * Absent for the four tabs that have no threshold, and absent entirely once
   * they have all opened.
   */
  filling?: Partial<Record<ViewKey, { have: number; need: number }>>;
}

/**
 * The seven major tabs — the page's only tab bar.
 *
 * A line of prose under the bar used to say what the open tab was for. That was
 * removed because it read as a paragraph of explanation sitting above every
 * screen forever, and the sentence became a `title` on each button — which put
 * it behind a hover, on the six tabs the reader is not looking at.
 *
 * It is under the page title now: one sentence, for the tab that is actually
 * open, in a slot that already existed. The `title` stays, because on the other
 * six it is still the only thing that says where a label goes.
 *
 * ## The three that are still filling
 *
 * Every tab is visible and clickable from the first day, which is the right
 * call — a bar that grows as an account ages teaches a reader that the product
 * is mostly unavailable to them, and hiding a tab is the surest way to make
 * sure nobody ever looks forward to it.
 *
 * But a tab that looks identical to the six beside it and then turns out to be
 * empty reads as a feature the reader does not have. So the three with a
 * threshold carry a hairline of how far along they are: no padlock, no count,
 * nothing to read — just enough for the bar to say *filling* rather than
 * *missing*, with the full explanation one click away where `Building` gives
 * it properly.
 *
 * `title` carries the progress in words, because the hairline is decorative by
 * design and a decorative thing is not something a screen reader should have
 * to interpret.
 */
export function ViewTabs({ active, onView, filling }: ViewTabsProps) {
  return (
    <div className="ax-views">
      <nav className="ax-tabs ax-tabs-major" aria-label="Analytics sections">
        {VIEWS.map((view) => {
          const wait = filling?.[view.key];
          const part = wait && wait.need > 0 ? Math.min(1, wait.have / wait.need) : null;

          return (
            <button
              key={view.key}
              type="button"
              className={`ax-tab${view.key === active ? ' is-on' : ''}${part === null ? '' : ' is-filling'}`}
              aria-current={view.key === active ? 'page' : undefined}
              onClick={() => onView(view)}
              title={
                part === null
                  ? view.purpose
                  : `${view.purpose} Still filling: ${wait!.have} of ${wait!.need} active days.`
              }
            >
              {view.label}
              {part !== null && (
                <span
                  className="ax-tab-fill"
                  aria-hidden="true"
                  style={{ '--at': `${Math.round(part * 100)}%` } as CSSProperties}
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export interface HeaderProps {
  span: string;
  /** Which tab is open. Its title and purpose are the header's. */
  view?: View;
  /**
   * Builds the report to download, or null when there is nothing to write.
   *
   * The page owns this rather than the header, because the report is made of
   * every tab's findings and the header knows about none of them. Returning
   * null disables the button — which is the honest state for an account with
   * no report card yet, rather than a file with dashes in it.
   */
  onExport?: (() => string | null) | undefined;
  /** What the downloaded file is called. */
  exportName?: string;
  /**
   * Builds the CSV of the rows behind the report, or null when there are none.
   *
   * The second half of Export, and a different reader's half. See
   * utils/seriesCsv for why a page making claims this strong keeps a way of
   * checking them, and why this is scoped by the window exactly as the written
   * report is.
   */
  onExportData?: (() => string | null) | undefined;
  dataName?: string;
}

/**
 * The title row, and the page as a document.
 *
 * Export used to write the day series out as a CSV — the rows the charts were
 * drawn from, one line per day. That is the right export for somebody who wants
 * to redo the arithmetic and the wrong one for everybody else: it hands back
 * the page's *input* to a reader who just finished reading its findings. It
 * writes the findings now, as prose, from utils/report.
 *
 * There is no refresh control beside it any more. It was the only button on the
 * page that did nothing a reader could see — every panel here is derived from
 * two reads that happen on mount, the figures do not move while you look at
 * them, and pressing it returned the same page half a second later. The plan on
 * Recommendations has its own re-read, which is a different thing: that one is
 * about the clock, and it says what it does.
 */
export function Header({
  span,
  view,
  onExport,
  exportName,
  onExportData,
  dataName,
}: HeaderProps) {
  const shown = view ?? VIEWS[0]!;

  /* One download path for both buttons. Two copies of the object-URL dance is
     two places to forget the `revokeObjectURL`, which is a leak that never
     shows up in testing because the page is usually navigated away from soon
     after.
     
     ## Why the revoke is deferred and the link is in the document

     It used to revoke on the line after `click()`. A click on a download link
     does not read the blob synchronously — it hands the browser a URL and the
     fetch of it happens after the handler returns — so revoking immediately is
     a race against the download it just started. It is a race the browser
     usually wins on a small file and loses on a big one, which is the worst
     shape a bug can have: the report downloads every time in testing and the
     CSV of a five-year account fails on the machine that needed it.

     A timeout, not a microtask. `queueMicrotask` and `Promise.resolve()` both
     run before the browser gets back to its own work, so neither is any later
     than the line that was there before. The blob is still freed — a minute is
     long past any download starting, and nothing holds it open.

     Appended to the document for the same class of reason: a detached anchor's
     `click()` is ignored outright by Firefox, and has been the difference
     between a button that works and a button that silently does nothing. */
  const save = (build: (() => string | null) | undefined, name: string, mime: string) => {
    const text = build?.();
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <header className="ax-head">
      <div>
        <h1>
          <span className={`ax-head-icon ax-head-icon-${shown.key}`} aria-hidden="true" />
          {shown.title}
        </h1>
        <p className="ax-muted ax-head-purpose">{shown.purpose}</p>
      </div>
      <div className="ax-head-actions">
        <span className="ax-pill">
          <span className="ax-pill-icon" aria-hidden="true" />
          {span}
        </span>
        <button
          type="button"
          className="ax-btn"
          onClick={() => save(onExport, exportName ?? 'summit-report.txt', 'text/plain')}
          disabled={!onExport}
          title="Download a written report — your score, what the window holds, and what to change"
        >
          <span className="ax-btn-icon" aria-hidden="true" />
          Export report
        </button>
        {/* Quieter than the report, and second, because it is the export fewer
            readers want — but it is the only one that can be checked, and a
            page that grades a person should not make that the hard path. */}
        <button
          type="button"
          className="ax-btn ax-btn-quiet"
          onClick={() => save(onExportData, dataName ?? 'summit-data.csv', 'text/csv')}
          disabled={!onExportData}
          title="Download the day-by-day rows this window's figures were calculated from, as a CSV"
        >
          Data (CSV)
        </button>
      </div>
    </header>
  );
}

// --------------------------------------------------------------------------
// Controls
// --------------------------------------------------------------------------
export interface ControlsProps {
  /** Not called `window`: shadowing the global inside a component that may one
   *  day want it is a debugging session nobody needs. */
  chosen: WindowKey;
  onWindow: (key: WindowKey) => void;
  subject: string;
  onSubject: (id: string) => void;
  subjects: Array<{ id: string; label: string }>;
  compareLabel: string;
}

export function Controls({
  chosen,
  onWindow,
  subject,
  onSubject,
  subjects,
  compareLabel,
}: ControlsProps) {
  return (
    <div className="ax-controls">
      <div className="ax-chips" role="group" aria-label="Time window">
        {WINDOWS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`ax-chip${option.key === chosen ? ' is-on' : ''}`}
            aria-pressed={option.key === chosen}
            onClick={() => onWindow(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <label className="ax-select-wrap">
        <span className="ax-sr">Subject</span>
        <select className="ax-select" value={subject} onChange={(event) => onSubject(event.target.value)}>
          <option value="">All Subjects</option>
          {subjects.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>

      <div className="ax-compare">
        <span className="ax-muted">Compare with:</span>
        {/* One window means one baseline — the period immediately before it.
            A picker here would let a reader put two years beside three months
            and read the difference in length as a difference in effort. */}
        <span className="ax-compare-value">{compareLabel}</span>
      </div>
    </div>
  );
}


// --------------------------------------------------------------------------
// The opening line
// --------------------------------------------------------------------------
/**
 * The first thing under the controls, on every tab.
 *
 * Three tabs used to open with a sentence and four opened with a wall — and the
 * three did it three different ways, in three different places. Overview had a
 * bordered strip directly under the controls; Habits had a titled panel halfway
 * down a two-up row; Insights had a different titled panel in a different
 * two-up row. So the one habit worth teaching a reader — *there is a sentence
 * at the top that tells you where you stand* — was not learnable, because it
 * was true a third of the time and never twice in the same place.
 *
 * One component, one slot, filled by all seven. The sentences are not new: each
 * was already being assembled on its own tab from that tab's own figures. What
 * changed is that they moved into the same position, and the panels they came
 * from stopped printing them — so nothing is said twice.
 *
 * ## The tone is a finding, not decoration
 *
 * `up` and `down` tint the strip green and amber. A tab with nothing to be up
 * or down about — how many subjects are live, how long the streak is — passes
 * neither and gets the plain card. That is the honest answer, and it also stops
 * the colour drifting into meaning "this tab matters".
 */
export function TabOpening({
  tone = 'flat',
  children,
}: {
  tone?: 'up' | 'down' | 'flat';
  children?: ReactNode;
}) {
  if (!children) return null;
  return <p className={`ax-opening is-${tone}`}>{children}</p>;
}

// --------------------------------------------------------------------------
// What changed since last time
// --------------------------------------------------------------------------
/** A reading of the overall score, out of 100, as `/api/metric_history` files it. */
export interface ScoreReading {
  date: string;
  score: number;
}

/** How far back a reading can be and still count as "last time". */
const STALE_DAYS = 45;

export interface ScoreMovement {
  /** The latest reading, out of 100 — the scale it is recorded on. */
  now: number;
  /** The last *different* reading, or null when the score has never moved. */
  previous: number | null;
  /** Days back to that reading — or, when it held, how long it has held for. */
  days: number;
  direction: 'up' | 'down' | 'held';
}

/**
 * The one thing on this page a returning reader is actually here for.
 *
 * Everything else states where the account *is*. This states what **moved**,
 * which is the only thing that rewards coming back: a score of 65 is a status
 * and reads the same on every visit, but "65, up from 61 on Tuesday" is news,
 * and news is what a weekly habit is made of.
 *
 * It needed an endpoint. The grades have been filed daily since the report card
 * existed and nothing ever read them back — see `/api/metric_history`.
 *
 * **The comparison is against the last *different* reading, not yesterday's.**
 * A score that has sat at 65 for a fortnight against yesterday's 65 produces
 * "no change" every single day, which is both true and useless; against the
 * last time it actually moved it produces "steady for twelve days", which is a
 * real statement about the account. Beyond `STALE_DAYS` there is nothing
 * honest to compare to, and this returns null rather than reaching further.
 *
 * Figures, not a sentence. This was a component — `SinceLast`, the strip that
 * opened the Overview — until the summary took that slot and needed the same
 * movement as one of its rows. A component and a summary row both doing this
 * walk would be two copies free to drift apart, so the walk stayed and the
 * strip went. The scale stays as recorded, out of 100; the caller divides if
 * it prints the score out of ten.
 */
export function scoreMovement(points: ScoreReading[]): ScoreMovement | null {
  if (points.length < 2) return null;

  const last = points[points.length - 1]!;

  // Back to the most recent reading that differs, and how long ago that was.
  let earlier: ScoreReading | null = null;
  for (let index = points.length - 2; index >= 0; index--) {
    if (points[index]!.score !== last.score) {
      earlier = points[index]!;
      break;
    }
  }

  const days = (from: string) =>
    Math.round(
      (new Date(`${last.date}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) /
        86_400_000,
    );

  if (!earlier) {
    const held = days(points[0]!.date);
    if (held < 2) return null;
    return { now: last.score, previous: null, days: held, direction: 'held' };
  }

  const gap = days(earlier.date);
  if (gap > STALE_DAYS) return null;
  return {
    now: last.score,
    previous: earlier.score,
    days: gap,
    direction: last.score > earlier.score ? 'up' : 'down',
  };
}
