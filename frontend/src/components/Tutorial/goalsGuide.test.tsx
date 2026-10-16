/**
 * The Goals guide walks the reader through the real wizard, one step per page.
 *
 * Each wizard step waits on the page after it (`until`), and the wizard says
 * which page it is on (`data-stage`). If those drift apart the guide would sit
 * on a page forever or race ahead, and nothing else would notice, so this
 * drives the wizard page by page and checks each step's `until` turns up
 * exactly when the reader presses Next.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NewGoalWizard } from '@/components/Goals/NewGoalWizard';
import type { Subject } from '@/services/subjects';
import { PAGE_TOURS } from './pageTours';

const SUBJECTS = [
  { id: 'algebra', name: 'Algebra', label: 'Algebra', icon: 'algebra', group: 'Math and science', used: 0, family: null, custom: false },
] as unknown as Subject[];

const guide = PAGE_TOURS.goals!;
const waits = guide.filter((step) => step.until);

describe('the Goals guide', () => {
  it('teaches by doing: it waits on the New Goal button, then on the wizard', () => {
    expect(guide.find((step) => step.id === 'gx-new')).toMatchObject({ kind: 'click' });
    expect(guide.filter((step) => step.target?.includes('.gx-wizard'))).toHaveLength(6);
  });

  it("moves on with each of the wizard's pages", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <NewGoalWizard open busy={false} subjects={SUBJECTS} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    const showing = (selector: string) => container.querySelector(selector) !== null;

    // Page one: nothing the guide waits on is showing yet.
    expect(waits.some((step) => showing(step.until!))).toBe(false);

    await user.type(screen.getByLabelText(/the result you want/i), 'Get 24 on the AMC 8');
    await user.click(screen.getByRole('button', { name: /choose a subject/i }));
    await user.click(screen.getByRole('button', { name: 'Algebra' }));

    for (const step of waits) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
      expect(showing(step.until!), step.id).toBe(true);
    }
    // And the last page is the one with Create goal on it.
    expect(screen.getByRole('button', { name: 'Create goal' })).toBeInTheDocument();
  });
});
