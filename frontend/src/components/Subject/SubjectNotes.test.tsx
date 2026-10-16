/**
 * The subject page lists the notes tagged with it, newest first, and offers a
 * new one already tagged.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';

const list = vi.fn();
vi.mock('@/services/notes', () => ({ list: () => list() }));

import { SubjectNotes, noteLabel } from './SubjectNotes';

const note = (id: string, title: string, subject_ids: string, body = '') => ({
  id, title, body, subject_ids, pinned: false, created_at: '2026-10-01 10:00:00', updated_at: '2026-10-02 10:00:00',
});

describe('notes on the subject page', () => {
  it('lists only the notes tagged with the subject', async () => {
    list.mockResolvedValue({ success: true, notes: [
      note('a', 'Limits', 'maths'), note('b', 'Essay plan', 'english'), note('c', '', 'maths,physics', '## Chain rule\nmore'),
    ] });
    renderWithProviders(<SubjectNotes subjectId="maths" name="Mathematics" />, { route: '/analytics/subject/maths' });
    await userEvent.click(await screen.findByRole('button', { name: /notes/i }));
    const items = await screen.findAllByRole('listitem');
    expect(items.map((li) => within(li).getByRole('link').textContent)).toEqual(['Limits', 'Chain rule']);
    expect(within(items[0]!).getByRole('link')).toHaveAttribute('href', '/notes?note=a');
    expect(screen.getByRole('link', { name: /write a note/i })).toHaveAttribute('href', '/notes?subject=maths&new=1');
  });

  it('says so when there are none, and a failed read is just none', async () => {
    list.mockRejectedValue(new Error('offline'));
    renderWithProviders(<SubjectNotes subjectId="maths" name="Mathematics" />, { route: '/' });
    expect(await screen.findByText(/no notes for this subject yet/i)).toBeInTheDocument();
  });
});

describe('a note with no title', () => {
  it('is labelled by its first line, without the Markdown', () => {
    expect(noteLabel({ title: '', body: '\n- [ ] Revise the chain rule' })).toBe('Revise the chain rule');
    expect(noteLabel({ title: '', body: '' })).toBe('Untitled note');
  });
});
