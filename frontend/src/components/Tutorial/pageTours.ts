/**
 * The page guides: what Mango shows the first time a page is opened.
 *
 * Keyed by the feature ids in utils/starter, so a guide belongs to the same
 * page the rail locks and the note in front of it describes. Each one starts
 * once the page itself is showing (not the note), and once per account:
 * `tours_seen` in the account's preferences.
 *
 * Same step shape as the main tutorial (./steps.ts). Most steps are `next`,
 * and anything lit can be used on them, so a reader who wants to try the
 * button Mango is pointing at can. Targets that only some accounts have (a
 * setup screen, a sidebar, an empty state) are `skipIfMissing`.
 */
import type { FeatureId } from '@/utils/starter';
import type { Step } from './steps';

const AX_PANEL = ['.ax-shell .ax-panel', '.ax-shell .ax-tiles', '.ax-shell section'];

const analytics: Step[] = [
  {
    id: 'ax-hello',
    kind: 'next',
    title: 'Welcome to Analytics',
    body: "This is where your work turns into charts. I'll show you the overall view first, then the subject pages. 15 quick stops.",
    next: "Let's go",
  },
  {
    id: 'ax-setup',
    kind: 'inside',
    target: ['.ax-setup'],
    skipIfMissing: true,
    title: 'A few questions first',
    body: "Tell it how much you plan to work and which subjects to follow. It uses your answers as the bar it measures you against. I'll wait.",
  },
  {
    id: 'ax-head',
    kind: 'next',
    target: ['.ax-head'],
    title: 'Where you are',
    body: 'The title says which section you have open and what it answers. You can download a report from the buttons on the right.',
  },
  {
    id: 'ax-tabs',
    kind: 'next',
    target: ['.ax-tabs'],
    title: 'Five sections',
    body: 'Recommendations, Overview, Insights, Subjects and Growth. Some fill in as you log more days, and the bar under a tab shows how close it is.',
  },
  {
    id: 'ax-window',
    kind: 'next',
    target: ['.ax-chips'],
    skipIfMissing: true,
    title: 'Pick a time window',
    body: 'Look at the last week, month, three months or longer. Every chart on the page follows this.',
  },
  {
    id: 'ax-subject-pick',
    kind: 'next',
    target: ['.ax-select-wrap'],
    skipIfMissing: true,
    title: 'All subjects or one',
    body: 'Narrow the whole page down to a single subject from here.',
  },
  {
    id: 'ax-recs',
    kind: 'next',
    target: ['[data-tour="ax-tab-recommendations"]'],
    title: 'Recommendations',
    body: "A short list of what to change, best idea first. It's what to read when you only have a minute.",
  },
  {
    id: 'ax-to-overview',
    kind: 'click',
    target: ['[data-tour="ax-tab-overview"]'],
    title: 'Open Overview',
    body: 'Click Overview. This is the big picture.',
  },
  {
    id: 'ax-overview',
    kind: 'next',
    target: AX_PANEL,
    title: 'The overall view',
    body: 'Totals for the window you picked, how they compare with before, and your growth score. Scroll down for the trend charts.',
  },
  {
    id: 'ax-insights',
    kind: 'next',
    target: ['[data-tour="ax-tab-insights"]'],
    title: 'Insights',
    body: 'The habits in your record: when you work best and what your better days have in common.',
  },
  {
    id: 'ax-to-subjects',
    kind: 'click',
    target: ['[data-tour="ax-tab-subjects"]'],
    title: 'Now subjects',
    body: 'Click Subjects to see how each one is going.',
  },
  {
    id: 'ax-subjects',
    kind: 'next',
    target: AX_PANEL,
    title: 'Subject by subject',
    body: 'Where your XP went in each subject, plus skill levels from the problems you solved.',
  },
  {
    id: 'ax-subject-pages',
    kind: 'next',
    target: ['.rail-sub', '[data-tour="rail-recommendations"]', '[data-tour="rail-more-phone"]'],
    title: 'Each subject has its own page',
    body: 'Subjects you follow get a full page of their own under Analytics in the sidebar: their goals, streaks, heat map and skill levels.',
  },
  {
    id: 'ax-growth',
    kind: 'next',
    target: ['[data-tour="ax-tab-growth"]'],
    title: 'Growth',
    body: 'How far you have come, year by year. Come back here after a few months.',
  },
  {
    id: 'ax-done',
    kind: 'next',
    title: "That's Analytics",
    body: "It gets better the more you log. Give it a week and the Recommendations tab will have real advice for you.",
    next: 'Finish',
  },
];

