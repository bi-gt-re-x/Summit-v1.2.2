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

const TEAM = [
  { id: 1, name: 'Study group', body: 'Thursdays at four', invites: [{ email: 'ada@example.com', status: 'pending' as const }] },
  { id: 2, name: 'Team Space 2', body: '', invites: [] },
  { id: 3, name: 'Team Space 3', body: '', invites: [] },
];

vi.mock('@/services/spaces', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/spaces')>();
  return {
    ...real,
    list: vi.fn(async (kind = 'personal') => ({
      success: true as const,
      spaces: kind === 'team' ? TEAM : STORED,
    })),
    save: vi.fn(async (id: number, changes: { name?: string; body?: string }, kind = 'personal') => ({
      success: true as const,
      space: { ...(kind === 'team' ? TEAM : STORED)[id - 1]!, ...changes },
    })),
    invite: vi.fn(async (id: number, email: string) =>
      email.includes('@')
        ? {
            success: true as const,
            space: { ...TEAM[id - 1]!, invites: [...TEAM[id - 1]!.invites, { email, status: 'pending' as const }] },
          }
        : { success: false as const, message: 'That does not look like an e-mail address.' }),
    uninvite: vi.fn(async (id: number) => ({
      success: true as const,
      space: { ...TEAM[id - 1]!, invites: [] },
    })),
  };
});

function open(id: number | string, route = `/spaces/${id}`) {
  return renderWithProviders(
    <Routes>
      <Route path="/spaces/:spaceId" element={<Space key="personal" />} />
      <Route path="/team/:spaceId" element={<Space key="team" kind="team" />} />
    </Routes>,
    { route },
  );
}

async function nameField() {
  const field = screen.getByRole('textbox', { name: 'Space name' });
  await waitFor(() => expect(field).not.toBeDisabled());
  return field as HTMLInputElement;
}

beforeEach(() => {
  vi.mocked(service.save).mockClear();
  vi.mocked(service.invite).mockClear();
});
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
    await waitFor(() => expect(service.save).toHaveBeenCalledWith(1, { name: 'Ideas' }, 'personal'));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('goes back to its default name when the heading is cleared', async () => {
    open(2);
    const field = await nameField();
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.blur(field);
    await waitFor(() => expect(service.save).toHaveBeenCalledWith(2, { name: 'Space 2' }, 'personal'));
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
    expect(service.save).toHaveBeenCalledWith(3, { body: 'ab' }, 'personal');
  });

  it('saves what is unsaved on the way out', async () => {
    const view = open(3);
    await nameField();
    fireEvent.change(screen.getByRole('textbox', { name: /What is in/ }), { target: { value: 'half a thought' } });
    view.unmount();
    expect(service.save).toHaveBeenCalledWith(3, { body: 'half a thought' }, 'personal');
  });

  it('sends a space that does not exist to the first one', async () => {
    open(9);
    expect((await nameField()).value).toBe('Space 1');
  });
});

describe('a team space', () => {
  it('opens under its own name, says it is a team space, and saves as one', async () => {
    open(1, '/team/1');
    expect((await nameField()).value).toBe('Study group');
    expect(screen.getByText('Team')).toBeInTheDocument();
    const field = await nameField();
    fireEvent.change(field, { target: { value: 'Lab partners' } });
    fireEvent.blur(field);
    await waitFor(() => expect(service.save).toHaveBeenCalledWith(1, { name: 'Lab partners' }, 'team'));
  });

  it('lists the owner and the pending invites, and says nothing is sent', async () => {
    open(1, '/team/1');
    await nameField();
    expect(screen.getByRole('heading', { name: 'Members' })).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText(/no e-mail is sent yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy invite link' })).toBeDisabled();
  });

  it('adds an invite to the list', async () => {
    open(2, '/team/2');
    await nameField();
    fireEvent.change(screen.getByRole('textbox', { name: 'E-mail to invite' }), {
      target: { value: 'grace@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
    expect(await screen.findByText('grace@example.com')).toBeInTheDocument();
    expect(service.invite).toHaveBeenCalledWith(2, 'grace@example.com');
    expect(screen.getByRole('textbox', { name: 'E-mail to invite' })).toHaveValue('');
  });

  it('says why an invite was refused', async () => {
    open(2, '/team/2');
    await nameField();
    fireEvent.change(screen.getByRole('textbox', { name: 'E-mail to invite' }), {
      target: { value: 'nobody' },
    });
    fireEvent.submit(screen.getByRole('textbox', { name: 'E-mail to invite' }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('does not look like an e-mail');
  });

  it('takes an invite back', async () => {
    open(1, '/team/1');
    await nameField();
    fireEvent.click(screen.getByRole('button', { name: 'Remove the invite for ada@example.com' }));
    await waitFor(() => expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument());
  });

  it('puts the caret in the invite box when arrived at to invite', async () => {
    open(1, '/team/1?invite=1');
    await nameField();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'E-mail to invite' })).toHaveFocus(),
    );
  });

  it('has no member list on a personal space', async () => {
    open(1);
    await nameField();
    expect(screen.queryByRole('heading', { name: 'Members' })).not.toBeInTheDocument();
  });

  it('sends a team space that does not exist to the first one', async () => {
    open(7, '/team/7');
    expect((await nameField()).value).toBe('Study group');
  });
});
