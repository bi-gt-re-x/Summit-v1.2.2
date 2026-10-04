/**
 * The three small pieces the chapters share.
 *
 * This file was the panels around the growth chart — a summary tile row, a
 * category donut, an XP heatmap, a milestone list, a long-term panel, a range
 * picker, an export button, a skills panel with five hard-coded rows. All of it
 * belonged to that page's Overview, and that Overview is gone: every question
 * it answered is answered at higher resolution on a tab of the analytics page,
 * which is the whole argument the merge rested on. The panels went with it.
 *
 * What is left is what the four chapters actually import — an icon, a hint
 * bubble, and a figure that counts up to itself. The chapters are the growth
 * page's real content and they moved across intact.
 *
 * The icons are inline SVG rather than emoji. Emoji are a different typeface
 * on every platform, they carry their own colour, and a row of them at 12px is
 * a row of blobs — which is the whole of why the panels looked homemade beside
 * the design. One stroke weight, one size, `currentColor`, and the tone class
 * on the tile decides what colour that is.
 */
import { useCountUp } from '@/hooks';

// --------------------------------------------------------------------------
// Icons
// --------------------------------------------------------------------------
/** One stroke weight, one box, `currentColor`. See the note at the top. */
const PATHS: Record<string, string> = {
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  spark: 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z',
  check: 'M9 12l2 2 4-4M12 3a9 9 0 100 18 9 9 0 000-18z',
  target: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8zM12 11.5a.5.5 0 100 1 .5.5 0 000-1z',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
  flame: 'M12 3s5 4 5 9a5 5 0 01-10 0c0-2 1-3 1-3s1 1 2 1 2-3 2-7z',
  trophy: 'M7 4h10v4a5 5 0 01-10 0zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M9 20h6M12 13v7',
  award: 'M12 3a5 5 0 100 10 5 5 0 000-10zM9 13l-1 8 4-2 4 2-1-8',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0012 3z',
  alert: 'M12 3l9 16H3zM12 9v4M12 16.5v.5',
  info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v5M12 7.5v.5',
  download: 'M12 4v11M8 11l4 4 4-4M4 19h16',
  calendar: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
};

export function Glyph({ name, size = 15 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      className="gr-glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? PATHS.info!} />
    </svg>
  );
}

/** The ⓘ beside a panel title, explaining what the panel is counting. */
export function Hint({ text }: { text: string }) {
  return (
    <span className="gr-hint" title={text} aria-hidden="true">
      <Glyph name="info" size={13} />
    </span>
  );
}

// --------------------------------------------------------------------------
// A counting figure
// --------------------------------------------------------------------------
/**
 * A figure that arrives by counting up to itself.
 *
 * Its own component because `useCountUp` is a hook and the tiles are a `map` —
 * and because the tween has to be per figure: four values counting at once
 * from one shared clock would all land together whatever they started from.
 *
 * The hook counts from zero on first paint and tweens between values after
 * that, so this animates when the page arrives *and* when the range changes,
 * which are the two moments the number is genuinely different. It settles on
 * `Math.round`, so what is displayed is the figure itself and not a tween
 * artefact — see hooks/useCountUp for why the value handed in should already
 * be at display precision.
 */
export function CountValue({
  value,
  className,
  suffix = '',
}: {
  value: number;
  className?: string;
  suffix?: string;
}) {
  const shown = useCountUp(value);
  return (
    <strong className={className}>
      {Math.round(shown).toLocaleString()}
      {suffix}
    </strong>
  );
}
