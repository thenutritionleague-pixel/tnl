-- The same team-task double count as migration 045, in the second code path.
--
-- 045 fixed team_points_view, which drives the leaderboard ROW. It did not fix
-- get_team_weekly_pts, which drives the per-challenge "Week 1" breakdown you get
-- when you expand a team on the mobile leaderboard. Both build a team total by
-- adding approved task_submissions to team_transactions, and both were missing
-- the same filter, so the expanded panel showed 16,040 against a row of 15,040
-- for The Broccoli Biceps.
--
-- Same rule as 045: a team task is credited to the team through
-- team_transactions and ONLY through team_transactions. The member-submission
-- path must ignore it.
--
-- Checked at the same time: these two are the only objects in the database that
-- read task_submissions and team_transactions together, so this completes it.

CREATE OR REPLACE FUNCTION public.get_team_weekly_pts(p_team_id uuid, p_org_id uuid, p_challenge_id uuid)
 RETURNS TABLE(week_number integer, total_points bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH challenge AS (
    SELECT start_date FROM challenges WHERE id = p_challenge_id
  ),
  member_ids AS (
    SELECT user_id FROM team_members WHERE team_id = p_team_id AND org_id = p_org_id
  ),
  task_pts AS (
    SELECT
      GREATEST(1, FLOOR(
        (ts.submitted_date::date - (SELECT start_date FROM challenge)) / 7.0
      )::int + 1) AS wk,
      COALESCE(ts.points_awarded, 0) AS pts
    FROM task_submissions ts
    WHERE ts.user_id IN (SELECT user_id FROM member_ids)
      AND ts.status = 'approved'
      AND ts.submitted_date IS NOT NULL
      AND ts.submitted_date::date >= (SELECT start_date FROM challenge)
      -- The one line this migration exists for. Team tasks arrive below via
      -- team_txn_pts; counting the submitter's row here as well double-pays.
      AND COALESCE(ts.is_team_task, false) = false
  ),
  team_txn_pts AS (
    SELECT
      GREATEST(1, FLOOR(
        (COALESCE(tt.transaction_date, tt.created_at::date) - (SELECT start_date FROM challenge)) / 7.0
      )::int + 1) AS wk,
      tt.amount AS pts
    FROM team_transactions tt
    WHERE tt.team_id = p_team_id AND tt.org_id = p_org_id
  ),
  manual_pts AS (
    SELECT
      GREATEST(1, FLOOR(
        (COALESCE(pt.transaction_date, pt.created_at::date) - (SELECT start_date FROM challenge)) / 7.0
      )::int + 1) AS wk,
      pt.amount AS pts
    FROM points_transactions pt
    WHERE pt.user_id IN (SELECT user_id FROM member_ids)
      AND pt.is_manual = true
      AND pt.created_at >= (SELECT start_date::timestamptz FROM challenge)
  ),
  all_pts AS (
    SELECT wk, pts FROM task_pts
    UNION ALL
    SELECT wk, pts FROM team_txn_pts
    UNION ALL
    SELECT wk, pts FROM manual_pts
  )
  SELECT wk::integer AS week_number, SUM(pts)::bigint AS total_points
  FROM all_pts
  GROUP BY wk
  ORDER BY wk;
$function$;

GRANT EXECUTE ON FUNCTION public.get_team_weekly_pts(uuid, uuid, uuid) TO authenticated, service_role;

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- Drop the "AND COALESCE(ts.is_team_task, false) = false" line and re-run.
