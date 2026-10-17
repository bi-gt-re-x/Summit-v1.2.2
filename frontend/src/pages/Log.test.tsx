/**
 * The Log page: it opens ready to type, lists and finds past entries, saves
 * on its own, keeps a copy on this device when the server can't, asks before
 * deleting (and says what goes with an entry), and shows what Summit has
 * learned with a way to remove each thing.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';

const ENTRIES = [
  {
    id: 'e1', title: 'Violin practice', body: 'Bow control and **intonation**.',
    learn_state: 'done', created_at: '2026-10-10T09:00:00', updated_at: '2026-10-10T09:00:00',
  },
  {
    id: 'e2', title: 'Big goals', body: 'AIME 4 by 9th grade.',
    learn_state: 'done', created_at: '2026-10-05T09:00:00', updated_at: '2026-10-05T09:00:00',
  },
];

const INSIGHTS = [
  {
    id: 'i1', kind: 'goal', topic: 'goals', text: 'Wants AIME 4 by 9th grade', status: 'active',
    sources: ['e2'], created_at: '', updated_at: '',
  },
  {
    id: 'i2', kind: 'feeling', topic: 'motivation', text: 'Felt proud of violin progress', status: 'active',
    expires_at: '2026-10-17', sources: ['e1', 'e2'], created_at: '', updated_at: '',
  },
];

const service = vi.hoisted(() => ({
  list: vi.fn(),
  insights: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  forget: vi.fn(),
}));

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return { ...real, log: service };
});

import Log from './Log';

beforeEach(() => {
  localStorage.clear();
  service.list.mockResolvedValue({ success: true, entries: ENTRIES, insights: INSIGHTS, learning: true });
  service.insights.mockResolvedValue({ success: true, insights: INSIGHTS, waiting: [], learning: true });
  service.save.mockImplementation((draft: { id?: string; title: string; body: string }) =>
    Promise.resolve({
      success: true,
      entry: {
        id: draft.id ?? 'new1', title: draft.title, body: draft.body, learn_state: 'waiting',
        created_at: '2026-10-16T09:00:00', updated_at: '2026-10-16T09:00:00',
      },
    }));
  service.remove.mockResolvedValue({ success: true, id: 'e2', removed: 1 });
  service.forget.mockResolvedValue({ success: true, id: 'i1' });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('the log page', () => {
  it('opens ready to type', async () => {
    renderWithProviders(<Log />);
    const title = await screen.findByLabelText('Entry title');
    await waitFor(() => expect(title).toHaveFocus());
    expect(screen.getByRole('textbox', { name: 'Entry' })).toBeInTheDocument();
  });

  it('says plainly that entries shape what Summit suggests', async () => {
    renderWithProviders(<Log />);
    expect(await screen.findByText(/Summit reads it to make your plans and suggestions fit you better/)).toBeInTheDocument();
    expect(screen.getByText('Your log helps Summit get to know you')).toBeInTheDocument();
  });

  it('lists entries newest first, with a plain preview and a date', async () => {
    renderWithProviders(<Log />);
    const list = await screen.findByRole('list', { name: 'Your entries' });
    const rows = within(list).getAllByRole('button');
    expect(rows[0]).toHaveTextContent('Violin practice');
    expect(rows[0]).toHaveTextContent('Bow control and intonation.');
    expect(rows[0]).toHaveTextContent('Oct 10, 2026');
    expect(rows[1]).toHaveTextContent('Big goals');
  });

  it('searches and flips the order', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Log />);
    const list = await screen.findByRole('list', { name: 'Your entries' });

    await user.selectOptions(screen.getByLabelText('Sort entries'), 'oldest');
    expect(within(list).getAllByRole('button')[0]).toHaveTextContent('Big goals');

    await user.type(screen.getByLabelText('Search entries'), 'bow');
    const shown = within(screen.getByRole('list', { name: 'Your entries' })).getAllByRole('button');
    expect(shown).toHaveLength(1);
    expect(shown[0]).toHaveTextContent('Violin practice');
  });

  it('opens an entry into the editor and marks it in the list', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Log />);
    await user.click(await screen.findByRole('button', { name: /Big goals/ }));
    expect(screen.getByLabelText('Entry title')).toHaveValue('Big goals');
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Entry' })).toHaveTextContent('AIME 4 by 9th grade.'));
    expect(screen.getByRole('button', { name: /Big goals/ })).toHaveAttribute('aria-current', 'true');
  });

  it('saves on its own once the typing stops, and says so', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Log />);
    await user.type(await screen.findByLabelText('Entry title'), 'Swim meet');
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
    await waitFor(() => expect(service.save).toHaveBeenCalled(), { timeout: 3000 });
    expect(service.save.mock.calls.at(-1)?.[0]).toMatchObject({ title: 'Swim meet', final: false });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('Save entry asks for an immediate read', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Log />);
    await user.type(await screen.findByLabelText('Entry title'), 'Done');
    await user.click(screen.getByRole('button', { name: 'Save entry' }));
    await waitFor(() => expect(service.save).toHaveBeenCalledWith(expect.objectContaining({ title: 'Done', final: true })));
  });

  it('keeps the writing on this device when a save fails', async () => {
    service.save.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    renderWithProviders(<Log />);
    await user.type(await screen.findByLabelText('Entry title'), 'Not lost');
    await user.click(screen.getByRole('button', { name: 'Save entry' }));
    expect(await screen.findByText(/Your writing is kept on this device/)).toBeInTheDocument();
    expect(screen.getByText('Not saved')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('summit:log-draft:myles') ?? '{}')).toMatchObject({ title: 'Not lost' });
  });

  it('puts back a draft from last time', async () => {
    localStorage.setItem('summit:log-draft:myles', JSON.stringify({ title: 'Half done', body: 'Where was I', at: 1 }));
    renderWithProviders(<Log />);
    await waitFor(() => expect(screen.getByLabelText('Entry title')).toHaveValue('Half done'));
    expect(screen.getByText(/Put back what you were writing last time/)).toBeInTheDocument();
  });

  it('asks before deleting, and says what goes with the entry', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Log />);
    await user.click(await screen.findByRole('button', { name: /Big goals/ }));
    await user.click(screen.getByRole('button', { name: /Delete/ }));

    const dialog = screen.getByRole('alertdialog', { name: 'Delete this entry?' });
    expect(dialog).toHaveTextContent('This also removes 1 thing Summit learned only from it.');
    expect(service.remove).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Delete entry' }));
    await waitFor(() => expect(service.remove).toHaveBeenCalledWith('e2'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Big goals/ })).not.toBeInTheDocument());
  });

  it('can cancel a delete', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Log />);
    await user.click(await screen.findByRole('button', { name: /Violin practice/ }));
    await user.click(screen.getByRole('button', { name: /Delete/ }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Nothing Summit learned comes only from it');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(service.remove).not.toHaveBeenCalled();
  });
});

describe('what Summit has learned', () => {
  it('lists insights by kind, marks feelings as passing, and removes one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Log />);
    await user.click(await screen.findByRole('button', { name: /See what Summit has learned/ }));

    const panel = screen.getByRole('dialog', { name: 'What Summit has learned' });
    expect(within(panel).getByRole('region', { name: 'Long-term goals' })).toHaveTextContent('Wants AIME 4 by 9th grade');
    const feelings = within(panel).getByRole('region', { name: 'Passing feelings' });
    expect(feelings).toHaveTextContent('from 2 entries');
    expect(feelings).toHaveTextContent('fades Oct 17, 2026');
    expect(panel).toHaveTextContent('Never kept:');

    await user.click(within(panel).getByRole('button', { name: 'Remove: Wants AIME 4 by 9th grade' }));
    expect(service.forget).toHaveBeenCalledWith('i1');
    await waitFor(() => expect(panel).not.toHaveTextContent('Wants AIME 4 by 9th grade'));
  });

  it('says when learning is off', async () => {
    service.list.mockResolvedValue({ success: true, entries: [], insights: [], learning: false });
    renderWithProviders(<Log />);
    fireEvent.click(await screen.findByRole('button', { name: /See what Summit has learned/ }));
    expect(screen.getByText(/Learning is off right now/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing yet/)).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    renderWithProviders(<Log />);
    fireEvent.click(await screen.findByRole('button', { name: /See what Summit has learned/ }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
