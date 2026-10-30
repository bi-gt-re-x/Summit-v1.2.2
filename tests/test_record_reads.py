"""Records read against the work and the goals — backend/tracking/record_reads.py.

What a record is about is inferred from its name, so most of this pins where a
name lands and what that drags in: the subject, the tasks that count as the
work behind it, and the goals it is for. The rest is the gates, because the
failure here is not a crash but a confident sentence built on two numbers.
"""
from collections import Counter
from datetime import date

from backend.tracking import record_reads as rr

TODAY = date(2026, 10, 29)


def _rows(name, category, unit, direction, target, pairs):
    return [dict(kind='record', name=name, category=category, unit=unit, comparison_direction=direction,
                 target=target, value=value, achieved_on=on, note='') for value, on in pairs]


AMC = _rows('AMC 8', 'Competitive Math', 'points', 'higher', 25, [
    (18, '2026-03-02'), (19, '2026-04-10'), (20, '2026-05-15'),
    (21, '2026-06-20'), (24, '2026-07-25'), (25, '2026-09-12')])
MILE = _rows('Mile run', 'Running', 'minutes', 'lower', 0, [
    (8.5, '2026-05-01'), (8.33, '2026-06-01'), (7.75, '2026-07-15'),
    (7.7, '2026-08-01'), (7.9, '2026-10-20'), (7.95, '2026-10-25')])
CF = _rows('Codeforces rating', 'Coding', 'rating', 'higher', 0, [
    (800, '2026-01-10'), (900, '2026-05-01'), (1150, '2026-10-01')])


def _tasks():
    tasks = [dict(title='AMC 10 counting set', description='', subject='mathematics',
                  completed_at='2026-0{}-15T10:00:00'.format(m), completion_seconds=5400) for m in range(3, 10)]
    tasks += [dict(title='Tempo run', description='', subject='running',
                   completed_at='2026-{:02d}-05T07:00:00'.format(m), completion_seconds=2400) for m in range(5, 11)]
    tasks += [dict(title='Codeforces Div 2 virtual', description='', subject='computer_science',
                   completed_at='2026-{:02d}-20T19:00:00'.format(m), completion_seconds=7200) for m in range(1, 11)]
    # Unrelated work, which must not count toward any of the three.
    tasks += [dict(title='Essay draft', description='', subject='english',
                   completed_at='2026-08-01T10:00:00', completion_seconds=36000)]
    return tasks


GOALS = [
    dict(id=1, title='Qualify for AIME', description='', why='', unit='', measure='',
         subject_ids='["mathematics"]', deadline='2027-02-01', target_number=None),
    dict(id=2, title='Reach Codeforces 1300', description='', why='', unit='rating', measure='',
         subject_ids='', deadline='2027-03-01', target_number=1300),
    dict(id=3, title='Run every day', description='', why='', unit='', measure='',
         subject_ids='["running"]', deadline='', target_number=None),
]


def _read(rows=None, tasks=None, goals=GOALS, days=90):
    return rr.analyse(rows if rows is not None else AMC + MILE + CF,
                      _tasks() if tasks is None else tasks, goals, TODAY, days)


def _record(out, name):
    return next(r for r in out['records'] if r['name'] == name)


# --------------------------------------------------------------------------
# What a record is about
# --------------------------------------------------------------------------
def test_a_contest_name_files_under_its_tree_and_subject():
    found = rr.infer('AMC 8', 'Competitive Math')
    assert (found['subject'], found['tree'], found['context'], found['how']) == \
        ('mathematics', 'competition-math', 'amc8', 'name')


def test_a_name_with_no_contest_falls_back_to_the_subject_it_says():
    found = rr.infer('Mile run', 'Running')
    assert found['subject'] == 'running'
    assert found['how'] == 'subject'


def test_a_name_that_says_nothing_is_left_unfiled():
    assert rr.infer('Pull-ups', 'Fitness')['how'] == 'none'


