import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { MoodVsOutput } from '@/services/said';
import { SayVsDo, sayVsDoHasNews } from './SayVsDo';

function mood(over: Partial<MoodVsOutput> = {}): MoodVsOutput {
  return {
    window_days: 180, logged_days: 20, mood_days: 18, said_days: 10, read_days: 8, today: null,
    usual: { tasks: 5, focus_min: 60, days: 90 },
    bands: [
      { key: 'rough', label: 'Rough days', days: 6, tasks_avg: 2, focus_avg: 0, execution_avg: null, vs_usual: -60, enough: true },
      { key: 'okay', label: 'Okay days', days: 2, tasks_avg: 4, focus_avg: 0, execution_avg: null, vs_usual: -20, enough: false },
      { key: 'good', label: 'Good days', days: 10, tasks_avg: 7, focus_avg: 90, execution_avg: 4, vs_usual: 40, enough: true },
    ],
    feelings: [
      { kind: 'tired', label: 'Tired', days: 5, enough: true, other_days: 13, tasks_avg: 2, other_avg: 5,
        change: -60, next_day_avg: 4, next_change: -20, words: ['exhausted'], confidence: 'early' },
      { kind: 'stressed', label: 'Stressed', days: 1, enough: false, need: 3 },
    ],
    checks: [{ day: '2026-10-14', side: 'low', quote: 'Got nothing done today.', tasks: 7, focus_min: 0, usual: 5, verdict: 'harsher' }],
    harsher: 1, energy: [], energy_ready: false, recovery: { days: 2, lows: 6 }, weekdays: [],
    series: [{ day: '2026-10-17', mood: 1, source: 'said', tasks: 6, focus_min: 30 }],
    min_days: 3, small_change: 15,
    headline: { text: 'On good days you finish 7 tasks. On rough days, just 2.', tone: 'insight', confidence: 'pattern' },
    ...over,
  };
}

const draw = (data: MoodVsOutput | null) =>
  render(
    <MemoryRouter>
      <SayVsDo mood={data} said={null} reloadSaid={() => undefined} />
    </MemoryRouter>,
  );

describe('What you say vs. what you do', () => {
  it('leads with the headline and its confidence', () => {
    draw(mood());
    expect(screen.getByText('On good days you finish 7 tasks. On rough days, just 2.')).toBeInTheDocument();
    expect(screen.getByText(/Pattern · 18 days/)).toBeInTheDocument();
    expect(screen.getByText(/10 you tapped, 8 read from your words/)).toBeInTheDocument();
  });

  it('compares each band with the usual day, and says when a band is short', () => {
    draw(mood());
    expect(screen.getByText(/60% under your usual/)).toBeInTheDocument();
    expect(screen.getByText(/1 more to compare/)).toBeInTheDocument();
  });

  it('shows feelings that day and the day after, and what is still collecting', () => {
    draw(mood());
    expect(screen.getByText(/That day: 60% fewer tasks/)).toBeInTheDocument();
    expect(screen.getByText(/The day after: 20% under your usual/)).toBeInTheDocument();
    expect(screen.getByText(/stressed \(1 of 3 days\)/)).toBeInTheDocument();
    expect(screen.getByText(/back to your usual in/)).toBeInTheDocument();
  });

  it('checks how it felt against how it went', () => {
    draw(mood());
    expect(screen.getByText('"Got nothing done today."')).toBeInTheDocument();
    expect(screen.getByText(/You finished 7 tasks, more than your usual 5/)).toBeInTheDocument();
    expect(screen.getByText('Better than it felt')).toBeInTheDocument();
  });

  it('invites a start when nothing is logged', () => {
    draw(mood({ logged_days: 0 }));
    expect(screen.getByText('See how your mood and your work move together')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the Log' })).toHaveAttribute('href', '/log');
  });

  it('opens only when it has something to say', () => {
    expect(sayVsDoHasNews(mood(), null)).toBe(true);
    expect(sayVsDoHasNews(mood({ headline: { text: 'x', tone: 'building', confidence: 'early' } }), null)).toBe(false);
    expect(sayVsDoHasNews(null, null)).toBe(false);
  });
});
