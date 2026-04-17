-- Migration 015: Fix get_mobile_tasks to show ALL tasks for active challenge
--
-- Problem: The RPC was progressive-unlocking by week:
--   - Week 1 tasks visible immediately
--   - Week 2 tasks unlock on day 7 of challenge
--   - Week 3 tasks unlock on day 14, etc.
--
-- This means when the challenge is newly started, users only see Week 1 tasks.
-- The admin already controls which tasks are in which week via the dashboard.
-- The mobile should show ALL active tasks in the active challenge, not gate by date.
--
-- Fix: Remove the start_date / week_number date gate.
--

drop function if exists get_mobile_tasks(uuid, uuid);
create or replace function get_mobile_tasks(p_team_id uuid, p_org_id uuid)
returns table (
  id           uuid,
  challenge_id uuid,
  title        text,
  description  text,
  points       int,
  week_number  int,
  category     text,
  icon         text,
  is_active    boolean,
  start_date   date,
  end_date     date
)
language plpgsql security definer as $$
begin
  return query
  select
    t.id,
    t.challenge_id,
    t.title,
    t.description,
    t.points,
    t.week_number,
    t.category,
    t.icon,
    t.is_active,
    t.start_date,
    t.end_date
  from tasks t
  join challenges c on t.challenge_id = c.id
  where
    c.org_id = p_org_id
    and c.status = 'active'
    and c.manually_closed = false
    and t.is_active = true
    -- Team scope: show task if no team restriction, or if the user's team is listed
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

-- VERIFY: call this with a real team_id and org_id
-- select * from get_mobile_tasks('<team_id>'::uuid, '<org_id>'::uuid);
-- Should now return all active tasks (all weeks) for the active challenge.
