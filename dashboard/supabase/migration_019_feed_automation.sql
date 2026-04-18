-- ================================================================
-- Migration 019: Feed Automation — Milestones, Challenge Events,
--                Leaderboard Changes, Weekly Winner, Daily Reminder
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- 1. MILESTONE TRIGGER
-- Fires when profiles.total_points crosses 100 / 250 / 500 / 1000
-- ────────────────────────────────────────────────────────────────
create or replace function handle_milestone_reached()
returns trigger language plpgsql as $$
declare
  v_thresholds int[] := array[100, 250, 500, 1000];
  v_threshold  int;
  v_emoji      text;
begin
  foreach v_threshold in array v_thresholds loop
    -- Crossed this threshold on this update?
    if OLD.total_points < v_threshold and NEW.total_points >= v_threshold then
      v_emoji := case v_threshold
        when 100  then '🌱'
        when 250  then '🥦'
        when 500  then '🔥'
        when 1000 then '🏆'
        else '⭐'
      end;
      insert into feed_items (
        org_id, type, title, content, author_id, is_auto_generated
      ) values (
        NEW.org_id,
        'milestone',
        v_emoji || ' Milestone Reached!',
        NEW.name || ' just hit ' || v_threshold || ' points — keep it up!',
        NEW.id,
        true
      );
    end if;
  end loop;
  return NEW;
end;
$$;

drop trigger if exists on_milestone_reached on profiles;
create trigger on_milestone_reached
  after update of total_points on profiles
  for each row
  when (NEW.total_points > OLD.total_points)
  execute function handle_milestone_reached();


-- ────────────────────────────────────────────────────────────────
-- 2. CHALLENGE START / END TRIGGER
-- Fires when challenges.status changes to 'active' or 'completed'
-- ────────────────────────────────────────────────────────────────
create or replace function handle_challenge_status_change()
returns trigger language plpgsql as $$
begin
  if OLD.status = 'upcoming' and NEW.status = 'active' then
    insert into feed_items (
      org_id, type, title, content, challenge_id, is_auto_generated
    ) values (
      NEW.org_id,
      'announcement',
      '🚀 Challenge Started!',
      'The challenge "' || NEW.name || '" has just kicked off. Get moving!',
      NEW.id,
      true
    );
  elsif OLD.status = 'active' and NEW.status = 'completed' then
    insert into feed_items (
      org_id, type, title, content, challenge_id, is_auto_generated
    ) values (
      NEW.org_id,
      'announcement',
      '🏁 Challenge Completed!',
      'The challenge "' || NEW.name || '" has ended. Check the leaderboard for final results!',
      NEW.id,
      true
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists on_challenge_status_change on challenges;
create trigger on_challenge_status_change
  after update of status on challenges
  for each row execute function handle_challenge_status_change();


-- ────────────────────────────────────────────────────────────────
-- 3. TEAM LEADERBOARD CHANGE TRIGGER
-- Fires after a points_transaction INSERT.
-- Computes team rank before/after within the same challenge and
-- posts a feed item if any team moves up or down by at least 1.
-- Uses a snapshot approach: compares ranks after this insert vs.
-- the previous transaction (optimistic, best-effort).
-- ────────────────────────────────────────────────────────────────
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

drop trigger if exists on_leaderboard_change on points_transactions;
create trigger on_leaderboard_change
  after insert on points_transactions
  for each row execute function handle_leaderboard_change();


-- ────────────────────────────────────────────────────────────────
-- 4. pg_cron: Weekly Winner Announcement (every Monday 9 AM UTC)
-- Posts top team of the previous week for each active challenge.
-- ────────────────────────────────────────────────────────────────
select cron.schedule(
  'weekly-winner-announcement',
  '0 9 * * 1',
  $$
    insert into feed_items (org_id, type, title, content, challenge_id, is_auto_generated)
    select
      c.org_id,
      'achievement',
      '🏆 Weekly Champion: ' || t.emoji || ' ' || t.name,
      t.name || ' earned the most points this week. Amazing effort — keep pushing!',
      c.id,
      true
    from challenges c
    join (
      select
        s.challenge_id,
        tm.team_id,
        sum(t.points) as week_points,
        row_number() over (
          partition by s.challenge_id
          order by sum(t.points) desc
        ) as rn
      from task_submissions s
      join tasks t on t.id = s.task_id
      join team_members tm on tm.user_id = s.user_id and tm.org_id = s.org_id
      where s.status = 'approved'
        and s.submitted_at >= date_trunc('week', current_timestamp) - interval '7 days'
        and s.submitted_at <  date_trunc('week', current_timestamp)
      group by s.challenge_id, tm.team_id
    ) weekly on weekly.challenge_id = c.id and weekly.rn = 1
    join teams t on t.id = weekly.team_id
    where c.status = 'active';
  $$
);


-- ────────────────────────────────────────────────────────────────
-- 5. pg_cron: Daily Motivation Reminder (every day 8 AM UTC)
-- Posts a daily reminder for all orgs that have an active challenge.
-- ────────────────────────────────────────────────────────────────
select cron.schedule(
  'daily-activity-reminder',
  '0 8 * * *',
  $$
    insert into feed_items (org_id, type, title, content, challenge_id, is_auto_generated)
    select
      c.org_id,
      'announcement',
      '🌟 New day, new points!',
      'Don''t forget to complete today''s tasks. Every submission counts toward your team''s score!',
      c.id,
      true
    from challenges c
    where c.status = 'active';
  $$
);
