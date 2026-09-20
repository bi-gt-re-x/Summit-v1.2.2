/**
 * The skill model, on the page.
 *
 * `utils/skillScore` decides the numbers and `utils/skillFindings` decides the
 * sentences; this file only draws them. The split is the one the rest of the
 * page keeps — the thing that decides is testable without a browser, and the
 * thing that draws has no opinions.
 *
 * ## Six pieces, six tabs
 *
 * The ask was for this on every tab but Goals, and the wrong way to do that is
 * one panel repeated six times. Each tab asks a different question and gets the
 * part of the model that answers it:
 *
 *   Overview         where you stand, in four figures
 *   Subjects         every subject scored, with "why is it this number?"
 *   Growth           the six parts of your strongest subject, as a web
 *   Habits           what has gone cold, and how long ago
 *   Insights         the sentences — what the record says about your skills
 *   Recommendations  the part holding each subject back, worst first
 *
 * A reader moving between tabs should meet the same model from six angles, not
 * the same panel six times.
 */
import { useState } from 'react';
import { Panel, Radar } from './charts';
import { StatRow, type Stat } from './StatRow';
import { PART_WEIGHTS, explainSkill, type SkillRow } from '@/utils/skillScore';
import type { SkillFinding } from '@/utils/skillFindings';

/** The band a score falls in, as the class that colours it. */
const bandClass = (row: SkillRow) => `is-${row.band.toLowerCase()}`;

