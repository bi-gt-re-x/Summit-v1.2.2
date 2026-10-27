"""About you: what a new account says about itself, and what Summit keeps of it.

The last step of sign-up asks four things — who you are, what you do, what you
have already done, and how you want to improve. Two things come of the answers.

**A head start.** Analytics waits for days of record before it opens its tabs
(NEED_DAYS in frontend/src/components/Analytics/useAnalyticsModel.ts) because a
slope through four points is not a trend. A detailed account of where somebody
already stands is not a trend either, but it is context the first weeks cannot
supply, so it is worth some of the wait. How much is set by how detailed the
answers are (`detail`, with the bands in shared/rules.json), and the page never
lets it count for more days than the account has actually recorded — it can at
most halve a wait, never skip one.

**A list of facts.** Each answer is split into lines and each line is filed as
an achievement, a stat, an activity, an aim or a line about the person, with
the subject it names and the first number in it when there is one. The list is
what Analytics shows under "What you told us" and what the model prompts read
as background (`brief_lines`), so a session planned for somebody who says they
qualified for AIME is not pitched at somebody starting out.

The filing is rules, not a model: it runs on every save, has to be free, and a
line put in the wrong pile is still the reader's own words in their own order.
"""
import re
from functools import lru_cache
from datetime import datetime
from typing import Dict, Iterable, List, Optional

from backend.config.shared import RULES

RULE = RULES['background']
QUESTIONS = tuple(RULE['questions'])
LEVELS = RULE['levels']
ANSWERED_WORDS = RULE['answered_words']
MAX_CHARS = RULE['max_chars']

#: The kinds a fact can be. `about` is a line describing the person.
KINDS = ('achievement', 'stat', 'activity', 'aim', 'about')

#: The most facts kept from one save. Thirty lines is more than any panel shows.
MAX_FACTS = 30
#: A fact longer than this is cut at a word.
FACT_CHARS = 200

#: Words that make a line something done and finished.
ACHIEVED = re.compile(
    r"\b(won|win|placed|qualif\w*|award\w*|medal\w*|finalist|champion\w*|passed|certif\w*|"
    r"published|ranked|rank|honou?rs?|scholarship|got into|accepted|admitted|completed|finished|"
    r"built|created|launched|scored|achiev\w*|earned|made it|selected|graduated|gold|silver|bronze|"
    r"1st|2nd|3rd|first place|second place|third place|top \d+)\b",
    re.I)

#: A number worth calling a stat: a score, a rating, a count of something, a time.
STAT = re.compile(
    r"(\d[\d,.]*)\s*(%|/\s*\d+|percent|hours?|hrs?|h\b|minutes?|mins?|years?|yrs?|months?|weeks?|days?|"
    r"wpm|elo|rating|gpa|points?|pts|problems?|books?|km|miles?|mi\b|lbs?|kg|xp|students?|"
    r"times?|sessions?|projects?|apps?|repos?|courses?|classes?)",
    re.I)
#: The tests and ratings a score can belong to.
TESTS = r"gpa|sat|act|aime|amc\s?\d*|usaco|elo|rating|ielts|toefl|ap|psat|mcat|lsat|gre|gmat"
#: A score named right before its number, "GPA 3.9", "SAT 1520", "AIME: 7".
NAMED_SCORE = re.compile(r"\b({})\b[^\d\w]{{0,3}}\s*(\d[\d,.]*)".format(TESTS), re.I)
#: "a score of 7", "scored 1520", "got a 5": the number, wherever the test is named.
SCORE_OF = re.compile(r"\b(?:score[sd]?|scoring|got)\s+(?:of\s+|a\s+|an\s+)?(\d[\d,.]*)", re.I)
TEST_NAME = re.compile(r"\b({})\b".format(TESTS), re.I)


def _words(text: str) -> int:
    return sum(1 for token in str(text or '').split() if re.search(r'[A-Za-z0-9]', token))


def clean(answers: Dict[str, object]) -> Dict[str, str]:
    """The four answers, trimmed and capped, keyed by question."""
    out = {}
    for key in QUESTIONS:
        value = str((answers or {}).get(key) or '').strip()
        out[key] = value[:MAX_CHARS]
    return out


