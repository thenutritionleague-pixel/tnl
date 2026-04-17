-- Migration 011: Fix RLS on challenges table so authenticated users can read active challenges.
-- Also creates a simple RPC to fetch the active challenge for an org, bypassing RLS complexity.

-- 1. Ensure RLS is enabled on challenges
alter table public.challenges enable row level security;

-- 2. Drop any existing select policies to avoid conflicts
drop policy if exists "allow_select_challenges" on public.challenges;
drop policy if exists "challenges_select" on public.challenges;

-- 3. Create a clean read-all policy for authenticated users
create policy "allow_select_challenges"
  on public.challenges
  for select to authenticated
  using (true);

-- 4. Create an RPC that returns the active challenge for a given org
--    This runs as SECURITY DEFINER (postgres role), bypassing RLS entirely.
drop function if exists get_active_challenge(uuid);
create or replace function get_active_challenge(p_org_id uuid)
returns table (
  id uuid,
  name text,
  status text,
  start_date date,
  end_date date,
  manually_closed boolean
)
language sql security definer as $$
  select id, name, status, start_date, end_date, manually_closed
  from public.challenges
  where org_id = p_org_id
    and status = 'active'
  order by created_at desc
  limit 1;
$$;

-- Grant execute to authenticated users
grant execute on function get_active_challenge(uuid) to authenticated;
