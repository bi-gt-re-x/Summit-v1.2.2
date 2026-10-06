/**
 * The one tested part of the landing page, and the reason is arithmetic.
 *
 * Nothing else in components/Home has a test, correctly: they are demonstrations
 * whose whole content is timing and movement, and a test that a card slid in
 * from the left is a test of jsdom. This section is the exception because it
 * states two *derived* figures — the score is the mean of the five bars beside
 * it, and the standing is `components/Analytics/score` placing that score. Both
 * would go on rendering something plausible after a drift, which is the kind of
 * wrong that no reviewer catches.
 *
 * The last two cases cover the arming, which is the part the browser could not
 * be made to show: the panel ships empty, fills a paint after it is scrolled to,
 * lights its tab strip once the numbers have run, and empties again when it
 * leaves — and, where there is no IntersectionObserver to wait for, is simply
 * finished on arrival.
 */
import { render as rtlRender, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { Analytics } from './Analytics';
import { VIEWS } from '@/components/Analytics/Header';

/**
 * The tab strip is seven <Link>s now, so the panel needs a router around it.
 * A MemoryRouter and nothing else: this section reads no context but routing,
 * and test/render.tsx's provider stack would be four answers to questions it
 * does not ask.
 */
const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

/** Drive the IntersectionObserver the component arms itself with. */
function stubIO() {
  const entries: Array<(e: unknown[]) => void> = [];
  class IO {
    cb: (e: unknown[]) => void;
    constructor(cb: (e: unknown[]) => void) {
      this.cb = cb;
      entries.push(cb);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', IO);
  return {
    enter: (el: Element) =>
      entries.forEach((cb) => cb([{ isIntersecting: true, target: el, intersectionRatio: 1 }])),
    leave: (el: Element) =>
      entries.forEach((cb) => cb([{ isIntersecting: false, target: el, intersectionRatio: 0 }])),
  };
}

describe('the landing page analytics panel', () => {
  it('states a score that is the mean of the bars it draws', () => {
    render(<Analytics />);
    // 92 + 78 + 85 + 71 + 88 = 414; /5 = 82.8; /10 = 8.28 -> "8.3"
    expect(screen.getByText('8.3')).toBeInTheDocument();
    const bars = [92, 78, 85, 71, 88];
    bars.forEach((v) => expect(screen.getByText(String(v))).toBeInTheDocument());
    const mean = bars.reduce((a, b) => a + b, 0) / bars.length / 10;
    expect((8.28).toFixed(1)).toBe(mean.toFixed(1));
  });

  /**
   * Against VIEWS itself, not against a copy of it.
   *
   * This case used to assert a hardcoded list, and the third entry in it read
   * 'Trends' — a tab renamed to Goals when the growth page was folded into the
   * analytics page. Both lists were edited to say the same wrong thing, so the
   * test went on passing and the landing page went on advertising a tab the app
   * no longer has. A test that restates the value under test only ever catches
   * a typo. Importing the real table is free here: a test is not bundled, which
   * is the whole reason the component keeps its own copy.
   */
  it('names the tabs the analytics page has, in order, and links to each', () => {
    render(<Analytics />);
    const tabs = [...document.querySelectorAll<HTMLAnchorElement>('a.lp-ax-tab')];
    expect(tabs.map((t) => t.textContent)).toEqual(VIEWS.map((v) => v.label));
    expect(tabs.map((t) => t.getAttribute('href'))).toEqual(VIEWS.map((v) => v.path));
  });

  it('writes each bar its own width and stagger', () => {
    render(<Analytics />);
    const bars = [...document.querySelectorAll<HTMLElement>('.lp-ax-track i')];
    expect(bars.map((b) => b.style.getPropertyValue('--ax-to'))).toEqual([
      '92%', '78%', '85%', '71%', '88%',
    ]);
    expect(bars.map((b) => b.style.transitionDelay)).toEqual([
      '0ms', '90ms', '180ms', '270ms', '360ms',
    ]);
  });

  it('ships armed, unarms a paint after it is scrolled to, and re-arms when it leaves', async () => {
    const io = stubIO();
    render(<Analytics />);
    const panel = document.querySelector('.lp-ax-wrap') as HTMLElement;
    expect(panel.classList.contains('ax-armed')).toBe(true);

    await act(async () => {
      io.enter(panel);
      // afterPaint is two nested rAFs; jsdom runs them on timers.
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(panel.classList.contains('ax-armed')).toBe(false);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1000));
    });
    expect(panel.classList.contains('ax-lit')).toBe(true);

    await act(async () => {
      io.leave(panel);
    });
    expect(panel.classList.contains('ax-armed')).toBe(true);
  });

  it('sweeps the dial to the score, and hands both ends of it to the CSS', () => {
    render(<Analytics />);
    const arc = document.querySelector<SVGCircleElement>('.lp-ax-ring-arc');
    const len = Number(arc!.style.getPropertyValue('--ax-ring-len'));
    const end = Number(arc!.style.getPropertyValue('--ax-ring-end'));
    // The closed ring is the whole circumference; the open one stops where the
    // score does. 8.28/10 of the way round leaves 17.2% unpainted.
    expect(len).toBeCloseTo(2 * Math.PI * 54, 1);
    expect(end / len).toBeCloseTo(1 - 8.28 / 10, 3);
    // The attribute and the custom property are the same rounded number.
    expect(Number(arc!.getAttribute('stroke-dashoffset'))).toBe(end);
  });

  it('ends the trend curve exactly on the score it is a history of', () => {
    render(<Analytics />);
    const points = document.querySelector('.lp-ax-spark polyline')!
      .getAttribute('points')!
      .split(' ');
    expect(points).toHaveLength(6);
    // Last point: full width, and the height the score maps to.
    const last = points[points.length - 1]!.split(',').map(Number);
    expect(last[0]).toBeCloseTo(190, 1);
    const span = 42 - 5 * 2;
    expect(last[1]).toBeCloseTo(42 - 5 - (8.28 / 10) * span, 1);
  });

  it('states the rise as the trend’s own two ends subtracted', () => {
    render(<Analytics />);
    // 8.28 - 6.2 = 2.08 -> "+2.1"
    expect(screen.getByText(/\+2\.1 in six weeks/)).toBeInTheDocument();
  });

  it('with no IntersectionObserver, shows the finished panel at once', () => {
    const had = Reflect.get(window, 'IntersectionObserver');
    Reflect.deleteProperty(window, 'IntersectionObserver');
    render(<Analytics />);
    Reflect.set(window, 'IntersectionObserver', had);
    const panel = document.querySelector('.lp-ax-wrap') as HTMLElement;
    expect(panel.classList.contains('ax-armed')).toBe(false);
    expect(panel.classList.contains('ax-lit')).toBe(true);
    expect(screen.getByText('8.3')).toBeInTheDocument();
  });
});
