# Changelog

Notable changes, newest first. Dates are the day the work landed on the branch.

## 2026-10-04 — The whitespace under the analytics tabs, found; Subjects and Growth whole again

### The whitespace

Every analytics tab could be scrolled past its last card into empty space, and
how far depended on the window and the chart grain. The 2026-09-25 entry below
blamed `.ax-page`'s `min-height: 100vh`; removing that was right but was not
the cause, which is why the band came back.

The cause was the line chart's screen-reader table (components/Analytics/
charts.tsx). It carried `.ax-sr` — absolute, `height: 1px`, `overflow: hidden`
— on the `<table>` itself. A table honours neither: its height is a minimum and
it lays out as tall as its rows, and `overflow` does not apply to it; `clip`
only stops it painting. So an invisible table as tall as the series sat at the
chart's position, and being absolutely positioned it still counted toward the
document's scrollable height. Measured on a seeded account at 1440×900, Overview
at a year by week: content ended at 1,841px, the table at 2,090px, the document
at 2,090px. A longer series is a taller table, which is why "All time" on a
five-year account was the worst of it.

The table now sits inside a `div.ax-sr`, which does clip it. Measured after, on
all five tabs and every window from 7D to All Time, the document ends 40px —
the page's own padding — under the last card. A test in charts.test.tsx scans
every component for a visually-hidden class on a `<table>`, so the same trap
fails the suite rather than the page.

### Subjects and Growth

The two tabs have their content from before the complexity cut back. Growth
opens on Skill Growth again, with Skills by level, Time and what it bought, the
shape of a skill, When the work actually happens and Every day of the last
year. Subjects has the Skills & Subjects chapter, How far into each tree, What
each subject opens, the per-goal limiter lines and the Skill Level list, and
keeps XP by subject. Skill levels are still read on the server; the restored
tree tile reads them from there rather than working them out again.

### The grade card

The Overview's grade card lists the five measures — Productivity, Quality,
Consistency, Efficiency and Focus — each with its own letter and its score out
of ten.

## 2026-09-26 — The subject page gets tabs, three counts and one list of insights

Four changes, and the shape of the page after them is: what it comes to, what
it is for, what to do, what the record says — then a tab holding the working.

**Evidence is a tab.** Nine folds used to sit on the end of the overview.
Shut was already right, but a shut fold is still a row to read past, and
there were nine of them between the last thing a reader came for and the
bottom of the page. The strip is the analytics page's own `.ax-tabs-major`
pills, beside the window picker, so a reader arriving from there does not
have to learn a second control.

**Three counts under the verdict.** Total tasks with its change against the
window before, the streak, and the focus area. They need none of what the
verdict above them needs: counts are true from the first task, where the ring
says "unrated" until something is rated. The streak moved here off the
standing card's badge row, which keeps its two readings — which way it is
going, and where execution stops holding.

There were four. A "Completed" card printed `state.finished`, which is the
figure the ring above prints under itself — the same number twice, forty
pixels apart, in the same window. Its change chip was worth keeping and moved
onto the tasks card, where the drawing had it anyway. The completion rate
went with the card: finished over filed is a fact about the pile rather than
about the work.

**"What matters now" and the bottleneck panel are gone.** Three evidence
cards over a fourth card naming the bottleneck, all four chosen out of the
same arithmetic in `objective.ts` — so the region argued one finding up to
four times, with the same counted lines repeated under each. Two screens of
page restating the difficulty cliff. `evidenceFrom` and the candidate list
behind it are deleted.

What survived is the bottleneck's *name*, which was the only part of it a
reader could act on: it is the "Focus area" card. Its confidence did not —
a bottleneck named at 0.45 and one named at 0.8 are the same instruction to
somebody reading a card. Where the record cannot name one, `bottleneckFrom`
returns null and the card says "Not yet" rather than hedging.

**One list of key insights.** The reading drew three shapes stacked —
findings with a confidence badge, a numbered "In this order" block, and
insights in a `FROM:` / `SO:` layout — three type scales all about the same
handful of figures. It is one list now: icon, claim, a line of detail, and a
word for which way it cuts.

That word is a new `direction` on every finding and every insight, the same
closed `helps` / `hurts` / `watch` the goal evidence already used rather than
a second vocabulary. Without it the page has to guess a tone from the prose,
and "execution is improving" gets drawn in the colour of a problem because it
arrived in a list called diagnosis. Readings saved before the field existed
normalise to `watch`.

The priorities went with the badges. "In this order" was a third ranked list
under two the reader can act on — the app's ranked advice and the model's
next steps, both of which make real tasks. The model still writes them; they
order the steps.


## 2026-09-26 — "What the record says" gets a calendar, and says something without being asked

Every figure on the subject page is about how the work *goes* — execution 47,
quality 43, falls off at Hard. None of them is about how much of it there is,
or when. A reader who has not opened a subject in three weeks and one who has
worked it every day got the same page.

So the section leads with a heatmap: one square a day, shaded by how much
landed in this subject, with its own window — 7D, 30D, 90D, 1Y, All Time. The
gaps are as legible as the dark squares, which is the point; two weeks off
is a white band and it is invisible everywhere else on the page.

**It is the habits tab's calendar, filtered.** `habitDays` and `habitCalendar`
already build this grid out of a task list, and `.ax-heat` in analytics.css
already draws it at two shapes — a week per column above a month, the ordinary
month calendar below one, where four columns of squares read as a rendering
fault. The only thing the subject version adds is which tasks go in. Two
heatmaps shading by different rules, or turning the week over on different
days, would be two readers' worth of confusion for nothing.

**Its window is not the page's**, for the reason the habits calendar gives:
seven days is seven squares and not a map, All Time on a long account is a
decade of them, and "what does my rhythm look like" is asked at whatever zoom
the reader wants. Keeping them apart also means moving this cannot silently
rewrite the verdict at the top of the page.

**The section now draws without a reading.** It used to be the model's
findings and nothing else, so on a page nobody had pressed the button on it
did not exist — a section called "what the record says" that says nothing
until a model is asked has the relationship backwards. The calendar is
counted and leads; the findings follow under their own note, behind a dashed
rule, so which half is arithmetic and which is prose stays visible without
reading the note that says so.

**"Which days" is gone from the Over time fold.** Seven bars of tasks per
weekday was the only thing on the page counting the calendar, and the
heatmap's *rows* are the weekdays — the same reading at day resolution, with
the gaps a weekday total averages away. The busiest day is still named on
that fold's shut row, because stating it beats reading it off a grid.


## 2026-09-26 — The subject page stops saying everything twice

An audit of every figure the page draws, against every other place it drew it.
Sixteen sections became twelve, the page is about 15% shorter with the same
folds shut, and nothing counted was lost — it is stated once now, in the
section that owns it.

### The repeats

- **Two cards answering "where am I".** A `SubjectFacts` strip opened the page
  with "34 tasks · 12.4h · 71% completed" and a momentum sentence, and the
  standing card under it had a ring, a verdict and four badges — of which one
  was the same hours, one the same momentum, and one the goal that
  `ObjectiveBand` states underneath at the size of a heading. One card now,
  and it is the first thing on the page.
