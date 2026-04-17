-- ================================================================
-- Migration 017: Missed Task 0-Point Transactions
-- ================================================================
--
-- Goal: For every (member × task × day) where the task was live
-- but the member did NOT submit at all, insert a
-- points_transactions row with amount = 0 and
-- reason = 'Task missed: <title> (<date>)'.
--
-- Any submission record (approved/pending/expired/rejected) means
-- the member tried. Rejected members can resubmit any time via
-- Task History in the app — the cron never auto-penalizes them.
--
-- This gives admin a full audit trail: both completed and missed
-- days appear in the breakdown, so the UI can show:
--   ✅ Drink Water   5 days × 10 pts    50 pts
--   ❌ Drink Water   1 day missed        0 pts
--
-- Idempotent: the unique guard prevents duplicate rows even if the
-- cron fires multiple times for the same date.
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- HELPER FUNCTION: write_missed_transactions_for_date
-- Called both by the cron job and the backfill RPC.
-- p_target_date: the calendar date to audit (usually "yesterday")
-- ────────────────────────────────────────────────────────────────
create or replace function write_missed_transactions_for_date(p_target_date date)
returns int   -- number of rows inserted
language plpgsql security definer as $$
declare
  v_inserted int := 0;
begin
  insert into points_transactions (user_id, org_id, amount, reason, is_manual)
  select distinct
    om.user_id,
    c.org_id,
    0,
    'Task missed: ' || t.title || ' (' || p_target_date::text || ')',
    false
  from challenges c
  join tasks t
    on  t.challenge_id = c.id
    and t.is_active    = true
  join org_members om
    on  om.org_id = c.org_id
  where
    c.status          = 'active'
    and c.manually_closed = false
    -- challenge must have been running on p_target_date
    and p_target_date >= c.start_date
    and (c.end_date is null or p_target_date <= c.end_date)
    -- NOTE: NO week_number date gate here.
    -- get_mobile_tasks (migration_015) shows ALL active tasks from Day 1
    -- regardless of week_number, so we must audit ALL of them too.
    -- member is in-scope for the challenge team assignment:
    -- (no challenge_teams restriction OR member's team is listed)
    and (
      not exists (
        select 1 from challenge_teams ct where ct.challenge_id = c.id
      )
      or exists (
        select 1
        from team_members  tm2
        join challenge_teams ct2 on ct2.team_id = tm2.team_id
        where tm2.user_id      = om.user_id
          and ct2.challenge_id = c.id
      )
    )
    -- member is in-scope for the task's team restriction:
    -- (no task_teams restriction OR member's team is listed)
    and (
      not exists (
        select 1 from task_teams tt where tt.task_id = t.id
      )
      or exists (
        select 1
        from team_members  tm3
        join task_teams    tt3 on tt3.team_id = tm3.team_id
        where tm3.user_id = om.user_id
          and tt3.task_id = t.id
      )
    )
    -- member did NOT submit at all for this task on that date.
    -- Any submission record (approved / pending / expired / rejected) means
    -- the member tried — cron never auto-penalizes them.
    -- Rejected members can resubmit any time from Task History;
    -- that flow is handled in the app, not here.
    and not exists (
      select 1
      from task_submissions ts
      where ts.task_id        = t.id
        and ts.user_id        = om.user_id
        and ts.submitted_date = p_target_date
    )
    -- idempotency: no 0-pt "missed" row already exists for this combo
    and not exists (
      select 1
      from points_transactions pt
      where pt.user_id = om.user_id
        and pt.org_id  = c.org_id
        and pt.amount  = 0
        and pt.reason  = 'Task missed: ' || t.title || ' (' || p_target_date::text || ')'
    );

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- JOB 4: Daily missed-task audit at midnight UTC
-- Runs at 00:05 UTC every day (5 min after midnight to let the
-- expire-stale-submissions job finish first at 00:00).
-- Audits "yesterday" for every active challenge.
-- ────────────────────────────────────────────────────────────────
select cron.schedule(
  'daily-missed-task-audit',
  '5 0 * * *',
  $$
    select write_missed_transactions_for_date(current_date - 1);
  $$
);

-- ────────────────────────────────────────────────────────────────
-- BACKFILL RPC: backfill_missed_transactions
-- Retroactively fills 0-pt missed rows for all past days of an
-- active challenge.  Safe to call multiple times (idempotent).
-- Usage:
--   select backfill_missed_transactions('<challenge_id>'::uuid);
--   -- pass NULL to backfill ALL active challenges
-- ────────────────────────────────────────────────────────────────
create or replace function backfill_missed_transactions(p_challenge_id uuid default null)
returns text
language plpgsql security definer as $$
declare
  v_challenge  record;
  v_date       date;
  v_today      date := current_date;
  v_total      int  := 0;
  v_rows       int;
begin
  for v_challenge in
    select id, start_date, end_date
    from   challenges
    where  status = 'active'
      and  manually_closed = false
      and  (p_challenge_id is null or id = p_challenge_id)
  loop
    -- iterate every calendar day from challenge start up through yesterday
    v_date := v_challenge.start_date;
    while v_date < v_today loop
      -- stop at end_date if set
      exit when v_challenge.end_date is not null and v_date > v_challenge.end_date;

      select write_missed_transactions_for_date(v_date) into v_rows;
      v_total := v_total + v_rows;
      v_date  := v_date + 1;
    end loop;
  end loop;

  return 'Backfill complete. Inserted ' || v_total || ' missed-task transactions.';
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- VERIFY
-- After running, check with:
--   select count(*), reason from points_transactions
--   where amount = 0 group by reason order by count desc;
--
-- Run backfill (optional — fills historical misses):
--   select backfill_missed_transactions();          -- all challenges
--   select backfill_missed_transactions('<uuid>');  -- one challenge
--
-- List scheduled jobs:
--   select * from cron.job where jobname = 'daily-missed-task-audit';
-- ────────────────────────────────────────────────────────────────
