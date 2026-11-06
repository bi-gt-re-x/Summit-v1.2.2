/**
 * The weekly review: five minutes, once a week.
 *
 * It answers three questions in order. What moved, what stalled, and what to test
 * next. Last week's test is graded at the top when it's done, and finishing the
 * review keeps a streak of weeks. Everything here is read on the server
 * (backend/tracking/weekly.py and experiments.py) and drawn as tiles, bars and short
 * lines.
 */
import { useState } from 'react';
import { ErrorState, Loading } from '@/components';
import { useApi } from '@/hooks';
import {
  decideTest,
  extendTest,
  finishReview,
  startTest,
  stopTest,
  weeklyReview,
  type Proposal,
  type ReviewLine,
  type ReviewTile,
  type WeeklyReview,
} from '@/services/experiments';
import { ExperimentCard, lower } from '../Experiment';
import '@/styles/weekly-review.css';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const LENGTHS = [
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 21, label: '3 weeks' },
  { days: 28, label: '4 weeks' },
];
const ICON: Record<string, string> = {
  flag: '⚑', pace: '◷', drop: '↓', rise: '↑', output: '★', rating: '◆', late: '!',
};

function Change({ value, before }: { value: number; before?: number }) {
  if (before === undefined) return null;
  if (value === before) return <span className="rv-change is-flat">same as last week</span>;
  const up = value > before;
  return (
    <span className={`rv-change is-${up ? 'up' : 'down'}`}>
      {up ? '↑' : '↓'} from {before}
    </span>
  );
}

function Tile({ tile }: { tile: ReviewTile }) {
  return (
    <div className={`rv-tile is-${tile.key}`}>
      <span className="rv-tile-label">{tile.label}</span>
      <b className="rv-tile-num">
        {tile.value}
        {tile.of !== undefined && <small>/{tile.of}</small>}
      </b>
      {tile.days ? (
        <span className="rv-week-dots" aria-label={`Worked ${tile.value} of 7 days`}>
          {tile.days.map((on, at) => (
            <span key={at} className={on ? 'is-on' : undefined}>
              {DAYS[at]}
            </span>
          ))}
        </span>
      ) : (
        <Change value={tile.value} before={tile.before} />
      )}
    </div>
  );
}

