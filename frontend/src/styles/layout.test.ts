/**
 * Every signed-in page fills the width beside the rail — by default, in one
 * place (styles/layout.css), not by each page remembering to.
 *
 * Eleven pages carried their own `body:has(.their-page) > #root` rule and
 * each documented the trap it fixed; Tasks and the skill tree had none.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const STYLES = join(process.cwd(), 'frontend', 'src', 'styles');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith('.css')) out.push(path);
  }
  return out;
}

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('the page width', () => {
  it('is filled by default for every page with the rail', () => {
    const layout = strip(readFileSync(join(STYLES, 'layout.css'), 'utf8'));
    expect(layout).toMatch(/body\.has-rail > #root,\s*body\.has-rail \.app-main\s*\{[^}]*width: 100%/);
  });

  it('is not patched page by page any more', () => {
    const patched = walk(STYLES)
      .filter((path) => /body:has\([^)]*\)\s*(> #root|\.app-main)/.test(strip(readFileSync(path, 'utf8'))))
      .map((path) => relative(STYLES, path));
    // The sign-in page has no rail, so the default does not reach it.
    expect(patched).toEqual(['auth.css']);
  });
});
