/**
 * One test, drawn: what's being tried, how far along it is, and what it shows.
 *
 * Running, it's a progress bar and the reading so far. Done, it's the verdict in big
 * letters, the two groups as bars, and the buttons to keep the change or drop it.
 * The verdicts and their wording are backend/tracking/experiments.py.
 */
import type { Bars, Experiment as Test } from '@/services/experiments';

const MARK: Record<Test['tone'], string> = { good: '✓', bad: '✕', flat: '•' };

/** "How your sessions rate" inside a sentence, keeping quoted words as they are. */
export const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

export function TestBars({ chart }: { chart: Bars }) {
  const top = Math.max(chart.max, ...chart.rows.map((row) => row.value), 1);
  return (
    <div className="rv-bars" role="img" aria-label={chart.rows.map((row) => `${row.label} ${row.text ?? row.value}`).join(', ')}>
      {chart.rows.map((row, at) => (
        <div key={row.label} className="rv-bar-row">
          <span className="rv-bar-label">
            {row.label}
            {row.n !== undefined && <small> · {row.n}</small>}
          </span>
          <span className="rv-bar">
            <span className={at === chart.rows.length - 1 ? 'is-new' : 'is-old'} style={{ width: `${(row.value / top) * 100}%` }} />
          </span>
          <b>{row.text ?? row.value}</b>
        </div>
      ))}
    </div>
  );
}

function Adherence({ done, of }: { done: number; of: number }) {
  if (of === 0) return null;
  const dots = of <= 28;
  return (
    <div className="rv-adherence">
      <span className="rv-small">
        <b>{done}</b> of {of} sessions done the new way
      </span>
      {dots && (
        <span className="rv-dots" aria-hidden="true">
          {Array.from({ length: of }, (_, at) => (
            <i key={at} className={at < done ? 'is-on' : undefined} />
          ))}
        </span>
      )}
    </div>
  );
}

function sure(label: string): string {
  if (/prelim/i.test(label)) return 'Early sign';
  if (/emerg/i.test(label)) return 'Emerging';
  if (/reliable/i.test(label)) return 'Likely';
  return label;
}

export function ExperimentCard({
  test,
  busy,
  onKeep,
  onDrop,
  onExtend,
  onStop,
}: {
  test: Test;
  busy?: boolean;
  onKeep?: () => void;
  onDrop?: () => void;
  onExtend?: () => void;
  onStop?: () => void;
}) {
  const running = test.phase === 'running';
  const leaning = test.verdict === 'leaning_better' || test.verdict === 'leaning_worse';
  const percent = Math.round((test.days_done / Math.max(1, test.days_total)) * 100);

  return (
    <article className={`rv-test is-${test.phase} is-${test.tone}`}>
      <div className="rv-test-head">
        <span className="rv-kicker">{running ? 'Testing' : test.phase === 'ready' ? 'Test done' : 'Tested'}</span>
        <span className="rv-scope">{test.scope}</span>
      </div>
      <h3 className="rv-test-title">{test.title}</h3>
      {test.how && running && <p className="rv-small">{test.how}</p>}

      {running && (
        <div className="rv-progress" role="img" aria-label={`Day ${test.days_done} of ${test.days_total}`}>
          <span className="rv-bar">
            <span className="is-progress" style={{ width: `${percent}%` }} />
          </span>
          <span className="rv-small">
            Day <b>{test.days_done}</b> of {test.days_total} · ends {test.ends_label}
          </span>
        </div>
      )}

      <div className={`rv-verdict is-${test.tone}`}>
        <span className="rv-verdict-mark" aria-hidden="true">
          {MARK[test.tone]}
        </span>
        <strong>{running && test.verdict !== 'early' ? `So far: ${test.headline.toLowerCase()}` : test.headline}</strong>
        {test.evidence && (
          <span className="rv-sure" title={`How sure: ${test.evidence.toLowerCase()}`}>
            {sure(test.evidence)}
          </span>
        )}
      </div>

      {test.chart && test.sessions > 0 && <TestBars chart={test.chart} />}
      {test.adherence && <Adherence done={test.adherence.done} of={test.adherence.of} />}
      <p className="rv-small rv-measure">Measured by: {lower(test.measure)}</p>
      {test.tip && <p className="rv-tip">→ {test.tip}</p>}

      {test.phase === 'ready' && (
        <div className="rv-actions">
          <button type="button" className="ax-btn ax-btn-primary" disabled={busy} onClick={onKeep}>
            Keep doing it
          </button>
          <button type="button" className="ax-btn" disabled={busy} onClick={onDrop}>
            Drop it
          </button>
          {(leaning || test.verdict === 'thin') && (
            <button type="button" className="ax-btn ax-btn-quiet" disabled={busy} onClick={onExtend}>
              Run another week
            </button>
          )}
        </div>
      )}
      {running && onStop && (
        <button type="button" className="rv-link" disabled={busy} onClick={onStop}>
          Stop this test
        </button>
      )}
      {test.phase === 'decided' && test.kept !== null && (
        <p className="rv-small">{test.kept ? 'You kept it.' : 'You dropped it.'}</p>
      )}
    </article>
  );
}
