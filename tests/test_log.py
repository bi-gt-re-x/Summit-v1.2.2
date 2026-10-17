"""The Log: private entries, what Summit learns from them, and where that goes.

No test calls a model: `from_provider` is faked, and `planner.able` is forced
on where a reading should happen. Reads are timers in the app; the tests run
them with `journal.run_waiting()` instead of waiting.
"""
import json
from datetime import date, timedelta

import pytest

from backend.api import journal as journal_api
from backend.database import connection as db
from backend.tracking import goal_plan, journal, planner


@pytest.fixture(autouse=True)
def _slow_timers(monkeypatch):
    # Nothing fires on its own during a test; `run_waiting` runs them.
    monkeypatch.setattr(journal_api, 'FINAL_DELAY', 600)
    monkeypatch.setattr(journal, 'QUIET_SECONDS', 600)


def _model(monkeypatch, answer, seen=None):
    """A model that answers `answer` (a dict, or a function of the brief)."""
    monkeypatch.setattr(planner, 'able', lambda: True)

    def fake(brief, **kwargs):
        if seen is not None:
            seen.append({'brief': brief, **kwargs})
        found = answer(brief) if callable(answer) else answer
        return json.dumps({'add': [], 'update': [], 'confirm': [], 'retire': [], **found})

    monkeypatch.setattr(planner, 'from_provider', fake)


def _save(client, **fields):
    reply = client.post('/api/log/save', json={'title': 'A day', 'body': 'Some words', **fields}).json()
    assert reply['success'], reply
    return reply['entry']


def _insights(client):
    return client.get('/api/log').json()['insights']


# ---------------------------------------------------------------------------
# Entries
# ---------------------------------------------------------------------------
def test_an_entry_is_saved_edited_and_listed_newest_first(client):
    first = _save(client, title='First', body='one')
    second = _save(client, title='Second', body='two')
    db.update_row('log_entries', first['id'], {'created_at': '2026-01-01T09:00:00'}, user_id='tester')

    edited = _save(client, id=first['id'], title='First, again', body='one more')
    assert edited['id'] == first['id'] and edited['title'] == 'First, again'

    titles = [row['title'] for row in client.get('/api/log').json()['entries']]
    assert titles == ['Second', 'First, again']
    assert second['learn_state'] == 'waiting'


def test_an_empty_entry_is_refused(client):
    reply = client.post('/api/log/save', json={'title': '  ', 'body': '\n'}).json()
    assert not reply['success']


def test_entries_belong_to_their_account(client, stranger):
    mine = _save(client, title='Mine')
    assert stranger.get('/api/log').json()['entries'] == []
    assert not stranger.post('/api/log/save', json={'id': mine['id'], 'title': 'x'}).json()['success']
    assert not stranger.post('/api/log/delete', json={'id': mine['id']}).json()['success']
    assert db.find_row('log_entries', mine['id'], user_id='tester')['title'] == 'Mine'


def test_signed_out_gets_nothing(anon):
    assert anon.get('/api/log').status_code == 401


# ---------------------------------------------------------------------------
# Learning
# ---------------------------------------------------------------------------
def test_saving_reads_the_entry_and_keeps_tagged_insights(client, monkeypatch):
    _model(monkeypatch, {'add': [
        {'kind': 'goal', 'topic': 'goals', 'text': 'Wants AIME 4 by 9th grade.'},
        {'kind': 'feeling', 'topic': 'motivation', 'text': 'Felt overwhelmed after regionals'},
    ]})
    entry = _save(client, body='Regionals were rough. I still want AIME 4 by 9th grade.', final=True)
    journal.run_waiting()

    found = {row['text']: row for row in _insights(client)}
    assert found['Wants AIME 4 by 9th grade']['kind'] == 'goal'
    assert found['Wants AIME 4 by 9th grade']['sources'] == [entry['id']]
    feeling = found['Felt overwhelmed after regionals']
    assert feeling['kind'] == 'feeling'
    assert feeling['expires_at'] == (date.today() + timedelta(days=journal.FEELING_DAYS)).isoformat()
    assert db.find_row('log_entries', entry['id'], user_id='tester')['learn_state'] == 'done'


def test_sensitive_lines_are_never_kept(client, monkeypatch):
    _model(monkeypatch, {'add': [
        {'kind': 'pattern', 'topic': 'challenges', 'text': 'Has ADHD and loses focus'},
        {'kind': 'preference', 'topic': 'preferences', 'text': 'Goes to church on Sundays'},
        {'kind': 'goal', 'topic': 'goals', 'text': 'Wants to vote in the next election'},
        {'kind': 'preference', 'topic': 'preferences', 'text': 'Studies best before school'},
    ]})
    _save(client, final=True)
    journal.run_waiting()
    assert [row['text'] for row in _insights(client)] == ['Studies best before school']


