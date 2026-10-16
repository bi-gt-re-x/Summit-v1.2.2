/**
 * The written report — the whole account, in sentences.
 *
 * Export used to hand back the day series as a CSV: the same rows the charts
 * were drawn from, unrounded, one line per day. That is the right export for
 * somebody who wants to do their own arithmetic, and the wrong one for almost
 * everybody else — a hundred rows of `xp_earned,tasks_completed,focus_minutes`
 * is the page's *input*, not its findings. A reader who has just spent five
 * minutes reading four tabs of analysis and presses Export should get the
 * analysis, not the raw material it was made from.
 *
 * So this builds a document. Plain text, because plain text opens on every
 * machine, pastes into anything, and cannot render wrong — and because the
 * thing being exported is words, and words do not need a file format.
 *
 * **The CSV is back, beside this rather than instead of it.** The paragraph
 * above is right about the default and was wrong to conclude there should only
 * be one file: this page assigns a person a score out of a hundred, a letter
 * grade and a percentile, and deleting the raw rows took away every route to
 * checking any of it. Prose for the reader who came to be told something, rows
 * for the one who wants to disagree. See utils/seriesCsv.
 *
 * ## What is in it, and in what order
 *
 *     The Growth Score          one number and its letter, at the top
 *     Overview                  what the window holds, and which way it moved
 *     Subject growth            where the effort went and whether it worked
 *     Insights                  the conditions the good work happens under
 *     Recommendations           what to change, and the plan for today
 *
 * Score first because it is the one thing a reader wants before they decide
 * whether to read the rest, and recommendations last because they only mean
 * anything once the four sections above have said why.
 *
 * ## Every section can be empty, and says so
 *
 * A new account has no patterns and may have no recommendations. Each builder
 * below returns its own "nothing yet, and here is why" line rather than being
 * skipped, because a report with a heading missing reads as a bug and a report
 * that says "no pattern clears the evidence bar yet" reads as an answer.
 *
 * ## Nothing here computes anything
 *
 * Every figure is passed in, already derived by the module that owns it —
 * utils/analyticalScore, utils/diagnosis, utils/patterns, utils/advice. This
 * file only decides how they read as English. A number that appears both on
 * screen and in the export is the same number by construction, which is the
 * whole reason the report takes so many arguments.
 */
import type { Advice } from './advice';
import type { AnalyticalScore } from './analyticalScore';
import { GRADE_MEANING, howItIsCalculated } from './analyticalScore';
import type { SubjectQuality } from './behaviour';
import type { Diagnosis } from './diagnosis';
import type { NextAction } from '@/services/next';
import type { Pattern } from './patterns';
import type { GrowthSummaryFigures, Insight } from './growthSummary';
import type { SubjectXpRow } from './subjectXp';

/** How many of each list the report carries. A report is not an archive. */
const TOP_ADVICE = 5;
const TOP_PATTERNS = 6;
const TOP_SUBJECTS = 8;

const RULE = '─'.repeat(66);

/** "+12%" / "−4%" / "" when there is nothing to compare against. */
function delta(value: number | null): string {
  if (value === null) return '';
  const sign = value >= 0 ? '+' : '−';
  return `(${sign}${Math.abs(Math.round(value))}% vs. the period before)`;
}

