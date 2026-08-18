-- TEAM TASKS: one submission per TEAM, points credited to the team.
--
-- For a task like "share on social media and post the screenshot", the whole
-- team benefits from one entry. Today every rule in the system is per-member:
-- the unique index is (task_id, user_id, submitted_date), and approval writes
-- points to the individual. This adds a second mode.
--
-- NOT APPLIED DURING THE DAY. It rewrites handle_submission_approved(), which
-- is the trigger that awards every point in the league, so it goes in after the
-- day's submissions have stopped.
--
-- Rollback is at the bottom.

-- ── 1. Mark a task as team-scoped ────────────────────────────────────────────
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS submission_scope text
  NOT NULL DEFAULT 'member' CHECK (submission_scope IN ('member', 'team'));

COMMENT ON COLUMN tasks.submission_scope IS
  'member (default) = everyone submits. team = one submission per team, points go to the team.';

-- ── 2. Denormalise team + scope onto the submission ──────────────────────────
-- A unique index cannot reach into another table, so the team and the flag have
-- to live on the row itself for the constraint below to be enforceable. They
-- also make the mobile query trivial: "has anyone on my team done this?" is a
-- single filter rather than a join through team_members.
ALTER TABLE task_submissions
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_team_task boolean NOT NULL DEFAULT false;

-- Backfill so existing rows carry their team (harmless: is_team_task stays
-- false everywhere, so no existing submission changes behaviour).
UPDATE task_submissions s
SET team_id = tm.team_id
FROM team_members tm
WHERE tm.user_id = s.user_id AND tm.org_id = s.org_id AND s.team_id IS NULL;

-- ── 3. Stamp both on insert ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_submission_team()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.team_id IS NULL THEN
    SELECT tm.team_id INTO NEW.team_id
    FROM team_members tm
    WHERE tm.user_id = NEW.user_id AND tm.org_id = NEW.org_id
    LIMIT 1;
  END IF;

  SELECT (t.submission_scope = 'team') INTO NEW.is_team_task
  FROM tasks t WHERE t.id = NEW.task_id;
  NEW.is_team_task := COALESCE(NEW.is_team_task, false);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_submission_team ON task_submissions;
CREATE TRIGGER trg_set_submission_team
  BEFORE INSERT ON task_submissions
  FOR EACH ROW EXECUTE FUNCTION set_submission_team();

-- ── 4. The actual rule: one per team per day ─────────────────────────────────
-- Mirrors task_submissions_one_per_day, including the "rejected doesn't count"
-- exclusion so a rejected team entry frees the slot for someone else to retry.
-- A violation raises 23505, which the mobile app ALREADY handles: it clears the
-- upload from the outbox and shows "You have already submitted this task
-- today." So enforcement works even on an app build that predates this.
CREATE UNIQUE INDEX IF NOT EXISTS task_submissions_one_per_team_per_day
  ON task_submissions (task_id, team_id, submitted_date)
  WHERE status <> 'rejected' AND is_team_task AND team_id IS NOT NULL;

-- ── 5. Points go to the TEAM, not the person who happened to submit ──────────
CREATE OR REPLACE FUNCTION public.handle_submission_approved()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_task_title text;
BEGIN
  -- Approval
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    IF NEW.is_team_task AND NEW.team_id IS NOT NULL THEN
      -- Team task: credit the team. No individual's score moves, because the
      -- whole team earned it. transaction_date must be the SUBMISSION date, not
      -- today -- team_points_view only counts team rows dated inside the
      -- challenge window, and a wrong date is silently ignored (that is how
      -- 5,000 Early Bird points disappeared on 16 Aug).
      SELECT t.title INTO v_task_title FROM tasks t WHERE t.id = NEW.task_id;
      INSERT INTO team_transactions (team_id, org_id, amount, reason, kind, transaction_date)
      VALUES (NEW.team_id, NEW.org_id, COALESCE(NEW.points_awarded, 0),
              'Team task: ' || COALESCE(v_task_title, 'task'), 'team_task', NEW.submitted_date);
    ELSE
      INSERT INTO points_transactions (user_id, org_id, amount, reason, submission_id, is_manual)
      VALUES (NEW.user_id, NEW.org_id, COALESCE(NEW.points_awarded, 0), 'Task approved', NEW.id, false);
      UPDATE profiles SET total_points = total_points + COALESCE(NEW.points_awarded, 0)
      WHERE id = NEW.user_id;
    END IF;
  END IF;

  -- Revocation
  IF OLD.status = 'approved' AND NEW.status != 'approved' THEN
    IF OLD.is_team_task AND OLD.team_id IS NOT NULL THEN
      -- Remove the exact credit this submission created. Matching on the team,
      -- amount and date keeps it surgical; a compensating negative row would
      -- leave the team's breakdown showing a phantom award.
      DELETE FROM team_transactions
      WHERE team_id = OLD.team_id AND org_id = OLD.org_id AND kind = 'team_task'
        AND transaction_date = OLD.submitted_date
        AND amount = COALESCE(OLD.points_awarded, 0);
    ELSE
      UPDATE profiles SET total_points = GREATEST(0, total_points - COALESCE(OLD.points_awarded, 0))
      WHERE id = NEW.user_id;
      INSERT INTO points_transactions (user_id, org_id, amount, reason, submission_id, is_manual)
      VALUES (NEW.user_id, NEW.org_id, -COALESCE(OLD.points_awarded, 0), 'Approval revoked', NEW.id, false);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 6. Tell the mobile app which mode a task is in ───────────────────────────
