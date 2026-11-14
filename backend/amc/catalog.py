"""What the site knows about the contests: the topic map, the techniques, the
real past contests, and the mock contests built from the bank.

All of it is content, not account data, so it lives in code beside the bank
and is versioned with it. The account-specific numbers (how many of a topic's
problems you have solved, your best mock score) are joined on in engine.py.
"""
from backend.amc.bank import BY_ID, PROBLEMS

# ---------------------------------------------------------------------------
# Categories and topics
# ---------------------------------------------------------------------------
CATEGORIES = [
    {'id': 'algebra', 'name': 'Algebra', 'color': 'blue',
     'blurb': 'Equations, functions, sequences and polynomials. Dominates the first half of every AMC.'},
    {'id': 'number-theory', 'name': 'Number Theory', 'color': 'amber',
     'blurb': 'Divisibility, primes, remainders and digits. A steady third of the late problems.'},
    {'id': 'counting', 'name': 'Counting & Probability', 'color': 'green',
     'blurb': 'Casework, combinations, probability and expected value. Where careful bookkeeping wins.'},
    {'id': 'geometry', 'name': 'Geometry', 'color': 'rose',
     'blurb': 'Triangles, circles, area and coordinates. The heaviest single category from #15 on.'},
    {'id': 'misc', 'name': 'Logic, Statistics & Misc', 'color': 'slate',
     'blurb': 'Means and medians, logic puzzles, and the odd one out.'},
]

