/**
 * How to get better at a node — the other half of what a skill *is*.
 *
 * ## This is the fallback now, not the first answer
 *
 * A node's practice steps are written ahead of time by a model that knows the
 * subject, checked, and stored in the `skill_steps` table — see
 * data/sql/skillsteps.sql. The panel draws those when they exist, and drops back
 * to this file when they do not.
 *
 * The reason is the limitation this module cannot design its way out of. The
 * ladder below has to fit Loops and Squat Depth and Key Signatures, so no rung
 * of it may name anything belonging to any of them, so no rung can ever say
 * "Factor x^2 - 7x + 12" — the best it can manage is "Do one from memory". That
 * is a real ceiling on the whole approach rather than a rung worth rewording.
 *
 * It stays because a derived sentence is worth a great deal more than a blank
 * panel, and twelve hundred nodes will not all have written steps for a while.
 * Nothing here needs to change as that number climbs; the panel simply stops
 * calling it, node by node.
 *
 * Kept apart from skills/subjectTrees on purpose. That file answers "what is
 * this, where does it sit, what does it gate"; this one answers "what would you
 * actually go and do about it", which is a different kind of claim, changes for
 * different reasons, and is the part a reader is looking for once they have
 * decided to work on something. One node's entry can be rewritten without
 * touching the shape of any tree.
 *
 * ## Steps are things to do, not things to know
 *
 * Every line is an action with an object — "write a loop that walks a list
 * backwards", not "understand iteration". A panel of restatements of the node's
 * own description is what this file exists to avoid: the reader has just read
 * that sentence two inches above.
 *
 * ## A plan, not a list
 *
 * What the panel prints is four things that have to agree with each other —
 * what to do, how you will know it worked, how it usually goes wrong, and what
 * it costs. `improvePlan` produces all four at once for that reason. Computed
 * separately they drift, and the drift is always the same shape: a locked node
 * told to go and practice the thing it has just said is locked.
 *
 * ## Most of it is derived, and that is the design
 *
 * Roughly a hundred and fifty of the eleven hundred nodes have an entry below.
 * The rest are answered from the group, the tier and the graph's own edges —
 * see the derived half. That is not a stub waiting to be replaced by authored
 * text: eleven hundred hand-written entries is a promise to fall behind, and a
 * derived sentence that knows the domain, the rung and what the node opens is
 * worth more than an authored one written in a hurry to fill a gap.
 *
 * An entry may state as little as its steps and as much as its steps, its
 * proof and its pitfall. Whatever it states wins; the rest is derived. So
 * improving one node is a two-line edit rather than a schema change.
 */
import type { Difficulty } from '@/skills/types';
import type { GraphNode } from '@/utils/skillGraph';

/**
 * What an entry may carry.
 *
 * The bare array is the original form and stays valid — a hundred and fifty
 * entries are written that way and there is nothing wrong with any of them. The
 * object form is for the node where the proof or the trap is worth stating
 * outright rather than deriving, and states only the fields it improves on.
 */
export type ImproveEntry = string[] | { steps: string[]; proof?: string; pitfall?: string };

