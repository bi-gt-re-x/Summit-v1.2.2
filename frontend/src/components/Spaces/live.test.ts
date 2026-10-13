/**
 * A live block's settings and words — components/Spaces/live — and how the
 * page model keeps one (./blocks).
 */
import { describe, expect, it } from 'vitest';
import { duplicate, liveBlock, matchKinds, normalise } from './blocks';
import { agoFrom, cleanLive, defaultLive, liveKey, signed, whenFrom } from './live';

describe('settings', () => {
  it("start from each source's defaults", () => {
    expect(defaultLive('growth')).toEqual({ source: 'growth', subject: '', days: 30 });
    expect(defaultLive('productivity')).toEqual({ source: 'productivity', weeks: 8 });
    expect(defaultLive('calendar')).toEqual({ source: 'calendar', days: 7 });
  });

  it('are cleaned the way the server cleans them', () => {
    expect(cleanLive({ source: 'growth', subject: 'algebra', days: 90, junk: 1 })).toEqual({ source: 'growth', subject: 'algebra', days: 90 });
    expect(cleanLive({ source: 'growth', days: 45 })).toEqual({ source: 'growth', subject: '', days: 30 });
    expect(cleanLive({ source: 'records', limit: 99 })).toEqual({ source: 'records', category: '', limit: 5 });
    expect(cleanLive({ source: 'weather' })).toEqual({ source: 'goal', goal: '' });
    expect(cleanLive(null)).toEqual({ source: 'goal', goal: '' });
  });

  it('key the same whatever order they were written in', () => {
    expect(liveKey({ source: 'growth', subject: 'a', days: 7 })).toBe(liveKey(cleanLive({ days: 7, subject: 'a', source: 'growth' })));
    expect(liveKey({ source: 'growth', subject: 'a', days: 7 })).not.toBe(liveKey({ source: 'growth', subject: 'a', days: 30 }));
  });
});

describe('the page model', () => {
  it('offers each source in the slash menu', () => {
    const live = matchKinds('goal').find((kind) => kind.type === 'live');
    expect(live?.live).toBe('goal');
    expect(matchKinds('skill tree').some((kind) => kind.live === 'skills')).toBe(true);
    expect(matchKinds('live').filter((kind) => kind.type === 'live')).toHaveLength(6);
  });

  it("keeps a live block's settings and nothing it showed", () => {
    const doc = normalise({
      blocks: [{ id: 'a', type: 'live', text: 'Trend', live: { source: 'growth', subject: 'algebra', days: 90, data: [1] } as never }],
    });
    expect(doc.blocks[0]).toEqual({ id: 'a', type: 'live', text: 'Trend', live: { source: 'growth', subject: 'algebra', days: 90 } });
  });

  it('copies the settings when a block is duplicated', () => {
    const one = { ...liveBlock('records'), id: 'r' };
    const { blocks, copy } = duplicate([one], 'r');
    const made = blocks.find((block) => block.id === copy)!;
    expect(made.live).toEqual(one.live);
    expect(made.live).not.toBe(one.live);
  });
});

describe('words', () => {
  it('sign a change', () => {
    expect(signed(12)).toBe('+12%');
    expect(signed(-4)).toBe('-4%');
    expect(signed(0)).toBe('0%');
    expect(signed(null)).toBe('');
  });

  it('say when, against today', () => {
    const today = new Date(2026, 9, 13, 15, 0);
    expect(whenFrom('2026-10-13', today)).toBe('Today');
    expect(whenFrom('2026-10-14T09:00', today)).toBe('Tomorrow');
    expect(whenFrom('2026-10-20', today)).toBe('In 7 days');
    expect(whenFrom('2026-10-10', today)).toBe('3 days ago');
  });

  it('say how long ago', () => {
    expect(agoFrom(1000, 2000)).toBe('just now');
    expect(agoFrom(1000, 31_000)).toBe('30s ago');
    expect(agoFrom(0, 5000)).toBe('');
    expect(agoFrom(1, 1 + 3 * 60_000)).toBe('3m ago');
  });
});
