-- ================================================================
-- Migration 023: Rewrite handle_leaderboard_change (v2)
-- ================================================================
-- Fixes in migration_022 were incomplete:
-- 1. `rank` is a SQL keyword — using it as a column alias then
--    selecting it bare (`select rank into ...`) confuses the parser.
--    Fixed: renamed alias to `team_rank`.
-- 2. The "previous rank" query joined `team_members tm2` to subtract
--    the current transaction's amount — but this created a cross
--    product that corrupted aggregation AND caused the PL/pgSQL
--    variable `v_challenge_id` to be misinterpreted as a relation.
--    Fixed: removed `tm2` join entirely; use `tm.team_id` in CASE.
-- 3. Added `set search_path = public` for safe trigger execution.
-- ================================================================

create or replace function public.handle_leaderboard_change()
returns trigger language plpgsql
security definer set search_path = public
as $$
declare
  v_challenge_id uuid;
  v_team_id      uuid;
  v_team_name    text;
  v_team_emoji   text;
  v_new_rank     int;
  v_prev_rank    int;
begin
  -- Only act on task-related (non-manual) point awards
  if NEW.is_manual = true then return NEW; end if;

  -- Find the active challenge for this org
  select c.id into v_challenge_id
  from public.challenges c
  where c.org_id = NEW.org_id and c.status = 'active'
  order by c.created_at desc
  limit 1;

  if v_challenge_id is null then return NEW; end if;

  -- Find the team this member belongs to
  select tm.team_id, t.name, t.emoji
  into v_team_id, v_team_name, v_team_emoji
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  where tm.user_id = NEW.user_id and tm.org_id = NEW.org_id
  limit 1;

  if v_team_id is null then return NEW; end if;

  -- Current rank of this team (after this insert)
  select team_rank into v_new_rank
  from (
    select
      tm.team_id,
      rank() over (order by sum(t.points) desc) as team_rank
    from public.task_submissions s
    join public.tasks t on t.id = s.task_id
    join public.team_members tm on tm.user_id = s.user_id and tm.org_id = s.org_id
    where s.challenge_id = v_challenge_id
      and s.org_id = NEW.org_id
      and s.status = 'approved'
    group by tm.team_id
  ) ranked
  where ranked.team_id = v_team_id;

  -- Previous rank (approximate: subtract this transaction's amount
  -- from the affected team before re-ranking)
  -- No tm2 join — use CASE on tm.team_id directly.
  select team_rank into v_prev_rank
  from (
    select
      tm.team_id,
      rank() over (
        order by
          sum(t.points) - (case when tm.team_id = v_team_id then NEW.amount else 0 end) desc
      ) as team_rank
    from public.task_submissions s
    join public.tasks t on t.id = s.task_id
    join public.team_members tm on tm.user_id = s.user_id and tm.org_id = s.org_id
    where s.challenge_id = v_challenge_id
      and s.org_id = NEW.org_id
      and s.status = 'approved'
    group by tm.team_id
  ) ranked
  where ranked.team_id = v_team_id;

  -- Post feed item only if rank improved
  if v_prev_rank is not null and v_new_rank < v_prev_rank then
    insert into public.feed_items (
      org_id, type, title, content, challenge_id, is_auto_generated
    ) values (
      NEW.org_id,
      'leaderboard_change',
      v_team_emoji || ' ' || v_team_name || ' moved up!',
      v_team_name || ' climbed from #' || v_prev_rank || ' to #' || v_new_rank || ' on the leaderboard.',
      v_challenge_id,
      true
    );
  end if;

  return NEW;
end;
$$;
