import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AboutYou } from './AboutYou';

const save = vi.fn();
vi.mock('@/services/background', () => ({ save: (...args: unknown[]) => save(...args) }));

const many = (count: number) => Array.from({ length: count }, () => 'word').join(' ');

describe('About you', () => {
  it('says, big and first, that it matters', () => {
    render(<AboutYou submitLabel="Save" onDone={() => {}} />);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('This is important and can help our pages get more accurate answers.');
    expect(note).toHaveClass('ay-important');
  });

  it('asks the four questions', () => {
    render(<AboutYou submitLabel="Save" onDone={() => {}} />);
    ['Describe yourself', 'What do you do?', 'What have you already done?', 'How do you want to improve?']
      .forEach((label) => expect(screen.getByLabelText(label)).toBeInTheDocument());
  });

  it('shows the head start growing as the answers get longer', () => {
    render(<AboutYou submitLabel="Save" onDone={() => {}} />);
    expect(screen.getByText(/No head start yet/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Describe yourself'), { target: { value: many(25) } });
    expect(screen.getByText(/opens up to 2 days sooner/)).toBeInTheDocument();
    ['What do you do?', 'What have you already done?', 'How do you want to improve?'].forEach((label) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value: many(45) } }),
    );
    expect(screen.getByText(/opens up to 7 days sooner/)).toBeInTheDocument();
  });

  it('saves the answers and hands back what was saved', async () => {
    const saved = { success: true, answers: {}, detail: {}, facts: [], updated_at: 'now' };
    save.mockResolvedValueOnce(saved);
    const onDone = vi.fn();
    render(<AboutYou submitLabel="Save and go to Dashboard" onDone={onDone} />);
    fireEvent.change(screen.getByLabelText('What have you already done?'), { target: { value: 'Won a contest' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and go to Dashboard' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(saved));
    expect(save).toHaveBeenCalledWith({ describe: '', doing: '', done: 'Won a contest', improve: '' });
  });

  it('can be skipped when the flow allows it', () => {
    const onSkip = vi.fn();
    render(<AboutYou submitLabel="Save" onDone={() => {}} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole('button', { name: /Skip for now/ }));
    expect(onSkip).toHaveBeenCalled();
  });
});
