import { describe, expect, it } from 'vitest';
import { weekTitle } from './Week';

describe('the week title', () => {
  it('says the month once inside one month', () => {
    expect(weekTitle(new Date(2026, 10, 9))).toBe('November 9 to 15, 2026');
  });
  it('names both months across a month', () => {
    expect(weekTitle(new Date(2026, 10, 30))).toBe('November 30 to December 6, 2026');
  });
  it('names both years across a new year', () => {
    expect(weekTitle(new Date(2026, 11, 28))).toBe('December 28, 2026 to January 3, 2027');
  });
});
