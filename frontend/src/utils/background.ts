/**
 * About you: how detailed the sign-up answers are, and what each question asks.
 *
 * `backgroundDetail` is the same arithmetic as `detail` in
 * backend/tracking/background.py, from the bands in shared/rules.json and
 * pinned by shared/cases/background_detail.json. The browser runs it so the
 * form can say, while the reader types, how much sooner Analytics opens; the
 * server runs it on save and its answer is the one that counts.
 */
import { RULES } from './sharedRules';

export type QuestionKey = 'describe' | 'doing' | 'done' | 'improve';
export type Answers = Record<QuestionKey, string>;
export type DetailLevel = 'none' | 'brief' | 'good' | 'detailed';

export interface Detail {
  words: number;
  answered: number;
  level: DetailLevel;
  label: string;
  head_start: number;
}

const RULE = RULES.background;

export const QUESTION_KEYS = RULE.questions as QuestionKey[];
export const MAX_CHARS = RULE.max_chars;
/** The most head start any answers can earn, in days. */
export const MOST_HEAD_START = Math.max(...RULE.levels.map((level) => level.head_start));

export const QUESTIONS: Record<QuestionKey, { label: string; hint: string; placeholder: string }> = {
  describe: {
    label: 'Describe yourself',
    hint: 'Who you are, your grade or job, and what a normal week looks like.',
    placeholder: "I'm a high school junior. I have school until 3, then about two hours free most days.",
  },
  doing: {
    label: 'What do you do?',
    hint: 'The subjects, skills and activities you spend time on, and roughly how much.',
    placeholder: 'Competition math about 5 hours a week, violin every day, and I just started learning Python.',
  },
  done: {
    label: "What have you already done?",
    hint: 'Scores, results, awards, courses, projects. Numbers help a lot.',
    placeholder: 'Qualified for AIME last year with a score of 7. Grade 8 violin. Built a Discord bot.',
  },
  improve: {
    label: 'How do you want to improve?',
    hint: 'What you want to get better at, and by when if you know.',
    placeholder: 'Get to USACO Gold by March and score 10+ on AIME next year.',
  },
};

export const EMPTY_ANSWERS: Answers = { describe: '', doing: '', done: '', improve: '' };

const words = (text: string) =>
  String(text || '').split(/\s+/).filter((token) => /[A-Za-z0-9]/.test(token)).length;

export function backgroundDetail(answers: Partial<Record<string, string>>): Detail {
  const texts = QUESTION_KEYS.map((key) => String(answers?.[key] ?? ''));
  const total = texts.reduce((sum, text) => sum + words(text), 0);
  const answered = texts.filter((text) => words(text) >= RULE.answered_words).length;
  const level = RULE.levels.find((band) => total >= band.words && answered >= band.answered)!;
  return {
    words: total,
    answered,
    level: level.key as DetailLevel,
    label: level.label,
    head_start: level.head_start,
  };
}

/** The next band up from `detail`, or null at the top. */
export function nextBand(detail: Detail): { label: string; words: number; answered: number; head_start: number } | null {
  const at = RULE.levels.findIndex((band) => band.key === detail.level);
  return at > 0 ? RULE.levels[at - 1]! : null;
}
