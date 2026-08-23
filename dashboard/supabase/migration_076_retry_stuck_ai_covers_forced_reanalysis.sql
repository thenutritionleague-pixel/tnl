-- 076: retry_stuck_ai_submissions must also rescue a stuck FORCED re-analysis.
--
-- Companion to the analyze-submission fix that anchors retry budget on
-- ai_started_at instead of submitted_at for a forced re-check (reanalyze_submission).
-- That fix alone is not enough: when a transient error leaves ai_status = null on
-- a forced re-check, the row's status is already 'approved'/'rejected', not
-- 'pending' -- so the existing sweep below, which only ever looks at
-- status = 'pending', would never see it again. The row would sit in a silent
-- null-ai_status limbo forever, invisible to admin and to every cron.
--
-- Second sweep, scoped to exactly that case: status <> 'pending', clocked on
-- ai_started_at (stamped fresh by reanalyze_submission on every forced check,
-- never by a first-time submission). Retried WITH force:true, since the row is
-- already decided and analyze-submission's guard would otherwise discard the
-- verdict silently (see the `forced` check in the shared-write section).
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
  end loop;
end;
$function$;
