"""The skill check: start one, answer it a question at a time.

    POST /api/skill-checks/start    the node's check (a running one comes back)
    POST /api/skill-checks/answer   grade one answer; the last one finishes it

The choosing and the grading are backend/tracking/skill_check.py; what a pass
does to the tree is backend/tracking/skill_progress.py. This keeps the check
on the server so a reload resumes it, a retake gets different problems, and a
pass is the server's word rather than the page's.

## The answer stays on the server until it's asked for

A question goes out without its answer. Grading a number needs nothing from
the reader but what they typed; an answer that is a sentence is sent back only
once they have tried it (or asked to see it), and then they say whether theirs
matched. Every graded answer is also a `skill_attempts` row, which is what
moves the step's level on the panel.

## Leaving does not reroll

Closing the check and opening it again within a day comes back to the same
questions with the same answers marked. A check that could be abandoned until
it dealt an easy hand would not be proof of anything.
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.api.skillprogress import reading
from backend.database import connection as db
from backend.tracking import skill_check
from backend.tracking import skill_progress
from backend.tracking import skillsteps
from backend.tracking.auth import load_user
from backend.tracking.plainwords import plain
from backend.tracking.skillattempts import clean_attempt

router = APIRouter(tags=['skillchecks'])

#: How long a check stays open to come back to.
RESUME = timedelta(days=1)

#: How much of a typed answer is kept.
GIVEN_MAX = 300


def _known(username):
    _, user = load_user((username or '').strip())
    return bool(user)


def _now():
    return datetime.now().isoformat(timespec='seconds')


def _problems(node_id):
    """(ordinal, slot) → the problem with its step's title, and the steps."""
    steps = plain(skillsteps.programmes_for([node_id]), semicolons=False).get(node_id, [])
    found = {}
    for step in steps:
        for problem in step.get('problems') or []:
            found[(int(step['ordinal']), int(problem['slot']))] = {**problem, 'step': step['title']}
    return found, steps


def _answers(row):
    answers = list(row.get('answers') or [])
    asked = len(row.get('questions') or [])
    return answers + [None] * (asked - len(answers))


def _aids(problem):
    """What goes out with the question: its figure and its tools. The answer's
    figure is the answer, so it waits (`_worked`)."""
    aids = problem.get('aids') or {}
    out = {}
    if aids.get('figure'):
        out['figure'] = aids['figure']
    if aids.get('tools'):
        out['tools'] = list(aids['tools'])
    return out


def _worked(problem):
    """The answer's figure, for a reply that already carries the answer."""
    figure = (problem.get('aids') or {}).get('answer_figure')
    return {'figure': figure} if figure else {}


def _public(row, problems):
    """The check as the quiz screen draws it. An unanswered question has no
    answer in it."""
    answers = _answers(row)
    questions = []
    for index, question in enumerate(row.get('questions') or []):
        problem = problems.get((int(question['ordinal']), int(question['slot']))) or {}
        entry = {
            'index': index,
            'ordinal': int(question['ordinal']),
            'step': problem.get('step', ''),
            'weight': question.get('weight') or problem.get('weight') or 'core',
            'prompt': problem.get('prompt', ''),
            'hint': problem.get('hint', ''),
            'auto': skill_check.gradable(problem.get('answer', '')),
            **_aids(problem),
            'result': None,
        }
        mark = answers[index]
        if mark:
            entry['result'] = {'given': mark.get('given', ''), 'right': bool(mark.get('right')),
                               'how': mark.get('how', ''), 'answer': problem.get('answer', ''),
                               **_worked(problem)}
        questions.append(entry)
    node = skill_progress.catalog().get(row['node_id']) or {}
    finished = row.get('passed') is not None
    return {
        'id': row['id'],
        'node_id': row['node_id'],
        'node_name': node.get('name', ''),
        'asked': int(row['asked']),
        'need': int(row['need']),
        'correct': sum(1 for mark in answers if mark and mark.get('right')),
        'finished': finished,
        'passed': bool(row.get('passed')) if finished else None,
        'questions': questions,
    }


def _settle(username, node_id):
    """The check running on this node, if any: the earliest one opened within
    RESUME. Two starts at once (a double click, or React running an effect
    twice in development) each find nothing running and each open a check;
    whichever request reads second sees both. So every start settles on the
    earliest and drops the later ones that have no answers yet, and both
    requests come back with the same check."""
    since = (datetime.now() - RESUME).isoformat(timespec='seconds')
    running = sorted(
        (row for row in db.rows_for('skill_checks', username)
         if row['node_id'] == node_id and row.get('passed') is None
         and str(row.get('started_at')) >= since),
        key=lambda row: (str(row.get('started_at')), len(str(row['id'])), str(row['id'])))
    if not running:
        return None
    for extra in running[1:]:
        if not any(_answers(extra)):
            db.delete_row('skill_checks', extra['id'], user_id=username)
    return running[0]


class Start(BaseModel):
    node_id: str = ''


