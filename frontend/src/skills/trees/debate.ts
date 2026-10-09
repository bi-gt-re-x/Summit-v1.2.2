/**
 * Competitive Debate — a branch of Humanities.
 *
 * Policy, Lincoln-Douglas, Public Forum and the speech events around them.
 * Filed under Humanities because the raw material is argument and evidence,
 * and drawn as its own lattice because a round is won by things no essay ever
 * asks for: hearing an argument once and writing it down accurately, answering
 * it in a fixed number of minutes, and telling a judge why your answer
 * mattered more than theirs.
 *
 * ## Flowing is a foundation node
 *
 * Taking down both sides of the round in a form you can answer from is the
 * skill that separates novices from everybody else, and it is almost never
 * taught explicitly. A debater who cannot flow drops arguments they had good
 * responses to, which reads to a judge as conceding them — the same result as
 * having no response at all.
 *
 * ## Weighing is where the tree turns
 *
 * Everything below `db.weigh` is about winning arguments; everything above is
 * about winning rounds. They are not the same, and the gap between them is
 * where most competitors sit for a season: a debater who wins every argument
 * and never explains why theirs decides the round loses to one who does.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const DEBATE: SubjectTree = {
  id: 'debate',
  title: 'Competitive Debate',
  blurb: 'Policy, LD and Public Forum — winning arguments, then winning rounds.',
  parent: 'humanities',
  nodes: [
    { id: 'db.claim', name: 'Claim, Warrant, Impact', icon: 'argument', tier: 'foundation', core: true, state: open, percent: 15, xp: 1200,
      desc: 'What you say, why it is true, and why anybody should care. An argument missing the warrant is an assertion and an argument missing the impact is trivia, and judges discount both without saying so.' },
    { id: 'db.speak', name: 'Speaking Clearly', icon: 'speaking', tier: 'foundation', requires: ['db.claim'], state: lock, percent: 0, xp: 1300,
      desc: 'Being understood at whatever rate you have chosen, with the emphasis landing on the words that carry the argument. Speed that costs comprehension is negative value however impressive it sounds.' },
    { id: 'db.flow', name: 'Flowing', icon: 'flow', tier: 'foundation', core: true, requires: ['db.claim'], state: lock, percent: 0, xp: 1400,
      desc: 'Recording both sides of the round in columns so every argument can be tracked to whoever last answered it. A dropped argument you had a response to reads exactly like a concession, which is why this is a foundation.' },
    { id: 'db.research', name: 'Research & Evidence', icon: 'research', tier: 'beginner', core: true, requires: ['db.claim'], state: lock, percent: 0, xp: 1500,
      desc: 'Finding sources that say what you need and cutting them without misrepresenting them. The cards that win rounds are qualified, recent, and say the thing in their own words rather than in your paraphrase.' },
    { id: 'db.listen', name: 'Active Listening', icon: 'listening', tier: 'beginner', requires: ['db.flow'], state: lock, percent: 0, xp: 1500,
      desc: 'Hearing what was actually argued rather than the argument you prepared for. Most novice rebuttals answer a case the opponent did not run, which costs the speech and hands the judge a reason to discount you.' },
    { id: 'db.cite', name: 'Citing Sources', icon: 'citation', tier: 'beginner', requires: ['db.research'], state: lock, percent: 0, xp: 1400,
      desc: 'Author, qualification and date, said out loud, every time. It is mechanical, it is checkable, and an evidence challenge you cannot answer loses more than the card was ever worth.' },
    { id: 'db.brief', name: 'Case Building', icon: 'brief', tier: 'intermediate', core: true, requires: ['db.claim', 'db.research'], state: lock, percent: 0, xp: 1700,
      desc: 'A constructive that is internally consistent, fits the time, and anticipates the three responses everybody runs. Writing the blocks to those responses while you write the case is what makes the second speech survivable.' },
    { id: 'db.time', name: 'Time Allocation', icon: 'timer', tier: 'intermediate', requires: ['db.speak'], state: lock, percent: 0, xp: 1600,
      desc: 'Deciding before you stand which arguments get ninety seconds and which get ten. Spending four minutes on the contention you enjoy and running out of time on the one that decides the round is the classic loss.' },
    { id: 'db.refute', name: 'Refutation', icon: 'contradiction', tier: 'intermediate', core: true, requires: ['db.flow', 'db.brief'], state: lock, percent: 0, xp: 1800,
      desc: 'Naming the argument, saying why it fails, and saying what follows — rather than reading a card at it and moving on. The third part is the one that gets skipped and the one a judge writes down.' },
    { id: 'db.cross', name: 'Cross-Examination', icon: 'question', tier: 'intermediate', requires: ['db.listen', 'db.refute'], state: lock, percent: 0, xp: 1800,
      desc: 'Asking questions with a destination, and getting the concession on the record so you can use it later. Cross is not scored directly, which is why the answers matter more than looking clever while asking.' },
    { id: 'db.fallacy', name: 'Spotting Fallacies', icon: 'fallacy', tier: 'intermediate', requires: ['db.refute'], state: lock, percent: 0, xp: 1700,
      desc: 'Recognizing the move rather than merely disliking the conclusion — correlation offered as cause, a burden quietly shifted, a term redefined mid-round. Naming it is worth less than showing what it lets the opponent skip.' },
    { id: 'db.weigh', name: 'Weighing Impacts', icon: 'balance-scale', tier: 'advanced', core: true, requires: ['db.refute'], state: lock, percent: 0, xp: 2200,
      desc: 'Explaining why your impact decides the round even if theirs is also true — on magnitude, probability or timeframe. This is the hinge of the whole tree: below it you win arguments, above it you win rounds.' },
    { id: 'db.theory', name: 'Framework & Theory', icon: 'philosophy', tier: 'advanced', requires: ['db.weigh'], state: lock, percent: 0, xp: 2300,
      desc: 'Arguing about how the round should be judged before arguing inside it. A framework nobody contests decides everything downstream, which is why conceding one early is so much more expensive than it feels.' },
    { id: 'db.rebuttal', name: 'The Rebuttal Speech', icon: 'presenting', tier: 'advanced', core: true, requires: ['db.weigh', 'db.cross', 'db.time'], state: lock, percent: 0, xp: 2400,
      desc: 'The last speech, where you stop covering everything and tell the judge the two things that decide it. Going for everything is the most common way to lose a round you were winning on the flow.' },
    { id: 'db.ethics', name: 'Value Debate', icon: 'ethics', tier: 'expert', requires: ['db.theory'], state: lock, percent: 0, xp: 2500,
      desc: 'Rounds decided on a criterion rather than on consequences, where the moral framework is the contested ground. It demands actual familiarity with the philosophy, because a judge who knows it will notice a name used as decoration.' },
    { id: 'db.policy', name: 'Policy Rounds', icon: 'politics', tier: 'expert', requires: ['db.rebuttal', 'db.fallacy'], state: lock, percent: 0, xp: 2600,
      desc: 'Plans, disadvantages, counterplans and solvency, at speed and at volume of evidence. The research burden is unlike any other event, and organization of the files is a real competitive advantage rather than tidiness.' },
    { id: 'db.adapt', name: 'Reading the Judge', icon: 'scrutiny', tier: 'expert', requires: ['db.rebuttal'], state: lock, percent: 0, xp: 2500,
      desc: 'Adjusting speed, jargon and what you go for based on the paradigm in front of you. Running a technical round in front of a lay judge is a strategy error that no amount of argument quality recovers from.' },
    { id: 'db.tournament', name: 'The Tournament', icon: 'trophy', tier: 'mastery', requires: ['db.adapt', 'db.policy', 'db.ethics'], state: lock, percent: 0, xp: 3200,
      desc: 'Six preliminary rounds in a day, both sides of a resolution you may not agree with, against cases you have never seen. Everything below converges here, and stamina turns out to be a competitive skill in its own right.' },
  ],
};