def detail(answers: Dict[str, object]) -> dict:
    """How detailed the answers are, and the head start that earns.

    The same arithmetic as `backgroundDetail` in frontend/src/utils/background.ts,
    pinned by shared/cases/background_detail.json.
    """
    texts = [str((answers or {}).get(key) or '') for key in QUESTIONS]
    words = sum(_words(text) for text in texts)
    answered = sum(1 for text in texts if _words(text) >= ANSWERED_WORDS)
    level = next(level for level in LEVELS
                 if words >= level['words'] and answered >= level['answered'])
    return {'words': words, 'answered': answered, 'level': level['key'],
            'label': level['label'], 'head_start': level['head_start']}


def _lines(text: str) -> List[str]:
    """An answer split into the things it says: lines, bullets and sentences."""
    pieces = []
    for line in re.split(r'[\n;•]+', text or ''):
        for sentence in re.split(r'(?<=[.!?])\s+(?=[A-Z0-9])', line):
            piece = re.sub(r'^\s*(?:[-*–—]|\d+[.)])\s*', '', sentence).strip(' .,')
            if _words(piece) >= 2:
                pieces.append(piece)
    return pieces


def _cut(text: str) -> str:
    if len(text) <= FACT_CHARS:
        return text
    return text[:FACT_CHARS].rsplit(' ', 1)[0] + '…'


#: What people call a subject when they are not reading it off a list. Only
#: used for a subject the account can file under (`names`), and only after the
#: names themselves have had their turn. Kept to words that mean one subject:
#: "data" or "group" would tag half of everything.
ALIASES = {
    # The student subjects come first. A line can name both a specific subject
    # and a broad one ("orchestra" is Band & Orchestra and also Music), and the
    # first subject the account has wins, so the specific one has to be asked
    # about before the broad one.
    'trigonometry': ('trig', 'unit circle'),
    'precalculus': ('precalc', 'pre-calc', 'pre calc'),
    'differential_equations': ('diff eq', 'diffeq', 'odes'),
    'organic_chemistry': ('orgo', 'o-chem', 'ochem'),
    'biochemistry': ('biochem',),
    'microbiology': ('microbio',),
    'neuroscience': ('neuro',),
    'environmental_science': ('apes', 'enviro sci'),
    'forensic_science': ('forensics',),
    'lab_work': ('lab report', 'lab reports'),
    'science_fair': ('isef', 'regeneron', 'jshs'),
    'test_prep': ('sat prep', 'act prep', 'practice test', 'practice tests'),
    'college_apps': ('common app', 'college essay', 'college essays', 'college applications'),
    'financial_aid': ('fafsa', 'css profile', 'scholarship', 'scholarships'),
    'extracurriculars': ('extracurricular', 'ecs'),
    'pre_med': ('premed', 'mcat', 'shadowing'),
    'ai_tools': ('chatgpt', 'ai tools'),
    'essays': ('essay',),
    'creative_writing': ('short story', 'short stories', 'nanowrimo'),
    'poetry': ('poem', 'poems', 'slam poetry'),
    'journalism': ('school paper', 'school newspaper', 'yearbook'),
    'civics': ('ap gov', 'us government', 'government class'),
    'model_un': ('mun', 'model united nations'),
    'latin': ('national latin exam',),
    'sign_language': ('asl',),
    'python': ('pygame', 'jupyter'),
    'java': ('ap csa', 'ap cs a'),
    'game_dev': ('unity', 'godot', 'roblox studio', 'game jam'),
    'app_dev': ('ios app', 'android app', 'react native', 'flutter', 'swiftui'),
    'electronics': ('arduino', 'raspberry pi', 'soldering'),
    'spreadsheets': ('excel', 'google sheets'),
    'entrepreneurship': ('startup', 'deca', 'fbla'),
    'part_time_job': ('part-time job', 'part time job'),
    'internships': ('internship',),
    'leadership': ('student council', 'club president', 'team captain'),
    'band': ('orchestra', 'marching band', 'jazz band', 'concert band', 'wind ensemble'),
    'music_theory': ('ap music theory',),
    'art_history': ('ap art history',),
    'theater': ('theatre', 'drama club', 'school play', 'musical theater'),
    'cad': ('3d modeling', 'fusion 360', 'onshape', 'solidworks', 'blender'),
    'basketball': ('hoops',),
    'soccer': ('futsal',),
    'stress': ('test anxiety', 'stressed'),
    'driving': ("driver's ed", 'drivers ed', 'permit test', 'road test'),
    'chess': ('chess.com', 'lichess', 'uscf'),
    'mathematics': ('math', 'maths', 'amc', 'aime', 'mathcounts', 'math olympiad', 'usamo', 'putnam'),
    'computer_science': ('cs', 'usaco', 'algorithms', 'competitive programming', 'leetcode', 'codeforces'),
    'programming': ('python', 'javascript', 'typescript', 'java', 'c++', 'rust', 'coding', 'swift'),
    'music': ('violin', 'viola', 'cello', 'orchestra', 'flute', 'clarinet', 'trumpet', 'saxophone', 'drums'),
    'chemistry': ('chem', 'usnco'),
    'biology': ('bio', 'usabo'),
    'physics': ('physics bowl', 'f=ma', 'usapho'),
    'statistics': ('stats',),
    'running': ('marathon', 'half-marathon', '5k', '10k', 'cross country'),
    'english': ('essay', 'essays'),
    'gym': ('lifting', 'weightlifting', 'workout', 'workouts'),
    'exams': ('sat', 'act', 'psat', 'ap exam', 'ap exams'),
    'spanish': ('español',),
}