# weight: how much of a typical contest the topic accounts for, 1 (rare) to 3
# (every paper). levels: the contests it appears on.
TOPICS = [
    # -- Algebra -----------------------------------------------------------
    {'id': 'linear-equations', 'category': 'algebra', 'name': 'Linear Equations & Systems', 'weight': 3,
     'levels': ['AMC 10', 'AMC 12'],
     'summary': 'Translating words into equations and solving them cleanly.',
     'ideas': ['Name the unknown you are asked for, not a convenient one.',
               'Add or subtract whole equations before substituting.',
               'Check the answer against the original wording.']},
    {'id': 'word-problems', 'category': 'algebra', 'name': 'Rates, Ratios & Percents', 'weight': 3,
     'levels': ['AMC 10', 'AMC 12'],
     'summary': 'Work, speed, mixtures and percent change.',
     'ideas': ['Rates add; times do not.', 'Successive percent changes multiply.',
               'Work in the unit the problem quotes prices or rates in.']},
    {'id': 'exponents', 'category': 'algebra', 'name': 'Exponents & Radicals', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12'],
     'summary': 'Laws of exponents, simplifying radicals and comparing powers.',
     'ideas': ['Rewrite everything over a common base.', 'Adding n equal terms multiplies by n.',
               'Compare large powers by bringing them to a common exponent.']},
    {'id': 'quadratics', 'category': 'algebra', 'name': 'Quadratics', 'weight': 3,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Roots, discriminants, completing the square and symmetric expressions.',
     'ideas': ['Vieta: sum $-b/a$, product $c/a$.', '$(r-s)^2 = (r+s)^2 - 4rs$.',
               'Express symmetric expressions in $r+s$ and $rs$.']},
    {'id': 'functions', 'category': 'algebra', 'name': 'Functions & Functional Equations', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Composition, inverses, and equations a function must satisfy.',
     'ideas': ['Substitute values that make terms cancel.', 'Swap $x$ for $1/x$ or $-x$ to get a second equation.',
               'Iterate small cases to find a period.']},
    {'id': 'polynomials', 'category': 'algebra', 'name': 'Polynomials', 'weight': 2,
     'levels': ['AMC 12', 'AIME'],
     'summary': "Vieta's formulas, the remainder theorem and integer roots.",
     'ideas': ['$P(a)$ is the remainder on division by $x - a$.',
               '$\\sum r^2 = (\\sum r)^2 - 2\\sum rs$.', 'A monic integer polynomial\'s rational roots are integers.']},
    {'id': 'sequences-series', 'category': 'algebra', 'name': 'Sequences & Series', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Arithmetic and geometric sequences, sums and telescoping.',
     'ideas': ['Arithmetic sum = count x average of ends.', 'Look for telescoping by partial fractions.',
               'Write out the first five terms before guessing a pattern.']},
    {'id': 'inequalities', 'category': 'algebra', 'name': 'Inequalities & Optimization', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Absolute values, AM-GM and finding maxima and minima.',
     'ideas': ['$|u| \\le k$ means $-k \\le u \\le k$.', 'AM-GM: split terms so the product is constant.',
               'Check when equality holds.']},
    {'id': 'logarithms', 'category': 'algebra', 'name': 'Logarithms', 'weight': 2,
     'levels': ['AMC 12', 'AIME'],
     'summary': 'Log rules, change of base and log equations.',
     'ideas': ['$\\log_a b \\cdot \\log_b c = \\log_a c$.', 'Substitute $u = \\log x$ to get a polynomial.',
               '$\\lfloor \\log_2 n \\rfloor$ is the bit length minus one.']},
    {'id': 'complex-numbers', 'category': 'algebra', 'name': 'Complex Numbers', 'weight': 1,
     'levels': ['AMC 12', 'AIME'],
     'summary': 'Polar form, De Moivre, and roots of unity.',
     'ideas': ['$(1 \\pm i)^2 = \\pm 2i$.', 'Multiply moduli, add arguments.',
               'The $n$th roots of unity sum to zero.']},
    # -- Number theory -----------------------------------------------------
    {'id': 'divisibility', 'category': 'number-theory', 'name': 'Divisibility & Primes', 'weight': 3,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Divisibility rules, primes, gcd and lcm.',
     'ideas': ['Count multiples of $k$ up to $n$ with $\\lfloor n/k \\rfloor$.', 'Use lcm, not the product, for overlaps.',
               '$\\gcd(a,b) = \\gcd(a, a+b)$.']},
    {'id': 'factors-divisors', 'category': 'number-theory', 'name': 'Factors & Divisor Counting', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Prime factorization, number of divisors, and factoring equations.',
     'ideas': ['$d(p^a q^b) = (a+1)(b+1)$.', "Simon's Favorite Factoring Trick for $xy + ax + by$.",
               'Distribute each prime\'s exponent separately.']},
    {'id': 'modular-arithmetic', 'category': 'number-theory', 'name': 'Modular Arithmetic', 'weight': 3,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Remainders, cycles of powers, Fermat, Euler and CRT.',
     'ideas': ['Powers cycle; find the period first.', 'Split a modulus into coprime parts and recombine (CRT).',
               'Only residues matter: check $0$ to $m-1$.']},
    {'id': 'digits-bases', 'category': 'number-theory', 'name': 'Digits & Bases', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Digit sums, place value and other bases.',
     'ideas': ['Try small cases of the same shape.', 'Pad with leading zeros to make digits independent.',
               'A number is congruent to its digit sum mod 9.']},
    # -- Counting & probability --------------------------------------------
    {'id': 'basic-counting', 'category': 'counting', 'name': 'Counting Principles', 'weight': 3,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'The multiplication principle and organized lists.',
     'ideas': ['Fill the most restricted position first.', 'Multiply independent choices, add exclusive cases.',
               'Watch for leading zeros.']},
    {'id': 'permutations', 'category': 'counting', 'name': 'Permutations & Arrangements', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Ordered arrangements, repeated letters, and derangements.',
     'ideas': ['Divide by the repeats: $\\frac{n!}{a!\\,b!}$.', 'Glue items that must be together into one block.',
               '$D_n = (n-1)(D_{n-1} + D_{n-2})$.']},
    {'id': 'combinations', 'category': 'counting', 'name': 'Combinations & Stars and Bars', 'weight': 3,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Choosing subsets and distributing identical objects.',
     'ideas': ['$k$ identical items into $n$ boxes: $\\binom{k+n-1}{n-1}$.', 'Hand out the minimums first.',
               'A chosen set has exactly one sorted order.']},
    {'id': 'casework', 'category': 'counting', 'name': 'Casework & Complements', 'weight': 3,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Splitting into clean cases, inclusion-exclusion, and counting the opposite.',
     'ideas': ['"At least one" usually means count the complement.', 'Cases must be disjoint and cover everything.',
               'Inclusion-exclusion: add singles, subtract pairs, add triples.']},
    {'id': 'probability', 'category': 'counting', 'name': 'Probability', 'weight': 3,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Equally likely outcomes, conditional and geometric probability.',
     'ideas': ['Make outcomes equally likely before counting.', 'Geometric probability is area over area.',
               'Reduce $\\frac{m}{n}$ fully before an AIME answer.']},
    {'id': 'expected-value', 'category': 'counting', 'name': 'Expected Value', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Linearity of expectation and state equations.',
     'ideas': ['Linearity works even when events are dependent.', 'One equation per state for "until" problems.',
               'Expected rolls until probability $p$ succeeds: $1/p$.']},
    {'id': 'recursion', 'category': 'counting', 'name': 'Recursion & Patterns', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Building counts from smaller cases; Fibonacci and Catalan.',
     'ideas': ['Split on what happens at the last position.', 'Compute small cases and match a known sequence.',
               'Reflection counts paths that cross a line.']},
    # -- Geometry ------------------------------------------------------------
    {'id': 'triangles', 'category': 'geometry', 'name': 'Triangles', 'weight': 3,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': "Triangle inequality, centers, Heron's formula and the 13-14-15.",
     'ideas': ['Only the longest side can break the triangle inequality.', 'Area $= rs = \\frac{abc}{4R}$.',
               'The 13-14-15 triangle has area 84 and altitude 12.']},
    {'id': 'right-triangles', 'category': 'geometry', 'name': 'Right Triangles & Pythagoras', 'weight': 3,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Pythagorean triples, special triangles and distance.',
     'ideas': ['Know 3-4-5, 5-12-13, 8-15-17, 7-24-25.', 'Inradius of a right triangle: $\\frac{a+b-c}{2}$.',
               'British flag: $PA^2 + PC^2 = PB^2 + PD^2$.']},
    {'id': 'similar-triangles', 'category': 'geometry', 'name': 'Similar Triangles', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Parallel lines, ratios and scaling of area and volume.',
     'ideas': ['Areas scale by the square of the ratio.', 'A line parallel to a side cuts off a similar triangle.',
               'Mark equal angles before writing ratios.']},
    {'id': 'circles', 'category': 'geometry', 'name': 'Circles', 'weight': 3,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Chords, tangents, inscribed angles and power of a point.',
     'ideas': ['A radius to a tangent point is perpendicular to it.', 'Inscribed angle = half the arc.',
               'Power of a point: $PA \\cdot PB$ is constant.']},
    {'id': 'area', 'category': 'geometry', 'name': 'Area & Perimeter', 'weight': 3,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Decomposing regions, shoelace, and subtracting corners.',
     'ideas': ['Area of an inscribed shape = box minus corners.', 'Shoelace for coordinates.',
               'For fixed perimeter, the square has the most area.']},
    {'id': 'polygons', 'category': 'geometry', 'name': 'Polygons', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Regular polygons, angle sums and hexagon decompositions.',
     'ideas': ['Interior angle sum: $180(n-2)$.', 'A regular hexagon is six equilateral triangles.',
               'Diagonals of a regular hexagon: $s\\sqrt3$ and $2s$.']},
    {'id': 'coordinate-geometry', 'category': 'geometry', 'name': 'Coordinate Geometry', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Lines, distances and areas on the coordinate plane.',
     'ideas': ['Put the most symmetric point at the origin.', 'Shoelace: $\\frac12|\\sum x_i y_{i+1} - x_{i+1} y_i|$.',
               'Perpendicular slopes multiply to $-1$.']},
    {'id': 'solid-geometry', 'category': 'geometry', 'name': '3D Geometry', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Cubes, prisms, pyramids, spheres and space diagonals.',
     'ideas': ['Put a cube on coordinates.', 'Space diagonal of an $a \\times b \\times c$ box: $\\sqrt{a^2+b^2+c^2}$.',
               'Unfold a surface to find shortest paths.']},
    {'id': 'trigonometry', 'category': 'geometry', 'name': 'Trigonometry', 'weight': 2,
     'levels': ['AMC 12', 'AIME'],
     'summary': 'Identities, laws of sines and cosines, and trig sums.',
     'ideas': ['$(\\sin\\theta + \\cos\\theta)^2 = 1 + \\sin 2\\theta$.', 'Pair complementary angles.',
               'Law of cosines when you know two sides and the angle between them.']},
    # -- Misc ----------------------------------------------------------------
    {'id': 'statistics', 'category': 'misc', 'name': 'Mean, Median & Mode', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12'],
     'summary': 'Averages, medians and how they move when data changes.',
     'ideas': ['Convert every mean to a sum first.', 'The median of an even count is the mean of the middle two.',
               'Adding a value moves the mean by (value - mean) / new count.']},
    {'id': 'logic', 'category': 'misc', 'name': 'Logic & Puzzles', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12'],
     'summary': 'Knights and knaves, ordering puzzles and invariants.',
     'ideas': ['Assume one case and chase it to a contradiction.', 'Tabulate who-said-what before reasoning.',
               'Look for something that never changes (an invariant).']},
]
TOPIC_BY_ID = {t['id']: t for t in TOPICS}
CATEGORY_BY_ID = {c['id']: c for c in CATEGORIES}

