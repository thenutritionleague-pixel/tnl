-- 073: the feed was readable across every org.
--
-- allow_select_feed granted SELECT to `authenticated` with USING (true), so any
-- signed-in member could read every feed_items row in the database, including
-- the finished Kanpur and Gurugram events. Verified on 23 Aug 2026 by signing
-- in as an ordinary National member over PostgREST and reading Kanpur's feed:
-- "🚀 Challenge Started!", "🌟 New day, new points!". Feed rows carry member
-- names and what each person completed.
--
-- Every other member-facing table is row-scoped with org_id = auth_user_org_id().
-- This one never was. Both apps already filter by org_id -- the mobile query and
-- its realtime subscription both pass .eq('org_id', orgId), and the dashboard
-- uses the service role -- so scoping the policy removes nothing a legitimate
-- caller could see.
--
-- Verified after applying: own-org feed still returns rows with the embedded
-- author profile and reactions; the cross-org read returns 0 rows; smoke 30/30.

drop policy if exists allow_select_feed on public.feed_items;

create policy "feed_items: read same org"
  on public.feed_items
  for select
  to authenticated
  using (org_id = auth_user_org_id());
