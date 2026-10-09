/**
 * Writing.
 *
 * `writing.clarity` and `writing.editing` are the nodes most likely to be pulled
 * into a tree from another domain — a research or a science path wants both —
 * which is the reuse §12 is about, in a domain nobody would have thought to
 * check it in.
 */
import { defineDomain } from './define';
import { after, all, any } from '../types';

const node = defineDomain({ category: 'Writing', subcategory: 'Craft' });

export const writing = [
  node({
    id: 'writing.sentences',
    name: 'Sentence Craft',
    description: 'One idea per sentence, in an order that does not need rereading.',
    difficulty: 'foundation',
    xpReward: 50,
    tags: ['writing', 'foundations'],
    hours: [3, 10],
    skillType: 'technique',
  }),
  node({
    id: 'writing.paragraphs',
    name: 'Paragraphs and Structure',
    description: 'A paragraph that makes one point, and an order between them that carries an argument.',
    difficulty: 'beginner',
    xpReward: 70,
    prerequisites: after('writing.sentences'),
    tags: ['writing', 'structure'],
    hours: [3, 10],
    skillType: 'technique',
  }),
  node({
    id: 'writing.clarity',
    name: 'Clarity',
    description: 'Cutting what is not doing work, and naming the thing rather than gesturing at it.',
    difficulty: 'intermediate',
    xpReward: 110,
    prerequisites: after('writing.paragraphs'),
    tags: ['writing', 'craft', 'clarity'],
    hours: [5, 25],
    skillType: 'practice',
  }),
  node({
    id: 'writing.editing',
    name: 'Editing Your Own Work',
    description: 'Reading what is on the page instead of what you meant, and deleting your favorite sentence.',
    difficulty: 'intermediate',
    xpReward: 115,
    prerequisites: after('writing.clarity'),
    tags: ['writing', 'craft', 'editing'],
    hours: [5, 25],
    skillType: 'practice',
  }),
  node({
    id: 'writing.argument',
    name: 'Building an Argument',
    description: 'A claim, the reasons for it, and honest handling of the strongest objection.',
    difficulty: 'advanced',
    xpReward: 150,
    prerequisites: all('writing.paragraphs', 'writing.clarity'),
    subcategory: 'Non-fiction',
    tags: ['writing', 'argument', 'essays'],
    hours: [8, 30],
    skillType: 'technique',
  }),
  node({
    id: 'writing.research',
    name: 'Research and Citation',
    description: 'Finding sources, reading them properly, and saying where something came from.',
    difficulty: 'intermediate',
    xpReward: 110,
    prerequisites: after('writing.paragraphs'),
    subcategory: 'Non-fiction',
    tags: ['writing', 'research', 'essays'],
    hours: [5, 20],
    skillType: 'practice',
  }),
  node({
    id: 'writing.essay',
    name: 'The Essay',
    description: 'A whole piece with a thesis, evidence and an ending that earns itself.',
    difficulty: 'advanced',
    xpReward: 180,
    prerequisites: all('writing.argument', 'writing.research', 'writing.editing'),
    subcategory: 'Non-fiction',
    tags: ['writing', 'essays'],
    hours: [10, 40],
    skillType: 'project',
  }),
  node({
    id: 'writing.narrative',
    name: 'Narrative',
    description: 'Scene, sequence and consequence — the machinery under a story.',
    difficulty: 'advanced',
    xpReward: 160,
    prerequisites: all('writing.paragraphs', 'writing.clarity'),
    subcategory: 'Fiction',
    tags: ['writing', 'fiction', 'narrative'],
    hours: [10, 40],
    skillType: 'concept',
  }),
  node({
    id: 'writing.voice',
    name: 'Voice',
    description: 'Sounding like yourself on purpose, which comes after clarity rather than instead of it.',
    difficulty: 'expert',
    xpReward: 200,
    prerequisites: all('writing.editing', any('writing.narrative', 'writing.argument')),
    tags: ['writing', 'craft'],
    hours: [20, 200],
    skillType: 'practice',
  }),
  node({
    id: 'writing.technical',
    name: 'Technical Writing',
    description: 'Documentation and explanation for a reader who needs to do something afterwards.',
    difficulty: 'advanced',
    xpReward: 155,
    prerequisites: all('writing.clarity', 'writing.editing'),
    subcategory: 'Non-fiction',
    tags: ['writing', 'technical', 'documentation'],
    hours: [8, 30],
    skillType: 'technique',
  }),
];
