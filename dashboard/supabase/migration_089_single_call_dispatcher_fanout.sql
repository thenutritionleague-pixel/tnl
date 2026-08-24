-- pg_net fails in proportion to CONCURRENCY, not volume. Measured on live
-- traffic over 90 minutes on 24 Aug:
--     13-25 pg_net requests/min -> 53.6% delivered
--     26+   pg_net requests/min -> 28.2% delivered
--     1     request  (manual)   -> 100%, every time
--
-- Two callers were competing for that budget:
--   1. this cron, making one call PER pending submission (12-30/min)
--   2. trigger_analyze_submission, one call per new submission (10-15/min)
--
-- Fix part 1 (here): the cron now makes exactly ONE call, to the new
-- dispatch-analysis edge function, which does the fan-out over Deno's network
-- stack instead -- the same stack analyze-submission uses to reach Gemini,
-- Bunny and OpenAI all day without this failure mode.
--
-- Fix part 2 (below): the insert trigger keeps its instant-dispatch role, but
-- with a realistic timeout instead of the 5s default that was guaranteeing
-- failure under load. It stays best-effort by design -- anything it misses is
-- picked up by the dispatcher within ~2 minutes.
--
-- All the pure-SQL safety nets (escalation, stale-claim reset) are unchanged
-- and stay in this function: they touch no network and were never the problem.

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
      ai_feedback = 'AI review could not complete after repeated attempts over the last hour — needs manual look.'
  where status = 'pending'
    and (
      (ai_status = 'analyzing' and coalesce(ai_started_at, submitted_at) < now() - interval '60 minutes')
      or (ai_status is null and submitted_at < now() - interval '60 minutes')
    );

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

  -- ONE network call. The fan-out happens inside the edge function.
  perform net.http_post(
    url     := 'https://rvlwltgneitthdecqpkt.supabase.co/functions/v1/dispatch-analysis',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$function$;

-- The instant path a member's submission takes. Best-effort by design (the
-- EXCEPTION block swallows failures so a network problem can never block a
-- submission from being saved), but the 5s default timeout meant it was losing
-- most of its attempts under load and every one of those members then waited
-- for the 2-minute dispatcher sweep instead of getting an instant check.
create or replace function public.trigger_analyze_submission()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform net.http_post(
    url     := 'https://rvlwltgneitthdecqpkt.supabase.co/functions/v1/analyze-submission',
    body    := json_build_object('record', row_to_json(NEW))::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 15000
  );
  return NEW;
exception when others then
  return NEW;
end;
$function$;
