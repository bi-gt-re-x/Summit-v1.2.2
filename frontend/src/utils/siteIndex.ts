/**
 * Every place in the app, and how close a typed string comes to one.
 *
 * The top bar's search used to look only at the account's tasks, which meant
 * the one thing nobody can find in an app of twenty-odd screens — the screen —
 * was the one thing it could not look for. So there are two categories now:
 *
 *   **Tasks**       the account's own work, matched by the server.
 *   **Components**  the containers this app is made of — pages, the tabs
 *                   inside them, the sections of Settings. Matched here,
 *                   because a route table is not something to ask a server for.
 *
 * ## Why a list rather than a walk of the router
 *
 * `<Routes>` in App.tsx knows every path and nothing else: no name, no
 * synonyms, and no idea that `/analytics/records` is a tab called Records that
 * a reader might look for by typing "percentile". A search index needs the
 * words people actually type, and those exist nowhere but here.
 *
 * The cost is that this list is a mirror and can go stale. It degrades
 * gently — a path the router no longer serves lands on the catch-all, and a
 * page missing from here is a page the search cannot find rather than a
 * broken one — and `siteIndex.test.ts` holds the shape.
 *
 * ## Scoring
 *
 * One scale for both categories, because "the closest match" has to mean
 * something across them: typing "goal" should be able to prefer the Goals page
 * over a task called "Set up goalkeeper drills", and typing "goalkeeper"
 * should prefer the task. `score` answers that with the four ways a string can
 * be inside another, in the order a reader means them.
 */

/** One container: a page, a tab inside one, or a section of Settings. */
export interface Place {
  id: string;
  /** What it is called, as the app calls it. */
  name: string;
  /** Where it lives, for the line under the name. '' for a top-level page. */
  where: string;
  /** The route. Every one of these is served by App.tsx. */
  to: string;
  /**
   * The words somebody might type instead of the name.
   *
   * This is the half that makes the difference: "percentile" for the Records
   * tab, "dark mode" for Appearance, "delete my account" for the danger zone.
   * Nobody searches for a screen by its title — they search for the thing they
   * came to do.
   */
  keywords: string;
}

/**
 * The app's containers.
 *
 * Paths mirror the routes in App.tsx; the Analytics tabs mirror `VIEWS` in
 * components/Analytics/Header; the `/settings/<id>` entries mirror the section
 * ids in pages/Settings.tsx, which is what that page's `:section` parameter
 * selects on.
 */