/** Node id → three or so concrete moves, and anything else worth stating. */
export const IMPROVE: Record<string, ImproveEntry> = {
  // ---- Coding -----------------------------------------------------------
  'c.vars': [
    'Name ten values in a program you already wrote — badly named ones count double.',
    'Predict what each variable holds at three points, then print them and check.',
    'Rewrite a function so no name is reused for two different meanings.',
  ],
  'c.types': [
    'Take a working program and write down the type of every value in it.',
    'Deliberately add a number to a string and read the error properly.',
    'Convert between three type pairs by hand: text to number, number to text, anything to boolean.',
  ],
  'c.io': [
    'Write a program that asks two questions and answers using both.',
    'Handle the case where the person types nothing at all.',
    'Read a file line by line and print only the lines that match something.',
  ],
  'c.cond': [
    'Write a branch with three outcomes without nesting more than one deep.',
    'Find a condition in your own code and simplify it without changing what it does.',
    'Write the truth table for an && or || you found confusing, then test it.',
  ],
  'c.loops': [
    'Walk a list forwards, backwards, and every second item.',
    'Rewrite one loop as a while and one while as a loop.',
    'Write a loop that stops early, and prove it stops on the right item.',
  ],
  'c.fns': [
    'Take a forty-line block and cut it into three functions that each do one thing.',
    'Write a function with no side effects and one with only side effects; name the difference.',
    'Give a function a default argument and call it three ways.',
  ],
  'c.debug': [
    'Fix a bug using only prints, then fix the next one with a real debugger.',
    'Before each fix, write down what you think is wrong and check whether you were right.',
    'Reproduce a bug reliably before changing a single line.',
  ],
  'c.ds': [
    'Solve one problem with a list and again with a map; time both.',
    'Pick a structure for a real task and write one sentence on why not the others.',
    'Nest two structures — a map of lists — and walk it.',
  ],
  'c.oop': [
    'Turn a group of loose functions and a dict into one class.',
    'Write two classes where one uses the other rather than inheriting from it.',
    'Add a method that changes state, and one that only reports it.',
  ],
  'c.git': [
    'Make ten commits with messages that say why rather than what.',
    'Branch, make a change, and merge it back deliberately.',
    'Recover a change you deleted, without copying files by hand.',
  ],
  'c.err': [
    'Make a program fail on purpose three ways and handle each differently.',
    'Write one error message a stranger could act on.',
    'Find a place where you swallowed an error and make it say something.',
  ],

  // ---- Web --------------------------------------------------------------
  'w.html': [
    'Rebuild a page you like using only semantic tags — no div unless nothing else fits.',
    'Run a page through an accessibility checker and fix what it names.',
    'Write a form with labels that actually connect to their inputs.',
  ],
  'w.css': [
    'Recreate a component from a screenshot without inspecting it.',
    'Explain out loud why one rule beat another; check with the inspector.',
    'Replace three magic numbers with variables and reuse them.',
  ],
  'w.layout': [
    'Build the same layout twice: once with flexbox, once with grid.',
    'Make one layout survive from 320px to 1600px with no media query.',
    'Fix an overflow by finding what actually set the width.',
  ],
  'w.dom': [
    'Add, move and remove an element without reloading the page.',
    'Attach one listener to a parent and handle clicks on all its children.',
    'Read a value out of the page and write it back somewhere else.',
  ],
  'w.http': [
    'Fetch something real and print the status, headers and body separately.',
    'Handle a 404 and a network failure differently, on purpose.',
    'Send a POST with a body and read what came back.',
  ],
  'w.state': [
    'List everything one screen needs to know before writing any of it.',
    'Find state stored in two places and delete one of them.',
    'Make a loading, loaded and failed state all reachable.',
  ],
  'w.react': [
    'Split one large component into three that could be tested alone.',
    'Lift a piece of state up until exactly one component owns it.',
    'Give a list stable keys and watch what changes when you get them wrong.',
  ],
  'w.routing': [
    'Give every screen its own URL and check the back button on each.',
    'Make one route that reads a parameter out of the path.',
    'Paste a deep link into a fresh tab and confirm it lands right.',
  ],
  'w.apis': [
    'Render real data, including while it is still loading.',
    'Handle an empty result differently from a failed one.',
    'Cancel a request that is no longer needed.',
  ],
  'w.auth': [
    'Sign in, reload, and stay signed in.',
    'Make one route that a signed-out visitor cannot reach.',
    'Sign out and confirm nothing sensitive survives it.',
  ],
  'w.deploy': [
    'Put something on the internet that someone else can open.',
    'Break the build on purpose and read the failure.',
    'Change one thing and ship it again in under five minutes.',
  ],

  // ---- Algorithms -------------------------------------------------------
  'a.arrays': [
    'Implement index, insert and delete by hand and count the steps each takes.',
    'Solve three two-pointer problems.',
    'Explain why appending is usually cheap and inserting at the front is not.',
  ],
  'a.strings': [
    'Reverse, split and join without library help once, then never again.',
    'Solve an anagram and a palindrome problem.',
    'Find why building a string in a loop can be slow.',
  ],
  'a.linked': [
    'Build one from scratch and delete a node from the middle.',
    'Reverse it iteratively, then recursively.',
    'Detect a cycle without using extra memory.',
  ],
  'a.stacks': [
    'Check balanced brackets with a stack.',
    'Implement a queue out of two stacks.',
    'Name one real problem where the wrong one of the two makes it harder.',
  ],
  'a.hash': [
    'Count word frequencies in a paragraph.',
    'Write your own tiny hash map with buckets and collisions.',
    'Solve one problem that goes from n² to n by adding a map.',
  ],
  'a.recursion': [
    'Write the base case first, three times in a row.',
    'Draw the call stack for one small input, by hand.',
    'Convert one recursive function into a loop.',
  ],
  'a.trees': [
    'Walk one in all three orders and say what each is good for.',
    'Insert into and search a binary search tree.',
    'Compute depth and check whether it is balanced.',
  ],
  'a.sorting': [
    'Implement one n² sort and one n log n sort.',
    'Sort by two keys at once.',
    'Say when the built-in sort is the right answer — it usually is.',
  ],
  'a.searching': [
    'Write it once with no off-by-one error; test the empty and single cases.',
    'Search for an insertion point rather than an exact match.',
    'Binary search on an answer rather than on an array.',
  ],
  'a.dp': [
    'Solve one problem recursively, then add memoization, then make it a table.',
    'Write the recurrence in words before writing any code.',
    'Do the classic three: fibonacci, coin change, longest common subsequence.',
  ],
  'a.greedy': [
    'Solve interval scheduling and prove the greedy choice is safe.',
    'Find one problem where greedy looks right and is wrong.',
    'Compare a greedy and a DP solution to the same problem.',
  ],

  // ---- Graphs -----------------------------------------------------------
  'g.repr': [
    'Build the same graph as a list and as a matrix.',
    'Say which one you would use for a sparse graph, and why.',
    'Load a graph from a text file.',
  ],
  'g.bfs': [
    'Find the shortest path in an unweighted maze.',
    'Track the path itself, not just the distance.',
    'Explain why a queue is what makes it level by level.',
  ],
  'g.dfs': [
    'Write it recursively and again with an explicit stack.',
    'Count connected components.',
    'Detect a cycle in a directed graph.',
  ],
  'g.topo': [
    'Order a set of dependencies — this page lays itself out that way.',
    'Detect the cycle that makes an order impossible.',
    'Do it once with DFS and once with in-degrees.',
  ],
  'g.dijkstra': [
    'Implement it with a priority queue.',
    'Show what breaks when an edge is negative.',
    'Reconstruct the path, not just its length.',
  ],
  'g.mst': [
    "Implement Kruskal's with union-find.",
    "Implement Prim's and compare when each is better.",
    'Use one on a real distance matrix.',
  ],
  'g.flow': [
    'Implement Edmonds–Karp on a small network.',
    'Find the min cut that matches your max flow.',
    'Model one matching problem as a flow problem.',
  ],

  // ---- Systems ----------------------------------------------------------
  's.memory': [
    'Draw the stack and heap for a small program.',
    'Find what makes one data structure use more memory than another.',
    "Watch a process's memory grow and work out why.",
  ],
  's.pointers': [
    'Pass something by value and by reference and observe the difference.',
    'Draw the arrows for a linked structure on paper.',
    'Cause a null dereference on purpose and read the crash.',
  ],
  's.processes': [
    'List the running processes and find one you started.',
    'Spawn a child process and read its output.',
    'Send a signal to a process and handle it.',
  ],
  's.threads': [
    'Run two threads and prove they interleave.',
    'Share one counter between them and watch it go wrong.',
    'Fix it with a lock, then measure what the lock cost.',
  ],
  's.concurrency': [
    'Reproduce a race condition reliably.',
    'Cause a deadlock, then fix it by ordering the locks.',
    'Replace shared state with a queue and compare.',
  ],
  's.files': [
    'Read and write a file without loading all of it into memory.',
    'Handle the file not existing, and being locked.',
    'Write to a temporary file and rename it into place.',
  ],
  's.net': [
    'Open a socket and speak HTTP by hand.',
    'Watch a real request with a packet inspector.',
    'Explain what DNS did before any of it started.',
  ],
  's.db': [
    'Write the five queries you actually need, then index for them.',
    'Break something with a missing transaction, then fix it.',
    'Explain one query plan out loud.',
  ],

  // ---- Mathematics ------------------------------------------------------
  'm.arith': [
    'Do twenty mental sums a day for a week; time yourself.',
    'Estimate before calculating, every time.',
    'Work one long division out fully on paper.',
  ],
  'm.fractions': [
    'Add, subtract, multiply and divide five fractions without a calculator.',
    'Convert between fractions, decimals and percentages both ways.',
    'Explain to someone why dividing flips the second fraction.',
  ],
  'm.algebra': [
    'Solve ten equations and check every answer by substituting back.',
    'Rearrange one formula for each of its variables.',
    'Turn three word problems into equations before solving any of them.',
  ],
  'm.geometry': [
    'Prove one theorem you have only ever used.',
    'Draw the diagram before writing anything, every time.',
    'Find the area of something irregular by cutting it up.',
  ],
  'm.functions': [
    'Sketch five functions without plotting points.',
    'Compose two functions and find the inverse of one.',
    'Explain domain and range for a function that has limits on both.',
  ],
  'm.trig': [
    'Derive the unit circle rather than memorizing it.',
    'Prove one identity from another.',
    'Solve a triangle with the sine and the cosine rule.',
  ],
  'm.stats': [
    'Compute mean, median and spread for a real dataset of your own.',
    'Find a chart that misleads and say exactly how.',
    'Explain what a standard deviation of 3 means here, in words.',
  ],
  'm.prob': [
    'Work out one problem with a tree diagram and again with the formula.',
    'Simulate it a thousand times in code and compare.',
    'Get the Monty Hall problem right, and be able to say why.',
  ],
  'm.precalc': [
    'Graph a rational function including its asymptotes.',
    'Work with logs and exponents until the rules are automatic.',
    'Do one sequence and one series by hand.',
  ],
  'la.matrix': {
    steps: [
      'Multiply matrices by hand until it is boring — six or seven, no calculator.',
      'Work out why the inner dimensions have to match, rather than remembering that they do.',
      'Multiply the same pair in the other order and account for the difference.',
    ],
    proof: 'You can say what a matrix does to a vector before you have finished multiplying.',
  },
  'la.systems': [
    'Solve one system three ways: substitution, elimination, and as a matrix.',
    'Build a system with no solution and one with infinitely many, deliberately.',
    'Say which of the three methods you would use on a system of eight, and why.',
  ],
  'la.det': {
    steps: [
      'Compute determinants for five 2x2 and three 3x3 matrices by hand.',
      'Draw what the determinant is measuring for one 2x2 — the area it scales by.',
      'Find a matrix with determinant zero and say what it does to the plane.',
    ],
    pitfall: 'Treating it as a number you compute rather than as the thing that tells you whether the transformation can be undone.',
  },

  // ---- Calculus ---------------------------------------------------------
  'k.limits': [
    'Evaluate five limits numerically, then algebraically, and compare.',
    'Find one limit that does not exist and say why.',
    'Explain continuity using a function that fails it.',
  ],
  'k.deriv': [
    'Differentiate from first principles three times before using any rule.',
    'Say what the derivative *means* for one real quantity.',
    'Sketch a function and its derivative on the same axes.',
  ],
  'k.rules': [
    'Do twenty derivatives mixing product, quotient and chain.',
    'Find a derivative you got wrong and identify which rule slipped.',
    'Differentiate something implicitly.',
  ],
  'k.optim': [
    'Solve one real maximization problem end to end, units and all.',
    'Check second derivatives rather than assuming.',
    'Handle a problem where the answer is at an endpoint.',
  ],
  'k.integral': [
    'Compute one area as a Riemann sum before integrating it.',
    'Do ten integrals by substitution.',
    'Integrate by parts twice in one problem.',
  ],
  'k.ftc': [
    'State both parts in your own words, without notation.',
    'Use it to evaluate a definite integral you first did as a sum.',
    'Differentiate an integral with a variable limit.',
  ],
  'k.series': [
    'Test five series for convergence, naming the test each time.',
    'Build a Taylor series for a function you know.',
    'Find where a power series stops working.',
  ],

  // ---- Music ------------------------------------------------------------
  'mu.rhythm': [
    'Play along to a metronome at three tempos, including a slow one.',
    'Clap a rhythm while counting out loud.',
    'Record yourself and find where you rushed.',
  ],
  'mu.notes': [
    'Sight-read something new every day, badly and without stopping.',
    'Name notes on flashcards until you stop counting up from the bottom.',
    'Read one line in a clef you find awkward.',
  ],
  'mu.scales': [
    'Play one scale in every key over a week.',
    'Play it in thirds, and in a broken pattern.',
    'Find the scale a piece you like is built from.',
  ],
  'mu.intervals': [
    'Sing an interval before playing it, then check.',
    'Name intervals on the page at sight, ten a day.',
    'Attach each interval to a song you already know.',
  ],
  'mu.chords': [
    'Build every triad in one key from its scale.',
    'Play the same chord in three inversions.',
    'Work out the chords of a song by ear.',
  ],
  'mu.keys': [
    'Write out the circle of fifths from memory.',
    'Identify the key of five pieces from their signature and last chord.',
    'Transpose eight bars into a new key by hand.',
  ],
  'mu.ear': [
    'Do five minutes of interval recognition daily — daily matters more than long.',
    'Transcribe one bar of a melody a day.',
    'Identify major and minor before anything else.',
  ],
  'mu.progressions': [
    'Play I–V–vi–IV in four keys.',
    'Find that progression in three songs you already own.',
    'Write eight bars using only diatonic chords.',
  ],

  // ---- Science ----------------------------------------------------------
  'sc.method': [
    'Turn one vague question into a testable hypothesis.',
    'Design an experiment and name its control.',
    'Find a study that confused correlation with cause.',
  ],
  'sc.measure': [
    'Measure one thing five times and report the spread, not just the number.',
    'Carry units through a calculation and check they survive.',
    'Convert between three unit systems without a calculator.',
  ],
  'ph.fbd': [
    'Draw the diagram for five situations before writing a single equation.',
    'Label every arrow with what is pushing what — no force without a source.',
    'Find the one problem where you drew a force that is not really there.',
    'Redo a problem you got wrong and check whether the diagram was the error.',
  ],
  'ch.formula': [
    'Balance ten equations, starting with the ones that look easy.',
    'Write the formula for five compounds from their names, then go the other way.',
    'Find the equation you balanced by fiddling and redo it by counting atoms.',
  ],
  'ch.mole': {
    steps: [
      'Do one mole calculation end to end, writing every unit down as you go.',
      'Convert between mass, moles and particles for five substances.',
      'Work out a limiting reagent for one reaction and say how you knew.',
    ],
    proof: 'You can tell whether an answer in grams is off by a factor of a thousand without redoing it.',
    pitfall: 'Learning the triangle of formulae instead of what a mole counts. The triangle stops working the moment the question is phrased differently.',
  },
  'bi.organs': [
    'Draw one organ system from memory and label it, then check what you missed.',
    'Follow one molecule through the whole system, entry to exit.',
    'Explain a mechanism to someone without using a single piece of jargon.',
  ],
  'ph.energy': [
    'Trace energy through three transformations and account for the losses.',
    'Calculate kinetic and potential energy for one real object.',
    'Find where the energy actually goes in something everyday.',
  ],
  'bi.cells': [
    'Label an organelle diagram from memory.',
    'Compare a plant and an animal cell without looking.',
    'Follow one cell through division, stage by stage.',
  ],
  'bi.dna': [
    'Transcribe and translate a short sequence by hand.',
    'Work out what one point mutation changes.',
    'Explain replication as a series of steps, in order.',
  ],

  // ---- Added with the expanded trees ------------------------------------
  'c.ops': [
    'Predict the value of five mixed expressions, then run them.',
    'Find one bug caused by precedence and add the brackets you meant.',
    'Use integer and floating division on the same numbers and compare.',
  ],
  'c.lists': [
    'Build, filter and transform a list three different ways.',
    'Walk two lists together in one pass.',
    'Remove items while iterating, get it wrong, then fix it properly.',
  ],
  'c.strings': [
    'Slice, search and split one paragraph five ways.',
    'Build a string in a loop, then rewrite it with a join and time both.',
    'Handle a name with an accent and one with a trailing space.',
  ],
  'c.style': [
    'Rename every unclear name in one file you wrote last month.',
    'Delete a comment by making the code say the same thing.',
    'Split a function that needs a comment in the middle.',
  ],
  'c.modules': [
    'Split a single-file program into three with deliberate boundaries.',
    'Install a package and read the part of its docs you actually need.',
    'Make one thing private and see what breaks.',
  ],
  'c.files': [
    'Read and write a file without loading it all into memory.',
    'Handle the file being missing, empty and locked.',
    'Write to a temporary file and rename it into place.',
  ],
  'c.test': [
    'Write a test that fails, then make it pass.',
    'Test one edge case and one error path, not just the happy one.',
    'Break something on purpose and confirm a test catches it.',
  ],
  'c.refactor': [
    'Extract one long function into three, running tests after each step.',
    'Remove a duplicated block that exists in two files.',
    'Rename one concept consistently across the whole project.',
  ],
  'c.async': [
    'Fetch two things at once and wait for both.',
    'Handle an operation that fails halfway through.',
    'Find code that awaits in a loop and make it run in parallel.',
  ],
  'c.perf': [
    'Measure before changing anything, and write the number down.',
    'Find the one line taking most of the time with a profiler.',
    'Cut the work in half rather than making the work faster.',
  ],
  'c.design': [
    'Draw the pieces of a system and the arrows between them before coding.',
    'Find a dependency pointing the wrong way and turn it round.',
    'Write down what each module is not allowed to know.',
  ],
  'w.responsive': [
    'Build one layout that works at 320px and 1600px with no media query.',
    'Test with the developer tools set to a real phone size.',
    'Replace three fixed widths with flexible units.',
  ],
  'w.forms': [
    'Build a form with labels that actually connect to their inputs.',
    'Validate in the browser, then prove the server still checks.',
    'Show one error message that says how to fix it.',
  ],
  'w.json': [
    'Write down the exact shape you expect before you fetch it.',
    'Handle a field being null, missing and the wrong type.',
    'Parse something malformed and fail usefully.',
  ],
  'w.a11y': [
    'Navigate your own page using only the keyboard.',
    'Run one screen through an accessibility checker and fix what it names.',
    'Turn on a screen reader and listen to one form.',
  ],
  'w.props': [
    'Split a component that takes eight props into two that take four.',
    'Lift one piece of state up until exactly one component owns it.',
    'Pass a component as a prop instead of a boolean flag.',
  ],
  'w.build': [
    'Read your build config line by line and delete what you cannot explain.',
    'Look at what is actually in the output bundle.',
    'Break the build on purpose and read the error properly.',
  ],
  'w.effects': [
    'Write an effect that cleans up after itself, and prove it does.',
    'Find one effect that runs more often than it should and fix the deps.',
    'Replace an effect with a derived value.',
  ],
  'w.perf': [
    'Measure a real page on a throttled connection.',
    'Find the largest thing being downloaded and make it smaller.',
    'Defer something that is not needed for the first paint.',
  ],
  'w.test': [
    'Write one test that clicks through a real flow.',
    'Test what the user sees, not what the component stores.',
    'Change an implementation detail and confirm the test still passes.',
  ],
  'w.security': [
    'Render untrusted text and confirm it cannot become script.',
    'Read about one real attack and check whether your app is open to it.',
    'Move one secret out of the client entirely.',
  ],
  'a.bigo': [
    'Give the big-O of five functions you have already written.',
    'Time one at 10, 100 and 1000 inputs and see if it matches.',
    'Find a nested loop and say what makes it quadratic.',
  ],
  'a.sets': [
    'Replace a nested search with a set and time both.',
    'Deduplicate a list two ways.',
    'Compute an intersection and a difference by hand.',
  ],
  'a.twopointer': [
    'Solve three problems on sorted arrays with two indices.',
    'Reverse something in place.',
    'Find a pair summing to a target without a hash map.',
  ],
  'a.sliding': [
    'Solve longest-substring-without-repeats with a window.',
    'Compute a rolling sum without recomputing the whole window.',
    'Say exactly when the window should shrink.',
  ],
  'a.bitwise': [
    'Convert five numbers between binary and decimal by hand.',
    'Set, clear and test one bit.',
    'Use a bitmask to hold a small set of flags.',
  ],
  'a.heaps': [
    'Implement one and use it for top-k.',
    'Solve the same problem by sorting and compare the cost.',
    'Use one as the queue inside Dijkstra.',
  ],
  'a.bst': [
    'Insert, search and delete by hand on paper.',
    'Build one from sorted input and watch it degenerate to a list.',
    'Validate whether a tree is actually a BST.',
  ],
  'a.tries': [
    'Build one from a word list and add prefix search.',
    'Compare its memory against a plain set.',
    'Implement autocomplete for ten words.',
  ],
  'a.unionfind': [
    'Implement it with path compression and union by rank.',
    'Use it to count connected components.',
    'Use it inside Kruskal\'s algorithm.',
  ],
  'a.backtracking': [
    'Generate all permutations of four items.',
    'Solve n-queens for n=6.',
    'Add one pruning rule and measure how much it saves.',
  ],
  'g.components': [
    'Count islands in a grid.',
    'Do it once with DFS and once with union-find.',
    'Handle a graph with isolated single nodes.',
  ],
  'g.cycles': [
    'Detect a cycle in an undirected graph, then a directed one.',
    'Explain why the two need different methods.',
    'Find the cycle itself, not just whether one exists.',
  ],
  'g.bellman': [
    'Implement it and compare its cost against Dijkstra.',
    'Build a graph with a negative edge where Dijkstra is wrong.',
    'Detect a negative cycle.',
  ],
  'g.astar': [
    'Implement it on a grid with a Manhattan heuristic.',
    'Count nodes visited against plain Dijkstra.',
    'Break optimality by using a heuristic that overestimates.',
  ],
  'g.bipartite': [
    'Check whether a graph is bipartite by two-colouring it.',
    'Model one scheduling problem as a matching.',
    'Find a maximum matching by augmenting paths.',
  ],
  's.stackheap': [
    'Draw both for a small program with a recursive call.',
    'Cause a stack overflow on purpose.',
    'Find where a large object actually lives.',
  ],
  's.locks': [
    'Cause a deadlock with two locks, then fix it by ordering them.',
    'Measure what a lock costs under contention.',
    'Replace a lock with a queue and compare.',
  ],
  's.io': [
    'Read one file byte by byte and again in blocks; time both.',
    'Find where your language buffers by default.',
    'Flush explicitly and confirm the bytes hit disk.',
  ],
  's.sockets': [
    'Open a socket and speak HTTP by hand.',
    'Write a server that echoes what it receives.',
    'Handle the other side disconnecting mid-message.',
  ],
  's.server': [
    'Write one that handles two requests at the same time.',
    'Watch what happens when you send it fifty at once.',
    'Log one request end to end with timings.',
  ],
  's.indexes': [
    'Read the query plan for a slow query.',
    'Add one index and measure the difference.',
    'Find an index that is never used and drop it.',
  ],
  's.caching': [
    'Cache one expensive result and measure the saving.',
    'Decide and write down when the cached copy stops being true.',
    'Cause a stale read on purpose.',
  ],
  's.scaling': [
    'Load-test one endpoint until it degrades.',
    'Find the actual bottleneck rather than guessing.',
    'Explain what breaks when there are two copies of the data.',
  ],
  'm.order': [
    'Evaluate ten mixed expressions and check every one.',
    'Find an expression where brackets change the answer.',
    'Write one that needs no brackets at all.',
  ],
  'm.decimals': [
    'Convert twenty values between fractions, decimals and percents.',
    'Compute a percentage increase and then reverse it.',
    'Explain why a 50% rise then a 50% fall is not where you started.',
  ],
  'm.negatives': [
    'Do thirty signed arithmetic questions and check each.',
    'Subtract a negative and explain out loud why it adds.',
    'Find one algebra mistake of your own that was a sign error.',
  ],
  'm.linear': [
    'Solve ten equations and substitute back every time.',
    'Read slope and intercept off a graph and off an equation.',
    'Solve a pair of simultaneous equations two ways.',
  ],
  'm.inequalities': [
    'Solve ten and graph each solution on a number line.',
    'Multiply by a negative and flip the sign correctly.',
    'Solve one with a variable on both sides.',
  ],
  'm.coords': [
    'Find the distance and midpoint between two points.',
    'Write the equation of a line through two points.',
    'Find where a line and a circle meet.',
  ],
  'm.quadratics': [
    'Solve the same quadratic by factoring, completing the square and the formula.',
    'Sketch one from its equation without plotting points.',
    'Use the discriminant to predict the number of roots.',
  ],
  'm.exponents': [
    'Simplify twenty expressions using the index laws.',
    'Convert between exponential and logarithmic form both ways.',
    'Solve one equation where the unknown is an exponent.',
  ],
  'm.combinatorics': [
    'Decide for five problems whether order matters.',
    'Count arrangements with and without repetition.',
    'Compute one binomial coefficient by hand.',
  ],
  'm.sequences': [
    'Find the nth term of five sequences.',
    'Sum an arithmetic and a geometric series by hand.',
    'Decide whether one infinite geometric series converges.',
  ],
  'm.proof': [
    'Prove one statement by induction, fully written out.',
    'Prove something by contradiction.',
    'Find a false proof and locate the exact wrong step.',
  ],
  'k.continuity': [
    'Find three functions that fail continuity, each differently.',
    'State the definition using limits, from memory.',
    'Use the intermediate value theorem to prove a root exists.',
  ],
  'k.implicit': [
    'Differentiate a circle and find its tangent at a point.',
    'Do five where y appears more than once.',
    'Explain why dy/dx appears every time y is differentiated.',
  ],
  'k.related': [
    'Solve the classic ladder and the filling-cone problems.',
    'Write the relationship before differentiating, every time.',
    'Check the units of your answer.',
  ],
  'k.techniques': [
    'Do ten by substitution, then ten by parts.',
    'Integrate one rational function by partial fractions.',
    'Given ten integrals, name the technique before solving any.',
  ],
  'k.applications': [
    'Find the area between two curves.',
    'Compute a volume by discs and again by shells.',
    'Sketch the region and the slice before writing the integral.',
  ],
  'k.taylor': [
    'Build the series for e^x, sine and cosine from their derivatives.',
    'Approximate a value and measure the error.',
    'Find the radius of convergence for one series.',
  ],
  'k.diffeq': [
    'Solve one separable equation fully.',
    'Model exponential growth and check it against real data.',
    'Sketch a slope field and read a solution off it.',
  ],
  'mu.pulse': [
    'Play with a metronome at 60, 90 and 140 bpm.',
    'Set the click on beats two and four only.',
    'Record yourself and find where you drifted.',
  ],
  'mu.dynamics': [
    'Play one phrase at three different volumes on purpose.',
    'Practice the same passage staccato and legato.',
    'Find every dynamic marking in a piece before playing it.',
  ],
  'mu.inversions': [
    'Play one triad in root position, first and second inversion.',
    'Connect two chords moving each voice as little as possible.',
    'Identify inversions by which note is in the bass.',
  ],
  'mu.sightread': [
    'Read something new every day and never stop to correct.',
    'Scan the key, time signature and hardest bar before starting.',
    'Read one line slightly below your level, perfectly in time.',
  ],
  'mu.modes': [
    'Play all seven modes from the same starting note.',
    'Find a piece that uses dorian or mixolydian.',
    'Name what one note changed between two modes.',
  ],
  'mu.harmony': [
    'Harmonize a simple melody in four parts.',
    'Find and fix parallel fifths in your own writing.',
    'Analyze eight bars and label every chord.',
  ],
  'mu.form': [
    'Map the structure of three pieces you know well by ear.',
    'Find where the main idea returns and what changed.',
    'Write out one piece as a letter diagram.',
  ],
  'mu.improv': [
    'Improvise four bars over one chord, every day for a week.',
    'Learn three phrases by ear and use them in your own playing.',
    'Improvise using only three notes and make it musical.',
  ],
  'mu.composition': [
    'Write eight bars and then develop them rather than adding new ideas.',
    'Set yourself one constraint and finish something inside it.',
    'Rewrite a piece you abandoned, differently.',
  ],
  'mu.performance': [
    'Play one piece for another person, all the way through.',
    'Practice recovering from a mistake without stopping.',
    'Record a performance and watch it back.',
  ],
  'sc.units': [
    'Carry units through five calculations and check they survive.',
    'Convert between three unit systems without a calculator.',
    'Catch one wrong answer purely from its units.',
  ],
  'sc.data': [
    'Plot one dataset of your own and choose the axes deliberately.',
    'Draw a line of best fit and say why it is justified.',
    'Find a published chart that misleads and say exactly how.',
  ],
  'ph.motion': [
    'Sketch position, velocity and acceleration graphs for one journey.',
    'Solve three problems with the constant-acceleration equations.',
    'Explain how something can accelerate while slowing down.',
  ],
  'ph.newton': [
    'Draw a free-body diagram for five different situations.',
    'Solve one problem on an inclined plane.',
    'Find the action-reaction pair in three everyday events.',
  ],
  'ph.waves': [
    'Measure the wavelength and frequency of something real.',
    'Explain reflection, refraction and diffraction with one diagram each.',
    'Work out why the pitch changes as an ambulance passes.',
  ],
  'ph.circuits': [
    'Build a circuit and predict the current before measuring it.',
    'Compare series and parallel with the same components.',
    'Use Ohm\'s law in all three arrangements.',
  ],
  'ch.atoms': [
    'Work out protons, neutrons and electrons for ten elements.',
    'Write the electron configuration for the first twenty.',
    'Explain one group of the periodic table from its outer electrons.',
  ],
  'ch.bond': [
    'Draw dot-and-cross diagrams for five compounds.',
    'Predict which compounds conduct when dissolved and check.',
    'Explain a melting point from the bonding.',
  ],
  'ch.reactions': [
    'Sort twenty equations into their types without looking at the answers.',
    'Predict the products of five reactions, then look up whether you were right.',
    'Find two reactions that look alike on paper and behave differently.',
  ],
  'bi.genetics': [
    'Transcribe and translate a short sequence by hand.',
    'Work out one Punnett square and check the ratios.',
    'Say what one point mutation actually changes.',
  ],
  'bi.evolution': [
    'Explain natural selection without using the word wants.',
    'Trace one adaptation back to a selection pressure.',
    'Find and correct a common misstatement about it.',
  ],
  'bi.ecology': [
    'Draw a food web for one habitat.',
    'Explain why energy thins out at each trophic level.',
    'Predict what removing one species would do.',
  ],
};