DROP FUNCTION IF EXISTS public.get_mobile_tasks(uuid, uuid);

CREATE FUNCTION public.get_mobile_tasks(p_team_id uuid, p_org_id uuid)
 RETURNS TABLE(id uuid, challenge_id uuid, title text, description text, points integer,
   points_tiers jsonb, week_number integer, category text, icon text, is_active boolean,
   start_date date, end_date date, proof_type text, max_video_seconds integer,
   min_video_seconds integer, submission_scope text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tz    text;
  v_today date;
  v_local timestamp without time zone;
BEGIN
  SELECT organizations.timezone INTO v_tz FROM organizations WHERE organizations.id = p_org_id;
  IF v_tz IS NULL THEN v_tz := 'UTC'; END IF;

  BEGIN
    v_local := (current_timestamp AT TIME ZONE v_tz);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'get_mobile_tasks: invalid timezone "%" for org %, falling back to UTC', v_tz, p_org_id;
    v_local := (current_timestamp AT TIME ZONE 'UTC');
  END;

  IF EXTRACT(HOUR FROM v_local) = 0 AND EXTRACT(MINUTE FROM v_local) < 15 THEN
    v_today := v_local::date - 1;
  ELSE
    v_today := v_local::date;
  END IF;

  RETURN QUERY
  SELECT
    t.id, t.challenge_id, t.title, t.description,
    t.points, t.points_tiers, t.week_number, t.category, t.icon,
    t.is_active, t.start_date, t.end_date,
    t.proof_type, t.max_video_seconds, t.min_video_seconds, t.submission_scope
  FROM tasks t
  JOIN challenges c ON t.challenge_id = c.id
  WHERE
    c.org_id              = p_org_id
    AND c.status          = 'active'
    AND c.manually_closed = false
    AND t.is_active       = true
    AND (t.start_date IS NULL OR v_today >= t.start_date)
    AND (t.end_date   IS NULL OR v_today <= t.end_date)
    AND (
      NOT EXISTS (SELECT 1 FROM challenge_teams ct WHERE ct.challenge_id = c.id)
      OR EXISTS  (SELECT 1 FROM challenge_teams ct WHERE ct.challenge_id = c.id AND ct.team_id = p_team_id)
    )
    AND (
      NOT EXISTS (SELECT 1 FROM task_teams tt WHERE tt.task_id = t.id)
      OR EXISTS  (SELECT 1 FROM task_teams tt WHERE tt.task_id = t.id AND tt.team_id = p_team_id)
    )
  ORDER BY t.week_number, t.created_at;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_mobile_tasks(uuid, uuid) TO authenticated, service_role;

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS task_submissions_one_per_team_per_day;
-- DROP TRIGGER IF EXISTS trg_set_submission_team ON task_submissions;
-- Restore handle_submission_approved() to the member-only version, then:
-- ALTER TABLE tasks DROP COLUMN submission_scope;
-- ALTER TABLE task_submissions DROP COLUMN team_id, DROP COLUMN is_team_task;
-- (and recreate get_mobile_tasks without submission_scope)