export const PLACES: Place[] = [
  // --- The pages ---------------------------------------------------------
  {
    id: 'dashboard',
    name: 'Dashboard',
    where: '',
    to: '/dashboard',
    keywords: 'home today progress xp level streak focus timer daily goal quote greeting',
  },
  {
    id: 'tasks',
    name: 'Tasks',
    where: '',
    to: '/tasks',
    keywords: 'to do todo list work due overdue priority add task board',
  },
  {
    id: 'goals',
    name: 'Goals',
    where: '',
    to: '/goals',
    keywords: 'targets milestones deadlines ambitions objectives ladder',
  },
  {
    id: 'notes',
    name: 'Notes',
    where: '',
    to: '/notes',
    keywords: 'writing markdown notebook journal shelf',
  },
  {
    id: 'records',
    name: 'Records',
    where: '',
    to: '/records',
    keywords: 'personal best hall of fame high score achievements outside the app',
  },
  {
    id: 'achievements',
    name: 'Achievements',
    where: '',
    to: '/achievements',
    keywords: 'badges trophies wall unlocks tiers titles',
  },
  {
    id: 'skill-trees',
    name: 'Skill Tree',
    where: '',
    to: '/skill-trees',
    keywords: 'lattice subjects nodes mastery branches levels learning',
  },

  // --- The calendar, which is three views of one page --------------------
  {
    id: 'calendar',
    name: 'Calendar',
    where: '',
    to: '/calendar',
    keywords: 'schedule plan events blocks agenda diary timetable',
  },
  {
    id: 'calendar-day',
    name: 'Day',
    where: 'Calendar',
    to: '/calendar/day',
    keywords: 'today hour by hour schedule agenda focus notes',
  },
  {
    id: 'calendar-week',
    name: 'Week',
    where: 'Calendar',
    to: '/calendar/week',
    keywords: 'seven days grid drag blocks weekly plan',
  },
  {
    id: 'calendar-month',
    name: 'Month',
    where: 'Calendar',
    to: '/calendar/month',
    keywords: 'monthly grid overview dates events',
  },

  // --- Analytics, which is seven tabs. Mirrors VIEWS in
  //     components/Analytics/Header.tsx.
  {
    id: 'analytics',
    name: 'Analytics',
    where: '',
    to: '/analytics',
    keywords: 'report card figures charts scores trends data numbers',
  },
  {
    id: 'analytics-recommendations',
    name: 'Recommendations',
    where: 'Analytics',
    to: '/recommendations',
    keywords: 'advice what to change next moves suggestions ranked worth',
  },
  {
    id: 'analytics-overview',
    name: 'Overview',
    where: 'Analytics',
    to: '/analytics',
    keywords: 'totals trajectory standing long view summary',
  },
  {
    id: 'analytics-goals',
    name: 'Goals',
    where: 'Analytics',
    to: '/analytics/goals',
    keywords: 'pacing will it happen goal health what you have not aimed at',
  },
  {
    /* Habits and Insights are one tab. Both sets of keywords are kept on it —
       somebody searching "streaks" or "routines" is looking for something this
       tab still draws, and a search index that forgets the old word for a
       thing sends them nowhere. */
    id: 'analytics-insights',
    name: 'Insights',
    where: 'Analytics',
    to: '/insights',
    keywords:
      'why patterns conditions quality difficulty execution reasons '
      + 'habits routines rhythms consistency streaks parts of day when you work',
  },
  {
    id: 'analytics-subjects',
    name: 'Subjects',
    where: 'Analytics',
    to: '/subjects',
    keywords: 'per subject levels breakdown what you are getting good at',
  },
  {
    id: 'analytics-records',
    name: 'Records',
    where: 'Analytics',
    to: '/analytics/records',
    keywords: 'percentile ranking standing round numbers last thirty days pacing',
  },

  // --- Settings, whose sections are its `:section` parameter. Mirrors the
  //     `sections` list in pages/Settings.tsx.
  {
    id: 'settings',
    name: 'Settings',
    where: '',
    to: '/settings',
    keywords: 'preferences options configuration account controls',
  },
  {
    id: 'settings-profile',
    name: 'Profile',
    where: 'Settings',
    to: '/settings/profile',
    keywords: 'name avatar picture username email joined display name',
  },
  {
    id: 'settings-general',
    name: 'Startup',
    where: 'Settings',
    to: '/settings/general',
    keywords: 'home page where the app opens landing first screen',
  },
  {
    id: 'settings-appearance',
    name: 'Appearance',
    where: 'Settings',
    to: '/settings/appearance',
    keywords: 'theme dark mode light accent colour animation motion background rail collapsed',
  },
  {
    id: 'settings-dashboard',
    name: 'Dashboard',
    where: 'Settings',
    to: '/settings/dashboard',
    keywords: 'daily xp goal stat cards insights focus panel quote which panels',
  },
  {
    id: 'settings-tasks',
    name: 'Tasks',
    where: 'Settings',
    to: '/settings/tasks',
    keywords: 'default priority xp rating questions confirm delete sort grouping horizon',
  },
  {
    id: 'settings-calendar',
    name: 'Calendar',
    where: 'Settings',
    to: '/settings/calendar',
    keywords: 'default view week starts on monday sunday',
  },
  {
    id: 'settings-focus',
    name: 'Focus',
    where: 'Settings',
    to: '/settings/focus',
    keywords: 'daily focus goal hours dim the page catch up untracked days',
  },
  {
    id: 'settings-notifications',
    name: 'Notifications',
    where: 'Settings',
    to: '/settings/notifications',
    keywords: 'turn off alerts bell pop ups toasts overdue calendar analytics goals streak badges',
  },
  {
    id: 'settings-analytics',
    name: 'Analytics',
    where: 'Settings',
    to: '/settings/analytics',
    keywords: 'window tone harshness detail standing ranking setup questions baseline',
  },
  {
    id: 'settings-data',
    name: 'Data & export',
    where: 'Settings',
    to: '/settings/data',
    keywords: 'export download json csv backup where your data lives storage',
  },
  {
    id: 'settings-about',
    name: 'About',
    where: 'Settings',
    to: '/settings/about',
    keywords: 'version level legal privacy terms',
  },
  {
    id: 'settings-danger',
    name: 'Reset and delete',
    where: 'Settings',
    to: '/settings/danger',
    keywords: 'danger zone delete my account erase everything reset progress clear tasks wipe',
  },

  // --- Routed, but not built yet. In the index on purpose: a reader looking
  //     for one should find the page that says what it will be and what it is
  //     waiting on, not nothing at all. See pages/Unbuilt.tsx.
  {
    id: 'focus-page',
    name: 'Focus',
    where: 'Not built yet',
    to: '/focus',
    keywords: 'timer pomodoro session history deep work',
  },
  {
    id: 'library',
    name: 'Library',
    where: 'Not built yet',
    to: '/library',
    keywords: 'saved resources links reading list references',
  },
  {
    id: 'history',
    name: 'History',
    where: 'Not built yet',
    to: '/history',
    keywords: 'activity log timeline what happened audit',
  },

  // --- The written pages -------------------------------------------------
  {
    id: 'about-us',
    name: 'About Us',
    where: '',
    to: '/about-us',
    keywords: 'who made this the team story mission',
  },
  {
    id: 'privacy-policy',
    name: 'Privacy Policy',
    where: '',
    to: '/privacy-policy',
    keywords: 'data collection cookies what we store legal',
  },
  {
    id: 'terms-of-service',
    name: 'Terms of Service',
    where: '',
    to: '/terms-of-service',
    keywords: 'terms conditions rules legal agreement',
  },
];

