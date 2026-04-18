-- ================================================================
-- Migration 022: Fix ambiguous `team_id` in handle_leaderboard_change
-- ================================================================
-- Bug: bare `team_id` in GROUP BY and outer WHERE is ambiguous when
-- team_members is joined as both `tm` and `tm2`.
-- Fix: qualify all bare `team_id` references as `tm.team_id`.
-- ================================================================

create or replace function handle_leaderboard_change()
returns trigger language plpgsql as $$
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

  -- Find the active challenge for this org (latest active one)
  select c.id into v_challenge_id
  from challenges c
  where c.org_id = NEW.org_id and c.status = 'active'
  order by c.created_at desc
  limit 1;

  if v_challenge_id is null then return NEW; end if;

  -- Find the team this member belongs to
  select tm.team_id, t.name, t.emoji
  into v_team_id, v_team_name, v_team_emoji
  from team_members tm
  join teams t on t.id = tm.team_id
  where tm.user_id = NEW.user_id and tm.org_id = NEW.org_id
  limit 1;

  if v_team_id is null then return NEW; end if;

  -- Current rank of this team (after this insert)
  select rank into v_new_rank from (
    select
      tm.team_id,
      rank() over (order by sum(t.points) desc) as rank
    from task_submissions s
    join tasks t on t.id = s.task_id
    join team_members tm on tm.user_id = s.user_id and tm.org_id = s.org_id
    where s.challenge_id = v_challenge_id
      and s.org_id = NEW.org_id
      and s.status = 'approved'
    group by tm.team_id
  ) ranked
  where ranked.team_id = v_team_id;

  -- Rank before this point (approximate: subtract this transaction)
  select rank into v_prev_rank from (
    select
      tm.team_id,
      rank() over (order by
        sum(t.points) - (case when tm2.team_id = v_team_id then NEW.amount else 0 end) desc
      ) as rank
    from task_submissions s
    join tasks t on t.id = s.task_id
    join team_members tm on tm.user_id = s.user_id and tm.org_id = s.org_id
    join team_members tm2 on tm2.team_id = v_team_id and tm2.org_id = NEW.org_id
    where s.challenge_id = v_challenge_id
      and s.org_id = NEW.org_id
      and s.status = 'approved'
    group by tm.team_id
  ) ranked
  where ranked.team_id = v_team_id;

  -- Post feed item only if rank actually improved
  if v_prev_rank is not null and v_new_rank < v_prev_rank then
    insert into feed_items (
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