def test_the_prompt_says_what_is_off_limits_and_writes_plainly():
    assert 'NEVER keep or infer anything about health' in journal.SYSTEM
    assert 'religion, politics' in journal.SYSTEM
    assert journal.SYSTEM.endswith(journal.STYLE)


def test_a_failed_model_call_keeps_the_entry_and_the_old_insights(client, monkeypatch):
    _model(monkeypatch, {'add': [{'kind': 'goal', 'topic': 'goals', 'text': 'Wants USACO Gold'}]})
    _save(client, body='USACO Gold this year', final=True)
    journal.run_waiting()

    def broken(*a, **k):
        raise planner.PlannerUnavailable('Groq is rate-limiting this key.')

    monkeypatch.setattr(planner, 'from_provider', broken)
    second = _save(client, title='Later', body='More thoughts', final=True)
    journal.run_waiting()

    assert db.find_row('log_entries', second['id'], user_id='tester')['body'] == 'More thoughts'
    assert db.find_row('log_entries', second['id'], user_id='tester')['learn_state'] == 'failed'
    assert [row['text'] for row in _insights(client)] == ['Wants USACO Gold']


def test_no_model_means_the_entry_is_marked_off(client, monkeypatch):
    monkeypatch.setattr(planner, 'able', lambda: False)
    entry = _save(client, final=True)
    journal.run_waiting()
    assert db.find_row('log_entries', entry['id'], user_id='tester')['learn_state'] == 'off'
    assert client.get('/api/log').json()['learning'] is False


def test_editing_an_entry_reads_it_again_and_replaces_what_it_alone_said(client, monkeypatch):
    answers = iter([
        {'add': [{'kind': 'preference', 'topic': 'preferences', 'text': 'Likes studying with music'}]},
        {'add': [{'kind': 'preference', 'topic': 'preferences', 'text': 'Needs quiet to study'}]},
    ])
    _model(monkeypatch, lambda brief: next(answers))
    entry = _save(client, body='Music helps', final=True)
    journal.run_waiting()
    _save(client, id=entry['id'], body='Actually I need quiet', final=True)
    journal.run_waiting()
    assert [row['text'] for row in _insights(client)] == ['Needs quiet to study']


def test_a_later_entry_can_revise_confirm_and_retire(client, monkeypatch):
    _model(monkeypatch, {'add': [
        {'kind': 'feeling', 'topic': 'challenges', 'text': 'Rushed and made careless mistakes'},
        {'kind': 'goal', 'topic': 'goals', 'text': 'Wants to make the violin ensemble'},
        {'kind': 'preference', 'topic': 'preferences', 'text': 'Likes timed sets'},
    ]})
    first = _save(client, body='first', final=True)
    journal.run_waiting()
    ids = {row['text']: row['id'] for row in _insights(client)}

    seen = []
    _model(monkeypatch, {
        'update': [{'id': ids['Rushed and made careless mistakes'], 'kind': 'pattern',
                    'topic': 'challenges', 'text': 'Keeps making careless mistakes when rushed'}],
        'confirm': [ids['Likes timed sets']],
        'retire': [ids['Wants to make the violin ensemble']],
    }, seen)
    second = _save(client, body='second', final=True)
    journal.run_waiting()

    # The model was shown what's kept, with ids, so it could do that.
    assert ids['Likes timed sets'] in seen[0]['brief']
    found = {row['id']: row for row in _insights(client)}
    revised = found[ids['Rushed and made careless mistakes']]
    assert (revised['kind'], revised['text'], revised['expires_at']) == (
        'pattern', 'Keeps making careless mistakes when rushed', None)
    assert revised['sources'] == [first['id'], second['id']]
    assert found[ids['Likes timed sets']]['sources'] == [first['id'], second['id']]
    assert found[ids['Wants to make the violin ensemble']]['status'] == 'retired'


def test_ids_the_model_made_up_are_ignored():
    ops = journal.parse(json.dumps({'add': [], 'update': [{'id': 'nope', 'kind': 'goal',
                                                          'topic': 'goals', 'text': 'x'}],
                                    'confirm': ['nope', 'k1'], 'retire': ['zzz']}), ['k1'])
    assert ops == {'add': [], 'update': [], 'confirm': ['k1'], 'retire': []}


def test_model_text_is_made_plain():
    ops = journal.parse(json.dumps({'add': [{'kind': 'goal', 'topic': 'goals',
                                             'text': 'Wants Gold — by March'}],
                                    'update': [], 'confirm': [], 'retire': []}), [])
    assert ops['add'][0]['text'] == 'Wants Gold, by March'


# ---------------------------------------------------------------------------
# Control
# ---------------------------------------------------------------------------
def test_a_removed_insight_is_hidden_unused_and_not_learned_again(client, monkeypatch):
    seen = []
    _model(monkeypatch, {'add': [{'kind': 'preference', 'topic': 'preferences',
                                  'text': 'Likes group study'}]}, seen)
    _save(client, final=True)
    journal.run_waiting()
    row = _insights(client)[0]
    assert client.post('/api/log/insights/remove', json={'id': row['id']}).json()['success']
    assert _insights(client) == []
    assert journal.brief_lines('tester') == []

    _save(client, title='Another', body='Group study again', final=True)
    journal.run_waiting()
    assert _insights(client) == []
    assert 'REMOVED BY THEM' in seen[-1]['brief'] and 'Likes group study' in seen[-1]['brief']


