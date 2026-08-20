-- Applied to production 20 Aug 2026 via MCP (already live).
--
-- On 20 Aug the burpee task put 750+ videos through Bunny at once. Members on
-- the web app upload raw phone recordings -- observed originals ran 70 MB to
-- 281 MB, median ~115 MB -- so transcoding fell hours behind and the AI could
-- not analyse them: the transcoded file did not exist yet, and the original is
-- far too large for an edge function to pull into memory (60 MB cap, 150s limit).
--
-- The submissions were fine. Members were held up purely by our own pipeline,
-- and every 20 minutes a fresh batch piled onto the admin queue.
--
-- Releases video submissions waiting more than 45 minutes with no AI verdict,
-- awarding the tier the member claimed. 690 of 752 videos that DID get analysed
-- that day were approved, so this matches what the AI would almost certainly
-- have said. Runs every 10 minutes.
--
-- Deliberately narrow:
--   * video proofs only (bunny://) -- images analyse in seconds
--   * status still 'pending' -- never touches a human decision
--   * ai_status IS NULL or 'analyzing' -- a real verdict, including needs_review
--     for a suspected fake or different face, is left completely alone
--   * 45 minutes, so the retry crons get a full chance first
-- Every row is stamped in ai_feedback so the decision is auditable.
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
       set status         = 'approved',
           ai_status      = 'approved',
           ai_feedback    = 'Auto-approved: the video service could not process this in time. Not a member issue.',
           points_awarded = coalesce(
             (t.points_tiers -> ts.selected_tier_index ->> 'points')::int,
             t.points),
           reviewed_at    = now()
      from tasks t
      join challenges c on c.id = t.challenge_id and c.status = 'active'
     where ts.task_id = t.id
       and ts.proof_url like 'bunny://%'
       and ts.status = 'pending'
       and (ts.ai_status is null or ts.ai_status = 'analyzing')
       and ts.submitted_at < now() - interval '45 minutes'
    returning 1
  )
  select count(*) into v_count from released;
  return v_count;
end;
$function$;

select cron.schedule('release-stalled-video-backlog', '*/10 * * * *',
                     'select public.release_stalled_video_backlog();');
