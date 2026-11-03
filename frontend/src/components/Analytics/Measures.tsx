/**
 * Activity, output, progress, mastery: four questions, side by side, with no total.
 *
 * Every other number on this tab is built from XP, tasks and minutes, which only
 * say how much happened. Fifteen easy tasks a day can look better on all of them
 * than three hard ones that got somebody closer to a contest. This panel is where
 * the page stops treating those as the same thing. The server keeps the four apart
 * (backend/tracking/measures.py) and this lays them out.
 *
 * Its own request, like the goal forecast beside it, because it reads goals, records
 * and skill checks that the page's day series doesn't carry. It draws nothing until
 * it has answered, so a failed read costs one panel and not the tab.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel, PanelNote } from './charts';
import { Suggestion } from './Suggestion';
import { measures as readMeasures, type Measure, type Measures } from '@/services/measures';

function Mix({ rows }: { rows: NonNullable<Measure['mix']> }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) return null;
  return (
    <div className="ax-mx-mix">
      <div className="ax-mx-mix-bar" aria-hidden="true">
        {rows.map((row) =>
          row.count > 0 ? (
            <span key={row.key} className={`is-${row.key}`} style={{ flexGrow: row.count }} />
          ) : null,
        )}
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.key}>
            <i className={`is-${row.key}`} aria-hidden="true" />
            {row.label} <b>{row.count.toLocaleString('en-US')}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MeasureCard({ measure }: { measure: Measure }) {
  return (
    <li className={`ax-mx-card is-${measure.key}`}>
      <header>
        <h3>{measure.label}</h3>
        <span className="ax-mx-evidence">{measure.evidence}</span>
      </header>
      <p className="ax-mx-question">{measure.question}</p>
      <p className="ax-mx-figure">
        <strong>{measure.figure}</strong> <span>{measure.unit}</span>
      </p>
      <p className="ax-mx-change">{measure.change}</p>
      {measure.mix && <Mix rows={measure.mix} />}
      <ul className="ax-mx-lines">
        {measure.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <Suggestion text={measure.suggests} />
      {measure.to && measure.action && (
        <Link className="ax-btn ax-mx-action" to={measure.to}>
          {measure.action}
        </Link>
      )}
    </li>
  );
}

export function MeasuresPanel() {
  const [data, setData] = useState<Measures | null>(null);

  useEffect(() => {
    let live = true;
    readMeasures()
      .then((result) => {
        if (live && result.success) setData(result);
      })
      .catch(() => {
        /* The panel just stays away. Nothing else on the tab needs it. */
      });
    return () => {
      live = false;
    };
  }, []);

  if (!data) return null;
  const { reading } = data;

  return (
    <section id="measures" className="ax-section">
      <Panel
        title="Busy, or getting closer?"
        className="ax-mx"
        note={`The last ${data.days} days vs. the ${data.days} before. These are four different questions, so there's no total.`}
        footer={
          <PanelNote label="How these are kept apart">
            <ul className="ax-tips">
              <li>
                <b>Activity:</b> Everything you finished, plus days, focus and XP. XP and focus time only ever count here.
              </li>
              <li>
                <b>Output:</b> Study work that was hard and went well, or was scored and mostly right. Routines and things you attended don't count, however you rated them.
              </li>
              <li>
                <b>Progress:</b> Goals with a number or checkpoints where a checkpoint was finished, or a record tied to the goal set a new best. XP, streak, task and focus goals count activity, so they're left out.
              </li>
              <li>
                <b>Mastery:</b> Skill checks passed, new bests on records that measure how good you are, and problems right or wrong. Your own ratings are shown but never counted, since nothing can prove them wrong.
              </li>
            </ul>
          </PanelNote>
        }
      >
        <div className="ax-mx-reading">
          <p className="ax-mx-headline">{reading.headline}</p>
          <p className="ax-mx-figures">{reading.figures}</p>
          <Suggestion text={reading.suggests} />
          {reading.to && reading.action && (
            <Link className="ax-btn ax-mx-action" to={reading.to}>
              {reading.action}
            </Link>
          )}
        </div>
        <ul className="ax-mx-grid">
          {data.measures.map((measure) => (
            <MeasureCard key={measure.key} measure={measure} />
          ))}
        </ul>
      </Panel>
    </section>
  );
}
