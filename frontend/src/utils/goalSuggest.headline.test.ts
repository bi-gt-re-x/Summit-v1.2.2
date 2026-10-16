/**
 * The one sentence the Goals tab opens with, and the setting that orders it.
 *
 * `leadWithStrength` comes from `toneRules()`. The property worth pinning is
 * not the wording — that will change — but the invariant underneath it: both
 * orders carry both figures, and neither invents or drops a goal. A sentence
 * that softened a shortfall by leaving it out would be the exact failure
 * utils/analyticsPrefs says a tone setting must never be.
 */
import { describe, expect, it } from 'vitest';
import { goalHeadline } from './goalSuggest';
import { toneRules } from './analyticsPrefs';

const base = { active: 5, behind: 2, completed: 0, focusSubject: null, aimedShare: null };

describe('goalHeadline', () => {
  it('leads with what is holding when the tone asks it to', () => {
    const gentle = goalHeadline({ ...base, leadWithStrength: true });
    expect(gentle.startsWith('3 of 5 holding')).toBe(true);
    // The shortfall is still stated, just second.
    expect(gentle).toContain('2');
  });

  it('leads with the count and names the shortfall bluntly otherwise', () => {
    const blunt = goalHeadline({ ...base, leadWithStrength: false });
    expect(blunt.startsWith('5 active goals')).toBe(true);
    expect(blunt).toContain('2 behind');
  });

  it('says the same thing either way when nothing is behind', () => {
    const clean = { ...base, behind: 0 };
    expect(goalHeadline({ ...clean, leadWithStrength: true }))
      .toBe(goalHeadline({ ...clean, leadWithStrength: false }));
  });

  it('never moves a figure — every setting names the same two numbers', () => {
    for (const tone of ['gentle', 'balanced', 'harsh'] as const) {
      const line = goalHeadline({ ...base, leadWithStrength: toneRules(tone).leadWithStrength });
      const numbers = (line.match(/\d+/g) ?? []).map(Number).sort((a, b) => a - b);
      // 2 behind and 5 live, however the sentence is arranged around them.
      expect(numbers).toContain(2);
      expect(numbers).toContain(5);
    }
  });

  it('is unchanged by tone when there are no live goals', () => {
    const none = { ...base, active: 0, behind: 0, completed: 4 };
    expect(goalHeadline({ ...none, leadWithStrength: true }))
      .toBe(goalHeadline({ ...none, leadWithStrength: false }));
  });
});
