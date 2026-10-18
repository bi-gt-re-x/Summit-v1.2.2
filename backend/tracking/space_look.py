"""What a space's page looks like, for the AI that builds it.

The page builder (backend/tracking/space_ai.py) writes blocks blind unless
something tells it what they'll look like. This module is that something:
it works out every block's text color and the color behind it the same way
the editor draws them, and measures the contrast between the two.

## The colors, as the editor draws them

Mirrored from the frontend, and the rules have to stay the same as these:

- The page: its background fill if it has one (a `fade` reads 25% lighter,
  as `isDark` in frontend/src/components/Spaces/fill.ts treats it), or the
  theme's surface. Words on a background fill flip light or dark by that
  fill's luminance (`.sp-page.is-dark-bg` / `.is-light-bg` in
  styles/spaces.css); with no fill they're the theme's ink.
- A sticky note or a shape: its own fill, with its text color or
  `inkOn(fill)` on it (Drawn.tsx).
- Inside a container: 7% of the container's tint over the surface, and the
  container's own title in 70% of the tint (styles/spaces.css).
- Any block's `color` replaces the ink it would have had.

With no page background, the same page is drawn on both themes, so a block
with its own text color is checked on both and reported on the worse.

## Contrast

WCAG 2: the relative luminance of each color, then (L1 + 0.05) / (L2 + 0.05).
Body text needs 4.5:1, big headings 3:1. `fix` moves a text color toward
black or white, whichever side gains contrast, in small steps until it
passes, so a fixed color stays as close to the one chosen as it can.
"""
from typing import Dict, List, Optional, Tuple

THEMES = {
    'light': {'surface': '#ffffff', 'ink': '#1f2733'},
    'dark': {'surface': '#161b22', 'ink': '#e6edf3'},
}
ON_DARK_FILL = '#f5f7fb'
ON_LIGHT_FILL = '#1f2328'
STICKY_ON_DARK = '#ffffff'
CONTAINER_TINT = '#6366f1'
DARK_BELOW = 0.36

BODY = 4.5
LARGE = 3.0
LARGE_TYPES = ('h1', 'h2')

TEXT_TYPES = ('text', 'h1', 'h2', 'h3', 'bullet', 'numbered', 'todo', 'toggle', 'quote',
              'callout', 'code', 'sticky', 'shape', 'container')


# ---------------------------------------------------------------------------
# Color arithmetic, the same as fill.ts
# ---------------------------------------------------------------------------
def _rgb(hex_color: str) -> Tuple[int, int, int]:
    value = int(hex_color[1:7], 16)
    return (value >> 16) & 255, (value >> 8) & 255, value & 255


def _hex(rgb) -> str:
    return '#{:02x}{:02x}{:02x}'.format(*(max(0, min(255, round(c))) for c in rgb))


def mix(a: str, b: str, t: float) -> str:
    x, y = _rgb(a), _rgb(b)
    return _hex(tuple(x[i] + (y[i] - x[i]) * t for i in range(3)))


