"""Panel blocks: a panel from Analytics, the Timer or Achievements on a page.

A `panel` block on a space's page (frontend/src/components/Spaces/PanelBlock.tsx)
draws one of the app's own panels — the plan, the trend chart, the habit
cards, the focus timer, the badge wall — with the same component the page it
comes from uses, from the account's live numbers. The block stores only which
panel it is (`kind`) and how it is set: a time range, a subject, how many rows,
which series a chart plots, which parts show. Nothing it shows is stored.

The kinds and the settings each one takes are in shared/rules.json
(`spaces.panels`). `fields` there are the settings any kind may take, and a
kind's own entry names the ones it uses and may change their choices, limits
or default. `clean_panel` is the only rule: whatever a page sends, a stored
panel is a known kind with every one of its settings present and allowed.
frontend/src/components/Spaces/panels.ts is the same rule on the other side,
and shared/cases/space_panels.json pins the two together.
"""
from typing import Any, Dict

from backend.config.shared import RULES

PANELS = RULES['spaces']['panels']

#: The kinds, in the order the slash menu lists them.
KINDS = tuple(PANELS['kinds'])

#: What a kind is called in a page's plain text.
NAMES = {kind: entry['name'] for kind, entry in PANELS['kinds'].items()}


def fields_of(kind: str) -> Dict[str, Dict[str, Any]]:
    """The settings `kind` takes, each with its own choices and default."""
    out = {}
    for name, change in PANELS['kinds'][kind]['fields'].items():
        field = dict(PANELS['fields'][name])
        field.update(change or {})
        out[name] = field
    return out


def _same(value, choice) -> bool:
    """A stored value matching a choice: equal, and the same kind of thing.

    `True == 1` in Python, so a bool is never taken for a number.
    """
    if isinstance(value, bool) or isinstance(choice, bool):
        return False
    if isinstance(choice, (int, float)):
        return isinstance(value, (int, float)) and value == choice
    return isinstance(value, str) and value == choice


def _clean_field(field: Dict[str, Any], value):
    kind = field['type']
    if kind == 'choice':
        return next((choice for choice in field['of'] if _same(value, choice)), field['default'])
    if kind == 'set':
        if not isinstance(value, list):
            return list(field['default'])
        picked = [choice for choice in field['of'] if any(_same(item, choice) for item in value)]
        return picked or list(field['default'])
    if kind == 'count':
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not float(value).is_integer():
            return field['default']
        value = int(value)
        return value if field['min'] <= value <= field['max'] else field['default']
    # ref: an id the reader picked, or ''.
    if isinstance(value, (str, int)) and not isinstance(value, bool):
        return str(value).strip()[:PANELS['ref_max']]
    return field['default']


def clean_panel(raw) -> dict:
    """A panel block's settings as the page may store them.

    An unknown kind becomes the first one rather than being refused, the way
    an unknown block kind becomes text: the block survives, and the reader can
    point it somewhere else. Every setting the kind takes is filled in, and
    anything it doesn't take is dropped.
    """
    raw = raw if isinstance(raw, dict) else {}
    kind = raw.get('kind') if raw.get('kind') in KINDS else KINDS[0]
    out = {'kind': kind}
    for name, field in fields_of(kind).items():
        out[name] = _clean_field(field, raw.get(name))
    return out