/** Shared empty state: a scored subject needs rated work and nothing else. */
function NoSkills({ title }: { title: string }) {
  return (
    <Panel title={title}>
      <p className="ax-empty">
        Rate a few finished tasks and this fills in. A subject is scored on how the work
        went, so an unrated record has nothing to read.
      </p>
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Overview — where you stand
// --------------------------------------------------------------------------
export function SkillStandingRow({
  rows,
  nameOf,
}: {
  rows: SkillRow[];
  nameOf: (id: string) => string;
}) {
  if (rows.length === 0) return null;

  const best = rows[0]!;
  const mean = Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length);
  const climbing = rows.filter((row) => (row.trend ?? 0) > 0).length;
  const cold = rows.filter((row) => (row.daysSince ?? 0) >= 14).length;

  const stats: Stat[] = [
    {
      key: 'best',
      label: 'Strongest subject',
      value: nameOf(best.subject),
      tone: 'violet',
      note: `${best.score} — ${best.band}`,
    },
    {
      key: 'mean',
      label: 'Skill average',
      value: String(mean),
      tone: 'blue',
      note: `across ${rows.length} scored ${rows.length === 1 ? 'subject' : 'subjects'}`,
    },
    {
      key: 'climbing',
      label: 'Climbing',
      value: String(climbing),
      tone: 'green',
      note: 'better this month than before it',
    },
    {
      key: 'cold',
      label: 'Gone quiet',
      value: String(cold),
      tone: 'amber',
      note: 'nothing finished in a fortnight',
    },
  ];
  return <StatRow stats={stats} />;
}

// --------------------------------------------------------------------------
// Subjects — the scored list, and why each is what it is
// --------------------------------------------------------------------------
/**
 * One subject, as a disclosure inside a disclosure.
 *
 * ## Two levels, and why each is shut
 *
 * The **subject** is shut because eight subjects open at once is eight sets of
 * six bars — fifty-four rows of chart for a reader who came to see where they
 * stand. Shut, the row is the three things that answer that: the name, the
 * number and the band. That is the list; everything else is the argument for
 * it.
 *
 * The **working** inside it is shut for the same reason one level down. The
 * six parts say *what* the score is made of and are worth meeting on the way
 * in; the two sentences and the evidence table say *why*, which is a question
 * a reader asks about one subject at a time.
 *
 * Neither is hidden. A number nobody can interrogate is a number nobody should
 * trust, and that is the whole complaint against the lattice percentages this
 * replaces — so the path from "78" to the eighteen tasks behind it is two
 * clicks and no navigation.
 */
function SkillCard({ row, nameOf }: { row: SkillRow; nameOf: (id: string) => string }) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState(false);
  const explained = explainSkill(row, nameOf);
  const name = nameOf(row.subject);

  return (
    <li className={`ax-skill-card ${bandClass(row)}${open ? ' is-open' : ''}`}>
      {/* The whole head is the control, so the row reads as a thing you open
          rather than as a label with a chevron parked at the end of it. */}
      <button
        type="button"
        className="ax-skill-head"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <span className="ax-skill-name">{name}</span>
        <span className="ax-skill-score">{row.score}</span>
        <span className="ax-skill-band">{row.band}</span>
        <span className="ax-skill-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="ax-skill-open">
          <ul className="ax-skill-parts" aria-label={`What makes up ${name}`}>
            {PART_WEIGHTS.map((part) => (
              <li key={part.key}>
                <span className="ax-skill-part-label">{part.label}</span>
                <span className="ax-skill-part-track">
                  <i style={{ width: `${Math.round(row.parts[part.key])}%` }} />
                </span>
                <span className="ax-skill-part-value">{Math.round(row.parts[part.key])}</span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="ax-skill-why-toggle"
            aria-expanded={why}
            onClick={() => setWhy((was) => !was)}
          >
            {why ? 'Hide the working' : `Why ${row.score}?`}
          </button>

          {why && (
            <div className="ax-skill-why">
              <p>{explained.lifting}</p>
              <p>{explained.limiting}</p>
              <dl className="ax-skill-evidence">
                {explained.evidence.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
              {explained.caveat && <p className="ax-skill-caveat">{explained.caveat}</p>}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function SkillScorePanel({
  rows,
  nameOf,
  limit = 8,
}: {
  rows: SkillRow[];
  nameOf: (id: string) => string;
  limit?: number;
}) {
  if (rows.length === 0) return <NoSkills title="Skill level by subject" />;

  return (
    <Panel title="Skill level by subject" note="Scored from your own ratings, not from the lattice">
      <p className="ax-muted ax-skill-lead">
        Every score is worked out from the tasks you rated — accuracy, difficulty,
        consistency, recent form, delivery and how recently you were in it. Open a subject
        for the six parts, and the working behind them.
      </p>
      <ul className="ax-skill-list">
        {rows.slice(0, limit).map((row) => (
          <SkillCard key={row.subject} row={row} nameOf={nameOf} />
        ))}
      </ul>
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Growth — the shape of one skill
// --------------------------------------------------------------------------
/**
 * The strongest subject's six parts as a web.
 *
 * A radar is readable only when the axes are few, named and comparable, which
 * is exactly what the six parts are — and the shape says in one glance what
 * six bars say in six: whether a skill is even, or tall on one axis and flat
 * on another. The legend beside it carries the real numbers, because a
 * polygon is a shape and not a reading.
 */
export function SkillShapePanel({
  rows,
  nameOf,
}: {
  rows: SkillRow[];
  nameOf: (id: string) => string;
}) {
  if (rows.length === 0) return <NoSkills title="The shape of a skill" />;

  const row = rows[0]!;
  return (
    <Panel
      title="The shape of a skill"
      note={`${nameOf(row.subject)} — your strongest, at ${row.score}`}
    >
      <div className="ax-skill-shape">
        <Radar
          axes={PART_WEIGHTS.map((part) => ({
            label: part.label,
            value: row.parts[part.key] / 100,
          }))}
          tone="violet"
          label={`The six parts of ${nameOf(row.subject)}`}
        />
        <ul className="ax-skill-shape-key">
          {PART_WEIGHTS.map((part) => (
            <li key={part.key}>
              <span>{part.label}</span>
              <strong>{Math.round(row.parts[part.key])}</strong>
              <small>{Math.round(part.weight * 100)}% of the score</small>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Habits — what has gone cold
// --------------------------------------------------------------------------
export function SkillColdPanel({
  rows,
  nameOf,
}: {
  rows: SkillRow[];
  nameOf: (id: string) => string;
}) {
  const cold = rows
    .filter((row) => (row.daysSince ?? 0) >= 7)
    .sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0))
    .slice(0, 6);

  if (rows.length === 0) return <NoSkills title="What has gone quiet" />;
  if (cold.length === 0) {
    return (
      <Panel title="What has gone quiet">
        <p className="ax-empty">
          Nothing has been left for a week. Every subject you have scored has had work in
          it recently.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="What has gone quiet" note="Scored subjects with nothing finished lately">
      <ul className="ax-skill-cold">
        {cold.map((row) => (
          <li key={row.subject}>
            <span className="ax-skill-cold-name">{nameOf(row.subject)}</span>
            <span className="ax-skill-cold-bar">
              {/* Full at COLD_DAYS, which is where retention is spent. */}
              <i style={{ width: `${Math.min(100, ((row.daysSince ?? 0) / 60) * 100)}%` }} />
            </span>
            <span className="ax-skill-cold-days">{row.daysSince}d</span>
            <span className="ax-skill-cold-score">{row.score}</span>
          </li>
        ))}
      </ul>
      <p className="ax-muted ax-goal-foot">
        Retention is 5% of a skill score and it is the part that moves on its own. A
        subject left for two months has spent all of it.
      </p>
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Insights — the sentences
// --------------------------------------------------------------------------
export function SkillFindingsPanel({ findings }: { findings: SkillFinding[] }) {
  if (findings.length === 0) {
    return (
      <Panel title="What your skills say">
        <p className="ax-empty">
          Nothing stands out across your subjects — no slips, no ceilings and nothing left
          to go cold. That is the common case and not a gap.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="What your skills say" note="Read off the scores, with the figures behind them">
      <ul className="ax-skill-findings">
        {findings.map((finding) => (
          <li key={finding.id} className={`is-${finding.tone}`}>
            {finding.text}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Recommendations — the part holding each back
// --------------------------------------------------------------------------
/**
 * The weakest of the six, per subject, worst first.
 *
 * This is the one panel of the six that is allowed to be actionable, because
 * it is on the tab whose whole job is what to do next. The findings on the
 * Insights tab deliberately stop at stating the case.
 */
export function SkillLimitPanel({
  rows,
  nameOf,
  limit = 5,
}: {
  rows: SkillRow[];
  nameOf: (id: string) => string;
  limit?: number;
}) {
  if (rows.length === 0) return <NoSkills title="What is holding each subject back" />;

  const limits = rows
    .map((row) => {
      const worst = PART_WEIGHTS.map((part) => ({ ...part, value: row.parts[part.key] })).reduce(
        (a, b) => (b.value < a.value ? b : a),
      );
      return { row, worst };
    })
    .filter((entry) => entry.worst.value < 65)
    .sort((a, b) => a.worst.value - b.worst.value)
    .slice(0, limit);

  if (limits.length === 0) {
    return (
      <Panel title="What is holding each subject back">
        <p className="ax-empty">
          No subject has a part under 65. There is nothing here worth singling out.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="What is holding each subject back"
      note="The weakest of the six parts, per subject"
    >
      <ul className="ax-skill-limits">
        {limits.map(({ row, worst }) => (
          <li key={row.subject}>
            <div className="ax-skill-limit-head">
              <span className="ax-skill-limit-name">{nameOf(row.subject)}</span>
              <span className="ax-skill-limit-score">{row.score}</span>
            </div>
            <p className="ax-skill-limit-text">
              <strong>{worst.label}</strong> at {Math.round(worst.value)} is the lowest of its
              six — worth {Math.round(worst.weight * 100)}% of the score, so moving it moves
              the number.
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
