import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { NamedRow, SaidVsDid as Reading } from '@/services/said';
import { SaidVsDid } from './SaidVsDid';

function row(name: string, over: Partial<NamedRow> = {}): NamedRow {
  return {
    subject: name.toLowerCase(), name, tasks: 0, share: 0, rank: null, of: 0, last_on: null,
    verdict: 'not_yet', kind: 'doing', mentions: 1, lines: [{ text: `${name} line`, source: 'About you' }],
    text: `${name} line`, source: 'About you', resources: [], practice: false, ...over,
  };
}

function reading(over: Partial<Reading> = {}): Reading {
  const names = ['Mathematics', 'Computer Science', 'Violin', 'Programming', 'Gym', 'Geometry', 'Coursework'];
  return {
    days: 30, month_tasks: 6, total_tasks: 6, stage: 'new', top: 5, best_day: null,
    named: names.map((name, at) => row(name, at === 0
      ? { mentions: 4, lines: [{ text: 'Mathematics and problem-solving', source: 'About you' },
          { text: 'MathCounts prep', source: 'About you' }], text: 'Mathematics and problem-solving' }
      : at === 3 ? { tasks: 1, share: 17, verdict: 'started' } : {})),
    aims: [], activities: [], timing: [], topics: [],
    unfiled: { total: 0, groups: [] },
    suggestions: [
      { key: 'narrow', title: 'Pick two for the next two weeks', body: 'You named 7 areas and have 6 tasks in 30 days.', action: null },
      { key: 'start-top', title: 'Get Mathematics on the record', body: 'A task like "Alcumus: 10 problems".', action: { label: 'Add a task', to: '/tasks' } },
    ],
    ...over,
  };
}

const draw = (data: Reading) =>
  render(
    <MemoryRouter>
      <SaidVsDid data={data} reload={() => undefined} />
    </MemoryRouter>,
  );

describe('Your goals and routines', () => {
  it('is gentle with a new account', () => {
    draw(reading());
    expect(screen.getByText("You're just getting started.")).toBeInTheDocument();
    expect(screen.getAllByText('Not on record yet').length).toBeGreaterThan(0);
    expect(screen.queryByText('Nothing yet')).not.toBeInTheDocument();
    expect(screen.getByText('Started')).toBeInTheDocument();
  });

  it('shows the top five and folds the rest', () => {
    draw(reading());
    expect(screen.getAllByRole('listitem').filter((li) => li.classList.contains('ax-said-item'))).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: /Show 2 more you named/ }));
    expect(screen.getByText('Coursework')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show the top 5/ })).toBeInTheDocument();
  });

  it("opens a row's other lines", () => {
    draw(reading());
    expect(screen.getByText('named 4 times')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+1 more' }));
    expect(screen.getByText(/MathCounts prep/)).toBeInTheDocument();
  });

  it('lists the suggestions under the list, with their actions', () => {
    draw(reading());
    expect(screen.getByText('What would help')).toBeInTheDocument();
    expect(screen.getByText('Get Mathematics on the record')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Add a task/ })).toHaveAttribute('href', '/tasks');
  });

  it('drops the getting-started note once the account is settled', () => {
    draw(reading({ stage: 'settled' }));
    expect(screen.queryByText("You're just getting started.")).not.toBeInTheDocument();
  });
});
