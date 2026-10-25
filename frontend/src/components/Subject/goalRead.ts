/**
 * Insights and next moves for one subject, all pointed at its main goal.
 *
 * The subject page's premise is the goal: everything on it should say what it
 * means for getting there. The page already counts a lot (the difficulty
 * curve, momentum, the reasons sessions go badly, the goal's pace and its
 * levers), but the overview only showed the goal band and whatever the AI
 * wrote on request. This turns those counts into individual insights, each
 * saying what it means for the goal, and a short list of moves toward it.
 *
 * Everything here is arithmetic over figures the page already has. No model
 * call, no new fetch, so it's there from the first task.
 *
 * With no goal set, the same insights are said against "this subject", and the
 * first move is to set one.
 */
import type { GoalTopicPlan } from '@/services/topics';
import type { Driver, SubjectGoal, SubjectModel } from './model';
import type { SubjectState } from './state';

export type InsightTone = 'good' | 'bad' | 'flat';

export interface GoalInsight {
  id: string;
  tone: InsightTone;
  /** The finding, short. */
  title: string;
  /** The counted figure behind it. */
  figure: string;
  /** What it means for the goal. */
  means: string;
}

export interface GoalMove {
  id: string;
  /** What to do, as an instruction. */
  title: string;
  /** Why, with the figure. */
  why: string;
  /** `now` blocks the goal; `next` speeds it up; `keep` protects what works. */
  weight: 'now' | 'next' | 'keep';
  /** Where in the app to do it, when somewhere fits. */
  to?: string;
  link?: string;
  /** A free place to do it, for moves that name a topic. */
  resource?: { name: string; url: string } | null;
  /** True for moves that come from the topic library rather than the counts. */
  topical?: boolean;
}

export interface GoalRead {
  /** The goal's title, or '' when the subject has none. */
  goal: string;
  insights: GoalInsight[];
  moves: GoalMove[];
}