# ---------------------------------------------------------------------------
# Techniques
# ---------------------------------------------------------------------------
_TECHNIQUE_NAMES = {
    'am-gm': 'AM-GM', 'vieta': "Vieta's formulas", 'euler-phi': "Euler's totient",
    'legendre': "Legendre's formula", 'chinese-remainder': 'Chinese remainder theorem',
    'british-flag': 'British flag theorem', 'shoelace': 'Shoelace formula',
    'factoring-trick': "Simon's factoring trick", 'linearity-of-expectation': 'Linearity of expectation',
}


def technique_name(tech_id):
    if tech_id == 'official':
        return 'Official problem'
    return _TECHNIQUE_NAMES.get(tech_id) or tech_id.replace('-', ' ').capitalize()


TECHNIQUES = sorted({p['technique'] for p in PROBLEMS})

# ---------------------------------------------------------------------------
# Contests
# ---------------------------------------------------------------------------
FORMATS = {
    'AMC 10': {'count': 25, 'minutes': 75, 'max': 150, 'scoring': '6 per correct, 1.5 per blank, 0 per wrong'},
    'AMC 12': {'count': 25, 'minutes': 75, 'max': 150, 'scoring': '6 per correct, 1.5 per blank, 0 per wrong'},
    'AIME': {'count': 15, 'minutes': 180, 'max': 15, 'scoring': '1 per correct; answers are integers 000-999'},
}

