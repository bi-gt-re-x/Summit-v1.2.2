/**
 * The calendar's page colour is the theme's, whichever view is opened first.
 *
 * It was not. shell.css, which all three views load, painted the page
 * near-black by default, and the only rule that turned it white lived in
 * month.css, which only the Month view loads. A stylesheet imported by a route
 * stays in the document once it has loaded, so the calendar was white if the
 * Month view had been opened since the last reload and black if it had not.
 * Open the Week view first, or reload on it, and a light-theme page came up on
 * a black ground with every light-theme colour on it looking inverted.
 *
 * Nothing else would catch this. Every rule was correct in its own file; the
 * bug only existed in the order the files happened to load in. So what is
 * pinned is where the decision is made — one sheet every view loads — and which
 * way it defaults.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Every stylesheet a calendar view imports. See pages/Calendar/. */
const SHEETS = ['shell', 'dialogs', 'overview', 'week', 'day', 'month', 'palette'];
const VIEWS = ['Week', 'Day', 'Month'];

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

interface Rule {
  /** One selector of the rule's list, trimmed. */
  selector: string;
  body: string;
}

/**
 * Every `selector { declarations }` in a sheet, one entry per selector in a
 * list. Comments are dropped first; a media block's braces are looked through,
 * because the innermost pair is always a rule.
 */
function rules(css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((match) =>
    match[1]!.split(',').map((selector) => ({ selector: selector.trim(), body: match[2]! })),
  );
}

function property(body: string, name: 'background' | 'color'): string | null {
  const pattern =
    name === 'background'
      ? /background(?:-color)?\s*:\s*([^;]+)/
      : /(?:^|[;\s])color\s*:\s*([^;]+)/;
  return body.match(pattern)?.[1]?.trim() ?? null;
}

/** WCAG relative luminance of a #rrggbb colour: 0 is black, 1 is white. */
function luminance(colour: string): number {
  const hex = colour.match(/^#([0-9a-f]{6})\b/i)?.[1];
  if (!hex) throw new Error(`expected a #rrggbb color, got "${colour}"`);
  const [r, g, b] = [0, 2, 4]
    .map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** A rule whose subject is the calendar's page itself, in any theme. */
const PAGE =
  /^(html(\[data-theme="(light|dark)"\]|:not\(\[data-theme="dark"\]\))\s+)?body[\w.-]*:has\(\.calendar-container\)$/;

/** A rule that paints the whole app's page from a calendar sheet. */
const EVERY_PAGE = /^html\[data-theme="(light|dark)"\]\s+body$|^body(\.[\w-]+)?$/;

describe("the calendar's page color", () => {
  it('is decided in a sheet every view loads', () => {
    for (const view of VIEWS) {
      expect(read(`../../pages/Calendar/${view}.tsx`), `${view} view`).toContain(
        "import '@/styles/calendar/shell.css';",
      );
    }
  });

  it('is decided nowhere else, so the order views are opened in cannot change it', () => {
    for (const sheet of SHEETS.filter((name) => name !== 'shell')) {
      const painted = rules(read(`./${sheet}.css`)).filter(
        (rule) =>
          (PAGE.test(rule.selector) || EVERY_PAGE.test(rule.selector)) &&
          property(rule.body, 'background'),
      );
      expect(painted.map((rule) => rule.selector), `${sheet}.css`).toEqual([]);
    }
  });

  it('is light unless the theme says dark', () => {
    const shell = rules(read('./shell.css'));
    const colour = (selector: string) =>
      shell
        .filter((rule) => rule.selector === selector)
        .map((rule) => property(rule.body, 'background'))
        .filter((value): value is string => Boolean(value));

    // No default for another rule to correct: the bare selector paints nothing.
    expect(colour('body:has(.calendar-container)')).toEqual([]);

    const light = colour('html:not([data-theme="dark"]) body:has(.calendar-container)');
    const dark = colour('html[data-theme="dark"] body:has(.calendar-container)');

    expect(light).toHaveLength(1);
    expect(luminance(light[0]!)).toBeGreaterThan(0.8);
    expect(dark).toHaveLength(1);
    expect(luminance(dark[0]!)).toBeLessThan(0.05);
  });

  it("gives the card's text the same default", () => {
    const shell = rules(read('./shell.css'));
    const ink = (selector: string) =>
      shell
        .filter((rule) => rule.selector === selector)
        .map((rule) => property(rule.body, 'color'))
        .filter((value): value is string => Boolean(value));

    // Dark ink on the light default, light ink only under the dark theme.
    expect(ink('.calendar-card').map(luminance).every((l) => l < 0.1)).toBe(true);
    expect(ink('html[data-theme="dark"] .calendar-card').map(luminance)).toEqual([
      expect.any(Number),
    ]);
    expect(luminance(ink('html[data-theme="dark"] .calendar-card')[0]!)).toBeGreaterThan(0.8);
  });
});
