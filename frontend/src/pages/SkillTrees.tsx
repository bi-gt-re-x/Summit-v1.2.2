/**
 * Skill Tree — the page.
 *
 * ## The shape of it
 *
 * A band of figures across the top, the lattice and its detail panel side by
 * side under that, and a legend along the bottom. The page holds which tree is
 * open and which node is picked and does nothing else: the canvas owns pan,
 * zoom, the vertical scroll and full screen, the layout in utils/skillGraph
 * owns placement, and skills/subjectTrees owns what is in a tree and where it
 * forks. This file is the seam between them.
 *
 * ## Walking between subjects
 *
 * A subject too big for one canvas forks into others, and a fork is a single
 * navigation node — a diamond that, clicked, opens the child tree rather than
 * selecting a skill. The child names its parent, so the breadcrumb is the way
 * back up, and the switcher jumps between the top-level subjects outright.
 * Changing tree clears the selection, or the panel would be describing a node
 * no longer on the canvas.
 *
 * ## The first visit is a question, not a page
 *
 * An account that has never chosen its five focus topics is shown `FocusSetup`
 * instead of the lattice — the whole page, not a banner on it. The five have
 * always been derivable, and they are still derived where somebody skips; what
 * they were not was *asked*, so a new reader met a band of five subjects picked
 * by a tie-break between zeroes and no indication that the band was theirs. The
 * gate is "has this account ever chosen", which is `loadFocus` returning null,
 * and the answer being written is what closes it. See components/SkillTree/FocusSetup.
 *
 * ## Where the reader is, and what that dims
 *
 * The canvas always marks one tile **You are here** — `currentSkill` in
 * skills/route, the furthest-along thing in progress, falling back to the best
 * thing open. That is drawn on an untouched canvas with nothing else changed,
 * because a page that greys out thirty-six of its forty tiles before anybody
 * has clicked is a page that opens broken.
 *
 * Selecting a tile turns the focus layer *on*: the selection takes the marker,
 * everything one edge away is emphasised, and the rest of the lattice goes
 * back. Double-clicking widens that from the neighbours to the whole
 * prerequisite chain. Both are transient — nothing is stored, and clearing the
 * selection puts the canvas back exactly as it was.
 *
 * ## Pointing at a tile is a question too
 *
 * A tile is 64px and can hold three facts, so everything else about a skill
 * needed a click — and finding one node among forty meant opening nine panels
 * to read nine of them. Resting the pointer on a tile now raises a card with
 * what it waits on, how much of that is done, and what it opens. It is drawn
 * from the same `focusOn` the focus layer and the route strip run, so it
 * cannot disagree with either. See components/SkillTree/TilePeek.
 *
 * ## Searching lands *on* the thing
 *
 * The search reaches every subject, every lattice and all eleven hundred
 * skills, and picking a skill has to do four things at once: open its tree,
 * select it, fill the panel, and scroll the canvas until it is on screen. The
 * last was missing, which made the first three feel broken — the right tree
 * opened at its top-left corner with the panel describing something the reader
 * could not see. `openTree` says all four in one call.
 *
 * ## Pointing the canvas at something
 *
 * Zoom answers "how magnified is this", which is never what a reader wants to
 * know. The canvas takes a *set of nodes* and works out the scale and the
 * scroll that bring them into view together; this page decides which set,
 * because "the branch I am in" and "everything I have mastered" are judgements
 * about meaning and the canvas has none. Two of the framings are buttons in
 * the canvas's own control cluster — Branch and Here, handed in through
 * `views` — and the rest are the figures in the band, which now move the
 * camera as well as dimming: a figure that says "twelve locked" and leaves you
 * to find the twelve has answered half a question.
 *
 * ## Three drawings of one tree
 *
 * Map, Path and Progress — see components/SkillTree/ModeSwitch for the
 * argument. The rule that keeps them honest is here: only the **canvas** is
 * handed the narrowed graph. The band, the panel, the next-up strip, the hover
 * card and the gate fractions all stay on the full one, because they describe
 * the tree and a view is not a fact about a tree. A reader in Path mode who
 * saw "12 skills, 61%" would have been shown a different subject rather than a
 * different picture of this one.
 *
 * ## Two things that had no keyboard and one that had no explanation
 *
 * The tiles have always been buttons, so Tab and Enter worked; nothing else
 * did. The arrows now walk between tiles — spatially, because a reader
 * pressing → means *that one, over there* — and four page verbs have letters:
 * Esc clears, F frames where you are, R fits the tree, P practises. Every one
 * of them is a control already on the page, which is the rule the set was
 * chosen by. See hooks/useLatticeKeys, and components/SkillTree/SubjectRail
 * for `/`.
 *
 * And the edges, which is where the structure of a subject actually lives,
 * could not be interrogated at all: solid against dashed, explained once in a
 * legend. Clicking a line now says which of the two it is and what that means
 * for the node on the end of it — derived from the graph rather than authored,
 * because sixty trees' worth of per-edge prose would be half-written within a
 * month. See components/SkillTree/EdgeCard.
 *
 * ## The figures are counted, not stored
 *
 * Every number in the band is `tallyGraph` on the tree that is open — there is
 * no second copy of "how many are mastered" to drift from the tiles. Skill
 * level is the one derived thing, and it is derived here rather than in the
 * data because it is a reading of the tally rather than a fact about a subject.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ambient, PageHero } from '@/components';
import {
  EdgeCard,
  FocusSetup,
  FocusTopics,
  LatticeNode,
  LatticePanel,
  ModeSwitch,
  NextUp,
  ProgressIndicator,
  RouteStrip,
  SkillTree as SkillTreeCanvas,
  SubjectRail,
  TilePeek,
  type TreeMode,
} from '@/components/SkillTree';
import {
  useAuth,
  useDocumentTitle,
  useLatticeKeys,
  usePageEntrance,
  useSubjects,
} from '@/hooks';
import { iconForName } from '@/skills/iconMatch';
import {
  branchIds,
  currentSkill,
  emphasise,
  focusOn,
  gatesOf,
  litBy,
  opportunities,
  optionalIds,
  pathOf,
  spotlight,
  type Lens,
} from '@/skills/route';
import { latticeSubjects, treeForSubject } from '@/skills/subjectMap';
import {
  DEFAULT_TREE,
  childrenOf,
  graphFromSubjectTree,
  iconUrl,
  navTargets,
  parentChain,
  parentOf,
  siblingsOf,
  subjectTreeById,
} from '@/skills/subjectTrees';
import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  LATTICE_GEOM,
  keepOnly,
  tallyGraph,
  type GraphNode,
  type GraphTally,
  type PlacedEdge,
} from '@/utils/skillGraph';
import { FOCUS_COUNT, loadFocus, resolveFocus, saveFocus } from '@/utils/focusTopics';
import {
  applyProgress,
  loadProgress,
  practiceGain,
  saveProgress,
  type SkillProgress,
} from '@/utils/skillProgress';
import {
  applyNames,
  cleanName,
  loadNames,
  saveNames,
  type NodeNames,
} from '@/utils/skillNames';
import {
  loadSteps,
  saveSteps,
  type StepPlan,
  type StepPlans,
} from '@/utils/skillSteps';
import '@/styles/skilltree.css';

/** The drawing, painted through the shared mask. */
function Ico({ icon, className }: { icon: string; className: string }) {
  return <i className={className} style={{ ['--ico' as string]: `url(${iconUrl(icon)})` }} />;
}

