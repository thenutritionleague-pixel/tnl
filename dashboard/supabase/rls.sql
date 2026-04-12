-- ================================================================
-- Yi Nutrition League — Row Level Security Policies
-- Run AFTER schema.sql + seed.sql in Supabase → SQL Editor
-- ================================================================
--
-- DESIGN:
-- • Dashboard uses service role key → bypasses RLS entirely
-- • Mobile app uses anon/authenticated key → filtered by org_id
-- • For Phase 2 testing, RLS is light. Tighten for production.
--
-- HOW RLS WORKS HERE:
-- • auth.uid() = the logged-in Supabase Auth user's UUID
-- • profiles.auth_id links auth.users → profiles
-- • We derive org_id via: (select org_id from profiles where auth_id = auth.uid())
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- Helper function: get current user's org_id from their profile
-- ────────────────────────────────────────────────────────────────
create or replace function auth_user_org_id()
returns uuid language sql stable security definer as $$
  select org_id from public.profiles where auth_id = auth.uid() limit 1;
$$;

-- ────────────────────────────────────────────────────────────────
-- ORGANIZATIONS
-- Authenticated users can read their own org only
-- ────────────────────────────────────────────────────────────────
alter table organizations enable row level security;

create policy "org: read own org"
  on organizations for select
  to authenticated
  using (id = auth_user_org_id());

-- ────────────────────────────────────────────────────────────────
-- PROFILES
-- Users can read all profiles in their org; update only their own
-- ────────────────────────────────────────────────────────────────
alter table profiles enable row level security;

create policy "profiles: read same org"
  on profiles for select
  to authenticated
  using (org_id = auth_user_org_id());

create policy "profiles: update own"
  on profiles for update
  to authenticated
  using (auth_id = auth.uid());

-- ────────────────────────────────────────────────────────────────
-- ORG MEMBERS
-- ────────────────────────────────────────────────────────────────
alter table org_members enable row level security;

create policy "org_members: read same org"
  on org_members for select
  to authenticated
  using (org_id = auth_user_org_id());

-- ────────────────────────────────────────────────────────────────
-- TEAMS
-- ────────────────────────────────────────────────────────────────
alter table teams enable row level security;

create policy "teams: read same org"
  on teams for select
  to authenticated
  using (org_id = auth_user_org_id());

-- ────────────────────────────────────────────────────────────────
-- TEAM MEMBERS
-- ────────────────────────────────────────────────────────────────
alter table team_members enable row level security;

create policy "team_members: read same org"
  on team_members for select
  to authenticated
  using (org_id = auth_user_org_id());

-- ────────────────────────────────────────────────────────────────
-- CHALLENGES
-- ────────────────────────────────────────────────────────────────
alter table challenges enable row level security;

create policy "challenges: read same org"
  on challenges for select
  to authenticated
  using (org_id = auth_user_org_id());

-- ────────────────────────────────────────────────────────────────
-- CHALLENGE TEAMS
-- ────────────────────────────────────────────────────────────────
alter table challenge_teams enable row level security;

create policy "challenge_teams: read via challenge"
  on challenge_teams for select
  to authenticated
  using (
    exists (
      select 1 from challenges c
      where c.id = challenge_id and c.org_id = auth_user_org_id()
    )
  );

-- ────────────────────────────────────────────────────────────────
-- TASKS
-- ────────────────────────────────────────────────────────────────
alter table tasks enable row level security;

create policy "tasks: read via challenge"
  on tasks for select
  to authenticated
  using (
    exists (
      select 1 from challenges c
      where c.id = challenge_id and c.org_id = auth_user_org_id()
    )
  );

-- ────────────────────────────────────────────────────────────────
-- TASK SUBMISSIONS
-- Members can read all in their org; insert only their own
-- ────────────────────────────────────────────────────────────────
alter table task_submissions enable row level security;

create policy "task_submissions: read same org"
  on task_submissions for select
  to authenticated
  using (org_id = auth_user_org_id());

create policy "task_submissions: insert own"
  on task_submissions for insert
  to authenticated
  with check (
    org_id = auth_user_org_id()
    and user_id = (select id from profiles where auth_id = auth.uid())
  );

-- ────────────────────────────────────────────────────────────────
-- POINTS TRANSACTIONS
-- ────────────────────────────────────────────────────────────────
alter table points_transactions enable row level security;

create policy "points_transactions: read same org"
  on points_transactions for select
  to authenticated
  using (org_id = auth_user_org_id());

-- ────────────────────────────────────────────────────────────────
-- FEED ITEMS
-- ────────────────────────────────────────────────────────────────
alter table feed_items enable row level security;

create policy "feed_items: read same org"
  on feed_items for select
  to authenticated
  using (org_id = auth_user_org_id());

-- ────────────────────────────────────────────────────────────────
-- FEED REACTIONS
-- ────────────────────────────────────────────────────────────────
alter table feed_reactions enable row level security;

create policy "feed_reactions: read via post"
  on feed_reactions for select
  to authenticated
  using (
    exists (
      select 1 from feed_items fi
      where fi.id = post_id and fi.org_id = auth_user_org_id()
    )
  );

create policy "feed_reactions: insert own"
  on feed_reactions for insert
  to authenticated
  with check (
    user_id = (select id from profiles where auth_id = auth.uid())
  );

create policy "feed_reactions: delete own"
  on feed_reactions for delete
  to authenticated
  using (
    user_id = (select id from profiles where auth_id = auth.uid())
  );

create policy "feed_reactions: update own"
  on feed_reactions for update
  to authenticated
  using (
    user_id = (select id from profiles where auth_id = auth.uid())
  );

-- ────────────────────────────────────────────────────────────────
-- MESSAGES  (team chat)
-- ────────────────────────────────────────────────────────────────
alter table messages enable row level security;

create policy "messages: read own team"
  on messages for select
  to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.team_id = messages.team_id
        and tm.user_id = (select id from profiles where auth_id = auth.uid())
    )
  );

create policy "messages: insert own"
  on messages for insert
  to authenticated
  with check (
    user_id = (select id from profiles where auth_id = auth.uid())
  );

-- ────────────────────────────────────────────────────────────────
-- EVENTS
-- ────────────────────────────────────────────────────────────────
alter table events enable row level security;

create policy "events: read same org"
  on events for select
  to authenticated
  using (org_id = auth_user_org_id());

-- ────────────────────────────────────────────────────────────────
-- EVENT PARTICIPATIONS
-- ────────────────────────────────────────────────────────────────
alter table event_participations enable row level security;

create policy "event_participations: read via event"
  on event_participations for select
  to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = event_id and e.org_id = auth_user_org_id()
    )
  );

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

-- ────────────────────────────────────────────────────────────────
-- POLICIES  (org content policies)
-- ────────────────────────────────────────────────────────────────
alter table policies enable row level security;

create policy "policies: read same org"
  on policies for select
  to authenticated
  using (org_id = auth_user_org_id());

-- ────────────────────────────────────────────────────────────────
-- INVITE WHITELIST
-- Mobile app: users can read their own invite record
-- Dashboard uses service role (bypasses RLS)
-- ────────────────────────────────────────────────────────────────
alter table invite_whitelist enable row level security;

create policy "invite_whitelist: read own invite"
  on invite_whitelist for select
  to authenticated
  using (email = auth.jwt() ->> 'email');

-- ────────────────────────────────────────────────────────────────
-- ADMIN USERS
-- Dashboard uses service role only. No mobile access.
-- ────────────────────────────────────────────────────────────────
alter table admin_users enable row level security;
-- No authenticated policies — dashboard queries go through service role.
-- If you need anon to check admin status, add a specific policy here.
