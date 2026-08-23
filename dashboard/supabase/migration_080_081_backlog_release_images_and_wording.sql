-- 080: two gaps found live during the 23 Aug spike, both on the same submission
-- (0cbd7904, an image) that ran for 163 minutes straight without ever reaching
-- a human:
--
-- 1. release_stalled_video_backlog only ever matched proof_url LIKE 'bunny://%'.
--    An image has NO age-based safety net at all -- if it keeps crashing on
--    compute limits, it just keeps getting reclaimed by retry_stuck_ai_submissions'
--    10-min analyzing->null reset and re-crashing, forever. Widened to cover
--    both proof types; the function/job name stays as-is, not worth a rename.
--
-- 2. Migration 079's "don't stomp a genuinely fresh in-flight check" exclusion
--    (ai_started_at < 3 min old) has no ceiling. A row that keeps getting
--    reclaimed every cron cycle ALWAYS has a fresh ai_started_at, so it can
--    dodge the 45-min release forever no matter how many times it has already
--    failed. Added a hard ceiling: past 90 minutes total, release regardless
--    of how recently it was last (re-)claimed -- something failing that
--    persistently needs a human, not one more automatic attempt.
--
-- 081 (folded in): the message still said "video service" after 080 widened
-- this to cover images too. Wording made proof-type neutral.
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
           ai_feedback = 'The AI check could not process this in time, so no one has reviewed it yet -- not the AI, not a human. Needs a manual look before it can be approved. Not the member''s fault.'
     where ts.status = 'pending'
       and (ts.ai_status is null or ts.ai_status = 'analyzing')
       and ts.submitted_at < now() - interval '45 minutes'
       and (
         ts.submitted_at < now() - interval '90 minutes'
         or not (ts.ai_status = 'analyzing' and ts.ai_started_at is not null and ts.ai_started_at > now() - interval '3 minutes')
       )
    returning 1
  )
  select count(*) into v_count from released;
  return v_count;
end;
$function$;
