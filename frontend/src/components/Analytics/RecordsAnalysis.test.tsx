/**
 * Records on Analytics: the Overview breakdown and the Growth panels lay out
 * what /api/records/analysis worked out, and say what's missing when it's
 * nothing.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import type { AnalysedRecord, RecordAnalysis } from '@/services/records';
import { RecordsBreakdownPanel, RecordsGrowthSection, type RecordsRead } from './RecordsAnalysis';

function record(over: Partial<AnalysedRecord> = {}): AnalysedRecord {
  return {
    name: 'AMC 8', category: 'Competitive Math', unit: 'points', target: 25, direction: 'higher',
    subject: 'mathematics', subject_name: 'Mathematics', tree: 'competition-math',
    tree_label: 'Competition Mathematics', topic: '', topic_label: '', context: 'amc8',
    context_label: 'AMC 8', how: 'name', first: 18, first_on: '2026-03-02', best: 25,
    best_on: '2026-09-12', latest: 25, latest_on: '2026-09-12', gain: 7, percent: 38.9, entries: 6,
    days_to_best: 194, days_since_best: 47, after_best: 0, rate_per_month: 1.1,
    trend: { word: 'improving', early: false, basis: 5 }, steps: [],
    work: { basis: 'context', climb_tasks: 12, climb_seconds: 50400, since_tasks: 2, since_seconds: 7200,
            window_tasks: 4, window_seconds: 14400, seconds_per_unit: 7200 },
    window: { logged: 1, new_bests: 1, previous_bests: 3, gain: 1, started_in_window: false, previous_gain: 5 },
    goals: [{ id: 'g1', title: 'Qualify for AIME', by: ['tree'], score: 2, progress: null, days_left: 95 }],
    milestones: [],
    ...over,
  };
}

function analysis(over: Partial<RecordAnalysis> = {}): RecordAnalysis {
  return {
    days: 90,
    since: '2026-08-01',
    summary: { records: 2, with_history: 2, improving: 2, not_yet: 0, new_bests: 3, previous_bests: 1,
               logged: 4, median_percent: 41, stalled: 1, tied_to_goals: 2 },
    by_subject: [
      { key: 'mathematics', label: 'Mathematics', inferred: true, records: 1, improving: 1, new_bests: 1,
        median_percent: 38.9, window_seconds: 14400, top: { name: 'AMC 8', percent: 38.9, gain: '+7' }, names: ['AMC 8'] },
      { key: 'category:fitness', label: 'Fitness', inferred: false, records: 1, improving: 1, new_bests: 2,
        median_percent: 60, window_seconds: 0, top: { name: 'Pull-ups', percent: 60, gain: '+3' }, names: ['Pull-ups'] },
    ],
    records: [
      record(),
      record({
        name: 'Codeforces rating', unit: 'rating', target: 0, subject_name: 'Computer Science',
        context_label: 'Codeforces', tree_label: 'Competitive Programming', first: 800, best: 1150,
        gain: 350, goals: [{ id: 'g2', title: 'Reach Codeforces 1300', by: ['contest'], score: 3,
                             progress: { target: 1300, percent: 70, met: false }, days_left: 123 }],
      }),
    ],
    reads: [
      { id: 'a', kind: 'fresh', record: 'AMC 8', tone: 'good', title: 'New best on AMC 8: 25 / 25', detail: 'x', weight: 3 },
      { id: 'b', kind: 'climb', record: 'AMC 8', tone: 'good', title: 'AMC 8: +7 since your first entry', detail: 'y', weight: 2.9 },
      { id: 'c', kind: 'stalled', record: 'Mile run', tone: 'bad', title: "Mile run hasn't moved in 8 weeks", detail: 'z', weight: 2 },
    ],
    ...over,
  };
}

const read = (data: RecordAnalysis | null): RecordsRead => ({
  data, error: null, loading: false, refreshing: false, reload: () => {}, mutate: () => {},
});

describe('records on Overview', () => {
  it('breaks the records down by the subject they were read as', () => {
    renderWithProviders(<RecordsBreakdownPanel read={read(analysis())} />, { route: '/analytics' });
    expect(screen.getByText('Records and improvement')).toBeInTheDocument();
    expect(screen.getByText('Mathematics')).toBeInTheDocument();
    // A record that filed nowhere is grouped by its own category, and says so.
    expect(screen.getByText('Fitness')).toBeInTheDocument();
    expect(screen.getByText('your category')).toBeInTheDocument();
    expect(screen.getByText(/\+2 on the 90 days before/)).toBeInTheDocument();
  });

  it('leads its findings with a different record each before repeating one', () => {
    renderWithProviders(<RecordsBreakdownPanel read={read(analysis())} />, { route: '/analytics' });
    const titles = screen.getAllByText(/New best on AMC 8|AMC 8: \+7|Mile run hasn't moved/).map((el) => el.textContent);
    expect(titles[0]).toMatch(/New best on AMC 8/);
    expect(titles[1]).toMatch(/Mile run/);
  });

  it('points to Achievements when there are no records', () => {
    const empty = analysis({
      summary: { records: 0, with_history: 0, improving: 0, not_yet: 0, new_bests: 0, previous_bests: 0,
                 logged: 0, median_percent: null, stalled: 0, tied_to_goals: 0 },
      by_subject: [], records: [], reads: [],
    });
    renderWithProviders(<RecordsBreakdownPanel read={read(empty)} />, { route: '/analytics' });
    expect(screen.getByText(/No records yet/)).toBeInTheDocument();
  });
});

describe('records on Growth', () => {
  it('measures a record against the goal that names it', () => {
    renderWithProviders(<RecordsGrowthSection read={read(analysis())} />, { route: '/analytics/growth' });
    expect(screen.getByText('Reach Codeforces 1300')).toBeInTheDocument();
    expect(screen.getByText(/70% of the way to 1,300 rating/)).toBeInTheDocument();
    // And says what it read each record as, so the inference is visible.
    expect(screen.getAllByText(/Read as AMC 8 · Competition Mathematics · Mathematics/).length).toBeGreaterThan(0);
  });

  it('shows what the work bought, per point', () => {
    renderWithProviders(<RecordsGrowthSection read={read(analysis())} />, { route: '/analytics/growth' });
    expect(screen.getAllByText(/14h over 12 tasks · about 2h per point/).length).toBeGreaterThan(0);
  });
});
