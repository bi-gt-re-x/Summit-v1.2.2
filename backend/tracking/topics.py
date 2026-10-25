"""Topics: what each task was about, below its subject, and what's weak.

## What this is for

A task carries a subject and nothing finer, so the subject page could only
ever say "Mathematics is going fine" and hand out advice that would fit
anybody ("slow down on easy work"). Most task names say more than that.
"AMC 10 recursive counting set", "USACO Gold DP", "Integration drills",
"Strang Ch.2 eigenvalues" each name a contest, an area and often a topic.

This reads those names and files every finished task under

    subject → subsubject → topic

where a subsubject is a skill tree (Competition Math, Calculus, Algorithms)
and a topic is one of that tree's nodes or a finer topic under one
(Recursive counting under Counting). The contest, exam, course or site a task
names (AMC 10, AIME, USACO Gold, LeetCode) is kept beside it as its context.

Then each topic is scored against the rest of the subject, from the ratings
the tasks already carry, and each goal is tied to the topics it needs: the
goal's own words name a contest or a tree, and a contest has a syllabus. That
gives a starting position per goal (strong here, weak there, never touched
this) and moves that name real work: "Do 10 AMC 12 recursive counting
problems", not "try harder problems".

## Where the words come from

data/topic_taxonomy.json, on top of every skill-tree node in
data/skill_nodes.json. The node names are the bulk of the library (2,300 of
them); the taxonomy adds finer topics, the ways people write them ("dp",
"u-sub", "c&p"), which trees count as part of a subject, and the contexts with
their syllabi. Nothing here calls a model, so a name always files the same
way and the tests can say exactly where it lands.

## Where it's kept

`topic_library`, one row per account, subject, subsubject and topic, with the
goals it feeds (data/sql/topics.sql). Built by `build`, which the API runs on
a POST; `stale` says when the tasks or goals have moved on since, from one
cheap aggregate, so the page knows to ask for a rebuild. Reading it never
writes (tests/test_get_requests_do_not_write.py).
"""
import hashlib
import json
import re
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from backend.config import subjects as subject_catalog
from backend.tracking import free_resources

DATA = Path(__file__).resolve().parents[2] / 'data'
TAXONOMY_PATH = DATA / 'topic_taxonomy.json'
NODES_PATH = DATA / 'skill_nodes.json'

#: Bump when the rules below change in a way that files tasks differently, so
#: every stored library reads as stale and is rebuilt on the next visit.
RULES = 1

#: How hard a topic's own average is pulled toward the subject's, in tasks. A
#: topic with three rated tasks says little; with thirty, it speaks for itself.
SHRINK = 4

#: How far below (or above) the subject's average, on the 1-5 rating, a topic
#: has to sit to be called weak (or strong). About a fifth of a point is the
#: gap between "fine" and "usually a bit off" on the rating dialog.
GAP = 0.2

#: Fewer rated tasks than this and a topic reads as "too few to tell".
MIN_RATED = 3

#: Words that never make a topic on their own: they describe the kind of
#: session, not what it was about.
STOP = frozenset('''
a an the of and or to in on for with your my at by from into
practice problem set session review lecture drill exercise note study basic
intro introduction advanced final test exam quiz work homework hw class
chapter ch section part day week weekend club reading mock round
'''.split())

#: How many moves and insights a goal gets. The panel shows five moves in all,
#: so the topic moves leave room for the goal's own levers.
MOVES = 4


# --------------------------------------------------------------------------
# Words
# --------------------------------------------------------------------------
def _stem(word: str) -> str:
    if len(word) > 4 and word.endswith('ies'):
        word = word[:-3] + 'y'
    elif len(word) > 3 and word.endswith('s') and not word.endswith('ss'):
        word = word[:-1]
    if len(word) > 5 and word.endswith('ing'):
        word = word[:-3]
    return word


def words(text: str) -> Tuple[str, ...]:
    """A name as stemmed lowercase words. "Maths" and "math", "drills" and
    "drill", "counting" and "count" come out the same."""
    text = (text or '').lower().replace('&', ' and ').replace("'", '').replace('’', '')
    return tuple(_stem(word) for word in re.findall(r'[a-z0-9]+', text))