- **The bottleneck and the card above it were the same finding.** Both are
  chosen out of the same arithmetic, so both picked the cliff: "Work stops
  landing at Hard" as an evidence card, then "Work at Hard" as the
  bottleneck, citing the same two rungs and the same 50-point step. The
  bottleneck keeps it — it is the one with the judgement and the ruled-out
  line — and `evidenceFrom` is told which card not to be.
- **Difficulty, three times.** A curve (execution per level), a column chart
  (tasks per level) and a table with both as columns. The table is the
  superset; the chart is gone. The facts strip was drawing the same split a
  fourth time.
- **Seven dimensions, twice.** Bars, then a radar with a legend printing the
  same seven values under it. The radar stays for the shape; the legend goes.
- **Recent sessions, twice.** A strip of anonymous percentage dots above the
  list of the same tasks by name, score and duration. The named list is the
  one that says which session went wrong; the run's trend survives as the
  fold's shut-row figure.
- **Hours, three times** (standing badge, a "Time on it" tile, and the whole
  "Time spent" fold) — and in two formats, 9h 27m against 9.5h, which reads
  as two facts. **Finished, four times.** The tile row went; its streak, the
  only figure on it that lives nowhere else, is a badge on the standing card.
- Smaller ones: the "Most work at" figure over a lead saying the same with
  counts; "Usual task" as a shut-row figure over a body row of the same name;
  the reasons fold's lead over the first row of its own list; the goals
  fold's lead over the meta line on the same goal; `model.insight` two
  screens above the table it is about; `lattice.nodes` on the shut row and
  again under the tree's title.

### What was cut for not being usable

- **"Read this back to me".** A second model, asked to turn the same figures
  into prose, returning a reading and a list of practice sessions with
  minutes and a why on each — which is what "Do this next" now returns,
  except that those steps can be made into real tasks, are kept on record,
  and are checked afterwards by the verdicts strip. `/api/subject_brief` is
  untouched; nothing on this page calls it.
- **"What the score is made of".** Four rates under the claim "the letter
  above is their mean", which was not true: the letter comes from
  `state.overall`, the mean of the seven dimensions drawn immediately above.
  Two of the four were those dimensions again, Timeliness reads "not
  measurable yet" unless tasks are dated, and Follow-through is finished over
  filed, which is a fact about the pile.
- Curriculum sizes in the skill-tree fold — skills, core, per-branch counts.
  Identical on every account and actionable on none, which that fold's own
  comment had said for a while without acting on it.

### The rhythm

Sections were spaced by the shell's gap *and* their own `margin-top`, which
measured out as 40, 24, 34, 40, 49, 40, 40, 48 down the page — eight rules
each deciding alone. The shell's gap is the only spacer now, raised from 16 to
24, with 40 before the Evidence heading because that is a movement break
rather than a gap.

### The order

Standing, then what it is for, then what bears on that, then the one thing in
the way, then what to do about it, then whether the last advice worked, then
the working. The page used to open on counts and put the standing card below
the goal band; the question a reader arrives with is answered before anything
is scrolled.


## 2026-09-26 — The subject reading is shown the work, not only the shape of it

Every next step this panel wrote was a category heading with an imperative in
front of it:

> **01 Focused Easy Execution Practice** — Targeted practice, Easy, 60 min
> Easy execution is 47, the lowest among levels and covers 141 tasks.
> Solve 10 Easy algorithm problems · Self-rate after each · Review mistakes
> immediately

Nothing in it is wrong and nothing in it is advice. It could have been
generated for any account in any subject, and every clause is already on the
chart above the panel.

That was not a prompt problem, which is why tightening the prompt never fixed
it. The brief had no way to produce anything else: it carried seven sections
of aggregate — execution is 47, the curve falls off at Hard, 88 tasks were
finished fast and rated badly — and **not one word about what the reader is
actually working on**. Handed only the shape of a record, a model can say the
shape back or say nothing.

So the brief now carries a `<recent_work>` section: the forty most recently
finished tasks in the window, newest first, as the reader titled them, each
with the two ratings they gave it, how long it took, the reason they picked,
and the task's own note. The same finding then has something to attach to —
"Sprint sets rated 5 at difficulty 2" is a reason to move up, and it can name
what to move up *to*.

Three details worth recording:

- **The note is fetched on the server, not sent.** `description` is the one
  task field `ANALYTICS_TASK_FIELDS` deliberately withholds — unbounded free
  text on every row, most of the payload when it was included. Sending it to
  the browser so the browser could send it back would put it on the wire twice
  to reach somewhere it can be read from the database once. The page sends
  ids; `columns_by_ids` joins the notes on in one indexed query, on the one
  action that was already going to cost a model call.
- **Titles are labelled as what they are.** The same guard `<skill_vocabulary>`
  carries. A title is what somebody typed, and left unlabelled beside seven
  counted sections it is an invitation to "your Sprint-round work is at 72" —
  a number about a person that nobody counted.
- **The prompt now has a test in it.** For every next step, priority and
  drill: could this sentence have been written for somebody else? If it could,
  it is filler. "Self-rate after each" is true of every session this app has
  ever recommended.

The model is also told what to do when the titles say nothing — "Maths",
"homework", "study". Pitch at the subject and the difficulty and say so. A
confidently invented syllabus is worse than a general instruction, because the
reader cannot tell which parts were known.


## 2026-09-26 — The tail of Records gets its containers, and every page fills its column

Two things, and the second is app-wide.

**The rest of the records page is in cards.** Milestones, "What Summit noticed"
and the chase under it were still bare blocks on the page ground while the two
sections above them had become panels. They are panels now, with the same
heading treatment — a glyph in a tinted square and the title in sentence case.

**Every page fills the column it is given.** `.page-shell` was
`min(95%, 1400px)`, and both halves of that were spending screen on nothing.
The 1400 capped every page that did not override it — settings stopped at
1400px in a 1789px column, 389px of it empty. The 95% is worse in kind: it is a
*share*, so the band it leaves grows with the window, which is the opposite of
what a margin should do. The default is now no ceiling and a flat 20px gutter,
with a cap left to pages that genuinely want one.

Then the pages that set their own: analytics 1500 → none, skill tree 1520 →
none, records 1500 → none, the dashboard's 1680 → none, and the proportional
gutters on tasks, goals, notes and the calendar (95–97%) → the shared 20px.

Two things this turned up:

- **The dashboard had the `.app-main` bug too.** `body:has(.dash) .app-main`
  sets a width on `<main>`, which is *inside* the React mount point, and
  `width: 100%` of a shrink-to-fit parent is the shrink-to-fit width. goals,
  notes, records and analytics each document having fallen into this and name
  `#root` as well; the dashboard did not. It was invisible while the page had a
  `max-width` holding it open, and the moment the cap came off `#root`
  collapsed to 1477 in a 1789px column. Fixed the way the others were.