AOPS = 'https://artofproblemsolving.com/wiki/index.php/'

# The three mocks the app can grade, built from the bank. The AMC 12 one shares
# its easier half with the AMC 10 the way the real A and B papers do.
def _by_rating(ids):
    """Easiest first, as on a real paper; ties keep the order given."""
    from backend.amc.solutions import RATINGS
    return sorted(ids, key=lambda pid: (RATINGS[pid], ids.index(pid)))


# The three mocks the app can grade. Every bank problem belongs to exactly one
# of them, and each runs from easy to its contest's hardest band on the AoPS
# scale (backend/amc/solutions.py).
MOCKS = [
    {'id': 'step-mock-10', 'name': 'Step Mock AMC 10', 'level': 'AMC 10',
     'blurb': 'A full 25-problem AMC 10, from warm-up arithmetic to counting and probability problems rated 3-3.5.',
     'problems': _by_rating([
         'step-10-01', 'step-10-03', 'step-10-04', 'step-10-05', 'step-10-08', 'step-10-18',
         'step-10-06', 'step-10-09', 'step-10-10', 'step-10-11', 'step-10-12', 'step-10-13', 'step-10-15',
         'step-10-17', 'step-drill-04', 'step-drill-08',
         'step-10-19', 'step-10-21', 'step-10-25', 'step-drill-05',
         'step-10-23', 'step-10-24',
         'step-10-26', 'step-10-28', 'step-10-27',
     ])},
    {'id': 'step-mock-12', 'name': 'Step Mock AMC 12', 'level': 'AMC 12',
     'blurb': 'Logs, trig, complex numbers and sequences, finishing with problems rated 3.5-4.',
     'problems': _by_rating([
         'step-12-01', 'step-12-02', 'step-12-03', 'step-12-05', 'step-12-17', 'step-12-18',
         'step-10-16', 'step-10-20', 'step-10-22',
         'step-12-04', 'step-12-06', 'step-12-07', 'step-12-12', 'step-drill-01', 'step-drill-02',
         'step-12-08', 'step-12-09', 'step-12-10', 'step-drill-03',
         'step-12-11', 'step-drill-06', 'step-12-15',
         'step-12-13', 'step-12-16', 'step-12-14',
     ])},
    {'id': 'step-mock-aime', 'name': 'Step Mock AIME', 'level': 'AIME',
     'blurb': 'Fifteen integer-answer problems over three hours, up to a 4.5 on the AoPS scale. Every answer is 000-999.',
     'problems': _by_rating([
         'step-aime-05', 'step-aime-06', 'step-aime-10', 'step-aime-01', 'step-aime-04', 'step-aime-08',
         'step-aime-09', 'step-aime-11', 'step-aime-12', 'step-aime-13', 'step-aime-14', 'step-aime-15',
         'step-aime-16', 'step-aime-18', 'step-aime-17',
     ])},
]
MOCK_BY_ID = {m['id']: m for m in MOCKS}


