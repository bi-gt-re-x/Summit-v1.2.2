/**
 * Turning the record into things to do differently.
 *
 * Every recommendation here is derived from `utils/behaviour` — the same
 * functions the Insights page states its findings from — so the two pages
 * cannot contradict each other. Insights says "you take three-day breaks";
 * this says "closing half of them is worth 4,000 XP a year". One is the
 * finding, the other is the consequence, and they are the same number.
 *
 * ## The rules the rules follow
 *
 * **Only what the data supports.** A recommendation is generated when a
 * threshold in this account's own record is crossed, never on a schedule. An
 * account with an even week and no gaps genuinely has nothing to fix on those
 * counts, and is told so rather than handed filler.
 *
 * **A number attached to every one.** "Be more consistent" is not advice. Each
 * item carries what it would be worth in XP a year, computed from this
 * account's own averages — so the reader can rank them by size rather than by
 * the order somebody wrote them in, which is what `impact` sorts on.
 *
 * **Arithmetic, not prophecy.** Every projection is the account's own average
 * multiplied by a number of days. Nothing here assumes the change compounds,
 * gets easier, or improves anything it does not directly touch.
 */
import type { GrowthDay } from '@/types';
import type {
  BalanceShape,
  ClockShape,
  RhythmShape,
  SubjectQualityShape,
  WeekShape,
} from './behaviour';
import { REASON_FLOOR, type RatingSummary, type ReasonSummary } from './ratings';
import type { Ratings } from '@/types';

export type AdviceKind = 'frequency' | 'timing' | 'depth' | 'balance' | 'quality' | 'load';

/**
 * Fewest rated tasks in a subject before a rule will act on its rating.
 *
 * Higher than `SUBJECT_FLOOR` in utils/behaviour, which is the floor for
 * *reporting* a subject's numbers. Telling somebody to change how they study
 * is a bigger claim than printing a figure, and it should need more behind it.
 */
const SUBJECT_RULE_FLOOR = 6;

/**
 * What area of the habit a suggestion is about.
 *
 * Separate from `kind`, which is the *shape* of the change (how often, when,
 * how long). A reader filters by category — "show me the scheduling ones" — and
 * groups by kind without ever being told the word.
 *
 * Eight, and each one is reachable: every category here has at least one strict
 * rule that can produce it and at least one fallback, so a chip never appears
 * for a taxonomy the rules cannot fill.
 *
 * `Subjects` is the newest and answers the question the other seven cannot:
 * they are all about *how* the week is worked — how often, when, how long, how
 * hard — and none of them can say which subject the effort is going into or
 * whether it is working there. A reader whose consistency is perfect and whose
 * Geometry has been sliding for a month gets nothing at all from the other
 * seven, which is precisely the case where advice is worth most. The set replaced an eight-name list
 * that had grown apart from the rules — "Habit Building" and "Task Management"
 * were never emitted by anything, "Time Management" and "Scheduling" were the
 * same question asked twice, and there was no home at all for the two things
 * the app measures most closely: how well the work went, and whether the pace
 * is one this account can keep.
 */
export type AdviceCategory =
  | 'Productivity'
  | 'Consistency'
  | 'Quality'
  | 'Execution'
  | 'Focus Time'
  | 'Scheduling'
  | 'Burnout'
  | 'Subjects';

/**
 * How much this is likely to be worth, as three bands rather than a number.
 *
 * The XP figure is already on the card; a priority is for ranking a page at a
 * glance, and three bands is as fine as the underlying estimate can honestly
 * support. Derived in `rank` from impact against the account's own pace — never
 * assigned by hand, because a hand-assigned priority is just an opinion with a
 * colour.
 */
export type AdvicePriority = 'high' | 'medium' | 'low';

export interface Advice {
  id: string;
  kind: AdviceKind;
  category: AdviceCategory;
  /** The instruction, in the imperative. Short enough to be a heading. */
  title: string;
  /** What in the record produced it. One sentence. */
  because: string;
  /** What to actually do, concretely enough to start today. One sentence. */
  action: string;
  /** The count behind it — the line a sceptical reader checks first. */
  evidence: string;
  /** XP a year, if it worked. Drives the ordering. */
  impact: number;
  /** How the impact was arrived at, so it can be argued with. */
  workings: string;
  /** 1-5, where 1 is "you could do this today". */
  effort: number;
  /** Filled in by `rank`. Not written by the rules themselves — see the note. */
  priority: AdvicePriority;
}

/** What a rule states before `rank` adds the ordering fields. */
type Rule = Omit<Advice, 'priority'>;

const KIND_LABEL: Record<AdviceKind, string> = {
  frequency: 'How often',
  timing: 'When',
  depth: 'How long',
  balance: 'What on',
  quality: 'How well',
  load: 'How hard',
};

export function kindLabel(kind: AdviceKind): string {
  return KIND_LABEL[kind];
}

export const PRIORITY_LABEL: Record<AdvicePriority, string> = {
  high: 'High impact',
  medium: 'Medium impact',
  low: 'Low impact',
};

/** Three dots rather than three traffic lights — see the note on `AdvicePriority`. */
export const PRIORITY_TONE: Record<AdvicePriority, string> = {
  high: 'pink',
  medium: 'amber',
  low: 'green',
};

/** 1-5 effort, as the word a reader needs before deciding to start. */
export function difficultyLabel(effort: number): string {
  if (effort <= 1) return 'Easy';
  if (effort <= 2) return 'Straightforward';
  if (effort <= 3) return 'Moderate';
  return 'Hard';
}

