/**
 * Parts with nothing to measure stay out of the score, and say what they need.
 */
import { describe, expect, it } from 'vitest';
import { analyticalScore, howItIsCalculated } from './analyticalScore';
import { seedRatings } from '@/test/seed';
import type { Ratings } from '@/types';

function card(): Ratings {
  const ratings = seedRatings();
  return {
    ...ratings,
    metrics: {
      ...ratings.metrics,
      productivity: { ...ratings.metrics.productivity, score: 80 },
      consistency: { ...ratings.metrics.consistency, score: 40 },
      quality: { ...ratings.metrics.quality, score: null, grade: null, rated_tasks: 2, min_rated: 5 },
      efficiency: { ...ratings.metrics.efficiency, score: null, grade: null, deadline_tracked: 4, min_deadlines: 5 },
      focus: { ...ratings.metrics.focus, score: null, grade: null, focus_days: 0, min_days: 3 },
    },
  };
}

describe('a part with nothing to measure', () => {
  it('is left out of the average rather than counted as zero', () => {
    const score = analyticalScore(card());
    expect(score.value).toBe(60);
    expect(score.parts.map((part) => part.name)).toEqual(['productivity', 'consistency']);
    expect(score.weakest?.name).toBe('consistency');
  });

  it('says what it takes to count', () => {
    expect(analyticalScore(card()).unscored.map((part) => part.raw)).toEqual([
      'Not counted yet. Rate 3 more tasks to add it.',
      'Not counted yet. Finish 1 more task with a due date to add it.',
      'Not counted yet. Log focus on 3 more days to add it.',
    ]);
  });

  it('is named in the sentence about how the score works', () => {
    const text = howItIsCalculated(analyticalScore(card()));
    expect(text).toContain('The average of two parts over the last 90 days: activity and consistency.');
    expect(text).toContain("Quality, Efficiency and Focus join once there's enough to measure.");
  });

  it('counts all five once they all have a score', () => {
    const score = analyticalScore(seedRatings());
    expect(score.parts).toHaveLength(5);
    expect(score.unscored).toEqual([]);
    expect(howItIsCalculated(score)).toContain('The average of five parts');
  });
});
