/**
 * Driving a space page's block fields in tests.
 *
 * Code blocks are textareas; every other block is a rich-text div
 * (components/Spaces/BlockEditor). These read and type into either the same
 * way, with the caret given as an offset into the visible words.
 */
import { fireEvent } from '@testing-library/react';
import { setSelection } from '@/components/Spaces/richDom';

export type BlockField = HTMLElement;

/** The words a field shows. */
export const textOf = (field: BlockField): string =>
  field instanceof HTMLTextAreaElement ? field.value : field.textContent ?? '';

/** Put the caret (or a selection) at visible offsets. */
export function placeCaret(field: BlockField, start: number, end = start): void {
  if (field instanceof HTMLTextAreaElement) field.setSelectionRange(start, end);
  else setSelection(field, start, end);
}

/** Replace the field's words as typing would, leaving the caret at `caret`. */
export function typeInto(field: BlockField, value: string, caret = value.length): void {
  if (field instanceof HTMLTextAreaElement) {
    fireEvent.change(field, { target: { value, selectionStart: caret, selectionEnd: caret } });
    return;
  }
  field.textContent = value;
  placeCaret(field, caret);
  fireEvent.input(field);
}

/** Press a key with the caret at `at`. */
export function pressAt(field: BlockField, key: string, at: number, extra: Record<string, boolean> = {}): void {
  placeCaret(field, at);
  fireEvent.keyDown(field, { key, ...extra });
}
