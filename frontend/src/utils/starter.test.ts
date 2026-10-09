/**
 * Getting started — utils/starter.
 */
import { describe, expect, it } from 'vitest';
import {
  FEATURES,
  STARTER_DAYS,
  STARTER_LEVEL,
  featureForPath,
  isLocked,
  stageOf,
  starterDaysLeft,
} from './starter';

const now = new Date('2026-11-10T12:00:00');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3600_000).toISOString();
const fresh = { starter_done: false, features_open: [] as string[] };

describe('the stage', () => {
  it('starts a new account on the starter pages', () => {
    expect(stageOf({ createdAt: hoursAgo(1), level: 1, prefs: fresh, now })).toBe('starter');
  });

  it('moves on after the starter days', () => {
    expect(stageOf({ createdAt: hoursAgo(STARTER_DAYS * 24 + 1), level: 1, prefs: fresh, now })).toBe('gated');
  });

  it('moves on early at the starter level', () => {
    expect(stageOf({ createdAt: hoursAgo(1), level: STARTER_LEVEL, prefs: fresh, now })).toBe('gated');
  });

  it('moves on early when the reader ends it', () => {
    expect(stageOf({ createdAt: hoursAgo(1), level: 1, prefs: { ...fresh, starter_done: true }, now })).toBe('gated');
  });

  it('never locks an account made before the starter existed', () => {
    expect(stageOf({ createdAt: '2026-03-01T10:00:00', level: 1, prefs: fresh, now })).toBe('open');
  });

  it('treats an unreadable sign-up date as an old account', () => {
    expect(stageOf({ createdAt: '', level: 1, prefs: fresh, now })).toBe('open');
    expect(stageOf({ createdAt: 'not a date', level: 1, prefs: fresh, now })).toBe('open');
  });

  it('is open once every advanced page has been opened', () => {
    const all = { starter_done: false, features_open: FEATURES.map((feature) => feature.id) };
    expect(stageOf({ createdAt: hoursAgo(1), level: 1, prefs: all, now })).toBe('open');
  });
});

describe('locks', () => {
  it('lock what has not been opened, and nothing once open', () => {
    expect(isLocked('starter', 'goals', [])).toBe(true);
    expect(isLocked('gated', 'goals', ['goals'])).toBe(false);
    expect(isLocked('open', 'goals', [])).toBe(false);
  });

  it('count the days left, never below one while they last', () => {
    expect(starterDaysLeft(hoursAgo(1), now)).toBe(STARTER_DAYS);
    expect(starterDaysLeft(hoursAgo(STARTER_DAYS * 24 - 1), now)).toBe(1);
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
