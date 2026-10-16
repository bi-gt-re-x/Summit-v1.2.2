/**
 * The pages that are routed but not built.
 *
 * They were a file each, and files of twenty lines that differed only in three
 * strings are a table pretending to be a module tree. Here it is the table, and
 * one component that reads the path it was rendered at.
 *
 * There were eight. Tasks was the first to leave — it is pages/Tasks.tsx now,
 * with its own route in App.tsx, which is exactly the exit this file's own
 * instructions below describe. Growth Tree left the same way and is
 * pages/SkillTrees.tsx; its old path redirects, because the placeholder was
 * routed long enough for links to it to exist. Notes left next, into
 * pages/Notes.tsx over the table data/sql/notes.sql had been holding for it.
 * Settings and Achievements left together, over the two schemas that had been
 * waiting for them — three left.
 *
 * The point of these is honesty. Each route in the top bar and in the app's
 * structure resolves to something that says what it will be, rather than to a
 * blank screen that reads as a bug — and it names the files it will be built
 * from, so the placeholder doubles as the note for whoever picks it up.
 *
 * `PATHS` is exported because App.tsx builds the routes from it. Adding a page
 * here is one entry, not a file and a lazy import and a <Route>. Building one
 * for real is the reverse: give it its own module, drop its entry, and the
 * route in App.tsx stops being generated and becomes its own line.
 *
 * The stylesheets that used to sit beside these — achievements.css,
 * notes.css and the rest — were five-line comments reserving a filename. A
 * page that does not exist does not need a stylesheet to not have rules in;
 * the real one can create it on the day it has something to style.
 */
import { useLocation } from 'react-router-dom';
import { NotBuilt } from '@/components';
import { useDocumentTitle } from '@/hooks';

interface Unbuilt {
  name: string;
  description: string;
  /** What it will be built from — a stub endpoint, a schema, a script to port. */
  files: string[];
}

const PAGES: Record<string, Unbuilt> = {
  '/focus': {
    name: 'Focus',
    description:
      'The focus timer as its own page, with your session history.',
    files: [
      'backend/api/focus.py: sync and history already exist',
      'src/services/focus.ts: already wired',
      'frontend/js/timer.js: the timer to port',
    ],
  },
  '/library': {
    name: 'Library',
    description: 'Saved resources and reference material.',
    files: [
      'backend/api/library.py: a stub',
      'data/sql/library.sql: tables exist, schema only',
    ],
  },
  '/history': {
    name: 'History',
    description: 'A searchable record of everything already done.',
    files: [
      'backend/api/history.py: a stub',
      'data/sql/history.sql: tables exist, schema only',
    ],
  },
};

/** The routes App.tsx generates from this file. */
export const PATHS = Object.keys(PAGES);

export default function Unbuilt() {
  const { pathname } = useLocation();
  // Only the paths above route here, so the fallback is unreachable in
  // practice. It exists because reading a Record by a string is not a promise
  // to the type system, and a page that renders nothing would be the one thing
  // this component exists to prevent.
  const page = PAGES[pathname] ?? {
    name: 'Not built',
    description: "This part of the app doesn't exist yet.",
    files: [],
  };

  useDocumentTitle(page.name);

  return (
    <NotBuilt name={page.name} description={page.description} files={page.files} />
  );
}
