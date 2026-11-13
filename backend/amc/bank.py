r"""The problem bank: every problem the app can serve, with its answer and its
write-up.

These are original problems written in the style of the AMC 10, AMC 12 and
AIME, not reproductions of MAA contests. The real past contests are in
catalog.py as a catalogue that links to the official problem sets; this bank is
what the app can grade itself, and the three Step Mock contests in catalog.py
are built from it.

Each entry:

    id          stable key, used in URLs and in every table that names a problem
    level       'AMC 10' | 'AMC 12' | 'AIME' (the hardest contest it is written for)
    topic       primary topic id (catalog.TOPICS), plus `also` for secondary ones
    technique   one of catalog.TECHNIQUES
    rating      AoPS competition-scale rating, and difficulty (1-5) derived from it —
                both set from solutions.py at the end of this file
    statement   text, inline math in $...$
    choices     five strings for an AMC problem, None for an AIME one
    answer      'A'..'E', or an integer 0-999 for AIME
    solution    replaced by the steps in solutions.py (see the end of this file)
    insight     the one idea that unlocks it
    trap        the mistake that costs the points

tests/test_amc_bank.py recomputes every answer that can be brute-forced, so a
typo here fails a test rather than a student.
"""

PROBLEMS = [
    # ------------------------------------------------------------------
    # Step Mock AMC 10 — problems 1-25, rising difficulty
    # ------------------------------------------------------------------
    {
        'id': 'step-10-01', 'level': 'AMC 10', 'topic': 'exponents', 'also': [],
        'technique': 'direct-computation',
        'statement': r'What is the value of $\dfrac{3^2+3^2+3^2}{3^{-1}+3^{-1}+3^{-1}}$?',
        'choices': ['$3$', '$9$', '$18$', '$27$', '$81$'],
        'answer': 'D',
        'insight': r'Three equal terms add to $3$ times the term: $3\cdot 3^k = 3^{k+1}$.',
        'trap': r'Cancelling the threes and answering $\dfrac{3^2}{3^{-1}}$ incorrectly as $3$ or $9$.',
    },
    {
        'id': 'step-10-02', 'level': 'AMC 10', 'topic': 'word-problems', 'also': [],
        'technique': 'direct-computation',
        'statement': r'A bakery sells muffins at $3$ for $\$4$. How many dollars do $27$ muffins cost?',
        'choices': ['$27$', '$32$', '$36$', '$40$', '$108$'],
        'answer': 'C',
        'insight': 'Count in the unit the price is quoted in: groups of three.',
        'trap': r'Multiplying $27\cdot 4 = 108$, the price as if each muffin cost $\$4$.',
    },
    {
        'id': 'step-10-03', 'level': 'AMC 10', 'topic': 'statistics', 'also': [],
        'technique': 'direct-computation',
        'statement': r'The mean of five numbers is $12$. When one of the numbers is removed, the mean of the remaining four numbers is $10$. What number was removed?',
        'choices': ['$2$', '$10$', '$12$', '$18$', '$20$'],
        'answer': 'E',
        'insight': 'Turn every mean into a sum first; sums subtract, means do not.',
        'trap': r'Subtracting the means: $12 - 10 = 2$.',
    },
    {
        'id': 'step-10-04', 'level': 'AMC 10', 'topic': 'word-problems', 'also': [],
        'technique': 'direct-computation',
        'statement': r'The price of a jacket is increased by $20\%$, and then the new price is decreased by $25\%$. The final price is what percent of the original price?',
        'choices': [r'$85\%$', r'$90\%$', r'$95\%$', r'$100\%$', r'$105\%$'],
        'answer': 'B',
        'insight': 'Percent changes compose by multiplying factors, not by adding percents.',
        'trap': r'Adding $+20\%$ and $-25\%$ to get $95\%$.',
    },
    {
        'id': 'step-10-05', 'level': 'AMC 10', 'topic': 'linear-equations', 'also': ['word-problems'],
        'technique': 'set-up-equations',
        'statement': r'Ana is three times as old as Ben. In $12$ years, Ana will be twice as old as Ben. How old is Ana now?',
        'choices': ['$24$', '$30$', '$36$', '$42$', '$48$'],
        'answer': 'C',
        'insight': 'Add the same number of years to both people.',
        'trap': r"Answering with Ben's age, $12$, which is not a choice, or forgetting to add $12$ to Ana.",
    },
    {
        'id': 'step-10-06', 'level': 'AMC 10', 'topic': 'divisibility', 'also': ['casework'],
        'technique': 'inclusion-exclusion',
        'statement': r'How many positive integers less than $100$ are divisible by $3$ or by $5$, but not by both?',
        'choices': ['$34$', '$37$', '$40$', '$43$', '$46$'],
        'answer': 'C',
        'insight': r'For "exactly one of two", subtract the overlap twice: once for each set it was counted in.',
        'trap': r'Using ordinary inclusion-exclusion and answering $46$, which still counts the multiples of $15$.',
    },
    {
        'id': 'step-10-07', 'level': 'AMC 10', 'topic': 'area', 'also': [],
        'technique': 'direct-computation',
        'statement': r'A square has the same perimeter as a rectangle with side lengths $6$ and $10$. What is the positive difference between their areas?',
        'choices': ['$0$', '$2$', '$4$', '$6$', '$8$'],
        'answer': 'C',
        'insight': 'For a fixed perimeter, the square has the largest area of any rectangle.',
        'trap': 'Assuming equal perimeters mean equal areas and answering 0.',
    },
    {
        'id': 'step-10-08', 'level': 'AMC 10', 'topic': 'basic-counting', 'also': [],
        'technique': 'multiplication-principle',
        'statement': r'How many three-digit positive integers have three distinct digits, all of which are odd?',
        'choices': ['$60$', '$75$', '$100$', '$120$', '$125$'],
        'answer': 'A',
        'insight': 'No odd digit is zero, so there is no leading-zero case to remove.',
        'trap': r'Allowing repeats and answering $5^3 = 125$.',
    },
    {
        'id': 'step-10-09', 'level': 'AMC 10', 'topic': 'digits-bases', 'also': [],
        'technique': 'small-cases',
        'statement': r'What is the sum of the digits of $10^{20} - 20$?',
        'choices': ['$162$', '$168$', '$170$', '$171$', '$180$'],
        'answer': 'C',
        'insight': 'Try $10^3 - 20$ and $10^4 - 20$ and read off the pattern.',
        'trap': r'Miscounting the nines as $19$ or $20$.',
    },
    {
        'id': 'step-10-10', 'level': 'AMC 10', 'topic': 'probability', 'also': [],
        'technique': 'complementary-counting',
        'statement': r'Two fair six-sided dice are rolled. What is the probability that the product of the two numbers rolled is a multiple of $3$?',
        'choices': [r'$\frac{1}{3}$', r'$\frac{4}{9}$', r'$\frac{1}{2}$', r'$\frac{5}{9}$', r'$\frac{2}{3}$'],
        'answer': 'D',
        'insight': r'"At least one" is almost always easier through the complement.',
        'trap': r'Adding $\frac{1}{3} + \frac{1}{3}$ and double-counting the case where both dice are multiples of $3$.',
    },
    {
        'id': 'step-10-11', 'level': 'AMC 10', 'topic': 'quadratics', 'also': [],
        'technique': 'vieta',
        'statement': r'The two roots of $x^2 - 7x + k = 0$ differ by $3$. What is $k$?',
        'choices': ['$6$', '$8$', '$10$', '$12$', '$14$'],
        'answer': 'C',
        'insight': 'Vieta gives the sum for free; the difference pins down both roots.',
        'trap': r'Using $(r-s)^2 = 9$ but writing $(r+s)^2 - 2rs$ instead of $(r+s)^2 - 4rs$.',
    },
    {
        'id': 'step-10-12', 'level': 'AMC 10', 'topic': 'similar-triangles', 'also': ['area'],
        'technique': 'similarity-ratios',
        'statement': r'In triangle $ABC$, $AB = 12$. Point $D$ lies on $\overline{AB}$ with $AD = 4$, and the line through $D$ parallel to $\overline{BC}$ meets $\overline{AC}$ at $E$. The area of triangle $ADE$ is $5$. What is the area of quadrilateral $DBCE$?',
        'choices': ['$20$', '$30$', '$35$', '$40$', '$45$'],
        'answer': 'D',
        'insight': 'Areas of similar figures scale with the square of the length ratio.',
        'trap': r'Scaling area by the length ratio and getting $[ABC] = 15$; or answering $45$, the whole triangle.',
    },
    {
        'id': 'step-10-13', 'level': 'AMC 10', 'topic': 'modular-arithmetic', 'also': [],
        'technique': 'cycles',
        'statement': r'What is the remainder when $3^{100}$ is divided by $7$?',
        'choices': ['$1$', '$2$', '$3$', '$4$', '$5$'],
        'answer': 'D',
        'insight': r'Find the cycle length (here Fermat says it divides $6$), then reduce the exponent mod it.',
        'trap': r'Reducing the exponent mod $7$ instead of mod $6$.',
    },
    {
        'id': 'step-10-14', 'level': 'AMC 10', 'topic': 'word-problems', 'also': ['linear-equations'],
        'technique': 'rates',
        'statement': r'Pipe $A$ fills a tank in $6$ hours and pipe $B$ fills it in $4$ hours. A drain empties a full tank in $12$ hours. If the tank starts empty and all three are open, how many hours does it take to fill the tank?',
        'choices': ['$2$', r'$\frac{12}{5}$', '$3$', r'$\frac{18}{5}$', '$4$'],
        'answer': 'C',
        'insight': 'Rates add; times do not.',
        'trap': r'Ignoring the drain and answering $\frac{12}{5}$.',
    },
    {
        'id': 'step-10-15', 'level': 'AMC 10', 'topic': 'coordinate-geometry', 'also': ['area'],
        'technique': 'shoelace',
        'statement': r'What is the area of the triangle with vertices $(0,0)$, $(8,2)$ and $(3,7)$?',
        'choices': ['$22$', '$23$', '$24$', '$25$', '$26$'],
        'answer': 'D',
        'insight': r'With one vertex at the origin, the area is $\frac{1}{2}|x_1y_2 - x_2y_1|$.',
        'trap': r'Forgetting the $\frac{1}{2}$ and answering $50$, or a sign slip giving $31$.',
    },
    {
        'id': 'step-10-16', 'level': 'AMC 10', 'topic': 'circles', 'also': ['right-triangles'],
        'technique': 'known-formula',
        'statement': r'A circle is inscribed in a right triangle with legs $8$ and $15$. What is the radius of the circle?',
        'choices': ['$2$', r'$\frac{5}{2}$', '$3$', r'$\frac{7}{2}$', '$4$'],
        'answer': 'C',
        'insight': r'Area $= r \cdot s$ works for every triangle; $\frac{a+b-c}{2}$ is the right-triangle shortcut.',
        'trap': r'Using the full perimeter instead of the semiperimeter in $A = rs$, giving $\frac{3}{2}$.',
    },
    {
        'id': 'step-10-17', 'level': 'AMC 10', 'topic': 'combinations', 'also': ['basic-counting'],
        'technique': 'stars-and-bars',
        'statement': r'In how many ways can $6$ identical candies be given to $3$ children so that every child gets at least one candy?',
        'choices': ['$6$', '$10$', '$15$', '$20$', '$28$'],
        'answer': 'B',
        'insight': '"At least one each" becomes "any amount" after handing one to everybody.',
        'trap': r'Using $\binom{6+2}{2} = 28$, which allows a child to get nothing.',
    },
    {
        'id': 'step-10-18', 'level': 'AMC 10', 'topic': 'sequences-series', 'also': [],
        'technique': 'known-formula',
        'statement': r'The first term of an arithmetic sequence is $5$, and the sum of its first $10$ terms is $185$. What is the $10$th term?',
        'choices': ['$28$', '$30$', '$32$', '$34$', '$36$'],
        'answer': 'C',
        'insight': 'An arithmetic sum is the number of terms times the average of the first and last.',
        'trap': r'Solving for the common difference ($3$) and stopping there.',
    },
    {
        'id': 'step-10-19', 'level': 'AMC 10', 'topic': 'factors-divisors', 'also': [],
        'technique': 'prime-factorization',
        'statement': r'How many positive divisors of $2^4\cdot 3^3\cdot 5^2$ are perfect squares?',
        'choices': ['$8$', '$10$', '$12$', '$16$', '$18$'],
        'answer': 'C',
        'insight': 'Count the choices for each prime exponent separately, then multiply.',
        'trap': r'Forgetting the exponent $0$ and answering $2\cdot 1\cdot 1$ style counts.',
    },
    {
        'id': 'step-10-20', 'level': 'AMC 10', 'topic': 'probability', 'also': ['circles'],
        'technique': 'geometric-probability',
        'statement': r'A point is chosen uniformly at random inside a square of side length $2$. What is the probability that it lies within distance $1$ of at least one vertex of the square?',
        'choices': [r'$\frac{\pi}{8}$', r'$\frac{\pi}{6}$', r'$\frac{\pi}{4}$', r'$\frac{\pi}{3}$', r'$\frac{\pi}{2}$'],
        'answer': 'C',
        'insight': 'Geometric probability is favourable area over total area.',
        'trap': r'Treating the four regions as full circles and answering more than $1$, or double-counting overlaps that are not there.',
    },
    {
        'id': 'step-10-21', 'level': 'AMC 10', 'topic': 'factors-divisors', 'also': ['linear-equations'],
        'technique': 'factoring-trick',
        'statement': r'How many ordered pairs of positive integers $(x, y)$ satisfy $\dfrac{1}{x} + \dfrac{1}{y} = \dfrac{1}{6}$?',
        'choices': ['$6$', '$8$', '$9$', '$10$', '$12$'],
        'answer': 'C',
        'insight': r"Simon's Favorite Factoring Trick: add the constant that makes $xy - ax - by$ factor.",
        'trap': r'Counting unordered pairs and answering $5$, or forgetting to rule out negative factor pairs.',
    },
    {
        'id': 'step-10-22', 'level': 'AMC 10', 'topic': 'polygons', 'also': ['area'],
        'technique': 'decomposition',
        'statement': r'A regular hexagon has side length $2$. What is the area of the triangle formed by joining every other vertex of the hexagon?',
        'choices': [r'$\sqrt{3}$', r'$2\sqrt{3}$', r'$3\sqrt{3}$', r'$4\sqrt{3}$', r'$6\sqrt{3}$'],
        'answer': 'C',
        'insight': 'The triangle cuts off three congruent corner triangles whose total area equals its own.',
        'trap': r"Taking the triangle's side as $4$ (the long diagonal) and answering $4\sqrt{3}$.",
    },
    {
        'id': 'step-10-23', 'level': 'AMC 10', 'topic': 'recursion', 'also': ['basic-counting'],
        'technique': 'recursion',
        'statement': r'How many subsets of $\{1, 2, 3, \ldots, 10\}$, including the empty set, contain no two consecutive integers?',
        'choices': ['$89$', '$128$', '$143$', '$144$', '$233$'],
        'answer': 'D',
        'insight': 'Split on whether the largest element is in the set.',
        'trap': r'Forgetting the empty set and answering $143$.',
    },
    {
        'id': 'step-10-24', 'level': 'AMC 10', 'topic': 'probability', 'also': ['triangles', 'casework'],
        'technique': 'casework',
        'statement': r'Three distinct integers are chosen at random from $\{1, 2, \ldots, 10\}$. What is the probability that they are the side lengths of a triangle with positive area?',
        'choices': [r'$\frac{1}{3}$', r'$\frac{3}{8}$', r'$\frac{5}{12}$', r'$\frac{1}{2}$', r'$\frac{7}{12}$'],
        'answer': 'C',
        'insight': 'Only the largest side can break the triangle inequality, so case on it.',
        'trap': r'Allowing $a + b = c$, which gives a degenerate triangle of zero area.',
    },
    {
        'id': 'step-10-25', 'level': 'AMC 10', 'topic': 'functions', 'also': ['linear-equations'],
        'technique': 'substitution',
        'statement': r'A function $f$ satisfies $f(x) + 2f\!\left(\frac{1}{x}\right) = 3x$ for every nonzero real number $x$. What is $f(2)$?',
        'choices': ['$-2$', '$-1$', '$0$', '$1$', '$2$'],
        'answer': 'B',
        'insight': r'Substitute $\frac{1}{x}$ for $x$ to get a second equation in the same two unknowns.',
        'trap': r'Guessing $f(x) = x$ from the shape of the right-hand side.',
    },

    # ------------------------------------------------------------------
    # AMC 12-only problems (the Step Mock AMC 12 uses these with the
    # harder half of the AMC 10 set, as the real contests share problems)
    # ------------------------------------------------------------------
    {
        'id': 'step-12-01', 'level': 'AMC 12', 'topic': 'logarithms', 'also': [],
        'technique': 'telescoping',
        'statement': r'What is $\log_2 3 \cdot \log_3 4 \cdot \log_4 5 \cdots \log_{63} 64$?',
        'choices': ['$5$', '$6$', '$7$', '$8$', '$63$'],
        'answer': 'B',
        'insight': 'Chained change-of-base products telescope.',
        'trap': r'Counting the factors ($62$) instead of simplifying.',
    },
    {
        'id': 'step-12-02', 'level': 'AMC 12', 'topic': 'trigonometry', 'also': [],
        'technique': 'squaring',
        'statement': r'If $\sin\theta + \cos\theta = \frac{7}{5}$, what is $\sin 2\theta$?',
        'choices': [r'$\frac{12}{25}$', r'$\frac{7}{10}$', r'$\frac{24}{25}$', '$1$', r'$\frac{49}{25}$'],
        'answer': 'C',
        'insight': r'$(\sin\theta + \cos\theta)^2 = 1 + \sin 2\theta$.',
        'trap': r'Stopping at $\sin\theta\cos\theta = \frac{12}{25}$.',
    },
    {
        'id': 'step-12-03', 'level': 'AMC 12', 'topic': 'complex-numbers', 'also': ['exponents'],
        'technique': 'repeated-squaring',
        'statement': r'What is $(1+i)^{10}$, where $i = \sqrt{-1}$?',
        'choices': ['$-32$', '$32$', '$-32i$', '$32i$', '$1024$'],
        'answer': 'D',
        'insight': r'Square first: $(1 \pm i)^2 = \pm 2i$.',
        'trap': r'Sign error on $i^5$, which is $i$, not $-i$.',
    },
    {
        'id': 'step-12-04', 'level': 'AMC 12', 'topic': 'polynomials', 'also': [],
        'technique': 'vieta',
        'statement': r'Let $r$, $s$ and $t$ be the roots of $x^3 - 4x^2 + 5x - 3 = 0$. What is $r^2 + s^2 + t^2$?',
        'choices': ['$4$', '$6$', '$8$', '$10$', '$16$'],
        'answer': 'B',
        'insight': r'$\sum r^2 = (\sum r)^2 - 2\sum rs$.',
        'trap': r'Sign errors in Vieta: the sum of roots is $-\frac{b}{a} = 4$.',
    },
    {
        'id': 'step-12-05', 'level': 'AMC 12', 'topic': 'solid-geometry', 'also': ['coordinate-geometry'],
        'technique': 'coordinates',
        'statement': r'A cube has edge length $2$. What is the distance from a vertex of the cube to the center of a face that does not contain that vertex?',
        'choices': [r'$\sqrt{5}$', r'$\sqrt{6}$', r'$2\sqrt{2}$', '$3$', r'$2\sqrt{3}$'],
        'answer': 'B',
        'insight': 'Coordinates turn 3D distance into arithmetic.',
        'trap': r'Picking a face that contains the vertex and getting $\sqrt{2}$.',
    },
    {
        'id': 'step-12-06', 'level': 'AMC 12', 'topic': 'logarithms', 'also': ['quadratics'],
        'technique': 'substitution',
        'statement': r'What is the product of all real numbers $x$ that satisfy $(\log_2 x)^2 - 5\log_2 x + 6 = 0$?',
        'choices': ['$12$', '$24$', '$32$', '$64$', '$128$'],
        'answer': 'C',
        'insight': r'The product of the $x$-values is $2$ to the sum of the $u$-roots.',
        'trap': r'Answering $6$, the product of the $u$-roots, or $64$ from $2^6$.',
    },
    {
        'id': 'step-12-07', 'level': 'AMC 12', 'topic': 'sequences-series', 'also': ['recursion'],
        'technique': 'reciprocal-substitution',
        'statement': r'A sequence has $a_1 = 1$ and $a_{n+1} = \dfrac{a_n}{1 + a_n}$ for $n \ge 1$. What is $a_{2026}$?',
        'choices': [r'$\frac{1}{2025}$', r'$\frac{1}{2026}$', r'$\frac{1}{2027}$', r'$\frac{2}{2027}$', r'$\frac{1}{4052}$'],
        'answer': 'B',
        'insight': 'When the recursion has the form x/(1+x), flip it.',
        'trap': r'An off-by-one from starting the count at $0$.',
    },
    {
        'id': 'step-12-08', 'level': 'AMC 12', 'topic': 'complex-numbers', 'also': ['trigonometry'],
        'technique': 'roots-of-unity',
        'statement': r'How many complex numbers $z$ satisfy $z^{12} = 1$ and have $z^3$ a real number?',
        'choices': ['$2$', '$3$', '$4$', '$6$', '$12$'],
        'answer': 'D',
        'insight': r'$z^3$ is real iff $z^6 = 1$.',
        'trap': r'Counting only $z^3 = 1$ and answering $3$.',
    },
    {
        'id': 'step-12-09', 'level': 'AMC 12', 'topic': 'trigonometry', 'also': ['sequences-series'],
        'technique': 'pairing',
        'statement': r'What is $\displaystyle\sum_{k=1}^{89} \sin^2(k^\circ)$?',
        'choices': ['$44$', r'$\frac{89}{2}$', '$45$', r'$\frac{91}{2}$', '$89$'],
        'answer': 'B',
        'insight': 'Complementary angles swap sine and cosine.',
        'trap': r'Forgetting the unpaired middle term and answering $44$.',
    },
    {
        'id': 'step-12-10', 'level': 'AMC 12', 'topic': 'inequalities', 'also': [],
        'technique': 'am-gm',
        'statement': r'What is the minimum value of $x^2 + \dfrac{16}{x}$ for $x > 0$?',
        'choices': ['$8$', '$10$', '$12$', '$14$', '$16$'],
        'answer': 'C',
        'insight': 'Split terms in AM-GM so the variables cancel in the product.',
        'trap': r'Applying two-term AM-GM directly, which gives a bound $2\sqrt{16x}$ that still depends on $x$.',
    },
    {
        'id': 'step-12-11', 'level': 'AMC 12', 'topic': 'probability', 'also': ['permutations'],
        'technique': 'inclusion-exclusion',
        'statement': r'A permutation of $1, 2, 3, 4, 5, 6$ is chosen uniformly at random. What is the probability that no number is in its original position?',
        'choices': [r'$\frac{1}{3}$', r'$\frac{53}{144}$', r'$\frac{11}{30}$', r'$\frac{3}{8}$', r'$\frac{5}{12}$'],
        'answer': 'B',
        'insight': r'$D_n = n!\sum_{k=0}^{n} \frac{(-1)^k}{k!}$, or the recursion $D_n = (n-1)(D_{n-1} + D_{n-2})$.',
        'trap': r'Stopping the alternating sum one term early, which gives $\frac{11}{30}$.',
    },
    {
        'id': 'step-12-12', 'level': 'AMC 12', 'topic': 'factors-divisors', 'also': ['combinations'],
        'technique': 'stars-and-bars',
        'statement': r'How many ordered triples $(a, b, c)$ of positive integers satisfy $abc = 1000$?',
        'choices': ['$64$', '$81$', '$100$', '$120$', '$125$'],
        'answer': 'C',
        'insight': 'Distribute each prime\'s exponent separately with stars and bars.',
        'trap': r'Counting unordered triples, or using $\binom{3}{2}$ instead of $\binom{5}{2}$.',
    },

    # ------------------------------------------------------------------
    # Step Mock AIME — answers are integers 000-999
    # ------------------------------------------------------------------
    {
        'id': 'step-aime-01', 'level': 'AIME', 'topic': 'divisibility', 'also': [],
        'technique': 'inclusion-exclusion',
        'statement': r'Find the number of positive integers $n \le 1000$ such that $n$ is divisible by $6$ but by neither $4$ nor $9$.',
        'choices': None, 'answer': 55,
        'insight': 'Inside the multiples of 6, "divisible by 4" means divisible by 12.',
        'trap': r'Using $6 \cdot 4 = 24$ instead of $\operatorname{lcm}(6, 4) = 12$.',
    },
    {
        'id': 'step-aime-02', 'level': 'AIME', 'topic': 'quadratics', 'also': ['polynomials'],
        'technique': 'symmetric-sums',
        'statement': r'Real numbers $x$ and $y$ satisfy $x + y = 10$ and $x^3 + y^3 = 370$. Find $xy$.',
        'choices': None, 'answer': 21,
        'insight': 'Write every symmetric expression in terms of x + y and xy.',
        'trap': r'Trying to solve for $x$ and $y$ separately.',
    },
    {
        'id': 'step-aime-03', 'level': 'AIME', 'topic': 'combinations', 'also': ['basic-counting'],
        'technique': 'bijection',
        'statement': r'A $6 \times 6$ grid is made of $36$ unit squares. Find the number of rectangles (of any size, including squares) whose sides lie along the grid lines.',
        'choices': None, 'answer': 441,
        'insight': 'Count the lines, not the squares.',
        'trap': r'Choosing from $6$ lines instead of $7$ and getting $225$.',
    },
    {
        'id': 'step-aime-04', 'level': 'AIME', 'topic': 'factors-divisors', 'also': ['divisibility'],
        'technique': 'euler-phi',
        'statement': r'Find the number of ordered pairs of positive integers $(a, b)$ with $a + b = 100$ and $\gcd(a, b) = 1$.',
        'choices': None, 'answer': 40,
        'insight': r'$\gcd(a, b) = \gcd(a, a + b)$.',
        'trap': r'Halving to count unordered pairs.',
    },
    {
        'id': 'step-aime-05', 'level': 'AIME', 'topic': 'basic-counting', 'also': ['factors-divisors'],
        'technique': 'legendre',
        'statement': r'Find the number of zeros at the end of the decimal representation of $1000!$.',
        'choices': None, 'answer': 249,
        'insight': "Legendre's formula: count multiples of each power of the prime.",
        'trap': r'Stopping at $\frac{1000}{5}$ and answering $200$.',
    },
    {
        'id': 'step-aime-06', 'level': 'AIME', 'topic': 'combinations', 'also': ['digits-bases'],
        'technique': 'bijection',
        'statement': r'Find the number of four-digit positive integers whose digits are strictly increasing from left to right.',
        'choices': None, 'answer': 126,
        'insight': 'A set of digits has exactly one increasing arrangement.',
        'trap': r'Choosing from $10$ digits and getting $210$.',
    },
    {
        'id': 'step-aime-07', 'level': 'AIME', 'topic': 'area', 'also': ['coordinate-geometry'],
        'technique': 'coordinates',
        'statement': r'Square $ABCD$ has side length $12$. Point $E$ is the midpoint of $\overline{AB}$ and point $F$ is the midpoint of $\overline{BC}$. Find the area of triangle $DEF$.',
        'choices': None, 'answer': 54,
        'insight': 'Area of an inscribed triangle = square minus the corner triangles.',
        'trap': 'Mislabeling which corner triangles have legs 6 and 12.',
    },
    {
        'id': 'step-aime-08', 'level': 'AIME', 'topic': 'probability', 'also': ['combinations'],
        'technique': 'inclusion-exclusion',
        'statement': r'Two cards are drawn without replacement from a standard $52$-card deck. The probability that both are hearts or both are aces is $\frac{m}{n}$ in lowest terms. Find $m + n$.',
        'choices': None, 'answer': 235,
        'insight': 'Check the overlap before adding; here it is empty.',
        'trap': 'Not reducing the fraction to lowest terms.',
    },
    {
        'id': 'step-aime-09', 'level': 'AIME', 'topic': 'logarithms', 'also': ['digits-bases'],
        'technique': 'casework',
        'statement': r'Find the number of positive integers $n < 1000$ for which $\lfloor \log_2 n \rfloor$ is even.',
        'choices': None, 'answer': 341,
        'insight': 'The floor of a log is the number of binary digits minus one.',
        'trap': r'Including $k = 10$, whose range starts at $1024$.',
    },
    {
        'id': 'step-aime-10', 'level': 'AIME', 'topic': 'polynomials', 'also': [],
        'technique': 'vieta',
        'statement': r'The polynomial $x^3 + ax^2 + bx + c$ has three roots that are consecutive positive integers whose product is $336$. Find $b$.',
        'choices': None, 'answer': 146,
        'insight': r'$b$ is the sum of pairwise products of the roots.',
        'trap': r'Sign confusion: $b$ is $+\sum rs$, while $a$ and $c$ are negative.',
    },
    {
        'id': 'step-aime-11', 'level': 'AIME', 'topic': 'modular-arithmetic', 'also': ['exponents'],
        'technique': 'chinese-remainder',
        'statement': r'Find the remainder when $2^{2026}$ is divided by $1000$.',
        'choices': None, 'answer': 864,
        'insight': r'Split $1000 = 8 \cdot 125$ and recombine with CRT.',
        'trap': r'Reducing the exponent mod $1000$ or mod $400$ without justification.',
    },
    {
        'id': 'step-aime-12', 'level': 'AIME', 'topic': 'triangles', 'also': ['circles'],
        'technique': 'known-formula',
        'statement': r'Triangle $ABC$ has side lengths $13$, $14$ and $15$. Let $O$ and $I$ be its circumcenter and incenter. Then $OI^2 = \frac{m}{n}$ in lowest terms. Find $m + n$.',
        'choices': None, 'answer': 129,
        'insight': r"Euler's relation $OI^2 = R^2 - 2Rr$ needs only $R$ and $r$.",
        'trap': r'Using $R(R + 2r)$, the formula for the excenter distance.',
    },
    {
        'id': 'step-aime-13', 'level': 'AIME', 'topic': 'expected-value', 'also': ['probability'],
        'technique': 'linearity-of-expectation',
        'statement': r'A fair six-sided die is rolled repeatedly until a $6$ appears. Find the expected sum of all the rolls, including the final $6$.',
        'choices': None, 'answer': 21,
        'insight': 'Given it is not a 6, a roll is uniform on 1-5.',
        'trap': r'Using mean $3.5$ for the earlier rolls and getting $23.5$.',
    },
    {
        'id': 'step-aime-14', 'level': 'AIME', 'topic': 'modular-arithmetic', 'also': [],
        'technique': 'orders',
        'statement': r'Find the least positive integer $n$ such that $2^n - 1$ is divisible by $125$.',
        'choices': None, 'answer': 100,
        'insight': r'The order divides $\varphi(n)$; test the maximal proper divisors $\frac{100}{2}$ and $\frac{100}{5}$.',
        'trap': r'Assuming the order is $\varphi(125)$ without checking smaller divisors, or stopping at the order mod $5$ (which is $4$).',
    },
    {
        'id': 'step-aime-15', 'level': 'AIME', 'topic': 'combinations', 'also': ['modular-arithmetic', 'complex-numbers'],
        'technique': 'roots-of-unity',
        'statement': r'Find the number of subsets of $\{1, 2, \ldots, 9\}$, including the empty set, whose elements have a sum divisible by $3$.',
        'choices': None, 'answer': 176,
        'insight': 'A roots-of-unity filter counts subsets by sum mod 3.',
        'trap': r'Assuming exactly a third of the $512$ subsets work; $512$ is not even divisible by $3$.',
    },

    # ------------------------------------------------------------------
    # Extra drills: not on any mock, there so every topic has problems
    # ------------------------------------------------------------------
    {
        'id': 'step-drill-01', 'level': 'AMC 10', 'topic': 'right-triangles', 'also': ['area'],
        'technique': 'british-flag',
        'statement': r'Point $P$ lies inside rectangle $ABCD$ with $PA = 3$, $PB = 4$ and $PC = 5$. What is $PD$?',
        'choices': [r'$2\sqrt{3}$', r'$\sqrt{15}$', r'$3\sqrt{2}$', r'$2\sqrt{5}$', '$5$'],
        'answer': 'C',
        'insight': 'The British flag theorem: opposite corners pair up.',
        'trap': r'Pairing adjacent corners: $PA^2 + PB^2 = PC^2 + PD^2$ gives $PD = 0$.',
    },
    {
        'id': 'step-drill-02', 'level': 'AMC 10', 'topic': 'digits-bases', 'also': ['combinations'],
        'technique': 'stars-and-bars',
        'statement': r'How many positive integers less than $1000$ have digits that sum to $10$?',
        'choices': ['$54$', '$60$', '$63$', '$66$', '$72$'],
        'answer': 'C',
        'insight': 'Leading zeros turn "numbers below 1000" into "three-digit strings".',
        'trap': r'Forgetting the digit cap of $9$ and answering $66$.',
    },
    {
        'id': 'step-drill-03', 'level': 'AMC 10', 'topic': 'expected-value', 'also': ['recursion'],
        'technique': 'states',
        'statement': r'A fair coin is flipped until two heads appear in a row. What is the expected number of flips?',
        'choices': ['$4$', '$5$', '$6$', '$7$', '$8$'],
        'answer': 'C',
        'insight': 'Define a state for each amount of progress and write one equation per state.',
        'trap': r'Answering $4$ from "probability $\frac14$ per pair of flips".',
    },
    {
        'id': 'step-drill-04', 'level': 'AMC 10', 'topic': 'modular-arithmetic', 'also': ['exponents'],
        'technique': 'cycles',
        'statement': r'What are the last two digits of $7^{2026}$?',
        'choices': ['$01$', '$07$', '$43$', '$49$', '$93$'],
        'answer': 'D',
        'insight': 'Look for a small power that is 1 mod 100.',
        'trap': r'Reducing $2026$ mod $10$ instead of mod $4$.',
    },
    {
        'id': 'step-drill-05', 'level': 'AMC 10', 'topic': 'modular-arithmetic', 'also': ['quadratics'],
        'technique': 'residues',
        'statement': r'For how many integers $n$ with $1 \le n \le 100$ is $n^2 + 1$ divisible by $5$?',
        'choices': ['$20$', '$25$', '$40$', '$50$', '$60$'],
        'answer': 'C',
        'insight': 'Only residues matter: check n = 0 through 4.',
        'trap': r'Only counting $n \equiv 2$ and answering $20$.',
    },
    {
        'id': 'step-drill-06', 'level': 'AMC 10', 'topic': 'combinations', 'also': ['recursion'],
        'technique': 'reflection',
        'statement': r'A lattice path from $(0,0)$ to $(6,6)$ uses unit steps right or up. How many such paths never pass above the line $y = x$?',
        'choices': ['$42$', '$132$', '$429$', '$462$', '$924$'],
        'answer': 'B',
        'insight': 'Reflect the bad paths across y = x + 1 after their first bad step.',
        'trap': r'Answering $924$, all paths, or $462$, assuming symmetry halves it.',
    },
    {
        'id': 'step-drill-07', 'level': 'AMC 10', 'topic': 'inequalities', 'also': ['linear-equations'],
        'technique': 'casework',
        'statement': r'How many integers $x$ satisfy $|2x - 7| \le 9$?',
        'choices': ['$8$', '$9$', '$10$', '$17$', '$18$'],
        'answer': 'C',
        'insight': r'$|u| \le k$ is the double inequality $-k \le u \le k$.',
        'trap': 'Off-by-one when counting integers in a closed interval: there are b - a + 1 of them.',
    },
    {
        'id': 'step-drill-08', 'level': 'AMC 10', 'topic': 'logic', 'also': [],
        'technique': 'casework',
        'statement': r'Each of three students is either a knight, who always tells the truth, or a knave, who always lies. Ava says, "Exactly one of us is a knave." Ben says, "Ava is a knave." Cal says, "Ben and I are the same type." How many of the three are knights?',
        'choices': ['$0$', '$1$', '$2$', '$3$', 'cannot be determined'],
        'answer': 'B',
        'insight': 'Assume one speaker\'s type and chase consequences until a contradiction.',
        'trap': 'Stopping at the first consistent-looking assignment without checking every statement.',
    },
]

# Ratings on the AoPS scale and step-by-step solutions live beside the bank
# (backend/amc/solutions.py); the 1-5 difficulty is derived from the rating so
# the two can never disagree.
from backend.amc.solutions import RATINGS, SOLUTIONS, tier  # noqa: E402

for _p in PROBLEMS:
    _p['rating'] = RATINGS[_p['id']]
    _p['difficulty'] = tier(_p['rating'])
    _p['solution'] = SOLUTIONS[_p['id']]

BY_ID = {p['id']: p for p in PROBLEMS}
