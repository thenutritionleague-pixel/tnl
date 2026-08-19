-- Applied to production 19 Aug 2026 via MCP (already live).
--
-- Swap tracking for the "one swap per team" rule.
--
-- There is no swap audit table, so this reconstructs swaps from the two traces a
-- swap actually leaves:
--   * removeMember DELETES the leaving member's invite_whitelist row
--   * the replacement is added as a NEW invite_whitelist row, later
-- so for every team: (rows in its original import batch) + (rows added since)
-- always sums back to the roster size, and the count added since IS the number
-- of swaps that team has used. Verified against all 13 known swaps: every team
-- sums to exactly 10.
--
-- Departures are additionally named from team_transactions.kind='legacy_transfer',
-- which removeMember writes when the leaver had points. A member who left with
-- zero points leaves no name behind — the swap is still counted, `swapped_out`
-- is just null for that row.
create or replace view public.team_swap_report as
with first_batch as (
  select team_id, min(created_at) as t0
  from invite_whitelist
  where team_id is not null
  group by team_id
),
later as (
  select w.team_id, w.org_id, w.email, w.name, w.created_at, w.used_at
  from invite_whitelist w
  join first_batch f on f.team_id = w.team_id
  -- 10 minutes covers a bulk CSV import that straddles a minute boundary
  where w.created_at > f.t0 + interval '10 minutes'
)
select
  t.org_id,
  o.name  as org,
  t.id    as team_id,
  t.name  as team,
  count(later.email)                                    as swaps_used,
  count(later.email) filter (where later.used_at is null) as swaps_pending_login,
  max(later.created_at)::date                           as last_swap_date,
  string_agg(coalesce(later.name, later.email)
             || case when later.used_at is null then ' (not joined yet)' else '' end,
             ', ' order by later.created_at)            as swapped_in,
  (select string_agg(tt.source_user_name, ', ' order by tt.created_at)
     from team_transactions tt
    where tt.team_id = t.id and tt.kind = 'legacy_transfer')  as swapped_out,
  (select count(*) from team_members tm where tm.team_id = t.id) as current_members
from teams t
join organizations o on o.id = t.org_id
left join later on later.team_id = t.id
group by t.org_id, o.name, t.id, t.name;

grant select on public.team_swap_report to authenticated, service_role;
