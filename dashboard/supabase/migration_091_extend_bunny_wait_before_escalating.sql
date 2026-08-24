-- Bunny is slow tonight, not broken: videos ARE completing, just at ~1.6/min
-- against ~3/min intake. The 15-minute escalation was therefore manufacturing
-- admin work -- pushing videos to needs_review that would have resolved on
-- their own once Bunny caught up. 87 rows had piled up that way, which is not
-- a queue any admin can clear by hand during a live event.
--
-- Extended to 60 minutes so Bunny gets a realistic chance first. Anything
-- genuinely undeliverable still reaches a human, just after a wait that
-- reflects how long Bunny actually takes rather than how long we guessed.
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
    and coalesce(ai_started_at, submitted_at) < now() - interval '60 minutes'
    and submitted_at < now() - interval '60 minutes';

  update task_submissions
  set ai_status = 'needs_review',
      ai_feedback = 'AI review could not complete after repeated attempts — needs manual look.'
  where status = 'pending'
    and ai_status = 'analyzing'
    and coalesce(ai_started_at, submitted_at) < now() - interval '60 minutes';

  update task_submissions
  set ai_status = 'needs_review',
      ai_feedback = 'AI review could not complete after repeated attempts — needs manual look.'
  where status = 'pending'
    and ai_status is null
    and coalesce(ai_started_at, submitted_at) < now() - interval '60 minutes'
    and submitted_at < now() - interval '6 hours';

  update task_submissions
  set ai_status = null
  where ai_status = 'analyzing' and status = 'pending'
    and coalesce(ai_started_at, submitted_at) < now() - interval '10 minutes'
    and submitted_at > now() - interval '6 hours';

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
