-- 074: consistency % must divide by days that actually had a task, not calendar days.
--
-- The National challenge runs 16-24 Aug = 9 calendar days, but 17 Aug had no task
-- at all. A member who submitted on every single day a task existed reached 8/9 =
-- 88.9%, and 100% was arithmetically impossible for anyone.
--
-- `totalDays` is not only the consistency denominator. The report UI prints
-- "active {activeDays}/{totalDays} days" in four places, and
-- challenge-report-insights.ts calls a member perfect with
-- `activeDays === totalDays` -- a test nobody could pass either. So the exported
-- value changes too, and every denominator downstream is corrected by this one
-- change. No dashboard redeploy needed.
--
-- totalWeeks stays on the CALENDAR span: a rest day does not shorten the week.
CREATE OR REPLACE FUNCTION public.get_challenge_report_stats(challenge_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_challenge RECORD;
  v_total_weeks INT;
  v_total_days INT;
  v_task_days INT;
  v_result JSONB;
BEGIN
  SELECT c.id, c.org_id, c.name, c.start_date, c.end_date, c.status, o.timezone
  INTO v_challenge
  FROM challenges c
  JOIN organizations o ON o.id = c.org_id
  WHERE c.id = challenge_id_param;

  IF v_challenge.id IS NULL THEN
    RAISE EXCEPTION 'challenge not found: %', challenge_id_param;
  END IF;

  v_total_days := (COALESCE(v_challenge.end_date, current_date) - v_challenge.start_date) + 1;
  v_total_weeks := GREATEST(1, CEIL(v_total_days / 7.0)::int);

  -- Days inside the challenge window on which at least one active task was open.
  -- Falls back to the calendar span if a challenge somehow has no tasks, so the
  -- denominator can never become 0 and blank the whole report.
  SELECT COUNT(*) INTO v_task_days
  FROM generate_series(
         v_challenge.start_date,
         COALESCE(v_challenge.end_date, current_date),
         interval '1 day') AS g(d)
  WHERE EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.challenge_id = v_challenge.id
      AND t.is_active
      AND g.d::date BETWEEN t.start_date AND t.end_date
  );
  v_task_days := COALESCE(NULLIF(v_task_days, 0), v_total_days);

  WITH submissions_in_window AS (
    SELECT ts.*
    FROM task_submissions ts
    WHERE ts.org_id = v_challenge.org_id
      AND ts.challenge_id = v_challenge.id
      AND ts.submitted_date BETWEEN v_challenge.start_date AND COALESCE(v_challenge.end_date, current_date)
  ),
  per_member AS (
    SELECT
      p.id AS user_id,
      split_part(p.name, ' ', 1) AS first_name,
      p.name AS full_name,
      tm.team_id,
      t.name AS team_name,
      COALESCE(tm.role, 'member') AS role,
      COUNT(s.id) FILTER (WHERE s.status = 'approved') AS approved_count,
      COUNT(s.id) FILTER (WHERE s.status = 'rejected') AS rejected_count,
      COUNT(DISTINCT s.submitted_date) FILTER (WHERE s.status = 'approved') AS active_days,
      COALESCE(SUM(s.points_awarded) FILTER (
        WHERE s.status = 'approved' AND COALESCE(s.is_team_task, false) = false), 0) AS total_points,
      MIN(s.submitted_at) AS first_submission,
      MAX(s.submitted_at) AS last_submission
    FROM team_members tm
    JOIN profiles p ON p.id = tm.user_id
    JOIN teams t ON t.id = tm.team_id
    LEFT JOIN submissions_in_window s ON s.user_id = p.id
    WHERE tm.org_id = v_challenge.org_id
    GROUP BY p.id, first_name, p.name, tm.team_id, t.name, tm.role
  ),
  per_team AS (
    SELECT
      pm.team_id,
      pm.team_name,
      COUNT(*) AS member_count,
      COALESCE(v.total_points, SUM(pm.total_points))::bigint AS team_points,
      (COALESCE(v.total_points, SUM(pm.total_points)) - SUM(pm.total_points))::bigint AS team_bonus_points,
      ROUND(AVG(pm.total_points)::numeric, 0) AS avg_points_per_member,
      SUM(pm.approved_count) AS approved_total,
      SUM(pm.rejected_count) AS rejected_total,
      ROUND((AVG(pm.active_days)::numeric / NULLIF(v_task_days, 0)) * 100, 1) AS consistency_pct,
      jsonb_agg(
        jsonb_build_object(
          'userId', pm.user_id,
          'firstName', pm.first_name,
          'fullName', pm.full_name,
          'role', pm.role,
          'points', pm.total_points,
          'approved', pm.approved_count,
          'rejected', pm.rejected_count,
          'activeDays', pm.active_days,
          'firstSubmission', pm.first_submission,
          'lastSubmission', pm.last_submission
        ) ORDER BY pm.total_points DESC
      ) AS members
    FROM per_member pm
    LEFT JOIN team_points_view v
      ON v.team_id = pm.team_id AND v.challenge_id = v_challenge.id
    GROUP BY pm.team_id, pm.team_name, v.total_points
  ),
  weekly_team AS (
    SELECT
      tm.team_id,
      LEAST(v_total_weeks, GREATEST(1, CEIL((s.submitted_date - v_challenge.start_date + 1) / 7.0)::int)) AS week_num,
      COALESCE(SUM(s.points_awarded) FILTER (
        WHERE s.status = 'approved' AND COALESCE(s.is_team_task, false) = false), 0) AS week_points,
      COUNT(*) FILTER (WHERE s.status = 'approved') AS week_approved,
      COUNT(DISTINCT s.user_id) FILTER (WHERE s.status = 'approved') AS week_active_members
    FROM submissions_in_window s
    JOIN team_members tm ON tm.user_id = s.user_id AND tm.org_id = v_challenge.org_id
    GROUP BY tm.team_id, week_num
  ),
  team_weekly_agg AS (
    SELECT
      team_id,
      jsonb_agg(
        jsonb_build_object(
          'week', week_num,
          'points', week_points,
          'approved', week_approved,
          'activeMembers', week_active_members
        ) ORDER BY week_num
      ) AS weekly_breakdown
    FROM weekly_team
    GROUP BY team_id
  )
  SELECT jsonb_build_object(
    'challenge', jsonb_build_object(
      'id', v_challenge.id,
      'name', v_challenge.name,
      'startDate', v_challenge.start_date,
      'endDate', v_challenge.end_date,
      'status', v_challenge.status,
      'timezone', v_challenge.timezone,
      'totalWeeks', v_total_weeks,
      'totalDays', v_task_days,
      'calendarDays', v_total_days
    ),
    'overall', jsonb_build_object(
      'totalSubmissions', (SELECT COUNT(*) FROM submissions_in_window),
      'approvedTotal', (SELECT COUNT(*) FROM submissions_in_window WHERE status = 'approved'),
      'rejectedTotal', (SELECT COUNT(*) FROM submissions_in_window WHERE status = 'rejected'),
      'pendingTotal', (SELECT COUNT(*) FROM submissions_in_window WHERE status = 'pending'),
      'totalPointsAwarded', COALESCE((SELECT SUM(team_points) FROM per_team), 0),
      'totalMembers', (SELECT COUNT(*) FROM per_member),
      'activeMembers', (SELECT COUNT(*) FROM per_member WHERE approved_count > 0),
      'teamCount', (SELECT COUNT(*) FROM per_team)
    ),
    'teams', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'teamId', pt.team_id,
          'teamName', pt.team_name,
          'memberCount', pt.member_count,
          'teamPoints', pt.team_points,
          'teamBonusPoints', pt.team_bonus_points,
          'avgPointsPerMember', pt.avg_points_per_member,
          'approvedTotal', pt.approved_total,
          'rejectedTotal', pt.rejected_total,
          'consistencyPct', pt.consistency_pct,
          'members', pt.members,
          'weeklyBreakdown', COALESCE(twa.weekly_breakdown, '[]'::jsonb)
        ) ORDER BY pt.team_points DESC
      )
      FROM per_team pt
      LEFT JOIN team_weekly_agg twa ON twa.team_id = pt.team_id
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;
