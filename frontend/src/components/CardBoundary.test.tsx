/**
 * One dashboard card that throws stays one broken card: the cards next to it
 * still draw, and the broken one says which it was and offers a retry.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardBoundary } from './ErrorBoundary';

let broken = true;
function Flaky() {
  if (broken) throw new Error('Invalid time value');
  return <p>Goals are back</p>;
}

afterEach(() => {
  vi.restoreAllMocks();
  broken = true;
});

describe('a card that throws', () => {
  it('leaves its neighbors on the page and names itself', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <>
        <CardBoundary label="Streak">
          <p>12 days</p>
        </CardBoundary>
        <CardBoundary label="Goals">
          <Flaky />
        </CardBoundary>
      </>,
    );
    expect(screen.getByText('12 days')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Goals couldn't load.");
  });

  it('draws again when Try again is pressed and the cause is gone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <CardBoundary label="Goals">
        <Flaky />
      </CardBoundary>,
    );
    broken = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Goals are back')).toBeInTheDocument();
  });
});
