/**
 * Records on the Analytics page: the breakdown on Overview, and the record
 * panels on Growth.
 *
 * ## Where the reading is done
 *
 * Not here. Every figure and every sentence comes from
 * `/api/records/analysis` (backend/tracking/record_reads.py), which reads each
 * record's name as the contest, skill tree and subject it is about, joins the
 * finished tasks on that contest or tree as the work behind it, and ties it to
 * the active goals whose own words name the same thing. The browser holds the
 * records but not the task names filed by topic, and doing that join here
 * would be a second, worse copy of the topic library. This file only lays the
 * answer out, and formats figures with the same `formatValue` the
 * Achievements page uses so a best reads the same in both places.
 *
 * ## Why Overview gets a breakdown and Growth gets the detail
 *
 * Overview answers "how am I doing", so it gets the shortest true answer:
 * how many records are improving, how many bests this window, where they are
 * moving, and the two or three findings that matter most. Growth answers "how
 * have I changed", so it gets the period (bests this window against the one
 * before), what the work in each area bought, and what the records are for.
 */
import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useApi, type UseApiResult } from '@/hooks';
import { records as recordService } from '@/services';
import type { AnalysedRecord, RecordAnalysis, RecordRead } from '@/services/records';
import { changeText, formatValue } from '@/utils/records';
import { Panel } from './charts';
import { windowOption, type WindowKey } from './data';

const MARK = { good: '↑', bad: '!', flat: '·' } as const;

/** The window's days for the read, kept to what the endpoint takes. */
export function recordDays(span: WindowKey): number {
  const days = windowOption(span).days ?? 730;
  return Math.max(7, Math.min(730, days));
}

/** "the last 90 days", "the last year". */
function windowText(days: number): string {
  if (days >= 730) return 'the last two years';
  if (days >= 365) return 'the last year';
  return `the last ${days} days`;
}

/**
 * The read for one window. Called once by the Analytics page, which holds its
 * first paint for it and hands it to Overview and Growth.
 */
export function useRecordAnalysis(span: WindowKey): RecordsRead {
  const days = recordDays(span);
  const call = useCallback(() => recordService.analysis(days), [days]);
  return useApi<RecordAnalysis>(call, [days]);
}

/** What the page hands down: the read, its loading flag and its error. */
export type RecordsRead = UseApiResult<RecordAnalysis>;

