/**
 * Every signed-in page in the sidebar's look — styles/minimal.css.
 *
 * What is pinned is the handful of rules that make the look, each scoped to
 * `body.has-rail` so the landing and sign-in pages keep their own, and the
 * Graphite accent they lean on.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const minimal = read('./minimal.css').replace(/\/\*[\s\S]*?\*\//g, '');
const preferences = read('./preferences.css');
const main = read('../main.tsx');

/** Every selector in the sheet, one per alternative. */
const selectors = [...minimal.matchAll(/([^{}]+)\{/g)]
  .flatMap((match) => match[1]!.split(','))
  .map((selector) => selector.trim())
  .filter(Boolean);

describe('the minimal layer', () => {
  it('is loaded on every page', () => {
    expect(main).toContain("import '@/styles/minimal.css';");
  });

  it('touches signed-in pages only', () => {
    for (const selector of selectors) expect(selector).toMatch(/body\.has-rail/);
  });

  it('keeps the graph paper and takes the drifting wash and dots away', () => {
    expect(minimal).not.toMatch(/\.hm-ambient \{ display: none; \}/);
    expect(minimal).not.toMatch(/\.hm-grid \{ display: none; \}/);
    expect(minimal).toMatch(/body\.has-rail \.hm-gradient,\s*body\.has-rail \.hm-particles \{ display: none; \}/);
  });

  it('draws headers without their sky and mountains', () => {
    expect(minimal).toMatch(/body\.has-rail \.peak-scene \{ display: none; \}/);
    expect(minimal).toMatch(/body\.has-rail \.peak-hero \{[^}]*background-image: none/);
  });

  it('points a header\'s own colour at the accent', () => {
    expect(minimal).toMatch(/--peak-a: var\(--pref-accent/);
  });
});

describe('outer containers', () => {
  it('draw their rule at 1.5px, the cards a page is laid out in', () => {
    const rule = minimal.match(/([^{}]*)\{\s*border-width: 1\.5px;\s*\}/);
    expect(rule).not.toBeNull();
    for (const card of ['.ui-card', '.peak-hero', '.tk-stat', '.ag-card', '.ax-panel', '.wk-panel',
      '.mv-card', '.nt-editor', '.pom-panel', '.st-card', '.sp-members']) {
      expect(rule![1]).toContain(`body.has-rail ${card}`);
    }
  });

  it('leave list items inside a container at 1px', () => {
    const rule = minimal.match(/([^{}]*)\{\s*border-width: 1\.5px;\s*\}/)![1]!;
    expect(rule).not.toContain('.tk-row');
    expect(rule).not.toContain('.wk-event');
  });
});

describe('the Graphite accent', () => {
  it('is the sidebar\'s charcoal, in both themes', () => {
    expect(preferences).toMatch(/:root\[data-accent="graphite"\] \{ --pref-accent: #2C302E;/);
    expect(preferences).toMatch(/html\[data-theme="dark"\]:root\[data-accent="graphite"\]/);
  });
});
