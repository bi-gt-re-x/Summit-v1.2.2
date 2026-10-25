/**
 * The progression arithmetic, checked rather than argued about.
 *
 *     node scripts/check_steps.mjs
 *     npm run check:steps
 *
 * Two modules decide how far along a skill is, and between them they hold every
 * rule that a reader can feel and nobody can see:
 *
 *   utils/skillSteps      what adding, deleting and editing a step does to the
 *                         list and to where the reader stands in it.
 *   utils/milestoneSteps  the same job for a goal checkpoint's checklist, whose
 *                         extra rule is a floor: three rows, always.
 *   utils/skillProgress   how the server's reading of real work becomes a
 *                         percentage, a session count and a status on the
 *                         graph the whole page reads.
 *   skills/iconMatch      which drawing a renamed node gets, and — the half
 *                         that matters — when it gets none and keeps its own.
 *   utils/skillNames      applying a reader's names over the graph.
 *
 * All of it is off-by-one arithmetic on an index into a list, which is the kind
 * of code that is correct until the afternoon it is not, and wrong in a way
 * that looks like a rounding error rather than like a bug. The interesting
 * cases are the ones nobody clicks by accident: deleting the step you are
 * standing on, deleting the one behind it, emptying a field on a list of one,
 * a node the tree seeded as finished whose programme the reader has since
 * rewritten.
 *
 * Bundled with esbuild and imported, the same as check_trees, so this runs
 * against exactly the modules the app runs against.
 *
 * Exits non-zero and names the failures if anything is wrong.
 */
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = await mkdtemp(join(tmpdir(), 't-'));
const one = async (e, n) => { const o = join(dir, n + '.mjs');
  await build({ entryPoints: [join(root, e)], bundle: true, format: 'esm', platform: 'node', outfile: o, logLevel: 'silent', alias: { '@': join(root, 'frontend/src') } });
  return import(pathToFileURL(o).href); };
const S = await one('frontend/src/utils/skillSteps.ts', 'S');
const P = await one('frontend/src/utils/skillProgress.ts', 'P');
const st = await one('frontend/src/skills/subjectTrees.ts', 'st');
const M = await one('frontend/src/skills/iconMatch.ts', 'M');
const N = await one('frontend/src/utils/skillNames.ts', 'N');
const MS = await one('frontend/src/utils/milestoneSteps.ts', 'MS');

let fails = 0;
const is = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++; console.log(`${ok ? '\x1b[32m ok \x1b[0m' : '\x1b[31mFAIL\x1b[0m'} ${label}  got ${JSON.stringify(got)}${ok ? '' : ` want ${JSON.stringify(want)}`}`); };

let p = { steps: ['a', 'b', 'c', 'd', 'e'], at: 2 };
is('5 steps, on 3 → 40%', S.planPercent(p), 40);

// add at the end: same place, longer list, figure falls
let added = S.addStep(p, 'f');
is('add at end → 6 steps, still on 3', [added.steps.length, added.at], [6, 2]);
is('add at end → 33%', S.planPercent(added), 33);

// delete one ahead: same place, shorter list, figure rises
let cut = S.removeStep(p, 4);
is('delete ahead → 4 steps, still on 3', [cut.steps.length, cut.at], [4, 2]);
is('delete ahead → 50%', S.planPercent(cut), 50);

// delete one behind: reader stays on the same step, which is now numbered lower
let back = S.removeStep(p, 0);
is('delete behind → still on step "c"', back.steps[back.at], 'c');
is('delete behind → 4 steps, on 2 → 25%', S.planPercent(back), 25);

is('cannot delete the last step', S.removeStep({ steps: ['only'], at: 0 }, 0).steps, ['only']);
is('blank edit deletes', S.editStep(p, 1, '   ').steps, ['a', 'c', 'd', 'e']);
is('blank edit on a single step keeps it', S.editStep({ steps: ['x'], at: 0 }, 0, ' ').steps, ['x']);
is('text is trimmed and squashed', S.editStep(p, 0, '  two   words  ').steps[0], 'two words');
is('over-long text is cut', S.editStep(p, 0, 'z'.repeat(400)).steps[0].length, S.STEP_MAX);
is('all done → 100%', S.planPercent({ steps: ['a', 'b'], at: 2 }), 100);
is('empty list → 0%, not NaN', S.planPercent({ steps: [], at: 3 }), 0);
is('cap on adding', S.addStep({ steps: Array(S.STEPS_MAX).fill('x'), at: 0 }, 'y').steps.length, S.STEPS_MAX);

