"""The five kinds of next session, and the topics each one reads.

The Next sessions panel has one row of pills that says what the three are for:

  general    what comes next, picked from recent work (next_sessions.py)
  expansion  push the strongest topics further
  weakness   go after the weakest topics
  review     go back over work already done (review_sessions.py)
  new        start topics that haven't been touched yet

Each kind keeps its own three in the ledger, under `key`, so switching pills
never overwrites another kind's sessions. General's keys are the subject's own
name and "All subjects", which the subject page shares.

Weak and strong come from the topic library (backend/tracking/topics.py), which
already scores every topic against the rest of its subject. Everything here is
pure: the API hands in the rows and gets back picker options and brief blocks.
"""
from typing import Any, Dict, Iterable, List, Optional, Sequence

from backend.tracking import next_sessions
from backend.tracking import review_sessions
from backend.tracking import topics as topic_tracking

GENERAL, EXPANSION, WEAKNESS, REVIEW, NEW = 'general', 'expansion', 'weakness', 'review', 'new'
KINDS = (GENERAL, EXPANSION, WEAKNESS, REVIEW, NEW)

#: What the sessions are filed under, in front of the subject's name.
PREFIX = {EXPANSION: 'Expansion', WEAKNESS: 'Weakness', REVIEW: 'Review', NEW: 'New topics'}

#: Topics one brief lists. Enough to choose three different sessions from.
BRIEF_TOPICS = 8

#: Untouched topics the picker offers.
MOST_NEW = 120

#: Subjects a new-topic list reads when none are picked.
BUSIEST = 6


def kind_of(raw: Any) -> str:
    """A kind the page sent, or general for anything else."""
    return raw if raw in KINDS else GENERAL


def key(kind: str, subject: str = '') -> str:
    """The ledger key for one kind, for one subject or (with none) every one."""
    if kind == GENERAL:
        return subject or next_sessions.OVERALL
    return '{}: {}'.format(PREFIX[kind], subject or 'all subjects')


#: The ledger keys that span every subject. A step under one of these names
#: its subject in `focus`.
ACROSS = tuple(key(kind) for kind in KINDS)


def subject_of(ledger_key: str) -> str:
    """The subject's name in a ledger key, with the kind's prefix taken off."""
    text = str(ledger_key or '')
    for prefix in PREFIX.values():
        if text.startswith(prefix + ': '):
            return text[len(prefix) + 2:]
    return text


