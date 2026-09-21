/**
 * Science — a root subject.
 *
 * This tree used to carry a handful of physics, chemistry and biology nodes
 * itself. It no longer does: each of those is a full lattice of its own now, and
 * a shallow copy of them here would be the same subject written twice, free to
 * disagree with itself the first time either was edited.
 *
 * What is left is the part all three share and none of them owns — the method,
 * measurement, uncertainty, and the business of turning a result into something
 * somebody else can check. The four doorways at the bottom are where it stops
 * being one subject.
 */
import type { SubjectTree } from './types';
import { done, prog, open, lock } from './types';

export const SCIENCE: SubjectTree = {
  id: 'science',
  title: 'Science',
  blurb: 'The method every branch shares, and the four places it forks.',
  group: 'Maths and science',
  nodes: [
    { id: 'sc.method', name: 'The Method', icon: 'scientific-method', tier: 'foundation', core: true, state: done, percent: 100, xp: 1300,
      desc: 'Turning a question into something an experiment could actually settle, with a control and a prediction that could fail. The willingness to be wrong is the part that makes it work.' },
    { id: 'sc.question', name: 'Asking a Testable Question', icon: 'question', tier: 'foundation', requires: ['sc.method'], state: done, percent: 100, xp: 1200,
      desc: 'Narrowing an interest into something with a measurable answer. "Does this work" becomes "does this change that, by how much, compared with what" before any apparatus is touched.' },
    { id: 'sc.units', name: 'Units & Dimensions', icon: 'units', tier: 'foundation', requires: ['sc.method'], state: done, percent: 100, xp: 1100,
      desc: 'Every quantity carries a unit, and units follow through a calculation like algebra. Checking that they come out right catches more mistakes than rechecking the arithmetic.' },
    { id: 'sc.measure', name: 'Measurement', icon: 'measurement', tier: 'foundation', requires: ['sc.units'], state: prog, percent: 65, xp: 1400,
      desc: 'Getting a number off an instrument and knowing how much of it to believe. Precision, accuracy and uncertainty are three different things, and reporting all three honestly is the skill.' },
    { id: 'sc.error', name: 'Uncertainty & Error', icon: 'error-bars', tier: 'beginner', core: true, requires: ['sc.measure'], state: prog, percent: 40, xp: 1600,
      desc: 'Every measurement is a range rather than a value, and the ranges combine through a calculation in predictable ways. A result quoted without one is not yet a scientific result.' },
    { id: 'sc.data', name: 'Data & Graphs', icon: 'chart-bars', tier: 'beginner', requires: ['sc.measure'], state: prog, percent: 45, xp: 1500,
      desc: 'Turning readings into a picture that shows the relationship. Which variable goes on which axis, and whether a line through the points is justified at all, are decisions rather than conventions.' },
    { id: 'sc.variables', name: 'Variables & Controls', icon: 'control-var', tier: 'beginner', requires: ['sc.question'], state: open, percent: 25, xp: 1500,
      desc: 'Changing one thing, holding the rest still, and knowing what you failed to hold still. A result from an experiment with two things changing at once cannot be attributed to either.' },
    { id: 'sc.lab', name: 'Laboratory Practice', icon: 'lab', tier: 'beginner', requires: ['sc.variables'], state: open, percent: 20, xp: 1500,
      desc: 'Working safely and repeatably: hazards read before starting, equipment used properly, and everything recorded as it happens rather than afterwards from memory.' },
    { id: 'sc.record', name: 'Recording Results', icon: 'lab-notebook', tier: 'beginner', requires: ['sc.lab'], state: lock, percent: 0, xp: 1400,
      desc: 'A notebook somebody else could repeat the work from, including the readings that went wrong. Tidying data as you record it is how the interesting anomaly gets lost.' },
    { id: 'sc.models', name: 'Models', icon: 'model', tier: 'intermediate', core: true, requires: ['sc.error', 'sc.data'], state: lock, percent: 0, xp: 1800,
      desc: 'A simplified description that predicts something. Every model is wrong in some respect on purpose, and knowing which simplification you made is what tells you where it will fail.' },
    { id: 'sc.scale', name: 'Scale & Orders of Magnitude', icon: 'orders', tier: 'intermediate', requires: ['sc.units'], state: lock, percent: 0, xp: 1600,
      desc: 'Estimating roughly before calculating precisely, and noticing when an answer is a thousand times too large. Scientists check a result against a rough estimate before they check the arithmetic.' },
    { id: 'sc.stats', name: 'Statistics for Science', icon: 'statistics', tier: 'intermediate', requires: ['sc.models'], state: lock, percent: 0, xp: 1900,
      desc: 'Deciding whether a difference is bigger than the noise, and how large it is. The effect size answers whether it matters; significance only answers whether it is probably there.' },
    { id: 'sc.evidence', name: 'Weighing Evidence', icon: 'evidence', tier: 'intermediate', requires: ['sc.stats'], state: lock, percent: 0, xp: 1900,
      desc: 'One study is a data point rather than a finding. Sample size, design and whether anybody has reproduced it decide how much weight a result can carry.' },
    { id: 'sc.replicate', name: 'Reproducibility', icon: 'replicate', tier: 'advanced', requires: ['sc.record', 'sc.evidence'], state: lock, percent: 0, xp: 2000,
      desc: 'Somebody else getting your result from your description. It is the mechanism that makes science self-correcting, and it works only when methods are published in enough detail to follow.' },
    { id: 'sc.write', name: 'Scientific Writing', icon: 'paper', tier: 'advanced', requires: ['sc.replicate'], state: lock, percent: 0, xp: 2100,
      desc: 'Method, results and discussion kept strictly apart, so a reader can disagree with your interpretation while accepting your data. The separation is the discipline, not the format.' },
    { id: 'sc.review', name: 'Reading & Reviewing Papers', icon: 'peer-review', tier: 'advanced', requires: ['sc.write'], state: lock, percent: 0, xp: 2200,
      desc: 'Reading the methods before the abstract, and the figures before the conclusion. Peer review filters rather than verifies, which is why a published paper is a claim and not a fact.' },
    { id: 'sc.ethics', name: 'Research Ethics', icon: 'ethics', tier: 'advanced', requires: ['sc.record'], state: lock, percent: 0, xp: 1900,
      desc: 'Consent, welfare, honest reporting and declaring who paid for the work. Presenting an exploratory finding as though it had been the hypothesis all along is the commonest quiet dishonesty in the field.' },
    { id: 'sc.communicate', name: 'Communicating Science', icon: 'presenting', tier: 'expert', requires: ['sc.review', 'sc.ethics'], state: lock, percent: 0, xp: 2400,
      desc: 'Explaining a result to people who will not read the paper, without overstating it. Most public misunderstanding of science is generated at exactly this step rather than in the laboratory.' },
    { id: 'sc.phys', name: 'Physics', icon: 'physics', tier: 'beginner', requires: ['sc.error'], navTo: 'physics', state: lock,
      desc: 'A subject of its own: a small set of laws with enormous reach, starting from how things move.' },
    { id: 'sc.chem', name: 'Chemistry', icon: 'chemistry', tier: 'beginner', requires: ['sc.lab'], navTo: 'chemistry', state: lock,
      desc: 'A subject of its own: what matter is made of, and what happens when you put two of them together.' },
    { id: 'sc.bio', name: 'Biology', icon: 'biology', tier: 'beginner', requires: ['sc.variables'], navTo: 'biology', state: lock,
      desc: 'A subject of its own: from one cell to a whole ecosystem, and the idea that ties them together.' },
    { id: 'sc.earth', name: 'Earth & Space', icon: 'planet', tier: 'intermediate', requires: ['sc.scale'], navTo: 'earth-space', state: lock,
      desc: 'A subject of its own: rocks, weather, oceans and everything past the atmosphere.' },
    { id: 'sc.olympiad', name: 'Science Olympiad', icon: 'trophy', tier: 'expert', requires: ['sc.evidence', 'sc.stats'], navTo: 'olympiad-science', state: lock,
      desc: 'A subject of its own: F=ma, USNCO and USABO — selection exams and what separates them.' },
  ],
};