def test_deleting_an_entry_deletes_what_only_it_said(client, monkeypatch):
    _model(monkeypatch, lambda brief: {'add': [
        {'kind': 'goal', 'topic': 'goals', 'text': 'Wants to finish the Bach concerto'}]}
        if 'Bach' in brief else {'add': [
        {'kind': 'pattern', 'topic': 'reflections', 'text': 'Practices better in the morning'}]})
    one = _save(client, body='Morning practice is better')
    two = _save(client, body='Bach concerto by spring. Mornings are better.')
    journal.run_waiting()
    morning = next(row for row in _insights(client) if 'morning' in row['text'])

    _model(monkeypatch, {'confirm': [morning['id']], 'add': [
        {'kind': 'goal', 'topic': 'goals', 'text': 'Wants to finish the Bach concerto'}]})
    _save(client, id=two['id'], body='Bach concerto by spring. Mornings are still better.', final=True)
    journal.run_waiting()

    reply = client.post('/api/log/delete', json={'id': two['id']}).json()
    assert reply['success'] and reply['removed'] == 1
    left = {row['text']: row for row in _insights(client)}
    assert 'Wants to finish the Bach concerto' not in left
    assert left['Practices better in the morning']['sources'] == [one['id']]
    assert db.find_row('log_entries', two['id'], user_id='tester') is None


def test_the_delete_reply_counts_what_went_with_it(client, monkeypatch):
    _model(monkeypatch, {'add': [{'kind': 'goal', 'topic': 'goals', 'text': 'Wants a 5 on AP Calc'},
                                 {'kind': 'preference', 'topic': 'preferences', 'text': 'Likes flashcards'}]})
    entry = _save(client, final=True)
    journal.run_waiting()
    assert client.post('/api/log/delete', json={'id': entry['id']}).json()['removed'] == 2
    assert _insights(client) == []


# ---------------------------------------------------------------------------
# Where it goes
# ---------------------------------------------------------------------------
def _rows(*specs):
    return [{'id': str(at), 'kind': kind, 'text': text, 'status': status,
             'expires_at': ends, 'updated_at': '2026-10-0{}'.format(at)}
            for at, (kind, text, status, ends) in enumerate(specs, 1)]


def test_prompt_lines_mark_feelings_and_leave_out_the_faded_and_retired():
    rows = _rows(('feeling', 'Felt stuck on geometry', 'active', '2026-10-20'),
                 ('feeling', 'Felt great after swim', 'active', '2026-10-01'),
                 ('goal', 'Wants USAJMO', 'active', None),
                 ('preference', 'Old habit', 'retired', None))
    lines = journal.lines_from(rows, today='2026-10-16')
    assert lines == ['Long-term goal: Wants USAJMO',
                     'Felt lately (passing, may have changed): Felt stuck on geometry']


def test_insights_reach_the_goal_planner(client, monkeypatch):
    db.insert_row('log_insights', {'id': 'i1', 'user_id': 'tester', 'kind': 'preference',
                                   'topic': 'preferences', 'text': 'Studies best in the morning',
                                   'sources': 'e1', 'status': 'active',
                                   'created_at': '2026-10-01', 'updated_at': '2026-10-01'})
    sent = []
    monkeypatch.setattr(planner, 'provider', lambda: 'groq')
    monkeypatch.setattr(planner, '_from_groq', lambda brief, *a, **k: sent.append(brief) or
                        '\n'.join('{}. Step {}'.format(n, n) for n in range(1, 6)))
    reply = client.post('/api/suggest_milestones', json={'title': 'Make USAJMO'}).json()
    assert reply['success'], reply
    assert 'Studies best in the morning' in sent[0]
    assert journal.BRIEF_HEADING in sent[0]


def test_insights_reach_the_next_session_brief(client):
    from backend.api import subject_ai as subject_ai_api
    db.insert_row('log_insights', {'id': 'i1', 'user_id': 'tester', 'kind': 'goal',
                                   'topic': 'goals', 'text': 'Wants AIME 4 by 9th grade',
                                   'sources': 'e1', 'status': 'active',
                                   'created_at': '2026-10-01', 'updated_at': '2026-10-01'})
    lines = subject_ai_api._background('tester', None, {})
    assert 'Long-term goal: Wants AIME 4 by 9th grade' in lines


def test_insights_reach_the_goal_route_brief():
    text = goal_plan.brief_from({'goal': 'AIME 4', 'about': ['Long-term goal: Wants AIME 4']})
    assert 'Long-term goal: Wants AIME 4' in text
