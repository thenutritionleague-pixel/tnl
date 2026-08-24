-- The 60-minute escalation measured from submitted_at, i.e. how old the
-- MEMBER'S SUBMISSION is -- not how long the current attempt has been trying.
-- Consequence: any submission requeued after an infrastructure outage was
-- already "over an hour old" the instant it went back in the queue, so it was
-- escalated straight back to needs_review without a single retry ever running.
-- Seen live: 87 rows requeued after the pg_net fix, 51 of them bounced back to
-- needs_review within one cron cycle, none of them retried.
--
-- Now measured from the last attempt (ai_started_at), falling back to
-- submitted_at for something never attempted at all. A hard 6-hour ceiling
-- from submission keeps anything from bouncing indefinitely.
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
    and coalesce(ai_started_at, submitted_at) < now() - interval '15 minutes';

  update task_submissions
  set ai_status = 'needs_review',
      ai_feedback = 'AI review could not complete after repeated attempts — needs manual look.'
  where status = 'pending'
    and ai_status in ('analyzing')
    and coalesce(ai_started_at, submitted_at) < now() - interval '60 minutes';

  update task_submissions
  set ai_status = 'needs_review',
      ai_feedback = 'AI review could not complete after repeated attempts — needs manual look.'
  where status = 'pending'
    and ai_status is null
    and coalesce(ai_started_at, submitted_at) < now() - interval '60 minutes'
    -- Absolute backstop: never let a row bounce forever just because each new
    -- attempt refreshes ai_started_at.
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

-- retry-bunny-submissions was a THIRD dispatcher, firing up to 50 separate
-- pg_net calls every single minute -- by far the largest contributor to the
-- concurrency collapse, and fully redundant now that dispatch-analysis covers
-- the same rows through one call.
select cron.unschedule('retry-bunny-submissions')
where exists (select 1 from cron.job where jobname = 'retry-bunny-submissions');
