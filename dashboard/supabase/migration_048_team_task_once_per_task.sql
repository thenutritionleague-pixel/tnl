-- A team task is done ONCE by the squad, not once per day.
--
-- migration_035 enforced one team submission per team per DAY, mirroring the
-- per-member daily rule. That is right for a task that repeats daily, and wrong
-- for the shape the client actually wants: a single task that stays open across
-- several days and each squad completes once.
--
-- "🥦🔥 YiNL Squad Drop on Social" runs 21-22 Aug and is worth 1,000 points. Under
-- the per-day rule the 26 teams that posted on the 21st could post again on the
-- 22nd and bank a second 1,000, while a team doing it once got 1,000 -- on a
-- leaderboard where the top teams sit within a few hundred points of each other.
--
-- The date drops out of the key: one non-rejected submission per (task, team)
-- for the life of the task, however many days it spans. Rejected rows are still
-- excluded so a rejected attempt frees the slot for a teammate to retry, exactly
-- as before.
--
-- Checked before applying: 79 team-task rows across 79 distinct teams -- one
-- each -- so the index builds with no conflicts.
--
-- NOTE: this makes ALL team tasks once-per-task. There is only one today. If a
-- genuinely daily team task is ever wanted, this needs a per-task flag rather
-- than a global index.

CREATE UNIQUE INDEX IF NOT EXISTS task_submissions_one_per_team_per_task
  ON task_submissions (task_id, team_id)
  WHERE status <> 'rejected' AND is_team_task AND team_id IS NOT NULL;

DROP INDEX IF EXISTS task_submissions_one_per_team_per_day;

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- CREATE UNIQUE INDEX task_submissions_one_per_team_per_day
--   ON task_submissions (task_id, team_id, submitted_date)
--   WHERE status <> 'rejected' AND is_team_task AND team_id IS NOT NULL;
-- DROP INDEX task_submissions_one_per_team_per_task;
