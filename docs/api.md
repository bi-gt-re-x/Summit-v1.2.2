# API

Every endpoint returns JSON with a `success` boolean. A failure is usually
`{"success": false, "message": "..."}` with HTTP 200 — the client checks the
flag, not the status. Requests that need an account pass `username` (query
string for GET, body for POST/PUT/DELETE); the session is only used by the
account endpoints and the page gate.

The file each endpoint lives in is in the right-hand column.

## Pages

`routes/spa.py` serves the built React app; `routes/pages.py` renders the Jinja
templates that are left. A path appears in exactly one of the two.

| Route | Notes | File |
| --- | --- | --- |
| `GET /` | Signed in → `/dashboard`, else `/home` (decided in `App.tsx`) | `routes/spa.py` |
| `GET /home` | The landing page, and the host of the sign-in popup | `routes/spa.py` |
| `GET /dashboard` | Account required | `routes/spa.py` |
| `GET /calendar`, `/calendar/day`, `/calendar/week`, `/calendar/month` | Account required; `/calendar` redirects to the week | `routes/spa.py` |
| `GET /goals` | Account required | `routes/spa.py` |
| `GET /growth` | Account required | `routes/spa.py` |
| `GET /analytics` | Account required | `routes/spa.py` |
| `GET /about-us` | | `routes/spa.py` |
| `GET /privacy-policy` | | `routes/spa.py` |
| `GET /terms-of-service` | | `routes/spa.py` |
| `GET /careers`, `/contact-support` | Not ported yet | `routes/pages.py` |
| `GET /engine` | Hidden; gated client-side by today's unlock | `routes/pages.py` |

A signed-out visitor asking for a gated page is redirected to
`/login?auth=login&next=<path>` (`middleware/gate.py`), the React sign-in page.

## Account

| Endpoint | Does |
| --- | --- |
| `GET /api/auth/providers` | What the popup should offer (Google, mail) |
| `POST /api/auth/signup` | name + e-mail + password → verification e-mail |
| `POST /api/auth/resend` | Send the verification link again |
| `GET /api/auth/verify_status` | Polled by the "check your inbox" screen |
| `GET /verify/<token>` | The link in the e-mail: confirms, signs in |
| `POST /api/auth/complete_profile` | Username, theme, daily goal |
| `POST /api/login` | Username **or** e-mail + password |
| `POST /api/logout` | Clears the session and the theme cookie |
| `POST /api/signup` | The original username + password sign-up, kept for older clients |
| `GET /auth/google`, `GET /auth/google/callback` | Google sign-in, when configured |
| `POST /api/set_theme` | `{"theme": "light" \| "dark"}` |
| `POST /api/avatar` | `{"avatar": "<one of the fifty>"}` — the account menu's picture picker. 401 signed out, 400 for an unknown name |

All in `routes/auth.py`, except the theme (`routes/theme.py`).

## Dashboard — `api/dashboard.py`

| Endpoint | Does |
| --- | --- |
| `GET /api/get_user_data?username=` | Stats (level, xp, tasks, streaks) + every task. Decays a stale streak on read |
| `POST /api/update_stats` | Write back level / xp / tasks_completed |
| `POST /api/track_daily_xp` | Fold a batch into today's ledger row |

## Tasks — `api/tasks.py`

| Endpoint | Does |
| --- | --- |
| `GET /api/tasks?username=` | Every task for an account |
| `POST /api/tasks` | Create one (`name`, `priority`, `xp_reward`, `due_date`) |
| `PUT /api/tasks/<id>` | Edit; `completed: true` stamps it done |
| `DELETE /api/tasks/<id>?username=` | Delete |
| `POST /api/complete_task` | **The one that matters**: XP, level, streak, ledger row, goal progress |
| `POST /api/get_task_status` | Status of one task |
| `POST /api/timer_expired` | Timer ran out → status `expired` |
| `POST /api/update_task_due_date` | Push a deadline out |
| `GET /api/last_task_completion?username=` | Most recent completion, polled by the goals page |
| `POST /api/add_task`, `POST /api/delete_task` | Older names, kept |
| `POST /api/delete_task_no_tracking` | Delete with no XP/streak side effects |

