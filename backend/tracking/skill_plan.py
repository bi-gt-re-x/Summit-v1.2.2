"""A plan for one skill tree: what to practice next, and why, from your answers.

The tree draws what a subject is made of. This says where you are in it, read
from the only real evidence there is (skill_attempts: every problem you marked
and every batch you logged), and turns that into suggestions and one next
session you can book. Everything is worked out from rows that already exist,
so reading a plan never writes.

## The suggestions, strongest first

  review     Problems from this tree that are due again (backend/tracking/review.py).
  step-back  A skill going badly lately (under 60% over 6+ problems in 3 weeks)
             that builds on one you're shaky on, haven't touched in a month, or
             never practiced here. Fix the base first.
  ease-off   The same, when the base looks fine: drop a difficulty for a bit.
  harder     A difficulty you've nailed (85%+ over 5+), with the next one barely
             tried. Time to move up.
  continue   The skill you've been working on, at its next unfinished step.
  ready      A skill you haven't started whose prerequisites you've all got.
  cold       Something you'd got that's gone 3+ weeks without practice.
  start      Nothing practiced in this tree yet: where it begins.

"Got" means Medium cleared (level 3, see backend/tracking/skill_level.py) on
every written step of the skill, or on the skill as a whole when it has no
written steps.

## The session

One review block (up to 10 minutes) when anything's due, one main block from
the strongest suggestion, and a short warm-up of a cold skill if time's left.
The difficulty for a block is the first one not cleared yet, one lower when
that one's going badly.
"""
from datetime import date, datetime, timedelta

from backend.tracking import skill_level

#: Lately, for "going badly" and "barely tried".
RECENT_DAYS = 21
#: Going badly: under this share right, over at least STRUGGLE_MIN problems.
STRUGGLE_RATE = 0.6
STRUGGLE_MIN = 6
#: Shaky: a prerequisite under this share right, over at least SHAKY_MIN.
SHAKY_RATE = 0.7
SHAKY_MIN = 4
#: Nailed: this share right on a difficulty, over at least NAILED_MIN.
NAILED_RATE = 0.85
NAILED_MIN = 5
#: Barely tried: fewer than this many problems on the next difficulty.
TRIED_MIN = 3
#: A prerequisite this long untouched is worth a look before blaming the skill.
STALE_DAYS = 30
#: Something you'd got, this long untouched, is going cold.
COLD_DAYS = 21
#: The level that counts as "got": Medium cleared.
GOT_LEVEL = 3

BUDGETS = (20, 30, 45, 60)
DEFAULT_BUDGET = 30
REVIEW_MOST = 10
WARMUP_MINUTES = 10

TIERS = skill_level.TIERS
WORD = {'warmup': 'Easy', 'core': 'Medium', 'stretch': 'Hard'}
LEVEL_WORD = {0: 'Not started', 1: 'Started', 2: 'Easy', 3: 'Medium', 4: 'Hard', 5: 'Mastered'}

#: Strongest first. The session's main block is the first of these there is.
ORDER = ('step-back', 'ease-off', 'harder', 'continue', 'ready', 'start', 'cold')


def _day(value):
    try:
        return date.fromisoformat(str(value or '')[:10])
    except ValueError:
        return None


def _int(value):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _pct(rate):
    return skill_level.js_round((rate or 0) * 100)


def _recent(rows, today, days=RECENT_DAYS):
    """Answered, right and share over the rows of the last `days` days."""
    since = today - timedelta(days=days - 1)
    rows = [row for row in rows if (_day(row.get('at')) or date.min) >= since]
    attempted = sum(_int(row.get('attempted')) for row in rows)
    correct = sum(_int(row.get('correct')) for row in rows)
    return {'attempted': attempted, 'correct': correct,
            'rate': correct / attempted if attempted else None}