export interface AdviceInput {
  days: GrowthDay[];
  week: WeekShape;
  clock: ClockShape;
  rhythm: RhythmShape;
  balance: BalanceShape;
  /**
   * Each subject as a quality reading — see `subjectQuality` in utils/behaviour.
   *
   * `balance` above says where the effort went; this says whether it worked.
   * The Subjects rules read only this, and every one of them checks `execution`
   * against null first: a subject nobody rated is not a subject going badly.
   */
  subjects: SubjectQualityShape;
  ratings: Ratings | null;
  /**
   * What the reader said about their finished work, over the same window.
   *
   * Optional in the sense that every rule reading it checks `rated` first:
   * rating is the one thing in Summit that is asked rather than measured, an
   * account may never do it, and a page that turned silence into a low score
   * would be inventing the opinion the prompt exists to collect. See
   * utils/ratings.
   */
  quality: RatingSummary | null;
  /**
   * The causes behind the work, at rating_depth 'reasons'.
   *
   * The only input on this page that carries a *why* rather than a what, and
   * the only one an account can be without entirely: on the other two depths
   * the question is never put, so this arrives empty and the rule reading it
   * produces nothing. That is the intended behaviour rather than a gap — see
   * `summariseReasons` in utils/ratings.
   */
  reasons: ReasonSummary | null;
}

/**
 * What to actually do about the cause somebody names most often.
 *
 * One line per reason, in the imperative, and each is a change to how the work
 * is *arranged* rather than an instruction to try harder. That is the whole
 * value of the third question: "execution is low" is a reading, and "you keep
 * getting interrupted" is something a person can act on this afternoon.
 */
const REASON_ACTIONS: Record<string, { action: string; effort: number }> = {
  distracted: {
    action: 'Put your phone in another room and start the next hard task before opening anything else.',
    effort: 2,
  },
  unclear: {
    action: 'Add the first step of each task as its own task, so you always know where to start.',
    effort: 1,
  },
  underestimated: {
    action: 'Split any task you expect to rate 4 or 5 for difficulty into two before you start.',
    effort: 2,
  },
  'no-time': {
    action: 'Do the hardest task first in the day, not last.',
    effort: 2,
  },
  'low-energy': {
    action: 'Move your hardest task to your best hour (see the Habits tab).',
    effort: 2,
  },
  interrupted: {
    action: 'Block out one uninterrupted session a day.',
    effort: 3,
  },
};

/** XP on a day this account actually worked — the unit every projection uses. */
function xpPerActiveDay(days: GrowthDay[]): number {
  const active = days.filter((day) => (Number(day.xp_earned) || 0) > 0);
  if (active.length === 0) return 0;
  return active.reduce((sum, day) => sum + (Number(day.xp_earned) || 0), 0) / active.length;
}

// --------------------------------------------------------------------------
// Load — what the burnout rules read
// --------------------------------------------------------------------------
/**
 * Whether the pace is one this account is keeping or one it is surviving.
 *
 * Three measurements, and none of them is "you worked a lot". A long run of
 * working days is a streak, which this app celebrates elsewhere and is not
 * about to scold anybody for; what these read is whether the *shape* of the
 * effort is sustainable — an unbroken run with no light day in it, output
 * piled into a handful of heavy days, and the quiet that follows those days.
 * A reader who is genuinely fine on all three is told nothing about burnout,
 * which is the point: the alternative is a wellbeing card that fires on a
 * schedule, and one of those is worth nothing the second time it appears.
 */
interface LoadShape {
  /** The longest unbroken run of days with any work on them. */
  longestRun: number;
  /** Share of the window's XP carried by its busiest tenth of working days. */
  topShare: number;
  /** Working days in the heaviest tenth. */
  topDays: number;
  /** Average XP on the day after a heavy day, against the ordinary average. */
  afterHeavy: number | null;
  ordinary: number;
}

function loadShape(days: GrowthDay[]): LoadShape {
  const xp = days.map((day) => Number(day.xp_earned) || 0);

  let longestRun = 0;
  let run = 0;
  xp.forEach((value) => {
    run = value > 0 ? run + 1 : 0;
    if (run > longestRun) longestRun = run;
  });

  const worked = xp.filter((value) => value > 0);
  const total = worked.reduce((sum, value) => sum + value, 0);
  const sorted = [...worked].sort((a, b) => b - a);
  const topDays = Math.max(1, Math.round(worked.length / 10));
  const topShare = total > 0 ? (sorted.slice(0, topDays).reduce((sum, v) => sum + v, 0) / total) * 100 : 0;

  // The day *after* each heavy day, against every day that does not follow one.
  // A crash shows up here and nowhere else: the heavy days themselves look like
  // the account's best work, and the average over the whole window hides the
  // trough because the spike is in the same average.
  const heavyAt = sorted[Math.max(0, topDays - 1)] ?? Infinity;
  const following: number[] = [];
  const rest: number[] = [];
  xp.forEach((value, index) => {
    if (index === 0) return;
    if ((xp[index - 1] ?? 0) >= heavyAt && heavyAt > 0) following.push(value);
    else rest.push(value);
  });
  const mean = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

  return {
    longestRun,
    topShare: Math.round(topShare),
    topDays,
    afterHeavy: following.length >= 3 ? mean(following) : null,
    ordinary: mean(rest),
  };
}

/**
 * Everything this account's record actually supports, largest first.
 *
 * The caller decides how many to show. Returning all of them ranked, rather
 * than a top three, is what lets the page put the rest under "also worth doing"
 * without a second pass over the same thresholds.
 */
