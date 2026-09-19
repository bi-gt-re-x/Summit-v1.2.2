/**
 * "Are you sure?", asked in the app rather than by the browser.
 *
 * `window.confirm` stopped the whole page with a grey system box that could
 * not be styled, named the site's address as its title, and looked different
 * in every browser. `ConfirmDialog` is the same question in the app's own
 * dialog, and `useConfirm` keeps the one-line call shape `window.confirm` had:
 *
 *     const [confirm, confirmDialog] = useConfirm();
 *     if (!(await confirm({ title: 'Delete “Essay”?', confirmLabel: 'Delete', danger: true }))) return;
 *     …
 *     return <>{page}{confirmDialog}</>;
 *
 * The element has to be rendered by the caller — a hook cannot put anything
 * on the page by itself — and renders nothing until a question is open.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

export interface ConfirmOptions {
  title: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Paints the confirm button red and puts the focus on Cancel. */
  danger?: boolean;
}

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={body}
      role="alertdialog"
      actions={
        <>
          <Button variant="ghost" onClick={onCancel} data-autofocus={danger ? '' : undefined}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
            data-autofocus={danger ? undefined : ''}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [asking, setAsking] = useState<ConfirmOptions | null>(null);
  const settle = useRef<((answer: boolean) => void) | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        // A second question while one is open answers the first with no.
        settle.current?.(false);
        settle.current = resolve;
        setAsking(options);
      }),
    [],
  );

  const answer = (value: boolean) => {
    settle.current?.(value);
    settle.current = null;
    setAsking(null);
  };

  const element = (
    <ConfirmDialog
      open={asking !== null}
      title={asking?.title ?? ''}
      body={asking?.body}
      confirmLabel={asking?.confirmLabel}
      cancelLabel={asking?.cancelLabel}
      danger={asking?.danger}
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    />
  );

  return [confirm, element];
}