## Goals — `api/goals.py`

| Endpoint | Does |
| --- | --- |
| `POST /api/add_goal` | Type `xp` / `streak` / `tasks` / `focus`, with its target |
| `GET /api/get_goals?username=` | Every goal + `avg_xp_per_day`. Re-syncs streak and focus goals first |
| `POST /api/update_goal` | Edit fields |
| `POST /api/delete_goal` | Delete |
| `POST /api/update_goal_progress` | Add to one counter by hand, capped at target |
| `POST /api/auto_apply_task_xp` | Apply a completed task's XP to active XP goals |

## Calendar — `api/calendar.py`

| Endpoint | Does |
| --- | --- |
| `GET/POST /api/calendar` | List / create entries (a task on a day) |
| `PUT/DELETE /api/calendar/<id>` | Edit / delete an entry |
| `POST /api/create_calendar_event` | A standalone block, optionally recurring |
| `DELETE /api/delete_calendar_event/<id>` | Delete one (built-ins are protected) |
| `GET /api/get_default_events`, `/api/get_custom_events` | Split by `is_default` |
| `POST /api/sync_task_to_calendar` | Put an existing task on the calendar |
| `POST /api/mark_task_completed_in_calendar` | Complete a task and tick its entries |
| `GET /api/get_calendar_progress?username=` | Totals and per-day grouping |
| `GET /api/get_event_colors`, `POST /api/add_event_color` | The palette already in use |
| `GET/POST /api/day_focus` | The one-line focus note on a day |
| `GET /api/xp_earned_on?username=&date=` | One day's XP, midnight to midnight |

## Focus — `api/focus.py`

| Endpoint | Does |
| --- | --- |
| `POST /api/focus_sync` | Mirror a day's focus total (never lowers a recorded total) |
| `GET /api/focus_history?username=&start=&end=` | `{iso: {seconds, goal_hours}}` |

## Growth — `api/growth.py`

| Endpoint | Does |
| --- | --- |
| `GET /api/get_growth_data?username=` | Day-by-day XP, tasks and focus; last 30 days |
| `GET /api/get_growth_ratings?username=` | The five-metric report card + weekly trends |
| `GET /api/get_xp_data?username=` | The ledger rolled up: level, totals, series |

## Task search — `api/tasks.py`

| Endpoint | Does |
| --- | --- |
| `GET /api/tasks/search?q=&limit=&open=` | Title search, unfinished first |

`open=1` drops the finished ones. The top bar's search passes it: what that
panel does with a result is take the reader to it, and the cap means a word
appearing in more finished tasks than the limit would otherwise come back with
the live ones missing.

## Notifications — `api/notifications.py`

| Endpoint | Does |
| --- | --- |
| `GET /api/notifications?day=&at=` | Sweep the record, then the account's live list |
| `POST /api/notifications/mark` | `{shown: [id], read: bool}` — on screen, or opened |
| `DELETE /api/notifications/{id}` | Throw one away, permanently |
| `DELETE /api/notifications` | Throw all of them away, permanently |

The read is also the write: there is no job runner, so the request that asks
for the list is what produces it (`backend/tracking/notify.py`). `day` and `at`
are the reader's local ISO day and `HH:MM` — stored stamps carry no timezone,
so the server cannot work out "today" or "within the hour" on its own.

Both deletes are soft, and permanently so. The situation a notification
describes is usually still true, so a hard delete would let the next sweep
write it straight back; the tombstone under its fingerprint is what makes the
bell stay quiet until something genuinely new turns up.

## Closed gap

`calendar-month.js` posted to `/api/update_task_completion`, which never
existed server-side, so it 404'd on every calendar completion. The React month
view calls `/api/complete_task` like everything else, and that script is gone —
the endpoint was never worth adding, only the call was worth correcting.
