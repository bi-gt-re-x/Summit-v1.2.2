/**
 * The locked cards and the "Early read" label. See ./Upcoming.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { EarlyRead, Upcoming } from './Upcoming';
import { MILESTONES } from './milestones';

const draw = (activeDays: number, skip = 0) =>
  render(
    <MemoryRouter>
      <Upcoming activeDays={activeDays} skip={skip} />
    </MemoryRouter>,
  );

describe('Upcoming', () => {
  it('shows the nearest three, each locked with work days left', () => {
    draw(0);
    MILESTONES.slice(0, 3).forEach((step) => {
      expect(screen.getByText(step.title)).toBeInTheDocument();
    });
    expect(screen.queryByText(MILESTONES[3]!.title)).not.toBeInTheDocument();
    expect(screen.getByText(`${MILESTONES[0]!.need} more work days`)).toBeInTheDocument();
  });

  it('tags every example and hides it from screen readers', () => {
    const { container } = draw(0);
    expect(screen.getAllByText('Example')).toHaveLength(3);
    container.querySelectorAll('.ax-up-dim').forEach((preview) => {
      expect(preview.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('links each card to where it opens', () => {
    draw(0);
    const link = screen.getByText(MILESTONES[2]!.title).closest('a');
    expect(link?.getAttribute('href')).toBe(MILESTONES[2]!.href);
  });

  it('skips what something above already counts down to', () => {
    draw(0, 1);
    expect(screen.queryByText(MILESTONES[0]!.title)).not.toBeInTheDocument();
  });

  it('draws nothing once everything is open', () => {
    const { container } = draw(999);
    expect(container.innerHTML).toBe('');
  });
});

describe('EarlyRead', () => {
  it('says how thin the reading is and when it firms up', () => {
    render(<EarlyRead days={11} solidAt={14} />);
    expect(screen.getByText('Early read')).toBeInTheDocument();
    expect(screen.getByText(/From 11 work days\. It firms up around day 14\./)).toBeInTheDocument();
  });

  it('goes away once the reading is solid', () => {
    const { container } = render(<EarlyRead days={14} solidAt={14} />);
    expect(container.innerHTML).toBe('');
  });
});
