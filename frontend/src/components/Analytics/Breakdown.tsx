/**
 * The middle row: what the work was about, when it happened, and what it passed.
 *
 * Three panels, three units — XP by subject, days on a calendar, tiers on a
 * ladder — and all three read the same window as everything above them, so a
 * reader moving between them is looking at one period from three angles rather
 * than at three different periods.
 */
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Panel, Radar, TONES, toneVar, type RadarAxis, PanelNote } from './charts';
import { HEAT_WEEKDAYS, type HeatRow } from '@/utils/growthSummary';
import { OTHER_KEY, type SubjectXpRow } from '@/utils/subjectXp';
import type { BalanceShape } from '@/utils/behaviour';

/** `HEAT_WEEKDAYS` spelled out. Same order — Sunday first — or the rows lie. */
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
if (WEEKDAY_NAMES.length !== HEAT_WEEKDAYS.length) {
  throw new Error('weekday labels are out of step with the heatmap grid');
}

// --------------------------------------------------------------------------
// Subject growth
// --------------------------------------------------------------------------
export interface SubjectPanelProps {
  rows: SubjectXpRow[];
  /** The same subjects over the period before, for the per-row change. */
  previous: Map<string, number>;
  /** The concentration reading, where the tab has one. */
  balance?: BalanceShape;
  /**
   * Whether each subject's name opens its own page. On the Subjects tab, where
   * the list of skill trees that used to carry those links went.
   */
  linked?: boolean;
}

/**
 * XP by subject: the web, the legend, and what the shape of it means.
 *
 * The legend carries the numbers because a radar cannot: a polygon says which
 * subjects dominate at a glance and refuses to say by how much, which is
 * exactly the division of labour wanted here. The percentage beside each row is
 * that subject against its own showing in the previous period — a subject can
 * be growing while the account as a whole is flat, and that is worth seeing.
 *
 * ## It absorbed the balance panel
 *
 * "What you spend yourself on" sat directly beneath this on the Insights tab
 * and answered the same question from the same figures — a second ring, a
 * second list of the same subjects in the same order. Two panels, one of which
 * had a footer link to the tab it was already on.
 *
 * What that panel had and this one did not was the *reading*: the share going
 * to the leader, whether that is depth or a single point of failure, and which
 * subjects have quietly stopped. None of that is derivable from the web, so it
 * came across whole and sits under the legend. The duplicated half — a second
 * enumeration of the subjects — is what went.
 */
