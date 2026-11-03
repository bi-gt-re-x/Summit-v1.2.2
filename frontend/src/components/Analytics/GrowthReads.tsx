/**
 * What got worse and what got better, at the top of the Growth tab.
 *
 * The bad news goes first and gets its own column even when it's empty, because
 * "nothing's slipping" is a finding and a page that only lists wins can't be
 * believed. Topics come from backend/tracking/growth_reads.py; the subjects whose
 * level fell come from the tab's skill tracks (utils/skillGrowth).
 */
import { useCallback } from 'react';
import { useApi } from '@/hooks';
import { growthReads } from '@/services/topics';
import { DORMANT_DAYS, IDLE_DAYS, type SkillTrack } from '@/utils/skillGrowth';
import { Panel } from './charts';
import { windowOption, type WindowKey } from './data';
import { Figures } from './Figures';

const MARK = { good: '↑', bad: '!', flat: '·' } as const;

/** Subject rows in the Slipping column, and the fall that earns one. */
const SUBJECTS_SHOWN = 3;
const WORTH_NAMING = 5;
const TOPICS_SHOWN = 3;

/** The window this reads over: the page's, between 30 days and two years. */
export function readDays(span: WindowKey): number {
  const days = windowOption(span).days ?? 730;
  return Math.max(30, Math.min(730, days));
}

function Row({ tone, title, detail }: { tone: 'good' | 'bad' | 'flat'; title: string; detail: string }) {
  return (
    <li className={`is-${tone === 'good' ? 'up' : tone === 'bad' ? 'down' : 'flat'}`}>
      <span className="ax-period-mark" aria-hidden="true">
        {MARK[tone]}
      </span>
      <span>
        <b>{title}.</b> <Figures text={detail} />
      </span>
    </li>
  );
}

const plural = (count: number) => `${count} ${count === 1 ? 'subject' : 'subjects'}`;

export function GrowthReadsPanel({ span, tracks = [] }: { span: WindowKey; tracks?: SkillTrack[] }) {
  const days = readDays(span);
  const call = useCallback(() => growthReads(days), [days]);
  const reads = useApi(call, [days]);
  const data = reads.data;

  if (!data) {
    return reads.loading ? <p className="ax-empty">Loading your growth…</p> : null;
  }

  const shown = days >= 730 ? 'the last two years' : days >= 365 ? 'the last year' : `the last ${days} days`;
  const items = (id: string) => data.groups.find((group) => group.id === id)?.items ?? [];
  /* Counted over every subject, the same as Skill growth further down. Only the
     rows leave life admin out: "Laundry dropped 9 points" isn't growth news. */
  const fell = tracks.filter((track) => (track.delta ?? 0) < 0);
  const rose = tracks.filter((track) => (track.delta ?? 0) > 0);
  const subjects = fell
    .filter((track) => (track.delta ?? 0) <= -WORTH_NAMING && (track.daysSince ?? 0) <= DORMANT_DAYS)
    .filter((track) => !(data.routine ?? []).includes(track.subject))
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
    .slice(0, SUBJECTS_SHOWN);
  const worse = items('watch').slice(0, TOPICS_SHOWN);
  const better = items('improved');

  return (
    <Panel
      title="What got worse and what got better"
      note={`From ${data.sessions.toLocaleString('en-US')} sessions over ${shown}`}
      className="ax-growth-reads"
    >
      {tracks.length > 0 && (
        <p className="ax-growth-lead">
          <strong className="is-down">{plural(fell.length)} slipped</strong> and{' '}
          <strong className="is-up">{plural(rose.length)} improved</strong>.
        </p>
      )}
      <div className="ax-period-groups">
        <div className="ax-period-group">
          <h3 className="ax-tips-head">Slipping</h3>
          {subjects.length + worse.length === 0 ? (
            <p className="ax-empty">Nothing's slipping.</p>
          ) : (
            <ul className="ax-period-list">
              {subjects.map((track) => (
                <Row
                  key={track.subject}
                  tone="bad"
                  title={`${track.name} dropped ${Math.abs(track.delta ?? 0)} points`}
                  detail={
                    `Level ${track.then} → ${track.now}.`
                    + ((track.daysSince ?? 0) >= IDLE_DAYS ? ` Nothing done in ${track.daysSince} days.` : '')
                  }
                />
              ))}
              {worse.map((item) => (
                <Row key={item.id} tone={item.tone} title={item.title} detail={item.detail} />
              ))}
            </ul>
          )}
        </div>
        <div className="ax-period-group">
          <h3 className="ax-tips-head">Improving</h3>
          {better.length === 0 ? (
            <p className="ax-empty">Nothing moved enough to count yet.</p>
          ) : (
            <ul className="ax-period-list">
              {better.map((item) => (
                <Row key={item.id} tone={item.tone} title={item.title} detail={item.detail} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}
