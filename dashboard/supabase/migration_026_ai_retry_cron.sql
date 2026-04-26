-- Retry function: resets stuck 'analyzing' rows and re-fires the edge function
-- for submissions that never got triggered (pg_net silent failure).
--
-- Covers two failure modes:
--   1. ai_status stuck in 'analyzing' >10 min → edge function crashed/timed out
--   2. ai_status IS NULL >2 min → initial pg_net trigger failed silently
--
-- Scheduled via pg_cron every 5 minutes (job id 14).

create or replace function public.retry_stuck_ai_submissions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sub record;
begin
  -- Reset rows stuck in 'analyzing' for >10 minutes (edge function crashed/timed out)
  update task_submissions
  set ai_status = null
  where ai_status = 'analyzing'
    and status = 'pending'
    and submitted_at < now() - interval '10 minutes';

  -- Re-fire edge function for rows where initial pg_net call failed silently
  for sub in
    select id, org_id
    from task_submissions
    where ai_status is null
      and status = 'pending'
      and submitted_at < now() - interval '2 minutes'
    order by submitted_at asc
    limit 20
  loop
    perform net.http_post(
      url     := 'https://rvlwltgneitthdecqpkt.supabase.co/functions/v1/analyze-submission',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := jsonb_build_object(
        'record', jsonb_build_object('id', sub.id, 'org_id', sub.org_id)
      )
    );
  end loop;
end;
$$;

-- Schedule every 5 minutes
select cron.schedule(
  'retry-stuck-ai-submissions',
  '*/5 * * * *',
  $$select public.retry_stuck_ai_submissions()$$
);
