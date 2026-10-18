/**
 * What you say vs. what you do: the Insights tab's group that puts the Log
 * beside the record.
 *
 * Four parts, top to bottom, each drawing nothing when it has nothing:
 *
 *   1. **How you feel vs. what you get done.** The headline the days support,
 *      rough, okay and good days against the usual day, and the last 60
 *      days as a timeline: a bar per day for tasks, a dot above it for the
 *      mood, filled when tapped and hollow when read from the words.
 *   2. **Feelings.** Each kind of feeling word against the days without it,
 *      that day and the next.
 *   3. **How it felt vs. how it went.** Lines like "got nothing done" against
 *      what the record says got done.
 *   4. **Said vs. did** (./SaidVsDid): aims, routines, timing and topics.
 *
 * Every figure comes from backend/tracking/mood.py and said_did.py, every
 * comparison carries its day count and a confidence word, and "How this is
 * worked out" says the rules in plain words. Nothing here is a guess the page
 * can't show the working for.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Frown, Laugh, Meh, NotebookPen } from 'lucide-react';
import type {
  Confidence,
  FeelingRead,
  MoodBand,
  MoodDay,
  MoodVsOutput,
  PerceptionCheck,
  SaidVsDid as SaidReading,
} from '@/services/said';
import { Panel, PanelNote } from './charts';
import { SaidVsDid } from './SaidVsDid';

const CONFIDENCE: Record<Confidence, string> = {
  early: 'Early read',
  pattern: 'Pattern',
  solid: 'Solid',
};

const BAND_ICON = { rough: Frown, okay: Meh, good: Laugh } as const;

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

function dayLabel(iso: string, long = false) {
  const when = new Date(`${iso}T12:00:00`);
  return Number.isNaN(when.getTime()) ? iso : (long ? WEEKDAY : DAY).format(when);
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function minutes(total: number) {
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function Sure({ level, days }: { level: Confidence; days?: number }) {
  return (
    <span className={`ax-sv-sure is-${level}`} title="How many days this is based on">
      {CONFIDENCE[level]}
      {days !== undefined ? ` · ${plural(days, 'day')}` : ''}
    </span>
  );
}

/** A change in percent, as words that say which way. */
function changeWords(change: number | null | undefined, small: number, thing = 'tasks') {
  if (change === null || change === undefined) return 'no usual day to compare with yet';
  if (Math.abs(change) < small) return `about the same ${thing}`;
  return `${Math.abs(change)}% ${change > 0 ? 'more' : 'fewer'} ${thing}`;
}

/** A change against the usual day, as words. */
function vsUsual(change: number | null | undefined, small: number) {
  if (change === null || change === undefined) return 'no usual day yet';
  if (Math.abs(change) < small) return 'about your usual';
  return `${Math.abs(change)}% ${change > 0 ? 'over' : 'under'} your usual`;
}

