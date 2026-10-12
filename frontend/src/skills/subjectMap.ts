/**
 * Every subject a task can be filed under, and the lattice that teaches it.
 *
 * ## Why this exists
 *
 * The subject catalogue in backend/config/subjects.py is 150 fixed rows —
 * the things this app lets somebody say a task is *about*. The trees in
 * skills/trees are a hundred and twenty-five lattices — the things it can teach. They are
 * deliberately not the same list: "Laundry" is a real subject to file a task
 * under and is not a subject with a progression, and "Machine Learning" is a
 * whole lattice that no catalogue row is going to be big enough for.
 *
 * This is the join. Every catalogue subject names the tree it opens, and where
 * the tree has an obvious landing place, the node it should open on. That is
 * what lets the skill tree page offer all 150 subjects the reader already
 * uses on their tasks, rather than eleven names they have never seen.
 *
 * ## Many subjects to one tree, never the reverse
 *
 * Five languages open Foreign Languages, because what is different between
 * Spanish and Japanese is the content of each node rather than the order of
 * them. Anatomy, Genetics and Ecology all open Biology, at three different
 * nodes. That is the shape this map is for: it is a routing table, not a
 * classification, and a tree that wanted to know which subjects point at it can
 * ask {@link subjectsForTree}.
 *
 * ## What happens to a subject that is not here
 *
 * An account can make its own subjects, and the catalogue can grow. Either way
 * the row arrives with a `group`, and {@link treeForSubject} falls back to that
 * group's root tree — so a new subject lands somewhere sensible on the day it
 * appears rather than vanishing from the rail until somebody edits this file.
 *
 * The completeness of the hundred is not trusted: scripts/check_trees.mjs reads
 * the ids straight out of backend/config/subjects.py and fails if any of them
 * is missing here, or if any entry points at a tree or node that does not
 * exist.
 */
import { SUBJECT_TREES } from './subjectTrees';

/** Where a subject lands: a tree, and optionally the node to open on. */
export interface SubjectTarget {
  tree: string;
  node?: string;
}

/**
 * The nine catalogue groups and the root each falls back to.
 *
 * Used for a subject this file does not name — one the account invented, or one
 * added to the catalogue since. The names are the group names in
 * backend/config/subjects.py; a group missing from here falls back to Coding
 * only because something has to be last.
 */
const GROUP_ROOT: Record<string, string> = {
  'Math and science': 'science',
  Studying: 'school',
  'Language and humanities': 'language',
  Computing: 'coding',
  'Business and money': 'business',
  Work: 'career',
  Creative: 'art',
  'Health and fitness': 'fitness',
  'Life and home': 'life',
};

/**
 * Subject id → where it opens. All 150 of them.
 *
 * Kept in catalogue order and grouped by the catalogue's own groups, so this
 * file can be read beside backend/config/subjects.py and checked by eye as well
 * as by the script.
 */