export function recommendations(input: AdviceInput): Advice[] {
  const { days, week, clock, rhythm, balance, subjects, ratings, quality, reasons } = input;
  const out: Rule[] = [];
  const perDay = xpPerActiveDay(days);
  const yearScale = days.length > 0 ? 365 / days.length : 0;

  if (perDay <= 0 || days.length < 14) return [];

  const load = loadShape(days);

  // ---- frequency: the gaps ------------------------------------------------
  if (rhythm.gapCount > 0) {
    // Half the gap days recovered, which is a deliberately modest claim: the
    // whole point of a three-day gap is that some of it was not available.
    const gapDays = Math.round(rhythm.gapCount * 3 * 0.5);
    out.push({
      id: 'close-gaps',
      kind: 'frequency',
      category: 'Consistency',
      title: 'Fill the three-day gaps',
      because: `You had ${rhythm.gapCount} breaks of 3+ days, and each one resets your streak.`,
      action: 'On days you would skip, do something small: 15 minutes, one problem or one page.',
      evidence: `${rhythm.gapCount} breaks of 3+ days across ${rhythm.span.toLocaleString()} days${
        rhythm.longestGap ? `, the longest running ${rhythm.longestGap.days} days` : ''
      }.`,
      impact: Math.round(gapDays * perDay * yearScale),
      workings: `${gapDays} recovered days × ${Math.round(perDay).toLocaleString()} XP on a working
        day, scaled to a year.`,
      effort: 2,
    });
  }

  // ---- frequency: the weekend --------------------------------------------
  if (week.weekendGap !== null && week.weekendGap <= -35) {
    const weekendDays = 104 * 0.5;
    out.push({
      id: 'weekend',
      kind: 'frequency',
      category: 'Scheduling',
      title: 'Claim one weekend day',
      because: `You do ${Math.abs(week.weekendGap)}% less on weekends than on weekdays.`,
      action: 'Pick one weekend day and schedule a session at the same time each week.',
      evidence: `Weekend days average ${Math.round(
        week.stats.filter((stat) => stat.index === 0 || stat.index === 6).reduce((sum, stat) => sum + stat.avgXp, 0) / 2,
      ).toLocaleString()} XP against ${Math.round(
        week.stats.filter((stat) => stat.index > 0 && stat.index < 6).reduce((sum, stat) => sum + stat.avgXp, 0) / 5,
      ).toLocaleString()} on a weekday.`,
      impact: Math.round(weekendDays * perDay * 0.6),
      workings: `Half of the ~104 weekend days a year, at 60% of a normal working day's
        ${Math.round(perDay).toLocaleString()} XP.`,
      effort: 3,
    });
  }

  // ---- depth: the sitting -------------------------------------------------
  if (rhythm.typicalSession > 0 && rhythm.typicalSession < 45) {
    const extra = 15;
    out.push({
      id: 'longer-sittings',
      kind: 'depth',
      category: 'Focus Time',
      title: 'Add 15 minutes to each sitting',
      because: `Your sessions usually last ${Math.round(rhythm.typicalSession)} minutes, which leaves little time once you get going.`,
      action: 'Add 15 minutes to the end of a session you already have planned.',
      evidence: `Typical sitting ${Math.round(rhythm.typicalSession)} minutes${
        rhythm.longestSession ? `, against a best of ${Math.round(rhythm.longestSession.minutes)}` : ''
      }, across the ${Math.round(rhythm.activeRate)}% of days you work.`,
      impact: Math.round(
        (extra / rhythm.typicalSession) * perDay * (rhythm.activeRate / 100) * 365,
      ),
      workings: `A ${Math.round((extra / rhythm.typicalSession) * 100)}% longer sitting, on the
        ${Math.round(rhythm.activeRate)}% of days you work, at your current rate per day.`,
      effort: 2,
    });
  }

  // ---- timing: late nights ------------------------------------------------
  if (clock.lateShare >= 20) {
    out.push({
      id: 'earlier',
      kind: 'timing',
      category: 'Scheduling',
      title: 'Move one session earlier',
      because: `${clock.lateShare}% of your work happens after 10 PM, when it is easiest to skip.`,
      action: clock.coreWindow
        ? `Move your most important task to ${hourText(clock.coreWindow.from)}–${hourText(clock.coreWindow.to)}, when you work most reliably.`
        : 'Do your most important task at the time you are most reliably free.',
      evidence: `${clock.lateShare}% of completions land after 10 PM or before 5 AM${
        clock.coreWindow
          ? `, against a reliable window of ${hourText(clock.coreWindow.from)}–${hourText(
              clock.coreWindow.to,
            )} holding ${clock.coreWindow.share}%`
          : ''
      }.`,
      impact: Math.round(perDay * 0.15 * (rhythm.activeRate / 100) * 365),
      workings: `Recovering ~15% of a working day's output from sessions currently at risk of being
        skipped, across the days you work.`,
      effort: 3,
    });
  }

  // ---- balance ------------------------------------------------------------
  if (balance.fading.length > 0) {
    out.push({
      // The subject rides in the id, and it is the subject *id* rather than its
      // name. This is the one rule whose measure is about a particular subject
      // rather than about the account as a whole, and utils/followup has to
      // know which one a month later to check whether it actually restarted —
      // by which time the subject may have been renamed. See `measureFor`.
      id: `restart-fading:${balance.fadingIds[0]}`,
      kind: 'balance',
      category: 'Consistency',
      title: `Restart ${balance.fading[0]}`,
      because: `You worked on ${balance.fading.join(' and ')} early in this period, then stopped.`,
      action: 'Schedule one session this week, or drop it on purpose.',
      evidence: `${balance.fading.join(', ')} carried real work in the first half of this range and none in the second.`,
      impact: 0,
      workings: 'This one does not change your XP.',
      effort: 2,
    });
  }

  if (balance.leader && balance.concentration >= 45) {
    out.push({
      id: 'rebalance',
      kind: 'balance',
      category: 'Productivity',
      title: `${balance.leader} is ${balance.concentration}% of your week`,
      because: 'That is more than all your other subjects combined.',
      action: 'If that is intended, keep going. If not, add one weekly session for another subject.',
      evidence: `${balance.leader} holds ${balance.concentration}% of your XP across ${balance.carrying} subjects with real weight behind them.`,
      impact: 0,
      workings: 'This one does not change your XP.',
      effort: 1,
    });
  }

  // ---- subjects: where the effort is going least far ----------------------
  /* Everything above is about the shape of the week. These four are about what
     is in it. They read `subjects` — the per-subject quality reading — and each
     one checks for a null execution first, because a subject nobody rated must
     never be reported as a subject going badly. */
  const readable = subjects.rows.filter(
    (row) => row.execution !== null && row.rated >= SUBJECT_RULE_FLOOR,
  );

  if (readable.length >= 2) {
    const worst = [...readable].sort((a, b) => a.execution! - b.execution!)[0]!;
    /* Against the *other* subjects, not against an average that includes this
       one. With two subjects, comparing Physics at 4.0 to the mean of both at
       4.5 understates a gap that is really a whole point — and the fewer
       subjects an account has, the more the subject drags its own baseline
       toward itself. */
    const others = readable.filter((row) => row.id !== worst.id);
    const elsewhere =
      others.reduce((sum, row) => sum + row.execution!, 0) / others.length;
    const behind = elsewhere - worst.execution!;
    if (behind >= 0.4) {
      out.push({
        // Keyed on the subject id, for the same reason `restart-fading` is: the
        // follow-up has to find the same subject a month later, by which time
        // it may have been renamed. See `measureFor` in utils/followup.
        id: `subject-weak:${worst.id}`,
        kind: 'quality',
        category: 'Subjects',
        title: `Change how you practise ${worst.name}`,
        because: `You rate ${worst.name} ${worst.execution!.toFixed(1)}/5, compared with ${elsewhere.toFixed(1)} for your other subjects.`,
        action: `Try a different method in your next ${worst.name} session, like worked examples before problems.`,
        evidence: `${worst.rated} rated ${worst.name} tasks at ${worst.execution!.toFixed(1)}/5, ${behind.toFixed(1)} below the ${others.length} other subject${others.length === 1 ? '' : 's'} you rated.`,
        impact: 0,
        workings: 'This one does not change your XP.',
        effort: 3,
      });
    }
  }

  /* Reaching too far, which looks identical to going badly on any single
     number and is the opposite problem. Hard work rated poorly is not a subject
     you are bad at, it is a step size you have not earned yet. */
  const overreaching = readable
    .filter((row) => row.difficulty !== null && row.difficulty >= 3.8 && row.execution! <= 2.6)
    .sort((a, b) => a.execution! - b.execution!)[0];
  if (overreaching) {
    out.push({
      id: `subject-overreach:${overreaching.id}`,
      kind: 'load',
      category: 'Subjects',
      title: `Drop a step in ${overreaching.name}`,
      because: `${overreaching.name} rates ${overreaching.difficulty!.toFixed(1)}/5 for difficulty but only ${overreaching.execution!.toFixed(1)}/5 for how it went. The jump may be too big.`,
      action: `Spend one session on easier material and finish it well.`,
      evidence: `${overreaching.rated} rated ${overreaching.name} tasks: difficulty ${overreaching.difficulty!.toFixed(1)}, execution ${overreaching.execution!.toFixed(1)}.`,
      impact: 0,
      workings: 'This one does not change your XP.',
      effort: 2,
    });
  }

  /* A subject that is moving. The only rule on this page that asks the reader
     to do more of something rather than to change it — and it fires rarely,
     which is what makes it worth reading when it does. */
  const rising = readable
    .filter((row) => row.movement !== null && row.movement >= 0.5)
    .sort((a, b) => b.movement! - a.movement!)[0];
  if (rising) {
    out.push({
      id: `subject-rising:${rising.id}`,
      kind: 'balance',
      category: 'Subjects',
      title: `Keep pushing ${rising.name}`,
      because: `Your ${rising.name} ratings rose ${rising.movement!.toFixed(1)} points, your biggest improvement.`,
      action: `Add one harder ${rising.name} session this week.`,
      evidence: `${rising.rated} rated ${rising.name} tasks, execution up ${rising.movement!.toFixed(1)} between the halves of this window.`,
      impact: Math.round(perDay * 0.5 * 52),
      workings: `Half a working day's XP a week for a year, at ${Math.round(perDay).toLocaleString()} XP a working day.`,
      effort: 1,
    });
  }

  /* Dropped rather than fading. `balance.fading` catches a subject that stopped
     inside the window; this catches one whose last session is far enough back
     that the window may not contain it at all. */
  /* Lifetime count, not the window's: a subject last touched five weeks ago
     has nothing inside a fortnight to be missing from. See `lifetimeDone`. */
  const dropped = subjects.rows
    .filter(
      (row) =>
        row.lifetimeDone >= SUBJECT_RULE_FLOOR && row.sinceDays !== null && row.sinceDays >= 21,
    )
    .sort((a, b) => b.lifetimeDone - a.lifetimeDone)[0];
  if (dropped && !balance.fadingIds.includes(dropped.id)) {
    out.push({
      id: `subject-dropped:${dropped.id}`,
      kind: 'balance',
      category: 'Subjects',
      title: `No ${dropped.name} for ${dropped.sinceDays} days`,
      because: `You have finished ${dropped.lifetimeDone} ${dropped.name} tasks, but none in the last three weeks.`,
      action: 'Schedule one short session, or remove the subject if you are done with it.',
      evidence: `Last ${dropped.name} task ${dropped.sinceDays} days ago, ${dropped.lifetimeDone} in total.`,
      impact: 0,
      workings: 'This one does not change your XP.',
      effort: 1,
    });
  }

  // ---- quality: the weakest graded metric --------------------------------
  if (ratings) {
    const metrics = Object.entries(ratings.metrics) as Array<[string, { score: number }]>;
    const weakest = metrics.reduce((a, b) => (b[1].score < a[1].score ? b : a));
    const [name, metric] = weakest;
    if (metric.score < 60) {
      out.push({
        id: `metric-${name}`,
        kind: 'quality',
        category: METRIC_CATEGORY[name] ?? 'Productivity',
        title: `${name[0]!.toUpperCase()}${name.slice(1)} is holding your grade down`,
        because: `It scores ${metric.score}/100, your lowest of the five.`,
        action: METRIC_ADVICE[name] ?? 'Focus on this one first.',
        evidence: `${name} scores ${metric.score}/100, the lowest of the five graded metrics.`,
        impact: 0,
        workings: 'This one does not change your XP.',
        effort: 3,
      });
    }
  }

  // ---- burnout: no let-up -------------------------------------------------
  // A three-week run with no day off in it, at sittings long enough for the run
  // to cost something. The second half of that gate is what stops this being a
  // card every consistent account sees: three weeks of fifteen-minute days is a
  // habit, not a load, and calling it burnout would make the word worthless
  // here. Deliberately not phrased as "break your streak" either — the app
  // counts streaks, the reader has earned this one, and advice that costs
  // somebody the thing they came for gets ignored on sight. A light day keeps
  // the run and is the actual recommendation.
  if (load.longestRun >= 21 && rhythm.typicalSession >= 45) {
    out.push({
      id: 'plan-a-light-day',
      kind: 'load',
      category: 'Burnout',
      title: 'Plan a light day',
      because: `You have worked ${load.longestRun} days in a row without a lighter day.`,
      action: 'Pick one day a week to do the minimum. Your streak stays intact.',
      evidence: `Longest unbroken run in this range: ${load.longestRun} days, across ${rhythm.span.toLocaleString()} days at ${Math.round(rhythm.activeRate)}% active.`,
      impact: 0,
      workings: 'This one does not change your XP.',
      effort: 1,
    });
  }

  // ---- burnout: the work is in bursts -------------------------------------
  if (load.topShare >= 30 && load.topDays >= 2) {
    out.push({
      id: 'even-out-the-load',
      kind: 'load',
      category: 'Burnout',
      title: 'Your work is bunched into a few days',
      because: `${load.topDays} days account for ${load.topShare}% of your XP in this period.`,
      action: 'On your busiest days, move the last hour of work to the next quiet day.',
      evidence: `${load.topDays} of your working days hold ${load.topShare}% of the window's XP.`,
      impact: 0,
      workings: 'This one does not change your XP.',
      effort: 3,
    });
  }

  // ---- execution: how it went, not how hard it was ------------------------
  if (quality && quality.rated >= 5 && (quality.execution ?? 5) < 3) {
    const value = quality.execution ?? 0;
    out.push({
      id: 'execution-slipping',
      kind: 'quality',
      category: 'Execution',
      title: 'Tasks are done, but not well',
      because: `You rate your execution ${value.toFixed(1)}/5 on average.`,
      action: 'Give one task a full session instead of splitting the time.',
      evidence: `Execution averages ${value.toFixed(1)}/5 across the ${quality.rated} tasks you rated, against a difficulty of ${(quality.difficulty ?? 0).toFixed(1)}/5.`,
      impact: 0,
      workings: 'This one does not change your XP.',
      effort: 3,
    });
  }

  // ---- quality: rated too little to be told anything ----------------------
  if (quality && quality.finished >= 10 && quality.coverage < 40) {
    out.push({
      id: 'rate-your-work',
      kind: 'quality',
      category: 'Quality',
      title: 'Rate what you finish',
      because: `Only ${quality.coverage}% of your finished tasks are rated, so there is not enough to go on.`,
      action: 'Rate your next 10 tasks when you finish them.',
      evidence: `${quality.rated} of ${quality.finished} finished tasks in this range were rated on both rows.`,
      impact: 0,
      workings: 'This one does not change your XP.',
      effort: 1,
    });
  }

  // ---- quality: comfortable work, done well -------------------------------
  // The top-left corner of the grid on the Overview, stated as an instruction.
  if (quality && quality.rated >= 5 && (quality.difficulty ?? 5) < 2.5 && (quality.execution ?? 0) >= 3.5) {
    out.push({
      id: 'stretch-harder',
      kind: 'quality',
      category: 'Quality',
      title: 'Your tasks are all easy',
      because: `Difficulty averages ${(quality.difficulty ?? 0).toFixed(1)}/5 and execution ${(quality.execution ?? 0).toFixed(1)}/5. You are doing well on easy work.`,
      action: 'Add one task you are not sure you can finish.',
      evidence: `Across ${quality.rated} rated tasks: difficulty ${(quality.difficulty ?? 0).toFixed(1)}/5, execution ${(quality.execution ?? 0).toFixed(1)}/5, quality ${(quality.quality ?? 0).toFixed(1)}/25.`,
      impact: 0,
      workings: 'This one does not change your XP.',
      effort: 4,
    });
  }

  // ---- the cause, where the account has asked to be asked for one ---------
  // Nothing here exists at rating_depth 'none' or 'ratings': `reasons` comes
  // back empty and the guard below is never passed. That is the point of the
  // third question — it is the only thing in the app that turns a reading into
  // a cause, and this is the rule that spends it.
  const worstReason = reasons?.struggle[0] ?? null;
  if (reasons && worstReason && reasons.struggled >= REASON_FLOOR) {
    const how = REASON_ACTIONS[worstReason.key];
    if (how) {
      out.push({
        id: `reason-${worstReason.key}`,
        kind: 'quality',
        category: 'Execution',
        title: `The same problem keeps coming up`,
        because: `${worstReason.count} of your ${reasons.struggled} low-rated tasks had the same cause: it ${worstReason.phrase}.`,
        action: how.action,
        evidence: `${worstReason.share}% of your badly-rated work names one cause out of six offered. The next most common accounts for ${reasons.struggle[1]?.share ?? 0}%.`,
        impact: 0,
        workings: 'This one does not change your XP.',
        effort: how.effort,
      });
    }
  }

  // ---- the floor ----------------------------------------------------------
  // Topped up to FLOOR from the same measurements, read at a lower threshold.
  // Nothing invented — see `fallbacks`.
  if (out.length < FLOOR) {
    const have = new Set(out.map((rule) => rule.id));
    for (const rule of fallbacks(input, perDay, yearScale, load)) {
      if (out.length >= FLOOR) break;
      if (have.has(rule.id)) continue;
      out.push(rule);
      have.add(rule.id);
    }
  }

  return rank(out, perDay * 365).slice(0, CEILING);
}

