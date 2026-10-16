/**
 * Notes that know what they are about, and save themselves.
 *
 * The rest of the app reaches a note by address, so the addresses are pinned:
 * `?note=` opens one, `?task=` narrows to that task's notes or starts one tied
 * to it with the task's name and subject, `?subject=` does the same for a tag,
 * and `&new=1` always starts fresh. Then autosave: it fires once the writing
 * stops, it sends the task along, and a save that lands mid-sentence does not
 * take the sentence back.
 */
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { stats, task } from '@/test/factories';
import type { Note, NoteDraft } from '@/services/notes';

const note = (over: Partial<Note>): Note => ({
  id: 'n1', title: 'Old note', body: 'Something', note_date: '', subject_ids: '', notebook: '',
  pinned: false, created_at: '2026-10-01 10:00:00', updated_at: '2026-10-01 10:00:00', ...over,
});

let served: Note[] = [];
const save = vi.fn();

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    notes: {
      list: () => Promise.resolve({ success: true, notes: served }),
      save: (draft: NoteDraft) => save(draft),
      remove: () => Promise.resolve({ success: true }),
    },
  };
});

import Notes from './Notes';

const integrals = task({ id: 't-int', title: 'Revise integrals', subject: 'maths' });

function Where() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

function show(route: string) {
  return renderWithProviders(<><Notes /><Where /></>, {
    route,
    userData: { data: { stats: stats(), tasks: [integrals] }, username: 'myles' },
  });
}

const title = () => screen.getByPlaceholderText('Untitled') as HTMLInputElement;

beforeEach(() => {
  served = [];
  save.mockImplementation((draft: NoteDraft) =>
    Promise.resolve({ success: true, note: note({ ...draft, id: draft.id ?? 'made', title: draft.title, body: draft.body } as Partial<Note>) }));
});

describe('arriving by address', () => {
  it('opens the note named in ?note=', async () => {
    served = [note({ id: 'n1', title: 'First' }), note({ id: 'n2', title: 'Second' })];
    show('/notes?note=n2');
    await waitFor(() => expect(title().value).toBe('Second'));
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent(''));
  });

  it("starts a note tied to the task, named for it, when it has none", async () => {
    show('/notes?task=t-int');
    await waitFor(() => expect(title().value).toBe('Revise integrals'));
    expect(screen.getByRole('heading', { name: /about a task/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revise integrals' })).toHaveAttribute('href', '/tasks?task=t-int');
  });

  it("opens the task's newest note when there is one, and narrows the list to it", async () => {
    served = [
      note({ id: 'other', title: 'Unrelated' }),
      note({ id: 'linked', title: 'Integration by parts', body: 'See [it](/tasks?task=t-int)' }),
    ];
    show('/notes?task=t-int');
    await waitFor(() => expect(title().value).toBe('Integration by parts'));
    expect(screen.queryByText('Unrelated')).not.toBeInTheDocument();
  });

  it('starts a note already tagged with the subject from ?subject=&new=1', async () => {
    served = [note({ id: 'm', title: 'Limits', subject_ids: 'mathematics' })];
    show('/notes?subject=mathematics&new=1');
    await waitFor(() => expect(title().value).toBe(''));
    await userEvent.type(title(), 'Squeeze theorem');
    await waitFor(() => expect(save).toHaveBeenCalled(), { timeout: 3000 });
    expect(save.mock.calls[0]![0]).toMatchObject({ title: 'Squeeze theorem', subject_ids: 'mathematics' });
  });

  it('starts fresh with &new=1 even when the task has notes', async () => {
    served = [note({ id: 'linked', title: 'Integration by parts', task_id: 't-int' })];
    show('/notes?task=t-int&new=1');
    await waitFor(() => expect(title().value).toBe('Revise integrals'));
  });
});

describe('saving by itself', () => {
  it('saves once the writing stops, and sends the task along', async () => {
    show('/notes?task=t-int');
    await waitFor(() => expect(title().value).toBe('Revise integrals'));
    await userEvent.type(title(), ': limits');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(save.mock.calls[0]![0]).toMatchObject({
      title: 'Revise integrals: limits', task_id: 't-int', subject_ids: 'maths',
    });
    await waitFor(() => expect(screen.getByText(/saved just now/i)).toBeInTheDocument());
  });

  it('does not save a note somebody only opened', async () => {
    show('/notes?task=t-int');
    await waitFor(() => expect(title().value).toBe('Revise integrals'));
    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect(save).not.toHaveBeenCalled();
  });

  it('does not take back typing that happened while a save was out', async () => {
    let answer: (value: unknown) => void = () => {};
    save.mockImplementation((draft: NoteDraft) => new Promise((resolve) => {
      answer = () => resolve({ success: true, note: note({ id: 'made', title: draft.title, body: draft.body }) });
    }));
    show('/notes');
    await screen.findByPlaceholderText('Untitled');
    await userEvent.type(title(), 'Plan');
    await waitFor(() => expect(save).toHaveBeenCalled(), { timeout: 3000 });
    await userEvent.type(title(), ' for Friday');
    await act(async () => { answer(null); });
    expect(title().value).toBe('Plan for Friday');
  });

  it('can be untied from its task', async () => {
    show('/notes?task=t-int');
    await screen.findByRole('heading', { name: /about a task/i });
    await userEvent.click(screen.getByRole('button', { name: /unlink this note/i }));
    expect(screen.queryByRole('heading', { name: /about a task/i })).not.toBeInTheDocument();
  });
});
