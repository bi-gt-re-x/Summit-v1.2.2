"""Free resources: every session plan links somewhere free and quick to start.

Three things are pinned here. The catalog is complete and honest (every
subject has rows, every row is free, every row says how much signing up it
takes). The sort puts the resource that fits the account's own task names
first, and stores that order. And the guard is the last word: whatever the
model wrote, a store page or publisher never reaches the page, and a step
never goes out without a link when the catalog has one for its subject.
"""
import json

from backend.config.subjects import SUBJECTS
from backend.database import connection as db
from backend.tracking import free_resources as free
from backend.tracking import subject_ai


def _ranked(subject_id, titles=()):
    return free.sort_rows(free.by_subject()[subject_id], titles)


# ---------------------------------------------------------------------------
# The catalog
# ---------------------------------------------------------------------------
def test_every_subject_in_the_catalog_has_free_resources():
    covered = free.by_subject()
    assert [s['id'] for s in SUBJECTS if s['id'] not in covered] == []


def test_every_row_is_free_and_says_how_much_signing_up_it_takes():
    rows = free.catalog()
    assert len({row['id'] for row in rows}) == len(rows)
    for row in rows:
        assert row['signup'] in ('none', 'quick'), row['id']
        assert row['url'].startswith(('https://', 'http://')), row['id']
        assert row['keywords'], row['id']
        assert free.signup_for(row['url']) in ('none', 'quick'), row['id']


def test_visible_copy_in_the_catalog_has_no_em_dashes():
    for row in free.catalog():
        assert '—' not in row['name'] + row['good_for'], row['id']


# ---------------------------------------------------------------------------
# Which links count as free
# ---------------------------------------------------------------------------
def test_stores_and_publishers_are_not_free():
    for url in ('https://mitpress.mit.edu/books/introduction-algorithms',
                'https://press.princeton.edu/books/x',
                'https://www.amazon.com/dp/0262046308',
                'https://www.halleonard.com/product/50490000'):
        assert free.signup_for(url) is None, url


def test_catalog_sites_and_open_references_are():
    assert free.signup_for('https://leetcode.com/problemset/all/?difficulty=Hard') == 'quick'
    assert free.signup_for('https://arxiv.org/abs/2001.08361') == 'none'
    assert free.signup_for('https://en.wikipedia.org/wiki/Dynamic_programming') == 'none'
    assert free.signup_for('https://ocw.mit.edu/courses/anything/') == 'none'


# ---------------------------------------------------------------------------
# The sort
# ---------------------------------------------------------------------------
def test_the_resource_that_fits_the_task_names_comes_first():
    titles = ['LeetCode session'] * 5 + ['Algorithms lecture'] * 2
    ranked = _ranked('computer_science', titles)
    assert ranked[0]['name'] == 'LeetCode problem set'
    assert ranked[0]['matched'] == 5
    assert ranked[0]['titles'] == ['LeetCode session']


def test_a_phrase_matches_on_whole_words_only():
    ranked = _ranked('computer_science', ['Refactor the parser'])
    assert ranked[0]['name'] == 'Crafting Interpreters'
    # "parse" alone isn't "parser".
    assert _ranked('computer_science', ['parse logs'])[0]['matched'] == 0


def test_a_specific_match_beats_a_generic_one():
    # "problem" fits half the catalog; "putnam" fits one thing.
    ranked = _ranked('mathematics', ['Putnam problem session'] * 3 + ['Calculus problem set'])
    assert ranked[0]['name'] == 'Putnam archive (Kiran Kedlaya)'


def test_the_subjects_own_name_counts_as_generic():
    ranked = _ranked('physics', ['Past paper: physics'] * 3)
    assert ranked[0]['name'] == 'Physics & Maths Tutor: Physics'


def test_with_nothing_to_go_on_no_signup_wins_then_catalog_order():
    ranked = _ranked('computer_science', [])
    assert ranked[0]['signup'] == 'none'
    assert [row['ordinal'] for row in ranked if row['signup'] == 'none'] == sorted(
        row['ordinal'] for row in ranked if row['signup'] == 'none')