// the graph shows the server's reading, and only that
const g = st.graphFromSubjectTree(st.subjectTreeById('coding'));
const reading = {
  status: { 'c.loops': 'progress' },
  nodes: { 'c.loops': { sessions: 1, target: 4, percent: 25, ready: false, on: '', last: '', planned: 0,
    goal_ids: [], check: null, work: [], tasks: 1 } },
  unfiled: {}, goals: {}, checkable: [], targets: {},
};
const read = P.applyReading(g, reading).nodes.find((n) => n.id === 'c.loops');
is('graph percent follows the reading', read.percent, 25);
is('graph counts sessions, not XP', [read.have, read.need, read.unit], [1, 4, 'sessions']);
is('graph status follows too', read.status, 'progress');
const seeded = g.nodes.find((n) => n.status === 'complete');
is(`an illustrated finish (${seeded.id}) is not a finish`, P.applyReading(g, reading).nodes.find((n) => n.id === seeded.id).status, 'locked');
is('before the reading, nothing is finished',
  P.applyReading(g, null).nodes.some((n) => n.status === 'complete'), false);

// ---- naming, and the drawing that follows from it ----
is('an exact title matches', M.iconForName('Binary Search'), 'binary-search');
is('one word matches', M.iconForName('Recursion'), 'recursion');
is('a plural title matches the singular file', M.iconForName('Chess Openings'), 'opening');
is('the longest run wins over its halves', M.iconForName('Free-Body Diagrams'), 'free-body');
is('a level word is skipped', M.iconForName('Advanced Recursion'), 'recursion');
is('a level word alone matches nothing', M.iconForName('Advanced'), undefined);
is('no match is undefined, not a fallback', M.iconForName('Refactoring'), undefined);
is('nonsense matches nothing', M.iconForName('Zzzz Qqqq'), undefined);
is('an empty name matches nothing', M.iconForName('   '), undefined);
is('punctuation does not stop a match', M.iconForName('  loops!! '), 'loops');
is('an ampersand is not a word', M.iconForName('Loops & Things'), 'loops');

// A rename must never reach for the generic drawing: `undefined` means the node
// keeps what it had, and this is the assertion that says so.
is('a rename with no match keeps the designed icon',
  N.applyNames(
    { id: 't', name: 't', nodes: [{ id: 'n', name: 'Old', icon: 'layers' }] },
    { n: { name: 'Refactoring' } },
  ).nodes[0],
  { id: 'n', name: 'Refactoring', icon: 'layers' });
is('a rename with a match takes the new icon',
  N.applyNames(
    { id: 't', name: 't', nodes: [{ id: 'n', name: 'Old', icon: 'layers' }] },
    { n: { name: 'Binary Search', icon: 'binary-search' } },
  ).nodes[0].icon,
  'binary-search');
is('a node nobody renamed is untouched',
  N.applyNames({ id: 't', name: 't', nodes: [{ id: 'n', name: 'Old', icon: 'layers' }] }, { other: { name: 'X' } }).nodes[0].name,
  'Old');
is('names are squashed and capped', N.cleanName('  two   words  '), 'two words');
is('an over-long name is cut', N.cleanName('z'.repeat(200)).length, N.NAME_MAX);
is('a blank name is empty, so the caller drops the override', N.cleanName('   '), '');

// Renaming must not disturb the graph the edges are keyed on.
{
  const g = st.graphFromSubjectTree(st.subjectTreeById('coding'));
  const renamed = N.applyNames(g, { 'c.loops': { name: 'Iteration' } });
  is('ids survive a rename', renamed.nodes.map((n) => n.id).join(), g.nodes.map((n) => n.id).join());
  is('what required it still requires it',
    renamed.nodes.find((n) => n.id === 'c.lists').requires.includes('c.loops'), true);
}

