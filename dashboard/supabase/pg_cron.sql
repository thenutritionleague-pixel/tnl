-- ================================================================
-- Yi Nutrition League — pg_cron Jobs (Multi-Tenant & Timezone Aware)
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- JOB 1: Auto-activate challenges on start_date
-- Runs HOURLY. Activates challenges where local org time is >= start_date.
-- ────────────────────────────────────────────────────────────────
select cron.schedule(
  'auto-activate-challenges',
  '0 * * * *',
  $$
    update challenges c
    set status = 'active'
    from organizations o
    where c.org_id = o.id
      and c.status = 'upcoming'
      and c.start_date <= (current_timestamp at time zone o.timezone)::date
      and c.manually_closed = false;
  $$
);

-- ────────────────────────────────────────────────────────────────
-- JOB 2: Auto-complete challenges after end_date
-- Runs HOURLY. Completes challenges where local org time is > end_date.
-- ────────────────────────────────────────────────────────────────
select cron.schedule(
  'auto-complete-challenges',
  '0 * * * *',
  $$
    update challenges c
    set status = 'completed'
    from organizations o
    where c.org_id = o.id
      and c.status = 'active'
      and c.end_date < (current_timestamp at time zone o.timezone)::date;
  $$
);

-- NOTE: JOB 3 (expire-stale-submissions) was REMOVED in migration_018.
-- The `expired` status no longer exists. Admins use the date filter
-- on the approvals page to find old pending submissions.
-- Future: AI-assisted review will process submissions automatically.

-- ────────────────────────────────────────────────────────────────
-- VERIFY: List all scheduled jobs
-- select * from cron.job;
-- ────────────────────────────────────────────────────────────────
