"""The logic both sides implement, run against one set of cases.

Python and TypeScript cannot share code, so the rules both apply are written
twice — and pinned by the examples in shared/cases/, which this file runs
against the server's copy and frontend/src/shared.cases.test.ts runs against
the browser's. Change one copy's behaviour and the other's run fails.

Also here: the values in shared/rules.json are the ones the server uses.
"""
import json
import os

import pytest

from backend.api import spaces, tasks
from backend.config.shared import PATH, RULES
from backend.tracking import analytics, next_sessions, session_plan, subject_ai, time_spent

CASES = os.path.join(os.path.dirname(PATH), 'cases')


def _cases(name):
    with open(os.path.join(CASES, name + '.json'), encoding='utf-8') as handle:
        return json.load(handle)['cases']


@pytest.mark.parametrize('case', _cases('time_spent'), ids=lambda case: case['why'])
def test_time_spent(case):
    assert time_spent.seconds_spent(case['task']) == case['seconds']


@pytest.mark.parametrize('case', _cases('name_family'), ids=lambda case: case['title'] or 'empty')
def test_name_family(case):
    assert next_sessions.name_family(case['title']) == case['family']


def test_the_server_reads_its_values_from_the_shared_file():
    assert (session_plan.MIN_XP, session_plan.MAX_XP) == (RULES['task_xp']['min'], RULES['task_xp']['max'])
    assert (session_plan.MEDIUM_FROM, session_plan.HARD_FROM) == (
        RULES['task_xp']['medium_from'], RULES['task_xp']['hard_from'])
    assert [list(band) for band in analytics.GRADE_BANDS] == RULES['grade_bands']
    assert time_spent.LONGEST_BLOCK == RULES['time_spent']['longest_block_seconds']
    assert list(subject_ai.STEP_TYPES) == RULES['recommendations']['step_types']
    assert list(spaces.BLOCK_TYPES) == RULES['spaces']['block_types']
    assert list(tasks.REASONS['struggle']) == [r['key'] for r in RULES['task_reasons']['struggle']]
    assert next_sessions.STRUGGLES['unclear'] == 'Did not know where to start'
