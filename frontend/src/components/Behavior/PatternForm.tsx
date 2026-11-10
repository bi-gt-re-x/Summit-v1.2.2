/**
 * Naming a pattern, or changing one: what keeps happening, what it looks like, and where
 * it can show up. Where it shows up decides which sessions it's checked against, so the
 * question after a task only asks about the patterns that task could have.
 */
import { useState } from 'react';
import type { BehaviorScope, Fix } from '@/services/behavior';
import { RULES } from '@/utils/sharedRules';
import { FixPicker } from './FixPicker';

export interface PatternFields {
  title: string;
  detail: string;
  scope: BehaviorScope;
  subject: string;
  /** Comma-separated, as typed. */
  words: string;
}

const SCOPES = RULES.behavior.scopes as { key: BehaviorScope; label: string }[];
const LIBRARY = RULES.behavior.interventions as { key: string; title: string; how: string; words: string[] }[];

/** The library's fixes, the ones whose words the pattern uses first. The server ranks
 * the same list the same way for a pattern that's already saved (backend/tracking/behavior.py). */
export function fixesFor(text: string): Fix[] {
  const lowered = text.toLowerCase();
  const scored = LIBRARY.map((one, at) => ({
    one, at, hits: one.words.filter((word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(lowered)).length,
  }));
  const matched = scored.filter((row) => row.hits > 0).sort((a, b) => b.hits - a.hits || a.at - b.at).map((row) => row.one);
  const rest = LIBRARY.filter((one) => !matched.includes(one) && one.key !== 'if-then');
  const fallback = LIBRARY.filter((one) => one.key === 'if-then');
  return [...matched, ...rest, ...fallback].filter((one, at, all) => all.indexOf(one) === at)
    .slice(0, 5).map(({ key, title, how }) => ({ key, title, how }));
}

export function PatternForm({ heading, submit, busy, start, subjects, withFix = false, onSubmit, onCancel }: {
  heading: string;
  submit: string;
  busy: boolean;
  start?: Partial<PatternFields>;
  subjects: { id: string; name: string }[];
  /** Offer a first fix to go with it (adding, not editing). */
  withFix?: boolean;
  onSubmit: (fields: PatternFields, fix: Fix | null) => void;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState<PatternFields>({
    title: '', detail: '', scope: 'study', subject: '', words: '', ...start,
  });
  const [fix, setFix] = useState<Fix | null>(null);
  const set = (change: Partial<PatternFields>) => setFields((was) => ({ ...was, ...change }));
  const missing = !fields.title.trim()
    || (fields.scope === 'subject' && !fields.subject)
    || (fields.scope === 'words' && !fields.words.trim());
  const suggestions = fixesFor(`${fields.title} ${fields.detail}`);

  return (
    <form
      className="bh-form"
      aria-label={heading}
      onSubmit={(event) => {
        event.preventDefault();
        if (!missing) onSubmit({ ...fields, title: fields.title.trim(), detail: fields.detail.trim() }, fix);
      }}
    >
      <p className="bh-form-lead"><b>{heading}</b></p>
      <label className="bh-field">
        What keeps happening?
        <input
          value={fields.title}
          maxLength={RULES.behavior.title_max}
          placeholder="I rush the last few problems on tests"
          onChange={(event) => set({ title: event.target.value })}
          autoFocus
        />
      </label>
      <label className="bh-field">
        What it looks like <small>(optional)</small>
        <textarea
          value={fields.detail}
          rows={2}
          maxLength={RULES.behavior.detail_max}
          placeholder="I change a right answer at the last minute, or skip reading the whole question"
          onChange={(event) => set({ detail: event.target.value })}
        />
      </label>
      <div className="bh-row">
        <label className="bh-field">
          Where it shows up
          <select value={fields.scope} onChange={(event) => set({ scope: event.target.value as BehaviorScope })}>
            {SCOPES.map((scope) => <option key={scope.key} value={scope.key}>{scope.label}</option>)}
          </select>
        </label>
        {fields.scope === 'subject' && (
          <label className="bh-field is-grow">
            Subject
            <select value={fields.subject} onChange={(event) => set({ subject: event.target.value })}>
              <option value="">Pick one</option>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </label>
        )}
        {fields.scope === 'words' && (
          <label className="bh-field is-grow">
            Tasks named with
            <input value={fields.words} placeholder="mock, timed, sprint" onChange={(event) => set({ words: event.target.value })} />
          </label>
        )}
      </div>
      <p className="bh-hint">
        {fields.scope === 'tests'
          ? 'Checked against tasks named like a test or contest: mock, quiz, exam, AMC, MATHCOUNTS and so on.'
          : fields.scope === 'study'
            ? 'Checked against every study task. Pick something narrower if it only happens in some of them.'
            : fields.scope === 'subject'
              ? 'Checked against tasks in that subject.'
              : 'Checked against tasks whose names have one of those words.'}
      </p>
      {withFix && (
        <fieldset className="bh-fieldset">
          <legend>A first fix to try <small>(optional, you can add one later)</small></legend>
          <FixPicker fixes={suggestions} busy={busy}
            replacing={null} compact start={null} onStart={setFix} />
        </fieldset>
      )}
      <div className="bh-row">
        <button type="submit" className="bh-btn is-primary" disabled={busy || missing}>{submit}</button>
        <button type="button" className="bh-btn is-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
