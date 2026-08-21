-- Team-task points were counted twice.
--
-- migration_035_team_tasks.sql changed handle_submission_approved() so an
-- approved TEAM task credits team_transactions instead of the submitter's
-- profile. What it never did was tell team_points_view to stop counting that
-- same submission as ordinary member task points.
--
-- The view's task_pts CTE sums every approved row in task_submissions with no
-- is_team_task filter, so the 1000-point "🥦🔥 YiNL Squad Drop on Social"
-- landed on the board twice: once through the submitter's row, once through the
-- team_transactions row the trigger wrote. Every team that completed it showed
-- 2000, not 1000.
--
-- Measured on 21 Aug 2026: 15 teams affected, each inflated by exactly 1000.
-- It distorted the standings badly — Gangs of WHEYpur sat at rank 8 instead of
-- 25, Yellow Fellows at 11 instead of 27.
--
-- The fix is one predicate. Team tasks are credited through team_transactions
-- and ONLY through team_transactions; the member path must ignore them.

CREATE OR REPLACE VIEW team_points_view AS
 WITH team_challenge AS (
         SELECT DISTINCT tm.team_id, tm.org_id, c.id AS challenge_id, c.start_date, c.end_date
           FROM team_members tm
             JOIN challenges c ON c.org_id = tm.org_id
          WHERE NOT (EXISTS ( SELECT 1 FROM challenge_teams ct WHERE ct.challenge_id = c.id))
             OR (EXISTS ( SELECT 1 FROM challenge_teams ct WHERE ct.challenge_id = c.id AND ct.team_id = tm.team_id))
        ), task_pts AS (
         SELECT tm.team_id, s.challenge_id,
            COALESCE(sum(COALESCE(s.points_awarded, t.points, 0)), 0::bigint) AS pts
           FROM task_submissions s
             JOIN team_members tm ON tm.user_id = s.user_id AND tm.org_id = s.org_id
             JOIN tasks t ON t.id = s.task_id
          WHERE s.status = 'approved'::text
            -- The one line this migration exists for. A team task is credited
            -- to the team in team_transactions by handle_submission_approved();
            -- counting the submitter's row here as well double-pays it.
            AND COALESCE(s.is_team_task, false) = false
          GROUP BY tm.team_id, s.challenge_id
        ), manual_pts AS (
         SELECT tm.team_id, tc_1.challenge_id,
            COALESCE(sum(pt.amount), 0::bigint) AS pts
           FROM team_members tm
             JOIN points_transactions pt ON pt.user_id = tm.user_id AND pt.org_id = tm.org_id
             JOIN team_challenge tc_1 ON tc_1.team_id = tm.team_id AND tc_1.org_id = tm.org_id
          WHERE pt.is_manual = true
            AND COALESCE(pt.transaction_date, pt.created_at::date) >= tc_1.start_date
            AND COALESCE(pt.transaction_date, pt.created_at::date) <= COALESCE(tc_1.end_date, '2100-01-01'::date)
          GROUP BY tm.team_id, tc_1.challenge_id
        ), team_legacy_pts AS (
         SELECT tt.team_id, tc_1.challenge_id,
            COALESCE(sum(tt.amount), 0::bigint) AS pts
           FROM team_transactions tt
             JOIN team_challenge tc_1 ON tc_1.team_id = tt.team_id AND tc_1.org_id = tt.org_id
          WHERE COALESCE(tt.transaction_date, tt.created_at::date) >= tc_1.start_date
            AND COALESCE(tt.transaction_date, tt.created_at::date) <= COALESCE(tc_1.end_date, '2100-01-01'::date)
          GROUP BY tt.team_id, tc_1.challenge_id
        )
 SELECT tc.team_id, tc.challenge_id,
    (COALESCE(tp.pts, 0::bigint) + COALESCE(mp.pts, 0::bigint) + COALESCE(lp.pts, 0::bigint))::integer AS total_points
   FROM team_challenge tc
     LEFT JOIN task_pts tp ON tp.team_id = tc.team_id AND tp.challenge_id = tc.challenge_id
     LEFT JOIN manual_pts mp ON mp.team_id = tc.team_id AND mp.challenge_id = tc.challenge_id
     LEFT JOIN team_legacy_pts lp ON lp.team_id = tc.team_id AND lp.challenge_id = tc.challenge_id;

-- The leaderboard reads the materialized view, so the correction is invisible
-- until this runs.
REFRESH MATERIALIZED VIEW CONCURRENTLY team_points_mv;

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- Drop the "AND COALESCE(s.is_team_task, false) = false" line, re-run the
-- CREATE OR REPLACE, then REFRESH MATERIALIZED VIEW CONCURRENTLY team_points_mv.
