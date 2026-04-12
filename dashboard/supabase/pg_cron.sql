-- ================================================================
-- Yi Nutrition League — pg_cron Jobs
-- Run in Supabase → SQL Editor after enabling the pg_cron extension
-- ================================================================
--
-- STEP 1: Enable extension (Supabase Dashboard → Database → Extensions)
-- Search "pg_cron" and toggle it ON. Then run the queries below.
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- JOB 1: Auto-activate challenges on start_date
-- Runs daily at 00:05 UTC (5:35 AM IST)
-- ────────────────────────────────────────────────────────────────
select cron.schedule(
  'auto-activate-challenges',
  '5 0 * * *',
  $$
    update challenges
    set status = 'active'
    where status = 'upcoming'
      and start_date <= current_date
      and manually_closed = false;
  $$
);

-- ────────────────────────────────────────────────────────────────
-- JOB 2: Auto-complete challenges after end_date
-- Runs daily at 01:00 UTC (6:30 AM IST)
-- ────────────────────────────────────────────────────────────────
select cron.schedule(
  'auto-complete-challenges',
  '0 1 * * *',
  $$
    update challenges
    set status = 'completed'
    where status = 'active'
      and end_date < current_date;
  $$
);

-- ────────────────────────────────────────────────────────────────
-- JOB 3: Expire pending submissions at midnight IST (18:30 UTC)
-- Marks 'pending' submissions from yesterday as 'expired'.
-- Uses submitted_date to target only stale submissions.
-- ────────────────────────────────────────────────────────────────
select cron.schedule(
  'expire-stale-submissions',
  '30 18 * * *',
  $$
    update task_submissions
    set status = 'expired'
    where status = 'pending'
      and submitted_date < (current_timestamp at time zone 'Asia/Kolkata')::date;
  $$
);

-- ────────────────────────────────────────────────────────────────
-- VERIFY: List all scheduled jobs
-- ────────────────────────────────────────────────────────────────
-- select * from cron.job;

-- ────────────────────────────────────────────────────────────────
-- REMOVE JOBS (if you need to update a schedule):
-- select cron.unschedule('auto-activate-challenges');
-- select cron.unschedule('auto-complete-challenges');
-- select cron.unschedule('expire-stale-submissions');
-- ────────────────────────────────────────────────────────────────