def test_the_sort_is_stored_per_account_and_subject(client):
    free.ensure_catalog(db)
    assert free.ensure_catalog(db) is False  # nothing changed the second time
    db.insert_row('tasks', {'id': 'fr1', 'user_id': 'tester', 'title': 'LeetCode session',
                            'status': 'done', 'xp_value': 10, 'subject': 'computer_science',
                            'priority': 'medium', 'created_at': '2026-10-01T10:00:00'})
    ranked = free.sort_subject(db, 'tester', 'computer_science', '2026-10-13T12:00:00')
    stored = db.subject_resources_for('tester', 'computer_science')
    assert [entry['resource_id'] for entry in stored] == [row['id'] for row in ranked]
    assert stored[0]['place'] == 1 and stored[0]['matched'] == 1
    assert free.sorted_for(db, 'tester', 'computer_science')[0]['name'] == 'LeetCode problem set'


# ---------------------------------------------------------------------------
# The guard
# ---------------------------------------------------------------------------
def _guard(steps, subject_id='computer_science', titles=()):
    ranked = _ranked(subject_id, titles) if subject_id else []
    return free.guard(steps, lambda step: ranked)


def test_a_store_link_is_swapped_for_the_free_resource_that_fits():
    [step] = _guard([{'title': 'CLRS Ch.4 Exercises #1-10', 'resources': [
        {'name': 'CLRS 3rd edition', 'url': 'https://mitpress.mit.edu/books/introduction-algorithms'}]}])
    assert [link['name'] for link in step['resources']] == ["Jeff Erickson's Algorithms (free book)"]
    assert step['resources'][0]['signup'] == 'none'
    assert step['resources'][0]['picked'] is True


def test_free_links_stay_and_say_how_much_signing_up_they_need():
    [step] = _guard([{'title': 'LeetCode Hard #1-3', 'resources': [
        {'name': 'LeetCode Hard', 'url': 'https://leetcode.com/problemset/all/?difficulty=Hard'}]}])
    assert len(step['resources']) == 1
    assert step['resources'][0]['signup'] == 'quick'
    assert 'picked' not in step['resources'][0]


def test_the_readers_own_link_is_never_dropped():
    [step] = _guard([{'title': 'Notes', 'resources': [
        {'name': 'My notes', 'url': 'https://example-paid-site.com/x', 'yours': True}]}])
    assert step['resources'][0]['url'] == 'https://example-paid-site.com/x'


def test_a_step_with_no_link_gets_one():
    [step] = _guard([{'title': 'Stewart Calc Ch.7 #1-6, 12 min each', 'resource': 'Stewart Calculus'}],
                    'calculus')
    assert len(step['resources']) == 1
    assert free.signup_for(step['resources'][0]['url']) is not None


def test_no_link_is_better_than_one_that_has_nothing_to_do_with_the_step():
    [step] = _guard([{'title': 'Read an article on effective networking', 'focus': 'Friends',
                      'resources': [{'name': 'MindTools', 'url': 'https://www.mindtools.com/x'}]}],
                    'friends', ['Hike with friends'] * 9)
    assert step['resources'] == []


def test_never_more_than_three_and_never_the_same_page_twice():
    paid = [{'name': f'Book {n}', 'url': f'https://www.amazon.com/{n}'} for n in range(5)]
    [step] = _guard([{'title': 'Algorithms problem set', 'resources': paid}])
    urls = [link['url'] for link in step['resources']]
    assert len(urls) == 3 and len(set(urls)) == 3


def test_a_subject_the_catalog_lacks_loses_paid_links_and_gains_none():
    [step] = _guard([{'title': 'Number theory', 'resources': [
        {'name': 'Book', 'url': 'https://www.amazon.com/x'}]}], subject_id=None)
    assert step['resources'] == []


# ---------------------------------------------------------------------------
# The brief and the endpoints
# ---------------------------------------------------------------------------
def test_the_brief_lists_free_resources_and_the_plan_brief_keeps_them():
    entries = free.brief_entries(_ranked('computer_science', ['LeetCode session']), 2)
    brief = subject_ai.steps_brief_from({'subject': 'Computer Science', 'free_resources': entries})
    assert '<free_resources>' in brief
    assert 'https://leetcode.com/problemset/' in brief
    assert 'free account, quick to make' in brief
    assert 'Fits 1 of their tasks, like "LeetCode session"' in brief