/**
 * The fewest suggestions the tab will show an account that has any at all.
 *
 * Three is what the layout is built for — `HEADLINE_ADVICE` in the page, and a
 * row of three cards — and a tab that came back with one card had the rest of
 * the row as empty space, which reads as something that failed to load rather
 * than as an account with little to fix.
 */
const FLOOR = 3;

/**
 * The most it will ever hand back, however much the record supports.
 *
 * Ten, and the number is about the reader rather than about the rules. With
 * seven categories and a fallback pass behind each, a long-running account can
 * cross fifteen thresholds at once — and a list of fifteen things to change is
 * not a plan, it is a reason to close the tab. Three lead the page as cards,
 * the rest sit under "also worth doing" and behind the category chips, and the
 * ones that did not make ten were the ones ranked least worth doing anyway.
 *
 * Applied after `rank`, so what survives is the top of the list rather than
 * whichever rules happen to be written first in this file.
 */
const CEILING = 10;

/**
 * What is drawn on to reach the floor, in the order it is drawn on.
 *
 * **These are not filler, and the distinction is the whole reason this is a
 * separate pass.** Every one is the same measurement a rule above already gates
 * on, read at a threshold low enough to nearly always have something to say:
 * the strict gates answer "what is clearly wrong here", these answer "what is
 * the most improvable thing here" — which has an answer for every account, and
 * is a weaker claim, so they carry smaller numbers and sort below the real
 * findings on their own merits rather than by being pinned there.
 *
 * They are only ever reached for when the strict pass came back short, and each
 * is skipped if the strict pass already emitted the same id, so an account with
 * three real findings never sees any of this.
 */
