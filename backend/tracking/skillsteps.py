"""What makes a practice step good enough to serve, and the reading of them.

## The rule this whole module exists to enforce

A step has to name its object.

    bad     Do ten from memory.
    good    Factor x^2 - 7x + 12.

Both are instructions. Only one of them can be carried out by somebody who has
just read it, and the difference is not tone or length — it is whether there is
a *thing* in the sentence. The first is what a generic ladder produces, because
a ladder that has to fit Loops and Squat Depth and Key Signatures cannot name
anything belonging to any of them. The second is why the steps are written per
node by a model that knows what a quadratic is.

Everything below is an attempt to make that distinction mechanical, so that a
regeneration six months from now cannot quietly drift back toward the first kind
without the build noticing.

## Two stages, and why the cheap one runs first

`review_programme` here is deterministic: string rules, no model, microseconds,
and it runs on every step. It catches the failures that have a shape — a missing
field, a practice line with nothing concrete in it, two steps that say the same
thing, a list that restates its own node's description back at the reader.

What it cannot catch is a step that is concrete and *wrong*: "Factor
x^2 - 7x + 13", which is beautifully specific and does not factor. That needs a
model, and the second stage in scripts/generate_skill_steps.py is one. The order
matters for cost — the rules reject perhaps a fifth of first drafts, and there is
no sense paying a model to read a step that has no practice line at all.

A step is written to the database only once both stages have passed it, and
which checks it passed is stored on the row. See data/sql/skillsteps.sql.

## Why the checks are named

`failures` returns names — 'concrete', 'distinct', 'on-topic' — rather than
prose. Named checks can be counted across a run, which is the only way to tell a
prompt that is failing from a prompt that is fine: sixty 'concrete' failures in
Health and fitness is a prompt problem, and sixty scattered across every tree is
the model having an off day. The audit table stores the name for exactly this.

## Nothing here knows about HTTP

Rules and a read, as everything in this package is. backend/api/skillsteps.py
turns what `programmes_for` returns into JSON and decides nothing.
"""
import re

from backend.database import connection

# ---------------------------------------------------------------------------
# What a step is
# ---------------------------------------------------------------------------
#: The fields a generated step has to arrive with. Ordinal, provenance and the
#: verification columns are added by the pipeline, not by the model.
STEP_FIELDS = ('title', 'mastery', 'practice', 'detail', 'proof', 'pitfall')

#: Length bounds, in characters. The floors are the real constraint — a
#: four-word `detail` is a field somebody filled in to get past a validator —
#: and the ceilings only stop a model writing an essay into a side panel.
BOUNDS = {
    'title': (4, 48),
    'mastery': (25, 190),
    'practice': (12, 200),
    'detail': (80, 480),
    # There is effectively no floor on a proof, and that is deliberate. A proof
    # line is the answer, and the answer to "Evaluate 5 > 3 and 2 < 1" is
    # "False." — six characters, complete, and exactly what the reader needs.
    # A floor here was rejecting every correct short answer on the Operators
    # and Booleans nodes. Whether a proof actually settles the question is a
    # judgement, so it is the model reviewer's, not a character count's.
    'proof': (2, 200),
    'pitfall': (15, 200),
}

#: How many steps a node's programme may hold.
#:
#: Five is the floor because four is a list somebody gave up on, and twelve the
#: ceiling because a panel is not a syllabus. The old derived ladder ran to
#: twenty by tier, which is where "ten in a row, timed" came from — length it
#: had to fill and nothing to fill it with.
MIN_STEPS = 5
MAX_STEPS = 12

#: Roughly what one step may cost, in minutes. A step billed at four hours is
#: not a step, it is the node.
MINUTES_RANGE = (5, 180)


# ---------------------------------------------------------------------------
# The checks
# ---------------------------------------------------------------------------
#: Phrases that are vacuous whatever surrounds them.
#:
#: Deliberately short, and it is not the main defence — `concrete` below is.
#: The temptation with a list like this is to grow it until it bans "from
#: memory", and "from memory" is not the problem: *Write the circle of fifths
#: from memory* names a thing and is a fine step. *Do ten from memory* names
#: nothing. The phrases here name nothing on their own and cannot be rescued by
#: context, so they can be matched without reading the rest of the line.
VAGUE = (
    'as much as you can',
    'as many as you can',
    'keep practising',
    'keep practicing',
    'get comfortable',
    'familiarise yourself',
    'familiarize yourself',
    'spend some time',
    'review the material',
    'review your notes',
    'study this topic',
    'understand the concept',
    'do your best',
    'repeat as needed',
    'when you feel ready',
    'practise regularly',
    'practice regularly',
    'work on this',
    'do more of',
    'try to improve',
)

