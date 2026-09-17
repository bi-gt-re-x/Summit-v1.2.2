/**
 * Goals — whether what the reader aimed at is going to happen.
 *
 * No `Building` gate, unlike the tab it replaced. Trends needed three weeks
 * before a slope meant anything; this needs a goal, and an account with none is
 * exactly who the empty state here is written for — telling them to come back
 * in three weeks would be answering a question they did not ask.
 *
 * Every figure is arithmetic the model already did over the goals fetched for
 * the Records tab, so this tab costs no request of its own.
 */
import {
  CheckpointsPanel as GoalCheckpointsPanel,
  EffortPanel as GoalEffortPanel,
  GoalTiles,
  NotesPanel as GoalNotesPanel,
  PaceMapPanel as GoalPaceMapPanel,
  PacePanel as GoalPacePanel,
  PortfolioPanel as GoalPortfolioPanel,
  SuggestPanel as GoalSuggestPanel,
} from '../GoalsView';
import { PanelGroup } from '../charts';
import type { AnalyticsModel } from '../useAnalyticsModel';

export function GoalsTab({ model }: { model: AnalyticsModel }) {
  const {
    goalLead, goalSet, goalPace, goalCheckpoints, goalEffort, liveGoals, tasks, goalRows, goalIdeas,
    /* How much supporting detail was asked for. This tab read the tone and not
       this, so the notes list ran to whatever length the account's goals
       happened to give it at every setting. */
    detail,
    /* What the account asked this page to be — see utils/analyticsPrefs. Two
       reads on this tab: which half of the count `goalLead` opens on, and how
       many suggestions are put in front of somebody at once. Neither moves a
       figure; `goalsOverview` counts the same goals at every setting. */
    toneRules,
  } = model;

  return (
    <>
      {/* ---- Goals ---------------------------------------------------
          No `Building` gate, unlike the tab it replaced. Trends needed three
          weeks before a slope meant anything; this needs a goal, and an
          account with none is exactly who the empty state here is written
          for — telling them to come back in three weeks would be answering
          a question they did not ask. */}
      {/* A dozen words, above everything. A reader who opens this tab
          and reads one thing should read this one — see `goalHeadline`
          for why it is assembled rather than written. */}
      <p className="ax-goal-lead">{goalLead}</p>

      {/* Five figures, above everything that explains them — the slot the
          Overview gives `Tiles` and every other tab gives a `StatRow`. This
          tab opened on the sentence alone and made the reader find the answer
          inside a panel. */}
      <section className="ax-section">
        <GoalTiles overview={goalSet} />
      </section>

      {/* The set, then the one chart the tab is really for. */}
      <section className="ax-section ax-grid ax-grid-halves-even">
        <GoalPortfolioPanel overview={goalSet} />
        <GoalPaceMapPanel points={goalPace.points} undated={goalPace.undated} />
      </section>

      {/*
        The three rows the pace map raises and cannot answer, folded.

        The sentence, the five figures and the two charts above are the tab's
        answer to "is what I aimed at going to happen". These are the follow-up
        — what has actually been reached, how each live goal is pacing, and
        what to aim at next — and they were three more rows of equal-weight
        panels between the reader and the bottom of the page.
      */}
      <section className="ax-section">
        <PanelGroup
          title="What you have reached"
          note="Checkpoints cleared, and where the effort went"
        >
          <div className="ax-grid ax-grid-halves-even">
            <GoalCheckpointsPanel months={goalCheckpoints} />
            <GoalEffortPanel rows={goalEffort} />
          </div>
        </PanelGroup>

        <PanelGroup
          title="Pace and notes"
          note="How each live goal is tracking, and what you wrote on them"
        >
          <div className="ax-grid ax-grid-halves-even">
            <GoalPacePanel goals={liveGoals} tasks={tasks} />
            {/* Evidence rather than diagnosis — what you wrote on the goals,
                not a verdict about them — so this follows the detail setting
                and not the harshness one. */}
            <GoalNotesPanel notes={goalRows.slice(0, detail.rows)} />
          </div>
        </PanelGroup>

        <PanelGroup
          title="What to aim at next"
          note="Goals suggested from what your record already shows"
        >
          <GoalSuggestPanel suggestions={goalIdeas} limit={toneRules.headlines} />
        </PanelGroup>
      </section>
    </>
  );
}
