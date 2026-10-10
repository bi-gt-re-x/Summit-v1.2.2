/**
 * The app's navigation — a rail down the left-hand side.
 *
 * It was a bar across the top until the calendar was redesigned against a
 * mock-up that had a rail, and a rail on one page with a bar on every other is
 * two apps. So this replaces the bar everywhere: the way home, the
 * destinations, and — in the foot — how far the account has got. The theme
 * switch and the account menu stood here too until a bar came back across the
 * top and they went to it, which is where a reader looks for them.
 *
 * **The layout contract is a variable, not a shape.** Pages do not know what
 * the navigation looks like; they know that `--rail-w` is taken from the left
 * and `--topnav-h` from the top. `--topnav-h` sat at 0 through the years the
 * rail was the only navigation, kept because a dozen stylesheets size
 * themselves with `calc(100vh - var(--topnav-h))` — and subtracting nothing was
 * the right answer, not a shim, which is what let the navigation turn ninety
 * degrees without a single page's height arithmetic changing. `Topbar` gave it
 * a height again and those same pages gave the height back, untouched.
 *
 * Collapsing works the same way it always did, through the same class:
 * `html.nav-collapsed` drops `--rail-w` to a strip wide enough for the icons,
 * and every page widens into it without knowing why. What changed is where the
 * answer is kept. It is a preference on the account now (Settings, Appearance),
 * so a rail folded on the laptop is folded on the tablet — and the localStorage
 * key it used to live in alone is still written, as a cache: the account's
 * answer arrives a moment after the first paint, and without something to open
 * on, a collapsed rail would swing open and shut on every load.
 *
 * **Three sections, each folding under its heading.** Core is every page of
 * the app; Personal is the reader's three spaces (pages/Space.tsx), each
 * renamable; Team is three more of the same, each with a member list whose
 * invites are a placeholder for now. A search box under
 * the mark opens the top bar's search (utils/searchBus), as does ⌘K. Which
 * sections are folded is kept per device (`SECTIONS_KEY`). None of this is
 * drawn on a phone, where the rail is a bottom bar.
 *
 * The rank and XP in the foot are the one thing here that reads account data,
 * and it reads `/api/stats` — six integers — rather than the account's whole
 * task list, which is what it used to arrive attached to. The rail is mounted
 * outside the router, so that is one call for the session rather than one per
 * page — and because it never unmounts, it would otherwise still be showing
 * the level you had when you opened the app. The dashboard
 * announces `summit:stats-changed` when a completion moves the total, and this
 * listens. A custom event rather than shared state because that is the whole of
 * the dependency: one number, one direction, no reply.
 *
 * **The foot is the nametag**, the same one the top bar's account button
 * wears: the account's picture, then "<title> <name>", then the level and the
 * bar to the next one. Both read hooks/useNametag, so the two corners cannot
 * say different things about the same person. The three dots beside the name
 * choose the title (utils/rankTitle); the avatar picker is in the top bar's
 * account menu.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth, useMediaQuery, useSettings, useSpaces, useStats, useSubjectIndex } from '@/hooks';
import { followedSubjects } from '@/utils/analyticsPrefs';
import { format } from '@/utils';
import { rankFor } from '@/utils/rank';
import { useNametag } from '@/hooks/useNametag';
import { NametagText, TitleChoices } from '@/components/Nametag';
import { STATS_CHANGED } from '@/utils/statsBus';
import { openSearch } from '@/utils/searchBus';
import { featureForPath } from '@/utils/starter';
import { useStarter } from '@/hooks/useStarter';
import '@/styles/starter.css';
import '@/styles/rail.css';

const COLLAPSE_KEY = 'topnavCollapsed';

/** Which of the three sections are folded. Per device, like a scroll position:
    a convenience of this screen rather than a preference of the account. */
const SECTIONS_KEY = 'railSections';

type SectionId = 'core' | 'personal' | 'team';

const ALL_OPEN: Record<SectionId, boolean> = { core: true, personal: true, team: true };

function readSections(): Record<SectionId, boolean> {
  try {
    const saved = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? '{}') as Partial<Record<SectionId, unknown>>;
    return {
      core: saved.core !== false,
      personal: saved.personal !== false,
      team: saved.team !== false,
    };
  } catch {
    return ALL_OPEN;
  }
}

/**
 * Fired when a completion moves the XP total. Defined in utils/statsBus, which
 * sends it once per burst of changes rather than once per task; re-exported
 * here because this is where every listener has always imported it from.
 */
export { STATS_CHANGED };

