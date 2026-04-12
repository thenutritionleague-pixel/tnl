-- ================================================================
-- Migration 004: Fix Missing RLS Policies for Mobile App
-- Adds missing permissions that were causing `.upsert()` to crash
-- ================================================================

-- 1. feed_reactions requires an UPDATE policy because .upsert() translates
--    to INSERT ... ON CONFLICT DO UPDATE, which strictly requires UPDATE privileges.
create policy "feed_reactions: update own"
  on feed_reactions for update
  to authenticated
  using (
    user_id = (select id from profiles where auth_id = auth.uid())
  );

-- 2. event_participations was missing entirely for mobile app writes.
create policy "event_participations: insert own"
  on event_participations for insert
  to authenticated
  with check (
    user_id = (select id from profiles where auth_id = auth.uid())
  );

create policy "event_participations: update own"
  on event_participations for update
  to authenticated
  using (
    user_id = (select id from profiles where auth_id = auth.uid())
  );

create policy "event_participations: delete own"
  on event_participations for delete
  to authenticated
  using (
    user_id = (select id from profiles where auth_id = auth.uid())
  );
