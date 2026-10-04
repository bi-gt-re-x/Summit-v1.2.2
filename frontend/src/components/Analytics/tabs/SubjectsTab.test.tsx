/**
 * The Subjects tab, with what the complexity cut took off it put back.
 *
 * The cut left this tab as XP by subject and skill levels. The reader asked for
 * the rest back: the Skills & Subjects chapter, how far into each tree, what
 * each subject opens, and the scored list at the foot. These check that each is
 * drawn when there is something for it to say, and that the tab still says
 * nothing it cannot back up when there is not.
 */
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubjectsTab } from './SubjectsTab';
import { draw, fakeModel, nameOf } from './fixtures';
import { task } from '@/test/factories';
import { skillScores } from '@/utils/skillScore';

/** Finished maths, enough of it to reach into the mathematics tree. */
const MATHS = Array.from({ length: 6 }, (_, index) =>
  task({
    status: 'done',
    subject: 'mathematics',
    xp_value: 400,
    completed_at: `2026-09-0${index + 1}T10:00:00`,
  }),
);

const WORKED = {
  rows: [{ key: 'mathematics', label: 'Mathematics', name: 'Mathematics', xp: 2400, share: 1, tasks: 6 }],
} as never;

describe('the Subjects tab', () => {
  it('says how far into each tree the finished work reaches', () => {
    draw(<SubjectsTab model={fakeModel({ tasks: MATHS, breakdown: WORKED })} />);
    expect(screen.getByRole('heading', { name: 'How far into each tree' })).toBeInTheDocument();
    // 6 × 400 XP, all routed to the one tree.
    expect(screen.getByText(/2,400 \//)).toBeInTheDocument();
  });

  it('lists what each worked subject opens, linking to its page', () => {
    draw(<SubjectsTab model={fakeModel({ tasks: MATHS, breakdown: WORKED })} />);
    const heading = screen.getByRole('heading', { name: 'What each subject opens' });
    const panel = heading.closest('section') as HTMLElement;
    expect(within(panel).getByRole('link', { name: /Mathematics/ })).toHaveAttribute(
      'href',
      '/analytics/subject/mathematics',
    );
  });

  it('keeps XP by subject, which the Overview no longer draws', () => {
    draw(<SubjectsTab model={fakeModel({ tasks: MATHS, breakdown: WORKED })} />);
    expect(screen.getByRole('heading', { name: /Subject Growth/ })).toBeInTheDocument();
  });

  it('closes on the scored list once there are rated subjects to score', () => {
    const rated = MATHS.map((row) => ({ ...row, difficulty: 3, execution: 4 }));
    draw(<SubjectsTab model={fakeModel({ tasks: rated, breakdown: WORKED, skills: skillScores(rated), nameOf })} />);
    expect(screen.getByRole('heading', { name: /Skill Level/ })).toBeInTheDocument();
  });

  it('draws none of the tree panels for an account with no finished work', () => {
    draw(<SubjectsTab model={fakeModel()} />);
    expect(screen.queryByRole('heading', { name: 'How far into each tree' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What each subject opens' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Skill Level/ })).not.toBeInTheDocument();
  });
});
