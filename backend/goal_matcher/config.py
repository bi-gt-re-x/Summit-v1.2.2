"""Every number and word list the goal matcher tunes on, in one place.

Nothing here is final. The thresholds were set against the titles in the dev
database (tests/test_goal_matcher_match.py holds the cases they were checked
on), and the right move when a match looks wrong is to change a value here and
see which of those cases move — not to add a special case in the scorer.
"""

# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------
# At or above: the task counts toward the goal.
MATCH_THRESHOLD = 0.75
# At or above, but below MATCH_THRESHOLD: plausible, not confident. The task
# is marked ambiguous and its candidates are worth a closer look. Below this
# is unmatched, and an unmatched task is never sent anywhere else.
AMBIGUOUS_THRESHOLD = 0.45
# Once one goal has matched, how strong another has to be to be kept beside
# it. Lower than MATCH_THRESHOLD, because a task already shown to be about one
# goal is more likely to be about a closely related one, but well above
# AMBIGUOUS_THRESHOLD so an unrelated goal cannot ride along.
SECONDARY_MATCH_THRESHOLD = 0.65
# A task counts toward at most this many goals.
MAX_MATCHES_PER_TASK = 3

# ---------------------------------------------------------------------------
# Evidence, each a value between 0 and 1
# ---------------------------------------------------------------------------
# Signals combine as a noisy OR, 1 - (1-a)(1-b)..., so each is roughly "how
# sure would this alone make me". Two moderate signals make a strong one; no
# pile of weak ones reaches the threshold, because each weak one is small.

# The goal's own title. `c` is the share of its key terms the task contains:
# all of them is 0.9, half is 0.76. A goal whose title is one key term —
# "Reach AIME" — is fully covered by any task naming that term.
TITLE_COVERAGE_BASE = 0.62
TITLE_COVERAGE_SPAN = 0.28
# Two title words side by side in the task, in order ("usaco gold", "amc 10").
TITLE_PAIR = 0.85
# A weak title word ("rating", "gold") or a number, on its own.
TITLE_WEAK_TERM = 0.35
TITLE_NUMBER = 0.15

# A checkpoint under the goal. Weaker than the title: a checkpoint names one
# stage, and its words are more often ordinary ones.
CHECKPOINT_COVERAGE_BASE = 0.4
CHECKPOINT_COVERAGE_SPAN = 0.3
CHECKPOINT_PAIR = 0.7

# The task is filed under one of the goal's subjects. Corroboration only: on
# its own it stays below AMBIGUOUS_THRESHOLD, so a Math task is never tied to
# a Math goal just for being Math.
SUBJECT_AGREES = 0.3

# An activity word the two share ("practice", "problem set"). Almost nothing,
# and capped, so no number of them adds up to a match.
GENERIC_TERM = 0.05
GENERIC_CAP = 0.1

# ---------------------------------------------------------------------------
# Words
# ---------------------------------------------------------------------------
# Carry no meaning for matching at all: grammar, and the words checkpoints use
# to say a stage is done ("reached", "fluent", "secured").
IGNORED = frozenset('''
    a an the and or but of to for in on at by with from into onto over under
    my your our their his her its it i me we you they this that these those
    is are was were be been being am do does did done has have had
    some any all more most even much many very just also only then than as
    not no yes new next add up out off about vs via per etc s t
    reached passed secured solid fluent consistent qualified cleared sat
    chosen understood successful unassisted without hints achieved completed
    finished ready started stable
'''.split())

# What kind of work, not what it is about. "Practice" says nothing about which
# goal; "AIME practice" says it through "AIME".
GENERIC = frozenset('''
    practice practise practicing study studying review reviews revision revise
    homework problem problems set sets session sessions training drill drills
    exercise exercises lecture lectures class classes lesson lessons notes note
    reading read work working prep preparation prepare mock mocks block blocks
    time task tasks question questions quiz worksheet assignment assignments
    chapter chapters section sections part test tests exam exams paper papers
    past write writing writeup grind grinding run through day week weekend
    morning evening long short hour hours minute minutes plan planning daily
    weekly
'''.split())

# Words that often appear in goal titles without saying what the goal is
# about: the verbs of wanting something and the nouns of measuring it.
WEAK = frozenset('''
    reach become get achieve pass build launch finish complete master improve
    learn learning win earn beat make start keep hit
    rating score scores level levels grade grades rank ranking users user
    first top gold silver bronze streak xp goal goals role job career
    experience fundamental fundamentals basics basic advanced intro scratch
    project projects v version portfolio team theory
'''.split())
