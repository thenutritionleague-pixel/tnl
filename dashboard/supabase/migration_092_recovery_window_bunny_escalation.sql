-- RECOVERY WINDOW during the 24 Aug Bunny outage.
--
-- Escalating on submitted_at re-escalated every requeued row within a single
-- cron cycle (they were all hours old), so the backlog never got one attempt
-- after each fix. Pushed the Bunny-specific escalation to 6h so recovery work
-- could actually proceed. The analysis escalation and the stale-claim resets
-- are unchanged, so a genuinely failing analysis still surfaces and nothing
-- retries forever.
--
-- Diagnostic that ended the investigation: of 145 videos stuck on "still
-- processing", ZERO had a video_fingerprint and ZERO had video_bytes. Bunny
-- writes the thumbnail as the first step of processing, and every video it
-- did process that night has one -- so these had not been started at all.
-- Not a probe bug, not a failed upload (that reports status 6, handled
-- separately): Bunny simply had them queued and untouched. No pipeline change
-- can analyse a file that does not exist yet.
create or replace function public.retry_stuck_ai_submissions()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update task_submissions
  set ai_status = 'needs_review',
      ai_feedback = 'Video service could not deliver this file after repeated attempts — needs manual look.'
  where status = 'pending'
    and ai_status is null
    and ai_feedback = 'Video still processing — will retry.'
    and submitted_at < now() - interval '6 hours';

  update task_submissions
  set ai_status = 'needs_review',
      ai_feedback = 'AI review could not complete after repeated attempts — needs manual look.'
  where status = 'pending'
    and ai_status = 'analyzing'
    and coalesce(ai_started_at, submitted_at) < now() - interval '60 minutes';

  update task_submissions
  set ai_status = null
  where ai_status = 'analyzing' and status = 'pending'
    and coalesce(ai_started_at, submitted_at) < now() - interval '10 minutes'
    and submitted_at > now() - interval '8 hours';

  update task_submissions
  set ai_status = null
  where ai_status = 'analyzing' and status <> 'pending'
    and ai_started_at < now() - interval '10 minutes'
    and ai_started_at > now() - interval '6 hours';

  perform net.http_post(
    url     := 'https://rvlwltgneitthdecqpkt.supabase.co/functions/v1/dispatch-analysis',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$function$;