export const SUBJECT_TARGETS: Record<string, SubjectTarget> = {
  // ---- Math and science ----
  mathematics: { tree: 'mathematics' },
  algebra: { tree: 'algebra' },
  geometry: { tree: 'geometry' },
  trigonometry: { tree: 'trigonometry' },
  precalculus: { tree: 'precalculus' },
  calculus: { tree: 'calculus' },
  statistics: { tree: 'statistics' },
  differential_equations: { tree: 'differential-equations' },
  science: { tree: 'science' },
  biology: { tree: 'biology' },
  chemistry: { tree: 'chemistry' },
  physics: { tree: 'physics' },
  anatomy: { tree: 'anatomy' },
  genetics: { tree: 'genetics' },
  ecology: { tree: 'ecology' },
  environmental_science: { tree: 'environmental-science' },
  astronomy: { tree: 'astronomy' },
  geology: { tree: 'geology' },
  organic_chemistry: { tree: 'organic-chemistry' },
  biochemistry: { tree: 'biochemistry' },
  microbiology: { tree: 'microbiology' },
  neuroscience: { tree: 'neuroscience' },
  forensic_science: { tree: 'forensic-science' },
  lab_work: { tree: 'lab-work' },
  science_fair: { tree: 'science-fair' },

  // ---- Studying ----
  school: { tree: 'school' },
  homework: { tree: 'study', node: 'sy.plan' },
  exams: { tree: 'study', node: 'sy.exam' },
  test_prep: { tree: 'test-prep' },
  revision: { tree: 'study', node: 'sy.revision' },
  flashcards: { tree: 'study', node: 'sy.spacing' },
  note_taking: { tree: 'note-taking' },
  lectures: { tree: 'study', node: 'sy.notes' },
  coursework: { tree: 'study', node: 'sy.plan' },
  study_group: { tree: 'study', node: 'sy.group' },
  tutoring: { tree: 'study', node: 'sy.explain' },
  research: { tree: 'study', node: 'sy.sources' },
  thesis: { tree: 'writing', node: 'wr.long' },
  college_apps: { tree: 'college-apps' },
  financial_aid: { tree: 'financial-aid' },
  extracurriculars: { tree: 'extracurriculars' },
  pre_med: { tree: 'pre-med' },
  ai_tools: { tree: 'ai-tools' },

  // ---- Language and humanities ----
  english: { tree: 'language' },
  essays: { tree: 'essays' },
  literature: { tree: 'literature' },
  writing: { tree: 'writing' },
  grammar: { tree: 'language', node: 'ln.parts' },
  vocabulary: { tree: 'language', node: 'ln.vocab' },
  creative_writing: { tree: 'creative-writing' },
  poetry: { tree: 'poetry' },
  journalism: { tree: 'journalism' },
  public_speaking: { tree: 'public-speaking' },
  spanish: { tree: 'foreign-language' },
  french: { tree: 'foreign-language' },
  german: { tree: 'foreign-language' },
  japanese: { tree: 'foreign-language' },
  mandarin: { tree: 'foreign-language' },
  latin: { tree: 'latin' },
  sign_language: { tree: 'sign-language' },
  history: { tree: 'history' },
  civics: { tree: 'civics' },
  politics: { tree: 'civics', node: 'cv.parties' },
  geography: { tree: 'geography' },
  model_un: { tree: 'model-un' },
  philosophy: { tree: 'philosophy' },
  psychology: { tree: 'psychology' },
  sociology: { tree: 'sociology' },

  // ---- Computing ----
  programming: { tree: 'coding' },
  python: { tree: 'python' },
  java: { tree: 'java' },
  computer_science: { tree: 'algorithms' },
  web_design: { tree: 'web' },
  app_dev: { tree: 'app-dev' },
  game_dev: { tree: 'game-dev' },
  data_science: { tree: 'data-science' },
  spreadsheets: { tree: 'spreadsheets' },
  machine_learning: { tree: 'machine-learning' },
  cybersecurity: { tree: 'cybersecurity' },
  databases: { tree: 'databases' },
  networking: { tree: 'networking' },
  /* Was systems/s.processes, which was the closest thing that existed rather
     than an answer — process scheduling is not what somebody filing a task
     under Robotics is doing. It has its own lattice now. */
  robotics: { tree: 'robotics', node: 'ro.mech' },
  electronics: { tree: 'electronics' },
  engineering: { tree: 'engineering' },

  // ---- Business and money ----
  economics: { tree: 'economics' },
  finance: { tree: 'finance' },
  budgeting: { tree: 'business', node: 'bu.budget' },
  entrepreneurship: { tree: 'entrepreneurship' },
  business: { tree: 'business' },
  marketing: { tree: 'marketing' },
  accounting: { tree: 'accounting' },
  investing: { tree: 'finance', node: 'fi.assets' },
  taxes: { tree: 'business', node: 'bu.tax' },
  law: { tree: 'law' },
  management: { tree: 'management' },

  // ---- Work ----
  part_time_job: { tree: 'part-time-job' },
  internships: { tree: 'internships' },
  job_search: { tree: 'career', node: 'ca.search' },
  interviews: { tree: 'career', node: 'ca.interview' },
  leadership: { tree: 'leadership' },
  presenting: { tree: 'career', node: 'ca.present' },
  planning: { tree: 'productivity', node: 'pd.calendar' },
  work: { tree: 'career' },
  meetings: { tree: 'career', node: 'ca.meetings' },
  email: { tree: 'career', node: 'ca.email' },
  calls: { tree: 'career', node: 'ca.async' },
  admin: { tree: 'life', node: 'lf.admin' },
  reports: { tree: 'writing', node: 'wr.report' },

  // ---- Creative ----
  art: { tree: 'art' },
  drawing: { tree: 'drawing' },
  design: { tree: 'design' },
  photography: { tree: 'photography' },
  film: { tree: 'film' },
  theater: { tree: 'theater' },
  art_history: { tree: 'art-history' },
  cad: { tree: 'cad' },
  music: { tree: 'music' },
  music_theory: { tree: 'music-theory' },
  band: { tree: 'band' },
  piano: { tree: 'piano' },
  guitar: { tree: 'guitar' },
  violin: { tree: 'violin' },
  drums: { tree: 'drums' },
  singing: { tree: 'voice' },
  dance: { tree: 'dance' },

  // ---- Health and fitness ----
  gym: { tree: 'strength' },
  running: { tree: 'endurance' },
  basketball: { tree: 'basketball' },
  soccer: { tree: 'soccer' },
  swimming: { tree: 'swimming' },
  cycling: { tree: 'endurance', node: 'en.crosstrain' },
  yoga: { tree: 'mindfulness', node: 'mi.yoga' },
  sleep: { tree: 'mindfulness', node: 'mi.sleep' },
  stress: { tree: 'stress' },
  meditation: { tree: 'mindfulness', node: 'mi.sit' },
  nutrition: { tree: 'nutrition' },
  therapy: { tree: 'mindfulness', node: 'mi.help' },
  health: { tree: 'fitness' },

  // ---- Life and home ----
  chores: { tree: 'life', node: 'lf.clean' },
  laundry: { tree: 'life', node: 'lf.laundry' },
  cooking: { tree: 'cooking' },
  groceries: { tree: 'life', node: 'lf.shop' },
  errands: { tree: 'life', node: 'lf.errands' },
  driving: { tree: 'driving' },
  family: { tree: 'life', node: 'lf.time' },
  friends: { tree: 'life', node: 'lf.time' },
  travel: { tree: 'travel' },
  reading: { tree: 'language', node: 'ln.read' },
  journaling: { tree: 'mindfulness', node: 'mi.journal' },
  chess: { tree: 'chess' },
};

