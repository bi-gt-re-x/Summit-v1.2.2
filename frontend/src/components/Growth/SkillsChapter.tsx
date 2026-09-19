/**
 * Skills & Subjects — what the reader is actually becoming good at.
 *
 * The most RPG-shaped part of Growth, and the one with the strongest pull
 * towards fiction. A skill tree with locked branches, prerequisites and
 * invented levels would look wonderful and mean nothing: the account stores no
 * skill graph, and `backend/tracking/tree.py` is a stub.
 *
 * So this is built on the one thing that *is* recorded — the subject on a
 * finished task — and every RPG shape here is a real reading of it:
 *
 *   the **level** is the app's own ladder (level N costs N × 100 XP) read
 *   continuously, so a week of work moves it and it agrees with the account
 *   level on the dashboard;
 *   the **rank** is a name for a pair of levels, not a second scale;
 *   the **track** is that ladder drawn forwards, with the locked rungs carrying
 *   the date they land at the pace the reader is actually going;
 *   the **radar** is five readings of one subject, each against the best the
 *   account has, because there is no external scale and inventing one would be
 *   the cohort this page refuses to have.
 *
 * Everything is in utils/growthSkills; this file turns it into shapes.
 */
import { useMemo, useState } from 'react';
import type { Subject } from '@/services/subjects';
import type { GrowthDay, Task } from '@/types';
import { iconUrl } from '@/services/subjects';
import {
  CURVE_WINDOWS,
  accountLevel,
  masteryTrack,
  movers,
  skillBalance,
  skillCards,
  skillCurve,
  unfiledXp,
  type CurveKey,
  type SkillCard,
} from '@/utils/growthSkills';
import { MAX_LEVEL, costOf } from '@/utils/mastery';
import { longDate } from '@/utils/growthChapters';
import { EmptyChapter, HeroRow, Notes, PanelHead, Seg, W, H } from './ChapterParts';
import { Glyph } from './GrowthPanels';

export interface SkillsChapterProps {
  all: GrowthDay[];
  tasks: Task[];
  subjects: Map<string, Subject>;
}

