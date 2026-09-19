/**
 * The surface a page's content sits on.
 *
 * Replaces the `.card` class that lived in styles/dashboard.css — which only
 * existed on pages that happened to have loaded the dashboard's stylesheet —
 * with one that every page gets from styles/ui.css. A page adds its own class
 * for layout; the surface, border, radius and shadow are this component's.
 */
import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** `section` by default: a card is usually a titled region of the page. */
  as?: 'section' | 'div' | 'article' | 'aside';
  children?: ReactNode;
}

export function Card({ as: Tag = 'section', className, ...rest }: CardProps) {
  return <Tag className={className ? `ui-card ${className}` : 'ui-card'} {...rest} />;
}
