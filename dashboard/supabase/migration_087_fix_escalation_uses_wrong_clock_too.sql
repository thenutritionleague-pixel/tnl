-- Same bug as migration_086, in two sibling blocks that got missed: both
-- escalation rules checked submitted_at (original upload time) instead of
-- how long the CURRENT attempt has actually been running. Result: a fresh
-- reanalyze on anything whose original submission was already old got killed
-- and escalated within one cron cycle, before AI had a real chance -- proven
-- live, a forced re-check was escalated back to needs_review 21 seconds in,
-- even though the underlying analysis had already (or went on to) complete
-- successfully in the background.
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
