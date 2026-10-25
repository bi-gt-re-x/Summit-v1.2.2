import { describe, expect, it } from 'vitest';
import { readDays } from './GrowthReads';

describe('readDays', () => {
  it('reads the page window, never shorter than 30 days or longer than two years', () => {
    expect(readDays('7d')).toBe(30);
    expect(readDays('90d')).toBe(90);
    expect(readDays('1y')).toBe(365);
    expect(readDays('all')).toBe(730);
  });
});
