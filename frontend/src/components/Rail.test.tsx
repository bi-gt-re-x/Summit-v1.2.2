/**
 * The rail, at the breakpoint where it becomes a different component.
 *
 * Most of what the rail does is CSS and is not tested here. Two things are
 * not: below 640px it renders four tabs and a sheet instead of ten links, and
 * the foot shows a rank only once the account read has landed. Both were bugs
 * — two sections of the app were unreachable on a phone, measured off the end
 * of a 375px screen — so both get a test.
 *
 * The rest is the contract with the stylesheet: `html.nav-collapsed` is what
 * every page sizes itself against, so it is asserted on the element rather
 * than on the state that sets it.
 *
 * The third thing tested here is the one entry that unfolds. Analytics carries
 * a menu of the subjects the account said it most wants to work on, and the
 * three ways that can go wrong are all invisible to the compiler: the entry
 * ceasing to be a one-click link to Analytics, the menu appearing where it
 * cannot be read, and a subject deleted since it was nominated leaving a row
 * that opens a page about nothing.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { Link } from 'react-router-dom';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Rail, STATS_CHANGED } from './Rail';
import { renderWithProviders } from '@/test/render';
import type { Subject } from '@/services/subjects';
import { setMatchMedia } from '@/test/media';
import { stats } from '@/test/factories';
import type { MediaControl } from '@/test/media';

/** The same query as the component's, and as the @media block in rail.css. */
const PHONE = '(max-width: 640px)';

/** The four the phone bar keeps, in the order the rail lists them. */
const PHONE_TABS = ['Dashboard', 'Calendar', 'Tasks', 'Goals'];
/** The seven behind More. Records and Settings are the two that used to fall off. */
const SHEET_TABS = [
  'Analytics', 'Skill Tree', 'Notes', 'Timer', 'Achievements', 'Records', 'Settings',
];

/**
 * The catalogue the rail joins the account's picks against.
 *
 * Mocked at the service rather than at `useSubjects`, so the hook's own cache,
 * its event listener and its "only a real answer is cached" rule are all still
 * being exercised. Without this the fetch fails and every account has an empty
 * catalogue — which is a valid state, and the one that would let a broken join
 * pass silently.
 */
function subject(id: string, name: string, abbr = ''): Subject {
  return {
    id,
    name,
    abbr,
    label: abbr || name,
    icon: '',
    group: 'Study',
    used: 3,
    family: null,
  } as Subject;
}

const CATALOGUE = [
  subject('maths', 'Mathematics'),
  subject('physics', 'Physics'),
  subject('enviro', 'Environmental Science', 'Enviro Sci'),
];

vi.mock('@/services/subjects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/subjects')>()),
  list: vi.fn(async () => ({ success: true as const, subjects: CATALOGUE })),
}));

let media: MediaControl;

beforeEach(() => {
  media = setMatchMedia({ [PHONE]: false });
  localStorage.clear();
});

afterEach(() => {
  document.documentElement.classList.remove('nav-collapsed');
});

