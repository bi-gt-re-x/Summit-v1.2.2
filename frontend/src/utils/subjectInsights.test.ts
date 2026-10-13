import { describe, expect, it } from 'vitest';
import { skillCards } from './growthSkills';
import {
  filterCards,
  isCooling,
  sortCards,
  subjectInsights,
  weeklyTrends,
} from './subjectInsights';
import { task } from '@/test/factories';
import type { Subject } from '@/services/subjects';

const TODAY = '2026-10-12';

const subjects = new Map<string, Subject>(
  ['chem', 'maths', 'art'].map((id) => [id, { id, label: id, name: id.toUpperCase() } as Subject]),
);

const done = (subject: string, day: string, xp = 20, extra = {}) =>
  task({ subject, status: 'done', xp_value: xp, completed_at: `${day}T19:00:00`, ...extra });

/** Chem: busy and rising. Maths: older, gone quiet. Art: one task today. */
const TASKS = [
  done('chem', '2026-08-20', 20),
  done('chem', '2026-09-01', 20),
  done('chem', '2026-09-22', 40),
  done('chem', '2026-09-29', 40),
  done('chem', '2026-10-06', 40),
  done('chem', '2026-10-11', 40),
  done('maths', '2026-07-01', 100),
  done('maths', '2026-07-05', 100),
  done('maths', '2026-07-09', 100),
  done('maths', '2026-09-10', 100),
  done('art', TODAY, 10),
];

const cards = skillCards(TASKS, subjects, TODAY);
const card = (key: string) => cards.find((entry) => entry.key === key)!;

describe('sorting and filtering the skill cards', () => {
  it('marks a subject cooling after two weeks without work', () => {
    expect(isCooling(card('maths'))).toBe(true);
    expect(isCooling(card('chem'))).toBe(false);
    expect(filterCards(cards, 'cooling').map((entry) => entry.key)).toEqual(['maths']);
    expect(filterCards(cards, 'active').map((entry) => entry.key).sort()).toEqual(['art', 'chem']);
  });

  it('sorts by XP, by quiet and by distance to the next level', () => {
    expect(sortCards(cards, 'xp')[0]!.key).toBe('maths');
    expect(sortCards(cards, 'quiet')[0]!.key).toBe('maths');
    const next = sortCards(cards, 'next');
    for (let i = 1; i < next.length; i += 1) {
      expect(next[i]!.level.toNext).toBeGreaterThanOrEqual(next[i - 1]!.level.toNext);
    }
  });

  it('puts the biggest XP swing first either way, and does not mutate the input', () => {
    const before = cards.map((entry) => entry.key);
    const sorted = sortCards(cards, 'change');
    expect(cards.map((entry) => entry.key)).toEqual(before);
    // Chem swung 120 XP, maths lost its 100, art gained 10.
    expect(sorted.map((entry) => entry.key)).toEqual(['chem', 'maths', 'art']);
  });
});

describe('weeklyTrends', () => {
  it('buckets the last eight weeks with this week on the right', () => {
    const chem = weeklyTrends(TASKS, TODAY).get('chem')!;
    expect(chem).toHaveLength(8);
    expect(chem[7]).toBe(80); // Oct 6 and Oct 11
    expect(chem.reduce((a, b) => a + b, 0)).toBe(200); // Aug 20 is outside the window
  });
});

describe('subjectInsights', () => {
  it('always gives exactly three, even for a single task', () => {
    for (const entry of cards) {
      expect(subjectInsights(entry, cards, TASKS, TODAY)).toHaveLength(3);
    }
    const one = skillCards([done('art', TODAY)], subjects, TODAY);
    expect(subjectInsights(one[0]!, one, [done('art', TODAY)], TODAY)).toHaveLength(3);
  });

  it('leads with the silence on a subject that has gone quiet', () => {
    const [first] = subjectInsights(card('maths'), cards, TASKS, TODAY);
    expect(first!.key).toBe('rhythm');
    expect(first!.head).toBe('Quiet for 32 days');
  });

  it('reports momentum on a rising subject', () => {
    const keys = subjectInsights(card('chem'), cards, TASKS, TODAY).map((entry) => entry.key);
    expect(keys).toContain('momentum');
  });

  it('compares ratings against the other subjects when there are enough', () => {
    const rated = [
      ...['2026-10-01', '2026-10-03', '2026-10-05'].map((day) => done('chem', day, 20, { execution: 5 })),
      ...['2026-10-02', '2026-10-04', '2026-10-06'].map((day) => done('maths', day, 20, { execution: 2 })),
    ];
    const ratedCards = skillCards(rated, subjects, TODAY);
    const chem = ratedCards.find((entry) => entry.key === 'chem')!;
    const insight = subjectInsights(chem, ratedCards, rated, TODAY).find((entry) => entry.key === 'ratings');
    expect(insight?.head).toBe('It goes better than your other work');
  });

  it('keeps visible copy free of em dashes', () => {
    for (const entry of cards) {
      for (const insight of subjectInsights(entry, cards, TASKS, TODAY)) {
        expect(`${insight.head} ${insight.detail}`).not.toMatch(/[—–]/);
      }
    }
  });
});
