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
     'blurb': 'Equations, functions, sequences and polynomials.'},
    {'id': 'number-theory', 'name': 'Number Theory', 'color': 'amber',
     'blurb': 'Divisibility, primes, remainders and digits.'},
    {'id': 'counting', 'name': 'Counting & Probability', 'color': 'green',
     'blurb': 'Casework, combinations, probability and expected value.'},
    {'id': 'geometry', 'name': 'Geometry', 'color': 'rose',
     'blurb': 'Triangles, circles, area and coordinates.'},
    {'id': 'misc', 'name': 'Logic, Statistics & Misc', 'color': 'slate',
     'blurb': 'Means, medians, logic puzzles and everything else.'},
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
    {'id': 'arithmetic', 'category': 'algebra', 'name': 'Arithmetic & Fractions', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12'],
     'summary': 'Order of operations, fractions, and computing cleanly by hand.',
     'ideas': ['Factor before you multiply out.',
               'Turn mixed numbers and decimals into fractions.',
               'Estimate first so a slip stands out.']},
    {'id': 'absolute-value', 'category': 'algebra', 'name': 'Absolute Value', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Equations and graphs with $|x|$ and distance on the number line.',
     'ideas': ['$|x - a|$ is the distance from $x$ to $a$.',
               'Split at each point where an expression inside changes sign.',
               'The graph of $|x| + |y| = k$ is a square.']},
    {'id': 'floor-ceiling', 'category': 'algebra', 'name': 'Floor & Ceiling', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Greatest-integer functions and fractional parts.',
     'ideas': ['Write $x = n + f$ with $n$ an integer and $0 \\le f < 1$.',
               '$\\lfloor x \\rfloor$ is constant between integers, so count by ranges.',
               'Hermite: $\\lfloor x \\rfloor + \\lfloor x + \\tfrac12 \\rfloor = \\lfloor 2x \\rfloor$.']},
    {'id': 'nonlinear-systems', 'category': 'algebra', 'name': 'Nonlinear Systems', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Systems with products, squares and symmetric equations.',
     'ideas': ['Add, subtract or multiply the equations to expose $x + y$ and $xy$.',
               'Divide one equation by another to cancel a common factor.',
               'Look for a substitution that makes the system symmetric.']},
    {'id': 'graphs-transformations', 'category': 'algebra', 'name': 'Graphs & Transformations', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Shifting, stretching and reflecting graphs, and counting intersections.',
     'ideas': ['$f(x - h) + k$ moves the graph right $h$ and up $k$.',
               'Count solutions by counting where two graphs cross.',
               'Even functions are symmetric about the $y$-axis, odd ones about the origin.']},
    {'id': 'binomial-theorem', 'category': 'algebra', 'name': 'Binomial Theorem', 'weight': 1,
     'levels': ['AMC 12', 'AIME'],
     'summary': 'Expanding $(a + b)^n$ and reading off coefficients.',
     'ideas': ['The $x^k$ coefficient of $(1 + x)^n$ is $\\binom{n}{k}$.',
               'Set $x = 1$ for the sum of coefficients, $x = -1$ for the alternating sum.',
               'Multinomial: $\\frac{n!}{a!\\,b!\\,c!}$ for $x^a y^b z^c$.']},
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
    {'id': 'gcd-lcm', 'category': 'number-theory', 'name': 'GCD & LCM', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Greatest common divisors, least common multiples and the Euclidean algorithm.',
     'ideas': ['$\\gcd(a,b) \\cdot \\operatorname{lcm}(a,b) = ab$.',
               'Euclid: $\\gcd(a, b) = \\gcd(b, a \\bmod b)$.',
               'Write $a = dx$, $b = dy$ with $\\gcd(x, y) = 1$.']},
    {'id': 'diophantine', 'category': 'number-theory', 'name': 'Diophantine Equations', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Integer solutions of equations: linear, factoring and bounding.',
     'ideas': ['Factor so one side is a product equal to a constant.',
               '$ax + by = c$ has solutions only if $\\gcd(a, b) \\mid c$.',
               'Bound one variable first, then check the few cases left.']},
    {'id': 'factorials', 'category': 'number-theory', 'name': 'Factorials & Trailing Zeros', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Prime powers in $n!$, trailing zeros, and factorial sums.',
     'ideas': ['Legendre: the power of $p$ in $n!$ is $\\sum \\lfloor n/p^k \\rfloor$.',
               'Trailing zeros count the factors of $5$.',
               'From $5!$ on, $n!$ ends in $0$, so only small terms matter for last digits.']},
    {'id': 'perfect-powers', 'category': 'number-theory', 'name': 'Perfect Squares & Cubes', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Recognising squares and cubes, and what they can be mod small numbers.',
     'ideas': ['A square has every prime exponent even.',
               'Squares are $0$ or $1$ mod $4$, and $0, 1, 4$ mod $8$ (odd ones are $1$).',
               'Sandwich: if $n^2 < x < (n+1)^2$, $x$ is not a square.']},
    {'id': 'decimals-fractions', 'category': 'number-theory', 'name': 'Repeating Decimals & Fractions', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12'],
     'summary': 'Converting repeating decimals and working with fractions in lowest terms.',
     'ideas': ['$0.\\overline{ab} = \\frac{ab}{99}$.',
               'A fraction in lowest terms terminates iff its denominator is $2^a 5^b$.',
               'The period of $1/p$ is the order of $10$ mod $p$.']},
    {'id': 'parity', 'category': 'number-theory', 'name': 'Parity', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Odd and even arguments that rule cases out quickly.',
     'ideas': ['Odd + odd is even; an odd number of odd terms makes an odd sum.',
               'A product is odd only if every factor is odd.',
               'Parity is the simplest invariant: check it first.']},
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
    {'id': 'binomial-coefficients', 'category': 'counting', 'name': "Pascal's Triangle & Identities", 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Binomial coefficients and the identities between them.',
     'ideas': ['$\\binom{n}{k} = \\binom{n-1}{k-1} + \\binom{n-1}{k}$.',
               'Hockey stick: $\\sum_{i=k}^{n} \\binom{i}{k} = \\binom{n+1}{k+1}$.',
               'Row $n$ sums to $2^n$.']},
    {'id': 'lattice-paths', 'category': 'counting', 'name': 'Grid & Lattice Paths', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Counting paths and rectangles on grids.',
     'ideas': ['A path of $a$ rights and $b$ ups is a choice of $\\binom{a+b}{a}$ positions.',
               'Fill a grid with path counts: each cell is the sum of the two before it.',
               'Rectangles in a grid: choose two vertical and two horizontal lines.']},
    {'id': 'pigeonhole', 'category': 'counting', 'name': 'Pigeonhole Principle', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Guaranteeing that two things share a box.',
     'ideas': ['$n + 1$ objects in $n$ boxes put two in one box.',
               'Pick the boxes cleverly: residues, pairs that sum to a target, parity.',
               '"At least how many to guarantee" is a worst case plus one.']},
    {'id': 'conditional-probability', 'category': 'counting', 'name': 'Conditional Probability', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': "Probability given information, and Bayes' rule.",
     'ideas': ['$P(A \\mid B) = P(A \\cap B) / P(B)$.',
               'Shrink the sample space to what you know happened.',
               'A tree diagram keeps the branches straight.']},
    {'id': 'geometric-probability', 'category': 'counting', 'name': 'Geometric Probability', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Probability as length, area or volume.',
     'ideas': ['Favourable region over total region.',
               'Two random numbers in $[0,1]$ are a point in the unit square.',
               'Draw the boundary lines before computing areas.']},
    {'id': 'graph-theory', 'category': 'counting', 'name': 'Graphs, Networks & Tournaments', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Vertices and edges: handshakes, paths, colourings and round-robins.',
     'ideas': ['Handshake lemma: degrees add to twice the number of edges.',
               'A round-robin of $n$ teams has $\\binom{n}{2}$ games.',
               'Colour adjacent regions to find the constraint.']},
    {'id': 'symmetry-counting', 'category': 'counting', 'name': 'Symmetry & Colourings', 'weight': 1,
     'levels': ['AMC 12', 'AIME'],
     'summary': 'Counting arrangements up to rotation or reflection.',
     'ideas': ['Fix one object to remove rotational symmetry: $(n-1)!$ around a circle.',
               'Burnside: average the colourings each symmetry fixes.',
               'Count all, then divide only when every arrangement has the same number of copies.']},
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
    {'id': 'angle-chasing', 'category': 'geometry', 'name': 'Angles & Parallel Lines', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12'],
     'summary': 'Angle sums, parallel lines and isosceles triangles.',
     'ideas': ['Angles in a triangle sum to $180^\\circ$; exterior angle = sum of remote interior.',
               'Parallel lines give equal alternate and corresponding angles.',
               'Equal sides face equal angles.']},
    {'id': 'quadrilaterals', 'category': 'geometry', 'name': 'Quadrilaterals', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Rectangles, parallelograms, trapezoids, rhombi and kites.',
     'ideas': ['Diagonals of a parallelogram bisect each other.',
               'Trapezoid area: average of the bases times the height.',
               'A rhombus or kite has area $\\frac{d_1 d_2}{2}$.']},
    {'id': 'triangle-centers', 'category': 'geometry', 'name': 'Triangle Centers & Cevians', 'weight': 2,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Medians, angle bisectors, altitudes and the four centers.',
     'ideas': ['Angle bisector theorem: it splits the opposite side in the ratio of the other two sides.',
               "Stewart's theorem gives the length of any cevian.",
               'The centroid splits each median $2:1$.']},
    {'id': 'area-ratios', 'category': 'geometry', 'name': 'Area Ratios & Mass Points', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Comparing areas through shared heights and bases.',
     'ideas': ['Triangles with the same height have areas in the ratio of their bases.',
               'Mass points turn cevian ratios into weights.',
               'Area of $\\triangle$ with sides $a, b$ and angle $C$: $\\frac12 ab\\sin C$.']},
    {'id': 'cyclic-quadrilaterals', 'category': 'geometry', 'name': 'Cyclic Quadrilaterals & Ptolemy', 'weight': 1,
     'levels': ['AMC 12', 'AIME'],
     'summary': 'Quadrilaterals in a circle: opposite angles, Ptolemy and Brahmagupta.',
     'ideas': ['Opposite angles of a cyclic quadrilateral sum to $180^\\circ$.',
               'Ptolemy: $AC \\cdot BD = AB \\cdot CD + AD \\cdot BC$.',
               'Brahmagupta: area $= \\sqrt{(s-a)(s-b)(s-c)(s-d)}$.']},
    {'id': 'conics', 'category': 'geometry', 'name': 'Conics', 'weight': 1,
     'levels': ['AMC 12', 'AIME'],
     'summary': 'Parabolas, ellipses and hyperbolas from their equations.',
     'ideas': ['Complete the square to find the center.',
               'Ellipse: $c^2 = a^2 - b^2$; hyperbola: $c^2 = a^2 + b^2$.',
               'A parabola is the set of points equidistant from focus and directrix.']},
    {'id': 'transformations', 'category': 'geometry', 'name': 'Rotations, Reflections & Symmetry', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Moving figures: reflections for shortest paths, rotations for equal lengths.',
     'ideas': ['Reflect across a line to turn a broken path into a straight one.',
               'A $60^\\circ$ rotation turns two equal segments into an equilateral triangle.',
               'Rotating $(x, y)$ by $90^\\circ$ gives $(-y, x)$.']},
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
    {'id': 'clocks-calendars', 'category': 'misc', 'name': 'Clocks, Calendars & Time', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12'],
     'summary': 'Clock hands, days of the week and elapsed time.',
     'ideas': ['The minute hand gains $5.5^\\circ$ a minute on the hour hand.',
               'Days of the week work mod $7$; a common year shifts the weekday by $1$.',
               'Convert everything to one unit before subtracting.']},
    {'id': 'games-strategy', 'category': 'misc', 'name': 'Games & Strategy', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Two-player games, winning positions and optimal play.',
     'ideas': ['Work backwards from the end: a position is winning if some move reaches a losing one.',
               'Look for a symmetric or pairing strategy.',
               'Small boards first; the pattern of losing positions is usually periodic.']},
    {'id': 'invariants', 'category': 'misc', 'name': 'Invariants & Processes', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Repeated operations, and the quantity that never changes.',
     'ideas': ['Find something the move preserves: a sum, a parity, a product.',
               'A quantity that always decreases forces the process to stop.',
               'Colour the board to show a tiling is impossible.']},
    {'id': 'data-graphs', 'category': 'misc', 'name': 'Tables, Charts & Data', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12'],
     'summary': 'Reading tables, bar graphs and Venn diagrams carefully.',
     'ideas': ['Read the axis labels and units before the numbers.',
               'A Venn diagram turns "both" and "neither" into regions.',
               'Totals across a table must agree; use them to fill gaps.']},
    {'id': 'estimation', 'category': 'misc', 'name': 'Estimation & Bounding', 'weight': 1,
     'levels': ['AMC 10', 'AMC 12', 'AIME'],
     'summary': 'Sizing an answer when exact computation is too slow.',
     'ideas': ['Round to friendly numbers and track whether you went up or down.',
               'Trap the answer between two bounds that are easy to compute.',
               'Use the answer choices: they are often far enough apart.']},
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
    'hockey-stick': 'Hockey stick identity', 'burnside': "Burnside's lemma", 'cauchy-schwarz': 'Cauchy-Schwarz',
    'newton-sums': "Newton's sums", 'fermat-little': "Fermat's little theorem", 'wilson': "Wilson's theorem",
    'lifting-the-exponent': 'Lifting the exponent', 'law-of-cosines': 'Law of cosines', 'law-of-sines': 'Law of sines',
    'stewart': "Stewart's theorem", 'heron': "Heron's formula", 'ptolemy': "Ptolemy's theorem",
    'picks-theorem': "Pick's theorem", 'wlog': 'Without loss of generality', 'pythagorean-theorem': 'Pythagorean theorem',
    'sum-of-divisors': 'Sum of divisors', 'euclidean-algorithm': 'Euclidean algorithm',
    'reflect-figure': 'Reflect the figure', 'rotate-figure': 'Rotate the figure', 'trig-area': 'Area from ½ab sin C',
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
     'blurb': '25 problems in 75 minutes, rated 1 to 3.5.',
     'problems': _by_rating([
         'step-10-01', 'step-10-03', 'step-10-04', 'step-10-05', 'step-10-08', 'step-10-18',
         'step-10-06', 'step-10-09', 'step-10-10', 'step-10-11', 'step-10-12', 'step-10-13', 'step-10-15',
         'step-10-17', 'step-drill-04', 'step-drill-08',
         'step-10-19', 'step-10-21', 'step-10-25', 'step-drill-05',
         'step-10-23', 'step-10-24',
         'step-10-26', 'step-10-28', 'step-10-27',
     ])},
    {'id': 'step-mock-12', 'name': 'Step Mock AMC 12', 'level': 'AMC 12',
     'blurb': '25 problems in 75 minutes, rated 1.5 to 4.',
     'problems': _by_rating([
         'step-12-01', 'step-12-02', 'step-12-03', 'step-12-05', 'step-12-17', 'step-12-18',
         'step-10-16', 'step-10-20', 'step-10-22',
         'step-12-04', 'step-12-06', 'step-12-07', 'step-12-12', 'step-drill-01', 'step-drill-02',
         'step-12-08', 'step-12-09', 'step-12-10', 'step-drill-03',
         'step-12-11', 'step-drill-06', 'step-12-15',
         'step-12-13', 'step-12-16', 'step-12-14',
     ])},
    {'id': 'step-mock-aime', 'name': 'Step Mock AIME', 'level': 'AIME',
     'blurb': '15 problems in 3 hours, rated 1.5 to 4.5. Answers are 0 to 999.',
     'problems': _by_rating([
         'step-aime-05', 'step-aime-06', 'step-aime-10', 'step-aime-01', 'step-aime-04', 'step-aime-08',
         'step-aime-09', 'step-aime-11', 'step-aime-12', 'step-aime-13', 'step-aime-14', 'step-aime-15',
         'step-aime-16', 'step-aime-18', 'step-aime-17',
     ])},
]
for _m in MOCKS:
    _m.update(family='step', set=None)