- **Settings' reading measure moved off the card and onto the text.** The
  820px cap was there to protect the measure, but a settings row is a label at
  the left and a control at the right and that reads fine at any width. What
  does not is the sentence under the label, which is the only prose on the
  page — so `.st-row-text` carries a 72ch cap and the card fills its column.

Measured at 1800×950 with the rail settled: every app page now ends flush with
its column, and what is left at the edges is each page's own padding.

## 2026-09-26 — The records page, laid out exactly to the drawing

A second pass over the layout, taking the remaining details literally. The
palette is deliberately not followed: the drawing is blue throughout and this
page stays violet and gold, which is the app's accent.

**Marks in squares, four places.** The drawing puts a tinted rounded square
holding a glyph at the head of every group: on each of the four figures, on
every best card, on the two panel headings, and at the left of every history
row. The figures previously carried their tone as a 2px rule along the top of
the card — a second border on a page whose cards already have one — and that
rule is now the square, which puts the colour where the eye starts.

**The category chips went back to plain words.** The pass before this made the
category on a best card a pill; the drawing tints the *square* and leaves the
word beside it plain, which keeps one tinted object on the line rather than two
competing for the same job.

**The last two sections are panels with their headings inside them,** set in
sentence case beside a glyph, rather than a line of small caps above them.
"Your best" keeps the old treatment because the drawing shows it that way too —
so this is a modifier on a section, not a change to what a section is. The
chart carried a card of its own and loses it inside the new one: a card inside
a card is the frame this page keeps having to be talked out of.

**Every history row is its own bordered card** with air between, not a row
divided by a rule, and its figure sits over the thing it is measured in — "918"
over "problems", "25" over "/ 25". `splitValue` cuts what `formatValue` already
produced rather than formatting a second time, so there are not two places
deciding what 133.5 looks like. Minutes have to be excluded by name: "4h 18m"
is one figure with a space in it, and splitting on the last space would print
"4h" over "18m".

**Inferred, where the drawing could not be followed literally.** It shows a
different glyph per category and the app has no category→icon map to reuse —
the subject icons in services/subjects are image URLs keyed on subjects, which
categories are not. `CATEGORY_ICON` is that map, over the names categories
actually take, with `trophy` under anything unlisted. The icon set has no note,
bracket or barbell in it, so these are the nearest marks it does have: the chip
is the layout, and the picture inside it is a detail the set can grow into.

## 2026-09-25 — The records page is laid out to the drawing

Worked against a layout of the page. The top half already matched it — hero,
four figures, the meta line, the filter chips and the grid of bests are what
they were. Everything below the bests moved.

**One section, not two.** The chart lived under "How your records changed" and
the search, category and sort lived on the history column below it. They are
one thing: the toolbar narrows the *rows*, and the rows are what the chart is
drawn from, so a strip that appeared to govern only the list under it was in
fact governing both. It now sits at the top of the section, which is where the
drawing puts it, and the section is called "Records timeline".

**The history is a flat list of rows, full width.** It was a dotted spine down
the left with the date written once above everything that happened under it,
in a column beside the milestones. The drawing lays it out as six columns —
mark, what it was, category, when, the figure, the change — so the date comes
back onto every row and the section takes the whole page. Half a page is not
enough width for six columns without the figures wrapping under the names.

Losing the day grouping is a real trade and worth naming: two records set on
one afternoon no longer read as one afternoon. What is bought is that every row
is independently readable and the figures line up into columns down the list,
which is the point of drawing it flat — a reader can run an eye down the change
column. It also settles an inconsistency that was already there: the list can
be sorted by biggest improvement, and under that ordering a day heading groups
by something the list is no longer sorted on.

Paging is unchanged and still counts days; the rows are flattened at the point
of rendering, so there is still one definition of how much history is showing.

**Smaller things the drawing asked for.** The category on a best card is a chip
rather than a line of small caps, so the top of the card scans as a label
attached to something rather than as its first line of text. The milestones
section and "What Summit noticed" keep their place under the new list — the
drawing stops at the fold and does not say to remove them.

Not followed: the drawing is blue throughout and this page is violet and gold,
which is the app's accent and not this page's to change.

## 2026-09-25 — The dashboard's cards come back, tinted

Worked against a drawing of the page, and it reverses most of the entry below
it: that pass took every band out of its box and divided the page with rules,
and the drawing keeps the boxes. What it changes is what a box *is*.

**The four figures are tinted, each its own hue.** They already declared one —
every card's disc is `.dash-chip-today` / `-xp` / `-focus` / `-streak`, four
tints that existed only as a 34px circle. The colour now runs across the whole
card: a flat 5% wash with a 12% bloom in the top-left corner. A corner gradient
on its own was the first attempt and it faded out before the middle, leaving
four white cards with coloured corners; the drawing's are tinted edge to edge.
Four to eight per cent is the whole usable range — under it the row is four
identical rectangles told apart by their heading, over it the wash competes
with the figure printed on top of it.

The tint is keyed off `:has(.dash-chip-*)` rather than a second class on the
card. The tone is a prop on `StatHead` and it reaches the DOM once, as the
disc's class; reading it back means a tone cannot be changed on the disc and
forgotten on the card, which is how a set of four like this usually drifts.
One rule serves all four, with `--tone` mixed into the wash, the border and the
foot strip, so a tone is one colour in one place rather than three values kept
in step by hand.

**Flatter and rounder**: 20px corners rather than 16, a border a shade lighter
than the app's, and the shadow down to a 4% hairline. A tinted card does not
need a shadow to lift off the page; it is already a different colour from it.

Kept from the pass below: the greeting stays out of a box, the mountain range
behind it stays hidden, and the page keeps the width it gained — the drawing
runs its cards very nearly to the edge, and the 1370px cap was leaving a band of
ground down each side of a 1600px window.

The half of the page the drawing does not show follows the cards above rather
than inventing a second treatment. The three insight panels stay white like the
task list: tint is doing a job in the figure row — telling four similar things
apart — that it has none to do among three panels that are read rather than
scanned, and four tinted figures over three tinted panels leaves the page with
no quiet part. "Worth changing" takes the accent from its own disc at the same
strength, because it is the page's voice rather than a fifth figure. The quote
stays a line of text: boxing it would end the page on a card holding one
sentence.

## 2026-09-25 — The dashboard comes out of its boxes

Every band on the dashboard was a card: a white surface, a 1px border, a 16px
radius and a shadow, floating on the graph-paper ground with 24px of it showing
in between. Seven down the page and three or four across inside the widest of
them, which is how a single figure ended up four frames deep — the window, the
page's ground, the card, and the cell inside it. `.dash-week-cell` had already
dropped one of those frames for exactly this reason; this is that argument
applied to the rest of the page.

What the cards were doing was saying *this group ends and the next begins*. A
rule says it with one pixel instead of four borders, a radius, a shadow and the
ground around it — and without also implying the contents are a separate object
parked on the page. So the surfaces are stripped and the grouping moves to the
lines: `border-top` down the page, `border-left` between columns, and each band
or column paying for its own room in padding instead of a shared gap.

