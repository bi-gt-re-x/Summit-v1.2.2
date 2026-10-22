/**
 * A panel block on a space's page — components/Spaces/PanelBlock — drawn from
 * the Analytics page's real model and the page's one focus clock.
 *
 * The Analytics reads are the seeded account the model's own tests use
 * (frontend/src/test/seed.ts); everything else the panels ask for is a stub server. Each
 * test changes a setting the way a reader would — in the gear's settings, or
 * with a control inside the panel — and checks the block stored it and the
 * panel redrew from it.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, SettingsContext, type AuthValue, type SettingsValue } from '@/context/contexts';
import type { AnalyticsData } from '@/components/Analytics/useAnalyticsData';
import type { Subject } from '@/services/subjects';
import { NO_PLAN } from '@/services/next';
import { SUBJECTS, seedDays, seedGoals, seedPrefs, seedRatings, seedScoreLog, seedTasks } from '@/test/seed';
import { PanelBlock } from './PanelBlock';
import { SpaceData } from './SpaceData';
import { panelBlock, type Block } from './blocks';
import { resetLiveWatch } from './liveWatch';
import { PANEL_KINDS, cleanPanel, type PanelKind } from './panels';

const answered = <T,>(data: T) => ({ data, error: null, loading: false, refreshing: false, reload: () => {}, mutate: () => {} });

/* One object for the whole test, as the real hook's state would be. */
let data: AnalyticsData;
const subjects = new Map(
  SUBJECTS.map((id, index) => [id, { id, name: id, abbr: null, label: id, icon: '', group: 'Core', used: 10 + index, family: null, custom: false } as Subject]),
);

vi.mock('@/components/Analytics/useAnalyticsData', () => ({ useAnalyticsData: () => data }));
vi.mock('@/hooks', async (original) => ({
  ...(await original<typeof import('@/hooks')>()),
  useAuth: () => ({ username: 'seed' }),
  useSubjectIndex: () => subjects,
  useSubjectsReady: () => true,
  // The app root provides these two; a test has no root.
  useStats: () => ({ username: 'seed', stats: { current_streak: 4, best_streak: 11 }, loading: false }),
  useUserData: () => ({ data: { tasks: seedTasks() }, loading: false, reload: async () => {} }),
}));

function seedData(): AnalyticsData {
  return {
    stats: { stats: { current_streak: 4, best_streak: 11 }, username: 'seed' },
    tasks: answered({ tasks: seedTasks() }),
    series: answered({ growth_data: seedDays() }),
    ratings: answered(seedRatings()),
    goals: answered({ goals: seedGoals() }),
    scoreLog: answered({ metric: 'overall', points: seedScoreLog() }),
    gradedLog: answered({ histories: {} }),
    adopted: answered({ adopted: [] }),
    baseline: answered({ baseline: null }),
    background: answered(null),
    said: answered(null),
    mood: answered(null),
    next: answered({ plan: NO_PLAN, lens: null }),
    setBudget: () => {},
    setNudge: () => {},
    nudge: 0,
    username: 'seed',
    refresh: vi.fn(),
    dropAdopted: vi.fn(),
    dropping: null,
  } as unknown as AnalyticsData;
}

const settings = {
  prefs: seedPrefs(),
  ready: true,
  update: async () => {},
  dailyGoal: 200,
  displayName: 'Seed',
  loading: false,
  error: null,
  reload: () => {},
} as unknown as SettingsValue;

function stub() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    let body: unknown = { success: true };
    if (url.includes('/api/spaces/live/options')) {
      body = { success: true, goals: [], trees: [], subjects: [{ id: 'maths', name: 'Math', used: 3 }], categories: [], records: [] };
    } else if (url.includes('/api/spaces/live/revisions')) {
      body = { success: true, revisions: {} };
    } else if (url.includes('/api/focus/sittings')) {
      body = { success: true, sittings: [] };
    } else if (url.includes('/api/growth_periods') || url.includes('/api/achievements') || url.includes('/api/next_sessions')) {
      body = { success: false, message: 'Not in this test.' };
    } else if (url.includes('/api/next_actions')) {
      body = { success: true, plan: { ...NO_PLAN, budget: Number(new URL(url, 'http://x').searchParams.get('budget') ?? 45) }, lens: null };
    }
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  });
}

let latest: Block;

function Host({ kind, extra = {} }: { kind: PanelKind; extra?: Record<string, unknown> }) {
  const [one, setOne] = useState<Block>(() => ({ ...panelBlock(kind), id: 'p', panel: cleanPanel({ kind, ...extra }) }));
  latest = one;
  return (
    <SpaceData blocks={[one]}>
      <PanelBlock one={one} disabled={false} register={() => {}} onKey={() => {}} onChange={(change) => setOne((was) => ({ ...was, ...change }))} />
    </SpaceData>
  );
}

function draw(ui: ReactNode) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={{ status: 'in', username: 'seed', profileComplete: true } as unknown as AuthValue}>
        <SettingsContext.Provider value={settings}>{ui}</SettingsContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

const openSettings = () => fireEvent.click(screen.getByRole('button', { name: 'Block settings' }));
const settingsGroup = () => screen.getByRole('group', { name: 'Block settings' });

beforeEach(() => {
  data = seedData();
  vi.stubGlobal('fetch', stub());
});

afterEach(() => {
  resetLiveWatch();
  vi.unstubAllGlobals();
});

