/**
 * One space: a renamable heading and a page of blocks that saves itself.
 * The editor's own keys and menus are tested in components/Spaces.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Space, { SAVE_AFTER_MS } from './Space';
import { renderWithProviders } from '@/test/render';
import { textOf, typeInto } from '@/test/blockFields';
import * as service from '@/services/spaces';

const STORED: Array<{ id: number; name: string; body: string; doc?: unknown }> = [
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
    save: vi.fn(async (id: number, changes: { name?: string; body?: string; doc?: unknown }, kind = 'personal') => ({
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

/** The first block's text field. */
const firstBlock = () =>
  within(screen.getByRole('group', { name: /What is in/ })).getAllByRole('textbox')[0]!;

/** What a save of the page carried as its blocks' words. */
const savedText = (call: unknown[]) =>
  ((call[1] as { doc: { blocks: Array<{ text: string }> } }).doc.blocks).map((one) => one.text);

beforeEach(() => {
  vi.mocked(service.save).mockClear();
  vi.mocked(service.invite).mockClear();
});
afterEach(() => vi.useRealTimers());

describe('a space', () => {
  it('opens under its own name, with what was written in it', async () => {
    open(2);
    expect((await nameField()).value).toBe('Reading list');
    expect(textOf(firstBlock())).toBe('Godel, Escher, Bach');
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
    typeInto(firstBlock(), 'a');
    typeInto(firstBlock(), 'ab');
    expect(service.save).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(SAVE_AFTER_MS + 10);
    });
    expect(service.save).toHaveBeenCalledTimes(1);
    const call = vi.mocked(service.save).mock.calls[0]!;
    expect(call[0]).toBe(3);
    expect(call[2]).toBe('personal');
    expect(savedText(call)).toEqual(['ab']);
  });

  it('saves what is unsaved on the way out', async () => {
    const view = open(3);
    await nameField();
    typeInto(firstBlock(), 'half a thought');
    view.unmount();
    expect(service.save).toHaveBeenCalledTimes(1);
    expect(savedText(vi.mocked(service.save).mock.calls[0]!)).toEqual(['half a thought']);
  });

  it('reads a page written as plain text into blocks', async () => {
    STORED[2] = { id: 3, name: 'Space 3', body: '# Plan\n- [x] read\n- write' };
    open(3);
    await nameField();
    const fields = within(screen.getByRole('group', { name: /What is in/ })).getAllByRole('textbox');
    expect(fields.map(textOf)).toEqual(['Plan', 'read', 'write']);
    expect(screen.getByRole('textbox', { name: 'Heading 1' })).toHaveTextContent('Plan');
    expect(screen.getByRole('checkbox', { name: 'Done: read' })).toBeChecked();
    STORED[2] = { id: 3, name: 'Space 3', body: '' };
  });

  it('opens a page kept as blocks, with its icon and cover', async () => {
    STORED[0] = {
      id: 1, name: 'Space 1', body: '',
      doc: { icon: '🎯', cover: 'ocean', blocks: [{ id: 'q', type: 'quote', text: 'Ship it' }] },
    } as (typeof STORED)[number];
    open(1);
    await nameField();
    expect(screen.getByRole('button', { name: 'Change icon' })).toHaveTextContent('🎯');
    expect(screen.getByRole('img', { name: 'Ocean cover' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Quote' })).toHaveTextContent('Ship it');
    STORED[0] = { id: 1, name: 'Space 1', body: '' };
  });

  it('adds an icon and a cover, and saves them with the page', async () => {
    open(3);
    await nameField();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole('button', { name: /Add icon/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add cover/ }));
    await act(async () => {
      vi.advanceTimersByTime(SAVE_AFTER_MS + 10);
    });
    const doc = (vi.mocked(service.save).mock.calls[0]![1] as { doc: { icon: string; cover: string } }).doc;
    expect(doc.icon).not.toBe('');
    expect(doc.cover).not.toBe('');
    expect(screen.getByRole('button', { name: 'Change icon' })).toHaveTextContent(doc.icon);

    fireEvent.click(screen.getByRole('button', { name: 'Change icon' }));
    fireEvent.click(screen.getByRole('button', { name: 'Icon 📚' }));
    expect(screen.getByRole('button', { name: 'Change icon' })).toHaveTextContent('📚');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByRole('img', { name: /cover/ })).not.toBeInTheDocument();
  });

  it('counts the words on the page', async () => {
    open(2);
    await nameField();
    expect(screen.getByText(/3 words/)).toBeInTheDocument();
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
