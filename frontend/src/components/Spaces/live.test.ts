/**
 * A live block's settings and words — components/Spaces/live — and how the
 * page model keeps one and offers it (./blocks).
 */
import { describe, expect, it } from 'vitest';
import { duplicate, liveBlock, matchKinds, normalise, pickable, slashRows } from './blocks';
import { agoFrom, amount, cleanLive, defaultLive, hourLabel, liveKey, readKey, signed, whenFrom } from './live';

describe('settings', () => {
  it("start from each source's defaults", () => {
    expect(defaultLive('growth')).toEqual({ source: 'growth', view: 'area', metric: 'xp', subject: '', days: 30 });
    expect(defaultLive('productivity')).toEqual({ source: 'productivity', view: 'bars', metric: 'xp', weeks: 8 });
    expect(defaultLive('calendar')).toEqual({ source: 'calendar', view: 'list', days: 7 });
    expect(defaultLive('heatmap')).toEqual({ source: 'heatmap', view: 'grid', metric: 'xp', weeks: 26 });
    expect(defaultLive('goals')).toEqual({ source: 'goals', view: 'list', status: 'active' });
  });

  it('are cleaned the way the server cleans them', () => {
    expect(cleanLive({ source: 'growth', subject: 'algebra', days: 90, junk: 1 })).toEqual({ source: 'growth', view: 'area', metric: 'xp', subject: 'algebra', days: 90 });
    expect(cleanLive({ source: 'growth', view: 'pie', metric: 'focus', days: 45 })).toEqual({ source: 'growth', view: 'area', metric: 'xp', subject: '', days: 30 });
    expect(cleanLive({ source: 'growth', view: 'cumulative', metric: 'tasks' })).toMatchObject({ view: 'cumulative', metric: 'tasks' });
    expect(cleanLive({ source: 'records', limit: 99 })).toEqual({ source: 'records', view: 'list', category: '', limit: 5 });
    expect(cleanLive({ source: 'weather' })).toEqual({ source: 'goal', view: 'card', goal: '' });
    expect(cleanLive({ source: 'rhythm', days: 365, view: 'grid' })).toEqual({ source: 'rhythm', view: 'grid', metric: 'tasks', days: 365 });
  });

  it('key the same whatever order they were written in', () => {
    const a = cleanLive({ source: 'growth', subject: 'a', days: 7 });
    expect(liveKey(a)).toBe(liveKey(cleanLive({ days: 7, subject: 'a', source: 'growth' })));
    expect(liveKey(a)).not.toBe(liveKey(cleanLive({ ...a, days: 30 })));
  });

  it("don't need a new read for a new style, only for a new measure", () => {
    const a = cleanLive({ source: 'growth' });
    expect(readKey({ ...a, view: 'bars' })).toBe(readKey(a));
    expect(readKey({ ...a, metric: 'tasks' })).not.toBe(readKey(a));
  });
});

describe('the slash menu', () => {
  it('folds Analytics and Goals & records into one row each until opened', () => {
    const rows = slashRows('');
    const heads = rows.filter((row) => row.row === 'head').map((row) => row.row === 'head' && [row.label, row.open]);
    expect(heads).toEqual([
      ['Analytics', false],
      ['Goals & records', false],
      ['Basic blocks', true],
      ['Layout', true],
      ['Charts you draw', true],
      ['Shapes', true],
    ]);
    expect(rows.some((row) => row.row === 'kind' && row.kind.type === 'live')).toBe(false);
  });

  it('shows what is in a section once it is opened', () => {
    const rows = slashRows('', new Set(['analytics']));
    const live = rows.filter((row) => row.row === 'kind' && row.kind.type === 'live').map((row) => row.row === 'kind' && row.kind.live);
    expect(live).toEqual(['productivity', 'growth', 'skills', 'heatmap', 'rhythm', 'subjects']);
    // The folded heading itself can be landed on with the arrows.
    expect(pickable(rows).some((row) => row.row === 'head' && row.group === 'analytics')).toBe(true);
    expect(pickable(rows).some((row) => row.row === 'head' && row.group === 'basic')).toBe(false);
  });

  it('opens any section with a match when something is typed', () => {
    const rows = slashRows('heat');
    expect(rows[0]).toMatchObject({ row: 'head', group: 'analytics', open: true });
    expect(rows[1]).toMatchObject({ row: 'kind', kind: { live: 'heatmap' } });
    expect(slashRows('goal').some((row) => row.row === 'kind' && row.kind.live === 'goals')).toBe(true);
  });

  it('finds a container', () => {
    expect(matchKinds('box')[0]).toMatchObject({ type: 'container', group: 'layout' });
  });
});

describe('the page model', () => {
  it("keeps a live block's settings and nothing it showed", () => {
    const doc = normalise({
      blocks: [{ id: 'a', type: 'live', text: 'Trend', live: { source: 'growth', subject: 'algebra', days: 90, data: [1] } as never }],
    });
    expect(doc.blocks[0]).toEqual({ id: 'a', type: 'live', text: 'Trend', live: { source: 'growth', view: 'area', metric: 'xp', subject: 'algebra', days: 90 } });
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
    expect(agoFrom(1, 1 + 3 * 60_000)).toBe('3m ago');
  });

  it('name hours and amounts', () => {
    expect([hourLabel(0), hourLabel(9), hourLabel(12), hourLabel(17)]).toEqual(['12am', '9am', '12pm', '5pm']);
    expect([amount(120, 'xp'), amount(1, 'tasks'), amount(4, 'tasks'), amount(95, 'focus')]).toEqual(['120 XP', '1 task', '4 tasks', '95 min']);
  });
});