function fallbacks(
  input: AdviceInput,
  perDay: number,
  yearScale: number,
  load: LoadShape,
): Rule[] {
  const { days, week, rhythm, balance, ratings, quality } = input;
  const out: Rule[] = [];

  // ---- one more day in the week ------------------------------------------
  // Any account that has ever skipped a day. One that has not is genuinely not
  // being told to add a day it does not have.
  if (rhythm.activeRate < 100) {
    out.push({
      id: 'one-more-day',
      kind: 'frequency',
      category: 'Consistency',
      title: 'Add one day a week',
      because: `You work on ${Math.round(rhythm.activeRate)}% of days, so there is room for one more.`,
      action: 'Add a short session on the day you most often skip.',
      evidence: `${Math.round(rhythm.activeRate)}% of the ${rhythm.span.toLocaleString()} days in
        this range carried work.`,
      impact: Math.round(52 * perDay),
      workings: `52 added days a year — one a week — at ${Math.round(perDay).toLocaleString()} XP on
        a working day.`,
      effort: 2,
    });
  }

  // ---- the sitting, at a threshold that is not "too short" ----------------
  // Two hours is where adding ten minutes stops being the cheap option and
  // the session length stops being the thing worth changing.
  if (rhythm.typicalSession > 0 && rhythm.typicalSession < 120) {
    const extra = 10;
    out.push({
      id: 'longer-sittings',
      kind: 'depth',
      category: 'Focus Time',
      title: 'Add 10 minutes to each sitting',
      because: `Your sessions usually last ${Math.round(rhythm.typicalSession)} minutes.`,
      action: 'Add 10 minutes to the end of a session you already have planned.',
      evidence: `Typical sitting ${Math.round(rhythm.typicalSession)} minutes${
        rhythm.longestSession ? `, against a best of ${Math.round(rhythm.longestSession.minutes)}` : ''
      }, across the ${Math.round(rhythm.activeRate)}% of days you work.`,
      impact: Math.round((extra / rhythm.typicalSession) * perDay * (rhythm.activeRate / 100) * 365),
      workings: `A ${Math.round((extra / rhythm.typicalSession) * 100)}% longer sitting, on the
        ${Math.round(rhythm.activeRate)}% of days you work, at your current rate per day.`,
      effort: 1,
    });
  }

  // ---- the two weakest graded metrics -------------------------------------
  // The strict rule takes the weakest and only below 60. This takes the two
  // lowest that are not already perfect — "the lowest of the five is where a
  // point is cheapest" holds at any score, which is what makes it a fair thing
  // to say to a strong account and the reason there is no band here.
  if (ratings) {
    const metrics = Object.entries(ratings.metrics) as Array<[string, { score: number }]>;
    [...metrics]
      .sort((a, b) => a[1].score - b[1].score)
      .slice(0, 2)
      .forEach(([name, metric]) => {
        if (metric.score >= 100) return;
        out.push({
          id: `metric-${name}`,
          kind: 'quality',
          category: METRIC_CATEGORY[name] ?? 'Productivity',
          title: `${name[0]!.toUpperCase()}${name.slice(1)} is the easiest score to raise`,
          because: `It scores ${metric.score}/100, one of your lowest.`,
          action: METRIC_ADVICE[name] ?? 'Focus on this one first.',
          evidence: `${name} scores ${metric.score}/100 against a best of ${Math.max(
            ...metrics.map(([, entry]) => entry.score),
          )}/100 elsewhere on the card.`,
          impact: 0,
          workings: 'This one does not change your XP.',
          effort: 2,
        });
      });
  }

  // ---- the shape of the week, at a threshold below "lopsided" -------------
  // Any account carrying more than one subject: "should it be this share" is a
  // fair question at 30% and still a fair one at 12%.
  if (balance.leader && balance.carrying > 1) {
    out.push({
      id: 'rebalance',
      kind: 'balance',
      category: 'Productivity',
      title: `${balance.leader} is ${balance.concentration}% of your week`,
      because: `That is out of ${balance.carrying} active subjects.`,
      action: 'If that is intended, keep going. If not, add one weekly session for another subject.',
      evidence: `${balance.leader} holds ${balance.concentration}% of your XP across ${balance.carrying} subjects with real weight behind them.`,
      impact: 0,
      workings: 'This one does not change your XP.',
      effort: 1,
    });
  }

  // ---- the quietest day of the week ---------------------------------------
  // Seven averages always exist, and unless they are all identical one of them
  // is the lowest. Distinct from the weekend rule above, which fires only on a
  // whole weekend running light — this is about a single named day.
  const byDay = [...week.stats].sort((a, b) => a.avgXp - b.avgXp);
  const quietest = byDay[0];
  const busiest = byDay[byDay.length - 1];
  if (quietest && busiest && busiest.avgXp > quietest.avgXp && quietest.days > 0) {
    const lift = (busiest.avgXp - quietest.avgXp) * 0.5;
    out.push({
      id: 'quietest-weekday',
      kind: 'timing',
      category: 'Scheduling',
      title: `${quietest.label}s are your weakest day`,
      because: `You average ${Math.round(quietest.avgXp).toLocaleString()} XP on ${quietest.label}s and ${Math.round(busiest.avgXp).toLocaleString()} on ${busiest.label}s.`,
      action: `Find what is taking up your ${quietest.label}s and move your session to a free hour.`,
      evidence: `${quietest.label} averages ${Math.round(quietest.avgXp).toLocaleString()} XP across
        ${quietest.days} of them, ${Math.round(quietest.activeRate)}% of which carried any work.`,
      impact: Math.round(lift * 52),
      workings: `Half the gap to your best weekday, ${Math.round(lift).toLocaleString()} XP, on the
        52 ${quietest.label}s in a year.`,
      effort: 2,
    });
  }

  // ---- the quiet working days ---------------------------------------------
  // The last resort, and the one with no threshold at all: every account that
  // has worked at all has a weakest quarter of its working days.
  const worked = days
    .map((day) => Number(day.xp_earned) || 0)
    .filter((xp) => xp > 0)
    .sort((a, b) => a - b);
  if (worked.length >= 4) {
    const median = worked[Math.floor(worked.length / 2)]!;
    const quiet = worked.slice(0, Math.max(1, Math.floor(worked.length / 4)));
    const quietAvg = quiet.reduce((sum, xp) => sum + xp, 0) / quiet.length;
    if (median > quietAvg) {
      out.push({
        id: 'raise-the-floor',
        kind: 'depth',
        category: 'Consistency',
        title: 'Raise your minimum',
        because: `Your quietest days average ${Math.round(quietAvg).toLocaleString()} XP, compared with a typical ${Math.round(median).toLocaleString()}.`,
        action: 'Set a minimum amount of work for any day you study, and stick to it.',
        evidence: `The quietest ${quiet.length} of ${worked.length} working days average
          ${Math.round(quietAvg).toLocaleString()} XP, against a median of
          ${Math.round(median).toLocaleString()}.`,
        impact: Math.round((median - quietAvg) * quiet.length * yearScale),
        workings: `${quiet.length} quiet days lifted to the median, a gain of
          ${Math.round(median - quietAvg).toLocaleString()} XP each, scaled to a year.`,
        effort: 2,
      });
    }
  }

  // ---- execution, at "the weaker of the two rows" -------------------------
  // The strict rule fires below 3 out of 5, which is a genuinely unhappy
  // account. This one only claims that one of the two halves is lower than the
  // other, which is true of every account whose halves are not identical — and
  // it says which, because "raise your quality" is not an instruction and
  // "the half you rate lower is execution" is.
  if (quality && quality.rated >= 3 && quality.execution !== null && quality.difficulty !== null) {
    const behind = quality.execution <= quality.difficulty;
    out.push({
      id: behind ? 'execution-is-the-half' : 'difficulty-is-the-half',
      kind: 'quality',
      category: behind ? 'Execution' : 'Quality',
      title: behind ? 'Focus on execution' : 'Take on harder tasks',
      because: behind
        ? `Your execution (${quality.execution.toFixed(1)}/5) is lower than your difficulty (${quality.difficulty.toFixed(1)}/5).`
        : `Your difficulty (${quality.difficulty.toFixed(1)}/5) is lower than your execution (${quality.execution.toFixed(1)}/5).`,
      action: behind
        ? 'Finish one task properly before starting the next.'
        : 'Add one harder task each week.',
      evidence: `Across ${quality.rated} rated tasks: difficulty ${quality.difficulty.toFixed(1)}/5, execution ${quality.execution.toFixed(1)}/5, quality ${(quality.quality ?? 0).toFixed(1)}/25.`,
      impact: 0,
      workings: 'This one does not change your XP.',
      effort: 2,
    });
  }

  // ---- burnout, at "the day after" ----------------------------------------
  // No threshold on how hard the heavy days were, only on what follows them.
  // An account that works evenly has nothing here, because there is no heavy
  // day for a quiet one to follow.
  if (load.afterHeavy !== null && load.ordinary > 0 && load.afterHeavy < load.ordinary * 0.7) {
    const drop = Math.round((1 - load.afterHeavy / load.ordinary) * 100);
    out.push({
      id: 'after-the-peak',
      kind: 'load',
      category: 'Burnout',
      title: 'Big days are followed by slow ones',
      because: `The day after a heavy day is ${drop}% below your normal output.`,
      action: 'End heavy days one task early and do it the next day.',
      evidence: `Days following your heaviest ${load.topDays} average ${Math.round(load.afterHeavy).toLocaleString()} XP against ${Math.round(load.ordinary).toLocaleString()} on every other day.`,
      impact: 0,
      workings: 'This one does not change your XP.',
      effort: 2,
    });
  }

  // ---- focus, at "you finish more than you log" ---------------------------
  // Every account whose focus timer is used less often than its task list.
  // Not a scolding about the timer: focus is a graded metric, and a metric fed
  // by a third of the days it could be fed by is scoring the logging rather
  // than the work.
  const workedDays = days.filter((day) => (Number(day.xp_earned) || 0) > 0).length;
  const focusDays = days.filter((day) => (Number(day.focus_minutes) || 0) > 0).length;
  if (workedDays >= 5 && focusDays < workedDays * 0.6) {
    const share = Math.round((focusDays / workedDays) * 100);
    out.push({
      id: 'log-the-focus',
      kind: 'depth',
      category: 'Focus Time',
      title: 'Most of your focus time is not logged',
      because: `Only ${share}% of your working days have focus time logged, so your focus score is too low.`,
      action: 'Start the focus timer before your first task each day.',
      evidence: `${focusDays} of ${workedDays} working days in this range carry any focus minutes.`,
      impact: 0,
      workings: 'This one does not change your XP.',
      effort: 1,
    });
  }

  return out;
}

