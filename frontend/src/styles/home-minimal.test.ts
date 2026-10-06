/**
 * The landing page's quieter layer — styles/home-minimal.css.
 *
 * The page keeps every section and every motion; what is pinned is the
 * handful of rules that take the decoration away, and that the background
 * layer is not mounted on the route at all.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const sheet = read('./home-minimal.css').replace(/\/\*[\s\S]*?\*\//g, '');
const page = read('../pages/Homepage.tsx');
const app = read('../App.tsx');

describe('the quieter landing page', () => {
  it('is loaded after the two sheets it quiets', () => {
    const at = (name: string) => page.indexOf(`import '@/styles/${name}';`);
    expect(at('home-minimal.css')).toBeGreaterThan(at('homepage.css'));
    expect(at('home-minimal.css')).toBeGreaterThan(at('home-motion.css'));
  });

  it('has no graph paper or drifting field behind it', () => {
    expect(app).toContain("pathname !== '/home' && <Ambient />");
  });

  it('takes the mountains and the washes off the hero and the closing call', () => {
    expect(sheet).toMatch(/\.home-main \.lp-hero-scene \{ display: none; \}/);
    expect(sheet).toMatch(/\.home-main \.lp-final-scene \{ display: none; \}/);
    expect(sheet).toMatch(/\.home-main \.lp-final::before \{ display: none; \}/);
  });

  it('gives its buttons fixed ink, so an account accent cannot make them unreadable', () => {
    expect(sheet).toMatch(/\.home-main \.lp-btn-primary \{[^}]*background: #1F2328;[^}]*color: #FFFFFF/);
    expect(sheet).toMatch(/html\[data-theme="dark"\] \.home-main \.lp-btn-primary \{ background: #E6EDF3; color: #0d1117; \}/);
  });

  it('reaches nothing outside the landing page', () => {
    const selectors = [...sheet.matchAll(/([^{}]+)\{/g)]
      .flatMap((match) => match[1]!.split(','))
      .map((selector) => selector.trim())
      .filter(Boolean);
    for (const selector of selectors) {
      expect(selector).toMatch(/\.home-main|\.lp-header|\.footer/);
    }
  });
});
