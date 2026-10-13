import { describe, expect, it } from 'vitest';
import { skillCards } from './growthSkills';
import {
  INSIGHTS_SHOWN,
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
  it('always gives at least three, even for a single task', () => {
    for (const entry of cards) {
      expect(subjectInsights(entry, cards, TASKS, TODAY).length).toBeGreaterThanOrEqual(INSIGHTS_SHOWN);
    }
    const one = skillCards([done('art', TODAY)], subjects, TODAY);
    expect(subjectInsights(one[0]!, one, [done('art', TODAY)], TODAY).length).toBeGreaterThanOrEqual(3);
  });

  it('names the last task and the longest break on a quiet subject', () => {
    const quiet = [...TASKS.slice(6, 9), done('maths', '2026-09-10', 100, { title: 'Past paper 3' })];
    const quietCards = skillCards(quiet, subjects, TODAY);
    const [first] = subjectInsights(quietCards[0]!, quietCards, quiet, TODAY);
    expect(first!.detail).toBe('Lately you came back every 4 days. The last break this long ended on Sep 10.');
    expect(first!.figures).toContainEqual({ label: 'Last task', value: 'Past paper 3' });
    expect(first!.figures.find((figure) => figure.label === 'Longest break')?.value).toBe('63 days, to Sep 10');
  });

  it('says why momentum moved: more days, more tasks, bigger ones', () => {
    const momentum = subjectInsights(card('chem'), cards, TASKS, TODAY).find((entry) => entry.key === 'momentum')!;
    // Aug 20 and Sep 1 at 20 XP before, four at 40 XP since.
    expect(momentum.detail).toContain(
      'You worked on it 4 days, up from 2. You finished 4 tasks against 2. Each task was worth more: 40 XP against 20.',
    );
    expect(momentum.figures[0]).toEqual({ label: 'Tasks', value: '4 (was 2)' });
    expect(momentum.bars).toHaveLength(2);
  });

  it('reads "usual" from the latest breaks once the rhythm has changed', () => {
    // Daily through August, then once a week.
    const daily = Array.from({ length: 20 }, (_, index) => done('chem', `2026-08-${String(index + 1).padStart(2, '0')}`));
    const weekly = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'].map((day) =>
      done('chem', day),
    );
    const shifted = [...daily, ...weekly];
    const shiftedCards = skillCards(shifted, subjects, TODAY);
    const rhythm = subjectInsights(shiftedCards[0]!, shiftedCards, shifted, TODAY).find((entry) => entry.key === 'rhythm')!;
    expect(rhythm.head).toBe('Coming back less often');
    expect(rhythm.detail).toBe(
      "Lately it's every 7 days. Over your whole record it's every day. Your last 4 breaks here were 7, 7, 7 and 7 days.",
    );
  });

  it('spots the task you keep repeating', () => {
    const repeated = Array.from({ length: 10 }, (_, index) =>
      done('chem', `2026-09-${String(index + 10).padStart(2, '0')}`, 20, {
        title: index < 6 ? `Problem set #${index + 1}` : `Lab report ${index}`,
      }),
    );
    const repeatCards = skillCards(repeated, subjects, TODAY);
    const insight = subjectInsights(repeatCards[0]!, repeatCards, repeated, TODAY).find(
      (entry) => entry.key === 'repeat',
    );
    expect(insight?.detail).toContain('makes up 6 of your 10 tasks here');
    expect(insight?.figures[0]).toEqual({ label: '6 times', value: 'Problem set #6' });
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
        const figures = insight.figures.map((figure) => `${figure.label} ${figure.value}`).join(' ');
        expect(`${insight.head} ${insight.detail} ${figures}`).not.toMatch(/[—–“”‘’]/);
      }
    }
  });
});
