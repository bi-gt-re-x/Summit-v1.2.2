"""The subject catalogue — the 150 things a task is usually *about*.

A task has always had a name, a priority and an XP value, and nothing that
says what kind of work it is. "Finish essay" and "Leg day" are the same shape
of row. Subject is that missing column, and it is deliberately a fixed list
rather than free text: a field anyone can type into becomes "Maths", "maths",
"Math" and "MATH" within a week, and nothing downstream can count those as one
thing.

Three rules the list follows, and they are the reason it is a list at all:

**150, and the common ones.** Not an ontology — the subjects a student or a
working adult actually files a task under. It was a hundred until 2026-10-11,
when fifty more were added for students: the classes they take (Trig, Orgo,
AP Gov), the things school asks of them (test prep, college apps, financial
aid) and the clubs and sports they fill their weeks with. They are grouped below in the
order the picker offers them to someone who has never chosen one, so the
groups double as the default ordering.

**A short label for a long name.** A pill row is read sideways, and
"Environmental Science" in a pill is most of the row. Anything over eight
characters carries an abbreviation, and the picker shows that; the full name
is what is stored and what the reader is told on hover. Eight is the cut
because it is where the pills stop fitting three or four to a row, not because
it is a round number.

**An icon that is the subject's own.** Every one of these names an SVG in
utils/icons/, served at /static/icons/<icon>.svg and painted through the same
CSS mask the calendar's block icons use, so a subject pill matches its text in
either theme. Icons are shared only where the *concept* is shared — the five
languages all point at `language`, because that is what each of them is — and
never merely because two drawings would be similar. Where the first draft of
an icon collided with one already in the set (a second flask for Chemistry, a
second globe for Geography), the icon was redrawn rather than the collision
accepted.

`id` is what goes in the database, and it is what must never change: a stored
task points at it. Names and icons above it can be edited freely.
"""