const tasks: Step[] = [
  {
    id: 'tk-hello',
    kind: 'next',
    title: 'This is Tasks',
    body: "Every task you've added, all in one list. The dashboard shows today; this shows everything.",
    next: "Let's go",
  },
  {
    id: 'tk-stats',
    kind: 'next',
    target: ['.tk-stats'],
    skipIfMissing: true,
    title: 'Your numbers',
    body: 'Five quick figures over the last two weeks, each with a small trend line.',
  },
  {
    id: 'tk-new',
    kind: 'next',
    target: ['.tk-new'],
    title: 'Add a task',
    body: 'Opens the full composer, with XP, due date, subject and goal in one place.',
  },
  {
    id: 'tk-search',
    kind: 'next',
    target: ['.tk-search'],
    skipIfMissing: true,
    title: 'Search',
    body: 'Type part of a name to find a task fast.',
  },
  {
    id: 'tk-tools',
    kind: 'next',
    target: ['.tk-tools'],
    skipIfMissing: true,
    title: 'Filter, sort and group',
    body: 'Show only one subject, sort by due date or XP, and group the list however you like.',
  },
  {
    id: 'tk-list',
    kind: 'next',
    target: ['.tk-body', '.tk-main'],
    title: 'The list',
    body: 'Tick a task to finish it. The menu on each row lets you edit, move or delete it.',
  },
  {
    id: 'tk-side',
    kind: 'next',
    target: ['.tk-side'],
    skipIfMissing: true,
    title: 'The side panel',
    body: "A timer and quick facts about your list, right next to it.",
  },
  {
    id: 'tk-done',
    kind: 'next',
    title: "That's Tasks",
    body: 'Use it when your list gets long. For a normal day, the dashboard is enough.',
    next: 'Finish',
  },
];

const goals: Step[] = [
  {
    id: 'gx-hello',
    kind: 'next',
    title: 'This is Goals',
    body: 'Bigger things you are working toward, broken into milestones.',
    next: "Let's go",
  },
  {
    id: 'gx-new',
    kind: 'next',
    target: ['.gx-head-tools .gx-btn.is-primary'],
    skipIfMissing: true,
    title: 'Make a goal',
    body: 'Give it a name, a deadline and a few milestones. It walks you through it.',
  },
  {
    id: 'gx-ai',
    kind: 'next',
    target: ['.gx-btn-ai'],
    skipIfMissing: true,
    title: 'Or get a head start',
    body: 'Describe what you want and get a first draft of the goal and its milestones to edit.',
  },
  {
    id: 'gx-list',
    kind: 'next',
    target: ['.ag-list', '.gx-empty', '.gx-main'],
    title: 'Your goals',
    body: 'Each card shows how far along you are and what is next. Open one to see its roadmap.',
  },
  {
    id: 'gx-rails',
    kind: 'next',
    target: ['.gx-rails'],
    skipIfMissing: true,
    title: 'Coming up',
    body: "What's due soon and which goals need attention, at a glance.",
  },
  {
    id: 'gx-link',
    kind: 'next',
    title: 'Link your tasks',
    body: 'When you add a task, pick the goal it counts toward. Finishing it moves the goal forward on its own.',
  },
  {
    id: 'gx-done',
    kind: 'next',
    title: "That's Goals",
    body: 'Start with one goal. You can always add more later.',
    next: 'Finish',
  },
];

const skillTree: Step[] = [
  {
    id: 'stx-hello',
    kind: 'next',
    title: 'This is the Skill Tree',
    body: 'A subject drawn as a map of skills, from the basics up to mastery.',
    next: "Let's go",
  },
  {
    id: 'stx-setup',
    kind: 'inside',
    target: ['.stx-setup'],
    skipIfMissing: true,
    title: 'Pick your subjects',
    body: "First, choose up to five subjects to focus on. They sit across the top of this page. You can change them any time. I'll wait.",
  },
  {
    id: 'stx-lead',
    kind: 'next',
    target: ['.stx-lead'],
    title: 'Which tree',
    body: "The tree you're looking at, and where it sits in the subject.",
  },
  {
    id: 'stx-family',
    kind: 'next',
    target: ['.stx-family'],
    skipIfMissing: true,
    title: 'Hop between trees',
    body: 'Jump up to the bigger subject or across to a related one.',
  },
  {
    id: 'stx-band',
    kind: 'next',
    target: ['.stx-band'],
    skipIfMissing: true,
    title: 'How far along you are',
    body: 'Overall progress, skills done and your skill level for this tree.',
  },
  {
    id: 'stx-modes',
    kind: 'next',
    target: ['.stx-modes'],
    skipIfMissing: true,
    title: 'Ways to read it',
    body: 'Switch how the map is shown. Each mode answers a different question.',
  },
  {
    id: 'stx-map',
    kind: 'next',
    target: ['.stx-layout'],
    title: 'The map',
    body: 'Click any skill to open it. You get practice problems, and solving them levels the skill up.',
  },
  {
    id: 'stx-legend',
    kind: 'next',
    target: ['.stx-legend'],
    skipIfMissing: true,
    title: 'The key',
    body: 'What the colors and lines mean.',
  },
  {
    id: 'stx-done',
    kind: 'next',
    title: "That's the Skill Tree",
    body: 'Pick one skill near the bottom and try a few problems. That is the best way in.',
    next: 'Finish',
  },
];

