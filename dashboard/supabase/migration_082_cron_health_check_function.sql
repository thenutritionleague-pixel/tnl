-- 082: the dashboard's pipeline-health banner just started checking
-- cron.job_run_details directly and immediately false-alarmed "The AI retry
-- job has stopped running" while it was running fine, once a minute, proven
-- by real verdicts landing the whole time. Root cause: service_role (what the
-- dashboard's admin client authenticates as) has no USAGE on the cron schema
-- at all -- only postgres does. The query has always failed silently; it was
-- dead, unused data before today, so nothing ever depended on it actually
-- working. Making it load-bearing exposed a permission gap that was invisible
-- until now.
--
-- Fix: a SECURITY DEFINER function owned by postgres, so it runs with
-- postgres's privileges regardless of who calls it. The dashboard calls this
-- by RPC instead of querying cron.job_run_details directly.
create or replace function public.get_cron_job_health(p_jobname text)
returns table(last_run timestamptz, run_status text)
language sql
security definer
set search_path = public
as $function$
  select jrd.start_time, jrd.status
  from cron.job_run_details jrd
  join cron.job j on j.jobid = jrd.jobid
  where j.jobname = p_jobname
  order by jrd.start_time desc
  limit 1;
$function$;

grant execute on function public.get_cron_job_health(text) to service_role, authenticated;