// ---------------------------------------------------------------------------
// The derived half
// ---------------------------------------------------------------------------
/*
 * Most of the eleven hundred nodes have no entry above, and writing eleven
 * hundred is not a plan. So the rest is derived — and derived long enough to be
 * a real programme rather than a hint. A Foundation node gets five steps and a
 * Mastery node twenty, because that is roughly the difference in what they
 * take.
 *
 * ## The ladder
 *
 * Twenty rungs, cheapest first: copy one, recall it, do it unaided, get fluent,
 * write the method, invent your own, vary it, break it, mix it, judge it, use
 * it in anger, teach it, keep it. Every skill goes up the same ladder — that is
 * what makes it a ladder — and a tier decides which stretch of it you are on.
 * Foundation takes the bottom five; Expert starts a third of the way up and
 * takes fourteen. Two nodes at different tiers therefore share almost no steps.
 *
 * A rung is written once, generically, and overridden by the domains that do it
 * differently. "Change one thing and do it again" is the same instruction in
 * every subject; "find one worked example" is not what a squat needs. Only the
 * rungs that break get an override, so the table stays readable.
 *
 * ## The register: every rung has an object, and you can fail it
 *
 * Short, imperative, countable. "Ten by hand, no notes" beats a sentence about
 * why repetition matters — the reader is deciding what to do in the next hour,
 * not being persuaded.
 *
 * Two rules the first draft of this table broke, both of which produce a rung
 * that reads like an instruction and cannot be carried out:
 *
 *   **Name the object.** "Five in one sitting, no notes" — five *what*? It was
 *   the third rung in a row that was only "do N of them" with a different N,
 *   and it sat directly under written steps that did name their object, so the
 *   ladder visibly went vague at exactly the point it took over. It is gone;
 *   inventing your own example is in its place, which is a different move
 *   rather than the same one counted higher.
 *
 *   **Do not ask the reader for the answer.** "Do the version with the awkward
 *   case in it" asks somebody still learning the skill to already know where it
 *   is hard, which is the one thing they cannot know yet. Finding the edge is
 *   the work, so the rung now says how: push an example until it breaks, and
 *   write down where it turned.
 *
 * Same test for anything added here. "Do it on a day you do not feel like it"
 * was on this ladder and is not a step — there is no hour in which you can sit
 * down and do it, and no way to tell afterwards whether you did.
 */
