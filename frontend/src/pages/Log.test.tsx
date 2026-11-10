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
  resume: vi.fn(),
  flag: vi.fn(),
}));

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return { ...real, log: service };
});

import Log from './Log';

/** The entries in the list, without each one's pin button. */
const items = (list: HTMLElement) => within(list).getAllByRole('button').filter((button) => button.classList.contains('lg-item'));
import { Journal } from '@/components/Log/Journal';

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
  service.resume.mockResolvedValue({ success: true, resumed: 0 });
  service.flag.mockImplementation((id: string, change: object) =>
    Promise.resolve({ success: true, entry: { ...ENTRIES.find((entry) => entry.id === id), ...change } }));
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
    const rows = items(list);
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
    expect(items(list)[0]).toHaveTextContent('Big goals');

    await user.type(screen.getByLabelText('Search entries'), 'bow');
    const shown = items(screen.getByRole('list', { name: 'Your entries' }));
    expect(shown).toHaveLength(1);
    expect(shown[0]).toHaveTextContent('Violin practice');
  });

  it('opens an entry into the editor and marks it in the list', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Log />);
    await user.click(await screen.findByRole('button', { name: /^Big goals/ }));
    expect(screen.getByLabelText('Entry title')).toHaveValue('Big goals');
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Entry' })).toHaveTextContent('AIME 4 by 9th grade.'));
    expect(screen.getByRole('button', { name: /^Big goals/ })).toHaveAttribute('aria-current', 'true');
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
    await user.click(await screen.findByRole('button', { name: /^Big goals/ }));
    await user.click(screen.getByRole('button', { name: /Delete/ }));

    const dialog = screen.getByRole('alertdialog', { name: 'Delete this entry?' });
    expect(dialog).toHaveTextContent('This also removes 1 thing Summit learned only from it.');
    expect(service.remove).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Delete entry' }));
    await waitFor(() => expect(service.remove).toHaveBeenCalledWith('e2'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Big goals/ })).not.toBeInTheDocument());
  });

  it('can cancel a delete', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Log />);
    await user.click(await screen.findByRole('button', { name: /^Violin practice/ }));
    await user.click(screen.getByRole('button', { name: /Delete/ }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Nothing Summit learned comes only from it');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(service.remove).not.toHaveBeenCalled();
  });
});

