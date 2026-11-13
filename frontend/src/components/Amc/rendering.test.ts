/**
 * Every piece of text in the problem bank — statements, choices, solution
 * steps, insights, traps and the topics' key ideas — rendered through the same
 * KaTeX path the pages use. A typo in the TeX shows up here as a failure
 * instead of as red error text in front of a student.
 *
 * The text comes from the Python bank (scripts/export_amc_text.py), so the
 * test is skipped where the project's virtualenv isn't installed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { renderMath, splitMath } from './MathText';

const root = resolve(__dirname, '../../../..');
const python = resolve(root, '.venv-fastapi/bin/python');
const available = existsSync(python);

type Piece = { id: string; field: string; text: string };

const pieces: Piece[] = available
  ? JSON.parse(execFileSync(python, [resolve(root, 'scripts/export_amc_text.py')], { cwd: root, encoding: 'utf8' }))
  : [];

describe.skipIf(!available)('rendering every problem', () => {
  it('has text to check', () => {
    expect(pieces.length).toBeGreaterThan(500);
  });

  it('parses every math span with KaTeX, strictly', () => {
    const failures: string[] = [];
    for (const piece of pieces) {
      for (const part of splitMath(piece.text)) {
        if (part.kind === 'text') continue;
        try {
          katex.renderToString(part.value, { displayMode: part.kind === 'display', throwOnError: true, strict: 'ignore' });
        } catch (error) {
          failures.push(`${piece.id} ${piece.field}: ${part.value} — ${(error as Error).message}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('leaves no unclosed $ and no raw TeX in the text between the math', () => {
    const problems: string[] = [];
    for (const piece of pieces) {
      for (const part of splitMath(piece.text)) {
        if (part.kind !== 'text') continue;
        if (part.value.includes('$')) problems.push(`${piece.id} ${piece.field}: stray $ in "${part.value}"`);
        if (/\\[a-zA-Z]+/.test(part.value)) problems.push(`${piece.id} ${piece.field}: TeX outside math in "${part.value}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('renders without error markup, and escapes the words', () => {
    for (const piece of pieces) {
      const html = renderMath(piece.text);
      expect(html, `${piece.id} ${piece.field}`).not.toContain('katex-error');
      expect(html, `${piece.id} ${piece.field}`).not.toMatch(/<(?!\/?(span|svg|path|line|math|semantics|mrow|mi|mo|mn|msup|msub|mfrac|annotation|msqrt|mtext|mspace|mover|munder|mtable|mtr|mtd|mpadded|mstyle|menclose|mroot|munderover|msubsup|mphantom)\b)/);
    }
  });
});