# Fifteen Summit Mock sets in real problem order (backend/amc/sets/).
from backend.amc.sets import MOCKS as _SET_MOCKS  # noqa: E402

for _m in _SET_MOCKS:
    _m['blurb'] = {
        'AMC 10': '25 problems in 75 minutes, real AMC 10 difficulty from #1 to #25 (rated 1 to 4).',
        'AMC 12': '25 problems in 75 minutes, real AMC 12 difficulty (rated 1 to 4.5). Shares 8 problems with AMC 10 Set {}.'.format(_m['set']),
        'AIME': '15 problems in 3 hours, real AIME difficulty (rated 2.5 to 6.5). Answers are 0 to 999.',
    }[_m['level']]
MOCKS = MOCKS + _SET_MOCKS
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

    for year in range(2026, 1999, -1):
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
    # A problem is in one mock, except that an AMC 12 set shares eight
    # problems with the AMC 10 set of the same number, as real papers do.
    shared = {pid for m in MOCKS if m['family'] == 'summit' and m['level'] == 'AMC 12'
              for pid in m['problems'] if pid.startswith('mock10-')}
    assert len(placed) - len(shared) == len(set(placed)), 'a problem is in two mocks'
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
         ('conditional-probability', 'Shrink the sample space to what you already know happened.'),
         ('pigeonhole', 'More objects than boxes forces two into one box.'),
         ('hockey-stick', 'Sum a diagonal of Pascal’s triangle in one binomial coefficient.'),
         ('symmetry', 'Use symmetry to cut the count, or to pair outcomes with equal probability.'),
         ('burnside', 'Count arrangements up to rotation by averaging the fixed colourings.'),
         ('generating-functions', 'Encode choices as polynomial factors and read off a coefficient.'),
         ('overcounting', 'Count with order, then divide by how many times each object was counted.'),
     ]},
    {'id': 'algebraic', 'name': 'Algebraic strategies', 'color': 'blue',
     'blurb': 'Ways to simplify expressions and solve equations.',
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
         ('completing-the-square', 'Rewrite a quadratic as a square plus a constant.'),
         ('difference-of-squares', 'Factor a² − b² = (a − b)(a + b), and spot it in disguise.'),
         ('cauchy-schwarz', 'Bound a sum of products by the product of sums of squares.'),
         ('binomial-theorem', 'Expand (a + b)ⁿ and read off the coefficient you need.'),
         ('trig-identities', 'Double-angle, sum-to-product and Pythagorean identities.'),
         ('polar-form', 'Write complex numbers as r·cis θ: multiply moduli, add angles.'),
         ('remainder-theorem', 'P(a) is the remainder when P(x) is divided by x − a.'),
         ('rational-root-theorem', 'Rational roots of an integer polynomial are ± factors of c / factors of a.'),
         ('newton-sums', 'Get power sums of the roots from the coefficients, one at a time.'),
         ('floor-splitting', 'Write x = n + f and split into ranges where the floor is constant.'),
         ('clearing-denominators', 'Multiply through by the common denominator before anything else.'),
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
         ('divisibility-rules', 'Digit tests for 3, 9, 11 and friends.'),
         ('euclidean-algorithm', 'gcd(a, b) = gcd(b, a mod b), down to something small.'),
         ('fermat-little', 'a^(p−1) ≡ 1 mod p when p is a prime not dividing a.'),
         ('lifting-the-exponent', 'The power of p in aⁿ − bⁿ, by the LTE lemma.'),
         ('wilson', '(p − 1)! ≡ −1 mod p for a prime p.'),
         ('parity', 'Odd or even? Often enough to rule out every case but one.'),
         ('base-conversion', 'Write the number in base b and work digit by digit.'),
         ('sum-of-divisors', 'σ(n) is multiplicative: (1 + p + … + pᵃ) for each prime power.'),
     ]},
    {'id': 'geometric', 'name': 'Geometric strategies', 'color': 'rose',
     'blurb': 'Ways to set up a figure so the answer is easy to find.',
     'techniques': [
         ('similarity-ratios', 'Find similar triangles; lengths scale by k, areas by k².'),
         ('coordinates', 'Put the figure on axes and compute.'),
         ('shoelace', 'Area of a polygon straight from its vertex coordinates.'),
         ('decomposition', 'Cut the region into pieces you know, or subtract corners.'),
         ('british-flag', 'For P in a rectangle, PA² + PC² = PB² + PD².'),
         ('angle-chasing', 'Mark every angle you can from parallels, isosceles triangles and circles.'),
         ('pythagorean-theorem', 'Drop a perpendicular to make right triangles, then use a² + b² = c².'),
         ('law-of-cosines', 'c² = a² + b² − 2ab cos C, for two sides and the angle between them.'),
         ('law-of-sines', 'a / sin A = 2R links sides, opposite angles and the circumradius.'),
         ('power-of-a-point', 'PA · PB is the same for every line through P.'),
         ('inscribed-angle', 'An inscribed angle is half the arc it cuts off.'),
         ('angle-bisector-theorem', 'A bisector splits the opposite side in the ratio of the adjacent sides.'),
         ('stewart', 'Stewart’s theorem gives the length of any cevian.'),
         ('heron', 'Area from three sides: √(s(s−a)(s−b)(s−c)).'),
         ('ptolemy', 'In a cyclic quadrilateral, the product of the diagonals equals the sum of the products of opposite sides.'),
         ('mass-points', 'Put weights on vertices so cevian ratios become balance points.'),
         ('area-ratios', 'Compare triangles that share a height or a base.'),
         ('picks-theorem', 'Lattice polygon area = interior points + boundary points / 2 − 1.'),
         ('reflect-figure', 'Reflect across a line to straighten a broken path.'),
         ('rotate-figure', 'Rotate part of the figure to line up equal lengths.'),
         ('complex-coordinates', 'Put the figure in the complex plane; rotations become multiplication.'),
         ('auxiliary-lines', 'Draw the radius, the altitude or the missing segment that makes it easy.'),
         ('trig-area', 'Area = ½ ab sin C when you know the angle between two sides.'),
     ]},
    {'id': 'general', 'name': 'General problem solving', 'color': 'slate',
     'blurb': 'Habits that help in every topic.',
     'techniques': [
         ('small-cases', 'Try n = 1, 2, 3 and read off the pattern.'),
         ('graphing', 'Sketch both sides and count where they cross.'),
         ('bounding', 'Trap the answer between two estimates you can compute.'),
         ('pairing', 'Pair terms that combine nicely (k with n-k, sin with cos).'),
         ('rates', 'Rates add; times do not.'),
         ('known-formula', 'Recognise the standard formula the problem is built on.'),
         ('direct-computation', 'Sometimes the fastest path is to just compute carefully.'),
         ('working-backwards', 'Start from the end state and undo each step.'),
         ('plug-in-choices', 'Test the answer choices, starting from the middle one.'),
         ('invariants', 'Find what the process never changes.'),
         ('extremal-principle', 'Look at the largest or smallest element and see what it forces.'),
         ('wlog', 'Order or fix variables without loss of generality to cut cases.'),
         ('make-a-table', 'Organise small cases in a table so the pattern shows.'),
         ('estimation', 'Round sensibly and let the far-apart answer choices decide.'),
     ]},
]
TECHNIQUE_FAMILY = {tid: f['id'] for f in STRATEGY_FAMILIES for tid, _ in f['techniques']}
TECHNIQUE_IDEA = {tid: idea for f in STRATEGY_FAMILIES for tid, idea in f['techniques']}


