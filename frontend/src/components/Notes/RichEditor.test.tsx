/**
 * The seeding rule, which is the one thing this component can get badly wrong.
 *
 * A `contenteditable` cannot be a controlled input: writing `innerHTML` on
 * every keystroke destroys the caret and the browser's undo stack. So the
 * element owns its DOM and React only seeds it — and the whole question is
 * *when*. Seed too eagerly and every keystroke resets the note under the
 * cursor. Seed too rarely and opening a second note leaves the first one on
 * screen. Both are silent, and both look like the editor eating your writing.
 */
import { fireEvent, render as draw, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { RichEditor } from './RichEditor';

function Harness(props: {
  value: string;
  noteKey: string;
  onChange: (md: string) => void;
}) {
  const ref = createRef<HTMLDivElement>();
  return (
    <MemoryRouter initialEntries={['/notes']}>
      <Routes>
        <Route
          path="/notes"
          element={
            <RichEditor
              value={props.value}
              noteKey={props.noteKey}
              readOnly={false}
              placeholder="Write it here."
              onChange={props.onChange}
              onCaret={() => {}}
              innerRef={ref}
            />
          }
        />
        <Route path="/tasks" element={<p>the task board</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const surface = () => screen.getByRole('textbox', { name: 'Note' });

describe('seeding', () => {
  it('draws the note rendered, not as its source', () => {
    draw(<Harness value="## A heading" noteKey="n1" onChange={() => {}} />);
    expect(surface().querySelector('h2')).toHaveTextContent('A heading');
    expect(surface().textContent).not.toContain('##');
  });

  it('does not redraw under the writer on their own keystroke', async () => {
    /* The real loop: the page holds the Markdown in state, the editor hands it
       up on every input, and it comes straight back down as a new `value`. If
       that round trip re-seeded, every keystroke would rebuild the paragraph
       the caret is in — so the assertion is on the element's identity.

       The keystroke is delivered as the browser delivers one — the text node
       changes, then `input` fires — rather than through userEvent, which does
       not type into a populated `contenteditable` under jsdom. */
    function Live() {
      const [value, setValue] = useState('one');
      return <Harness value={value} noteKey="n1" onChange={setValue} />;
    }
    draw(<Live />);

    const paragraph = surface().firstElementChild!;
    paragraph.firstChild!.nodeValue = 'one two';
    fireEvent.input(surface());

    await waitFor(() => expect(surface().textContent).toContain('one two'));
    expect(surface().firstElementChild).toBe(paragraph);
  });

  it('redraws when the value changed somewhere else, as undo does', () => {
    const { rerender } = draw(<Harness value="one" noteKey="n1" onChange={() => {}} />);
    expect(surface().textContent).toContain('one');
    rerender(<Harness value="# back again" noteKey="n1" onChange={() => {}} />);
    expect(surface().querySelector('h1')).toHaveTextContent('back again');
  });

  it('redraws for a different note holding identical text', () => {
    const { rerender } = draw(<Harness value="same" noteKey="n1" onChange={() => {}} />);
    const first = surface().firstElementChild;
    rerender(<Harness value="same" noteKey="n2" onChange={() => {}} />);
    // A new element, not the one the other note left behind.
    expect(surface().firstElementChild).not.toBe(first);
    expect(surface().textContent).toContain('same');
  });

  it('marks an empty note so the placeholder can be drawn', () => {
    draw(<Harness value="" noteKey="n1" onChange={() => {}} />);
    expect(surface()).toHaveClass('is-empty');
    expect(surface()).toHaveAttribute('data-placeholder', 'Write it here.');
  });
});

describe('typing', () => {
  it('hands up Markdown rather than HTML', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    draw(<Harness value="" noteKey="n1" onChange={onChange} />);

    await user.click(surface());
    await user.keyboard('hello');

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const last = onChange.mock.calls.at(-1)![0] as string;
    expect(last).toContain('hello');
    expect(last).not.toContain('<');
  });
});

describe('links', () => {
  it('follows an in-app link through the router', async () => {
    const user = userEvent.setup();
    draw(
      <Harness value="see [the task](/tasks?task=a1b2)" noteKey="n1" onChange={() => {}} />,
    );
    await user.click(screen.getByText('the task'));
    expect(await screen.findByText('the task board')).toBeInTheDocument();
  });

  it('leaves the caret in the link when Alt is held, so it can be edited', async () => {
    const user = userEvent.setup();
    draw(
      <Harness value="see [the task](/tasks?task=a1b2)" noteKey="n1" onChange={() => {}} />,
    );
    await user.keyboard('{Alt>}');
    await user.click(screen.getByText('the task'));
    await user.keyboard('{/Alt}');
    expect(screen.queryByText('the task board')).toBeNull();
  });
});