def studied(rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Rows named after a real topic, in subjects worth studying. A long run
    isn't anybody's weakest topic."""
    return [row for row in rows
            if row.get('topic') and review_sessions.reviewable(row.get('subject'))]


def in_scope(rows: Iterable[Dict[str, Any]], subjects: Optional[Sequence[str]]) -> List[Dict[str, Any]]:
    """Rows in these subjects; every row when none are named."""
    wanted = set(subjects or ())
    return [row for row in rows if not wanted or row.get('subject') in wanted]


def weakest(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The topics called weak, worst first, or, with none called weak, the
    ones rated under their subject's average."""
    found = [row for row in rows if row.get('status') == 'weak']
    if not found:
        found = [row for row in rows if row.get('status') == 'steady' and (row.get('gap') or 0) < 0]
    return sorted(found, key=lambda row: (row.get('gap') or 0, -row.get('tasks', 0)))


def strongest(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The topics called strong, best first, or, with none called strong, the
    ones rated over their subject's average."""
    found = [row for row in rows if row.get('status') == 'strong']
    if not found:
        found = [row for row in rows if row.get('status') == 'steady' and (row.get('gap') or 0) > 0]
    return sorted(found, key=lambda row: (-(row.get('gap') or 0), -row.get('tasks', 0)))


def untouched(rows: Sequence[Dict[str, Any]], subjects: Sequence[str],
              goals: Sequence[Dict[str, Any]] = (), most: int = MOST_NEW) -> List[Dict[str, Any]]:
    """Topics the account hasn't done yet, best first: what its goals need,
    then topics it's ready for in the trees it already works in, then the rest
    of those trees. Trees it has never opened are left out, except each
    subject's own main one, so Mathematics doesn't offer all thirteen."""
    tax = topic_tracking.taxonomy()
    done = {row['topic'] for row in rows if row.get('topic')}
    done_names = {tax.label(topic).lower() for topic in done}
    worked_in = {row['subsubject'] for row in rows if row.get('subsubject')}
    out: List[Dict[str, Any]] = []
    seen = set(done)

    def add(topic_id: str, subject: str, why: str) -> None:
        topic = tax.topics.get(topic_id)
        if topic and topic_id not in seen:
            seen.add(topic_id)
            out.append({'topic': topic_id, 'label': topic['label'], 'subject': subject,
                        'subject_label': topic_tracking.subject_name(subject),
                        'subsubject': topic['tree'], 'subsubject_label': tax.trees.get(topic['tree'], ''),
                        'status': 'untouched', 'tasks': 0, 'why': why})

    in_family = {tree: subject for subject in reversed(list(subjects)) for tree in tax.family(subject)}
    for goal in goals:
        for topic_id in topic_tracking.scope(goal)['syllabus']:
            subject = in_family.get(tax.topics.get(topic_id, {}).get('tree', ''))
            if subject:
                add(topic_id, subject, 'goal: {}'.format(str(goal.get('title') or '')[:80]))

    ready, later = [], []
    for subject in subjects:
        family = tax.family(subject)
        for tree in family:
            if tree not in worked_in and tree != family[0]:
                continue
            for topic_id, topic in tax.topics.items():
                if topic['tree'] != tree or topic_id in seen:
                    continue
                needs = [name.lower() for name in topic.get('requires', [])]
                (ready if all(name in done_names for name in needs) else later).append((topic_id, subject))
    for topic_id, subject in ready:
        add(topic_id, subject, 'ready for it')
    for topic_id, subject in later:
        add(topic_id, subject, '')
    return out[:most]


def options(kind: str, rows: Sequence[Dict[str, Any]], subjects: Optional[Sequence[str]],
            goals: Sequence[Dict[str, Any]] = (), fallback: Sequence[str] = ()) -> List[Dict[str, Any]]:
    """The topics the panel offers to filter by, the ones this kind cares about
    first. One entry per topic, however many subjects it's filed under.

    `fallback` is the subjects a new-topic list reads when none are picked.
    """
    if kind == NEW:
        return [_option(row) for row in untouched(studied(rows), list(subjects or fallback), goals)]
    # Laundry isn't a topic to filter by, unless you picked the subject it's in.
    mine = [row for row in in_scope(rows, subjects) if row.get('topic')] if kind == GENERAL and subjects \
        else in_scope(studied(rows), subjects)
    merged: Dict[str, Dict[str, Any]] = {}
    for row in sorted(mine, key=lambda one: -one.get('tasks', 0)):
        merged.setdefault(row['topic'], row)
    picked = list(merged.values())
    first = weakest(picked) if kind == WEAKNESS else strongest(picked) if kind == EXPANSION else []
    chosen = {row['topic'] for row in first}
    return [_option(row) for row in first + [row for row in picked if row['topic'] not in chosen]]


def _option(row: Dict[str, Any]) -> Dict[str, Any]:
    return {'id': row['topic'], 'label': row.get('label') or row['topic'],
            'area': row.get('subsubject_label') or '', 'subject': row.get('subject') or '',
            'subject_label': row.get('subject_label') or '', 'status': row.get('status') or '',
            'tasks': row.get('tasks') or 0, 'execution': row.get('execution')}


def count(kind: str, rows: Sequence[Dict[str, Any]], subjects: Optional[Sequence[str]],
          goals: Sequence[Dict[str, Any]] = (), fallback: Sequence[str] = ()) -> Optional[int]:
    """How much this kind has to work from, for all but general and review."""
    mine = in_scope(studied(rows), subjects)
    if kind == WEAKNESS:
        return len(weakest(mine))
    if kind == EXPANSION:
        return len(strongest(mine))
    if kind == NEW:
        return len(untouched(studied(rows), list(subjects or fallback), goals))
    return None


def on_topics(tasks: Iterable[Dict[str, Any]], picked: Iterable[str]) -> List[Dict[str, Any]]:
    """The tasks that file under these topics."""
    wanted = set(picked)
    return [task for task in tasks if topic_tracking.classify(
        task.get('title') or '', task.get('description') or '', task.get('subject') or '')['topic'] in wanted]


# --------------------------------------------------------------------------
# The brief
# --------------------------------------------------------------------------
def _worked_line(row: Dict[str, Any]) -> str:
    """One topic with how it's gone, so the model can quote the numbers and the
    figure check lets it."""
    where = ', '.join(part for part in (row.get('subsubject_label'), row.get('subject_label')) if part)
    parts = ['{} tasks'.format(row.get('tasks') or 0)]
    if row.get('execution') is not None:
        parts.append('rated {:g} of 5'.format(row['execution']))
    if row.get('base') is not None:
        parts.append('{:g} for the whole subject'.format(row['base']))
    if row.get('score_pct') is not None:
        parts.append('scored {}%'.format(row['score_pct']))
    if row.get('difficulty') is not None:
        parts.append('filed {:g} of 5 hard'.format(row['difficulty']))
    if row.get('last_at'):
        parts.append('last done {}'.format(row['last_at']))
    examples = '; '.join('"{}"'.format(title[:80]) for title in (row.get('examples') or [])[:2])
    return '{} ({}): {}{}'.format(row.get('label'), where, ', '.join(parts),
                                  '. Tasks: ' + examples if examples else '')


def _new_line(row: Dict[str, Any]) -> str:
    where = ', '.join(part for part in (row.get('subsubject_label'), row.get('subject_label')) if part)
    why = '; {}'.format(row['why']) if row.get('why') else ''
    return '{} ({}){}'.format(row.get('label'), where, why)


def _block(tag: str, lines: Sequence[str]) -> str:
    if not lines:
        return ''
    return '\n\n<{0}>\n{1}\n</{0}>'.format(tag, '\n'.join('  - ' + line for line in lines[:BRIEF_TOPICS]))


def brief_block(kind: str, rows: Sequence[Dict[str, Any]], subjects: Optional[Sequence[str]],
                picked: Sequence[str] = (), goals: Sequence[Dict[str, Any]] = (),
                fallback: Sequence[str] = ()) -> str:
    """The section of the brief this kind plans from. Topics the reader picked
    win over the ones this would have chosen. Empty when there's nothing to
    plan from, which the API turns into a message."""
    wanted = set(picked)
    if kind == NEW:
        pool = untouched(studied(rows), list(subjects or fallback), goals)
        chosen = [row for row in pool if row['topic'] in wanted] if wanted else pool
        return _block('new_topics', [_new_line(row) for row in chosen])

    mine = in_scope(studied(rows) if kind != GENERAL else rows, subjects)
    if wanted:
        chosen = sorted((row for row in mine if row.get('topic') in wanted),
                        key=lambda row: row.get('gap') or 0, reverse=kind == EXPANSION)
        tag = {WEAKNESS: 'weakest_topics', EXPANSION: 'strongest_topics'}.get(kind, 'picked_topics')
        return _block(tag, [_worked_line(row) for row in chosen])
    if kind == WEAKNESS:
        return _block('weakest_topics', [_worked_line(row) for row in weakest(mine)])
    if kind == EXPANSION:
        return _block('strongest_topics', [_worked_line(row) for row in strongest(mine)])
    return ''
