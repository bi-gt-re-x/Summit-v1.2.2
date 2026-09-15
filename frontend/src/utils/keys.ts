/**
 * The one question every letter shortcut in the app has to ask first.
 *
 * A single-key binding is only ever a shortcut when the reader is not typing.
 * The moment they are, the same keystroke is a letter they meant to put in a
 * title — and a page that steps the week, or clears a selection, because
 * somebody wrote "just the notes" has not added a shortcut, it has added a
 * fault.
 *
 * Extracted from hooks/useCalendarKeys, which had it first and had it alone
 * until the lattice wanted the same rule. Two copies of this would have been
 * two chances to forget the `contenteditable` half, which is the half nobody
 * remembers.
 */

/** True when the keystroke belongs to something the reader is typing into. */
export function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  /* `isContentEditable` first, because it is the property that knows about
     inheritance — but it is not implemented everywhere the tests run, and it
     is a property rather than an attribute, so the attribute is checked as
     well. `closest` rather than a look at the element itself: a keystroke
     inside a rich field lands on whatever node the caret is in, which is
     usually a child of the editable one. */
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable]:not([contenteditable="false"])'));
}

/** True when the key belongs to the browser or the OS rather than to us. */
export function claimed(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey;
}
