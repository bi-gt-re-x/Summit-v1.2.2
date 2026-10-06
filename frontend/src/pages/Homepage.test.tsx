/**
 * The landing page: what a stranger and an account each see, the live demo,
 * and the markup the hidden chain depends on.
 */
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Homepage, { SECTIONS } from './Homepage';
import { renderWithProviders } from '@/test/render';
import { PLANS, STUDENT } from '@/components/Landing';

vi.mock('@/hooks/useSecretScripts', () => ({ useSecretScripts: () => {} }));

function draw(signedIn: boolean) {
  return renderWithProviders(<Homepage />, {
    route: '/home',
    auth: signedIn
      ? { status: 'signed-in', username: 'Alpha' }
      : { status: 'signed-out', username: null },
  });
}

afterEach(() => vi.useRealTimers());

describe('the landing page', () => {
  it('runs top to bottom in the order of the design', () => {
    draw(false);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'This is the app, not a screenshot',
      'Everything you need to grow',
      'Your progress, in numbers',
      'See where your time goes',
      'Plan. Focus. Finish.',
      'Small steps. Big results.',
      'Track what matters',
      'Four decisions. A better you.',
      'Simple, transparent pricing',
      'Modern technology',
      'Ready to build better habits?',
    ]);
  });

  it('links its header to its own sections, and every one exists', () => {
    const { container } = draw(false);
    for (const [id, label] of SECTIONS) {
      const nav = screen.getByRole('navigation', { name: 'On this page' });
      expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('href', `#${id}`);
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it('offers a stranger an account, and an account its dashboard', () => {
    draw(false);
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Create a free account/ })[0]).toHaveAttribute(
      'href',
      '/login?auth=create',
    );
  });

  it('greets an account by name and sends it to its own pages', () => {
    draw(true);
    expect(screen.getByText('Hello, Alpha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log Out' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Go to Dashboard/ })[0]).toHaveAttribute('href', '/dashboard');
    expect(screen.getAllByRole('link', { name: /Open Calendar/ })[0]).toHaveAttribute('href', '/calendar');
  });

  it('shows the same student everywhere', () => {
    draw(false);
    expect(screen.getAllByText(STUDENT.xp.toLocaleString('en-US')).length).toBeGreaterThanOrEqual(2);
    const average = Math.round(
      STUDENT.pillars.reduce((sum, pillar) => sum + pillar.value, 0) / STUDENT.pillars.length,
    );
    expect(Math.abs(average - STUDENT.growth)).toBeLessThanOrEqual(1);
  });

  it('marks today on its calendar', () => {
    const { container } = draw(false);
    const today = container.querySelector('.ld-day.is-today');
    expect(today?.textContent).toBe(String(new Date().getDate()));
  });

  it('lists three plans, and says the paid ones are not open yet', () => {
    draw(false);
    expect(PLANS.map((plan) => plan.name)).toEqual(['Free', 'Pro', 'Team']);
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(screen.getByRole('status')).toHaveTextContent('Pro is not open yet');
  });

  it('keeps the markup the hidden chain listens on', () => {
    const { container } = draw(false);
    expect(container.querySelector('.home-main > .lp')).not.toBeNull();
    expect(container.querySelector('.lp-quote')).not.toBeNull();
    expect(container.querySelector('.lp-preview-rating .lp-radar')).not.toBeNull();
    expect(container.querySelector('header.lp-header')).not.toBeNull();
    expect(container.querySelector('footer.footer')).not.toBeNull();
  });

  it('shows everything when it cannot animate, rather than hiding it', () => {
    const { container } = draw(false);
    // No IntersectionObserver in the test environment: nothing is armed.
    expect(container.querySelector('.ld-armed')).toBeNull();
  });

  it('forwards an old account link on to the sign-in page', () => {
    renderWithProviders(<Homepage />, {
      route: '/home?auth=login',
      auth: { status: 'signed-out', username: null },
    });
    expect(screen.queryByRole('heading', { name: /Finish the work/ })).toBeNull();
  });
});

describe('the live demo', () => {
  it('ticks a task off, and the count, the bar and the XP move together', () => {
    draw(false);
    const tick = screen.getByRole('button', { name: /Today's progress: 6 of 8/ });
    expect(tick).toHaveTextContent('6/8');
    fireEvent.click(tick);
    const after = screen.getByRole('button', { name: /Today's progress: 7 of 8/ });
    expect(after).toHaveTextContent('7/8');
    expect(screen.getByText('+225')).toBeInTheDocument();
  });

  it('stops at eight', () => {
    draw(false);
    for (let n = 0; n < 5; n++) fireEvent.click(screen.getByRole('button', { name: /Today's progress/ }));
    const done = screen.getByRole('button', { name: /Today's progress: 8 of 8/ });
    expect(done).toBeDisabled();
    expect(done).toHaveTextContent('All done for today');
  });

  it('runs the focus timer', () => {
    vi.useFakeTimers();
    draw(false);
    expect(screen.getByText('25:00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start the timer' }));
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByText('24:57')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause the timer' }));
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByText('24:57')).toBeInTheDocument();
  });
});
