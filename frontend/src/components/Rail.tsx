/**
 * The app's navigation — a rail down the left-hand side.
 *
 * Same shape and the same classes it has always had (styles/rail.css, and the
 * paper look in styles/paper.css): the mark and wordmark at the top, a button
 * that folds it to an icon strip, the destinations in a section that folds
 * under its heading, and the account's nametag in the foot. On a phone it lies
 * down as a bottom bar with four tabs and a More sheet.
 *
 * **The layout contract is a variable, not a shape.** Pages know that
 * `--rail-w` is taken from the left; `html.nav-collapsed` shrinks it, and every
 * page widens into the space without knowing why. Whether it is folded is a
 * preference on the account (Settings, Appearance), cached in localStorage so
 * a folded rail doesn't swing open and shut on load.
 *
 * The destinations are the AMC prep site's: Dashboard, Review, Study Plan,
 * Analytics, Problems, Topics, Past Contests and Search. Review carries a count of what
 * is due today, and the foot shows how much of the problem bank is solved —
 * both read the dashboard's numbers through hooks/useAmcSummary, one request
 * for the whole chrome.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth, useMediaQuery, useSettings } from '@/hooks';
import { useAmcSummary } from '@/hooks/useAmcSummary';
import { useNametag } from '@/hooks/useNametag';
import { NametagText } from '@/components/Nametag';
import { STATS_CHANGED } from '@/utils/statsBus';
import '@/styles/rail.css';

const COLLAPSE_KEY = 'topnavCollapsed';
const SECTIONS_KEY = 'railSections';

type SectionId = 'prep' | 'practice';

function readSections(): Record<SectionId, boolean> {
  try {
    const saved = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? '{}') as Partial<Record<SectionId, unknown>>;
    return { prep: saved.prep !== false, practice: saved.practice !== false };
  } catch {
    return { prep: true, practice: true };
  }
}

/* Re-exported because this is where listeners have always imported it from. */
export { STATS_CHANGED };

interface Tab {
  to: string;
  label: string;
  icon: ReactNode;
  section: SectionId;
  /** Path prefixes this entry also lights up for (detail pages). */
  under?: string[];
  /** One of the four in the phone's bottom bar. */
  phone?: boolean;
  /** Shows the count of reviews due today. */
  badge?: 'due';
}

const PHONE = '(max-width: 640px)';

const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const SETTINGS_ICON = (
  <svg {...stroke}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);

export const TABS: Tab[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    section: 'prep',
    phone: true,
    icon: (
      <svg {...stroke}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9" />
      </svg>
    ),
  },
  {
    to: '/review',
    label: 'Review',
    section: 'prep',
    phone: true,
    badge: 'due',
    icon: (
      <svg {...stroke}>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
        <path d="M12 8v4l3 2" />
      </svg>
    ),
  },
  {
    to: '/study-plan',
    label: 'Study Plan',
    section: 'prep',
    icon: (
      <svg {...stroke}>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
        <path d="m9 15 2 2 4-4" />
      </svg>
    ),
  },
  {
    to: '/analytics',
    label: 'Analytics',
    section: 'prep',
    icon: (
      <svg {...stroke}>
        <path d="M3 3v18h18" />
        <path d="M7 15v3M11 11v7M15 13v5M19 7v11" />
      </svg>
    ),
  },
  {
    to: '/problems',
    label: 'Problems',
    section: 'practice',
    phone: true,
    under: ['/problems/'],
    icon: (
      <svg {...stroke}>
        <path d="M4 19.5V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14.5" />
        <path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20" />
        <path d="M9 8h6M9 12h4" />
      </svg>
    ),
  },
  {
    to: '/topics',
    label: 'Topics',
    section: 'practice',
    under: ['/topics/'],
    icon: (
      <svg {...stroke}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <circle cx="17.5" cy="17.5" r="3.5" />
      </svg>
    ),
  },
  {
    to: '/mock-contests',
    label: 'Mock Contests',
    section: 'practice',
    under: ['/contests/mock-', '/contests/step-mock-'],
    icon: (
      <svg {...stroke}>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5" />
        <path d="M9 2h6" />
      </svg>
    ),
  },
  {
    to: '/contests',
    label: 'Past Contests',
    section: 'practice',
    phone: true,
    under: ['/contests/', '/mocks/'],
    icon: (
      <svg {...stroke}>
        <path d="M8 21h8M12 17v4" />
        <path d="M7 4h10v5a5 5 0 0 1-10 0Z" />
        <path d="M17 6h3a3 3 0 0 1-3 4M7 6H4a3 3 0 0 0 3 4" />
      </svg>
    ),
  },
  {
    to: '/posts',
    label: 'Posts',
    section: 'practice',
    icon: (
      <svg {...stroke}>
        <path d="M4 20h4L19 9l-4-4L4 16Z" />
        <path d="m13.5 6.5 4 4" />
      </svg>
    ),
  },
  {
    to: '/search',
    label: 'Search',
    section: 'practice',
    icon: (
      <svg {...stroke}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    ),
  },
];

