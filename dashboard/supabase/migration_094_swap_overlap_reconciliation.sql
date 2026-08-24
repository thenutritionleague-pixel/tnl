-- Per-(task, day) record of what a departing member had earned, captured
-- before their submissions are deleted by a swap.
--
-- Without this there is no way to answer the only question that matters when a
-- team goes over the ceiling: did the replacement re-earn a day the leaver had
-- already banked? On 23-24 Aug that question could not be answered for Daksh
-- Mansinghka because his rows were already gone, so the correction had to be
-- inferred from the leaderboard instead of computed.
create table if not exists swap_transfer_breakdown (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  team_id uuid not null,
  departed_user_id uuid not null,
  departed_name text,
  departed_email text,
  task_id uuid not null,
  submitted_date date not null,
  points integer not null,
  transfer_transaction_id uuid,
  captured_at timestamptz not null default now()
);

create index if not exists swap_transfer_breakdown_team_idx
  on swap_transfer_breakdown (team_id, task_id, submitted_date);

comment on table swap_transfer_breakdown is
  'What each swapped-out member had earned, per task per day, captured at
   removal time. Lets reconcile_swap_overlap() detect a replacement re-earning
   a day the leaver already banked -- the exact double-count that pushed
   Gurugram over the maximum three times on results night.';

-- Deducts a team's duplicate slot-days: cases where the departed member had
-- already earned a (task, day) AND someone who joined after them earned the
-- same (task, day). One roster slot, one set of points.
create or replace function public.reconcile_swap_overlap(p_org_id uuid)
returns table(team_id uuid, duplicate_days integer, deducted integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with dupes as (
    select b.team_id as tid, b.task_id, b.submitted_date, max(b.points) as pts
    from swap_transfer_breakdown b
    join team_members tm
      on tm.team_id = b.team_id
     and tm.org_id  = b.org_id
     and tm.joined_at > b.captured_at        -- the replacement, not an original
    join task_submissions ts
      on ts.user_id        = tm.user_id
     and ts.org_id         = b.org_id
     and ts.task_id        = b.task_id
     and ts.submitted_date = b.submitted_date
     and ts.status         = 'approved'
    where b.org_id = p_org_id
      and not exists (
        select 1 from team_transactions tt
        where tt.team_id = b.team_id
          and tt.kind = 'swap_overlap'
          and tt.reason like '%' || b.task_id::text || '%' || b.submitted_date::text || '%'
      )
    group by b.team_id, b.task_id, b.submitted_date
  ),
  ins as (
    insert into team_transactions (team_id, org_id, amount, reason, source_user_name, kind)
    select d.tid, p_org_id, -d.pts,
      'Swap overlap: the replacement re-earned a day the departed member had already banked'
      || ' (task ' || d.task_id::text || ', ' || d.submitted_date::text || ').'
      || ' One roster slot cannot score the same day twice.',
      'System correction', 'swap_overlap'
    from dupes d
    returning team_transactions.team_id, amount
  )
  select i.team_id, count(*)::integer, sum(-i.amount)::integer
  from ins i group by i.team_id;
end;
$function$;