The edge whitespace went three ways. The page was capped at 1370px, which on a
1600-wide window left about 140px of ground down each side — the cap is 1680 now,
which is where a line of text actually starts being too long to track rather than
where a 16-inch laptop happens to sit. Page padding drops 24px to 20px. And the
cards' own 24px inset is simply gone, so the first word of the page and the last
figure in a row sit on the page's margin rather than a card's.

Three things this turned up on the way:

- **The rules follow the real breakpoints.** The three grids reflow at 1240 and
  768 and they do not reflow together, so each is handled separately. A left-hand
  rule on a column with nothing to its left is a line down the side of the page.
- **Every reset is written in the shape of the rule it undoes.** `.dash .dash-stat`
  cannot clear `.dash .dash-stat + .dash-stat`: one class more specific wins
  wherever they disagree, whatever the source order. The 2x2 layout kept a stray
  rule on the third card until the resets matched.
- **Focus mode had to learn about padding.** It collapses four bands with
  `max-height: 0`, which covers neither the padding added to that height nor a
  1px border that paints over nothing. Without `padding-block: 0` and
  `border-block-width: 0` it left a stack of hairlines and ~150px of empty band.

The greeting's mountain range is hidden here rather than unboxed. It is lit by
the hero's own gradient and clipped by its radius; with the card gone it was a
grey smear over graph paper it was never drawn against.

Scoped to `.dash` throughout and written against the page's own six classes
rather than `.ui-card`, deliberately: the task dialog, the catch-up sheet and the
level-up card all mount inside `.dash` and are genuinely boxes. Other pages are
untouched.

## 2026-09-25 — What Summit knows starts saying what to do about it

The block was four facts and nothing else. "Mathematics is 16% of your recorded
work" is true, and a reader who has just been told it still cannot say whether
that is good or what it asks of them — so the page's most personal section was
also its least useful, four more numbers on a screen that already had ninety.

Every fact now carries an `advice`: the consequence, then the instruction. It is
**chosen by the figure rather than attached to the heading**, which is the whole
difference between a coach and a template — a 90% share and a 20% share are the
same sentence with a different number and want opposite advice, so each builder
branches on where its own figure sits, against named thresholds. An unbroken
record is told to stop protecting itself and spend a day on something hard; a
patchy one is told which day of the week to defend. A ten-task average is told
to cut to three; a two-task average is told to add one it might not finish. A
subject at 16% of five reads as a week with no centre, one at 60% as a
specialism to keep or to take an hour back from.

The advice never invents evidence — it restates, in the imperative, what the
figure beside it already establishes. Anything needing a second number belongs
on Recommendations, which is built to carry the arithmetic, and that boundary is
what keeps the Overview from becoming a second copy of it.

In the markup the order flipped: the instruction is in body ink and the figure
is set under it, small and muted behind a hairline. Same two sentences either
way round, and the order is what decides whether the block coaches or recites.
The evidence stays, because advice with nothing under it is a horoscope.

## 2026-09-25 — The analytics pages stop reserving a viewport they do not use

`.ax-page` carried `min-height: 100vh` so that `--ax-bg` would cover the window
on a short tab. `--ax-bg` has been `transparent` in both themes since the
background moved to the app shell, so the rule was holding a viewport open for
a colour that is never painted.

It was worse than idle. The box starts *below* the top bar, so `100vh` measures
a viewport from there and overshoots the window by the bar's own height.
Measured at 1200×900 with content ending at 410px, the document came to 1029px:
a page that fits on screen, made scrollable, with 620px of nothing under the
last card. Every one of the seven tabs inherits it, which is why this reads as
"the analytics pages have whitespace at the bottom" rather than as one page
being wrong. With it gone the same page is 900px, not scrollable, and the only
space under the last card is the 40px of page padding that was always meant to
be there.

`.ax-building` — the "not enough record yet" card — loses its `52vh` for the
same reason: a viewport is not a unit of content, and that block is not always
the only thing on its tab. 340px centres a card of about 200 at any window
size.

## 2026-09-25 — The goal groups get a card, and say something new

## The whitespace was never the gap

This has been reported five times and fixed twice, both times by adjusting the
space below the two collapsed groups. Measured, that space is 24px — ordinary
section rhythm, and not what anybody was looking at.

The two `PanelGroup`s were the only things on the Recommendations tab not
inside a panel. Shut, they were four lines of text and two chevrons on the
page's own background, with a hairline over each and no edge anywhere near
them. Nothing said where the region ended, so everything below it read as part
of it. That is not a gap that can be tuned away.

Both groups are in one `.ax-panel` now. Shut, it is a closed card with two
rows; open, a card with its contents inside. The 24px below is unchanged and
now reads as the space between two cards, because that is what it is.

## "From your goals" became rows you can tell apart

The rows were three stacked spans with a hairline between them, no padding and
no background — a list, on a tab made of cards. Worse, they led with the
instruction, so two goals stalled for the same reason produced two rows both
opening **Put one of its tasks on this week**, identical for two lines, with
the only thing distinguishing them in grey at the bottom.

They are cards now, with the amber stripe `.ax-limiter` uses, and the **goal's
own name leads**. The instruction follows it, which is the order it can
actually be read in.

## Two sentences that said nothing

- **"…is currently the biggest limiter"** is a comparison, and at 100% there is
  nothing to compare against. When one subject holds the whole shortfall the
  card says *"Nothing has moved lately, and all of it is Computer Science."*
- **"This accounts for about 100% of the work on this goal that went badly"**
  sat directly above *"26 of the 26 tasks you rated as going badly on this goal
  are filed under Computer Science"* — one fact, written twice, the second time
  better. The percentage line is dropped whenever it is a share of everything.
- **"Nothing finished in 1116 days"** is accurate and unreadable. It is *over 3
  years* now; months above eight weeks, years above eighteen months, exact days
  below that, where the difference between eleven and nineteen is worth having.
  `goalAnalytics.since.test.ts` pins the boundaries and the plurals — it caught
  "1 days" on its first run.

## 2026-09-25 — Every badge gets its own picture

The wall had forty drawings for a hundred and forty-nine badges. Everything
without an exception fell back to its metric, so the seven streak badges were
seven identical flames, the six tree-progress badges six identical lattices,
and a page whose whole job is to be looked at had one picture for every four
things on it. A row of tiles differing only in their text is a list with
decoration.

All 149 are drawn now, and where a family climbs the drawing climbs with it:
the streak runs spark, flame, torch, bonfire, comet, sun, orbit — a year being
one trip round. The mountains go footprints, stairs, ladder, an arrow, a tent,
a flag on the top.

- **51 new shapes**, each a stroked path that still reads at the sixteen
  pixels a tile's hexagon actually gives it — which is what rules out anything
  with a face, a hand, or more than about six strokes.
- **The tables moved** to `components/Achievements/glyphs.tsx`, the way
  `components/Analytics/glyphs.ts` already does it. The page was 1,155 lines
  and most of the growth would have been art.
