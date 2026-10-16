/**
 * One block on the time grid — an event, or a task.
 *
 * The two share a shape and differ in what they can tell you. An event says
 * when it runs; a task carries its XP, its difficulty and whether it is
 * overdue, finished, or running on into tomorrow. Both carry the icon guessed
 * from their name and the three-dots menu.
 *
 * **No colour is written here.** Every block carries `data-family` — one of the
 * twelve in utils/eventPalette — and styles/calendar/palette.css turns that into
 * a tint, an edge and an ink for whichever theme and state it is in. The one
 * thing that is not the family's is a task's left edge, which is its
 * difficulty; the category is then carried by the tint and by the dot beside
 * the name, so it is never invisible.
 *
 * A task's *name* is the button, not the block: clicking it finishes the task.
 * That is deliberate and is why the title has a role of its own — the rest of
 * the block is the block, and only the name is a commitment.
 */
import { CardMenu } from './CardMenu';
import { iconUrlFor } from '@/utils/calendarIcons';
import { blockLabel, hmToDate, rangeLabel, type Block } from '@/utils/calendarGrid';
import { dates } from '@/utils';

export interface GridBlockProps {
  block: Block;
  /** The day this block is drawn on, for the actions that need to know. */
  iso: string;
  onEdit: (block: Block) => void;
  onDelete: (block: Block) => void;
  /** Finishing a task from its name. Events have nothing to finish. */
  onComplete: (taskId: string) => void;
  /** True while its completion is in flight, so it cannot be clicked twice. */
  completing?: boolean;
  /**
   * One of the two blocks the overlap dialog is asking about. Rings it, so
   * "Show me on the grid" has something to point at.
   */
  flagged?: boolean;
  /**
   * Painted for a moment, for a block somebody was *sent* to.
   *
   * The top bar's search takes a calendar task to the day it sits on and then
   * has to say which of the day's blocks it meant — see pages/Calendar/Day.
   */
  marked?: boolean;
}

/**
 * A block's title, with its icon on the same line.
 *
 * The icon used to be a badge floated against the block's left edge and
 * vertically centred, and only in the Day view — the Week's columns were
 * judged too narrow for it, so six days out of seven a block had no picture at
 * all. It sits inline ahead of the name in both views now, which is where the
 * design puts it: the name is the line it belongs to, and the times and the XP
 * underneath keep the block's full width instead of being indented past a
 * badge that has nothing to do with them.
 *
 * Where the drawing comes from is the other half. `iconUrlFor` guesses one
 * from the name and is still the fallback, but a task that has been *told* what
 * it is about should not be guessed at — so a task filed under a subject wears
 * that subject's icon, the same one the picker showed when it was chosen and
 * the same one the dashboard's row and the week's XP breakdown draw beside it.
 *
 * `.cal-ico` is a mask, so the SVG is painted in the block's own text colour
 * and stays legible in either theme.
 */
function BlockTitle({
  name,
  icon,
  subject,
  dot,
  done,
  children,
}: {
  name: string;
  /** A subject's icon file, when the thing has a subject. */
  icon?: string;
  /** The subject's label, for the title attribute. */
  subject?: string;
  /**
   * Draw the small category mark ahead of the icon.
   *
   * Tasks only. An event says which family it is in with the accent down its
   * left edge; on a task that edge is spent on difficulty, so the family needs
   * somewhere else to be said out loud. The tint alone is not enough — at the
   * lightest rung two families can look similar across a whole grid — and this
   * is a solid 7px of the accent itself.
   */
  dot?: boolean;
  /**
   * The task is finished, so the mark is a tick rather than a dot.
   *
   * The same slot, the same colour, one glyph instead of a disc — a finished
   * task used to carry both, which is two marks saying two things in the space
   * the eye reads as one. The tick is the more useful of the two and the family
   * is still on the block in its tint, so this is the one that wins.
   */
  done?: boolean;
  /** The ✓ or the tick placeholder a task puts before its name. */
  children?: React.ReactNode;
}) {
  const url = icon ? `/static/icons/${icon}.svg` : iconUrlFor(name);
  return (
    <>
      {dot &&
        (done ? (
          <span className="cal-dot is-done" aria-hidden="true">
            ✓
          </span>
        ) : (
          <i className="cal-dot" aria-hidden="true" />
        ))}
      <i
        className="cal-ico wk-event-ico"
        style={{ ['--ico' as string]: `url(${url})` }}
        title={subject}
        aria-hidden="true"
      />
      {children}
      <span className="wk-event-name">{name}</span>
    </>
  );
}

