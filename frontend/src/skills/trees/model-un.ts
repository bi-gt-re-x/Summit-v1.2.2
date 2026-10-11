/**
 * Model UN, a branch of Competitive Debate.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const MODEL_UN: SubjectTree = {
  id: 'model-un',
  title: 'Model UN',
  blurb: 'Representing a country, building blocs and passing resolutions.',
  parent: 'debate',
  nodes: [
    { id: 'un.un', name: 'How the UN Works', icon: 'globe', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: "The General Assembly, Security Council and specialized agencies. Know what each body can and can't do." },
    { id: 'un.procedure', name: 'Rules of Procedure', icon: 'checklist', tier: 'foundation', requires: ['un.un'], state: lock, percent: 0, xp: 1200,
      desc: 'Motions, points and how voting works. Knowing the rules cold lets you steer the room.' },
    { id: 'un.country', name: 'Researching Your Country', icon: 'map', tier: 'beginner', core: true, requires: ['un.un'], state: lock, percent: 0, xp: 1600,
      desc: "Your country's history, allies, economy and voting record. Represent its view, even when it isn't yours." },
    { id: 'un.topic', name: 'Researching the Topic', icon: 'research', tier: 'beginner', requires: ['un.country'], state: lock, percent: 0, xp: 1700,
      desc: "Past resolutions, key players and what's been tried. The background guide is only the starting point." },
    { id: 'un.paper', name: 'Position Papers', icon: 'paper', tier: 'beginner', requires: ['un.topic'], state: lock, percent: 0, xp: 1400,
      desc: "A one or two page summary of your country's stance and ideas. Plenty of awards depend on it." },
    { id: 'un.speech', name: 'Opening Speeches', icon: 'speaking', tier: 'intermediate', requires: ['un.paper', 'un.procedure'], state: lock, percent: 0, xp: 1800,
      desc: 'A sixty-second speech on your stance. Be clear and confident, and end with a call to work together.' },
    { id: 'un.caucus', name: 'Caucusing', icon: 'discussion', tier: 'intermediate', core: true, requires: ['un.speech'], state: lock, percent: 0, xp: 1900,
      desc: 'Moderated and unmoderated debate. Speeches get attention, and the real work happens in unmods.' },
    { id: 'un.bloc', name: 'Building a Bloc', icon: 'network-people', tier: 'intermediate', requires: ['un.caucus'], state: lock, percent: 0, xp: 2000,
      desc: 'Finding allies with shared goals early on. Be the delegate who brings people together.' },
    { id: 'un.negotiate', name: 'Negotiation', icon: 'negotiate', tier: 'advanced', requires: ['un.bloc'], state: lock, percent: 0, xp: 2000,
      desc: 'Trading ideas and finding compromises. Listen for what other countries really need.' },
    { id: 'un.reso', name: 'Writing Resolutions', icon: 'source-doc', tier: 'advanced', core: true, requires: ['un.negotiate'], state: lock, percent: 0, xp: 2100,
      desc: 'Preambulatory and operative clauses in proper format. Make each clause specific and doable.' },
    { id: 'un.merge', name: 'Merging Papers', icon: 'join', tier: 'advanced', requires: ['un.reso'], state: lock, percent: 0, xp: 2200,
      desc: "Combining draft resolutions into one. It's where your diplomacy really gets tested." },
    { id: 'un.amend', name: 'Amendments', icon: 'edit-pen', tier: 'advanced', requires: ['un.merge'], state: lock, percent: 0, xp: 2300,
      desc: 'Changing a resolution on the floor. Friendly amendments are easy. Unfriendly ones need the votes.' },
    { id: 'un.crisis', name: 'Crisis Committees', icon: 'warning', tier: 'expert', requires: ['un.negotiate'], state: lock, percent: 0, xp: 2300,
      desc: 'Fast-moving committees with surprise updates. Write directives fast and think a few moves ahead.' },
    { id: 'un.chair', name: 'Impressing the Chair', icon: 'gold', tier: 'expert', requires: ['un.amend'], state: lock, percent: 0, xp: 2400,
      desc: 'Leadership, diplomacy and staying in character. Chairs notice who moves the room.' },
    { id: 'un.secretariat', name: 'Running a Conference', icon: 'leadership', tier: 'expert', requires: ['un.chair'], state: lock, percent: 0, xp: 2500,
      desc: 'Chairing a committee or running a whole conference. Students who run conferences learn a ton about leading.' },
    { id: 'un.award', name: 'Best Delegate', icon: 'trophy', tier: 'mastery', requires: ['un.crisis', 'un.secretariat'], state: lock, percent: 0, xp: 2900,
      desc: 'Putting it all together at big conferences. Preparation and kindness both win awards.' },
  ],
};
