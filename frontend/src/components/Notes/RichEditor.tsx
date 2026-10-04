/**
 * The note, rendered and editable at the same time.
 *
 * ## What this replaced, and why
 *
 * A `<textarea>` holding the note's Markdown. It had one real virtue — what
 * you edited was exactly what was stored — and one cost that turned out to be
 * larger: the syntax was on screen. Writing a red heading meant looking at
 * `## [Revise integrals]{red}` while writing the words "Revise integrals",
 * and the only person who never needed to see the brackets was the person
 * typing between them.
 *
 * So the editable surface holds the *rendered* note now, and the Markdown is
 * derived from it (utils/htmlToMarkdown) rather than typed into. Nothing about
 * how a note is stored changed: still one plain-text column, still readable as
 * itself, still the thing `render` reads. What changed is which of the two
 * the writer is looking at.
 *
 * ## Uncontrolled, on purpose
 *
 * A `contenteditable` cannot be a controlled React input. Writing `innerHTML`
 * on every keystroke destroys the caret and the browser's own undo stack, and
 * the caret is the one thing a writer is holding on to. So the element owns
 * its DOM: React seeds it, the browser edits it, and every input is read back
 * out as Markdown and handed up.
 *
 * `lastEmitted` is what makes that safe. The parent's `value` comes back down
 * on every keystroke — it is React state — and re-seeding on it would be the
 * per-keystroke `innerHTML` write this is avoiding. So a `value` the editor
 * itself just produced is ignored, and one it did not is a real outside change
 * (a note opened, a template loaded, undo pressed) and does re-seed.
 *
 * `noteKey` covers the case `lastEmitted` cannot see: two different notes
 * whose text happens to be identical, which without it would leave the first
 * one's DOM on screen under the second one's id.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { render } from '@/utils/markdown';
import { toMarkdown } from '@/utils/htmlToMarkdown';
import { autoformat, toggleBox } from './editing';

/** What an empty note is seeded with, so there is a line to put the caret in. */
const EMPTY = '<p><br></p>';

interface Props {
  /** The note's Markdown. */
  value: string;
  /** Changes when the reader is put in front of a different note. */
  noteKey: string | number;
  readOnly: boolean;
  placeholder: string;
  onChange: (markdown: string) => void;
  /** Every caret move, so the toolbar's labels can follow it. */
  onCaret: () => void;
  innerRef: React.RefObject<HTMLDivElement | null>;
}

export function RichEditor({
  value, noteKey, readOnly, placeholder, onChange, onCaret, innerRef,
}: Props) {
  const navigate = useNavigate();
  const lastEmitted = useRef<string | null>(null);
  const seeded = useRef<string>('');

  useEffect(() => {
    const host = innerRef.current;
    if (!host) return;
    const fresh = String(noteKey) !== seeded.current;
    if (!fresh && value === lastEmitted.current) return;
    host.innerHTML = render(value) || EMPTY;
    seeded.current = String(noteKey);
    lastEmitted.current = value;
  }, [innerRef, noteKey, value]);

  const emit = useCallback(() => {
    const host = innerRef.current;
    if (!host) return;
    const markdown = toMarkdown(host);
    lastEmitted.current = markdown;
    onChange(markdown);
  }, [innerRef, onChange]);

  /**
   * A link goes where it points.
   *
   * Which is the whole reason for having one, and is not what a
   * `contenteditable` does on its own — it puts the caret in the text. Alt
   * held is the way back to that, for editing the words inside a link.
   *
   * In-app addresses go through the router rather than the browser: `/tasks`
   * is a route this single page already serves, and letting the anchor follow
   * itself would reload the entire app to show a page it was holding.
   */
  const onClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const hit = event.target as HTMLElement;
      // A box is ticked by clicking it, which is what a box is for.
      if (!readOnly && toggleBox(hit)) {
        event.preventDefault();
        emit();
        return;
      }
      const anchor = hit.closest?.('a');
      if (!anchor) return;
      /* Alt is the way into a link's text. The caret is placed by the mouse
         down that preceded this, so all that is left to do is stop the anchor
         following itself — browsers disagree about whether one inside a
         `contenteditable` does. */
      if (event.altKey) {
        event.preventDefault();
        return;
      }
      const route = anchor.getAttribute('data-nav');
      if (!route) return; // External: let the browser open it in its new tab.
      event.preventDefault();
      navigate(route);
    },
    [emit, navigate, readOnly],
  );

  /**
   * Paste as text.
   *
   * What is on a clipboard from a web page is that page's HTML — its classes,
   * its fonts, its inline styles — and dropping it into the editor would put
   * all of it in front of the serialiser. `htmlToMarkdown` would throw away
   * everything it does not recognise, which is most of it, so the honest
   * version is to take the text in the first place and let the reader format
   * it here.
   */
  const onPaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      const text = event.clipboardData.getData('text/plain');
      if (!text) return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      range.deleteContents();

      // Blank lines are paragraph breaks; single ones are line breaks. Both
      // are shapes `toMarkdown` reads straight back out.
      const held = document.createDocumentFragment();
      const lines = text.replace(/\r\n?/g, '\n').split('\n');
      lines.forEach((line, at) => {
        if (at > 0) held.append(document.createElement('br'));
        if (line) held.append(document.createTextNode(line));
      });
      range.insertNode(held);
      selection.collapseToEnd();
      emit();
    },
    [emit],
  );

  /* The shorthands, caught at the space that completes them. See `autoformat`. */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const host = innerRef.current;
      if (!host || event.key !== ' ' || event.metaKey || event.ctrlKey) return;
      if (autoformat(host)) {
        event.preventDefault();
        emit();
      }
    },
    [emit, innerRef],
  );

  return (
    <div
      ref={innerRef}
      className={`nt-rich${value.trim() ? '' : ' is-empty'}${readOnly ? ' is-reading' : ''}`}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Note"
      aria-readonly={readOnly}
      data-placeholder={placeholder}
      spellCheck
      title={readOnly ? undefined : 'Click a link to follow it. Hold Alt to put the caret in one.'}
      onInput={emit}
      onBlur={emit}
      onClick={onClick}
      onPaste={onPaste}
      onKeyDown={onKeyDown}
      onKeyUp={onCaret}
      onMouseUp={onCaret}
    />
  );
}