- **Not globally unique, and deliberately so.** 149 distinct shapes that all
  still read at that size do not exist, and inventing them would mean drawings
  that say nothing about their badge. What is guaranteed is that no two badges
  sharing a metric or a category share a drawing — the ones that end up beside
  each other.
- **`tests/test_achievement_art.py`** holds the catalogue and the art
  together. A badge added in `backend/api/achievements.py` without a drawing
  now fails a test instead of quietly becoming the fifth identical flame.

The wall's gap went from `--space-3` to `--space-5`, the gap every other row of
cards in the app uses. Twelve pixels is the spacing for things that belong
together inside one card; a hundred tiles at twelve pixels read as a single
ruled sheet. The four recent cards above it match.

## 2026-09-24 — A C++ engine, for the one thing Python is wrong for

`engine/` builds one small shared library; `backend/engine/` loads it with
ctypes and is the only thing in the backend that knows it exists. Nothing
requires it — `backend/engine/schedule.py` keeps a pure-Python planner and uses
it when the library is missing, stale or switched off with `SUMMIT_ENGINE=0`.
An unbuilt engine is a slightly worse plan, never a broken app.

What it does is **schedule**: fit a list of tasks into the week ahead, by
greedy seed and then simulated annealing over relocate-and-swap. 200 tasks
across 40 slots is 328,000 candidate rearrangements in 10ms, about 32 million
iterations a second.

**What it does not do is the rollup**, and that is the part worth keeping. The
daily rollup in `analytics.py` was the obvious candidate — the "10,000 users ×
50,000 events" shape — and it was written, proved equal to the Python on five
random datasets, and was *three times slower*. Flattening the nested dicts into
buffers cost 483ms against the 511ms the whole Python rollup took, before the
engine had added a single number. A rollup's work is proportional to the rows
going into it, so moving the work moves the rows, and there is nothing left to
win. It was deleted rather than shipped behind a flag.

So the rule, written at the top of `engine/include/summit/schedule.h`: **send
C++ a small question with a large answer behind it.** Planning sends 12KB and
gets 800 bytes back with a few million rearrangements in between; that ratio is
the whole reason the boundary is worth crossing.

No rule about Summit is in the C++. It is handed durations, values, deadlines,
subject ids, capacities and weights, all decided in Python. The one exception
is the scoring function, which exists in both languages because the fallback
planner needs a ruler on a machine with no engine — and the two are asserted
equal in `tests/test_engine_schedule.py`.

Nothing is wired to a route yet. The measurements and the call shape are in
`engine/README.md`.

## 2026-09-24 — The four stat cards get one header, and a week

The row had four different card shapes. Two led with an icon and two with bare
text; two carried a line under the name and two did not; the corner was a
different thing on each. Four cards holding four halves of the same question
looked like four unrelated panels.

- **One header on all four**: a 40px tinted disc, the name, a line under it
  about what the card is for, and a corner. The disc is a circle and larger
  than the 28px squares further down the page, which is what says this row is
  the top of the dashboard and the panels below it are not.
- **The corner is the Focus card's alone** — the 18px mark that opens the
  hidden chain, in the flow now rather than absolutely positioned over the
  card. The trend badge went back to a line under the header: a card is about
  270px of content here, and a name beside "about usual" is more than that.
- **Two footnotes became panels.** The Focus card's goal and the Streak card's
  record are each a *second* number, and a second number in the same box as
  the first reads as a continuation of it. Inset, bordered, they read as what
  the figure above is measured against.
- **Today's Progress stacks its figures** — a mark, the number, the label
  under it — so the card reads as three numbers first and three labels second.
- **The Streak card grew a week.** Seven marks, worked out from
  `current_streak` rather than fetched: a run of *n* is the last *n* days up to
  today, so the strip is the figure beside it drawn sideways and the two cannot
  disagree. Days still to come are drawn as neither done nor missed. It starts
  on the day `week_starts_on` says the week starts on.

The tag lines are pitched at `--text-xs` and the corner wraps before the name
does, both for the same reason: at four across 1370px, one card wrapping where
the others do not is the whole of what made the row look untidy.

## 2026-09-24 — The day turns over, and the goal comes off the method

Two bugs in `hooks/useFocusSession.ts`, both of them the same mistake: it read
an answer once and never asked again.

**The day.** The record is keyed `focus:<user>:<date>` and the date was read
off the clock at every write, while the state in memory belonged to whatever
day the tab had loaded on. Past midnight those disagree, so the first save of
the new day wrote yesterday's banked seconds under today's key and the morning
opened already won. The day is carried in the hook's state now and `rollOver`
turns it — on a minute's watch and whenever a hidden tab comes back. A session
running across midnight is cut in two rather than stopped: the part before is
banked against the day it was earned on, and the new day picks it up from its
own midnight.

**The goal.** It was `focus_goal_hours` in Settings, while the same account was
separately choosing a pomodoro level and style that already say how long its
day is meant to be. The order is the day's own goal, then the method
(`utils/pomodoroChoice`, read off `goalHoursFor`), then Settings for an account
that has never opened the timer. The timer announces a change so the Focus card
follows a level moved on another page without a reload.

## 2026-09-24 — The stat cards spend their slack on the figure

Four cards in one grid row are all as tall as the tallest, which is Today's
Progress and its ring. The other three put the difference in a single band —
heading, figure, a hole, then a footnote pinned to the floor by `margin-top:
auto`. `.dash-stat-mid` takes the slack instead and centres what is in it, so
the gap is split around the thing the card is about, and the footnotes line up
across the row without anything being pinned anywhere.

## 2026-09-24 — The hidden chain works in the light

The door and the pentagon after it both checked for dark mode, and between them
they made the chain unfindable rather than hidden: ten clicks on the mark in a
light-themed dashboard did nothing at all and explained nothing. Both gates are
gone. The silence of the first three clicks is what hides it, and the pentagon
no longer takes a pointer cursor in one theme and not the other — which was the
one visible tell it had.

## 2026-09-24 — No graph paper behind the calendar

The app's background grid is 80px squares that creep a square every forty
seconds; the calendar draws its own at 86px. Matching the pitch was tried and
cannot work, because the calendar's hours scroll inside their own pane and a
fixed layer cannot follow them. The paper comes off on a calendar view. The
wash and the drifting dots stay — they have nothing to line up with.

## 2026-09-24 — The four stat cards line up

Two of the headings on the dashboard's top row carry a 28px tinted disc and two
are bare text, so the heading box was 28px on Focus Time and Current Streak and
about 19 on Today's Progress and XP Overview — a 16px `--text-lg` line. Four
cards in a grid row all start at the same y, so the two titles with an icon sat
four or five pixels below the two without, and every figure under them inherited
it. Nothing was wrong inside any one card, which is why it read as vaguely
untidy rather than as a bug.

`.dash-stat-title` reserves the icon's height on all four now, and centres what
is in it. Giving either of the other two an icon later changes nothing.

## 2026-09-24 — The hidden chain gets its own front door

