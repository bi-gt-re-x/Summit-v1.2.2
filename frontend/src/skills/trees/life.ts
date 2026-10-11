/**
 * Life & Home — a root subject.
 *
 * The least glamorous tree in the app and the one whose nodes are performed most
 * often. It exists because the catalogue files chores, cooking, errands, family
 * and travel as real subjects that real tasks get filed under, and a skill tree
 * that covered calculus but not "keeping a household running" would be describing
 * a life nobody has.
 */
import type { SubjectTree } from './types';
import { done, prog, open, lock } from './types';

export const LIFE: SubjectTree = {
  id: 'life',
  title: 'Life & Home',
  blurb: 'Running a household so it takes less of the week than it used to.',
  group: 'Life and home',
  nodes: [
    { id: 'lf.routine', name: 'A Weekly Rhythm', icon: 'routine', tier: 'foundation', core: true, state: done, percent: 100, xp: 1200,
      desc: 'Fixed days for the recurring things, so they stop being decisions. Laundry on a day rather than when the basket overflows is the difference between maintenance and crisis.' },
    { id: 'lf.tidy', name: 'Tidying', icon: 'tidy', tier: 'foundation', requires: ['lf.routine'], state: prog, percent: 60, xp: 1100,
      desc: 'Everything having a place, and going back to it. Ten minutes at the end of a day prevents the state where tidying becomes a project requiring a free afternoon.' },
    { id: 'lf.clean', name: 'Cleaning', icon: 'cleaning', tier: 'foundation', requires: ['lf.tidy'], state: prog, percent: 45, xp: 1200,
      desc: 'What actually needs doing weekly against monthly, and the small number of products that cover it. Cleaning a tidy room takes a quarter of the time, which is why the order matters.' },
    { id: 'lf.laundry', name: 'Laundry', icon: 'laundry', tier: 'foundation', requires: ['lf.routine'], state: open, percent: 30, xp: 1000,
      desc: 'Sorting, temperatures and what quietly ruins fabric. The step everybody skips is putting it away, which is where the whole system usually breaks.' },
    { id: 'lf.declutter', name: 'Decluttering', icon: 'declutter', tier: 'beginner', requires: ['lf.tidy'], state: lock, percent: 0, xp: 1400,
      desc: 'Owning less so that tidying is quick. Storage solutions are usually a way of keeping things you have already decided not to use.' },
    { id: 'lf.shop', name: 'Shopping & Stock', icon: 'groceries', tier: 'beginner', core: true, requires: ['lf.routine'], state: lock, percent: 0, xp: 1400,
      desc: 'A list built from what you plan to eat, and a small set of staples always in. One considered trip beats four improvised ones for money, time and what gets thrown away.' },
    { id: 'lf.errands', name: 'Errands', icon: 'errand', tier: 'beginner', requires: ['lf.shop'], state: lock, percent: 0, xp: 1200,
      desc: 'Grouping the things that need leaving the house into one route. Kept as a running list rather than remembered, because an errand forgotten costs a second trip.' },
    { id: 'lf.money', name: 'Household Money', icon: 'budget', tier: 'beginner', requires: ['lf.shop'], state: lock, percent: 0, xp: 1600,
      desc: 'Knowing the fixed costs, when they leave and what the variable ones average. Most household financial stress is timing rather than total, and a calendar fixes timing.' },
    { id: 'lf.admin', name: 'Admin', icon: 'admin', tier: 'intermediate', core: true, requires: ['lf.money'], state: lock, percent: 0, xp: 1600,
      desc: 'Renewals, appointments, forms and the documents you need once a year. A single folder and a calendar reminder converts a recurring panic into a ten-minute task.' },
    { id: 'lf.repair', name: 'Repairs & Maintenance', icon: 'repair', tier: 'intermediate', requires: ['lf.admin'], state: lock, percent: 0, xp: 1700,
      desc: 'Basic fixes, and knowing which jobs need somebody qualified — anything gas, structural or on a consumer unit does. Small maintenance done on time is the cheapest money in a home.' },
    { id: 'lf.safety', name: 'Home Safety', icon: 'safety', tier: 'intermediate', requires: ['lf.repair'], state: lock, percent: 0, xp: 1600,
      desc: 'Alarms tested, a first aid kit, and knowing where the stopcock and the fuse box are. Ten minutes of preparation that is worth an enormous amount on one unlikely day.' },
    { id: 'lf.plants', name: 'Plants & Garden', icon: 'garden', tier: 'intermediate', requires: ['lf.clean'], state: lock, percent: 0, xp: 1500,
      desc: 'Light, water and the patience to leave things alone. Most houseplants die of overwatering, which is the one problem more attention makes worse.' },
    { id: 'lf.time', name: 'Time with People', icon: 'friends', tier: 'intermediate', core: true, requires: ['lf.errands'], state: lock, percent: 0, xp: 1800,
      desc: 'Seeing family and friends on purpose rather than when it happens. Relationships decay quietly without contact, and the fix is a recurring arrangement rather than better intentions.' },
    { id: 'lf.hosting', name: 'Hosting', icon: 'party', tier: 'advanced', requires: ['lf.time'], state: lock, percent: 0, xp: 1800,
      desc: 'Having people over without it costing a weekend. Simple food prepared beforehand, and accepting that nobody remembers what was served, only whether you were with them.' },
    { id: 'lf.occasions', name: 'Occasions & Gifts', icon: 'birthday', tier: 'advanced', requires: ['lf.time'], state: lock, percent: 0, xp: 1600,
      desc: 'Birthdays in a calendar with a reminder that leaves time to post something. The thought people register is that you knew, rather than what arrived.' },
    { id: 'lf.digital', name: 'Digital Housekeeping', icon: 'backup', tier: 'advanced', requires: ['lf.admin'], state: lock, percent: 0, xp: 1800,
      desc: 'Backups that exist in two places, a password manager, and photographs that are not only on a phone. The cost of neglecting this is zero until it is total.' },
    { id: 'lf.sustain', name: 'Waste & Repair Culture', icon: 'recycle', tier: 'advanced', requires: ['lf.declutter', 'lf.repair'], state: lock, percent: 0, xp: 1700,
      desc: 'Buying less, mending what breaks and disposing of the rest properly. Usually cheaper, occasionally slower, and the only part of this tree with effects outside the house.' },
    { id: 'lf.systems', name: 'A Home That Runs Itself', icon: 'system', tier: 'expert', requires: ['lf.safety', 'lf.digital'], state: lock, percent: 0, xp: 2300,
      desc: 'Standing orders, recurring reminders and shared lists, so nothing depends on one person remembering. Invisible when it works and immediately obvious when it does not.' },
    { id: 'lf.cook', name: 'Cooking', icon: 'cooking', tier: 'intermediate', requires: ['lf.shop'], navTo: 'cooking', state: lock,
      desc: 'A subject of its own: feeding yourself well, most days, without it taking an evening.' },
    { id: 'lf.travel', name: 'Travel', icon: 'travel', tier: 'advanced', requires: ['lf.occasions'], navTo: 'travel', state: lock,
      desc: 'A subject of its own: planning, packing and going somewhere without the trip needing recovery.' },
    { id: 'lf.driving', name: 'Driving', icon: 'car', tier: 'intermediate', requires: ['lf.admin'], navTo: 'driving', state: lock,
      desc: "Its own tree: your learner's permit, road skills, the road test and staying safe." },
    { id: 'lf.chess', name: 'Chess', icon: 'rook', tier: 'beginner', requires: ['lf.routine'], navTo: 'chess', state: lock,
      desc: 'Its own tree: tactics, openings, endgames, calculation and playing in real tournaments.' },
  ],
};
