"""The difficulty scale: the AoPS competition rating (1-10) of each problem
number on a typical real paper, in half points.

Calibrated to the AoPS wiki's Competition ratings page: an AMC 10 runs from 1
to about 4, an AMC 12 from 1 to 4.5, and an AIME from 2.5 to 6.5 (7 and up is
olympiad territory). Real papers vary from year to year, so this is where a
problem sits on a typical paper, not a measurement of that problem.

Imported official problems are rated from it (backend/amc/official.py), and so
are the Summit Mock sets, which are written to sit where their number says
(backend/amc/sets/). It has no imports so both can use it.
"""

RATING_BY_NUMBER = {
    'AMC 10': [1, 1, 1, 1, 1.5, 1.5, 1.5, 1.5, 1.5, 2, 2, 2, 2, 2, 2.5,
               2.5, 2.5, 2.5, 3, 3, 3, 3.5, 3.5, 3.5, 4],
    'AMC 12': [1, 1, 1, 1.5, 1.5, 1.5, 1.5, 1.5, 2, 2, 2, 2, 2.5, 2.5, 2.5,
               2.5, 3, 3, 3, 3.5, 3.5, 3.5, 4, 4, 4.5],
    'AIME': [2.5, 3, 3, 3.5, 3.5, 4, 4, 4.5, 4.5, 5, 5, 5.5, 5.5, 6, 6.5],
}


def rating_at(level, number):
    table = RATING_BY_NUMBER[level]
    return table[min(max(number, 1), len(table)) - 1]
