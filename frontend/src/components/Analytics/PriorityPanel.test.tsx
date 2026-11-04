/**
 * The panel lays out what the server decided. The rules are in tests/test_priority.py.
 */
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { PriorityPanel } from './PriorityPanel';
import type { PriorityDecision } from '@/services/next';

const decision: PriorityDecision = {
  mode: 'crunch',
  headline: "AMC 10 cutoff gets your time. It's 3 days away.",
  warning: null,
  focus: { goal_id: 'a', title: 'AMC 10 cutoff', days_left: 3, percent: 75, next: 'Mock 4', state: 'behind', subject: 'mathematics' },
  until: 'after Nov 6',
  allocation: [{ goal_id: 'a', title: 'AMC 10 cutoff', minutes: 60, step: 'Mock 4', days_left: 3, state: 'behind', percent: 75, waiting: 0, best_use: 'Do 10 counting problems' }],
  answers: [
    { key: 'matters', question: 'What matters most?', answer: 'AMC 10 cutoff: priority 8 of 10.' },
    { key: 'urgent', question: "What's time-sensitive?", answer: 'AMC 10 cutoff: 3 days left.' },
    { key: 'return', question: 'What gives the most back?', answer: 'A session has moved it about 2%.' },
    { key: 'cost', question: 'What does it cost?', answer: "This time can't also go to the CS project." },
  ],
  not_now: [
    { key: 'weak', title: 'Computer Science', why: "Your ratings are lowest here, but AMC 10 cutoff doesn't depend on it." },
    ...['one', 'two', 'three', 'four'].map((key) => ({ key, title: `Row ${key}`, why: 'Later.' })),
  ],
  counters: 0,
  goals: [
    { goal_id: 'a', title: 'AMC 10 cutoff', days_left: 3, state: 'behind', percent: 75, priority: 8, gets_time: true, needs: 5, pace: 2, gain: 2, gain_evidence: 'Emerging pattern', matters: 'High' },
    { goal_id: 'b', title: 'CS project', days_left: 400, state: 'on_track', percent: 40, priority: 8, gets_time: false, needs: 1, pace: 2, gain: null, gain_evidence: null, matters: 'High' },
  ],
};

describe('PriorityPanel', () => {
  it('says where the time goes and answers the questions', () => {
    renderWithProviders(<PriorityPanel decision={decision} />);
    expect(screen.getByText("AMC 10 cutoff gets your time. It's 3 days away.")).toBeInTheDocument();
    expect(screen.getByText('60m')).toBeInTheDocument();
    expect(screen.getByText('Next step: Mock 4')).toBeInTheDocument();
    for (const question of ['What matters most?', "What's time-sensitive?", 'What gives the most back?', 'What does it cost?']) {
      expect(screen.getByText(question)).toBeInTheDocument();
    }
  });

  it('names what to leave alone, and why', () => {
    renderWithProviders(<PriorityPanel decision={decision} />);
    expect(screen.getByRole('heading', { name: 'Leave these alone for now' })).toBeInTheDocument();
    expect(screen.getByText('Computer Science')).toBeInTheDocument();
    expect(screen.getByText(/doesn't depend on it/)).toBeInTheDocument();
    expect(screen.getByText('1 more you can leave')).toBeInTheDocument();
  });

  it('prints no score, and says unknown when a return is unknown', () => {
    renderWithProviders(<PriorityPanel decision={decision} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.queryByText(/score/i)).toBeNull();
  });

  it('asks for a real goal when nothing can lead', () => {
    renderWithProviders(
      <PriorityPanel decision={{ ...decision, mode: 'none', note: 'None of your goals has a number or checkpoints.', goals: [], not_now: [], allocation: [], answers: [] }} />,
    );
    expect(screen.getByText(/number or checkpoints/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a goal' })).toHaveAttribute('href', '/goals');
  });
});