describe('an Analytics panel', () => {
  it("draws the Analytics page's own tiles from the account's numbers", async () => {
    draw(<Host kind="tiles" />);
    expect(await screen.findByText('Productivity')).toBeInTheDocument();
    expect(screen.getByText('Consistency')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Analytics' })).toHaveAttribute('href', '/analytics');
  });

  it('shows only the tiles ticked, and keeps the choice on the block', async () => {
    draw(<Host kind="tiles" />);
    await screen.findByText('Quality');
    openSettings();
    fireEvent.click(within(settingsGroup()).getByRole('button', { name: /Quality/ }));
    expect(latest.panel!.show).toEqual(['productivity', 'consistency', 'tasks', 'focus']);
    const body = () => within(document.querySelector('.sp-panel-body') as HTMLElement);
    await waitFor(() => expect(body().queryByText('Quality')).not.toBeInTheDocument());
    expect(body().getByText('Productivity')).toBeInTheDocument();
  });

  it("won't untick the last one", async () => {
    draw(<Host kind="tiles" extra={{ show: ['focus'] }} />);
    await screen.findByText('Focus time');
    openSettings();
    fireEvent.click(within(settingsGroup()).getByRole('button', { name: /Focus/ }));
    expect(latest.panel!.show).toEqual(['focus']);
  });

  it("plots the measure picked in settings, and the chart's own buttons write the setting back", async () => {
    draw(<Host kind="trajectory" />);
    const series = await screen.findByRole('group', { name: 'Chart series' });
    expect(within(series).getByRole('button', { name: 'Productivity' })).toHaveAttribute('aria-pressed', 'true');

    openSettings();
    fireEvent.click(within(settingsGroup()).getByRole('radio', { name: 'Total tasks' }));
    expect(latest.panel).toMatchObject({ kind: 'trajectory', metric: 'tasks' });
    await waitFor(() => expect(within(series).getByRole('button', { name: 'Tasks (total)' })).toHaveAttribute('aria-pressed', 'true'));

    fireEvent.click(within(series).getByRole('button', { name: 'Consistency' }));
    expect(latest.panel).toMatchObject({ metric: 'consistency' });
  });

  it('moves to another time range from settings', async () => {
    draw(<Host kind="trajectory" />);
    await screen.findByRole('group', { name: 'Chart series' });
    openSettings();
    fireEvent.click(within(settingsGroup()).getByRole('radio', { name: '1 year' }));
    expect(latest.panel).toMatchObject({ window: '1y' });
  });

  it('switches to another panel on its defaults', async () => {
    draw(<Host kind="tiles" />);
    await screen.findByText('Productivity');
    openSettings();
    fireEvent.change(within(settingsGroup()).getByRole('combobox', { name: /Shows/ }), { target: { value: 'week' } });
    expect(latest.panel).toEqual({ kind: 'week', window: '30d' });
  });

  it('reads the plan for its own minutes', async () => {
    draw(<Host kind="plan" extra={{ budget: 90 }} />);
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('budget=90'))).toBe(true));
  });
});

describe('a timer panel', () => {
  it("shows today's sessions, then a week's when asked", async () => {
    draw(<Host kind="timer-today" />);
    expect(await screen.findByText("Today's sessions")).toBeInTheDocument();
    openSettings();
    fireEvent.click(within(settingsGroup()).getByRole('radio', { name: '7 days' }));
    expect(latest.panel).toMatchObject({ days: 7 });
    expect(await screen.findByText('Sessions, last 7 days')).toBeInTheDocument();
  });

  it('runs the focus clock', async () => {
    draw(<Host kind="timer" extra={{ show: ['task', 'method'] }} />);
    expect(await screen.findByRole('button', { name: /Start focus/ })).toBeInTheDocument();
    expect(screen.getByText('Working on')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Timer style' })).toBeInTheDocument();
  });

  it('charts focus by day, as bars or a line', async () => {
    draw(<Host kind="timer-chart" />);
    expect(await screen.findAllByLabelText(/Focus minutes per day, last 14 days/)).not.toHaveLength(0);
    openSettings();
    fireEvent.click(within(settingsGroup()).getByRole('radio', { name: 'Sessions' }));
    expect(await screen.findAllByLabelText(/Focus sessions per day, last 14 days/)).not.toHaveLength(0);
  });
});

describe('every panel', () => {
  /* One page with all of them on it, the way a reader could build one: one
     set of reads, two shared models (30 and 90 days) and one clock. A panel
     that throws on real data shows the guard's line instead of itself. */
  function Page() {
    const [blocks] = useState<Block[]>(() => PANEL_KINDS.map((kind) => ({ ...panelBlock(kind), id: kind })));
    return (
      <SpaceData blocks={blocks}>
        {blocks.map((one) => (
          <PanelBlock key={one.id} one={one} disabled={false} register={() => {}} onKey={() => {}} onChange={() => {}} />
        ))}
      </SpaceData>
    );
  }

  it('draws on real data without breaking', async () => {
    const broke = vi.spyOn(console, 'error').mockImplementation(() => {});
    draw(<Page />);
    await waitFor(() => expect(screen.queryAllByText('Loading…')).toHaveLength(0), { timeout: 8000 });
    expect(document.querySelectorAll('.sp-panel')).toHaveLength(PANEL_KINDS.length);
    // Every one drew something besides its frame.
    const blank = [...document.querySelectorAll('.sp-panel')]
      .filter((panel) => !panel.querySelector('.sp-panel-body')?.textContent?.trim())
      .map((panel) => [...panel.classList].find((name) => name.startsWith('is-')));
    expect(blank).toEqual([]);
    const snagged = [...document.querySelectorAll('.sp-panel')]
      .filter((panel) => panel.textContent?.includes('This panel hit a snag'))
      .map((panel) => [...panel.classList].find((name) => name.startsWith('is-')));
    expect(snagged).toEqual([]);
    expect(broke.mock.calls.filter(([first]) => String(first).includes('A panel block broke'))).toEqual([]);
    broke.mockRestore();
  }, 20000);
});
