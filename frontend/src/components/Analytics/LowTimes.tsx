/**
 * Low activity and low energy: when they happened, on the Insights tab.
 *
 * Two panels side by side, each with the same three parts: which part of the
 * day, which weekday, and the latest ones with their date and time. Every
 * number comes from `low_times` in backend/tracking/mood.py, which says what
 * counts as each.
 */
import type { LowMark, LowTimes } from '@/services/said';
import { Panel, PanelNote } from './charts';
import { Suggestion } from './Suggestion';

const DAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const CLOCK = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

const WEEKDAY_NAME: Record<string, string> = {
  Mon: 'Mondays', Tue: 'Tuesdays', Wed: 'Wednesdays', Thu: 'Thursdays', Fri: 'Fridays', Sat: 'Saturdays', Sun: 'Sundays',
};

function when(mark: LowMark) {
  const day = DAY.format(new Date(`${mark.day}T12:00:00`));
  if (!mark.time) return day;
  const at = new Date(`${mark.day}T${mark.time}:00`);
  return Number.isNaN(at.getTime()) ? day : `${day}, ${CLOCK.format(at)}`;
}

function Bars({ title, rows, worst }: {
  title: string;
  rows: Array<{ name: string; size: number; value: string }>;
  worst: string | null;
}) {
  const top = Math.max(...rows.map((row) => row.size), 1);
  return (
    <div className="ax-low-part">
      <span className="ax-sv-extra-label">{title}</span>
      <ul className="ax-low-bars">
        {rows.map((row) => (
          <li key={row.name} className={row.name === worst ? 'is-worst' : ''}>
            <span>{row.name}</span>
            <span className="ax-low-bar">
              <span style={{ width: `${(row.size / top) * 100}%` }} />
            </span>
            <b>{row.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

const LATEST_SHOWN = 4;

function Latest({ marks }: { marks: LowMark[] }) {
  if (marks.length === 0) return null;
  return (
    <div className="ax-low-part">
      <span className="ax-sv-extra-label">Latest</span>
      <ul className="ax-low-list">
        {marks.slice(0, LATEST_SHOWN).map((mark) => (
          <li key={`${mark.day}${mark.time}${mark.label}${mark.detail}`}>
            <time dateTime={mark.day}>{when(mark)}</time>
            <span>
              <b>{mark.label}.</b> {mark.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The one sentence on top: the worst part of the day and weekday, if clear. */
function lead(part: string | null, day: string | null, what: string) {
  const bits = [
    part ? `in the ${part.toLowerCase()}` : '',
    day ? `on ${WEEKDAY_NAME[day] ?? day}` : '',
  ].filter(Boolean);
  return bits.length ? `${what} ${bits.join(' and ')}.` : '';
}

/**
 * Where it happens, as a phrase. Null when no time or day stands out.
 *
 * The worst time of day and the worst weekday are counted apart, so this keeps
 * them apart too. "Afternoons on Fridays" would claim a slot nobody measured.
 */
function slot(part: string | null, day: string | null): string | null {
  const bits = [
    part ? `in the ${part.toLowerCase()}` : '',
    day ? `on ${WEEKDAY_NAME[day] ?? day}` : '',
  ].filter(Boolean);
  return bits.length ? bits.join(' and ') : null;
}

/* When energy and output drop at the same time of day, the plan is probably
   asking for hard work when there's no energy for it, which is a different
   fix from either one on its own. */
function energyNext(energy: LowTimes['energy'], output: LowTimes['output']): string | null {
  const where = slot(energy.worst_part, energy.worst_day);
  if (!where) return null;
  if (energy.worst_part && energy.worst_part === output.worst_part) {
    return `Your energy and your work drop at the same time, which may mean your plan is asking too much ${slot(energy.worst_part, null)}. Move your hardest task out of it, and keep something easy there.`;
  }
  return `This may mean ${where} is a poor time for your hardest work. Try keeping something easy ready and see if it helps.`;
}

function outputNext(output: LowTimes['output']): string | null {
  const where = slot(output.worst_part, output.worst_day);
  if (!where) return null;
  return `This may mean your plan doesn't fit how you work ${where}, though it can't say why. Move your hardest task out of that time for a week, and see if your ratings change.`;
}

export function LowTimesPanel({ low, windowDays }: { low: LowTimes; windowDays: number }) {
  const { energy, output } = low;
  const energyAdvice = energyNext(energy, output);
  const outputAdvice = outputNext(output);
  const energyLead = lead(energy.worst_part, energy.worst_day, 'Low energy hits most');
  const outputLead = lead(output.worst_part, output.worst_day, 'Work slows down most');

  return (
    <div className={energy.count > 0 ? 'ax-grid ax-grid-halves-even' : undefined}>
      {energy.count > 0 && (
        <Panel
          title="Low energy"
          note={`${energy.count} ${energy.count === 1 ? 'time' : 'times'} in the last ${windowDays} days.`}
          footer={
            <PanelNote label="What counts">
              <ul className="ax-sv-rules">
                <li>You tapped Drained on the Log page.</li>
                <li>You wrote that you were tired and didn't tap an energy level.</li>
                <li>You picked Low energy when you rated a task.</li>
              </ul>
            </PanelNote>
          }
        >
                      {energyLead && <p className="ax-low-lead">{energyLead}</p>}
              {energyAdvice && <Suggestion text={energyAdvice} />}
              <Bars
                title="Time of day"
                worst={energy.worst_part}
                rows={energy.parts.map((row) => ({ name: row.name, size: row.count, value: String(row.count) }))}
              />
              <Bars
                title="Day of the week"
                worst={energy.worst_day}
                rows={energy.weekdays.map((row) => ({ name: row.name, size: row.count, value: String(row.count) }))}
              />
              <Latest marks={energy.latest} />
        </Panel>
      )}

      <Panel
        title="Low activity"
        note={`${output.slow_days} slow ${output.slow_days === 1 ? 'day' : 'days'} and ${output.low_rated} low-rated ${
          output.low_rated === 1 ? 'task' : 'tasks'
        } in the last ${windowDays} days.`}
        footer={
          <PanelNote label="What counts">
            <ul className="ax-sv-rules">
              <li>A slow day is a day under half your usual number of tasks.</li>
              <li>A low-rated task is study work you rated 1 or 2 out of 5.</li>
              <li>You wrote something like "got nothing done" in the Log.</li>
              <li>Time of day shows the share of rated tasks that were rated low.</li>
            </ul>
          </PanelNote>
        }
      >
        {output.count === 0 ? (
          <p className="ax-low-empty">Nothing yet. No slow days or low ratings so far.</p>
        ) : (
          <>
            {outputLead && <p className="ax-low-lead">{outputLead}</p>}
            {outputAdvice && <Suggestion text={outputAdvice} />}
            <Bars
              title="Time of day"
              worst={output.worst_part}
              rows={output.parts.map((row) => ({
                name: row.name,
                size: row.share,
                value: row.rated ? `${row.share}% rated low` : 'No ratings',
              }))}
            />
            <Bars
              title="Slow days by weekday"
              worst={output.worst_day}
              rows={output.weekdays.map((row) => ({
                name: row.name,
                size: row.of ? row.count / row.of : 0,
                value: `${row.count} of ${row.of}`,
              }))}
            />
            <Latest marks={output.latest} />
          </>
        )}
      </Panel>
    </div>
  );
}
