/**
 * Every CSS variable a stylesheet reads is defined where the stylesheet can
 * reach it.
 *
 * The failure this guards: a component's styles read a variable only its home
 * page defines. The subject page's recommended-session cards took their
 * padding from `--sb-pad` and their colours from `--ax-*`, both declared on
 * the subject and analytics pages alone — so when the dashboard drew the same
 * cards they had no padding, and each page that borrowed them had to copy the
 * palette. Nothing failed; it just looked wrong.
 *
 * A `var(--x)` with no fallback passes when `--x` is declared in the same
 * sheet, in a sheet every page loads (main.tsx), from a component's inline
 * style, or in one of the sheets listed in SIBLINGS as always loaded with it.
 * Anything else needs a fallback (`var(--x, 20px)`) or a global definition
 * (tokens.css) — that is the fix, not a new SIBLINGS entry, unless the two
 * sheets genuinely only ever load together.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Tests run from the repository root (vitest.config.ts).
const SRC = join(process.cwd(), 'frontend', 'src');
const STYLES = join(SRC, 'styles');

/** Sheets that are only ever loaded together, so may read each other's variables. */
const SIBLINGS: Record<string, string[]> = {
  // The calendar views import the shell and the event palette with themselves.
  'calendar/day.css': ['calendar/shell.css', 'calendar/palette.css'],
  'calendar/week.css': ['calendar/shell.css', 'calendar/palette.css'],
  'calendar/month.css': ['calendar/shell.css', 'calendar/palette.css'],
  // Notes draws subject tags, which import the event palette (components/Notes/SubjectTags).
  'notes.css': ['calendar/palette.css'],
  // The landing page's sheets load as one.
  'homepage.css': ['ambient.css'],
  'home-minimal.css': ['homepage.css'],
  'home-motion.css': ['homepage.css', 'home-minimal.css', 'ambient.css'],
  // Only on the subject page, beside subject.css.
  'subject-objective.css': ['subject.css'],
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const sheets = walk(STYLES).filter((path) => path.endsWith('.css'));
const name = (path: string) => relative(STYLES, path);
const defined = new Map(sheets.map((path) => [name(path), new Set(
  [...strip(readFileSync(path, 'utf8')).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!),
)]));

const main = readFileSync(join(SRC, 'main.tsx'), 'utf8');
const everywhere = new Set(
  [...main.matchAll(/import '@\/styles\/([\w/-]+\.css)'/g)].flatMap((m) => [...(defined.get(m[1]!) ?? [])]),
);

const code = walk(SRC)
  .filter((path) => /\.tsx?$/.test(path) && !path.includes('.test.'))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');
const inline = new Set([...code.matchAll(/['"`](--[\w-]+)['"`]/g)].map((m) => m[1]!));

describe('CSS variables', () => {
  it('are defined wherever a sheet reads them without a fallback', () => {
    const unreachable: string[] = [];
    for (const path of sheets) {
      const sheet = name(path);
      const reach = new Set([...(defined.get(sheet) ?? []), ...everywhere, ...inline,
        ...(SIBLINGS[sheet] ?? []).flatMap((other) => [...(defined.get(other) ?? [])])]);
      for (const match of strip(readFileSync(path, 'utf8')).matchAll(/var\((--[\w-]+)\s*\)/g)) {
        if (!reach.has(match[1]!)) unreachable.push(`${sheet}: ${match[1]}`);
      }
    }
    expect([...new Set(unreachable)]).toEqual([]);
  });
});
