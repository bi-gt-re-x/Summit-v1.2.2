/**
 * The top of the Growth tab: the bad news first, its figures in bold, and said
 * out loud when there isn't any.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GrowthReadsPanel } from './GrowthReads';
import { Figures } from './Figures';
import type { SkillTrack } from '@/utils/skillGrowth';

const growthReads = vi.hoisted(() => vi.fn());
vi.mock('@/services/topics', () => ({ growthReads }));

const item = (id: string, tone: string, title: string, detail: string) => ({ id, tone, title, detail });
const track = (name: string, then: number, now: number, daysSince = 2) =>
  ({ subject: name.toLowerCase(), name, then, now, delta: now - then, daysSince }) as unknown as SkillTrack;

function serve(groups: unknown[], routine: string[] = []) {
  growthReads.mockResolvedValue({ success: true, sessions: 120, days: 90, groups, routine });
}

const WATCH = { id: 'watch', title: 'Slipping', items: [item('topic:a', 'bad', 'Scales is slipping', 'Rated 4.4 → 3.6 over 16 sessions.')] };
const BETTER = { id: 'improved', title: 'Improving', items: [item('topic:b', 'good', 'You improved at recursion', 'Rated 3.1 → 3.9.')] };
const WHEN = { id: 'when', title: 'When you work best', items: [item('slot:c', 'flat', 'Math at 8 am', '46% of it.')] };

beforeEach(() => growthReads.mockReset());

describe('what got worse and what got better', () => {
  it('reads Slipping before Improving, and counts subjects the same way', async () => {
    serve([WATCH, BETTER]);
    render(<GrowthReadsPanel span="90d" tracks={[track('Physics', 70, 60), track('Math', 50, 60), track('Art', 40, 45)]} />);
    const slipping = await screen.findByRole('heading', { name: 'Slipping' });
    const improving = screen.getByRole('heading', { name: 'Improving' });
    expect(slipping.compareDocumentPosition(improving) & 4).toBeTruthy();
    expect(screen.getByText('1 subject slipped').tagName).toBe('STRONG');
    expect(screen.getByText('2 subjects improved').tagName).toBe('STRONG');
  });

  it('names the subjects that fell furthest, and why when it was left alone', async () => {
    serve([]);
    render(<GrowthReadsPanel span="90d" tracks={[track('Physics', 70, 60), track('Data', 71, 54, 53)]} />);
    const rows = await screen.findAllByText(/dropped/);
    expect(rows[0]!.textContent).toBe('Data dropped 17 points.');
    expect(screen.getByText(/Nothing done in 53 days/)).toBeInTheDocument();
  });

  it('leaves out a subject nobody has touched in months', async () => {
    serve([]);
    render(<GrowthReadsPanel span="90d" tracks={[track('Cooking', 70, 40, 400)]} />);
    await screen.findByRole('heading', { name: 'Slipping' });
    expect(screen.queryByText(/Cooking dropped/)).not.toBeInTheDocument();
  });

  it('leaves life admin out of the rows, and counts it like Skill growth does', async () => {
    serve([], ['laundry']);
    render(<GrowthReadsPanel span="90d" tracks={[track('Laundry', 57, 48), track('Physics', 70, 60)]} />);
    expect(await screen.findByText('2 subjects slipped')).toBeInTheDocument();
    expect(screen.queryByText(/Laundry dropped/)).not.toBeInTheDocument();
  });

  it('skips a small wobble in the rows, while still counting it', async () => {
    serve([]);
    render(<GrowthReadsPanel span="90d" tracks={[track('Art', 50, 47)]} />);
    expect(await screen.findByText('1 subject slipped')).toBeInTheDocument();
    expect(screen.queryByText(/Art dropped/)).not.toBeInTheDocument();
  });

  it('says so when nothing is slipping, rather than hiding the column', async () => {
    serve([BETTER]);
    render(<GrowthReadsPanel span="90d" />);
    expect(await screen.findByText("Nothing's slipping.")).toBeInTheDocument();
  });

  it('leaves the when-you-work findings to Insights', async () => {
    serve([WATCH, BETTER, WHEN]);
    render(<GrowthReadsPanel span="90d" />);
    await screen.findByRole('heading', { name: 'Slipping' });
    expect(screen.queryByText(/Math at 8 am/)).not.toBeInTheDocument();
  });
});

describe('Figures', () => {
  const bold = (text: string) => {
    const { container } = render(<Figures text={text} />);
    return [...container.querySelectorAll('strong')].map((one) => one.textContent);
  };

  it('bolds the change, a signed number and a share', () => {
    expect(bold('Rated 4.4 → 3.6 over 16 sessions.')).toEqual(['4.4 → 3.6']);
    expect(bold('Went up +263 since you started.')).toEqual(['+263']);
    expect(bold('80% of the way to 15.')).toEqual(['80%']);
  });

  it('keeps every word of the sentence', () => {
    const { container } = render(<Figures text="Level 71 → 54. Nothing done in 53 days." />);
    expect(container.textContent).toBe('Level 71 → 54. Nothing done in 53 days.');
  });
});
