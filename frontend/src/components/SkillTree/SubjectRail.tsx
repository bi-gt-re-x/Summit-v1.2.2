/**
 * The search field and the pill rail under the focus band — how anything on the
 * skill tree is reached without knowing where it lives.
 *
 * ## Two controls answering two questions
 *
 * The rail answers "take me to a subject I file tasks under": every subject in
 * the account's catalogue, in the order the catalogue sent them, which is that
 * account's own usage. A hundred pills is too many to read and exactly right to
 * scroll, so it is one horizontal row rather than a grid — a wall of a hundred
 * would be a page of its own before the lattice started.
 *
 * The search answers "take me to that thing I half remember", across all three
 * kinds of thing at once: subjects, lattices, and the eleven hundred skills
 * inside them. Typing "eigen" should land on Eigenvectors in Linear Algebra
 * without the reader knowing Linear Algebra is under Mathematics, which is the
 * whole reason this is not a filter over the pills.
 *
 * ## The index is built once
 *
 * Every skill on every tree, flattened at first render and kept. It is eleven
 * hundred rows of two short strings, which is nothing to hold and a great deal
 * to rebuild on each keystroke.
 *
 * ## Hands stay on the keyboard
 *
 * The results are driven with the arrow keys and taken with Enter, because the
 * thing this most resembles is a command palette and nobody reaches for the
 * mouse in one. Enter with nothing highlighted still takes the first row,
 * which is what it always did.
 *
 * ## What it does not do
 *
 * Navigate. It reports what was picked and the page decides what that means —
 * the same split the lattice tiles use, and what keeps this component drawable
 * without a router anywhere near it. What the page then does with a skill is
 * the whole point of the search: it switches tree, selects the node, opens the
 * panel on it *and* scrolls the canvas until it is on screen. See `openTree`
 * in pages/SkillTrees.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { claimed, typing } from '@/utils/keys';
import { iconUrl as subjectIconUrl, type Subject } from '@/services/subjects';
import { treeForSubject } from '@/skills/subjectMap';
import { SUBJECT_TREES, iconUrl } from '@/skills/subjectTrees';

/** What a search result points at. A skill also carries the node to select. */
export interface RailHit {
  kind: 'subject' | 'tree' | 'skill';
  /** What the row prints. */
  name: string;
  /** The line under it: the group, the parent subject, or the tree. */
  where: string;
  icon: string;
  tree: string;
  node?: string;
}

export interface SubjectRailProps {
  subjects: Subject[];
  /**
   * The trees the reader is inside — the open one and every ancestor of it.
   *
   * A trail rather than an id because a pill points at a subject, and three
   * forks into Coding the reader is still inside Coding: with only the open id,
   * every pill would go dark the moment they walked into a child lattice, which
   * is exactly when knowing where you came from is worth the most.
   */
  openTrail: readonly string[];
  onOpen: (tree: string, node?: string) => void;
}

/** How many results are worth showing. Past this, refine the search. */
const MAX_HITS = 12;