def slug(label: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', label.lower().replace('&', ' ')).strip('-')


def _flat(text: str) -> str:
    """Lowercase with the dashes evened out, for the context patterns."""
    text = (text or '').lower()
    text = re.sub(r'[‐-―−]', '-', text)
    return re.sub(r'\s+', ' ', text)


# --------------------------------------------------------------------------
# The library's shape
# --------------------------------------------------------------------------
class Taxonomy:
    """Trees, topics and contexts, read once from the two data files."""

    def __init__(self, taxonomy: Dict[str, Any], nodes: Sequence[Dict[str, Any]]):
        self.families: Dict[str, List[str]] = taxonomy.get('families', {})
        self.trees: Dict[str, str] = {}
        for node in nodes:
            self.trees.setdefault(node['tree'], node['treeTitle'])
        for tree, extra in taxonomy.get('subsubjects', {}).items():
            if tree not in self.trees:
                self.trees[tree] = extra.get('label') or tree.replace('-', ' ').title()

        # Subsubject names: the tree's own title and the taxonomy's aliases.
        self.tree_aliases: Dict[str, List[Tuple[str, ...]]] = defaultdict(list)
        for tree, title in self.trees.items():
            self.tree_aliases[tree].append(words(title))
        for tree, extra in taxonomy.get('subsubjects', {}).items():
            self.tree_aliases[tree].extend(words(alias) for alias in extra.get('aliases', []))

        skip = set(taxonomy.get('skip_nodes', []))
        self.topics: Dict[str, Dict[str, Any]] = {}
        for node in nodes:
            topic_id = '{}:{}'.format(node['tree'], slug(node['name']))
            if topic_id in skip:
                continue
            name = re.sub(r'^the\s+', '', node['name'], flags=re.IGNORECASE)
            aliases = [words(name)]
            # "Sorting & Two Pointers" is also "two pointers". A single word
            # split off a name ("Train, Validate, Test" → "train") is too loose
            # to stand alone, so only parts of two words or more are kept.
            for part in re.split(r'\s*(?:&|,|/|\band\b)\s*', name):
                if part and part.lower() != name.lower() and len(words(part)) >= 2:
                    aliases.append(words(part))
            self.topics[topic_id] = {
                'id': topic_id, 'tree': node['tree'], 'label': node['name'],
                'under': '', 'aliases': aliases, 'hand': False,
            }
        for entry in taxonomy.get('topics', []):
            for tree in entry.get('trees') or [entry['tree']]:
                topic_id = '{}:{}'.format(tree, slug(entry['label']))
                topic = self.topics.setdefault(topic_id, {
                    'id': topic_id, 'tree': tree, 'label': entry['label'],
                    'under': '', 'aliases': [words(entry['label'])], 'hand': True,
                })
                topic['hand'] = True
                topic['under'] = entry.get('under', topic['under'])
                topic['aliases'].extend(words(alias) for alias in entry.get('aliases', []))
        for topic in self.topics.values():
            seen, kept = set(), []
            for alias in topic['aliases']:
                if alias and alias not in seen and not all(word in STOP for word in alias):
                    seen.add(alias)
                    kept.append(alias)
            topic['aliases'] = kept

        # First word → (topic, alias), so a name is scanned once, not per topic.
        self.index: Dict[str, List[Tuple[Dict[str, Any], Tuple[str, ...]]]] = defaultdict(list)
        for topic in self.topics.values():
            for alias in topic['aliases']:
                self.index[alias[0]].append((topic, alias))
        self.tree_index: Dict[str, List[Tuple[str, Tuple[str, ...]]]] = defaultdict(list)
        for tree, aliases in self.tree_aliases.items():
            for alias in aliases:
                if alias and not all(word in STOP for word in alias):
                    self.tree_index[alias[0]].append((tree, alias))

        self.contexts: List[Dict[str, Any]] = []
        for context in taxonomy.get('contexts', []):
            self.contexts.append({**context, 'regex': [re.compile(p) for p in context['patterns']]})
        self.context_by_id = {context['id']: context for context in self.contexts}
        self.units: Dict[str, Dict[str, Any]] = {
            tree: unit for tree, unit in taxonomy.get('units', {}).items() if not tree.startswith('_')}

    def family(self, subject: str) -> List[str]:
        """The trees a subject's tasks can file under, nearest first."""
        if subject in self.families:
            return list(self.families[subject])
        own = (subject or '').replace('_', '-')
        return [own] if own in self.trees else []

    def label(self, topic_id: str) -> str:
        topic = self.topics.get(topic_id)
        return topic['label'] if topic else ''


@lru_cache(maxsize=1)
def taxonomy() -> Taxonomy:
    with open(TAXONOMY_PATH, encoding='utf-8') as handle:
        data = json.load(handle)
    with open(NODES_PATH, encoding='utf-8') as handle:
        nodes = json.load(handle)['nodes']
    return Taxonomy(data, nodes)


@lru_cache(maxsize=1)
def version() -> str:
    """Changes whenever the rules or either data file do."""
    digest = hashlib.sha1(str(RULES).encode())
    for path in (TAXONOMY_PATH, NODES_PATH):
        digest.update(path.read_bytes())
    return digest.hexdigest()[:12]


# --------------------------------------------------------------------------
# One task
# --------------------------------------------------------------------------
def _find(tokens: Tuple[str, ...], index) -> Iterable[Tuple[Any, Tuple[str, ...], int]]:
    for start, word in enumerate(tokens):
        for item, alias in index.get(word, ()):
            if tokens[start:start + len(alias)] == alias:
                yield item, alias, start


def contexts_in(text: str) -> List[str]:
    """The contests, exams, courses and sites a piece of text names, most
    specific only: "USACO Gold" is usaco-gold, not also usaco."""
    flat = _flat(text)
    found = [c['id'] for c in taxonomy().contexts if any(r.search(flat) for r in c['regex'])]
    return [cid for cid in found if not any(other != cid and other.startswith(cid) for other in found)]


def classify(title: str, description: str = '', subject: str = '') -> Dict[str, str]:
    """Where one task files: subsubject (a tree id), topic (a topic id), the
    context it names, and `how` it was found:

    - `named`: the title names the topic
    - `described`: only the description does
    - `area`: the title names the subsubject but no topic in it
    - `context`: only a contest or course, which says the subsubject
    - `none`: nothing to go on
    """
    tax = taxonomy()
    return dict(_classify(tax, title or '', (description or '')[:400], subject or ''))


@lru_cache(maxsize=20000)
def _classify(tax: Taxonomy, title: str, description: str, subject: str) -> Tuple[Tuple[str, str], ...]:
    family = tax.family(subject)
    found = contexts_in(title) or contexts_in(description)
    context = found[0] if found else ''
    context_trees = {tax.context_by_id[cid]['tree'] for cid in found}
    allowed = set(family) | context_trees
    strict = not allowed  # nothing to narrow it with: only clear, long names count

    def score(topic, alias, weight):
        tree = topic['tree']
        value = 10 * len(alias) + (3 if tree in context_trees else 0) + (2 if topic['hand'] else 0)
        if family and tree == family[0]:
            value += 1
        return value * weight

    # The areas the title names. A topic word inside a longer area name is
    # part of that name ("algebra" in "linear algebra"), and a topic in the
    # area the title names beats one elsewhere.
    tree_hit, tree_score, spans = '', 0, []
    for tree, alias, at in _find(words(title), tax.tree_index):
        if not strict and tree not in allowed:
            continue
        spans.append((at, at + len(alias)))
        value = len(alias) * 10 + (1 if family and tree == family[0] else 0)
        if value > tree_score:
            tree_hit, tree_score = tree, value

    best, best_score, how = None, 0.0, 'none'
    for text, weight, kind in ((title, 1.0, 'named'), (description, 0.5, 'described')):
        for topic, alias, at in _find(words(text), tax.index):
            if strict:
                if len(alias) < 2 and len(alias[0]) < 6:
                    continue
            elif topic['tree'] not in allowed:
                continue
            if kind == 'named' and any(start <= at and at + len(alias) <= end and end - start > len(alias)
                                       for start, end in spans):
                continue
            value = score(topic, alias, weight) + (15 if topic['tree'] == tree_hit else 0)
            if value > best_score:
                best, best_score, how = topic, value, kind
    if best:
        return (('subsubject', best['tree']), ('topic', best['id']), ('context', context), ('how', how))

    if tree_hit:
        return (('subsubject', tree_hit), ('topic', ''), ('context', context), ('how', 'area'))
    if context:
        return (('subsubject', tax.context_by_id[context]['tree']), ('topic', ''), ('context', context),
                ('how', 'context'))
    return (('subsubject', ''), ('topic', ''), ('context', ''), ('how', 'none'))


# --------------------------------------------------------------------------
# The library
# --------------------------------------------------------------------------
def _num(value) -> Optional[float]:
    try:
        return None if value is None or value == '' else float(value)
    except (TypeError, ValueError):
        return None


def _mean(values: List[float]) -> Optional[float]:
    return sum(values) / len(values) if values else None


def subject_name(subject: str) -> str:
    found = subject_catalog.get(subject)
    return found['name'] if found else (subject or '').replace('_', ' ').title()


def library(tasks: Sequence[Dict[str, Any]], goals: Sequence[Dict[str, Any]] = (),
            matches: Optional[Dict[str, List[str]]] = None) -> List[Dict[str, Any]]:
    """Every finished task filed and scored, one row per subject, subsubject
    and topic.

    `tasks` are finished tasks with title, description, subject, execution,
    difficulty, score_got, score_of, met_deadline, reason, completed_at,
    goal_id and id. `matches` maps a goal id to the task ids the goal matcher
    tied to it. Rows come back with the ids of the goals they feed.
    """
    tax = taxonomy()
    groups: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    by_subject: Dict[str, Dict[str, list]] = defaultdict(lambda: {'exec': [], 'got': 0.0, 'of': 0.0})
    task_goals: Dict[str, set] = defaultdict(set)
    for goal_id, task_ids in (matches or {}).items():
        for task_id in task_ids:
            task_goals[str(task_id)].add(str(goal_id))

    for task in tasks:
        subject = (task.get('subject') or '').strip()
        if not subject:
            continue
        filed = classify(task.get('title', ''), task.get('description', ''), subject)
        key = (subject, filed['subsubject'], filed['topic'])
        row = groups.get(key)
        if row is None:
            row = groups[key] = {
                'subject': subject, 'subsubject': filed['subsubject'], 'topic': filed['topic'],
                'tasks': 0, 'exec': [], 'difficulty': [], 'got': 0.0, 'of': 0.0, 'scored': 0,
                'late': 0, 'due': 0, 'reasons': Counter(), 'contexts': Counter(), 'titles': Counter(),
                'how': Counter(), 'first_at': '', 'last_at': '', 'goals': set(), 'context_titles': {},
            }
        row['tasks'] += 1
        execution = _num(task.get('execution'))
        if execution is not None:
            row['exec'].append(execution)
            by_subject[subject]['exec'].append(execution)
        difficulty = _num(task.get('difficulty'))
        if difficulty is not None:
            row['difficulty'].append(difficulty)
        got, of = _num(task.get('score_got')), _num(task.get('score_of'))
        if got is not None and of:
            row['got'] += got
            row['of'] += of
            row['scored'] += 1
            by_subject[subject]['got'] += got
            by_subject[subject]['of'] += of
        if task.get('met_deadline') is not None and task.get('met_deadline') != '':
            row['due'] += 1
            if task.get('met_deadline') in (False, 0, '0', 'false'):
                row['late'] += 1
        if task.get('reason'):
            row['reasons'][task['reason']] += 1
        if filed['context']:
            row['contexts'][filed['context']] += 1
            row['context_titles'].setdefault(filed['context'], (task.get('title') or '').strip())
        row['how'][filed['how']] += 1
        row['titles'][(task.get('title') or '').strip()] += 1
        stamp = (task.get('completed_at') or '')[:10]
        if stamp:
            row['first_at'] = min(row['first_at'] or stamp, stamp)
            row['last_at'] = max(row['last_at'], stamp)
        if task.get('goal_id'):
            row['goals'].add(str(task['goal_id']))
        row['goals'] |= task_goals.get(str(task.get('id')), set())

    rows = []
    for row in groups.values():
        base = by_subject[row['subject']]
        base_exec = _mean(base['exec'])
        execution = _mean(row['exec'])
        rated = len(row['exec'])
        gap = None
        if execution is not None and base_exec is not None:
            shrunk = (sum(row['exec']) + SHRINK * base_exec) / (rated + SHRINK)
            gap = shrunk - base_exec
        score_pct = round(100 * row['got'] / row['of']) if row['of'] else None
        if score_pct is not None and row['scored'] >= MIN_RATED and base['of']:
            score_gap = (score_pct - 100 * base['got'] / base['of']) / 20
            gap = score_gap if gap is None else (gap + score_gap) / 2
        evidence = rated + row['scored']
        if not row['subsubject']:
            status = 'unknown'
        elif evidence < MIN_RATED or gap is None:
            status = 'untested'
        elif gap <= -GAP:
            status = 'weak'
        elif gap >= GAP:
            status = 'strong'
        else:
            status = 'steady'
        rows.append({
            'subject': row['subject'],
            'subject_label': subject_name(row['subject']),
            'subsubject': row['subsubject'],
            'subsubject_label': tax.trees.get(row['subsubject'], ''),
            'topic': row['topic'],
            'label': tax.label(row['topic']),
            'under': tax.topics.get(row['topic'], {}).get('under', ''),
            'tasks': row['tasks'],
            'rated': rated,
            'execution': round(execution, 2) if execution is not None else None,
            'base': round(base_exec, 2) if base_exec is not None else None,
            'gap': round(gap, 2) if gap is not None else None,
            'difficulty': round(_mean(row['difficulty']), 1) if row['difficulty'] else None,
            'score_pct': score_pct,
            'late_share': round(row['late'] / row['due'], 2) if row['due'] else None,
            'reason': row['reasons'].most_common(1)[0][0] if row['reasons'] else '',
            'contexts': dict(row['contexts'].most_common()),
            'examples': [title for title, _n in row['titles'].most_common(3)],
            'context_examples': row['context_titles'],
            'how': row['how'].most_common(1)[0][0],
            'status': status,
            'first_at': row['first_at'],
            'last_at': row['last_at'],
            'goal_ids': sorted(row['goals']),
        })
    connect(rows, goals)
    order = {'weak': 0, 'steady': 1, 'strong': 2, 'untested': 3, 'unknown': 4}
    rows.sort(key=lambda r: (r['subject'], r['subsubject'] == '', r['subsubject_label'],
                             r['topic'] == '', order[r['status']], r['gap'] if r['gap'] is not None else 0,
                             -r['tasks']))
    return rows


# --------------------------------------------------------------------------
# Goals
# --------------------------------------------------------------------------
def _goal_text(goal: Dict[str, Any]) -> str:
    return ' '.join(str(goal.get(key) or '') for key in ('title', 'description', 'why', 'unit', 'measure'))


def _goal_subjects(goal: Dict[str, Any]) -> List[str]:
    raw = goal.get('subject_ids') or ''
    if isinstance(raw, (list, tuple)):
        return [str(item) for item in raw if item]
    raw = str(raw).strip()
    if raw.startswith('['):
        try:
            return [str(item) for item in json.loads(raw) if item]
        except ValueError:
            return []
    return [part.strip() for part in raw.split(',') if part.strip()]


def scope(goal: Dict[str, Any]) -> Dict[str, Any]:
    """What a goal is about, from its own words: the contexts it names (most
    specific first), their syllabus, and the trees it touches."""
    tax = taxonomy()
    # The title's contests first: "Reach AIME" whose note says "through AMC
    # 10" is about the AIME.
    found = contexts_in(goal.get('title') or '')
    found += [cid for cid in contexts_in(_goal_text(goal)) if cid not in found]
    syllabus, also, trees = [], [], []
    for cid in found:
        context = tax.context_by_id[cid]
        trees.append(context['tree'])
        for topic_id in context.get('syllabus', []):
            if topic_id in tax.topics and topic_id not in syllabus:
                syllabus.append(topic_id)
        for topic_id in context.get('also', []):
            if topic_id in tax.topics and topic_id not in also:
                also.append(topic_id)
    tokens = words(goal.get('title') or '')
    for tree, alias, _at in _find(tokens, tax.tree_index):
        if sum(len(word) for word in alias) >= 4 and tree not in trees:
            trees.append(tree)
    for topic, alias, _at in _find(tokens, tax.index):
        if (len(alias) >= 2 or len(alias[0]) >= 6) and topic['id'] not in syllabus:
            syllabus.append(topic['id'])
            if topic['tree'] not in trees:
                trees.append(topic['tree'])
    return {'contexts': found, 'syllabus': syllabus, 'also': also, 'trees': trees,
            'subjects': _goal_subjects(goal)}


def connect(rows: List[Dict[str, Any]], goals: Sequence[Dict[str, Any]]) -> None:
    """Add to each row the goals it feeds. A row feeds a goal when its topic is
    on the goal's syllabus, it sits in a tree the goal names, its tasks name the
    goal's contest, or its tasks were tied to the goal. A goal that names none
    of those (most "Become X" goals) takes its subjects' rows instead."""
    for goal in goals:
        goal_id = str(goal.get('id'))
        if not goal_id:
            continue
        found = scope(goal)
        topics = set(found['syllabus']) | set(found['also'])
        trees, contexts = set(found['trees']), set(found['contexts'])

        def named(row):
            return bool((row['topic'] and row['topic'] in topics)
                        or (row['subsubject'] and row['subsubject'] in trees)
                        or contexts & set(row['contexts']))

        # When the goal's words find no work at all ("Become an engineer"
        # names the Engineering tree, which has no tasks), its subjects do.
        by_words = any(named(row) for row in rows)
        for row in rows:
            feeds = (named(row) or goal_id in row['goal_ids']
                     or (not by_words and row['subject'] in found['subjects']))
            if feeds and goal_id not in row['goal_ids']:
                row['goal_ids'] = sorted(row['goal_ids'] + [goal_id])


def _resource(subjects: Sequence[str], tokens: Sequence[str]) -> Optional[Dict[str, str]]:
    """The free catalog row whose keywords best fit these words."""
    have = ' '.join(tokens)
    best, best_score = None, 0
    for row in free_resources.catalog():
        score = 0
        # Its keywords, and the distinctive words of its name ("Codeforces").
        named = [word for word in words(row['name']) if len(word) >= 4 and word not in STOP]
        for keyword in list(row.get('keywords', [])) + named:
            stem = ' '.join(words(keyword))
            if stem and re.search(r'\b{}\b'.format(re.escape(stem)), have):
                score += 2 * len(stem.split()) + (1 if row['subject'] in subjects else 0)
        if score > best_score:
            best, best_score = row, score
    return {'name': best['name'], 'url': best['url']} if best else None


def _amount(context: Optional[Dict[str, Any]], tree: str = '') -> Tuple[int, str]:
    """How much one move asks for: the contest's own amount, else the tree's
    (two coding sessions, twenty minutes of violin), else 8 problems."""
    if context:
        return int(context.get('count') or 8), context.get('unit') or 'problems'
    unit = taxonomy().units.get(tree)
    if unit:
        return int(unit['count']), unit['unit']
    return 8, 'problems'


def lower(label: str) -> str:
    """A label inside a sentence: "Knapsack DP" → "knapsack DP", "AIME
    Strategy" → "AIME strategy". Acronyms and numbers keep their case."""
    return ' '.join(word if (word.isupper() and len(word) > 1) or any(ch.isdigit() for ch in word)
                    else word.lower() for word in label.split(' '))


def _figure(value: Optional[float]) -> str:
    return '{:.1f}'.format(value) if value is not None else '?'


def plan(goal: Dict[str, Any], rows: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """Where one goal starts from and what to do next, from the library.

    `position` is the goal's syllabus, each topic with how it's going. `moves`
    name real work: a count, a contest, a topic. `insights` say what the
    library shows about the goal, in the same shape the subject page's own
    insights use.
    """
    tax = taxonomy()
    goal_id = str(goal.get('id'))
    title = goal.get('title') or 'this goal'
    aim = '"{}"'.format(title)
    found = scope(goal)
    mine = [row for row in rows if goal_id in row['goal_ids']]
    by_topic = {row['topic']: row for row in mine if row['topic']}
    primary = tax.context_by_id.get(found['contexts'][0]) if found['contexts'] else None
    warmup = tax.context_by_id.get(primary.get('warmup', '')) if primary else None

    # A syllabus topic also counts as worked on through the same topic in a
    # nearby tree the context lists under `also`: 35 "Combinatorics practice"
    # tasks (Mathematics' Counting & Combinatorics) are work on AIME counting.
    also_rows = [by_topic[topic_id] for topic_id in found['also'] if topic_id in by_topic]

    def same_topic(topic_id):
        mine_words = set(words(tax.label(topic_id))) - STOP
        for row in also_rows:
            if mine_words and mine_words <= set(words(row['label'])):
                return row
        return None

    position = []
    for topic_id in found['syllabus']:
        row = by_topic.get(topic_id) or same_topic(topic_id)
        position.append({
            'topic': topic_id,
            'label': tax.label(topic_id),
            'subsubject_label': tax.trees.get(tax.topics[topic_id]['tree'], ''),
            'status': row['status'] if row else 'untouched',
            'tasks': row['tasks'] if row else 0,
            'execution': row['execution'] if row else None,
        })

    judged = ('weak', 'steady', 'strong')
    named = [row for row in mine if row['topic'] and row['status'] in judged]
    weak = sorted((row for row in named if row['status'] == 'weak'), key=lambda r: r['gap'])
    strong = sorted((row for row in named if row['status'] == 'strong'), key=lambda r: -r['gap'])
    untouched = [p for p in position if p['status'] == 'untouched']
    touched = len(position) - len(untouched)
    # Work toward the goal whose names don't say the topic: an area ("Linear
    # algebra exercises") or only a contest ("AIME problem set"). Counted for
    # the goal's own contests when it names any, so a Putnam session isn't
    # held up as an AIME example.
    areas = [row for row in mine if not row['topic'] and row['subsubject']]
    goal_contexts = found['contexts']
    unnamed, example = 0, ''
    if goal_contexts:
        for row in areas:
            for cid in goal_contexts:
                unnamed += row['contexts'].get(cid, 0)
                example = example or row.get('context_examples', {}).get(cid, '')
    if not unnamed:
        unnamed = sum(row['tasks'] for row in areas)
        example = max(areas, key=lambda r: r['tasks'])['examples'][0] if areas else ''
    weak_areas = sorted((row for row in areas if row['status'] == 'weak'), key=lambda r: r['gap'])

    def context_for(row):
        if row and row['contexts']:
            return tax.context_by_id.get(next(iter(row['contexts'])))
        return primary

    def work(context, label, verb='Do', tree=''):
        """"Do 10 AMC 12 recursive counting problems", "Put in 20 minutes of
        ARCT shifting". A label that already ends in the unit doesn't say it
        twice ("constructive problems")."""
        count, unit = _amount(context, tree)
        name = ' '.join(part for part in (context['label'] if context else '', lower(label)) if part)
        if unit == 'minutes':
            return 'Put in {} minutes of {}'.format(count, name)
        if name.endswith(unit) or name.endswith(unit.rstrip('s')):
            return '{} {} {}'.format(verb, count, name)
        return '{} {} {} {}'.format(verb, count, name, unit)

    def sample_topic(tree):
        """A real topic to show as an example name."""
        for topic_id in found['syllabus']:
            return lower(tax.label(topic_id))
        for topic in tax.topics.values():
            if topic['tree'] == tree and topic['hand']:
                return lower(topic['label'])
        for topic in tax.topics.values():
            if topic['tree'] == tree:
                return lower(topic['label'])
        return 'the topic'

    moves: List[Dict[str, Any]] = []
    for at, row in enumerate(weak[:2]):
        context = context_for(row)
        practice = warmup if (warmup and context is primary) else context
        title_text = work(practice, row['label'], tree=row['subsubject'])
        # Practiced at a lower level than the goal's contest: finish on the
        # real thing ("..., then 3 AIME ones").
        if primary and practice is not primary and _amount(primary)[1] == 'problems':
            title_text += ', then {} {} ones'.format(min(3, _amount(primary)[0]), primary['label'])
        moves.append({
            'id': 'weak-{}'.format(row['topic']),
            'weight': 'now' if at == 0 else 'next',
            'title': title_text,
            'why': 'Your {} work rates {} out of 5, against {} across {}. It\'s the weakest part of {} you\'ve worked on ({} tasks).'.format(
                lower(row['label']), _figure(row['execution']), _figure(row['base']),
                row['subject_label'], aim, row['tasks']),
            'topic': row['topic'],
            'context': practice['id'] if practice else '',
            'resource': _resource([row['subject']], words(' '.join([
                practice['label'] if practice else '', row['label'], row['subsubject_label']]))),
        })
    if unnamed >= 5:
        area = weak_areas[0] if weak_areas else (max(areas, key=lambda r: r['tasks']) if areas else None)
        label = primary['label'] if primary else (area['subsubject_label'] if area else 'these')
        sample = sample_topic(area['subsubject'] if area else '')
        why = '{:,} tasks toward {} don\'t say what they covered, like "{}".'.format(unnamed, aim, example)
        if weak_areas and not primary:
            why = 'Your {} work rates {} out of 5, against {} across {}, but {:,} of those tasks don\'t say the topic, like "{}".'.format(
                weak_areas[0]['subsubject_label'], _figure(weak_areas[0]['execution']), _figure(weak_areas[0]['base']),
                weak_areas[0]['subject_label'], weak_areas[0]['tasks'], weak_areas[0]['examples'][0])
        moves.append({
            'id': 'name-topics',
            'weight': 'now' if not named else 'next',
            'title': 'Name the topic in your {} tasks'.format(label),
            'why': '{} Call the next one "{}: {}" and Summit can tell which topic is weak.'.format(why, label, sample),
            'topic': '',
            'context': primary['id'] if primary else '',
            'resource': None,
        })
    room = MOVES - (1 if strong else 0)
    for spot in untouched:
        if len(moves) >= room:
            break
        moves.append({
            'id': 'start-{}'.format(spot['topic']),
            'weight': 'next',
            'title': work(primary, spot['label'], verb='Try', tree=tax.topics[spot['topic']]['tree']),
            'why': '{} tests {}, and none of your tasks name it yet, so there\'s no read on it.'.format(
                primary['label'] if primary else aim, lower(spot['label'])),
            'topic': spot['topic'],
            'context': primary['id'] if primary else '',
            'resource': _resource(found['subjects'], words(' '.join([
                primary['label'] if primary else '', spot['label'], spot['subsubject_label']]))),
        })
    if strong and len(moves) < MOVES:
        row = strong[0]
        context = context_for(row)
        moves.append({
            'id': 'keep-{}'.format(row['topic']),
            'weight': 'keep',
            'title': 'Keep {} sharp with one {}set a week'.format(
                lower(row['label']), context['label'] + ' ' if context else ''),
            'why': 'It\'s your strongest part of {} at {} out of 5. A set a week keeps it there while you fix the rest.'.format(
                aim, _figure(row['execution'])),
            'topic': row['topic'],
            'context': context['id'] if context else '',
            'resource': None,
        })

    insights: List[Dict[str, Any]] = []
    if weak:
        row = weak[0]
        insights.append({
            'id': 'topic-weak', 'tone': 'bad',
            'title': 'Weakest topic: {}'.format(row['label']),
            'figure': '{} out of 5 over {} tasks, against {} across {}.'.format(
                _figure(row['execution']), row['tasks'], _figure(row['base']), row['subject_label']),
            'means': 'That\'s where {} gains the most per hour.'.format(aim),
        })
    elif weak_areas:
        row = weak_areas[0]
        insights.append({
            'id': 'topic-weak', 'tone': 'bad',
            'title': 'Weakest area: {}'.format(row['subsubject_label']),
            'figure': '{} out of 5 over {} tasks, against {} across {}.'.format(
                _figure(row['execution']), row['tasks'], _figure(row['base']), row['subject_label']),
            'means': 'Name the topic on those tasks and Summit can say which part of it.',
        })
    if strong:
        row = strong[0]
        insights.append({
            'id': 'topic-strong', 'tone': 'good',
            'title': 'Strongest topic: {}'.format(row['label']),
            'figure': '{} out of 5 over {} tasks.'.format(_figure(row['execution']), row['tasks']),
            'means': 'You can lean on it for {}.'.format(aim),
        })
    if position:
        shown = ', '.join(lower(p['label']) for p in untouched[:4])
        insights.append({
            'id': 'topic-cover', 'tone': 'good' if touched >= len(position) * 0.6 else 'flat' if touched else 'bad',
            'title': 'You\'ve touched {} of {} {} topics'.format(
                touched, len(position), primary['label'] if primary else 'goal'),
            'figure': ('Not yet: {}, and {} more.'.format(shown, len(untouched) - 4) if len(untouched) > 4
                       else 'Not yet: {}.'.format(shown)) if untouched else 'Every topic it tests has work behind it.',
            'means': 'Topics you haven\'t tried are where {} can still surprise you.'.format(aim)
            if untouched else 'Now it\'s about raising the weak ones.',
        })

    return {
        'goal_id': goal_id,
        'title': title,
        'contexts': [tax.context_by_id[cid]['label'] for cid in found['contexts']],
        'position': position,
        'covered': touched,
        'unnamed': unnamed,
        'moves': moves[:MOVES],
        'insights': insights,
    }


# --------------------------------------------------------------------------
# What the page gets
# --------------------------------------------------------------------------
def fingerprint(facts: Dict[str, Any]) -> str:
    """What a stored library was built from, as one short string. `facts`
    comes from connection.topic_facts: counts and latest stamps of the tasks,
    goals and goal matches."""
    blob = json.dumps({'v': version(), **facts}, sort_keys=True, default=str)
    return hashlib.sha1(blob.encode()).hexdigest()[:16]


def payload(rows: Sequence[Dict[str, Any]], goals: Sequence[Dict[str, Any]],
            subject: str = '', stale: bool = False, built: bool = True) -> Dict[str, Any]:
    """The library for one subject (every subject when empty) and a plan for
    each active goal that has any row behind it or names a contest."""
    mine = [row for row in rows if not subject or row['subject'] == subject]
    plans = {}
    for goal in goals:
        made = plan(goal, rows)
        if made['position'] or made['moves'] or made['insights']:
            plans[made['goal_id']] = made
    filed = sum(row['tasks'] for row in mine if row['subsubject'])
    total = sum(row['tasks'] for row in mine)
    return {
        'built': built,
        'stale': stale,
        'subject': subject,
        'rows': list(mine),
        'filed': filed,
        'total': total,
        'goals': plans,
    }
