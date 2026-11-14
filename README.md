# Summit

## AMC 10, AMC 12 & AIME prep

Summit is a study site for the American Mathematics Competitions, in the spirit
of amcstep.com: tagged practice problems, a review log that brings mistakes back
on a schedule, timed mock contests, a topic map, a catalogue of every official
paper, a study plan to contest day, and search across all of it.

| Page | Path | What it does |
| --- | --- | --- |
| Dashboard | `/dashboard` | Today's plan, the next problem, projected score vs goal, progress by category |
| Review | `/review` | The error log: misses return after 3, 10 and 21 days until mastered |
| Problems | `/problems`, `/problems/:id` | Every problem in contest order (mock #1 to #25), with a chooser down the left for source (Summit Mock sets, Step problems, official papers), contest, mock set, year, problem number, rating 1-10 (the AoPS competition scale), topic, technique and status; answer to unlock the solution, key insight and trap |
| Topics | `/topics`, `/topics/:id` | 63 topics in 5 categories and 92 techniques in 5 strategy families, each with key ideas and its problems |
| Mock Contests | `/mock-contests` | Five Summit Mock sets each for the AMC 10, AMC 12 and AIME (plus the original Step Mocks), in real problem order at real difficulty, sat on an exam screen with a cover page and bubble answer sheet, graded 6 / 1.5 / 0 with a report |
| Past Contests | `/contests`, `/contests/:id` | Every official AMC 10/12 and AIME from 2000 to 2026, which can be imported one at a time (paste the AoPS page source and answer key) or many at once ("Import many papers": open a batch link, copy the page, paste) and then read whole like the AoPS problems page, practised, graded and timed in-site |
| Study Plan | `/study-plan` | Contest, date, goal and hours become a week-by-week plan (Foundations, Core, Contest mode, Taper). Tell it more (experience, last score, strong/weak topics, resources, constraints) and the AI coach writes a personal plan; its follow-up questions refine it, and its topic order leads the weeks |
| Search | `/search`, top bar / ⌘K | Problems, topics, contests and pages |

The content lives in `backend/amc/` (`bank.py` is the problem bank, `sets/` the
fifteen Summit Mock papers, `scale.py` the 1-10 rating by problem number,
`catalog.py` the topics and contests, `engine.py` the rules), the API in
`backend/api/amc.py`, the tables in `data/sql/amc.sql`, and the pages in
`frontend/src/pages/amc/`. The Step Mock and Summit Mock problems are original. Only the `temu` account (or the
accounts in `AMC_IMPORTERS`) can bring official papers in. Official MAA
problems are imported by pasting (`backend/amc/official.py` explains why the
server can't fetch them) and live only in the install's database. `tests/test_amc_bank.py` recomputes every
answer that can be brute-forced, and `tests/test_amc_sets.py` recomputes every
Summit Mock answer.

Analytics opens on **Insights** (`backend/amc/smart.py`), which needs no key:
your level on the problems' own 1-10 scale (fitted from first tries, harder
problems counting for more), predicted scores for all three contests with an
80% range and your chance of reaching the goal or cutoff, how far into a paper
you are usually right, topic and technique strengths, careless misses, time
sinks and rushed answers, a weekly trend, and the exact problems to do next.

The AI layer (`backend/amc/ai.py`, endpoints in `backend/api/amc_ai.py`) uses
**Grok** whenever `XAI_API_KEY` is set (model `GROK_MODEL`, default
`grok-4-fast`), and otherwise Groq with `GROQ_API_KEY` (model `GROQ_MODEL`). It
powers the AI coach on Insights and the study plan, hints (three levels, never
the answer), "Explain my mistake" after a wrong answer, and new problems:
"More like this" or "Write me a new problem for my weakest topic"
(`backend/amc/create.py`) has the model write a problem, then solve it again
blind, and keeps it only if both answers agree. Answers are cached (table
`amc_ai`) and each account gets `AI_DAILY_LIMIT` model calls a day (default
80). Without a key every page still works, with the numbers.

For a local account with some history on it:

    .venv-fastapi/bin/python scripts/seed_amc_demo.py

The productivity app this grew out of is described below; its pages are no
longer routed (their old URLs redirect to the dashboard).

## The original productivity app

### Overview

Summit is a gamified productivity and self-improvement platform designed to help students and lifelong learners build consistent habits, track meaningful progress, and stay motivated over long periods of time. Instead of acting as a simple to-do list, Summit combines productivity, analytics, and progression systems into a unified dashboard that encourages continuous growth.

The project was built with the goal of making productivity feel rewarding while still providing detailed insights into performance, consistency, and long-term improvement.

---

# Features

## Dashboard

The dashboard serves as the central hub of the application.

Features include:

* Personalized welcome screen
* Daily task overview
* XP and level progression
* Daily statistics
* Growth summaries
* Quick access to all major sections
* Responsive card-based layout

---

## Task Management

Summit includes a full task management system that allows users to organize their work efficiently.

Features include:

* Create tasks
* Edit existing tasks
* Delete tasks
* Task priorities
* Categories
* Due dates
* Estimated completion times
* Task descriptions
* Completion tracking
* Automatic XP rewards
* Daily task statistics

---

## Calendar

The calendar provides a visual planning interface for scheduling work.

Features include:

* Monthly calendar view
* Daily schedules
* Time-block planning
* Calendar task synchronization
* Scheduled task display
* Daily workload visualization
* Automatic updates when tasks are completed

---

## XP & Leveling System

Productivity is rewarded through a progression system.

Features include:

* XP earned from completing tasks
* User leveling
* Progress bars
* Automatic level calculation
* Daily XP tracking
* Lifetime XP tracking
* XP history

The leveling system is designed to encourage consistency instead of short bursts of productivity.

---

## Analytics

One of Summit's primary focuses is long-term progress tracking.

Analytics include:

* Daily XP
* Weekly XP
* Monthly XP
* Growth charts
* Productivity trends
* Historical performance
* Task completion statistics
* Average XP per task
* Total completed tasks
* Total hours worked

Interactive charts allow users to visualize improvements over time rather than relying on isolated daily performance.

---

## Growth Ratings

Summit evaluates multiple aspects of productivity through an overall Growth Rating.

Current categories include:

* Productivity
* Quality
* Consistency
* Efficiency
* Overall Growth Score

The system is designed to reward sustainable habits rather than excessive workloads.

---

## Streak System

Users are rewarded for maintaining consistent habits.

Features include:

* Daily streak tracking
* One forgiven day a month, once a run is a week old
* Longest streak
* Streak history
* Consecutive productivity rewards

---

## Search

The magnifier in the top bar searches two things at once:

* **Tasks** — the account's own work, matched on the server
* **Components** — the containers the app is made of: every page, every tab
  inside Analytics and the Calendar, and every section of Settings

It takes you to the closest match as you type, and the `›` arrow walks the
rest — each step moves the page behind the panel, so nothing has to be
confirmed with Enter. That is what makes it useful for the thing a search box
is usually no help with: reaching a control without knowing which screen it is
on. Typing "dark mode" lands on Settings → Appearance; "percentile" lands on
the Records tab of Analytics.

Focus never leaves the box, so the keyboard is the whole control:

| Key | Does |
| --- | --- |
| Down / Up | the next and previous match |
| Right / Left | the same, from the end and the start of the text |
| Enter | close; you are already there |
| Escape | close, and stay where you were |

A task match goes to where the task actually is. One the calendar draws opens
the Day view on its day, scrolled to the block and ringed for a moment; one
nobody put on the calendar opens the tasks page, which reveals the row — the
heading it is under, past the draw limit, or behind a filter — and marks it.
Only unfinished tasks are searched: what this panel does with a match is take
you to it, and a finished task is not somewhere to be taken.

---

## Notifications

The bell in the top bar is the one part of Summit that speaks first. Nothing is
sent on a schedule — the app reads your own record when you open it and says
what is true, so a quiet week is a quiet bell.

Six kinds, each with its own switch in Settings:

* **Tasks** — work past its date, work due today, work due tomorrow
* **Calendar** — what is on today, and the block about to start within the hour
* **Analytics** — a weekly summary against the week before, a gap of four days
  or more with nothing on it, and the day you beat your own best
* **Goals** — a goal past its date, one due inside a week, one finished but
  still open
* **Streak** — a live streak with nothing on the board yet today, and the days
  worth marking
* **Progress** — a level reached, a badge earned, a record set

They arrive as a pop-up at the corner of the page and stay in the bell. Each
one can be deleted, and there is a Delete all — and a deleted notification does
not come back: the situation behind it is remembered as answered, so the bell
stays quiet until something genuinely new happens.

Everything can be turned off: the whole feature, the on-screen pop-ups alone,
or any one of the six kinds.

---

## Themes & Personalization

Users can customize the appearance of the application.

Features include:

* Multiple built-in themes
* Modern minimal UI
* Responsive layout
* Personalized dashboard experience

---

## Data Tracking

Summit stores and tracks a wide variety of productivity metrics.

Tracked data includes:

* Daily XP
* Total XP
* Levels
* Task history
* Completion history
* Daily statistics
* Productivity history
* Growth history
* Calendar events
* Streak information

---

# Accounts & Sign-In

Pages that show personal data — Dashboard, Calendar, Goals and Growth — need an
account. A signed-out visitor who opens one is sent to the home page with the
account popup already open, and finishing the flow drops them on the page they
were originally after.

The popup walks one path:

```
                       ┌──────────── Welcome ────────────┐
                    Log In                         Create Account
                       │                                 │
                       │                     Name · E-mail · Password
                       │                        (password strength)
                       │                                 │
                       │                      verification e-mail sent
                       │                         "check your inbox"
                       │                            verify e-mail
                       └────────────────┬────────────────┘
                                Complete Profile
                     (username optional · theme · daily goal)
                                        │
                                    Dashboard
```

Accounts created before this flow still work: they sign in with their username,
and their stored password is upgraded to a hash the first time they do.

## Optional credentials

Everything below is optional — the app runs without any of it. Copy
`.env.example` to `.env` and fill in only what you want.

**Sending real verification e-mail.** Without mail credentials the app is in dev
mode: the verification link is printed to the server console *and* shown in the
popup, so the flow can be walked start to finish on a laptop with no mail
account. Set `MAIL_USERNAME` and `MAIL_PASSWORD` and it sends over SMTP instead,
with no code change. For Gmail, that password is an **App Password**: Google
Account → Security → 2-Step Verification (must be on) → App passwords → create
one for "Mail". Recipients can be on any provider — Gmail, Outlook, anything.

**Sign in with Google.** The "Continue with Google" button only appears once
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, so nothing looks broken
until then. To create them:

1. Open <https://console.cloud.google.com/> and make (or pick) a project.
2. APIs & Services → OAuth consent screen → External → fill in the app name and
   your e-mail → add yourself under Test users.
3. APIs & Services → Credentials → Create credentials → OAuth client ID →
   Web application.
4. Under *Authorised redirect URIs* add exactly:
   `http://127.0.0.1:5050/auth/google/callback`
5. Copy the client ID and client secret into `.env`, then restart the app.

Signing in with Google needs no verification e-mail — Google has already proved
the address — so it goes straight to Complete Profile.

---

# Technology Stack

Frontend

* React
* TypeScript
* Vite
* CSS

Backend

* Python
* FastAPI
* Uvicorn

Storage

* PostgreSQL when `DATABASE_URL` is set (see `.env.example`); the tables are
  created on first start from the same schema as below
* SQLite (`data/summit.db`, built from `data/sql/`) otherwise, and for the test
  suite — `scripts/migrate_to_postgres.py` copies a SQLite file into Postgres
* `SUMMIT_TEST_DATABASE_URL=postgresql://localhost/summit_test pytest` runs the
  suite against a throwaway Postgres database instead

Visualization

* Chart.js

Interactive API documentation is generated from the code and served at
`/docs` while the app is running.

---

# Design Philosophy

Summit is built around four core ideas:

### Consistency over intensity

Long-term habits are more valuable than occasional bursts of productivity.

### Progress should be measurable

Users should be able to see how they have improved over weeks, months, and years.

### Productivity should feel rewarding

Gamification encourages users to return every day while maintaining meaningful progress.

### Simplicity first

The interface prioritizes clarity and usability without sacrificing functionality.

---

# Current Status

Summit is currently under active development.

Completed areas include:

* Dashboard
* Task management
* Calendar
* XP system
* Leveling system
* Growth analytics
* Charts
* Theme system
* Responsive interface
* Productivity tracking
* Statistics
* Data persistence

Features currently being expanded include:

* Advanced analytics
* Growth Ratings
* Automation tools
* Smarter productivity insights
* Improved account management
* Additional personalization options

---

# Future Roadmap

Planned features include:

* User authentication
* Cloud synchronization
* Cross-device support
* Advanced goal tracking
* AI-powered productivity recommendations
* Achievement system
* Habit tracking
* Scheduled reminders (the app has no job runner; notifications are read from
  the record when you open it rather than sent at a time)
* Data export
* Team workspaces
* Enhanced analytics dashboard

---

# Project Vision

Summit aims to become more than a productivity app.

The long-term vision is to create a platform that helps users understand how they spend their time, identify patterns in their work, and continuously improve through meaningful data and consistent habits.

Rather than simply checking off tasks, Summit is designed to help users build discipline, maintain motivation, and visualize personal growth over months and years.
