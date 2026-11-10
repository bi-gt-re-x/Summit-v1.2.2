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

  it('keeps ambition, right now and capacity apart', () => {
    const audition = { key: 'event:x', title: 'Violin audition', kind: 'event' as const, day: '2026-11-12', days_left: 2 };
    renderWithProviders(
      <PriorityPanel
        decision={{
          ...decision,
          mode: 'balance',
          headline: 'Violin audition is in 2 days, so it comes first today. AMC 10 cutoff gets the rest.',
          lead: audition,
          ambition_top: { goal_id: 'a', title: 'AMC 10 cutoff', priority: 9, gets_time: true },
          allocation: [
            { goal_id: 'commit:event:x', kind: 'commitment', title: 'Violin audition', minutes: 30, step: null, days_left: 2,
              state: 'commitment', percent: 0, waiting: 0, best_use: null, commitment: audition },
            ...decision.allocation,
          ],
          capacity: {
            usual: 90, usual_days: 5, usual_of: 8, usual_label: 'Tuesdays', weekday: true, evidence: 'Preliminary signal',
            done: 0, busy: 120, free: 300, left: 90, total: 90, booked: 150, over: 60,
            asked: [], move: [{ task_id: 't1', title: 'Lab report', minutes: 60, goal_id: '' }], auto: true, line: '',
          },
          goals: decision.goals.map((row) => ({ ...row, ambition: 8, ambition_label: 'High', now: row.gets_time ? 'Today' : 'Can wait', now_why: "It's on track." })),
        }}
        reminders={[{ behavior_id: 'b1', title: 'Impulsive answers on tests', fix: 'Answer-confidence checkpoint', how: '', tasks: ['AMC mock 4'], more: 0 }]}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Ambition' })).toBeInTheDocument();
    expect(screen.getByText(/Matters most to you \(9 of 10\)\. Not first today, but it still gets time\./)).toBeInTheDocument();
    expect(screen.getByText('On your calendar in 2 days, so it comes first.')).toBeInTheDocument();
    expect(screen.getByText('About 1h 30m')).toBeInTheDocument();
    expect(screen.getByText(/Due today: 2h 30m, 1h more than fits/)).toBeInTheDocument();
    expect(screen.getByText(/Move "Lab report" to another day/)).toBeInTheDocument();
    expect(screen.getByText('Get ready: Violin audition')).toBeInTheDocument();
    expect(screen.getByText(/Do “Answer-confidence checkpoint” on "AMC mock 4"/)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Right now' })).toBeInTheDocument();
  });
});