def _past_contests():
    """Every AMC 10, AMC 12 and AIME since 2000, linked to the official problems.

    The AMC 10 began in 2000, and the A/B split in 2002. 2021 ran twice: a
    spring sitting (named plainly) and a fall one (named "Fall").
    """
    rows = []

    def add(year, level, paper, slug, season=''):
        name = ' '.join(x for x in (str(year), season, level + paper) if x)
        cid = slug.lower().replace('_', '-')
        rows.append({
            'id': cid, 'name': name, 'year': year, 'level': level, 'paper': paper.strip(),
            'season': season, 'problems_url': AOPS + slug + '_Problems',
            'answers_url': AOPS + slug + '_Answer_Key', **FORMATS[level],
        })

    for year in range(2025, 1999, -1):
        for level in ('AMC 10', 'AMC 12'):
            short = level.replace(' ', '_')
            if year < 2002:
                add(year, level, '', '{}_{}'.format(year, short))
            elif year == 2021:
                for paper in ('A', 'B'):
                    add(year, level, paper, '2021_Fall_{}{}'.format(short, paper), season='Fall')
                for paper in ('A', 'B'):
                    add(year, level, paper, '2021_{}{}'.format(short, paper), season='Spring')
            else:
                for paper in ('A', 'B'):
                    add(year, level, paper, '{}_{}{}'.format(year, short, paper))
        for paper in ('I', 'II'):
            add(year, 'AIME', ' ' + paper, '{}_AIME_{}'.format(year, paper))
    return rows


PAST = _past_contests()
PAST_BY_ID = {c['id']: c for c in PAST}


def contest(contest_id):
    """A mock or a past contest by id, or None."""
    if contest_id in MOCK_BY_ID:
        return {'kind': 'mock', **MOCK_BY_ID[contest_id], **FORMATS[MOCK_BY_ID[contest_id]['level']]}
    if contest_id in PAST_BY_ID:
        return {'kind': 'past', **PAST_BY_ID[contest_id]}
    return None


def sources(problem_id):
    """Where a problem appears: [{'contest': ..., 'name': ..., 'number': n}]."""
    head, _, tail = problem_id.rpartition('-')
    if head in PAST_BY_ID and tail.isdigit():
        return [{'contest': head, 'name': PAST_BY_ID[head]['name'], 'number': int(tail)}]
    found = []
    for mock in MOCKS:
        if problem_id in mock['problems']:
            found.append({'contest': mock['id'], 'name': mock['name'],
                          'number': mock['problems'].index(problem_id) + 1})
    return found


def _check():
    """Every mock names real problems, every problem is in exactly one mock,
    and every problem names real topics."""
    placed = [pid for mock in MOCKS for pid in mock['problems']]
    assert len(placed) == len(set(placed)), 'a problem is in two mocks'
    assert set(placed) == set(BY_ID), 'problems in no mock: {}'.format(sorted(set(BY_ID) - set(placed)))
    for mock in MOCKS:
        assert len(mock['problems']) == FORMATS[mock['level']]['count'], mock['id']
        for pid in mock['problems']:
            assert pid in BY_ID, pid
    for p in PROBLEMS:
        assert p['topic'] in TOPIC_BY_ID, (p['id'], p['topic'])
        for t in p['also']:
            assert t in TOPIC_BY_ID, (p['id'], t)


_check()