def luminance(hex_color: str) -> float:
    def lin(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = _rgb(hex_color)
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def contrast(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return round((hi + 0.05) / (lo + 0.05), 2)


def seen(fill: Optional[dict]) -> Optional[str]:
    """The color a fill mostly shows."""
    if not fill or not fill.get('color'):
        return None
    return mix(fill['color'], '#ffffff', 0.25) if fill.get('style') == 'fade' else fill['color']


def is_dark(color: str) -> bool:
    return luminance(color) < DARK_BELOW


def needed(kind: str) -> float:
    return LARGE if kind in LARGE_TYPES else BODY


def grade(ratio: float, kind: str) -> str:
    if ratio >= 7:
        return 'AAA'
    if ratio >= needed(kind):
        return 'AA'
    return 'fail'


def fix(ink: str, ground: str, target: float = BODY) -> str:
    """The nearest color to `ink` that reaches `target` on `ground`."""
    if contrast(ink, ground) >= target:
        return ink
    toward = '#000000' if luminance(ground) > 0.18 else '#ffffff'
    for step in range(1, 21):
        tried = mix(ink, toward, step / 20)
        if contrast(tried, ground) >= target:
            return tried
    return toward


# ---------------------------------------------------------------------------
# The page
# ---------------------------------------------------------------------------
def page_ground(doc: dict, theme: str) -> Tuple[str, str]:
    """`(background, default ink)` for the page on one theme."""
    painted = seen(doc.get('background'))
    if painted:
        return painted, ON_DARK_FILL if is_dark(painted) else ON_LIGHT_FILL
    return THEMES[theme]['surface'], THEMES[theme]['ink']


def themes_for(doc: dict) -> Tuple[str, ...]:
    """A page with its own background looks the same on both themes."""
    return ('light',) if seen(doc.get('background')) else ('light', 'dark')


def _pair(block: dict, box: Optional[dict], ground: str, ink: str) -> Tuple[str, str, str]:
    """`(text color, color behind it, where)` for one block on one theme."""
    kind = block.get('type')
    if kind in ('sticky', 'shape'):
        fill = seen(block.get('fill')) or ('#fde68a' if kind == 'sticky' else '#93c5fd')
        default = STICKY_ON_DARK if is_dark(fill) else ON_LIGHT_FILL
        return block.get('color') or default, fill, 'its own {} color'.format('note' if kind == 'sticky' else 'shape')
    if kind == 'container':
        tint = (block.get('fill') or {}).get('color') or CONTAINER_TINT
        return block.get('color') or mix(ink, tint, 0.70), mix(ground, tint, 0.07), 'the container'
    if box is not None:
        tint = (box.get('fill') or {}).get('color') or CONTAINER_TINT
        return block.get('color') or ink, mix(ground, tint, 0.07), 'the container "{}"'.format(
            (box.get('text') or 'box')[:30])
    return block.get('color') or ink, ground, 'the page'


def audit(doc: dict) -> List[dict]:
    """Every text block's contrast, on the theme it reads worst on.

    `[{index, type, text, ink, ground, where, ratio, grade, theme, custom}]`,
    `index` 1-based as `snapshot` numbers them. `custom` is whether the
    page set the text color (rather than the editor choosing it).
    """
    out = []
    for theme in themes_for(doc):
        ground, ink = page_ground(doc, theme)
        box = None
        for at, block in enumerate(doc.get('blocks') or []):
            indent = block.get('indent') or 0
            if indent == 0:
                box = block if block.get('type') == 'container' else None
            if block.get('type') not in TEXT_TYPES or not (block.get('text') or '').strip():
                continue
            text_color, behind, where = _pair(block, box if indent else None, ground, ink)
            ratio = contrast(text_color, behind)
            row = {'index': at + 1, 'type': block['type'], 'text': (block.get('text') or '')[:60],
                   'ink': text_color, 'ground': behind, 'where': where, 'ratio': ratio,
                   'grade': grade(ratio, block['type']), 'theme': theme,
                   'custom': bool(block.get('color'))}
            previous = next((one for one in out if one['index'] == row['index']), None)
            if previous is None:
                out.append(row)
            elif row['ratio'] < previous['ratio']:
                out[out.index(previous)] = row
    return sorted(out, key=lambda row: row['index'])


def repair(doc: dict, only_ids: Optional[set] = None) -> List[dict]:
    """Fix every failing text color in place; return what was changed.

    `only_ids` limits it to blocks the AI just wrote, so the reader's own
    color choices are reported, never quietly changed.

    Two kinds of fix, because one of them can't be done with a color. A
    sticky note or a shape has a fill that's the same on both themes, so its
    text gets the nearest color that passes on it. Text sitting on a page
    with no background is drawn on white in the light theme and near-black
    in the dark one, and no single color reaches 4.5:1 on both; there the
    custom color is dropped so the text follows the theme's own ink.
    """
    changed = []
    blocks = doc.get('blocks') or []
    follows_theme = not seen(doc.get('background'))
    for row in audit(doc):
        if row['grade'] != 'fail':
            continue
        block = blocks[row['index'] - 1]
        if only_ids is not None and block.get('id') not in only_ids:
            continue
        own_fill = block.get('type') in ('sticky', 'shape')
        if block.get('type') == 'container':
            block.pop('color', None)
            # A container's title is 70% of its tint, so a pale tint makes a
            # pale title on every theme. Deepen the tint until the title
            # reads on all of them.
            fill = dict(block.get('fill') or {'color': CONTAINER_TINT, 'style': 'fade'})
            start = fill['color']
            for step in range(1, 21):
                fill['color'] = mix(start, '#000000', step / 20)
                block['fill'] = fill
                worst = min((r['ratio'] for r in audit(doc) if r['index'] == row['index']), default=99)
                if worst >= needed('container'):
                    break
            changed.append({**row, 'fixed': fill['color'], 'now': contrast(
                mix(page_ground(doc, row['theme'])[1], fill['color'], 0.70),
                mix(page_ground(doc, row['theme'])[0], fill['color'], 0.07)), 'how': 'tint'})
            continue
        if follows_theme and not own_fill and block.get('color'):
            block.pop('color')
            changed.append({**row, 'fixed': None, 'now': None, 'how': 'theme'})
            continue
        better = fix(row['ink'], row['ground'], needed(row['type']))
        block['color'] = better
        changed.append({**row, 'fixed': better, 'now': contrast(better, row['ground']), 'how': 'color'})
    return changed


def summary(doc: dict) -> dict:
    """The contrast in one line's worth of figures."""
    rows = audit(doc)
    failing = [row for row in rows if row['grade'] == 'fail']
    lowest = min(rows, key=lambda row: row['ratio']) if rows else None
    return {'checked': len(rows), 'failing': failing, 'lowest': lowest}


# ---------------------------------------------------------------------------
# The page as the model reads it
# ---------------------------------------------------------------------------
def _describe_live(live: dict) -> str:
    parts = [live.get('source', '')]
    for key in ('view', 'metric', 'goal', 'name', 'tree', 'subject', 'category', 'status', 'days', 'weeks'):
        if live.get(key) not in (None, ''):
            parts.append('{}={}'.format(key, live[key]))
    return ' '.join(parts)


def _place(block: dict) -> str:
    if block.get('x') is not None and block.get('w') is not None:
        x, w = block['x'], block['w']
        if w >= 12:
            return 'full width'
        name = {(0, 6): 'left half', (6, 6): 'right half', (0, 4): 'left third',
                (4, 4): 'middle third', (8, 4): 'right third'}.get((x, w))
        return name or 'columns {}-{}'.format(x + 1, x + w)
    if block.get('w'):
        return '{} of 12 columns wide'.format(block['w'])
    return ''


def snapshot(doc: dict) -> List[str]:
    """The page, one numbered line per block, with how each one looks."""
    lines = []
    background = doc.get('background')
    themes = themes_for(doc)
    ground, ink = page_ground(doc, themes[0])
    lines.append('Page: icon {}, cover {}{}, background {}.'.format(
        doc.get('icon') or 'none', doc.get('cover') or 'none',
        ' with "{}"'.format(doc['coverText']) if doc.get('coverText') else '',
        '{} {} (text on it is {})'.format(background['color'], background.get('style', 'solid'), ink)
        if background else 'none (follows the light or dark theme: {} or {})'.format(
            THEMES['light']['surface'], THEMES['dark']['surface'])))
    grades = {row['index']: row for row in audit(doc)}
    for at, block in enumerate(doc.get('blocks') or []):
        kind = block.get('type')
        bits = ['{}{}. {}'.format('  ' * (block.get('indent') or 0), at + 1, kind)]
        text = (block.get('text') or '').replace('\n', ' ')
        if text:
            bits.append('"{}"'.format(text[:90] + ('…' if len(text) > 90 else '')))
        if block.get('checked'):
            bits.append('(checked)')
        if block.get('fill'):
            bits.append('fill {} {}'.format(block['fill'].get('color'), block['fill'].get('style', 'solid')))
        if block.get('color'):
            bits.append('text color {}'.format(block['color']))
        if kind == 'shape':
            bits.append('shape {}'.format(block.get('shape', 'rectangle')))
        if kind == 'chart' and block.get('chart'):
            chart = block['chart']
            bits.append('{} chart: {}'.format(chart.get('kind'), ', '.join(
                '{} {}'.format(p.get('label'), p.get('value')) for p in chart.get('points') or [])[:120]))
        if kind == 'live' and block.get('live'):
            bits.append('live: {}'.format(_describe_live(block['live'])))
        place = _place(block)
        if place:
            bits.append(place)
        row = grades.get(at + 1)
        if row:
            bits.append('contrast {}:1 {}{}'.format(
                row['ratio'], row['grade'], ' on dark theme' if row['theme'] == 'dark' else ''))
        lines.append(' '.join(bits))
    return lines


def report_lines(doc: dict) -> List[str]:
    """The contrast findings, as lines for the brief."""
    found = summary(doc)
    if not found['checked']:
        return ['No text on the page yet.']
    lines = ['{} text blocks checked. Lowest contrast {}:1 (block {}).'.format(
        found['checked'], found['lowest']['ratio'], found['lowest']['index'])]
    for row in found['failing'][:8]:
        lines.append('Block {} ({}) fails: text {} on {} ({}) is {}:1, needs {}:1{}.'.format(
            row['index'], row['type'], row['ink'], row['ground'], row['where'], row['ratio'],
            needed(row['type']), ' on the dark theme' if row['theme'] == 'dark' else ''))
    return lines
