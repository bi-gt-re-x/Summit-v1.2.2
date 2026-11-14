r"""Difficulty ratings and step-by-step solutions for the problem bank.

## Ratings: the AoPS competition scale

Every problem carries `rating`, on the 1-10 scale the AoPS wiki uses for
contest problems (AoPS Wiki: Competition ratings). Its bands for the contests
this site covers, which is how an official problem is rated from its position
(backend/amc/official.py `rating_at`):

    AMC 10   #1-5: 1      #6-10: 1.5   #11-15: 2    #16-20: 2.5   #21-25: 3-3.5
    AMC 12   #1-5: 1.5    #6-10: 2     #11-15: 2.5  #16-20: 3     #21-25: 3.5-4
    AIME     #1-3: 2.5    #4-6: 3.5    #7-10: 4     #11-13: 5     #14-15: 6

(The AIME bands are the ones Epoch AI uses with the same scale; the AMC
placements follow the AoPS page's level descriptions.)

The bank's problems are original, so nobody has rated them online. Each was
rated by hand against those bands: "which stretch of a real paper would this
sit in?" — not by where it happens to sit in a Step Mock. That is why some
Step Mock problems rate below their position: the mocks are a little gentler
than real papers at the top end, and the ratings say so.

`difficulty` (1-5) is derived from the rating (`tier`) so the filters and the
score projection keep working: 1 is a real AMC 10 #1-5 and 5 is #21-25 and up.

## Solutions

Each solution is a list of steps, each one a single move, the last stating the
answer. tests/test_amc_bank.py checks that every solution ends on its answer.
"""

RATINGS = {
    'step-10-01': 1, 'step-10-03': 1, 'step-10-04': 1, 'step-10-05': 1,
    'step-10-06': 1.5, 'step-10-08': 1, 'step-10-09': 1.5, 'step-10-10': 1.5,
    'step-10-11': 1.5, 'step-10-12': 1.5, 'step-10-13': 1.5, 'step-10-15': 1.5,
    'step-10-16': 1.5, 'step-10-17': 1.5, 'step-10-18': 1, 'step-10-19': 2, 'step-10-20': 1.5,
    'step-10-21': 2, 'step-10-22': 1.5, 'step-10-23': 2.5, 'step-10-24': 2.5, 'step-10-25': 2,
    'step-12-01': 1.5, 'step-12-02': 1.5, 'step-12-03': 1.5, 'step-12-04': 2, 'step-12-05': 1.5,
    'step-12-06': 2, 'step-12-07': 2, 'step-12-08': 2.5, 'step-12-09': 2.5, 'step-12-10': 2.5,
    'step-12-11': 3, 'step-12-12': 2,
    'step-aime-01': 2,   'step-aime-04': 2, 'step-aime-05': 1.5,
    'step-aime-06': 1.5, 'step-aime-08': 2, 'step-aime-09': 2, 'step-aime-10': 1.5,
    'step-aime-11': 2.5, 'step-aime-12': 3, 'step-aime-13': 3, 'step-aime-14': 3, 'step-aime-15': 3.5,
    'step-10-26': 3, 'step-10-27': 3.5, 'step-10-28': 3,
    'step-12-13': 3.5, 'step-12-14': 4, 'step-12-15': 3, 'step-12-16': 3.5, 'step-12-17': 1.5, 'step-12-18': 1.5,
    'step-aime-16': 4, 'step-aime-17': 4.5, 'step-aime-18': 4,
    'step-drill-01': 2, 'step-drill-02': 2, 'step-drill-03': 2.5, 'step-drill-04': 1.5,
    'step-drill-05': 2, 'step-drill-06': 3, 'step-drill-08': 1.5,
}


def tier(rating):
    """The 1-5 difficulty the rest of the site uses, from an AoPS rating."""
    if rating <= 1:
        return 1
    if rating <= 1.5:
        return 2
    if rating <= 2:
        return 3
    if rating <= 3:
        return 4
    return 5


