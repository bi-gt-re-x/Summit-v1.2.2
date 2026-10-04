/**
 * The mastery ladder.
 *
 * The costs here were chosen by hand rather than derived, so there is no
 * formula to check them against — which makes the *relationships* the thing
 * worth testing: that the cumulative table agrees with the per-level costs,
 * that the tiers tile 1 to 100 with no gap and no overlap, and that the cap
 * behaves rather than dividing by a zero-cost level.
 *
 * The file's header warns that this ladder is not the account's linear one.
 * The last block below states that divergence as an assertion, so that
 * anybody who "fixes" one to match the other has to come here and decide.
 */
import { describe, expect, it } from 'vitest';
import { levelForTotalXp } from './format';
import {
  LEVEL_COST,
  MAX_LEVEL,
  TIERS,
  costOf,
  masteryLevel,
  nextTier,
  rankFor,
  tierFor,
  xpToReach,
} from './mastery';

describe('the ladder itself', () => {
  it('holds one cost per level below the cap', () => {
    expect(LEVEL_COST).toHaveLength(MAX_LEVEL - 1);
  });

  it('never gets cheaper as it goes up', () => {
    LEVEL_COST.forEach((cost, index) => {
      if (index === 0) return;
      expect(cost).toBeGreaterThanOrEqual(LEVEL_COST[index - 1]!);
    });
  });

  it('bends rather than running straight — the whole reason for a table', () => {
    // A linear ladder would make every step equal. The top step is many times
    // the bottom one, which is the shape the table exists to hold.
    expect(LEVEL_COST[LEVEL_COST.length - 1]!).toBeGreaterThan(LEVEL_COST[0]! * 50);
  });
});

describe('xpToReach', () => {
  it('is free to be level 1', () => {
    expect(xpToReach(1)).toBe(0);
  });

  it('agrees with the per-level costs at every rung', () => {
    // The cumulative table is built once at module load; this is the check
    // that the prefix sum in it is the sum of the numbers above.
    let running = 0;
    for (let level = 1; level < MAX_LEVEL; level += 1) {
      expect(xpToReach(level)).toBe(running);
      running += LEVEL_COST[level - 1]!;
    }
    expect(xpToReach(MAX_LEVEL)).toBe(running);
  });

  it('sums to the climb the module documents', () => {
    expect(xpToReach(MAX_LEVEL)).toBe(269_483);
  });

  it('clamps rather than returning undefined off either end', () => {
    expect(xpToReach(0)).toBe(0);
    expect(xpToReach(-5)).toBe(0);
    expect(xpToReach(500)).toBe(xpToReach(MAX_LEVEL));
  });
});

describe('costOf', () => {
  it('is what it takes to leave a level', () => {
    expect(costOf(1)).toBe(LEVEL_COST[0]);
    expect(costOf(99)).toBe(LEVEL_COST[98]);
  });

  it('is zero at the top, which has nowhere to go', () => {
    expect(costOf(MAX_LEVEL)).toBe(0);
    expect(costOf(MAX_LEVEL + 10)).toBe(0);
  });

  it('is zero below the bottom', () => {
    expect(costOf(0)).toBe(0);
  });
});

describe('the tiers', () => {
  it('cover every level from 1 to 100, each exactly once', () => {
    // Written as a sweep rather than as a table of twenty-one assertions: a
    // gap or an overlap in the bands is the failure mode, and a sweep is the
    // only thing that sees one.
    for (let level = 1; level <= MAX_LEVEL; level += 1) {
      const matches = TIERS.filter((tier) => level >= tier.from && level <= tier.to);
      expect(matches).toHaveLength(1);
    }
  });

  it('run in order and butt up against each other', () => {
    TIERS.forEach((tier, index) => {
      expect(tier.to).toBeGreaterThanOrEqual(tier.from);
      if (index > 0) expect(tier.from).toBe(TIERS[index - 1]!.to + 1);
    });
  });

  it('start at 1 and end at the cap', () => {
    expect(TIERS[0]!.from).toBe(1);
    expect(TIERS[TIERS.length - 1]!.to).toBe(MAX_LEVEL);
  });

  it('keeps Eternal a band of exactly one', () => {
    const eternal = TIERS[TIERS.length - 1]!;
    expect(eternal).toEqual({ name: 'Eternal', from: 100, to: 100 });
    // Which is only possible because Grand Arbiter gives up a level for it.
    expect(TIERS[TIERS.length - 2]!).toMatchObject({ name: 'Grand Arbiter', from: 96 });
  });

  it('name a level by its band', () => {
    expect(rankFor(1)).toBe('Beginner');
    expect(rankFor(5)).toBe('Beginner');
    expect(rankFor(6)).toBe('Novice');
    expect(rankFor(100)).toBe('Eternal');
  });

  it('clamps a level outside the table rather than returning null', () => {
    expect(tierFor(-3)).toEqual(TIERS[0]);
    expect(tierFor(9999)).toEqual(TIERS[TIERS.length - 1]);
  });

  it('has no tier after the last one', () => {
    expect(nextTier(100)).toBeNull();
    expect(nextTier(3)).toMatchObject({ name: 'Novice' });
    expect(nextTier(99)).toMatchObject({ name: 'Eternal' });
  });
});

