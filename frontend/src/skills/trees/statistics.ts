/**
 * Statistics & Probability — a branch of Mathematics.
 *
 * Probability sits under inference rather than beside it: a confidence interval
 * is a statement about a procedure repeated many times, and that sentence means
 * nothing to somebody who has not met a sampling distribution first.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const STATISTICS: SubjectTree = {
  id: 'statistics',
  title: 'Statistics & Probability',
  blurb: 'Reasoning about what you cannot see all of, and saying how sure you are.',
  parent: 'mathematics',
  nodes: [
    { id: 'st.data', name: 'Kinds of Data', icon: 'dataset', tier: 'foundation', core: true, state: open, percent: 20, xp: 1200,
      desc: 'Categories, counts and measurements, and the fact that what you may do to a number depends on which it is. Averaging a set of postcodes is arithmetic that runs and means nothing.' },
    { id: 'st.centre', name: 'Center & Spread', icon: 'average', tier: 'foundation', requires: ['st.data'], state: lock, percent: 0, xp: 1300,
      desc: 'Mean, median and mode, then the range, quartiles and standard deviation around them. A center quoted without a spread is half a description and usually the more flattering half.' },
    { id: 'st.charts', name: 'Reading Charts', icon: 'chart-bars', tier: 'foundation', requires: ['st.data'], state: lock, percent: 0, xp: 1200,
      desc: 'Histograms, box plots and scatter plots, and what each is capable of hiding. A truncated axis and a bin width chosen after the fact are the two edits that change a conclusion without changing a number.' },
    { id: 'st.dist', name: 'Distributions', icon: 'distribution', tier: 'beginner', core: true, requires: ['st.centre', 'st.charts'], state: lock, percent: 0, xp: 1700,
      desc: 'The shape values take across a population — symmetric, skewed, or with two peaks that mean two populations got mixed. Naming the shape is what tells you which summary is honest.' },
    { id: 'st.prob', name: 'Probability', icon: 'probability', tier: 'beginner', core: true, requires: ['st.data'], state: lock, percent: 0, xp: 1600,
      desc: 'How likely something is, on a scale from impossible to certain, and the rules for combining likelihoods. Almost every paradox in the subject comes from adding probabilities of events that can happen together.' },
    { id: 'st.cond', name: 'Conditional Probability', icon: 'conditional-prob', tier: 'beginner', requires: ['st.prob'], state: lock, percent: 0, xp: 1800,
      desc: 'The chance of one thing given that another has happened, which is rarely the same as the chance the other way round. Confusing the two directions is the single most consequential error in medicine and courtrooms alike.' },
    { id: 'st.bayes', name: 'Bayes Theorem', icon: 'bayes', tier: 'intermediate', requires: ['st.cond'], state: lock, percent: 0, xp: 2000,
      desc: 'Updating a belief when evidence arrives, in one line of algebra. Its famous lesson is that a very accurate test for a very rare condition still produces mostly false positives.' },
    { id: 'st.normal', name: 'The Normal Distribution', icon: 'bell-curve', tier: 'intermediate', requires: ['st.dist'], state: lock, percent: 0, xp: 1800,
      desc: 'The bell curve, and why so many measurements land on it. Standardizing to how many deviations from the mean a value is turns every normal question into the same question.' },
    { id: 'st.sample', name: 'Sampling', icon: 'sampling', tier: 'intermediate', core: true, requires: ['st.dist'], state: lock, percent: 0, xp: 1900,
      desc: 'Learning about a population from a part of it, and the ways a part can fail to represent the whole. Random selection is not a formality; it is the entire license for what follows.' },
    { id: 'st.clt', name: 'Sampling Distributions', icon: 'clt', tier: 'intermediate', requires: ['st.sample', 'st.normal'], state: lock, percent: 0, xp: 2100,
      desc: 'What the average of a sample would do if you took the sample again and again. The remarkable result is that it settles into a bell shape almost regardless of what the population looks like.' },
    { id: 'st.ci', name: 'Confidence Intervals', icon: 'interval-est', tier: 'advanced', requires: ['st.clt'], state: lock, percent: 0, xp: 2200,
      desc: 'A range of plausible values with a stated success rate for the method that produced it. It is a claim about the procedure over many repeats, not a probability that this particular interval contains the answer.' },
    { id: 'st.test', name: 'Hypothesis Tests', icon: 'hypothesis', tier: 'advanced', core: true, requires: ['st.clt'], state: lock, percent: 0, xp: 2300,
      desc: 'Asking whether the data would be surprising if nothing were going on. The p-value measures that surprise and nothing else, and treating it as the probability the claim is wrong is the misreading that never dies.' },
    { id: 'st.errors', name: 'Errors & Power', icon: 'error-types', tier: 'advanced', requires: ['st.test'], state: lock, percent: 0, xp: 2100,
      desc: 'Two ways to be wrong: crying wolf, and missing a real effect. Power is the chance of catching an effect that is there, and a study with too few subjects fails before it starts.' },
    { id: 'st.effect', name: 'Effect Size', icon: 'effect-size', tier: 'advanced', requires: ['st.test'], state: lock, percent: 0, xp: 1900,
      desc: 'How big the difference is, as distinct from how confident you are that it is not zero. With a large enough sample, an utterly trivial difference becomes statistically significant.' },
    { id: 'st.regress', name: 'Regression', icon: 'regression', tier: 'advanced', requires: ['st.ci'], state: lock, percent: 0, xp: 2300,
      desc: 'Fitting a line, reading its slope as a rate, and checking the residuals rather than admiring the fit. The assumptions are where the honesty lives; the coefficient is only where the story is.' },
    { id: 'st.multi', name: 'Multiple Comparisons', icon: 'multiple-tests', tier: 'expert', requires: ['st.errors'], state: lock, percent: 0, xp: 2300,
      desc: 'Test twenty things at the usual threshold and one comes up significant by luck alone. Deciding what you will test before looking is the only defense that fully works.' },
    { id: 'st.causal', name: 'Causal Inference', icon: 'causal', tier: 'expert', core: true, requires: ['st.regress', 'st.bayes'], state: lock, percent: 0, xp: 2600,
      desc: 'What it takes to say one thing caused another rather than moved with it. Randomization earns it outright; without it, you are arguing that you controlled for everything that matters, and you probably did not.' },
    { id: 'st.bayesian', name: 'Bayesian Methods', icon: 'posterior', tier: 'expert', requires: ['st.bayes', 'st.ci'], state: lock, percent: 0, xp: 2500,
      desc: 'Carrying a prior belief into the analysis and coming out with a distribution over the answer. It says the thing people wanted the confidence interval to say, at the cost of having to state the prior out loud.' },
    { id: 'st.nonparam', name: 'Non-Parametric Methods', icon: 'rank-test', tier: 'expert', requires: ['st.multi'], state: lock, percent: 0, xp: 2300,
      desc: 'Tests that work on ranks and resampling rather than an assumed shape. Slower and less powerful when the assumptions hold, and the right answer whenever they clearly do not.' },
    { id: 'st.design', name: 'Study Design', icon: 'study-design', tier: 'mastery', requires: ['st.causal', 'st.nonparam', 'st.effect'], state: lock, percent: 0, xp: 3000,
      desc: 'Deciding what to collect, from whom and how many, before any of it exists. No analysis rescues a study that was going to be ambiguous whatever the data said.' },
  ],
};