@lru_cache(maxsize=4096)
def _word(word: str):
    """One word as a whole-word pattern, compiled once. Analytics asks
    about every task name an account has, and building the pattern on each
    call was seven million compiles for an account with twenty thousand
    tasks (6.8 s of /api/analytics/said)."""
    return re.compile(r'(?<![a-z0-9]){}(?![a-z0-9])'.format(re.escape(word)))


def _says(lowered: str, word: str) -> bool:
    return bool(_word(word).search(lowered))


def subject_in(text: str, names: Dict[str, str]) -> Optional[str]:
    """The subject a line names, or None.

    The account's own subject names first, longest first so "Computer Science"
    wins over "Science"; then the nicknames in ALIASES, for a subject the
    account has.
    """
    lowered = text.lower()
    for subject_id, name in sorted(names.items(), key=lambda row: -len(row[1] or '')):
        word = (name or '').strip().lower()
        if len(word) >= 3 and _says(lowered, word):
            return subject_id
    for subject_id, words in ALIASES.items():
        if subject_id in names and any(_says(lowered, word) for word in words):
            return subject_id
    return None


def _number(text: str):
    """The first figure in a line, with its unit, or (None, '')."""
    named = NAMED_SCORE.search(text)
    if named:
        return _float(named.group(2)), named.group(1).upper()
    scored = SCORE_OF.search(text)
    if scored:
        test = TEST_NAME.search(text)
        return _float(scored.group(1)), test.group(1).upper() if test else 'score'
    found = STAT.search(text)
    if found:
        return _float(found.group(1)), found.group(2).strip().lower()
    return None, ''


def _float(raw: str):
    try:
        return float(raw.replace(',', '').rstrip('.'))
    except ValueError:
        return None


def facts(answers: Dict[str, object], names: Dict[str, str]) -> List[dict]:
    """Every line of the answers, filed. In question order, then line order."""
    out = []
    for question in QUESTIONS:
        for line in _lines(str((answers or {}).get(question) or '')):
            value, unit = _number(line)
            if question == 'improve':
                kind = 'aim'
            elif ACHIEVED.search(line) and question in ('done', 'describe', 'doing'):
                kind = 'achievement'
            elif value is not None:
                kind = 'stat'
            elif question == 'doing':
                kind = 'activity'
            elif question == 'done':
                kind = 'achievement'
            else:
                kind = 'about'
            out.append({'kind': kind, 'text': _cut(line), 'subject': subject_in(line, names),
                        'value': value, 'unit': unit, 'question': question})
            if len(out) >= MAX_FACTS:
                return out
    return out


def brief_lines(rows: Iterable[dict], subject_id: Optional[str] = None,
                names: Optional[Dict[str, str]] = None, limit: int = 12) -> List[str]:
    """The facts as lines a model reads, the ones about `subject_id` first.

    With a subject, facts about other subjects are left out: a violin grade is
    not background for a geometry plan. Facts naming no subject stay, because
    "I'm in 10th grade" is background for everything.
    """
    names = names or {}
    rows = [row for row in rows if row.get('text')]
    if subject_id:
        rows = [row for row in rows if row.get('subject') in (None, '', subject_id)]
        rows.sort(key=lambda row: 0 if row.get('subject') == subject_id else 1)
    label = {'achievement': 'Has done', 'stat': 'Figure', 'activity': 'Does', 'aim': 'Wants to',
             'about': 'About them'}
    lines = []
    for row in rows[:limit]:
        tag = label.get(row.get('kind'), 'About them')
        subject = names.get(row.get('subject') or '', '')
        lines.append('{}{}: {}'.format(tag, ' ({})'.format(subject) if subject else '', row['text']))
    return lines


def stamp() -> str:
    return datetime.now().isoformat(timespec='seconds')