export function SubjectPanel({ rows, previous, balance, linked = false }: SubjectPanelProps) {
  const peak = Math.max(...rows.map((row) => row.xp), 1);
  const axes: RadarAxis[] = rows.map((row) => ({
    label: row.label,
    value: row.xp / peak,
  }));

  return (
    <Panel title="Subject Growth (XP Earned)" note="Where the XP actually goes">
      {rows.length === 0 ? (
        <p className="ax-empty">No finished tasks carry a subject in this window yet.</p>
      ) : (
        <div className="ax-subject">
          <Radar axes={axes} label="XP earned by subject" />
          <ul className="ax-subject-legend">
            {rows.map((row, index) => {
              const was = previous.get(row.key) ?? 0;
              const delta = was > 0 ? Math.round(((row.xp - was) / was) * 100) : null;
              return (
                <li key={row.key}>
                  <i
                    className="ax-dot"
                    style={{ background: toneVar(TONES[index % TONES.length]!) }}
                  />
                  {linked && row.key !== OTHER_KEY ? (
                    <Link
                      className="ax-subject-name"
                      title={row.name ?? row.label}
                      to={`/analytics/subject/${encodeURIComponent(row.key)}`}
                    >
                      {row.label}
                    </Link>
                  ) : (
                    <span className="ax-subject-name" title={row.name ?? row.label}>
                      {row.label}
                    </span>
                  )}
                  <span className="ax-subject-xp">{Math.round(row.xp).toLocaleString()} XP</span>
                  {delta === null ? (
                    <span className="ax-delta ax-delta-none">new</span>
                  ) : (
                    <span className={`ax-delta ax-delta-${delta >= 0 ? 'up' : 'down'}`}>
                      {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}%
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {balance && rows.length > 0 && <BalanceReading balance={balance} />}
    </Panel>
  );
}

/**
 * The concentration reading, from the panel this one absorbed.
 *
 * A ring and two sentences: how much of the effort goes to the leading subject,
 * what that concentration means, and which subjects had real work early in the
 * range and none since — which a total cannot show you, because a total still
 * counts them.
 */
function BalanceReading({ balance }: { balance: BalanceShape }) {
  return (
    <div className="ax-balance">
      <div
        className="ax-balance-ring"
        style={{ '--share': `${balance.concentration}%` } as CSSProperties}
      >
        <strong>{balance.concentration}%</strong>
        <span className="ax-muted ax-small">on {balance.leader ?? '—'}</span>
      </div>
      <div>
        <p className="ax-prose">
          {balance.leader === null ? (
            'No finished task carries a subject yet.'
          ) : balance.concentration >= 45 ? (
            <>
              Nearly half your effort goes to <strong>{balance.leader}</strong>. That is depth, and
              a single point of failure.
            </>
          ) : (
            <>
              <strong>{balance.leader}</strong> leads, but nothing dominates — your effort is
              spread across <strong>{balance.carrying} subjects</strong>. Balanced, and a slower
              route to depth.
            </>
          )}
        </p>
        {balance.fading.length > 0 && (
          <p className="ax-prose">
            <strong>{balance.fading.join(', ')}</strong> had real work early in this range and{' '}
            {balance.fading.length === 1 ? 'has' : 'have'} had none since. A total would still
            count it.
          </p>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Consistency
// --------------------------------------------------------------------------
export interface ConsistencyPanelProps {
  rows: HeatRow[];
}

/**
 * A year of days, a week to a column.
 *
 * The grid comes from `heatmapGrid`, which fixes the column count at the worst
 * case for the window and blanks any square outside it — so the rectangle is
 * the same rectangle whatever weekday the window opens on. That constancy is
 * why the panel can sit in a fixed-height row without the layout moving.
 *
 * No rate in the title line. The share of days worked is the Consistency tile
 * at the top of the tab, and this used to print it a second time; the calendar
 * is the part only this panel can show.
 */
export function ConsistencyPanel({ rows }: ConsistencyPanelProps) {
  return (
    <Panel
      title="Consistency Over Time"
      footer={
        <PanelNote label="What moves this">
          The share of days with <strong>any</strong> work on them. A fifteen-minute day and a
          six-hour day count the same — this measures showing up, nothing else.
        </PanelNote>
      }
    >
      <div className="ax-heat">
        {/* Three-letter names rather than `HEAT_WEEKDAYS`' initials, which are
            S M T W T F S — two pairs that read identically. The order is that
            array's, not the calendar's: `heatmapGrid` builds a week starting
            on Sunday, so these have to start there too. */}
        <div className="ax-heat-days" aria-hidden="true">
          {WEEKDAY_NAMES.map((day, index) => (
            <span key={index}>{day}</span>
          ))}
        </div>
        <div className="ax-heat-main">
          {/* `heatmapGrid` puts the month name on the week it opens in and an
              empty string on every other week, so the labels line up with the
              columns by construction. The initial only: a column is a few
              pixels wide across a year, and "September" over one of them is a
              word floating above nothing in particular. */}
          <div className="ax-heat-months" aria-hidden="true">
            {rows.map((row, index) => (
              <span key={index}>{row.label.slice(0, 1)}</span>
            ))}
          </div>
          <div className="ax-heat-grid" role="img" aria-label="Days worked, one square a day">
            {rows.map((row, index) => (
              <div className="ax-heat-week" key={index}>
                {row.days.map((cell, cellIndex) => (
                  <span
                    key={cellIndex}
                    className={`ax-heat-cell${cell.date ? '' : ' is-blank'}`}
                    data-level={cell.level}
                    title={cell.date ? `${cell.date} · ${Math.round(cell.xp)} XP` : undefined}
                  />
                ))}
              </div>
            ))}
          </div>
          {/* The year, printed once under the week it turns over in. A year of
              columns crosses two of them and sometimes three, and without this
              the months read as one endless run of initials. */}
          <div className="ax-heat-years" aria-hidden="true">
            {rows.map((row, index) => {
              const year = row.days.find((cell) => cell.date)?.date?.slice(0, 4);
              const before = rows[index - 1]?.days.find((cell) => cell.date)?.date?.slice(0, 4);
              return <span key={index}>{year && year !== before ? year : ''}</span>;
            })}
          </div>
        </div>
      </div>

      <div className="ax-heat-key">
        <span>Less consistent</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <i key={level} className="ax-heat-cell" data-level={level} />
        ))}
        <span>More consistent</span>
      </div>
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Milestones
// --------------------------------------------------------------------------