# The nine groups, each a name and its rows: (id, name, abbreviation, icon).
#
# The groups were section comments in this tuple for as long as it has existed,
# which made them real to whoever edited the file and invisible to everything
# that read it. They are data now, because the skill trees draw a column of
# categories and building that column from a second hand-written list would be
# the same nine names in two places — free to write and certain to drift.
#
# Flattening below preserves the order exactly, so `SUBJECTS` is the same
# 150 in the same sequence it always was. That matters: catalogue order is
# the picker's default offer, and it runs from study through work to home.
_GROUPS = (
    ('Math and science', (
        ('mathematics', 'Mathematics', 'Math', 'math'),
        ('algebra', 'Algebra', None, 'algebra'),
        ('calculus', 'Calculus', None, 'calculus'),
        ('geometry', 'Geometry', None, 'geometry'),
        ('statistics', 'Statistics', 'Stats', 'statistics'),
        ('physics', 'Physics', None, 'physics'),
        ('chemistry', 'Chemistry', 'Chem', 'chemistry'),
        ('biology', 'Biology', None, 'biology'),
        ('anatomy', 'Anatomy', None, 'anatomy'),
        ('genetics', 'Genetics', None, 'genetics'),
        ('astronomy', 'Astronomy', 'Astro', 'astronomy'),
        ('geology', 'Geology', None, 'geology'),
        ('ecology', 'Ecology', None, 'ecology'),
        ('science', 'Science', None, 'science'),
        ('trigonometry', 'Trigonometry', 'Trig', 'trigonometry'),
        ('precalculus', 'Precalculus', 'Precalc', 'precalculus'),
        ('differential_equations', 'Differential Equations', 'Diff Eq', 'diffeq'),
        ('organic_chemistry', 'Organic Chemistry', 'Orgo', 'benzene'),
        ('biochemistry', 'Biochemistry', 'Biochem', 'enzyme'),
        ('microbiology', 'Microbiology', 'Microbio', 'microscope'),
        ('neuroscience', 'Neuroscience', 'Neuro', 'neuron'),
        ('environmental_science', 'Environmental Science', 'Env Sci', 'recycle'),
        ('forensic_science', 'Forensic Science', 'Forensic', 'forensics'),
        ('lab_work', 'Lab Work', None, 'lab'),
        ('science_fair', 'Science Fair', 'Sci Fair', 'experiment'),
    )),
    ('Studying', (
        ('homework', 'Homework', None, 'homework'),
        ('revision', 'Revision', None, 'revision'),
        ('exams', 'Exams', None, 'exam'),
        ('lectures', 'Lectures', None, 'school'),
        ('research', 'Research', None, 'research'),
        ('thesis', 'Thesis', None, 'thesis'),
        ('coursework', 'Coursework', 'Course', 'coursework'),
        ('tutoring', 'Tutoring', None, 'tutoring'),
        ('study_group', 'Study Group', 'Group', 'studygroup'),
        ('flashcards', 'Flashcards', 'Cards', 'flashcards'),
        ('school', 'School', None, 'backpack'),
        ('note_taking', 'Note-Taking', 'Notes', 'notes'),
        ('test_prep', 'Test Prep', 'TestPrep', 'testprep'),
        ('college_apps', 'College Applications', 'College', 'graduation'),
        ('financial_aid', 'Financial Aid', 'Fin Aid', 'piggy-bank'),
        ('extracurriculars', 'Extracurriculars', 'ECs', 'star'),
        ('pre_med', 'Pre-Med', None, 'doctor'),
        ('ai_tools', 'AI Tools', None, 'spark'),
    )),
    ('Language and humanities', (
        ('english', 'English', None, 'english'),
        ('literature', 'Literature', 'Lit', 'reading'),
        ('writing', 'Writing', None, 'writing'),
        ('grammar', 'Grammar', None, 'grammar'),
        ('vocabulary', 'Vocabulary', 'Vocab', 'vocabulary'),
        ('spanish', 'Spanish', None, 'language'),
        ('french', 'French', None, 'language'),
        ('german', 'German', None, 'language'),
        ('japanese', 'Japanese', None, 'language'),
        ('mandarin', 'Mandarin', None, 'language'),
        ('history', 'History', None, 'history'),
        ('geography', 'Geography', 'Geo', 'geography'),
        ('philosophy', 'Philosophy', 'Philos', 'philosophy'),
        ('psychology', 'Psychology', 'Psych', 'psychology'),
        ('sociology', 'Sociology', 'Sociol', 'sociology'),
        ('politics', 'Politics', None, 'politics'),
        ('latin', 'Latin', None, 'monument'),
        ('sign_language', 'Sign Language', 'ASL', 'hands'),
        ('essays', 'Essays', None, 'essay'),
        ('creative_writing', 'Creative Writing', 'Creative', 'story'),
        ('poetry', 'Poetry', None, 'poem'),
        ('journalism', 'Journalism', 'Journo', 'newspaper'),
        ('public_speaking', 'Public Speaking', 'Speaking', 'speaking'),
        ('civics', 'Civics', None, 'civics'),
        ('model_un', 'Model UN', None, 'globe'),
    )),
    ('Computing', (
        ('programming', 'Programming', 'Coding', 'code'),
        ('computer_science', 'Computer Science', 'CompSci', 'computer'),
        ('web_design', 'Web Design', 'Web', 'web'),
        ('data_science', 'Data Science', 'Data', 'data'),
        ('machine_learning', 'Machine Learning', 'ML', 'ai'),
        ('cybersecurity', 'Cybersecurity', 'Cyber', 'security'),
        ('databases', 'Databases', 'Database', 'database'),
        ('networking', 'Networking', 'Network', 'network'),
        ('robotics', 'Robotics', None, 'robotics'),
        ('engineering', 'Engineering', 'Eng', 'engineering'),
        ('python', 'Python', None, 'code'),
        ('java', 'Java', None, 'code'),
        ('game_dev', 'Game Development', 'Game Dev', 'game'),
        ('app_dev', 'App Development', 'App Dev', 'phone'),
        ('electronics', 'Electronics', 'Circuits', 'circuit'),
        ('spreadsheets', 'Spreadsheets', 'Sheets', 'spreadsheet'),
    )),
    ('Business and money', (
        ('economics', 'Economics', 'Econ', 'economics'),
        ('business', 'Business', None, 'business'),
        ('marketing', 'Marketing', 'Market', 'marketing'),
        ('accounting', 'Accounting', 'Accounts', 'accounting'),
        ('finance', 'Finance', None, 'finance'),
        ('budgeting', 'Budgeting', 'Budget', 'budget'),
        ('investing', 'Investing', 'Invest', 'investing'),
        ('taxes', 'Taxes', None, 'tax'),
        ('law', 'Law', None, 'law'),
        ('management', 'Management', 'Manage', 'management'),
        ('entrepreneurship', 'Entrepreneurship', 'Startup', 'rocket'),
    )),
    ('Work', (
        ('work', 'Work', None, 'work'),
        ('meetings', 'Meetings', None, 'meeting'),
        ('email', 'Email', None, 'email'),
        ('calls', 'Calls', None, 'call'),
        ('admin', 'Admin', None, 'admin'),
        ('planning', 'Planning', None, 'plan'),
        ('presenting', 'Presenting', 'Present', 'presentation'),
        ('reports', 'Reports', None, 'report'),
        ('interviews', 'Interviews', 'Intervw', 'interview'),
        ('job_search', 'Job Search', 'Jobs', 'jobsearch'),
        ('part_time_job', 'Part-Time Job', 'Job', 'job'),
        ('internships', 'Internships', 'Intern', 'internship'),
        ('leadership', 'Leadership', 'Leader', 'leadership'),
    )),
    ('Creative', (
        ('art', 'Art', None, 'art'),
        ('drawing', 'Drawing', None, 'drawing'),
        ('design', 'Design', None, 'design'),
        ('photography', 'Photography', 'Photo', 'photo'),
        ('music', 'Music', None, 'music'),
        ('guitar', 'Guitar', None, 'guitar'),
        ('piano', 'Piano', None, 'piano'),
        ('singing', 'Singing', None, 'singing'),
        ('dance', 'Dance', None, 'dance'),
        ('film', 'Film', None, 'film'),
        ('violin', 'Violin', None, 'violin'),
        ('drums', 'Drums', None, 'drum'),
        ('band', 'Band & Orchestra', 'Band', 'band'),
        ('music_theory', 'Music Theory', 'Theory', 'theory'),
        ('theater', 'Theater', None, 'theater'),
        ('art_history', 'Art History', 'Art Hist', 'museum'),
        ('cad', '3D Modeling & CAD', '3D & CAD', 'cad'),
    )),
    ('Health and fitness', (
        ('gym', 'Gym', None, 'gym'),
        ('running', 'Running', None, 'run'),
        ('cycling', 'Cycling', None, 'bike'),
        ('swimming', 'Swimming', None, 'swim'),
        ('yoga', 'Yoga', None, 'yoga'),
        ('meditation', 'Meditation', 'Meditate', 'meditation'),
        ('nutrition', 'Nutrition', 'Nutri', 'nutrition'),
        ('sleep', 'Sleep', None, 'sleep'),
        ('therapy', 'Therapy', None, 'therapy'),
        ('health', 'Health', None, 'health'),
        ('basketball', 'Basketball', 'Hoops', 'basketball'),
        ('soccer', 'Soccer', None, 'soccer'),
        ('stress', 'Stress', None, 'stress'),
    )),
    ('Life and home', (
        ('chores', 'Chores', None, 'cleaning'),
        ('laundry', 'Laundry', None, 'laundry'),
        ('cooking', 'Cooking', None, 'cooking'),
        ('groceries', 'Groceries', 'Grocery', 'groceries'),
        ('errands', 'Errands', None, 'errand'),
        ('family', 'Family', None, 'family'),
        ('friends', 'Friends', None, 'friends'),
        ('travel', 'Travel', None, 'travel'),
        ('reading', 'Reading', None, 'reading'),
        ('journaling', 'Journaling', 'Journal', 'journal'),
        ('driving', 'Driving', None, 'car'),
        ('chess', 'Chess', None, 'chess'),
    )),
)