/**
 * The ordering, and the priority band that comes with it.
 *
 * Ranked by XP a year first because that is the one comparison that survives
 * between two suggestions about different things, then by effort so that two
 * items worth the same amount put the easier one first. The band is cut against
 * the account's *own* yearly pace rather than a fixed number of XP: a
 * suggestion worth 4,000 a year is transformative on one account and a rounding
 * error on another, and a page that called both "high impact" would be
 * describing the suggestion instead of the reader.
 *
 * The unscored items — the ones that change the shape of a week rather than its
 * size — cannot be ranked this way and are never called high impact. They sort
 * to the bottom and say why on the card.
 */
function rank(rules: Rule[], yearlyPace: number): Advice[] {
  return rules
    .map<Advice>((rule) => {
      const share = yearlyPace > 0 ? rule.impact / yearlyPace : 0;
      return {
        ...rule,
        priority: rule.impact === 0 ? 'low' : share >= 0.12 ? 'high' : share >= 0.04 ? 'medium' : 'low',
      };
    })
    .sort((a, b) => b.impact - a.impact || a.effort - b.effort);
}

/** Which area of the habit each graded metric actually belongs to. */
const METRIC_CATEGORY: Record<string, AdviceCategory> = {
  productivity: 'Productivity',
  quality: 'Quality',
  consistency: 'Consistency',
  efficiency: 'Scheduling',
  focus: 'Focus Time',
};