/** How specifically a tab claims the page: exact match beats any prefix, and a
 * longer prefix beats a shorter one (a mock's page belongs to Mock Contests,
 * not to Past Contests, though both claim paths under /contests/). */
function claim(tab: Tab, pathname: string): number {
  if (tab.to === pathname) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, ...(tab.under ?? []).filter((prefix) => pathname.startsWith(prefix)).map((p) => p.length));
}

function onPage(tab: Tab, pathname: string): boolean {
  const mine = claim(tab, pathname);
  return mine > 0 && TABS.every((other) => other === tab || claim(other, pathname) <= mine);
}

function Section({
  id,
  label,
  open,
  onFold,
  children,
}: {
  id: SectionId;
  label: string;
  open: boolean;
  onFold: (id: SectionId) => void;
  children: ReactNode;
}) {
  const body = `rail-section-${id}`;
  return (
    <section className={`rail-section${open ? ' is-open' : ''}`} aria-label={label}>
      <button type="button" className="rail-section-head" aria-expanded={open} aria-controls={body}
              onClick={() => onFold(id)}>
        <span>{label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m8 10 4 4 4-4" />
        </svg>
      </button>
      {open && <div className="rail-section-body" id={body}>{children}</div>}
    </section>
  );
}

export function Rail() {
  const { status } = useAuth();
  const { pathname } = useLocation();
  const { prefs, ready, update } = useSettings();
  const summary = useAmcSummary();
  const tag = useNametag();

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (ready) setCollapsed(prefs.nav_collapsed);
  }, [prefs.nav_collapsed, ready]);
  useEffect(() => {
    document.documentElement.classList.toggle('nav-collapsed', collapsed);
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* private mode: the rail just starts open */
    }
  }, [collapsed]);
  const flip = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    void update({ nav_collapsed: next });
  }, [collapsed, update]);

  const phone = useMediaQuery(PHONE);
  const shown = phone ? TABS.filter((tab) => tab.phone) : TABS;
  const rest = phone ? TABS.filter((tab) => !tab.phone) : [];

  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [pathname]);

  const [sections, setSections] = useState(readSections);
  const fold = useCallback((id: SectionId) => {
    setSections((was) => {
      const next = { ...was, [id]: !was[id] };
      try {
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
      } catch {
        /* folding still works for this visit */
      }
      return next;
    });
  }, []);
  const isOpen = (id: SectionId) => collapsed || sections[id];

  /* The fades at either end of a list too tall for the window. */
  const linksRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ up: false, down: false });
  useEffect(() => {
    const box = linksRef.current;
    if (!box) return undefined;
    const measure = () => {
      const up = box.scrollTop > 1;
      const down = box.scrollTop + box.clientHeight < box.scrollHeight - 1;
      setMore((was) => (was.up === up && was.down === down ? was : { up, down }));
    };
    measure();
    box.addEventListener('scroll', measure, { passive: true });
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    watch?.observe(box);
    return () => {
      box.removeEventListener('scroll', measure);
      watch?.disconnect();
    };
  }, [collapsed, sections]);

  const due = summary?.stats.due ?? 0;
  const renderTab = (tab: Tab) => (
    <NavLink
      key={tab.to}
      to={tab.to}
      className={() => `rail-link${onPage(tab, pathname) ? ' active' : ''}`}
      title={tab.badge === 'due' && due ? `${tab.label} — ${due} due` : tab.label}
    >
      {tab.icon}
      <span>{tab.label}</span>
      {tab.badge === 'due' && due > 0 && <b className="rail-due">{due > 99 ? '99+' : due}</b>}
    </NavLink>
  );

  const signedIn = status === 'signed-in';
  const solved = summary?.stats.solved ?? 0;
  const total = summary?.stats.total ?? 0;
  const target = summary?.target ?? 'AMC 10';
  const projected = summary ? summary.projected[target] : null;

  return (
    <nav className="rail" aria-label="Main">
      <div className="rail-brand">
        <NavLink className="rail-brand-mark" to="/home" aria-label="Summit home">
          <img src="/static/images/logo.svg" alt="" width={30} height={30} />
        </NavLink>
        <NavLink className="rail-brand-name" to="/home">
          Summit
        </NavLink>
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

      <div ref={linksRef} className={`rail-links${more.up ? ' more-up' : ''}${more.down ? ' more-down' : ''}`}>
        {phone ? (
          shown.map(renderTab)
        ) : (
          <>
            <Section id="prep" label="Prep" open={isOpen('prep')} onFold={fold}>
              {shown.filter((tab) => tab.section === 'prep').map(renderTab)}
            </Section>
            <Section id="practice" label="Practice" open={isOpen('practice')} onFold={fold}>
              {shown.filter((tab) => tab.section === 'practice').map(renderTab)}
            </Section>
          </>
        )}

        {phone && (
          <button
            type="button"
            className={`rail-link rail-more${moreOpen ? ' is-open' : ''}${
              rest.some((tab) => onPage(tab, pathname)) || pathname.startsWith('/settings') ? ' active' : ''
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
          <button type="button" className="rail-sheet-scrim" aria-label="Close menu" onClick={() => setMoreOpen(false)} />
          <div className="rail-sheet" role="menu">
            {[...rest, { to: '/settings', label: 'Settings', icon: SETTINGS_ICON, section: 'prep' as const }].map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                role="menuitem"
                className={() => `rail-sheet-link${onPage(tab, pathname) ? ' active' : ''}`}
                onClick={() => setMoreOpen(false)}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </NavLink>
            ))}
          </div>
        </>
      )}

      <div className="rail-foot">
        {signedIn ? (
          <div className="rail-rank">
            <img className="rail-avatar" src={tag.avatar} alt="" width={44} height={44} />
            <div className="rail-rank-head">
              <NametagText className="rail-rank-title" title={null} name={tag.name} />
            </div>
            <span className="rail-rank-num" aria-hidden="true">
              {solved}
            </span>
            {!phone && (
              <NavLink
                to="/settings"
                className={({ isActive }) => `rail-foot-settings${isActive ? ' active' : ''}`}
                aria-label="Settings"
                title="Settings"
              >
                {SETTINGS_ICON}
              </NavLink>
            )}
            <div className="rail-xp-row">
              <span>{solved} of {total || '—'} solved</span>
              <span>{projected != null ? `${target} ≈ ${projected}` : target}</span>
            </div>
            <div
              className="rail-xp-bar"
              role="progressbar"
              aria-valuenow={total ? Math.round((solved / total) * 100) : 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Problems solved"
            >
              <i style={{ width: `${total ? (solved / total) * 100 : 0}%` }} />
            </div>
          </div>
        ) : (
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
