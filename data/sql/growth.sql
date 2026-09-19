-- growth — the XP ledger the growth page is built on.
--
-- One append-only row per XP-earning moment. It is the source of truth for
-- "how much did I earn, and when": the growth chart, the calendar's daily XP
-- and the report card all read it rather than recomputing from tasks.
--
-- Two reasons are written:
--   task_completion  one completed task, tasks_completed = 1
--   daily_xp         a rolled-up day total, tasks_completed = the day's count

CREATE TABLE IF NOT EXISTS xp_events (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,

    amount           INTEGER DEFAULT 0,
    reason           TEXT DEFAULT 'task_completion',

    -- The moment it happened, and the day it counts toward. The day is kept
    -- alongside so a day's total is an equality test, not a range scan. Older
    -- rows predate the date column and carry only the timestamp.
    timestamp        TEXT,
    date             TEXT,

    tasks_completed  INTEGER,
    avg_task_xp      NUMERIC,

    -- The task a 'task_completion' row is for. Null on every other reason and
    -- on completions logged before it was recorded. With the timestamp it is
    -- the completion's idempotency key: the unique index below means one
    -- completion of one task can be logged once, however many times the
    -- request that completed it was sent.
    task_id          TEXT
);

CREATE INDEX IF NOT EXISTS xp_events_user_date_idx ON xp_events (user_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_task_completion_idx
    ON xp_events (task_id, timestamp) WHERE task_id IS NOT NULL;

-- The growth chart's series: one row per day with anything recorded. The app
-- fills the gaps so the x-axis is real time rather than a list of active days.
CREATE VIEW IF NOT EXISTS growth_daily AS
SELECT
    user_id,
    COALESCE(date, substr(timestamp, 1, 10))          AS day,
    SUM(amount)                                  AS xp_earned,
    SUM(COALESCE(tasks_completed, 1))            AS tasks_completed
FROM xp_events
GROUP BY user_id, COALESCE(date, substr(timestamp, 1, 10));

-- ---- rows: xp_events ----
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781450610795', 'demo', 10, 'task_completion', '2026-06-14T10:23:30.795412', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781450611584', 'demo', 10, 'task_completion', '2026-06-14T10:23:31.584100', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781450611751', 'demo', 10, 'task_completion', '2026-06-14T10:23:31.751835', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781450611901', 'demo', 10, 'task_completion', '2026-06-14T10:23:31.901438', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781450612083', 'demo', 10, 'task_completion', '2026-06-14T10:23:32.083693', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781450612267', 'demo', 10, 'task_completion', '2026-06-14T10:23:32.267385', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781450616967', 'demo', 10, 'task_completion', '2026-06-14T10:23:36.967972', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781450617117', 'demo', 10, 'task_completion', '2026-06-14T10:23:37.117114', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781450617283', 'demo', 10, 'task_completion', '2026-06-14T10:23:37.283108', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781450928691', 'demo', 10, 'task_completion', '2026-06-14T10:28:48.691640', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781450934575', 'demo', 54, 'task_completion', '2026-06-14T10:28:54.575412', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781450953617', 'demo', 54, 'task_completion', '2026-06-14T10:29:13.617416', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451668661', 'demo', 54, 'task_completion', '2026-06-14T10:41:08.661421', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451669313', 'demo', 54, 'task_completion', '2026-06-14T10:41:09.313103', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451669649', 'demo', 54, 'task_completion', '2026-06-14T10:41:09.649533', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451669882', 'demo', 54, 'task_completion', '2026-06-14T10:41:09.882756', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451670099', 'demo', 54, 'task_completion', '2026-06-14T10:41:10.099380', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451670320', 'demo', 54, 'task_completion', '2026-06-14T10:41:10.320283', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451671157', 'demo', 54, 'task_completion', '2026-06-14T10:41:11.157571', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451900893', 'demo', 10, 'task_completion', '2026-06-14T10:45:00.893862', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451901398', 'demo', 10, 'task_completion', '2026-06-14T10:45:01.398111', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451901546', 'demo', 10, 'task_completion', '2026-06-14T10:45:01.546734', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451901713', 'demo', 10, 'task_completion', '2026-06-14T10:45:01.713383', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451904547', 'demo', 10, 'task_completion', '2026-06-14T10:45:04.547962', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451905047', 'demo', 10, 'task_completion', '2026-06-14T10:45:05.047510', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451905399', 'demo', 10, 'task_completion', '2026-06-14T10:45:05.399407', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451905597', 'demo', 10, 'task_completion', '2026-06-14T10:45:05.597151', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451905763', 'demo', 10, 'task_completion', '2026-06-14T10:45:05.763877', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451905946', 'demo', 10, 'task_completion', '2026-06-14T10:45:05.946159', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451906446', 'demo', 10, 'task_completion', '2026-06-14T10:45:06.446649', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451906981', 'demo', 10, 'task_completion', '2026-06-14T10:45:06.981186', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451907463', 'demo', 10, 'task_completion', '2026-06-14T10:45:07.463106', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451907912', 'demo', 10, 'task_completion', '2026-06-14T10:45:07.912566', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451908214', 'demo', 10, 'task_completion', '2026-06-14T10:45:08.214565', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451908396', 'demo', 10, 'task_completion', '2026-06-14T10:45:08.396457', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451908561', 'demo', 10, 'task_completion', '2026-06-14T10:45:08.561987', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451908729', 'demo', 10, 'task_completion', '2026-06-14T10:45:08.729995', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451908879', 'demo', 10, 'task_completion', '2026-06-14T10:45:08.879575', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451909047', 'demo', 10, 'task_completion', '2026-06-14T10:45:09.047458', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451909363', 'demo', 10, 'task_completion', '2026-06-14T10:45:09.363069', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451909531', 'demo', 10, 'task_completion', '2026-06-14T10:45:09.531623', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451909713', 'demo', 10, 'task_completion', '2026-06-14T10:45:09.713554', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451909880', 'demo', 10, 'task_completion', '2026-06-14T10:45:09.880483', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451910064', 'demo', 10, 'task_completion', '2026-06-14T10:45:10.064921', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451910280', 'demo', 10, 'task_completion', '2026-06-14T10:45:10.280189', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451910480', 'demo', 10, 'task_completion', '2026-06-14T10:45:10.480347', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451910663', 'demo', 10, 'task_completion', '2026-06-14T10:45:10.663359', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451910880', 'demo', 10, 'task_completion', '2026-06-14T10:45:10.880613', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451911063', 'demo', 10, 'task_completion', '2026-06-14T10:45:11.063243', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451911265', 'demo', 10, 'task_completion', '2026-06-14T10:45:11.265945', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451911447', 'demo', 10, 'task_completion', '2026-06-14T10:45:11.447740', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451911731', 'demo', 10, 'task_completion', '2026-06-14T10:45:11.731376', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451911913', 'demo', 10, 'task_completion', '2026-06-14T10:45:11.913865', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451912098', 'demo', 10, 'task_completion', '2026-06-14T10:45:12.098599', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451912263', 'demo', 10, 'task_completion', '2026-06-14T10:45:12.263939', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451912430', 'demo', 10, 'task_completion', '2026-06-14T10:45:12.430792', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451912597', 'demo', 10, 'task_completion', '2026-06-14T10:45:12.597110', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451912780', 'demo', 10, 'task_completion', '2026-06-14T10:45:12.780238', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451995572', 'demo', 10, 'task_completion', '2026-06-14T10:46:35.572983', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451995714', 'demo', 10, 'task_completion', '2026-06-14T10:46:35.714197', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451995862', 'demo', 10, 'task_completion', '2026-06-14T10:46:35.862060', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451996001', 'demo', 10, 'task_completion', '2026-06-14T10:46:36.001551', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451996147', 'demo', 10, 'task_completion', '2026-06-14T10:46:36.147509', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781451996288', 'demo', 10, 'task_completion', '2026-06-14T10:46:36.288897', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781452035181', 'demo', 10, 'task_completion', '2026-06-14T10:47:15.181063', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781452403600', 'demo', 10, 'task_completion', '2026-06-14T10:53:23.600762', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781452404170', 'demo', 10, 'task_completion', '2026-06-14T10:53:24.170046', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781452404589', 'demo', 10, 'task_completion', '2026-06-14T10:53:24.589516', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781453239597', 'demo', 25, 'task_completion', '2026-06-14T11:07:19.597660', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781453243655', 'demo', 10, 'task_completion', '2026-06-14T11:07:23.655669', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781453247755', 'demo', 67, 'task_completion', '2026-06-14T11:07:27.755216', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781453257047', 'demo', 10, 'task_completion', '2026-06-14T11:07:37.047761', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781455461361', 'demo', 53, 'task_completion', '2026-06-14T11:44:21.361755', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781456287211', 'demo', 10, 'task_completion', '2026-06-14T11:58:07.211170', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781456825672', 'demo', 100, 'task_completion', '2026-06-14T12:07:05.672481', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781460973985', 'demo', 10, 'task_completion', '2026-06-14T13:16:13.985007', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781461071021', 'demo', 100, 'task_completion', '2026-06-14T13:17:51.021735', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781461571364', 'demo', 10, 'task_completion', '2026-06-14T13:26:11.364023', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781489663588', 'demo', 87, 'task_completion', '2026-06-14T21:14:23.588117', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781532260136', 'demo', 10, 'task_completion', '2026-06-15T09:04:20.136274', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781533026750', 'demo', 100, 'task_completion', '2026-06-15T09:17:06.750417', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781533044166', 'demo', 91, 'task_completion', '2026-06-15T09:17:24.166657', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781533648362', 'demo', 68, 'task_completion', '2026-06-15T09:27:28.362552', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781533889142', 'demo', 56, 'task_completion', '2026-06-15T09:31:29.142484', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781533918925', 'demo', 56, 'task_completion', '2026-06-15T09:31:58.925312', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781533929838', 'demo', 82, 'task_completion', '2026-06-15T09:32:09.838162', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781535564997', 'demo', 55, 'task_completion', '2026-06-15T09:59:24.997606', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781535902194', 'demo', 10, 'task_completion', '2026-06-15T10:05:02.194250', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781536072405', 'demo', 93, 'task_completion', '2026-06-15T10:07:52.405140', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781536091758', 'demo', 10, 'task_completion', '2026-06-15T10:08:11.758668', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781536766299', 'demo', 57, 'task_completion', '2026-06-15T10:19:26.299705', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781563687864', 'demo', 10, 'task_completion', '2026-06-15T17:48:07.864911', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781563700637', 'demo', 96, 'task_completion', '2026-06-15T17:48:20.637277', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781564240846', 'demo', 10, 'task_completion', '2026-06-15T17:57:20.846634', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781564241295', 'demo', 10, 'task_completion', '2026-06-15T17:57:21.295931', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781564241702', 'demo', 10, 'task_completion', '2026-06-15T17:57:21.702188', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781564389469', 'demo', 10, 'task_completion', '2026-06-15T17:59:49.469882', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781565160138', 'demo', 10, 'task_completion', '2026-06-15T18:12:40.138091', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781626812705', 'demo', 10, 'task_completion', '2026-06-16T11:20:12.705466', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781628783122', 'demo', 10, 'task_completion', '2026-06-16T11:53:03.122530', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781648296977', 'demo', 10, 'task_completion', '2026-06-16T17:18:16.977644', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781648409399', 'demo', 10, 'task_completion', '2026-06-16T17:20:09.399738', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1781704586690', 'demo', 10, 'task_completion', '2026-06-17T08:56:26.690274', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782663349993', 'demo', 10, 'task_completion', '2026-06-28T11:15:49.993689', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782663353523', 'demo', 10, 'task_completion', '2026-06-28T11:15:53.523030', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782663469552', 'demo', 10, 'task_completion', '2026-06-28T11:17:49.552798', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782663913241', 'demo', 10, 'task_completion', '2026-06-28T11:25:13.241851', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782747800352', 'demo', 42, 'task_completion', '2026-06-29T10:43:20.352502', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782748006805', 'demo', 45, 'task_completion', '2026-06-29T10:46:46.805083', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782748014840', 'demo', 45, 'task_completion', '2026-06-29T10:46:54.840967', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782748106145', 'demo', 27, 'task_completion', '2026-06-29T10:48:26.145225', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782748113121', 'demo', 10, 'task_completion', '2026-06-29T10:48:33.121363', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782748202745', 'demo', 23, 'task_completion', '2026-06-29T10:50:02.745267', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782748215195', 'demo', 15, 'task_completion', '2026-06-29T10:50:15.195710', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782841275936', 'demo', 18, 'task_completion', '2026-06-30T12:41:15.936077', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782842155491', 'demo', 20, 'task_completion', '2026-06-30T12:55:55.491786', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782842156892', 'demo', 10, 'task_completion', '2026-06-30T12:55:56.892421', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782842186401', 'demo', 41, 'task_completion', '2026-06-30T12:56:26.401490', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782842232612', 'demo', 25, 'task_completion', '2026-06-30T12:57:12.612548', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782842274705', 'demo', 10, 'task_completion', '2026-06-30T12:57:54.705365', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782862835379', 'demo', 10, 'task_completion', '2026-06-30T18:40:35.379543', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782862842399', 'demo', 41, 'task_completion', '2026-06-30T18:40:42.399394', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782862854992', 'demo', 44, 'task_completion', '2026-06-30T18:40:54.992869', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1782923628303', 'avery', 54, 'task_completion', '2026-07-01T11:33:48.304020', NULL, NULL, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783089165468', 'avery', 41, 'task_completion', '2026-07-03T09:32:45.468880', '2026-07-03', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783113247864', 'demo', 42, 'task_completion', '2026-07-03T16:14:07.864915', '2026-07-03', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783267342980', 'demo', 44, 'task_completion', '2026-07-05T11:02:22.980508', '2026-07-05', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783268072269', 'demo', 37, 'task_completion', '2026-07-05T11:14:32.269310', '2026-07-05', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783271781985', 'demo', 50, 'task_completion', '2026-07-05T12:16:21.985020', '2026-07-05', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783271830409', 'demo', 50, 'task_completion', '2026-07-05T12:17:10.409375', '2026-07-05', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783291693708', 'demo', 73, 'task_completion', '2026-07-05T17:48:13.708483', '2026-07-05', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783349006727', 'demo', 100, 'task_completion', '2026-07-06T09:43:26.727265', '2026-07-06', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783349007686', 'demo', 100, 'task_completion', '2026-07-06T09:43:27.686269', '2026-07-06', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783349008473', 'demo', 97, 'task_completion', '2026-07-06T09:43:28.473561', '2026-07-06', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783349009152', 'demo', 100, 'task_completion', '2026-07-06T09:43:29.152272', '2026-07-06', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783349009986', 'demo', 100, 'task_completion', '2026-07-06T09:43:29.986957', '2026-07-06', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783349010765', 'demo', 99, 'task_completion', '2026-07-06T09:43:30.765925', '2026-07-06', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783349011500', 'demo', 100, 'task_completion', '2026-07-06T09:43:31.500172', '2026-07-06', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783349012611', 'demo', 100, 'task_completion', '2026-07-06T09:43:32.611320', '2026-07-06', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783440848532', 'demo', 5, 'task_completion', '2026-07-07T11:14:08.532793', '2026-07-07', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783440849124', 'demo', 5, 'task_completion', '2026-07-07T11:14:09.124818', '2026-07-07', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783441033572', 'demo', 52, 'task_completion', '2026-07-07T11:17:13.572540', '2026-07-07', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783458245343', 'demo', 100, 'task_completion', '2026-07-07T16:04:05.343509', '2026-07-07', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783458246087', 'demo', 100, 'task_completion', '2026-07-07T16:04:06.087574', '2026-07-07', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783458246710', 'demo', 100, 'task_completion', '2026-07-07T16:04:06.710826', '2026-07-07', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783521613543', 'demo', 37, 'task_completion', '2026-07-08T09:40:13.543714', '2026-07-08', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783521899210', 'demo', 49, 'task_completion', '2026-07-08T09:44:59.210113', '2026-07-08', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783543646631', 'demo', 22, 'task_completion', '2026-07-08T15:47:26.631373', '2026-07-08', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783624338367', 'demo', 37, 'task_completion', '2026-07-09T14:12:18.367061', '2026-07-09', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783695366920', 'demo', 99, 'task_completion', '2026-07-10T09:56:06.920424', '2026-07-10', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783695367845', 'demo', 100, 'task_completion', '2026-07-10T09:56:07.845785', '2026-07-10', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783713172862', 'demo', 37, 'task_completion', '2026-07-10T14:52:52.862197', '2026-07-10', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783907042002', 'demo', 73, 'task_completion', '2026-07-12T20:44:02.002112', '2026-07-12', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783907052107', 'demo', 74, 'task_completion', '2026-07-12T20:44:12.107225', '2026-07-12', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783907068559', 'demo', 10, 'task_completion', '2026-07-12T20:44:28.559017', '2026-07-12', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783955356267', 'demo', 100, 'task_completion', '2026-07-13T10:09:16.267185', '2026-07-13', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1783981604305', 'demo', 10, 'task_completion', '2026-07-13T17:26:44.305914', '2026-07-13', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784039932112', 'demo', 100, 'task_completion', '2026-07-14T09:38:52.112273', '2026-07-14', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784039933206', 'demo', 62, 'task_completion', '2026-07-14T09:38:53.206917', '2026-07-14', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784043591026', 'demo', 84, 'task_completion', '2026-07-14T10:39:51.026843', '2026-07-14', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784310584846', 'avery', 10, 'task_completion', '2026-07-17T12:49:44.846772', '2026-07-17', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784476597617', 'avery', 10, 'task_completion', '2026-07-19T10:56:37.617491', '2026-07-19', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784476598352', 'avery', 200, 'task_completion', '2026-07-19T10:56:38.352509', '2026-07-19', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784476598987', 'avery', 10, 'task_completion', '2026-07-19T10:56:38.987540', '2026-07-19', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643697742', 'avery', 88, 'task_completion', '2026-07-21T09:21:37.742640', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643698517', 'avery', 68, 'task_completion', '2026-07-21T09:21:38.517700', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643699202', 'avery', 68, 'task_completion', '2026-07-21T09:21:39.202807', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643700020', 'avery', 68, 'task_completion', '2026-07-21T09:21:40.020763', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643700712', 'avery', 68, 'task_completion', '2026-07-21T09:21:40.712375', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643701465', 'avery', 68, 'task_completion', '2026-07-21T09:21:41.465914', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643702204', 'avery', 68, 'task_completion', '2026-07-21T09:21:42.204089', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643702909', 'avery', 68, 'task_completion', '2026-07-21T09:21:42.909491', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643724595', 'avery', 68, 'task_completion', '2026-07-21T09:22:04.595316', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643725303', 'avery', 68, 'task_completion', '2026-07-21T09:22:05.303241', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643726151', 'avery', 68, 'task_completion', '2026-07-21T09:22:06.151983', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643726983', 'avery', 68, 'task_completion', '2026-07-21T09:22:06.983030', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643727713', 'avery', 68, 'task_completion', '2026-07-21T09:22:07.713122', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643728509', 'avery', 68, 'task_completion', '2026-07-21T09:22:08.509371', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643729248', 'avery', 68, 'task_completion', '2026-07-21T09:22:09.248514', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643730102', 'avery', 68, 'task_completion', '2026-07-21T09:22:10.102350', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643731160', 'avery', 68, 'task_completion', '2026-07-21T09:22:11.160132', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643732073', 'avery', 68, 'task_completion', '2026-07-21T09:22:12.073775', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643732836', 'avery', 68, 'task_completion', '2026-07-21T09:22:12.836694', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643734127', 'avery', 68, 'task_completion', '2026-07-21T09:22:14.127123', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643734919', 'avery', 68, 'task_completion', '2026-07-21T09:22:14.919281', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643735667', 'avery', 68, 'task_completion', '2026-07-21T09:22:15.667246', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643736423', 'avery', 68, 'task_completion', '2026-07-21T09:22:16.423870', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643737125', 'avery', 68, 'task_completion', '2026-07-21T09:22:17.125118', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643737845', 'avery', 68, 'task_completion', '2026-07-21T09:22:17.845204', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643738608', 'avery', 68, 'task_completion', '2026-07-21T09:22:18.608064', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643739272', 'avery', 68, 'task_completion', '2026-07-21T09:22:19.272617', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643740137', 'avery', 68, 'task_completion', '2026-07-21T09:22:20.137546', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643740889', 'avery', 68, 'task_completion', '2026-07-21T09:22:20.889091', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643741611', 'avery', 68, 'task_completion', '2026-07-21T09:22:21.611932', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643742329', 'avery', 68, 'task_completion', '2026-07-21T09:22:22.329709', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643742991', 'avery', 68, 'task_completion', '2026-07-21T09:22:22.991203', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643743673', 'avery', 68, 'task_completion', '2026-07-21T09:22:23.673646', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643744361', 'avery', 68, 'task_completion', '2026-07-21T09:22:24.361294', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643745083', 'avery', 68, 'task_completion', '2026-07-21T09:22:25.083907', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643745781', 'avery', 68, 'task_completion', '2026-07-21T09:22:25.781463', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643746532', 'avery', 68, 'task_completion', '2026-07-21T09:22:26.532083', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643747303', 'avery', 68, 'task_completion', '2026-07-21T09:22:27.303828', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643748050', 'avery', 68, 'task_completion', '2026-07-21T09:22:28.050241', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643748675', 'avery', 68, 'task_completion', '2026-07-21T09:22:28.675911', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643749337', 'avery', 68, 'task_completion', '2026-07-21T09:22:29.337864', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643750081', 'avery', 68, 'task_completion', '2026-07-21T09:22:30.081346', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643750798', 'avery', 68, 'task_completion', '2026-07-21T09:22:30.798266', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643751547', 'avery', 68, 'task_completion', '2026-07-21T09:22:31.547033', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643752273', 'avery', 68, 'task_completion', '2026-07-21T09:22:32.273938', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643753020', 'avery', 68, 'task_completion', '2026-07-21T09:22:33.020891', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643753747', 'avery', 68, 'task_completion', '2026-07-21T09:22:33.747589', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643754516', 'avery', 68, 'task_completion', '2026-07-21T09:22:34.516702', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643755184', 'avery', 68, 'task_completion', '2026-07-21T09:22:35.184590', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643755962', 'avery', 68, 'task_completion', '2026-07-21T09:22:35.962625', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643756736', 'avery', 68, 'task_completion', '2026-07-21T09:22:36.736448', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643757488', 'avery', 68, 'task_completion', '2026-07-21T09:22:37.488099', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643758251', 'avery', 68, 'task_completion', '2026-07-21T09:22:38.251494', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643759024', 'avery', 68, 'task_completion', '2026-07-21T09:22:39.024799', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643759795', 'avery', 68, 'task_completion', '2026-07-21T09:22:39.795504', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643760577', 'avery', 68, 'task_completion', '2026-07-21T09:22:40.577995', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784643761381', 'avery', 68, 'task_completion', '2026-07-21T09:22:41.381090', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784672538875', 'demo', 67, 'task_completion', '2026-07-21T17:22:18.875216', '2026-07-21', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784750848986', 'avery', 47, 'task_completion', '2026-07-22T15:07:28.986266', '2026-07-22', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784755832398', 'avery', 35, 'task_completion', '2026-07-22T16:30:32.398450', '2026-07-22', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784755833718', 'avery', 10, 'task_completion', '2026-07-22T16:30:33.718831', '2026-07-22', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784755835185', 'avery', 10, 'task_completion', '2026-07-22T16:30:35.185673', '2026-07-22', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784756214603', 'avery', 100, 'task_completion', '2026-07-22T16:36:54.603374', '2026-07-22', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784756216079', 'avery', 100, 'task_completion', '2026-07-22T16:36:56.079413', '2026-07-22', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1784819494678', 'avery', 98, 'task_completion', '2026-07-23T10:11:34.678230', '2026-07-23', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1785078053267', 'jordan', 10, 'task_completion', '2026-07-26T10:00:53.267339', '2026-07-26', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1785078054353', 'jordan', 10, 'task_completion', '2026-07-26T10:00:54.353784', '2026-07-26', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1785109746661', 'morgan', 75, 'task_completion', '2026-07-26T18:49:06.661921', '2026-07-26', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1785109747861', 'morgan', 43, 'task_completion', '2026-07-26T18:49:07.861954', '2026-07-26', 1, NULL);
INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, avg_task_xp) VALUES ('1785109750413', 'morgan', 62, 'task_completion', '2026-07-26T18:49:10.413314', '2026-07-26', 1, NULL);