def test_the_plan_prompt_asks_for_free_quick_links():
    assert 'FREE AND QUICK TO START' in subject_ai.STEPS_SYSTEM
    assert '<free_resources>' in subject_ai.SYSTEM


PAID_STEP = {'title': 'CLRS Ch.4 Exercises #1-10', 'focus': 'Algorithms', 'type': 'targeted_practice',
             'difficulty': 3, 'minutes': 45, 'reason': 'x', 'drills': [],
             'resources': [{'name': 'CLRS', 'url': 'https://mitpress.mit.edu/books/introduction-algorithms',
                            'yours': False}]}


def test_a_new_plan_is_saved_with_free_links_only(client, monkeypatch):
    monkeypatch.setattr(subject_ai, 'configured', lambda: True)
    seen = {}

    def plan(state, *a, **k):
        seen['free'] = state.get('free_resources')
        return [dict(PAID_STEP)]

    monkeypatch.setattr(subject_ai, 'plan', plan)
    body = client.post('/api/subject_reading', json={
        'subject': 'Computer Science', 'subject_id': 'computer_science', 'mode': 'fresh'}).json()
    assert body['success'] is True
    assert seen['free'] and seen['free'][0]['url'].startswith('https://')
    links = body['reading']['next_steps'][0]['resources']
    assert [link['url'] for link in links] == ['https://jeffe.cs.illinois.edu/teaching/algorithms/']
    # And it's stored that way, sorted list included.
    saved = client.get('/api/subject_reading_saved?subject=Computer Science').json()
    assert saved['reading']['next_steps'][0]['resources'][0]['signup'] == 'none'
    assert db.subject_resources_for('tester', 'computer_science')


def test_a_plan_saved_before_the_check_is_served_free(client):
    # Written straight into the table, the way older readings were stored.
    db.insert_row('subject_readings', {
        'id': 'srold', 'user_id': 'tester', 'subject': 'Computer Science', 'written_at': 'x',
        'body': json.dumps({'next_steps': [dict(PAID_STEP, id='r1')]})})
    saved = client.get('/api/subject_reading_saved?subject=Computer Science').json()
    links = saved['reading']['next_steps'][0]['resources']
    assert 'mitpress' not in links[0]['url']
    assert links[0]['signup'] == 'none'


# ---------------------------------------------------------------------------
# No other productivity apps
# ---------------------------------------------------------------------------
def test_the_catalog_has_no_other_productivity_app():
    assert [row['id'] for row in free.catalog() if free.competitor(row['url'])] == []
    assert [row['id'] for row in free.catalog() if free.names_competitor(row['name'])] == []


def test_another_productivity_app_is_never_known_free():
    assert free.signup_for('https://www.todoist.com/productivity-methods') is None
    assert free.signup_for('https://calendar.google.com/') is None
    assert free.signup_for('https://pomofocus.io/') is None


def test_names_are_caught_but_ordinary_words_are_not():
    assert free.names_competitor('Weekly planning review with Todoist')
    assert free.names_competitor('Set up a Notion page for the week')
    assert not free.names_competitor('the notion of a limit')
    assert not free.names_competitor('Upper body strength circuit')


def test_the_guard_drops_a_saved_step_built_on_another_app():
    steps = [
        {'title': 'Weekly planning review with Todoist', 'focus': 'planning',
         'resources': [{'name': 'Todoist', 'url': 'https://www.todoist.com/productivity-methods'}]},
        {'title': 'Plan the week', 'focus': 'planning',
         'resources': [{'name': 'Mine', 'url': 'https://todoist.com/app', 'yours': True}]},
    ]
    out = free.guard(steps, lambda step: [])
    assert [step['title'] for step in out] == ['Plan the week']
    assert out[0]['resources'] == []


def test_the_plan_prompt_rules_out_other_productivity_apps():
    assert 'NO OTHER PRODUCTIVITY APPS' in subject_ai.STEPS_SYSTEM
    assert 'Todoist' in subject_ai.STEPS_SYSTEM
