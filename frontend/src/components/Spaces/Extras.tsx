/**
 * Three blocks a study page keeps needing: a table, a countdown and a list of the
 * page's headings.
 *
 * They're drawn blocks like a chart (./ChartBlock): the frame takes focus, Backspace
 * on the frame takes the block out (BlockEditor's `dividerKey`), and what's typed
 * inside them belongs to them. Kept and cleaned by ./blocks (`cleanTable`,
 * `cleanDay`) and by backend/api/spaces.py on the way in.
 */
import type { KeyboardEvent } from 'react';
import { plainOf } from './inline';
import { RULES } from '@/utils/sharedRules';
import type { Block, TableData } from './blocks';

const TABLE = RULES.spaces.table;

interface DrawnProps {
  one: Block;
  disabled: boolean;
  register: (node: HTMLElement | null) => void;
  onChange: (change: Partial<Block>) => void;
  onKey: (event: KeyboardEvent<HTMLElement>) => void;
}

/** Keys on the frame itself, not on a field inside it, go to the editor. */
const frameKey = (onKey: DrawnProps['onKey']) => (event: KeyboardEvent<HTMLElement>) => {
  if (event.target === event.currentTarget) onKey(event);
};

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------
export function TableBlock({ one, disabled, register, onChange, onKey }: DrawnProps) {
  const table: TableData = one.table ?? { rows: [['', '', '']], head: true };
  const { rows, head } = table;
  const cols = rows[0]?.length ?? 1;
  const put = (next: Partial<TableData>) => onChange({ table: { ...table, ...next } });
  const setCell = (r: number, c: number, value: string) =>
    put({ rows: rows.map((row, at) => (at === r ? row.map((cell, k) => (k === c ? value.slice(0, TABLE.cell_max) : cell)) : row)) });
  const addRow = () => rows.length < TABLE.rows_max && put({ rows: [...rows, Array.from({ length: cols }, () => '')] });
  const addCol = () => cols < TABLE.cols_max && put({ rows: rows.map((row) => [...row, '']) });
  const dropRow = (r: number) => rows.length > 1 && put({ rows: rows.filter((_, at) => at !== r) });
  const dropCol = (c: number) => cols > 1 && put({ rows: rows.map((row) => row.filter((_, at) => at !== c)) });

  return (
    <div
      className="sp-table-block"
      ref={register}
      tabIndex={disabled ? -1 : 0}
      role="group"
      aria-label="Table"
      onKeyDown={frameKey(onKey)}
    >
      <div className="sp-table-scroll">
        <table className={`sp-table${head ? ' has-head' : ''}`}>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => {
                  const Cell = head && r === 0 ? 'th' : 'td';
                  return (
                    <Cell key={c} scope={head && r === 0 ? 'col' : undefined}>
                      <input
                        className="sp-cell"
                        value={cell}
                        disabled={disabled}
                        aria-label={`Row ${r + 1}, column ${c + 1}`}
                        placeholder={head && r === 0 ? `Column ${c + 1}` : ''}
                        onChange={(event) => setCell(r, c, event.target.value)}
                        onKeyDown={(event) => {
                          // Enter on the last row adds a row, the way a sheet does.
                          if (event.key === 'Enter' && r === rows.length - 1) {
                            event.preventDefault();
                            addRow();
                          }
                        }}
                      />
                    </Cell>
                  );
                })}
                {!disabled && rows.length > 1 && (
                  <td className="sp-table-x">
                    <button type="button" aria-label={`Remove row ${r + 1}`} title="Remove row" onClick={() => dropRow(r)}>
                      ×
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!disabled && cols > 1 && (
              <tr className="sp-table-colx">
                {rows[0]!.map((_, c) => (
                  <td key={c}>
                    <button type="button" aria-label={`Remove column ${c + 1}`} title="Remove column" onClick={() => dropCol(c)}>
                      ×
                    </button>
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <div className="sp-table-tools">
          <button type="button" className="sp-ghost" disabled={rows.length >= TABLE.rows_max} onClick={addRow}>
            + Row
          </button>
          <button type="button" className="sp-ghost" disabled={cols >= TABLE.cols_max} onClick={addCol}>
            + Column
          </button>
          <label className="sp-table-head">
            <input type="checkbox" checked={head} onChange={(event) => put({ head: event.target.checked })} />
            Header row
          </label>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Countdown
// ---------------------------------------------------------------------------
/** Whole days from today to an ISO day, by the reader's own calendar. */
export function daysUntil(iso: string, now: Date = new Date()): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

export function countdownWords(days: number | null): { big: string; small: string; tone: string } {
  if (days === null) return { big: '-', small: 'Pick a day', tone: 'flat' };
  if (days === 0) return { big: 'Today', small: "It's here", tone: 'now' };
  if (days < 0) return { big: String(Math.abs(days)), small: Math.abs(days) === 1 ? 'day ago' : 'days ago', tone: 'past' };
  return { big: String(days), small: days === 1 ? 'day left' : 'days left', tone: days <= 7 ? 'soon' : 'far' };
}

export function CountdownBlock({ one, disabled, register, onChange, onKey }: DrawnProps) {
  const days = daysUntil(one.date ?? '');
  const shown = countdownWords(days);
  const weeks = days !== null && days > 13 ? `About ${Math.round(days / 7)} weeks` : '';
  return (
    <div
      className={`sp-countdown is-${shown.tone}`}
      ref={register}
      tabIndex={disabled ? -1 : 0}
      role="group"
      aria-label={`Countdown: ${plainOf(one.text) || 'untitled'}, ${shown.big} ${shown.small}`}
      onKeyDown={frameKey(onKey)}
    >
      <div className="sp-countdown-num">
        <b>{shown.big}</b>
        <span>{shown.small}</span>
      </div>
      <div className="sp-countdown-say">
        <input
          className="sp-countdown-label"
          value={one.text}
          maxLength={120}
          disabled={disabled}
          placeholder="What's on that day? e.g. AMC 10"
          aria-label="What the countdown is for"
          onChange={(event) => onChange({ text: event.target.value })}
        />
        <div className="sp-countdown-meta">
          <input
            type="date"
            className="sp-countdown-date"
            value={one.date ?? ''}
            disabled={disabled}
            aria-label="The day it counts to"
            onChange={(event) => onChange({ date: event.target.value })}
          />
          {weeks && <span>{weeks}</span>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contents
// ---------------------------------------------------------------------------
const LEVEL: Partial<Record<Block['type'], number>> = { h1: 0, h2: 1, h3: 2 };

/** The page's headings, in order, with how deep each sits. */
export function headingsOf(blocks: Block[]): Array<{ id: string; text: string; level: number }> {
  return blocks
    .filter((one) => LEVEL[one.type] !== undefined && plainOf(one.text).trim())
    .map((one) => ({ id: one.id, text: plainOf(one.text).trim(), level: LEVEL[one.type]! }));
}

export function TocBlock({ one, disabled, register, onKey, blocks }: DrawnProps & { blocks: Block[] }) {
  const heads = headingsOf(blocks);
  const jump = (id: string) => {
    const node = document.querySelector<HTMLElement>(`[data-block="${CSS.escape(id)}"]`);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.focus({ preventScroll: true });
  };
  return (
    <nav
      className="sp-toc"
      ref={register}
      tabIndex={disabled ? -1 : 0}
      aria-label="Contents"
      data-id={one.id}
      onKeyDown={frameKey(onKey)}
    >
      <p className="sp-toc-title">Contents</p>
      {heads.length === 0 ? (
        <p className="sp-toc-empty">Add a heading and it shows up here.</p>
      ) : (
        <ol>
          {heads.map((head) => (
            <li key={head.id} style={{ paddingLeft: `${head.level * 16}px` }}>
              <button type="button" onClick={() => jump(head.id)}>
                {head.text}
              </button>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}
