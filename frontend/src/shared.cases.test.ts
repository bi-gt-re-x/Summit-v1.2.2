/**
 * The logic both sides implement, run against one set of cases.
 *
 * Python and TypeScript cannot share code, so the rules both apply are written
 * twice — and pinned by the examples in shared/cases/, which this file runs
 * against the browser's copy and tests/test_shared_cases.py runs against the
 * server's. Change one copy's behaviour and the other's run fails.
 *
 * Also here: the types the browser writes by hand (a JSON import has no
 * literal types) still name exactly the values in shared/rules.json.
 */
import { describe, expect, it } from 'vitest';
import timeSpentCases from '@shared/cases/time_spent.json';
import nameFamilyCases from '@shared/cases/name_family.json';
import { secondsSpent, type TimedTask } from '@/utils/timeSpent';
import { nameFamily } from '@/components/Subject/recentWork';
import { RULES } from '@/utils/sharedRules';
import { STEP_WORDS } from '@/services/analytics';
import { BLOCK_KINDS } from '@/components/Spaces/blocks';
import { GRADE_BANDS } from '@/utils/analyticalScore';
import { STRUGGLE_REASONS } from '@/utils/ratings';
import { XP_BANDS, MIN_TASK_XP } from '@/utils/priority';

describe('time spent, as the server works it out', () => {
  it.each(timeSpentCases.cases.map((one) => [one.why, one] as const))('%s', (_why, one) => {
    expect(secondsSpent(one.task as TimedTask)).toBe(one.seconds);
  });
});

describe('a title family, as the server works it out', () => {
  it.each(nameFamilyCases.cases.map((one) => [one.title || 'empty', one] as const))('%s', (_title, one) => {
    expect(nameFamily(one.title)).toBe(one.family);
  });
});

describe('the browser reads its values from the shared file', () => {
  it('names exactly the step types the server allows', () => {
    expect(Object.keys(STEP_WORDS)).toEqual(RULES.recommendations.step_types);
  });

  it('offers exactly the block kinds the server keeps', () => {
    // As sets: the slash menu lists them in its own order.
    expect(BLOCK_KINDS.map((kind) => kind.type as string).sort()).toEqual([...RULES.spaces.block_types].sort());
  });

  it('uses the shared grade bands, XP range and reasons', () => {
    expect(GRADE_BANDS.map(([floor, letter]) => [floor, letter])).toEqual(RULES.grade_bands);
    expect(MIN_TASK_XP).toBe(RULES.task_xp.min);
    expect(XP_BANDS).toEqual(RULES.task_xp.bands);
    expect(STRUGGLE_REASONS.map((reason) => reason.key)).toEqual(
      RULES.task_reasons.struggle.map((reason) => reason.key),
    );
  });
});