/**
 * The two strips that change one end's time.
 *
 * Dragging the rest of the block moves the whole thing, so these have to be
 * distinguishable targets — hooks/useGridDrag reads which one the press landed
 * on. They are invisible until hovered; styles/calendar/week.css draws them.
 */
function ResizeHandles() {
  return (
    <>
      <span className="wk-resize wk-resize-top" aria-hidden="true" />
      <span className="wk-resize wk-resize-bot" aria-hidden="true" />
    </>
  );
}

/**
 * Everything the block knows, in one line — for its tooltip and for a screen
 * reader's ear.
 *
 * A block on a week is a seventh of the grid wide, so its name is very often
 * an ellipsis: `Machine Learni…`, `Abstract algebr…`, and on a strip narrow
 * enough to drop its time, `Morning meditation` with nothing after it. The
 * grid *has* all of these facts and was showing whichever fitted.
 *
 * So this is the whole of it, said once, and hung on the element twice: as
 * `title`, which is what a pointer gets after a second of hovering, and as
 * `aria-label`, which is what a screen reader is told instead of trying to
 * assemble the block out of its parts. They are the same string on purpose —
 * a tooltip that says more than the accessible name is a tooltip somebody will
 * have to notice is missing.
 *
 * Order is name, then when, then what it is worth, then its state. State comes
 * last because most blocks have none, and a label that opens with "Done," on
 * the ones that do would put the useful part after the noise.
 */
function blockSummary(block: Block): string {
  const parts: string[] = [];

  if (block.kind === 'event') {
    parts.push(block.name);
    parts.push(rangeLabel(hmToDate(block.startHM), hmToDate(block.endHM)));
    return parts.join(' · ');
  }

  parts.push(block.title);
  parts.push(rangeLabel(block.startDT, block.dueDT ?? block.startDT));
  if (block.subjectLabel) parts.push(block.subjectLabel);
  parts.push(`${block.xp} XP`);
  if (block.done) parts.push('done');
  else if (block.overdue) parts.push('overdue');
  if (block.contDT) {
    parts.push(
      `continues on ${dates.formatDate(block.contDT, { month: 'short', day: 'numeric' })}`,
    );
  }
  return parts.join(' · ');
}