export interface GoalReadInput {
  subject: string;
  model: SubjectModel;
  state: SubjectState;
  /** Finished in this window and the one before, for the volume line. */
  total: { now: number; before: number | null };
  /**
   * The lead goal's plan from the topic library (services/topics): which
   * topics it needs, which are weak, and moves that name real work. Absent
   * until the library has loaded, and then the panel reads as before.
   */
  topics?: GoalTopicPlan | null;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function paceInsight(goal: SubjectGoal, aim: string): GoalInsight | null {
  if (goal.expected !== null && goal.daysLeft !== null && goal.daysLeft >= 0) {
    const gap = Math.round(goal.progress - goal.expected);
    if (gap <= -10) {
      return {
        id: 'pace',
        tone: 'bad',
        title: 'Behind schedule',
        figure: `${goal.progress}% done, where the calendar says ${Math.round(goal.expected)}%.`,
        means: `${aim} needs a faster pace from here, with ${plural(goal.daysLeft, 'day')} left.`,
      };
    }
    if (gap >= 5) {
      return {
        id: 'pace',
        tone: 'good',
        title: 'Ahead of schedule',
        figure: `${goal.progress}% done, where the calendar says ${Math.round(goal.expected)}%.`,
        means: `You have room on ${aim}. Use it on the hard parts, not on coasting.`,
      };
    }
    return {
      id: 'pace',
      tone: 'flat',
      title: 'On schedule',
      figure: `${goal.progress}% done, about where the calendar says you should be.`,
      means: `Keep this pace and ${aim} lands on time.`,
    };
  }
  if (goal.daysLeft !== null && goal.daysLeft < 0) {
    return {
      id: 'pace',
      tone: 'bad',
      title: 'Past its date',
      figure: `${goal.progress}% done, and the date passed ${plural(Math.abs(goal.daysLeft), 'day')} ago.`,
      means: `Set a new date for ${aim} so the pace means something again.`,
    };
  }
  return null;
}

function cadenceInsight(goal: SubjectGoal, aim: string): GoalInsight | null {
  if (goal.sinceWork === null) return null;
  if (goal.sinceWork >= 7) {
    return {
      id: 'cadence',
      tone: 'bad',
      title: 'Gone quiet',
      figure: `Nothing aimed at it in ${plural(goal.sinceWork, 'day')}.`,
      means: `${aim} only moves when it's worked on. Right now it isn't.`,
    };
  }
  return {
    id: 'cadence',
    tone: goal.recentDays >= 5 ? 'good' : goal.recentDays >= 3 ? 'flat' : 'bad',
    title: goal.recentDays >= 5 ? 'Worked on often' : 'Worked on now and then',
    figure: `${goal.recentDays} of the last 14 days had work aimed at it.`,
    means:
      goal.recentDays >= 5
        ? `That rhythm is what gets ${aim} done.`
        : `Spread out like this, ${aim} moves slowly. Aim for 4 or more days in 2 weeks.`,
  };
}

function aimInsight(goal: SubjectGoal, aim: string): GoalInsight | null {
  if (goal.ofFinished < 3) return null;
  const share = Math.round((goal.aimed / goal.ofFinished) * 100);
  return {
    id: 'aim',
    tone: share >= 50 ? 'good' : share >= 25 ? 'flat' : 'bad',
    title: share >= 50 ? 'Your work points at the goal' : 'Most of your work points elsewhere',
    figure: `${goal.aimed.toLocaleString('en-US')} of ${goal.ofFinished.toLocaleString('en-US')} tasks here were linked to it (${share}%).`,
    means:
      share >= 50
        ? `Most of what you do here counts toward ${aim}.`
        : `Work that isn't linked doesn't move the progress bar for ${aim}.`,
  };
}

function reasonInsight(top: Driver, aim: string): GoalInsight {
  return {
    id: 'reason',
    tone: 'bad',
    title: `What goes wrong most: ${top.label.toLowerCase()}`,
    figure: `You picked it after ${plural(top.count, 'task')}, ${top.share}% of the times something went badly.`,
    means: `Fixing this one thing is the cheapest progress toward ${aim}.`,
  };
}

/**
 * Insights and moves for the subject, against its first (most pressing) goal.
 */
export function goalRead({ subject, model, state, total, topics }: GoalReadInput): GoalRead {
  const goal = model.goals[0] ?? null;
  const aim = goal ? `"${goal.title}"` : subject;
  const insights: GoalInsight[] = [];
  const moves: GoalMove[] = [];

  // ---- The goal itself -----------------------------------------------------
  if (goal) {
    const pace = paceInsight(goal, aim);
    if (pace) insights.push(pace);
    if (goal.drift !== null && goal.drift > 0 && goal.lands) {
      insights.push({
        id: 'lands',
        tone: 'bad',
        title: 'Late at this rate',
        figure: `At your current rate it finishes ${goal.lands}, ${plural(goal.drift, 'day')} after its date.`,
        means: goal.factor !== null && goal.factor > 1
          ? `You'd need about ${goal.factor >= 10 ? '10' : goal.factor.toFixed(1)} times your pace to make it.`
          : `Speed up a little, or move the date.`,
      });
    }
    const cadence = cadenceInsight(goal, aim);
    if (cadence) insights.push(cadence);
    const linked = aimInsight(goal, aim);
    if (linked) insights.push(linked);
  }

  // ---- How the work goes ---------------------------------------------------
  const { momentum, curve } = state;
  if (momentum.known && momentum.change !== null && momentum.direction !== 'flat') {
    const up = momentum.direction === 'climbing';
    insights.push({
      id: 'momentum',
      tone: up ? 'good' : 'bad',
      title: up ? 'Your ratings are climbing' : 'Your ratings are slipping',
      figure: `${up ? 'Up' : 'Down'} ${Math.abs(momentum.change)} points from the first half of this window to the second.`,
      means: up
        ? `The work is getting better, which is what ${aim} runs on.`
        : `Slipping quality slows ${aim} even if you keep showing up.`,
    });
  }
  // Easy work going worse than hard work is carelessness, not a ceiling.
  const careless = Boolean(curve.threshold && curve.best && curve.threshold.level < curve.best.level);
  if (curve.threshold && careless) {
    const best = curve.best!;
    insights.push({
      id: 'threshold',
      tone: 'bad',
      title: `${curve.threshold.label} work goes worse than ${best.label} work`,
      figure:
        curve.threshold.execution !== null && best.execution !== null
          ? `Your ${curve.threshold.label} work scores ${Math.round(curve.threshold.execution)} out of 100 on how it went, against ${Math.round(best.execution)} at ${best.label}.`
          : `Your ratings are lower on ${curve.threshold.label} work than on ${best.label} work.`,
      means: `That's usually rushing. Points lost on easy work still cost ${aim}.`,
    });
  } else if (curve.threshold) {
    const best = curve.best;
    insights.push({
      id: 'threshold',
      tone: 'bad',
      title: `It falls off at ${curve.threshold.label}`,
      figure:
        best && best.execution !== null && curve.threshold.execution !== null
          ? `Your ${curve.threshold.label} work scores ${Math.round(curve.threshold.execution)} out of 100 on how it went, against ${Math.round(best.execution)} at ${best.label}.`
          : `Your ratings drop once the work gets to ${curve.threshold.label}.`,
      means: `${aim} needs that level. That's where the next gains are.`,
    });
  } else if (curve.any && curve.best) {
    insights.push({
      id: 'threshold',
      tone: 'good',
      title: 'No level where it falls apart',
      figure: `Your ratings hold up across the levels you've tried, best at ${curve.best.label}.`,
      means: `You're ready for harder work toward ${aim}.`,
    });
  }
  const top = model.struggles[0];
  if (top && top.count >= 3) insights.push(reasonInsight(top, aim));
  const good = model.wentWell[0];
  if (good && good.count >= 3) {
    insights.push({
      id: 'went-well',
      tone: 'good',
      title: `What works: ${good.label.toLowerCase()}`,
      figure: `You picked it after ${plural(good.count, 'task')} that went well.`,
      means: `Set up your sessions for ${aim} the same way.`,
    });
  }

  // ---- How much -------------------------------------------------------------
  if (total.before !== null && total.before >= 3) {
    const change = Math.round(((total.now - total.before) / total.before) * 100);
    if (Math.abs(change) >= 15) {
      insights.push({
        id: 'volume',
        tone: change > 0 ? 'good' : 'bad',
        title: change > 0 ? 'More work than before' : 'Less work than before',
        figure: `${total.now} tasks in this window, against ${total.before} the window before (${change > 0 ? '+' : ''}${change}%).`,
        means: change > 0 ? `More reps toward ${aim}.` : `Fewer reps means ${aim} moves slower.`,
      });
    }
  }
  if (model.streak >= 3) {
    insights.push({
      id: 'streak',
      tone: 'good',
      title: `${model.streak}-day streak`,
      figure: `You've worked on ${subject} ${model.streak} days running.`,
      means: `Keep it alive. Steady days are how ${aim} gets done.`,
    });
  }

  // ---- What to do next -------------------------------------------------------
  // The topic library's moves name real work ("Do 10 AMC 10 recursive
  // counting problems"), so they go first. With two or more of them, the
  // general advice below (slow down, a level harder, plan around a reason)
  // is left out: it's what those moves already say, only vaguer.
  const topical = goal && topics ? topics.moves : [];
  topical.forEach((move) => {
    moves.push({
      id: `topic-${move.id}`,
      title: move.title,
      why: move.why,
      weight: move.weight,
      to: '/calendar',
      link: 'Plan it',
      resource: move.resource,
      topical: true,
    });
  });
  const general = topical.length < 2;
  if (!goal) {
    moves.push({
      id: 'set-goal',
      title: `Set a main goal for ${subject}`,
      why: 'Everything on this page reads against it: pace, what to fix first, and what to plan next.',
      weight: 'now',
      to: '/goals',
      link: 'Open Goals',
    });
  } else {
    goal.levers.forEach((lever) => {
      moves.push({
        id: `lever-${lever.id}`,
        title: lever.title,
        why: lever.fact,
        weight: lever.weight === 'blocking' ? 'now' : lever.weight === 'raise' ? 'next' : 'keep',
        to: lever.id === 'unaimed' || lever.id === 'thin-aim' || lever.id === 'terms' ? '/goals' : '/calendar',
        link: lever.id === 'unaimed' || lever.id === 'thin-aim' || lever.id === 'terms' ? 'Open Goals' : 'Plan it',
      });
    });
  }
  if (general && curve.threshold && careless) {
    moves.push({
      id: 'threshold',
      title: `Slow down on ${curve.threshold.label} work`,
      why: `It goes worse than your harder work. Check each one before you call it done.`,
      weight: 'next',
    });
  } else if (general && curve.threshold) {
    moves.push({
      id: 'threshold',
      title: `Do 2 ${curve.threshold.label} sessions this week, slower`,
      why: `That's the level where your ratings drop, and ${aim} needs it.`,
      weight: 'next',
      to: '/calendar',
      link: 'Plan it',
    });
  } else if (general && curve.any && curve.best && curve.best.level < 5) {
    moves.push({
      id: 'step-up',
      title: 'Try one session a level harder',
      why: `Your work holds up at ${curve.best.label}, so it's time to push toward ${aim}.`,
      weight: 'next',
      to: '/calendar',
      link: 'Plan it',
    });
  }
  if (general && top && top.count >= 3) {
    moves.push({
      id: 'reason',
      title: `Plan around "${top.label.toLowerCase()}"`,
      why: `It's behind ${top.share}% of the sessions that went badly. Decide before the next one how you'll handle it.`,
      weight: 'next',
    });
  }

  // The topic insights lead: they say which part of the goal is weak, which
  // the counts above can't.
  const fromTopics: GoalInsight[] = goal && topics ? topics.insights : [];

  const order = { bad: 0, flat: 1, good: 2 } as const;
  const weightOrder = { now: 0, next: 1, keep: 2 } as const;
  return {
    goal: goal?.title ?? '',
    insights: [...fromTopics, ...insights.sort((a, b) => order[a.tone] - order[b.tone])],
    // Stable sort: within a weight, the topic moves stay ahead of the levers.
    moves: moves
      .sort((a, b) => weightOrder[a.weight] - weightOrder[b.weight] || Number(Boolean(b.topical)) - Number(Boolean(a.topical)))
      .slice(0, 5),
  };
}

