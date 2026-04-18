-- ================================================================
-- Migration 024: Final fix for handle_leaderboard_change trigger
-- ================================================================
-- Root causes of previous failures:
-- 1. `set search_path = public` (added in 023) causes PostgreSQL to
--    try to resolve PL/pgSQL variables (v_challenge_id) as schema
--    objects before recognising them as variables → 42P01 error.
--    Fix: remove security definer + search_path, use no extras.
-- 2. Window function (rank() OVER) inside a PL/pgSQL SELECT INTO
--    subquery is fragile. Fix: use COUNT(*)+1 approach instead —
--    "rank = number of teams with more points + 1".
-- ================================================================

create or replace function public.handle_leaderboard_change()
returns trigger language plpgsql as $$
declare
  v_challenge_id  uuid;
  v_team_id       uuid;
  v_team_name     text;
  v_team_emoji    text;
  v_team_points   bigint;
  v_new_rank      int;
  v_prev_rank     int;
begin
  -- Only fire for task-awarded (non-manual) points
  if NEW.is_manual = true then return NEW; end if;

  -- Find the active challenge for this org
  select id into v_challenge_id
  from public.challenges
  where org_id = NEW.org_id and status = 'active'
  order by created_at desc
  limit 1;

  if v_challenge_id is null then return NEW; end if;

  -- Find the team this member belongs to
  select tm.team_id, t.name, t.emoji
  into   v_team_id, v_team_name, v_team_emoji
  from   public.team_members tm
  join   public.teams t on t.id = tm.team_id
  where  tm.user_id = NEW.user_id
    and  tm.org_id  = NEW.org_id
  limit 1;

  if v_team_id is null then return NEW; end if;

  -- Current total approved points for this team in the challenge
  select coalesce(sum(tk.points), 0)
  into   v_team_points
  from   public.task_submissions s
  join   public.tasks tk on tk.id = s.task_id
  join   public.team_members tm on tm.user_id = s.user_id
                               and tm.org_id  = s.org_id
                               and tm.team_id = v_team_id
  where  s.challenge_id = v_challenge_id
    and  s.org_id       = NEW.org_id
    and  s.status       = 'approved';

  -- Current rank = teams that scored MORE than this team + 1
  select count(*)::int + 1
  into   v_new_rank
  from (
    select tm.team_id, sum(tk.points) as pts
    from   public.task_submissions s
    join   public.tasks tk on tk.id = s.task_id
    join   public.team_members tm on tm.user_id = s.user_id
                                 and tm.org_id  = s.org_id
    where  s.challenge_id = v_challenge_id
      and  s.org_id       = NEW.org_id
      and  s.status       = 'approved'
    group  by tm.team_id
  ) all_teams
  where  all_teams.pts > v_team_points;

  -- Previous rank = teams that scored MORE than (current − this transaction) + 1
  select count(*)::int + 1
  into   v_prev_rank
  from (
    select tm.team_id, sum(tk.points) as pts
    from   public.task_submissions s
    join   public.tasks tk on tk.id = s.task_id
    join   public.team_members tm on tm.user_id = s.user_id
                                 and tm.org_id  = s.org_id
    where  s.challenge_id = v_challenge_id
      and  s.org_id       = NEW.org_id
      and  s.status       = 'approved'
    group  by tm.team_id
  ) all_teams
  where  all_teams.pts > (v_team_points - NEW.amount);

  -- Post a feed item only if rank improved
  if v_new_rank < v_prev_rank then
    insert into public.feed_items
      (org_id, type, title, content, challenge_id, is_auto_generated)
    values (
      NEW.org_id,
      'leaderboard_change',
      v_team_emoji || ' ' || v_team_name || ' moved up!',
      v_team_name || ' climbed from #' || v_prev_rank
        || ' to #' || v_new_rank || ' on the leaderboard.',
      v_challenge_id,
      true
    );
  end if;

  return NEW;
end;
$$;
