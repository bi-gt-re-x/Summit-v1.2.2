/**
 * Machine Learning — a branch of Data Science.
 *
 * Evaluation sits early and gates almost everything after it, because a model
 * measured on the data it was fitted to will report a score it cannot repeat,
 * and every later node in this tree is worthless behind that mistake.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const MACHINE_LEARNING: SubjectTree = {
  id: 'machine-learning',
  title: 'Machine Learning',
  blurb: 'Learning the rule from examples — and proving it holds on examples you have not seen.',
  parent: 'data-science',
  nodes: [
    { id: 'ml.what', name: 'What Learning Is', icon: 'model', tier: 'foundation', core: true, state: open, percent: 10, xp: 1400,
      desc: 'Fitting a function to examples so it works on new ones, instead of writing the rule by hand. The whole field is that one trade: enough flexibility to capture the pattern, little enough to not memorize the noise.' },
    { id: 'ml.supervised', name: 'Supervised & Unsupervised', icon: 'labels', tier: 'foundation', requires: ['ml.what'], state: lock, percent: 0, xp: 1300,
      desc: 'Whether the examples come with the answer attached. With labels you are predicting; without them you are describing structure, and the two are judged by completely different standards.' },
    { id: 'ml.split', name: 'Train, Validate, Test', icon: 'split-data', tier: 'foundation', core: true, requires: ['ml.what'], state: lock, percent: 0, xp: 1600,
      desc: 'Three separate slices: one to fit on, one to tune against, one you look at once. The test set stops being a test set the moment you make a second decision after seeing it.' },
    { id: 'ml.metrics', name: 'Metrics', icon: 'gauge', tier: 'beginner', requires: ['ml.split'], state: lock, percent: 0, xp: 1700,
      desc: 'Accuracy, precision, recall and the ones that survive imbalance. On a problem where one class is 1% of the data, a model that always says "no" scores 99%, which is why the metric has to match the cost of each mistake.' },
    { id: 'ml.linear', name: 'Linear Models', icon: 'regression', tier: 'beginner', requires: ['ml.supervised'], state: lock, percent: 0, xp: 1800,
      desc: 'A weighted sum, and a threshold for classification. Still the right first model on most problems: it trains in seconds, tells you what it is using, and sets the bar anything heavier has to clear.' },
    { id: 'ml.overfit', name: 'Overfitting', icon: 'overfit', tier: 'beginner', core: true, requires: ['ml.metrics'], state: lock, percent: 0, xp: 1900,
      desc: 'A model that learned the training set rather than the pattern in it, and falls apart on anything new. The gap between training and validation score is the symptom you watch for the rest of your career.' },
    { id: 'ml.crossval', name: 'Cross-Validation', icon: 'folds', tier: 'intermediate', requires: ['ml.overfit'], state: lock, percent: 0, xp: 1800,
      desc: 'Rotating which slice is held out, so the score is not an accident of one split. Anything computed from the data — scaling, imputation, feature choice — has to happen inside each fold, or the leak comes back.' },
    { id: 'ml.regular', name: 'Regularization', icon: 'constraint', tier: 'intermediate', requires: ['ml.overfit'], state: lock, percent: 0, xp: 1900,
      desc: 'Penalizing complexity so the fit prefers the simpler explanation. One flavor shrinks weights toward zero and another sets them exactly there, which is why the second doubles as feature selection.' },
    { id: 'ml.trees', name: 'Trees & Forests', icon: 'decision-tree', tier: 'intermediate', requires: ['ml.linear', 'ml.crossval'], state: lock, percent: 0, xp: 2100,
      desc: 'Splitting the data on one question at a time, then averaging hundreds of such splitters. On ordinary tabular data an ensemble of trees is still the model to beat, and it needs almost no preprocessing to work.' },
    { id: 'ml.boost', name: 'Gradient Boosting', icon: 'boost', tier: 'advanced', requires: ['ml.trees'], state: lock, percent: 0, xp: 2300,
      desc: 'Building trees in sequence, each fixing what the last got wrong. The strongest general answer for tables, and the one most sensitive to being tuned honestly against a validation set.' },
    { id: 'ml.cluster', name: 'Clustering', icon: 'clusters', tier: 'intermediate', requires: ['ml.supervised'], state: lock, percent: 0, xp: 1800,
      desc: 'Grouping points that resemble each other when nobody has said what the groups are. The catch is that there is no score to appeal to — you have to argue the grouping means something.' },
    { id: 'ml.dimred', name: 'Dimensionality Reduction', icon: 'compress', tier: 'advanced', requires: ['ml.cluster'], state: lock, percent: 0, xp: 2000,
      desc: 'Squeezing many correlated columns into a few that carry most of the variation. Useful for seeing high-dimensional data at all, and a reminder that most wide datasets are narrower than they look.' },
    { id: 'ml.gradient', name: 'Gradient Descent', icon: 'gradient', tier: 'advanced', core: true, requires: ['ml.regular'], state: lock, percent: 0, xp: 2200,
      desc: 'Walking downhill on the error surface, one small step in the steepest direction. Nearly everything modern is trained this way, and the learning rate is the single knob that decides between converging, crawling and exploding.' },
    { id: 'ml.nn', name: 'Neural Networks', icon: 'neural-net', tier: 'advanced', requires: ['ml.gradient'], state: lock, percent: 0, xp: 2500,
      desc: 'Layers of weighted sums with a non-linearity between them, which is what lets them represent curves a linear model cannot. Depth buys expressiveness and buys an appetite for data along with it.' },
    { id: 'ml.backprop', name: 'Backpropagation', icon: 'backprop', tier: 'advanced', requires: ['ml.nn'], state: lock, percent: 0, xp: 2400,
      desc: 'The chain rule applied backwards through the network to find the share of the error belonging to each weight. Worth deriving once by hand — after that the frameworks stop being magic and the failures start being readable.' },
    { id: 'ml.cnn', name: 'Vision Models', icon: 'vision', tier: 'expert', requires: ['ml.backprop'], state: lock, percent: 0, xp: 2500,
      desc: 'Networks that exploit the fact that meaning in a picture is local and repeats across the frame. The same filter slid over the image is why they need a fraction of the parameters a dense layer would.' },
    { id: 'ml.seq', name: 'Sequence Models', icon: 'sequence', tier: 'expert', requires: ['ml.backprop'], state: lock, percent: 0, xp: 2500,
      desc: 'Models for data where order carries the meaning — text, audio, anything over time. The problem they all solve is how far back to remember, and how much of the past to weigh.' },
    { id: 'ml.attention', name: 'Attention & Transformers', icon: 'attention', tier: 'expert', core: true, requires: ['ml.seq'], state: lock, percent: 0, xp: 2800,
      desc: 'Letting every position look at every other and decide what matters, instead of passing a summary along a chain. That one change is what made models trainable at the scale everything since has been built at.' },
    { id: 'ml.transfer', name: 'Transfer & Fine-Tuning', icon: 'transfer', tier: 'expert', requires: ['ml.cnn', 'ml.attention'], state: lock, percent: 0, xp: 2600,
      desc: 'Starting from a model somebody else trained and adapting it to your problem with a fraction of the data. In practice this is what most applied work is, and knowing what to freeze is most of the craft.' },
    { id: 'ml.deploy', name: 'Models in Production', icon: 'serve-model', tier: 'expert', requires: ['ml.boost', 'ml.transfer'], state: lock, percent: 0, xp: 2600,
      desc: 'Serving predictions to real traffic, and watching the inputs drift away from what you trained on. A model is not finished when it scores well; it is finished when somebody is monitoring it.' },
    { id: 'ml.fair', name: 'Fairness & Interpretability', icon: 'fairness', tier: 'mastery', requires: ['ml.deploy'], state: lock, percent: 0, xp: 3000,
      desc: 'Being able to say why a model decided what it decided, and checking it does not decide differently for groups it should not. Removing the sensitive column does not remove the effect — the rest of the data usually reconstructs it.' },
  ],
};
