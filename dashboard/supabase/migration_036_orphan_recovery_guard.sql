-- Applied to production 19 Aug 2026 via MCP (already live).
--
-- The recovery cron exists for ONE case: the upload succeeded but the insert
-- never landed, so the member has NO row for that task that day and their proof
-- would otherwise be lost.
--
-- Its guard skipped only NON-rejected rows, which misreads a much more common
-- situation. Resubmitting REPLACES proof_url on the existing row, so the
-- previous photo is left in storage with nothing pointing at it. To this cron
-- that is indistinguishable from a lost submission. For any member whose latest
-- attempt ended rejected the guard passed, and their superseded photo was
-- re-inserted as a fresh `pending` row.
--
-- That phantom is non-rejected, so it takes the one-per-day slot, and every
-- later resubmit dies on task_submissions_one_per_day (23505) — surfaced to the
-- member as a raw Postgres error. Suvi Raj Singh hit it 24 times in one hour on
-- 19 Aug, unable to resubmit at all. 6 more members were queued to hit it at the
-- next half-hourly run.
--
-- Correct guard: if the member has ANY row for that task that day, their
-- attempt is already recorded and there is nothing to recover. A rejected row
-- never blocks a resubmit, so skipping that case strands nobody.
create or replace function public.recover_orphan_submissions()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_count int;
begin
  with orphans as (
    select o.name,
      substring(o.name from '^proofs/([0-9a-fA-F-]{36})/')::uuid as uid,
      substring(o.name from '^proofs/[0-9a-fA-F-]{36}/([0-9a-fA-F-]{36})_')::uuid as tid,
      to_timestamp((substring(o.name from '_([0-9]{10,13})\.'))::bigint / 1000.0) as ts
    from storage.objects o
    where o.bucket_id = 'task-proofs'
      and o.name ~ '^proofs/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}_[0-9]+'
      and o.created_at < now() - interval '30 minutes'
      and not exists (select 1 from task_submissions s where s.proof_url = o.name)
  ),
  recoverable as (
    select orph.uid, orph.tid, orph.ts, t.challenge_id, p.org_id, orph.name
    from orphans orph
    join profiles p on p.id = orph.uid
    join organizations og on og.id = p.org_id
    join tasks t on t.id = orph.tid
    join challenges c on c.id = t.challenge_id and c.status = 'active'
    where not exists (
      select 1 from task_submissions s
      where s.user_id = orph.uid and s.task_id = orph.tid
        and s.submitted_date = (orph.ts at time zone coalesce(og.timezone,'UTC'))::date
      -- no status filter: any existing row means the attempt is already recorded
    )
    limit 100
  ),
  ins as (
    insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, status, proof_url)
    select tid, challenge_id, uid, org_id, ts, 'pending', name
    from recoverable
    on conflict (task_id, user_id, submitted_date) where (status <> 'rejected') do nothing
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end;
$function$;
