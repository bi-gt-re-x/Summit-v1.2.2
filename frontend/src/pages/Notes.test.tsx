/**
 * What the writer is looking at, and what the note holds because of it.
 *
 * The page's own tests are about the two things a rendered editor can get
 * wrong that a textarea could not. First, that the syntax is not on screen:
 * the note is Markdown and the surface shows the note, so `##` and
 * `[x]{red}` must not appear as text anywhere in the editor. Second, that a
 * link is a place rather than punctuation — `[a](b)` is not something a reader
 * should ever see, and the thing they click has to go where it points.
 *
 * The toolbar's font and size labels are here too, and they are older than the
 * rest: "the font selector is literally gone" was reported about a control
 * that was in the DOM the whole time, because it read "Font" before you
 * pressed it and "Font" after. A control whose label never moves is
 * indistinguishable from a dead one.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';

const NOTE = {
  id: 'n1',
  title: 'A note',
  body: '## A heading\n\n[Revise integrals]{red s24} and [the task](/tasks?task=a1b2)',
  note_date: '',
  subject_ids: '',
  notebook: '',
  pinned: false,
  created_at: '2026-09-01 10:00:00',
  updated_at: '2026-09-01 10:00:00',
};

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    notes: {
      list: () => Promise.resolve({ success: true, notes: [NOTE] }),
      save: () => Promise.resolve({ success: true, note: NOTE }),
      remove: () => Promise.resolve({ success: true }),
    },
  };
});

import Notes from './Notes';

describe('the notes toolbar', () => {
  it('draws a font and a size selector', async () => {
    renderWithProviders(<Notes />);
    expect(await screen.findByLabelText('Font')).toBeInTheDocument();
    expect(await screen.findByLabelText('Font size')).toBeInTheDocument();
  });

  it('opens on the note defaults, so the labels are never blank', async () => {
    renderWithProviders(<Notes />);
    expect(await screen.findByLabelText('Font')).toHaveTextContent('Inter');
    expect(await screen.findByLabelText('Font size')).toHaveTextContent('14');
  });

  it('offers a link button', async () => {
    renderWithProviders(<Notes />);
    expect(await screen.findByLabelText('Link')).toBeInTheDocument();
  });
});

describe('the editor shows the note and not its source', () => {
  /** The editable surface, which is the only thing the writer reads. */
  const surface = async () => await screen.findByRole('textbox', { name: 'Note' });

  it('draws a heading as a heading', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Notes />);
    await user.click(await screen.findByText('A note'));

    const editor = await surface();
    await waitFor(() => expect(editor.querySelector('h2')).not.toBeNull());
    expect(editor.querySelector('h2')).toHaveTextContent('A heading');
  });

  it('shows no Markdown punctuation anywhere in it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Notes />);
    await user.click(await screen.findByText('A note'));

    const editor = await surface();
    await waitFor(() => expect(editor.textContent).toContain('Revise integrals'));

    const shown = editor.textContent ?? '';
    // The four shapes the old textarea put in front of the writer.
    expect(shown).not.toContain('##');
    expect(shown).not.toContain('{red');
    expect(shown).not.toContain('s24}');
    expect(shown).not.toContain('](/tasks');
    expect(shown).not.toContain('<p>');
  });

  it('carries the font and the size as classes rather than as words', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Notes />);
    await user.click(await screen.findByText('A note'));

    const editor = await surface();
    await waitFor(() => expect(editor.querySelector('.md-c-red')).not.toBeNull());
    const span = editor.querySelector('.md-c-red')!;
    expect(span).toHaveClass('md-s-24');
    expect(span.textContent).toBe('Revise integrals');
  });

  it('draws a task link as a pill that points at the board', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Notes />);
    await user.click(await screen.findByText('A note'));

    const editor = await surface();
    await waitFor(() => expect(editor.querySelector('a.md-link')).not.toBeNull());
    const link = editor.querySelector('a.md-link')!;
    expect(link).toHaveClass('is-task');
    expect(link.textContent).toBe('the task');
    // In the app, not away from it.
    expect(link.getAttribute('data-nav')).toBe('/tasks?task=a1b2');
    expect(link.getAttribute('target')).toBeNull();
  });
});