/**
 * What to call how far down a tree somebody is.
 *
 * Bands rather than a number, because "Advanced" answers the question a reader
 * is actually asking and "61%" is already printed two inches to the left.
 */
function skillLevel(tally: GraphTally): string {
  if (tally.total === 0) return 'Unstarted';
  const share = (tally.complete + tally.progress * 0.5) / tally.total;
  if (share >= 0.85) return 'Master';
  if (share >= 0.6) return 'Expert';
  if (share >= 0.35) return 'Advanced';
  if (share >= 0.15) return 'Intermediate';
  if (share > 0) return 'Beginner';
  return 'Unstarted';
}

/**
 * One figure in the band across the top.
 *
 * Four of the six are also a control. "Twelve locked" was a fact a reader could
 * do nothing with — they still had to find the twelve — so pressing one narrows
 * the canvas to what it counted. The other two are not a subset of anything:
 * the overall percentage and the skill level describe the whole tree, and a
 * filter for "everything" is a button that does nothing.
 */
function Figure({
  label,
  value,
  sub,
  icon,
  tone,
  lens,
  on = false,
  onNarrow,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: string;
  tone?: string;
  /** What this figure counts, when pressing it can narrow the canvas to it. */
  lens?: Lens;
  on?: boolean;
  onNarrow?: (lens: Lens) => void;
}) {
  const body = (
    <>
      <div className="stx-figure-text">
        <span className="stx-figure-label">{label}</span>
        <strong className="stx-figure-value">
          {value}
          {sub && <em>{sub}</em>}
        </strong>
      </div>
      {icon && (
        <span className="stx-figure-badge">
          <Ico icon={icon} className="stx-ico stx-figure-ico" />
        </span>
      )}
    </>
  );

  const shape = `stx-figure${tone ? ` is-${tone}` : ''}`;

  if (!lens || !onNarrow) return <div className={shape}>{body}</div>;

  return (
    <button
      type="button"
      className={`${shape} is-lens${on ? ' is-on' : ''}`}
      aria-pressed={on}
      /* The label already says what it counts; this says what pressing it
         does, which is the part a figure cannot. */
      title={on ? `Show the whole tree again` : `Show only these on the tree`}
      onClick={() => onNarrow(lens)}
    >
      {body}
    </button>
  );
}

