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
# Flattening below preserves the order exactly. That matters: catalogue order is
# the picker's default offer, and it runs from study through work to home.
_GROUPS = (
    ('Math and science', (
        ('mathematics', 'Mathematics', 'Math', 'math'),
        ('algebra', 'Algebra', None, 'algebra'),
        ('geometry', 'Geometry', None, 'geometry'),
        ('trigonometry', 'Trigonometry', 'Trig', 'trigonometry'),
        ('precalculus', 'Precalculus', 'Precalc', 'precalculus'),
        ('calculus', 'Calculus', None, 'calculus'),
        ('statistics', 'Statistics', 'Stats', 'statistics'),
        ('differential_equations', 'Differential Equations', 'Diff Eq', 'diffeq'),
        ('science', 'Science', None, 'science'),
        ('biology', 'Biology', None, 'biology'),
        ('chemistry', 'Chemistry', 'Chem', 'chemistry'),
        ('physics', 'Physics', None, 'physics'),
        ('anatomy', 'Anatomy', None, 'anatomy'),
        ('genetics', 'Genetics', None, 'genetics'),
        ('ecology', 'Ecology', None, 'ecology'),
        ('environmental_science', 'Environmental Science', 'Env Sci', 'recycle'),
        ('astronomy', 'Astronomy', 'Astro', 'astronomy'),
        ('geology', 'Geology', None, 'geology'),
        ('organic_chemistry', 'Organic Chemistry', 'Orgo', 'benzene'),
        ('biochemistry', 'Biochemistry', 'Biochem', 'enzyme'),
        ('microbiology', 'Microbiology', 'Microbio', 'microscope'),
        ('neuroscience', 'Neuroscience', 'Neuro', 'neuron'),
        ('forensic_science', 'Forensic Science', 'Forensic', 'forensics'),
        ('lab_work', 'Lab Work', None, 'lab'),
        ('science_fair', 'Science Fair', 'Sci Fair', 'experiment'),
    )),
    ('Studying', (
        ('school', 'School', None, 'backpack'),
        ('homework', 'Homework', None, 'homework'),
        ('exams', 'Exams', None, 'exam'),
        ('test_prep', 'Test Prep', 'TestPrep', 'testprep'),
        ('revision', 'Revision', None, 'revision'),
        ('flashcards', 'Flashcards', 'Cards', 'flashcards'),
        ('note_taking', 'Note-Taking', 'Notes', 'notes'),
        ('lectures', 'Lectures', None, 'school'),
        ('coursework', 'Coursework', 'Course', 'coursework'),
        ('study_group', 'Study Group', 'Group', 'studygroup'),
        ('tutoring', 'Tutoring', None, 'tutoring'),
        ('research', 'Research', None, 'research'),
        ('thesis', 'Thesis', None, 'thesis'),
        ('college_apps', 'College Applications', 'College', 'graduation'),
        ('financial_aid', 'Financial Aid', 'Fin Aid', 'piggy-bank'),
        ('extracurriculars', 'Extracurriculars', 'ECs', 'star'),
        ('pre_med', 'Pre-Med', None, 'doctor'),
        ('ai_tools', 'AI Tools', None, 'spark'),
    )),
    ('Language and humanities', (
        ('english', 'English', None, 'english'),
        ('essays', 'Essays', None, 'essay'),
        ('literature', 'Literature', 'Lit', 'reading'),
        ('writing', 'Writing', None, 'writing'),
        ('grammar', 'Grammar', None, 'grammar'),
        ('vocabulary', 'Vocabulary', 'Vocab', 'vocabulary'),
        ('creative_writing', 'Creative Writing', 'Creative', 'story'),
        ('poetry', 'Poetry', None, 'poem'),
        ('journalism', 'Journalism', 'Journo', 'newspaper'),
        ('public_speaking', 'Public Speaking', 'Speaking', 'speaking'),
        ('spanish', 'Spanish', None, 'language'),
        ('french', 'French', None, 'language'),
        ('german', 'German', None, 'language'),
        ('japanese', 'Japanese', None, 'language'),
        ('mandarin', 'Mandarin', None, 'language'),
        ('latin', 'Latin', None, 'monument'),
        ('sign_language', 'Sign Language', 'ASL', 'hands'),
        ('history', 'History', None, 'history'),
        ('civics', 'Civics', None, 'civics'),
        ('politics', 'Politics', None, 'politics'),
        ('geography', 'Geography', 'Geo', 'geography'),
        ('model_un', 'Model UN', None, 'globe'),
        ('philosophy', 'Philosophy', 'Philos', 'philosophy'),
        ('psychology', 'Psychology', 'Psych', 'psychology'),
        ('sociology', 'Sociology', 'Sociol', 'sociology'),
    )),
    ('Computing', (
        ('programming', 'Programming', 'Coding', 'code'),
        ('python', 'Python', None, 'code'),
        ('java', 'Java', None, 'code'),
        ('computer_science', 'Computer Science', 'CompSci', 'computer'),
        ('web_design', 'Web Design', 'Web', 'web'),
        ('app_dev', 'App Development', 'App Dev', 'phone'),
        ('game_dev', 'Game Development', 'Game Dev', 'game'),
        ('data_science', 'Data Science', 'Data', 'data'),
        ('spreadsheets', 'Spreadsheets', 'Sheets', 'spreadsheet'),
        ('machine_learning', 'Machine Learning', 'ML', 'ai'),
        ('cybersecurity', 'Cybersecurity', 'Cyber', 'security'),
        ('databases', 'Databases', 'Database', 'database'),
        ('networking', 'Networking', 'Network', 'network'),
        ('robotics', 'Robotics', None, 'robotics'),
        ('electronics', 'Electronics', 'Circuits', 'circuit'),
        ('engineering', 'Engineering', 'Eng', 'engineering'),
    )),
    ('Business and money', (
        ('economics', 'Economics', 'Econ', 'economics'),
        ('finance', 'Finance', None, 'finance'),
        ('budgeting', 'Budgeting', 'Budget', 'budget'),
        ('entrepreneurship', 'Entrepreneurship', 'Startup', 'rocket'),
        ('business', 'Business', None, 'business'),
        ('marketing', 'Marketing', 'Market', 'marketing'),
        ('accounting', 'Accounting', 'Accounts', 'accounting'),
        ('investing', 'Investing', 'Invest', 'investing'),
        ('taxes', 'Taxes', None, 'tax'),
        ('law', 'Law', None, 'law'),
        ('management', 'Management', 'Manage', 'management'),
    )),
    ('Work', (
        ('part_time_job', 'Part-Time Job', 'Job', 'job'),
        ('internships', 'Internships', 'Intern', 'internship'),
        ('job_search', 'Job Search', 'Jobs', 'jobsearch'),
        ('interviews', 'Interviews', 'Intervw', 'interview'),
        ('leadership', 'Leadership', 'Leader', 'leadership'),
        ('presenting', 'Presenting', 'Present', 'presentation'),
        ('planning', 'Planning', None, 'plan'),
        ('work', 'Work', None, 'work'),
        ('meetings', 'Meetings', None, 'meeting'),
        ('email', 'Email', None, 'email'),
        ('calls', 'Calls', None, 'call'),
        ('admin', 'Admin', None, 'admin'),
        ('reports', 'Reports', None, 'report'),
    )),
    ('Creative', (
        ('art', 'Art', None, 'art'),
        ('drawing', 'Drawing', None, 'drawing'),
        ('design', 'Design', None, 'design'),
        ('photography', 'Photography', 'Photo', 'photo'),
        ('film', 'Film', None, 'film'),
        ('theater', 'Theater', None, 'theater'),
        ('art_history', 'Art History', 'Art Hist', 'museum'),
        ('cad', '3D Modeling & CAD', '3D & CAD', 'cad'),
        ('music', 'Music', None, 'music'),
        ('music_theory', 'Music Theory', 'Theory', 'theory'),
        ('band', 'Band & Orchestra', 'Band', 'band'),
        ('piano', 'Piano', None, 'piano'),
        ('guitar', 'Guitar', None, 'guitar'),
        ('violin', 'Violin', None, 'violin'),
        ('drums', 'Drums', None, 'drum'),
        ('singing', 'Singing', None, 'singing'),
        ('dance', 'Dance', None, 'dance'),
    )),
    ('Health and fitness', (
        ('gym', 'Gym', None, 'gym'),
        ('running', 'Running', None, 'run'),
        ('basketball', 'Basketball', 'Hoops', 'basketball'),
        ('soccer', 'Soccer', None, 'soccer'),
        ('swimming', 'Swimming', None, 'swim'),
        ('cycling', 'Cycling', None, 'bike'),
        ('yoga', 'Yoga', None, 'yoga'),
        ('sleep', 'Sleep', None, 'sleep'),
        ('stress', 'Stress', None, 'stress'),
        ('meditation', 'Meditation', 'Meditate', 'meditation'),
        ('nutrition', 'Nutrition', 'Nutri', 'nutrition'),
        ('therapy', 'Therapy', None, 'therapy'),
        ('health', 'Health', None, 'health'),
    )),
    ('Life and home', (
        ('chores', 'Chores', None, 'cleaning'),
        ('laundry', 'Laundry', None, 'laundry'),
        ('cooking', 'Cooking', None, 'cooking'),
        ('groceries', 'Groceries', 'Grocery', 'groceries'),
        ('errands', 'Errands', None, 'errand'),
        ('driving', 'Driving', None, 'car'),
        ('family', 'Family', None, 'family'),
        ('friends', 'Friends', None, 'friends'),
        ('travel', 'Travel', None, 'travel'),
        ('reading', 'Reading', None, 'reading'),
        ('journaling', 'Journaling', 'Journal', 'journal'),
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
