/**
 * One Personal space: a renamable heading and a page of text that saves itself.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Space, { SAVE_AFTER_MS } from './Space';
import { renderWithProviders } from '@/test/render';
import * as service from '@/services/spaces';

const STORED = [
  { id: 1, name: 'Space 1', body: '' },
  { id: 2, name: 'Reading list', body: 'Godel, Escher, Bach' },
  { id: 3, name: 'Space 3', body: '' },
];

vi.mock('@/services/spaces', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/spaces')>();
  return {
    ...real,
    list: vi.fn(async () => ({ success: true as const, spaces: STORED })),
    save: vi.fn(async (id: number, changes: { name?: string; body?: string }) => ({
      success: true as const,
      space: { ...STORED[id - 1]!, ...changes },
    })),
  };
});

function open(id: number | string) {
  return renderWithProviders(
    <Routes>
      <Route path="/spaces/:spaceId" element={<Space />} />
    </Routes>,
    { route: `/spaces/${id}` },
  );
}

async function nameField() {
  const field = screen.getByRole('textbox', { name: 'Space name' });
  await waitFor(() => expect(field).not.toBeDisabled());
  return field as HTMLInputElement;
}

beforeEach(() => vi.mocked(service.save).mockClear());
afterEach(() => vi.useRealTimers());

describe('a space', () => {
  it('opens under its own name, with what was written in it', async () => {
    open(2);
    expect((await nameField()).value).toBe('Reading list');
    expect(screen.getByRole('textbox', { name: /What is in/ })).toHaveValue('Godel, Escher, Bach');
  });

  it('is renamed by typing over its heading and pressing Enter', async () => {
    open(1);
    const field = await nameField();
    fireEvent.change(field, { target: { value: 'Ideas' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.blur(field);
    await waitFor(() => expect(service.save).toHaveBeenCalledWith(1, { name: 'Ideas' }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('goes back to its default name when the heading is cleared', async () => {
    open(2);
    const field = await nameField();
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.blur(field);
    await waitFor(() => expect(service.save).toHaveBeenCalledWith(2, { name: 'Space 2' }));
    expect(field.value).toBe('Space 2');
  });

  it('saves nothing when the name did not change', async () => {
    open(2);
    const field = await nameField();
    fireEvent.blur(field);
    expect(service.save).not.toHaveBeenCalled();
  });

  it('saves the text once typing stops, not on every key', async () => {
    open(3);
    await nameField();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const text = screen.getByRole('textbox', { name: /What is in/ });
    fireEvent.change(text, { target: { value: 'a' } });
    fireEvent.change(text, { target: { value: 'ab' } });
    expect(service.save).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(SAVE_AFTER_MS + 10);
    });
    expect(service.save).toHaveBeenCalledTimes(1);
    expect(service.save).toHaveBeenCalledWith(3, { body: 'ab' });
  });

  it('saves what is unsaved on the way out', async () => {
    const view = open(3);
    await nameField();
    fireEvent.change(screen.getByRole('textbox', { name: /What is in/ }), { target: { value: 'half a thought' } });
    view.unmount();
    expect(service.save).toHaveBeenCalledWith(3, { body: 'half a thought' });
  });

  it('sends a space that does not exist to the first one', async () => {
    open(9);
    expect((await nameField()).value).toBe('Space 1');
  });
});
