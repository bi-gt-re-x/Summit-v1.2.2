/**
 * A modal dialog.
 *
 * Each dialog in the app used to build its own backdrop, and each got a
 * different subset of what a modal owes the reader: some closed on Escape and
 * some did not, some returned focus to the button that opened them, none kept
 * Tab inside. This one does all of it once:
 *
 * - rendered into `document.body`, so no ancestor's `overflow` or `transform`
 *   can clip it;
 * - Escape and a click on the backdrop close it (unless `dismissable` is off);
 * - focus moves in on open — to `[data-autofocus]` if there is one, otherwise
 *   the first control — stays in while Tab cycles, and goes back to whatever
 *   had it before on close;
 * - the page behind does not scroll while it is open.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** A sentence under the title, read out with it. */
  description?: ReactNode;
  /** The buttons along the bottom, right-aligned. */
  actions?: ReactNode;
  children?: ReactNode;
  /** `alertdialog` for a question that interrupts, such as a deletion. */
  role?: 'dialog' | 'alertdialog';
  /** Off when the reader must answer — Escape and the backdrop do nothing. */
  dismissable?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  actions,
  children,
  role = 'dialog',
  dismissable = true,
  size = 'sm',
  className,
}: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  // The latest handler without re-running the focus effect when a parent
  // passes a new arrow function on every render.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement as HTMLElement | null;
    const node = panel.current;
    const first =
      node?.querySelector<HTMLElement>('[data-autofocus]') ??
      node?.querySelector<HTMLElement>(FOCUSABLE) ??
      node;
    first?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissable) {
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const head = items[0]!;
      const tail = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);

    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [open, dismissable]);

  if (!open) return null;

  return createPortal(
    <div
      className="ui-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (dismissable && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className={`ui-dialog ui-dialog-${size}${className ? ` ${className}` : ''}`}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <h2 id={titleId} className="ui-dialog-title">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="ui-dialog-description">
            {description}
          </p>
        )}
        {children}
        {actions && <div className="ui-dialog-actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