interface Tab {
  to: string;
  label: string;
  icon: React.ReactNode;
  /**
   * Other paths this entry should light up for.
   *
   * The analytics page is five tabs on five URLs and one rail entry, so without
   * this the rail would show nothing selected on four of them while the reader
   * is plainly on the analytics page.
   */
  also?: string[];
  /**
   * Path prefixes this entry should light up for.
   *
   * `also` is exact matches, which cannot express a route with an id in it —
   * `/analytics/subject/:subjectId` is one URL per subject the account
   * follows, and listing them would mean the rail knowing the catalogue.
   */
  under?: string[];
  /**
   * Whether this entry unfolds into a menu, and which one.
   *
   * The rows are not in `TABS` because they are not static: they come from the
   * account's own answer to a setup question (`analytics_subjects`) joined
   * against its subject catalogue, neither of which a module-level constant
   * can hold. So the table carries the marker and the component builds the
   * rows — which keeps the one entry that has a menu from turning `TABS` into
   * a tree that nine other entries pay for.
   */
  menu?: 'analytics';
  /**
   * Show this one in the phone's bottom bar.
   *
   * Four of the ten, because a bar is only as wide as the phone. All ten were
   * laid out across 375px and the last two — Records and Settings — were
   * simply off the end of the screen: measured at x 352-393 and 395-436, with
   * nothing to scroll. Two whole sections of the app were unreachable on a
   * phone. The other six are one tap away behind More.
   *
   * These four because they are the ones a phone is *for*: what is on today,
   * what is next, what is due, and what it is all toward. The reference pages
   * — analytics, records, the skill tree — are what a desk is for.
   */
  phone?: boolean;
  /**
   * Drawn in the foot rather than the list: a small icon to the right of the
   * nametag. Settings is about the account the nametag names, and a gear
   * beside the profile is where people look for it. On a phone the foot is
   * not drawn, so it stays in the More sheet there.
   */
  foot?: boolean;
}

/**
 * The width below which the rail lies down along the bottom of the screen.
 *
 * The same 640px as the `@media (max-width: 640px)` block in styles/rail.css,
 * and the duplication is the point of naming it: below this the rail is not a
 * narrower rail, it is a different component with four tabs and a sheet. CSS
 * cannot express "render six of these somewhere else", so the breakpoint has
 * to exist in both places. If one moves, move the other.
 */
const PHONE = '(max-width: 640px)';

const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** The gear, shared by the Settings entry and the foot's icon that draws it. */
const SETTINGS_ICON = (
  <svg {...stroke}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);

/**
 * The app's own pages. Home is not among them — the wordmark at the top is the
 * way back to the landing page, and one route home is enough.
 *
 * Dashboard leads because it is where signing in puts you. The rest follow the
 * design's order, with Growth kept: it is a built page, and a built page with
 * no way to reach it is a deleted page with extra steps.
 */
