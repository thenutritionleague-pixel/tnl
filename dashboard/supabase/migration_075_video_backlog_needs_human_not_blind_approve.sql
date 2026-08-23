-- 075: the 45-min video-backlog release must NOT hand out points unseen.
--
-- migration_039 (20 Aug) made this auto-APPROVE at full claimed points after
-- 45 minutes stuck in transcoding, because 750+ videos jammed the pipeline in
-- one afternoon and members were being punished for OUR backlog, not theirs.
-- That reasoning was right. The mechanism was too blunt: it has since fired
-- 813 times and paid out 147,500 points on video content NO ONE has ever
-- looked at -- not the AI (never ran), not a human (never routed to one).
-- A stitched or looped video sails through exactly this path, invisible to
-- both the vision check and the duplicate-fingerprint check, because the
-- pipeline delay that trips this cron has nothing to do with whether the
-- footage is honest.
--
-- Fix: same 45-minute trigger, same "not the member's fault" framing, but it
-- now routes to a human instead of deciding on its own. No points move until
-- an admin looks. This does not touch the 813 rows already paid -- that is a
-- separate, deliberate call on live results the night before the final day,
-- not something a migration should do silently.
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
    returning 1
  )
  select count(*) into v_count from released;
  return v_count;
end;
$function$;
