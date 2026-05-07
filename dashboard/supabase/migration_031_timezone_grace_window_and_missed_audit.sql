-- ================================================================
-- Migration 031: Timezone-aware submission dates & missed task audit
-- ================================================================
--
-- Fixes two bugs affecting non-UTC orgs:
--
-- 1. GRACE WINDOW — The existing set_submitted_date_local() trigger
--    computed submitted_date as exact local midnight, so a user who
--    submitted 22 seconds after midnight IST got submitted_date = next
--    day. The updated trigger gives a 15-minute buffer: anything
--    between 00:00 and 00:14 local org time is backdated to the
--    previous day.
--
-- 2. MISSED AUDIT — The daily cron ran at 00:05 UTC and passed
--    current_date - 1 (UTC date) to write_missed_transactions_for_date.
--    For UTC− orgs (US timezones) this runs before their day ends,
--    causing false "missed" marks. Fixed by a per-org wrapper that
--    computes each org's local "yesterday", run every 6 hours so every
--    timezone is covered within 6 hours of their midnight.
-- ================================================================


-- ----------------------------------------------------------------
-- FIX 1: Update trigger to apply 15-minute grace window
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_submitted_date_local()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_timezone text;
  v_local_ts timestamp without time zone;
BEGIN
  SELECT timezone INTO v_timezone FROM organizations WHERE id = NEW.org_id;
  IF v_timezone IS NULL THEN v_timezone := 'UTC'; END IF;

  -- Convert submitted_at to org-local wall-clock time
  v_local_ts := (NEW.submitted_at AT TIME ZONE v_timezone);

  -- 15-minute grace window: submissions in the first 15 mins after
  -- local midnight are treated as the previous day. Covers users who
  -- submit just after the deadline (e.g. 00:00–00:14 IST).
  IF EXTRACT(HOUR FROM v_local_ts) = 0 AND EXTRACT(MINUTE FROM v_local_ts) < 15 THEN
    NEW.submitted_date := v_local_ts::date - 1;
  ELSE
    NEW.submitted_date := v_local_ts::date;
  END IF;

  RETURN NEW;
END;
$$;


-- ----------------------------------------------------------------
-- FIX 2A: Org-scoped missed transaction writer
-- Same logic as write_missed_transactions_for_date but filtered
-- to a single org so the wrapper can pass per-org "yesterday".
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.write_missed_transactions_for_org(
  p_org_id     uuid,
  p_target_date date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inserted int := 0;
BEGIN
  INSERT INTO points_transactions (user_id, org_id, amount, reason, is_manual)
  SELECT DISTINCT
    om.user_id,
    c.org_id,
    0,
    'Task missed: ' || t.title || ' (' || p_target_date::text || ')',
    false
  FROM challenges c
  JOIN tasks t
    ON  t.challenge_id = c.id
    AND t.is_active    = true
  JOIN org_members om
    ON  om.org_id = c.org_id
  WHERE
    c.org_id          = p_org_id
    AND c.status      = 'active'
    AND c.manually_closed = false
    AND p_target_date >= c.start_date
    AND (c.end_date IS NULL OR p_target_date <= c.end_date)
    -- member is in-scope for the challenge
    AND (
      NOT EXISTS (SELECT 1 FROM challenge_teams ct WHERE ct.challenge_id = c.id)
      OR EXISTS (
        SELECT 1
        FROM  team_members   tm2
        JOIN  challenge_teams ct2 ON ct2.team_id = tm2.team_id
        WHERE tm2.user_id      = om.user_id
          AND ct2.challenge_id = c.id
      )
    )
    -- member is in-scope for the task
    AND (
      NOT EXISTS (SELECT 1 FROM task_teams tt WHERE tt.task_id = t.id)
      OR EXISTS (
        SELECT 1
        FROM  task_teams   tt3
        JOIN  team_members tm3 ON tm3.team_id = tt3.team_id
        WHERE tm3.user_id = om.user_id
          AND tt3.task_id = t.id
      )
    )
    -- member did NOT submit for this task on that date
    AND NOT EXISTS (
      SELECT 1
      FROM  task_submissions ts
      WHERE ts.task_id        = t.id
        AND ts.user_id        = om.user_id
        AND ts.submitted_date = p_target_date
    )
    -- idempotency guard
    AND NOT EXISTS (
      SELECT 1
      FROM  points_transactions pt
      WHERE pt.user_id = om.user_id
        AND pt.org_id  = c.org_id
        AND pt.amount  = 0
        AND pt.reason  = 'Task missed: ' || t.title || ' (' || p_target_date::text || ')'
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;


-- ----------------------------------------------------------------
-- FIX 2B: Wrapper that iterates orgs using each org's own timezone
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.run_daily_missed_audit()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org     RECORD;
  v_yesterday date;
  v_total   int := 0;
  v_rows    int;
BEGIN
  FOR v_org IN
    SELECT DISTINCT
      o.id                          AS org_id,
      COALESCE(o.timezone, 'UTC')   AS tz
    FROM  organizations o
    JOIN  challenges c ON c.org_id = o.id
    WHERE c.status        = 'active'
      AND c.manually_closed = false
  LOOP
    -- "yesterday" in this org's local timezone
    v_yesterday := (current_timestamp AT TIME ZONE v_org.tz)::date - 1;
    SELECT write_missed_transactions_for_org(v_org.org_id, v_yesterday) INTO v_rows;
    v_total := v_total + v_rows;
  END LOOP;

  RETURN v_total;
END;
$$;


-- ----------------------------------------------------------------
-- FIX 2C: Reschedule cron to run every 6 hours
-- Running at 00:05 / 06:05 / 12:05 / 18:05 UTC ensures every
-- timezone is audited within 6 hours of their local midnight.
-- (UTC−12 orgs' midnight = 12:00 UTC, caught by the 12:05 run.)
-- Idempotency in the insert prevents any double-writes.
-- ----------------------------------------------------------------

SELECT cron.unschedule('daily-missed-task-audit');

SELECT cron.schedule(
  'daily-missed-task-audit',
  '5 */6 * * *',
  $$ SELECT run_daily_missed_audit(); $$
);


-- ----------------------------------------------------------------
-- VERIFY
-- ----------------------------------------------------------------
-- 1. Check trigger still exists:
--    SELECT trigger_name FROM information_schema.triggers
--    WHERE event_object_table = 'task_submissions';
--
-- 2. Test grace window (IST midnight = 18:30 UTC previous day):
--    INSERT INTO task_submissions (..., submitted_at = '2026-05-07 18:30:22+00', org_id = <ist_org>)
--    → submitted_date should be 2026-05-07 (not 2026-05-08)
--
-- 3. Test missed audit:
--    SELECT run_daily_missed_audit();
--    → Returns count of newly inserted missed rows (0 if already up to date)
--
-- 4. Confirm new cron schedule:
--    SELECT jobname, schedule FROM cron.job WHERE jobname = 'daily-missed-task-audit';
--    → schedule = '5 */6 * * *'
