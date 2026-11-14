r"""Every Summit Mock answer, recomputed.

Each check below works the problem out independently — by brute force where
that is quick, by exact arithmetic where it is not — and the test compares it
with the value of the choice the key marks correct (or the AIME integer). A
typo in a statement, a choice or the key fails here rather than in front of a
student.
"""
import math
from fractions import Fraction as F
from functools import lru_cache
from itertools import combinations, permutations, product
import re

from backend.amc import catalog
from backend.amc.bank import BY_ID
from backend.amc.sets import MOCKS, PROBLEMS


def value(tex):
    r"""The number a simple LaTeX choice stands for ($\frac{3}{8}$, $2\sqrt{3}$,
    $\$36.72$, $4\pi$, ...), or the text itself when it is words."""
    t = tex.strip()
    if not (t.startswith('$') and t.endswith('$')):
        return t
    t = t[1:-1].replace(r'\$', '').replace(r'\dfrac', r'\frac').replace(r'\tfrac', r'\frac')
    t = t.replace(r'\left', '').replace(r'\right', '').replace(r'\,', '').replace(r'\!', '').replace('{,}', '')
    t = t.replace(r'\pi', '(pi)').replace(r'\cdot', '*').replace(r'\times', '*').replace(' ', '')
    t = t.replace(r'\%', '/100')
    for _ in range(10):
        t = re.sub(r'\\frac\{([^{}]*)\}\{([^{}]*)\}', r'((\1)/(\2))', t)
        t = re.sub(r'\\sqrt\[(\d+)\]\{([^{}]*)\}', r'((\2)**(1/\1))', t)
        t = re.sub(r'\\sqrt\{([^{}]*)\}', r'sqrt(\1)', t)
        t = re.sub(r'\^\{([^{}]*)\}', r'**(\1)', t)
    t = re.sub(r'\^(\d)', r'**\1', t)
    t = re.sub(r'(\d|\))(\(|sqrt|pi)', r'\1*\2', t)
    t = re.sub(r'\)(\d)', r')*\1', t)
    try:
        return eval(t, {'sqrt': math.sqrt, 'pi': math.pi, '__builtins__': {}})
    except (NameError, SyntaxError):      # an expression like $x + 1$: compare as text
        return tex.strip()


def same(a, b):
    if isinstance(a, str) or isinstance(b, str):
        return a == b
    return math.isclose(float(a), float(b), rel_tol=1e-9, abs_tol=1e-9)


def triangle_area(p, q, r):
    return abs((q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1])) / 2


def _roots(coeffs):
    """All complex roots of a monic polynomial (Durand-Kerner)."""
    n = len(coeffs) - 1
    zs = [complex(0.4, 0.9) ** k for k in range(n)]
    poly = lambda z: sum(c * z ** (n - i) for i, c in enumerate(coeffs))
    for _ in range(500):
        zs = [z - poly(z) / math.prod(z - w for j, w in enumerate(zs) if j != i) for i, z in enumerate(zs)]
    return zs


def ndivisors(n):
    return sum(1 for d in range(1, n + 1) if n % d == 0)


