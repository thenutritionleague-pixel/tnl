-- The stuck-analyzing reset compared against submitted_at (original upload
-- time, often hours old by the time a video is actually reviewed) instead of
-- ai_started_at (when THIS attempt began). Result: any analysis on a
-- submission whose submitted_at was already >10min old got its claim yanked
-- within ~1 minute of starting, no matter how fresh the attempt actually was.
-- Caught live: a forced re-check got reset mid-flight at 53 seconds in.
-- Matches the same fix already applied to the retry-budget calculation
-- elsewhere in this pipeline -- this one spot was missed.
create or replace function public.retry_stuck_ai_submissions()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare sub record;
begin
  update task_submissions
  set ai_status = 'needs_review',
      ai_feedback = 'Video service could not deliver this file after repeated attempts — needs manual look.'
  where status = 'pending'
    and ai_status is null
    and ai_feedback = 'Video still processing — will retry.'
    and submitted_at < now() - interval '15 minutes';

  update task_submissions
  set ai_status = 'needs_review',
      ai_feedback = 'AI review could not complete after repeated attempts over the last hour — needs manual look.'
  where status = 'pending'
    and (ai_status = 'analyzing' or ai_status is null)
    and submitted_at < now() - interval '60 minutes';

  update task_submissions
  set ai_status = null
  where ai_status = 'analyzing' and status = 'pending'
    and coalesce(ai_started_at, submitted_at) < now() - interval '10 minutes'
    and submitted_at > now() - interval '6 hours';

  for sub in
    select id, org_id from task_submissions
    where ai_status is null and status = 'pending'
      and submitted_at < now() - interval '2 minutes'
      and submitted_at > now() - interval '6 hours'
    order by submitted_at asc
    limit 30
  loop
    perform net.http_post(
      url     := 'https://rvlwltgneitthdecqpkt.supabase.co/functions/v1/analyze-submission',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := jsonb_build_object('record', jsonb_build_object('id', sub.id, 'org_id', sub.org_id))
    );
    perform pg_sleep(0.5);
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
    limit 30
  loop
    perform net.http_post(
      url     := 'https://rvlwltgneitthdecqpkt.supabase.co/functions/v1/analyze-submission',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := jsonb_build_object('force', true, 'record', jsonb_build_object('id', sub.id, 'org_id', sub.org_id))
    );
    perform pg_sleep(0.5);
  end loop;
end;
$function$;