// --------------------------------------------------------------------------
// Scoring
// --------------------------------------------------------------------------
/** What a match is worth, best first. Kept as named steps so the ordering is
 *  a thing you can read rather than four magic numbers. */
const EXACT = 1000;
const PREFIX = 800;
const WORD = 600;
const INSIDE = 400;
const KEYWORD = 200;

/**
 * How well `needle` matches `name`, or 0.
 *
 * Four ways in, in the order a reader means them: the whole thing, the start
 * of it, the start of a word in it, and somewhere inside it. Shorter names win
 * ties, because "Goals" is a closer answer to "goal" than "Goals due this week"
 * is — the same instinct that makes a search box put the exact page above a
 * task whose title merely contains the word.
 */
export function score(needle: string, name: string): number {
  const found = name.toLowerCase();
  const want = needle.toLowerCase().trim();
  if (!want) return 0;

  // Shorter is closer, and the bonus is capped so it can never lift a weaker
  // kind of match above a stronger one.
  const tight = Math.max(0, 60 - found.length);

  if (found === want) return EXACT + tight;
  if (found.startsWith(want)) return PREFIX + tight;
  // A word start: " goal" inside "Daily goal", but not "goal" inside "goalkeeper".
  if (found.includes(' ' + want) || found.includes('-' + want)) return WORD + tight;
  if (found.includes(want)) return INSIDE + tight;
  return 0;
}

/** A place's score: its name, or — worth less — one of the words it answers to. */
export function scorePlace(needle: string, place: Place): number {
  const direct = score(needle, place.name);
  if (direct) return direct;

  // The full name as a reader would say it out loud: "Settings Notifications".
  const full = place.where ? `${place.where} ${place.name}` : place.name;
  const said = score(needle, full);
  if (said) return said;

  return score(needle, place.keywords) ? KEYWORD : 0;
}

/** Every container matching `needle`, closest first. */
export function findPlaces(needle: string, limit = 8): Place[] {
  const want = needle.trim();
  if (!want) return [];

  return PLACES.map((place) => ({ place, points: scorePlace(want, place) }))
    .filter((row) => row.points > 0)
    .sort((a, b) => b.points - a.points || a.place.name.localeCompare(b.place.name))
    .slice(0, limit)
    .map((row) => row.place);
}

/** What a place is worth, for ranking it against a task. */
export function placePoints(needle: string, place: Place): number {
  return scorePlace(needle, place);
}