describe('reads a restart dropped', () => {
  it('asks the server to queue them again when an entry is still waiting', async () => {
    service.list.mockResolvedValue({
      success: true, insights: [], learning: true,
      entries: [{ ...ENTRIES[0], learn_state: 'waiting' }, ENTRIES[1]],
    });
    renderWithProviders(<Log />);
    await waitFor(() => expect(service.resume).toHaveBeenCalledTimes(1));
  });

  it("doesn't when nothing is waiting", async () => {
    renderWithProviders(<Log />);
    await screen.findByRole('list', { name: 'Your entries' });
    expect(service.resume).not.toHaveBeenCalled();
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

describe('as a block on a space', () => {
  const parts = { checkin: true, entries: true, learned: true };

  it('is the whole Log without the page heading, and leaves the caret alone', async () => {
    renderWithProviders(<Journal embedded slot="space-b1" show={parts} />);
    const title = await screen.findByLabelText('Entry title');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(title).not.toHaveFocus();
    expect(screen.getByRole('button', { name: /^Big goals/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /See what Summit has learned/ })).toBeInTheDocument();
    expect(screen.getByText("How's today?")).toBeInTheDocument();
  });

  it('leaves out the parts the block is set not to show', async () => {
    renderWithProviders(<Journal embedded slot="space-b1" show={{ checkin: false, entries: false, learned: false }} />);
    expect(await screen.findByLabelText('Entry title')).toBeInTheDocument();
    expect(screen.queryByText("How's today?")).toBeNull();
    expect(screen.queryByRole('button', { name: /^Big goals/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /See what Summit has learned/ })).toBeNull();
  });

  it("keeps its draft apart from the page's", async () => {
    localStorage.setItem('summit:log-draft:myles', JSON.stringify({ title: "The page's", body: '', at: 1 }));
    service.save.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    renderWithProviders(<Journal embedded slot="space-b1" show={parts} />);
    const title = await screen.findByLabelText('Entry title');
    expect(title).toHaveValue('');
    await user.type(title, 'From the block');
    await user.click(screen.getByRole('button', { name: 'Save entry' }));
    await screen.findByText('Not saved');
    expect(JSON.parse(localStorage.getItem('summit:log-draft:myles:space-b1') ?? '{}')).toMatchObject({ title: 'From the block' });
    expect(JSON.parse(localStorage.getItem('summit:log-draft:myles') ?? '{}')).toMatchObject({ title: "The page's" });
  });

  it('saves on ⌘S only from inside itself', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Journal embedded slot="space-b1" show={parts} />);
    await user.type(await screen.findByLabelText('Entry title'), 'Kept');
    fireEvent.keyDown(document.body, { key: 's', metaKey: true });
    expect(service.save).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText('Entry title'), { key: 's', metaKey: true });
    await waitFor(() => expect(service.save).toHaveBeenCalledWith(expect.objectContaining({ title: 'Kept', final: true })));
  });

  it('opens the delete box over the whole window', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<Journal embedded slot="space-b1" show={parts} />);
    await user.click(await screen.findByRole('button', { name: /^Big goals/ }));
    await user.click(screen.getByRole('button', { name: /Delete/ }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete this entry?' });
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });
});

describe('pins, marks and search', () => {
  it('pins an entry from the list at once and moves it to the top', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Log />);
    const list = await screen.findByRole('list', { name: 'Your entries' });
    expect(items(list)[0]).toHaveTextContent('Violin practice');

    await user.click(screen.getByRole('button', { name: 'Pin Big goals' }));
    expect(items(list)[0]).toHaveTextContent('Big goals');
    expect(screen.getByRole('button', { name: 'Unpin Big goals' })).toHaveAttribute('aria-pressed', 'true');
    expect(service.flag).toHaveBeenCalledWith('e2', { pinned: true });
    // The chips now offer the pinned ones on their own.
    expect(screen.getByRole('button', { name: 'Pinned, 1' })).toBeInTheDocument();
  });

  it('puts a pin back when the server says no', async () => {
    service.flag.mockResolvedValue({ success: false, message: 'Nope' });
    const user = userEvent.setup();
    renderWithProviders(<Log />);
    await user.click(await screen.findByRole('button', { name: 'Pin Big goals' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pin Big goals' })).toHaveAttribute('aria-pressed', 'false'));
    expect(screen.getByText(/Couldn't save that change/)).toBeInTheDocument();
  });

  it('marks the open entry as a milestone, and the chip shows only milestones', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Log />);
    await user.click(await screen.findByRole('button', { name: /^Big goals/ }));
    const flags = screen.getByRole('group', { name: 'Pin and mark this entry' });
    await user.click(within(flags).getByRole('button', { name: 'Milestone' }));
    expect(within(flags).getByRole('button', { name: 'Milestone' })).toHaveAttribute('aria-pressed', 'true');
    expect(service.flag).toHaveBeenCalledWith('e2', { marks: ['milestone'] });

    const list = screen.getByRole('list', { name: 'Your entries' });
    expect(within(list).getByText('Milestone')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Milestones, 1' }));
    expect(items(screen.getByRole('list', { name: 'Your entries' }))).toHaveLength(1);
    expect(screen.getByText('Showing 1 of 2')).toBeInTheDocument();
  });

  it('finds entries by a mark, by a date, and marks the words it found', async () => {
    service.list.mockResolvedValue({
      success: true, insights: INSIGHTS, learning: true,
      entries: [{ ...ENTRIES[0], marks: ['win'] }, ENTRIES[1]],
    });
    const user = userEvent.setup();
    renderWithProviders(<Log />);
    const search = await screen.findByLabelText('Search entries');

    await user.type(search, 'win');
    expect(items(screen.getByRole('list', { name: 'Your entries' })).map((row) => row.textContent)).toEqual([
      expect.stringContaining('Violin practice'),
    ]);

    await user.clear(search);
    await user.type(search, 'oct 5');
    const found = items(screen.getByRole('list', { name: 'Your entries' }));
    expect(found).toHaveLength(1);
    expect(found[0]).toHaveTextContent('Big goals');

    await user.clear(search);
    await user.type(search, 'intonation');
    expect(document.querySelector('mark.lg-hit')).toHaveTextContent('intonation');

    // Escape clears it, and / comes back to it.
    await user.keyboard('{Escape}');
    expect(search).toHaveValue('');
    search.blur();
    fireEvent.keyDown(document.body, { key: '/' });
    expect(search).toHaveFocus();
  });

  it('starts a new entry pinned and marked when they were tapped before its first save', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Log />);
    await screen.findByLabelText('Entry title');
    const flags = screen.getByRole('group', { name: 'Pin and mark this entry' });
    await user.click(within(flags).getByRole('button', { name: 'Pin' }));
    await user.click(within(flags).getByRole('button', { name: 'Idea' }));
    expect(service.flag).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Entry title'), 'Mornings');
    await user.click(screen.getByRole('button', { name: 'Save entry' }));
    await waitFor(() => expect(service.save).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Mornings', pinned: true, marks: ['idea'],
    })));
  });
});