/** A rung, and the domains that climb it differently. */
interface Rung {
  line: (name: string) => string;
  by?: Record<string, (name: string) => string>;
}

/**
 * The twenty rungs, cheapest first.
 *
 * The order is the argument: you cannot usefully break something you cannot yet
 * do, and you cannot teach it before you have used it on work that mattered.
 */
const LADDER: Rung[] = [
  {
    line: (name) => `Follow one worked example of ${name} end to end.`,
    by: {
      'Health and fitness': (name) => `Watch ${name} done properly, then copy it unloaded.`,
      'Life and home': (name) => `Do ${name} once with instructions open in front of you.`,
      Creative: (name) => `Copy one piece that uses ${name}. Copy it exactly.`,
      'Language and humanities': (name) => `Find one piece that uses ${name} well, and mark every place it does.`,
      Work: (name) => `Watch someone good do ${name} once, and write down the order they did it in.`,
    },
  },
  {
    /* "Do that same one again" — the Beginner window opens on this rung, and on
       a node with written steps it opens on it too, so "that same one" pointed
       at a rung the reader was never shown. Every rung has to stand up as the
       first line of a list. */
    line: () => 'Do one from memory, with the answer covered.',
    by: {
      'Health and fitness': () => 'Do a set filmed from the side. Watch it back once.',
      Computing: () => 'Write it from memory. Do not paste.',
      'Language and humanities': () => 'Take a passage you admire and write it out from your notes, not from the page.',
      Creative: () => 'Copy one piece from memory, then put yours beside the original.',
      'Life and home': () => 'Do it once with the instructions shut.',
      Work: () => 'Do it once from memory, without the notes.',
      'Business and money': () => 'Do it once from memory, then check your figures.',
    },
  },
  {
    line: () => 'Do three more unaided. Mark every one you had to look up.',
    by: {
      'Health and fitness': () => 'Three sets at a load you can hold form through.',
      Creative: () => 'Three more, rough, in one sitting.',
      Work: () => 'Do it three times this week. Mark the one you had to think hardest about.',
      'Life and home': () => 'Do it three more times with nothing open. Note what you forgot.',
      'Language and humanities': () => 'Write three more. Mark every one you had to check.',
    },
  },
  {
    /* The Intermediate window opens here, so this one has to name its own
       subject rather than point back at the rung above it. "Redo the ones you
       looked up" is a fine second sentence and an empty first one. */
    line: (name) => `Find the last thing about ${name} you had to look up, and do it again with nothing open.`,
    by: {
      'Health and fitness': () => 'Go back to the set that fell apart last time and do it properly.',
      'Life and home': () => 'Go back to the part you rushed last time and do it properly.',
      Creative: () => 'Go back to the piece you were least happy with and redo it.',
      Work: () => 'Go back to the call you got wrong, and say why you made it that way.',
      'Language and humanities': () => 'Find the rule you keep having to check, and write a passage using it with nothing open.',
    },
  },
  {
    line: () => 'Ten in a row, timed. Note the one that slowed you down.',
    by: {
      Creative: () => 'Ten quick ones. Keep none of them.',
      'Life and home': () => 'Do it three days running.',
      'Health and fitness': () => 'One set against the clock, same form. Note where it slipped.',
      'Business and money': () => 'Run it over ten real figures of your own.',
      'Language and humanities': () => 'Ten short ones, timed. Note the one that took longest.',
    },
  },
  {
    line: (name) => `Write the method for ${name} in five lines, then use it on a new one without looking.`,
    by: {
      'Health and fitness': () => 'Write the cues down — three, no more — then film a set and check you hit them.',
      Creative: () => 'Write down what you actually did, in five lines, so you can do it again.',
      'Life and home': (name) => `Write your own checklist for ${name}, five lines, then run it once.`,
      'Language and humanities': () => 'Write the rule down in five lines, then apply it to a new passage.',
      Work: (name) => `Write down how you do ${name}, in five lines, then follow it once.`,
    },
  },
  {
    line: (name) => `Invent your own example of ${name}, do it, and check the answer holds.`,
    by: {
      Computing: () => 'Make up your own input, work out the answer by hand, then check the code agrees.',
      'Health and fitness': (name) => `Set your own target for ${name} — load, reps or time — and hit exactly that.`,
      'Life and home': () => 'Do it once for something real of your own, not a practice run.',
      'Language and humanities': () => 'Write one of your own on a topic nobody set, then read it back cold.',
      Creative: (name) => `Make one small piece that is only about ${name}.`,
      'Business and money': () => 'Run it on one real figure of your own and sanity-check the result.',
      Work: (name) => `Use ${name} on one real thing on your list this week.`,
    },
  },
  {
    line: () => 'Change one thing about the problem and do it again.',
    by: {
      'Health and fitness': () => 'Add one increment. Weight, distance or time — one.',
      'Life and home': () => 'Do it again with one constraint you did not have.',
      'Language and humanities': () => 'Make the same argument again for a reader who disagrees.',
      Creative: () => 'Do it again with one thing changed — the light, the angle, the palette.',
      Work: () => 'Do it again when the constraints have moved: less time, or more on the list.',
    },
  },
  {
    line: () => 'Push one example until it breaks. Write down the point where it turned.',
    by: {
      Computing: () => 'Run it on the empty case, then on one a thousand times bigger than you expect.',
      'Math and science': () => 'Take the numbers to zero, to negative and to very large. See which breaks it.',
      'Health and fitness': () => 'Take the load up until form goes. Note the number, then back off one step.',
      'Life and home': () => 'Do it when the timing is bad, and see what you drop first.',
      Creative: () => 'Take one piece too far on purpose and find where it stopped working.',
      'Business and money': () => 'Push the assumption until the answer flips, and note what it took.',
    },
  },
  {
    line: () => 'Get one wrong on purpose. Say what the wrong answer looks like.',
    by: {
      Computing: () => 'Break it on purpose. Read the error before you guess.',
      'Health and fitness': () => 'Have someone watch a set and name one fault.',
    },
  },
  {
    line: (name) => `Mix ${name} in with the skills either side of it, so you do not know which one is coming.`,
    by: {
      Computing: (name) => `Take on work where ${name} is only sometimes the right tool, and nobody tells you when.`,
      'Health and fitness': () => 'Train it in a session where you have not fixed the order in advance.',
      Creative: () => 'Work on three pieces at once, so you cannot settle into one.',
      'Life and home': () => 'Do it inside an ordinary week rather than as its own task.',
    },
  },
  {
    line: (name) => `Find the case where ${name} does not apply.`,
    by: {
      'Health and fitness': (name) => `Name one goal ${name} will not get you, and what would.`,
      'Life and home': () => 'Name the situation where this is the wrong way to do it.',
    },
  },
  {
    line: (name) => `Say when ${name} beats the other way of doing it, and when it does not.`,
  },
  {
    line: (name) => `Use ${name} inside a bigger job, where it is not the point.`,
    by: {
      'Health and fitness': (name) => `Put ${name} in a full session, not a drill on its own.`,
    },
  },
  {
    line: () => 'Use it on something of your own that nobody set.',
  },
  {
    line: (name) => `Explain ${name} in two sentences. No jargon.`,
  },
  {
    line: () => 'Explain it to someone a rung below. Note where they stall.',
  },
  {
    line: () => 'Do it under a deadline, or in front of somebody.',
    by: {
      'Business and money': () => 'Use it to make a decision you would have made on instinct.',
    },
  },
  {
    line: () => 'Come back a month later and do one cold.',
  },
  {
    line: (name) => `Hold ${name} to standard on work that is not practice.`,
  },
];

