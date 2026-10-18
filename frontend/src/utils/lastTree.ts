/**
 * The skill tree the reader last had open, so the page comes back to it.
 *
 * Per account and in the browser, beside the focus topics (utils/focusTopics),
 * for the same reason: it's where you were, not something worth a server
 * round trip. The page checks the id still names a tree before using it.
 */
import { skillStore } from './skillStore';

const lastTreeStore = skillStore<string | null>({
  key: 'skillLastTree',
  version: 1,
  empty: null,
  validate: (raw) => (typeof raw === 'string' && raw ? raw : null),
});

export function loadLastTree(username: string | null): string | null {
  return lastTreeStore.load(username);
}

export function saveLastTree(username: string | null, id: string): void {
  lastTreeStore.save(username, id);
}