The way in was ten clicks on the rank in the rail's foot. The rail is mounted
outside the router, so those clicks could land anywhere in the app — and the
quote they open is on the dashboard alone. Bridging that took a navigation, an
in-memory latch and a window event carrying the news between two components
that never shared a parent.

The door is the Summit mark in the top-right corner of the Focus card now, and
the quote it opens is at the foot of the same page. Both are children of
`pages/Dashboard.tsx` and are on screen together, so one window event carries
the tenth click and nothing has to be held over.

- **`hooks/useTitleEgg.ts` is gone**, and so are `armReveal` and `takeReveal` in
  `utils/easterEgg.ts`. The latch existed to get a reveal across a page change
  that no longer happens. `EGG_UNLOCKED` stays, because the door and the room
  are still two components.
- **The rail's title is a title again** — no ref, no click handler, and the
  tremble it used to do is out of `styles/rail.css`.
- **The build is a curve, not a ramp.** Three clicks in silence, then the shake
  climbs as the square of the count: 0.7px on the fourth, 6.3 on the sixth,
  25.2 on the ninth, against the reveal's own 30. Linear gave six even steps,
  which reads as a control with a rate rather than as something about to give.
- **The mark is furniture first.** No role, no tabIndex, no alt text, no
  pointer cursor: what it looks like is a logo in the corner of a card. Silent
  for its first three clicks, and silent for good once the chain has paid out a
  title. (It was also silent in the light, which turned out to be a way of
  being broken rather than hidden — see the entry above.)
- **`Rail.egg.test.tsx` is now `Rail.title.test.tsx`**, holding the title menu.
  The door is tested in `components/Dashboard/StatCards.egg.test.tsx` and the
  room in `components/Dashboard/DailyQuote.test.tsx`.

One consequence worth knowing: Settings can hide the daily quote (`show_quote`)
and the stat cards (`show_stats`). One takes away the room and the other the
door, and neither says so — a setting that explained itself would be
advertising the secret.

## 2026-07-31 — The month view moves up the page

Both sides of the month — the name and its grid, the plan and its events, the
progress ring — rise by 20% of the screen height, closing the empty band the
vertical centring left under the top bar.

Twenty per cent is what there is room for on a tall screen and more than there
is on a short one: at 1440×900 a flat 20vh (180px) drives both headings up
behind the fixed top bar and the view selector, which don't move out of the way.
So the shift is the smaller of 20% of the screen and the room actually above the
headings — the full 260px at 1440×1300, 88px at 1440×900, and nothing at all
below 1120px, where the columns stack and the calendar is already at the top.

It is set alongside the heading alignment (`syncDayPanelToMonth`), so the two
are always worked out from the same measurement and the headings stay on one
line at every size. The shift is applied without a CSS transition on purpose: a
transition needs frames, and this runs at moments — a hidden pane being
revealed, a background tab — when there are none.

## 2026-07-31 — The calendar's controls find their corner

Week / Day / Month led the page from the top-left, on a row of its own above
whichever view was showing. It is one control shared by all three views, so
rather than three copies it comes out of the flow and pins to the card's
top-right corner — landing opposite each view's date selector, on the same
line, in every view.

- **Week and Day**: the date and its arrows on the left, the selector on the
  right, one row.
- **Day**: the Focus button is gone. Focus is started from the dashboard's own
  panel, and the Day view's Focus card still shows and edits the same session.
- **Month**: the "Add New Event" button is gone, and "What You'll Do Today" now
  starts on the same line as the month name. The dates block is centred
  vertically in its column, so where the month name lands depends on the height
  of the card and the grid beneath it — the panel's offset is measured from it
  (`syncDayPanelToMonth`) rather than guessed, and re-measured when the month is
  drawn, when the view is revealed and after a resize. Below 1120px the columns
  stack and there is no shared line, so the offset is dropped.

Two things learned the hard way, both the same lesson: `requestAnimationFrame`
never fires for a pane that is `display: none`, and it doesn't fire in a
background tab either. The reveal hook and the resize handler measure straight
away or on a timer instead.

## 2026-07-31 — Growth and the calendar lose their card

Both pages drew themselves inside a panel: a rounded card, inset from every
edge, with the real content inside it and a margin of empty page all the way
round — two frames between the data and the screen. The card is gone from both.
Its background, border, radius and shadow are dropped, the `--shell-fluid` /
`--shell-max` caps are lifted to the full width, and the room it was spending
on itself goes to the content.

- **Growth**: the chart's own white panel goes too (the dark theme had already
  made it transparent; the light theme now agrees), so the graph is drawn
  straight onto the page. The charts grew from `clamp(180px, 34vh, 340px)` to
  `clamp(260px, 56vh, 760px)` — better than half the screen instead of a third.
  The report-card view spans the page as well.
- **Calendar**: the week grid runs the width of the screen, the two columns
  have `clamp(20px, 2.4vw, 44px)` between them instead of 15px, and the page's
  own side padding is gone — the card was the only reason for it.

Nothing was resized in JS: the canvases size themselves to their rendered box
(`resizeCanvases`), so the charts simply came out bigger. `fit-scale.js` only
ever shrinks, and at 1024×700 it barely engages (zoom 0.98), so short screens
still fit without a scrollbar.

## 2026-07-31 — Growth's charts arrive by growing (Ascent 1.0.0)

The five analytics charts and the ratings sparkline are hand-drawn on canvas,
and they used to appear finished. Now a chart arrives the way the account it
describes did: every point's height is multiplied by a progress that eases from
0 to 1 over 780ms, so the curve and its fill rise out of the baseline together
and settle on the real figures.

- It plays when a graph is **chosen** and when the page **first has data**, and
  nowhere else. The thirty-second refresh, zoom, hover and resize all redraw at
  whatever progress is current, so they stay instant — a chart quietly
  re-growing every half minute would be a tic, not an entrance.
- The progress is applied in `computeGeometry`, which the hover reads too, so a
  crosshair caught mid-entrance lands on the line rather than where the line is
  going to be.
- The first flat frame is drawn synchronously, not in the first animation
  frame: a chart already at full height would otherwise stand there and then
  drop, which reads as a flicker rather than a start.
- `prefers-reduced-motion` gets the finished chart, immediately.

One thing the tabs didn't agree on: the "Average Task XP Daily" tab is called
`average` and its chart is called `avgTask`, so `initializeChart('average')`
had been drawing nothing at all — the chart only appeared because the resize it
triggers redraws everything. `TAB_TO_TYPE` settles the naming in one place.

## 2026-07-30 — The hidden chain had no first step

Its opening move is ten clicks on the app icon, and `easter-egg.js` was looking
for `document.querySelector('.logo')`. No page has a `.logo` — the top bar's
icon is `.topnav-brand`, and has been since the shared top nav was introduced —
so the script returned before wiring anything up. Nothing after it could be
reached either: no clue, so no pentagon, so no engine. It looked for all the
world like a chain of broken features rather than one dead selector.