def test_a_shared_tree_goes_to_the_subject_the_account_works_in():
    """Algorithms sits under both Coding and Computer Science; the account's
    own tasks decide which."""
    tree = 'algorithms'
    candidates = [s for s, trees in rr.topics.taxonomy().families.items() if tree in trees and s in rr.BY_ID]
    if len(candidates) < 2:
        return
    for pick in candidates:
        assert rr.subject_for_tree(tree, Counter({pick: 9})) == pick


# --------------------------------------------------------------------------
# The work behind it
# --------------------------------------------------------------------------
def test_work_on_the_same_contest_family_counts_and_other_work_does_not():
    amc = _record(_read(), 'AMC 8')
    assert amc['work']['basis'] == 'context'
    # Seven AMC 10 sets, six of them between the 18 (Mar 2) and the 25 (Sep 12).
    assert amc['work']['climb_tasks'] == 6
    assert amc['work']['climb_seconds'] == 6 * 5400


def test_a_record_with_no_contest_reads_the_subject_work():
    mile = _record(_read(), 'Mile run')
    assert mile['work']['basis'] == 'subject'
    # Runs from May 5 to Aug 1 (the best), not the essay.
    assert mile['work']['climb_tasks'] == 3


def test_hours_per_point_needs_a_gain_and_an_hour():
    amc = _record(_read(), 'AMC 8')
    assert amc['work']['seconds_per_unit'] == amc['work']['climb_seconds'] / 7
    lone = _record(_read(rows=_rows('AMC 8', '', 'points', 'higher', 0, [(20, '2026-10-01')])), 'AMC 8')
    assert lone['work']['seconds_per_unit'] is None


# --------------------------------------------------------------------------
# What it is for
# --------------------------------------------------------------------------
def test_a_goal_naming_the_contest_is_measured_against_its_number():
    cf = _record(_read(), 'Codeforces rating')
    goal = cf['goals'][0]
    assert goal['title'] == 'Reach Codeforces 1300'
    # 800 → 1150 toward 1300 is 350 of 500.
    assert goal['progress'] == {'target': 1300.0, 'percent': 70.0, 'met': False}


def test_a_goal_on_the_same_tree_ties_without_a_number():
    amc = _record(_read(), 'AMC 8')
    assert [g['title'] for g in amc['goals']] == ['Qualify for AIME']
    assert amc['goals'][0]['progress'] is None


def test_a_subject_alone_does_not_tie_a_record_to_a_goal():
    """"Run every day" is about running and not about one mile time."""
    assert _record(_read(), 'Mile run')['goals'] == []


def test_a_goal_measured_in_milestones_has_no_score_to_reach():
    """Its target_value is how many milestones it has, not a score."""
    goals = [dict(id=9, title='AMC 8 perfect run', measure='milestones', target_value=5,
                  subject_ids='', deadline='')]
    assert _record(_read(goals=goals), 'AMC 8')['goals'][0]['progress'] is None


def test_a_goal_measured_as_a_number_uses_its_own_field():
    goals = [dict(id=9, title='Reach AMC 8 cutoff', measure='number', target_number=22,
                  subject_ids='', deadline='')]
    assert _record(_read(goals=goals), 'AMC 8')['goals'][0]['progress']['met'] is True


def test_a_number_off_the_records_scale_is_not_a_target():
    goals = [dict(id=9, title='Solve 400 AMC 8 problems', subject_ids='', deadline='', target_number=None)]
    amc = _record(_read(goals=goals), 'AMC 8')
    assert amc['goals'][0]['progress'] is None


def test_a_lower_is_better_target_fills_as_the_time_falls():
    goals = [dict(id=9, title='Mile run under 7:30', subject_ids='', deadline='')]
    mile = _record(_read(goals=goals), 'Mile run')
    progress = mile['goals'][0]['progress']
    # 8.5 → 7.7 toward 7.5: 0.8 of 1.0.
    assert round(progress['percent']) == 80
    assert progress['met'] is False


# --------------------------------------------------------------------------
# The period and the breakdown
# --------------------------------------------------------------------------
def test_bests_are_counted_in_the_window_and_the_one_before():
    amc = _record(_read(days=90), 'AMC 8')
    # Window is Aug 1 - Oct 29: the 25 on Sep 12. Before it, May 3 - Jul 31:
    # the 20, 21 and 24.
    assert amc['window']['new_bests'] == 1
    assert amc['window']['previous_bests'] == 3
    assert amc['window']['gain'] == 1


