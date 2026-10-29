/**
 * Achievements — the account's hall of fame: personal bests and badges.
 *
 * This was two pages, Records and Achievements (the badge wall). They answered
 * the same question, so they are one page under the name the badges had, and
 * /records, /records/growth and /records/badges redirect here.
 *
 * ## The question this page answers
 *
 * Not "how am I doing" and not "what should I do" — the other pages have
 * those. This one answers **look how far I have come**, and every decision
 * here follows from that. It is why the evolution chart exists and there is no
 * average, no standard deviation and no percentile: "18 → 20 → 21 → 23 → 25"
 * is the story, and "mean 21.4, σ 2.3" is the same numbers with the story
 * taken out.
 *
 * ## The five layers, in the order they answer it
 *
 *     hero        the record that travelled furthest, stated outright
 *     stories     four things that happened, not four counts of things
 *     your best   every personal best, filtered by category chips
 *     evolution   the whole series of one of them, with an axis
 *     history     what happened when, and the milestones beside it
 *     noticed     what Summit counted itself, and what is within reach
 *
 * That order is the argument. The first four are the page's claim and its
 * evidence; the last two are reference. It used to run hero → counts → bests →
 * category records → timeline → milestones → evolution → search → tracked,
 * which is nine destinations for one question, with the evolution chart eighth
 * and a second copy of the timeline under a search panel at seventh.
 *
 * ## Record and milestone, and the difference is a sentence
 *
 * A **record** is *I did better* — a figure with earlier figures behind it. A
 * **milestone** is *I reached something* — no figure, and nothing to beat. The
 * page says so under the Milestones heading rather than leaving it to be
 * worked out from which section a thing landed in, because the two share a
 * table, a dialog and a page and the only thing separating them is that
 * sentence.
 *
 * ## Two kinds of record, and both are real
 *
 * **Logged** — what the account writes down. AMC 8 25/25, RCM 9, a
 * ten-thousand-line project. Summit cannot know any of it; none of it happened
 * inside the app. These live in the `records` table and are what the two Log
 * buttons write.
 *
 * **Derived** — what Summit counted itself: best XP day, heaviest task, longest
 * streak, and how close today is to beating each. This was the entire page
 * before, and it is kept exactly as it was, below the logged ones. Neither
 * replaces the other and they are visibly separated, because a record you set
 * and a record the app noticed are different claims and running them together
 * would make the page's numbers unclear about which is which.
 *
 * ## One row is one entry
 *
 * The shape everything rests on, and it is explained where it lives —
 * utils/records. In short: beating your AMC 8 score writes a *new row* rather
 * than editing the old one, which is what makes the evolution drawable at all.
 *
 * ## Milestones fold into their categories, and a category is only a drawer
 *
 * Eleven milestones is a scroll, and a scroll is not a summary. So they are
 * grouped under the category the account already typed, and each heading opens
 * onto the milestones filed under it. Nothing new is stored to do it.
 *
 * The headings used to be drawn as *key milestones*, with the same tick their
 * children carry, filled once every one was reached. That was clever and it
 * was not true: "Competitive Math" is a folder, not something anybody
 * achieved, and a tick on it said otherwise. It is a heading now and the only
 * thing it claims about itself is the count. The grouping rule, and why a
 * category of one stays a plain row, is in utils/records — see
 * `milestoneGroups`.
 *
 * The whole section folds too, from its own title. Both start shut: the counts
 * ride on the header and on every heading, so the closed state says how much
 * is behind it rather than merely hiding it.
 *
 * The derived figures count up from zero on arrival. Not decoration here in the
 * way it would be on a settings page: this is the one screen whose entire
 * content is numbers somebody is proud of, and a page of high scores that
 * simply appears reads as a table. Nothing moves under
 * `prefers-reduced-motion` — see hooks/useCountUp.
 *
 * The four tiles at the top do not count up, and stopped being counts at the
 * same time. A story's figure is "+7" or "3mo", which is not a quantity to
 * climb toward — and the thing that made counting up worth doing, that the
 * number is something to be proud of, is exactly what "47 records logged" was
 * not. See `stories` in utils/records.
 *
 * **Why this is not the analytics page.** There was a Records tab under
 * Analytics, about *standing*: where the last thirty days rank against every
 * other thirty. It is the Growth tab now
 * (components/Analytics/tabs/GrowthTab), which asks how far the account has
 * come across its whole life and kept that percentile as one panel. This page
 * is about the high scores themselves. All three read the same history and ask
 * different things of it.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorState, Loading, PageHero } from '@/components';
import { Glyph } from '@/components/Growth/GrowthPanels';
import { RecordModal, draftOf } from '@/components/Records/RecordModal';
import { BadgeWall } from '@/components/Achievements/BadgeWall';
import { NavLink, useLocation } from 'react-router-dom';
import {
  useApi,
  useCountUp,
  useDocumentTitle,
  usePageEntrance,
  useSettings,
  useUserData,
} from '@/hooks';
import { growth as growthService, records as recordService } from '@/services';
import type { GrowthSeries } from '@/services/growth';
import type { RecordDraft, RecordKind, RecordRow } from '@/services/records';
import { longDate } from '@/utils/growthChapters';
import {
  NEED,
  STANDING_TITLE,
  attempts,
  breakthroughs,
  byDay,
  categories as categoriesOf,
  daysUntil,
  durationText,
  filterRows,
  formatOn,
  formatValue,
  gainText,
  headline,
  insightOf,
  linksOf,
  milestoneGroups,
  milestoneProgress,
  moments,
  personalBests,
  progressText,
  changeText,
  stepText,
  stories,
  tally,
  trail,
  type Attempt,
  type Best,
  type MilestoneGroup,
  type Moment,
  type Sort,
} from '@/utils/records';
import {
  personalRecords,
  recordChase,
  type BestRecord,
  type RecordChase,
} from '@/utils/growthBench';
import type { GrowthDay } from '@/types';
import '@/styles/records.css';
import { Icon, type IconName } from '@/components/Icon';

/** Below this there is no derived record worth the name — see the empty state. */
const NEED_DAYS = 3;

/** How many best-cards the top row draws before the rest go to the list below. */
const TOP_BESTS = 8;

/** How many days of history the timeline draws before "show more". */
const DAYS_SHOWN = 8;

/**
 * One number, counted up, printed at the precision it was measured to.
 *
 * `useCountUp` is fed the rounded value rather than the raw one, which is what
 * its own note asks for: a figure shown to one decimal should not animate the
 * digits below it.
 */
