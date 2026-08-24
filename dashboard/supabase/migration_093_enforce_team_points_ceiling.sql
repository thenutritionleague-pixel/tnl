-- A team can never legitimately exceed the sum of what its ten members could
-- earn plus team-wide bonuses. Swap transfers break that invariant: a
-- departing member's total is added to the team while their replacement earns
-- their own points, giving the team an effective eleventh slot. Gurugram
-- crossed the ceiling three times on results night, each time after a
-- perfectly legitimate approval, and each time it had to be caught by a member
-- noticing and reported by hand.
--
-- Ceiling for this event computed from the task definitions: max per member
-- 4,160 (every task, every day, top tier) x 10 = 41,600, + Squad Drop 1,000
-- + Early Bird 50 = 42,650.
--
-- Deliberately conservative: only ever removes the exact excess, never touches
-- a team at or under the cap, and writes a fully explained ledger row rather
-- than editing anything that already exists.
create or replace function public.enforce_team_points_ceiling(p_org_id uuid)
returns table(team_id uuid, team_name text, was integer, corrected_by integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_max integer;
begin
  select
    coalesce(sum((t.end_date - t.start_date + 1) *
      coalesce((select max((x->>'points')::int) from jsonb_array_elements(t.points_tiers) x), t.points))
      filter (where t.submission_scope = 'member'), 0) * 10
    + coalesce(sum(coalesce((select max((x->>'points')::int) from jsonb_array_elements(t.points_tiers) x), t.points))
      filter (where t.submission_scope = 'team'), 0)
    + 50   -- Early Bird
  into v_max
  from tasks t
  join challenges c on c.id = t.challenge_id
  where c.org_id = p_org_id and t.is_active = true and c.status = 'active';

  if v_max is null or v_max <= 0 then return; end if;

  return query
  with over as (
    select v.team_id as tid, tm.name as tname, v.total_points as pts, v.total_points - v_max as excess
    from team_points_view v
    join teams tm on tm.id = v.team_id
    where tm.org_id = p_org_id and v.total_points > v_max
  ),
  ins as (
    insert into team_transactions (team_id, org_id, amount, reason, source_user_name, kind)
    select o.tid, p_org_id, -o.excess,
      'Automatic ceiling correction: team was ' || o.pts || ' against a computed maximum of ' || v_max
      || ' (ten members at top tier for every task/day, plus team tasks and Early Bird). Teams exceed this only'
      || ' through mid-event swap transfers, which add a departing member''s total on top of ten members'' worth.',
      'System correction', 'admin_bonus'
    from over o
    returning team_id, amount
  )
  select o.tid, o.tname, o.pts::integer, i.amount::integer
  from over o join ins i on i.team_id = o.tid;
end;
$function$;

-- Runs every 3 minutes so an impossible score can never sit on the public
-- leaderboard long enough for a member to screenshot it again.
select cron.schedule(
  'enforce-team-points-ceiling',
  '*/3 * * * *',
  $$select public.enforce_team_points_ceiling('d13747ac-27b6-45d0-8531-416c54dab98c')$$
);