const notes: Step[] = [
  {
    id: 'nt-hello',
    kind: 'next',
    title: 'This is Notes',
    body: 'A notebook for class notes and ideas, with Markdown, folders and search.',
    next: "Let's go",
  },
  {
    id: 'nt-new',
    kind: 'next',
    target: ['.nt-new-group', '.nt-new'],
    skipIfMissing: true,
    title: 'Start a note',
    body: 'Make a new note here. The arrow next to it has other kinds.',
  },
  {
    id: 'nt-search',
    kind: 'next',
    target: ['.nt-search-wrap', '.nt-search'],
    skipIfMissing: true,
    title: 'Find anything',
    body: 'Search every note by title or what is in it.',
  },
  {
    id: 'nt-list',
    kind: 'next',
    target: ['.nt-list-panel', '.nt-list'],
    skipIfMissing: true,
    title: 'Your notes',
    body: 'All your notes, newest first. Pin the ones you use most so they stay on top.',
  },
  {
    id: 'nt-editor',
    kind: 'next',
    target: ['.nt-editor'],
    skipIfMissing: true,
    title: 'Write here',
    body: 'Type in Markdown. The toolbar has headings, lists and checkboxes if you would rather click.',
  },
  {
    id: 'nt-done',
    kind: 'next',
    title: "That's Notes",
    body: 'Tag a note with a subject and it shows up on that subject page too.',
    next: 'Finish',
  },
];

const achievements: Step[] = [
  {
    id: 'rc-hello',
    kind: 'next',
    title: 'This is Achievements',
    body: 'Your personal bests and your badge wall, all in one place.',
    next: "Let's go",
  },
  {
    id: 'rc-views',
    kind: 'next',
    target: ['.rc-views'],
    skipIfMissing: true,
    title: 'Two sides',
    body: 'Switch between your records and your badges here.',
  },
  {
    id: 'rc-search',
    kind: 'next',
    target: ['.rc-bar'],
    skipIfMissing: true,
    title: 'Search and filter',
    body: 'Find a record by name, or narrow the list to one category.',
  },
  {
    id: 'rc-bests',
    kind: 'next',
    target: ['.rc-bests', '.rc-cards', '.rc-section'],
    skipIfMissing: true,
    title: 'Your bests',
    body: 'Most XP in a day, longest streak, longest focus session and more. They update the moment you beat one.',
  },
  {
    id: 'rc-done',
    kind: 'next',
    title: "That's Achievements",
    body: "It's quiet at first. Come back in a week and it'll be full of things you did.",
    next: 'Finish',
  },
];

const spaces: Step[] = [
  {
    id: 'sp-hello',
    kind: 'next',
    title: 'This is a Space',
    body: 'A page of your own, like a notebook crossed with a whiteboard.',
    next: "Let's go",
  },
  {
    id: 'sp-name',
    kind: 'next',
    target: ['.sp-name'],
    title: 'Name it',
    body: 'Click the title to rename this space. The new name shows up in the sidebar.',
  },
  {
    id: 'sp-dress',
    kind: 'next',
    target: ['.sp-head'],
    title: 'Dress it up',
    body: 'Add an icon, a cover and a background from the header.',
  },
  {
    id: 'sp-body',
    kind: 'next',
    target: ['.sp-body'],
    title: 'Write anything',
    body: 'Type "/" to add a block: headings, lists, charts, sticky notes and more. Drag the dots on a block to move it.',
  },
  {
    id: 'sp-done',
    kind: 'next',
    title: "That's Spaces",
    body: 'You get three personal ones and three team ones to share. Make them whatever you need.',
    next: 'Finish',
  },
];

export const PAGE_TOURS: Partial<Record<FeatureId, Step[]>> = {
  analytics,
  tasks,
  goals,
  'skill-tree': skillTree,
  notes,
  achievements,
  spaces,
};