const TABS: Tab[] = [
  {
    to: '/dashboard',
    phone: true,
    label: 'Dashboard',
    icon: (
      <svg {...stroke}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9" />
      </svg>
    ),
  },
  {
    to: '/calendar',
    phone: true,
    label: 'Calendar',
    icon: (
      <svg {...stroke}>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
      </svg>
    ),
  },
  {
    // Points at Recommendations rather than the Overview, which is a change and
    // a deliberate one: the rail's job is to put a reader somewhere useful, and
    // of its tabs it is the only one that ends in something to do. The
    // Overview is one click along the bar for anyone who wants the totals.
    to: '/recommendations',
    // The page calls itself Advanced Analytics; the rail says Analytics. The
    // rail is a column of one-word destinations and the odd two-word one
    // wraps — the heading is where the full name belongs.
    label: 'Analytics',
    // The page's other tabs. Every path a removed tab had redirects in
    // App.tsx, so none of them can be the page the reader is on.
    also: ['/analytics', '/insights', '/habits', '/subjects', '/analytics/growth'],
    // The per-subject pages, which are one URL each and so cannot be listed.
    under: ['/analytics/subject/'],
    // The only entry in this table that unfolds. See `Tab.menu`.
    menu: 'analytics',
    icon: (
      <svg {...stroke}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  // Growth had an entry here until its five tabs became four tabs of the
  // analytics page and one duplicate of its Overview. Insights and
  // Recommendations had entries before that, for the same reason and with the
  // same ending. The rail points at the one page once and the tab bar does the
  // rest — a rail entry per tab would be the same destination listed seven
  // times. Every one of those URLs still works and still opens the right tab;
  // see `Tab.also` above, and the `/growth` redirect in App.tsx.
  {
    to: '/tasks',
    phone: true,
    label: 'Tasks',
    icon: (
      <svg {...stroke}>
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    ),
  },
  {
    to: '/goals',
    phone: true,
    label: 'Goals',
    icon: (
      <svg {...stroke}>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="1" />
      </svg>
    ),
  },
  {
    // The one two-word label here, and the note above warns those wrap. This
    // one does not — it fits the open rail on a line and the collapsed rail
    // shows the icon alone like every other entry. "Skills" would have been
    // one word and the wrong one: the analytics page has a Skills tab
    // answering a different question, and two destinations sharing a name is
    // worse than a label a character longer than the rest.
    //
    // Singular, matching the page's own heading: the page is one graph with a
    // category picker, not a shelf of trees, and the rail saying otherwise
    // would promise a different screen from the one it opens.
    to: '/skill-trees',
    label: 'Skill Tree',
    // The path the placeholder reserved, kept so links to it still land.
    also: ['/growth-tree'],
    icon: (
      <svg {...stroke}>
        <path d="M12 21v-8" />
        <path d="M12 13 7.5 9.5M12 13l4.5-3.5" />
        <circle cx="12" cy="4" r="2.2" />
        <circle cx="5.5" cy="8" r="2.2" />
        <circle cx="18.5" cy="8" r="2.2" />
        <path d="M12 6.2v2.4" />
      </svg>
    ),
  },
  {
    to: '/notes',
    label: 'Notes',
    icon: (
      <svg {...stroke}>
        <path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M15 3v5h5M8.5 13h7M8.5 17h4" />
      </svg>
    ),
  },
  {
    // Under Notes, because both are places you go *to* rather than results you
    // come back for — the pages above this point report on work that is
    // already done, and these two are where some of it happens.
    to: '/timer',
    label: 'Timer',
    icon: (
      <svg {...stroke}>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9.5V13l2.5 1.5" />
        <path d="M9 2h6" />
      </svg>
    ),
  },
  {
    // The account looking back at itself: personal bests, growth over time,
    // Personal bests and the badge wall: /achievements and
    // /achievements/badges.
    to: '/achievements',
    label: 'Achievements',
    under: ['/achievements/'],
    icon: (
      <svg {...stroke}>
        <path d="M4 20V9M9.5 20V4M15 20v-8M20.5 20v-5" />
        <path d="M3 20h18" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    foot: true,
    icon: SETTINGS_ICON,
  },
];

/**
 * Whether an entry is the page currently open.
 *
 * `NavLink` answers this for the entry's own path and nothing else, and three
 * places here need the whole answer — the column, the phone's More button, and
 * the sheet. Written once so the three cannot drift: an entry lit in the
 * column and dark in the sheet is a rail that disagrees with itself about
 * where the reader is.
 */
function onPage(tab: Tab, pathname: string): boolean {
  if (tab.to === pathname) return true;
  if (tab.also?.includes(pathname)) return true;
  return Boolean(tab.under?.some((prefix) => pathname.startsWith(prefix)));
}

/** Two people: a space shared with a team. */
const TEAM_ICON = (
  <svg {...stroke}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M16 14.2a5 5 0 0 1 5.5 4.8" />
  </svg>
);

/** A person with a plus: invite somebody. */
const INVITE_ICON = (
  <svg {...stroke}>
    <circle cx="10" cy="8" r="3.5" />
    <path d="M3.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M19 8v6M16 11h6" />
  </svg>
);

/** A small padlock at the end of a locked row (utils/starter). */
const LOCK_ICON = (
  <svg {...stroke} className="rail-lock" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

/** A page with a folded corner: one of the reader's own spaces. */
const SPACE_ICON = (
  <svg {...stroke}>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
    <path d="M14 3v6h6" />
  </svg>
);

interface SectionProps {
  id: SectionId;
  label: string;
  open: boolean;
  onFold: (id: SectionId) => void;
  children: ReactNode;
}

/** A heading that folds what is under it: Core, Personal, Team. */
function Section({ id, label, open, onFold, children }: SectionProps) {
  const body = `rail-section-${id}`;
  return (
    <section className={`rail-section${open ? ' is-open' : ''}`} aria-label={label}>
      <button
        type="button"
        className="rail-section-head"
        aria-expanded={open}
        aria-controls={body}
        onClick={() => onFold(id)}
      >
        <span>{label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m8 10 4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="rail-section-body" id={body}>
          {children}
        </div>
      )}
    </section>
  );
}

export function Rail() {
  const { status, username } = useAuth();
  const { stats, reload } = useStats();
  // Only for `Tab.also` — NavLink handles its own path on every other entry.
  const { pathname } = useLocation();

  const { prefs, ready, update } = useSettings();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false; // private mode: the rail just starts open
    }
  });

  // The account's answer, once it has arrived, is the one that counts — the
  // cache above was only ever a guess at it. This is also what makes the switch
  // on the settings page move the rail: the preference changes, and this hears.
  useEffect(() => {
    if (ready) setCollapsed(prefs.nav_collapsed);
  }, [prefs.nav_collapsed, ready]);

  // `nav-collapsed` on <html> is what shrinks --rail-w; every page sizes itself
  // off that variable, so the page grows into the space on its own.
  useEffect(() => {
    document.documentElement.classList.toggle('nav-collapsed', collapsed);
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* see above */
    }
  }, [collapsed]);

  /* Applied here and stored in the background. A rail that waited for a round
     trip before folding would feel broken on a slow connection, and there is
     nothing to roll back to if the write fails — the class is already right,
     and the next load reads the cache. */
  const flip = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    void update({ nav_collapsed: next });
  }, [collapsed, update]);

  // The level below is read once for the session; this is how it hears that
  // finishing something has moved it.
  useEffect(() => {
    const onChanged = () => reload();
    window.addEventListener(STATS_CHANGED, onChanged);
    return () => window.removeEventListener(STATS_CHANGED, onChanged);
  }, [reload]);

  const signedIn = status === 'signed-in';
  const level = stats ? format.levelForTotalXp(stats.xp) : null;
  /* The same twenty band names the skill trees use, read off the account level
     rather than a subject's. One ladder of names across the app: "Adept" has to
     mean the same distance travelled wherever it is printed, or it is
     decoration. */
  const rank = level ? rankFor(level.level) : null;

  /* Below the breakpoint the bar shows four tabs and a More sheet; above it,
     all ten in a column. See PHONE and the `phone` flag on Tab. */
  const phone = useMediaQuery(PHONE);

  /* Getting started (utils/starter). A new account's rail lists Dashboard,
     Calendar and Timer, and one "More tools" row that unfolds the rest; after
     its first days the rest are listed with a padlock. Either way a locked row
     is still a link, and lands on the note in components/FeatureGate. */
  const starter = useStarter();
  const [peek, setPeek] = useState(false);
  const lockedTab = (tab: Tab) => {
    const feature = featureForPath(tab.to);
    return feature ? starter.isLocked(feature.id) : false;
  };
  const starting = starter.stage === 'starter';
  /** Left out of the column for now: a locked page, in the starter days, folded. */
  const waiting = (tab: Tab) => starting && !peek && lockedTab(tab);
  const spacesLocked = starter.isLocked('spaces');
  const spacesWaiting = starting && !peek && spacesLocked;

  /* On a phone in the starter days the bar is the three starter pages, and
     everything else — Settings and the locked pages, marked — is in More. */
  const shown = phone
    ? starting
      ? TABS.filter((tab) => !tab.foot && !lockedTab(tab))
      : TABS.filter((tab) => tab.phone)
    : TABS;
  const rest = phone ? TABS.filter((tab) => !shown.includes(tab)) : [];

  /**
   * The subjects under Analytics, and whether the menu is open.
   *
   * The catalogue is cached module-wide and read by a dozen components
   * already, so this costs the rail no request of its own — see
   * hooks/useSubjects. The join drops ids the catalogue no longer holds, which
   * is what keeps a subject deleted after it was nominated from leaving a row
   * that opens a page about nothing.
   */
  const catalogue = useSubjectIndex(username);
  const followed = followedSubjects(prefs.analytics_subjects, catalogue);

  /* Open when the reader is already on one of these pages, and remembered
     while they are not. Two rules rather than one because they answer
     different questions: a reader who has just landed on a subject page should
     see where they are in the rail without opening anything, and a reader who
     opened the menu to browse should not have it fold every time they click a
     row in it. */
  const inSubjects = pathname.startsWith('/analytics/subject/');
  const [menuOpen, setMenuOpen] = useState(inSubjects);
  useEffect(() => {
    if (inSubjects) setMenuOpen(true);
  }, [inSubjects]);

  /* The destinations scroll when the window is too short for them, with no
     scrollbar drawn (styles/rail.css). Without one, nothing says there is
     more, so the edge with more beyond it fades: `more-up` / `more-down` are
     kept true to the scroll position, the window and the menu opening. And a
     page whose row is out of view — Settings on a short laptop — is scrolled
     to, so the rail still answers "where am I" without being asked. */
  const linksRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ up: false, down: false });
  /** Scroll the current page's row into view, clear of the fade, if it is not. */
  const reveal = useCallback(() => {
    const box = linksRef.current;
    const here = box?.querySelector<HTMLElement>('.rail-sub-link.active')
      ?? box?.querySelector<HTMLElement>('.rail-link.active');
    if (!box || !here || box.scrollHeight <= box.clientHeight) return;
    const frame = box.getBoundingClientRect();
    const row = here.getBoundingClientRect();
    // Past the 32px fade on that edge (styles/rail.css), so the row is seen
    // whole rather than half-faded; the browser clamps it at either end.
    const margin = 40;
    if (row.top < frame.top + margin) box.scrollTop -= frame.top + margin - row.top;
    else if (row.bottom > frame.bottom - margin) box.scrollTop += row.bottom - (frame.bottom - margin);
  }, []);
  useEffect(() => {
    const box = linksRef.current;
    if (!box) return undefined;
    const measure = () => {
      const up = box.scrollTop > 1;
      const down = box.scrollTop + box.clientHeight < box.scrollHeight - 1;
      setMore((was) => (was.up === up && was.down === down ? was : { up, down }));
    };
    /* A change of size is the window, the menu, or the foot arriving with the
       account — which lands after the first paint and shortens this box, so
       a row revealed before it would end up back under the fade. */
    const resized = () => {
      reveal();
      measure();
    };
    resized();
    box.addEventListener('scroll', measure, { passive: true });
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resized);
    watch?.observe(box);
    for (const child of Array.from(box.children)) watch?.observe(child);
    return () => {
      box.removeEventListener('scroll', measure);
      watch?.disconnect();
    };
  }, [menuOpen, collapsed, followed.length, reveal]);
  useEffect(reveal, [pathname, menuOpen, reveal]);

  /* Closed on arrival, and closed again the moment the reader lands
     somewhere — a sheet still open over the page it just navigated to is a
     sheet the reader has to dismiss to see what they asked for. */
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [pathname]);

  /* Core, Personal and Team each fold under their own heading. Folded as an
     icon strip, the rail has no headings to click, so every section shows. */
  const [sections, setSections] = useState(readSections);
  const fold = useCallback((id: SectionId) => {
    setSections((was) => {
      const next = { ...was, [id]: !was[id] };
      try {
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
      } catch {
        /* private mode: folding still works for this visit */
      }
      return next;
    });
  }, []);
  const isOpen = (id: SectionId) => collapsed || sections[id];

  // The three Personal spaces' names and the three Team ones, once there is
  // an account to ask about.
  const { spaces } = useSpaces(status === 'signed-in');
  const { spaces: teamSpaces } = useSpaces(status === 'signed-in', 'team');
  /** The team space open now, so "Invite people" invites to that one. */
  const teamHere = /^\/team\/([1-3])\b/.exec(pathname)?.[1];

  /* The nametag — picture, title, name — shared with the top bar
     (hooks/useNametag). The title is the band the level has reached, the one
     the hidden chain hands out once it has been earned, or whichever of them
     the reader has picked from the three dots. */
  const tag = useNametag();
  const title = tag.title ?? rank;
  const [titlesOpen, setTitlesOpen] = useState(false);
  useEffect(() => setTitlesOpen(false), [pathname]);

  /* The title used to be the way into the hidden chain — ten clicks on it,
     from any page, because the rail is on all of them. The door is on the
     dashboard now, beside the quote it opens (hooks/useQuoteEgg.ts), so the
     title here is a title and nothing else. */

  /** One destination, with the Analytics menu under it when it has one. */
  const renderTab = (tab: Tab) => {
          /* The menu is drawn only where it can be read and only when it has
             something in it. Collapsed, the rail is a strip of icons with no
             labels, so a list of subject names has nowhere to go; on a phone
             the rail is a bottom bar and Analytics lives in the More sheet;
             and with nothing followed, a disclosure that opens onto a single
             row called "Overall" is a click that changes nothing. Each of
             those is the entry behaving as it always did. */
          const locked = lockedTab(tab);
          // A locked page has no menu yet: its subjects are part of what waits.
          const menu = tab.menu === 'analytics' && followed.length > 0 && !collapsed && !phone && !locked;
          const link = (
            <NavLink
              key={tab.to}
              to={tab.to}
              data-tour={`rail-${tab.to.slice(1)}`}
              className={({ isActive }) =>
                `rail-link${isActive || onPage(tab, pathname) ? ' active' : ''}${locked ? ' is-locked' : ''}`
              }
              title={locked ? `${tab.label} (advanced: opens with a short note first)` : tab.label}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {locked && LOCK_ICON}
            </NavLink>
          );

          if (!menu) return link;

          return (
            <div className="rail-group" key={tab.to}>
              <div className="rail-group-head">
                {link}
                {/* Beside the link rather than wrapping it, so the row still
                    goes to Analytics in one click. A parent that only opens a
                    menu makes the reader take two clicks to reach the page
                    they named, which is the commonest way a nav like this
                    gets worse than the flat list it replaced. */}
                <button
                  type="button"
                  className={`rail-disclose${menuOpen ? ' is-open' : ''}`}
                  aria-expanded={menuOpen}
                  aria-controls="rail-analytics-menu"
                  aria-label={menuOpen ? 'Hide your subjects' : 'Show your subjects'}
                  title={menuOpen ? 'Hide your subjects' : 'Show your subjects'}
                  onClick={() => setMenuOpen((was) => !was)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}
                       strokeLinecap="round" strokeLinejoin="round">
                    <path d="m8 10 4 4 4-4" />
                  </svg>
                </button>
              </div>

              {menuOpen && (
                <div className="rail-sub" id="rail-analytics-menu">
                  {/* Named, and first. The page that has always been here is
                      one of the things in this menu now rather than the thing
                      the menu hangs off, and leaving it unnamed would make the
                      four subjects look like the whole of Analytics.

                      `end` because `/analytics` is a prefix of every subject
                      path: without it this row would be lit on all of them.

                      And lit for every tab of the overall page, not only for
                      `/analytics` itself. Recommendations, Goals, Insights and
                      the rest are the same page on other URLs — the parent
                      row above already says so through `onPage` — and with
                      only `end` the reader on /recommendations saw Analytics
                      lit and nothing under it, as if they were on no page in
                      the menu at all. */}
                  <NavLink
                    to="/analytics"
                    end
                    className={({ isActive }) =>
                      `rail-sub-link${isActive || (onPage(tab, pathname) && !inSubjects) ? ' active' : ''}`
                    }
                  >
                    Overall
                  </NavLink>
                  {followed.map((subject) => (
                    <NavLink
                      key={subject.id}
                      to={`/analytics/subject/${encodeURIComponent(subject.id)}`}
                      className={({ isActive }) => `rail-sub-link${isActive ? ' active' : ''}`}
                      /* Still here for the one case that can outrun the row: a
                         subject the account named itself, at whatever length it
                         liked. The catalogue's own hundred all fit. */
                      title={subject.name}
                    >
                      {/* The full name, not the catalogue's abbreviation.
                          `label` is `name` shortened past eight characters
                          (backend/config/subjects.py), which is right for a
                          chip on a task and wrong here: it turned a column of
                          places into "CompSci" and "Math", and abbreviating a
                          navigation label saves nothing a reader wants saved.

                          The room for it already existed. `--rail-w` was
                          widened from 240px to 312px *for this menu* — see the
                          note on it in styles/rail.css, which says in as many
                          words that the old width squeezed subject names into
                          an ellipsis two levels in. The rail got wider and the
                          rows went on printing the short form anyway. The
                          longest name in the catalogue is sixteen characters
                          and the row has room for roughly twice that. */}
                      {subject.name}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
  };

  return (
    <nav className="rail" aria-label="Main">
      {/* Mark and wordmark are both the link home. The mark used to be a bare
          span, because the easter egg counted clicks on it and had to cancel
          the navigation to do so — a logo that quietly stopped going home in
          dark mode. The egg's ten clicks live on a second copy of the mark at
          the foot of the dashboard now (hooks/useQuoteEgg.ts), which is not a
          link and has nothing to cancel, so this one is a link again and
          behaves like one in both themes.

          The mark is the file again, and that is the rebrand undoing a
          workaround rather than adding one. It was inlined because the old
          mark was a single near-black glyph: it needed `mix-blend-mode:
          multiply` to sit on white and an `invert(1)` to survive the dark
          rail, and inlining it was how those two hacks were replaced by a
          `fill` the theme could change. The Summit mark is a blue mountain
          that reads on both grounds and wants no help from either theme, so
          there is no longer anything for an inline copy to do — and one
          `<img>` is one mark instead of two paths in two files that have to go
          on agreeing about the same geometry. See utils/images/logo.svg. */}
      <div className="rail-brand">
        <NavLink className="rail-brand-mark" to="/home" aria-label="Summit home">
          <img src="/static/images/logo.svg" alt="" width={30} height={30} />
        </NavLink>
        <NavLink className="rail-brand-name" to="/home">
          Summit
        </NavLink>

        {/* Three lines rather than the chevron it was. The chevron pointed at
            the edge it folded into, which is the honest icon for a panel and
            the wrong one for a rail that is never fully gone — it leaves a
            strip of icons behind, and a reader who has seen it do that once
            reads the lines as "the menu" and the chevron as "close". */}
        <button
          type="button"
          className="rail-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          onClick={flip}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
            <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
            <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
            <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
            <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
          </svg>
        </button>
      </div>

      {/* The top bar's search, from where the eye already is. Opens the same
          panel as the magnifier up there, and so does ⌘K. */}
      {!phone && (
        <button
          type="button"
          className="rail-search"
          onClick={openSearch}
          aria-label="Search or ask"
          title="Search or ask (⌘K)"
        >
          <svg {...stroke}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span>Search or ask</span>
          <kbd>⌘K</kbd>
        </button>
      )}

      <div
        ref={linksRef}
        className={`rail-links${more.up ? ' more-up' : ''}${more.down ? ' more-down' : ''}`}
      >
        {phone ? (
          shown.map(renderTab)
        ) : (
          <>
            <Section id="core" label="Core" open={isOpen('core')} onFold={fold}>
              {TABS.filter((tab) => !tab.foot && !waiting(tab)).map(renderTab)}
              {/* The starter days' one extra row: what else there is, and
                  that it can be had now. Unfolding it lists the locked pages
                  (and the spaces) with their padlocks. */}
              {starting && (
                <button
                  type="button"
                  className="rail-later"
                  data-tour="rail-more"
                  aria-expanded={peek}
                  title={peek ? 'Hide the advanced tools' : 'Show the advanced tools'}
                  onClick={() => setPeek((was) => !was)}
                >
                  {LOCK_ICON}
                  <span>
                    {peek ? 'Hide advanced tools' : 'More tools'}
                    <small>
                      {peek
                        ? 'Each opens with a short note first'
                        : `Unlock in ${starter.daysLeft === 1 ? '1 day' : `${starter.daysLeft} days`}, or open early`}
                    </small>
                  </span>
                </button>
              )}
            </Section>

            {/* Both space sections wait with the other advanced pages in the
                starter days, and carry a padlock after them until opened. */}
            {!spacesWaiting && (
              <>
            <Section id="personal" label="Personal" open={isOpen('personal')} onFold={fold}>
              {/* Three pages of the reader's own, renamed and written in on
                  the space page itself. See pages/Space.tsx. */}
              {spaces.map((space) => (
                <NavLink
                  key={space.id}
                  to={`/spaces/${space.id}`}
                  className={({ isActive }) => `rail-link${isActive ? ' active' : ''}${spacesLocked ? ' is-locked' : ''}`}
                  title={space.name}
                >
                  {/* The page's own icon when it has one (pages/Space.tsx). */}
                  {space.doc?.icon ? <i className="rail-emoji" aria-hidden="true">{space.doc.icon}</i> : SPACE_ICON}
                  <span>{space.name}</span>
                  {spacesLocked && LOCK_ICON}
                </NavLink>
              ))}
            </Section>

            <Section id="team" label="Team" open={isOpen('team')} onFold={fold}>
              {/* The same three-space shape as Personal, each with a member
                  list on its page. Inviting is a placeholder: addresses are
                  kept as pending and nothing is sent (components/Spaces). */}
              {teamSpaces.map((space) => (
                <NavLink
                  key={space.id}
                  to={`/team/${space.id}`}
                  className={({ isActive }) => `rail-link${isActive ? ' active' : ''}${spacesLocked ? ' is-locked' : ''}`}
                  title={space.name}
                >
                  {/* The page's own icon when it has one (pages/Space.tsx). */}
                  {space.doc?.icon ? <i className="rail-emoji" aria-hidden="true">{space.doc.icon}</i> : TEAM_ICON}
                  <span>{space.name}</span>
                  {spacesLocked && LOCK_ICON}
                </NavLink>
              ))}
              <Link
                className="rail-link rail-invite"
                to={`/team/${teamHere ?? 1}?invite=1`}
                title="Invite people"
              >
                {INVITE_ICON}
                <span>Invite people</span>
              </Link>
            </Section>
              </>
            )}
          </>
        )}

        {/* The other six, on a phone. Lit when the reader is on one of them,
            so the bar still answers "where am I" for every page in the app
            rather than only for the four it has room to name. */}
        {phone && (
          <button
            type="button"
            data-tour="rail-more-phone"
            className={`rail-link rail-more${moreOpen ? ' is-open' : ''}${
              rest.some((tab) => onPage(tab, pathname)) ? ' active' : ''
            }`}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            onClick={() => setMoreOpen((was) => !was)}
          >
            <svg {...stroke}>
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
            <span>More</span>
          </button>
        )}
      </div>

      {phone && moreOpen && (
        <>
          {/* Tapping anywhere else closes it, which is what a sheet has to do
              on a device with no Escape key. */}
          <button
            type="button"
            className="rail-sheet-scrim"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
          />
          <div className="rail-sheet" role="menu">
            {rest.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                role="menuitem"
                className={({ isActive }) =>
                  `rail-sheet-link${isActive || onPage(tab, pathname) ? ' active' : ''}${lockedTab(tab) ? ' is-locked' : ''}`
                }
                onClick={() => setMoreOpen(false)}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {lockedTab(tab) && LOCK_ICON}
              </NavLink>
            ))}
          </div>
        </>
      )}

      {/* The dark-mode switch stood here until it moved to the top bar, where
          the rest of the app's controls already were. See components/Topbar. */}
      <div className="rail-foot">
        {signedIn ? (
          /* Nothing at all until the account read lands. The alternative is a
             plate reading "Beginner, level 1" for a second on every load, which
             is a wrong answer rather than a missing one — and the reader it is
             wrong for is the one who has been playing longest. */
          level &&
          rank && (
            <div className="rail-rank">
              {/* The account's own picture, the one in the top bar. */}
              <img className="rail-avatar" src={tag.avatar} alt="" width={44} height={44} />
              {/* The whole nametag when the rail is open, the level's number
                  when it is a strip. "Grand Champion Myles" in 54px of usable
                  width is an ellipsis, and an ellipsis is not a name. */}
              <div className="rail-rank-head">
                {/* No role, no tabIndex, no cursor: it is a label, and the
                    three dots beside it are the control. */}
                <NametagText
                  className="rail-rank-title"
                  title={title}
                  name={tag.name}
                />
                <button
                  type="button"
                  className={`rail-rank-more${titlesOpen ? ' is-open' : ''}`}
                  aria-label="Choose your title"
                  aria-expanded={titlesOpen}
                  aria-haspopup="menu"
                  onClick={() => setTitlesOpen((was) => !was)}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="12" r="1.7" />
                    <circle cx="12" cy="12" r="1.7" />
                    <circle cx="19" cy="12" r="1.7" />
                  </svg>
                </button>
              </div>
              <span className="rail-rank-num" aria-hidden="true">
                {level.level}
              </span>
              {/* Settings, as a gear on the right of the nametag rather than a
                  row in Core — see `foot` on Tab. Not on a phone, where the
                  foot is not drawn and Settings is in the More sheet. */}
              {!phone && (
                <NavLink
                  to="/settings"
                  data-tour="rail-settings"
                  className={({ isActive }) => `rail-foot-settings${isActive ? ' active' : ''}`}
                  aria-label="Settings"
                  title="Settings"
                >
                  {SETTINGS_ICON}
                </NavLink>
              )}

              {titlesOpen && (
                <>
                  {/* Anywhere else closes it. A button rather than a document
                      listener, for the same reason the More sheet uses one:
                      the scrim is also what stops a stray click landing on the
                      page behind a menu the reader has finished with. */}
                  <button
                    type="button"
                    className="rail-title-scrim"
                    aria-label="Close title menu"
                    onClick={() => setTitlesOpen(false)}
                  />
                  <div className="rail-title-menu" role="menu" aria-label="Title">
                    <TitleChoices tag={tag} onPicked={() => setTitlesOpen(false)} />
                  </div>
                </>
              )}

              <div className="rail-xp-row">
                <span>Level {level.level}</span>
                <span>{format.number(stats?.xp ?? 0)} XP</span>
              </div>
              <div
                className="rail-xp-bar"
                role="progressbar"
                aria-valuenow={Math.round(level.percent)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${rank}, level ${level.level} progress`}
              >
                <i style={{ width: `${level.percent}%` }} />
              </div>
            </div>
          )
        ) : (
          /* A plain Link, not a NavLink: it points at /home, so on the landing
             page NavLink would mark it active and paint it as the "you are
             here" pill, which it is not. */
          <Link className="rail-link rail-signin" to="/login?auth=login" title="Log In">
            <svg {...stroke}>
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
            </svg>
            <span>Log In</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
