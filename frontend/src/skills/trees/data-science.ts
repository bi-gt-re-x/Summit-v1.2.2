/**
 * Data Science — a branch of Coding.
 *
 * The order here is deliberate and unpopular: cleaning, distributions and
 * sampling come before anything that predicts. A path that opens with models
 * teaches somebody to fit a curve to data they have not looked at, which is the
 * single most common way a confident analysis turns out to be wrong.
 */
import type { SubjectTree } from './types';
import { done, prog, open, lock } from './types';

export const DATA_SCIENCE: SubjectTree = {
  id: 'data-science',
  title: 'Data Science',
  blurb: 'Getting an honest answer out of a table of numbers, and knowing when you have not.',
  parent: 'coding',
  nodes: [
    { id: 'ds.data', name: 'Data & Datasets', icon: 'dataset', tier: 'foundation', core: true, state: done, percent: 100, xp: 1200,
      desc: 'What a dataset actually is: rows that are observations, columns that are variables, and a definition of what one row means. Most confusion later traces back to nobody writing that definition down at the start.' },
    { id: 'ds.tables', name: 'Tabular Thinking', icon: 'table', tier: 'foundation', requires: ['ds.data'], state: prog, percent: 60, xp: 1300,
      desc: 'Working on whole columns at once instead of looping over rows. Filter, group, aggregate, join — four operations that cover most analysis, and thinking in them is what makes a dataset of ten million rows no harder than one of ten.' },
    { id: 'ds.clean', name: 'Cleaning Data', icon: 'clean-data', tier: 'foundation', core: true, requires: ['ds.data'], state: prog, percent: 45, xp: 1600,
      desc: 'Missing values, duplicates, three spellings of one category, a date column stored as text. This is where most of the time goes, and skipping it does not save the time — it moves it to after you have published the wrong number.' },
    { id: 'ds.notebook', name: 'Notebooks & Reproducibility', icon: 'notebook', tier: 'beginner', requires: ['ds.tables'], state: open, percent: 20, xp: 1400,
      desc: 'An analysis anybody can re-run from the raw file and get your numbers back. A notebook run out of order produces results that exist nowhere but in that session, which is the failure this is written against.' },
    { id: 'ds.explore', name: 'Exploratory Analysis', icon: 'magnifier', tier: 'beginner', core: true, requires: ['ds.clean', 'ds.tables'], state: open, percent: 15, xp: 1800,
      desc: 'Looking at the data before asking anything of it: shapes, ranges, oddities, what is missing and where. The goal is to find the surprises while they are still cheap.' },
    { id: 'ds.viz', name: 'Visualization', icon: 'chart-bars', tier: 'beginner', requires: ['ds.explore'], state: lock, percent: 0, xp: 1700,
      desc: 'Choosing the picture that shows the relationship rather than the one that looks impressive. A scatter plot answers a different question from a bar chart, and a chart that needs a paragraph to read is a chart that failed.' },
    { id: 'ds.desc', name: 'Descriptive Statistics', icon: 'average', tier: 'beginner', requires: ['ds.explore'], state: lock, percent: 0, xp: 1500,
      desc: 'Mean, median, spread and quantiles — a handful of numbers standing in for thousands. The median and the mean disagreeing is information, not a rounding problem, and the reason to always report the spread.' },
    { id: 'ds.dist', name: 'Distributions', icon: 'distribution', tier: 'intermediate', requires: ['ds.desc'], state: lock, percent: 0, xp: 1900,
      desc: 'The shape the values take, and the handful of shapes that keep appearing. Recognizing a long tail matters more than naming it: on a skewed distribution the average describes almost nobody.' },
    { id: 'ds.sample', name: 'Sampling & Bias', icon: 'sampling', tier: 'intermediate', core: true, requires: ['ds.dist'], state: lock, percent: 0, xp: 2000,
      desc: 'Who ended up in the data and who quietly did not. No amount of modeling recovers from a sample that never contained the people you are trying to say something about.' },
    { id: 'ds.joins', name: 'Joining Datasets', icon: 'join', tier: 'intermediate', requires: ['ds.tables', 'ds.clean'], state: lock, percent: 0, xp: 1700,
      desc: 'Combining tables on a shared key, and checking the row count afterwards. A join that silently duplicated or dropped rows is the classic invisible error, because the result still looks like a valid table.' },
    { id: 'ds.sql', name: 'Querying at Source', icon: 'query', tier: 'intermediate', requires: ['ds.joins'], recommends: ['ds.tables'], state: lock, percent: 0, xp: 1800,
      desc: 'Asking the database for the slice you need instead of downloading everything and filtering later. Beyond a certain size that is not a preference, it is the difference between an analysis that runs and one that does not.' },
    { id: 'ds.hypo', name: 'Hypothesis Testing', icon: 'hypothesis', tier: 'intermediate', requires: ['ds.sample'], state: lock, percent: 0, xp: 2100,
      desc: 'Deciding whether a difference is bigger than the noise. The p-value answers a narrower question than most people want it to, and the effect size is the number that actually says whether anybody should care.' },
    { id: 'ds.corr', name: 'Correlation', icon: 'correlation', tier: 'intermediate', requires: ['ds.viz', 'ds.desc'], state: lock, percent: 0, xp: 1700,
      desc: 'How strongly two variables move together, and the fact that a coefficient near zero rules out only a straight line. Always plot it: four famously different datasets share the same correlation.' },
    { id: 'ds.regress', name: 'Regression', icon: 'regression', tier: 'advanced', core: true, requires: ['ds.corr', 'ds.hypo'], state: lock, percent: 0, xp: 2400,
      desc: 'Fitting a relationship you can read out in words: how much the outcome moves per unit of an input, holding the rest still. The coefficients are the point, which is why it stays useful long after fancier models exist.' },
    { id: 'ds.features', name: 'Feature Engineering', icon: 'feature', tier: 'advanced', requires: ['ds.regress'], state: lock, percent: 0, xp: 2200,
      desc: 'Turning raw columns into things that carry signal — ratios, differences, dates split into their parts. A good feature usually beats a better algorithm, and a leaked one beats everything until it meets reality.' },
    { id: 'ds.time', name: 'Time Series', icon: 'time-series', tier: 'advanced', requires: ['ds.dist', 'ds.viz'], state: lock, percent: 0, xp: 2200,
      desc: 'Data where the order matters and yesterday predicts today. Trend, season and noise pull apart into three readable pieces, and any evaluation that shuffles the rows has already cheated.' },
    { id: 'ds.exp', name: 'Experiments & A/B Tests', icon: 'ab-test', tier: 'advanced', requires: ['ds.hypo'], state: lock, percent: 0, xp: 2300,
      desc: 'Making the comparison fair by deciding at random who gets what. Randomization is what buys you the word "caused"; peeking at the result daily and stopping when it looks good sells it straight back.' },
    { id: 'ds.pipeline', name: 'Data Pipelines', icon: 'pipeline', tier: 'advanced', requires: ['ds.notebook', 'ds.sql'], state: lock, percent: 0, xp: 2200,
      desc: 'The scheduled path from raw source to the table everyone reads, with the failures handled. The hard part is not moving the data but noticing on the morning it silently stopped.' },
    { id: 'ds.story', name: 'Communicating Results', icon: 'presenting', tier: 'expert', requires: ['ds.viz', 'ds.exp'], state: lock, percent: 0, xp: 2500,
      desc: 'Saying what you found, how sure you are, and what should happen next — to people who will not read the notebook. An analysis nobody acts on has the same value as one never run.' },
    { id: 'ds.ethics', name: 'Data Ethics', icon: 'ethics', tier: 'expert', requires: ['ds.sample'], state: lock, percent: 0, xp: 2300,
      desc: 'Consent, privacy and the harm a model can do at scale to people who never agreed to be in it. Anonymized data is rarely as anonymous as it sounds, and aggregation is not a defense on its own.' },
    { id: 'ds.ml', name: 'Machine Learning', icon: 'neural-net', tier: 'advanced', requires: ['ds.features'], navTo: 'machine-learning', state: lock,
      desc: 'A subject of its own: teaching a program the rule from examples rather than writing the rule yourself.' },
  ],
};