def read_node(node, rows, steps, today, now):
    """Where one skill stands. `rows` are its attempts; `steps` its written steps."""
    ordinals = sorted({step['ordinal'] for step in steps} |
                      {_int(row.get('ordinal')) for row in rows if _int(row.get('ordinal')) > 0})
    step_reads = {}
    for ordinal in ordinals:
        mine = [row for row in rows if _int(row.get('ordinal')) == ordinal]
        step_reads[ordinal] = skill_level.read_level(mine, now=now)
    whole = skill_level.read_level(rows, now=now)
    written = [step['ordinal'] for step in steps]
    if written:
        got = all(step_reads[ordinal]['level'] >= GOT_LEVEL for ordinal in written)
    else:
        got = whole['level'] >= GOT_LEVEL
    days = [_day(row.get('at')) for row in rows if _day(row.get('at'))]
    last = max(days) if days else None
    return {
        'node': node, 'rows': rows, 'steps': steps, 'step_reads': step_reads, 'whole': whole,
        'got': got, 'started': bool(rows), 'last': last,
        'idle': (today - last).days if last else None,
        'recent': _recent(rows, today),
    }


def _tier_rows(rows, tier, today):
    return _recent([row for row in rows if row.get('weight') == tier], today)


def working_tier(read_step, rows, today):
    """The difficulty to practice a step at: the first not cleared yet, one
    lower when that one's going badly lately. (tier, eased)."""
    tiers = read_step['tiers'] if read_step else {}
    tier = next((one for one in TIERS if not (tiers.get(one) or {}).get('cleared')), 'stretch')
    lately = _tier_rows(rows, tier, today)
    if (lately['attempted'] >= SHAKY_MIN and (lately['rate'] or 0) < STRUGGLE_RATE
            and TIERS.index(tier) > 0):
        return TIERS[TIERS.index(tier) - 1], True
    return tier, False


def _step_title(read, ordinal):
    step = next((one for one in read['steps'] if one['ordinal'] == ordinal), None)
    return step['title'] if step else None


def _open_step(read):
    """The first written step not got yet, or None."""
    for step in read['steps']:
        if read['step_reads'].get(step['ordinal'], {}).get('level', 0) < GOT_LEVEL:
            return step
    return None


def _minutes_for(read, ordinal, default=20):
    step = next((one for one in read['steps'] if one['ordinal'] == ordinal), None)
    return max(10, min(30, _int(step.get('minutes')) if step else default))


def _and(names):
    names = list(names)
    if len(names) <= 1:
        return ''.join(names)
    return '{} and {}'.format(', '.join(names[:-1]), names[-1])


