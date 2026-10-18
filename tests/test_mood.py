"""Mood vs output: how the days felt against what they did.

Pinned: the reader's tap beats the words, the word list is read the same way
every time (negation, "so"), today is never compared, nothing is said from
fewer than MIN_DAYS days, and the check-in saves without sending an entry to
be read again.
"""
from datetime import date, timedelta

from backend.tracking import mood

from tests.conftest import make_account, sign_in

TODAY = date(2026, 10, 18)


def _day(back):
    return (TODAY - timedelta(days=back)).isoformat()


def _entry(back, body='', said=None, energy=None):
    return {'title': '', 'body': body, 'mood': said, 'energy': energy,
            'created_at': _day(back) + 'T21:00:00'}


def _tasks(back, count, execution=None):
    return [{'status': 'done', 'completed_at': _day(back) + 'T10:00:00', 'xp_value': 10,
             'execution': execution} for _ in range(count)]


def _read(entries, tasks, focus=None):
    return mood.readings(entries, tasks, focus or {}, today=TODAY)


# ---- the words ------------------------------------------------------------
def test_negation_and_boost():
    assert mood.read_words('not tired at all')['kinds'] == {}
    assert mood.read_words('so tired')['kinds'] == {'tired': 2}
    assert mood.read_words("I wasn't motivated")['kinds'] == {'down': 1}


def test_ordinary_words_are_not_feelings():
    for text in ('Sat down and wrote down notes', 'I focused on chapter 3', 'The course content'):
        assert mood.read_words(text)['kinds'] == {}, text


def test_claims_are_found_low_before_high():
    assert mood.claim_in('Such an unproductive day.')[0] == 'low'
    assert mood.claim_in('Wow. Crushed it today!') == ('high', 'Crushed it today!')
    assert mood.claim_in('Just notes.') is None


# ---- days ------------------------------------------------------------------
def test_a_tap_beats_the_words():
    days = mood.mood_days([_entry(1, 'so tired and stressed', said=5)])
    row = days[_day(1)]
    assert (row['mood'], row['source']) == (2, 'said')


def test_words_alone_give_a_read_mood_and_no_words_give_none():
    days = mood.mood_days([_entry(1, 'exhausted'), _entry(2, 'went to class')])
    assert (days[_day(1)]['mood'], days[_day(1)]['source']) == (-1, 'read')
    assert days[_day(2)]['mood'] is None


def test_today_is_drawn_but_never_compared():
    found = _read([_entry(0, said=1)], _tasks(0, 1))
    assert found['today'] == {'mood': -2, 'source': 'said'}
    assert found['mood_days'] == 0
    assert found['series'][-1]['mood'] == -2


# ---- comparisons ------------------------------------------------------------
def _month():
    """Rough days with 1 task, good days with 6, a usual day of 4."""
    entries, tasks = [], []
    for back in range(1, 13):
        if back % 2:
            entries.append(_entry(back, said=1))
            tasks += _tasks(back, 1)
        else:
            entries.append(_entry(back, said=5))
            tasks += _tasks(back, 6)
    tasks += _tasks(20, 4) + _tasks(21, 4) + _tasks(22, 4) + _tasks(23, 4)
    return entries, tasks


def test_bands_and_the_headline():
    found = _read(*_month())
    bands = {band['key']: band for band in found['bands']}
    assert (bands['rough']['days'], bands['rough']['tasks_avg']) == (6, 1.0)
    assert (bands['good']['days'], bands['good']['tasks_avg']) == (6, 6.0)
    assert bands['okay']['days'] == 0 and not bands['okay']['enough']
    assert found['headline']['tone'] == 'insight'
    assert found['headline']['text'] == ('On good days you finish 6 tasks. On rough days, just 1. '
                                         "That's 6 times as many.")
    assert found['headline']['confidence'] == 'pattern'


def test_too_few_days_say_nothing():
    found = _read([_entry(1, said=1), _entry(2, said=5)], _tasks(1, 1) + _tasks(2, 5))
    assert not any(band['enough'] for band in found['bands'])
    assert found['headline']['tone'] == 'building'


def test_a_feeling_against_the_days_without_it():
    entries = ([_entry(back, 'so tired today') for back in (1, 3, 5, 7)]
               + [_entry(back, 'normal day') for back in (2, 4, 6, 8)])
    tasks = []
    for back in (1, 3, 5, 7):
        tasks += _tasks(back, 2)
    for back in (2, 4, 6, 8):
        tasks += _tasks(back, 4)
    found = _read(entries, tasks)
    tired = next(row for row in found['feelings'] if row['kind'] == 'tired')
    assert tired['enough'] and tired['change'] == -50
    assert tired['words'] == ['tired']


def test_perception_checks():
    entries = [_entry(1, 'Got nothing done today.'), _entry(2, 'Wasted the day again.'),
               _entry(3, 'So productive!')]
    tasks = _tasks(1, 6) + _tasks(2, 0) + _tasks(3, 1) + _tasks(10, 4) + _tasks(11, 4)
    found = _read(entries, tasks)
    verdicts = {row['day']: row['verdict'] for row in found['checks']}
    assert verdicts[_day(1)] == 'harsher'
    assert verdicts[_day(2)] == 'matches'
    assert verdicts[_day(3)] == 'generous'


def test_deep_focus_is_not_called_overrated():
    entries = [_entry(1, 'So productive!')]
    tasks = _tasks(1, 1) + _tasks(10, 4) + _tasks(11, 4)
    focus = {_day(1): {'seconds': 4 * 3600}, _day(10): {'seconds': 3600}, _day(11): {'seconds': 3600}}
    found = _read(entries, tasks, focus)
    assert found['checks'][0]['verdict'] == 'deep'


def test_brief_lines_skip_early_reads():
    assert mood.brief_lines(_read([_entry(1, said=1)], _tasks(1, 1))) == []
    lines = mood.brief_lines(_read(*_month()))
    assert lines and lines[0].startswith('Mood vs output:')


# ---- the check-in on the Log page --------------------------------------------
def test_a_checkin_saves_and_clears_without_rereading(app):
    from backend.database import connection as db
    make_account('feeler')
    client = sign_in(app, 'feeler')

    made = client.post('/api/log/save', json={'mood': 4, 'energy': 2}).json()
    assert made['success'], made
    entry = made['entry']
    assert (entry['mood'], entry['energy'], entry['learn_state']) == (4, 2, 'done')

    texted = client.post('/api/log/save', json={'id': entry['id'], 'title': 'Hi', 'body': 'tired'}).json()
    assert texted['entry']['learn_state'] == 'waiting'
    db.update_row('log_entries', entry['id'], {'learn_state': 'done'}, user_id='feeler')

    moved = client.post('/api/log/save', json={'id': entry['id'], 'title': 'Hi', 'body': 'tired',
                                               'mood': 0, 'energy': 3}).json()
    assert (moved['entry']['mood'], moved['entry']['energy']) == (None, 3)
    assert moved['entry']['learn_state'] == 'done'

    assert not client.post('/api/log/save', json={'mood': 9}).json()['success']


def test_the_page_reads_it(app):
    make_account('moodreader')
    client = sign_in(app, 'moodreader')
    reply = client.get('/api/analytics/mood').json()
    assert reply['success']
    assert reply['logged_days'] == 0 and len(reply['series']) == mood.SERIES_DAYS
