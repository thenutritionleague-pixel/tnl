-- Migration 009: Fix ambiguous "id" column in get_mobile_tasks RPC
-- Problem: PostgreSQL error code 42702 - column "id" was ambiguous because
-- the function returns a table with a column named "id" AND the inner SELECT
-- also references "organizations.id" without a table alias.
-- Fix: Add explicit table alias 'o' to the organizations lookup query.

drop function if exists get_mobile_tasks(uuid, uuid);
create or replace function get_mobile_tasks(p_team_id uuid, p_org_id uuid)
returns table (id uuid, challenge_id uuid, title text, description text, points int, week_number int, category text, icon text, is_active boolean, start_date date, end_date date)
language plpgsql security definer as $$
declare
  v_timezone text;
  v_local_today date;
begin
  -- FIX: use alias 'o' to avoid ambiguity with the returned 'id' column
  select o.timezone into v_timezone from organizations o where o.id = p_org_id;
  if not found or v_timezone is null then v_timezone := 'UTC'; end if;
  v_local_today := (current_timestamp at time zone v_timezone)::date;

  return query
  select t.id, t.challenge_id, t.title, t.description, t.points, t.week_number, t.category, t.icon, t.is_active, t.start_date, t.end_date
  from tasks t join challenges c on t.challenge_id = c.id
  where c.org_id = p_org_id and c.status = 'active' and c.manually_closed = false and t.is_active = true
    and ((t.start_date is not null and v_local_today >= t.start_date) or (t.start_date is null and v_local_today >= (c.start_date + ((t.week_number - 1) * 7))))
    and (t.end_date is null or v_local_today <= t.end_date)
    and (not exists (select 1 from challenge_teams ct where ct.challenge_id = c.id) or exists (select 1 from challenge_teams ct where ct.challenge_id = c.id and ct.team_id = p_team_id))
    and (not exists (select 1 from task_teams tt where tt.task_id = t.id) or exists (select 1 from task_teams tt where tt.task_id = t.id and tt.team_id = p_team_id));
end;
$$;
