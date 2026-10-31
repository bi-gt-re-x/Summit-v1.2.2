/**
 * The tutorial's script: what Mango points at, in order, and what it says.
 *
 * Targets are CSS selectors, and most of them are `data-tour` attributes put
 * on the element for this purpose (the rail rows, the Add Task button, the
 * rail's "Next" row). A selector list is tried in order and the first match that is
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
 * `skipIfMissing` is for things only some accounts have: the rail's "Next" row
 * a new account gets, panels Settings can hide.
 *
 * `until` lets an `inside` step end before its dialog closes: the tour moves on
 * the moment that selector is on screen. That is how one dialog with several
 * pages — the goal wizard — gets a step per page, each moving on when the
 * reader presses the dialog's own Next.
 */
import type { Stage } from '@/utils/starter';

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
  /** For an `inside` step: move on as soon as this selector is on screen. */
  until?: string;
  /** The small line under an `inside` or `click` step, when the default isn't right. */
  hint?: string;
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
    body: "I'll show you around. It takes about a minute. Summit starts simple: add tasks, tick them off, and the rest opens up as you go.",
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
    id: 'add-task',
    kind: 'click',
    route: '/dashboard',
    target: ['[data-tour="add-task"]'],
    title: 'Add your first task',
    body: 'Click Add task. Anything works, even something small like "Read for 20 minutes."',
  },
  {
    id: 'task-form',
    kind: 'inside',
    route: '/dashboard',
    target: ['#taskModal .modal-content'],
    skipIfMissing: true,
    title: 'Fill it in',
    body: 'Give it a name and a due date, then click Add task at the bottom. The other fields are optional.',
  },
  {
    id: 'task-list',
    kind: 'next',
    route: '/dashboard',
    target: ['.dash-tasks'],
    title: "Here's your list",
    body: "When you finish a task, tick the box next to it. That's how you earn XP and keep your streak going.",
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
    id: 'calendar-grid',
    kind: 'next',
    route: '/calendar',
    target: ['.wk-gridwrap', '.view-pane.active'],
    title: 'Block out time',
    body: "Press on an empty spot and drag down to block out time. You'll be asked if it's an event or a task. Drag a block to move it, or drag its edge to make it longer or shorter.",
  },

  // ---- Everything else -----------------------------------------------------
  {
    id: 'log',
    kind: 'next',
    target: tab('log'),
    skipIfMissing: true,
    title: 'Log',
    body: "A private journal. Write about your day or your goals, and Summit uses it to fit your plans to you. Only you can see it.",
  },
  {
    id: 'unlocks',
    kind: 'next',
    target: ['[data-tour="rail-next"]'],
    skipIfMissing: true,
    title: 'More pages, one at a time',
    body: ({ name }) =>
      `That's all you need for now${name ? `, ${name}` : ''}. Finish a task on a few different days and new pages open here, one by one. I'll tell you when.`,
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
    body: 'Add a few tasks, tick them off and start your streak. See you tomorrow.',
    next: 'Finish',
  },
];