@router.post('/api/skill-checks/start')
def start(body: Start, username: str = Depends(current_username)):
    if not _known(username):
        return fail('Sign in to take a skill check.')
    node = skill_progress.catalog().get((body.node_id or '').strip())
    if not node:
        return fail("That's not a skill on any tree.")
    problems, steps = _problems(node['id'])
    if len(problems) < skill_check.CHECK_MIN:
        return fail("This skill doesn't have a check yet.")

    running = _settle(username, node['id'])
    if running:
        return ok(check=_public(running, problems), resumed=True)

    if node['id'] not in reading(username)['status']:
        return fail('This skill is still locked. Finish what comes before it first.')

    done = sorted((row for row in db.rows_for('skill_checks', username)
                   if row['node_id'] == node['id'] and row.get('passed') is not None),
                  key=lambda row: str(row.get('finished_at') or ''))
    recent = [skill_check.problem_key(q['ordinal'], q['slot']) for q in (done[-1]['questions'] if done else [])]
    questions = skill_check.pick(steps, recent)
    if len(questions) < skill_check.CHECK_MIN:
        return fail("This skill doesn't have a check yet.")
    row = db.insert_row('skill_checks', {
        'id': str(db.new_id('skill_checks')),
        'user_id': username,
        'node_id': node['id'],
        'questions': questions,
        'answers': [None] * len(questions),
        'asked': len(questions),
        'need': skill_check.pass_mark(len(questions)),
        'correct': 0,
        'passed': None,
        'started_at': _now(),
    })
    kept = _settle(username, node['id']) or row
    return ok(check=_public(kept, problems), resumed=kept['id'] != row['id'])


class Answer(BaseModel):
    id: str = ''
    index: int = 0
    given: str = ''
    #: For a self-graded question, after the answer was shown: 'right' or
    #: 'wrong'. Absent asks for the answer.
    mark: Optional[str] = None
    #: "Show me the answer" without trying. Counts as missed.
    skip: bool = False


@router.post('/api/skill-checks/answer')
def answer(body: Answer, username: str = Depends(current_username)):
    if not _known(username):
        return fail('Sign in to take a skill check.')
    row = db.find_row('skill_checks', str(body.id or ''), user_id=username)
    if not row:
        return fail('That check no longer exists.')
    problems, _steps = _problems(row['node_id'])
    if row.get('passed') is not None:
        return ok(check=_public(row, problems))
    questions = row.get('questions') or []
    if not 0 <= body.index < len(questions):
        return fail('That question is not part of this check.')
    answers = _answers(row)
    if answers[body.index]:
        return ok(check=_public(row, problems))

    question = questions[body.index]
    problem = problems.get((int(question['ordinal']), int(question['slot'])))
    if not problem:
        # The library was rewritten under a running check. Start over rather
        # than grade against an answer that is no longer there.
        db.delete_row('skill_checks', row['id'], user_id=username)
        return fail('This check changed while it was open. Start it again.')

    given = (body.given or '').strip()[:GIVEN_MAX]
    if body.skip:
        right, how = False, 'skipped'
    else:
        auto = skill_check.grade(problem['answer'], given)
        if auto is not None:
            if not given:
                return fail('Type an answer first, or show the answer.')
            right, how = auto, 'auto'
        elif body.mark in ('right', 'wrong'):
            right, how = body.mark == 'right', 'self'
        else:
            # A sentence answer: show it, and let the reader say whether
            # theirs matched. Nothing is recorded until they do.
            return ok(check=_public(row, problems),
                      reveal={'index': body.index, 'answer': problem['answer'], 'given': given,
                              **_worked(problem)})

    attempt, reason = clean_attempt({
        'node_id': row['node_id'], 'ordinal': question['ordinal'], 'slot': question['slot'],
        'weight': question.get('weight') or problem.get('weight'), 'attempted': 1,
        'correct': 1 if right else 0, 'source': 'problem',
    })
    if reason:
        return fail(reason)
    answers[body.index] = {'given': given, 'right': right, 'how': how}
    correct = sum(1 for mark in answers if mark and mark.get('right'))
    changes = {'answers': answers, 'correct': correct}

    finished = all(answers)
    before = reading(username)['status'] if finished else None
    if finished:
        changes['passed'] = correct >= int(row['need'])
        changes['finished_at'] = _now()
    db.insert_row('skill_attempts', {'id': str(db.new_id('skill_attempts')), 'user_id': username,
                                     **attempt})
    db.update_row('skill_checks', row['id'], changes, user_id=username)
    row = {**row, **changes}

    reply = {'check': _public(row, problems),
             'result': {'index': body.index, 'right': right, 'how': how, 'answer': problem['answer'],
                        **_worked(problem)}}
    if finished:
        after = reading(username)
        reply['progress'] = after
        reply['opened'] = (skill_progress.opened_by(row['node_id'], before, after['status'])
                           if changes['passed'] else [])
    return ok(**reply)
