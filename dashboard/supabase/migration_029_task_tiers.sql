-- Migration 029: Tiered points for tasks
-- Adds points_tiers (JSONB) to tasks and selected_tier_index to task_submissions
-- Backward compatible: null means fixed points (existing behaviour unchanged)

-- 1. Add tier config to tasks
alter table public.tasks
  add column if not exists points_tiers jsonb default null;

-- 2. Store which tier the member claimed at submission time
alter table public.task_submissions
  add column if not exists selected_tier_index int default null;

-- 3. Update get_mobile_tasks RPC to return points_tiers
create or replace function public.get_mobile_tasks(p_team_id uuid, p_org_id uuid)
returns table (
  id uuid, challenge_id uuid, title text, description text,
  points integer, points_tiers jsonb, week_number integer, category text, icon text,
  is_active boolean, start_date date, end_date date
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  select
    t.id, t.challenge_id, t.title, t.description,
    t.points, t.points_tiers, t.week_number, t.category, t.icon,
    t.is_active, t.start_date, t.end_date
  from tasks t
  join challenges c on t.challenge_id = c.id
  where
    c.org_id = p_org_id
    and c.status = 'active'
    and c.manually_closed = false
    and t.is_active = true
    and (
      not exists (select 1 from challenge_teams ct where ct.challenge_id = c.id)
      or exists  (select 1 from challenge_teams ct where ct.challenge_id = c.id and ct.team_id = p_team_id)
    )
    and (
      not exists (select 1 from task_teams tt where tt.task_id = t.id)
      or exists  (select 1 from task_teams tt where tt.task_id = t.id and tt.team_id = p_team_id)
    )
  order by t.week_number, t.created_at;
end;
$$;

revoke execute on function public.get_mobile_tasks(uuid, uuid) from anon;
grant  execute on function public.get_mobile_tasks(uuid, uuid) to authenticated;
