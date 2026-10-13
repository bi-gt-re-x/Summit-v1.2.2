/**
 * Every live source in every style — components/Spaces/LiveViews — drawn from
 * data shaped the way backend/tracking/live.py sends it.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { View } from './LiveViews';
import { VIEWS, cleanLive, type LiveData, type LiveSource } from './live';

const today = new Date().toISOString().slice(0, 10);
const pace = { started: '2026-09-01', per_day: 1.2, needed_per_day: 0.8, finish: '2026-11-01', on_pace: true, margin_days: 9 };

const DATA: Record<LiveSource, unknown> = {
  goal: {
    empty: false,
    goal: { id: 'g', title: 'Make AIME', measure: 'tasks', status: 'active', progress: 42, current: 5, target: 12, unit: 'tasks', deadline: '2026-11-10', days_left: 28, health: { state: 'on-track', label: 'On track', reason: null } },
    milestones: [
      { id: 'm1', title: 'Number theory', status: 'done', date: '2026-10-01', steps_done: 3, steps: 3 },
      { id: 'm2', title: 'Mock test', status: 'pending', date: '2026-10-20', steps_done: 1, steps: 4 },
    ],
    next_milestone: { id: 'm2', title: 'Mock test', status: 'pending', date: '2026-10-20', steps_done: 1, steps: 4 },
    recent: [{ title: 'Set 4', at: `${today}T10:00:00`, xp: 20 }],
    done_this_week: 2,
    pace,
  },
  goals: {
    goals: [
      { id: 'a', title: 'Make AIME', progress: 42, done: false, deadline: '2026-11-10', days_left: 28, health: 'on-track', health_label: 'On track', pace },
      { id: 'b', title: 'Read 10 books', progress: 100, done: true, deadline: null, days_left: null, health: null, health_label: null, pace: { ...pace, on_pace: true } },
    ],
    total: 2, done: 1, on_pace: 1, off_pace: 0, average: 71,
  },
  records: {
    categories: ['Math'],
    bests: [{ name: 'AMC 10', category: 'Math', unit: 'points', direction: 'higher', best: 111, best_on: '2026-10-01', first: 72, latest: 111, improvement: 39, entries: 4, history: [{ value: 72, on: null }, { value: 111, on: null }] }],
    total: 1,
    latest: [],
  },
  record: {
    empty: false, name: 'AMC 10', names: ['AMC 10'], unit: 'points', direction: 'higher',
    history: [{ value: 72, on: '2026-01-01', best: true }, { value: 90, on: '2026-03-01', best: true }, { value: 84, on: '2026-05-01', best: false }],
    bests: [{ value: 72, on: '2026-01-01' }, { value: 90, on: '2026-03-01' }],
    best: 90, first: 72, latest: 84, improvement: 18, improvement_pct: 25, average_gain: 6, trend_per_entry: 6, days_since_best: 40, target: 120, to_target: 38,
  },
  calendar: {
    days: 7, start: today, end: today, total: 2, overdue: 1,
    items: [
      { kind: 'task', id: 't', title: 'Missed set', date: today, time: '09:00', subject: null, overdue: true },
      { kind: 'deadline', id: 'g', title: 'Make AIME', date: today, time: null, subject: null, overdue: false },
    ],
  },
  productivity: {
    metric: 'xp',
    weeks: [10, 30, 20, 50].map((value, i) => ({ start: `2026-09-${10 + i * 7}`, end: '', xp: value, tasks: 1, focus_minutes: 0, active_days: 2, value })),
    days: Array.from({ length: 28 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, xp: i, active: i % 2 === 0, value: i, avg7: i })),
    consistency: 50, active_days: 14, streak: 3, change: 150, trend_per_week: 11, trend_line: [10, 21, 32, 43], forecast: 54,
    best_week: { start: '2026-10-01', value: 50 }, average: 27.5, steadiness: 40, per_active_day: 13.5,
  },
  growth: {
    subject: 'mathematics', name: 'Mathematics', metric: 'xp', days: 30, start: '2026-09-14', step: 1,
    now: { xp: 120, tasks: 4, focus_minutes: 0, active_days: 3 }, before: { xp: 60, tasks: 2, focus_minutes: 0, active_days: 2 },
    change: { xp: 100, tasks: 100, focus_minutes: null, active_days: 50 },
    points: Array.from({ length: 30 }, (_, i) => ({ date: '2026-09-14', xp: i, tasks: 1, value: i, total: i * 2, avg: i })),
    trend_per_step: 1, trend_line: [], peak: { date: '2026-10-12', value: 29 }, skills: { attempted: 20, accuracy: 85, attempted_before: 0, accuracy_before: null },
  },
  skills: {
    empty: false, tree: 'mathematics', title: 'Mathematics', done: 1, doing: 1, total: 3, attempted: 20, accuracy: 80,
    nodes: [
      { id: 'a', name: 'Arithmetic', tier: '', level: 4, mastery: 80, accuracy: 90, attempted: 10, last_at: null, state: 'done', requires: [] },
      { id: 'b', name: 'Fractions', tier: '', level: 2, mastery: 40, accuracy: 70, attempted: 10, last_at: null, state: 'doing', requires: [] },
      { id: 'c', name: 'Algebra', tier: '', level: 0, mastery: 0, accuracy: null, attempted: 0, last_at: null, state: 'next', requires: [] },
    ],
  },
  heatmap: {
    weeks: 2, start: '2026-09-28', total: 60, active_days: 3, share_active: 21, longest_run: 2, current_run: 1,
    busiest: { date: '2026-10-01', value: 30 }, per_active_day: 20, best_weekday: 2,
    days: Array.from({ length: 14 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, value: i % 5 ? 0 : 20, level: i % 5 ? 0 : 3 })),
  },
  rhythm: {
    days: 90, total: 6, peak_day: 1, peak_hour: 9, weekend_share: 10, focus_score: 30,
    grid: Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => (h === 9 && d < 3 ? 2 : 0))),
    weekday: [2, 2, 2, 0, 0, 0, 0], hour: Array.from({ length: 24 }, (_, h) => (h === 9 ? 6 : 0)),
    parts: { morning: 100, afternoon: 0, evening: 0, night: 0 },
  },
  subjects: {
    days: 30, total: 100, total_before: 50, subjects: 2, balance: 81, top_share: 60, new: ['Music'], dropped: [],
    rows: [
      { subject: 'mathematics', name: 'Mathematics', value: 60, share: 60, before: 50, change: 20 },
      { subject: 'music', name: 'Music', value: 40, share: 40, before: 0, change: null },
    ],
  },
};

describe('every style of every source', () => {
  for (const source of Object.keys(DATA) as LiveSource[]) {
    for (const view of VIEWS[source]) {
      it(`draws ${source} as ${view}`, () => {
        const { container } = render(<View config={cleanLive({ source, view })} data={DATA[source] as LiveData} />);
        expect(container.textContent?.length).toBeGreaterThan(0);
        expect(container.textContent).not.toMatch(/undefined|NaN/);
      });
    }
  }
});

describe('what the numbers say', () => {
  it('a goal says whether it is on pace and when it lands', () => {
    render(<View config={cleanLive({ source: 'goal' })} data={DATA.goal as LiveData} />);
    expect(screen.getByText('On pace')).toBeInTheDocument();
    expect(screen.getByText(/On pace to finish .*9 days early/)).toBeInTheDocument();
  });

  it('productivity forecasts next week and names the trend', () => {
    render(<View config={cleanLive({ source: 'productivity' })} data={DATA.productivity as LiveData} />);
    expect(screen.getByText('54 XP')).toBeInTheDocument();
    expect(screen.getByText(/Trending up by 11 XP a week/)).toBeInTheDocument();
  });

  it('rhythm names the best day and hour', () => {
    render(<View config={cleanLive({ source: 'rhythm' })} data={DATA.rhythm as LiveData} />);
    expect(screen.getAllByText('Tue').length).toBeGreaterThan(0);
    expect(screen.getByText('9am')).toBeInTheDocument();
    expect(screen.getByText(/100% of it happens in the morning/)).toBeInTheDocument();
  });

  it('a record marks each new best', () => {
    render(<View config={cleanLive({ source: 'record', view: 'steps' })} data={DATA.record as LiveData} />);
    expect(screen.getAllByText('+18')).toHaveLength(2);
    expect(screen.getByText(/Last new best was 40 days ago/)).toBeInTheDocument();
  });

  it('empty sources say so', () => {
    render(<View config={cleanLive({ source: 'record' })} data={{ empty: true } as LiveData} />);
    expect(screen.getByText(/No records yet/)).toBeInTheDocument();
  });
});
