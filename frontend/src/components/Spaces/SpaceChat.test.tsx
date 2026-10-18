import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as service from '@/services/spaces';
import { SpaceChat } from './SpaceChat';

vi.mock('@/services/spaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/spaces')>()),
  ask: vi.fn(),
}));

const empty = { icon: '', cover: '', blocks: [] };
const built = { icon: '📚', cover: '', blocks: [{ id: 'a', type: 'h1', text: 'SAT plan' }] };

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.mocked(service.ask).mockReset();
});

describe('the space AI chat', () => {
  it('sends the prompt with the page, shows the reply and hands over the new page', async () => {
    vi.mocked(service.ask).mockResolvedValue({
      success: true,
      space: { id: 1, name: 'Space 1', body: '', doc: built },
      reply: 'Made you an SAT page.',
      mode: 'replace',
      before: empty,
    } as never);
    const onDoc = vi.fn();
    render(<SpaceChat kind="personal" id={1} doc={empty as never} onDoc={onDoc} />);

    fireEvent.change(screen.getByLabelText('Ask the AI'), { target: { value: 'an SAT page' } });
    fireEvent.click(screen.getByTitle('Send'));

    expect(await screen.findByText('Made you an SAT page.')).toBeInTheDocument();
    expect(vi.mocked(service.ask).mock.calls[0]!.slice(0, 2)).toEqual([1, 'an SAT page']);
    expect(onDoc).toHaveBeenCalledWith(built, false);

    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(onDoc).toHaveBeenLastCalledWith(empty, true);
  });

  it('says what went wrong', async () => {
    vi.mocked(service.ask).mockResolvedValue({ success: false, message: 'No AI key is set up.' } as never);
    render(<SpaceChat kind="personal" id={1} doc={empty as never} onDoc={vi.fn()} />);
    fireEvent.click(screen.getByText('A study plan for my next test'));
    await waitFor(() => expect(screen.getByText('No AI key is set up.')).toBeInTheDocument());
  });

  it('folds to a tab and opens again', () => {
    const onOpenChange = vi.fn();
    render(<SpaceChat kind="personal" id={1} doc={empty as never} onDoc={vi.fn()} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByTitle('Fold the chat away'));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByText('Ask AI'));
    expect(screen.getByLabelText('Ask the AI')).toBeInTheDocument();
  });
});
