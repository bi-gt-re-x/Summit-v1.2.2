/**
 * The app's building blocks: the button, the card, the badge, the figure and
 * the dialog every page draws with, styled once in styles/ui.css from the
 * tokens in styles/tokens.css.
 *
 * Unlike the speculative kit components/index.ts describes deleting, each of
 * these was written for pages that already needed it — the dashboard's cards,
 * the calendar's and the goals page's confirmations, and the browser
 * `confirm()` boxes they replace.
 */
export { Badge } from './Badge';
export type { BadgeProps, BadgeTone } from './Badge';
export { Button } from './Button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button';
export { Card } from './Card';
export type { CardProps } from './Card';
export { ConfirmDialog, useConfirm } from './Confirm';
export type { ConfirmDialogProps, ConfirmOptions } from './Confirm';
export { Dialog } from './Dialog';
export type { DialogProps } from './Dialog';
export { Stat } from './Stat';
export type { StatProps } from './Stat';