def test_the_breakdown_groups_by_inferred_subject_and_falls_back_to_category():
    rows = AMC + _rows('Pull-ups', 'Fitness', '', 'higher', 0, [(5, '2026-09-01'), (8, '2026-10-01')])
    groups = {g['label']: g for g in _read(rows=rows)['by_subject']}
    assert groups['Mathematics']['inferred'] is True
    assert groups['Fitness']['inferred'] is False
    assert groups['Fitness']['top']['name'] == 'Pull-ups'


def test_a_subject_counts_shared_work_once():
    rows = CF + _rows('Longest coding session', 'Coding', 'minutes', 'higher', 0, [(60, '2026-09-01'), (90, '2026-10-01')])
    groups = {g['key']: g for g in _read(rows=rows)['by_subject']}
    cs = groups['computer_science']
    assert cs['records'] == 2
    # Aug 1 - Oct 29: the Aug, Sep and Oct Codeforces rounds, two hours each.
    assert cs['window_seconds'] == 3 * 7200


def test_summary_counts():
    summary = _read()['summary']
    assert summary['records'] == 3
    assert summary['improving'] == 3
    assert summary['stalled'] == 1
    assert summary['tied_to_goals'] == 2


# --------------------------------------------------------------------------
# What gets said
# --------------------------------------------------------------------------
def test_a_stalled_record_is_said_and_not_also_called_a_new_best():
    reads = _read()['reads']
    mile = [item['kind'] for item in reads if item['record'] == 'Mile run']
    assert 'stalled' in mile
    assert 'fresh' not in mile


def test_work_is_named_by_the_contest_family():
    climb = next(item for item in _read()['reads'] if item['kind'] == 'climb' and item['record'] == 'AMC 8')
    assert 'AMC work' in climb['detail']
    assert 'per point' in climb['detail']


def test_two_entries_say_no_trend_and_no_stall():
    rows = _rows('AMC 8', '', 'points', 'higher', 0, [(25, '2026-01-01'), (20, '2026-02-01')])
    out = _read(rows=rows)
    record = out['records'][0]
    assert record['trend'] is None
    assert record['rate_per_month'] is None
    assert not [item for item in out['reads'] if item['kind'] in ('stalled', 'slipping')]


def test_no_more_than_two_lines_about_one_record():
    counts = Counter(item['record'] for item in _read()['reads'] if item['record'])
    assert max(counts.values()) <= 2


def test_milestones_name_the_records_they_link():
    rows = AMC + [dict(kind='milestone', name='Qualify for AIME', links='["AMC 8"]', achieved_on='')]
    assert _record(_read(rows=rows), 'AMC 8')['milestones'] == ['Qualify for AIME']


# --------------------------------------------------------------------------
# Printing
# --------------------------------------------------------------------------
def test_figures_print_the_way_the_page_does():
    assert rr.fmt(7.75, 'minutes') == '7m 45s'
    assert rr.fmt(258, 'minutes') == '4h 18m'
    assert rr.fmt(25, 'points', 25) == '25 / 25'
    assert rr.fmt(1150, 'rating') == '1,150 rating'
    assert rr.change(1 / 3, 'minutes', 'lower') == '20s faster'
    assert rr.change(-3, '', 'higher') == '−3'
    assert rr.duration(194) == '6 months'


# --------------------------------------------------------------------------
# The endpoint
# --------------------------------------------------------------------------
def test_the_endpoint_reads_this_accounts_records(client):
    for row in AMC:
        client.post('/api/records/save', json=row)
    reply = client.get('/api/records/analysis?days=90').json()
    assert reply['success'], reply
    assert reply['summary']['records'] == 1
    assert reply['records'][0]['subject'] == 'mathematics'
    assert reply['days'] == 90


def test_the_endpoint_needs_an_account(anon):
    assert anon.get('/api/records/analysis').json()['success'] is False
