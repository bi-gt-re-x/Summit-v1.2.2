/**
 * The first thing a new account does on the skill tree: pick five subjects.
 *
 * ## Why this is a screen and not a default
 *
 * The band across the top has always been five subjects, and until now they
 * were *derived* — the five this account had filed the most tasks under, with
 * a "Change" button under each. That is the right behaviour for an account
 * with a term of work behind it and the wrong one for an account with none: a
 * new reader arrived at a hundred-subject rail and a band of five subjects
 * chosen by a tie-break between zeroes, with nothing on the page telling them
 * the band was theirs to set.
 *
 * So the derivation stays, and it is what this screen *offers* rather than
 * what it silently applies. The reader picks five, or takes the suggestion in
 * one click, and either way the five in the band afterwards are five they
 * agreed to. See utils/focusTopics for where the answer is kept and why the
 * stored value is subject ids rather than the trees they route to.
 *
 * ## It is shown once, on the count
 *
 * The gate is `loadFocus` returning null — this account has never chosen —
 * which is a different state from "chose and then cleared it". Nothing here
 * writes a "seen" flag: choosing five *is* the flag, and a reader who wants
 * the screen again gets it from the band's own "Choose again".
 *
 * ## Exactly five, and the counter says so
 *
 * Not "up to five". The band holds five and a band with a hole in it is worse
 * than a band of subjects somebody is lukewarm about — the same argument
 * `resolveFocus` makes for topping the list up. Continue stays disabled until
 * the fifth is picked, the counter is live, and a sixth click swaps the oldest
 * pick out rather than being refused, because a disabled subject that gives no
 * reason reads as a broken button.
 */
import { useMemo, useState } from 'react';
import { iconUrl as subjectIconUrl, type Subject } from '@/services/subjects';
import { FOCUS_COUNT } from '@/utils/focusTopics';

export interface FocusSetupProps {
  /** Every subject the account can pick from, in the catalogue's order. */
  subjects: Subject[];
  /**
   * The five the app would have chosen — catalogue order, which is this
   * account's own usage. Offered as one button rather than pre-ticked: a
   * screen that opens with its answer filled in is a screen nobody reads.
   */
  suggested: string[];
  /** The chosen five, in the order they were picked. */
  onDone: (ids: string[]) => void;
  /**
   * Leave without choosing. Only offered where there is something to fall back
   * to — see the caller. Skipping does not store anything, so the band goes
   * back to being derived and this screen returns next visit.
   */
  onSkip?: () => void;
}

export function FocusSetup({ subjects, suggested, onDone, onSkip }: FocusSetupProps) {
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState('');

  const byId = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject])), [subjects]);

  /* Grouped as the catalogue groups them, in the order the groups first
     appear — study, work, home — rather than an alphabet nobody chose. The
     same arrangement the band's own picker uses; see FocusTopics. */
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

  /* A sixth pick drops the first rather than being refused. The reader has
     said what they want; the only question is what it replaces, and the oldest
     choice is the one they are least likely to still be thinking about. */
  const toggle = (id: string) =>
    setPicked((current) => {
      if (current.includes(id)) return current.filter((entry) => entry !== id);
      if (current.length < FOCUS_COUNT) return [...current, id];
      return [...current.slice(1), id];
    });

  const full = picked.length === FOCUS_COUNT;

  return (
    <section className="stx-setup" aria-label="Choose your focus topics">
      <header className="stx-setup-head">
        <p className="stx-setup-eyebrow">Start here</p>
        <h1>Pick five subjects to focus on</h1>
        <p className="stx-setup-lead">
          These five sit across the top of the page and take you straight back to what you're
          working on. You can swap them anytime, and every other subject is one search away.
        </p>
      </header>

      {/* The five slots, filled left to right as they are picked. Drawn as
          empty slots rather than as a growing list so the size of the decision
          is visible before the first click. */}
      <ol className="stx-setup-slots" aria-label={`${picked.length} of ${FOCUS_COUNT} chosen`}>
        {Array.from({ length: FOCUS_COUNT }, (_, slot) => {
          const id = picked[slot];
          const subject = id ? byId.get(id) : undefined;
          return (
            <li key={slot} className={`stx-setup-slot${id ? ' is-filled' : ''}`}>
              {id ? (
                <button
                  type="button"
                  className="stx-setup-slot-btn"
                  onClick={() => toggle(id)}
                  aria-label={`Remove ${subject?.name ?? id}`}
                >
                  <span className="stx-setup-slot-badge">
                    {subject && (
                      <i
                        className="stx-ico stx-setup-slot-ico"
                        style={{ ['--ico' as string]: `url(${subjectIconUrl(subject)})` }}
                      />
                    )}
                  </span>
                  <strong>{subject?.name ?? id}</strong>
                  <i className="stx-setup-slot-x" aria-hidden="true">
                    ×
                  </i>
                </button>
              ) : (
                <span className="stx-setup-slot-empty">{slot + 1}</span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="stx-setup-bar">
        <input
          className="stx-setup-filter"
          type="search"
          value={filter}
          placeholder="Filter subjects"
          aria-label="Filter subjects"
          onChange={(event) => setFilter(event.target.value)}
        />
        {/* The derivation, offered rather than applied. Only when there are
            five to offer — a button that fills three of five slots is worse
            than no button. */}
        {suggested.length === FOCUS_COUNT && (
          <button
            type="button"
            className="stx-setup-suggest"
            onClick={() => setPicked(suggested.slice(0, FOCUS_COUNT))}
          >
            Use the five I work on most
          </button>
        )}
        <span className="stx-setup-count" role="status">
          <strong>{picked.length}</strong> of {FOCUS_COUNT} chosen
        </span>
      </div>

      <div className="stx-setup-list">
        {matches.length === 0 && <p className="stx-setup-none">No subject matches that.</p>}
        {matches.map(({ group, rows }) => (
          <div key={group} className="stx-setup-group">
            <span className="stx-setup-group-name">{group}</span>
            <div className="stx-setup-choices">
              {rows.map((subject) => {
                const on = picked.includes(subject.id);
                return (
                  <button
                    key={subject.id}
                    type="button"
                    className={`stx-setup-choice${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => toggle(subject.id)}
                  >
                    <i
                      className="stx-ico stx-setup-choice-ico"
                      style={{ ['--ico' as string]: `url(${subjectIconUrl(subject)})` }}
                    />
                    {subject.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <footer className="stx-setup-actions">
        <button
          type="button"
          className="stx-setup-go"
          disabled={!full}
          onClick={() => onDone(picked)}
        >
          {full ? 'Open my skill trees' : `Pick ${FOCUS_COUNT - picked.length} more`}
        </button>
        {onSkip && (
          <button type="button" className="stx-setup-skip" onClick={onSkip}>
            Decide later
          </button>
        )}
      </footer>
    </section>
  );
}