export default function SkillTrees() {
  useDocumentTitle('Skill Tree');

  const { username } = useAuth();
  // The account's own catalogue, usage-ordered by the endpoint. Everything at
  // the top of this page is drawn from it: the five focus cards, the rail, and
  // half of what the search can find.
  const catalogue = useSubjects(username);
  /* The hundred, without the ones this account invented — there is no lattice
     to route a custom subject to, and `treeForSubject`'s group fallback opens a
     confident wrong one. Dropped once here rather than at each of the four
     places below, so the setup screen cannot offer one, the band cannot hold
     one, the rail does not list one and the search cannot reach one. See
     `latticeSubjects` in skills/subjectMap for the whole argument. */
  const subjects = useMemo(() => latticeSubjects(catalogue), [catalogue]);
  const [treeId, setTreeId] = useState<string>(DEFAULT_TREE.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* Practice done on top of what the trees seed — see utils/skillProgress for
     why it lives in the browser. Loaded once per account, and written back on
     every change rather than on unmount, so a click survives a closed tab. */
  const [progress, setProgress] = useState<SkillProgress>({});
  useEffect(() => {
    setProgress(loadProgress(username));
  }, [username]);

  /* The programmes this account has rewritten. Same store, same reasoning —
     see utils/skillSteps. A node in here is counted in steps rather than XP,
     which is why it has to reach `applyProgress` rather than stopping at the
     panel: the tile, the ring and the band across the top all read the graph. */
  const [plans, setPlans] = useState<StepPlans>({});
  useEffect(() => {
    setPlans(loadSteps(username));
  }, [username]);

  /* The nodes this account has renamed, and the drawings those names found.
     Applied after progress rather than inside it: what a node is called has
     never affected how far along it is. See utils/skillNames. */
  const [names, setNames] = useState<NodeNames>({});
  useEffect(() => {
    setNames(loadNames(username));
  }, [username]);

  /* The five across the top. Null until this account has chosen, which is what
     lets the band follow the subjects they actually use until the moment they
     say otherwise — see utils/focusTopics. */
  const [chosenFocus, setChosenFocus] = useState<string[] | null>(null);
  /* Whether the read above has happened for *this* account, which is a
     different question from whether it found anything. Both states are null in
     `chosenFocus`, and the setup screen below is gated on "never chosen" — so
     without this the screen would flash in front of every reader for the tick
     between mount and the effect running. */
  const [focusRead, setFocusRead] = useState(false);
  useEffect(() => {
    setFocusRead(false);
    setChosenFocus(loadFocus(username));
    setFocusRead(true);
  }, [username]);

  /* Set when the reader chose "Decide later". Held for the visit rather than
     stored: skipping is not an answer, so the screen is offered again next
     time, and the band goes back to being derived in the meantime. */
  const [skippedSetup, setSkippedSetup] = useState(false);
  useEffect(() => {
    setSkippedSetup(false);
  }, [username]);

  const focus = useMemo(
    () => resolveFocus(chosenFocus, subjects.map((subject) => subject.id)),
    [chosenFocus, subjects],
  );

  const tree = subjectTreeById(treeId) ?? DEFAULT_TREE;

  const designed = useMemo(() => graphFromSubjectTree(tree), [tree]);
  // What is actually drawn: the designed tree with the account's practice added
  // and every status re-derived from the result. Everything downstream — the
  // canvas, the panel, the figures — reads this one graph, so a click cannot
  // move the tiles and leave the band behind.
  const graph = useMemo(
    () => applyNames(applyProgress(designed, progress, plans), names),
    [designed, progress, plans, names],
  );
  const nav = useMemo(() => navTargets(tree), [tree]);
  /* The doorways, as a set. Every reading of "where is this reader" and
     "what is worth doing" leaves them out: a diamond carries a status like any
     other node, and a door is never the thing somebody is working on or the
     thing a filter meant. Declared with the graph rather than beside its first
     use, because four things below now need it. */
  const navIds = useMemo(() => new Set(nav.keys()), [nav]);
  const totals = useMemo(() => tallyGraph(graph), [graph]);
  const chain = useMemo(() => parentChain(tree.id), [tree.id]);
  // The three ways out of this tree, so walking the hierarchy never depends on
  // finding the right diamond on the canvas.
  const up = useMemo(() => parentOf(tree.id), [tree.id]);
  const into = useMemo(() => childrenOf(tree.id), [tree.id]);
  const beside = useMemo(() => siblingsOf(tree.id), [tree.id]);

  // Everything the reader is currently inside, root first. The focus cards and
  // the rail light from this, so walking three forks down does not put every
  // pill out — see the note on `openTrail` in SubjectRail.
  const trail = useMemo(() => chain.map((entry) => entry.id), [chain]);

  /* ---- What the reader has narrowed the canvas to ----------------------
     Declared up here, above the two ways of changing tree, because both of
     those have to put every one of them back: a focus layer, a traced chain
     and a status filter are all readings of the lattice that is open, and
     carrying any of them into the next one would be answering a question
     about a tree nobody is looking at. The callbacks that set them are
     further down, with the rest of the selection.

     Whether the whole prerequisite chain is lit rather than only the
     neighbours. Held as a node id rather than a boolean so it cannot outlive
     the node it was asked for. */
  const [tracedId, setTracedId] = useState<string | null>(null);

  /* A selection and a lens ask the same question — *which of these forty
     concern me* — and answering it twice at once would be two dimmings
     fighting over one canvas. So each clears the other and the newer one
     wins, which is a rule a reader works out in one click rather than one
     they have to be told. */
  const [lens, setLens] = useState<Lens | null>(null);

  /* Scroll the canvas until a node is on screen. Only for the controls that
     select something the reader cannot see — the next-up strip, the route
     crumbs, and anything that arrives from another tree entirely. See
     `reveal` in components/SkillTree/SkillTree for the token. */
  const [reveal, setReveal] = useState<{ id: string; token: number } | null>(null);

  /* What the canvas is pointed at. The page names a set of nodes and the
     canvas works out the scale and the scroll that bring them into view — see
     `frame` in components/SkillTree/SkillTree. Which set is the judgement, and
     judgements about what a lattice means live here. */
  const [frame, setFrame] = useState<{ ids: readonly string[]; token: number } | null>(null);
  const frameOn = useCallback(
    (ids: readonly string[]) => setFrame(ids.length > 0 ? { ids, token: Date.now() } : null),
    [],
  );

  const goTo = useCallback((id: string) => {
    setTreeId(id);
    setSelectedId(null);
    setTracedId(null);
    setLens(null);
    setReveal(null);
    setPeeked(null);
  }, []);

  /* Opening a tree *at* a node — what the search and the subject rail do.
     Every route into a different tree passes through here or through `goTo`,
     and both say what the selection becomes, which is why there is no effect
     watching the tree id to clear it: one would run after this and wipe the
     node the reader just searched for.

     The reveal is the other half of the same thought, and without it the
     search was only two thirds of an answer: the right tree opened, the right
     node selected, the panel filled in — and the canvas showing the top-left
     corner of a lattice the node was nowhere near. A reader who typed
     "eigen" has to *land on* Eigenvectors. See the fit in
     components/SkillTree/SkillTree, which is where the scale and the scroll
     are settled together. */
  const openTree = useCallback((id: string, node?: string) => {
    setTreeId(id);
    setSelectedId(node ?? null);
    setTracedId(null);
    setLens(null);
    setReveal(node ? { id: node, token: Date.now() } : null);
    /* A tile that is removed under the pointer never sends its leave event,
       so the card would otherwise hang over the new tree describing a node
       from the old one. */
    setPeeked(null);
  }, []);

  /** A catalogue subject — Mandarin, Gym, Taxes — routed to its lattice. */
  const openSubject = useCallback(
    (subjectId: string) => {
      const subject = subjects.find((row) => row.id === subjectId);
      const target = treeForSubject(subjectId, subject?.group);
      openTree(target.tree, target.node);
    },
    [openTree, subjects],
  );

  /* Changing one slot stores all five, including the ones that were still
     derived — otherwise the four the reader did not touch would keep moving as
     their task counts changed. */
  const setFocusAt = useCallback(
    (index: number, subjectId: string) => {
      setChosenFocus((current) => {
        const base = resolveFocus(current, subjects.map((subject) => subject.id));
        const next = Array.from({ length: FOCUS_COUNT }, (_, slot) => base[slot] ?? '')
          .map((id, slot) => (slot === index ? subjectId : id))
          .filter(Boolean);
        saveFocus(username, next);
        return next;
      });
    },
    [subjects, username],
  );

  /* All five at once — what the setup screen and the band's "Choose again"
     both write. Same store and same rule as `setFocusAt`: a stored set is
     always the whole five, never a partial one topped up from usage. */
  const chooseFocus = useCallback(
    (ids: string[]) => {
      const next = ids.slice(0, FOCUS_COUNT);
      saveFocus(username, next);
      setChosenFocus(next);
      setSkippedSetup(false);
    },
    [username],
  );

  /** Back to the question, from the band. Clears the stored answer so the
   *  screen's own gate — "has this account ever chosen" — is true again. */
  const reopenSetup = useCallback(() => {
    saveFocus(username, []);
    setChosenFocus(null);
    setSkippedSetup(false);
  }, [username]);

  const selected = useMemo(
    () => graph.nodes.find((node) => node.id === selectedId) ?? null,
    [graph.nodes, selectedId],
  );

  // ---- The two ways of narrowing the canvas ------------------------------
  // Picking the same node again puts the panel and the lit run back.
  const select = useCallback(
    (node: GraphNode | null) =>
      setSelectedId((current) => {
        const next = node && current !== node.id ? node.id : null;
        setTracedId(null);
        setLens(null);
        return next;
      }),
    [],
  );

  /* Double-click. The two clicks underneath it have already run — the second
     of them toggling the selection *off* again — so this sets both rather than
     only the trace, or a double-click would light a chain nothing is selected
     at the end of. */
  const trace = useCallback((node: GraphNode) => {
    setSelectedId(node.id);
    setTracedId(node.id);
    setLens(null);
  }, []);

  /*
   * A figure in the band, pressed.
   *
   * Two things happen, and they are the same thought said twice: everything
   * the figure does not count goes quiet, and the canvas moves to put what it
   * *does* count on the screen. Dimming alone left a reader looking at an
   * unchanged view of forty tiles with four of them lit somewhere off the
   * bottom — the figure had answered "how many" and still not answered
   * "where". Letting go frames the whole tree again, so the canvas ends where
   * it started rather than zoomed into the corner the filter left it in.
   *
   * Both readings come from `litBy`, which is also what `spotlight` dims from,
   * so the frame and the lit tiles cannot be two different sets.
   */
  const narrow = useCallback(
    (next: Lens) => {
      // Read rather than folded into the updater: moving the camera is a
      // second piece of state, and a `setState` that changes another one is a
      // function React is allowed to call twice.
      const off = lens === next;
      setLens(off ? null : next);
      frameOn(off ? graph.nodes.map((node) => node.id) : litBy(graph, next, navIds));
      setSelectedId(null);
      setTracedId(null);
    },
    [frameOn, graph, lens, navIds],
  );

  /** Select a node and scroll the canvas until it is on screen. */
  const open = useCallback((id: string) => {
    setSelectedId(id);
    setTracedId(null);
    setLens(null);
    setReveal({ id, token: Date.now() });
  }, []);

  /* ---- Where the reader is ---------------------------------------------
     `standing` is the page's own reading of where this account is on this
     lattice, and it is what the marker falls back to. */
  const standing = useMemo(() => currentSkill(graph, navIds), [graph, navIds]);

  /* The marker follows the selection once there is one, and the focus layer is
     only built then. Keeping those apart is what lets the canvas answer "where
     am I" on arrival without also greying itself out. */
  const hereId = selectedId ?? standing?.id ?? null;

  /* Not `focus` — that name is already the five subjects across the top, and
     this is the reader's position on one lattice. */
  const position = useMemo(
    () => (hereId ? focusOn(graph, hereId) : null),
    [graph, hereId],
  );

  /* What to do next, with where the reader already is left off it: "next up:
     the node you are standing on" is not a next step. The *computed* standing
     rather than the selection, so clicking around the tree does not keep
     rewriting the list. */
  const chances = useMemo(
    () => opportunities(graph, standing ? new Set([...navIds, standing.id]) : navIds),
    [graph, navIds, standing],
  );

  /* How far through its prerequisites each gated node is, so a locked tile can
     print `2/3` where every other tile prints a percentage. See skills/route. */
  const gates = useMemo(() => gatesOf(graph), [graph]);

  /* Which nodes nothing is waiting on. A fifth thing a tile can be, and the
     only one that is not a status: "can I start this" and "does anything
     depend on my finishing it" are separate questions, and the lattice was
     only answering the first. See `optionalIds` in skills/route. */
  const optional = useMemo(() => optionalIds(graph), [graph]);

  /* The line somebody asked about, and where they asked. Held here rather than
     in the canvas because what an edge *means* — a gate, or a suggestion — is
     the page's half of the split that runs through this whole file. See
     components/SkillTree/EdgeCard. */
  const [asked, setAsked] = useState<{ edge: PlacedEdge; at: { x: number; y: number } } | null>(
    null,
  );
  const edgeEnds = useMemo(() => {
    if (!asked) return null;
    const from = graph.nodes.find((node) => node.id === asked.edge.from);
    const to = graph.nodes.find((node) => node.id === asked.edge.to);
    return from && to ? { from, to } : null;
  }, [asked, graph.nodes]);

  /* ---- The tile under the pointer --------------------------------------
     Which node is being pointed at and where its tile was when the pointer
     arrived. The rectangle is held rather than recomputed because the card is
     placed against the window — see components/SkillTree/TilePeek — and the
     tile is the only thing that ever knew where it was on screen.

     The *reading* is worked out here rather than in the card, from the same
     `focusOn` the focus layer and the route strip already run: a hover card
     that computed its own idea of what a node requires would be a second
     answer to a question the page has already answered. */
  const [peeked, setPeeked] = useState<{ id: string; rect: DOMRect } | null>(null);
  const peek = useMemo(
    () => (peeked ? focusOn(graph, peeked.id) : null),
    [graph, peeked],
  );

  /* One emphasis layer, from whichever of the two is on. */
  const weights = useMemo(() => {
    if (lens) return spotlight(graph, lens, navIds);
    if (selectedId && position) return emphasise(graph, position, tracedId === selectedId);
    return null;
  }, [graph, lens, navIds, position, selectedId, tracedId]);

  /* ---- Which of the three drawings ---------------------------------------
     See components/SkillTree/ModeSwitch for what each one is for. Only Path
     changes what is *on* the canvas; Progress is the same lattice recoloured,
     which is a stylesheet's business rather than a graph's. */
  const [mode, setMode] = useState<TreeMode>('map');

  /* A mode belongs to a reading of a tree, not to a reader, so walking into
     another lattice starts from the map again. Going straight to Path on a
     subject somebody has never opened would show them four tiles and call it
     a subject. */
  useEffect(() => {
    setMode('map');
  }, [treeId]);

  /* What the canvas is handed. Everything else on the page — the band, the
     panel, the next-up strip, the hover card, the gate fractions — stays on
     the full graph, because those describe the *tree* and a view is not a
     fact about a tree. The one thing a narrowed canvas must not do is change
     what the page believes. */
  const shown = useMemo(
    () => (mode === 'path' ? keepOnly(graph, pathOf(graph, hereId)) : graph),
    [graph, hereId, mode],
  );

  /** What the canvas is showing, in the line under the switch. */
  const say =
    mode === 'map'
      ? `Every skill in ${tree.title}, arranged the way the subject is built.`
      : mode === 'path'
        ? `${shown.nodes.length} of ${graph.nodes.length} skills — what is behind you, what you are on, and what opens next.`
        : 'The same lattice, coloured by where you stand rather than by how hard each skill is.';

  /* The "+250 XP" that appears for a moment after a click. Held with its node
     id so switching selection mid-flash cannot show one node's gain on
     another, and the timer is cleared on unmount and on every new click. */
  const [flash, setFlash] = useState<{ id: string; gain: number } | null>(null);
  const flashTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
  }, []);

  const writePlans = useCallback(
    (id: string, plan: StepPlan | null) => {
      setPlans((current) => {
        const next = { ...current };
        if (plan) next[id] = plan;
        else delete next[id];
        saveSteps(username, next);
        return next;
      });
    },
    [username],
  );

  /*
   * Renaming, and the one decision in it: which drawing the new name gets.
   *
   * `iconForName` answers only when the words actually match a file, so most
   * renames get `undefined` and the node keeps the icon it was designed with —
   * "Refactoring" has no drawing of its own and a near-miss would be worse than
   * the layers icon it already has. Stored rather than recomputed on render, so
   * an icon added to the repository next month cannot repaint a tile somebody
   * already named. See skills/iconMatch.
   */
  const rename = useCallback(
    (id: string, raw: string | null) => {
      setNames((current) => {
        const next = { ...current };
        const name = raw === null ? '' : cleanName(raw);
        if (!name) delete next[id];
        else {
          const icon = iconForName(name);
          next[id] = icon ? { name, icon } : { name };
        }
        saveNames(username, next);
        return next;
      });
    },
    [username],
  );

  /*
   * Practising means one of two things, and which one depends on whether this
   * account has written the node's programme.
   *
   * An untouched node is counted in XP, so a session adds XP. A node whose
   * steps the reader has written is counted in steps — utils/skillSteps has the
   * argument — so a session ticks the next one off instead. Adding XP to it
   * would be adding to a figure that is no longer read, which is the same as
   * the button doing nothing.
   */
  const practise = useCallback(
    (node: GraphNode) => {
      const plan = plans[node.id];
      if (plan) {
        if (plan.at >= plan.steps.length) return;
        writePlans(node.id, { ...plan, at: plan.at + 1 });
        return;
      }
      const gain = practiceGain(node);
      setProgress((current) => {
        const next = { ...current, [node.id]: (current[node.id] ?? 0) + gain };
        saveProgress(username, next);
        return next;
      });
      setFlash({ id: node.id, gain });
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), 1600);
    },
    [username, plans, writePlans],
  );

  /* ---- the four page verbs, on the keyboard ----------------------------
     Every one of them is a control that is already on the page — see
     hooks/useLatticeKeys for why that is the rule the set was chosen by, and
     why Space is not one of them. Escape clears the card first where one is
     open: a reader pressing it means "not this", and the nearest "this" is
     whatever was opened last. */
  useLatticeKeys({
    onClear: () => (asked ? setAsked(null) : select(null)),
    onHere: () => hereId && frameOn([hereId]),
    onFit: () => frameOn(graph.nodes.map((node) => node.id)),
    onPractise: selected ? () => practise(selected) : undefined,
  });

  const entering = usePageEntrance(true);
  const unlocked = totals.total - totals.locked;

  /*
   * The first visit: five questions' worth of one question, before the page.
   *
   * Three conditions, and each is doing something. The read has to have
   * happened for this account, or the screen flashes in front of everybody for
   * a tick. There has to be a catalogue to choose from, or the screen is a
   * heading over nothing — and an account whose subjects have not arrived yet
   * gets the page it always got rather than a blank chooser. And the reader
   * must not have said "later" this visit.
   */
  if (focusRead && chosenFocus === null && !skippedSetup && subjects.length > 0) {
    return (
      <div className="stx-page stx-page--lattice">
        <Ambient />
        <div className={`stx-shell page-shell${entering ? ' pg-enter' : ''}`}>
          <FocusSetup
            subjects={subjects}
            /* What the band would have shown on its own — the account's own
               usage order, which is what `resolveFocus` tops an empty choice
               up from. Offered as a button inside the screen. */
            suggested={resolveFocus(null, subjects.map((subject) => subject.id))}
            onDone={chooseFocus}
            onSkip={() => setSkippedSetup(true)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="stx-page stx-page--lattice">
      <Ambient />
      <div className={`stx-shell page-shell${entering ? ' pg-enter' : ''}`}>
        <FocusTopics
          subjects={subjects}
          focus={focus}
          openTrail={trail}
          onOpen={openSubject}
          onChange={setFocusAt}
          onChooseAll={reopenSetup}
        />

        <SubjectRail subjects={subjects} openTrail={trail} onOpen={openTree} />

        {/* Green, which is what growth is coloured everywhere else here. The
            breadcrumb and the title stay centred inside it — this is the one
            header in the app that is not a left-aligned row, because what it
            titles is a canvas rather than a list. */}
        <PageHero variant="skill-trees" tone="green">
          <header className="stx-lead">
            {chain.length > 1 && (
              <nav className="stx-crumbs" aria-label="Where this tree sits">
                {chain.map((crumb, index) => {
                  const here = crumb.id === tree.id;
                  return (
                    <span key={crumb.id} className="stx-crumb">
                      {here ? (
                        <span aria-current="page">{crumb.title}</span>
                      ) : (
                        <button type="button" onClick={() => goTo(crumb.id)}>
                          {crumb.title}
                        </button>
                      )}
                      {index < chain.length - 1 && <i aria-hidden="true">›</i>}
                    </span>
                  );
                })}
              </nav>
            )}
            <h1>{tree.title}</h1>
            <p className="stx-lead-sub">{tree.blurb}</p>
          </header>
        </PageHero>

        {/* ---- moving between trees ----
            The diamonds on the canvas walk downward and the breadcrumb walks
            up, but both mean hunting for a control. This says every tree
            adjacent to this one outright: the one above, the ones below, and
            the ones beside it. */}
        {(up || into.length > 0 || beside.length > 0) && (
          <nav className="stx-treenav" aria-label="Move between trees">
            {up && (
              <span className="stx-treenav-group">
                <span className="stx-treenav-label">Up</span>
                <button type="button" className="stx-treenav-link is-up" onClick={() => goTo(up.id)}>
                  <Ico icon="branch" className="stx-ico stx-treenav-ico" />
                  {up.title}
                </button>
              </span>
            )}
            {into.length > 0 && (
              <span className="stx-treenav-group">
                <span className="stx-treenav-label">Branches into</span>
                {into.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    className="stx-treenav-link is-into"
                    onClick={() => goTo(child.id)}
                  >
                    {child.title}
                    <i aria-hidden="true">›</i>
                  </button>
                ))}
              </span>
            )}
            {beside.length > 0 && (
              <span className="stx-treenav-group">
                <span className="stx-treenav-label">Beside</span>
                {beside.map((peer) => (
                  <button
                    key={peer.id}
                    type="button"
                    className="stx-treenav-link"
                    onClick={() => goTo(peer.id)}
                  >
                    {peer.title}
                  </button>
                ))}
              </span>
            )}
          </nav>
        )}

        {/* ---- the band of figures ---- */}
        <section className="stx-band" aria-label="Where this tree stands">
          <div className="stx-figure stx-figure--ring">
            <div className="stx-figure-text">
              <span className="stx-figure-label">Overall Progress</span>
              <strong className="stx-figure-value stx-figure-big">
                {Math.round(totals.percent)}%
              </strong>
            </div>
            <ProgressIndicator percent={totals.percent} shape="ring" size={54} />
          </div>

          <Figure
            label="Skills Unlocked"
            value={unlocked}
            sub={`/ ${totals.total}`}
            tone="accent"
            lens="unlocked"
            on={lens === 'unlocked'}
            onNarrow={narrow}
          />
          <Figure
            label="Mastered"
            value={totals.complete}
            icon="trophy"
            tone="done"
            lens="complete"
            on={lens === 'complete'}
            onNarrow={narrow}
          />
          <Figure
            label="In Progress"
            value={totals.progress}
            icon="in-progress"
            tone="prog"
            lens="progress"
            on={lens === 'progress'}
            onNarrow={narrow}
          />
          <Figure
            label="Locked"
            value={totals.locked}
            icon="locked"
            tone="lock"
            lens="locked"
            on={lens === 'locked'}
            onNarrow={narrow}
          />
          {/* Not a lens: a level is a reading of the whole tree rather than a
              subset of it, and there is nothing to narrow to. */}
          <Figure label="Skill Level" value={skillLevel(totals)} icon="gem" tone="level" />
        </section>

        {/* ---- what to do next ----
            Above the route, because "where am I" is only worth answering as a
            preamble to "so what now". Every figure on it is already on the
            lattice as colour and lines; see skills/route. */}
        <NextUp chances={chances} onOpen={open} />

        {/* ---- where the reader is, in one line ----
            Above the canvas rather than inside it, because it is the sentence
            the drawing is a picture of. See components/SkillTree/RouteStrip. */}
        {position && (
          <RouteStrip
            focus={position}
            traced={Boolean(selectedId) && tracedId === selectedId}
            onSelect={(node) => open(node.id)}
            onClear={selectedId || lens ? () => select(null) : undefined}
          />
        )}

        {/* ---- how to read the tree ----
            Directly above the canvas, because it decides what the canvas is
            rather than what is emphasised on it. */}
        <ModeSwitch mode={mode} onMode={setMode} say={say} />

        {/* ---- the lattice and what a node is ---- */}
        <div className={`stx-layout mode-${mode}`}>
          <SkillTreeCanvas
            graph={shown}
            selectedId={selectedId}
            onSelect={select}
            geom={LATTICE_GEOM}
            fit
            focus={weights ?? undefined}
            reveal={reveal}
            frame={frame}
            onEdge={(edge, at) => setAsked({ edge, at })}
            /* The two framings only this page can name. "Fit" and "1:1" sit
               beside them and belong to the canvas, because the whole tree and
               full size are facts about a drawing; a branch and a position are
               facts about a reader. */
            views={
              <>
                {position && position.route.length > 1 && (
                  <button
                    type="button"
                    className="stx-zoom-view"
                    title="Fit the branch you are in"
                    onClick={() => frameOn(branchIds(position))}
                  >
                    Branch
                  </button>
                )}
                {hereId && (
                  <button
                    type="button"
                    className="stx-zoom-view"
                    title="Go to where you are"
                    onClick={() => frameOn([hereId])}
                  >
                    Here
                  </button>
                )}
              </>
            }
            renderNode={(placed, ctx) => {
              const to = nav.get(placed.node.id);
              return (
                <LatticeNode
                  placed={placed}
                  size={LATTICE_GEOM.nodeW}
                  selected={ctx.selected}
                  onSelect={ctx.onSelect}
                  onNavigate={to ? () => goTo(to) : undefined}
                  emphasis={weights?.get(placed.node.id)}
                  here={placed.node.id === hereId}
                  gate={gates.get(placed.node.id)}
                  optional={optional.has(placed.node.id)}
                  onTrace={() => trace(placed.node)}
                  onPeek={(node, rect) => setPeeked({ id: node.id, rect })}
                  onPeekEnd={() => setPeeked(null)}
                />
              );
            }}
          />

          <LatticePanel
            graph={graph}
            node={selected}
            onSelect={select}
            onPractice={practise}
            gain={selected ? practiceGain(selected) : 0}
            steps={selected ? plans[selected.id] ?? null : null}
            onSteps={selected ? (plan) => writePlans(selected.id, plan) : undefined}
            onResetSteps={selected ? () => writePlans(selected.id, null) : undefined}
            onRename={selected ? (name) => rename(selected.id, name) : undefined}
            renamed={Boolean(selected && names[selected.id])}
            onResetName={selected ? () => rename(selected.id, null) : undefined}
            flash={flash && selected && flash.id === selected.id ? flash.gain : null}
            placeholder={
              <>
                <Ico icon="target" className="stx-ico stx-lp-blank-ico" />
                <strong>Pick a skill</strong>
                <span>
                  Every tile on the lattice opens here — what it is, how far along you are, and what
                  it leads to. The diamonds open a subject of their own.
                </span>
              </>
            }
          />
        </div>

        {/* ---- legend ---- */}
        {/* The tiles are coloured by difficulty, so that is what the legend has
            to explain. Status is on every tile already, in the percentage badge
            beside the tier and in the fill of a finished one. */}
        <footer className="stx-legend">
          <ul className="stx-legend-keys">
            {DIFFICULTIES.map((tier) => (
              <li key={tier}>
                <i className={`stx-legend-dot tier-${tier}`} aria-hidden="true" />
                {DIFFICULTY_LABEL[tier]}
              </li>
            ))}
            <li className="stx-legend-line">
              <svg viewBox="0 0 28 6" aria-hidden="true">
                <path d="M1 3h26" />
              </svg>
              Prerequisite
            </li>
            <li className="stx-legend-line">
              <svg viewBox="0 0 28 6" aria-hidden="true">
                <path d="M1 3h26" strokeDasharray="4 4" />
              </svg>
              Recommended
            </li>
          </ul>
          <p className="stx-legend-tip">
            <Ico icon="idea" className="stx-ico stx-legend-tip-ico" />
            <b>Tip:</b> hover a tile to see what it needs · click a line to ask what it means ·
            drag to explore · ⌘ or Ctrl + scroll to zoom
          </p>

          {/* The shortcuts, written down. A binding nobody can see is a
              secret; four of them are a secret nobody will guess. Printed in
              the legend rather than behind a "?" overlay, because the legend
              is already the place this page explains itself. */}
          <p className="stx-legend-keys-row">
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            <kbd>←</kbd>
            <kbd>→</kbd> move · <kbd>Enter</kbd> open · <kbd>P</kbd> practise · <kbd>F</kbd> frame
            where you are · <kbd>R</kbd> fit · <kbd>/</kbd> search · <kbd>Esc</kbd> clear
          </p>
        </footer>

        {/* The hover card. Last in the shell and positioned against the
            window, so nothing on the page can clip it and the scaled canvas
            cannot shrink its text — see components/SkillTree/TilePeek. Keyed
            by node, which is what restarts the fade: crossing a row of tiles
            then shows one card appearing where the pointer stopped rather
            than a card sliding along the row. */}
        {/* What a line means, where one was asked about. Beside the hover card
            and for the same reason: positioned against the window, so neither
            the scaled canvas nor its scroll box can shrink or clip it. */}
        {asked && edgeEnds && (
          <EdgeCard
            edge={asked.edge}
            from={edgeEnds.from}
            to={edgeEnds.to}
            at={asked.at}
            onOpen={(id) => {
              setAsked(null);
              open(id);
            }}
            onClose={() => setAsked(null)}
          />
        )}

        {peeked && peek && (
          <TilePeek
            key={peeked.id}
            read={peek}
            rect={peeked.rect}
            nav={nav.has(peeked.id)}
          />
        )}
      </div>
    </div>
  );
}
