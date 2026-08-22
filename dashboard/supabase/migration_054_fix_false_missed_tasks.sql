-- "Missed" was being shown for tasks nobody had missed.
--
-- write_missed_transactions_for_org() ran once per DAY and marked every task
-- active that day as missed for anyone without a submission dated that day.
-- Correct for a task that repeats daily; wrong in two ways:
--
-- 1. MULTI-DAY TASKS. Broccoli Burpee Bash runs 20-24 Aug. A member who had not
--    done it by the 20th saw "Missed" against the 20th with four days still to
--    go. A member raised exactly this on 22 Aug -- he had not submitted, but he
--    was not out of time either, and the app told him he had failed.
--
-- 2. TEAM TASKS. A team task is completed once by the squad, so nine of ten
--    members legitimately have no submission of their own. The Squad Drop was
--    marked missed for 1,050 members who were never meant to submit it.
--
-- Measured: 5,805 false rows against 322 genuine ones. Points were never
-- affected (amount 0) but each row renders as a red "Missed" line in the
-- member's leaderboard breakdown, so more than half the roster was being told
-- they had failed tasks they had not.
--
-- New rule -- a task is missed only once the member is out of chances:
--   * team task             -> never marked missed for an individual
--   * task with an end_date -> only on its LAST day, and only if nothing was
--                              submitted anywhere in its window
--   * task without end_date -> unchanged daily behaviour
--
-- The 5,805 false rows were deleted after classifying every row against the new
-- rule and confirming zero members' totals moved. The 322 kept are all "Jump In
-- Before We Jump In", a genuine single-day task on 16 Aug that has closed.

CREATE OR REPLACE FUNCTION public.write_missed_transactions_for_org(p_org_id uuid, p_target_date date)
RETURNS integer LANGUAGE plpgsql AS $function$
DECLARE v_inserted int := 0;
BEGIN
  INSERT INTO points_transactions (user_id, org_id, amount, reason, is_manual)
  SELECT DISTINCT om.user_id, c.org_id, 0,
    'Task missed: ' || t.title || ' (' || p_target_date::text || ')', false
  FROM challenges c
  JOIN tasks t ON t.challenge_id = c.id AND t.is_active = true
  JOIN org_members om ON om.org_id = c.org_id
  WHERE c.org_id = p_org_id AND c.status = 'active' AND c.manually_closed = false
    AND p_target_date >= c.start_date
    AND (c.end_date IS NULL OR p_target_date <= c.end_date)
    AND p_target_date >= COALESCE(t.start_date, t.created_at::date)
    AND (t.end_date IS NULL OR p_target_date <= t.end_date)
    -- a squad completes a team task once; the other nine have missed nothing
    AND COALESCE(t.submission_scope, 'individual') <> 'team'
    -- only once out of chances: the last day of a dated task, any day otherwise
    AND (t.end_date IS NULL OR p_target_date >= t.end_date)
    AND EXISTS (SELECT 1 FROM team_members tm_user
                JOIN teams t_user ON t_user.id = tm_user.team_id
                WHERE tm_user.user_id = om.user_id AND t_user.org_id = c.org_id)
    AND (NOT EXISTS (SELECT 1 FROM challenge_teams ct WHERE ct.challenge_id = c.id)
         OR EXISTS (SELECT 1 FROM team_members tm2
                    JOIN challenge_teams ct2 ON ct2.team_id = tm2.team_id
                    WHERE tm2.user_id = om.user_id AND ct2.challenge_id = c.id))
    AND (NOT EXISTS (SELECT 1 FROM task_teams tt WHERE tt.task_id = t.id)
         OR EXISTS (SELECT 1 FROM task_teams tt3
                    JOIN team_members tm3 ON tm3.team_id = tt3.team_id
                    WHERE tm3.user_id = om.user_id AND tt3.task_id = t.id))
    -- nothing submitted anywhere in the window, not merely on this date:
    -- doing a five-day task on day 2 is not missing it on day 5
    AND NOT EXISTS (SELECT 1 FROM task_submissions ts
                    WHERE ts.task_id = t.id AND ts.user_id = om.user_id
                      AND (t.end_date IS NOT NULL OR ts.submitted_date = p_target_date))
    AND NOT EXISTS (SELECT 1 FROM points_transactions pt
                    WHERE pt.user_id = om.user_id AND pt.org_id = c.org_id AND pt.amount = 0
                      AND pt.reason = 'Task missed: ' || t.title || ' (' || p_target_date::text || ')');
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END; $function$;