#: Verbs a practice line may open with.
#:
#: The check is that a practice line is an *instruction*, and an instruction in
#: English starts with its verb. A line opening "You should be able to..." is a
#: description of mastery that has wandered into the wrong column, which is the
#: single most common thing a model does with this schema.
IMPERATIVES = frozenset("""
account add adjust alternate analyse analyze annotate answer apply arrange ask
assemble attempt balance bisect build calculate call cancel categorise
categorize change chart check choose classify clean climb code collect compare
compile complete compose compute conduct connect construct convert cook copy
correct count cover create critique cross cut debug decide define deliver
derive describe design diagnose diagram differentiate divide double draft draw
drill drive drop edit enumerate estimate evaluate expand explain factor
factorise factorize fill
film find finish fit fix flip fold follow forecast format generate give graph
group halve hold identify implement improve index integrate interview invert
invest journal judge keep label lay layout learn light list load log look make
map mark match measure memorise memorize mix model modify multiply name
navigate normalise normalize note observe open optimise optimize order outline
pace pair paint parse perform photograph pick pitch place plan plant play plot
post practise practice predict prepare present price print prioritise
prioritize produce profile prove pull push put query question quote rank
rationalise rationalize read rearrange rebuild recite reconcile record recreate
reduce refactor rehearse rejig remove rename render reorder repair rephrase
replace reproduce rerun research reset resolve restate retune reverse revise
rewrite rig round run sample save say scale schedule score screen script sculpt
search select send separate set shade shape sharpen shoot show simplify
simulate sing sit sketch slice solve sort spell split spot sprint stack stage
start state step stretch structure study submit substitute subtract summarise
summarize survey swap swim switch tabulate take talk teach test time trace
track train transcribe translate transpose trim tune turn type use verify
visualise visualize walk watch weigh work write
""".split())

#: Openings that are never an instruction.
#:
#: The counterpart to IMPERATIVES, and the more important of the two. A closed
#: list of verbs is the wrong shape for this check: English has thousands of
#: them, a generated step will reach for `hypothesise` or `insert` sooner or
#: later, and every valid verb missing from the list costs two model calls to
#: "repair" a step that was already right. The first run of the generator
#: rejected `insert` and `hypothesize` inside one node.
#:
#: So an unrecognised opener is assumed to be a verb, and only these are
#: refused. They are what a mastery statement that has wandered into the
#: practice column actually starts with — a pronoun, an article, a subject —
#: and that is the failure the check is for.
NON_IMPERATIVE = frozenset("""
a all an and any anybody anyone anything both each either everybody everyone
everything few he her hers him his i it its many me mine most much my neither
no nobody none nothing one ones other others our ours several she some somebody
someone something that the their theirs them there these they this those to us
we what whatever which who whoever whom whose you your yours
students learners readers people someone
be been being am are is was were do does did has have had can could may might
must shall should will would
""".split())


def _not_an_instruction(opener):
    """Whether a practice line's first word rules out its being an order.

    Two signals, both conservative. A pronoun, article or auxiliary — "You
    should be able to factor..." — is a description of the reader. A gerund —
    "Understanding recursion is..." — is a noun phrase. Anything else is taken
    for a verb, because the cost of guessing wrong in that direction is one
    slightly loose step, and the cost of guessing wrong in the other is a
    correct step regenerated twice.
    """
    return opener in NON_IMPERATIVE or (len(opener) > 5 and opener.endswith('ing'))


#: Words a practice line may open a scene-setting clause with, before the
#: imperative arrives after the comma. Deliberately closed: the point is to
#: accept "For x^2 - 9x + 20 = 0, name the best method" without also accepting
#: any sentence that happens to contain a verb somewhere in the middle.
LEAD_INS = frozenset("""
after at before beyond during for from given if in on once starting taking
then using when while with without working
""".split())