/** Wraps prose at a readable measure so the file looks composed in any editor. */
function wrap(text: string, width = 78, indent = ''): string {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  words.forEach((word) => {
    if (line && (line + ' ' + word).length > width - indent.length) {
      lines.push(indent + line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  });
  if (line) lines.push(indent + line);
  return lines.join('\n');
}

/** A section heading with its own rule under it. */
function heading(title: string): string {
  return `${title.toUpperCase()}\n${RULE}`;
}

/**
 * A bullet whose continuation lines line up under its first character.
 *
 * The marker is measured, not assumed: wrapping the text to the full width and
 * then prefixing "• " puts every bullet two characters past the measure the
 * paragraphs around it were wrapped to, which is visible as a ragged right edge
 * down the whole document.
 */
function bullet(text: string, marker = '•'): string {
  const pad = ' '.repeat(marker.length + 1);
  const body = wrap(text, 78 - pad.length, '').split('\n');
  return body.map((line, at) => (at === 0 ? `${marker} ${line}` : `${pad}${line}`)).join('\n');
}

export interface ReportInput {
  username: string;
  generatedAt: Date;
  /** The window the overview figures describe — "Last 30 days". */
  span: string;
  /** The recent window advice and patterns were drawn from, in days. */
  adviceDays: number;
  patternDays: number;

  score: AnalyticalScore;

  figures: GrowthSummaryFigures;
  insights: Insight[];
  streak: number;
  bankedXp: number;

  subjectRows: SubjectXpRow[];
  subjectQuality: SubjectQuality[];

  patterns: Pattern[];
  diagnoses: Diagnosis[];

  advice: Advice[];
  plan: NextAction[];
  planBudget: number;
}

// ---------------------------------------------------------------------------
// The sections
// ---------------------------------------------------------------------------

function scoreSection(input: ReportInput): string {
  const { score } = input;
  if (score.value === null || score.grade === null) {
    return [
      heading('Growth score'),
      '',
      wrap(
        'Not enough work to score yet. The score averages five parts, and each needs a few days of work.',
      ),
    ].join('\n');
  }

  const parts = score.parts
    .map((part) => {
      const label = part.label.padEnd(14);
      const figure = String(Math.round(part.score)).padStart(3);
      return `  ${label}${figure} / 100    ${part.raw}`;
    })
    .join('\n');

  return [
    heading('Growth score'),
    '',
    `                    ${(score.value / 10).toFixed(1)} / 10        Grade ${score.grade}`,
    '',
    wrap(`${score.grade} is ${GRADE_MEANING[score.grade]}.`),
    '',
    wrap(howItIsCalculated(score)),
    '',
    "The five parts it's made of:",
    '',
    parts,
    '',
    wrap(
      'Each part is scored out of 100. Your score is their average, out of 10. 9.0 is an A, 8.0 is a B, and so on. 9.6 to 9.9 is an A+. A perfect 10 is an S, and that needs all five parts maxed out.',
    ),
  ].join('\n');
}

function overviewSection(input: ReportInput): string {
  const { figures: f, insights, streak, bankedXp, span } = input;

  const lines = [
    heading('Overview'),
    '',
    wrap(`Time window: ${span}.`),
    '',
    `  Total XP            ${f.xp.value.toLocaleString()}${delta(f.xp.delta)}`,
    `  Tasks finished      ${f.tasks.value.toLocaleString()}${delta(f.tasks.delta)}`,
    `  XP per day          ${f.xpPerDay.value.toLocaleString()}${delta(f.xpPerDay.delta)}`,
    `  Focus time          ${f.focusHours.value.toLocaleString()} hours${delta(f.focusHours.delta)}`,
    `Days worked ${f.consistency.value}% of days${delta(f.consistency.delta)}`,
    `  Current streak      ${streak} ${streak === 1 ? 'day' : 'days'}`,
    `All-time XP ${bankedXp.toLocaleString()}`,
    '',
  ];

  if (f.ratedTasks > 0) {
    lines.push(
      wrap(
        `You rated ${f.ratedTasks} of ${f.finishedTasks} finished tasks. Your average is ${f.quality.value} out of 25 (how hard times how well).`,
      ),
      '',
    );
  } else if (f.finishedTasks > 0) {
    lines.push(
      wrap(
        `You didn't rate any of your ${f.finishedTasks} finished tasks here, so quality uses XP per task instead.`,
      ),
      '',
    );
  }

  if (insights.length > 0) {
    lines.push('Highlights:', '');
    insights.slice(0, 5).forEach((row) => {
      lines.push(bullet(`${row.headline}${/[.!?]$/.test(row.headline) ? '' : '.'} ${row.hint}`), '');
    });
  }

  return lines.join('\n').trimEnd();
}

function subjectSection(input: ReportInput): string {
  const { subjectRows, subjectQuality } = input;
  const lines = [heading('Subject growth'), ''];

  if (subjectRows.length === 0) {
    lines.push(
      wrap(
        "No tasks here have a subject, so there's nothing to split up. Add subjects to your tasks to see what you're getting better at.",
      ),
    );
    return lines.join('\n');
  }

  const total = subjectRows.reduce((sum, row) => sum + row.xp, 0) || 1;

  lines.push('Where your work went:', '');
  subjectRows.slice(0, TOP_SUBJECTS).forEach((row) => {
    const share = Math.round((row.xp / total) * 100);
    const name = (row.name ?? row.label).padEnd(18);
    lines.push(
      `  ${name}${String(share).padStart(3)}%   ${row.xp.toLocaleString()} XP over ${row.count} ${row.count === 1 ? 'task' : 'tasks'}`,
    );
  });
  lines.push('');

  /* The second half is the question the XP split cannot answer: whether the
     hours worked. A subject can hold half the week and be the one going worst,
     which is exactly the finding neither a share nor a count can produce. */
  const rated = subjectQuality.filter((row) => row.execution !== null);
  if (rated.length > 0) {
    lines.push('How each one is going, by your ratings:', '');
    [...rated]
      .sort((a, b) => (b.execution ?? 0) - (a.execution ?? 0))
      .forEach((row) => {
        const move =
          row.movement === null || Math.abs(row.movement) < 0.2
            ? 'holding steady'
            : row.movement > 0
              ? `up ${row.movement.toFixed(1)}`
              : `down ${Math.abs(row.movement).toFixed(1)}`;
        lines.push(
          bullet(
            `${row.name}: ${row.execution!.toFixed(1)} out of 5 for how it went, over ${row.rated} rated ${row.rated === 1 ? 'task' : 'tasks'}. ${move.charAt(0).toUpperCase()}${move.slice(1)}.`,
          ),
          '',
        );
      });
  }

  const dropped = subjectQuality.filter(
    (row) => row.lifetimeDone >= 5 && row.sinceDays !== null && row.sinceDays >= 21,
  );
  if (dropped.length > 0) {
    lines.push('Gone quiet:', '');
    dropped.forEach((row) => {
      lines.push(
        bullet(
          `No ${row.name} in ${row.sinceDays} days, after ${row.lifetimeDone} finished tasks.`,
        ),
        '',
      );
    });
  }

  return lines.join('\n').trimEnd();
}

function insightSection(input: ReportInput): string {
  const { patterns, patternDays } = input;
  const lines = [heading('Insights'), ''];

  if (patterns.length === 0) {
    lines.push(
      wrap(
        `No patterns in the last ${patternDays} days. A pattern needs 6+ tasks on each side and a 10% gap. The bar is high so luck can't fake one.`,
      ),
    );
    return lines.join('\n');
  }

  lines.push(
    wrap(
      `Differences between two groups of your tasks over the last ${patternDays} days. These go together, but that doesn't prove a cause. Test them before you trust them.`,
    ),
    '',
  );

  patterns.slice(0, TOP_PATTERNS).forEach((row) => {
    lines.push(bullet(row.text));
    lines.push(wrap(`Based on: ${row.basis} How sure: ${row.strength}.`, 78, '  '));
    if (row.soWhat) lines.push(wrap(`Worth trying: ${row.soWhat}`, 78, '  '));
    lines.push('');
  });

  return lines.join('\n').trimEnd();
}

function recommendationSection(input: ReportInput): string {
  const { advice, diagnoses, plan, planBudget, adviceDays } = input;
  const lines = [heading('Recommendations'), ''];

  lines.push(
    wrap(
      `From your last ${adviceDays} days, since this week's changes should come from recent work.`,
    ),
    '',
  );

  if (diagnoses.length > 0) {
    lines.push('Your last two weeks:', '');
    diagnoses.slice(0, 3).forEach((row) => {
      lines.push(bullet(row.headline));
      lines.push(wrap(row.detail, 78, '  '));
      row.points.forEach((point) => lines.push(wrap(`- ${point}`, 78, '  ')));
      lines.push(wrap(`Do: ${row.action}`, 78, '  '));
      lines.push(wrap(`Watch: ${row.watch}`, 78, '  '));
      lines.push('');
    });
  }

  if (advice.length > 0) {
    lines.push('What to change, best first:', '');
    advice.slice(0, TOP_ADVICE).forEach((row, at) => {
      const worth = row.impact > 0 ? ` Worth about ${row.impact.toLocaleString()} XP a year.` : '';
      lines.push(bullet(`${row.title} (${row.category}).`, `${at + 1}.`));
      lines.push(wrap(row.because, 78, '   '));
      lines.push(wrap(`Do: ${row.action}${worth}`, 78, '   '));
      lines.push(wrap(`Based on: ${row.evidence}`, 78, '   '));
      lines.push('');
    });
  } else {
    lines.push(
      wrap(
        'Nothing to change. No long gaps, no dead weekends and no subject falling behind. Nice.',
      ),
      '',
    );
  }

  if (plan.length > 0) {
    lines.push(`  If you have ${planBudget} minutes today:`, '');
    plan.forEach((action) => {
      lines.push(bullet(`${action.title} (${action.minutes} min). ${action.because}`));
    });
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

/** The whole report, as one string ready to be written to a file. */
export function buildReport(input: ReportInput): string {
  const when = input.generatedAt.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const header = [
    RULE,
    'SUMMIT ANALYTICS REPORT',
    RULE,
    '',
    `  For       ${input.username}`,
    `  Written   ${when}`,
    `  Covering  ${input.span}`,
  ].join('\n');

  return [
    header,
    '',
    '',
    scoreSection(input),
    '',
    '',
    overviewSection(input),
    '',
    '',
    subjectSection(input),
    '',
    '',
    insightSection(input),
    '',
    '',
    recommendationSection(input),
    '',
    '',
    RULE,
    wrap(
      'Every number here comes from your own work. Nothing is guessed or compared with anyone else.',
    ),
    RULE,
    '',
  ].join('\n');
}

/** The filename the download lands under. */
export function reportFilename(username: string, at: Date): string {
  return `summit-report-${username}-${at.toISOString().slice(0, 10)}.txt`;
}
