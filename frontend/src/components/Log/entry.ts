/**
 * Small pieces of the Log page (pages/Log.tsx) worth testing on their own:
 * the plain-text preview an entry shows in the list, its date, search, and the
 * draft kept on this device so nothing typed is lost.
 */
import type { Entry, Insight } from '@/services/log';

/** An entry's body without its Markdown, for the two-line preview and search. */
export function plainText(body: string): string {
  // Escaped characters are parked first, so an escaped star stays a star.
  const held: string[] = [];
  const parked = body.replace(/\\(.)/g, (_whole, char: string) => {
    held.push(char);
    return `\u0000${held.length - 1}\u0000`;
  });
  return parked
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\{[^}]*\}/g, '$1')
    .replace(/^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|[a-zA-Z][.)]\s+)/gm, '')
    .replace(/(\*\*|__|~~|==|\*|`)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\u0000(\d+)\u0000/g, (_whole, at: string) => held[Number(at)] ?? '')
    .trim();
}

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

/** "Oct 16, 2026" from a stored ISO stamp. */
export function entryDate(stamp: string): string {
  const when = new Date(stamp.length <= 10 ? `${stamp}T12:00:00` : stamp);
  return Number.isNaN(when.getTime()) ? '' : DATE.format(when);
}

/** "4:23 PM". */
export function clock(at: number): string {
  return TIME.format(new Date(at));
}

/** The entries a search keeps, in the chosen order. */
export function findEntries(entries: Entry[], query: string, order: 'newest' | 'oldest'): Entry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const kept = words.length === 0
    ? entries
    : entries.filter((entry) => {
        const text = `${entry.title} ${plainText(entry.body)}`.toLowerCase();
        return words.every((word) => text.includes(word));
      });
  const sorted = [...kept].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return order === 'newest' ? sorted : sorted.reverse();
}

/** The insights that came from this entry and nothing else: what deleting it takes. */
export function onlyFrom(insights: Insight[], entryId: string): Insight[] {
  return insights.filter((insight) => insight.sources.length === 1 && insight.sources[0] === entryId);
}

// ---------------------------------------------------------------------------
// The draft on this device
// ---------------------------------------------------------------------------
export interface LocalDraft {
  id?: string;
  title: string;
  body: string;
  /** When it was last typed in, epoch ms. */
  at: number;
}

const draftKey = (username: string) => `summit:log-draft:${username}`;

export function readDraft(username: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(username));
    if (!raw) return null;
    const found = JSON.parse(raw) as Partial<LocalDraft>;
    if (typeof found.title !== 'string' || typeof found.body !== 'string') return null;
    return { id: found.id || undefined, title: found.title, body: found.body, at: Number(found.at) || 0 };
  } catch {
    return null;
  }
}

export function writeDraft(username: string, draft: LocalDraft): void {
  try {
    localStorage.setItem(draftKey(username), JSON.stringify(draft));
  } catch {
    /* Private mode or full storage: the server copy is all there is. */
  }
}

export function clearDraft(username: string): void {
  try {
    localStorage.removeItem(draftKey(username));
  } catch {
    /* see above */
  }
}
