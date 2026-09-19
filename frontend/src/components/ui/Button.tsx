/**
 * The app's button.
 *
 * Every page used to draw its own — `.confirm-add-btn`, `.wk-confirm-delete`,
 * `.focus-confirm-btn`, a grey `#666` one with an inline style — so the same
 * action looked different depending on which page asked for it. Four variants
 * cover what the pages actually do: the one thing to do next (`primary`), the
 * other things (`secondary`), a quiet way out (`ghost`), and deleting
 * (`danger`). Styled in styles/ui.css from the shared tokens.
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Fill the width of the container, as a form's submit does. */
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', block = false, className, type = 'button', ...rest },
  ref,
) {
  const classes = ['ui-btn', `ui-btn-${variant}`, `ui-btn-${size}`];
  if (block) classes.push('ui-btn-block');
  if (className) classes.push(className);
  return <button ref={ref} type={type} className={classes.join(' ')} {...rest} />;
});