#: The length past which a name is shown by its abbreviation instead.
LABEL_LIMIT = 8

#: The nine group names, in catalogue order. What a category column offers.
GROUPS = tuple(name for name, _rows in _GROUPS)

SUBJECTS = tuple(
    {
        'id': subject_id,
        'name': name,
        # The picker draws this. Only names past the limit have one, and every
        # name past the limit has one — the assertion below is what keeps that
        # true as the list is edited.
        'abbr': abbr,
        'label': abbr if abbr else name,
        'icon': icon,
        # Which of the nine this belongs to. Sent with every subject rather
        # than as a separate group→ids map, so a client grouping the list never
        # has to join two responses that could arrive out of step.
        'group': group,
    }
    for group, rows in _GROUPS
    for subject_id, name, abbr, icon in rows
)

BY_ID = {subject['id']: subject for subject in SUBJECTS}


def get(subject_id):
    """One subject, or None. Anything not in the catalogue is not a subject."""
    if not subject_id:
        return None
    return BY_ID.get(str(subject_id).strip().lower())


def is_valid(subject_id):
    """Whether a stored or submitted value names a subject in the catalogue."""
    return get(subject_id) is not None


# The two invariants the docstring promises, checked once at import rather
# than trusted: a typo in the table above should fail loudly on startup, not
# quietly ship a pill with no icon or a name too long for its row.
assert len(SUBJECTS) == 150, 'the catalog is 150 subjects'
assert len(BY_ID) == 150, 'subject ids have to be unique'
assert all(
    len(subject['label']) <= LABEL_LIMIT for subject in SUBJECTS
), 'every name longer than eight characters needs an abbreviation'
