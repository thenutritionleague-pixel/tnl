-- team_transactions was created with an RLS SELECT policy ('read same org')
-- but no underlying GRANT SELECT to the authenticated role. While
-- team_points_view ran as its creator (security_invoker=off, the Postgres
-- default for views), the missing grant was masked.
--
-- migration_033 set security_invoker=on on team_points_view to clear the
-- Supabase security advisor's CRITICAL warning. After that, the view ran as
-- the querying user and Postgres returned "permission denied for table
-- team_transactions" (SQLSTATE 42501) for every authenticated user trying
-- to read the leaderboard or any team detail screen.
--
-- This grant restores access. The existing RLS policy
-- ("team_transactions: read same org") continues to restrict rows to the
-- authenticated user's own org. Writes remain service-role-only.

GRANT SELECT ON public.team_transactions TO authenticated;
