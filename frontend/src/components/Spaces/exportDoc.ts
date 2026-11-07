/**
 * A page as Markdown, for "Export" (components/Spaces/PageTools).
 *
 * Words keep their bold and italics (they're stored as inline Markdown already),
 * lists keep their depth, tables become Markdown tables, and blocks drawn from the
 * account's numbers become a line saying what they were, since a file can't stay live.
 */
import { numberOf, type Block, type SpaceDoc } from './blocks';
import { headingsOf, countdownWords, daysUntil } from './Extras';
import { plainOf } from './inline';

const cell = (value: string) => value.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function line(one: Block, blocks: Block[], at: number): string {
  const pad = '  '.repeat(one.indent ?? 0);
  const words = one.text;
  switch (one.type) {
    case 'h1': return `# ${words}`;
    case 'h2': return `## ${words}`;
    case 'h3': return `### ${words}`;
    case 'bullet': return `${pad}- ${words}`;
    case 'numbered': return `${pad}${numberOf(blocks, at)}. ${words}`;
    case 'todo': return `${pad}- [${one.checked ? 'x' : ' '}] ${words}`;
    case 'toggle': return `${pad}- ${words}`;
    case 'quote': return `> ${words}`;
    case 'callout': return `> 💡 ${words}`;
    case 'divider': return '---';
    case 'code': return '```\n' + words + '\n```';
    case 'sticky': return `> 🗒 ${words}`;
    case 'container': return words ? `**${words}**` : '';
    case 'shape': return words;
    case 'chart': {
      const points = (one.chart?.points ?? []).map((point) => `${point.label} ${point.value}`).join(', ');
      return `_${one.chart?.kind ?? 'bar'} chart${words ? `: ${plainOf(words)}` : ''}: ${points}_`;
    }
    case 'live': return `_Live data: ${one.live?.source ?? ''}${words ? `, ${plainOf(words)}` : ''}_`;
    case 'panel': return `_Panel: ${one.panel?.kind ?? ''}_`;
    case 'countdown': {
      const shown = countdownWords(daysUntil(one.date ?? ''));
      return `**⏳ ${plainOf(words) || 'Countdown'}**: ${one.date ?? ''} (${shown.big} ${shown.small})`;
    }
    case 'toc':
      return headingsOf(blocks).map((head) => `${'  '.repeat(head.level)}- ${head.text}`).join('\n');
    case 'table': {
      const rows = one.table?.rows ?? [];
      if (!rows.length) return '';
      const width = rows[0]!.length;
      const head = one.table?.head ? rows[0]! : Array.from({ length: width }, () => '');
      const body = one.table?.head ? rows.slice(1) : rows;
      return [
        `| ${head.map(cell).join(' | ')} |`,
        `|${' --- |'.repeat(width)}`,
        ...body.map((row) => `| ${row.map(cell).join(' | ')} |`),
      ].join('\n');
    }
    default: return `${pad}${words}`;
  }
}

/** The whole page, with its name as the title. */
export function toMarkdown(doc: SpaceDoc, name: string): string {
  const out = [`# ${doc.icon ? `${doc.icon} ` : ''}${name}`, ''];
  doc.blocks.forEach((one, at) => {
    const text = line(one, doc.blocks, at);
    const listy = ['bullet', 'numbered', 'todo', 'toggle'].includes(one.type);
    const next = doc.blocks[at + 1];
    const nextListy = next && ['bullet', 'numbered', 'todo', 'toggle'].includes(next.type);
    out.push(text);
    // Lists stay tight; everything else gets a blank line after it.
    if (!(listy && nextListy)) out.push('');
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** Hand the reader the page as a .md file. */
export function downloadMarkdown(doc: SpaceDoc, name: string): void {
  const blob = new Blob([toMarkdown(doc, name)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(name || 'Space').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Space'}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
