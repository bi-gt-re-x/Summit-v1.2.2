/**
 * The panel lays out what the server worked out, and has no total.
 * The rules themselves are pinned in tests/test_measures.py.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { MeasuresPanel } from './Measures';
import * as service from '@/services/measures';
import type { Measure } from '@/services/measures';

const measure = (key: Measure['key'], label: string, extra: Partial<Measure> = {}): Measure => ({
  key,
  label,
  question: `${label}?`,
  evidence: 'Counted',
  figure: '3',
  unit: 'things',
  now: 3,
  before: 5,
  change: 'down from 5',
  lines: [`${label} line`],
  suggests: `This suggests ${label} matters.`,
  ...extra,
});

afterEach(() => vi.restoreAllMocks());

describe('MeasuresPanel', () => {
  it('draws the reading, then the four measures with no total', async () => {
    vi.spyOn(service, 'measures').mockResolvedValue({
      success: true,
      days: 30,
      reading: {
        kind: 'busy',
        headline: "You did a lot, but most of it didn't move your goals.",
        figures: '297 tasks in 30 days.',
        suggests: 'This suggests effort is not the problem.',
        to: '/goals',
        action: 'Open Goals',
      },
      measures: [
        measure('activity', 'Activity', { mix: [{ key: 'study', label: 'Study work', count: 71 }] }),
        measure('output', 'Output'),
        measure('progress', 'Progress'),
        measure('mastery', 'Mastery', { to: '/skill-trees?node=a&check=1', action: 'Take the check' }),
      ],
    } as never);

    renderWithProviders(<MeasuresPanel />);

    expect(await screen.findByText("You did a lot, but most of it didn't move your goals.")).toBeInTheDocument();
    for (const label of ['Activity', 'Output', 'Progress', 'Mastery']) {
      expect(screen.getByRole('heading', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText(/there's no total/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Take the check' })).toHaveAttribute('href', '/skill-trees?node=a&check=1');
    expect(screen.getByRole('link', { name: 'Open Goals' })).toHaveAttribute('href', '/goals');
    expect(screen.getByText('Study work')).toBeInTheDocument();
  });

  it('draws nothing when the read fails, and leaves the tab alone', async () => {
    vi.spyOn(service, 'measures').mockRejectedValue(new Error('offline'));
    const { container } = renderWithProviders(<MeasuresPanel />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector('.ax-mx')).toBeNull();
  });
});
