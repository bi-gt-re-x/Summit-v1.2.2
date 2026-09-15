/**
 * The five subjects across the top of the skill tree, and the picker that
 * changes one.
 *
 * ## What a focus topic is
 *
 * A subject from the account's own catalogue — the same hundred a task can be
 * filed under — paired with the lattice it opens. Not a tree: somebody focusing
 * on Mandarin is focusing on Mandarin, and the fact that it opens the Foreign
 * Languages lattice is routing rather than meaning. See skills/subjectMap.
 *
 * ## Chosen, with a sensible default
 *
 * Which five is utils/focusTopics business, and it starts as the five subjects
 * this account files the most tasks under. This component only draws them and
 * reports a change; it holds no state except which slot has its picker open.
 *
 * ## A card says where the account stands
 *
 * The card used to print a subject's name and the lattice it opens, which is
 * two facts a reader already knew — they chose it. What it could not say was
 * the only thing worth asking of a focus topic: *how am I doing at this*.
 *
 * That figure is real account state rather than anything authored: the tree's
 * own nodes with this account's practice applied, counted. It arrives as a
 * prop rather than being worked out here, because five lattices' worth of
 * arithmetic on every keystroke in the picker's filter would be five lattices'
 * worth of arithmetic on every keystroke in the picker's filter. See
 * `focusStanding` in pages/SkillTrees.
 *
 * The separation is the same one the whole page keeps: the lattice is authored
 * and identical on every account, the standing is the account's, and a card
 * that mixed them would be a card that could not be argued with.
 *
 * ## The picker
 *
 * A popover under the card being changed, holding a filter and every subject
 * grouped as the catalogue groups them. It is a popover rather than a dialog
 * because changing a focus topic is a small, reversible decision and stopping
 * the page for it would be out of proportion. Escape closes it, a click outside
 * closes it, and the button that opened it keeps focus so the keyboard has
 * somewhere to come back to.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { iconUrl as subjectIconUrl, type Subject } from '@/services/subjects';
import { treeForSubject } from '@/skills/subjectMap';
import { subjectTreeById } from '@/skills/subjectTrees';

/** How an account stands on one focus topic's lattice. */
export interface FocusStanding {
  /** Nodes finished, and nodes there are. */
  mastered: number;
  total: number;
  /** The tally's own percentage, rounded. */
  percent: number;
  /** How many can be started right now. */
  open: number;
  /** The best thing to do next, by name, or null on a finished tree. */
  next: string | null;
}

export interface FocusTopicsProps {
  /** Every subject the account can pick from, in the catalogue's order. */
  subjects: Subject[];
  /** The five subject ids currently in the band. */
  focus: string[];
  /** Open the lattice this subject routes to. */
  onOpen: (subjectId: string) => void;
  /** Replace the subject in `index` with `subjectId`. */
  onChange: (index: number, subjectId: string) => void;
  /** The open tree and its ancestors, so the card you walked in through stays
   *  lit while you are inside it. */
  openTrail: readonly string[];
  /** Subject id → where this account stands on it. Missing draws the card the
   *  way it always drew: a name and a lattice, and no claim about anybody. */
  standing?: ReadonlyMap<string, FocusStanding>;
  /**
   * Back to the screen that asked for all five at once.
   *
   * The per-card picker is right for changing one and wrong for changing the
   * set: five popovers to redo a term's focus is five decisions made without
   * being able to see the other four. See components/SkillTree/FocusSetup.
   */
  onChooseAll?: () => void;
}