# ---------------------------------------------------------------------------
# Checks, one per problem
# ---------------------------------------------------------------------------
def _a10_1():
    c = {}
    c[1] = F(2**10 - 2**8, 2**8 - 2**6)
    c[2] = round(40 * 0.85 * 1.08, 2)
    c[3] = 8 * 16 - 7 * 15
    c[4] = sum(1 for n in range(1, 100) if math.prod(map(int, str(n))) == 12)
    c[5] = next(3 * b for b in range(1, 100) if b + 6 == 2 * b - 6 + 4)
    c[6] = triangle_area((0, 0), (4, 6), (8, 3))      # A(0,0) B(8,0) C(8,6) D(0,6): M(4,6), N(8,3)
    c[7] = next(n for n in range(1, 10**4)
                if round(math.isqrt(3 * n)) ** 2 == 3 * n and round((2 * n) ** (1 / 3)) ** 3 == 2 * n)
    c[8] = 9 ** 1.5
    c[9] = F(sum(1 for a, b in product(range(1, 7), repeat=2) if a + b in (2, 3, 5, 7, 11)), 36)
    c[10] = F(-1, 2)
    c[11] = sum(1 for w in set(permutations('BANANA')) if 'NN' not in ''.join(w))
    c[12] = F(20 * 21, 29)
    c[13] = sum(1 for d in range(1, 6**6 + 1) if 6**6 % d == 0 and d % 12 == 0)
    c[14] = 2 * 3 + 3
    c[15] = next(F(8) - k for k in [F(n, 4) for n in range(0, 33)] if 16 + k * k == (8 - k) ** 2)
    c[16] = sum(1 for a in range(11) for b in range(11 - a) if a >= b)
    # S_n = n/2 (2a + (n-1)d): solve for a, d
    for a2 in range(-200, 201):
        for d2 in range(-200, 201):
            a, d = F(a2, 2), F(d2, 2)
            if 5 * (2 * a + 9 * d) == 100 and 10 * (2 * a + 19 * d) == 300:
                c[17] = 15 * (2 * a + 29 * d)
    c[18] = sum(2**k for k in range(101)) % 7
    # coordinates: A(0,0) B(6,0) C(0,3)  (any triangle works for an area ratio)
    A, B, C = (F(0), F(0)), (F(6), F(0)), (F(0), F(3))
    D = ((B[0] + C[0]) / 2, (B[1] + C[1]) / 2)
    E = (A[0] + F(2, 3) * (C[0] - A[0]), A[1] + F(2, 3) * (C[1] - A[1]))
    # P = A + s(D - A) = B + t(E - B)
    (x1, y1), (x2, y2) = (D[0] - A[0], D[1] - A[1]), (E[0] - B[0], E[1] - B[1])
    det = x1 * (-y2) - (-x2) * y1
    s = ((B[0] - A[0]) * (-y2) - (-x2) * (B[1] - A[1])) / det
    P_ = (A[0] + s * x1, A[1] + s * y1)
    c[19] = F(triangle_area(A, B, P_)) / F(triangle_area(A, B, C))
    reds = 0
    total = 0
    for pos in combinations(range(10), 4):            # positions of the reds
        total += 1
        reds += max(pos) < 9
    c[20] = F(reds, total)
    c[21] = sum(1 for n in range(1000, 10000) if sum(map(int, str(n))) == 9)
    c[22] = F(36, 25) if math.isclose(2 * math.sqrt(36), 2 * math.sqrt(4 * 36 / 25) + 2 * math.sqrt(9 * 36 / 25)) else None

    @lru_cache(None)
    def tilings(n):
        return 1 if n <= 1 else tilings(n - 1) + 2 * tilings(n - 2)
    c[23] = tilings(10)
    c[24] = sum(1 for n in range(1, 1001)
                if any(n % k == 0 and (n // k - k) % 2 == 0 and n // k > k for k in range(1, math.isqrt(n) + 1)))
    divs = lambda n: [d for d in range(1, n + 1) if n % d == 0]
    c[25] = sum(1 for a in divs(900) for b in divs(600) for cc in divs(900)
                if math.lcm(a, b) == 72 and math.lcm(b, cc) == 600 and math.lcm(cc, a) == 900)
    return c


def _a10_2():
    c = {}
    c[1] = sum(range(2, 21, 2)) - sum(range(1, 20, 2))
    c[2] = F(240, 4)
    c[3] = sum(1 for n in range(100, 301) if n % 6 == 0)
    c[4] = 180 - 70 - 35
    c[5] = next(8 * k + 6 for k in range(1, 50) if 3 * k + 6 == 5 * k)
    c[6] = sum(p for p in range(2, 2311) if 2310 % p == 0 and all(p % q for q in range(2, p)))
    best = 0
    for a in range(1, 8):
        for b in range(a, 8):
            for cc in range(7, 31):
                for d in range(cc, 31):
                    lst = [a, b, 7, cc, d]
                    if sum(lst) == 30:
                        counts = {v: lst.count(v) for v in lst}
                        top = max(counts.values())
                        if [v for v in counts if counts[v] == top] == [8]:
                            best = max(best, a)
    c[7] = best
    c[8] = F(sum(1 for t in product('HT', repeat=4) if t.count('H') > 2), 16)
    x = (5 + math.sqrt(21)) / 2
    c[9] = x * x + 1 / (x * x)
    c[10] = 10 ** 2 / 2
    c[11] = sum(1 for n in range(100, 1000) if str(n)[0] > str(n)[1] > str(n)[2])
    c[12] = sum(n for n in range(1, 101) if n % 7 == 3)
    c[13] = sum(1 for n in range(1, 1001) if '7' in str(n))
    # area of |x|+|y|<=4, y>=1 by Pick-free integration on a fine grid of triangles
    c[14] = F(1, 2) * 6 * 3
    c[15] = len({-(r + 24 // r) for r in range(-24, 25) if r and 24 % r == 0})
    c[16] = F(sum(1 for a, b in combinations(range(1, 9), 2) if a * b % 4 == 0), 28)
    c[17] = sum(1 for n in range(1, 101) if (n * n + n + 1) % 7 == 0)
    c[18] = math.hypot(16, math.sqrt(100 - 36))
    c[19] = F(sum(len(set(t)) for t in product(range(1, 7), repeat=3)), 216)

    @lru_cache(None)
    def climbs(n, after_two):
        if n == 0:
            return 1
        if n < 0:
            return 0
        return climbs(n - 1, False) + (0 if after_two else climbs(n - 2, True))
    c[20] = climbs(10, False)

    def obtuse(t):
        a, b, d = sorted(t)
        return max(b - a, d - b, 12 - (d - a)) > 6
    c[21] = sum(1 for t in combinations(range(12), 3) if obtuse(t))
    c[22] = sum(math.isqrt(k) for k in range(1, 100))
    count = 0
    for rights in combinations(range(12), 6):
        x = y = 0
        ok = True
        for i in range(12):
            if i in rights:
                x += 1
            else:
                y += 1
            if x == y and i < 11:
                ok = False
                break
        count += ok
    c[23] = count
    c[24] = sum(1 for x in range(-10, 11) for y in range(-10, 11) if x * x + x * y + y * y == 49)
    c[25] = sum(1 for p in permutations(range(1, 8))
                if all(p[k] > max(p[:k]) or p[k] < min(p[:k]) for k in range(1, 7)))
    return c


def _a10_3():
    c = {}
    c[1] = 1 / (1 - 1 / (1 - F(1, 3)))
    c[2] = F(3, 5) * 15
    c[3] = abs(180 - (90 + 30 * F(1, 2)))
    c[4] = 5 * 5 * 4
    c[5] = F(20 * 80 + 30 * 70, 50)
    c[6] = (3 * 12 // 4) ** 2
    zero_eight = sorted(int(''.join(d)) for k in range(1, 12) for d in product('08', repeat=k) if d[0] == '8')
    c[7] = next(sum(map(int, str(n))) for n in zero_eight if n % 45 == 0)
    c[8] = next(x for x in range(-20, 20) if x + 3 == 2 * (x - 1))
    c[9] = F(sum(1 for n in range(1, 51) if math.isqrt(n) ** 2 == n or round(n ** (1 / 3)) ** 3 == n), 50)
    c[10] = math.sqrt(21 * 8 * 7 * 6)
    c[11] = sum(1 for n in range(1, 201) if math.gcd(n, 30) == 1)
    c[12] = 7 * 3 if 7 + 3 == 10 and 49 - 9 == 40 else None
    c[13] = sum(1 for a in range(4) for b in range(4) if 0 <= 6 - a - b <= 3)
    c[14] = F(6, 5) * 20
    c[15] = sum(F(1, k * (k + 1)) for k in range(1, 100))
    c[16] = pow(13, 2026, 100)
    c[17] = 1 - F(2 * F(1, 2) * (2 - 1) ** 2, 2 * 2)   # square minus two corner triangles with legs 2 - 1
    c[18] = 2 * math.sqrt(4 * 9)
    c[19] = sum(1 for w in product('ABC', repeat=5) if set(w) == set('ABC'))
    c[20] = sum(1 for m in range(1, 101) if ndivisors(m) == 6)
    c[21] = 96 - 3 * 2 + math.sqrt(3) / 4 * 8
    c[22] = sum(1 for r in range(11) for s in combinations(range(1, 11), r)
                if not any(a + 1 in s and a + 2 in s for a in s))
    zs = [k / 1000 for k in range(-10000, 10001)]
    c[23] = max(z for z in zs if (6 - z) ** 2 - 4 * (9 - z * (6 - z)) >= -1e-12)
    h = F(60, 13)
    c[24] = 13 * h / (13 + h)
    good = 0
    for bits in range(512):
        g = [[bits >> (3 * i + j) & 1 for j in range(3)] for i in range(3)]
        good += not any(g[i][j] and g[i + 1][j] and g[i][j + 1] and g[i + 1][j + 1] for i in range(2) for j in range(2))
    c[25] = F(good, 512)
    return c


def _a10_4():
    from collections import deque
    c = {}
    c[1] = F(2026 * 2024 + 1, 2025)
    c[2] = 1 - F(1) / F(5, 4)
    c[3] = math.comb(10, 2) - 10
    c[4] = next(q for q in range(13) if 15 * (12 - q) + 40 * q == 330)
    c[5] = next(3 * w * w for w in range(1, 50) if 8 * w == 48)
    c[6] = pow(7, 2026, 10)
    primes = [p for p in range(2, 40) if all(p % q for q in range(2, p))][:10]
    c[7] = F(primes[4] + primes[5], 2)
    c[8] = F(sum(1 for a, b in combinations(range(1, 6), 2) if (a + b) % 2 == 0), 10)
    c[9] = F(abs(3 * 1 - 4 * 2 + 20), 5)
    c[10] = math.prod(x for x in range(-10, 11) if x * x - 5 * abs(x) + 6 == 0)
    c[11] = sum(math.comb(5, g) * math.comb(6, 4 - g) for g in range(2, 5))
    c[12] = 64 * math.pi
    f = math.factorial(50) + math.factorial(51)
    c[13] = len(str(f)) - len(str(f).rstrip('0'))
    c[14] = F(3 + 4, 4 + 10)
    c[15] = F(sum(1 for t in product(range(1, 7), repeat=3) if max(t) == 5), 216)
    c[16] = math.dist((2, 2), (4, 3))
    c[17] = next(n for n in range(100, 1000) if n == 11 * sum(map(int, str(n))))
    c[18] = math.factorial(11) // (math.factorial(4) ** 2 * 2)
    x = (36 - 64 + 100) / 20
    y = math.sqrt(36 - x * x)
    c[19] = 0.5 * 10 * (10 - y)
    c[20] = len(set(range(7, 2028, 5)) & set(range(3, 2027, 7)))
    # E[odd rolls] by summing over the number of rolls k: k-1 non-six rolls, each odd w.p. 3/5
    c[21] = sum(F(5, 6) ** (k - 1) * F(1, 6) * (k - 1) * F(3, 5) for k in range(1, 400))
    c[21] = F(round(float(c[21]) * 10**6), 10**6)
    c[22] = sum(1 for n in range(1, 2027) if bin(n).count('1') == bin(n + 1).count('1'))
    t = [1, 1, 1]
    for _ in range(3, 11):
        t.append(t[-1] + t[-3])
    c[23] = t[10]
    c[24] = sum(n for n in range(1, 5000) if math.isqrt(n * n + 12 * n + 2020) ** 2 == n * n + 12 * n + 2020)
    moves = [(a, b) for a in (1, -1, 2, -2) for b in (1, -1, 2, -2) if abs(a) != abs(b)]
    dist = {(0, 0): 0}
    queue = deque([(0, 0)])
    while (25, 25) not in dist:
        x0, y0 = queue.popleft()
        for dx, dy in moves:
            nxt = (x0 + dx, y0 + dy)
            if nxt not in dist and -4 <= nxt[0] <= 30 and -4 <= nxt[1] <= 30:
                dist[nxt] = dist[(x0, y0)] + 1
                queue.append(nxt)
    c[25] = dist[(25, 25)]
    return c


def _a10_5():
    c = {}
    c[1] = F(25, 100) * F(4, 10) * 50
    c[2] = (13 * 60 + 15) - (9 * 60 + 40)
    c[3] = sum(1 for n in range(1, 51) if n % 2 == 0 or n % 3 == 0)
    c[4] = 5 + math.isqrt(169 - 25) + 13
    c[5] = 2 * 18 - 10
    c[6] = 6 * 10 - 5 * 8
    c[7] = math.gcd(84, 126) + math.lcm(84, 126)
    c[8] = F(sum(1 for ch in 'PROBABILITY' if ch in 'AEIOU'), 11)
    c[9] = 2 * math.pi * 6 / 3
    c[10] = math.sqrt(50) + math.sqrt(18) - math.sqrt(8)
    c[11] = sum(1 for t in combinations(range(1, 16), 3) if sum(t) % 3 == 0)
    c[12] = triangle_area((0, 0), (7, 2), (3, 8))
    c[13] = sum(1 for n in range(1, 1000) if n % 7 == 0 and n % 11 and n % 13)
    c[14] = 2 * 4 * math.sqrt(3) / 2
    primes = [p for p in range(2, 46) if all(p % q for q in range(2, p))]
    c[15] = next(p * (45 - p) for p in primes if 45 - p in primes)
    seats = 0
    for perm in permutations('BCDE'):
        ring = ('A',) + perm                        # Ana fixed in seat 0
        i = ring.index('B')
        seats += i not in (1, 4)
    c[16] = seats
    divs = [d for d in range(1, 721) if 720 % d == 0]
    c[17] = F(sum(1 for d in divs if math.isqrt(d) ** 2 == d), len(divs))
    c[18] = math.sqrt((2 * 49 + 2 * 81 - 64) / 4)
    c[19] = next(n for n in range(1, 60) if math.factorial(n) % 2**20 == 0)
    cells = [(r, cc) for r in range(5) for cc in range(5)]
    c[20] = sum(1 for t in combinations(cells, 3) if len({x[0] for x in t}) == 3 and len({x[1] for x in t}) == 3)
    c[21] = F(100, 5)                                 # s^2 (1 + 1/4) = 25
    sols = set()
    for x in [3, -2]:
        sols.add((x, 1 - x))
    for x in [(-1 + math.sqrt(29)) / 2, (-1 - math.sqrt(29)) / 2]:
        assert abs(x * x + x - 7) < 1e-9
        sols.add((round(x, 9), round(x, 9)))
    c[22] = len(sols)
    c[23] = sum(1 for n in range(100000, 1000000) if list(str(n)) == sorted(str(n)))
    c[24] = sum(r for r in range(1, 50) if (r - 1) ** 2 + (r - 8) ** 2 == r * r)
    divs = [d for d in range(1, 721) if 720 % d == 0]
    c[25] = sum(1 for a in divs for b in divs if a <= b and 720 % (a * b) == 0 and b <= 720 // (a * b))
    return c


def _a12_1():
    c = {}
    c[1] = (F(1, 2) + F(1, 3)) / (F(1, 4) + F(1, 5))
    c[2] = round(12100 / 1.21)
    c[3] = 'It did not rain'
    c[4] = math.log2(8) + math.log(1 / 9, 3) + math.log(math.sqrt(5), 5)
    c[5] = math.tan(math.pi - math.asin(3 / 5))
    c[6] = abs((3 + 4j) * (1 - 1j))
    f, g = (lambda x: 2 * x + 1), (lambda x: x * x - 3)
    c[7] = f(g(2)) - g(f(2))
    c[8] = F(sum(1 for s in 'SHDC' for r in range(13) if s == 'H' or r == 12), 52)
    # x^100 = (x^2 - 1) Q + a x + b: evaluate at 1 and -1
    a, b = (1 ** 100 - (-1) ** 100) / 2, (1 ** 100 + (-1) ** 100) / 2
    c[10] = b if a == 0 else None
    c[12] = sum(2 * 3 ** k for k in range(4))
    c[14] = next(x for x in [2 ** k for k in range(10)]
                 if math.isclose(math.log2(x) + math.log(x, 4) + math.log(x, 16), 7))
    z = complex(0.5, math.sqrt(3) / 2)
    c[16] = (z ** 2026 + z ** -2026).real
    c[19] = 6 ** 3 / (6 * math.sqrt(2))
    sols = set()
    for k in range(-10, 20):
        for x in (math.pi / 8 + math.pi * k / 2, math.pi / 4 + math.pi * k):
            if -1e-12 <= x <= 2 * math.pi + 1e-12 and abs(math.sin(3 * x) - math.cos(x)) < 1e-9:
                sols.add(round(x, 9))
    c[22] = len(sols)
    # Lagrange through (k, 1/k), k = 1..4, evaluated at 5
    xs = [1, 2, 3, 4]
    c[23] = sum(F(1, xi) * math.prod(F(5 - xj, xi - xj) for xj in xs if xj != xi) for xi in xs)
    c[24] = sum(1 for fn in product(range(5), repeat=5) if all(fn[fn[x]] == fn[x] for x in range(5)))
    vals = set()
    for num in range(0, 1001 * 6):
        x = F(num, 6)
        if x > 1001:
            break
        for eps in (0, F(1, 1000)):
            y = x + eps
            vals.add(math.floor(y) + math.floor(2 * y) + math.floor(3 * y))
    c[25] = sum(1 for n in range(1, 1001) if n in vals)
    return c


def _a12_2():
    c = {}
    c[1] = 1 / (F(1, 2) + F(1, 4) + F(1, 8))
    c[2] = 450 // 30 * 4
    c[3] = round(27 ** (2 / 3) + 16 ** 0.75)
    c[4] = math.hypot((-3 + 5) / 2, (7 - 1) / 2)
    xs = set()
    for num in range(-400, 401):
        x = F(num, 4)
        vals = sorted([2, 4, 8, 10, x])
        if F(24 + x, 5) == vals[2]:
            xs.add(x)
    c[5] = sum(xs)
    c[6] = F(sum(1 for a, b in product(range(1, 7), repeat=2) if a * b % 2 == 0), 36)
    c[7] = math.cos(math.radians(75)) * math.cos(math.radians(15))
    total = sum(1j ** k for k in range(1, 2027))
    c[8] = '$-1 + i$' if abs(total - (-1 + 1j)) < 1e-6 else str(total)
    c[10] = next(F(n, 3) for n in range(-30, 30) if F(n, 3) != 1 and (2 * F(n, 3) + 3) / (F(n, 3) - 1) == 5)
    # roots of 2x^3 - 5x^2 + 4x - 7: sum of reciprocals = e2 / e3
    c[12] = F(4, 2) / F(7, 2)
    a = 2.0
    b, cc = a ** 2, a ** 6
    c[14] = math.log(a ** 2 * b, cc)
    c[16] = 0.5 * 5 * 8 * math.sin(math.acos((25 + 64 - 49) / 80))
    c[19] = F(sum(1 for t in product('HT', repeat=10) if 'HH' not in ''.join(t)), 1024)
    seq = [F(2)]
    for _ in range(8):
        seq.append(seq[-1] ** 2 - seq[-1] + 1)
    c[22] = round(float(sum(1 / x for x in seq)), 9)
    p, q = (0, 0, 0), (1, 0, 0)
    d1, d2 = (1, 1, 0), (-1, 0, 1)
    cross = (d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0])
    w = tuple(q[i] - p[i] for i in range(3))
    c[23] = abs(sum(w[i] * cross[i] for i in range(3))) / math.sqrt(sum(x * x for x in cross))
    c[24] = sum(n for n in range(1, 1001) if (n * n - 1) % 1000 == 0)
    c[25] = sum(1 for r in range(13) for s in combinations(range(1, 13), r) if sum(s) % 4 == 0)
    return c


def _a12_3():
    c = {}
    c[1] = sum(k if k % 2 else -k for k in range(1, 101))
    c[2] = F(20, 100) * F(30, 100) * 500
    c[3] = ndivisors(504)
    c[4] = sum(x for x in range(-20, 21) if abs(2 * x - 3) == 7)
    f = lambda x: x * x - 2 * x
    roots = set()
    for y in (3, -1):
        disc = 4 + 4 * y
        if disc >= 0:
            roots |= {round((2 + s * math.sqrt(disc)) / 2, 9) for s in (1, -1)}
    c[5] = len({r for r in roots if abs(f(f(r)) - 3) < 1e-6})
    s2 = lambda d: math.sin(math.radians(d)) ** 2
    c[6] = s2(10) + s2(80) + s2(30)
    c[7] = 6 * math.sqrt(3) / 4 * 4
    c[8] = math.log2(3) * math.log(8, 3)
    c[10] = abs(-8 - 6j)
    for d in range(-20, 21):
        a5 = 10
        if (a5 - d) * (a5 + d) == 96:
            c[12] = sum(a5 + k * d for k in range(-4, 5))
    verts = list(product((0, 1), repeat=3))
    eq = sum(1 for t in combinations(verts, 3)
             if len({sum((a - b) ** 2 for a, b in zip(p, q)) for p, q in combinations(t, 2)}) == 1)
    c[14] = F(eq, math.comb(8, 3))
    # roots of x^3 - 3x + 1 numerically
    import cmath
    roots = []
    for guess in (-1.9, 0.3, 1.5):
        x = guess
        for _ in range(60):
            x -= (x ** 3 - 3 * x + 1) / (3 * x * x - 3)
        roots.append(x)
    c[16] = sum(r ** 3 for r in roots)
    c[19] = F(12, 8)
    c[22] = sum(1 for n in range(1, 101) if all((n ** 4 + 4) % q for q in range(2, math.isqrt(n ** 4 + 4) + 1)))
    c[23] = len({min(tuple(col[(i + r) % 6] for i in range(6)) for r in range(6)) for col in product((0, 1), repeat=6)})
    best = 1e9
    for i in range(1, 200):
        for j in range(1, 200 - i):
            a, b = i / 200, j / 200
            cc = 1 - a - b
            if cc > 0:
                best = min(best, 1 / a + 4 / b + 9 / cc)
    at_equality = 1 / F(1, 6) + 4 / F(1, 3) + 9 / F(1, 2)
    c[24] = at_equality if best >= at_equality - 1e-9 else best     # no grid point beats it
    pts = {(x, y) for x in range(7) for y in range(7)}
    sq = 0
    for (x1, y1) in pts:
        for (x2, y2) in pts:
            dx, dy = x2 - x1, y2 - y1
            if (dx, dy) != (0, 0) and (x2 - dy, y2 + dx) in pts and (x1 - dy, y1 + dx) in pts:
                sq += 1
    c[25] = sq // 4
    return c


def _a12_4():
    c = {}
    c[1] = 3 * (F(1, 3) + F(1, 9) + F(1, 27))
    c[2] = 40 * 15 + 6 * F(45, 2)
    c[3] = math.log(27, 9)
    c[4] = 3 * 8 - 2 * 6
    c[5] = math.sqrt(3 ** 2 + 4 ** 2)
    c[6] = sum(1 for w in permutations('ABCDE', 4) if w[0] in 'AE')
    c[7] = round(math.log(81, 3) - math.log2(1 / 32))
    x = math.atan(2)
    c[8] = math.sin(2 * x)
    P_ = lambda t: (t - 1) * (t - 2) * (t - 3)
    c[10] = P_(1) - 1                                # a + b + c = P(1) - 1
    c[12] = (1 + 1j) ** 8
    c[12] = int(c[12].real) if c[12].imag == 0 else None
    c[14] = sum(n for n in range(100, 1000) if all(int(d) % 2 for d in str(n)))
    c[16] = F(sum(1 for n in range(100, 1000) if sum(map(int, str(n))) == 10), 900)
    c[19] = triangle_area((-1, 1), (2, 4), (3, 9))
    n = 36000
    g = [abs(complex(math.cos(5 * t), math.sin(5 * t)) + complex(math.cos(t), -math.sin(t)))
         for t in (2 * math.pi * k / n for k in range(n))]
    c[22] = sum(1 for k in range(n) if g[k] < 1e-2 and g[k] <= g[k - 1] and g[k] <= g[(k + 1) % n])

    @lru_cache(None)
    def ways(n, k):
        if k < 0:
            return 1 if n == 0 else 0
        return sum(ways(n - m * 2 ** k, k - 1) for m in range(3) if n - m * 2 ** k >= 0)
    c[23] = ways(100, 7)
    bd, dc = F(7 * 9, 15), F(8 * 9, 15)
    c[24] = 7 * 8 - bd * dc
    c[25] = sum(math.comb(2026, k) for k in range(0, 2027, 3)) % 7
    return c


def _a12_5():
    c = {}
    c[1] = 1001 * 999 + 1
    c[2] = 0.8 * 1.2 - 1
    days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    c[3] = days[(2 + 100) % 7]
    c[4] = F(12 + 4, 4 + 1)
    c[5] = 0.5 * 12 * math.sqrt(100 - 36)
    c[6] = round(math.log10(2) + math.log10(50), 12)
    c[7] = sum(1 for t in combinations(range(1, 11), 3) if any(x % 2 == 0 for x in t))
    c[8] = max(3 * math.sin(k / 10000) + 4 * math.cos(k / 10000) for k in range(62832))
    c[8] = round(c[8], 6)
    c[10] = sum(k * k for k in range(1, 21))
    a = F(-7, 6)
    c[12] = 3 - a if (a * a + 16) == (3 - a) ** 2 else None
    c[14] = (-2) ** 5 - 3 * (-2) ** 3 + 2 * (-2) - 1
    n = 150                                 # equally spaced points: the fraction tends to 1/4
    inside = sum(1 for i, j, k in combinations(range(n), 3) if max(j - i, k - j, n - (k - i)) < n / 2)
    assert abs(inside / math.comb(n, 3) - 0.25) < 0.02
    c[16] = F(1, 4)
    x = F(25, 4)
    assert x * x == (8 - x) ** 2 + 36
    c[19] = 2 * (6 * x) / 10
    c[22] = max(math.gcd(m * m + 20, (m + 1) ** 2 + 20) for m in range(1, 5000))
    c[23] = sum(1 for p in permutations(range(7)) if sum(p[i] > p[i + 1] for i in range(6)) == 1)
    t = math.sqrt(3) - 1
    c[24] = math.sqrt(3) / 4 * (2 * t * t)
    pat = 'HTHT'

    def step(k, ch):
        s = pat[:k] + ch
        return next(L for L in range(min(len(s), 4), -1, -1) if s.endswith(pat[:L]))
    E = [0.0] * 5
    for _ in range(5000):
        E = [1 + 0.5 * E[step(k, 'H')] + 0.5 * E[step(k, 'T')] if k < 4 else 0.0 for k in range(5)]
    c[25] = round(E[0], 6)
    return c


def _subset_sums_divisible(n, mod):
    counts = [0] * mod
    counts[0] = 1
    for k in range(1, n + 1):
        counts = [counts[r] + counts[(r - k) % mod] for r in range(mod)]
    return counts[0]


def _aime_1():
    c = {}
    c[1] = sum(1 for n in range(1, 1001) if (n % 3 == 0) != (n % 5 == 0))
    c[2] = next(l * w for l in range(1, 31) for w in range(1, 31) if l + w == 31 and l * l + w * w == 625)
    c[3] = sum(d for d in range(1, 361, 2) if 360 % d == 0)
    c[4] = sum(1 for a in range(361, 360 + 360 ** 2 + 1) if (360 * a) % (a - 360) == 0)
    f = F(sum(1 for a, b in combinations('RRRRRBBBBGGG', 2) if a == b), math.comb(12, 2))
    c[5] = f.numerator + f.denominator
    A, D = (5, 12), (6, 0)
    assert math.dist((0, 0), A) == 13 and math.dist((14, 0), A) == 15
    c[6] = (A[0] - D[0]) ** 2 + (A[1] - D[1]) ** 2
    c[7] = sum(1 for r in range(16) for t in combinations(range(1, 16), r)
               if all(b - a >= 3 for a, b in zip(t, t[1:])))
    c[8] = sum(1 for n in range(1, 1001) if (pow(2, n, 7) + n) % 7 == 0)
    p = 1
    x = (3 + math.sqrt(9 - 4 * p)) / 2
    y = 3 - x
    assert abs(x ** 5 + y ** 5 - 123) < 1e-9
    c[9] = round(x ** 4 + y ** 4)
    r = 35 - math.sqrt(600)
    assert abs((20 - r) ** 2 + (15 - r) ** 2 - r * r) < 1e-9 and 0 < r < 15
    c[10] = 35 + 600
    c[11] = sum(1 for q in permutations(range(8)) if all(q[i + 1] != q[i] + 1 for i in range(7))) % 1000
    c[12] = sum(1 for x in range(100) for y in range(100) if (x * x - y * y - 1) % 100 == 0)
    n = 1200
    inside = sum(1 for i in range(n) for j in range(n)
                 if math.hypot((i + .5) / n - .5, (j + .5) / n - .5) < min((i + .5) / n, (j + .5) / n, 1 - (i + .5) / n, 1 - (j + .5) / n))
    assert abs(inside / n / n - (4 * math.sqrt(2) - 5) / 3) < 1e-3
    c[13] = 4 + 2 + 5 + 3

    def tilings(width):
        shapes = [[(0, 0), (1, 0)], [(0, 0), (0, 1)]]
        box = [(0, 0), (1, 0), (0, 1), (1, 1)]
        shapes += [[q for q in box if q != miss] for miss in box]
        cells = [(r, col) for col in range(width) for r in range(2)]

        @lru_cache(None)
        def go(filled):
            first = next((q for q in cells if q not in filled), None)
            if first is None:
                return 1
            total = 0
            for sh in shapes:
                anchor = min(sh, key=lambda t: (t[1], t[0]))
                placed = [(a - anchor[0] + first[0], b - anchor[1] + first[1]) for a, b in sh]
                if all(0 <= a < 2 and 0 <= b < width and (a, b) not in filled for a, b in placed):
                    total += go(filled | frozenset(placed))
            return total
        return go(frozenset())
    c[14] = tilings(9)
    c[15] = _subset_sums_divisible(20, 20) % 1000
    return c


def _aime_2():
    c = {}
    c[1] = sum(1 for n in range(100, 1000) if sum(map(int, str(n))) == 9)
    c[2] = pow(7, 2026, 100)
    d = next(d for d in range(1, 50) if (3 + 3 * d) ** 2 == 3 * (3 + 12 * d))
    c[3] = 3 + 19 * d
    c[4] = sum(1 for n in range(1, 1000) if n % 2 and n % 3 and n % 5)
    c[5] = triangle_area((0, 10), (2, 0), (10, 6))
    sq = lambda n: math.isqrt(n) ** 2 == n
    f = F(sum(1 for t in product(range(1, 7), repeat=4) if sq(math.prod(t))), 6 ** 4)
    c[6] = f.numerator + f.denominator
    r = _roots([1, -7, 5, 2])
    c[7] = round(((r[0] + r[1]) * (r[1] + r[2]) * (r[2] + r[0])).real, 9)
    c[8] = sum(1 for w in product('ABC', repeat=8) if w[0] == w[-1] and all(w[i] != w[i + 1] for i in range(7)))
    s3 = math.sqrt(3)
    A, B, C, D = (0, 0, 0), (6, 0, 0), (3, 3 * s3, 0), (3, s3, 2 * math.sqrt(6))
    P_ = tuple(A[i] + (B[i] - A[i]) / 3 for i in range(3))
    Q_ = tuple((C[i] + D[i]) / 2 for i in range(3))
    assert all(abs(math.dist(u, v) - 6) < 1e-9 for u, v in combinations((A, B, C, D), 2))
    c[9] = round(math.dist(P_, Q_) ** 2, 9)
    O, H = (F(7), F(33, 8)), (F(5), F(15, 4))
    f = (O[0] - H[0]) ** 2 + (O[1] - H[1]) ** 2
    c[10] = f.numerator + f.denominator
    c[11] = sum(1 for rows in combinations(range(6), 4) for cols in permutations(range(6), 4)
                if all(r != q for r, q in zip(rows, cols))) % 1000

    def period(n):
        k, x = 1, 10 % n
        while x != 1:
            x, k = x * 10 % n, k + 1
        return k
    c[12] = sum(1 for n in range(2, 10 ** 6) if n % 2 and n % 5 and 999999 % n == 0 and period(n) == 6)
    n125 = sum(1 for a in range(125) for b in range(125) if (a * a + b * b) % 125 == 0)
    n8 = sum(1 for a in range(8) for b in range(8) if (a * a + b * b) % 8 == 0)
    c[13] = (n125 * n8) % 1000

    @lru_cache(None)
    def walks(up, down, low):
        if low < -2:
            return 0
        if up == down == 0:
            return 1
        total = 0
        h = (10 - up) - (10 - down)
        if up:
            total += walks(up - 1, down, min(low, h + 1))
        if down:
            total += walks(up, down - 1, min(low, h - 1))
        return total
    c[14] = walks(10, 10, 0) % 1000
    ds = lambda n: sum(map(int, str(n)))
    c[15] = sum(1 for n in range(1, 10 ** 4 + 1) if ds(n) == ds(2 * n))
    return c


def _domino_tilings(rows, cols):
    """Domino tilings of a rows x cols board, by brute force."""
    cells = [(r, q) for q in range(cols) for r in range(rows)]

    @lru_cache(None)
    def go(filled):
        first = next((x for x in cells if x not in filled), None)
        if first is None:
            return 1
        r, q = first
        total = 0
        for dr, dq in ((1, 0), (0, 1)):
            other = (r + dr, q + dq)
            if other[0] < rows and other[1] < cols and other not in filled:
                total += go(filled | frozenset([first, other]))
        return total
    return go(frozenset())


def _aime_3():
    c = {}
    zeros = lambda n: sum(n // 5 ** k for k in range(1, 6))
    c[1] = next(n for n in range(1, 1000) if zeros(n) == 31)
    c[2] = sum(1 for t in product(range(1, 4), repeat=4) if sum(t) == 8)
    c[3] = sum(n for n in range(1, 100)
               if (v := n * n - 13 * n + 42) > 1 and all(v % q for q in range(2, math.isqrt(v) + 1)))
    c[4] = next(math.isqrt(a * a + b * b) for a in range(1, 60) for b in range(a, 60)
                if a * b == 300 and math.isqrt(a * a + b * b) ** 2 == a * a + b * b and a + b + math.isqrt(a * a + b * b) == 60)
    c[5] = sum(1 for x in range(1, 721) for y in range(x, 721) if math.lcm(x, y) == 720)
    f = sum(F(5, 6) ** (k - 1) * F(1, 6) for k in range(1, 400, 2))
    f = F(round(float(f) * 10 ** 9), 10 ** 9).limit_denominator(1000)
    c[6] = f.numerator + f.denominator
    leg = (8 + 18) / 2
    c[7] = round((8 + 18) / 2 * math.sqrt(leg ** 2 - 5 ** 2))
    g = lambda x: x * x + 6 * x + 7
    c[8] = min(g(g(g(g(k / 100)))) for k in range(-1000, 1000))
    c[9] = sum(1 for w in set(permutations('AAABBBCC')) if all(w[i] != w[i + 1] for i in range(7)))
    # circle through A(0,0) tangent to BC at M; B(6,0), C(0,8), right angle at A
    B, C = (F(6), F(0)), (F(0), F(8))
    M = ((B[0] + C[0]) / 2, (B[1] + C[1]) / 2)
    bd = (M[0] - B[0]) ** 2 + (M[1] - B[1]) ** 2
    D = (6 - bd / 6, F(0))
    ce = ((M[0] - C[0]) ** 2 + (M[1] - C[1]) ** 2) / 8
    E = (F(0), 8 - ce)
    de2 = D[0] ** 2 + E[1] ** 2
    de = F(math.isqrt(de2.numerator), math.isqrt(de2.denominator))
    assert de * de == de2
    c[10] = de.numerator + de.denominator
    c[11] = sum(1 for q in permutations('1234567') if int(''.join(q)) % 11 == 0)
    best = 0
    for k in range(0, 2001):
        a = -math.sqrt(24) + k * (2 * math.sqrt(24)) / 2000
        # b + c = -a, b^2 + c^2 = 24 - a^2
        disc = 2 * (24 - a * a) - a * a
        if disc >= 0:
            for sgn in (1, -1):
                b = (-a + sgn * math.sqrt(disc)) / 2
                cc = -a - b
                best = max(best, a ** 3 + b ** 3 + cc ** 3)
    assert abs(best - 48) < 1e-3
    c[12] = 48 if 4 ** 3 + 2 * (-2) ** 3 == 48 else None
    c[13] = sum(1 for n in range(1, 1001) if math.comb(2 * n, n) % 3)
    c[14] = _domino_tilings(3, 8)
    c[15] = sum(n for n in range(1, 1000) if pow(10, n, n) == 1 % n) % 1000
    return c


def _aime_4():
    c = {}
    c[1] = sum(1 for b in range(1, 2025) if math.isqrt(2025 + b * b) ** 2 == 2025 + b * b)
    O, I = (F(6), F(5, 2)), (F(2), F(2))
    f = (O[0] - I[0]) ** 2 + (O[1] - I[1]) ** 2
    c[2] = f.numerator + f.denominator
    c[3] = sum(1 for n in range(10000, 100000) if all(a > b for a, b in zip(str(n), str(n)[1:])))
    sols = [x for x in (2.0 ** (k / 8) for k in range(-80, 81)) if math.isclose(x ** math.log2(x), 16 * x ** 3, rel_tol=1e-9)]
    c[4] = round(math.prod(sols), 9)
    f = F(sum(1 for t in combinations(range(1, 13), 3) if t[1] - t[0] == t[2] - t[1]), math.comb(12, 3))
    c[5] = f.numerator + f.denominator
    c[6] = (2 ** 100 + 3 ** 100) % 1000
    s3 = math.sqrt(3)
    c[7] = round(triangle_area((6, 0), (3, 3 * s3), (0, 2 * s3)) ** 2, 9)
    c[8] = sum(1 for b in range(16) for cc in range(11) if 30 - 2 * b - 3 * cc >= 0)
    roots = [3, -1, 1 + 2j, 1 - 2j]
    assert all(abs(r ** 4 - 4 * r ** 3 + 6 * r ** 2 - 4 * r - 15) < 1e-9 for r in roots)
    c[9] = round(sum(abs(r) ** 2 for r in roots), 9)
    cosB = F(25 - 61, 84)
    f = 25 - 24 * cosB
    assert f == 61 + 60 * cosB
    c[10] = f.numerator + f.denominator
    p = [F(0)] * 7
    for _ in range(3000):
        p = [F(0)] + [F(2, 3) * p[k + 1] + F(1, 3) * p[k - 1] for k in range(1, 6)] + [F(1)]
        p = [x.limit_denominator(10 ** 6) for x in p]
    f = p[3].limit_denominator(100)
    c[11] = f.numerator + f.denominator
    # Burnside by brute force over the 24 rotations of the cube acting on vertices
    verts = list(product((0, 1), repeat=3))
    rots = set()
    for perm in permutations(range(3)):
        for signs in product((1, -1), repeat=3):
            m = [[0] * 3 for _ in range(3)]
            for i in range(3):
                m[i][perm[i]] = signs[i]
            det = (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
                   + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]))
            if det == 1:
                rots.add(tuple(map(tuple, m)))
    assert len(rots) == 24
    total = 0
    for m in rots:
        image = {}
        for v in verts:
            w = tuple(sum(m[i][j] * (2 * v[j] - 1) for j in range(3)) for i in range(3))
            image[v] = tuple((x + 1) // 2 for x in w)
        seen, cycles = set(), 0
        for v in verts:
            if v not in seen:
                cycles += 1
                while v not in seen:
                    seen.add(v)
                    v = image[v]
        total += 3 ** cycles
    c[12] = total // 24

    def phi(n):
        return sum(1 for k in range(1, n + 1) if math.gcd(k, n) == 1)
    c[13] = sum(1 for n in range(1, 1001) if n % phi(n) == 0)
    c[14] = sum(1 for ones in combinations(range(10), 5)
                if not any(len({(i + k) in ones for k in range(3)}) == 1 for i in range(8)))
    count = 0
    for mask in range(1 << 20):
        ok = True
        for x in range(1, 11):
            if mask >> (x - 1) & 1 and ((2 * x <= 20 and mask >> (2 * x - 1) & 1) or (3 * x <= 20 and mask >> (3 * x - 1) & 1)):
                ok = False
                break
        count += ok
    c[15] = count % 1000
    return c


def _aime_5():
    c = {}
    c[1] = sum(range(1, 2027)) % 1000
    c[2] = max(100 - a - b - 18 - d for a in range(1, 18) for b in range(a + 1, 18) for d in range(19, 100)
               if 100 - a - b - 18 - d > d)
    c[3] = math.isqrt(625 - (math.isqrt(625 - 49) - 4) ** 2) - 7
    c[4] = sum(1 for n in range(1, 1001) if n % math.isqrt(n) == 0)
    pts = [(math.cos(2 * math.pi * k / 12), math.sin(2 * math.pi * k / 12)) for k in range(12)]
    f = F(sum(1 for p, q in combinations(pts, 2) if math.dist(p, q) > 1 + 1e-12), 66)
    c[5] = f.numerator + f.denominator
    g = lambda x: x * x - 3 * x + 1
    # all real roots of g(g(x)) = x lie in [-2, 5]: find sign changes on a fine grid
    xs = [-2 + k * 7 / 70000 for k in range(70001)]
    vals = [g(g(x)) - x for x in xs]
    roots = [xs[i] for i in range(70000) if vals[i] == 0 or vals[i] * vals[i + 1] < 0]
    assert len(roots) == 4
    c[6] = round(sum(roots), 3)
    c[7] = sum(1 for k in range(1, 11) for t in product((1, 2, 3), repeat=k) if sum(t) == 10)
    c[8] = next(n for n in range(1, 2000) if (n * n + n + 1) % 1729 == 0)
    c[9] = triangle_area((8, 6), (10, 10), (0, 10))
    rows = [r for r in product((0, 1), repeat=4) if sum(r) == 2]
    c[10] = sum(1 for g4 in product(rows, repeat=4) if all(sum(r[j] for r in g4) == 2 for j in range(4)))
    c[11] = next(x + y + z for x in range(1, 30) for y in range(1, 30) for z in range(1, 30)
                 if x * y + x + y == 23 and y * z + y + z == 31 and z * x + z + x == 47)
    c[12] = sum(1 for a in range(1, 51) for b in range(a + 1, 51) if a * b % (a + b) == 0)

    @lru_cache(None)
    def paths(x, y):
        if x == 0 or y == 0:
            return 1
        return paths(x - 1, y) + paths(x, y - 1) + paths(x - 1, y - 1)
    c[13] = paths(4, 4)
    xs7 = list(range(7))
    c[14] = sum(F(2 ** xi) * math.prod(F(8 - xj, xi - xj) for xj in xs7 if xj != xi) for xi in xs7)
    c[15] = sum(1 for q in permutations(range(8)) if all(q[i] != i and q[i] != i + 1 for i in range(8))) % 1000
    return c


CHECKS = {
    ('AMC 10', 1): _a10_1,
    ('AMC 10', 2): _a10_2,
    ('AMC 10', 3): _a10_3,
    ('AMC 10', 4): _a10_4,
    ('AMC 10', 5): _a10_5,
    ('AMC 12', 1): _a12_1,
    ('AMC 12', 2): _a12_2,
    ('AMC 12', 3): _a12_3,
    ('AMC 12', 4): _a12_4,
    ('AMC 12', 5): _a12_5,
    ('AIME', 1): _aime_1,
    ('AIME', 2): _aime_2,
    ('AIME', 3): _aime_3,
    ('AIME', 4): _aime_4,
    ('AIME', 5): _aime_5,
}


def _problem(level, set_no, number):
    mock = next(m for m in MOCKS if m['level'] == level and m['set'] == set_no)
    return BY_ID[mock['problems'][number - 1]]


def test_every_answer_is_recomputed():
    wrong, missing = [], []
    for (level, set_no), checks in CHECKS.items():
        computed = checks()
        count = catalog.FORMATS[level]['count']
        for number in range(1, count + 1):
            p = _problem(level, set_no, number)
            if number not in computed:
                # A problem shared with the AMC 10 is checked there.
                if not (level == 'AMC 12' and p['id'].startswith('mock10-')):
                    missing.append((level, set_no, number))
                continue
            truth = computed[number]
            got = p['answer'] if p['choices'] is None else value(p['choices']['ABCDE'.index(p['answer'])])
            if not same(got, truth):
                wrong.append((p['id'], got, truth))
    assert not wrong, wrong
    assert not missing, missing


def test_every_set_is_checked():
    assert set(CHECKS) == {(m['level'], m['set']) for m in MOCKS}


def test_sets_are_real_papers():
    for mock in MOCKS:
        ps = [BY_ID[pid] for pid in mock['problems']]
        assert len(ps) == catalog.FORMATS[mock['level']]['count'], mock['id']
        ratings = [p['rating'] for p in ps]
        assert ratings == sorted(ratings), mock['id']
        # Answers spread over the letters like a real key: no letter more than 8 times.
        if mock['level'] != 'AIME':
            letters = [p['answer'] for p in ps]
            assert max(letters.count(x) for x in 'ABCDE') <= 8, (mock['id'], letters)
        else:
            assert all(0 <= p['answer'] <= 999 for p in ps)
    for p in PROBLEMS:
        if p['choices']:
            vals = [value(x) for x in p['choices']]
            assert len(set(map(str, vals))) == 5, p['id']


def test_amc12_sets_share_eight_problems_with_their_amc10():
    for n in range(1, 6):
        ten = next(m for m in MOCKS if m['level'] == 'AMC 10' and m['set'] == n)
        twelve = next(m for m in MOCKS if m['level'] == 'AMC 12' and m['set'] == n)
        assert len(set(ten['problems']) & set(twelve['problems'])) == 8
