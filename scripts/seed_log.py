"""Fill one account's Log with sample entries, and read each one for insights.

    .venv-fastapi/bin/python scripts/seed_log.py Alpha
    .venv-fastapi/bin/python scripts/seed_log.py Alpha --no-read

For trying the Log page and everything it feeds (next sessions, goal plans,
subject write-ups) on an account that has a long task history but no Log yet.
An entry whose title the account already has is skipped, so running it twice
adds nothing. Each new entry is then read by the model the same way a saved
entry is (backend/tracking/journal.py `learn`), one at a time with a pause
between, so a free Groq allowance isn't spent in one burst. `--no-read`
leaves them waiting; the Log page reads waiting entries when it's opened.

This writes to whatever database DATABASE_URL (or SUMMIT_DB) points at.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.config import settings  # noqa: E402

# The same .env the server reads (backend/run.py), so this writes to the same
# database and can reach the same model.
settings.load_dotenv()

from backend.database import connection as db  # noqa: E402
from backend.tracking import journal  # noqa: E402

#: (date, title, body). Written like a student would write them: goals,
#: what works and what doesn't, and a few passing moods.
ENTRIES = [
    ('2026-09-20', 'Starting this log',
     "Trying to write here most days so Summit knows what I'm actually going for.\n\n"
     "Big ones for this year: USACO Gold by December, a real Putnam score (top 500 would "
     "be amazing), and a full thesis draft before the end of term. Longer term I want "
     "violin ARCT and to get good enough at ML to work somewhere like Anthropic."),
    ('2026-09-22', 'Mornings are when I think',
     "Noticed again that anything hard I do after 9 PM goes badly. Proofs at night are "
     "just me staring at the page. Before lunch I can do real math.\n\n"
     "Also 50 minute blocks with a 10 minute break work way better for me than one long "
     "push. After about an hour I start rereading the same line."),
    ('2026-09-25', 'Lost in algorithms lecture',
     "Algorithms lecture went over my head today. It always happens when I don't skim the "
     "notes first. When I do a worked example before the lecture it clicks. Going to skim "
     "the night before from now on."),
    ('2026-09-28', 'Long run with friends',
     "Did 9 miles with the group. Signed up for the half marathon in November, so long "
     "runs are every Sunday now. Running with friends is the only reason I don't skip, "
     "solo runs I bail on half the time."),
    ('2026-10-01', 'Advisor meeting tomorrow',
     "Kind of stressed about the advisor meeting tomorrow. I still don't have a proper "
     "outline for chapter two. Need to show up with at least a page of structure."),
    ('2026-10-03', 'Putnam session notes',
     "Putnam problem session. Algebra and inequalities are fine, combinatorics is where I "
     "fall apart, especially counting arguments. Want to do three Putnam problems a week "
     "and at least one of them combinatorics."),
    ('2026-10-05', 'Evening reviews keep slipping',
     "Skipped the evening review three nights in a row. By 10 PM I'm done. Maybe I should "
     "move it to right after dinner, around 7. The days I do it, the next morning starts "
     "way faster."),
    ('2026-10-07', 'USACO practice',
     "Silver problems feel okay now. Gold DP problems still wreck me, I can't see the state. "
     "Plan is 45 minutes of DP every day, easiest gold ones first, and reading the editorial "
     "only after a real attempt."),
    ('2026-10-09', 'Violin',
     "Orchestra rehearsal was rough on the fast passage. When I start practice with 10 "
     "minutes of scales the rest goes better. Want 30 minutes a day, even on busy days."),
    ('2026-10-11', 'Too much on my plate',
     "Lectures, lab, Putnam, USACO, thesis, running. Too much this week and everything got "
     "a little worse. The Sunday reset helps me see it all at once. Probably need to drop "
     "something until the half marathon is done."),
    ('2026-10-13', 'ML lab win',
     "Got my transformer from scratch training in ML lab. Felt great. I learn this stuff "
     "best by building it, not by reading about it. Want to read one paper a week and "
     "reimplement the main idea."),
    ('2026-10-14', 'Thesis writing',
     "Wrote 700 words in a 90 minute block with my phone in another room. That's the setup. "
     "Aiming for 500 words a day on weekdays until the draft is done."),
    ('2026-10-15', 'Real analysis',
     "Epsilon-delta proofs still feel shaky. Typing them doesn't stick, writing them by "
     "hand does. Going to redo the last problem set by hand this weekend."),
    ('2026-10-16', 'A good day',
     "Finished the Math 55 problem set early. Morning meditation then straight into math "
     "is the best combo I've found. The run after felt easy too."),
]


def seed(username: str, read: bool = True, pause: float = 12.0) -> None:
    have = {row.get('title') for row in db.rows_for('log_entries', username)}
    added = []
    for day, title, body in ENTRIES:
        if title in have:
            continue
        stamp = '{}T21:30:00'.format(day)
        row = db.insert_row('log_entries', {
            'id': db.new_id('log_entries'), 'user_id': username, 'title': title,
            'body': body, 'learn_state': 'waiting', 'created_at': stamp, 'updated_at': stamp,
        })
        added.append(row['id'])
    print('{} entries added for {}'.format(len(added), username))
    if not read:
        return
    for at, entry_id in enumerate(added):
        state = journal.learn(username, entry_id)
        if state == 'failed':
            # Usually a rate limit. One more go after a longer pause.
            time.sleep(pause * 4)
            state = journal.learn(username, entry_id)
        print('  {}/{} {}'.format(at + 1, len(added), state))
        if at + 1 < len(added):
            time.sleep(pause)
    live = [row for row in db.rows_for('log_insights', username) if row.get('status') == 'active']
    print('{} active insights'.format(len(live)))


if __name__ == '__main__':
    args = [arg for arg in sys.argv[1:] if not arg.startswith('--')]
    if not args:
        sys.exit(__doc__)
    seed(args[0], read='--no-read' not in sys.argv)