/** What each report-card metric actually responds to. */
const METRIC_ADVICE: Record<string, string> = {
  productivity: `Productivity is your average XP per day, including days off. Working more days
    raises it faster than working longer.`,
  quality: `Quality is the average XP per finished task. Fewer, bigger tasks raise it.`,
  consistency: `Consistency is the share of days you do any work. Avoid gaps to raise it.`,
  efficiency: `Efficiency measures how often you meet due dates. Set dates you can realistically hit.`,
  focus: `Focus is logged focus time against your daily goal. If you rarely hit the goal, lower it
    to one you can reach four days out of five.`,
};

function hourText(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}

// --------------------------------------------------------------------------
// What the whole set would be worth
// --------------------------------------------------------------------------
export interface Outlook {
  /** XP a year at the current pace. */
  current: number;
  /** XP a year with every scored recommendation taken. */
  improved: number;
  /** The two as running totals over five years, for the chart. */
  currentLine: number[];
  improvedLine: number[];
}

/**
 * The pace now against the pace if the advice worked, over five years.
 *
 * Both lines start where the account actually is, so the gap between them is
 * the whole of the claim being made — and it is drawn over five years because
 * that is the horizon on which a change of habit stops being a rounding error.
 * The improved line is not a promise; it is the arithmetic of the items above
 * added up, which is why every one of them shows its workings.
 */
export function outlook(days: GrowthDay[], advice: Advice[], banked: number): Outlook {
  const earned = days.reduce((sum, day) => sum + (Number(day.xp_earned) || 0), 0);
  const current = days.length ? (earned / days.length) * 365 : 0;
  const gain = advice.reduce((sum, item) => sum + item.impact, 0);
  const improved = current + gain;

  const line = (perYear: number) =>
    Array.from({ length: 21 }, (_, step) => banked + (perYear * step) / 4);

  return {
    current: Math.round(current),
    improved: Math.round(improved),
    currentLine: line(current),
    improvedLine: line(improved),
  };
}