- The icon is found by both names now, and in **dark mode it stops being the
  link home it appears to be**: the click is prevented, the icon pops (a bounce
  that grows with the count, beside the screen shake that was already there),
  and the tenth reveals the clue. In the light, or once the clue is out, it is
  an ordinary link again.
- **No streak.** Ten clicks at any pace. They had to land within 1.5s of each
  other, which is not how anybody clicks a logo on purpose.

## 2026-07-30 — A second door into the riddle

The testimonial on the landing page is now a way in. Click it and it twitches;
keep clicking and each one shakes it harder — a wee shiver on the first, the
card thrown about by the ninth — and on the tenth the page itself quakes, the
light goes out and the void riddle is hanging there. Ten clicks, at any pace.

The count started out as a streak, copied from the dashboard logo's ten clicks,
and that made the whole thing dead on arrival: a logo is something you drum on,
but a card is clicked deliberately, about once a second, and every gap over a
second and a half put the count back to one. It shook once and never again. A
synthetic `element.click()` loop passed it easily, which is exactly why it took
a real, slowly-paced pointer to see. Nothing resets the count now.

- The riddle opens **in place** rather than at `/calendar#void`, where the
  pentagon's arrow leads: that page needs an account, and a visitor reading a
  testimonial usually hasn't got one. `void.js` now exposes `VoidRiddle.open()`
  for it and still opens itself on arrival at the calendar, and `void.css`'s
  emptying of the page covers `.home-main` too. Same void, same question, same
  drop into `/engine`.
- **Answering the riddle is now itself the day's unlock.** `/engine` checks the
  flag the dashboard's logo sets and bounced anyone who arrived without it — so
  by this new door you could solve the riddle and be thrown back to the home
  page. Solving it stamps the flag; coming by the pentagon, it was already set.

## 2026-07-30 — The calendar becomes something you can work in

Two things the calendar showed but wouldn't let you do: finish a task, and move
a block. Both are now direct.