describe('on a desktop', () => {
  it('lists all ten destinations', () => {
    renderWithProviders(<Rail />);
    const nav = screen.getByRole('navigation', { name: 'Main' });

    [...PHONE_TABS, ...SHEET_TABS].forEach((label) => {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    });
  });

  it('has no More button and no sheet', () => {
    renderWithProviders(<Rail />);
    expect(screen.queryByRole('button', { name: /More/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('sends the wordmark home rather than to a page in the app', () => {
    renderWithProviders(<Rail />);
    expect(screen.getByRole('link', { name: 'Summit' })).toHaveAttribute('href', '/home');
  });

  /* The mark spent a while as a bare span so the easter egg could count clicks
     on it, which meant the logo stopped going home in dark mode. The egg lives
     on the dashboard's quote now; this is the assertion that keeps the mark a
     link if anything ever wants to borrow it again. */
  it('sends the mark home too, and not only the wordmark', () => {
    renderWithProviders(<Rail />);
    expect(screen.getByRole('link', { name: 'Summit home' })).toHaveAttribute(
      'href',
      '/home',
    );
  });
});

describe('the Analytics entry, which is the one that unfolds', () => {
  /** Renders with an account that follows some subjects, and waits for the
   *  catalogue — the join needs both halves and one of them is a fetch. */
  async function withFollowed(ids: string[], route = '/dashboard') {
    const view = renderWithProviders(<Rail />, {
      route,
      settings: { prefs: { analytics_subjects: ids } },
    });
    // The disclosure only exists once there is something to disclose, so
    // finding it is also the wait for the catalogue to land.
    if (ids.length) await screen.findByRole('button', { name: /your subjects/i });
    return view;
  }

  it('stays a one-click link to Analytics, with the chevron beside it', async () => {
    // The commonest way a nav like this gets worse than the flat list it
    // replaced: the parent stops being a destination and only opens a menu, so
    // the page the entry names costs two clicks.
    await withFollowed(['maths']);
    expect(screen.getByRole('link', { name: 'Analytics' }))
      .toHaveAttribute('href', '/recommendations');
  });

  it('shows nothing to unfold when the account follows none', () => {
    // A disclosure that opens onto a single row called "Overall" is a click
    // that changes nothing, so the entry stays exactly as it was.
    renderWithProviders(<Rail />);
    expect(screen.queryByRole('button', { name: /your subjects/i })).not.toBeInTheDocument();
  });

  it('names Overall alongside the subjects rather than leaving it implied', async () => {
    await withFollowed(['maths', 'physics']);
    fireEvent.click(screen.getByRole('button', { name: /show your subjects/i }));

    // Without a row of its own, the page that has always been here would look
    // like it had been replaced by the two subjects under it.
    expect(screen.getByRole('link', { name: 'Overall' })).toHaveAttribute('href', '/analytics');
    expect(screen.getByRole('link', { name: 'Mathematics' }))
      .toHaveAttribute('href', '/analytics/subject/maths');
    expect(screen.getByRole('link', { name: 'Physics' }))
      .toHaveAttribute('href', '/analytics/subject/physics');
  });

  it('draws the menu in the order the reader picked, not the catalogue order', async () => {
    await withFollowed(['physics', 'maths']);
    fireEvent.click(screen.getByRole('button', { name: /show your subjects/i }));

    const named = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
      .filter((href): href is string => Boolean(href?.startsWith('/analytics/subject/')));

    expect(named).toEqual(['/analytics/subject/physics', '/analytics/subject/maths']);
  });

  it('drops a subject the catalogue no longer holds', async () => {
    // Nominated in the wizard, deleted from the library the week after. The
    // stored list still names it; a row for it would open a page about
    // nothing.
    await withFollowed(['maths', 'latin']);
    fireEvent.click(screen.getByRole('button', { name: /show your subjects/i }));

    expect(screen.getByRole('link', { name: 'Mathematics' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /latin/i })).not.toBeInTheDocument();
  });

  it('prints the full name, not the catalogue\'s abbreviation', async () => {
    await withFollowed(['enviro']);
    fireEvent.click(screen.getByRole('button', { name: /show your subjects/i }));

    /* This asserted the opposite until the rail was widened for it. `label` is
       `name` shortened past eight characters, which is right for a chip on a
       task and wrong for a row in a navigation column — it turned this menu
       into "CompSci" and "Math", and there is no width being saved: the rail
       went from 240px to 312px *because* subject names were being squeezed
       into an ellipsis two levels in.

       The title stays. Nothing in the hundred-row catalogue outruns the row,
       but an account can name a subject itself, at any length it likes. */
    const row = screen.getByRole('link', { name: 'Environmental Science' });
    expect(row).toHaveAttribute('title', 'Environmental Science');
    expect(screen.queryByText('Enviro Sci')).not.toBeInTheDocument();
  });

  it('is already open when the reader lands on a subject page', async () => {
    // Arriving from a link or a bookmark, the rail has to say where you are
    // without being opened first.
    await withFollowed(['maths'], '/analytics/subject/maths');

    expect(screen.getByRole('button', { name: /hide your subjects/i }))
      .toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Mathematics' }).className).toContain('active');
  });

  it('lights Analytics on a subject page, which `also` cannot express', async () => {
    // One URL per subject, so the entry matches on a prefix rather than on a
    // list — otherwise the rail shows nothing selected on a page it owns.
    await withFollowed(['maths'], '/analytics/subject/maths');
    expect(screen.getByRole('link', { name: 'Analytics' }).className).toContain('active');
  });

  it('does not light Overall on a subject page, since /analytics is its prefix', async () => {
    await withFollowed(['maths'], '/analytics/subject/maths');
    expect(screen.getByRole('link', { name: 'Overall' }).className).not.toContain('active');
  });

  it('folds the menu away with the rail, which is a strip of icons with no labels', async () => {
    // Folded rather than rendered folded, on purpose. An assertion that the
    // disclosure is absent on first paint would pass just as well if the
    // catalogue had simply not arrived yet — so this waits for the menu to
    // exist, which proves the join worked, and only then collapses the rail.
    await withFollowed(['maths']);
    fireEvent.click(screen.getByRole('button', { name: /show your subjects/i }));
    expect(screen.getByRole('link', { name: 'Mathematics' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }));

    // The labels are gone at this width, so a list of subject names has
    // nowhere to go. The entry behaves as it did before it had a menu.
    expect(screen.queryByRole('button', { name: /your subjects/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mathematics' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analytics' })).toBeInTheDocument();
  });

  it('has no menu on a phone, where the rail is a bar and Analytics is in the sheet', async () => {
    await withFollowed(['maths']);
    act(() => media.set(PHONE, true));

    expect(screen.queryByRole('button', { name: /your subjects/i })).not.toBeInTheDocument();
  });
});

describe('on a phone', () => {
  it('shows the four tabs a phone is for, and hides the other seven', () => {
    // Ten tabs across 375px put Records at x 352-393 and Settings at 395-436
    // — off the end of the screen, with nothing to scroll. Two whole sections
    // of the app were unreachable.
    renderWithProviders(<Rail />, { userData: {} });
    act(() => media.set(PHONE, true));

    PHONE_TABS.forEach((label) => {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    });
    SHEET_TABS.forEach((label) => {
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
    });
  });

  it('keeps the other seven one tap away behind More', () => {
    renderWithProviders(<Rail />);
    act(() => media.set(PHONE, true));

    const more = screen.getByRole('button', { name: /More/ });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(more);

    expect(more).toHaveAttribute('aria-expanded', 'true');
    const sheet = screen.getByRole('menu');
    SHEET_TABS.forEach((label) => {
      expect(within(sheet).getByRole('menuitem', { name: label })).toBeInTheDocument();
    });
  });

  it('accounts for every destination — four visible plus seven behind More', () => {
    // The invariant that matters more than either list: nothing is dropped.
    // A tab added to TABS without a `phone` decision still has a way in.
    renderWithProviders(<Rail />);
    act(() => media.set(PHONE, true));
    fireEvent.click(screen.getByRole('button', { name: /More/ }));

    const reachable = screen
      .getAllByRole('link')
      .concat(screen.getAllByRole('menuitem'))
      .map((link) => link.getAttribute('href'))
      .filter((href): href is string => Boolean(href) && href !== '/home');

    expect(new Set(reachable)).toEqual(
      new Set([
        '/dashboard',
        '/calendar',
        '/recommendations',
        '/tasks',
        '/goals',
        '/skill-trees',
        '/notes',
        '/timer',
        '/achievements',
        '/records',
        '/settings',
      ]),
    );
  });

  it('closes the sheet when a scrim tap lands, since there is no Escape key', () => {
    renderWithProviders(<Rail />);
    act(() => media.set(PHONE, true));
    fireEvent.click(screen.getByRole('button', { name: /More/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the sheet on the way to the page the reader picked', () => {
    renderWithProviders(<Rail />);
    act(() => media.set(PHONE, true));
    fireEvent.click(screen.getByRole('button', { name: /More/ }));

    fireEvent.click(screen.getByRole('menuitem', { name: 'Records' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the sheet on a navigation that did not come from the sheet', () => {
    // The sheet's own links close it on click, so clicking one cannot tell the
    // two mechanisms apart. This navigates from outside the rail — a link
    // elsewhere on the page, a back button — which is the case the effect on
    // `pathname` is actually there for. A sheet still open over the page the
    // reader just arrived at is a sheet they have to dismiss to see it.
    renderWithProviders(
      <>
        <Rail />
        <Link to="/notes">elsewhere</Link>
      </>,
    );
    act(() => media.set(PHONE, true));
    fireEvent.click(screen.getByRole('button', { name: /More/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'elsewhere' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('lights More when the reader is on one of the pages behind it', () => {
    // Otherwise the bar answers "where am I" for four pages out of ten.
    renderWithProviders(<Rail />, { route: '/records' });
    act(() => media.set(PHONE, true));

    expect(screen.getByRole('button', { name: /More/ }).className).toContain('active');
  });

  it('does not light More when the reader is on one of the four', () => {
    renderWithProviders(<Rail />, { route: '/dashboard' });
    act(() => media.set(PHONE, true));

    expect(screen.getByRole('button', { name: /More/ }).className).not.toContain('active');
  });

  it('goes back to ten links when the viewport grows', () => {
    renderWithProviders(<Rail />);
    act(() => media.set(PHONE, true));
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();

    act(() => media.set(PHONE, false));
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /More/ })).not.toBeInTheDocument();
  });
});

describe('collapsing', () => {
  it('puts the class every page sizes itself against onto <html>', () => {
    renderWithProviders(<Rail />);
    expect(document.documentElement).not.toHaveClass('nav-collapsed');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(document.documentElement).toHaveClass('nav-collapsed');
  });

  it('writes the preference to the account and to the cache at once', () => {
    // Applied locally and stored in the background: a rail that waited for a
    // round trip before folding would feel broken on a slow connection.
    const update = vi.fn(async () => null);
    renderWithProviders(<Rail />, { settings: { update } });

    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }));

    expect(update).toHaveBeenCalledWith({ nav_collapsed: true });
    expect(localStorage.getItem('topnavCollapsed')).toBe('1');
  });

  it('opens on the cached answer before the account has said anything', () => {
    // Without something to open on, a collapsed rail swings open and shut on
    // every load while the account's answer is in flight.
    localStorage.setItem('topnavCollapsed', '1');
    renderWithProviders(<Rail />, { settings: { ready: false } });

    expect(document.documentElement).toHaveClass('nav-collapsed');
  });

  it('lets the account overrule the cache once it arrives', () => {
    localStorage.setItem('topnavCollapsed', '1');
    renderWithProviders(<Rail />, {
      settings: { ready: true, prefs: { nav_collapsed: false } },
    });

    expect(document.documentElement).not.toHaveClass('nav-collapsed');
  });

  it('starts open where localStorage throws, rather than not rendering', () => {
    // Private mode. The rail is the app's navigation; it cannot be the thing
    // that fails to draw.
    const getItem = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(() => renderWithProviders(<Rail />)).not.toThrow();
    expect(document.documentElement).not.toHaveClass('nav-collapsed');
    expect(getItem).toHaveBeenCalled();
  });
});

describe('the foot', () => {
  it('shows nothing rather than a wrong rank while the read is in flight', () => {
    // "Beginner, level 1" for a second on every load is a wrong answer, not a
    // missing one — and it is wrong for the reader who has played longest.
    renderWithProviders(<Rail />, { stats: { stats: null, loading: true } });

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows the rank and the level once the account has landed', () => {
    // 640 XP is level 4 on the account ladder: 100 + 200 + 300 to reach it,
    // then 40 of the 400 that level 4 costs — a bar one tenth of the way
    // along. The name is the tier level 4 falls in, which is Beginner: the
    // rail prints the mastery ladder's names against an account level, so
    // this is also the assertion that the two ladders are being crossed on
    // purpose rather than by accident.
    renderWithProviders(<Rail />, { stats: { stats: stats({ xp: 640 }) } });

    expect(screen.getByText('Beginner')).toBeInTheDocument();
    // The number and its unit are separate elements, so this reads the row.
    expect(screen.getByRole('progressbar').parentElement).toHaveTextContent('640 XP');

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '10');
    expect(bar).toHaveAccessibleName('Beginner, level 4 progress');
    expect(bar.querySelector('i')).toHaveStyle({ width: '10%' });
  });

  it('offers a way in instead of a rank when signed out', () => {
    renderWithProviders(<Rail />, {
      auth: { status: 'signed-out', username: null },
      stats: { stats: null, error: 'Sign in to see your dashboard.' },
    });

    expect(screen.getByRole('link', { name: 'Log In' })).toHaveAttribute(
      'href',
      '/login?auth=login',
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('re-reads when the dashboard says a completion moved the total', () => {
    // The rail is mounted outside the router and never unmounts, so without
    // this it would still be showing the level you had when you opened the app.
    const reload = vi.fn();
    renderWithProviders(<Rail />, { stats: { reload } });

    expect(reload).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new Event(STATS_CHANGED));
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('stops listening once it is gone', () => {
    const reload = vi.fn();
    const { unmount } = renderWithProviders(<Rail />, { stats: { reload } });

    unmount();
    act(() => {
      window.dispatchEvent(new Event(STATS_CHANGED));
    });
    expect(reload).not.toHaveBeenCalled();
  });
});