// --------------------------------------------------------------------------
// 1. The hero: bands and the timeline
// --------------------------------------------------------------------------
function Bands({ bands, usual, small, need }: { bands: MoodBand[]; usual: number; small: number; need: number }) {
  const top = Math.max(usual, ...bands.map((band) => band.tasks_avg), 1);
  return (
    <ul className="ax-sv-bands" aria-label="Tasks on rough, okay and good days">
      {bands.map((band) => {
        const Icon = BAND_ICON[band.key];
        const width = band.days ? Math.max(3, (band.tasks_avg / top) * 100) : 0;
        return (
          <li key={band.key} className={`ax-sv-band is-${band.key}${band.enough ? '' : ' is-thin'}`}>
            <span className="ax-sv-band-name">
              <Icon aria-hidden="true" />
              {band.label}
              <small>{plural(band.days, 'day')}</small>
            </span>
            <span className="ax-sv-band-track">
              <span className="ax-sv-band-fill" style={{ width: `${width}%` }} />
              {usual > 0 && (
                <span className="ax-sv-band-usual" style={{ left: `${(usual / top) * 100}%` }} aria-hidden="true" />
              )}
            </span>
            <span className="ax-sv-band-value">
              {band.days === 0 ? (
                <em>No days yet</em>
              ) : (
                <>
                  <span>
                    <b>{band.tasks_avg}</b> tasks
                  </span>
                  <small>
                    {band.focus_avg > 0 ? `${minutes(band.focus_avg)} focus · ` : ''}
                    {band.enough ? vsUsual(band.vs_usual, small) : `${need - band.days} more to compare`}
                  </small>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const MOOD_WORD = ['Rough', 'Low', 'Okay', 'Good', 'Great'];

function Timeline({ series, usual }: { series: MoodDay[]; usual: number }) {
  const [hover, setHover] = useState<MoodDay | null>(null);
  const width = 600;
  const moodTop = 8;
  const moodH = 46;
  const barTop = moodTop + moodH + 14;
  const barH = 70;
  const step = width / series.length;
  const most = Math.max(usual, ...series.map((day) => day.tasks), 1);
  const moodY = (mood: number) => moodTop + ((2 - mood) / 4) * moodH;
  const points = series
    .map((day, at) => (day.mood === null ? null : [at * step + step / 2, moodY(day.mood)] as const))
    .filter((point): point is readonly [number, number] => point !== null);

  return (
    <figure className="ax-sv-time">
      <svg
        viewBox={`0 0 ${width} ${barTop + barH + 4}`}
        role="img"
        aria-label="Mood and tasks for each of the last 60 days"
        onMouseLeave={() => setHover(null)}
      >
        {[-2, 0, 2].map((mood) => (
          <line key={mood} className="ax-sv-time-grid" x1={0} x2={width} y1={moodY(mood)} y2={moodY(mood)} />
        ))}
        {usual > 0 && (
          <line
            className="ax-sv-time-usual"
            x1={0}
            x2={width}
            y1={barTop + barH - (usual / most) * barH}
            y2={barTop + barH - (usual / most) * barH}
          />
        )}
        {points.length > 1 && (
          <polyline className="ax-sv-time-line" points={points.map((p) => p.join(',')).join(' ')} />
        )}
        {series.map((day, at) => {
          const x = at * step;
          const h = (day.tasks / most) * barH;
          return (
            <g key={day.day} onMouseEnter={() => setHover(day)}>
              <rect className="ax-sv-time-hit" x={x} y={0} width={step} height={barTop + barH} />
              <rect
                className={`ax-sv-time-bar${day.mood === null ? '' : day.mood < 0 ? ' is-rough' : day.mood > 0 ? ' is-good' : ' is-okay'}`}
                x={x + step * 0.18}
                y={barTop + barH - h}
                width={step * 0.64}
                height={Math.max(h, day.tasks ? 1.5 : 0)}
                rx={1.5}
              />
              {day.mood !== null && (
                <circle
                  className={`ax-sv-time-dot is-m${day.mood + 3}${day.source === 'read' ? ' is-read' : ''}`}
                  cx={x + step / 2}
                  cy={moodY(day.mood)}
                  r={4}
                />
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="ax-sv-time-cap">
        {hover ? (
          <span>
            <b>{dayLabel(hover.day, true)}:</b>{' '}
            {hover.mood === null
              ? 'no mood'
              : `${MOOD_WORD[hover.mood + 2]}${hover.source === 'read' ? ' (from your words)' : ''}`}
            {' · '}
            {plural(hover.tasks, 'task')}
            {hover.focus_min ? ` · ${minutes(hover.focus_min)} focus` : ''}
          </span>
        ) : (
          <span className="ax-sv-legend">
            <i className="is-said" /> mood you tapped <i className="is-read" /> mood from your words
            <i className="is-bar" /> tasks <i className="is-usual" /> your usual day
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function MoodHero({ mood }: { mood: MoodVsOutput }) {
  const { headline, usual } = mood;
  const anyBand = mood.bands.some((band) => band.days > 0);
  return (
    <Panel
      title="How you feel vs. what you get done"
      className="ax-sv-hero"
      aside={headline ? <Sure level={headline.confidence} days={mood.mood_days} /> : undefined}
      footer={
        <PanelNote label="How this is worked out">
          <ul className="ax-sv-rules">
            <li>
              A day's mood is what you tapped on the Log page. With no tap, it's read from the feeling
              words in that day's entries ("so tired" counts double, "not tired" doesn't count).
            </li>
            <li>Rough is below the middle, okay is the middle, good is above it.</li>
            <li>
              Each day is matched with what you finished that day. Your usual day is the middle of your
              active days in the last {usual.days} days: {plural(usual.tasks, 'task')}.
            </li>
            <li>
              A comparison needs {mood.min_days} days on each side, and a gap under {mood.small_change}%
              counts as about the same. Today isn't counted until it's over.
            </li>
            <li>Early read is under 6 days, a pattern is 6 to 11, solid is 12 or more.</li>
          </ul>
        </PanelNote>
      }
    >
      {headline && <p className={`ax-sv-headline is-${headline.tone}`}>{headline.text}</p>}
      <p className="ax-sv-source">
        {plural(mood.mood_days, 'day')} with a mood in the last {mood.window_days} days
        {mood.mood_days > 0 && `: ${mood.said_days} you tapped, ${mood.read_days} read from your words`}.
        {!mood.today ? (
          <>
            {' '}
            <Link to="/log" className="ax-link">How's today?</Link>
          </>
        ) : null}
      </p>
      {anyBand && <Bands bands={mood.bands} usual={usual.tasks} small={mood.small_change} need={mood.min_days} />}
      <Timeline series={mood.series} usual={usual.tasks} />
    </Panel>
  );
}

// --------------------------------------------------------------------------
// 2. Feelings
// --------------------------------------------------------------------------
function FeelingsPanel({ feelings, small, recovery, energy, energyReady, weekdays }: {
  feelings: FeelingRead[];
  small: number;
  recovery: MoodVsOutput['recovery'];
  energy: MoodVsOutput['energy'];
  energyReady: boolean;
  weekdays: MoodVsOutput['weekdays'];
}) {
  const ready = feelings.filter((row) => row.enough);
  const building = feelings.filter((row) => !row.enough);
  if (ready.length === 0 && building.length === 0 && !recovery && !energyReady && weekdays.length === 0) {
    return null;
  }
  const topEnergy = Math.max(...energy.map((row) => row.tasks_avg), 1);
  return (
    <Panel title="When you write that you feel…" className="ax-sv-feel" note="Days with each kind of word against your logged days without it.">
      {ready.length > 0 && (
        <ul className="ax-sv-feelings">
          {ready.map((row) => {
            const change = row.change ?? 0;
            const tone = Math.abs(change) < small ? 'flat' : change > 0 ? 'up' : 'down';
            return (
              <li key={row.kind} className={`ax-sv-feeling is-${row.kind}`}>
                <span className="ax-sv-feeling-head">
                  <b>{row.label}</b>
                  {row.words && row.words.length > 0 && <small>{row.words.join(', ')}</small>}
                  <Sure level={row.confidence ?? 'early'} days={row.days} />
                </span>
                <span className={`ax-sv-feeling-that is-${tone}`}>
                  That day: {changeWords(row.change, small)}{' '}
                  <small>({row.tasks_avg} vs {row.other_avg})</small>
                </span>
                <span className="ax-sv-feeling-next">
                  The day after: {vsUsual(row.next_change, small)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {building.length > 0 && (
        <p className="ax-sv-building">
          Still collecting:{' '}
          {building.map((row) => `${row.label.toLowerCase()} (${row.days} of ${row.need ?? 3} days)`).join(', ')}.
        </p>
      )}
      {(recovery || energyReady || weekdays.length > 0) && (
        <div className="ax-sv-extras">
          {recovery && (
            <div className="ax-sv-extra">
              <span className="ax-sv-extra-label">Bounce back</span>
              <p>
                After a rough day you're back to your usual in <b>{plural(Math.round(recovery.days), 'day')}</b>
                <small> (middle of {plural(recovery.lows, 'rough day')})</small>.
              </p>
            </div>
          )}
          {energyReady && (
            <div className="ax-sv-extra">
              <span className="ax-sv-extra-label">Energy</span>
              <ul className="ax-sv-energy">
                {energy.map((row) => (
                  <li key={row.level} className={row.enough ? '' : 'is-thin'}>
                    <span>{row.label}</span>
                    <span className="ax-sv-energy-bar">
                      <span style={{ width: `${(row.tasks_avg / topEnergy) * 100}%` }} />
                    </span>
                    <b>{row.tasks_avg}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {weekdays.length > 0 && (
            <div className="ax-sv-extra">
              <span className="ax-sv-extra-label">Mood by weekday</span>
              <ul className="ax-sv-week">
                {weekdays.map((row) => (
                  <li
                    key={row.day}
                    className={row.mood <= -0.5 ? 'is-rough' : row.mood >= 0.5 ? 'is-good' : 'is-okay'}
                    title={`${row.day}: ${plural(row.days, 'day')}`}
                  >
                    <span>{row.day}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// 3. How it felt vs. how it went
// --------------------------------------------------------------------------
function verdictText(check: PerceptionCheck) {
  const did = plural(check.tasks, 'task');
  switch (check.verdict) {
    case 'harsher':
      return `You finished ${did}, ${check.tasks > check.usual ? 'more than' : 'right at'} your usual ${check.usual}. Go easier on yourself.`;
    case 'matches':
      if (check.side === 'low') {
        return check.tasks === 0
          ? 'The record agrees: nothing finished. Tomorrow is a fresh start.'
          : `Fair: just ${did}, against your usual ${check.usual}.`;
      }
      return `The record agrees: ${did}, against your usual ${check.usual}.`;
    case 'deep':
      return `Fewer tasks (${check.tasks}), but ${minutes(check.focus_min)} of focus. The work went deep.`;
    case 'generous':
      return `It felt big, but the record says ${did} against your usual ${check.usual}.`;
    default:
      return `A little under your usual: ${did} against ${check.usual}.`;
  }
}

const VERDICT_TAG: Record<PerceptionCheck['verdict'], string> = {
  harsher: 'Better than it felt',
  matches: 'Matches',
  close: 'Close',
  generous: 'Less than it felt',
  deep: 'Deep work',
};

function PerceptionPanel({ checks, harsher }: { checks: PerceptionCheck[]; harsher: number }) {
  if (checks.length === 0) return null;
  return (
    <Panel
      title="How it felt vs. how it went"
      className="ax-sv-checks"
      note={
        harsher >= 2
          ? `${harsher} times you called a day a write-off and still hit your usual.`
          : 'What you wrote about getting things done, against what got done.'
      }
    >
      <ul>
        {checks.map((check) => (
          <li key={`${check.day}-${check.quote}`} className={`ax-sv-check is-${check.verdict}`}>
            <span className="ax-sv-check-top">
              <time dateTime={check.day}>{dayLabel(check.day, true)}</time>
              <span className={`ax-sv-tag is-${check.verdict}`}>{VERDICT_TAG[check.verdict]}</span>
            </span>
            <p className="ax-sv-quote">"{check.quote}"</p>
            <p>{verdictText(check)}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// --------------------------------------------------------------------------
// The group's body
// --------------------------------------------------------------------------
export function SayVsDo({
  mood,
  said,
  reloadSaid,
}: {
  mood: MoodVsOutput | null;
  said: SaidReading | null;
  reloadSaid: () => void;
}) {
  const nothingLogged = !mood || mood.logged_days === 0;
  const sorted = useMemo(() => mood?.feelings ?? [], [mood]);

  return (
    <div className="ax-sv">
      {nothingLogged ? (
        <section className="ax-panel ax-sv-start">
          <span className="ax-sv-start-mark" aria-hidden="true">
            <NotebookPen />
          </span>
          <div>
            <strong>See how your mood and your work move together</strong>
            <p>
              Tap how your day went on the Log page, or write a few lines. After a few days this shows
              whether rough days really cost you, what being tired or stressed does to your output, and
              whether days that felt like a write-off actually were.
            </p>
            <Link to="/log" className="ax-btn">
              Open the Log
            </Link>
          </div>
        </section>
      ) : (
        <>
          <div className="ax-hero">
            <MoodHero mood={mood} />
          </div>
          <div className="ax-grid ax-grid-halves-even">
            <FeelingsPanel
              feelings={sorted}
              small={mood.small_change}
              recovery={mood.recovery}
              energy={mood.energy}
              energyReady={mood.energy_ready}
              weekdays={mood.weekdays}
            />
            <PerceptionPanel checks={mood.checks} harsher={mood.harsher} />
          </div>
        </>
      )}
      <SaidVsDid data={said} reload={reloadSaid} />
    </div>
  );
}

/** Whether the group has anything worth opening on. */
export function sayVsDoHasNews(mood: MoodVsOutput | null, said: SaidReading | null) {
  const moodNews = Boolean(mood?.headline && mood.headline.tone !== 'building');
  const saidNews = Boolean(said && (said.named.length > 0 || said.timing.length > 0));
  return moodNews || saidNews;
}
