-- 071: the weekly champion announcement named the wrong team.
--
-- The cron ranked teams by sum(tasks.points) -- the task's BASE value. Tiered
-- tasks carry a base of 10 while members actually earn 100 or 200, and team
-- bonus points were not counted at all. Measured on 23 Aug 2026 it ranked a
-- 24th-place team 4th and led at #1 by only 170 points out of 14,460, so one
-- ordinary day of approvals could have handed the title to the wrong team on
-- results day, in front of 1,137 members.
--
-- Scored exactly like the leaderboard now: points_awarded for individual
-- approvals plus team_transactions, over the same week window. Teams level on
-- points are ALL returned -- a tie is never broken by sort order.
--
-- The announcement wrapper lives in 072 (this migration's first version of it
-- listed every tied team, which produced a 26-name title).
--
-- Cron rewired with:
--   select cron.alter_job(
--     (select jobid from cron.job where jobname='weekly-winner-announcement'),
--     command => 'select public.announce_weekly_champion();');

create or replace function public.weekly_champion_teams(
  p_challenge uuid, p_from date, p_to date)
returns table(team_id uuid, team_name text, team_emoji text, week_points bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with indiv as (
    select tm.team_id, sum(coalesce(s.points_awarded, 0))::bigint as pts
    from task_submissions s
    join team_members tm on tm.user_id = s.user_id and tm.org_id = s.org_id
    where s.status = 'approved'
      and coalesce(s.is_team_task, false) = false
      and s.challenge_id = p_challenge
      and s.submitted_date >= p_from
      and s.submitted_date <  p_to
    group by tm.team_id
  ),
  teamtx as (
    select tt.team_id, sum(tt.amount)::bigint as pts
    from team_transactions tt
    join teams tg on tg.id = tt.team_id
    join challenges c on c.id = p_challenge and c.org_id = tg.org_id
    where coalesce(tt.transaction_date, tt.created_at::date) >= p_from
      and coalesce(tt.transaction_date, tt.created_at::date) <  p_to
    group by tt.team_id
  ),
  totals as (
    select coalesce(i.team_id, x.team_id) as tid,
           coalesce(i.pts, 0) + coalesce(x.pts, 0) as pts
    from indiv i
    full join teamtx x on x.team_id = i.team_id
  )
  select tg.id, tg.name, tg.emoji, totals.pts
  from totals
  join teams tg on tg.id = totals.tid
  where totals.pts = (select max(pts) from totals)
    and totals.pts > 0
  order by tg.name;
$function$;
