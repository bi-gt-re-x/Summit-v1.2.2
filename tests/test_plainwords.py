"""The word swaps in backend/tracking/plainwords.py, on lines models wrote."""
from backend.tracking.plainwords import plain, plain_text


def test_stiff_verbs_become_everyday_ones():
    assert plain_text('Recall (5 min): Summarize the steps from memory.') == \
        'Recall (5 min): Sum up the steps from memory.'
    assert plain_text('List the tasks you completed this week.') == \
        'List the tasks you finished this week.'
    assert plain_text('Write down three priorities.') == 'Jot down three priorities.'


def test_trailing_focusing_on_becomes_its_own_sentence():
    assert plain_text('Play scales slowly, focusing on intonation.') == \
        'Play scales slowly. Watch intonation.'
    assert plain_text('Work on the excerpt, aiming for smooth phrasing.') == \
        'Work on the excerpt. Go for smooth phrasing.'


def test_attempt_is_swapped_only_as_a_verb_starting_a_step():
    assert plain_text('Solve (15 min): Attempt each problem.') == 'Solve (15 min): Try each problem.'
    assert plain_text('Attempt it.') == 'Try it.'
    assert plain_text('A first attempt counts.') == 'A first attempt counts.'


def test_the_step_library_is_left_alone():
    """Math and code go through with semicolons=False, and so skip the swaps."""
    assert plain_text('Summarize: x = 2; y = 3', semicolons=False) == 'Summarize: x = 2; y = 3'


def test_nested_answers_are_swapped_too():
    assert plain({'steps': [{'text': 'Ensure you finish in order to rest.'}]}) == \
        {'steps': [{'text': 'Make sure you finish to rest.'}]}
