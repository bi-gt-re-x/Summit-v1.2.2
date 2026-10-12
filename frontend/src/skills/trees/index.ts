/**
 * The lattice library: every subject tree the app knows about, in one list.
 *
 * ## Why this is a folder rather than a file
 *
 * It was one file, and one file was right while there were nine trees. There are
 * a hundred and twenty-five, which is many thousands of lines of authored description, and a
 * single file that size cannot be reviewed a subject at a time — a change to the
 * Guitar tree and a change to the Chemistry tree land in the same hunk of the
 * same diff. One file per tree keeps a subject to a subject, the way
 * skills/library keeps a domain to a domain, and this file is the only thing
 * that has to know all of them exist.
 *
 * ## Adding a subject
 *
 * A file beside this one exporting a `SubjectTree`, and one line in `TREES`
 * below. A tree with no `parent` is a root and appears in the switcher across
 * the top of the page; a tree with one appears wherever a node names it in
 * `navTo`, and the breadcrumb walks back up the same link. Nothing else in the
 * app enumerates subjects — the switcher, the breadcrumb and the "branches into"
 * row are all derived from what the trees themselves carry.
 *
 * ## The order matters
 *
 * `TREES` is the order the switcher offers the roots in, which runs from study
 * through work to home — the same sequence the subject catalogue in
 * backend/config/subjects.py uses, because a reader who has met one ordering
 * should not have to learn a second.
 *
 * The consistency of all this — that every `requires` names a node on the same
 * tree, every `navTo` names a tree that exists, every icon names a drawing that
 * is really in utils/icons/tree_icons, and every node is reachable by finishing
 * what sits above it — is checked by scripts/check_trees.mjs rather than trusted.
 */
import type { SubjectTree } from './types';

import { MATH } from './mathematics';
import { CALCULUS } from './calculus';
import { ALGEBRA } from './algebra';
import { GEOMETRY } from './geometry';
import { DIFF_EQ } from './differential-equations';
import { STATISTICS } from './statistics';
import { LINEAR_ALGEBRA } from './linear-algebra';
import { DISCRETE } from './discrete';
import { TRIGONOMETRY } from './trigonometry';
import { PRECALCULUS } from './precalculus';

import { SCIENCE } from './science';
import { PHYSICS } from './physics';
import { ENGINEERING } from './engineering';
import { CHEMISTRY } from './chemistry';
import { ENVIRONMENTAL_SCIENCE } from './environmental-science';
import { FORENSIC_SCIENCE } from './forensic-science';
import { LAB_WORK } from './lab-work';
import { SCIENCE_FAIR } from './science-fair';
import { ORGANIC_CHEMISTRY } from './organic-chemistry';
import { BIOLOGY } from './biology';
import { BIOCHEMISTRY } from './biochemistry';
import { MICROBIOLOGY } from './microbiology';
import { NEUROSCIENCE } from './neuroscience';
import { ANATOMY } from './anatomy';
import { GENETICS } from './genetics';
import { ECOLOGY } from './ecology';
import { EARTH_SPACE } from './earth-space';
import { ASTRONOMY } from './astronomy';
import { GEOLOGY } from './geology';

import { SCHOOL } from './school';
import { STUDY } from './study';
import { NOTE_TAKING } from './note-taking';
import { AI_TOOLS } from './ai-tools';
import { TEST_PREP } from './test-prep';
import { COLLEGE_APPS } from './college-apps';
import { EXTRACURRICULARS } from './extracurriculars';
import { PRE_MED } from './pre-med';
import { FINANCIAL_AID } from './financial-aid';

import { LANGUAGE } from './language';
import { WRITING } from './writing';
import { PUBLIC_SPEAKING } from './public-speaking';
import { CREATIVE_WRITING } from './creative-writing';
import { JOURNALISM } from './journalism';
import { ESSAYS } from './essays';
import { LITERATURE } from './literature';
import { POETRY } from './poetry';
import { FOREIGN_LANGUAGE } from './foreign-language';
import { LATIN } from './latin';
import { SIGN_LANGUAGE } from './sign-language';

import { HUMANITIES } from './humanities';
import { HISTORY } from './history';
import { PHILOSOPHY } from './philosophy';
import { PSYCHOLOGY } from './psychology';
import { CIVICS } from './civics';
import { GEOGRAPHY } from './geography';
import { SOCIOLOGY } from './sociology';

import { CODING } from './coding';
import { WEB } from './web';
import { APP_DEV } from './app-dev';
import { ALGO } from './algorithms';
import { PYTHON } from './python';
import { JAVA } from './java';
import { GAME_DEV } from './game-dev';
import { GRAPHS } from './graphs';
import { SYSTEMS } from './systems';
import { NETWORKING } from './networking';
import { DATA_SCIENCE } from './data-science';
import { MACHINE_LEARNING } from './machine-learning';
import { SPREADSHEETS } from './spreadsheets';
import { DATABASES } from './databases';
import { CYBERSECURITY } from './cybersecurity';

import { BUSINESS } from './business';
import { FINANCE } from './finance';
import { ECONOMICS } from './economics';
import { MARKETING } from './marketing';
import { MANAGEMENT } from './management';
import { ENTREPRENEURSHIP } from './entrepreneurship';
import { ACCOUNTING } from './accounting';
import { LAW } from './law';

