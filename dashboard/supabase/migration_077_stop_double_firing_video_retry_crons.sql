-- 077: retry-bunny-submissions and retry-stuck-ai-submissions were both
-- polling the SAME window (anything 2min-6h old, ai_status null, status
-- pending) every single minute, with no claim before firing. Neither locks
-- a row before calling analyze-submission, so for the whole 2min-6h backlog,
-- every stuck submission was getting fired TWICE a minute -- doubling
-- concurrent Gemini calls and edge-function invocations. During the 23 Aug
-- traffic spike that tipped the pipeline into WORKER_RESOURCE_LIMIT crashes,
-- and the crash-reset-refire cycle kept the backlog fed rather than
-- draining it: 39 real submissions stuck 12-46 minutes in 'analyzing'.
--
-- Fix: give retry-bunny-submissions its own non-overlapping lane -- only the
-- very freshest video rows (30s-2min old), which retry-stuck-ai-submissions
-- explicitly excludes (`submitted_at < now() - interval '2 minutes'`).
-- Everything older than 2 minutes is now touched by exactly one cron.
create or replace function public.retry_pending_bunny_submissions()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id, org_id
    FROM task_submissions
    WHERE proof_url LIKE 'bunny://%'
      AND ai_status IS NULL
      AND status = 'pending'          -- never re-analyse a human decision
      AND submitted_at < now() - interval '30 seconds'
      -- Upper bound added: retry-stuck-ai-submissions owns everything past
      -- 2 minutes. Without this, both crons fired the same backlog twice
      -- a minute.
      AND submitted_at > now() - interval '2 minutes'
    LIMIT 50  -- guard against runaway
  LOOP
    PERFORM net.http_post(
      url := 'https://rvlwltgneitthdecqpkt.supabase.co/functions/v1/analyze-submission',
      body := json_build_object('record', json_build_object('id', r.id, 'org_id', r.org_id))::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  END LOOP;
END;
$function$;
