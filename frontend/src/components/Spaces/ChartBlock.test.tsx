/**
 * A chart on a space's page — components/Spaces/ChartBlock.
 *
 * Driven through a host that keeps the block, the way the editor does, so
 * every change is read back off the stored chart.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChartBlock } from './ChartBlock';
import { chartBlock, type Block, type ChartKind } from './blocks';

let latest: Block;

function Host({ kind = 'bar' as ChartKind, disabled = false }) {
  const [one, setOne] = useState<Block>(() => ({ ...chartBlock(kind), id: 'c' }));
  latest = one;
  return (
    <ChartBlock
      one={one}
      disabled={disabled}
      register={() => {}}
      onKey={() => {}}
      onChange={(change) => setOne((was) => ({ ...was, ...change }))}
    />
  );
}

const values = () => latest.chart!.points.map((point) => point.value);

afterEach(() => vi.restoreAllMocks());

describe('a bar chart', () => {
  it('sets a value with the arrow keys on its bar', () => {
    render(<Host />);
    const bar = screen.getByRole('slider', { name: 'Item 1 value' });
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    fireEvent.keyDown(bar, { key: 'ArrowUp' });
    fireEvent.keyDown(bar, { key: 'PageUp' });
    expect(values()[0]).toBe(51);
    fireEvent.keyDown(bar, { key: 'End' });
    expect(values()[0]).toBe(100);
    fireEvent.keyDown(bar, { key: 'Home' });
    expect(values()[0]).toBe(0);
  });

  it('sets a value by dragging the bar to a height', () => {
    render(<Host />);
    const plot = document.querySelector('svg.sp-chart-plot') as SVGSVGElement;
    // The plot drawn 600 × 240 on screen: the value axis runs from y 210 (0) to 18 (100).
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 600, height: 240, right: 600, bottom: 240, x: 0, y: 0, toJSON: () => ({}) });
    const bar = screen.getByRole('slider', { name: 'Item 3 value' });
    fireEvent.pointerDown(bar, { clientX: 300, clientY: 114, pointerId: 1 });
    expect(values()[2]).toBe(50);
    fireEvent.pointerMove(bar, { clientX: 300, clientY: 18, pointerId: 1 });
    expect(values()[2]).toBe(100);
    fireEvent.pointerUp(bar, { pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 300, clientY: 210, pointerId: 1 });
    expect(values()[2]).toBe(100);
  });

  it('takes a typed value, kept on the scale', () => {
    render(<Host />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Value of Item 2' }), { target: { value: '250' } });
    expect(values()[1]).toBe(100);
  });

  it('renames, adds and removes items', () => {
    render(<Host />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name of item 1' }), { target: { value: 'Mon' } });
    expect(latest.chart!.points[0]!.label).toBe('Mon');
    fireEvent.click(screen.getByRole('button', { name: '+ Add item' }));
    expect(latest.chart!.points).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mon' }));
    expect(latest.chart!.points.map((point) => point.label)).toEqual(['Item 2', 'Item 3', 'Item 4', 'Item 5']);
  });

  it('changes its scale', () => {
    render(<Host />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Scale up to' }), { target: { value: '50' } });
    expect(latest.chart!.max).toBe(50);
    expect(values()).toEqual([40, 50, 30, 50]);
  });

  it('keeps a title', () => {
    render(<Host />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Chart title' }), { target: { value: 'Hours' } });
    expect(latest.text).toBe('Hours');
    expect(screen.getByRole('figure', { name: 'Bar chart: Hours' })).toBeInTheDocument();
  });
});

describe('switching kinds', () => {
  it('keeps the numbers and draws them another way', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('radio', { name: 'Line' }));
    expect(latest.chart!.kind).toBe('line');
    expect(document.querySelector('.sp-chart-line')).not.toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Donut' }));
    expect(latest.chart!.kind).toBe('donut');
    expect(values()).toEqual([40, 65, 30, 80]);
    expect(document.querySelectorAll('.sp-chart-slice')).toHaveLength(4);
  });
});

describe('a pie chart', () => {
  it('moves the edge between two slices from the keyboard, keeping their total', () => {
    render(<Host kind="pie" />);
    const edge = screen.getByRole('slider', { name: 'Edge between Item 1 and Item 2' });
    fireEvent.keyDown(edge, { key: 'ArrowRight' });
    expect(values()).toEqual([45, 60, 30, 80]);
  });

  it('moves an edge by dragging it round the rim', () => {
    render(<Host kind="pie" />);
    const svg = document.querySelector('svg.sp-chart-pie') as SVGSVGElement;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 240, height: 240, right: 240, bottom: 240, x: 0, y: 0, toJSON: () => ({}) });
    const edge = screen.getByRole('slider', { name: 'Edge between Item 1 and Item 2' });
    fireEvent.pointerDown(edge, { clientX: 0, clientY: 0, pointerId: 1 });
    // Straight right of the centre is a quarter turn: Item 1 takes a quarter of the 215.
    fireEvent.pointerMove(edge, { clientX: 220, clientY: 120, pointerId: 1 });
    const [a, b, c, d] = values();
    expect(a).toBeCloseTo(55, 0);
    expect(a! + b!).toBe(105);
    expect([c, d]).toEqual([30, 80]);
  });

  it('shows each slice as a share', () => {
    render(<Host kind="pie" />);
    expect(screen.getByText('37%')).toBeInTheDocument();
  });
});

describe('a read-only chart', () => {
  it('cannot be changed', () => {
    render(<Host disabled />);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Item 1 value' }), { key: 'ArrowUp' });
    expect(values()[0]).toBe(40);
    expect(screen.queryByRole('button', { name: '+ Add item' })).not.toBeInTheDocument();
  });
});
