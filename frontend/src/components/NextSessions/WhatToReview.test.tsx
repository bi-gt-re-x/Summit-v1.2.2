/**
 * What to review, above Next sessions on the Recommendations tab —
 * components/NextSessions/WhatToReview.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { WhatToReviewPanel } from './WhatToReview';
import * as analytics from '@/services/analytics';

const step = (n: number) => ({
  id: `v${n}`,
  title: `Review ${n}`,
  focus: 'Mathematics',
  type: 'review' as const,
  difficulty: 3,
  minutes: 30,
  reason: `Reason ${n}`,
  signal: '',
  drills: [],
  state: 'open' as const,
  task: null,
});

const SUBJECTS = [
  { id: 'mathematics', name: 'Mathematics', count: 9 },
  { id: 'music', name: 'Music', count: 4 },
];

let due = 5;
vi.mock('@/services/analytics', async (original) => {
  const real = await original<typeof import('@/services/analytics')>();
  return {
    ...real,
    reviewSessions: vi.fn(async (subjectId = '') => ({
      success: true as const,
      subject: subjectId ? 'Review: Mathematics' : 'Review: all subjects',
      subject_id: subjectId,
      steps: [],
      subjects: SUBJECTS,
      available: true,
      due,
    })),
    suggestReviewSessions: vi.fn(async (subjectId = '') => ({
      success: true as const,
      subject: subjectId ? 'Review: Mathematics' : 'Review: all subjects',
      subject_id: subjectId,
      steps: [step(1), step(2), step(3)],
    })),
  };
});

beforeEach(() => {
  due = 5;
  vi.mocked(analytics.reviewSessions).mockClear();
  vi.mocked(analytics.suggestReviewSessions).mockClear();
});

function show() {
  renderWithProviders(<WhatToReviewPanel />, { auth: { username: 'alpha' }, userData: { mutate: vi.fn() } });
}

describe('What to review', () => {
  it('suggests three review sessions across every subject', async () => {
    show();
    expect(await screen.findByText(/5 pieces of work are due/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Suggest 3 review sessions' }));
    await screen.findByText('Review 1');
    expect(analytics.suggestReviewSessions).toHaveBeenCalledWith('');
    expect(screen.getByRole('button', { name: 'Plan all 3' })).toBeInTheDocument();
  });

  it('picks one subject from the pills', async () => {
    show();
    const pill = await screen.findByRole('radio', { name: 'Mathematics' });
    expect(screen.getByRole('radio', { name: 'All subjects' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(pill);
    await waitFor(() => expect(analytics.reviewSessions).toHaveBeenLastCalledWith('mathematics'));
    expect(pill).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest 3 review sessions' }));
    await waitFor(() => expect(analytics.suggestReviewSessions).toHaveBeenCalledWith('mathematics'));
  });

  it("won't ask the model when nothing is due", async () => {
    due = 0;
    show();
    expect(await screen.findByText(/Nothing's due for another look/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suggest 3 review sessions' })).toBeDisabled();
  });
});