describe('masteryLevel', () => {
  it('starts at level 1 with an empty bar', () => {
    expect(masteryLevel(0)).toMatchObject({
      tier: 1,
      xpInLevel: 0,
      xpRequired: LEVEL_COST[0],
      percent: 0,
      maxed: false,
    });
  });

  it('levels up on the exact cost, not one XP after', () => {
    const cost = LEVEL_COST[0]!; // 95
    expect(masteryLevel(cost - 1).tier).toBe(1);
    expect(masteryLevel(cost).tier).toBe(2);
    expect(masteryLevel(cost)).toMatchObject({ xpInLevel: 0, toNext: LEVEL_COST[1] });
  });

  it('reports progress inside the current level, not across the ladder', () => {
    const start = xpToReach(10);
    const cost = costOf(10);
    const half = masteryLevel(start + Math.floor(cost / 2));
    expect(half.tier).toBe(10);
    expect(half.percent).toBeGreaterThan(45);
    expect(half.percent).toBeLessThan(55);
    expect(half.toNext).toBe(cost - Math.floor(cost / 2));
  });

  it('puts the fraction of the level on `exact`', () => {
    const start = xpToReach(4);
    expect(masteryLevel(start).exact).toBe(4);
    expect(masteryLevel(start + costOf(4) / 2).exact).toBeCloseTo(4.5, 5);
  });

  it('lands on the right level at every rung, by construction', () => {
    for (let level = 1; level < MAX_LEVEL; level += 1) {
      expect(masteryLevel(xpToReach(level)).tier).toBe(level);
      expect(masteryLevel(xpToReach(level + 1) - 1).tier).toBe(level);
    }
  });

  it('reads a bar as finished at the cap rather than as empty', () => {
    // At 100 there is no next level to divide by, and a percent computed from
    // a zero cost would be NaN — which a progress bar draws as nothing.
    const top = masteryLevel(xpToReach(MAX_LEVEL));
    expect(top).toMatchObject({
      tier: 100,
      exact: 100,
      percent: 100,
      toNext: 0,
      xpRequired: 0,
      rank: 'Eternal',
      maxed: true,
    });
    expect(Number.isNaN(top.percent)).toBe(false);
  });

  it('stays at the cap however far past it the XP goes', () => {
    expect(masteryLevel(10_000_000)).toMatchObject({ tier: 100, maxed: true });
  });

  it('treats negative XP as nothing', () => {
    expect(masteryLevel(-500)).toMatchObject({ tier: 1, xpInLevel: 0 });
  });

  it('carries the band alongside its name', () => {
    const adept = masteryLevel(xpToReach(18));
    expect(adept.rank).toBe('Adept');
    expect(adept.band).toEqual({ name: 'Adept', from: 16, to: 20 });
  });
});

describe('this is not the account ladder', () => {
  // A real divergence, documented in the module header, and stated here so
  // that it stays a decision somebody makes rather than a bug somebody
  // "fixes": a subject's level and the account's level are counted on
  // different curves, and 300 XP of chemistry is not 300 XP of account.
  it('is gentler at the bottom, so the same XP is a higher subject level', () => {
    // 95 XP is level 2 of a subject and still level 1 of an account; by 2,000
    // the two are seven levels apart.
    expect(masteryLevel(95).tier).toBe(2);
    expect(levelForTotalXp(95).level).toBe(1);

    expect(masteryLevel(2_000).tier).toBe(14);
    expect(levelForTotalXp(2_000).level).toBe(6);
  });

  it('never falls behind the account ladder over the range a subject uses', () => {
    // The looser claim, swept rather than sampled: below the cap the mastery
    // curve is at or above the linear one everywhere. The two *do* coincide at
    // some totals — both are level 3 at 300 — so this is stated as "never
    // behind" rather than "never equal", which would be false.
    for (let xp = 0; xp <= 200_000; xp += 137) {
      const mastery = masteryLevel(xp);
      if (mastery.maxed) break;
      expect(mastery.tier).toBeGreaterThanOrEqual(levelForTotalXp(xp).level);
    }
  });

  it('has a ceiling where the account ladder has none', () => {
    expect(masteryLevel(1_000_000).tier).toBe(MAX_LEVEL);
    expect(levelForTotalXp(1_000_000).level).toBeGreaterThan(MAX_LEVEL);
  });
});
