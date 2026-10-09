/**
 * Colours and fills on a space's page — no React.
 *
 * Everything colourable (a sticky note, a shape, the cover, the page itself)
 * is filled from ONE colour and a style. The style turns that one colour into
 * a fade: lighter toward the bottom, a turn of the hue across a diagonal, a
 * glow from one corner, three soft lights, or a slow drift. Picking one colour
 * and a style is simpler than picking two stops, and every result still
 * belongs to the colour that was picked.
 *
 * The styles and their names are shared/rules.json, which the server checks.
 */
import type { CSSProperties } from 'react';
import { RULES } from '@/utils/sharedRules';

export type FillStyle = 'solid' | 'fade' | 'diagonal' | 'radial' | 'aurora' | 'flow';

export interface Fill {
  /** `#rrggbb`. */
  color: string;
  style: FillStyle;
}

export const FILL_STYLES: readonly FillStyle[] = RULES.spaces.fill_styles as FillStyle[];

export const STYLE_LABEL: Record<FillStyle, string> = {
  solid: 'Solid',
  fade: 'Fade',
  diagonal: 'Diagonal',
  radial: 'Radial',
  aurora: 'Aurora',
  flow: 'Flow',
};

export const STYLE_HINT: Record<FillStyle, string> = {
  solid: 'Just the colour.',
  fade: 'Lighter toward the bottom.',
  diagonal: 'The hue turns a little across it.',
  radial: 'A glow from the top corner.',
  aurora: 'Three soft lights in nearby hues.',
  flow: 'A slow drift through nearby hues.',
};

/** Quick picks under the picker. */
export const SWATCHES = [
  '#fde68a', '#fca5a5', '#f9a8d4', '#c4b5fd', '#93c5fd', '#67e8f9',
  '#86efac', '#bef264', '#fdba74', '#e5e7eb', '#475569', '#111827',
];

const HEX = /^#[0-9a-f]{6}$/i;

export const isHex = (value: unknown): value is string => typeof value === 'string' && HEX.test(value);

/** A hex as typed — with or without "#", three or six digits — or null. */
export function readHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(raw)) return `#${raw.split('').map((c) => c + c).join('')}`.toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`.toLowerCase();
  return null;
}

// --------------------------------------------------------------------------
// Colour arithmetic
// --------------------------------------------------------------------------
export interface Rgb { r: number; g: number; b: number }
export interface Hsv { h: number; s: number; v: number }

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (c: number) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Hue 0–360, saturation and value 0–1. */
export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export const hexToHsv = (hex: string): Hsv => rgbToHsv(hexToRgb(hex));
export const hsvToHex = (hsv: Hsv): string => rgbToHex(hsvToRgb(hsv));

/** `a` moved `t` of the way toward `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}
export const lighten = (hex: string, t: number) => mix(hex, '#ffffff', t);
export const darken = (hex: string, t: number) => mix(hex, '#000000', t);

/** The same colour with its hue turned by `degrees`. */
export function turn(hex: string, degrees: number): string {
  const hsv = hexToHsv(hex);
  return hsvToHex({ ...hsv, h: (hsv.h + degrees + 360) % 360 });
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Whether a fill reads as dark — what the words on it should be light against. */
export function isDark(fill: Fill): boolean {
  // A fade is lighter than its colour over most of its area.
  const seen = fill.style === 'fade' ? lighten(fill.color, 0.25) : fill.color;
  return luminance(seen) < 0.36;
}

/** Words that can be read on a fill. */
export const inkOn = (fill: Fill): string => (isDark(fill) ? '#ffffff' : '#1f2328');

// --------------------------------------------------------------------------
// One colour, as a background
// --------------------------------------------------------------------------
/** The CSS `background` a fill draws. */
export function fillBackground(fill: Fill): string {
  const c = fill.color;
  switch (fill.style) {
    case 'fade':
      return `linear-gradient(180deg, ${c} 0%, ${lighten(c, 0.6)} 100%)`;
    case 'diagonal':
      return `linear-gradient(135deg, ${turn(c, -28)} 0%, ${c} 50%, ${turn(c, 28)} 100%)`;
    case 'radial':
      return `radial-gradient(circle at 25% 20%, ${lighten(c, 0.45)} 0%, ${c} 45%, ${darken(c, 0.3)} 100%)`;
    case 'aurora':
      return [
        `radial-gradient(at 12% 18%, ${turn(lighten(c, 0.2), -45)} 0, transparent 55%)`,
        `radial-gradient(at 88% 12%, ${turn(lighten(c, 0.15), 45)} 0, transparent 50%)`,
        `radial-gradient(at 50% 100%, ${darken(c, 0.25)} 0, transparent 60%)`,
        c,
      ].join(', ');
    case 'flow':
      return `linear-gradient(120deg, ${turn(c, -30)}, ${c}, ${turn(c, 30)}, ${c}, ${turn(c, -30)})`;
    default:
      return c;
  }
}

/**
 * A fill as props for an element: its background, and for the animated style
 * a class (`sp-fill-flow`, in styles/spaces.css) that moves it.
 */
export function fillProps(fill: Fill): { style: CSSProperties; className: string } {
  const style: CSSProperties = { background: fillBackground(fill) };
  if (fill.style === 'flow') style.backgroundSize = '300% 300%';
  return { style, className: fill.style === 'flow' ? 'sp-fill-flow' : '' };
}

/** A fill as stored, or null when it is not one this page knows. */
export function cleanFill(raw: unknown): Fill | null {
  if (!raw || typeof raw !== 'object') return null;
  const { color, style } = raw as Partial<Fill>;
  if (!isHex(color)) return null;
  return { color: color.toLowerCase(), style: (FILL_STYLES as readonly string[]).includes(style as string) ? (style as FillStyle) : 'solid' };
}
