/**
 * The stylesheet ownership lint.
 *
 *     node scripts/check_css.mjs
 *     npm run check:css
 *
 * Twenty-six thousand lines of global CSS, held together by a naming
 * convention that lives in people's heads. Every stylesheet here is imported
 * into a module, and a plain `.css` import in Vite is *global* — so the moment
 * two sheets write a rule for the same class, the one that happens to load
 * second wins, everywhere, for whichever properties they both set.
 *
 * That has already happened. `.modal` is written three times, in
 * calendar/month.css, goals.css and homepage.css, for three unrelated
 * components — the calendar's event dialog, the goal editor, and the landing
 * page's sign-in box. Nothing about any of those files is wrong on its own.
 * The bug only exists in the union, which is why no reviewer, no compiler and
 * no test caught it: the code is correct and the page is wrong.
 *
 * This is the check that makes that a build failure rather than a thing to
 * remember.
 *
 * ## What counts as a claim
 *
 * A stylesheet **claims** a class when it writes a rule for that class *alone*
 * — `.modal { }`, `.modal:hover { }`. It does not claim one when the class is
 * qualified by another: `.rail-link.active` is a variant of `.rail-link`, and
 * `.active` there is the shared modifier vocabulary doing its job. That
 * distinction is the whole reason this check is usable — a naive "same name in
 * two files" rule flags every `is-open` in the codebase and gets switched off
 * within a week.
 *
 * Two sheets claiming one class is the failure. Everything else is allowed.
 *
 * ## The three escape hatches, and why each exists
 *
 * `VOCABULARY` — modifiers any sheet may claim. A page's own `.is-empty` state
 * is not a collision with another page's; these are adjectives, not nouns.
 *
 * `FAMILIES` — sheets that are one component split across files. The four
 * calendar views share `wk-` because they are four views of one calendar; the
 * landing page and its motion layer share `lp-` because the second animates
 * the first. Co-claiming inside a family is the design, not a slip.
 *
 * `LEGACY` — the collisions that already existed when this check was written.
 * They are listed one by one rather than waved through by a pattern, they are
 * printed on every run so the debt stays visible, and the list may only
 * shrink: an entry that has stopped colliding is itself an error, so cleaning
 * one up forces you to delete its line. Adding to this list is not how you get
 * a new collision past the build.
 *
 * Exits non-zero and names the failures if anything is wrong.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const STYLES = join(root, 'frontend/src/styles');

// --------------------------------------------------------------------------
// What is allowed to be shared
// --------------------------------------------------------------------------

/**
 * Adjectives. Any sheet may say its own thing is open, or bad, or gold.
 *
 * These are only ever written qualified in practice (`.ax-panel.is-open`), and
 * a qualified use is not a claim at all — so what this list actually covers is
 * the handful of places a sheet writes the bare modifier to set a shared
 * colour. That is still not a collision: two sheets agreeing that `is-bad` is
 * red is the point of having the word.
 */
const VOCABULARY = [/^is-/, /^has-/, /^tone-/, /^grade-/, /^tier-/];

/** Sheets that are one component in several files, and may co-claim freely. */
const FAMILIES = [
  {
    name: 'calendar',
    why:
      'One calendar in seven files. Three are the views; the other four are what ' +
      'all three views wear — the card and the switcher (shell), everything they ' +
      'open over themselves (dialogs), the panel that says what the period came ' +
      'to (overview), and the colour system (palette).',
    files: [
      'calendar/shell.css',
      'calendar/dialogs.css',
      'calendar/overview.css',
      'calendar/day.css',
      'calendar/week.css',
      'calendar/month.css',
      'calendar/palette.css',
    ],
  },
  {
    name: 'landing',
    why: 'The landing page, the motion layer that animates it, and the ambient field behind it.',
    files: ['homepage.css', 'home-motion.css', 'ambient.css'],
  },
  {
    name: 'dashboard',
    why:
      'Both are the dashboard — Dashboard.tsx imports the pair. dashboard-home.css took over ' +
      'the page when it was rebuilt and dashboard.css kept the parts that had not moved yet.',
    files: ['dashboard.css', 'dashboard-home.css'],
  },
];

/**
 * Cross-cutting sheets, which restyle other pages on purpose.
 *
 * `preferences.css` is the whole list and is likely to stay it: its job is to
 * reach into every page's root class and apply the account's chosen density and
 * accent. It can only ever *re*-claim — a class it claims alone is still a
 * failure, because that would be a page root nothing else defines.
 */
const CROSS_CUTTING = new Map([
  ['preferences.css', 'Applies the account\'s appearance settings to every page root.'],
]);

/**
 * The collisions that were already here. This list may only shrink.
 *
 * Each was a real hazard of the `.modal` kind: two unrelated components whose
 * sheets both write the bare class, where the winner is whichever import Vite
 * happened to order last.
 *
 * **It is empty, and that is the finished state.** All nine are cleared. Eight
 * of them turned out not to be styling problems at all — the classes were dead,
 * left behind by the server-rendered pages this app grew out of, and no element
 * in the built bundle carried any of them. Deleting the rules resolved the
 * collision because there was never anything on either side of it.
 *
 * The ninth, `.xp-input-field`, was live: the dashboard's Add Task popup and
 * the calendar's write the same class name from two stylesheets. Each is scoped
 * to its own modal id now.
 *
 * A new entry here is not how a new collision gets past the build. If one is
 * ever added, it needs the same thing these got: a reason it cannot be fixed
 * today, and a date it will be.
 */
const LEGACY = [];

