-- Make the system tell you when it is wrong, instead of waiting for a member to.
--
-- Every bug found on 21-22 Aug was invisible until a person noticed a number:
--   * team tasks counted twice        -- a member messaged about 1,000 points
--   * the same bug in the weekly panel -- spotted from a screenshot
--   * orphan-recovery cron dead        -- pg_cron logged the error and moved on
--   * admin adjustments discarded      -- unnoticed for three months
--   * degenerate fingerprints matching unrelated photos -- found by accident
--
-- The common factor is not carelessness. Nothing was WATCHING. A file of checks
-- only helps if somebody remembers to run it; this runs every 15 minutes and
-- records what it finds, so a silent fault becomes a visible row.
--
-- Six checks, each written from a bug that actually shipped:
--   1 points != ledger          2 team total != sum of parts
--   3 an active cron failing    4 submissions with no verdict for over an hour
--   5 two live submissions for one member+task+day
--   6 a COMPLETED event whose published total moved
--
-- Alerts self-close: repair the cause and the row is marked resolved on the next
-- run, so the open list is always the live problems and nothing else.
--
-- Verified by injecting real faults: a corrupted member total was caught, the
-- alert closed itself once repaired, and the final state returned 0 problems.

create table if not exists integrity_alerts (
  id          bigserial primary key,
  check_name  text not null,
  detail      text not null,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  resolved_at timestamptz,
  unique (check_name, detail)
);

comment on table integrity_alerts is
  'Open integrity failures. A row with resolved_at IS NULL is a live problem.';

-- Function body is applied live; see git history for the full definition.
-- Scheduled every 15 minutes:
--   select cron.schedule('integrity-monitor','*/15 * * * *','select public.run_integrity_checks()');

-- FIX (22 Aug, same night): check 3 must only consider FINISHED runs.
--
-- pg_cron writes the job_run_details row at START, with end_time NULL. The
-- monitor therefore saw its own in-flight execution as a non-succeeded run and
-- reported "cron failing: integrity-monitor" every 15 minutes -- a monitor whose
-- only alert was about itself, which would have trained everyone to ignore it.
--
-- Adding "and x.end_time is not null" to the lateral makes it read the last
-- COMPLETED run of each job. Found by actually looking at the one open alert
-- rather than assuming a clean board.
--
--   join lateral (select * from cron.job_run_details x
--                  where x.jobid = j.jobid and x.end_time is not null
--                  order by start_time desc limit 1) d on true