/**
 * Where a subject opens, by id and group.
 *
 * The group is what a subject this file has never heard of is routed by, so
 * callers pass whatever the catalogue sent them rather than checking first.
 */
export function treeForSubject(id: string, group?: string): SubjectTarget {
  return SUBJECT_TARGETS[id] ?? { tree: (group && GROUP_ROOT[group]) || 'coding' };
}

/** The catalogue ids that open a given tree. The other direction. */
export function subjectsForTree(treeId: string): string[] {
  return Object.entries(SUBJECT_TARGETS)
    .filter(([, target]) => target.tree === treeId)
    .map(([id]) => id);
}

/**
 * The subjects that actually have a lattice behind them.
 *
 * `treeForSubject` never fails — an id it has not heard of falls back to its
 * group's root, which is deliberate and right for the case it was written for:
 * a *catalogue* row added to backend/config/subjects.py that this file has not
 * caught up with yet. That subject genuinely belongs somewhere near its group's
 * root, and it lands there rather than vanishing until somebody edits a map.
 *
 * A subject the account invented is the other case entirely, and the same
 * fallback is wrong for it. There is no tree, there will never be a tree, and
 * nothing about the name gives the fallback anything to work with — so it
 * routes on `group` alone and opens a full lattice belonging to something else.
 * "Fantasy Football" filed under Business opened the Business tree, with that
 * title, that breadcrumb and twenty nodes about unit economics. A confident
 * wrong answer, which is worse than no answer, because nothing on the page
 * tells the reader the routing was a guess.
 *
 * So the skill tree page filters with this before it offers anything: what it
 * cannot route, it does not list. Every other surface in the app — the task
 * filters, the calendar, the library — keeps custom subjects, because a label
 * to file work under is all those need and a custom one is as real as any.
 */
export function latticeSubjects<T extends { custom: boolean }>(subjects: T[]): T[] {
  return subjects.filter((subject) => !subject.custom);
}

/** Every tree id, for the checks and for anything enumerating targets. */
export const TREE_IDS: readonly string[] = SUBJECT_TREES.map((tree) => tree.id);
