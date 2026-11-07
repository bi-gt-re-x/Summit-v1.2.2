/**
 * Pages to start from, so a new space isn't a blank page and a blinking caret.
 *
 * Each is built fresh (new ids every time) from the editor's own blocks, including
 * the ones that read the account's numbers: a goal tracker opens on a live goal block,
 * a weekly plan on the live calendar. Applied by components/Spaces/PageTools: on an
 * empty page a template becomes the page; on a written one it goes on the end.
 */
import {
  block,
  countdownBlock,
  liveBlock,
  tableBlock,
  tocBlock,
  type Block,
  type SpaceDoc,
} from './blocks';

export interface Template {
  id: string;
  name: string;
  icon: string;
  /** One line on what it's for. */
  hint: string;
  build: () => Pick<SpaceDoc, 'blocks'> & Partial<SpaceDoc>;
}

const h = (level: 1 | 2 | 3, text: string) => block(`h${level}` as Block['type'], text);
const todo = (text = '') => block('todo', text);
const text = (words = '') => block('text', words);
const bullet = (words = '') => block('bullet', words);
const table = (rows: string[][], head = true) => tableBlock({ table: { rows, head } });

export const TEMPLATES: Template[] = [
  {
    id: 'week',
    name: 'Weekly plan',
    icon: '🗓',
    hint: 'Three goals for the week, a day-by-day plan and your calendar.',
    build: () => ({
      icon: '🗓',
      blocks: [
        h(1, 'This week'),
        h(2, 'Three things that matter'),
        todo(), todo(), todo(),
        h(2, 'Day by day'),
        table([
          ['Day', 'Plan', 'Done?'],
          ['Monday', '', ''], ['Tuesday', '', ''], ['Wednesday', '', ''], ['Thursday', '', ''],
          ['Friday', '', ''], ['Saturday', '', ''], ['Sunday', '', ''],
        ]),
        h(2, "What's booked"),
        liveBlock('calendar'),
        h(2, 'Notes'),
        text(),
      ],
    }),
  },
  {
    id: 'exam',
    name: 'Exam prep',
    icon: '🎯',
    hint: 'A countdown, the topics with how sure you are, and a practice log.',
    build: () => ({
      icon: '🎯',
      blocks: [
        countdownBlock({ text: 'Exam day' }),
        h(2, "What's on it"),
        table([
          ['Topic', 'How sure (1-5)', 'Next step'],
          ['', '', ''], ['', '', ''], ['', '', ''], ['', '', ''],
        ]),
        h(2, 'Practice log'),
        todo('Timed practice set'),
        todo('Go over every miss'),
        todo('One full mock under exam conditions'),
        h(2, 'Mistakes to not make again'),
        bullet(),
      ],
    }),
  },
  {
    id: 'goal',
    name: 'Goal tracker',
    icon: '🏔',
    hint: 'One goal, live from your Goals page, with next steps and a log.',
    build: () => ({
      icon: '🏔',
      blocks: [
        h(1, 'My goal'),
        liveBlock('goal'),
        h(2, 'Why it matters'),
        text(),
        h(2, 'Next steps'),
        todo(), todo(), todo(),
        h(2, 'Log'),
        table([['Date', 'What I did', 'How it went'], ['', '', ''], ['', '', '']]),
      ],
    }),
  },
  {
    id: 'notes',
    name: 'Class notes',
    icon: '📓',
    hint: 'Cornell-style: notes, questions, and a summary in your own words.',
    build: () => ({
      icon: '📓',
      blocks: [
        h(1, 'Class'),
        block('callout', 'Date, topic and what to read before next time'),
        h(2, 'Notes'),
        bullet(),
        h(2, 'Questions to answer'),
        bullet(),
        h(2, 'Summary in my own words'),
        text(),
      ],
    }),
  },
  {
    id: 'reading',
    name: 'Reading list',
    icon: '📚',
    hint: 'Books and papers, where you are with each, and what stuck.',
    build: () => ({
      icon: '📚',
      blocks: [
        h(1, 'Reading list'),
        table([['Title', 'Author', 'Status', 'What stuck'], ['', '', 'To read', ''], ['', '', 'To read', '']]),
        h(2, 'Quotes worth keeping'),
        block('quote', ''),
      ],
    }),
  },
  {
    id: 'habits',
    name: 'Habit tracker',
    icon: '✅',
    hint: 'A habit per row, a tick per day.',
    build: () => ({
      icon: '✅',
      blocks: [
        h(1, 'Habits'),
        table([
          ['Habit', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          ['', '', '', '', '', '', '', ''],
          ['', '', '', '', '', '', '', ''],
          ['', '', '', '', '', '', '', ''],
        ]),
        block('callout', 'Put an x in a box when you do it. Look for the gaps at the end of the week.'),
      ],
    }),
  },
  {
    id: 'project',
    name: 'Project plan',
    icon: '🚀',
    hint: 'Contents, an overview, milestones, tasks and risks.',
    build: () => ({
      icon: '🚀',
      blocks: [
        h(1, 'Project'),
        tocBlock(),
        h(2, 'Overview'),
        text(),
        h(2, 'Milestones'),
        todo(), todo(), todo(),
        h(2, 'Tasks'),
        table([['Task', 'Due', 'Status'], ['', '', ''], ['', '', '']]),
        h(2, 'Risks'),
        bullet(),
      ],
    }),
  },
];

/** Whether the page has nothing on it yet: one empty line, or nothing at all. */
export function isBlank(doc: SpaceDoc): boolean {
  return doc.blocks.every((one) => one.type === 'text' && one.text.trim() === '');
}

/** The page with a template applied: it becomes the page when blank, or goes on the end. */
export function applyTemplate(doc: SpaceDoc, template: Template): SpaceDoc {
  const made = template.build();
  if (isBlank(doc)) {
    return { ...doc, icon: doc.icon || made.icon || '', blocks: [...made.blocks, block('text')] };
  }
  return { ...doc, blocks: [...doc.blocks, ...made.blocks, block('text')] };
}