export function SkillsChapter({ all, tasks, subjects }: SkillsChapterProps) {
  const today = all[all.length - 1]?.date ?? '';

  const cards = useMemo(() => skillCards(tasks, subjects, today), [subjects, tasks, today]);
  const unfiled = useMemo(() => unfiledXp(tasks, subjects), [subjects, tasks]);
  const level = useMemo(() => accountLevel(all), [all]);

  const [chosenKey, setChosen] = useState<string | null>(null);
  const [window, setWindow] = useState<CurveKey>('6m');

  const chosen: SkillCard | undefined =
    cards.find((card) => card.key === chosenKey) ?? cards[0];

  const curve = useMemo(
    () => (chosen ? skillCurve(tasks, chosen.key, today, window) : null),
    [chosen, tasks, today, window],
  );
  const balance = useMemo(
    () => (chosen ? skillBalance(chosen, cards) : []),
    [cards, chosen],
  );
  const track = useMemo(() => (chosen ? masteryTrack(chosen) : []), [chosen]);
  const moving = useMemo(() => movers(cards), [cards]);

  if (cards.length === 0) {
    return (
      <EmptyChapter
        title="Skills & Subjects"
        message={
          unfiled.count > 0
            ? `${unfiled.count} finished tasks have no subject. Add subjects to your tasks to see skills here.`
            : 'No finished tasks have a subject yet.'
        }
      />
    );
  }

  const top = cards[0]!;
  const deepest = [...cards].sort((a, b) => b.level.exact - a.level.exact)[0]!;
  const lifetime = cards.reduce((sum, card) => sum + card.xp, 0);

  /**
   * Whether this skill has enough behind it to draw a line of its own.
   *
   * Two points is a segment, not a curve, and a subject finished on one
   * afternoon draws a flat rule across an empty box — which reads as a broken
   * panel rather than as a young skill. Below the floor the panel shows the
   * shape it *becomes* instead, marked "Sample" and captioned as an
   * illustration, the same bargain the Overview's Skills Progress strikes.
   */
  const thin = !curve || curve.levels.length < CURVE_FLOOR;

  return (
    <div className="gr-grid">
      {/* --- Where the account stands --------------------------------------- */}
      <div className="gr-span-3">
        <HeroRow
          cards={[
            {
              key: 'level',
              label: 'Account level',
              value: level.tier,
              scale: `· ${Math.round(level.percent)}% through`,
              foot: `${Math.round(level.toNext).toLocaleString()} XP to level ${level.tier + 1}`,
              icon: 'trophy',
            },
            {
              key: 'skills',
              label: 'Skills in play',
              value: cards.length,
              foot: `${Math.round(lifetime).toLocaleString()} XP filed under a subject`,
              icon: 'target',
            },
            {
              key: 'deepest',
              label: `Deepest — ${deepest.label}`,
              value: deepest.level.exact,
              text: deepest.level.exact.toFixed(2),
              scale: `· ${deepest.rank}`,
              foot: `${Math.round(deepest.xp).toLocaleString()} XP over ${deepest.tasks} tasks`,
              icon: 'award',
            },
            {
              key: 'moving',
              label: moving.rising[0]
                ? `Moving fastest — ${moving.rising[0].label}`
                : 'Nothing to rank yet',
              value: moving.rising[0]?.pct ?? 0,
              suffix: '%',
              foot: moving.rising[0]?.note ?? 'needs two months of history',
              icon: 'trend',
            },
          ]}
        />
      </div>

      {/* --- Every skill, as a card ----------------------------------------- */}
      <section className="gr-panel gr-span-3">
        <PanelHead
          title="Skills"
          icon="spark"
          hint="One card per subject you have worked in"
          note={`${cards.length} in play · choose one to inspect`}
        />
        <div className="gr-skillcards">
          {cards.map((card) => (
            <button
              type="button"
              key={card.key}
              className={`gr-skillcard${card.key === chosen?.key ? ' is-picked' : ''}`}
              onClick={() => setChosen(card.key)}
              aria-pressed={card.key === chosen?.key}
            >
              <div className="gr-skillcard-top">
                {card.icon ? (
                  <img
                    className="gr-skillcard-ico"
                    src={iconUrl({ icon: card.icon })}
                    alt=""
                    aria-hidden="true"
                  />
                ) : (
                  <span className="gr-skillcard-ico is-glyph" aria-hidden="true">
                    <Glyph name="spark" size={15} />
                  </span>
                )}
                <span className="gr-skillcard-name" title={card.name}>
                  {card.label}
                </span>
                <span className="gr-skillcard-rank">{card.rank}</span>
              </div>

              {/* The band leads and the number follows it. A name is what a
                  reader remembers a subject by — "Chemistry is Adept" — and
                  4.37 is what they check it against. */}
              <div className="gr-skillcard-level">
                <strong>{card.level.exact.toFixed(2)}</strong>
                <span>Level · {card.level.band.from}–{card.level.band.to}</span>
              </div>

              <span className="gr-skillcard-track">
                <i className="gr-skillcard-fill" style={{ width: `${card.level.percent}%` }} />
              </span>

              <div className="gr-skillcard-foot">
                <span>{Math.round(card.xp).toLocaleString()} XP</span>
                <span>
                  {card.level.maxed
                    ? 'ladder complete'
                    : `${Math.round(card.level.toNext).toLocaleString()} to next`}
                </span>
              </div>

              <div className="gr-skillcard-meta">
                {card.growth30 === null ? (
                  <span className="is-quiet">no earlier month</span>
                ) : (
                  <span className={card.growth30 >= 0 ? 'is-up' : 'is-down'}>
                    {card.growth30 >= 0 ? '↑' : '↓'} {Math.abs(card.growth30)}% · 30d
                  </span>
                )}
                <span className="is-quiet">
                  {card.daysSince === null
                    ? 'never'
                    : card.daysSince === 0
                      ? 'today'
                      : `${card.daysSince}d ago`}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* --- One skill over time -------------------------------------------- */}
      <section className="gr-panel gr-span-2 gr-chart-panel">
        <PanelHead
          title={chosen ? `${chosen.name} — growth` : 'Growth'}
          hint={
            thin
              ? 'Not enough work here to draw a line yet.'
              : 'Level over time. Each mark is a level reached'
          }
        >
          <Seg
            value={window}
            options={CURVE_WINDOWS.map((entry) => ({ key: entry.key, label: entry.label }))}
            onChange={setWindow}
            label="How far back"
          />
        </PanelHead>

        {/* An invented eight-month climb used to be drawn here under a Sample
            tag, on the grounds that a young skill otherwise reads as a broken
            panel. It read as a measurement instead, which is worse than an
            honest gap — see the note on placeholder data in pages/Analytics. */}
        {thin ? (
          <p className="gr-plot-empty">
            {chosen?.label ?? 'This skill'} has {chosen?.tasks ?? 0} finished{' '}
            {chosen?.tasks === 1 ? 'task' : 'tasks'} behind it. A line needs {CURVE_FLOOR}.
          </p>
        ) : (
          <LevelPlot curve={curve!} />
        )}
        <ul className="gr-lt-legend">
          {!thin && (
            <>
              <li>
                <i className="gr-lt-key tone-xp" aria-hidden="true" />
                <span className="gr-lt-name">
                  {curve!.levels[0]!.toFixed(2) ===
                  curve!.levels[curve!.levels.length - 1]!.toFixed(2)
                    ? `Level ${curve!.levels[0]!.toFixed(2)} — level with where the window opened`
                    : `Level ${curve!.levels[0]!.toFixed(2)} → ${curve!.levels[
                        curve!.levels.length - 1
                      ]!.toFixed(2)}`}
                </span>
              </li>
              {curve!.milestones.length > 0 && (
                <li>
                  <i className="gr-lt-key is-mile" aria-hidden="true" />
                  <span className="gr-lt-name">
                    {curve!.milestones.length} level
                    {curve!.milestones.length === 1 ? '' : 's'} reached in this window
                  </span>
                </li>
              )}
            </>
          )}
        </ul>
      </section>


      {/* --- The same skill, five ways -------------------------------------- */}
      <section className="gr-panel gr-balance">
        <PanelHead
          title="Balance"
          hint="Five readings, each against your best subject"
          note={chosen?.label}
        />
        {balance.length === 0 ? (
          <p className="gr-empty">Choose a skill.</p>
        ) : (
          <>
            <Radar axes={balance} />
            <ul className="gr-balance-list">
              {balance.map((axis) => (
                <li key={axis.key} title={axis.note}>
                  <span className="gr-balance-name">{axis.label}</span>
                  <span className="gr-balance-value">{axis.value}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* --- The ladder ahead ------------------------------------------------ */}
      <section className="gr-panel gr-span-2">
        <PanelHead
          title={chosen ? `${chosen.label} — mastery track` : 'Mastery track'}
          icon="award"
          hint="The levels behind and ahead, with what each costs"
          note={
            chosen && chosen.xp30 > 0
              ? `${Math.round(chosen.xp30 / 30)} XP a day lately`
              : 'no pace to project from'
          }
        />
        <ol className="gr-track">
          {track.map((node) => (
            <li className={`gr-track-node is-${node.state}`} key={node.tier}>
              <span className="gr-track-mark" aria-hidden="true">
                {node.state === 'done' ? <Glyph name="check" size={13} /> : node.tier}
              </span>
              <div className="gr-track-body">
                <span className="gr-track-name">
                  Level {node.tier} · {node.rank}
                </span>
                <span className="gr-track-sub">
                  {node.state === 'done'
                    ? `cleared at ${Math.round(node.needs).toLocaleString()} XP`
                    : node.state === 'current'
                      ? `${node.percent}% through · ${Math.round(
                          chosen?.level.toNext ?? 0,
                        ).toLocaleString()} XP to go`
                      : node.inDays === null
                        ? `${Math.round(node.needs).toLocaleString()} XP · no pace to estimate from`
                        : `${Math.round(node.needs).toLocaleString()} XP · about ${node.inDays} days away`}
                </span>
                <span className="gr-track-rail">
                  <i className="gr-track-fill" style={{ width: `${node.percent}%` }} />
                </span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* --- Which way each is going ----------------------------------------- */}
      <section className="gr-panel">
        <PanelHead
          title="Moving and waiting"
          icon="trend"
          hint="The last 30 days against the 30 before"
        />
        <div className="gr-movers">
          <div>
            <h3 className="gr-movers-title">Fastest growing</h3>
            {moving.rising.length === 0 ? (
              <p className="gr-empty">Needs two months of history.</p>
            ) : (
              <ol className="gr-movers-list">
                {moving.rising.map((row) => (
                  <li key={row.key}>
                    <span className="gr-movers-name">{row.label}</span>
                    <span className="gr-movers-pct is-up">
                      {row.pct >= 0 ? '+' : '−'}
                      {Math.abs(row.pct)}%
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <h3 className="gr-movers-title">Room to grow</h3>
            {moving.waiting.length === 0 ? (
              <p className="gr-empty">Nothing waiting.</p>
            ) : (
              <ol className="gr-movers-list">
                {moving.waiting.map((row) => (
                  <li key={row.key} title={row.note}>
                    <span className="gr-movers-name">{row.label}</span>
                    <span className="gr-movers-pct">
                      {row.pct >= 0 ? '+' : '−'}
                      {Math.abs(row.pct)}%
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </section>

      {/* --- What this page can and cannot see ------------------------------ */}
      <section className="gr-panel gr-span-3">
        <PanelHead title="How these are counted" icon="bulb" />
        <Notes
          rows={[
            {
              tone: 'note',
              icon: 'info',
              head: 'Each subject you work on becomes a skill.',
              hint: `Levels run from 1 to ${MAX_LEVEL} and get harder as you go: level 1 costs ${costOf(1)} XP, level 99 costs ${costOf(99).toLocaleString()}. Separate from your account level.`,
            },
            {
              tone: unfiled.xp > lifetime ? 'watch' : 'note',
              icon: unfiled.xp > lifetime ? 'alert' : 'info',
              head: `${Math.round(unfiled.xp).toLocaleString()} XP is filed under no subject.`,
              hint:
                unfiled.count === 0
                  ? 'All your finished tasks have a subject.'
                  : `${unfiled.count} finished tasks have no subject, so they only count toward your account level.`,
            },
            {
              tone: 'watch',
              icon: 'alert',
              head: 'Skills have no prerequisites.',
              hint: 'The levels above show your progress in each skill.',
            },
            {
              tone: 'good',
              icon: 'check',
              head: `${top.label} is your biggest at ${Math.round(top.xp).toLocaleString()} XP.`,
              hint: `${Math.round((top.xp / Math.max(1, lifetime)) * 100)}% of your subject XP, from ${top.tasks} tasks.`,
            },
          ]}
        />
      </section>
    </div>
  );
}

// --------------------------------------------------------------------------
// The level curve
// --------------------------------------------------------------------------
/** How many points a subject's own history needs before its line is drawn. */
const CURVE_FLOOR = 4;

/**
 * A subject's level over time, with its level-ups marked.
 *
 * The y axis is whole levels rather than XP, because the question this panel
 * answers is "am I getting better", and XP is the currency rather than the
 * answer. It reuses the long-term panel's classes so it reads as the same chart
 * language as the rest of the page rather than as a second one — with one
 * addition: the area under the line is washed in the accent, fading out
 * downwards, because a single line in a wide box is a thin thing to look at and
 * this is the panel the tab is named after.
 */
function LevelPlot({ curve }: { curve: NonNullable<ReturnType<typeof skillCurve>> }) {
  const low = curve.ticks[0]!;
  const high = curve.ticks[curve.ticks.length - 1]!;
  const span = Math.max(0.001, high - low);
  const step = curve.levels.length > 1 ? W / (curve.levels.length - 1) : 0;
  const y = (level: number) => H - ((level - low) / span) * H;

  const path = curve.levels
    .map((level, index) => `${index === 0 ? 'M' : 'L'}${(index * step).toFixed(2)} ${y(level).toFixed(2)}`)
    .join(' ');
  // The same line, closed along the floor of the box — the wash.
  const area = `${path} L${((curve.levels.length - 1) * step).toFixed(2)} ${H} L0 ${H} Z`;

  return (
    <div className="gr-lt-plot">
      <div className="gr-lt-ticks" aria-hidden="true">
        {[...curve.ticks].reverse().map((tick) => (
          <span key={tick}>L{tick}</span>
        ))}
      </div>

      <div className="gr-lt-box">
        <svg
          className="gr-lt-svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Level ${curve.levels[0]!.toFixed(2)} to ${curve.levels[
            curve.levels.length - 1
          ]!.toFixed(2)} over the window.`}
        >
          <defs>
            {/* Bounding-box units, so the wash follows the box however the
                panel is stretched — the plot is drawn with
                `preserveAspectRatio="none"`. */}
            <linearGradient id="grSkillWash" x1="0" y1="0" x2="0" y2="1">
              {/* The stops are coloured from the stylesheet rather than here, so
                  the wash follows the page's accent into the dark theme.
                  `currentColor` would not do it: inside <defs> it resolves
                  against the gradient's own inherited colour, not against the
                  path that references it — which is why this came out grey. */}
              <stop className="gr-lt-wash-top" offset="0%" />
              <stop className="gr-lt-wash-foot" offset="100%" />
            </linearGradient>
          </defs>
          {curve.ticks.map((tick) => (
            <line
              key={tick}
              className="gr-lt-grid"
              x1="0"
              x2={W}
              y1={y(tick)}
              y2={y(tick)}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path className="gr-lt-area" d={area} />
          <path className="gr-lt-line tone-xp" d={path} vectorEffect="non-scaling-stroke" />
        </svg>

        <div className="gr-lt-dots" aria-hidden="true">
          {curve.milestones.map((mile) => (
            <i
              key={mile.tier}
              className="gr-lt-dot is-mile"
              title={mile.on ? `Level ${mile.tier} on ${longDate(mile.on)}` : `Level ${mile.tier}`}
              style={{
                left: `${mile.index * step}%`,
                bottom: `${Math.max(0, Math.min(100, 100 - y(curve.levels[mile.index]!)))}%`,
                ['--i' as string]: mile.index,
                ['--n' as string]: Math.max(1, curve.levels.length - 1),
              }}
            />
          ))}
        </div>

        {/* The date a level was reached. Not the level — the axis says which
            one, and printing it twice reads as a mistake rather than a label. */}
        <div className="gr-lt-marks" aria-hidden="true">
          {curve.milestones.map((mile) => (
            <span
              key={mile.tier}
              // Only a mark actually at the right edge tucks in; `is-end` on the
              // last milestone regardless would drag one sitting at x=0 off the axis.
              className={mile.index === curve.levels.length - 1 ? 'is-end' : undefined}
              style={{ left: `${mile.index * step}%` }}
            >
              {mile.on ? shortDate(mile.on) : `L${mile.tier}`}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// The radar
// --------------------------------------------------------------------------
/** "12 Aug" — a mark under the point a level was reached. */
function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** Where the pentagon sits in its own box, in the viewBox's units. */
const RADAR_CENTRE = 50;
const RADAR_RADIUS = 34;

/**
 * Five axes on one polygon.
 *
 * Drawn in a square viewBox with the default `meet` fit rather than stretched,
 * because a radar that is not round is not a radar — it is the one chart on
 * this page that cannot afford `preserveAspectRatio="none"`, which is what
 * every other plot here uses to fill its panel.
 */
function Radar({ axes }: { axes: Array<{ key: string; label: string; value: number }> }) {
  const at = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    const distance = (Math.max(0, Math.min(100, value)) / 100) * RADAR_RADIUS;
    return [
      RADAR_CENTRE + Math.cos(angle) * distance,
      RADAR_CENTRE + Math.sin(angle) * distance,
    ] as const;
  };

  const ring = (value: number) =>
    axes
      .map((_, index) => {
        const [x, y] = at(index, value);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');

  return (
    <svg className="gr-radar" viewBox="0 0 100 100" role="img" aria-label="Skill balance">
      {[25, 50, 75, 100].map((level) => (
        <polygon key={level} className="gr-radar-ring" points={ring(level)} />
      ))}
      {axes.map((axis, index) => {
        const [x, y] = at(index, 100);
        return (
          <line
            key={axis.key}
            className="gr-radar-spoke"
            x1={RADAR_CENTRE}
            y1={RADAR_CENTRE}
            x2={x}
            y2={y}
          />
        );
      })}
      <polygon
        className="gr-radar-area"
        points={axes.map((axis, index) => {
          const [x, y] = at(index, axis.value);
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        }).join(' ')}
      />
      {axes.map((axis, index) => {
        const [x, y] = at(index, axis.value);
        return <circle key={axis.key} className="gr-radar-dot" cx={x} cy={y} r="1.6" />;
      })}
    </svg>
  );
}
