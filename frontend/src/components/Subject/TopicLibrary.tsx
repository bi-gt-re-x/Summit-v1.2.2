/**
 * Topics: this subject's finished tasks filed by area and topic, from their
 * names, and how each topic rates against the rest of the subject.
 *
 * The filing and the scoring are backend/tracking/topics.py; this draws the
 * subject's slice of the library (services/topics). Areas run biggest first,
 * each with its topics weakest first, and the work that names an area but no
 * topic ("Linear algebra exercises") as the area's last line. A row says
 * which goals it feeds, so "this is weak" and "this is what the goal needs"
 * read together.
 */
import { useMemo, useState } from 'react';
import type { TopicLibrary as Library, TopicRow, TopicStatus } from '@/services/topics';

const STATUS: Record<TopicStatus, string> = {
  weak: 'Weak',
  steady: 'Steady',
  strong: 'Strong',
  untested: 'Too few',
  unknown: 'Not sorted',
};

/** How many areas show before "Show all". */
const AREAS = 4;

interface Area {
  key: string;
  label: string;
  tasks: number;
  rows: TopicRow[];
}

function rating(row: TopicRow) {
  if (row.execution === null) return '';
  return `${row.execution.toFixed(1)} / 5`;
}

export function TopicLibrary({
  library,
  goalTitles,
  busy,
}: {
  library: Library;
  /** Goal id → title, for the goals a row feeds. */
  goalTitles: Record<string, string>;
  busy: boolean;
}) {
  const [all, setAll] = useState(false);

  const areas = useMemo(() => {
    const byArea = new Map<string, Area>();
    for (const row of library.rows) {
      if (!row.subsubject) continue;
      const area = byArea.get(row.subsubject) ?? { key: row.subsubject, label: row.subsubject_label, tasks: 0, rows: [] };
      area.tasks += row.tasks;
      area.rows.push(row);
      byArea.set(row.subsubject, area);
    }
    const order: Record<TopicStatus, number> = { weak: 0, steady: 1, strong: 2, untested: 3, unknown: 4 };
    for (const area of byArea.values()) {
      area.rows.sort(
        (a, b) =>
          Number(a.topic === '') - Number(b.topic === '') ||
          order[a.status] - order[b.status] ||
          (a.gap ?? 0) - (b.gap ?? 0) ||
          b.tasks - a.tasks,
      );
    }
    return [...byArea.values()].sort((a, b) => b.tasks - a.tasks);
  }, [library.rows]);

  if (areas.length === 0) return null;
  const shown = all ? areas : areas.slice(0, AREAS);
  const named = library.rows.reduce((sum, row) => sum + (row.topic ? row.tasks : 0), 0);
  // An example name from this subject's own topics, like "Calculus: integrals".
  const sample = [...library.rows].filter((row) => row.topic).sort((a, b) => b.tasks - a.tasks)[0];
  const example = sample ? `${sample.subsubject_label}: ${sample.label.toLowerCase()}` : 'Calculus: integrals';
  const base = library.rows.find((row) => row.base !== null)?.base ?? null;

  return (
    <section className="ax-panel sb-panel stl-panel" aria-label="Topics">
      <div className="ax-panel-head">
        <div className="ax-panel-title">
          <h2>Topics</h2>
        </div>
        {busy && <span className="stl-busy">Updating…</span>}
      </div>
      <p className="ax-panel-note">
        Read from your task names. {named.toLocaleString('en-US')} of {library.total.toLocaleString('en-US')} tasks
        here name a topic, and {library.filed.toLocaleString('en-US')} at least name the area or contest.
        {base !== null && ` Each topic is rated against your ${base.toFixed(1)} average here.`}
        {named < library.total && ` Name the topic in a task, like "${example}", and it lands in the right place.`}
      </p>

      <div className="stl-areas">
        {shown.map((area) => (
          <div key={area.key} className="stl-area">
            <h3 className="stl-area-head">
              <span>{area.label}</span>
              <small>{area.tasks.toLocaleString('en-US')} tasks</small>
            </h3>
            <ul className="stl-rows">
              {area.rows.map((row) => (
                <li
                  key={row.topic || 'area'}
                  className={`stl-row is-${row.topic ? row.status : 'area'}`}
                  title={row.examples.length ? `Like: ${row.examples.join(', ')}` : undefined}
                >
                  <span className="stl-name">
                    {row.topic ? row.label : 'Topic not named'}
                    {row.under && row.under !== row.label && <small>{row.under}</small>}
                  </span>
                  <span className="stl-goals">
                    {row.goal_ids
                      .map((id) => goalTitles[id])
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((title) => (
                        <span key={title} className="stl-goal">
                          {title}
                        </span>
                      ))}
                  </span>
                  <span className="stl-count">{row.tasks.toLocaleString('en-US')}</span>
                  <span className="stl-rating">{rating(row)}</span>
                  <span className="stl-status">{row.topic ? STATUS[row.status] : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {areas.length > AREAS && (
        <button type="button" className="stl-more" onClick={() => setAll((open) => !open)}>
          {all ? 'Show fewer' : `Show all ${areas.length} areas`}
        </button>
      )}
    </section>
  );
}
