-- 055: a member cannot have "missed" a task from before they could take part.
--
-- Reported by the Pulse Crew (Yi Lucknow) captain: a member swapped in on 21 Aug
-- showed 20 Aug as Missed. The audit joined org_members with no comparison to
-- when the member actually arrived, so a backfill marked every member absent for
-- every date in the challenge -- including days before their profile existed.
--
-- 126 members carried a false Missed for the 16 Aug day-one task. All are
-- amount = 0 markers, so removing them moves no points.
--
-- The guard uses GREATEST(profile created, EARLIEST team join in this org):
-- earliest, not current, so a mid-event team change never erases a genuine miss.

CREATE OR REPLACE FUNCTION public.write_missed_transactions_for_org(p_org_id uuid, p_target_date date)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_inserted int := 0;
BEGIN
  INSERT INTO points_transactions (user_id, org_id, amount, reason, is_manual)
  SELECT DISTINCT
    om.user_id, c.org_id, 0,
    'Task missed: ' || t.title || ' (' || p_target_date::text || ')',
    false
  FROM challenges c
  JOIN tasks t ON t.challenge_id = c.id AND t.is_active = true
  JOIN org_members om ON om.org_id = c.org_id
  WHERE
    c.org_id = p_org_id
    AND c.status = 'active'
    AND c.manually_closed = false
    AND p_target_date >= c.start_date
    AND (c.end_date IS NULL OR p_target_date <= c.end_date)
    AND p_target_date >= COALESCE(t.start_date, t.created_at::date)
    AND (t.end_date IS NULL OR p_target_date <= t.end_date)

    -- A team task is completed once by the squad; nine of ten members correctly
    -- have no submission of their own and have missed nothing.
    AND COALESCE(t.submission_scope, 'individual') <> 'team'

    -- Only once the member is out of chances: the last day of a dated task, or
    -- any day for an open-ended one.
    AND (t.end_date IS NULL OR p_target_date >= t.end_date)

    -- Nothing can be missed from before the member could take part: no profile
    -- yet, or no team yet, so the app never showed them the task. EARLIEST join
    -- in this org, so moving teams mid-event does not wipe a real miss.
    AND p_target_date >= (
      SELECT GREATEST(
        pr.created_at::date,
        (SELECT MIN(tm4.joined_at)::date
           FROM team_members tm4
           JOIN teams tt4 ON tt4.id = tm4.team_id
          WHERE tm4.user_id = om.user_id AND tt4.org_id = c.org_id)
      )
      FROM profiles pr WHERE pr.id = om.user_id
    )

    AND EXISTS (
      SELECT 1 FROM team_members tm_user
      JOIN teams t_user ON t_user.id = tm_user.team_id
      WHERE tm_user.user_id = om.user_id AND t_user.org_id = c.org_id
    )
    AND (
      NOT EXISTS (SELECT 1 FROM challenge_teams ct WHERE ct.challenge_id = c.id)
      OR EXISTS (SELECT 1 FROM team_members tm2
                 JOIN challenge_teams ct2 ON ct2.team_id = tm2.team_id
                 WHERE tm2.user_id = om.user_id AND ct2.challenge_id = c.id)
    )
    AND (
      NOT EXISTS (SELECT 1 FROM task_teams tt WHERE tt.task_id = t.id)
      OR EXISTS (SELECT 1 FROM task_teams tt3
                 JOIN team_members tm3 ON tm3.team_id = tt3.team_id
                 WHERE tm3.user_id = om.user_id AND tt3.task_id = t.id)
    )

    -- Nothing submitted ANYWHERE in the task's window, not merely on this date.
    -- A member who did a five-day task on day 2 has not missed it on day 5.
    -- For an open-ended task the window is the single day, so the date matters.
    AND NOT EXISTS (
      SELECT 1 FROM task_submissions ts
      WHERE ts.task_id = t.id AND ts.user_id = om.user_id
        AND (t.end_date IS NOT NULL OR ts.submitted_date = p_target_date)
    )
    AND NOT EXISTS (
      SELECT 1 FROM points_transactions pt
      WHERE pt.user_id = om.user_id AND pt.org_id = c.org_id
        AND pt.amount = 0
        AND pt.reason = 'Task missed: ' || t.title || ' (' || p_target_date::text || ')'
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$function$;
