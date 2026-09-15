/**
 * The handful of skills worth starting next, above the canvas.
 *
 * ## What it is, and what it carefully is not
 *
 * Not a recommendation engine. Every figure on this strip is already on the
 * lattice as colour and lines — a status, a percentage, a count of what a node
 * opens — and all this does is read them and put the answer in a sentence. The
 * ranking is `opportunities` in skills/route; this file draws it.
 *
 * That split is the point. The lattice stays an **authored** hierarchy, the
 * same on every account, and nothing here writes back to it. What was missing
 * was never data: it was that a reader had to scan forty tiles for the green
 * ones and then work out which of the green ones to do, and the page already
 * knew.
 *
 * ## One lead, then the rest
 *
 * The first is drawn as the answer and the other two as alternatives, because
 * "here are three equally good options" is the shape of advice that gets
 * ignored. The lead carries what it opens; the others carry only why they are
 * on the list.
 *
 * ## Show on the map is a different verb from open
 *
 * Both select the node — the panel and the focus layer follow a selection
 * either way — but a row that is off the bottom of a lattice needs the canvas
 * scrolled to it as well, and a reader who pressed a control on a strip should
 * not then have to go looking. So the page is handed both the id and the
 * intent, and `SkillTree`'s `reveal` does the scrolling.
 */
import type { Opportunity } from '@/skills/route';

export interface NextUpProps {
  chances: Opportunity[];
  /** Select it, and scroll the canvas until it is on screen. */
  onOpen: (id: string) => void;
}

export function NextUp({ chances, onOpen }: NextUpProps) {
  const [lead, ...rest] = chances;
  if (!lead) return null;

  return (
    <section className="stx-next" aria-label="What to do next">
      <div className="stx-next-lead">
        <span className="stx-next-label">Next up</span>
        <div className="stx-next-say">
          <strong>{lead.node.name}</strong>
          <span>
            {lead.why}
            {lead.opens > 0 && (
              <>
                {' · opens '}
                {lead.opens} {lead.opens === 1 ? 'skill' : 'skills'}
              </>
            )}
          </span>
        </div>
        <button type="button" className="stx-next-open" onClick={() => onOpen(lead.node.id)}>
          Open skill
        </button>
      </div>

      {rest.length > 0 && (
        <ul className="stx-next-rest">
          {rest.map((chance) => (
            <li key={chance.node.id}>
              <button type="button" onClick={() => onOpen(chance.node.id)}>
                <span className="stx-next-name">{chance.node.name}</span>
                <em>{chance.why}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