#: Characters that mark a specific object: maths, code, units, money, ranges.
SPECIFIC_CHARS = re.compile(r'[0-9=+×÷^√∫∑≤≥<>%$£€°/\\|]')

#: A token that reads as notation or an identifier rather than English —
#: `x^2`, `snake_case`, `camelCase`, `O(n log n)`, `C#`, `pH`.
NOTATION = re.compile(r'[A-Za-z]+[_(){}\[\]#]|[a-z][A-Z]|\b[A-Z]{2,}\b')

#: Words too common to count as a node's own vocabulary when checking a step is
#: about the node it hangs under.
STOP = frozenset("""
a an and are as at be been but by can do does for from had has have how in into
is it its of on one or that the their then there these this to up use used using
was what when where which who why will with you your not no if each every both
more most other some such only own same than too very just also its it's about
""".split())


def words(text):
    """The content words of a line, lower-cased, stop words dropped.

    Anything carrying a digit is kept whatever its length, and that is the
    whole subtlety here. These sets are compared to decide whether two steps say
    the same thing, and on a maths step nearly all of the meaning is in tokens
    two characters long — `3x`, `-4`, `x^2`. Dropping those left

        Compute 5 - (-3), then -4 + 7.
        Compute -6 x -4, then -20 / 5.

    as the identical set {compute, then}, and the duplicate check rejected two
    steps that have nothing in common but a verb.
    """
    # The leading minus is kept when it is attached to what follows, so -3 and 3
    # are different tokens. On a Negative Numbers step that is the entire
    # content of the line.
    found = re.findall(r"-?[a-z0-9][a-z0-9'^+/-]*", (text or '').lower())
    return {
        _stem(word) for word in found
        if word not in STOP and (len(word) > 2 or any(ch.isdigit() for ch in word))
    }


def _stem(word):
    """Crude singular form, so a plural matches its singular.

    Not linguistics — four rules and a length floor. It exists because the
    'on-topic' check was rejecting every step on the Inequalities node: the
    node is called "Inequalities" and its steps all say "inequality", which are
    different strings and the same word. Anything carrying a digit is left
    alone, because `x2s` is not a plural.
    """
    if len(word) < 4 or any(ch.isdigit() for ch in word):
        return word
    if word.endswith('ies'):
        return word[:-3] + 'y'
    if word.endswith('sses') or word.endswith('shes') or word.endswith('ches'):
        return word[:-2]
    if word.endswith('s') and not word.endswith('ss') and not word.endswith('us'):
        return word[:-1]
    return word


#: Below this many content words on either side, `overlap` is not measurable.
#: Two three-word lines sharing a verb come out at 1.0, which says nothing about
#: whether they are the same step.
OVERLAP_FLOOR = 3

#: The floor for calling two *practice lines* the same, which is higher.
#:
#: A bag of words is a poor description of a short arithmetic instruction.
#: "Evaluate 3 + 4 * 2" and "Evaluate (3 + 4) * 2" are different exercises —
#: one is the whole point of the other — and they share every token they have.
#: So do "Evaluate 5 > 3" and "Evaluate 2 < 1". Below five content words the
#: measure cannot tell a duplicate from two neighbouring drills on the same
#: small numbers, and it was rejecting whole programmes on the Operators node
#: for it. Longer lines carry enough vocabulary for the ratio to mean
#: something, and the model reviewer has DUPLICATE as one of its verdicts for
#: the short ones.
DUPLICATE_FLOOR = 5


def overlap(left, right):
    """How much of the smaller of two word sets is inside the larger, 0 to 1."""
    first, second = words(left), words(right)
    if min(len(first), len(second)) < OVERLAP_FLOOR:
        return 0.0
    return len(first & second) / min(len(first), len(second))


def _sentence(text):
    """Whether a field was finished, rather than cut off mid-clause.

    Only the ending is checked, and the opening deliberately is not. This began
    as a capital-letter rule and it was wrong on exactly the content the table
    exists for: "6/8, 15/20 and 75/100." opens on a digit, "x = 6, and x = 3."
    opens on a variable, and both are the right way to write that answer. A
    field whose first letter is lower case is a style question; a field with no
    terminal punctuation is a generation that ran out of tokens, which is the
    failure worth catching.
    """
    stripped = (text or '').strip()
    return bool(stripped) and stripped[-1] in '.!?'


