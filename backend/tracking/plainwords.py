"""Make model-written text read like a person wrote it.

Every model answer that reaches a page (subject tips, session plans, goal
checkpoints and steps, the subject read-out) goes through `plain` on the way
out. The prompts ask for plain writing too, but a model drifts back to its
habits, and these are the ones people spot first: dashes as punctuation,
curly quotes and semicolons. Fixed here, they can't reach a page whatever the
model does.
"""
import re

#: Added to every prompt whose answer a student reads.
STYLE = """
How to write: like a friendly tutor talking to one student. Short sentences
and everyday words. Use contractions (it's, you're, don't). No dashes as
punctuation, no semicolons and no curly quotes. Skip words like genuinely,
leverage, robust, delve, crucial, journey, unlock and seamless, and don't
start steps with Attempt, Summarize or Utilize (say Try, Sum up, Use). Don't
tack ", focusing on" or ", aiming for" onto the end of a step. Never write
"not X, but Y" or "X, not Y" slogans. Say the thing plainly.
"""

# Stiff words a model reaches for, and what a person would say. Scored on the
# local detector over saved plan steps: "Summarize the experiment steps..."
# 73% AI, "Sum up..." 9%. ", aiming for smooth phrasing" 61%, ". Go for
# smooth phrasing" 6%. Prose only: the step library is math and code.
_SWAPS = [
    (re.compile(r',\s+focusing on\s+'), '. Watch '),
    (re.compile(r',\s+aiming for\s+'), '. Go for '),
    (re.compile(r'\bsummarize\b', re.I), 'sum up'),
    (re.compile(r'\bwrite down\b', re.I), 'jot down'),
    (re.compile(r'\bcompleted\b', re.I), 'finished'),
    (re.compile(r'\butilize\b', re.I), 'use'),
    (re.compile(r'\bensure\b', re.I), 'make sure'),
    (re.compile(r'\bin order to\b', re.I), 'to'),
    (re.compile(r'\bapproximately\b', re.I), 'about'),
    (re.compile(r'\badditionally\b', re.I), 'also'),
    (re.compile(r'^attempt\b|(?<=[.!?:]\s)attempt\b|(?<=\)\s)attempt\b', re.I | re.M), 'try'),
]


def _swap(text: str) -> str:
    """Each swap keeps the capital when the word it replaces had one."""
    for pattern, word in _SWAPS:
        text = pattern.sub(
            lambda m, word=word: word.capitalize() if m.group(0)[0].isupper() else word, text)
    return text

# Curly quotes, and the hyphens a model sometimes swaps in for "-" inside a
# word ("30\u2011minute"), which look the same but break search and copying.
_CURLY = str.maketrans({'\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"',
                        '\u2010': '-', '\u2011': '-'})
# "3–5" is a range, not a pause.
_RANGE = re.compile('(?<=\\d)\\s*[\u2013\u2014]\\s*(?=\\d)')
# A dash used as a pause in a sentence.
_PAUSE = re.compile('\\s*[\u2013\u2014]\\s*')
_SEMI = re.compile(r';\s+([a-z])')


def plain_text(text: str, semicolons: bool = True) -> str:
    """`semicolons=False` for math and code, where "x = 2; y = 3" is not a
    sentence break."""
    if not isinstance(text, str) or not text:
        return text
    out = text.translate(_CURLY)
    out = _RANGE.sub('-', out)
    out = _PAUSE.sub(', ', out)
    if semicolons:
        out = _SEMI.sub(lambda m: '. ' + m.group(1).upper(), out)
        out = _swap(out)
    out = re.sub(r',\s*,', ',', out)
    out = re.sub(r'^\s*,\s*', '', out)
    return out


def plain(value, semicolons: bool = True):
    """`plain_text` over every string in a parsed answer, at any depth."""
    if isinstance(value, str):
        return plain_text(value, semicolons)
    if isinstance(value, list):
        return [plain(entry, semicolons) for entry in value]
    if isinstance(value, dict):
        return {key: plain(entry, semicolons) for key, entry in value.items()}
    return value