describe('nothing waits on the server', () => {
  it('opens another entry at once while the one before saves in the background', async () => {
    let finish: (value: unknown) => void = () => {};
    service.save.mockImplementation(() => new Promise((resolve) => {
      finish = resolve;
    }));
    const user = userEvent.setup();
    renderWithProviders(<Log />);
    await user.click(await screen.findByRole('button', { name: /^Big goals/ }));
    await user.clear(screen.getByLabelText('Entry title'));
    await user.type(screen.getByLabelText('Entry title'), 'Bigger goals');

    await user.click(screen.getByRole('button', { name: /^Violin practice/ }));
    // The editor didn't wait, and the list already has the new title.
    expect(screen.getByLabelText('Entry title')).toHaveValue('Violin practice');
    expect(screen.getByRole('button', { name: /^Bigger goals/ })).toBeInTheDocument();
    expect(service.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'e2', title: 'Bigger goals' }));
    finish({ success: true, entry: { ...ENTRIES[1], title: 'Bigger goals' } });
    await waitFor(() => expect(screen.getByLabelText('Entry title')).toHaveValue('Violin practice'));
  });

  it('keeps words whose save failed after they were closed, and opens them again', async () => {
    service.save.mockResolvedValue({ success: false, message: 'Server trouble.' });
    const user = userEvent.setup();
    renderWithProviders(<Log />);
    await user.type(await screen.findByLabelText('Entry title'), 'Half a thought');
    await user.click(screen.getByRole('button', { name: /^Big goals/ }));
    expect(await screen.findByText(/Couldn't save "Half a thought"/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('summit:log-draft:myles:held') ?? '{}')).toMatchObject({ title: 'Half a thought' });

    await user.click(screen.getByRole('button', { name: 'Open it again' }));
    expect(screen.getByLabelText('Entry title')).toHaveValue('Half a thought');
    expect(localStorage.getItem('summit:log-draft:myles:held')).toBeNull();
  });

  it('takes a deleted entry out at once, and puts it back if the server says no', async () => {
    service.remove.mockResolvedValue({ success: false, message: 'Nope' });
    const user = userEvent.setup();
    renderWithProviders(<Log />);
    await user.click(await screen.findByRole('button', { name: /^Big goals/ }));
    await user.click(screen.getByRole('button', { name: /Delete/ }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete entry' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByText(/Couldn't delete "Big goals", so it's back in your list/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Big goals/ })).toBeInTheDocument();
  });
});