def failures(step, node, others=()):
    """Every named check this step fails. An empty list is a step that passes.

    `node` is its entry from data/skill_nodes.json — the name and description
    are what 'on-topic' is measured against. `others` is the rest of the
    programme, for 'distinct'.
    """
    bad = []
    missing = [name for name in STEP_FIELDS if not str(step.get(name) or '').strip()]
    if missing:
        # Nothing else is worth measuring on a step with no practice line in it,
        # and several of the checks below would raise on the empty string.
        return ['shape:missing ' + ','.join(missing)]

    # ---- shape: lengths, sentences, and a cost that is a step's worth -------
    for name, (low, high) in BOUNDS.items():
        length = len(str(step[name]).strip())
        if length < low or length > high:
            bad.append('shape:{} is {} chars, wants {}-{}'.format(name, length, low, high))
    for name in ('mastery', 'detail', 'proof', 'pitfall'):
        if not _sentence(step[name]):
            bad.append('shape:{} is not a sentence'.format(name))
    minutes = step.get('minutes', 0)
    if not isinstance(minutes, int) or not MINUTES_RANGE[0] <= minutes <= MINUTES_RANGE[1]:
        bad.append('shape:minutes {!r} outside {}-{}'.format(minutes, *MINUTES_RANGE))
    # A title is a label, not a sentence. One that ends in a full stop is a
    # mastery line that has been pasted into the wrong field.
    if step['title'].strip().endswith('.'):
        bad.append('shape:title is a sentence')
    if not 1 <= len(step['title'].split()) <= 6:
        bad.append('shape:title is not 1-6 words')

    # ---- concrete: the rule the module is for -------------------------------
    practice = str(step['practice']).strip()
    lowered = practice.lower()
    for phrase in VAGUE:
        if phrase in lowered:
            bad.append('not-generic:"{}"'.format(phrase))
    # Any sentence in the line may carry the instruction, not only the first.
    # A practice step is often a situation and then the ask — "A jacket costs 66
    # after a 12% discount. Find the original price." — and only the second
    # sentence is imperative. What is being rejected is a line with no
    # imperative anywhere in it, which is a mastery statement in the wrong
    # column rather than something to go and do.
    openers = []
    for sentence in re.split(r'(?<=[.!?])\s+', practice):
        parts = sentence.strip().split()
        if not parts:
            continue
        head = re.sub(r'[^a-z]', '', parts[0].lower())
        openers.append(head)
        # A sentence may set its scene before it asks for anything: "For
        # x^2 - 9x + 20 = 0, name the best method." The imperative is after the
        # comma, and only when the sentence opened on one of these words — so
        # "You can factor, expand or solve." is not rescued by its second verb.
        if head in LEAD_INS:
            # Every comma, not only the first: the scene being set is often a
            # list, and the imperative arrives after the last of them.
            for clause in re.split(r',\s*', sentence.strip())[1:]:
                if clause.split():
                    openers.append(re.sub(r'[^a-z]', '', clause.split()[0].lower()))
    openers = [opener for opener in openers if opener]
    if not any(opener in IMPERATIVES for opener in openers) and (
            not openers or _not_an_instruction(openers[0])):
        bad.append('concrete:no sentence opens with an imperative ({})'.format(
            ', '.join(openers[:3]) or practice[:12]))
    # Something in the line has to be a *thing*: a number, a piece of notation,
    # a quoted phrase, or a proper noun. A practice line made only of ordinary
    # lower-case English words has not named anything.
    has_object = bool(
        SPECIFIC_CHARS.search(practice)
        or NOTATION.search(practice)
        or '"' in practice or "'" in practice or '“' in practice
        or re.search(r'\b[A-Z][a-z]{2,}', practice[1:])
    )
    if not has_object:
        bad.append('concrete:names no number, notation or proper noun')

    # ---- distinct: the columns have to be doing different jobs --------------
    # A practice line that is the mastery line with an imperative bolted on is
    # the schema being filled in rather than used.
    if overlap(step['practice'], step['mastery']) > 0.8:
        bad.append('distinct:practice restates mastery')
    if overlap(step['detail'], step['mastery']) > 0.85:
        bad.append('distinct:detail restates mastery')
    if overlap(step['mastery'], node.get('desc', '')) > 0.7:
        bad.append('distinct:mastery restates the node description')
    for other in others:
        if other is step:
            continue
        if str(other.get('title', '')).strip().lower() == step['title'].strip().lower():
            bad.append('distinct:title repeats step "{}"'.format(other.get('title')))
            break
        if (min(len(words(other.get('practice', ''))), len(words(step['practice'])))
                >= DUPLICATE_FLOOR
                and overlap(other.get('practice', ''), step['practice']) > 0.75):
            # The offending line goes in the reason. A bare "repeats step 4"
            # is unactionable when the content was rejected and never stored:
            # without the text there is no way to tell a real duplicate from a
            # measure that is wrong about two short drills.
            bad.append('distinct:practice repeats step "{}" — {!r}'.format(
                other.get('title'), step['practice'][:80]))
            break

    # ---- on-topic: it has to be about this node -----------------------------
    # Measured over the step as a whole rather than the practice line alone.
    # "Factor x^2 - 7x + 12" shares no word with a node called Quadratics, and
    # is exactly the step that node wants; its title and mastery line are where
    # the subject is named.
    subject = words(node.get('name', '')) | words(node.get('desc', '')) | words(
        node.get('treeTitle', ''))
    said = words(step['title']) | words(step['mastery']) | words(step['detail'])
    # A step may also anchor to the rest of its own programme rather than to the
    # node. "Expand a Bracket" shares no word with a node called Algebra whose
    # description talks about letters and relationships — and it is plainly an
    # algebra step, because the steps around it are about terms and brackets
    # too. Requiring every step to repeat the node's own vocabulary rejects the
    # ones that have moved on to the actual work, which is most of them.
    siblings = set()
    for other in others:
        if other is step:
            continue
        siblings |= words(other.get('title', '')) | words(other.get('mastery', ''))
    if subject and not (said & (subject | siblings)):
        bad.append('on-topic:shares no term with the node or its other steps')

    return bad