/** "22h", "40m". */
function hoursText(seconds: number): string {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  const value = seconds / 3600;
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10}h`;
}

/** One unit of a record in "about 2h per point" — PER in record_reads.py. */
const PER: Record<string, string> = {
  points: 'point', '': 'point', rating: 'rating point', problems: 'problem',
  level: 'level', days: 'day', lines: 'line',
};

const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? '-' : `${Math.round(value)}%`;

/** A record's change, in words for times and with a sign for the rest. */
const changeOf = (record: AnalysedRecord, amount: number) =>
  changeText(amount, record.unit, record.direction);

/** What the backend read a record as, said plainly. */
function readAs(record: AnalysedRecord): string {
  const parts = [record.context_label, record.tree_label, record.subject_name].filter(
    (part, i, all) => part && all.indexOf(part) === i,
  );
  return parts.join(' · ');
}

function Reads({ items }: { items: RecordRead[] }) {
  return (
    <ul className="ax-period-list ax-rx-reads">
      {items.map((item) => (
        <li key={item.id} className={`is-${item.tone === 'good' ? 'up' : item.tone === 'bad' ? 'down' : 'flat'}`}>
          <span className="ax-period-mark" aria-hidden="true">{MARK[item.tone]}</span>
          <span>
            <b>{item.title}.</b> {item.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The strongest `count` findings, one per record first: three lines about
 * the same record is one record's news, and Overview is about all of them.
 */
function spread(items: RecordRead[], count: number): RecordRead[] {
  const seen = new Set<string>();
  const first = items.filter((item) => {
    if (seen.has(item.record)) return false;
    seen.add(item.record);
    return true;
  });
  const rest = items.filter((item) => !first.includes(item));
  return [...first, ...rest].slice(0, count);
}

/** Nothing logged yet: what this would show, and where to start it. */
function NoRecords() {
  return (
    <p className="ax-empty">
      No records yet. Log a score, a time or a rating on{' '}
      <Link className="ax-link" to="/achievements">Achievements</Link> and this shows how each one is improving,
      what work it came from and which goals it counts toward.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
/**
 * Records and improvement, for Overview: five figures, a row per subject the
 * records were read under, and the strongest findings.
 */
export function RecordsBreakdownPanel({ read }: { read: RecordsRead }) {
  const data = read.data;
  if (!data) return read.loading ? <p className="ax-empty">Reading your records…</p> : null;

  const { summary } = data;
  const window = windowText(data.days);
  const widest = Math.max(1, ...data.by_subject.map((group) => group.median_percent ?? 0));
  const versus = summary.new_bests - summary.previous_bests;

  return (
    <Panel
      title="Records and improvement"
      note={`Your personal bests, read by subject, over ${window}`}
      aside={<Link className="ax-link" to="/achievements">Your records</Link>}
      className="ax-rx"
    >
      {summary.records === 0 ? (
        <NoRecords />
      ) : (
        <>
          <dl className="ax-gf-stats ax-rx-stats">
            <div>
              <dt>Records</dt>
              <dd>{summary.records}</dd>
            </div>
            <div>
              <dt>Improving</dt>
              <dd>
                {summary.improving}
                <small> of {summary.with_history}</small>
              </dd>
            </div>
            <div>
              <dt>New bests</dt>
              <dd>{summary.new_bests}</dd>
              {summary.new_bests + summary.previous_bests > 0 && (
                <span className={`ax-rx-vs${versus > 0 ? ' is-up' : versus < 0 ? ' is-down' : ''}`}>
                  {versus === 0 ? 'Same as' : `${versus > 0 ? '+' : '−'}${Math.abs(versus)} on`} the {data.days} days before
                </span>
              )}
            </div>
            {summary.median_percent !== null && (
              <div>
                <dt>Typical gain</dt>
                <dd>{pct(summary.median_percent)}</dd>
                <span className="ax-rx-vs">since each record's first entry</span>
              </div>
            )}
            {summary.stalled > 0 && (
              <div>
                <dt>Stalled</dt>
                <dd className="is-down">{summary.stalled}</dd>
                <span className="ax-rx-vs">no new best in 6+ weeks</span>
              </div>
            )}
          </dl>

          <ul className="ax-rx-subjects">
            {data.by_subject.map((group) => (
              <li key={group.key}>
                <div className="ax-rx-subject-head">
                  <strong>{group.label}</strong>
                  {!group.inferred && <em>your category</em>}
                  <span className="ax-rx-count">
                    {group.records} {group.records === 1 ? 'record' : 'records'}
                    {group.new_bests > 0 && ` · ${group.new_bests} new ${group.new_bests === 1 ? 'best' : 'bests'}`}
                  </span>
                </div>
                <div className="ax-rx-bar" role="presentation">
                  <i style={{ width: `${((group.median_percent ?? 0) / widest) * 100}%` }} />
                </div>
                <p className="ax-rx-subject-foot">
                  {group.top
                    ? <>Up {pct(group.median_percent)} typically. Biggest climb: <b>{group.top.name}</b>, {group.top.gain}.</>
                    : `${group.improving} of ${group.records} improving so far.`}
                  {group.window_seconds > 0 && ` ${hoursText(group.window_seconds)} of related work in ${window}.`}
                </p>
              </li>
            ))}
          </ul>

          {data.reads.length > 0 && (
            <>
              <h3 className="ax-tips-head">What stands out</h3>
              <Reads items={spread(data.reads, 3)} />
            </>
          )}
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------
/** Records whose best moved, or were logged, in the window, against the one before. */
function PeriodPanel({ data }: { data: RecordAnalysis }) {
  const window = windowText(data.days);
  const rows = data.records
    .filter((record) => record.window.logged > 0 || record.window.new_bests > 0)
    .slice(0, 8);

  return (
    <Panel
      title="Records this period"
      note={`Bests set in ${window}, against the ${data.days} days before`}
    >
      {rows.length === 0 ? (
        <p className="ax-empty">Nothing logged in {window}. Log a result on Achievements to see it here.</p>
      ) : (
        <ul className="ax-rx-rows">
          {rows.map((record) => {
            const { window: w } = record;
            const moved = w.gain !== null && w.gain > 0;
            const before = w.previous_gain;
            return (
              <li key={record.name}>
                <div className="ax-rx-row-head">
                  <strong>{record.name}</strong>
                  <span className={`ax-rx-move${moved || (w.started_in_window && record.gain > 0) ? ' is-up' : ''}`}>
                    {w.started_in_window
                      ? record.gain > 0 ? `${changeOf(record, record.gain)} since it started` : 'Started this period'
                      : moved
                        ? changeOf(record, w.gain!)
                        : 'No new best'}
                  </span>
                </div>
                <p className="ax-rx-row-foot">
                  Best {formatValue(record.best, record.unit, record.target)}
                  {' · '}
                  {w.new_bests} new {w.new_bests === 1 ? 'best' : 'bests'} from {w.logged}{' '}
                  {w.logged === 1 ? 'entry' : 'entries'}
                  {before !== null && !w.started_in_window && (
                    before > 0
                      ? ` · ${changeOf(record, before)} the period before`
                      : ' · flat the period before'
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** What the work behind each record bought, and how the work was found. */
function WorkPanel({ data }: { data: RecordAnalysis }) {
  const rows = data.records.filter((record) => record.work.basis && record.work.climb_seconds > 0).slice(0, 8);
  const unfiled = data.records.filter((record) => record.how === 'none').map((record) => record.name);
  const BASIS = { context: 'tasks on the same contest', tree: 'tasks in the same skill tree', subject: 'tasks in the same subject' };

  return (
    <Panel
      title="What your work bought"
      note="Hours on related tasks from each record's first entry to its best, matched by the record's name"
    >
      {rows.length === 0 ? (
        <p className="ax-empty">
          None of your records line up with your tasks yet. Name the contest, course or subject in a record
          ("AMC 10", "Codeforces rating", "Mile run") and in your tasks, and this connects them.
        </p>
      ) : (
        <ul className="ax-rx-rows">
          {rows.map((record) => (
            <li key={record.name}>
              <div className="ax-rx-row-head">
                <strong>{record.name}</strong>
                <span className={`ax-rx-move${record.gain > 0 ? ' is-up' : ''}`}>
                  {record.gain > 0 ? changeOf(record, record.gain) : 'No change yet'}
                </span>
              </div>
              <p className="ax-rx-row-foot">
                {hoursText(record.work.climb_seconds)} over {record.work.climb_tasks}{' '}
                {record.work.climb_tasks === 1 ? 'task' : 'tasks'}
                {record.work.seconds_per_unit !== null && PER[record.unit] &&
                  ` · about ${hoursText(record.work.seconds_per_unit)} per ${PER[record.unit]}`}
                {record.work.since_seconds > 0 && ` · ${hoursText(record.work.since_seconds)} since the best`}
              </p>
              <p className="ax-rx-basis">
                Read as {readAs(record) || 'its category'}, from {BASIS[record.work.basis as keyof typeof BASIS]}
              </p>
            </li>
          ))}
        </ul>
      )}
      {unfiled.length > 0 && (
        <p className="ax-rx-basis">
          Not matched to any work yet: {unfiled.slice(0, 4).join(', ')}{unfiled.length > 4 ? ` and ${unfiled.length - 4} more` : ''}.
        </p>
      )}
    </Panel>
  );
}

/** The goals and milestones each record counts toward, with how far its best gets. */
function GoalsPanel({ data }: { data: RecordAnalysis }) {
  const tied = data.records.filter((record) => record.goals.length || record.milestones.length);
  return (
    <Panel
      title="Where your records point"
      note="Goals whose own words name the same contest, skill or subject, and milestones linked on Achievements"
    >
      {tied.length === 0 ? (
        <p className="ax-empty">
          No record lines up with a goal yet. A goal that names the contest ("Reach Codeforces 1300") gets
          measured against your best automatically.
        </p>
      ) : (
        <ul className="ax-rx-rows">
          {tied.slice(0, 6).map((record) => (
            <li key={record.name}>
              <div className="ax-rx-row-head">
                <strong>{record.name}</strong>
                <span className="ax-rx-count">best {formatValue(record.best, record.unit, record.target)}</span>
              </div>
              {record.goals.map((goal) => (
                <div key={goal.id} className="ax-rx-goal">
                  <Link className="ax-link" to="/goals">{goal.title}</Link>
                  {goal.progress ? (
                    <>
                      <div className="ax-rx-bar" role="progressbar" aria-valuenow={Math.round(goal.progress.percent)}
                           aria-valuemin={0} aria-valuemax={100} aria-label={`${goal.title}: ${pct(goal.progress.percent)}`}>
                        <i className={goal.progress.met ? 'is-met' : ''} style={{ width: `${goal.progress.percent}%` }} />
                      </div>
                      <span className="ax-rx-count">
                        {goal.progress.met
                          ? `Reached ${formatValue(goal.progress.target, record.unit)}`
                          : `${pct(goal.progress.percent)} of the way to ${formatValue(goal.progress.target, record.unit)}`}
                        {goal.days_left !== null && goal.days_left >= 0 && !goal.progress.met && ` · ${goal.days_left} days left`}
                      </span>
                    </>
                  ) : (
                    <span className="ax-rx-count">
                      Same {goal.by.includes('contest') ? 'contest' : goal.by.includes('tree') ? 'skill area' : 'subject'}
                    </span>
                  )}
                </div>
              ))}
              {record.milestones.length > 0 && (
                <p className="ax-rx-basis">Milestones: {record.milestones.join(', ')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * Records on Growth: what stands out, the period, what the work bought and
 * what it is for. The page fetched it (see `useRecordAnalysis`), so it never
 * waits on the grades.
 */
export function RecordsGrowthSection({ read }: { read: RecordsRead }) {
  const data = read.data;
  if (!data) {
    return read.loading ? (
      <section className="ax-section"><p className="ax-empty">Reading your records…</p></section>
    ) : null;
  }

  if (data.summary.records === 0) {
    return (
      <section className="ax-section">
        <Panel title="Your records" note="Personal bests, read against your work and goals">
          <NoRecords />
        </Panel>
      </section>
    );
  }

  return (
    <>
      <section className="ax-section">
        <Panel
          title="Your records, read"
          note={`What your personal bests say about ${windowText(data.days)}, from their names, your tasks and your goals`}
          aside={<Link className="ax-link" to="/achievements">Your records</Link>}
        >
          {data.reads.length ? (
            <Reads items={data.reads} />
          ) : (
            <p className="ax-empty">Nothing stands out yet. Log each record again when you try it and this fills in.</p>
          )}
        </Panel>
      </section>
      <section className="ax-section ax-grid ax-grid-halves-even">
        <PeriodPanel data={data} />
        <WorkPanel data={data} />
      </section>
      <section className="ax-section">
        <GoalsPanel data={data} />
      </section>
    </>
  );
}
