-- Let an admin close out a duplicate group, and reflect Approvals decisions here.
--
-- The Duplicates page is a shortlist, and most of it is noise: of 12 groups
-- hashed on 22 Aug only 1 was byte-identical, the other 11 were different files
-- that merely look alike. Without somewhere to record "checked, this is fine",
-- the same 130-odd groups get re-read every day and the real ones are lost in
-- the pile.
--
-- Two changes:
--   1. duplicate_group_reviews stores a verdict per fingerprint+task, which is
--      what identifies a group, so it survives later submissions joining it.
--   2. a group stops being flagged once only one non-rejected row remains --
--      so rejecting one of a pair in Approvals clears it here automatically,
--      without the admin having to act in two places.

create table if not exists duplicate_group_reviews (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  proof_hash     text not null,
  task_title     text not null,
  verdict        text not null check (verdict in ('safe','confirmed')),
  note           text,
  reviewed_by    uuid,
  reviewed_email text,
  reviewed_at    timestamptz not null default now(),
  unique (org_id, proof_hash, task_title)
);

comment on table duplicate_group_reviews is
  'Admin verdicts on duplicate-proof groups, so a checked group stops reappearing.';

drop function if exists public.get_duplicate_proof_groups(uuid);

create or replace function public.get_duplicate_proof_groups(p_org_id uuid)
returns table (
  proof_hash text, task_title text, submission_id uuid, user_id uuid,
  member_name text, team_name text, submitted_date date, status text,
  points_awarded integer, proof_url text, file_bytes bigint,
  review_verdict text, review_note text, reviewed_email text, reviewed_at timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  with hashed as (
    select s.id, s.user_id, s.proof_hash, s.proof_url, s.submitted_date,
           s.status, s.points_awarded, t.title as task_title,
           (select coalesce(sum(length(replace(('x'||substr(s.proof_hash,i,1))::bit(4)::text,'0',''))),0)
              from generate_series(1,16) i) as bits
    from task_submissions s
    join tasks t on t.id = s.task_id
    where s.org_id = p_org_id and s.proof_hash is not null and t.proof_type = 'image'
  ),
  real_hashes as (select * from hashed where bits >= 8),
  dupe_keys as (
    select proof_hash, task_title from real_hashes
    group by proof_hash, task_title
    having count(*) filter (where status <> 'rejected') > 1
  )
  select r.proof_hash, r.task_title, r.id, r.user_id,
         p.name, coalesce(tm_t.name, '—'), r.submitted_date, r.status,
         r.points_awarded, r.proof_url, (o.metadata->>'size')::bigint,
         dr.verdict, dr.note, dr.reviewed_email, dr.reviewed_at
  from real_hashes r
  join dupe_keys d on d.proof_hash = r.proof_hash and d.task_title = r.task_title
  join profiles p on p.id = r.user_id
  left join team_members tm on tm.user_id = r.user_id and tm.org_id = p_org_id
  left join teams tm_t on tm_t.id = tm.team_id
  left join storage.objects o on o.bucket_id = 'task-proofs' and o.name = r.proof_url
  left join duplicate_group_reviews dr
         on dr.org_id = p_org_id and dr.proof_hash = r.proof_hash and dr.task_title = r.task_title
  order by r.proof_hash, r.submitted_date;
$$;

grant execute on function public.get_duplicate_proof_groups(uuid) to service_role;
