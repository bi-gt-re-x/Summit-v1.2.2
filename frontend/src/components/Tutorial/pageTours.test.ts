/**
 * The page guides' lengths are part of the brief: Analytics walks through
 * both the overall view and the subject pages in fifteen steps, and every
 * other unlockable page gets a short guide of five to ten.
 */
import { describe, expect, it } from 'vitest';
import { FEATURES } from '@/utils/starter';
import { PAGE_TOURS } from './pageTours';

describe('page guides', () => {
  it('Analytics has fifteen steps', () => {
    expect(PAGE_TOURS.analytics).toHaveLength(15);
  });

  it('every other unlockable page has five to ten', () => {
    for (const feature of FEATURES) {
      if (feature.id === 'analytics') continue;
      const steps = PAGE_TOURS[feature.id];
      expect(steps, feature.id).toBeDefined();
      expect(steps!.length, feature.id).toBeGreaterThanOrEqual(5);
      expect(steps!.length, feature.id).toBeLessThanOrEqual(10);
    }
  });

  it('ends every guide on a step with nothing to find, so it can always finish', () => {
    for (const steps of Object.values(PAGE_TOURS)) {
      expect(steps!.at(-1)!.target).toBeUndefined();
    }
  });

  it('gives every step its own id', () => {
    const ids = Object.values(PAGE_TOURS).flatMap((steps) => steps!.map((step) => step.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
