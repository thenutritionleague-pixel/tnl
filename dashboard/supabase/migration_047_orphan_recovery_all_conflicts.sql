-- One un-insertable orphan was taking down the whole recovery pass.
--
-- recover_orphan_submissions() is the safety net for "submitted but missing":
-- the proof reached storage but the task_submissions insert never landed. It
-- re-creates the row from the storage object every 30 minutes.
--
-- Its insert named a single arbiter index:
--
--   on conflict (task_id, user_id, submitted_date) where (status <> 'rejected')
--
-- migration_035_team_tasks.sql then added a SECOND unique index,
-- task_submissions_one_per_team_per_day, on (task_id, team_id, submitted_date).
-- ON CONFLICT against one index gives no protection against a violation of a
-- different one, so the first team-task orphan whose team had already submitted
-- that day raised an uncaught 23505 -- and because that aborts the whole
-- function, EVERY other orphan in the batch went unrecovered too. One poison row
-- disabled the entire net. It failed this way at 13:00 on 21 Aug 2026.
--
-- Dropping the conflict target makes DO NOTHING apply to any unique index,
-- including partial ones and any index added later. A row that cannot be
-- inserted is now skipped instead of killing its batch, which is the behaviour a
-- safety net needs: recover everything recoverable, never fail closed.

CREATE OR REPLACE FUNCTION public.recover_orphan_submissions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- No conflict target on purpose: this must absorb a violation of ANY unique
    -- index on task_submissions, not just the per-member one. See header.
    on conflict do nothing
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end;
$function$;

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- Restore "on conflict (task_id, user_id, submitted_date) where (status <> 'rejected')
-- do nothing" -- but note that reintroduces the batch-killing failure above.
