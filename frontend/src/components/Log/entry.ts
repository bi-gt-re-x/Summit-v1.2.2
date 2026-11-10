/**
 * Small pieces of the Log page (pages/Log.tsx) worth testing on their own:
 * the plain-text preview an entry shows in the list, its date, search, and the
 * draft kept on this device so nothing typed is lost.
 */
import type { Entry, Insight, MarkKey } from '@/services/log';
import { RULES } from '@/utils/sharedRules';

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

/** The tags an entry can carry, in order: shared/rules.json `log.marks`. */
export const MARKS = RULES.log.marks as Array<{ key: MarkKey; label: string }>;
const MARK_LABEL = new Map(MARKS.map((mark) => [mark.key, mark.label]));
export const markLabel = (key: MarkKey): string => MARK_LABEL.get(key) ?? key;

/** What the list shows: everything, the pinned ones, or one mark. */
export type EntryFilter = 'all' | 'pinned' | MarkKey;

/** Lowercase words of a search, ready to match. */
export const searchWords = (query: string): string[] => query.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Everything a search can find an entry by: its title and words, its marks
 * ("milestone" finds every milestone), "pinned", and its date written out
 * ("oct 10", "2026").
 */
function findable(entry: Entry): string {
  const marks = (entry.marks ?? []).map(markLabel).join(' ');
  return `${entry.title} ${plainText(entry.body)} ${marks} ${entry.pinned ? 'pinned' : ''} ${entryDate(entry.created_at)}`.toLowerCase();
}

/**
 * The entries a search and a filter keep, in the chosen order, with the
 * pinned ones first. Every word has to be found somewhere in the entry.
 */
export function findEntries(
  entries: Entry[],
  query: string,
  order: 'newest' | 'oldest',
  filter: EntryFilter = 'all',
): Entry[] {
  const words = searchWords(query);
  const kept = entries.filter((entry) => {
    if (filter === 'pinned' && !entry.pinned) return false;
    if (filter !== 'all' && filter !== 'pinned' && !(entry.marks ?? []).includes(filter)) return false;
    if (words.length === 0) return true;
    const text = findable(entry);
    return words.every((word) => text.includes(word));
  });
  const sorted = [...kept].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const ordered = order === 'newest' ? sorted : sorted.reverse();
  return [...ordered.filter((entry) => entry.pinned), ...ordered.filter((entry) => !entry.pinned)];
}

/** How many entries each filter would show, for the chips. */
export function filterCounts(entries: Entry[]): Record<EntryFilter, number> {
  const counts = { all: entries.length, pinned: 0 } as Record<EntryFilter, number>;
  for (const mark of MARKS) counts[mark.key] = 0;
  for (const entry of entries) {
    if (entry.pinned) counts.pinned += 1;
    for (const mark of entry.marks ?? []) counts[mark] = (counts[mark] ?? 0) + 1;
  }
  return counts;
}

/** Text cut into plain and found pieces, so a search's words can be marked where they are. */
export function highlight(text: string, query: string): Array<{ text: string; hit: boolean }> {
  const words = searchWords(query).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (words.length === 0 || !text) return [{ text, hit: false }];
  const pattern = new RegExp(`(${words.sort((a, b) => b.length - a.length).join('|')})`, 'gi');
  return text
    .split(pattern)
    .filter((piece) => piece !== '')
    .map((piece) => ({ text: piece, hit: words.some((word) => new RegExp(`^${word}$`, 'i').test(piece)) }));
}

/**
 * The bit of an entry's words to preview: the start, or, when a search word
 * is further in, the stretch around the first one found, so you can see why
 * it matched.
 */
export function previewOf(text: string, query: string, room = 140): string {
  const words = searchWords(query);
  const lower = text.toLowerCase();
  const at = words.map((word) => lower.indexOf(word)).filter((found) => found >= 0).sort((a, b) => a - b)[0];
  if (at === undefined || at < room - 40) return text;
  const start = text.lastIndexOf(' ', Math.max(0, at - 40)) + 1;
  return `…${text.slice(start)}`;
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
  mood?: number | null;
  energy?: number | null;
  /** When it was last typed in, epoch ms. */
  at: number;
}

/**
 * Where the draft is kept. The Log page has the plain key; a Log block on a
 * space's page passes its own `slot` (its block id), so the page and each
 * block keep a draft of their own and never put back each other's words.
 */
const draftKey = (username: string, slot = '') => `summit:log-draft:${username}${slot ? `:${slot}` : ''}`;

export function readDraft(username: string, slot = ''): LocalDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(username, slot));
    if (!raw) return null;
    const found = JSON.parse(raw) as Partial<LocalDraft>;
    if (typeof found.title !== 'string' || typeof found.body !== 'string') return null;
    const scale = (value: unknown, top: number) =>
      typeof value === 'number' && value >= 1 && value <= top ? value : null;
    return {
      id: found.id || undefined, title: found.title, body: found.body,
      mood: scale(found.mood, 5), energy: scale(found.energy, 3), at: Number(found.at) || 0,
    };
  } catch {
    return null;
  }
}

export function writeDraft(username: string, draft: LocalDraft, slot = ''): void {
  try {
    localStorage.setItem(draftKey(username, slot), JSON.stringify(draft));
  } catch {
    /* Private mode or full storage: the server copy is all there is. */
  }
}

export function clearDraft(username: string, slot = ''): void {
  try {
    localStorage.removeItem(draftKey(username, slot));
  } catch {
    /* see above */
  }
}
