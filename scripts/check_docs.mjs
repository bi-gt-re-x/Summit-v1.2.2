/**
 * The comment fact-check.
 *
 *     node scripts/check_docs.mjs
 *     npm run check:docs
 *
 * This codebase's comments are unusually load-bearing. They name the file that
 * holds the other half of a decision, the script that enforces a rule, the
 * stylesheet a variable is defined in — and people follow those pointers. The
 * `.modal` collision was fixed because a comment in dashboard.css had already
 * diagnosed it and said where to look.
 *
 * That only works while the pointers are true, and they rot silently. A file is
 * renamed, or deleted, and the comment naming it keeps its shape and keeps its
 * confidence and is now sending the next reader somewhere that does not exist.
 * Twenty had accumulated: `styles/navbar.css` (it is rail.css),
 * `scripts/check_trees.py` (it is .mjs), `utils/skillGraphFromTrees` (it is
 * `graphFromSubjectTree` in skills/subjectTrees) — and a paragraph in
 * components/Growth explaining why a 675-line renderer was being kept for a
 * component that had been deleted two commits earlier.
 *
 * None of that is caught by a compiler, a test or a reviewer, because the code
 * is correct and only the prose is wrong. This is the check that makes it fail
 * the build instead.
 *
 * ## What it checks
 *
 * Every path-looking string inside a comment, in every source file. If it does
 * not resolve to a file or a directory, that is a failure. Nothing about
 * wording, length or style is examined — this asks one question, and it is a
 * question with an answer.
 *
 * The review's worry about the documentation was that there is too much of it.
 * The measurable defect was that some of it was wrong, and trimming would not
 * have found a single one of these.
 *
 * ## GONE — the one escape hatch
 *
 * A comment may legitimately name a file that no longer exists, when the point
 * of the sentence is that it was removed. Those are listed here, one line each,
 * so "this file is deliberately gone" stays a visible statement rather than an
 * untested assumption — the same discipline as LEGACY in check_css.mjs, and it
 * may only shrink for the same reason: a name that has come back is a name
 * whose comment should be describing the present again.
 *
 * Exits non-zero and names the failures if anything is wrong.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ROOTS = ['frontend/src', 'backend', 'scripts', 'data/sql', 'frontend/js', 'tests'];
const EXTS = ['.ts', '.tsx', '.py', '.mjs', '.css', '.sql'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '__pycache__']);

/**
 * This file, which cannot pass its own check and should not.
 *
 * Its whole docblock is a list of the wrong names it exists to catch —
 * `styles/navbar.css`, `scripts/check_trees.py` — and those are the examples
 * that make it understandable. Quoting a broken pointer in order to explain
 * broken pointers is not the failure this looks for.
 */
const SKIP_FILES = new Set(['scripts/check_docs.mjs']);

/** Files named in a comment that are deliberately not there any more. */
const GONE = new Map([
  ['utils/skillTree', 'Task-derived skill trees. Nothing rendered them.'],
  ['utils/growthChart.ts', 'The growth canvas renderer, kept for a component already gone.'],
  ['utils/trends', "The Trends tab's arithmetic, removed with the tab."],
]);

const REF =
  /\b((?:backend|frontend|scripts|data|utils|src|tests|components|pages|hooks|services|styles|skills|context|types)\/[\w./-]+)/g;

/** Not paths, whatever they look like. */
const NOT_A_PATH = [/^hooks\/exhaustive-deps$/];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

/** Comment bodies only — a path in a string literal is code, not a claim. */
function comments(text) {
  return text.match(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|^[ \t]*#[^\n]*|--[^\n]*/gm) ?? [];
}

function resolves(ref) {
  const clean = ref.replace(/[.,;:)]+$/, '');
  return [
    clean,
    'frontend/' + clean,
    'frontend/src/' + clean,
    clean + '.ts',
    clean + '.tsx',
    'frontend/src/' + clean + '.ts',
    'frontend/src/' + clean + '.tsx',
    'frontend/src/' + clean + '/index.ts',
    clean + '/index.ts',
  ].some((candidate) => existsSync(join(root, candidate)));
}

const files = ROOTS.flatMap((dir) => (existsSync(join(root, dir)) ? walk(join(root, dir)) : []));

const broken = [];
const usedGone = new Set();

for (const file of files) {
  if (SKIP_FILES.has(relative(root, file))) continue;
  for (const block of comments(readFileSync(file, 'utf8'))) {
    for (const match of block.matchAll(REF)) {
      const ref = match[1];
      // `src/utils/calendar*.ts` is a family, not a file. The pattern stops at
      // the star, so the star has to be looked for just past the match.
      if (block[match.index + ref.length] === '*') continue;
      if (ref.endsWith('/') || ref.includes('*')) continue;
      if (NOT_A_PATH.some((pattern) => pattern.test(ref))) continue;
      const clean = ref.replace(/[.,;:)]+$/, '');
      if (GONE.has(clean)) {
        usedGone.add(clean);
        continue;
      }
      if (!resolves(ref)) broken.push([relative(root, file), ref]);
    }
  }
}

const RED = '[31m';
const YELLOW = '[33m';
const GREEN = '[32m';
const OFF = '[0m';

console.log('Read ' + files.length + ' files.');

if (GONE.size > 0) {
  console.log('\n' + YELLOW + GONE.size + ' file(s) named in the past tense:' + OFF);
  for (const [name, why] of GONE) console.log('  ' + name.padEnd(24) + why);
}

const stale = [...GONE.keys()].filter((name) => !usedGone.has(name));
if (stale.length > 0) {
  console.log('\n' + RED + stale.length + ' stale GONE entr(ies) — delete these lines:' + OFF);
  for (const name of stale) console.log('  ' + name.padEnd(24) + 'no comment mentions it any more');
}

if (broken.length > 0) {
  console.log('\n' + RED + broken.length + ' comment reference(s) that do not resolve:' + OFF);
  for (const [file, ref] of broken) console.log('  ' + file + '\n      -> ' + ref);
  console.log(
    '\nA comment naming a file is a pointer somebody will follow. Fix the name,\n' +
      'or add it to GONE if the sentence is about its removal.',
  );
}

if (broken.length === 0 && stale.length === 0) {
  console.log('\n' + GREEN + 'Every file named in a comment exists.' + OFF);
  process.exit(0);
}
process.exit(1);