def review_programme(steps, node):
    """Check a whole node's programme. Returns (per-step failures, list-wide).

    The split matters to the pipeline: a per-step failure is repaired by
    rewriting that step, and a list-wide one — too few steps, ordinals with a
    gap in them — is repaired by regenerating the node.
    """
    whole = []
    if not MIN_STEPS <= len(steps) <= MAX_STEPS:
        whole.append('ladder:{} steps, wants {}-{}'.format(len(steps), MIN_STEPS, MAX_STEPS))
    ordinals = [step.get('ordinal') for step in steps]
    if ordinals != list(range(1, len(steps) + 1)):
        whole.append('ladder:ordinals are {} not 1..{}'.format(ordinals, len(steps)))
    per_step = [failures(step, node, steps) for step in steps]
    return per_step, whole


#: The named checks a row is credited with when it passes both stages. Stored
#: on the row; see the `checks` column in data/sql/skillsteps.sql.
RULE_CHECKS = ('shape', 'not-generic', 'concrete', 'distinct', 'on-topic', 'ladder')


# ---------------------------------------------------------------------------
# Reading them back
# ---------------------------------------------------------------------------
def programmes_for(node_ids):
    """Node id → its steps, shaped for the page.

    The provenance columns are folded into one `verified` object rather than
    spread across the step: the panel draws a step, and a reader who opens the
    provenance is asking a different question. A node with nothing written is
    absent, not empty — see the note on `skill_steps_for`.
    """
    stored = connection.skill_steps_for(node_ids)
    # Problems come back with the steps rather than behind a second request.
    # The screen that draws them is one click from the step list and holds a
    # whole set, so fetching per step would be nine round trips to draw one
    # page — and the page already has every step in memory by then.
    problems = connection.skill_problems_for(node_ids)
    out = {}
    for node_id, rows in stored.items():
        by_step = {}
        for problem in problems.get(node_id, []):
            by_step.setdefault(problem['ordinal'], []).append({
                'slot': problem['slot'],
                'weight': problem['weight'],
                'prompt': problem['prompt'],
                'answer': problem['answer'],
                'hint': problem['hint'],
            })
        out[node_id] = [{
            'ordinal': row['ordinal'],
            'title': row['title'],
            'mastery': row['mastery'],
            'practice': row['practice'],
            'detail': row['detail'],
            'proof': row['proof'],
            'pitfall': row['pitfall'],
            'minutes': row['minutes'],
            # Absent rather than empty when nothing is written: the panel draws
            # a graded set of slots for a step with no problems, and an empty
            # array would be a step whose set is legitimately nothing.
            'problems': by_step.get(row['ordinal'], []),
            'verified': {
                'at': row['verified_at'],
                'by': row['verifier'],
                'checks': row['checks'],
                'model': row['model'],
                'attempts': row['attempts'],
            },
        } for row in rows]
    return out