// --------------------------------------------------------------------------
// Reading the sheets
// --------------------------------------------------------------------------
function sheets(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? sheets(path)
      : path.endsWith('.css')
        ? [path]
        : [];
  });
}

/**
 * The classes a sheet claims.
 *
 * A claim is a rule that reaches a class **anywhere in the document**: the
 * whole selector is one compound holding exactly one class. `.modal { }` and
 * `.modal:hover { }` claim `modal`. Four kinds of selector deliberately do
 * not, and each one was a false positive before it was excluded:
 *
 *   `.a.b`        a variant of whatever `.a` or `.b` already is.
 *   `#x.a`        pinned to one element by id; it cannot leak.
 *   `body.dark`   the theme-scoping idiom. Every sheet writes
 *                 `body.dark .thing`, and reading those as claims on `dark`
 *                 made every stylesheet collide with every other — the failure
 *                 mode that gets a lint switched off rather than obeyed.
 *   `.dash .modal` scoped under an ancestor, so it only dresses this page's
 *                 dialog. This is the *fix* for a collision, and an earlier
 *                 version of this check counted it as one — which would have
 *                 told dashboard.css it was still guilty after it had already
 *                 done the right thing, and taught the next reader that doing
 *                 the right thing does not clear the warning.
 *
 * So: split on commas, and a claim is an alternative with no combinator in it.
 */
function claimsOf(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found = new Set();

  for (const rule of bare.matchAll(/([^{}]+)\{/g)) {
    const selector = rule[1];
    if (selector.trimStart().startsWith('@')) continue;

    for (const alternative of selector.split(',')) {
      const one = alternative.trim();
      if (one === '') continue;
      // A combinator means an ancestor scopes it; it cannot leak on its own.
      if (/[\s>+~]/.test(one)) continue;
      if (one.includes('#')) continue;
      // Led by an element name — `a.lp-btn` — so it is scoped to that element.
      if (/^[a-zA-Z]/.test(one)) continue;

      const classes = [...one.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
      if (classes.length === 1) found.add(classes[0]);
    }
  }
  return found;
}

const familyOf = new Map();
for (const family of FAMILIES) {
  for (const file of family.files) familyOf.set(file, family.name);
}

const claimants = new Map(); // class -> Set(file)
for (const path of sheets(STYLES).sort()) {
  const file = path.slice(STYLES.length + 1);
  for (const cls of claimsOf(readFileSync(path, 'utf8'))) {
    if (!claimants.has(cls)) claimants.set(cls, new Set());
    claimants.get(cls).add(file);
  }
}

// --------------------------------------------------------------------------
// Judging them
// --------------------------------------------------------------------------
const legacyNames = new Map(LEGACY);
const failures = [];
const carried = [];
const stale = [];

for (const [cls, files] of [...claimants].sort()) {
  if (files.size < 2) continue;
  if (VOCABULARY.some((pattern) => pattern.test(cls))) continue;

  // A family absorbs its own members; a cross-cutting sheet steps aside.
  const outside = [...files].filter((file) => !CROSS_CUTTING.has(file));
  const families = new Set(outside.map((file) => familyOf.get(file) ?? file));
  if (families.size < 2) continue;

  if (legacyNames.has(cls)) carried.push([cls, outside]);
  else failures.push([cls, outside]);
}

for (const [cls] of LEGACY) {
  const files = claimants.get(cls);
  if (!files) {
    stale.push([cls, 'nothing claims it any more']);
    continue;
  }
  const outside = [...files].filter((file) => !CROSS_CUTTING.has(file));
  const families = new Set(outside.map((file) => familyOf.get(file) ?? file));
  if (families.size < 2) stale.push([cls, `only ${outside.join(', ') || 'one sheet'} claims it now`]);
}

// --------------------------------------------------------------------------
// Saying so
// --------------------------------------------------------------------------
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

const total = [...claimants].filter(([, f]) => f.size >= 1).length;
console.log(`Read ${sheets(STYLES).length} stylesheets, ${total} claimed classes.\n`);

if (carried.length > 0) {
  console.log(yellow(`${carried.length} known collision(s) carried from before this check:`));
  for (const [cls, files] of carried) {
    console.log(`  .${cls.padEnd(22)} ${files.join(', ')}`);
    console.log(`  ${' '.repeat(23)}${legacyNames.get(cls)}`);
  }
  console.log('');
}

if (failures.length > 0) {
  console.log(red(`${failures.length} NEW collision(s):`));
  for (const [cls, files] of failures) {
    console.log(`  .${cls.padEnd(22)} claimed by ${files.join(', ')}`);
  }
  console.log(
    '\nTwo sheets writing a bare rule for one class is a silent override: both\n' +
    'are correct on their own and whichever Vite loads second wins. Give the\n' +
    'class its sheet\'s prefix, qualify it (.thing.is-open rather than .is-open),\n' +
    'or add the sheets to a family in this script if they really are one\n' +
    'component. Adding a name to LEGACY is not one of the options.\n',
  );
}

if (stale.length > 0) {
  console.log(red(`${stale.length} stale LEGACY entr(ies) — delete these lines:`));
  for (const [cls, why] of stale) console.log(`  .${cls.padEnd(22)} ${why}`);
  console.log(
    '\nThe list is meant to shrink. An entry that no longer collides has been\n' +
    'fixed, and leaving it here would let the same collision come back unseen.\n',
  );
}

if (failures.length === 0 && stale.length === 0) {
  console.log(
    green('No new class collisions.') +
    (carried.length > 0 ? ` ${carried.length} known one(s) still to clear.` : ''),
  );
  process.exit(0);
}
process.exit(1);