export function GridBlock({
  block,
  iso,
  onEdit,
  onDelete,
  onComplete,
  completing,
  flagged,
  marked,
}: GridBlockProps) {
  const clash = flagged ? ' is-clashing' : '';
  const summary = blockSummary(block);
  const position = {
    top: block.top,
    height: block.height,
    left: 4,
    right: 4,
  };

  if (block.kind === 'event') {
    return (
      <div
        className={`wk-event wk-event-cal${block.compact ? ' is-compact' : ''}${
          block.snug ? ' is-snug' : ''
        }${clash}`}
        data-kind="event"
        data-iso={iso}
        data-id={block.name}
        data-start={block.startHM}
        data-end={block.endHM}
        data-move="1"
        // Every colour on this element comes from the family — see
        // styles/calendar/palette.css. Nothing is painted inline any more.
        data-family={block.family}
        style={position}
        title={summary}
        aria-label={summary}
      >
        <ResizeHandles />
        <CardMenu
          height={block.height}
          onEdit={() => onEdit(block)}
          onDelete={() => onDelete(block)}
        />

        {block.compact ? (
          <div className="wk-event-head">
            <div className="wk-event-title">
              <BlockTitle name={block.name} />
            </div>
            {/* The whole span, as on every other block. This said the start
                alone, which on the one-row layout is the only time there is
                room for — and "8:30" on a block that runs to 9:15 is the half
                of the fact that raises the question. The range is three
                characters longer and the name gives way for them. */}
            <span className="wk-event-start">
              {rangeLabel(hmToDate(block.startHM), hmToDate(block.endHM))}
            </span>
          </div>
        ) : (
          <>
            <div className="wk-event-title">
              <BlockTitle name={block.name} />
            </div>
            <div className="wk-event-foot">
              <span className="wk-event-due">
                {rangeLabel(hmToDate(block.startHM), hmToDate(block.endHM))}
              </span>
            </div>
          </>
        )}
      </div>
    );
  }

  // Difficulty is not a colour on the calendar.
  //
  // It was the whole block once — a task painted blue, amber or red end to end,
  // so twenty tasks on a week were three colours and the only thing a reader
  // could tell at a glance was how hard their week was, not which of the twenty
  // they were looking at. Then it was the left edge alone, which was quieter
  // and still a second colour system competing with the subject family for the
  // one thing colour on a grid is good at: telling blocks apart.
  //
  // The class is kept because it is a true fact about the element and cheap to
  // carry — anything that wants to select on difficulty still can. Nothing in
  // styles/calendar/palette.css paints with it.
  const priorityClass =
    block.priority === 'high' ? 'prio-high' : block.priority === 'medium' ? 'prio-medium' : 'prio-low';


  // A task says when it runs, once, as a range: "11 AM – 12:25 PM".
  //
  // The two ends used to be split across the block — the start beside the name
  // on the top edge, the end alone on the floor — on the reasoning that the
  // block *is* the span, so each label sat on the line the reader was already
  // reading that time off. It reads worse than it argues. A time on its own is
  // ambiguous about which end it is, the two are far enough apart on a tall
  // block that they stop being a pair, and it made tasks the only thing on the
  // grid that did not write its hours the way events do. One line, one form,
  // both kinds.
  //
  // The one exception is a task that overruns the column: it says where it
  // goes instead, because that is a different day and a time alone would not
  // say so.
  const endDT = block.dueDT ?? block.startDT;
  let footText = rangeLabel(block.startDT, endDT);
  let footClass = 'wk-event-due';
  if (block.contDT) {
    // The one case that names a day, because it is a different one.
    footText = `Continued on ${dates.formatDate(block.contDT, { month: 'short', day: 'numeric' })}`;
    footClass = 'wk-event-cont';
  }

  // The one-row layout has no floor to put the range on, so it goes beside the
  // name — the same string, in the only place there is.
  const headText = block.compact ? rangeLabel(block.startDT, endDT) : '';
  const title = `${block.title}${block.cont ? '(continued)' : ''}`;

  return (
    <div
      className={`wk-event wk-task ${priorityClass}${block.done ? ' is-done' : ''}${
        block.overdue ? ' is-overdue' : ''
      }${
        block.compact ? ' is-compact' : ''
      }${block.snug ? ' is-snug' : ''}${completing ? ' is-completing' : ''}${clash}${
        marked ? ' is-found' : ''
      }`}
      data-kind="task"
      data-iso={iso}
      data-id={block.id}
      // A finished task is a record of what happened, so it does not move.
      data-move={block.done ? undefined : '1'}
      // The family paints the tint, the edge and the ink, the left edge
      // included. See styles/calendar/palette.css.
      data-family={block.family}
      style={position}
      title={summary}
      /* The name inside is a button that finishes the task and has its own
         label; this one describes the block. */
      aria-label={summary}
    >
      {!block.done && <ResizeHandles />}
      <CardMenu
        height={block.height}
        onEdit={() => onEdit(block)}
        onDelete={() => onDelete(block)}
      />

      <div className="wk-event-head">
        {block.done ? (
          <div className="wk-event-title">
            <BlockTitle
              name={title}
              icon={block.subjectIcon}
              subject={block.subjectLabel}
              dot
              done
            />
          </div>
        ) : (
          <div
            className="wk-event-title wk-task-name"
            role="button"
            tabIndex={0}
            title="Click to mark complete"
            onClick={(event) => {
              event.stopPropagation();
              onComplete(block.id);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onComplete(block.id);
            }}
          >
            <BlockTitle
              name={title}
              icon={block.subjectIcon}
              subject={block.subjectLabel}
              dot
            >
              <span className="wk-task-tick" aria-hidden="true">
                ✓
              </span>
            </BlockTitle>
          </div>
        )}
        {headText && <span className="wk-event-start">{headText}</span>}
      </div>

      {!block.compact && (
        <>
          {/* "+ 60 XP", as the design writes it — what finishing this is worth,
              not a quantity it already has. It stays with the name at the top:
              only the end time goes to the floor of the block. */}
          <span className="wk-event-xp">+ {block.xp} XP</span>
          {footText && <span className={`wk-event-end ${footClass}`}>{footText}</span>}
        </>
      )}
    </div>
  );
}

/** The label a dialog should use for a block. */
export { blockLabel };
