/**
 * The tutorial's script: what Mango points at, in order, and what it says.
 *
 * Targets are CSS selectors, and most of them are `data-tour` attributes put
 * on the element for this purpose (the rail rows, the Add Task button, More
 * tools). A selector list is tried in order and the first match that is
 * actually on screen wins, which is how one step covers the Week, Day and
 * Month calendar views.
 *
 * Three kinds of step:
 *
 *   * `next`: look, don't touch. The whole page is dimmed and blocked, the
 *     target is lit, and the card has a Next button.
 *   * `click`: the target is the only thing on the page that takes a click,
 *     and clicking it moves the tour on. No Next button, unless the target
 *     can't be found (a phone layout, a hidden panel), so nobody gets stuck.
 *   * `inside`: the target is a dialog or a panel to use. Everything in it
 *     works, nothing outside it does, and the tour moves on when it closes.
 *
 * `skipIfMissing` is for things only some accounts have: the timer's first-run
 * setup, the More tools row a new account gets, panels Settings can hide.
 */
import type { Stage } from '@/utils/starter';
import { STARTER_DAYS, STARTER_LEVEL } from '@/utils/starter';

export type StepKind = 'next' | 'click' | 'inside';

export interface TourContext {
  name: string;
  stage: Stage;
}

export interface Step {
  id: string;
  kind: StepKind;
  /** Selectors, tried in order. None means a card in the middle of the screen. */
  target?: string[];
  /** The page this step lives on. The tour goes there if it isn't already. */
  route?: string;
  title: string | ((ctx: TourContext) => string);
  body: string | ((ctx: TourContext) => string);
  /** Leave this step out when its target never turns up. */
  skipIfMissing?: boolean;
  /** Label for the Next button, when "Next" isn't right. */
  next?: string;
}

const rail = (path: string) => [`[data-tour="rail-${path}"]`];
/** A tab that lives in the More sheet on a phone: point at More there. */
const tab = (path: string) => [...rail(path), '[data-tour="rail-more-phone"]'];

