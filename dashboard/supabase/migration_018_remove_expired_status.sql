-- ================================================================
-- Migration 018: Remove `expired` Submission Status
-- ================================================================
--
-- Decision: the `expired` status (set by the hourly pg_cron job
-- "expire-stale-submissions") is removed entirely.
--
-- Reason:
--   - It was only used for admin queue hygiene — admins already have
--     a date filter on the approvals page to find old submissions.
--   - It surfaced a confusing status to members in Task History.
--   - Future plan: AI-assisted review will process submissions
--     automatically, making queue aging irrelevant.
--
-- What this migration does:
--   1. Unschedules the `expire-stale-submissions` pg_cron job.
--   2. Converts all existing `expired` rows → `pending`
--      so admins can still review them.
--   3. Updates the status check constraint on task_submissions
--      to remove 'expired' as a valid value.
-- ================================================================

-- ── Step 1: Remove the pg_cron job ──────────────────────────────
select cron.unschedule('expire-stale-submissions');

-- ── Step 2: Restore expired rows to pending ─────────────────────
update task_submissions
set status = 'pending'
where status = 'expired';

-- ── Step 3: Update the status check constraint ──────────────────
-- Drop whichever constraint enforces the old status enum.
-- Supabase inline check constraints are named after the column pattern.
alter table task_submissions
  drop constraint if exists task_submissions_status_check;

-- Also handle the case where it was created as a named constraint inline
do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from   pg_constraint
  where  conrelid = 'task_submissions'::regclass
    and  contype  = 'c'
    and  pg_get_constraintdef(oid) like '%expired%'
  limit  1;

  if v_conname is not null then
    execute format('alter table task_submissions drop constraint %I', v_conname);
  end if;
end$$;

-- Re-add constraint without 'expired'
alter table task_submissions
  add constraint task_submissions_status_check
  check (status in ('pending', 'approved', 'rejected'));

-- ── Verify ──────────────────────────────────────────────────────
-- Check no expired rows remain:
--   select count(*) from task_submissions where status = 'expired';  -- must be 0
--
-- Check cron job is gone:
--   select * from cron.job where jobname = 'expire-stale-submissions';  -- no rows