- **Click a task's name to finish it.** Hovering the name of an unfinished task
  turns it into a target — a green tick slides in on the Week and Day grids, a
  "Mark complete" hint rises on the Month view's plan cards — and one click
  finishes it. The completion runs `trackTaskCompletion`, the dashboard's own
  path, so the XP, the level, the streak and any "complete N tasks" goal all
  move exactly as they would there. `js/calendar/task-complete.js` holds the one
  in-flight guard (a double click can't award twice) and announces
  `calendartaskcomplete`, which is how a task finished in one view redraws in
  the others.
- **Drag a block to reschedule it.** Press anywhere in a block that isn't its ⋮
  menu or its click-to-finish name and it follows the pointer: up and down for
  the time, across for the day. The slot under the pointer is previewed with the
  times it would take, and a slot that overlaps ANY other block — task or event
  — is refused outright: the preview turns red and releasing leaves the block
  where it was. Blocks therefore still cannot overlap, the same rule the grid
  enforces when they are created.
- **Drag one edge to re-time that end.** A seven-pixel strip along a block's top
  and bottom resizes rather than moves: the start time or the end time changes
  and the other end stays pinned. Same refusal on overlap, and a block can't be
  dragged shorter than five minutes. The top strip stops short of the ⋮ menu, and
  both sit above the title in the stack, so neither the menu nor the
  click-to-finish name is ever swallowed by them.

Two notes for later:

- **A task's slot is moved by re-creating it.** The backend can't move a
  `created_at`, so a dragged task is deleted and re-added on its new slot, which
  is what editing its time through the modal already did. That's also why a
  finished task can't be dragged — re-creating it would re-open it — and why a
  block that only covers part of its task (a continuation) can't either.
- **Collision is measured off the live DOM**, not the render-time `dragBusy`
  map, so it stays true while the pointer crosses into another day's column.
- **A block is drawn four pixels shorter than it lasts** (the gap that keeps
  neighbours apart), and blocks under a minimum height are drawn taller. Both
  drags therefore work in the true span — the times, not the rendered box —
  because reading a block's end off the DOM would either let a drop land a
  minute inside its neighbour or quietly stretch a short block to fit its box.

## 2026-07-29 — The landing page becomes a demonstration

Five passes over `/home`, so the page shows the app working instead of
describing it. Everything is hand-written CSS and vanilla JS — no library, no
build step — and every piece of it degrades to a static page.

- **The opening.** A black curtain lifts, the logo draws itself stroke-first,
  then the greeting, date, headline (a word at a time), subtitle and buttons
  each take their turn. Behind every section: a grid, a slow gradient, drifting
  particles on one canvas, and a glow trailing the cursor.
- **A simulated dashboard** that fills itself in — sidebar, nav icons, cards,
  XP bar in three pulls, counters, a level flip and a rating stepping C to A —
  then floats on a seven-second cycle.
- **Two workflow demos.** A task is checked off, confettis, slides out, and its
  XP flies to the bar; an event is dragged Monday to Tuesday, snaps in with an
  overshoot, and the streak catches.
- **Charts that draw themselves**, measured rather than hard-coded:
  `getTotalLength()` for the dash, `getPointAtLength()` for the points. Bars
  grow on an overshoot curve, the gauge winds, the XP timeline writes itself.
- **The finish.** Feature-card hover, philosophy icons stroking themselves on,
  connector wires across the tech stack, a 500ms theme fade, and a closing CTA
  that glows, breathes, shines and ripples.

Three things worth carrying forward:

- **Animated elements are written in CSS in their *finished* state.** A script
  adds one class to put them back to the start and removes it a frame later.
  With no JS, a parse error, or `prefers-reduced-motion`, the page is just the
  page — it never sits blank waiting for a script that did not run. The usual
  arrangement (hide in CSS, reveal in JS) fails the opposite way.
- **`window.HomePlay`** is the shared kit: `onView` (play on enter, reset on
  leave, everything cancellable), `countThrough` (waypoint counters) and a
  cancellable `timeline`.
- **SVG bars are scaled, not resized.** Animating `y`/`height` through the CSS
  box looked right and was not: Chrome takes a unitless `y` and drops a
  unitless `height`, which left every bar flat with its markup value destroyed.

The feature strip — Task Management, Growth, Goals and the quote — now sits
directly under the hero, ahead of the dashboard demo, so the four links are the
first thing after the headline.

The Technology Stack section also stopped claiming React, TypeScript, FastAPI
and PostgreSQL, none of which this project uses. It reads HTML · CSS · Vanilla
JS, Python · Flask · Jinja, SQLite, SVG · Canvas.

## 2026-07-29 — An account menu under the avatar

Clicking the avatar opens a square panel: the username with a red Log Out
button beside it, and under that a row of all fifty pictures that scrolls
sideways inside the panel rather than widening it. Picking one is instant —
the tick and the bar's own picture move first and the request only confirms
them, putting both back if it fails.

- A pick is stored as an `avatar` row in `user_settings`, the key/value table
  that exists so a preference like this is not a migration. `avatar_for` reads
  it, and falls back to the derived picture for accounts that never picked.
- `POST /api/avatar`, in `routes/auth.py`: 401 without a session, 400 for any
  name that is not one of the fifty, so nothing reaches the row but a real one.
- The menu opens scrolled to the picture you are wearing, wherever it sits in
  the fifty.

## 2026-07-29 — Every account gets a profile picture

Fifty round drawings in `utils/images/avatars/` — astronauts and planets,
animals, plants and everyday things — replace the letter-in-a-circle the top
bar used to show. They are original flat SVGs drawn for the app, a couple of KB
each, so there is nothing licensed or downloaded in the tree.

- Which picture an account gets is **derived**: `md5(user id) % 50` in
  `backend/tracking/avatar.py`. No column, no migration, and every account that
  already existed has one too. `md5` rather than `hash()`, which Python salts
  per process and would repaint every account on restart. (Picking one from the
  account menu stores it and overrides this — see the entry above.)
- Keyed on the id rather than the username, so a rename keeps the picture.
- `middleware/context.py` now looks the account row up once and derives both
  `current_theme` and `current_avatar` from it; `auth.theme_for` went with it.
  `public_user()` gained an `avatar` URL for the client.

## 2026-07-28 — The .sql files become an actual database

The data lives in SQLite at `data/summit.db` now. `data/sql/` keeps the schema
and the rows to start from, and is read once — when the database does not exist
yet — so a fresh clone still comes up working with nothing to install or start.
`data/postgresql/` is gone; its contents moved to `data/sql/` with the DDL
rewritten for SQLite.

- `backend/database/connection.py` rewritten on `sqlite3`. The public interface
  is unchanged — `read_table`, `write_table`, `new_id` and the load/save pair
  per store — so `tracking/` and `pages/` did not change at all.
- Schemas converted: `TIMESTAMPTZ`/`JSONB`/`DATE` → `TEXT`, `BIGSERIAL` →
  `INTEGER PRIMARY KEY AUTOINCREMENT`, `TEXT[]` → JSON in a `TEXT` column,
  `SMALLINT` → `INTEGER`, `now()` → `datetime('now')`, `left()` → `substr()`,
  the `growth_daily` view to `CREATE VIEW IF NOT EXISTS`. The `GIN` index on
  `library_items.tags` has no SQLite equivalent and is dropped. Every `CHECK`,
  every foreign key and both partial/expression indexes survive as written.
- **A NULL column is left out of the row dict** rather than returned as `None`.
  Three call sites depend on it: `'met_deadline' in task` (640 of 714 tasks
  lack it), `xp_event.get('tasks_completed', 1)` (124 of 234), and
  `user.get('email_verified', True)` (5 of 6 accounts) — which would otherwise
  have locked those accounts out.
- **`write_table` disables foreign keys while it swaps a table's rows.** Every
  account-owned table is `ON DELETE CASCADE`, and `refresh_streak` rewrites
  `users` on every page load, so the delete half of the rewrite would have
  cascaded away every task, goal and XP row. `PRAGMA foreign_key_check` still
  runs on the written table before commit.
- Three goals belonging to `user_id = 'Default'`, an account that never
  existed, were dropped. They had been unreachable since the account gate
  landed.
- `data/summit.db` is git-ignored. The seed files no longer change as the app
  runs, so the datastore stops showing up as modified in every diff.

Verified by running the old and new code side by side: 371 KB of API responses
across four accounts, and the only differences are absent `null` keys and
`100.0` rendering as `100`.

## 2026-07-27 — The datastore moves into the .sql files

`data/postgresql/*.sql` is now where the data lives, not just where the schema
was going to. Each file holds its tables' definitions followed by their rows as
INSERT statements; `data/backups/*.json` is kept as a backup of the last
JSON-era state and is no longer read or written.

- `backend/database/connection.py` rewritten around the .sql files: reading
  parses the INSERTs and types each value from its column, writing regenerates
  one table's rows and leaves the rest of the file — schema, comments, other
  tables — byte for byte.
- The two blobs that hung off the user row fan out into tables of their own:
  `focus_days` and `day_focus_notes` in focus.sql. The single calendar list
  splits into `calendar_entries` and `calendar_events` in events.sql.
- The growth ratings moved out of `tracking/growth.py` into
  `tracking/analytics.py`, and every computation now files a dated row per
  metric into analytics.sql — so the report card accumulates a history instead
  of only ever showing today's number. growth.py keeps the chart series.
- The schemas were rewritten to match the data exactly, including the two
  hyphenated recurrence columns the calendar writes, which exist as quoted
  identifiers.
- achievements, history, library, notes and settings stay schema-only: those
  features are not built.
- Ids are primary keys now, so `connection.new_id` steps past collisions —
  creating four goals in one loop used to hand two of them the same id, and
  whichever the app found first won.

Verified against the JSON-backed app: all 75 read responses across every
account came back identical, and 55 of 57 write steps matched. The two that
differ are the id collision, which the old store had and this one does not.

## 2026-07-27 — Repo layout: utils, docs, and a Postgres-shaped data folder

Assets, docs and data moved to their final homes. No behaviour changed; the
URLs the frontend asks for are the same.

- `utilities/js/` → `frontend/js/`. All client scripts now sit with the
  templates they belong to; `styles/` stays a top-level folder.
- `images/` and `images/icons/` → `utils/images/` and `utils/icons/`, joined by
  empty `utils/fonts/` and `utils/assets/`.
- `data/*.json` → `data/backups/`, which is still the live datastore.
- `data/postgresql/` added: one `.sql` per table, twelve in all, written
  against the JSON shapes they describe. Nothing executes them yet.
- `utilities/docs/` → `docs/`, filled in — architecture, api, database,
  roadmap, this file — plus the project notes carried alongside them.
- `/static/<kind>/...` gained `fonts` and `assets`; the four existing kinds
  point at their new folders.

## 2026-07-26 — Backend rewrite

The backend was one 2200-line `paths.py` plus `auth.py`, `services/` and a
993-line `task_backend.py` at the repo root. It is now layered: `config/`,
`database/`, `tracking/`, `pages/`, `routes/`, `middleware/`, assembled by
`app.py`. Verified against the old backend response-for-response — 83 read
endpoints, 63 write steps and every page's HTML came back byte-identical.

- One module per page under `pages/`, one per tracked thing under `tracking/`.
  Stubs mark where the features that don't exist yet will go.
- Blueprint endpoints renamed (`main.dashboard` → `dashboard.page`, and so on);
  every template updated. Every URL is unchanged.
- Nothing opens `database.db` any more — no `init_db`, no sqlite import.
- `/api/get_xp_data` now answers from the JSON ledger. It used to read SQLite
  tables that were never populated and always replied "User not found".
- The legacy `/api/signup` now hashes the password instead of storing it in the
  clear.
- Dropped `/daily_xp` and `/test-dashboard`, whose templates never existed.

## Earlier

See `git log`. Highlights: the accounts and e-mail verification flow
(`a5e1512`), the hidden Engine easter-egg chain (`b964d1c` … `98d8a4e`), and
the calendar's daily counts, ledger XP and weekly focus time (`f5debe6`).