import { PRODUCTIVITY } from './productivity';
import { FOCUS } from './focus';
import { CAREER } from './career';
import { PART_TIME_JOB } from './part-time-job';
import { INTERNSHIPS } from './internships';
import { LEADERSHIP } from './leadership';

import { ART } from './art';
import { DRAWING } from './drawing';
import { DESIGN } from './design';
import { DANCE } from './dance';
import { CAD } from './cad';
import { PHOTOGRAPHY } from './photography';
import { FILM } from './film';
import { THEATER } from './theater';
import { ART_HISTORY } from './art-history';

import { MUSIC } from './music';
import { GUITAR } from './guitar';
import { PIANO } from './piano';
import { VOICE } from './voice';
import { PRODUCTION } from './production';
import { VIOLIN } from './violin';
import { DRUMS } from './drums';
import { BAND } from './band';
import { MUSIC_THEORY } from './music-theory';

import { FITNESS } from './fitness';
import { STRENGTH } from './strength';
import { ENDURANCE } from './endurance';
import { SWIMMING } from './swimming';
import { NUTRITION } from './nutrition';
import { MINDFULNESS } from './mindfulness';
import { STRESS } from './stress';
import { BASKETBALL } from './basketball';
import { SOCCER } from './soccer';

import { COMPETITIVE_PROGRAMMING } from './competitive-programming';
import { ROBOTICS } from './robotics';
import { ELECTRONICS } from './electronics';
import { COMPETITION_MATH } from './competition-math';
import { OLYMPIAD_SCIENCE } from './olympiad-science';
import { DEBATE } from './debate';
import { MODEL_UN } from './model-un';
import { PERFORMANCE } from './performance';

import { LIFE } from './life';
import { COOKING } from './cooking';
import { TRAVEL } from './travel';
import { DRIVING } from './driving';
import { CHESS } from './chess';

/** Every tree, roots first within each subject and children after them. */
export const TREES: readonly SubjectTree[] = [
  // Math and science
  MATH, CALCULUS, DIFF_EQ, STATISTICS, LINEAR_ALGEBRA, DISCRETE,
  COMPETITION_MATH, TRIGONOMETRY, PRECALCULUS, ALGEBRA, GEOMETRY,
  SCIENCE, PHYSICS, ENGINEERING, CHEMISTRY, ORGANIC_CHEMISTRY, BIOLOGY,
  BIOCHEMISTRY,
  MICROBIOLOGY, NEUROSCIENCE, ANATOMY, GENETICS, ECOLOGY, EARTH_SPACE,
  ASTRONOMY, GEOLOGY, OLYMPIAD_SCIENCE,
  ENVIRONMENTAL_SCIENCE, FORENSIC_SCIENCE, LAB_WORK, SCIENCE_FAIR,
  // Studying
  SCHOOL, STUDY, NOTE_TAKING, AI_TOOLS, TEST_PREP, COLLEGE_APPS,
  EXTRACURRICULARS, PRE_MED, FINANCIAL_AID,
  // Language and humanities
  LANGUAGE, WRITING, CREATIVE_WRITING, JOURNALISM, ESSAYS, LITERATURE, POETRY,
  FOREIGN_LANGUAGE, PUBLIC_SPEAKING, LATIN, SIGN_LANGUAGE,
  HUMANITIES, HISTORY, PHILOSOPHY, PSYCHOLOGY, DEBATE, MODEL_UN, CIVICS,
  GEOGRAPHY, SOCIOLOGY,
  // Computing
  CODING, WEB, APP_DEV, ALGO, GRAPHS, SYSTEMS, NETWORKING,
  DATA_SCIENCE, MACHINE_LEARNING, SPREADSHEETS, DATABASES, CYBERSECURITY,
  COMPETITIVE_PROGRAMMING, ROBOTICS, ELECTRONICS, PYTHON, JAVA, GAME_DEV,
  // Business and money
  BUSINESS, FINANCE, ECONOMICS, MARKETING, MANAGEMENT, ENTREPRENEURSHIP,
  ACCOUNTING, LAW,
  // Work
  PRODUCTIVITY, FOCUS, CAREER, PART_TIME_JOB, INTERNSHIPS, LEADERSHIP,
  // Creative
  ART, DRAWING, DESIGN, CAD, PHOTOGRAPHY, FILM, THEATER, ART_HISTORY, DANCE,
  MUSIC, GUITAR, PIANO, VOICE, PRODUCTION, PERFORMANCE, VIOLIN, DRUMS, BAND,
  MUSIC_THEORY,
  // Health and fitness
  FITNESS, STRENGTH, ENDURANCE, SWIMMING, NUTRITION, MINDFULNESS, STRESS,
  BASKETBALL,
  SOCCER,
  // Life and home
  LIFE, COOKING, TRAVEL, DRIVING, CHESS,
];

/** The tree the page opens on. Always defined, so nothing has to handle an
 *  empty hierarchy. School & College, because Summit is built for students and
 *  that is the one tree every student is already climbing. */
export const DEFAULT_TREE: SubjectTree = SCHOOL;

export type { SubjectNode, SubjectTree } from './types';