/**
 * How much of the ladder a tier is, and where on it that tier starts.
 *
 * The counts are the brief — five at the bottom, twenty at the top — and the
 * offsets are what stop an Advanced node opening with "follow one worked
 * example". Mastery is the exception and starts at zero, because twenty steps
 * is the whole ladder and there is nowhere else for it to start. The window is
 * clamped rather than checked, so a count that overruns simply ends at the top
 * rung instead of running off it.
 *
 * ## Expert used to start below Advanced
 *
 * It was `from: 4` against Advanced's `from: 5`, so the more demanding tier got
 * the easier opening — and the clamp hid it, because a count of 16 pins the
 * start at 4 whatever the offset says. Sixteen rungs out of twenty cannot begin
 * anywhere else. Expert is fourteen now, which is the length at which its own
 * offset is the thing deciding where it starts, and it opens on inventing your
 * own example rather than on copying somebody's.
 *
 * ## Nothing above Intermediate opens on repetition
 *
 * Rungs one to five are copy, recall and reps. They are the right first hour
 * for Loops and they are absurd for Program Design, which is an Expert node
 * whose programme used to include "ten in a row, timed". The reps live low
 * enough now that the Advanced window starts past them.
 */
/* Five at the shallowest, twenty at the deepest. A written entry and the line
   about what the node opens are both additions to the tier's count, so the
   total is capped rather than left to add up past the top of the range. */
