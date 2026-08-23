-- 079: release_stalled_video_backlog matches on submitted_at alone, which
-- reanalyze_submission() never updates. So a fresh forced re-check on an old
-- submission gets claimed (ai_status -> 'analyzing'), then THIS cron (every
-- 2 min) sees submitted_at still 45+ min old and stomps it straight back to
-- needs_review with the canned message -- before the real check (which can
-- take up to 150s) ever gets to finish. Just watched it happen to 20
-- resubmitted checks fired minutes ago.
--
-- Fix: skip a row that is 'analyzing' with a RECENT ai_started_at (< 3 min) --
-- that is a genuine check in flight right now, whether first-time or forced,
-- and deserves to finish. Everything else keeps the original 45-minute rule.
create or replace function public.release_stalled_video_backlog()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_count int;
begin
  with released as (
    update task_submissions ts
       set ai_status   = 'needs_review',
           ai_feedback = 'The video service could not process this in time, so no one has reviewed it yet -- not the AI, not a human. Needs a manual look before it can be approved. Not the member''s fault.'
     where ts.proof_url like 'bunny://%'
       and ts.status = 'pending'
       and (ts.ai_status is null or ts.ai_status = 'analyzing')
       and ts.submitted_at < now() - interval '45 minutes'
       and not (ts.ai_status = 'analyzing' and ts.ai_started_at is not null and ts.ai_started_at > now() - interval '3 minutes')
    returning 1
  )
  select count(*) into v_count from released;
  return v_count;
end;
$function$;
