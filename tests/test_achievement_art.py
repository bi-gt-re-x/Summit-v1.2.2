"""Every badge in the catalogue has a drawing, and neighbours never share one.

The catalogue is Python (`backend/api/achievements.py`) and the art is TypeScript
(`frontend/src/components/Achievements/glyphs.tsx`), so nothing in either
language can notice when they drift. A badge added to the catalogue without a
drawing does not fail a build or a type-check — it silently falls through to
its metric's shape and becomes the fifth identical flame on the wall. That is
the whole reason this file exists, and it is the same reason
`scripts/check_trees.mjs` reads `skill_trees.py`: a contract across two
languages needs a third thing to hold it.

## Two claims, and the second is the interesting one

**Coverage** is the easy half: 149 badges, 149 entries.

**Distinctness** is the half that is actually about the page. Not global
uniqueness — 149 shapes that all still read at the sixteen pixels a tile's
hexagon gives them do not exist, and inventing them would mean drawings that
say nothing about the badge they are on. What is asserted is the thing a
reader can actually catch: no two badges that share a metric, or share a
category, share a drawing. Those are exactly the badges that end up beside
each other in the wall and in the family bars, so any two a person can see at
once are different.

The TSX is parsed rather than executed. It is the only way to read it from
here, the shape being parsed is a flat table of `'id': GLYPH.name,` lines, and
a regex that stops matching is a failure rather than a false pass.
"""
import re
from pathlib import Path

import pytest

from backend.api.achievements import CATALOGUE

GLYPHS = Path(__file__).resolve().parent.parent / (
    'frontend/src/components/Achievements/glyphs.tsx')

#: The five nobody is told about. They are not in CATALOGUE — the server builds
#: them separately — but they are drawn once earned, so they need art too.
HIDDEN = (
    'hidden-nocturne', 'hidden-polymath', 'hidden-iron-will',
    'hidden-10k-hours', 'hidden-ascended',
)


def _table(name):
    """One `const NAME = { ... }` table from the TSX, as `{key: value}`."""
    source = GLYPHS.read_text()
    opened = source.index(f'const {name}')
    body = source[opened:source.index('\n};', opened)]
    return dict(re.findall(r"'([a-z0-9_-]+)':\s*GLYPH\.([a-zA-Z]+)", body))


def _shapes():
    """Every key defined on the GLYPH object."""
    source = GLYPHS.read_text()
    opened = source.index('export const GLYPH = {')
    body = source[opened:source.index('} satisfies Record<string, ReactNode>;', opened)]
    return set(re.findall(r'^  ([a-zA-Z]+):', body, re.M))


@pytest.fixture(scope='module')
def art():
    table = _table('BADGE_GLYPH')
    # If the regex ever stops matching the file's shape, everything below
    # would pass vacuously. Fail here instead.
    assert len(table) > 100, 'BADGE_GLYPH did not parse — has the table changed shape?'
    return table


def test_every_badge_has_its_own_drawing(art):
    missing = [badge[0] for badge in CATALOGUE if badge[0] not in art]
    assert missing == [], (
        f'{len(missing)} badge(s) in CATALOGUE with no drawing: {missing[:10]}. '
        'Add them to BADGE_GLYPH in frontend/src/components/Achievements/glyphs.tsx.')


def test_the_hidden_five_are_drawn_too(art):
    assert [badge for badge in HIDDEN if badge not in art] == []


def test_nothing_is_drawn_for_a_badge_that_does_not_exist(art):
    known = {badge[0] for badge in CATALOGUE} | set(HIDDEN)
    orphans = sorted(set(art) - known)
    # A drawing left behind by a deleted badge is dead weight, and the next
    # person reading the table has to work out which of the two is stale.
    assert orphans == [], f'drawings for badges nothing defines: {orphans}'


def test_every_drawing_named_actually_exists(art):
    defined = _shapes()
    unknown = sorted({shape for shape in art.values() if shape not in defined})
    # `GLYPH.whatever` is not a type error — the object is indexed loosely —
    # so a typo here renders nothing at all and the hexagon comes out empty.
    assert unknown == [], f'BADGE_GLYPH names shapes GLYPH does not define: {unknown}'


@pytest.mark.parametrize('field,index', [('metric', 3), ('category', 6)])
def test_no_two_badges_you_can_see_at_once_share_a_drawing(art, field, index):
    families = {}
    for badge in CATALOGUE:
        families.setdefault(badge[index], []).append((badge[0], badge[1]))

    clashes = []
    for family, members in sorted(families.items()):
        drawn = {}
        for badge_id, name in members:
            shape = art.get(badge_id)
            if shape in drawn:
                clashes.append(f'{family}: “{drawn[shape][1]}” and “{name}” '
                               f'are both GLYPH.{shape}')
            drawn[shape] = (badge_id, name)
    assert clashes == [], (
        f'{len(clashes)} pair(s) of badges sharing a {field} also share a '
        f'drawing:\n  ' + '\n  '.join(clashes))


def test_the_wall_is_actually_varied(art):
    # A guard against the checks above being satisfied by something degenerate
    # — say, a table where most badges point at one shape and the families
    # happen not to collide. Ninety-odd distinct drawings over 149 badges is
    # what "every badge has its own" looks like in practice.
    assert len(set(art.values())) >= 85
