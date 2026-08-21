-- Let a member replace their own proof while it is still undecided.
--
-- Today a member who uploads the wrong photo must wait for a rejection or ask an
-- admin. This lets them fix it themselves, under tight limits:
--
--   * their OWN submission only, checked against auth.uid() here and never
--     trusted from the client
--   * only while status = 'pending'. No points have been awarded yet, so nothing
--     is revoked, no ledger row moves, no team total changes. Every dangerous
--     path lives in points revocation and this design never enters it.
--   * the task's own day, in the org's timezone
--   * at most 2 replacements per submission-day, so the AI cannot be used as a
--     slot machine by swapping photos until one is approved
--
-- The old row is DELETED, not updated. An in-flight AI analysis writes its verdict
-- with .eq('id', <old id>); once that row is gone the write matches zero rows and
-- evaporates. That is what stops a verdict about the OLD photo landing on the NEW
-- one, with no version column and no locking.
--
-- ORDER MATTERS: delete before insert. task_submissions_one_per_day is a unique
-- INDEX on (task_id, user_id, submitted_date) where status <> 'rejected', and a
-- unique index cannot be deferred -- inserting first always raised 23505. Verified
-- against live data, not assumed. Deleting first is safe because the whole
-- function is one transaction: if the insert fails the delete rolls back with it,
-- so a member can never lose their proof and get nothing back. The file itself is
-- uploaded to storage BEFORE this is called, so nothing depends on the network
-- once the swap starts.
--
-- The old proof FILE is kept deliberately. recover_orphan_submissions only
-- recreates a submission when no row exists for that user+task+date, and the
-- replacement satisfies that, so the old file cannot be resurrected -- it stays
-- as evidence next to the audit row.

create table if not exists submission_replacements (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  user_id           uuid not null,
  task_id           uuid not null,
  submitted_date    date not null,
  old_submission_id uuid not null,
  new_submission_id uuid not null,
  old_proof_url     text,
  new_proof_url     text,
  old_ai_status     text,
  old_ai_feedback   text,
  replaced_at       timestamptz not null default now()
);

create index if not exists submission_replacements_lookup
  on submission_replacements (user_id, task_id, submitted_date);

comment on table submission_replacements is
  'Audit trail of member-initiated proof replacements. Doubles as the per-day counter that caps replacements at 2.';

create or replace function public.replace_own_submission(
  p_old_submission_id uuid,
  p_new_proof_url     text
)
returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  s task_submissions%rowtype; v_profile uuid; v_tz text; v_today date; v_used int; v_new_id uuid;
begin
  if p_new_proof_url is null or length(trim(p_new_proof_url)) = 0 then
    raise exception 'A new proof is required.' using errcode = '22023';
  end if;

  select id into v_profile from profiles where auth_id = auth.uid();
  if v_profile is null then raise exception 'Not signed in.' using errcode = '42501'; end if;

  -- FOR UPDATE: if the AI's verdict is landing at this instant, one waits for the
  -- other and the status re-check below decides who won.
  select * into s from task_submissions where id = p_old_submission_id for update;
  if not found then raise exception 'That submission no longer exists.' using errcode = 'P0002'; end if;
  if s.user_id <> v_profile then
    raise exception 'You can only replace your own submission.' using errcode = '42501'; end if;
  if s.status <> 'pending' then
    raise exception 'This has already been reviewed, so it can no longer be replaced.' using errcode = '55000'; end if;

  select coalesce(o.timezone,'UTC') into v_tz from organizations o where o.id = s.org_id;
  v_today := (current_timestamp at time zone v_tz)::date;
  if s.submitted_date <> v_today then
    raise exception 'Only today''s submission can be replaced.' using errcode = '55000'; end if;

  select count(*) into v_used from submission_replacements r
   where r.user_id=s.user_id and r.task_id=s.task_id and r.submitted_date=s.submitted_date;
  if v_used >= 2 then
    raise exception 'You have already replaced this twice today.' using errcode = '55000'; end if;

  insert into submission_replacements
    (org_id,user_id,task_id,submitted_date,old_submission_id,new_submission_id,
     old_proof_url,new_proof_url,old_ai_status,old_ai_feedback)
  values (s.org_id,s.user_id,s.task_id,s.submitted_date,s.id,s.id,
     s.proof_url,p_new_proof_url,s.ai_status,s.ai_feedback);

  delete from task_submissions where id = s.id;

  insert into task_submissions
    (task_id,challenge_id,user_id,org_id,submitted_at,submitted_date,status,proof_url,selected_tier_index)
  values (s.task_id,s.challenge_id,s.user_id,s.org_id,now(),s.submitted_date,
     'pending',p_new_proof_url,s.selected_tier_index)
  returning id into v_new_id;

  update submission_replacements set new_submission_id = v_new_id
   where old_submission_id = s.id and new_submission_id = s.id;

  return v_new_id;
end; $$;

grant execute on function public.replace_own_submission(uuid, text) to authenticated;
