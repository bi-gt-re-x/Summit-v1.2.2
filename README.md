# Summit

## Overview

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
