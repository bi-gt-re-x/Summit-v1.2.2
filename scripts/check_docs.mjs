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
/* The productivity app's code, removed when Summit became an AMC prep site.
   Comments in what remains — the schema files for tables kept so existing
   accounts' data survives, the tracking modules the account pages still use,
   the generated theme sheets — still describe where these used to be. */
const AMC = 'Removed when Summit became an AMC prep site.';

const GONE = new Map([
  ['frontend/src/components/AboutYou/AboutYou.tsx', 'Sign-up asks about the student\u2019s contest now (components/Auth/AmcProfile.tsx).'],
  ['backend/api/analytics.py', AMC],
  ['backend/api/behavior.py', AMC],
  ['backend/api/experiments.py', AMC],
  ['backend/api/focus.py', AMC],
  ['backend/api/goals.py', AMC],
  ['backend/api/journal.py', AMC],
  ['backend/api/notes.py', AMC],
  ['backend/api/quests.py', AMC],
  ['backend/api/records.py', AMC],
  ['backend/api/review.py', AMC],
  ['backend/api/skillattempts.py', AMC],
  ['backend/api/skillchecks.py', AMC],
  ['backend/api/skillsteps.py', AMC],
  ['backend/api/tasks.py', AMC],
  ['backend/api/topics.py', AMC],
  ['backend/goal_matcher/ai.py', AMC],
  ['backend/goal_matcher/types.py', AMC],
  ['backend/tracking/answer_match.py', AMC],
  ['backend/tracking/behavior.py', AMC],
  ['backend/tracking/event.py', AMC],
  ['backend/tracking/experiments.py', AMC],
  ['backend/tracking/goal_health.py', AMC],
  ['backend/tracking/growth.py', AMC],
  ['backend/tracking/growth_reads.py', AMC],
  ['backend/tracking/priority.py', AMC],
  ['backend/tracking/quests.py', AMC],
  ['backend/tracking/record.py', AMC],
  ['backend/tracking/review.py', AMC],
  ['backend/tracking/session_kinds.py', AMC],
  ['backend/tracking/skill_check.py', AMC],
  ['backend/tracking/skill_progress.py', AMC],
  ['backend/tracking/skillsteps.py', AMC],
  ['backend/tracking/subject_goal.py', AMC],
  ['backend/tracking/topics.py', AMC],
  ['backend/tracking/weekly.py', AMC],
  ['components/../pages/Homepage.tsx', AMC],
  ['components/Analytics', AMC],
  ['components/Analytics/GrowthPeriod', AMC],
  ['components/Analytics/Header', AMC],
  ['components/Analytics/metrics', AMC],
  ['components/Dashboard/FirstWeek.tsx', AMC],
  ['components/Goals/NewGoalWizard', AMC],
  ['components/Growth', AMC],
  ['components/Hero.tsx', AMC],
  ['components/Notes/SubjectTags', AMC],
  ['components/Settings/VacationMode.tsx', AMC],
  ['components/Spaces/RailSpaces', AMC],
  ['components/Spaces/liveWatch', AMC],
  ['components/Tasks/GoalField', AMC],
  ['components/Tasks/board', AMC],
  ['components/Timer/intervals.ts', AMC],
  ['components/Tutorial/Tutorial.tsx', AMC],
  ['components/ui', AMC],
  ['context/UserDataProvider', AMC],
  ['frontend/html/aboutus.html', AMC],
  ['frontend/src/components/Achievements/BadgeWall.tsx', AMC],
  ['frontend/src/components/Analytics/Header.tsx', AMC],
  ['frontend/src/components/Analytics/Setup.tsx', AMC],
  ['frontend/src/components/Analytics/YourPatterns.tsx', AMC],
  ['frontend/src/components/Analytics/data.ts', AMC],
  ['frontend/src/components/Analytics/tabs/ReviewTab.tsx', AMC],
  ['frontend/src/components/Goals/Outcome.tsx', AMC],
  ['frontend/src/components/Log/CheckIn', AMC],
  ['frontend/src/components/SkillTree/LatticePanel.tsx', AMC],
  ['frontend/src/components/SkillTree/ProblemFigure.tsx', AMC],
  ['frontend/src/components/SkillTree/SkillCheck.tsx', AMC],
  ['frontend/src/components/Subject/performance', AMC],
  ['frontend/src/components/Timer/intervals.ts', AMC],
  ['frontend/src/components/Tutorial', AMC],
  ['frontend/src/pages/Achievements.tsx', AMC],
  ['frontend/src/services/analytics.ts', AMC],
  ['frontend/src/skills/improve.ts', AMC],
  ['frontend/src/skills/subjectTrees.ts', AMC],
  ['frontend/src/skills/trees', AMC],
  ['frontend/src/utils/activeDay.ts', AMC],
  ['frontend/src/utils/analyticalScore.ts', AMC],
  ['frontend/src/utils/analyticsPrefs.ts', AMC],
  ['frontend/src/utils/eventPalette.ts', AMC],
  ['frontend/src/utils/goalVisuals.ts', AMC],
  ['frontend/src/utils/habits.ts', AMC],
  ['frontend/src/utils/problemSet', AMC],
  ['frontend/src/utils/records.ts', AMC],
  ['frontend/src/utils/skillLevel.ts', AMC],
  ['frontend/src/utils/skillSteps.ts', AMC],
  ['frontend/src/utils/starter.ts', AMC],
  ['hooks/useMarkEgg.ts', AMC],
  ['hooks/useQuoteEgg.ts', AMC],
  ['hooks/useUserData', AMC],
  ['pages/Analytics', AMC],
  ['pages/Dashboard.tsx', AMC],
  ['pages/Homepage.tsx', AMC],
  ['pages/Unbuilt.tsx', AMC],
  ['scripts/check_steps.mjs', AMC],
  ['scripts/check_trees.mjs', AMC],
  ['scripts/generate_skill_steps.py', AMC],
  ['scripts/plan_backfill.py', AMC],
  ['scripts/seed_alpha.py', AMC],
  ['services/analytics', AMC],
  ['services/taskHistory', AMC],
  ['src/pages/Analytics.tsx', AMC],
  ['styles/analytics.css', AMC],
  ['styles/calendar/month.css', AMC],
  ['styles/dashboard.css', AMC],
  ['styles/goals.css', AMC],
  ['styles/records.css', AMC],
  ['utils/analyticsPrefs', AMC],
  ['utils/calendarGrid', AMC],
  ['utils/calendarGrid.ts', AMC],
  ['utils/dataMaturity', AMC],
  ['utils/goalHealth', AMC],
  ['utils/goalLinks', AMC],
  ['utils/goalVisuals', AMC],
  ['utils/milestoneSteps', AMC],
  ['utils/ratings', AMC],
  ['utils/records', AMC],
  ['utils/siteIndex', AMC],
  ['utils/starter', AMC],
  ['utils/timeSpent', AMC],
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