function Counted({ amount, decimals, unit }: { amount: number; decimals: number; unit: string }) {
  const shown = useCountUp(amount);
  const text = decimals > 0 ? shown.toFixed(decimals) : Math.round(shown).toLocaleString();

  return (
    <span className="rc-figure">
      <span className="rc-num">{text}</span>
      {unit && <span className="rc-unit">{unit}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Logged records
// ---------------------------------------------------------------------------
/** The one chevron this page folds things with, pointing right until open. */
function Caret() {
  return (
    <svg className="rc-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.4" aria-hidden="true">
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A heading, and the milestones under it once it is opened.
 *
 * The head is a label and is drawn as one. It used to carry the same tick its
 * children carry, filled when every one of them was reached, which made a
 * category look like a milestone that had been achieved — and "Competitive
 * Math" is a folder the account typed, not something anybody did. The count
 * stays, because "2 of 5" is what makes a shut heading worth reading; it is
 * metadata about the group rather than a claim about it. Which categories
 * become groups at all is decided in utils/records — see `milestoneGroups`.
 */
function GroupRow({
  entry,
  open,
  onToggle,
  ...row
}: {
  entry: MilestoneGroup;
  open: boolean;
  onToggle: () => void;
} & Omit<MileRowProps, 'row'>) {
  const total = entry.children.length;
  const done = entry.reached === total;

  return (
    <li className={`rc-key${open ? ' is-open' : ''}${done ? ' is-done' : ''}`}>
      <button type="button" className="rc-key-head" aria-expanded={open} onClick={onToggle}>
        <Caret />
        <span className="rc-key-name">{entry.name}</span>
        <span className="rc-key-n">
          {entry.reached} of {total}
        </span>
      </button>

      {open && (
        <ul className="rc-key-kids">
          {entry.children.map((child) => (
            <MileRow key={child.id} {...row} row={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * When an open milestone is due, the way a person would say it. Past the
 * date it says how late, because "Mar 1" on its own reads as a plan.
 */
function dueText(days: number | null, iso: string): string {
  if (days === null) return 'Not yet';
  if (days < 0) return `${-days} ${days === -1 ? 'day' : 'days'} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days <= 60) return `Due in ${days} days`;
  return `Due ${formatOn(iso)}`;
}

interface MileRowProps {
  row: RecordRow;
  bests: Best[];
  onPick: (row: RecordRow) => void;
  /** Save it as reached today. */
  onDone: (row: RecordRow) => void;
  /** Open a linked record on the chart. */
  onLink: (name: string) => void;
  busy: boolean;
}

/**
 * One milestone: reached ones are a filled tick and a date; open ones are a
 * dashed ring with what is left, when it is due, and how far along it is.
 *
 * The progress bar only draws for a milestone with a goal number. Most
 * milestones are "it happened or it didn't" and a bar under those would be a
 * measurement of nothing. Linked records show as chips that open that record
 * on the chart above, which is the whole use of linking them.
 */
function MileRow({ row, bests, onPick, onDone, onLink, busy }: MileRowProps) {
  const done = Boolean(row.achieved_on);
  const progress = milestoneProgress(row, bests);
  const days = done ? null : daysUntil(row.due_on);
  const links = linksOf(row)
    .map((name) => bests.find((best) => best.name.trim().toLowerCase() === name.trim().toLowerCase()))
    .filter((best): best is Best => Boolean(best));
  const late = days !== null && days < 0;

  return (
    <li className={`rc-mile${done ? ' is-done' : ' is-open'}${late && !progress?.met ? ' is-late' : ''}${
      progress?.met && !done ? ' is-met' : ''}`}>
      <button type="button" onClick={() => onPick(row)}>
        <span className="rc-mile-tick" aria-hidden="true">{done ? '✓' : ''}</span>
        <span className="rc-mile-name">{row.name}</span>
        <span className="rc-mile-when">
          {done
            ? formatOn(row.achieved_on)
            : progress?.met ? 'Target reached' : dueText(days, row.due_on ?? '')}
        </span>
      </button>

      {((progress && !done) || links.length > 0) && (
        <div className="rc-mile-more">
          {progress && !done && (
            <div className="rc-mile-progress">
              <span className="rc-mile-bar" role="progressbar" aria-valuenow={Math.round(progress.percent)}
                    aria-valuemin={0} aria-valuemax={100} aria-label={`${row.name}: ${progressText(progress)}`}>
                <i style={{ width: `${progress.percent}%` }} />
              </span>
              <span className="rc-mile-count">
                {progressText(progress)}
                {progress.from && <em> · from your {progress.from.name} best</em>}
              </span>
            </div>
          )}
          {(links.length > 0 || (progress?.met && !done)) && (
            <div className="rc-mile-links">
              {links.map((best) => (
                <button key={best.name} type="button" className="rc-mile-link"
                        title={`Show ${best.name} on the chart`} onClick={() => onLink(best.name)}>
                  <Icon name="trend" /> {best.name}
                </button>
              ))}
              {progress?.met && !done && (
                <button type="button" className="rc-mile-mark" disabled={busy} onClick={() => onDone(row)}>
                  Mark it done
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * The evolution of one record at card size: its raw results, oldest first.
 *
 * It used to plot goodness, so a mile time coming down drew as a climbing
 * line. That made every card look the same way up and it also drew something
 * the numbers beside it did not say. Now it draws the results as they are and
 * says so under the line, with "lower is better" on a record measured down,
 * so a falling line on a mile reads as the good news it is. The chart further
 * down has an Improvement view for anyone who wants "better is up".
 */
function Spark({ best }: { best: Best }) {
  const values = best.history.filter((row) => row.achieved_on).map((row) => row.value);
  if (values.length < 2) return null;

  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const W = 132;
  const H = 30;

  const points = values.map((value, i) => {
    const up = (value - low) / span;
    return [3 + (i * (W - 6)) / (values.length - 1), H - 4 - up * (H - 8)] as const;
  });
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const [lastX, lastY] = points[points.length - 1]!;

  return (
    <span className="rc-spark-wrap">
      <svg className="rc-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path className="rc-spark-line" d={path} />
        <circle className="rc-spark-dot" cx={lastX} cy={lastY} r="3" />
      </svg>
      <span className="rc-spark-cap">
        Your results{best.direction === 'lower' ? ' · lower is better' : ''}
      </span>
    </span>
  );
}

/**
 * One record, at the size the page's argument deserves.
 *
 * The card grows with the history, because a card that looks the same after
 * five entries as after one has nothing to say about the four in between:
 *
 *     1 entry     the figure and the day
 *     2-3         and the shape of it
 *     4+          and the figures themselves — 18 → 20 → 21 → 23 → 25
 *
 * That last line is the page's thesis written out, and it is the reason the
 * table stores an entry per row rather than a best per record. Somebody who
 * has come back to a record five times should be able to see all five without
 * opening anything.
 */
/**
 * The glyph a category wears, on the card chips and the history rows.
 *
 * The layout draws a different mark for each category. There is no
 * category→icon mapping anywhere in the app to reuse — the subject icons in
 * services/subjects are image URLs keyed on *subjects*, which categories are
 * not — so this is the map, over the names the categories actually take, with
 * `trophy` under anything unlisted. Matching on a lowercased name rather than
 * an id because a category here is free text the reader typed.
 *
 * The icon set (components/Icon) has no note, bracket or barbell in it, so
 * these are the nearest thing it does have rather than the drawing's exact
 * glyphs. The shape of the chip is what the layout is; the picture inside it
 * is a detail the set can grow into.
 */
const CATEGORY_ICON: Record<string, IconName> = {
  coding: 'monitor',
  'competitive math': 'target',
  math: 'target',
  music: 'star',
  habits: 'checklist',
  fitness: 'flame',
  running: 'zap',
  training: 'timer',
  research: 'lightbulb',
  'machine learning': 'database',
  summit: 'sprout',
  reading: 'scroll',
};

function catIcon(category: string): IconName {
  return CATEGORY_ICON[category.trim().toLowerCase()] ?? 'trophy';
}

/**
 * A figure split into the number and the thing it is measured in.
 *
 * The layout sets the figure large and its unit small underneath it, which
 * `formatValue` cannot give as one string. Rather than a second formatter with
 * its own rounding — two places deciding what 133.5 looks like is how they end
 * up disagreeing — this takes what `formatValue` produced and cuts it.
 *
 * Minutes are the case that has to be excluded by name: "4h 18m" is one figure
 * with a space in it, and splitting on the last space would print "4h" over
 * "18m".
 */
function splitValue(value: number, unit: string, target = 0): [string, string] {
  const whole = formatValue(value, unit, target);

  if (target > 0) {
    const cut = whole.indexOf(' / ');
    if (cut > 0) return [whole.slice(0, cut), whole.slice(cut + 1)];
  }
  if (unit && unit !== 'points' && unit !== 'minutes') {
    const cut = whole.lastIndexOf(' ');
    if (cut > 0) return [whole.slice(0, cut), whole.slice(cut + 1)];
  }
  return [whole, ''];
}

/**
 * How far a record has come, in words for a time ("48s faster") and as the
 * signed figure for everything else ("+7"). See `changeText`.
 */
const gainWords = (best: Best) =>
  best.direction === 'lower' && best.unit === 'minutes'
    ? changeText(best.gain, best.unit, best.direction)
    : gainText(best);

/** First entry to the best, in days, or null while the first is the best. */
const daysToBest = (best: Best) => insightOf(best).daysToBest;

function BestCard({ best, onOpen }: { best: Best; onOpen: () => void }) {
  const dated = best.history.filter((row) => row.achieved_on).length;
  const steps = trail(best);

  return (
    <li className={`rc-best${best.fresh ? ' is-fresh' : ''}`}>
      <button type="button" onClick={onOpen}>
        <span className="rc-best-head">
          <span className="rc-best-ico" aria-hidden="true">
            <Icon name={catIcon(best.category)} />
          </span>
          <span className="rc-best-cat">{best.category || 'Uncategorized'}</span>
        </span>
        <span className="rc-best-name">{best.name}</span>
        <span className="rc-best-value">{formatValue(best.value, best.unit, best.target)}</span>
        <span className="rc-best-label">Personal best</span>

        {dated >= 2 && <Spark best={best} />}

        {dated >= 4 && (
          <span className="rc-best-trail">
            {steps.map((step, i) => (
              <span key={`${step}-${i}`} className={i === steps.length - 1 ? 'is-now' : undefined}>
                {step}
              </span>
            ))}
          </span>
        )}

        {best.fresh ? (
          <span className="rc-best-new">New record <Icon name="flame" /></span>
        ) : best.gain > 0 ? (
          <span className="rc-best-gain">
            ↑ {gainWords(best)} since first
            {daysToBest(best) !== null && `, in ${durationText(daysToBest(best)!)}`}
          </span>
        ) : (
          <span className="rc-best-gain is-quiet">
            {best.entries > 1 ? 'No change yet' : 'First entry'}
          </span>
        )}

        <span className="rc-best-when">{formatOn(best.on)}</span>
      </button>
    </li>
  );
}

/**
 * One row of recent history: what it was, when, and what it beat.
 *
 * The difference between this and a table row is `moment`: whether the entry
 * beat everything before it, and by how much. A record being broken is the
 * only event on this page worth stopping at, so it is the only one drawn in
 * gold and the only one carrying its own figure — everything else is context
 * for it, which is what makes the list read as a story rather than as an audit
 * of things that were typed in.
 *
 * A milestone has no `moment`: nothing was beaten, it happened.
 *
 * ## Six columns, and why the date moved back onto the row
 *
 * This was a dotted spine with the date written once above everything that
 * happened under it — two records set on one afternoon being one afternoon.
 * Drawn to the layout it is a flat list, so the date comes back per row and
 * pays for itself by making every row independently readable: the rows are
 * now sortable by improvement as well as by date, and under that ordering a
 * day heading is grouping by something the list is no longer sorted on.
 */
function Entry({
  row,
  moment,
  big,
  onOpen,
}: {
  row: RecordRow;
  moment?: Moment;
  /** One of the record's breakthroughs — see `breakthroughs` in utils/records. */
  big?: boolean;
  onOpen: () => void;
}) {
  const step = moment ? stepText(moment) : '';

  return (
    <li className={`${row.kind === 'milestone' ? 'is-milestone' : ''}${
      moment?.broke ? ' is-record' : ''
    }`}>
      <button type="button" className="rc-rec" onClick={onOpen}>
        <span className="rc-rec-ico" aria-hidden="true">
          <Icon name={row.kind === 'milestone' ? 'medal' : catIcon(row.category)} />
        </span>

        <span className="rc-rec-main">
          <span className="rc-rec-name">{row.name}</span>
          {moment?.broke ? (
            <span className="rc-rec-note is-record">
              {big ? 'Breakthrough' : 'New record'}{step && ` · ${step}`}
            </span>
          ) : moment?.first ? (
            <span className="rc-rec-note">
              First entry{row.category ? `: ${row.category}` : ''}
            </span>
          ) : (
            <span className="rc-rec-note">
              {/* Not "Personal best": this branch is every entry that beat
                  nothing, and calling a slower mile a personal best is the
                  one thing this list must not do. */}
              {row.kind === 'milestone' ? 'Milestone' : moment ? 'No new best this time' : 'Logged'}
            </span>
          )}
        </span>

        {/* Empty rather than absent when a row has no category: the grid has
            six tracks and a missing cell would slide the date, the figure and
            the change one column left on that row alone. */}
        <span className="rc-rec-cat">
          {row.category ? <em>{row.category}</em> : null}
        </span>

        <span className="rc-rec-when">{formatOn(row.achieved_on)}</span>

        <span className="rc-rec-value">
          {row.kind === 'record' ? (
            <>
              <em>{splitValue(row.value, row.unit, row.target)[0]}</em>
              {splitValue(row.value, row.unit, row.target)[1] && (
                <i>{splitValue(row.value, row.unit, row.target)[1]}</i>
              )}
            </>
          ) : (
            <em>-</em>
          )}
        </span>

        {/* The change carries the row's colour: a step is good news whichever
            direction the record is measured in, and `stepText` has already
            signed it. Nothing at all for a milestone, which beat nothing. */}
        <span className={`rc-rec-step${step ? ' is-up' : ''}`}>
          {step ? <>&#8599; {step}</> : ''}
        </span>
      </button>
    </li>
  );
}

/** What a record's figure is called, for the chart's caption and axis. */
const UNIT_NOUN: Record<string, string> = {
  points: 'score',
  minutes: 'time',
  days: 'days',
  problems: 'problems',
  lines: 'lines',
  level: 'level',
  rating: 'rating',
};

/** The two things the chart can draw. */
type ChartMode = 'results' | 'improvement';

/**
 * A tick or point label. Results print the way the record does (7m 45s, 25);
 * improvement prints signed toward better, with the first entry as "Start".
 */
function chartLabel(best: Best, mode: ChartMode, value: number): string {
  if (mode === 'improvement') {
    // Signed as improvement, not as the raw difference: this view's whole
    // promise is that up and plus are better, a mile included.
    if (Math.abs(value) < 1e-9) return 'Start';
    return `${value > 0 ? '+' : '−'}${formatValue(Math.abs(value), best.unit === 'minutes' ? 'minutes' : '')}`;
  }
  if (best.unit === 'minutes') return formatValue(value, 'minutes');
  return (Math.round(value * 10) / 10).toLocaleString();
}

/**
 * The evolution of one record, as a line, in one of two views.
 *
 * **Results** plots the raw figures, faithfully: a mile time coming down is a
 * falling line, and the caption above says lower is better so nobody reads it
 * as decline. **Improvement** plots how far each result is from the first,
 * signed toward better, so up is always good news whichever way the record is
 * measured. They are two charts with two captions rather than one chart that
 * quietly flips, because a picture that silently inverts the numbers beside
 * it is the thing this replaced.
 *
 * The y-axis is padded off the range rather than starting at zero — a score
 * that went 18 to 25 on a 0-30 axis is a flat line, and the flatness would be
 * a lie about a 39% improvement. The improvement view always includes zero,
 * drawn dashed, which is where the record started.
 *
 * The gold point is the **best**, not the last one, and ringed points are
 * breakthroughs. With more than a dozen entries only the first, best and
 * latest carry their figure, so the labels do not pile into each other.
 */
function Evolution({ best, mode }: { best: Best; mode: ChartMode }) {
  /* Drawn at the width it is shown at, so its text is real pixels. A fixed
     viewBox scaled to a phone shrank the labels to three pixels high. */
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  const steps = attempts(best);
  // Re-observed when the chart appears or goes, since that swaps the element.
  const drawn = steps.length >= 2;
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(([seen]) => {
      if (seen) setWidth(Math.round(seen.contentRect.width));
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, [drawn]);

  if (steps.length < 2) {
    return (
      <p className="rc-empty">
        One entry so far. Log "{best.name}" again when you try it next to see a line here.
      </p>
    );
  }

  const ys = steps.map((step) => (mode === 'results' ? step.row.value : step.change));
  const peak = steps.reduce((top, step) => (step.change > top.change ? step : top), steps[0]!);
  let low = Math.min(...ys);
  let high = Math.max(...ys);
  if (mode === 'improvement') {
    low = Math.min(low, 0);
    high = Math.max(high, 0);
  }
  const pad = (high - low || Math.abs(high) || 1) * 0.2;
  let floor = low - pad;
  let ceil = high + pad;
  if (mode === 'results') {
    // The padding stays inside what a result can be: no "26.4" over a score
    // out of 25, and no negative tick under results that are all positive.
    if (best.target > 0 && best.direction === 'higher') ceil = Math.min(ceil, best.target);
    if (low >= 0) floor = Math.max(floor, 0);
    if (ceil <= high) ceil = high + (high - floor || 1) * 0.08;
  }

  // Short whatever the width: the chart spans the card, and a line as tall as
  // it is wide stands taller than the figures it explains.
  const W = Math.max(280, width);
  const H = W < 520 ? 200 : 230;
  const L = 58;
  const B = 26;
  const T = 18;

  const x = (i: number) => L + (i * (W - L - 18)) / Math.max(1, steps.length - 1);
  const y = (v: number) => H - B - ((v - floor) / (ceil - floor || 1)) * (H - B - T);

  const path = ys.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  const base = mode === 'improvement' ? y(0) : H - B;
  const area = `${path} L${x(steps.length - 1)},${base} L${x(0)},${base} Z`;
  // Every point carries its figure only while there is room for them.
  const crowded = steps.length > Math.max(4, Math.floor((W - L) / 64));

  return (
    <div className="rc-ev" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="rc-ev-svg" role="img"
           aria-label={
             mode === 'results'
               ? `${best.name}, every result from ${chartLabel(best, 'results', ys[0]!)} to ` +
                 `${chartLabel(best, 'results', ys[ys.length - 1]!)}, where ${best.direction} is better`
               : `${best.name}, improvement on your first result, best ${chartLabel(best, 'improvement', peak.change)}`
           }>
        <defs>
          <linearGradient id="rc-ev-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((step) => {
          const value = floor + (ceil - floor) * (1 - step);
          const at = T + step * (H - B - T);
          return (
            <g key={step}>
              <line className="rc-ev-grid" x1={L} y1={at} x2={W - 8} y2={at} />
              <text className="rc-ev-axis" x={L - 8} y={at + 4} textAnchor="end">
                {chartLabel(best, mode, value)}
              </text>
            </g>
          );
        })}

        {mode === 'improvement' && (
          <line className="rc-ev-zero" x1={L} y1={y(0)} x2={W - 8} y2={y(0)} />
        )}

        <path className="rc-ev-area" d={area} fill="url(#rc-ev-fill)" />
        <path className="rc-ev-line" d={path} />

        {steps.map((step, i) => {
          const isBest = step.row.id === peak.row.id;
          const labelled = !crowded || i === 0 || i === steps.length - 1 || isBest;
          return (
            <g key={step.row.id}>
              {step.breakthrough && (
                <circle className="rc-ev-break" cx={x(i)} cy={y(ys[i]!)} r={11} />
              )}
              <circle className={`rc-ev-dot${isBest ? ' is-best' : ''}`}
                      cx={x(i)} cy={y(ys[i]!)} r={isBest ? 6 : 4} />
              {labelled && (
                <text className="rc-ev-point" x={x(i)} y={y(ys[i]!) - (step.breakthrough ? 16 : 12)}
                      textAnchor="middle">
                  {chartLabel(best, mode, ys[i]!)}
                </text>
              )}
              {labelled && (
                <text className="rc-ev-when" x={x(i)} y={H - 6} textAnchor="middle">
                  {step.row.achieved_on.slice(5).replace('-', '/')}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <p className="rc-ev-legend">
        <span><i className="is-dot" /> One result</span>
        <span><i className="is-best" /> Personal best</span>
        {steps.some((step) => step.breakthrough) && <span><i className="is-break" /> Breakthrough</span>}
        {mode === 'improvement' && <span><i className="is-zero" /> Your first result</span>}
      </p>
    </div>
  );
}

/** What changed against the best before it, in words a person would use. */
function againstBest(best: Best, step: Attempt): string {
  if (step.vsBest === null) return 'Starting point';
  if (step.vsBest > 0) return `New best, ${changeText(step.vsBest, best.unit, best.direction)}`;
  if (step.vsBest === 0) return 'Tied your best';
  return `${formatValue(-step.vsBest, best.unit)} short`;
}

/** How many rows the attempts table shows before "Show all". */
const ATTEMPTS_SHOWN = 6;

/**
 * Every attempt as a row: the numbers the chart draws, for anyone who would
 * rather read them. The raw result and the change from the start sit side by
 * side, which is the plainest way to show a time going down while the
 * improvement goes up. Long histories keep the first row (where it started)
 * and the newest ones.
 */
function AttemptsTable({ best }: { best: Best }) {
  const [all, setAll] = useState(false);
  const steps = attempts(best);
  if (steps.length < 2) return null;

  const hidden = all ? 0 : Math.max(0, steps.length - ATTEMPTS_SHOWN);
  const shown = hidden ? [steps[0]!, ...steps.slice(steps.length - (ATTEMPTS_SHOWN - 1))] : steps;
  const noun = UNIT_NOUN[best.unit] ?? 'result';

  return (
    <div className="rc-at">
      <table className="rc-at-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Date</th>
            <th scope="col">{noun === 'result' ? 'Result' : noun[0]!.toUpperCase() + noun.slice(1)}</th>
            <th scope="col">Change from start</th>
            <th scope="col">Against your best</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((step, i) => (
            <Fragment key={step.row.id}>
            {/* Where the middle of a long history is folded away. */}
            {hidden > 0 && i === 1 && (
              <tr className="rc-at-gap">
                <td colSpan={5}>{hidden} earlier {hidden === 1 ? 'attempt' : 'attempts'}</td>
              </tr>
            )}
            <tr className={`${step.breakthrough ? 'is-break' : ''}${
              step.vsBest !== null && step.vsBest > 0 ? ' is-best' : ''}`}>
              <td>{step.n}</td>
              <td>{formatOn(step.row.achieved_on)}</td>
              <td className="is-num">{formatValue(step.row.value, best.unit, best.target)}</td>
              <td data-label="From start"
                  className={`is-num${step.change > 0 ? ' is-up' : step.change < 0 ? ' is-down' : ''}`}>
                {step.n === 1 ? '-' : changeText(step.change, best.unit, best.direction)}
              </td>
              <td>
                {againstBest(best, step)}
                {step.breakthrough && <em className="rc-at-tag">Breakthrough</em>}
              </td>
            </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      {steps.length > ATTEMPTS_SHOWN && (
        <button type="button" className="rc-link rc-more" onClick={() => setAll((on) => !on)}>
          {all ? 'Show fewer' : `Show all ${steps.length} attempts`}
        </button>
      )}
    </div>
  );
}

const TREND_WORD = { improving: 'Improving', steady: 'Holding steady', slipping: 'Slipping' } as const;
const PACE_WORD = {
  accelerating: ['Speeding up', 'Your bests are coming faster than before'],
  slowing: ['Slowing down', 'Your bests are coming slower than before'],
  consistent: ['Steady pace', 'About as fast as before'],
} as const;

/**
 * The record, read closely: where it started, how long the best took, how
 * fast it is moving and whether that is changing.
 *
 * Every figure here has a gate (`NEED` in utils/records), and the ones below
 * it are left out rather than drawn with a guess. What is missing is said in
 * one line at the foot, so "no trend yet" reads as "log it twice more" rather
 * than as the app having nothing to say.
 */
function InsightPanel({ best }: { best: Best }) {
  const read = insightOf(best);
  const unit = best.unit;
  const signed = (amount: number) => changeText(amount, unit, best.direction);
  const first = best.history.find((row) => row.achieved_on) ?? best.history[0]!;

  type Cell = { key: string; label: string; value: string; sub?: string; tone?: 'up' | 'down' };
  const cells: Cell[] = [
    { key: 'best', label: 'Personal best', value: formatValue(best.value, unit, best.target),
      sub: `Set ${formatOn(best.on)}` },
  ];

  if (read.dated > 1) {
    cells.push({ key: 'start', label: 'Started at', value: formatValue(best.first, unit, best.target),
                 sub: formatOn(first.achieved_on) });
    cells.push(best.gain > 0
      ? { key: 'gain', label: 'Improvement', value: signed(best.gain), tone: 'up',
          sub: best.percent > 0 ? `${Math.round(best.percent * 10) / 10}% better than your start` : undefined }
      : { key: 'gain', label: 'Improvement', value: 'None yet', sub: 'Your first try is still your best' });
  }
  if (read.daysToBest !== null) {
    cells.push({ key: 'time', label: 'Time to achieve', value: durationText(read.daysToBest),
                 sub: 'From your first entry to your best' });
  }
  if (read.ratePerMonth !== null) {
    const rate = unit === 'minutes' ? read.ratePerMonth : Math.round(read.ratePerMonth * 10) / 10;
    if (rate > 0) {
      cells.push({ key: 'rate', label: 'Improvement rate', value: `${signed(rate)} a month`, tone: 'up',
                   sub: 'Average, from first entry to best' });
    }
  }
  if (read.vsPrevious !== null && read.previousBest !== null) {
    const vsLast = read.vsPrevious === 0
      ? 'Same as last time'
      : best.direction === 'lower' && unit === 'minutes'
        ? `${signed(read.vsPrevious)} than last time`
        : `${signed(read.vsPrevious)} on last time`;
    const vsBest = read.vsPreviousBest! > 0
      ? 'a new best'
      : read.vsPreviousBest === 0
        ? 'ties your best'
        : `${formatValue(-read.vsPreviousBest!, unit)} short of your best`;
    cells.push({ key: 'latest', label: 'Latest result', value: formatValue(read.latest.value, unit, best.target),
                 sub: `${vsLast}, ${vsBest}`,
                 tone: read.vsPrevious > 0 ? 'up' : read.vsPrevious < 0 ? 'down' : undefined });
  }
  if (read.trend) {
    cells.push({ key: 'trend', label: 'Recent trend', value: TREND_WORD[read.trend.word],
                 sub: read.trend.early ? `Early read, from ${read.dated} entries` : `Across your last ${read.trend.basis} results`,
                 tone: read.trend.word === 'improving' ? 'up' : read.trend.word === 'slipping' ? 'down' : undefined });
  }
  if (read.pace) {
    const [word, sub] = PACE_WORD[read.pace];
    cells.push({ key: 'pace', label: 'Pace', value: word, sub,
                 tone: read.pace === 'accelerating' ? 'up' : read.pace === 'slowing' ? 'down' : undefined });
  }

  /* What is not shown yet, and what it would take. One line, the nearest gate. */
  let waiting: string | null = null;
  if (read.dated < NEED.trend) {
    const more = NEED.trend - read.dated;
    waiting = `${more === 1 ? 'One more entry' : `${more} more entries`} and this shows your trend and how fast you're improving.`;
  } else if (read.ratePerMonth === null && best.gain > 0 && read.spanDays < NEED.rateDays) {
    waiting = 'Your rate of improvement shows once your entries cover four weeks.';
  } else if (!read.pace && !(best.direction === 'higher' && best.target > 0 && best.value >= best.target)) {
    if (read.dated < NEED.pace || read.spanDays < NEED.paceDays) {
      waiting = `Whether you're speeding up or slowing down shows after ${NEED.pace} entries across two months.`;
    }
  }

  const share = (jump: number) => (best.gain > 0 ? jump / best.gain : 0);

  return (
    <div className={`rc-in is-${read.standing}`}>
      <header className="rc-in-head">
        <h3 className="rc-in-name">{best.name}</h3>
        <span className="rc-in-tag">{STANDING_TITLE[read.standing]}</span>
        {best.direction === 'lower' && <span className="rc-ev-dir">Lower is better</span>}
      </header>

      <dl className="rc-in-figs">
        {cells.map((cell) => (
          <div key={cell.key} className={cell.tone ? `is-${cell.tone}` : undefined}>
            <dt>{cell.label}</dt>
            <dd>{cell.value}</dd>
            {cell.sub && <dd className="rc-in-sub">{cell.sub}</dd>}
          </div>
        ))}
      </dl>

      {read.breakthroughs.map((one) => (
        <p className="rc-in-break" key={one.id}>
          <Icon name="zap" />
          <span>
            <strong>Breakthrough on {formatOn(one.on)}.</strong>{' '}
            {best.direction === 'lower' ? `You cut ${formatValue(one.jump, unit)}` : `You jumped ${signed(one.jump)}`} in one go,{' '}
            {share(one.jump) >= 0.5 ? 'more than half of your whole climb' : `${Math.round(share(one.jump) * 100)}% of your whole climb`}.
          </span>
        </p>
      ))}

      {waiting && <p className="rc-in-wait">{waiting}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Derived records — the page as it was
// ---------------------------------------------------------------------------
function DerivedCard({ record }: { record: BestRecord }) {
  const unset = record.amount <= 0;
  return (
    <li className={`rc-card${unset ? ' is-unset' : ''}`}>
      <span className="rc-ico" aria-hidden="true">
        <Glyph name={record.icon} />
      </span>
      <span className="rc-label">{record.label}</span>
      {unset ? (
        <span className="rc-none">Not set yet</span>
      ) : (
        <Counted amount={record.amount} decimals={record.decimals} unit={record.unit} />
      )}
      {record.on && <span className="rc-when">{longDate(record.on)}</span>}
    </li>
  );
}

function ChaseRow({ row }: { row: RecordChase }) {
  const shown = useCountUp(row.percent);
  const remaining =
    row.decimals > 0 ? row.remaining.toFixed(row.decimals) : Math.round(row.remaining).toLocaleString();
  const target =
    row.decimals > 0 ? row.target.toFixed(row.decimals) : Math.round(row.target).toLocaleString();

  return (
    <li className={`rc-chase${row.held ? ' is-held' : ''}`}>
      <div className="rc-chase-head">
        <span className="rc-chase-ico" aria-hidden="true">
          <Glyph name={row.icon} />
        </span>
        <span className="rc-chase-label">{row.label}</span>
        <span className="rc-chase-target">
          {target}
          {row.unit ? ` ${row.unit}` : ''}
        </span>
      </div>

      <div className="rc-track" role="progressbar" aria-valuenow={Math.round(row.percent)}
           aria-valuemin={0} aria-valuemax={100}
           aria-label={`${row.label}: ${row.current} of ${row.target}`}>
        <i style={{ width: `${shown}%` }} />
      </div>

      <p className="rc-chase-foot">
        {row.held ? (
          <strong>Holding it: {row.window} is your best yet.</strong>
        ) : (
          <>
            <strong>
              {remaining}
              {row.unit ? ` ${row.unit}` : ''} to go
            </strong>
            . {row.window} is at{' '}
            {row.decimals > 0 ? row.current.toFixed(row.decimals) : row.current.toLocaleString()}
            {row.unit ? ` ${row.unit}` : ''}.
          </>
        )}
      </p>
    </li>
  );
}

// ---------------------------------------------------------------------------
// The three tabs
// ---------------------------------------------------------------------------
type RecordsView = 'bests' | 'badges';

/**
 * One page, two answers to "how far have I come": the bests you logged and
 * the badge wall. This page was called Records, and its old addresses
 * redirect here; its Growth tab went back to the analytics page. Each tab is its own URL, so the rail, the back button and a
 * pasted link agree about which is open.
 */
const VIEWS: { key: RecordsView; label: string; path: string; title: string }[] = [
  { key: 'bests', label: 'Personal bests', path: '/achievements', title: 'Achievements' },
  { key: 'badges', label: 'Badges', path: '/achievements/badges', title: 'Badges' },
];

function viewOf(pathname: string): RecordsView {
  return VIEWS.find((view) => view.path === pathname)?.key ?? 'bests';
}

// ---------------------------------------------------------------------------
export default function Achievements() {
  const view = viewOf(useLocation().pathname);
  useDocumentTitle(VIEWS.find((one) => one.key === view)!.title);

  const account = useUserData();
  const { username } = account;
  const { prefs } = useSettings();

  const seriesCall = useCallback(
    () =>
      username
        ? growthService.series(0)
        : Promise.resolve({ success: false as const, message: 'Sign in to see your records.' }),
    [username],
  );
  const series = useApi<GrowthSeries>(seriesCall, [username]);

  const listCall = useCallback(
    () =>
      username
        ? recordService.list()
        : Promise.resolve({ success: false as const, message: 'Sign in to see your records.' }),
    [username],
  );
  const logged = useApi<{ records: RecordRow[] }>(listCall, [username]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; kind: RecordKind; entry?: RecordRow }>({
    open: false,
    kind: 'record',
  });

  /* The page's category, and there is one of it. The chips above the bests and
     the select above the history are two views of the same filter rather than
     two filters: a page that says "Academic" in one place and "All" in another
     is a page you have to read twice to know what you are looking at. Both
     controls stay, because each is where you want it when you are in that part
     of the page, and both write here. */
  const [category, setCategory] = useState('All');
  /* The bests row draws TOP_BESTS and this opens it to everything under the
     chosen chip. Reset when the chip changes: "show all" meant all of the
     category it was pressed in, and carrying it across reads as the filter
     having failed. */
  const [allBests, setAllBests] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  /* Raw results or improvement — see `Evolution`. Results first: it is the
     numbers as you logged them. */
  const [chartMode, setChartMode] = useState<ChartMode>('results');
  const [query, setQuery] = useState('');
  /* The order the history opens in is the account's, the same way the four
     task_* preferences work: this is where the visit starts, and the toolbar
     still changes it for the visit. */
  const [sort, setSort] = useState<Sort>(prefs.records_sort);
  useEffect(() => setSort(prefs.records_sort), [prefs.records_sort]);
  /** How many days of history are drawn before "show more". */
  const [days, setDays] = useState(DAYS_SHOWN);

  /* The milestones section, and which key milestones inside it are open.
     Both start shut. A key milestone that opened by default would put the page
     back where it was — eleven rows — and the header and each key row carry
     their own counts, so nothing is hidden without saying how much. */
  const [milesShut, setMilesShut] = useState(false);
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
  const toggleKey = useCallback(
    (key: string) => setOpenKeys((open) => ({ ...open, [key]: !open[key] })),
    [],
  );

  const rows = useMemo(() => logged.data?.records ?? [], [logged.data]);
  /* The grouping, once. Everything below reads this rather than regrouping the
     rows for itself — see the note at the top of utils/records. */
  const bests = useMemo(() => personalBests(rows), [rows]);
  /** The record the hero states. Null until something has actually moved. */
  const lead = useMemo(() => headline(bests), [bests]);
  const counts = useMemo(() => tally(rows), [rows]);
  const cats = useMemo(() => categoriesOf(rows), [rows]);
  /** The four tiles. Named `tales` because `stories` is the function. */
  const tales = useMemo(() => stories(bests), [bests]);
  /* What each entry meant when it happened — read from every row, then looked
     up per row that survives the toolbar. See `moments` in utils/records. */
  const meant = useMemo(() => moments(bests), [bests]);
  const milestones = useMemo(() => rows.filter((row) => row.kind === 'milestone'), [rows]);
  const reachedCount = milestones.filter((row) => row.achieved_on).length;
  /** Every breakthrough entry on the account, for the history's tags. */
  const bigIds = useMemo(
    () => new Set(bests.flatMap((best) => breakthroughs(best).map((one) => one.id))),
    [bests],
  );
  const { groups: mileGroups, loose: looseMiles } = useMemo(() => milestoneGroups(rows), [rows]);

  /** The record the evolution chart is drawing. Defaults to the richest one. */
  const evolving = useMemo(() => {
    const withHistory = bests.filter((best) => best.history.length > 1);
    const chosen = bests.find((best) => best.name === pick);
    return chosen ?? withHistory[0] ?? bests[0] ?? null;
  }, [bests, pick]);

  const shownBests = useMemo(
    () => (category === 'All' ? bests : bests.filter((best) => best.category === category)),
    [bests, category],
  );

  /* Back to the first page of days whenever the question changes. "Show more"
     was asked of a list that no longer exists. */
  const narrow = useCallback(<T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setDays(DAYS_SHOWN);
  }, []);

  /** The one category filter, from either of the two controls that write it. */
  const pickCategory = useCallback((name: string) => {
    setCategory(name);
    // Both lists go back to their first page. "Show all 14" and "show more
    // days" were both asked of a list that is now a different list.
    setAllBests(false);
    setDays(DAYS_SHOWN);
  }, []);

  const history = useMemo(
    () => byDay(filterRows(rows, bests, { query, category, sort })),
    [bests, category, query, rows, sort],
  );

  // ---- writes -------------------------------------------------------------
  const write = useCallback(
    async (action: () => Promise<{ success: boolean; message?: string }>) => {
      setBusy(true);
      try {
        const result = await action();
        if (!result.success) {
          setError(result.message ?? "That didn't work.");
          return false;
        }
        setError(null);
        await logged.reload();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [logged],
  );

  const saveRecord = useCallback(
    async (draft: RecordDraft) => {
      if (!username) return;
      const ok = await write(() => recordService.save(draft));
      if (ok) setModal({ open: false, kind: draft.kind });
    },
    [username, write],
  );

  /** "Mark it done" on a milestone whose target has been reached: dated today. */
  const markDone = useCallback(
    (row: RecordRow) => {
      const now = new Date();
      const today = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
      void write(() => recordService.save({ ...draftOf(row), achieved_on: today }));
    },
    [write],
  );

  /** A linked record's chip: put that record on the chart and go to it. */
  const showRecord = useCallback((name: string) => {
    setPick(name);
    requestAnimationFrame(() =>
      document.getElementById('rc-timeline')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }, []);

  const deleteRecord = useCallback(
    async (entry: RecordRow) => {
      if (!username) return;
      const ok = await write(() => recordService.remove(entry.id));
      if (ok) setModal({ open: false, kind: entry.kind });
    },
    [username, write],
  );

  // ---- derived, as before -------------------------------------------------
  const all: GrowthDay[] = useMemo(() => series.data?.growth_data ?? [], [series.data]);
  const streak = Number(account.data?.stats?.current_streak) || 0;
  const tasks = useMemo(() => account.data?.tasks ?? [], [account.data]);
  const derived = useMemo(() => personalRecords(all, tasks, streak), [all, streak, tasks]);
  const chase = useMemo(() => recordChase(all, streak), [all, streak]);

  /* The arrival cascade. All three reads have to land before there is a page
     to animate — see hooks/usePageEntrance. */
  const entering = usePageEntrance(
    !series.loading && !account.loading && !logged.loading,
  );

  if (series.loading || account.loading || logged.loading) {
    return <Loading label="Loading your records" />;
  }
  if (series.error && !rows.length) {
    return <ErrorState message={series.error} onRetry={series.reload} />;
  }

  const open = (kind: RecordKind, entry?: RecordRow) => setModal({ open: true, kind, entry });

  return (
    <div className={`rc-page${entering ? ' pg-enter' : ''}`}>
      {/* ---- 1. Hero ------------------------------------------------------
          The page's question, answered before anybody scrolls. "Your best, and
          the day you hit it" was accurate and it was also a label; the thing
          this page is actually for is the distance, so the distance is the
          headline and the record that travelled furthest supplies it — see
          `headline` in utils/records for which one that is and why it is
          chosen on the share of the start rather than the raw gain.

          The buttons drop to secondary underneath. They are how the page gets
          filled and they are not what it is about.

          The trophy stays: it is this page's own mark and it sits in the
          corner the range leaves empty. */}
      <PageHero variant="records" tone="violet" className="rc-top">
        <header className="rc-hero">
          <div className="rc-hero-text">
            <h1 className="rc-title">Achievements</h1>
            {lead ? (
              <>
                <p className="rc-sub is-thesis">Your records</p>
                <p className="rc-lead">
                  <span className="rc-lead-span">
                    <span className="rc-lead-from">{formatValue(lead.first, lead.unit)}</span>
                    <span className="rc-lead-arrow" aria-hidden="true">→</span>
                    <span className="rc-lead-to">{formatValue(lead.value, lead.unit)}</span>
                  </span>
                  <span className="rc-lead-tail">
                    on <strong>{lead.name}</strong>
                    <span className="rc-lead-dot" aria-hidden="true">·</span>
                    <span className="rc-lead-gain">{gainWords(lead)}</span> since your first
                    attempt
                  </span>
                </p>
              </>
            ) : (
              <p className="rc-sub">Your personal bests, how much you've improved and the badges you've earned.</p>
            )}
            {view === 'bests' && (
            <div className="rc-hero-tools">
              <button type="button" className="rc-btn is-primary" onClick={() => open('record')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                Add record
              </button>
              <button type="button" className="rc-btn" onClick={() => open('milestone')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                Add milestone
              </button>
            </div>
            )}
          </div>
          <div className="rc-hero-art" aria-hidden="true"><Icon name="trophy" /></div>
        </header>
      </PageHero>

      <nav className="rc-views" aria-label="Achievements sections">
        {VIEWS.map((one) => (
          <NavLink
            key={one.key}
            to={one.path}
            end
            className={({ isActive }) => `rc-view${isActive ? ' is-on' : ''}`}
          >
            {one.label}
          </NavLink>
        ))}
      </nav>

      {view === 'badges' && <BadgeWall />}

      {view === 'bests' && (
      <>
      {error && <p className="rc-error">{error}</p>}

      {/* ---- Four stories --------------------------------------------------
          These were counts: personal records, milestones, categories, bests
          this month. Every one was true and none of them was a record. "47
          personal records" is a fact about how much you have written down, and
          a page whose whole claim is *look how far you have come* answers it
          with inventory.

          So each tile is now something that happened — the biggest single
          jump, the longest run of beating yourself, what was set this month,
          what has stood unbeaten longest. How they are chosen is in
          `stories` in utils/records; the short of it is that a tile with no
          honest figure is not drawn at all, so this row is four wide on an
          account with some history and one wide on a new one.

          The counts did not want deleting, only demoting — they answer "how
          much is in here", which is a real question and a small one. They are
          the line underneath. */}
      {tales.length > 0 && (
        <ul className="rc-tiles">
          {tales.map((story) => (
            <li className={`rc-tile tone-${story.tone}`} key={story.key}>
              <span className="rc-tile-ico" aria-hidden="true"><Icon name={story.icon} /></span>
              <span className="rc-tile-figure">{story.figure}</span>
              <span className="rc-tile-label">{story.label}</span>
              <span className="rc-tile-detail">{story.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <p className="rc-meta">
          {counts.records} {counts.records === 1 ? 'entry' : 'entries'} logged
          <span aria-hidden="true"> · </span>
          {bests.length} {bests.length === 1 ? 'record' : 'records'}
          <span aria-hidden="true"> · </span>
          {counts.milestones} {counts.milestones === 1 ? 'milestone' : 'milestones'}
          <span aria-hidden="true"> · </span>
          {counts.categories} {counts.categories === 1 ? 'category' : 'categories'}
        </p>
      )}

      {/* ---- 2. Personal bests ---------------------------------------------
          There was a "Category records" section under this one, listing the
          same bests a second time under their headings. Both sections asked
          *what are my best things?* and answered it with the same rows in two
          shapes, which is the page's biggest redundancy and cost it the room
          the evolution chart now has.

          So the categories became what they always were — a filter on this
          section — and the chips moved into its header. Nothing is lost:
          picking a heading gives every best under it rather than the six the
          old list truncated to. */}
      <section className="rc-section">
        <div className="rc-section-head">
          <h2 className="rc-section-title"><Icon name="trophy" /> Your best</h2>
          {cats.length > 0 && (
            <div className="rc-chips" role="group" aria-label="Filter by category">
              {['All', ...cats].map((name) => (
                <button key={name} type="button"
                        className={`rc-chip${category === name ? ' is-on' : ''}`}
                        aria-pressed={category === name}
                        onClick={() => pickCategory(name)}>
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>

        {bests.length === 0 ? (
          <p className="rc-empty">
            Nothing logged yet. "Add record" just needs a name, a number and a date.
          </p>
        ) : shownBests.length === 0 ? (
          <p className="rc-empty">No records under "{category}" yet.</p>
        ) : (
          <>
            <ul className="rc-bests">
              {(allBests ? shownBests : shownBests.slice(0, TOP_BESTS)).map((best) => (
                <BestCard key={best.name} best={best}
                          onOpen={() => open('record', best.history[best.history.length - 1])} />
              ))}
            </ul>
            {shownBests.length > TOP_BESTS && (
              <button type="button" className="rc-link rc-more"
                      onClick={() => setAllBests((shown) => !shown)}>
                {allBests
                  ? 'Show fewer'
                  : `Show all ${shownBests.length}${category === 'All' ? '' : ` in ${category}`}`}
              </button>
            )}
          </>
        )}
      </section>

      {/* ---- 3. Record evolution -------------------------------------------
          This was the eighth thing on the page and it is the reason the page
          exists. Analytics asks *how am I doing*; this asks *I used to be
          there?* — and that difference is the only thing that makes Records a
          separate destination rather than a tab. Burying it under the
          timeline, the milestones and a search bar made it a footnote to
          sections that are inventory.

          So it sits directly under the bests, which are what it explains: the
          cards give the figure and the shape, and this gives the whole series
          with an axis to read it against. */}
      {bests.length > 0 && evolving && (
        <section className="rc-section rc-card" id="rc-timeline">
          <div className="rc-section-head">
            <h2 className="rc-section-title is-card">
              <span className="rc-head-ico" aria-hidden="true"><Icon name="trend" /></span>
              Records timeline
            </h2>
            <div className="rc-ev-pick">
              <select className="rc-select" value={evolving.name}
                      aria-label="Which record to plot"
                      onChange={(event) => setPick(event.target.value)}>
                {bests.map((best) => (
                  <option key={best.name} value={best.name}>
                    {best.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* The toolbar sits on the chart rather than over the list it
              filters, which is where the layout puts it and is also where it
              does the most work: the search, the category and the sort narrow
              the *rows*, and the rows are what the chart is drawn from, so one
              strip at the top of the pair governs both halves of the section
              instead of appearing to govern only the list under it. */}
          {rows.length > 0 && (
            <div className="rc-bar">
              <label className="rc-bar-search">
                <span className="rc-bar-ico" aria-hidden="true"><Icon name="search" /></span>
                <input type="search" placeholder="Search records…" value={query}
                       aria-label="Search records"
                       onChange={(event) => narrow(setQuery)(event.target.value)} />
              </label>

              {/* The same filter the chips above set, and it shows what they
                  set — so the section always says what it is showing without
                  scrolling back up to look. */}
              <select className="rc-select is-small" value={category}
                      aria-label="Filter by category"
                      onChange={(event) => pickCategory(event.target.value)}>
                <option value="All">All categories</option>
                {cats.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>

              <select className="rc-select is-small" value={sort}
                      aria-label="Order the history"
                      onChange={(event) => narrow(setSort)(event.target.value as Sort)}>
                <option value="newest">Newest ↓</option>
                <option value="oldest">Oldest ↑</option>
                <option value="improvement">Biggest improvement</option>
              </select>
            </div>
          )}

          <div className="rc-ev-wrap">
            <InsightPanel best={evolving} />

            {evolving.history.filter((row) => row.achieved_on).length > 1 && (
              <div className="rc-ev-bar">
                {/* Said above the chart, every time, because which way is
                    good is the one thing an axis cannot tell you. */}
                <p className="rc-ev-cap">
                  {chartMode === 'results'
                    ? evolving.direction === 'lower'
                      ? 'Your results as logged. Lower is better, so a falling line is good news.'
                      : 'Your results as logged. Higher is better.'
                    : 'How far each result is from your first. Up is better, whichever way the record is measured.'}
                </p>
                <div className="rc-seg" role="group" aria-label="What the chart shows">
                  {(['results', 'improvement'] as const).map((mode) => (
                    <button key={mode} type="button" className={chartMode === mode ? 'is-on' : ''}
                            aria-pressed={chartMode === mode} onClick={() => setChartMode(mode)}>
                      {mode === 'results' ? 'Results' : 'Improvement'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Evolution best={evolving} mode={chartMode} />
            <AttemptsTable key={evolving.name} best={evolving} />
          </div>
        </section>
      )}

      {/* ---- 4 & 5. History and milestones ---------------------------------
          The timeline drew the twelve newest entries and a separate section at
          the foot of the page drew all of them again with a search box over
          it. Same rows, twice, and the second copy was a section in its own
          right — the ninth thing to scroll past on a page of nine.

          One list now, with the search, the category and the sort as a strip
          across the top of it. They are necessary once there are a hundred
          entries and they are not part of what the page is for, so they get a
          toolbar rather than a destination.

          And the list reads as history rather than as a log: the date is
          written once for everything that happened under it, and an entry that
          beat everything before it says so and by how much. Those readings are
          `moments` in utils/records. */}
      <section className="rc-section rc-card">
        <div className="rc-section-head">
          <h2 className="rc-section-title is-card">
            <span className="rc-head-ico" aria-hidden="true"><Icon name="clock" /></span>
            Recent records
          </h2>
          {/* The layout puts a way out of this card in its corner. It scrolls
              to the toolbar above rather than going anywhere: every record the
              account owns is already in this list, and the control that shows
              more of them is the one it lands on. */}
          {history.length > days && (
            <button type="button" className="rc-link"
                    onClick={() => setDays((shown) => shown + DAYS_SHOWN)}>
              View all records →
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <p className="rc-empty">
            {rows.length === 0 ? 'Nothing dated yet.' : 'Nothing matches that.'}
          </p>
        ) : (
          <>
            {/* Still paged by day — `days` is a count of days and the button
                below says so — but drawn flat, because every row now carries
                its own date. Flattening here rather than changing the paging
                keeps one definition of "how much history is showing". */}
            <ol className="rc-recs">
              {history.slice(0, days).flatMap((day) => day.rows).map((row) => (
                <Entry key={row.id} row={row} moment={meant.get(row.id)} big={bigIds.has(row.id)}
                       onOpen={() => open(row.kind, row)} />
              ))}
            </ol>
            {history.length > days && (
              <button type="button" className="rc-link rc-more"
                      onClick={() => setDays((shown) => shown + DAYS_SHOWN)}>
                Show {Math.min(DAYS_SHOWN, history.length - days)} more{' '}
                {history.length - days === 1 ? 'day' : 'days'}
              </button>
            )}
          </>
        )}
      </section>

      <section className="rc-section rc-card">
          <div className="rc-section-head">
            <button
              type="button"
              className="rc-fold"
              aria-expanded={!milesShut}
              title={milesShut ? 'Show the milestones' : 'Hide the milestones'}
              onClick={() => setMilesShut((shut) => !shut)}
            >
              <Caret />
              <h2 className="rc-section-title is-card">
                <span className="rc-head-ico" aria-hidden="true"><Icon name="medal" /></span>
                Milestones
              </h2>
              {milestones.length > 0 && <span className="rc-fold-n">{milestones.length}</span>}
              {milestones.length > 0 && (
                <span className="rc-fold-sub">
                  {reachedCount} reached · {milestones.length - reachedCount} in progress
                </span>
              )}
            </button>
            <button type="button" className="rc-link" onClick={() => open('milestone')}>
              + Add
            </button>
          </div>
          {milesShut ? null : (
            <>
              <p className="rc-define">
                A record is <strong>I did better</strong>: a number you keep beating. A milestone is{' '}
                <strong>I reached something</strong>. It can still count toward a goal number, like
                20 problems solved, and link to the records it's about.
              </p>
              {milestones.length === 0 ? (
                <p className="rc-empty">
                  "First 25/25", "Reached RCM 9", "1,000 tasks done".
                </p>
              ) : (
            <ul className="rc-miles">
              {mileGroups.map((group) => (
                <GroupRow
                  key={group.key}
                  entry={group}
                  open={Boolean(openKeys[group.key])}
                  onToggle={() => toggleKey(group.key)}
                  bests={bests}
                  busy={busy}
                  onPick={(row) => open('milestone', row)}
                  onDone={markDone}
                  onLink={showRecord}
                />
              ))}
              {looseMiles.map((row) => (
                <MileRow key={row.id} row={row} bests={bests} busy={busy}
                         onPick={(one) => open('milestone', one)} onDone={markDone} onLink={showRecord} />
              ))}
            </ul>
              )}
            </>
          )}
      </section>

      {/* ---- 6. What Summit noticed -----------------------------------------
          The page as it was, kept whole and kept separate. See the header.

          "Tracked automatically" described the mechanism, which is the one
          thing about this section nobody needs told — every other section is
          things you typed, and this is the one that isn't. What it is *for* is
          that Summit watched and has something to report, so that is what the
          heading says.

          It is reference, not a fifth claim. Everything above it is the
          account's own argument about itself; this is the app's footnote to
          it, and it reads as one: it sits under a rule, its cards stay in the
          quieter register they have always had, and the chase under it is
          quieter still. */}
      <section className="rc-section rc-derived rc-card">
        <h2 className="rc-section-title is-card">
          <span className="rc-head-ico" aria-hidden="true"><Icon name="sparkles" /></span>
          From your activity
        </h2>
        <p className="rc-note">
          Filled in from your activity automatically.
        </p>

        {all.length < NEED_DAYS ? (
          <p className="rc-empty">
            Nothing to beat yet. Finish some work and this fills in.
          </p>
        ) : (
          <>
            <ul className="rc-cards">
              {derived.map((record) => (
                <DerivedCard key={record.key} record={record} />
              ))}
            </ul>

            {/* "Next records to go for" asked what to chase next, which is
                the Goals page's question, on a page about where you have
                been. It is useful and it is not the point, so it keeps its
                figures and loses its weight: a smaller heading, thinner
                bars, and a title that is a statement about the records
                rather than an instruction about the week. */}
            {chase.length > 0 && (
              <>
                <h3 className="rc-sub-title is-quiet">Records within reach</h3>
                <ul className="rc-chases is-quiet">
                  {chase.map((row) => (
                    <ChaseRow key={row.key} row={row} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>
      </>
      )}

      <RecordModal
        open={modal.open}
        entry={modal.entry}
        kind={modal.kind}
        rows={rows}
        busy={busy}
        onClose={() => setModal({ open: false, kind: modal.kind })}
        onSave={(draft) => void saveRecord(draft)}
        onDelete={(entry) => void deleteRecord(entry)}
      />
    </div>
  );
}
