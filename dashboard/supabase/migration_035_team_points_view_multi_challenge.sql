-- Two bugs in team_points_view exposed by running >1 active challenge in an org:
--
--   1. team_challenge CTE joined team_members × challenges only on org_id, so
--      EVERY team in the org appeared under EVERY challenge — even challenges
--      restricted to specific teams via challenge_teams.
--
--   2. manual_pts (points_transactions where is_manual) and team_legacy_pts
--      (team_transactions) summed across ALL TIME, then LEFT-JOINed to the
--      team_challenge cross-product on team_id only. So a team's lifetime
--      bonuses + manual adjustments were credited to every active challenge.
--
-- Both fixed:
--   - team_challenge respects challenge_teams (same "no rows = open to all,
--     rows = only those teams" pattern as get_mobile_tasks).
--   - manual_pts and team_legacy_pts are date-scoped to the challenge's
--     [start_date, end_date] window using transaction_date (fallback created_at).
--
-- Limitation: for OVERLAPPING active challenges, manual/legacy transactions
-- dated within the overlap will still be credited to both. A future migration
-- can add an explicit challenge_id column on points_transactions and
-- team_transactions for unambiguous attribution. Sufficient for now since the
-- only realistic overlap is during a brief transition between sequential
-- challenges.

CREATE OR REPLACE VIEW team_points_view AS
WITH team_challenge AS (
  SELECT DISTINCT
    tm.team_id,
    tm.org_id,
    c.id AS challenge_id,
    c.start_date,
    c.end_date
  FROM team_members tm
  JOIN challenges c ON c.org_id = tm.org_id
  WHERE (
    NOT EXISTS (SELECT 1 FROM challenge_teams ct WHERE ct.challenge_id = c.id)
    OR EXISTS  (SELECT 1 FROM challenge_teams ct
                WHERE ct.challenge_id = c.id AND ct.team_id = tm.team_id)
  )
),
task_pts AS (
  SELECT
    tm.team_id,
    s.challenge_id,
    COALESCE(SUM(COALESCE(s.points_awarded, t.points, 0)), 0)::bigint AS pts
  FROM task_submissions s
  JOIN team_members tm ON tm.user_id = s.user_id AND tm.org_id = s.org_id
  JOIN tasks t        ON t.id = s.task_id
  WHERE s.status = 'approved'
  GROUP BY tm.team_id, s.challenge_id
),
manual_pts AS (
  SELECT
    tm.team_id,
    tc.challenge_id,
    COALESCE(SUM(pt.amount), 0)::bigint AS pts
  FROM team_members tm
  JOIN points_transactions pt ON pt.user_id = tm.user_id AND pt.org_id = tm.org_id
  JOIN team_challenge tc      ON tc.team_id = tm.team_id AND tc.org_id = tm.org_id
  WHERE pt.is_manual = true
    AND COALESCE(pt.transaction_date, pt.created_at::date)
        BETWEEN tc.start_date AND COALESCE(tc.end_date, '2100-01-01'::date)
  GROUP BY tm.team_id, tc.challenge_id
),
team_legacy_pts AS (
  SELECT
    tt.team_id,
    tc.challenge_id,
    COALESCE(SUM(tt.amount), 0)::bigint AS pts
  FROM team_transactions tt
  JOIN team_challenge tc ON tc.team_id = tt.team_id AND tc.org_id = tt.org_id
  WHERE COALESCE(tt.transaction_date, tt.created_at::date)
        BETWEEN tc.start_date AND COALESCE(tc.end_date, '2100-01-01'::date)
  GROUP BY tt.team_id, tc.challenge_id
)
SELECT
  tc.team_id,
  tc.challenge_id,
  (COALESCE(tp.pts, 0) + COALESCE(mp.pts, 0) + COALESCE(lp.pts, 0))::integer AS total_points
FROM team_challenge tc
LEFT JOIN task_pts        tp ON tp.team_id = tc.team_id AND tp.challenge_id = tc.challenge_id
LEFT JOIN manual_pts      mp ON mp.team_id = tc.team_id AND mp.challenge_id = tc.challenge_id
LEFT JOIN team_legacy_pts lp ON lp.team_id = tc.team_id AND lp.challenge_id = tc.challenge_id;

ALTER VIEW public.team_points_view SET (security_invoker = on);