# ---------------------------------------------------------------------------
# Problems
# ---------------------------------------------------------------------------
#: What a generated problem has to arrive with. `hint` is optional by design —
#: a warm-up that needs one is not a warm-up.
PROBLEM_FIELDS = ('prompt', 'answer')

PROBLEM_BOUNDS = {
    'prompt': (10, 400),
    'answer': (1, 400),
    'hint': (0, 240),
}

#: The bands a set is graded into, easiest first. Mirrors
#: frontend/src/utils/problemSet, which draws them.
WEIGHTS = ('warmup', 'core', 'stretch')

#: The named checks a problem is credited with when it passes.
PROBLEM_CHECKS = ('shape', 'concrete', 'distinct', 'graded', 'answered')

#: How many problems a step is owed, and the share of them that open light.
#: These mirror frontend/src/utils/problemSet, which drew the graded slots
#: before there was anything to put in them — the numbers live in both places
#: because both have to agree on what a set looks like, and the note there is
#: the one that explains why a set is thirds.
MIN_PROBLEMS = 3
MAX_PROBLEMS = 9
WARM_UP_SHARE = 3


def problem_count(minutes):
    """How many problems a step of this cost gets.

    Read off the step's own minutes rather than fixed, so a five-minute step
    and a ninety-minute one are not owed the same sheet. `countFor` in
    problemSet.ts is the same arithmetic; the half-up rounding is written out
    because Python's `round` goes to even and JavaScript's does not.
    """
    cost = int((int(minutes or 0) / 5) + 0.5)
    return max(MIN_PROBLEMS, min(MAX_PROBLEMS, cost))