// ---- a checkpoint's checklist ----
// The floor is the whole point: there is no sequence of edits that leaves a
// checkpoint with fewer than three rows, and the interesting cases are the ones
// that try — deleting at the floor, normalising an empty list, an API reply
// that arrives short.
{
  const titles = (steps) => steps.map((s) => s.title);
  const three = MS.normalise([
    { id: 'a', title: 'One', done: false },
    { id: 'b', title: 'Two', done: true },
    { id: 'c', title: 'Three', done: false },
  ]);

  is('nothing normalises to three placeholders', MS.normalise([]).length, MS.MIN_STEPS);
  is('null normalises too, rather than throwing', MS.normalise(null).length, MS.MIN_STEPS);
  is('a short list is padded up to the floor', MS.normalise([{ id: 'a', title: 'One' }]).length, MS.MIN_STEPS);
  is('padding is flagged placeholder', MS.normalise([{ id: 'a', title: 'One' }]).slice(1).every((s) => s.placeholder), true);
  is('a written row is not a placeholder', three.every((s) => !s.placeholder), true);
  is('an over-long list is cut to the ceiling',
    MS.normalise(Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, title: `t${i}` }))).length, MS.MAX_STEPS);

  is('delete at the floor empties the row rather than removing it',
    [MS.removeStep(three, 1).length, MS.removeStep(three, 1)[1].title], [3, '']);
  is('an emptied row loses its tick', MS.removeStep(three, 1)[1].done, false);
  is('delete above the floor removes it',
    titles(MS.removeStep(MS.addStep(three), 0)), ['Two', 'Three', '']);

  is('add stops at the ceiling',
    MS.addStep(MS.normalise(Array.from({ length: MS.MAX_STEPS }, (_, i) => ({ id: `x${i}`, title: `t${i}` })))).length,
    MS.MAX_STEPS);

  is('text is trimmed and squashed', MS.editStep(three, 0, '  two   words  ')[0].title, 'two words');
  is('over-long text is cut', MS.editStep(three, 0, 'z'.repeat(400))[0].title.length, MS.STEP_MAX);
  is('editing a placeholder makes it real', MS.editStep(MS.normalise([]), 0, 'Real')[0].placeholder, false);

  is('a placeholder cannot be ticked', MS.toggleStep(MS.normalise([]), 0)[0].done, false);
  is('a written step can', MS.toggleStep(three, 0)[0].done, true);
  is('and untick again', MS.toggleStep(MS.toggleStep(three, 0), 0)[0].done, false);

  is('progress counts only written rows', MS.stepProgress(three), { done: 1, total: 3 });
  is('placeholders are not in the total', MS.stepProgress(MS.normalise([{ id: 'a', title: 'One', done: true }])), { done: 1, total: 1 });
  is('a checklist of nothing but prompts is not complete', MS.stepsComplete(MS.normalise([])), false);
  is('every written row done is complete',
    MS.stepsComplete(MS.normalise([{ id: 'a', title: 'One', done: true }, { id: 'b', title: 'Two', done: true }])), true);
  is('ids stay unique after a pad', new Set(MS.normalise([{ id: 's1', title: 'One' }]).map((s) => s.id)).size, MS.MIN_STEPS);

  // ---- dates ----
  // One rule, seen from four sides: a step's own date exists only where
  // nothing else is holding one.
  const dated = MS.normalise([{ id: 'a', title: 'One', due: '2026-09-14' }]);
  is('an unlinked step keeps its date', dated[0].due, '2026-09-14');
  is('a placeholder has none', dated[1].due, null);
  is('emptying a row clears its date', MS.editStep(dated, 0, '')[0].due, null);
  is('setting a date', MS.dueStep(three, 0, '2026-10-01')[0].due, '2026-10-01');
  is('clearing a date', MS.dueStep(dated, 0, null)[0].due, null);
  is('an empty string clears rather than storing ""', MS.dueStep(dated, 0, '')[0].due, null);
  is('a placeholder refuses a date', MS.dueStep(MS.normalise([]), 0, '2026-10-01')[0].due, null);

  const linked = MS.normalise([{ id: 'a', title: 'One', due: '2026-09-14', task_id: 't1' }]);
  is('a linked step carries no date of its own', linked[0].due, null);
  is('linking a dated step hands the date over', MS.linkStep(dated, 0, 't9')[0].due, null);
  is('a linked step refuses one', MS.dueStep(linked, 0, '2026-10-01')[0].due, null);
  is('unlinking does not resurrect it', MS.linkStep(linked, 0, null)[0].due, null);

  is('stepDue reads the step when unlinked', MS.stepDue(dated[0], '2026-01-01'), '2026-09-14');
  is('stepDue reads the task when linked', MS.stepDue(linked[0], '2026-01-01T09:00:00'), '2026-01-01');
  is('stepDue is null when neither holds one', MS.stepDue(linked[0], null), null);
}

console.log(fails === 0 ? '\n\x1b[32mall passed\x1b[0m' : `\n\x1b[31m${fails} failed\x1b[0m`);
await rm(dir, { recursive: true, force: true });
process.exit(fails === 0 ? 0 : 1);
