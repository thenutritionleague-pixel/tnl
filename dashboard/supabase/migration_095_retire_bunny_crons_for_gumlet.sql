-- Bunny Stream was retired in Nov 2026 (account deactivated); video proofs now
-- go to Gumlet as gumlet://<asset_id>.
--
-- Two cron jobs existed only for Bunny and now either fail or do nothing:
--   bunny-cleanup-orphans-daily  calls the bunny-cleanup-orphans edge function,
--                                which talks to the dead Bunny API every night.
--   rescue-stalled-bunny         escalates `bunny://` rows after 6 h; there are
--                                no new bunny rows, so it is a no-op every 5 min.
--
-- Gumlet rows are covered by the generic path that already handles every
-- submission: analyze-submission parks a not-yet-ready video as
-- "Video still processing — will retry.", the gumlet-webhook re-kicks it the
-- moment Gumlet finishes, dispatch-analysis retries it as the safety net, and
-- retry_stuck_ai_submissions escalates it to a human after 60 minutes.
--
-- The SQL functions themselves are left in place (harmless, and keep history
-- readable); only their schedules are removed.

select cron.unschedule('bunny-cleanup-orphans-daily')
where exists (select 1 from cron.job where jobname = 'bunny-cleanup-orphans-daily');

select cron.unschedule('rescue-stalled-bunny')
where exists (select 1 from cron.job where jobname = 'rescue-stalled-bunny');
