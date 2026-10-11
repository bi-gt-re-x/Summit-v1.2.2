/**
 * About you: four questions about who the reader is, what they do, what they
 * have done and how they want to improve.
 *
 * The last step of sign-up (components/Auth/AuthFlow) and a section of
 * Settings. The answers are saved by backend/api/background.py, which files
 * each line as an achievement, a stat, an activity or an aim; Analytics shows
 * that list and gives a head start on its unlock waits for detail, and the
 * model prompts read it as background.
 *
 * The meter under the questions is worked out here as the reader types, from
 * the same bands the server uses (utils/background), so what it promises is
 * what the save gives.
 */
import { useMemo, useState } from 'react';
import * as backgroundService from '@/services/background';
import type { Background } from '@/services/background';
import {
  EMPTY_ANSWERS,
  MAX_CHARS,
  MOST_HEAD_START,
  QUESTIONS,
  QUESTION_KEYS,
  backgroundDetail,
  nextBand,
  type Answers,
} from '@/utils/background';
import '@/styles/about-you.css';

const STEPS = ['none', 'brief', 'good', 'detailed'] as const;

export interface AboutYouProps {
  initial?: Answers;
  /** The save button's words. */
  submitLabel: string;
  onDone: (saved: Background) => void;
  /** Shown as a quiet "Skip for now" when given. */
  onSkip?: () => void;
}

export function AboutYou({ initial, submitLabel, onDone, onSkip }: AboutYouProps) {
  const [answers, setAnswers] = useState<Answers>(initial ?? EMPTY_ANSWERS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const detail = useMemo(() => backgroundDetail(answers), [answers]);
  const next = nextBand(detail);
  const at = STEPS.indexOf(detail.level);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await backgroundService.save(answers);
      if (!result.success) {
        setError(result.message || 'That did not save. Try again.');
        return;
      }
      onDone(result);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  const toGo = next ? Math.max(0, next.words - detail.words) : 0;
  const unanswered = next ? Math.max(0, next.answered - detail.answered) : 0;

  return (
    <form className="ay" onSubmit={(event) => void save(event)} noValidate>
      <p className="ay-important" role="note">
        This is important and can help our pages get more accurate answers.
      </p>
      <p className="ay-why">
        Analytics, your study plans and your recommendations all read this. The more detail you
        give, the better they fit you, and the sooner Analytics opens: up to {MOST_HEAD_START} days
        sooner.
      </p>

      {QUESTION_KEYS.map((key) => {
        const question = QUESTIONS[key];
        return (
          <div className="ay-field" key={key}>
            <label className="ay-label" htmlFor={`ay-${key}`}>
              {question.label}
            </label>
            <p className="ay-hint" id={`ay-${key}-hint`}>
              {question.hint}
            </p>
            <textarea
              id={`ay-${key}`}
              className="ay-input"
              rows={3}
              maxLength={MAX_CHARS}
              placeholder={question.placeholder}
              aria-describedby={`ay-${key}-hint`}
              value={answers[key]}
              onChange={(event) => setAnswers((was) => ({ ...was, [key]: event.target.value }))}
            />
          </div>
        );
      })}

      <div className={`ay-meter is-${detail.level}`} aria-live="polite">
        <div className="ay-meter-bar" aria-hidden="true">
          {STEPS.slice(1).map((step, index) => (
            <i key={step} className={index < at ? 'is-on' : undefined} />
          ))}
        </div>
        <p className="ay-meter-text">
          <strong>{detail.label}</strong>
          {detail.head_start > 0
            ? ` · Analytics opens up to ${detail.head_start} days sooner.`
            : ' · No head start yet.'}
        </p>
        {next && (
          <p className="ay-meter-next">
            {toGo > 0 ? `About ${toGo} more words` : ''}
            {toGo > 0 && unanswered > 0 ? ', and ' : ''}
            {unanswered > 0 ? `${unanswered} more ${unanswered === 1 ? 'question' : 'questions'} answered` : ''}
            {toGo > 0 || unanswered > 0 ? ` gets you to ${next.label} (${next.head_start} days).` : ''}
          </p>
        )}
      </div>

      {error && (
        <p className="ay-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="ay-primary" disabled={saving}>
        {saving ? 'Saving…' : submitLabel}
      </button>
      {onSkip && (
        <button type="button" className="ay-skip" onClick={onSkip} disabled={saving}>
          Skip for now. You can fill this in later in Settings.
        </button>
      )}
    </form>
  );
}