function Lines({ title, lines, empty, tone }: { title: string; lines: ReviewLine[]; empty: string; tone: 'good' | 'bad' }) {
  return (
    <section className={`ax-panel rv-list is-${tone}`} aria-label={title}>
      <h3 className="rv-list-title">{title}</h3>
      {lines.length === 0 ? (
        <p className="rv-small">{empty}</p>
      ) : (
        <ul>
          {lines.map((line) => (
            <li key={`${line.title}-${line.detail}`}>
              <span className="rv-line-icon" aria-hidden="true">
                {ICON[line.icon] ?? '•'}
              </span>
              <span>
                <b>{line.title}</b>
                <span className="rv-line-detail">{line.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProposalCard({
  proposal,
  busy,
  onStart,
}: {
  proposal: Proposal;
  busy: boolean;
  onStart: (days: number) => void;
}) {
  const [days, setDays] = useState(14);
  return (
    <article className="rv-proposal">
      <span className="rv-kicker">{proposal.scope}</span>
      <h4>{proposal.title}</h4>
      <p className="rv-why">{proposal.why}</p>
      {proposal.how && <p className="rv-small">{proposal.how}</p>}
      <p className="rv-small rv-measure">Measured by: {lower(proposal.measure)}</p>
      <div className="rv-start">
        <select aria-label="How long" value={days} onChange={(event) => setDays(Number(event.target.value))}>
          {LENGTHS.map((one) => (
            <option key={one.days} value={one.days}>
              {one.label}
            </option>
          ))}
        </select>
        <button type="button" className="ax-btn ax-btn-primary" disabled={busy} onClick={() => onStart(days)}>
          Bet on this
        </button>
      </div>
    </article>
  );
}

function OwnBet({ busy, onStart }: { busy: boolean; onStart: (title: string, measure: string, days: number) => void }) {
  const [title, setTitle] = useState('');
  const [measure, setMeasure] = useState('rating');
  const [days, setDays] = useState(14);
  return (
    <form
      className="rv-own"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim()) onStart(title.trim(), measure, days);
      }}
    >
      <label className="rv-own-label" htmlFor="rv-own-title">
        Or test your own idea
      </label>
      <input
        id="rv-own-title"
        value={title}
        maxLength={120}
        placeholder="e.g. Review notes the night before"
        onChange={(event) => setTitle(event.target.value)}
      />
      <div className="rv-start">
        <select aria-label="Measure it by" value={measure} onChange={(event) => setMeasure(event.target.value)}>
          <option value="rating">Measure: how sessions rate</option>
          <option value="days">Measure: days you work</option>
        </select>
        <select aria-label="How long" value={days} onChange={(event) => setDays(Number(event.target.value))}>
          {LENGTHS.map((one) => (
            <option key={one.days} value={one.days}>
              {one.label}
            </option>
          ))}
        </select>
        <button type="submit" className="ax-btn" disabled={busy || !title.trim()}>
          Start
        </button>
      </div>
    </form>
  );
}

export function ReviewTab() {
  const read = useApi(weeklyReview, []);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [pastOpen, setPastOpen] = useState(false);

  if (read.loading && !read.data) return <Loading label="Reading your week" />;
  if (!read.data) return <ErrorState message={read.error ?? "Couldn't load your week."} onRetry={read.reload} />;
  const review: WeeklyReview = read.data;
  const text = note ?? review.note;

  async function act(key: string, call: () => Promise<{ success: boolean; message?: string }>) {
    setBusy(key);
    setError('');
    const result = await call();
    setBusy('');
    if (!result.success) setError(result.message || 'That didn\'t work. Try again.');
    read.reload();
  }

  return (
    <div className="rv-page">
      {/* ---- The week at a glance ---------------------------------------- */}
      <section className="ax-panel rv-head" aria-label="Your week">
        <div className="rv-head-top">
          <span className="rv-kicker">{review.week.this_week ? 'This week' : 'Last week'} · {review.week.label}</span>
          {review.streak > 0 && (
            <span className="rv-streak" title="Weeks in a row you've done your review">
              🔥 {review.streak} {review.streak === 1 ? 'week' : 'weeks'} in a row
            </span>
          )}
          <span className={`rv-status${review.reviewed ? ' is-done' : ''}`}>
            {review.reviewed ? '✓ Reviewed' : 'Not reviewed yet'}
          </span>
        </div>
        <h2 className="rv-headline">{review.headline}</h2>
        <div className="rv-tiles">
          {review.tiles.map((tile) => (
            <Tile key={tile.key} tile={tile} />
          ))}
        </div>
      </section>

      {error && (
        <p className="sb-link-error" role="alert">
          {error}
        </p>
      )}

      {/* ---- Last bet, graded ------------------------------------------------ */}
      {review.ready.length > 0 && (
        <section className="rv-section" aria-label="Your finished tests">
          <h2 className="rv-section-title">How your test went</h2>
          <div className="rv-grid">
            {review.ready.map((test) => (
              <ExperimentCard
                key={test.id}
                test={test}
                busy={busy === test.id}
                onKeep={() => void act(test.id, () => decideTest(test.id, true))}
                onDrop={() => void act(test.id, () => decideTest(test.id, false))}
                onExtend={() => void act(test.id, () => extendTest(test.id))}
              />
            ))}
          </div>
        </section>
      )}

      {/* ---- What moved, what stalled ---------------------------------------- */}
      <div className="rv-cols">
        <Lines title="What moved" lines={review.moved} empty="Nothing moved this week." tone="good" />
        <Lines title="What stalled" lines={review.stalled} empty="Nothing stalled. Nice." tone="bad" />
      </div>

      {/* ---- The bet ------------------------------------------------------------ */}
      <section className="rv-section" aria-label="Your bet for next week">
        <h2 className="rv-section-title">Your bet for next week</h2>
        <p className="rv-small rv-section-note">
          Pick one change. Summit watches the sessions that follow and tells you if it worked.
        </p>

        {review.running.length > 0 && (
          <div className="rv-grid">
            {review.running.map((test) => (
              <ExperimentCard
                key={test.id}
                test={test}
                busy={busy === test.id}
                onStop={() => void act(test.id, () => stopTest(test.id))}
              />
            ))}
          </div>
        )}

        {review.can_start ? (
          <>
            {review.proposals.length > 0 && (
              <div className="rv-grid">
                {review.proposals.map((proposal) => (
                  <ProposalCard
                    key={`${proposal.kind}-${proposal.title}`}
                    proposal={proposal}
                    busy={busy !== ''}
                    onStart={(days) =>
                      void act(`start-${proposal.kind}`, () =>
                        startTest({
                          kind: proposal.kind,
                          params: { ...proposal.params, how: proposal.how },
                          goal: proposal.goal,
                          subject: proposal.subject,
                          title: proposal.title,
                          why: proposal.why,
                          days,
                        }),
                      )
                    }
                  />
                ))}
              </div>
            )}
            <OwnBet
              busy={busy !== ''}
              onStart={(title, measure, days) =>
                void act('own', () => startTest({ kind: 'custom', params: { measure }, title, days }))
              }
            />
          </>
        ) : (
          <p className="rv-small">Three tests at once is the most. Finish or stop one to start another.</p>
        )}
      </section>

      {/* ---- Finish --------------------------------------------------------------- */}
      <section className="ax-panel rv-finish" aria-label="Finish your review">
        <label htmlFor="rv-note" className="rv-own-label">
          One thing you learned this week <span className="rv-small">(optional)</span>
        </label>
        <textarea
          id="rv-note"
          rows={2}
          maxLength={1000}
          value={text}
          placeholder="e.g. Mornings are better for DP"
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="rv-actions">
          <button
            type="button"
            className="ax-btn ax-btn-primary"
            disabled={busy !== ''}
            onClick={() => void act('finish', () => finishReview(text))}
          >
            {review.reviewed ? 'Save note' : 'Finish review'}
          </button>
          {review.reviewed && <span className="rv-small">Done for this week. See you next Sunday.</span>}
        </div>
      </section>

      {/* ---- Past tests ------------------------------------------------------------ */}
      {review.past.length > 0 && (
        <section className="rv-section" aria-label="Past tests">
          <button type="button" className="rv-link" aria-expanded={pastOpen} onClick={() => setPastOpen((open) => !open)}>
            {pastOpen ? 'Hide past tests' : `Past tests (${review.past.length})`}
          </button>
          {pastOpen && (
            <ul className="rv-past">
              {review.past.map((test) => (
                <li key={test.id}>
                  <span className={`rv-pill is-${test.tone}`}>{test.phase === 'stopped' ? 'Stopped' : test.headline}</span>
                  <b>{test.title}</b>
                  <span className="rv-small">
                    {test.phase === 'stopped' ? '' : test.kept ? 'Kept' : 'Dropped'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
