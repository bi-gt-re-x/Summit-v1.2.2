"""backend/api/settings.py — the theme palette preference.

`theme_skin` sits beside `theme_mode` rather than inside it, and the tests
here are about that seam. A skin is a whole look — its own ground and its own
accent pair — but it is *not* a third value of light and dark: every
stylesheet in the app keys off `data-theme`, so a skin pins one of those two
rather than replacing them, and the mode goes on meaning what it always meant.

What that leaves worth checking on this side is the boundary. The value
reaches `<html data-skin="...">` and drives a CSS attribute selector, so a
string the stylesheet has no block for is a theme that silently does nothing —
and `''` has to stay a first-class answer, because it is what light and dark
are.
"""
import pytest

from backend.api.settings import FIELDS


def check(name, value):
    """The validator's verdict: the cleaned value, or None for a refusal."""
    return FIELDS[name][1](value)


def default(name):
    return FIELDS[name][0]


class TestTheSkinPreference:
    def test_it_exists_beside_the_mode_rather_than_inside_it(self):
        # If this ever becomes a fourth value of theme_mode, every stylesheet
        # keyed on data-theme stops matching. See the note in FIELDS.
        assert 'theme_skin' in FIELDS
        assert check('theme_mode', 'midnight') is None

    def test_no_palette_is_the_default(self):
        """Light and dark are the two bases, and they are what an account
        that has never opened the theme grid is on."""
        assert default('theme_skin') == ''

    def test_empty_is_a_real_answer_and_not_a_refusal(self):
        # The one value that means "plain light or dark". A validator that
        # rejected it would make the two default themes unpickable.
        assert check('theme_skin', '') == ''

    @pytest.mark.parametrize('name', ['midnight', 'sunset', 'meadow', 'orchid'])
    def test_each_built_palette_is_accepted(self, name):
        assert check('theme_skin', name) == name

    @pytest.mark.parametrize('given', ['graphite', 'daylight', 'Midnight', 'dark', 'light'])
    def test_anything_without_a_stylesheet_block_is_refused(self, given):
        """The value becomes `<html data-skin="...">` and is matched by an
        attribute selector. A name with no block behind it is a theme that
        changes nothing and reports success — worse than a refusal, because
        the settings page would draw it as active."""
        assert check('theme_skin', given) is None

    def test_the_accent_list_is_untouched(self):
        """A palette switches the accent picker off; it does not shorten it.
        The seven are still the seven for anyone on light or dark, and the
        default is Violet, as it was before the sidebar's Graphite."""
        for name in ('graphite', 'violet', 'blue', 'green', 'amber', 'rose', 'slate'):
            assert check('accent', name) == name
        assert default('accent') == 'violet'


class TestASaveDoesNotPutBackWhatItDidNotChange:
    """The top bar's dark-mode switch sends /api/set_theme and /api/settings at
    the same moment. The settings save used to write back the whole account
    row it had read, so when it read before the theme landed it put the old
    theme back — and on the next device the account came back light."""

    def test_a_theme_written_in_between_survives(self, client, monkeypatch):
        from backend.api import settings as api
        from backend.database import connection as db

        assert client.post('/api/set_theme', json={'theme': 'light'}).json()['success']
        real = api.load_user

        def read_then_theme_changes(username):
            users, user = real(username)
            # The other request lands between this one's read and its write.
            client.post('/api/set_theme', json={'theme': 'dark'})
            return users, user

        monkeypatch.setattr(api, 'load_user', read_then_theme_changes)
        body = client.post('/api/settings', json={'values': {'theme_mode': 'dark'}}).json()
        assert body['success'] is True
        stored = next(u for u in db.users() if u['username'] == 'tester')
        assert stored['theme'] == 'dark'

    def test_what_it_was_sent_is_still_written(self, client):
        from backend.database import connection as db

        client.post('/api/settings', json={'name': 'Myles', 'daily_goal': 150})
        stored = next(u for u in db.users() if u['username'] == 'tester')
        assert stored['name'] == 'Myles' and stored['daily_goal'] == 150