SOLUTIONS = {
    'step-12-17': [
        r'Write the cube sum in terms of $x + y$ and $xy$: $x^3 + y^3 = (x + y)^3 - 3xy(x + y)$.',
        r'So $370 = 10^3 - 30xy$, giving $30xy = 630$ and $xy = 21$.',
        r'(Check: $x, y = 3, 7$ and $27 + 343 = 370$.) The answer is $\textbf{(C)}\ 21$.',
    ],
    'step-12-18': [
        r'A $6 \times 6$ grid has $7$ vertical and $7$ horizontal lines.',
        r'A rectangle is fixed by choosing $2$ of the vertical lines and $2$ of the horizontal lines.',
        r'That is $\binom{7}{2}^2 = 21^2 = 441$ rectangles: $\textbf{(D)}\ 441$.',
    ],
    'step-drill-05': [
        r'$65 = 5 \cdot 13$, so we need $n^2 \equiv -1$ modulo $5$ and modulo $13$.',
        r'Modulo $5$: squares of $0$-$4$ are $0, 1, 4, 4, 1$, so $n \equiv 2$ or $3$.',
        r'Modulo $13$: $5^2 = 25 \equiv -1$ and $8^2 = 64 \equiv -1$, and a quadratic has at most two roots mod a prime, so $n \equiv 5$ or $8$.',
        r'By CRT that is $2 \cdot 2 = 4$ residues mod $65$: $n \equiv 8, 18, 47, 57$. In $1$-$100$ these give $8, 18, 47, 57$ and $8 + 65 = 73$, $18 + 65 = 83$.',
        r'That is $6$ values, so the answer is $\textbf{(C)}\ 6$.',
    ],
    'step-10-26': [
        r'Split the string into runs of equal letters. No three consecutive identical letters means every run has length $1$ or $2$.',
        r'So the run lengths are an ordered list of $1$s and $2$s summing to $10$. If $c_n$ counts such lists for total $n$, then $c_n = c_{n-1} + c_{n-2}$ (the last run is $1$ or $2$) with $c_1 = 1$, $c_2 = 2$.',
        r'That gives $1, 2, 3, 5, 8, 13, 21, 34, 55, 89$, so $c_{10} = 89$.',
        r'The runs alternate letters, so the whole string is fixed once we choose the first letter: $2 \cdot 89 = 178$. The answer is $\textbf{(C)}\ 178$.',
    ],
    'step-10-27': [
        r'Call the five pairs $\{1,2\}, \{2,3\}, \ldots, \{5,6\}$ bad. Use inclusion-exclusion over which bad pairs are forced to be adjacent.',
        r'If a chosen set of $k$ pairs forms $j$ chains (pairs sharing a number join into one chain, like $2,3,4$), the chains act as single blocks: there are $6 - k$ blocks, and each chain can run up or down, giving $2^j (6-k)!$ arrangements.',
        r'Adding by size: $k = 0$: $720$. $k = 1$: $5 \cdot 2 \cdot 120 = 1200$. $k = 2$: $4$ touching pairs give $4 \cdot 2 \cdot 24 = 192$ and $6$ separate pairs give $6 \cdot 4 \cdot 24 = 576$, total $768$.',
        r'$k = 3$: one chain of three pairs ($3$ ways, $2 \cdot 6$ each) $= 36$; a chain of two plus a separate pair ($6$ ways, $4 \cdot 6$ each) $= 144$; three separate ($1$ way, $8 \cdot 6$) $= 48$; total $228$. $k = 4$: $2 \cdot 4 + 3 \cdot 8 = 32$. $k = 5$: $2$.',
        r'So the count is $720 - 1200 + 768 - 228 + 32 - 2 = 90$: $\textbf{(C)}\ 90$.',
    ],
    'step-10-28': [
        r'Let $p_n$ be the probability that the frog ever lands on $n$. It lands on $n$ by jumping $1$ from $n-1$ or $2$ from $n-2$, and these are different last jumps, so $p_n = \tfrac{1}{2} p_{n-1} + \tfrac{1}{2} p_{n-2}$.',
        r'Start with $p_0 = 1$ (it starts there) and $p_1 = \tfrac{1}{2}$ (only by a first jump of $1$).',
        r'Then $p_2 = \tfrac{3}{4}$, $p_3 = \tfrac{5}{8}$, $p_4 = \tfrac{11}{16}$, $p_5 = \tfrac{21}{32}$, $p_6 = \tfrac{43}{64}$.',
        r'Finally $p_7 = \tfrac{1}{2} \cdot \tfrac{43}{64} + \tfrac{1}{2} \cdot \tfrac{21}{32} = \tfrac{43 + 42}{128} = \tfrac{85}{128}$: $\textbf{(C)}\ \frac{85}{128}$.',
    ],
    'step-12-13': [
        r'Since $|\sin x| \le 1$, any solution has $\left|\frac{x}{30}\right| \le 1$, so $-30 \le x \le 30$. Both sides are odd functions, so solutions come in pairs $\pm x$, plus $x = 0$.',
        r'For $x > 0$, solutions need $\sin x > 0$, i.e. $x$ in a hump $(2\pi k, 2\pi k + \pi)$. In the first hump the line starts below $\sin x$ (slope $\frac{1}{30} < 1$) and ends above it, so it crosses once.',
        r'The humps starting at $2\pi, 4\pi, 6\pi, 8\pi$ end before $9\pi \approx 28.3 < 30$, and the line stays below $1$ there, so it enters and leaves each: $2$ crossings each, $8$ in all. The next hump starts at $10\pi > 30$.',
        r'So there are $1 + 8 = 9$ positive solutions, $9$ negative ones, and $x = 0$: $19$ in all. The answer is $\textbf{(C)}\ 19$.',
    ],
    'step-12-14': [
        r'Since $z^7 = 1$ and $z \ne 1$, $1 + z + z^2 + \cdots + z^6 = 0$. Let $S = z + z^2 + z^4$ and $S^\prime = z^3 + z^5 + z^6$, so $S + S^\prime = -1$.',
        r'Multiply out $S S^\prime$: the nine products are $z^4, z^6, z^7, z^5, z^7, z^8, z^7, z^9, z^{10}$, which reduce to $z^4 + z^6 + 1 + z^5 + 1 + z + 1 + z^2 + z^3 = 3 + (-1) = 2$.',
        r'So $S$ and $S^\prime$ are the roots of $t^2 + t + 2 = 0$: $S = \frac{-1 \pm i\sqrt{7}}{2}$, and $1 + S = \frac{1 \pm i\sqrt{7}}{2}$.',
        r'Then $|1 + S|^2 = \frac{1 + 7}{4} = 2$: $\textbf{(C)}\ 2$.',
    ],
    'step-12-15': [
        r'$n^3 - n = (n-1)n(n+1)$, a product of three consecutive integers, so it is always divisible by $3$. Since $48 = 3 \cdot 16$, we need $16 \mid (n-1)n(n+1)$.',
        r'If $n$ is even, $n - 1$ and $n + 1$ are odd, so we need $16 \mid n$: $n = 16, 32, \ldots, 96$, which is $6$ values.',
        r'If $n$ is odd, write $n - 1 = 2k$: $(n-1)(n+1) = 4k(k+1)$, so we need $4 \mid k(k+1)$, i.e. $k \equiv 0$ or $3 \pmod 4$, i.e. $n \equiv 1$ or $7 \pmod 8$. That is $13$ values ($1, 9, \ldots, 97$) plus $12$ values ($7, 15, \ldots, 95$).',
        r'In total $6 + 13 + 12 = 31$: $\textbf{(C)}\ 31$.',
    ],
    'step-12-16': [
        r'Square the recursion: $a_{n+1}^2 = a_n^2 + 2 + \frac{1}{a_n^2}$.',
        r'Adding from $n = 1$ to $99$: $a_{100}^2 = 1 + 2 \cdot 99 + \sum_{k=1}^{99} \frac{1}{a_k^2} = 199 + \sum_{k=1}^{99} \frac{1}{a_k^2}$.',
        r'The sum is at least its first term, $1$, and since $a_k^2 \ge 2k - 1$ it is at most $\sum_{k=1}^{99} \frac{1}{2k-1} < 4$. So $200 < a_{100}^2 < 203$.',
        r'That puts $a_{100}$ between $\sqrt{200} \approx 14.1$ and $\sqrt{203} \approx 14.2$, closest to $\textbf{(C)}\ 14$.',
    ],
    'step-aime-16': [
        r'Since $5^2 = 25 \equiv -1 \pmod{13}$: if $a \not\equiv 0$, then $a^2 + b^2 \equiv 0$ exactly when $b \equiv 5a$ or $b \equiv -5a \equiv 8a \pmod{13}$. If $a \equiv 0$, then $b \equiv 0$.',
        r'In $1$-$50$ ($50 = 3 \cdot 13 + 11$), residues $1$-$11$ each occur $4$ times and residues $12$ and $0$ occur $3$ times.',
        r'Both multiples of $13$: $3 \cdot 3 = 9$ pairs.',
        r'For the $12$ nonzero residues $r$ and the $2$ partners $5r, 8r$ of each, that is $24$ residue pairs. Residue $12$ is the only nonzero one occurring $3$ times, and it is in exactly $4$ of these pairs: $(12, 5)$, $(12, 8)$, $(5, 12)$, $(8, 12)$, each giving $3 \cdot 4 = 12$ pairs of numbers. The other $20$ residue pairs give $4 \cdot 4 = 16$ each. That is $4 \cdot 12 + 20 \cdot 16 = 368$.',
        r'Total $9 + 368 = 377$: $\boxed{377}$.',
    ],
    'step-aime-17': [
        r'Only the end of the sequence matters. Let $p_s$ be the probability $HHH$ comes first, from the state $s$: nothing yet, $H$, $HH$, $T$, or $TH$.',
        r'The transitions give: $p_{\varnothing} = \tfrac12 p_H + \tfrac12 p_T$; $p_H = \tfrac12 p_{HH} + \tfrac12 p_T$; $p_{HH} = \tfrac12 \cdot 1 + \tfrac12 p_T$; $p_T = \tfrac12 p_{TH} + \tfrac12 p_T$; $p_{TH} = \tfrac12 p_{HH} + \tfrac12 \cdot 0$.',
        r'From $p_T = \tfrac12 p_{TH} + \tfrac12 p_T$ we get $p_T = p_{TH} = \tfrac12 p_{HH}$. Then $p_{HH} = \tfrac12 + \tfrac14 p_{HH}$, so $p_{HH} = \tfrac23$ and $p_T = \tfrac13$.',
        r'Then $p_H = \tfrac13 + \tfrac16 = \tfrac12$ and $p_{\varnothing} = \tfrac14 + \tfrac16 = \tfrac{5}{12}$.',
        r'So $\frac{m}{n} = \frac{5}{12}$ and $m + n = \boxed{017}$.',
    ],
    'step-aime-18': [
        r'The numbers $\omega^k$ for $k = 1, \ldots, 6$ are the roots of $\frac{x^7 - 1}{x - 1} = x^6 + x^5 + \cdots + x + 1$, so $\prod_{k=1}^{6} (x - \omega^k) = x^6 + x^5 + \cdots + 1$.',
        r'Put $x = 4$: the product is $\frac{4^7 - 1}{4 - 1} = \frac{16383}{3} = 5461$.',
        r'The remainder when $5461$ is divided by $1000$ is $\boxed{461}$.',
    ],
    'step-10-01': [
        r'The numerator is three equal terms: $3^2+3^2+3^2 = 3\cdot 9 = 27$.',
        r'The denominator is three equal terms too: $3^{-1}+3^{-1}+3^{-1} = 3\cdot\frac{1}{3} = 1$.',
        r'So the value is $\frac{27}{1} = 27$, and the answer is $\textbf{(D)}\ 27$.',
    ],
    'step-10-03': [
        r'A mean of $12$ over five numbers means they sum to $5 \cdot 12 = 60$.',
        r'A mean of $10$ over the four that remain means they sum to $4 \cdot 10 = 40$.',
        r'The removed number is the difference: $60 - 40 = 20$, so the answer is $\textbf{(E)}\ 20$.',
    ],
    'step-10-04': [
        r'Call the original price $P$. After a $20\%$ increase it is $1.2P$.',
        r'A $25\%$ decrease keeps $75\%$ of that: $0.75 \cdot 1.2P = 0.9P$.',
        r'So the final price is $90\%$ of the original: $\textbf{(B)}\ 90\%$.',
    ],
    'step-10-05': [
        r'Let Ben be $b$ years old, so Ana is $3b$.',
        r'In $12$ years: $3b + 12 = 2(b + 12) = 2b + 24$, so $b = 12$.',
        r'Ana is $3 \cdot 12 = 36$. (Check: in 12 years, $48 = 2 \cdot 24$.) The answer is $\textbf{(C)}\ 36$.',
    ],
    'step-10-06': [
        r'Multiples of $3$ below $100$: $\lfloor 99/3 \rfloor = 33$.',
        r'Multiples of $5$ below $100$: $\lfloor 99/5 \rfloor = 19$.',
        r'Multiples of both, i.e. of $15$: $\lfloor 99/15 \rfloor = 6$.',
        r'Exactly one of the two: $(33 - 6) + (19 - 6) = 27 + 13 = 40$, so the answer is $\textbf{(C)}\ 40$.',
    ],
    'step-10-08': [
        r'The odd digits are $1, 3, 5, 7, 9$: five of them, and none is $0$.',
        r'Choose the hundreds digit ($5$ ways), then the tens ($4$ left), then the units ($3$ left).',
        r'That gives $5 \cdot 4 \cdot 3 = 60$ numbers, so the answer is $\textbf{(A)}\ 60$.',
    ],
    'step-10-09': [
        r'$10^{20} - 1$ is twenty $9$s, and $10^{20} - 20 = (10^{20} - 1) - 19$.',
        r'Subtracting $19$ only changes the last two digits: $\ldots 99 - 19 = \ldots 80$. (Check with $10^4 - 20 = 9980$.)',
        r'So the number is eighteen $9$s followed by $8$ and $0$, with digit sum $18 \cdot 9 + 8 = 170$.',
        r'The answer is $\textbf{(C)}\ 170$.',
    ],
    'step-10-10': [
        r'There are $6 \cdot 6 = 36$ equally likely outcomes.',
        r'The product is not a multiple of $3$ exactly when neither die shows $3$ or $6$: $4 \cdot 4 = 16$ outcomes.',
        r'So the probability it is a multiple of $3$ is $1 - \frac{16}{36} = \frac{20}{36} = \frac{5}{9}$, answer $\textbf{(D)}\ \frac{5}{9}$.',
    ],
    'step-10-11': [
        r'By Vieta, the roots $r$ and $s$ satisfy $r + s = 7$ and $rs = k$.',
        r'With $r - s = 3$, adding and subtracting gives $r = 5$ and $s = 2$.',
        r'So $k = rs = 10$. (Check: $x^2 - 7x + 10 = (x-2)(x-5)$.) The answer is $\textbf{(C)}\ 10$.',
    ],
    'step-10-12': [
        r'$DE \parallel BC$, so triangles $ADE$ and $ABC$ are similar (they share angle $A$ and have equal corresponding angles).',
        r'The ratio of similarity is $\frac{AD}{AB} = \frac{4}{12} = \frac{1}{3}$, so areas are in ratio $\frac{1}{9}$.',
        r'Then $[ABC] = 9 \cdot 5 = 45$.',
        r'The quadrilateral is what is left: $45 - 5 = 40$, so the answer is $\textbf{(D)}\ 40$.',
    ],
    'step-10-13': [
        r'Powers of $3$ modulo $7$ go $3, 2, 6, 4, 5, 1$, then repeat: the cycle has length $6$.',
        r'Since $100 = 6 \cdot 16 + 4$, we have $3^{100} \equiv 3^4 \pmod 7$.',
        r'$3^4 = 81 = 77 + 4$, so the remainder is $4$: $\textbf{(D)}\ 4$.',
    ],
    'step-10-15': [
        r'With one vertex at the origin, the shoelace formula is Area $= \frac{1}{2}\lvert x_1 y_2 - x_2 y_1 \rvert$.',
        r'Using $(8, 2)$ and $(3, 7)$: $\frac{1}{2}\lvert 8 \cdot 7 - 3 \cdot 2 \rvert = \frac{1}{2} \cdot 50 = 25$.',
        r'The answer is $\textbf{(D)}\ 25$.',
    ],
    'step-10-16': [
        r'The hypotenuse is $\sqrt{8^2 + 15^2} = \sqrt{289} = 17$.',
        r'The area is $\frac{1}{2} \cdot 8 \cdot 15 = 60$ and the semiperimeter is $\frac{8 + 15 + 17}{2} = 20$.',
        r'For any triangle, area $= r \cdot s$, so $r = \frac{60}{20} = 3$: $\textbf{(C)}\ 3$.',
    ],
    'step-10-17': [
        r'Give each child one candy first; $3$ candies remain, with no restriction left.',
        r'Distributing $3$ identical candies to $3$ children is a stars-and-bars count: $\binom{3 + 2}{2} = 10$.',
        r'The answer is $\textbf{(B)}\ 10$.',
    ],
    'step-10-18': [
        r'An arithmetic sum is the number of terms times the average of the first and last: $S_{10} = \frac{10}{2}(a_1 + a_{10})$.',
        r'So $5(5 + a_{10}) = 185$, giving $5 + a_{10} = 37$ and $a_{10} = 32$.',
        r'(Check: the common difference is $3$, and $5 + 9 \cdot 3 = 32$.) The answer is $\textbf{(C)}\ 32$.',
    ],
    'step-10-19': [
        r'A divisor has the form $2^a 3^b 5^c$ with $0 \le a \le 4$, $0 \le b \le 3$, $0 \le c \le 2$.',
        r'It is a perfect square exactly when $a$, $b$, $c$ are all even.',
        r'That leaves $a \in \{0, 2, 4\}$, $b \in \{0, 2\}$, $c \in \{0, 2\}$: $3 \cdot 2 \cdot 2 = 12$ choices.',
        r'The answer is $\textbf{(C)}\ 12$.',
    ],
    'step-10-20': [
        r'The square has area $4$.',
        r'Points within $1$ of a vertex and inside the square form a quarter-disc of radius $1$ at each corner, each of area $\frac{\pi}{4}$.',
        r'Adjacent vertices are $2$ apart, so neighbouring quarter-discs only touch at a side’s midpoint, and opposite ones are $2\sqrt{2}$ apart: there is no overlap. The total area is $\pi$.',
        r'The probability is $\frac{\pi}{4}$, answer $\textbf{(C)}\ \frac{\pi}{4}$.',
    ],
    'step-10-21': [
        r'Multiply both sides by $6xy$: $6y + 6x = xy$, i.e. $xy - 6x - 6y = 0$.',
        r'Add $36$ to both sides to factor: $(x - 6)(y - 6) = 36$.',
        r'Both factors are greater than $-6$. If both were negative, each would be at least $-5$ and their product at most $25 < 36$, so both are positive.',
        r'Each positive divisor $d$ of $36$ gives one ordered pair ($x - 6 = d$, $y - 6 = \frac{36}{d}$), and $36$ has $9$ divisors. The answer is $\textbf{(C)}\ 9$.',
    ],
    'step-10-22': [
        r'Joining every other vertex gives an equilateral triangle whose sides are the hexagon’s short diagonals.',
        r'A short diagonal spans two sides meeting at $120^\circ$: $d^2 = 2^2 + 2^2 - 2 \cdot 2 \cdot 2 \cos 120^\circ = 12$, so $d = 2\sqrt{3}$.',
        r'The triangle’s area is $\frac{\sqrt{3}}{4} \cdot (2\sqrt{3})^2 = 3\sqrt{3}$, answer $\textbf{(C)}\ 3\sqrt{3}$.',
    ],
    'step-10-23': [
        r'Let $a_n$ count the subsets of $\{1, \ldots, n\}$ with no two consecutive elements.',
        r'Either $n$ is left out ($a_{n-1}$ ways) or $n$ is in and $n - 1$ must be out ($a_{n-2}$ ways), so $a_n = a_{n-1} + a_{n-2}$.',
        r'Start from $a_1 = 2$ ($\varnothing$, $\{1\}$) and $a_2 = 3$; then $5, 8, 13, 21, 34, 55, 89, 144$.',
        r'So $a_{10} = 144$ (the empty set included), answer $\textbf{(D)}\ 144$.',
    ],
    'step-10-24': [
        r'There are $\binom{10}{3} = 120$ ways to choose the three numbers.',
        r'Order them $a < b < c$. Only the largest side can fail, so they form a triangle exactly when $a + b > c$.',
        r'Count pairs $a < b < c$ with $a + b > c$ for each $c$: $c = 4, 5, \ldots, 10$ give $1, 2, 4, 6, 9, 12, 16$.',
        r'That is $50$ triangles, so the probability is $\frac{50}{120} = \frac{5}{12}$: $\textbf{(C)}\ \frac{5}{12}$.',
    ],
    'step-10-25': [
        r'Put $x = 2$: $f(2) + 2f\!\left(\tfrac{1}{2}\right) = 6$.',
        r'Put $x = \tfrac{1}{2}$: $f\!\left(\tfrac{1}{2}\right) + 2f(2) = \tfrac{3}{2}$.',
        r'Write $a = f(2)$, $b = f(\tfrac{1}{2})$: $a + 2b = 6$ and $4a + 2b = 3$ (the second equation doubled). Subtracting, $3a = -3$.',
        r'So $f(2) = -1$ (and $f(\tfrac12) = \tfrac{7}{2}$ checks both equations). The answer is $\textbf{(B)}\ -1$.',
    ],
    'step-12-01': [
        r'By change of base, $\log_k (k + 1) = \frac{\ln (k + 1)}{\ln k}$.',
        r'The product from $k = 2$ to $63$ telescopes: $\frac{\ln 3}{\ln 2} \cdot \frac{\ln 4}{\ln 3} \cdots \frac{\ln 64}{\ln 63} = \frac{\ln 64}{\ln 2}$.',
        r'That is $\log_2 64 = 6$, answer $\textbf{(B)}\ 6$.',
    ],
    'step-12-02': [
        r'Square both sides: $\sin^2\theta + 2\sin\theta\cos\theta + \cos^2\theta = \frac{49}{25}$.',
        r'Since $\sin^2\theta + \cos^2\theta = 1$ and $2\sin\theta\cos\theta = \sin 2\theta$: $1 + \sin 2\theta = \frac{49}{25}$.',
        r'So $\sin 2\theta = \frac{24}{25}$, answer $\textbf{(C)}\ \frac{24}{25}$.',
    ],
    'step-12-03': [
        r'$(1 + i)^2 = 1 + 2i + i^2 = 2i$.',
        r'So $(1 + i)^{10} = (2i)^5 = 32\, i^5$.',
        r'$i^4 = 1$, so $i^5 = i$ and the value is $32i$: $\textbf{(D)}\ 32i$.',
    ],
    'step-12-04': [
        r'For $x^3 - 4x^2 + 5x - 3$, Vieta gives $r + s + t = 4$ and $rs + st + tr = 5$.',
        r'$r^2 + s^2 + t^2 = (r + s + t)^2 - 2(rs + st + tr) = 16 - 10 = 6$.',
        r'The answer is $\textbf{(B)}\ 6$.',
    ],
    'step-12-05': [
        r'Place the cube as $[0, 2]^3$ with the vertex at $(0, 0, 0)$.',
        r'The faces that miss it are $x = 2$, $y = 2$, $z = 2$; by symmetry use $x = 2$, whose center is $(2, 1, 1)$.',
        r'The distance is $\sqrt{2^2 + 1^2 + 1^2} = \sqrt{6}$: $\textbf{(B)}\ \sqrt{6}$.',
    ],
    'step-12-06': [
        r'Let $u = \log_2 x$: $u^2 - 5u + 6 = 0$, so $(u - 2)(u - 3) = 0$.',
        r'$u = 2$ gives $x = 4$ and $u = 3$ gives $x = 8$.',
        r'The product is $4 \cdot 8 = 32$, answer $\textbf{(C)}\ 32$.',
    ],
    'step-12-07': [
        r'Take reciprocals: $\frac{1}{a_{n+1}} = \frac{1 + a_n}{a_n} = \frac{1}{a_n} + 1$.',
        r'So $b_n = \frac{1}{a_n}$ starts at $b_1 = 1$ and goes up by $1$ each step: $b_n = n$.',
        r'Then $a_{2026} = \frac{1}{2026}$, answer $\textbf{(B)}\ \frac{1}{2026}$.',
    ],
    'step-12-08': [
        r'The solutions of $z^{12} = 1$ are $z = e^{2\pi i k/12}$ for $k = 0, 1, \ldots, 11$.',
        r'Then $z^3 = e^{2\pi i k/4} = i^k$.',
        r'$i^k$ is real exactly when $k$ is even: $k = 0, 2, 4, 6, 8, 10$, six values. The answer is $\textbf{(D)}\ 6$.',
    ],
    'step-12-09': [
        r'Since $\sin(90^\circ - k^\circ) = \cos k^\circ$, pair term $k$ with term $90 - k$ for $k = 1, \ldots, 44$.',
        r'Each pair is $\sin^2 k^\circ + \cos^2 k^\circ = 1$, giving $44$.',
        r'The middle term $k = 45$ is unpaired: $\sin^2 45^\circ = \frac{1}{2}$.',
        r'The total is $44 + \frac{1}{2} = \frac{89}{2}$, answer $\textbf{(B)}\ \frac{89}{2}$.',
    ],
    'step-12-10': [
        r'Split the fraction so the product of the terms is constant: $x^2 + \frac{16}{x} = x^2 + \frac{8}{x} + \frac{8}{x}$.',
        r'By AM-GM on three terms: $x^2 + \frac{8}{x} + \frac{8}{x} \ge 3\sqrt[3]{x^2 \cdot \frac{8}{x} \cdot \frac{8}{x}} = 3\sqrt[3]{64} = 12$.',
        r'Equality needs $x^2 = \frac{8}{x}$, i.e. $x = 2$, and indeed $4 + 8 = 12$. The answer is $\textbf{(C)}\ 12$.',
    ],
    'step-12-11': [
        r'There are $6! = 720$ permutations.',
        r'Count derangements with $D_n = (n - 1)(D_{n-1} + D_{n-2})$, $D_1 = 0$, $D_2 = 1$: $D_3 = 2$, $D_4 = 9$, $D_5 = 44$, $D_6 = 5(44 + 9) = 265$.',
        r'The probability is $\frac{265}{720} = \frac{53}{144}$, answer $\textbf{(B)}\ \frac{53}{144}$.',
    ],
    'step-12-12': [
        r'$1000 = 2^3 \cdot 5^3$, so each of $a, b, c$ is $2^{x} 5^{y}$ for some exponents.',
        r'The exponents of $2$ must sum to $3$: nonnegative solutions of $x_1 + x_2 + x_3 = 3$ number $\binom{5}{2} = 10$. The same holds for $5$.',
        r'The two choices are independent, so there are $10 \cdot 10 = 100$ triples: $\textbf{(C)}\ 100$.',
    ],
    'step-aime-01': [
        r'Multiples of $6$ up to $1000$: $\lfloor 1000/6 \rfloor = 166$.',
        r'Among them, divisible by $4$ means divisible by $\operatorname{lcm}(6, 4) = 12$: $83$. Divisible by $9$ means by $18$: $55$. By both means by $36$: $27$.',
        r'Inclusion-exclusion: $166 - 83 - 55 + 27 = 55$.',
        r'The answer is $\boxed{055}$.',
    ],
    'step-aime-04': [
        r'Since $b = 100 - a$, $\gcd(a, b) = \gcd(a, 100 - a) = \gcd(a, 100)$.',
        r'So we need $1 \le a \le 99$ with $\gcd(a, 100) = 1$, and each such $a$ gives one ordered pair.',
        r'Their number is $\varphi(100) = 100 \cdot \frac{1}{2} \cdot \frac{4}{5} = 40$.',
        r'The answer is $\boxed{040}$.',
    ],
    'step-aime-05': [
        r'Each trailing zero is a factor of $10 = 2 \cdot 5$, and factors of $2$ outnumber factors of $5$, so count the $5$s in $1000!$.',
        r'By Legendre: $\lfloor 1000/5 \rfloor + \lfloor 1000/25 \rfloor + \lfloor 1000/125 \rfloor + \lfloor 1000/625 \rfloor = 200 + 40 + 8 + 1$.',
        r'That is $249$, so the answer is $\boxed{249}$.',
    ],
    'step-aime-06': [
        r'A $0$ could only be the smallest digit, which would put it first: impossible, so the digits come from $1$-$9$.',
        r'Any $4$ distinct digits can be written in increasing order in exactly one way.',
        r'So the count is $\binom{9}{4} = 126$: $\boxed{126}$.',
    ],
    'step-aime-08': [
        r'There are $\binom{52}{2} = 1326$ pairs of cards.',
        r'Two hearts: $\binom{13}{2} = 78$. Two aces: $\binom{4}{2} = 6$. Both at once would need two aces of hearts, so there is no overlap.',
        r'The probability is $\frac{84}{1326} = \frac{14}{221}$, in lowest terms since $221 = 13 \cdot 17$.',
        r'So $m + n = 14 + 221 = 235$: $\boxed{235}$.',
    ],
    'step-aime-09': [
        r'$\lfloor \log_2 n \rfloor = k$ exactly when $2^k \le n < 2^{k+1}$, which holds for $2^k$ integers.',
        r'For $n < 1000$, $k$ runs up to $9$; the even values are $k = 0, 2, 4, 6, 8$, and $k = 8$ covers $256$-$511$, all below $1000$.',
        r'The count is $1 + 4 + 16 + 64 + 256 = 341$: $\boxed{341}$.',
    ],
    'step-aime-10': [
        r'Three consecutive positive integers with product $336$: since $7^3 = 343$, try $6 \cdot 7 \cdot 8 = 336$.',
        r'So the roots are $6, 7, 8$, and $b$ is the sum of their pairwise products.',
        r'$b = 6 \cdot 7 + 6 \cdot 8 + 7 \cdot 8 = 42 + 48 + 56 = 146$: $\boxed{146}$.',
    ],
    'step-aime-11': [
        r'Work modulo $8$ and $125$ separately, since $1000 = 8 \cdot 125$. Modulo $8$, $2^{2026} \equiv 0$.',
        r'Modulo $125$, Euler gives $2^{100} \equiv 1$, so $2^{2026} \equiv 2^{26}$.',
        r'$2^{10} = 1024 \equiv 24$, $2^{20} \equiv 24^2 = 576 \equiv 76$, and $2^{26} = 2^{20} \cdot 64 \equiv 76 \cdot 64 = 4864 \equiv 114 \pmod{125}$.',
        r'The number below $1000$ that is $114 \bmod 125$ and $0 \bmod 8$: $114, 239, 364, 489, 614, 739, 864$, and $864 = 8 \cdot 108$.',
        r'The answer is $\boxed{864}$.',
    ],
    'step-aime-12': [
        r'Heron: $s = 21$ and the area is $\sqrt{21 \cdot 8 \cdot 7 \cdot 6} = 84$.',
        r'Inradius $r = \frac{84}{21} = 4$; circumradius $R = \frac{abc}{4K} = \frac{13 \cdot 14 \cdot 15}{336} = \frac{65}{8}$.',
        r'Euler’s formula: $OI^2 = R(R - 2r) = \frac{65}{8} \cdot \left(\frac{65}{8} - 8\right) = \frac{65}{8} \cdot \frac{1}{8} = \frac{65}{64}$.',
        r'So $m + n = 65 + 64 = 129$: $\boxed{129}$.',
    ],
    'step-aime-13': [
        r'The number of rolls $N$ until the first $6$ has $E[N] = 6$ (success probability $\frac{1}{6}$).',
        r'Every roll before the last is known not to be a $6$, so it is uniform on $1$-$5$ with mean $3$; there are $N - 1$ of them, on average $5$.',
        r'By linearity, the expected sum is $3 \cdot 5 + 6 = 21$: $\boxed{021}$.',
    ],
    'step-aime-14': [
        r'The order of $2$ modulo $125$ divides $\varphi(125) = 100$; if it were less than $100$ it would divide $50$ or $20$.',
        r'$2^{20}$: $2^{10} \equiv 24$, so $2^{20} \equiv 576 \equiv 76 \ne 1$.',
        r'$2^{50} = 2^{40} \cdot 2^{10}$: $2^{40} \equiv 76^2 = 5776 \equiv 26$, so $2^{50} \equiv 26 \cdot 24 = 624 \equiv 124 \equiv -1 \ne 1$.',
        r'So the order is $100$, and the least $n$ is $\boxed{100}$.',
    ],
    'step-aime-15': [
        r'Let $F(x) = \prod_{k=1}^{9} (1 + x^k)$; the number of subsets with sum divisible by $3$ is $\frac{F(1) + F(\omega) + F(\omega^2)}{3}$, where $\omega = e^{2\pi i/3}$.',
        r'$F(1) = 2^9 = 512$.',
        r'For $F(\omega)$, the exponents run $1, 2, 0$ mod $3$ in blocks of three, and each block gives $(1 + \omega)(1 + \omega^2)(1 + 1) = (1 + \omega + \omega^2 + \omega^3) \cdot 2 = 1 \cdot 2 = 2$. Three blocks give $F(\omega) = 8$, and likewise $F(\omega^2) = 8$.',
        r'The count is $\frac{512 + 8 + 8}{3} = 176$: $\boxed{176}$.',
    ],
    'step-drill-01': [
        r'Let $P$ be at distances $a, b$ from the left and right sides and $c, d$ from the bottom and top, with $A, B, C, D$ the bottom-left, bottom-right, top-right and top-left corners.',
        r'By Pythagoras: $PA^2 = a^2 + c^2$, $PB^2 = b^2 + c^2$, $PC^2 = b^2 + d^2$, $PD^2 = a^2 + d^2$.',
        r'So $PA^2 + PC^2 = PB^2 + PD^2$ (both equal $a^2 + b^2 + c^2 + d^2$).',
        r'$PD^2 = 9 + 25 - 16 = 18$, so $PD = 3\sqrt{2}$: $\textbf{(C)}\ 3\sqrt{2}$.',
    ],
    'step-drill-02': [
        r'Write each number below $1000$ as three digits $abc$ with leading zeros; we need $a + b + c = 10$ with each digit $0$-$9$.',
        r'Without the cap, stars and bars gives $\binom{12}{2} = 66$ solutions.',
        r'The cap only removes solutions with a digit equal to $10$ (the others then $0$): $3$ of them.',
        r'That leaves $63$ (and $000$ is not among them), so the answer is $\textbf{(C)}\ 63$.',
    ],
    'step-drill-03': [
        r'Let $E$ be the expected number of further flips from the start (or just after a tail), and $F$ the expected number just after one head.',
        r'From the start: $E = 1 + \tfrac{1}{2}F + \tfrac{1}{2}E$. After a head: $F = 1 + \tfrac{1}{2} \cdot 0 + \tfrac{1}{2}E$.',
        r'The first gives $E = 2 + F$; substituting, $F = 1 + \tfrac{1}{2}(2 + F)$, so $F = 4$ and $E = 6$.',
        r'The answer is $\textbf{(C)}\ 6$.',
    ],
    'step-drill-04': [
        r'$7^2 = 49$ and $7^4 = 2401 \equiv 1 \pmod{100}$.',
        r'$2026 = 4 \cdot 506 + 2$, so $7^{2026} \equiv 7^2 = 49 \pmod{100}$.',
        r'The last two digits are $49$: $\textbf{(D)}\ 49$.',
    ],
    'step-drill-06': [
        r'All right/up paths from $(0, 0)$ to $(6, 6)$: $\binom{12}{6} = 924$.',
        r'A bad path touches the line $y = x + 1$. Reflect its part after the first touch across that line: it now ends at $(5, 7)$, and this matches bad paths one-to-one with all paths to $(5, 7)$.',
        r'There are $\binom{12}{5} = 792$ of those.',
        r'Good paths: $924 - 792 = 132$, the Catalan number $C_6$. The answer is $\textbf{(B)}\ 132$.',
    ],
    'step-drill-08': [
        r'Suppose Ava is a knight. Then Ben, who calls her a knave, is a knave, and since exactly one is a knave, Cal is a knight. But Cal claims to be the same type as Ben, which is false: a contradiction.',
        r'So Ava is a knave, Ben’s statement is true, and Ben is a knight.',
        r'If Cal were a knight, Ava would be the only knave, making her statement true: impossible. So Cal is a knave, and indeed his claim (same type as Ben) is false.',
        r'Ava and Cal are knaves, so exactly one is a knight: $\textbf{(B)}\ 1$.',
    ],
}
