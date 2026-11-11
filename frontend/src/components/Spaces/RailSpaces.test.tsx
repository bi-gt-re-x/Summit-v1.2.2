/**
 * The rail's pages for one kind: loose pages first, then folders with their pages,
 * a page added from the rail or straight into a folder, and folders added, renamed
 * and deleted. The routes are pinned in tests/test_space_folders.py.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  create: vi.fn(), addFolder: vi.fn(), renameFolder: vi.fn(), removeFolder: vi.fn(),
}));

vi.mock('@/services/spaces', async (original) => {
  const real = await original<Record<string, unknown>>();
  return { ...real, ...service };
});

import { RailSpaces } from './RailSpaces';

const SPACES = [
  { id: 1, name: 'Inbox', body: '', folder: '' },
  { id: 4, name: 'MathCounts', body: '', folder: 'f1' },
  { id: 5, name: 'AMC 10', body: '', folder: 'f1' },
];
const FOLDERS = [{ id: 'f1', name: 'Competitions' }, { id: 'f2', name: 'Empty one' }];

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function draw() {
  return render(
    <MemoryRouter initialEntries={['/spaces/1']}>
      <RailSpaces kind="personal" spaces={SPACES} folders={FOLDERS} pageIcon={<span />} />
      <Routes><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('pages in the rail', () => {
  it('puts loose pages first, then each folder with its pages under it', () => {
    draw();
    const links = screen.getAllByRole('link').map((link) => link.textContent);
    expect(links).toEqual(['Inbox', 'MathCounts', 'AMC 10']);
    expect(screen.getByRole('button', { name: 'Competitions, 2 pages' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Empty\. Move a page here/)).toBeInTheDocument();
  });

  it('folds a folder away and remembers it', () => {
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'Competitions, 2 pages' }));
    expect(screen.queryByRole('link', { name: 'MathCounts' })).toBeNull();
    expect(JSON.parse(localStorage.getItem('summit:space-folders-open:personal')!)).toEqual({ f1: false });
  });

  it('adds a page and opens it', async () => {
    service.create.mockResolvedValue({ success: true, space: { id: 6, name: 'Space 6', body: '', folder: '' } });
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'New page' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/spaces/6'));
    expect(service.create).toHaveBeenCalledWith('personal', { folder: '' });
  });

  it('adds a page straight into a folder from its menu', async () => {
    service.create.mockResolvedValue({ success: true, space: { id: 6, name: 'Space 6', body: '', folder: 'f1' } });
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'Competitions options' }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'New page here' }));
    await waitFor(() => expect(service.create).toHaveBeenCalledWith('personal', { folder: 'f1' }));
  });

  it('names a new folder, renames one and deletes one', async () => {
    service.addFolder.mockResolvedValue({ success: true });
    service.renameFolder.mockResolvedValue({ success: true });
    service.removeFolder.mockResolvedValue({ success: true });
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
    const field = screen.getByRole('textbox', { name: 'New folder name' });
    fireEvent.change(field, { target: { value: 'Violin' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.blur(field);
    await waitFor(() => expect(service.addFolder).toHaveBeenCalledWith('personal', 'Violin'));
    // Enter and the blur after it save once.
    expect(service.addFolder).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Competitions options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const rename = screen.getByRole('textbox', { name: 'Folder name' });
    fireEvent.change(rename, { target: { value: 'Contests' } });
    fireEvent.blur(rename);
    await waitFor(() => expect(service.renameFolder).toHaveBeenCalledWith('personal', 'f1', 'Contests'));

    fireEvent.click(screen.getByRole('button', { name: 'Empty one options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete folder/ }));
    await waitFor(() => expect(service.removeFolder).toHaveBeenCalledWith('personal', 'f2'));
  });

  it('says why when the server says no', async () => {
    service.create.mockResolvedValue({ success: false, message: "That's 30 pages, the most there can be." });
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'New page' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('30 pages');
  });
});
