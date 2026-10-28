"""Every icon and picture the app can ask for has a file behind it.

The names are data: a subject's icon in the catalogue, the fifty avatars, the
words the calendar turns into a block icon. A name with no file behind it
doesn't fail anywhere. The mask paints nothing and the `<img>` shows a broken
picture, so this checks the lists against the folders the backend serves
(STATIC_ROOTS). Tree icons are checked by scripts/check_trees.mjs.
"""
import json
import os
import re
import xml.etree.ElementTree as ET

from backend.config import subjects as catalogue
from backend.config.settings import STATIC_ROOTS
from backend.tracking import avatar

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'frontend', 'src')
PUBLIC = os.path.join(ROOT, 'frontend', 'public')


def served(url):
    """Whether the backend has a file for this /static/<kind>/... or public URL."""
    if url.startswith('/static/'):
        kind, rest = url[len('/static/'):].split('/', 1)
        return os.path.isfile(os.path.join(STATIC_ROOTS[kind], rest))
    return os.path.isfile(os.path.join(PUBLIC, url.lstrip('/')))


def missing(urls):
    return sorted(url for url in set(urls) if not served(url))


def test_every_subject_icon_has_a_file():
    assert missing('/static/icons/{}.svg'.format(row['icon']) for row in catalogue.BY_ID.values()) == []


def test_every_avatar_has_a_file_in_both_lists():
    with open(os.path.join(SRC, 'services', 'avatars.ts'), encoding='utf-8') as handle:
        listed = re.findall(r"'([a-z]+)'", handle.read().split('] as const')[0])
    assert listed == list(avatar.AVATARS)
    assert missing('/static/images/avatars/{}.svg'.format(name) for name in listed) == []


def test_every_calendar_icon_has_a_file():
    with open(os.path.join(SRC, 'utils', 'calendarIcons.ts'), encoding='utf-8') as handle:
        text = handle.read()
    # What a keyword rule returns, every key in the dictionary, and the fallback.
    keys = set(re.findall(r"\[/.*/[a-z]*,\s*'([a-z0-9_-]+)'\]", text))
    keys |= set(re.findall(r"^\s*'?([a-z0-9_-]+)'?\s*:\s*\[", text, re.M))
    keys.add('clock')
    assert len(keys) > 50
    assert missing('/static/icons/{}.svg'.format(key) for key in keys) == []


def test_the_app_icons_are_there():
    with open(os.path.join(ROOT, 'frontend', 'index.html'), encoding='utf-8') as handle:
        page = re.findall(r'href="(/[^"]+\.(?:svg|png|ico|json))"', handle.read())
    with open(os.path.join(PUBLIC, 'manifest.json'), encoding='utf-8') as handle:
        manifest = [icon['src'] for icon in json.load(handle).get('icons', [])]
    assert page and manifest
    assert missing(page + manifest) == []


def test_every_drawing_parses():
    """A file that's there but broken draws nothing, the same as no file."""
    broken = []
    for kind in ('icons', 'images'):
        for folder, _, names in os.walk(STATIC_ROOTS[kind]):
            for name in names:
                if not name.endswith('.svg'):
                    continue
                path = os.path.join(folder, name)
                try:
                    root = ET.parse(path).getroot()
                except ET.ParseError as error:
                    broken.append('{}: {}'.format(path, error))
                    continue
                if not (root.get('viewBox') or (root.get('width') and root.get('height'))):
                    broken.append('{}: no viewBox or size'.format(path))
    assert broken == []