def suggestions(nodes, attempts, library, today, now=None, due=()):
    """Every suggestion this tree's evidence supports, strongest first."""
    now = now or datetime.combine(today, datetime.min.time()).replace(hour=12)
    nodes = _resolved(nodes)
    by_node = {}
    for row in attempts:
        by_node.setdefault(str(row.get('node_id')), []).append(row)
    reads = {node['id']: read_node(node, by_node.get(node['id'], []),
                                   [step for step in library.get(node['id'], []) if step.get('ordinal', 0) >= 1],
                                   today, now)
             for node in nodes}
    name = {node['id']: node['name'] for node in nodes}
    out = []

    if due:
        where = sorted({item['where'] for item in due if item.get('where')})
        minutes = min(REVIEW_MOST, sum(item['minutes'] for item in due))
        what = 'problem' if all(item.get('kind', 'problem') == 'problem' for item in due) else 'thing'
        out.append({
            'kind': 'review', 'node_id': due[0].get('node_id'), 'ordinal': None, 'weight': None,
            'title': 'Redo {} {}{} you missed'.format(len(due), what, '' if len(due) == 1 else 's'),
            'because': 'From {}. They come back until you get them right.'.format(_and(where[:3]))
            if where else 'They come back until you get them right.',
            'minutes': max(5, minutes), 'count': len(due)})

    # ---- Going badly: the base, or the difficulty --------------------------
    struggling = sorted(
        (read for read in reads.values()
         if read['recent']['attempted'] >= STRUGGLE_MIN and (read['recent']['rate'] or 0) < STRUGGLE_RATE),
        key=lambda read: read['last'] or date.min, reverse=True)
    for read in struggling:
        node = read['node']
        lately = read['recent']
        weak = _weak_base(node, reads, today)
        said = 'You got {} of {} right on {} lately.'.format(lately['correct'], lately['attempted'], node['name'])
        if weak:
            base, why, how = weak
            base_step = _open_step(base) or (base['steps'][0] if base['steps'] else None)
            ordinal = base_step['ordinal'] if base_step else None
            base_read = base['step_reads'].get(ordinal, base['whole'])
            if how == 'stale':
                # Gone quiet: check what you knew, at the hardest level you'd cleared.
                cleared = [one for one in TIERS if (base_read['tiers'].get(one) or {}).get('cleared')]
                weight = cleared[-1] if cleared else 'warmup'
            elif how == 'shaky':
                weight = working_tier(base_read, base['rows'], today)[0]
            else:
                weight = 'warmup'
            out.append({
                'kind': 'step-back', 'node_id': base['node']['id'], 'from_id': node['id'],
                'ordinal': ordinal,
                'weight': weight,
                'title': 'Step back to {}'.format(base['node']['name']),
                'because': '{} It builds on {}, {} Shore that up first.'.format(said, base['node']['name'], why),
                'minutes': 15})
            continue
        step = _open_step(read) or (read['steps'][0] if read['steps'] else None)
        ordinal = step['ordinal'] if step else None
        lower, eased = working_tier(read['step_reads'].get(ordinal), read['rows'], today)
        if eased:
            out.append({
                'kind': 'ease-off', 'node_id': node['id'], 'ordinal': ordinal, 'weight': lower,
                'title': 'Go back to {} problems on {}'.format(WORD[lower], step['title'] if step else node['name']),
                'because': '{} Its base looks fine, so it\'s the difficulty. A few {} ones, then back up.'.format(
                    said, WORD[lower]),
                'minutes': 15})
        else:
            out.append({
                'kind': 'ease-off', 'node_id': node['id'], 'ordinal': ordinal, 'weight': 'warmup',
                'title': 'Slow down on {}'.format(step['title'] if step else node['name']),
                'because': '{} Reread the step, then do 3 Easy ones with the answer open.'.format(said),
                'minutes': 15})

    struggling_ids = {read['node']['id'] for read in struggling}

    # ---- Nailed it: move up -------------------------------------------------
    for read in sorted(reads.values(), key=lambda read: read['last'] or date.min, reverse=True):
        if read['node']['id'] in struggling_ids or not read['started'] or (read['idle'] or 0) >= RECENT_DAYS:
            continue
        found = _nailed(read, today)
        if found:
            ordinal, tier, nxt, lately = found
            title = _step_title(read, ordinal) or read['node']['name']
            out.append({
                'kind': 'harder', 'node_id': read['node']['id'], 'ordinal': ordinal, 'weight': nxt,
                'title': 'Try {} problems on {}'.format(WORD[nxt], title),
                'because': 'You got {} of {} {} right. Time to move up.'.format(
                    lately['correct'], lately['attempted'], WORD[tier]),
                'minutes': _minutes_for(read, ordinal)})
            break

    # ---- Keep going on what you're working on -------------------------------
    current = sorted((read for read in reads.values() if read['started'] and not read['got']
                      and read['node']['id'] not in struggling_ids),
                     key=lambda read: read['last'] or date.min, reverse=True)
    if current:
        read = current[0]
        step = _open_step(read)
        ordinal = step['ordinal'] if step else None
        tier, _ = working_tier(read['step_reads'].get(ordinal), read['rows'], today)
        level = read['step_reads'].get(ordinal, read['whole'])['level'] if ordinal else read['whole']['level']
        if step:
            place = 'Step {} of {} in {}.'.format(
                [one['ordinal'] for one in read['steps']].index(ordinal) + 1, len(read['steps']), read['node']['name'])
            title = 'Keep going: {}'.format(step['title'])
        else:
            place, title = '', 'Keep going on {}'.format(read['node']['name'])
        cleared = [WORD[one] for one in TIERS if (read['step_reads'].get(ordinal, read['whole'])['tiers']
                                                  .get(one) or {}).get('cleared')]
        out.append({
            'kind': 'continue', 'node_id': read['node']['id'], 'ordinal': ordinal, 'weight': tier,
            'title': title,
            'because': ' '.join(part for part in (
                place,
                "You've cleared {}. {} is next.".format(cleared[-1], WORD[tier]) if cleared
                else 'Start with {} problems.'.format(WORD[tier]) if level <= 1 else '',
            ) if part),
            'minutes': _minutes_for(read, ordinal), 'level': LEVEL_WORD[level]})

    # ---- Ready for something new --------------------------------------------
    ready = []
    for read in reads.values():
        node = read['node']
        needs = [one for one in node.get('requires') or [] if one in reads]
        if read['started'] or not needs or not all(reads[one]['got'] for one in needs):
            continue
        ready.append((read, needs))
    # Core skills first, then the ones that build on most, then by name.
    ready.sort(key=lambda pair: (not pair[0]['node'].get('core'), -len(pair[1]), pair[0]['node']['name']))
    for read, needs in ready[:2]:
        first = read['steps'][0] if read['steps'] else None
        out.append({
            'kind': 'ready', 'node_id': read['node']['id'], 'ordinal': first['ordinal'] if first else None,
            'weight': 'warmup',
            'title': "You're ready for {}".format(read['node']['name']),
            'because': 'It builds on {}, and you\'ve got {}.'.format(
                _and(name[one] for one in needs), 'both' if len(needs) == 2 else 'it' if len(needs) == 1 else 'all of them'),
            'minutes': _minutes_for(read, first['ordinal']) if first else 20})

    # ---- Nothing yet: where it starts ---------------------------------------
    if not any(read['started'] for read in reads.values()):
        roots = sorted((read for read in reads.values() if not (read['node'].get('requires'))),
                       key=lambda read: (not read['node'].get('core'), read['node'].get('tier') != 'foundation',
                                         nodes.index(read['node'])))
        if roots:
            read = roots[0]
            first = read['steps'][0] if read['steps'] else None
            out.append({
                'kind': 'start', 'node_id': read['node']['id'], 'ordinal': first['ordinal'] if first else None,
                'weight': 'warmup',
                'title': 'Start with {}'.format(read['node']['name']),
                'because': "It's where this tree begins. Try 5 Easy problems and see how it goes.",
                'minutes': 15})

    # ---- Going cold -----------------------------------------------------------
    cold = sorted((read for read in reads.values()
                   if read['started'] and (read['got'] or read['whole']['level'] >= 2)
                   and (read['idle'] or 0) >= COLD_DAYS),
                  key=lambda read: -(read['idle'] or 0))
    for read in cold[:2]:
        out.append({
            'kind': 'cold', 'node_id': read['node']['id'], 'ordinal': None, 'weight': 'core',
            'title': 'Warm up {}'.format(read['node']['name']),
            'because': "You haven't practiced it in {} days. {} minutes keeps it.".format(read['idle'], WARMUP_MINUTES),
            'minutes': WARMUP_MINUTES})

    for item in out:
        item.setdefault('from_id', None)
        item['node'] = name.get(item['node_id']) if item.get('node_id') else None
        item['level_word'] = WORD.get(item['weight']) if item.get('weight') else None
    return out, reads


