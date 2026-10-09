/**
 * Every node in the library, flattened to JSON for the step generator.
 *
 *     node scripts/export_skill_nodes.mjs            # write it
 *     node scripts/export_skill_nodes.mjs --check    # fail if it is stale
 *
 * ## Why an export and not a parse
 *
 * scripts/generate_skill_steps.py has to brief a model on a node — its name,
 * what it is, how hard it is, what it sits on — and all four of those live in
 * TypeScript, in sixty-two files under frontend/src/skills/trees. Python cannot
 * read those and should not learn to: a regex over authored prose is a parser
 * that works until somebody puts a brace in a description.
 *
 * So the same trick scripts/gen_tree_map.mjs uses. esbuild bundles the tree
 * index, the module is imported, and what comes out is exactly the data the app
 * renders — not an approximation of it. The generator then reads one JSON file
 * and knows nothing about the frontend.
 *
 * ## What is exported, and what is deliberately not
 *
 * The permanent half of a node only. `state`, `percent`, `xpDone` are authored
 * illustration — identical on every account, as the note in
 * frontend/src/skills/subjectTrees.ts says — and a model briefed with "this one
 * is 30% done" would write steps for a reader who does not exist.
 *
 * Navigation nodes are skipped. A diamond that opens the Calculus tree is a
 * doorway, not a skill, and there is nothing to practice about walking through
 * it.
 *
 * ## `--check` in the build
 *
 * The catalogue is committed so the generator runs without a Node step, which
 * makes it the same kind of artefact as backend/config/skill_trees.py and gives
 * it the same failure mode: a tree gains a node, nobody re-exports, and the
 * generator quietly writes steps for the library as it stood last month. The
 * check is what turns that into a red build.
 */
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'data', 'skill_nodes.json');

async function load(entry) {
  const file = join(mkdtempSync(join(tmpdir(), 'nodes-')), 'bundle.mjs');
  await esbuild.build({
    entryPoints: [join(ROOT, entry)],
    bundle: true,
    format: 'esm',
    outfile: file,
    absWorkingDir: ROOT,
    alias: { '@': join(ROOT, 'frontend', 'src') },
    logLevel: 'silent',
  });
  return import(pathToFileURL(file).href);
}

const { SUBJECT_TREES, groupOf, parentChain } = await load('frontend/src/skills/subjectTrees.ts');

/** Node id → name, across every tree. `requires` is exported as names too. */
const NAMES = new Map();
for (const tree of SUBJECT_TREES) {
  for (const node of tree.nodes) NAMES.set(node.id, node.name);
}

const nodes = [];
for (const tree of SUBJECT_TREES) {
  // The chain from the root down to this tree — "Mathematics › Calculus". A
  // model briefed on Calculus alone writes fine steps; one that also knows it
  // is a branch of Mathematics writes steps that do not restate algebra.
  const chain = parentChain(tree.id).map((entry) => entry.title);
  for (const node of tree.nodes) {
    if (node.navTo) continue;
    nodes.push({
      id: node.id,
      name: node.name,
      desc: node.desc,
      tier: node.tier,
      core: Boolean(node.core),
      xp: node.xp ?? 0,
      tree: tree.id,
      treeTitle: tree.title,
      treePath: chain,
      group: groupOf(tree.id),
      // Names rather than ids: the model is being told what a reader has
      // already done, and "k.limits" tells it nothing.
      requires: (node.requires ?? []).map((id) => NAMES.get(id) ?? id),
      recommends: (node.recommends ?? []).map((id) => NAMES.get(id) ?? id),
    });
  }
}

const body = `${JSON.stringify({ nodes }, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const have = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (have !== body) {
    console.error(
      'data/skill_nodes.json is stale. Run: node scripts/export_skill_nodes.mjs',
    );
    process.exit(1);
  }
  console.log(`skill_nodes.json is current — ${nodes.length} nodes.`);
} else {
  writeFileSync(OUT, body);
  console.log(`Wrote ${nodes.length} nodes from ${SUBJECT_TREES.length} trees to data/skill_nodes.json`);
}
