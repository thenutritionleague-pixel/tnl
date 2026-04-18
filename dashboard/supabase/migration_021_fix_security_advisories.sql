-- ================================================================
-- Migration 021: Fix Supabase Security Advisor issues
-- Issues fixed:
--   1. organizations — RLS not enabled (policy existed but RLS was off)
--   2. admin_users   — RLS not enabled
--   3. task_teams    — RLS not enabled + missing policy
--   4. team_points_view      — SECURITY DEFINER → SECURITY INVOKER
--   5. member_week_points_view — SECURITY DEFINER → SECURITY INVOKER
--
-- SAFE TO RUN: Dashboard uses service role (bypasses RLS).
--              Mobile authenticated queries are covered by existing policies.
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- 1. ORGANIZATIONS — enable RLS (policy "allow_select_orgs" already exists)
-- ────────────────────────────────────────────────────────────────
alter table public.organizations enable row level security;

-- Ensure canonical policy exists (idempotent via IF NOT EXISTS)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'organizations'
      and policyname = 'org: read own org'
  ) then
    execute $p$
      create policy "org: read own org"
        on public.organizations for select
        to authenticated
        using (id = auth_user_org_id())
    $p$;
  end if;
end$$;

-- ────────────────────────────────────────────────────────────────
-- 2. ADMIN USERS — enable RLS (no mobile policies needed;
--    dashboard uses service role which bypasses RLS)
-- ────────────────────────────────────────────────────────────────
alter table public.admin_users enable row level security;

-- ────────────────────────────────────────────────────────────────
-- 3. TASK TEAMS — enable RLS + add read policy for authenticated users
--    (mobile doesn't query this table directly; dashboard uses service role)
-- ────────────────────────────────────────────────────────────────
alter table public.task_teams enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'task_teams'
      and policyname = 'task_teams: read via task org'
  ) then
    execute $p$
      create policy "task_teams: read via task org"
        on public.task_teams for select
        to authenticated
        using (
          exists (
            select 1 from public.tasks tk
            join public.challenges c on c.id = tk.challenge_id
            where tk.id = task_id
              and c.org_id = auth_user_org_id()
          )
        )
    $p$;
  end if;
end$$;

-- ────────────────────────────────────────────────────────────────
-- 4 & 5. Fix SECURITY DEFINER views → SECURITY INVOKER
--
-- Adding WITH (security_invoker = on) makes the view execute with
-- the querying user's permissions, so RLS on underlying tables
-- applies. Without it, views run as the owner (postgres/superuser)
-- and bypass RLS entirely.
--
-- Both views join tables that already have correct RLS policies
-- for authenticated users, so mobile queries are unaffected.
-- ────────────────────────────────────────────────────────────────

-- team_points_view
drop view if exists public.team_points_view;
create view public.team_points_view
with (security_invoker = on)
as
select
  tm.team_id,
  s.challenge_id,
  coalesce(sum(t.points), 0)::int as total_points
from public.team_members tm
left join public.task_submissions s
  on s.user_id = tm.user_id
  and s.org_id = tm.org_id
  and s.status = 'approved'
left join public.tasks t on t.id = s.task_id
group by tm.team_id, s.challenge_id;

-- member_week_points_view
drop view if exists public.member_week_points_view;
create view public.member_week_points_view
with (security_invoker = on)
as
select
  s.user_id,
  s.challenge_id,
  tm.team_id,
  (floor((s.submitted_at::date - c.start_date) / 7.0) + 1)::int as week_number,
  sum(t.points)::int as points
from public.task_submissions s
join public.tasks t on t.id = s.task_id
join public.challenges c on c.id = s.challenge_id
join public.team_members tm
  on tm.user_id = s.user_id
  and tm.org_id = s.org_id
where s.status = 'approved'
group by
  s.user_id,
  s.challenge_id,
  tm.team_id,
  (floor((s.submitted_at::date - c.start_date) / 7.0) + 1)::int;

-- Grant access to the recreated views
grant select on public.team_points_view to authenticated;
grant select on public.member_week_points_view to authenticated;
