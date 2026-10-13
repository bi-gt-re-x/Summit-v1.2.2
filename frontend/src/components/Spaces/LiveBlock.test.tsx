/**
 * A live block on a space's page — components/Spaces/LiveBlock.
 *
 * The server is a stub that answers from whatever the test says the data is
 * now, so each test can change the data and watch the block follow: at once
 * for a change this tab made, on the next poll for one made anywhere else.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announceLiveChanged } from '@/utils/liveBus';
import { LiveBlock } from './LiveBlock';
import { liveBlock, type Block } from './blocks';
import { checkNow, resetLiveWatch } from './liveWatch';
import type { LiveSource } from './live';

let latest: Block;
let server: { best: number; revision: string; reads: number };

function records(best: number) {
  return {
    categories: ['Competitive Math'],
    bests: [{ name: 'AMC 10', category: 'Competitive Math', unit: 'points', direction: 'higher', best, best_on: '2026-09-01',
              first: 72, latest: best, improvement: best - 72, entries: 3, history: [{ value: 72, on: null }, { value: best, on: null }] }],
    total: 1,
    latest: [],
  };
}

function stub() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    let body: unknown;
    if (url.includes('/api/spaces/live/revisions')) {
      body = { success: true, revisions: { records: server.revision } };
    } else if (url.includes('/api/spaces/live/options')) {
      body = { success: true, goals: [{ id: 'g1', title: 'Make AIME', done: false }], trees: [], subjects: [], categories: [], records: [] };
    } else if (url.includes('source=records')) {
      server.reads += 1;
      body = { success: true, config: {}, data: records(server.best), revision: server.revision, at: '2026-10-13T12:00:00' };
    } else {
      body = { success: true, config: {}, data: { empty: true }, revision: 'b.0', at: '2026-10-13T12:00:00' };
    }
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  });
}

function Host({ source = 'records' as LiveSource, disabled = false }) {
  const [one, setOne] = useState<Block>(() => ({ ...liveBlock(source), id: 'l' }));
  latest = one;
  return (
    <LiveBlock
      one={one}
      disabled={disabled}
      register={() => {}}
      onKey={() => {}}
      onChange={(change) => setOne((was) => ({ ...was, ...change }))}
    />
  );
}

beforeEach(() => {
  server = { best: 90, revision: 'b.1', reads: 0 };
  vi.stubGlobal('fetch', stub());
});

afterEach(() => {
  resetLiveWatch();
  vi.unstubAllGlobals();
});

describe('a live block', () => {
  it('draws what the server says now', async () => {
    render(<Host />);
    expect(await screen.findByText('AMC 10')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('reads again at once when this tab changes its source', async () => {
    render(<Host />);
    await screen.findByText('90');
    server.best = 108;
    server.revision = 'b.2';
    act(() => announceLiveChanged(['records']));
    expect(await screen.findByText('108')).toBeInTheDocument();
  });

  it('ignores changes to other sources', async () => {
    render(<Host />);
    await screen.findByText('90');
    const reads = server.reads;
    act(() => announceLiveChanged(['skills', 'calendar']));
    await act(async () => {});
    expect(server.reads).toBe(reads);
  });

  it('catches up with a change made somewhere else on the next poll', async () => {
    render(<Host />);
    await screen.findByText('90');
    const reads = server.reads;

    // Nothing moved: the poll costs one stamp and no read.
    await act(async () => checkNow());
    expect(server.reads).toBe(reads);

    // Another device saved a new best.
    server.best = 101;
    server.revision = 'b.3';
    await act(async () => checkNow());
    expect(await screen.findByText('101')).toBeInTheDocument();
    expect(server.reads).toBe(reads + 1);
  });

  it('reads again by hand', async () => {
    render(<Host />);
    await screen.findByText('90');
    server.best = 95;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('95')).toBeInTheDocument();
  });

  it('can be pointed at other data without making a new block', async () => {
    render(<Host source="goal" />);
    fireEvent.click(screen.getByRole('button', { name: 'Block settings' }));
    const goal = await screen.findByRole('combobox', { name: 'Goal' });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Make AIME' })).toBeInTheDocument());
    fireEvent.change(goal, { target: { value: 'g1' } });
    expect(latest.live).toEqual({ source: 'goal', view: 'card', goal: 'g1' });
    fireEvent.click(screen.getByRole('radio', { name: 'Ring' }));
    expect(latest.live).toEqual({ source: 'goal', view: 'ring', goal: 'g1' });

    fireEvent.change(screen.getByRole('combobox', { name: 'Shows' }), { target: { value: 'growth' } });
    expect(latest.live).toEqual({ source: 'growth', view: 'area', metric: 'xp', subject: '', days: 30 });
    fireEvent.click(screen.getByRole('radio', { name: '90' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Running total' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Tasks' }));
    expect(latest.live).toEqual({ source: 'growth', view: 'cumulative', metric: 'tasks', subject: '', days: 90 });
    expect(latest.id).toBe('l');
  });

  it('never draws one source with another source\'s data', async () => {
    render(<Host />);
    await screen.findByText('90');
    fireEvent.click(screen.getByRole('button', { name: 'Block settings' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Shows' }), { target: { value: 'goal' } });
    expect(screen.queryByText('AMC 10')).toBeNull();
    expect(await screen.findByText(/No goal to show yet/)).toBeInTheDocument();
  });

  it('draws a new style from what it already read', async () => {
    render(<Host />);
    await screen.findByText('90');
    const reads = server.reads;
    fireEvent.click(screen.getByRole('button', { name: 'Block settings' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Table' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(server.reads).toBe(reads);
  });

  it('keeps its settings shut on a page that cannot be edited', async () => {
    render(<Host disabled />);
    await screen.findByText('90');
    expect(screen.queryByRole('button', { name: 'Block settings' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});