export const STEPS: Step[] = [
  {
    id: 'hello',
    kind: 'next',
    route: '/dashboard',
    title: ({ name }) => (name ? `Hi ${name}, I'm Mango!` : "Hi, I'm Mango!"),
    body: "I'll show you around Summit. It takes about two minutes. We'll start with the three pages you'll use every day: Dashboard, Calendar and Timer.",
    next: "Let's go",
  },

  // ---- Dashboard -----------------------------------------------------------
  {
    id: 'dashboard',
    kind: 'next',
    route: '/dashboard',
    target: rail('dashboard'),
    title: 'This is your Dashboard',
    body: "It's home base. Everything about today lives here, and this button always brings you back.",
  },
  {
    id: 'stats',
    kind: 'next',
    route: '/dashboard',
    target: ['.dash-stats'],
    skipIfMissing: true,
    title: 'Your day in four numbers',
    body: 'Tasks done, XP earned, time focused and your streak. They fill up as you work.',
  },
  {
    id: 'add-task',
    kind: 'click',
    route: '/dashboard',
    target: ['[data-tour="add-task"]'],
    title: 'Add your first task',
    body: "Click Add Task. Anything works, even something small like \"Read for 20 minutes.\"",
  },
  {
    id: 'task-form',
    kind: 'inside',
    route: '/dashboard',
    target: ['#taskModal .modal-content'],
    skipIfMissing: true,
    title: 'Fill it in',
    body: 'Give it a name and a due date, then click Confirm & Add Task at the bottom. The other fields are optional.',
  },
  {
    id: 'task-list',
    kind: 'next',
    route: '/dashboard',
    target: ['.dash-tasks'],
    title: "Here's your list",
    body: "When you finish a task, tick the box next to it. That's how you earn XP and keep your streak going.",
  },
  {
    id: 'focus-panel',
    kind: 'next',
    route: '/dashboard',
    target: ['.dash-main .focus-panel .fp-controls', '.dash-main .focus-panel'],
    skipIfMissing: true,
    title: 'A focus timer, right here',
    body: 'Press Start Focus to work in timed blocks with short breaks. The screen clears so you can concentrate. Press Esc to come back.',
  },

  // ---- Calendar ------------------------------------------------------------
  {
    id: 'to-calendar',
    kind: 'click',
    target: rail('calendar'),
    title: 'Next up: Calendar',
    body: 'Click Calendar. This is where you plan when things happen.',
  },
  {
    id: 'calendar-views',
    kind: 'next',
    route: '/calendar',
    target: ['.view-toggle'],
    title: 'Zoom in or out',
    body: 'Look at one day, a whole week or the full month.',
  },
  {
    id: 'calendar-grid',
    kind: 'next',
    route: '/calendar',
    target: ['.wk-gridwrap', '.view-pane.active'],
    title: 'Block out time',
    body: "Press on an empty spot and drag down to block out time. You'll be asked if it's an event or a task. Drag a block to move it, or drag its edge to make it longer or shorter.",
  },

  // ---- Timer ---------------------------------------------------------------
  {
    id: 'to-timer',
    kind: 'click',
    target: rail('timer'),
    title: 'Now the Timer',
    body: "Click Timer. It's where the focused work happens.",
  },
  {
    id: 'timer-setup',
    kind: 'inside',
    route: '/timer',
    target: ['.pom-setup'],
    skipIfMissing: true,
    title: 'Set up your timer',
    body: 'Pick how long you can usually stay focused, then choose a style and press Start. You can change it later.',
  },
  {
    id: 'timer-start',
    kind: 'next',
    route: '/timer',
    target: ['.pom-start'],
    title: 'Start a session',
    body: 'When you sit down to work, press Start Focus. Every minute counts toward your daily focus goal.',
  },
  {
    id: 'timer-controls',
    kind: 'next',
    route: '/timer',
    target: ['.pom-ring-controls'],
    skipIfMissing: true,
    title: 'Reset or switch it up',
    body: 'The left button resets the clock. The right one lets you pick a different timer style.',
  },

  // ---- Everything else -----------------------------------------------------
  {
    id: 'more-tools',
    kind: 'click',
    target: ['[data-tour="rail-more"][aria-expanded="false"]'],
    skipIfMissing: true,
    title: "There's more",
    body: 'Summit has a few more tools. They stay tucked away for your first days so things stay simple. Click More tools (the padlock) to see them.',
  },
  {
    id: 'analytics',
    kind: 'next',
    target: tab('recommendations'),
    title: 'Analytics',
    body: 'Charts and reports on how you work: your growth score, trends and what to try next. It gets useful after about a week of tasks.',
  },
  {
    id: 'tasks',
    kind: 'next',
    target: tab('tasks'),
    title: 'Tasks',
    body: "Every task you've added, with filters, sorting and grouping. Handy once your list gets long.",
  },
  {
    id: 'goals',
    kind: 'next',
    target: tab('goals'),
    title: 'Goals',
    body: "Bigger goals with milestones. Link tasks to a goal and you'll watch it move as you finish them.",
  },
  {
    id: 'skill-tree',
    kind: 'next',
    target: tab('skill-trees'),
    title: 'Skill Tree',
    body: 'A subject broken into skills, with practice problems and levels to earn.',
  },
  {
    id: 'notes',
    kind: 'next',
    target: tab('notes'),
    title: 'Notes',
    body: 'A notebook for class notes and ideas, with folders and search.',
  },
  {
    id: 'achievements',
    kind: 'next',
    target: tab('achievements'),
    title: 'Achievements',
    body: 'Badges and personal bests. It fills up the more you use Summit.',
  },
  {
    id: 'spaces',
    kind: 'next',
    target: ['.rail-section[aria-label="Personal"]'],
    skipIfMissing: true,
    title: 'Spaces',
    body: 'Pages of your own, like a notebook crossed with a whiteboard. The Team ones can be shared with other people.',
  },
  {
    id: 'settings',
    kind: 'next',
    target: tab('settings'),
    title: 'Settings',
    body: 'Change your theme, your goals and how the app behaves. You can replay this tour from here too.',
  },
  {
    id: 'done',
    kind: 'next',
    title: "That's the tour!",
    body: ({ stage }) =>
      stage === 'open'
        ? "You've seen it all. Go add a few tasks and start your streak."
        : `Locked tools open with a short note the first time. They unlock on their own after ${STARTER_DAYS} days, or when you reach level ${STARTER_LEVEL}. Now go add a few tasks and start your streak.`,
    next: 'Finish',
  },
];