const MAX_STEPS = 20;

const TIER_WINDOW: Record<Difficulty, { from: number; count: number }> = {
  foundation: { from: 0, count: 5 },
  beginner: { from: 1, count: 7 },
  intermediate: { from: 3, count: 10 },
  advanced: { from: 5, count: 13 },
  expert: { from: 6, count: 14 },
  mastery: { from: 0, count: 20 },
};

/** What one node is worth going and doing, at whatever length its tier says. */
function ladderFor(node: GraphNode, group: string | undefined, skip = 0): string[] {
  const { from, count } = TIER_WINDOW[node.difficulty];
  const name = inline(node.name);
  const start = Math.max(0, Math.min(from, LADDER.length - count));
  return LADDER.slice(start, start + count)
    .map((rung) => (group && rung.by?.[group] ? rung.by[group]! : rung.line)(name))
    .slice(skip);
}

/** Lower-cased for use mid-sentence, but acronyms are left as they are. */
function inline(name: string): string {
  return /^[A-Z0-9&\-\s]+$/.test(name) || /[A-Z]{2,}/.test(name) ? name : name.toLowerCase();
}

// ---------------------------------------------------------------------------
// The three lines under the steps
// ---------------------------------------------------------------------------
/*
 * Kept short on purpose. They answer three questions the steps cannot — when to
 * stop, what to watch for, how long — and each is one line because a reader who
 * wanted an essay would not be looking at a side panel.
 */