def short_label(problem_id):
    """A pill's label: 'S10·7', 'M10-2·7' (Summit Mock AMC 10 Set 2 #7), 'MA-1·4', or "'23 10A·5"."""
    head, _, tail = problem_id.rpartition('-')
    if head in PAST_BY_ID and tail.isdigit():
        c = PAST_BY_ID[head]
        paper = c['level'].replace('AMC ', '') + c['paper'] if c['level'] != 'AIME' else 'AIME ' + c['paper']
        year = str(c['year'])[2:] + (c['season'][:1] if c['season'] else '')
        return "'{} {}·{}".format(year, paper, int(tail))
    found = sources(problem_id)
    if found:
        mock = MOCK_BY_ID[found[0]['contest']]
        if mock['family'] == 'summit':
            abbr = {'AMC 10': 'M10', 'AMC 12': 'M12', 'AIME': 'MA'}[mock['level']] + '-{}'.format(mock['set'])
        else:
            abbr = {'step-mock-10': 'S10', 'step-mock-12': 'S12', 'step-mock-aime': 'AIME'}[mock['id']]
        return '{}·{}'.format(abbr, found[0]['number'])
    return problem_id


def _check_strategies():
    missing = [t for t in TECHNIQUES if t not in TECHNIQUE_FAMILY]
    assert not missing, 'techniques with no strategy family: {}'.format(missing)


_check_strategies()
