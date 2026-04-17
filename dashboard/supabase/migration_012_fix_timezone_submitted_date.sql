-- Migration 012: Fix timezone-aware submitted_date for task_submissions
-- 
-- BUG: submitted_date defaults to current_date (UTC), which is wrong for 
-- orgs in timezones like Asia/Kolkata (+5:30). A submission at 00:30 IST
-- gets UTC date of previous day, causing premature expiry by cron job.
--
-- FIX:
-- 1. Create a trigger that auto-sets submitted_date using org's local timezone
-- 2. Fix existing bad data by recalculating from submitted_at
-- 3. Tighten the expire cron job to use submitted_at directly (more reliable)

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Trigger function — always compute submitted_date in org's timezone
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function set_submitted_date_local()
returns trigger language plpgsql security definer as $$
declare
  v_timezone text;
begin
  -- Look up the org's timezone
  select timezone into v_timezone
  from organizations
  where id = NEW.org_id;

  -- Default to UTC if not found
  if v_timezone is null then
    v_timezone := 'UTC';
  end if;

  -- Always override submitted_date with the local org date at time of submission
  NEW.submitted_date := (NEW.submitted_at at time zone v_timezone)::date;

  return NEW;
end;
$$;

-- Attach trigger: fires BEFORE INSERT so the correct date is stored
drop trigger if exists trg_set_submitted_date on task_submissions;
create trigger trg_set_submitted_date
  before insert on task_submissions
  for each row
  execute function set_submitted_date_local();

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Fix existing bad data — recalculate submitted_date from submitted_at
-- ─────────────────────────────────────────────────────────────────────────────
update task_submissions ts
set submitted_date = (ts.submitted_at at time zone o.timezone)::date
from organizations o
where ts.org_id = o.id
  and ts.submitted_date != (ts.submitted_at at time zone o.timezone)::date;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Replace expire cron job with timezone-aware version using submitted_at
-- This is the belt-and-suspenders approach — even if submitted_date is slightly
-- off, comparing submitted_at directly against local midnight is 100% accurate.
-- ─────────────────────────────────────────────────────────────────────────────
select cron.unschedule('expire-stale-submissions');

select cron.schedule(
  'expire-stale-submissions',
  '0 * * * *',  -- every hour, on the hour
  $$
    update task_submissions ts
    set status = 'expired'
    from organizations o
    where ts.org_id = o.id
      and ts.status = 'pending'
      -- Use submitted_at against local midnight for precision
      and (ts.submitted_at at time zone o.timezone)::date
            < (current_timestamp at time zone o.timezone)::date;
  $$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY: Run this to check the fix worked
-- ─────────────────────────────────────────────────────────────────────────────
-- Check 1: No more mismatched submitted_date
-- select count(*) as bad_rows from task_submissions ts
-- join organizations o on o.id = ts.org_id
-- where ts.submitted_date != (ts.submitted_at at time zone o.timezone)::date;
-- Expected: 0

-- Check 2: Verify updated cron job
-- select jobname, schedule, command from cron.job where jobname = 'expire-stale-submissions';