# ---------------------------------------------------------------------------
# Strategies: the techniques, grouped the way a contest solver thinks of them
# ---------------------------------------------------------------------------
#: Families in display order, each a list of (technique id, one-line idea).
#: Every technique in the bank belongs to exactly one family (checked below).
STRATEGY_FAMILIES = [
    {'id': 'counting', 'name': 'Counting strategies', 'color': 'green',
     'blurb': 'Ways to count without listing everything.',
     'techniques': [
         ('multiplication-principle', 'Multiply independent choices; fill the most restricted slot first.'),
         ('casework', 'Split into disjoint cases that cover everything, then add.'),
         ('complementary-counting', 'Count what you don’t want and subtract from the total.'),
         ('inclusion-exclusion', 'Add the sets, subtract the overlaps, add back the triple overlaps.'),
         ('stars-and-bars', 'Identical items into boxes: choose where the dividers go.'),
         ('bijection', 'Match each object to something easier to count.'),
         ('recursion', 'Build the count for n from smaller cases.'),
         ('reflection', 'Count bad lattice paths by reflecting them across a line.'),
         ('states', 'One equation per state for "until" processes.'),
         ('linearity-of-expectation', 'Expected values add, even for dependent events.'),
         ('geometric-probability', 'Probability as favourable area over total area.'),
     ]},
    {'id': 'algebraic', 'name': 'Algebraic strategies', 'color': 'blue',
     'blurb': 'Moves that make an expression or equation give itself up.',
     'techniques': [
         ('set-up-equations', 'Name the unknown, translate the words, solve.'),
         ('substitution', 'Swap in a new variable or a cleverly chosen value.'),
         ('reciprocal-substitution', 'Flip x/(1+x)-style recursions into something linear.'),
         ('vieta', 'Read sums and products of roots off the coefficients.'),
         ('symmetric-sums', 'Rewrite symmetric expressions in terms of x+y and xy.'),
         ('factoring-trick', 'Add a constant so xy + ax + by factors (Simon’s trick).'),
         ('squaring', 'Square both sides to expose a cross term.'),
         ('telescoping', 'Write terms as differences so the middle cancels.'),
         ('am-gm', 'Split terms so their product is constant, then apply AM-GM.'),
         ('repeated-squaring', 'Reach a high power through a few squarings.'),
         ('roots-of-unity', 'Use the n-th roots of unity to filter or simplify.'),
     ]},
    {'id': 'number', 'name': 'Number theory strategies', 'color': 'amber',
     'blurb': 'Tools for remainders, divisors and digits.',
     'techniques': [
         ('prime-factorization', 'Factor into primes; count divisors exponent by exponent.'),
         ('residues', 'Only residues matter: check 0 to m-1.'),
         ('cycles', 'Powers repeat mod m; find the period, reduce the exponent.'),
         ('orders', 'The order of a mod n divides φ(n); test its divisors.'),
         ('chinese-remainder', 'Split a modulus into coprime parts and recombine.'),
         ('euler-phi', 'Count numbers coprime to n with Euler’s totient.'),
         ('legendre', 'Count a prime’s power in n! with Legendre’s formula.'),
     ]},
    {'id': 'geometric', 'name': 'Geometric strategies', 'color': 'rose',
     'blurb': 'Ways to see a figure so the answer is visible.',
     'techniques': [
         ('similarity-ratios', 'Find similar triangles; lengths scale by k, areas by k².'),
         ('coordinates', 'Put the figure on axes and compute.'),
         ('shoelace', 'Area of a polygon straight from its vertex coordinates.'),
         ('decomposition', 'Cut the region into pieces you know, or subtract corners.'),
         ('british-flag', 'For P in a rectangle, PA² + PC² = PB² + PD².'),
     ]},
    {'id': 'general', 'name': 'General problem solving', 'color': 'slate',
     'blurb': 'Habits that crack problems in every topic.',
     'techniques': [
         ('small-cases', 'Try n = 1, 2, 3 and read off the pattern.'),
         ('graphing', 'Sketch both sides and count where they cross.'),
         ('bounding', 'Trap the answer between two estimates you can compute.'),
         ('pairing', 'Pair terms that combine nicely (k with n-k, sin with cos).'),
         ('rates', 'Rates add; times do not.'),
         ('known-formula', 'Recognise the standard formula the problem is built on.'),
         ('direct-computation', 'Sometimes the fastest path is to just compute carefully.'),
     ]},
]
TECHNIQUE_FAMILY = {tid: f['id'] for f in STRATEGY_FAMILIES for tid, _ in f['techniques']}
TECHNIQUE_IDEA = {tid: idea for f in STRATEGY_FAMILIES for tid, idea in f['techniques']}


def short_label(problem_id):
    """A pill's label: 'S10·7', 'S12·3', 'AIME·4', 'Drill·2', or "'23 10A·5"."""
    head, _, tail = problem_id.rpartition('-')
    if head in PAST_BY_ID and tail.isdigit():
        c = PAST_BY_ID[head]
        paper = c['level'].replace('AMC ', '') + c['paper'] if c['level'] != 'AIME' else 'AIME ' + c['paper']
        year = str(c['year'])[2:] + (c['season'][:1] if c['season'] else '')
        return "'{} {}·{}".format(year, paper, int(tail))
    found = sources(problem_id)
    if found:
        abbr = {'step-mock-10': 'S10', 'step-mock-12': 'S12', 'step-mock-aime': 'AIME'}[found[0]['contest']]
        return '{}·{}'.format(abbr, found[0]['number'])
    return problem_id


def _check_strategies():
    missing = [t for t in TECHNIQUES if t not in TECHNIQUE_FAMILY]
    assert not missing, 'techniques with no strategy family: {}'.format(missing)


_check_strategies()
