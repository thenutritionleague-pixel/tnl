-- 078: both retry crons fire their whole batch (up to 10 / up to 50) in one
-- instant every minute, no gap between calls. That bursts pg_net's own
-- connection pool + Gemini's rate limit at the same moment every cycle -- 72
-- of 74 outbound calls in one 5-min sample never even connected (DNS
-- timeout), not a Gemini failure. Spreading the SAME calls across the minute
-- instead of firing them all at once eases both pressure points without
-- reducing total throughput.
create or replace function public.retry_stuck_ai_submissions()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare sub record;
begin
  update task_submissions
  set ai_status = null
  where ai_status = 'analyzing' and status = 'pending'
    and submitted_at < now() - interval '10 minutes'
    and submitted_at > now() - interval '6 hours';

  for sub in
    select id, org_id from task_submissions
    where ai_status is null and status = 'pending'
      and submitted_at < now() - interval '2 minutes'
      and submitted_at > now() - interval '6 hours'
    order by submitted_at asc
    limit 10
  loop
    perform net.http_post(
      url     := 'https://rvlwltgneitthdecqpkt.supabase.co/functions/v1/analyze-submission',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := jsonb_build_object('record', jsonb_build_object('id', sub.id, 'org_id', sub.org_id))
    );
    perform pg_sleep(0.8);
  end loop;

  update task_submissions
  set ai_status = null
  where ai_status = 'analyzing' and status <> 'pending'
    and ai_started_at < now() - interval '10 minutes'
    and ai_started_at > now() - interval '6 hours';

  for sub in
    select id, org_id from task_submissions
    where ai_status is null and status <> 'pending'
      and ai_started_at is not null
      and ai_started_at < now() - interval '2 minutes'
      and ai_started_at > now() - interval '6 hours'
    order by ai_started_at asc
    limit 10
  loop
    perform net.http_post(
      url     := 'https://rvlwltgneitthdecqpkt.supabase.co/functions/v1/analyze-submission',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := jsonb_build_object('force', true, 'record', jsonb_build_object('id', sub.id, 'org_id', sub.org_id))
    );
    perform pg_sleep(0.8);
  end loop;
end;
$function$;

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
      AND status = 'pending'
      AND submitted_at < now() - interval '30 seconds'
      AND submitted_at > now() - interval '2 minutes'
    LIMIT 50
  LOOP
    PERFORM net.http_post(
      url := 'https://rvlwltgneitthdecqpkt.supabase.co/functions/v1/analyze-submission',
      body := json_build_object('record', json_build_object('id', r.id, 'org_id', r.org_id))::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
    PERFORM pg_sleep(0.5);
  END LOOP;
END;
$function$;