def problem_slots(minutes):
    """The bands for one step's set, in order, easiest first.

    The slope is decided here rather than asked for, which is the point: that a
    set opens on a warm-up and ends on a stretch is a fact about how the panel
    reads, not a judgement a writer should be making per step — and
    `review_problems` rejects a set that gets it wrong. A generator that picks
    its own bands is a generator that argues with the validator.
    """
    total = problem_count(minutes)
    warm = max(1, -(-total // WARM_UP_SHARE))
    # Symmetrical with the warm-up band, so the core is the widest part of any
    # set big enough to have one, and never overlapping on a small set.
    stretch = max(1, min(total - warm, warm))
    return [
        {'slot': at,
         'weight': ('warmup' if at <= warm
                    else 'stretch' if at > total - stretch else 'core')}
        for at in range(1, total + 1)
    ]


def _prose(text):
    """A line's content words with the numbers and notation taken out.

    What is left is the wording, which is the only thing that can *restate*
    anything. Used only by the answer check; everywhere else the numbers are
    the content and dropping them would be the bug fixed in `words`.
    """
    return {word for word in words(text)
            if not any(character.isdigit() for character in word)}


def _share(left, right):
    """`overlap` for two word sets that have already been built."""
    if not left or not right:
        return 0.0
    return len(left & right) / min(len(left), len(right))


def problem_failures(problem, step, others=()):
    """Every named check this problem fails. Empty is a pass.

    Stricter than the step checks in one place and looser in another, both
    deliberate. Stricter: a problem must have an answer, because a question
    whose answer nobody wrote down cannot be marked and will be got wrong in
    silence. Looser: there is no `on-topic` check, because a problem inherits
    its topic from the step it hangs under and a good stretch question often
    shares no vocabulary with it at all.
    """
    bad = []
    missing = [name for name in PROBLEM_FIELDS
               if not str(problem.get(name) or '').strip()]
    if missing:
        return ['shape:missing ' + ','.join(missing)]

    for name, (low, high) in PROBLEM_BOUNDS.items():
        length = len(str(problem.get(name) or '').strip())
        if length < low or length > high:
            bad.append('shape:{} is {} chars, wants {}-{}'.format(name, length, low, high))

    if problem.get('weight') not in WEIGHTS:
        bad.append('graded:weight {!r} is not one of {}'.format(
            problem.get('weight'), '/'.join(WEIGHTS)))

    prompt = str(problem['prompt']).strip()
    # The same rule the steps live by: a question has to name what it is about.
    # "Try a harder one" is not a problem.
    if not (SPECIFIC_CHARS.search(prompt) or NOTATION.search(prompt)
            or '"' in prompt or "'" in prompt
            or re.search(r'\b[A-Z][a-z]{2,}', prompt[1:])):
        bad.append('concrete:names no number, notation or proper noun')
    for phrase in VAGUE:
        if phrase in prompt.lower():
            bad.append('not-generic:"{}"'.format(phrase))

    # Both duplicate tests need the same floor the step-level one needed, and
    # for a sharper version of the same reason. `overlap` divides by the
    # smaller set, so a short prompt whose words all appear in a longer one
    # scores a flat 1.00 — and on a graded set that is the normal case, not a
    # duplicate: "Evaluate 2 + 3 x 4" is the warm-up for "Evaluate
    # 20 - 3 x 4 + 8 / 2 and list the order you applied", and containment is
    # exactly what makes it a good warm-up. Below five content words the
    # measure cannot tell the two apart, so it does not try.
    def comparable(text):
        return len(words(text)) >= DUPLICATE_FLOOR

    # An answer that restates the question has not answered it — but only the
    # *prose* can restate anything. "Order -7, 3, -2, 0 and -10 from smallest
    # to largest" is answered by "-10, -7, -2, 0, 3", which reuses every token
    # in the prompt and is exactly right: the answer to an ordering question is
    # a permutation of the question. So numbers and notation are dropped before
    # the comparison, and what is left is the wording.
    answer_prose = _prose(problem.get('answer', ''))
    if (len(answer_prose) >= DUPLICATE_FLOOR
            and _share(answer_prose, _prose(prompt)) > 0.85):
        bad.append('answered:the answer restates the question')

    for other in others:
        if other is problem:
            continue
        if (comparable(prompt) and comparable(other.get('prompt', ''))
                and overlap(other.get('prompt', ''), prompt) > 0.8):
            bad.append('distinct:repeats {!r}'.format(
                str(other.get('prompt', ''))[:60]))
            break

    return bad


def review_problems(problems, step):
    """Check a whole set. Returns (per-problem failures, set-wide failures).

    The set-wide half is where the slope is enforced: a set has to start on a
    warm-up, end on a stretch, and never get easier as it goes. That is the
    property a reader actually feels, and it is a fact about the ordering
    rather than about any one question — so no per-problem check could see it.
    """
    whole = []
    slots = [problem.get('slot') for problem in problems]
    if slots != list(range(1, len(problems) + 1)):
        whole.append('graded:slots are {} not 1..{}'.format(slots, len(problems)))
    order = [WEIGHTS.index(problem['weight']) if problem.get('weight') in WEIGHTS
             else -1 for problem in problems]
    if -1 not in order and order != sorted(order):
        whole.append('graded:the set gets easier partway through')
    if problems and order and -1 not in order:
        if order[0] != 0:
            whole.append('graded:the set does not open on a warm-up')
        if order[-1] != len(WEIGHTS) - 1:
            whole.append('graded:the set does not end on a stretch')
    # Whether the set restates the step is a question about the set, not about
    # any one problem in it. A warm-up that is a piece of the step's own
    # practice line is a good warm-up — "Evaluate (8 + 4) / (3 + 1)" opening a
    # set whose step says "evaluate it and compare with 8 + 4 / 3 + 1" is
    # exactly the right first rung. What is worthless is a set where *every*
    # problem is that line again, which adds nothing the step did not already
    # show. Only the second is refused.
    practice = (step or {}).get('practice', '')
    if practice and problems and all(
            overlap(problem.get('prompt', ''), practice) > 0.9 for problem in problems):
        whole.append('distinct:the set only restates the step')

    per = [problem_failures(problem, step, problems) for problem in problems]
    return per, whole

