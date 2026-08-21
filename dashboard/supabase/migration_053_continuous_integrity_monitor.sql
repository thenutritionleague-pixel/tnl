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
