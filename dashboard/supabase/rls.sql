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
-- Helper function: check if current user is an org admin
-- ────────────────────────────────────────────────────────────────
create or replace function is_admin_of(p_org_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return exists (
    select 1 from public.org_members m
    join public.profiles p on m.user_id = p.id
    where p.auth_id = auth.uid()
    and m.org_id = p_org_id
    and m.role in ('org_admin', 'sub_admin')
  );
end;
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

create policy "profiles: admin management"
  on profiles for update
  to authenticated
  using (is_admin_of(org_id));

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

create policy "team_members: admin management"
  on team_members for all
  to authenticated
  using (is_admin_of(org_id));

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
-- TASK TEAMS
-- Controls per-team task visibility. Dashboard uses service role.
-- Mobile doesn't query this table directly, but add a read policy
-- so authenticated users can read task_teams for their org's tasks.
-- ────────────────────────────────────────────────────────────────
alter table task_teams enable row level security;

create policy "task_teams: read via task org"
  on task_teams for select
  to authenticated
  using (
    exists (
      select 1 from tasks tk
      join challenges c on c.id = tk.challenge_id
      where tk.id = task_id
        and c.org_id = auth_user_org_id()
    )
  );

-- ────────────────────────────────────────────────────────────────
-- ADMIN USERS
-- Dashboard uses service role only. No mobile access.
-- ────────────────────────────────────────────────────────────────
alter table admin_users enable row level security;
-- No authenticated policies — dashboard queries go through service role.

-- ────────────────────────────────────────────────────────────────
-- STORAGE: task-proofs bucket
-- Path structure: proofs/{profile_id}/{task_id}_{timestamp}.ext
-- Members upload to their own folder; all org members can read
-- ────────────────────────────────────────────────────────────────

-- Allow authenticated members to upload proofs into their own folder.
-- Folder segment [2] of "proofs/{profile_id}/..." must match their profile id.
create policy "task-proofs: member upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'task-proofs'
    and (string_to_array(name, '/'))[2] = (
      select id::text from public.profiles where auth_id = auth.uid() limit 1
    )
  );

-- Allow authenticated users to read any proof (needed for admin review).
create policy "task-proofs: authenticated read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'task-proofs');

-- Allow members to delete their own proofs (optional, for resubmit).
create policy "task-proofs: member delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'task-proofs'
    and (string_to_array(name, '/'))[2] = (
      select id::text from public.profiles where auth_id = auth.uid() limit 1
    )
  );
