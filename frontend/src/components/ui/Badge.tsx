/**
 * A small label with a tone: a trend, a status, a count.
 *
 * The tone is what the badge means rather than what colour it is, so a page
 * says `success` and the palette decides the green — and the dark theme
 * decides a different one without the page knowing.
 */
import type { HTMLAttributes } from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  const classes = `ui-badge ui-badge-${tone}${className ? ` ${className}` : ''}`;
  return <span className={classes} {...rest} />;
}
