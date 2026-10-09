/**
 * The lattice library: every subject tree the app knows about, in one list.
 *
 * ## Why this is a folder rather than a file
 *
 * It was one file, and one file was right while there were nine trees. There are
 * sixty-one, which is several thousand lines of authored description, and a
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

import { CODING } from './coding';
import { WEB } from './web';
import { ALGO } from './algorithms';
import { GRAPHS } from './graphs';
import { SYSTEMS } from './systems';
import { NETWORKING } from './networking';
import { DATA_SCIENCE } from './data-science';
import { MACHINE_LEARNING } from './machine-learning';
import { DATABASES } from './databases';
import { CYBERSECURITY } from './cybersecurity';

import { MATH } from './mathematics';
import { CALCULUS } from './calculus';
import { STATISTICS } from './statistics';
import { LINEAR_ALGEBRA } from './linear-algebra';
import { DISCRETE } from './discrete';

import { SCIENCE } from './science';
import { PHYSICS } from './physics';
import { CHEMISTRY } from './chemistry';
import { BIOLOGY } from './biology';
import { EARTH_SPACE } from './earth-space';

import { LANGUAGE } from './language';
import { WRITING } from './writing';
import { LITERATURE } from './literature';
import { FOREIGN_LANGUAGE } from './foreign-language';

import { HUMANITIES } from './humanities';
import { HISTORY } from './history';
import { PHILOSOPHY } from './philosophy';
import { PSYCHOLOGY } from './psychology';

import { BUSINESS } from './business';
import { FINANCE } from './finance';
import { ECONOMICS } from './economics';
import { MARKETING } from './marketing';
import { MANAGEMENT } from './management';

import { PRODUCTIVITY } from './productivity';
import { FOCUS } from './focus';
import { STUDY } from './study';
import { CAREER } from './career';

import { ART } from './art';
import { DRAWING } from './drawing';
import { DESIGN } from './design';
import { PHOTOGRAPHY } from './photography';
import { FILM } from './film';

import { MUSIC } from './music';
import { GUITAR } from './guitar';
import { PIANO } from './piano';
import { VOICE } from './voice';
import { PRODUCTION } from './production';

import { FITNESS } from './fitness';
import { STRENGTH } from './strength';
import { ENDURANCE } from './endurance';
import { NUTRITION } from './nutrition';
import { MINDFULNESS } from './mindfulness';

import { COMPETITIVE_PROGRAMMING } from './competitive-programming';
import { ROBOTICS } from './robotics';
import { COMPETITION_MATH } from './competition-math';
import { OLYMPIAD_SCIENCE } from './olympiad-science';
import { DEBATE } from './debate';
import { PERFORMANCE } from './performance';

import { LIFE } from './life';
import { COOKING } from './cooking';
import { TRAVEL } from './travel';

/** Every tree, roots first within each subject and children after them. */
export const TREES: readonly SubjectTree[] = [
  // Computing
  CODING, WEB, ALGO, GRAPHS, SYSTEMS, NETWORKING,
  DATA_SCIENCE, MACHINE_LEARNING, DATABASES, CYBERSECURITY,
  COMPETITIVE_PROGRAMMING, ROBOTICS,
  // Math and science
  MATH, CALCULUS, STATISTICS, LINEAR_ALGEBRA, DISCRETE, COMPETITION_MATH,
  SCIENCE, PHYSICS, CHEMISTRY, BIOLOGY, EARTH_SPACE, OLYMPIAD_SCIENCE,
  // Language and humanities
  LANGUAGE, WRITING, LITERATURE, FOREIGN_LANGUAGE,
  HUMANITIES, HISTORY, PHILOSOPHY, PSYCHOLOGY, DEBATE,
  // Business and money
  BUSINESS, FINANCE, ECONOMICS, MARKETING, MANAGEMENT,
  // Work and studying
  PRODUCTIVITY, FOCUS, STUDY, CAREER,
  // Creative
  ART, DRAWING, DESIGN, PHOTOGRAPHY, FILM,
  MUSIC, GUITAR, PIANO, VOICE, PRODUCTION, PERFORMANCE,
  // Health and fitness
  FITNESS, STRENGTH, ENDURANCE, NUTRITION, MINDFULNESS,
  // Life and home
  LIFE, COOKING, TRAVEL,
];

/** The tree the page opens on. Always defined, so nothing has to handle an
 *  empty hierarchy. */
export const DEFAULT_TREE: SubjectTree = CODING;

export type { SubjectNode, SubjectTree } from './types';
