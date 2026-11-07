/**
 * Tables, countdowns, contents, templates and Markdown export: what each keeps,
 * draws and writes. The page-level tools are in pages/Space.test.tsx.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CountdownBlock, TableBlock, TocBlock, countdownWords, daysUntil, headingsOf } from './Extras';
import { block, cleanDay, cleanTable, normalise, tableBlock, type Block } from './blocks';
import { TEMPLATES, applyTemplate, isBlank } from './templates';
import { toMarkdown } from './exportDoc';
import { RULES } from '@/utils/sharedRules';

const drawn = (one: Block, onChange = vi.fn()) => ({ one, disabled: false, register: () => {}, onChange, onKey: () => {} });

describe('a table', () => {
  it('is kept square and within bounds', () => {
    expect(cleanTable({ rows: [['a', 'b'], ['c'], 'x', [1, null]] })).toEqual({ rows: [['a', 'b'], ['c', ''], ['1', '']], head: true });
    expect(cleanTable(null).rows).toHaveLength(3);
    const wide = cleanTable({ rows: Array.from({ length: 50 }, () => Array.from({ length: 20 }, () => 'x')) });
    expect(wide.rows).toHaveLength(RULES.spaces.table.rows_max);
    expect(wide.rows[0]).toHaveLength(RULES.spaces.table.cols_max);
  });

  it('edits a cell and adds a row and a column', () => {
    const onChange = vi.fn();
    render(<TableBlock {...drawn(tableBlock(), onChange)} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Row 2, column 1' }), { target: { value: 'Counting' } });
    expect(onChange.mock.calls[0]![0].table.rows[1][0]).toBe('Counting');
    fireEvent.click(screen.getByRole('button', { name: '+ Row' }));
    expect(onChange.mock.calls[1]![0].table.rows).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: '+ Column' }));
    expect(onChange.mock.calls[2]![0].table.rows[0]).toHaveLength(4);
  });

  it('adds a row on Enter in the last row, and can lose a row', () => {
    const onChange = vi.fn();
    render(<TableBlock {...drawn(tableBlock(), onChange)} />);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Row 3, column 2' }), { key: 'Enter' });
    expect(onChange.mock.calls[0]![0].table.rows).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Remove row 2' }));
    expect(onChange.mock.calls[1]![0].table.rows).toHaveLength(2);
  });
});

describe('a countdown', () => {
  const now = new Date(2026, 10, 7, 15, 0);

  it('counts whole days by the calendar', () => {
    expect(daysUntil('2026-11-12', now)).toBe(5);
    expect(daysUntil('2026-11-07', now)).toBe(0);
    expect(daysUntil('2026-11-01', now)).toBe(-6);
    expect(daysUntil('', now)).toBeNull();
  });

  it('says it plainly', () => {
    expect(countdownWords(5)).toEqual({ big: '5', small: 'days left', tone: 'soon' });
    expect(countdownWords(1).small).toBe('day left');
    expect(countdownWords(30).tone).toBe('far');
    expect(countdownWords(0).big).toBe('Today');
    expect(countdownWords(-2)).toEqual({ big: '2', small: 'days ago', tone: 'past' });
  });

  it('keeps only a real day', () => {
    expect(cleanDay('2026-11-12')).toBe('2026-11-12');
    expect(cleanDay('2026-02-30')).toBe('');
    expect(cleanDay('soon')).toBe('');
  });

  it('draws the number and edits its label and day', () => {
    const onChange = vi.fn();
    render(<CountdownBlock {...drawn(block('countdown', 'AMC 10', { date: '2099-01-01' }), onChange)} />);
    expect(screen.getByRole('group', { name: /Countdown: AMC 10/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'What the countdown is for' }), { target: { value: 'AIME' } });
    expect(onChange).toHaveBeenCalledWith({ text: 'AIME' });
    fireEvent.change(screen.getByLabelText('The day it counts to'), { target: { value: '2099-02-01' } });
    expect(onChange).toHaveBeenCalledWith({ date: '2099-02-01' });
  });
});

describe('contents', () => {
  const page = [block('h1', 'Plan', { id: 'a' }), block('text', 'x'), block('h2', '**Week** one', { id: 'b' }), block('h3', '  ')];

  it('lists the headings that have words, by depth', () => {
    expect(headingsOf(page)).toEqual([{ id: 'a', text: 'Plan', level: 0 }, { id: 'b', text: 'Week one', level: 1 }]);
  });

  it('draws a button per heading', () => {
    render(<TocBlock {...drawn(block('toc'))} blocks={page} />);
    const nav = screen.getByRole('navigation', { name: 'Contents' });
    expect(within(nav).getAllByRole('button').map((one) => one.textContent)).toEqual(['Plan', 'Week one']);
  });
});

describe('the new kinds survive a reload', () => {
  it('keeps a table, a countdown, contents and a task link', () => {
    const doc = normalise({
      blocks: [
        { id: 't', type: 'table', text: '', table: { rows: [['a']], head: false } },
        { id: 'c', type: 'countdown', text: 'AMC', date: '2026-11-12' },
        { id: 'o', type: 'toc', text: '' },
        { id: 'd', type: 'todo', text: 'Read', task: 'task-1' },
        { id: 'p', type: 'text', text: 'plain', task: 'task-2' } as unknown as Block,
      ],
    } as never);
    expect(doc.blocks.map((one) => one.type)).toEqual(['table', 'countdown', 'toc', 'todo', 'text']);
    expect(doc.blocks[0]!.table).toEqual({ rows: [['a']], head: false });
    expect(doc.blocks[1]!.date).toBe('2026-11-12');
    expect(doc.blocks[3]!.task).toBe('task-1');
    expect(doc.blocks[4]!.task).toBeUndefined();
  });
});

describe('templates', () => {
  it('become the page when it is blank, icon and all', () => {
    const blank = normalise(null);
    expect(isBlank(blank)).toBe(true);
    const made = applyTemplate(blank, TEMPLATES.find((one) => one.id === 'exam')!);
    expect(made.icon).toBe('🎯');
    expect(made.blocks[0]!.type).toBe('countdown');
    expect(isBlank(made)).toBe(false);
  });

  it('go on the end of a written page, leaving its icon alone', () => {
    const page = { ...normalise({ blocks: [{ id: 'x', type: 'text', text: 'Mine' }] } as never), icon: '🌱' };
    const made = applyTemplate(page, TEMPLATES[0]!);
    expect(made.icon).toBe('🌱');
    expect(made.blocks[0]!.text).toBe('Mine');
    expect(made.blocks.length).toBeGreaterThan(5);
  });

  it('make fresh ids every time, and only kinds the page keeps', () => {
    for (const template of TEMPLATES) {
      const one = template.build().blocks.map((b) => b.id);
      const two = template.build().blocks.map((b) => b.id);
      expect(new Set([...one, ...two]).size).toBe(one.length * 2);
      const kept = normalise({ blocks: template.build().blocks } as never).blocks.map((b) => b.type);
      expect(kept).toEqual(template.build().blocks.map((b) => b.type));
    }
  });
});

describe('export', () => {
  it('writes the page as Markdown', () => {
    const doc = normalise({
      icon: '🎯',
      blocks: [
        { id: 'a', type: 'h1', text: 'Plan' },
        { id: 'b', type: 'todo', text: 'Read', checked: true },
        { id: 'c', type: 'todo', text: 'Write' },
        { id: 't', type: 'table', text: '', table: { rows: [['Topic', 'Sure'], ['Count|ing', '2']], head: true } },
        { id: 'o', type: 'toc', text: '' },
      ],
    } as never);
    expect(toMarkdown(doc, 'Exam')).toBe(
      ['# 🎯 Exam', '', '# Plan', '', '- [x] Read', '- [ ] Write', '', '| Topic | Sure |', '| --- | --- |',
        '| Count\\|ing | 2 |', '', '- Plan', ''].join('\n'),
    );
  });
});
