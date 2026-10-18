import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as service from '@/services/spaces';
import { SpaceChat } from './SpaceChat';

let user = 'myles';
vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useAuth: () => ({ username: user }),
}));

vi.mock('@/services/spaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/spaces')>()),
  ask: vi.fn(),
  chat: vi.fn(),
  undoTurn: vi.fn(),
  clearChat: vi.fn(),
}));

const empty = { icon: '', cover: '', blocks: [] };
const built = { icon: '📚', cover: '', blocks: [{ id: 'a', type: 'h1', text: 'SAT plan' }] };

beforeEach(() => {
  user = 'myles';
  window.localStorage.clear();
  vi.mocked(service.ask).mockReset();
  vi.mocked(service.chat).mockReset().mockResolvedValue({ success: true, chat: [] } as never);
  vi.mocked(service.undoTurn).mockReset();
  vi.mocked(service.clearChat).mockReset().mockResolvedValue({ success: true, chat: [] } as never);
});

describe('the space AI chat', () => {
  it("loads this account's chat for this space from the server", async () => {
    vi.mocked(service.chat).mockResolvedValue({
      success: true,
      chat: [{ role: 'user', text: 'Make an SAT page' }, { role: 'ai', text: 'Done.', undo: true }],
    } as never);
    render(<SpaceChat kind="team" id={2} doc={empty as never} onDoc={vi.fn()} />);
    expect(await screen.findByText('Make an SAT page')).toBeInTheDocument();
    expect(service.chat).toHaveBeenCalledWith(2, 'team');
  });

  it('reads the chat again for another space or another account', async () => {
    const { rerender } = render(<SpaceChat kind="personal" id={1} doc={empty as never} onDoc={vi.fn()} />);
    await waitFor(() => expect(service.chat).toHaveBeenCalledWith(1, 'personal'));
    rerender(<SpaceChat kind="personal" id={3} doc={empty as never} onDoc={vi.fn()} />);
    await waitFor(() => expect(service.chat).toHaveBeenCalledWith(3, 'personal'));
    user = 'someone-else';
    rerender(<SpaceChat kind="personal" id={2} doc={empty as never} onDoc={vi.fn()} />);
    await waitFor(() => expect(service.chat).toHaveBeenCalledTimes(3));
  });

  it('sends the prompt with the page, shows the reply and its checks, and hands over the page', async () => {
    vi.mocked(service.ask).mockResolvedValue({
      success: true,
      space: { id: 1, name: 'Space 1', body: '', doc: built },
      reply: 'Made you an SAT page.',
      mode: 'replace',
      before: empty,
      notes: ['Checked contrast on 1 text blocks: all pass, lowest 15.04:1.'],
      chat: [
        { role: 'user', text: 'an SAT page' },
        { role: 'ai', text: 'Made you an SAT page.', undo: true,
          notes: ['Checked contrast on 1 text blocks: all pass, lowest 15.04:1.'] },
      ],
    } as never);
    const onDoc = vi.fn();
    render(<SpaceChat kind="personal" id={1} doc={empty as never} onDoc={onDoc} />);

    fireEvent.change(screen.getByLabelText('Ask the AI'), { target: { value: 'an SAT page' } });
    fireEvent.click(screen.getByTitle('Send'));

    expect(await screen.findByText('Made you an SAT page.')).toBeInTheDocument();
    expect(screen.getByText(/all pass, lowest 15.04:1/)).toBeInTheDocument();
    expect(vi.mocked(service.ask).mock.calls[0]).toEqual([1, 'an SAT page', empty, 'personal']);
    expect(onDoc).toHaveBeenCalledWith(built);
  });

  it('leaves the page alone when the AI only answered', async () => {
    vi.mocked(service.ask).mockResolvedValue({
      success: true, space: { id: 1, name: 'Space 1', body: '', doc: built }, reply: 'It reads fine.',
      mode: 'reply', before: null, notes: [], chat: [{ role: 'ai', text: 'It reads fine.' }],
    } as never);
    const onDoc = vi.fn();
    render(<SpaceChat kind="personal" id={1} doc={empty as never} onDoc={onDoc} />);
    fireEvent.click(await screen.findByText('Is this page easy to read?'));
    expect(await screen.findByText('It reads fine.')).toBeInTheDocument();
    expect(onDoc).not.toHaveBeenCalled();
  });

  it('undoes on the server and shows the page it put back', async () => {
    vi.mocked(service.chat).mockResolvedValue({
      success: true, chat: [{ role: 'ai', text: 'Built it.', undo: true }],
    } as never);
    vi.mocked(service.undoTurn).mockResolvedValue({
      success: true, space: { id: 1, name: 'Space 1', body: '', doc: empty },
      chat: [{ role: 'ai', text: 'Built it.', undone: true }],
    } as never);
    const onDoc = vi.fn();
    render(<SpaceChat kind="personal" id={1} doc={built as never} onDoc={onDoc} />);
    fireEvent.click(await screen.findByRole('button', { name: /Undo/ }));
    expect(await screen.findByText('Undone')).toBeInTheDocument();
    expect(service.undoTurn).toHaveBeenCalledWith(1, 0, 'personal');
    expect(onDoc).toHaveBeenCalledWith(empty);
  });

  it('folds to a tab and opens again', async () => {
    const onOpenChange = vi.fn();
    render(<SpaceChat kind="personal" id={1} doc={empty as never} onDoc={vi.fn()} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByTitle('Fold the chat away'));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByText('Ask AI'));
    expect(screen.getByLabelText('Ask the AI')).toBeInTheDocument();
  });
});