/** What finishing looks like, per domain. */
const PROOF: Record<string, (name: string) => string> = {
  Computing: (name) => `You can read someone else's ${name} and say why they wrote it that way.`,
  'Math and science': (name) => `You spot a wrong answer involving ${name} before you finish the working.`,
  'Language and humanities': (name) => `You notice ${name} done badly, and can say what would fix it.`,
  Creative: (name) => `You choose ${name} for a reason you can state.`,
  'Health and fitness': () => 'It holds on a bad day, not just a good one.',
  'Business and money': (name) => `You can explain ${name} to someone who has to act on it.`,
  Work: () => 'It survives a week you did not plan.',
  'Life and home': () => 'No longer a project — just something you do.',
};

const PROOF_DEFAULT = (name: string) => `You reach for ${name} unprompted, on a problem nobody labeled.`;

/** The trap at each rung of the ladder. */
const TIER_PITFALL: Record<Difficulty, (name: string) => string> = {
  foundation: () => 'Only works with the example in front of you.',
  beginner: () => 'Recognizing it and calling that knowing it.',
  intermediate: () => 'Works in exercises and never leaves them.',
  advanced: (name) => `Reaching for ${name} where something simpler was right.`,
  expert: (name) => `Fluent enough at ${name} to stop seeing its assumptions.`,
  mastery: () => 'Coasting. Nothing external tells you the standard has slipped.',
};