def _resolved(nodes):
    """The nodes with `requires` and `recommends` as node ids.

    The catalogue (data/skill_nodes.json) writes them as names, "Arithmetic",
    because that's what reads well in a brief. Within one tree a name is
    unique, so it maps back; an id is kept as it is.
    """
    by_name = {str(node.get('name') or '').strip().lower(): node['id'] for node in nodes}
    ids = {node['id'] for node in nodes}

    def ids_of(refs):
        out = []
        for ref in refs or []:
            key = ref if ref in ids else by_name.get(str(ref).strip().lower())
            if key and key not in out:
                out.append(key)
        return out

    return [dict(node, requires=ids_of(node.get('requires')), recommends=ids_of(node.get('recommends')))
            for node in nodes]


def _weak_base(node, reads, today):
    """(base, why, how) for the prerequisite most likely behind a skill going
    badly, or None. `how` is 'shaky', 'stale' or 'untested'.

    Shaky beats stale beats never practiced: a base you're getting wrong is a
    surer cause than one you haven't touched.
    """
    needs = [one for one in (node.get('requires') or []) + (node.get('recommends') or []) if one in reads]
    shaky, stale, untested = [], [], []
    for one in needs:
        base = reads[one]
        lately = _recent(base['rows'], today, 60)
        if lately['attempted'] >= SHAKY_MIN and (lately['rate'] or 0) < SHAKY_RATE:
            shaky.append((lately['rate'], base, "where you've got {}% right lately.".format(_pct(lately['rate']))))
        elif base['started'] and (base['idle'] or 0) >= STALE_DAYS:
            stale.append((-(base['idle'] or 0), base, 'which you last practiced {} days ago.'.format(base['idle'])))
        elif not base['started']:
            untested.append((0, base, "which you haven't practiced here yet."))
    for how, group in (('shaky', shaky), ('stale', stale), ('untested', untested)):
        if group:
            _, base, why = sorted(group, key=lambda row: row[0])[0]
            return base, why, how
    return None