export function FocusTopics({
  subjects,
  focus,
  onOpen,
  onChange,
  openTrail,
  standing,
  onChooseAll,
}: FocusTopicsProps) {
  const [picking, setPicking] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  const wrap = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject])), [subjects]);

  // Close on Escape or on a click that lands outside the band. Both are
  // registered only while a picker is open, so the page carries no listeners
  // for a control nobody is using.
  useEffect(() => {
    if (picking === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPicking(null);
    };
    const onDown = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setPicking(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [picking]);

  // The filter is per-opening rather than remembered: a picker that reopened
  // showing yesterday's search would be showing four subjects and hiding 96.
  useEffect(() => {
    setFilter('');
  }, [picking]);

  const matches = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const list = needle
      ? subjects.filter(
          (subject) =>
            subject.name.toLowerCase().includes(needle) ||
            subject.label.toLowerCase().includes(needle) ||
            subject.group.toLowerCase().includes(needle),
        )
      : subjects;
    // Grouped in the order the groups first appear, which is catalogue order —
    // study, work, home — rather than an alphabet nobody chose.
    const order: string[] = [];
    const groups = new Map<string, Subject[]>();
    for (const subject of list) {
      if (!groups.has(subject.group)) {
        groups.set(subject.group, []);
        order.push(subject.group);
      }
      groups.get(subject.group)!.push(subject);
    }
    return order.map((group) => ({ group, rows: groups.get(group)! }));
  }, [filter, subjects]);

  // No catalogue, no focus topics. A heading over five blank cards would be
  // worse than the row simply not being there until the subjects arrive.
  if (focus.length === 0) return null;

  return (
    <section className="stx-focus" aria-label="Your focus topics" ref={wrap}>
      <header className="stx-focus-head">
        <h2>Your Focus Topics</h2>
        <p>
          Five subjects to keep in front of you. Change any of them at any time
          {onChooseAll && (
            <>
              , or{' '}
              <button type="button" className="stx-focus-redo" onClick={onChooseAll}>
                pick all five again
              </button>
            </>
          )}
          .
        </p>
      </header>

      <ol className="stx-focus-row">
        {focus.map((id, index) => {
          const subject = byId.get(id);
          const target = treeForSubject(id, subject?.group);
          const tree = subjectTreeById(target.tree);
          const here = tree ? openTrail.includes(tree.id) : false;
          const stands = standing?.get(id);
          return (
            <li key={`${id}-${index}`} className={`stx-focus-card${here ? ' is-here' : ''}`}>
              <button
                type="button"
                className="stx-focus-open"
                onClick={() => onOpen(id)}
                aria-current={here ? 'true' : undefined}
              >
                <span className="stx-focus-badge">
                  {subject && (
                    <i
                      className="stx-ico stx-focus-ico"
                      style={{ ['--ico' as string]: `url(${subjectIconUrl(subject)})` }}
                    />
                  )}
                </span>
                <span className="stx-focus-text">
                  <strong>{subject?.name ?? id}</strong>
                  <em>{tree?.title ?? 'No lattice yet'}</em>
                </span>
                {stands && (
                  <span className="stx-focus-pct" aria-hidden="true">
                    {stands.percent}%
                  </span>
                )}
              </button>

              {stands && (
                <>
                  {/* The bar is the percentage said again in a shape, which is
                      the one figure on the card a reader compares across five
                      of them — and five numbers in a row is a table. */}
                  <span className="stx-focus-bar" aria-hidden="true">
                    <i style={{ width: `${stands.percent}%` }} />
                  </span>
                  <p className="stx-focus-stats">
                    <span>
                      <b>
                        {stands.mastered}/{stands.total}
                      </b>{' '}
                      mastered
                    </span>
                    {stands.open > 0 && (
                      <span>
                        <b>{stands.open}</b> open now
                      </span>
                    )}
                  </p>
                  {/* What to do, rather than what has happened — the only line
                      on the card a reader can act on this afternoon. */}
                  {stands.next && (
                    <p className="stx-focus-next" title={stands.next}>
                      <span>Next</span>
                      {stands.next}
                    </p>
                  )}
                </>
              )}
              <button
                type="button"
                className="stx-focus-swap"
                aria-expanded={picking === index}
                aria-label={`Change focus topic ${index + 1}`}
                onClick={() => setPicking((current) => (current === index ? null : index))}
              >
                Change
              </button>

              {picking === index && (
                <div className="stx-focus-pop" role="dialog" aria-label="Choose a subject">
                  <input
                    className="stx-focus-filter"
                    type="search"
                    autoFocus
                    value={filter}
                    placeholder="Filter subjects"
                    onChange={(event) => setFilter(event.target.value)}
                  />
                  <div className="stx-focus-list">
                    {matches.length === 0 && <p className="stx-focus-none">No subject matches that.</p>}
                    {matches.map(({ group, rows }) => (
                      <div key={group} className="stx-focus-group">
                        <span className="stx-focus-group-name">{group}</span>
                        {rows.map((subject) => (
                          <button
                            key={subject.id}
                            type="button"
                            className={`stx-focus-choice${subject.id === id ? ' is-on' : ''}`}
                            onClick={() => {
                              onChange(index, subject.id);
                              setPicking(null);
                            }}
                          >
                            <i
                              className="stx-ico stx-focus-choice-ico"
                              style={{ ['--ico' as string]: `url(${subjectIconUrl(subject)})` }}
                            />
                            {subject.name}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