/** Roughly what it costs. */
const TIER_EFFORT: Record<Difficulty, string> = {
  foundation: 'One or two short sessions.',
  beginner: 'Three or four sessions, across days rather than in one.',
  intermediate: 'A week or two of real use.',
  advanced: 'Several weeks. Expect to be wrong in public once.',
  expert: 'Months, mostly on work nobody set as an exercise.',
  mastery: 'Open-ended. A standard you keep, not a box you tick.',
};

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------
/**
 * Everything the panel prints under "How to improve".
 *
 * One object rather than five exported functions because the answers have to
 * agree with each other — a locked node's steps are about getting *in*, and its
 * proof and its cost have to be about the same thing. Computing them together
 * is what keeps that true.
 */
export interface ImprovePlan {
  /** Where the reader stands, and what that makes the next move. */
  headline: string;
  /** The whole programme, in order. Five steps to twenty, by tier. */
  steps: string[];
  /** Which of them the reader is on. The panel opens on this one. */
  at: number;
  /** What finishing looks like. */
  proof: string;
  /** The trap. */
  pitfall: string;
  /** Roughly what it costs. */
  effort: string;
}

/** What an entry may carry. The bare array is the old form and still valid. */
const stepsOf = (entry: ImproveEntry | undefined): string[] =>
  Array.isArray(entry) ? entry : entry?.steps ?? [];

export interface ImproveContext {
  /** What this node opens — the reason it is worth the afternoon. */
  opens?: GraphNode[];
  /** What is actually in the way, on a locked node. */
  blockers?: GraphNode[];
  /** Its prerequisites, done or not. */
  needs?: GraphNode[];
  /** The catalogue group the tree sits in, which decides the verbs. */
  group?: string;
}

/**
 * A node's full programme: what is written for it, then the ladder.
 *
 * Written entries lead because they are specific — "balance ten equations"
 * knows something about chemistry that no rung of a general ladder can. The
 * ladder then carries it out to the length the tier asks for, skipping its own
 * bottom rungs, since an entry that exists has already said how to start.
 */
function programme(node: GraphNode, ctx: ImproveContext): string[] {
  const written = stepsOf(IMPROVE[node.id]);
  const steps = [...written, ...ladderFor(node, ctx.group, written.length > 0 ? 2 : 0)];
  const opens = ctx.opens ?? [];
  if (opens.length > 0) {
    steps.push(`Then start ${opens[0]!.name}, which this one opens.`);
  }
  return steps.slice(0, Math.min(MAX_STEPS, TIER_WINDOW[node.difficulty].count + (written.length > 0 ? 2 : 1)));
}

/**
 * A locked node's steps are about the lock, not about the skill.
 *
 * The reader cannot do this one. What they can do is the first thing in the
 * way, so that is what the list is — the blocker's own programme, named as the
 * blocker's.
 */
function blockedSteps(blockers: GraphNode[], ctx: ImproveContext): string[] {
  const first = blockers[0]!;
  // The heading line counts toward the cap: a locked Mastery blocker would
  // otherwise put twenty-one steps on a node you cannot even start.
  return [
    `Nothing here moves until ${first.name} is done.`,
    ...programme(first, { ...ctx, opens: [] }).slice(0, MAX_STEPS - 1),
  ];
}

/**
 * Which step the reader is on.
 *
 * Read off the percentage, because that is the only signal there is — nothing
 * records which of five moves somebody has made. It is an estimate and the
 * panel says so by numbering the steps rather than ticking them.
 */
function stepAt(node: GraphNode, total: number): number {
  if (node.status === 'locked' || node.status === 'available') return 0;
  if (node.status === 'complete') return Math.max(0, total - 1);
  return Math.min(total - 1, Math.floor((node.percent / 100) * total));
}

/**
 * The one line above the steps: where they stand, and what that makes the next
 * move. Short, because it is a caption and not an introduction.
 */
export function improveHeadline(node: GraphNode, blockers: GraphNode[]): string {
  if (node.status === 'locked') {
    const names = blockers.map((entry) => entry.name);
    if (names.length === 0) return 'Locked until its prerequisites are done.';
    const list =
      names.length === 1
        ? names[0]!
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;
    return `Finish ${list} first.`;
  }
  if (node.status === 'complete') return 'Done. Keeping it is the work now.';
  if (node.status === 'progress') return `${Math.round(node.percent)}% of the way.`;
  return 'Not started.';
}

/** What to go and do about a node, in full. */
export function improvePlan(node: GraphNode, ctx: ImproveContext = {}): ImprovePlan {
  const entry = IMPROVE[node.id];
  const stated = Array.isArray(entry) ? undefined : entry;
  const blockers = ctx.blockers ?? [];
  const locked = node.status === 'locked' && blockers.length > 0;
  const name = inline(node.name);

  const steps = locked ? blockedSteps(blockers, ctx) : programme(node, ctx);
  const target = locked ? blockers[0]! : node;

  return {
    headline: improveHeadline(node, blockers),
    steps,
    at: stepAt(node, steps.length),
    proof: locked
      ? `${blockers[0]!.name} is done, and this opens.`
      : node.status === 'complete'
        ? `A month from now you can still do ${name} cold.`
        : stated?.proof ?? (PROOF[ctx.group ?? ''] ?? PROOF_DEFAULT)(name),
    pitfall: locked
      ? TIER_PITFALL[target.difficulty](inline(target.name))
      : node.status === 'complete'
        ? `${node.name} fades quietly. You find out on the day you need it.`
        : stated?.pitfall ?? TIER_PITFALL[node.difficulty](name),
    effort: locked
      ? `${TIER_EFFORT[target.difficulty]} Then this one.`
      : node.status === 'complete'
        ? 'A short revisit every month or so.'
        : TIER_EFFORT[node.difficulty],
  };
}
