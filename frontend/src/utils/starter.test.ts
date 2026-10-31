/**
 * Getting started — utils/starter.
 */
import { describe, expect, it } from 'vitest';
import {
  FEATURES,
  daysOfTasks,
  featureForPath,
  isLocked,
  isNewAccount,
  newlyOpened,
  nextUnlock,
  stageOf,
} from './starter';

const joined = '2026-11-10T09:00:00';
const none = { features_open: [] as string[] };
const at = (taskDays: number, prefs = none, createdAt = joined) => ({ createdAt, taskDays, prefs });

describe('the ladder', () => {
  it('opens nothing on day one, however many tasks get done', () => {
    expect(FEATURES.every((feature) => isLocked(at(1), feature.id))).toBe(true);
    expect(stageOf(at(1))).toBe('starter');
  });

  it('opens pages one at a time, with Analytics after a week and Spaces last', () => {
    const order = [...FEATURES].sort((a, b) => a.after - b.after).map((feature) => feature.id);
    expect(order[0]).toBe('tasks');
    expect(order.at(-1)).toBe('spaces');
    expect(new Set(FEATURES.map((feature) => feature.after)).size).toBe(FEATURES.length);
    expect(isLocked(at(6), 'analytics')).toBe(true);
    expect(isLocked(at(7), 'analytics')).toBe(false);
    expect(isLocked(at(9), 'spaces')).toBe(true);
  });

  it('is open once every page is', () => {
    expect(stageOf(at(30))).toBe('open');
    expect(stageOf(at(0, { features_open: FEATURES.map((feature) => feature.id) }))).toBe('open');
  });

  it('keeps a page opened early open', () => {
    expect(isLocked(at(0, { features_open: ['goals'] }), 'goals')).toBe(false);
  });

  it('never locks an account made before getting started existed', () => {
    expect(stageOf(at(0, none, '2026-03-01T10:00:00'))).toBe('open');
    expect(newlyOpened(at(30, none, '2026-03-01T10:00:00'))).toEqual([]);
  });

  it('treats an unreadable sign-up date as an old account', () => {
    expect(isNewAccount('')).toBe(false);
    expect(isNewAccount('not a date')).toBe(false);
    expect(stageOf(at(0, none, ''))).toBe('open');
  });
});

describe('what Mango says', () => {
  it('names the next page and the days it takes', () => {
    expect(nextUnlock(at(0))).toMatchObject({ feature: { id: 'tasks' }, days: 2 });
    expect(nextUnlock(at(2, { features_open: ['tasks'] }))).toMatchObject({ feature: { id: 'goals' }, days: 1 });
    expect(nextUnlock(at(30))).toBeNull();
    expect(daysOfTasks(1)).toBe('1 more day of tasks');
    expect(daysOfTasks(3)).toBe('3 more days of tasks');
  });

  it('announces a page once, when its day comes', () => {
    expect(newlyOpened(at(1))).toEqual([]);
    expect(newlyOpened(at(2)).map((feature) => feature.id)).toEqual(['tasks']);
    expect(newlyOpened(at(3, { features_open: ['tasks'] })).map((feature) => feature.id)).toEqual(['goals']);
  });
});

describe('which page is which', () => {
  it('leaves the three starter pages and Settings alone', () => {
    for (const path of ['/dashboard', '/calendar', '/calendar/week', '/timer', '/settings', '/settings/profile']) {
      expect(featureForPath(path)).toBeUndefined();
    }
  });

  it('finds the feature behind every advanced path', () => {
    expect(featureForPath('/recommendations')?.id).toBe('analytics');
    expect(featureForPath('/analytics/subject/math')?.id).toBe('analytics');
    expect(featureForPath('/tasks')?.id).toBe('tasks');
    expect(featureForPath('/goals')?.id).toBe('goals');
    expect(featureForPath('/skill-trees')?.id).toBe('skill-tree');
    expect(featureForPath('/notes')?.id).toBe('notes');
    expect(featureForPath('/achievements/badges')?.id).toBe('achievements');
    expect(featureForPath('/spaces/2')?.id).toBe('spaces');
    expect(featureForPath('/team/1')?.id).toBe('spaces');
  });

  it('does not mistake a longer path for a feature by its prefix', () => {
    expect(featureForPath('/tasksmith')).toBeUndefined();
  });
});
