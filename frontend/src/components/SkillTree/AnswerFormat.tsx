/**
 * What shape an answer takes: "Fraction. Like 3/4." The server decides and
 * sends the words (backend/tracking/skill_check.py), so there's no second copy
 * of them here.
 */
import type { AnswerFormat as Format } from '@/services/skillSteps';
import '@/styles/mathtext.css';

export function AnswerFormat({ format, withNote = true }: { format?: Format | null; withNote?: boolean }) {
  if (!format) return null;
  return (
    <span className="mt-format" data-kind={format.kind}>
      <span className="mt-format-label">{format.label}</span>
      {withNote && <span className="mt-format-note">{format.note}</span>}
    </span>
  );
}