def _nailed(read, today):
    """(ordinal, tier, next tier, lately) for a step to move up on, or None."""
    for ordinal in sorted(read['step_reads']):
        mine = [row for row in read['rows'] if _int(row.get('ordinal')) == ordinal]
        for index, tier in enumerate(TIERS[:-1]):
            lately = _tier_rows(mine, tier, today)
            nxt = TIERS[index + 1]
            if (lately['attempted'] >= NAILED_MIN and (lately['rate'] or 0) >= NAILED_RATE
                    and _tier_rows(mine, nxt, today)['attempted'] < TRIED_MIN
                    and sum(_int(row.get('attempted')) for row in mine if row.get('weight') == nxt) < TRIED_MIN):
                return ordinal, tier, nxt, lately
    return None


def session(found, budget=DEFAULT_BUDGET):
    """One next session out of the suggestions, inside `budget` minutes."""
    blocks, left = [], budget
    review = next((item for item in found if item['kind'] == 'review'), None)
    if review:
        take = min(review['minutes'], REVIEW_MOST, max(5, left // 3))
        blocks.append(dict(review, minutes=take))
        left -= take
    main = next((item for kind in ORDER for item in found if item['kind'] == kind), None)
    if main and left >= 5:
        warm = next((item for item in found if item['kind'] == 'cold' and item is not main), None)
        room = left - (WARMUP_MINUTES if warm and left - WARMUP_MINUTES >= 10 else 0)
        # The main block takes the time left: it's the point of the session.
        blocks.append(dict(main, minutes=max(5, room)))
        left -= blocks[-1]['minutes']
        if warm and left >= 5:
            blocks.append(dict(warm, minutes=min(left, WARMUP_MINUTES)))
            left -= blocks[-1]['minutes']
    return {'blocks': blocks, 'minutes': budget - left, 'budget': budget}


def session_title(tree_title, plan):
    """What the booked task is called: the tree and its main block."""
    blocks = plan['blocks']
    main = next((block for block in blocks if block['kind'] != 'review'), None)
    review = next((block for block in blocks if block['kind'] == 'review'), None)
    parts = []
    if review:
        parts.append('redo {} miss{}'.format(review['count'], '' if review['count'] == 1 else 'es'))
    if main:
        what = main['node'] or tree_title
        parts.append('{}{}'.format(what, ' ({})'.format(main['level_word']) if main.get('level_word') else ''))
    return '{}: {}'.format(tree_title, ', then '.join(parts)) if parts else '{}: practice'.format(tree_title)


def session_notes(plan):
    """The task's description: each block, its minutes and why."""
    return '\n'.join('{} min. {}. {}'.format(block['minutes'], block['title'], block['because'])
                     for block in plan['blocks'])
