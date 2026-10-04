/**
 * What a note can point at, and how somebody chooses one.
 *
 * ## Why a picker rather than a URL box
 *
 * A note saying "see the integrals task" is a note that has not linked to
 * anything: the reader still has to go and find it. The address that *would*
 * link to it — `/tasks?task=6f2a…` — is an id nobody has, so asking for a URL
 * asks for the one thing the writer cannot supply. So the button opens the
 * three things this app contains instead, matched by name, and the address is
 * assembled from whatever gets picked.
 *
 *   **Tasks**  the account's own, deep-linked so the board reveals the row
 *   **Goals**  the same, opened on the goal's own panel
 *   **Pages**  every screen and tab, from utils/siteIndex — the list the top
 *              bar's search already uses, rather than a second one to go stale
 *
 * ## The addresses are ordinary routes
 *
 * `/tasks?task=<id>` is the parameter the task board already reads: it opens
 * the heading the task is under, widens the filters when the task is off the
 * board entirely, scrolls to the row and marks it for a second. All of that
 * was built for the top bar's search and none of it had to change. `?goal=` on
 * the goals page is the same idea and is the one thing this needed adding.
 *
 * That is also why nothing here invents a `summit:` scheme. A note holds
 * `[Revise integrals](/tasks?task=a1b2)` — Markdown that is still a link in
 * any window that opens the note, and a route the router already serves.
 */
import { useMemo, useState } from 'react';
import { goals as goalService, tasks as taskService } from '@/services';
import { useApi } from '@/hooks';
import { PLACES, score } from '@/utils/siteIndex';
import { Icon, type IconName } from '@/components/Icon';

/** One thing that can be linked to, once it has been found. */
export interface Target {
  id: string;
  kind: 'task' | 'goal' | 'page';
  /** What the link will say, and what is matched against. */
  label: string;
  /** The line under it — a due date, a percentage, the section it is in. */
  note: string;
  href: string;
}

const HEADING: Record<Target['kind'], string> = {
  task: 'Tasks', goal: 'Goals', page: 'Pages',
};

const GLYPH: Record<Target['kind'], IconName> = {
  task: 'clipboard', goal: 'target', page: 'folder',
};

/** A due date as the picker says one. The board's own wording, shortened. */
function when(date: string | null | undefined): string {
  if (!date) return 'No date';
  const day = date.slice(0, 10);
  const today = new Date();
  const iso = (at: Date) => at.toISOString().slice(0, 10);
  if (day === iso(today)) return 'Today';
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 1);
  if (day === iso(soon)) return 'Tomorrow';
  const at = new Date(`${day}T00:00:00`);
  return Number.isNaN(at.getTime())
    ? 'No date'
    : at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Everything linkable, matched against what has been typed.
 *
 * `score` is the site index's own scale, which is what lets one list hold
 * three kinds of thing and still be in a sensible order: it answers "how
 * closely is this string inside that one" the way a reader means it, so a task
 * called exactly what was typed sorts above a page that merely contains it.
 *
 * Open tasks only, and open goals only. A note being written now is being
 * written about work that is still ahead; the finished ones are a long tail
 * that pushes the answer off the bottom of a list eight rows tall.
 */
export function useTargets(query: string, open: boolean) {
  const tasks = useApi(() => taskService.listTasks(), [], { enabled: open });
  const goals = useApi(() => goalService.getGoals(), [], { enabled: open });

  const all = useMemo<Target[]>(() => {
    const out: Target[] = [];

    for (const task of tasks.data?.tasks ?? []) {
      if (task.status !== 'todo') continue;
      out.push({
        id: task.id,
        kind: 'task',
        label: task.title,
        note: when(task.due_date),
        href: `/tasks?task=${encodeURIComponent(task.id)}`,
      });
    }

    for (const goal of goals.data?.goals ?? []) {
      if (goal.status !== 'active') continue;
      out.push({
        id: goal.id,
        kind: 'goal',
        label: goal.title,
        note: `${Math.round(goal.progress)}%`,
        href: `/goals?goal=${encodeURIComponent(goal.id)}`,
      });
    }

    for (const place of PLACES) {
      out.push({
        id: place.id,
        kind: 'page',
        label: place.name,
        note: place.where || 'Page',
        href: place.to,
      });
    }

    return out;
  }, [goals.data, tasks.data]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      // Nothing typed: the first few of each, so the menu opens showing what
      // it is for rather than an empty box asking a question.
      const some = (kind: Target['kind'], n: number) =>
        all.filter((entry) => entry.kind === kind).slice(0, n);
      return [...some('task', 4), ...some('goal', 3), ...some('page', 4)];
    }
    return all
      .map((entry) => ({ entry, points: score(needle, entry.label) }))
      .filter((row) => row.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 12)
      .map((row) => row.entry);
  }, [all, query]);

  return { shown, loading: tasks.loading || goals.loading };
}

interface Props {
  onPick: (target: Target) => void;
  onClose: () => void;
}

/**
 * The menu itself.
 *
 * Grouped under headings even after a search, because the kind of thing a row
 * is changes what clicking it will do, and a flat list of twelve names does
 * not say which of them is a page.
 */
export function LinkPicker({ onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const { shown, loading } = useTargets(query, true);

  const grouped = useMemo(() => {
    const kinds: Array<Target['kind']> = ['task', 'goal', 'page'];
    return kinds
      .map((kind) => ({ kind, rows: shown.filter((entry) => entry.kind === kind) }))
      .filter((group) => group.rows.length > 0);
  }, [shown]);

  return (
    <div className="nt-menu nt-links is-left" onClick={(event) => event.stopPropagation()}>
      <label className="nt-link-search">
        <Icon name="search" />
        <input
          type="search"
          autoFocus
          value={query}
          placeholder="Link to a task, goal or page…"
          aria-label="Search for something to link to"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
            // Return takes the top row, so the whole thing can be done without
            // leaving the keyboard: open, type three letters, press Return.
            if (event.key === 'Enter' && shown[0]) {
              event.preventDefault();
              onPick(shown[0]);
            }
          }}
        />
      </label>

      <div className="nt-link-rows">
        {loading && shown.length === 0 && <p className="nt-link-empty">Reading your work…</p>}
        {!loading && shown.length === 0 && (
          <p className="nt-link-empty">Nothing here by that name.</p>
        )}

        {grouped.map((group) => (
          <section key={group.kind}>
            <h4>{HEADING[group.kind]}</h4>
            {group.rows.map((target) => (
              <button
                key={`${target.kind}:${target.id}`}
                type="button"
                className={`nt-link-row is-${target.kind}`}
                onClick={() => onPick(target)}
              >
                <span className="nt-link-ico" aria-hidden="true">
                  <Icon name={GLYPH[target.kind]} />
                </span>
                <span className="nt-link-name">{target.label}</span>
                <span className="nt-link-note">{target.note}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