export function SubjectRail({ subjects, openTrail, onOpen }: SubjectRailProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  /* Which row the arrow keys are on. An index rather than an id, because the
     list is rebuilt on every keystroke and "the second one" survives that
     where "the row for Eigenvectors" does not. */
  const [at, setAt] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const field = useRef<HTMLInputElement>(null);

  /* Every searchable thing, flattened once. Subjects first so a subject the
     reader actually uses beats a skill that merely shares a word with it. */
  const index = useMemo<RailHit[]>(() => {
    const rows: RailHit[] = subjects.map((subject) => ({
      kind: 'subject',
      name: subject.name,
      where: subject.group,
      icon: `/static/icons/${subject.icon}.svg`,
      ...treeForSubject(subject.id, subject.group),
    }));
    for (const tree of SUBJECT_TREES) {
      rows.push({
        kind: 'tree',
        name: tree.title,
        where: tree.parent ? `in ${SUBJECT_TREES.find((t) => t.id === tree.parent)?.title ?? ''}` : 'Subject',
        icon: iconUrl(tree.nodes[0]?.icon),
        tree: tree.id,
      });
      for (const node of tree.nodes) {
        rows.push({
          kind: 'skill',
          name: node.name,
          where: tree.title,
          icon: iconUrl(node.icon),
          tree: tree.id,
          node: node.id,
        });
      }
    }
    return rows;
  }, [subjects]);

  const hits = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    /* Ranked by where the match landed rather than by kind alone: a name that
       starts with what was typed is almost always the one meant, and without
       that "art" offers Particle Physics before Art. */
    const scored: { hit: RailHit; score: number }[] = [];
    for (const hit of index) {
      const name = hit.name.toLowerCase();
      const at = name.indexOf(needle);
      if (at === -1) continue;
      const kindWeight = hit.kind === 'subject' ? 0 : hit.kind === 'tree' ? 1 : 2;
      scored.push({ hit, score: (at === 0 ? 0 : 10) + kindWeight + Math.min(at, 5) });
    }
    scored.sort((a, b) => a.score - b.score || a.hit.name.length - b.hit.name.length);
    return scored.slice(0, MAX_HITS).map((row) => row.hit);
  }, [index, query]);

  /* `/` puts the caret in the field, from anywhere on the page that is not
     already a field. The keystroke is swallowed on the way, or the slash it
     stands for would arrive in the box it just opened. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || claimed(event) || typing(event.target)) return;
      event.preventDefault();
      field.current?.focus();
      field.current?.select();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* Back to the top whenever the list itself changes. Holding position would
     mean a fourth row that is now a different skill, and Enter taking
     something the reader never saw highlighted. */
  useEffect(() => {
    setAt(0);
  }, [query]);

  /* Keep the highlighted row in the popup's own scroll. `nearest`, so arrowing
     down a visible list does not scroll the page under it. */
  useEffect(() => {
    list.current?.querySelector('[data-at="on"]')?.scrollIntoView({ block: 'nearest' });
  }, [at, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /** Whether the popup is up, which three attributes on the field have to
   *  agree with. Worked out once rather than repeated. */
  const showing = open && query.trim().length >= 2;

  const go = (hit: RailHit) => {
    onOpen(hit.tree, hit.node);
    setOpen(false);
    setQuery('');
  };

  /**
   * The arrow keys, on the input rather than on the rows.
   *
   * A listbox the reader never focuses: the text field keeps the caret the
   * whole time and says which row is current through `aria-activedescendant`,
   * which is the pattern a screen reader expects from a search field with
   * results under it — and the alternative, moving real focus into the list,
   * means every keystroke after that goes somewhere other than the query.
   */
  const onKeys = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (hits.length === 0) return;
      // Held down rather than pressed once, this would otherwise scroll the
      // page behind the popup as well as move the highlight.
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      // Wrapping, because a twelve-row list is short enough that running off
      // the end and stopping feels like something broke.
      setAt((current) => (current + step + hits.length) % hits.length);
      return;
    }
    if (event.key === 'Enter') {
      const hit = hits[at] ?? hits[0];
      if (hit) go(hit);
      return;
    }
    if (event.key === 'Escape') setOpen(false);
  };

  return (
    <div className="stx-rail" ref={wrap}>
      <div className="stx-find">
        <i className="stx-ico stx-find-ico" style={{ ['--ico' as string]: `url(${iconUrl('magnifier')})` }} />
        <input
          ref={field}
          type="search"
          className="stx-find-input"
          placeholder="Search subjects, lattices and skills"
          value={query}
          aria-label="Search subjects, lattices and skills"
          role="combobox"
          aria-expanded={showing}
          aria-controls="stx-hits"
          aria-autocomplete="list"
          aria-activedescendant={showing && hits[at] ? `stx-hit-${at}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeys}
        />
        {query ? (
          <button type="button" className="stx-find-clear" aria-label="Clear search" onClick={() => setQuery('')}>
            ×
          </button>
        ) : (
          /* The shortcut, where the shortcut is. A binding nobody can see is a
             secret, and this is the one corner of the field that is empty
             exactly while the shortcut is the thing worth knowing. */
          <kbd className="stx-find-key" aria-hidden="true">
            /
          </kbd>
        )}

        {showing && (
          <ul className="stx-hits" id="stx-hits" ref={list} role="listbox" aria-label="Search results">
            {hits.length === 0 && <li className="stx-hit-none">Nothing matches that yet.</li>}
            {hits.map((hit, index) => {
              const on = index === at;
              return (
                <li
                  key={`${hit.kind}-${hit.tree}-${hit.node ?? hit.name}`}
                  id={`stx-hit-${index}`}
                  role="option"
                  aria-selected={on}
                  data-at={on ? 'on' : undefined}
                >
                  <button
                    type="button"
                    className={`stx-hit${on ? ' is-on' : ''}`}
                    /* Pointing at a row makes it the one Enter takes, so the
                       mouse and the arrow keys cannot disagree about which
                       row is current. */
                    onMouseEnter={() => setAt(index)}
                    onClick={() => go(hit)}
                  >
                    <i className="stx-ico stx-hit-ico" style={{ ['--ico' as string]: `url(${hit.icon})` }} />
                    <span className="stx-hit-text">
                      <strong>{hit.name}</strong>
                      <em>{hit.where}</em>
                    </span>
                    <span className={`stx-hit-kind is-${hit.kind}`}>{hit.kind}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* The rail. Horizontal and scrollable rather than wrapped: a hundred
          pills across nine rows is a page, and the point of this row is that
          the lattice is still visible under it.

          Where the catalogue did not arrive — the request failed, or this is a
          browser with no session — it falls back to the eleven root subjects.
          Losing the subject names is a small loss; losing every way to move
          between lattices would leave the page stranded on whichever one it
          opened. */}
      <nav className="stx-pills" aria-label="Subjects">
        {subjects.length === 0 &&
          SUBJECT_TREES.filter((tree) => !tree.parent).map((tree) => (
            <button
              key={tree.id}
              type="button"
              className={`stx-pill${openTrail.includes(tree.id) ? ' is-on' : ''}`}
              onClick={() => onOpen(tree.id)}
            >
              <i
                className="stx-ico stx-pill-ico"
                style={{ ['--ico' as string]: `url(${iconUrl(tree.nodes[0]?.icon)})` }}
              />
              {tree.title}
            </button>
          ))}
        {subjects.map((subject) => {
          const target = treeForSubject(subject.id, subject.group);
          const here = openTrail.includes(target.tree);
          return (
            <button
              key={subject.id}
              type="button"
              className={`stx-pill${here ? ' is-on' : ''}`}
              aria-current={here ? 'true' : undefined}
              title={subject.name}
              onClick={() => onOpen(target.tree, target.node)}
            >
              <i
                className="stx-ico stx-pill-ico"
                style={{ ['--ico' as string]: `url(${subjectIconUrl(subject)})` }}
              />
              {subject.name}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
