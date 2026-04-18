-- ================================================================
-- Yi Nutrition League — Database Schema
-- Run in Supabase → SQL Editor → New Query
-- ================================================================

create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────────
-- ORGANIZATIONS
-- logo stores an emoji character (e.g. '🏙️', '🌿')
-- ────────────────────────────────────────────────────────────────
create table if not exists organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  logo       text not null default '🏢',
  country    char(2) not null default 'IN',
  timezone   text not null default 'UTC',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────
-- ADMIN USERS  (dashboard logins — separate from mobile profiles)
-- org_id is NULL for super_admin and sub_super_admin (platform-level)
-- ────────────────────────────────────────────────────────────────
create table if not exists admin_users (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  org_id       uuid references organizations(id) on delete cascade,
  role         text not null check (role in ('super_admin', 'sub_super_admin', 'org_admin', 'sub_admin')),
  name         text not null,
  email        text not null,
  status       text not null default 'pending' check (status in ('active', 'pending', 'inactive')),
  avatar_color text not null default '#059669',
  created_by   uuid,
  created_at   timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────
-- PROFILES  (mobile app users — members, captains)
-- Standalone user table. Linked to auth.users via trigger below.
-- ────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id           uuid primary key default gen_random_uuid(),
  auth_id      uuid unique,          -- set by trigger when auth user exists
  org_id       uuid references organizations(id) on delete cascade,
  name         text not null,
  email        text,
  avatar_color text not null default '#059669',
  total_points int not null default 0,
  is_test      boolean not null default false,  -- test users bypass OTP with 123456
  created_at   timestamptz not null default now()
);

-- Auto-create/link profile when a Supabase Auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_invite record;
  v_profile_id uuid;
begin
  -- 1. Look for invite
  select * into v_invite 
  from public.invite_whitelist 
  where email = new.email and used_at is null 
  limit 1;

  -- 2. Create profile (with org_id if found)
  insert into public.profiles (auth_id, name, email, org_id, avatar_color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    v_invite.org_id, -- Can be null for now, but usually should be found
    coalesce(new.raw_user_meta_data->>'avatar_color', '#059669')
  )
  on conflict (auth_id) do update 
  set org_id = coalesce(profiles.org_id, v_invite.org_id)
  returning id into v_profile_id;

  -- 3. If invite found, perform auto-linkage
  if v_invite.id is not null then
    -- Add to org_members
    insert into public.org_members (org_id, user_id, role)
    values (v_invite.org_id, v_profile_id, 'member')
    on conflict (org_id, user_id) do nothing;

    -- Add to team_members if team_id exists
    if v_invite.team_id is not null then
      insert into public.team_members (team_id, user_id, org_id, role)
      values (v_invite.team_id, v_profile_id, v_invite.org_id, v_invite.role)
      on conflict (team_id, user_id) do nothing;
    end if;

    -- Mark invite as used
    update public.invite_whitelist 
    set used_at = now() 
    where id = v_invite.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ────────────────────────────────────────────────────────────────
-- ORG MEMBERS
-- ────────────────────────────────────────────────────────────────
create table if not exists org_members (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references organizations(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  role      text not null default 'member'
            check (role in ('org_admin', 'sub_admin', 'member')),
  joined_at timestamptz not null default now(),
  unique (org_id, user_id)
);

-- ────────────────────────────────────────────────────────────────
-- TEAMS
-- ────────────────────────────────────────────────────────────────
create table if not exists teams (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  emoji      text not null default '🥦',
  color      text not null default '#059669',
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────
-- TEAM MEMBERS
-- ────────────────────────────────────────────────────────────────
create table if not exists team_members (
  id        uuid primary key default gen_random_uuid(),
  team_id   uuid not null references teams(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  org_id    uuid not null references organizations(id) on delete cascade,
  role      text not null default 'member'
            check (role in ('captain', 'vice_captain', 'member')),
  joined_at timestamptz not null default now(),
  unique (team_id, user_id),
  unique (org_id, user_id)
);

-- ────────────────────────────────────────────────────────────────
-- INVITE WHITELIST  (controls who can join via mobile app)
-- status is derived: used_at IS NULL → 'pending', else 'accepted'
-- ────────────────────────────────────────────────────────────────
create table if not exists invite_whitelist (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  email      text not null,
  team_id    uuid references teams(id),
  role       text not null default 'member'
             check (role in ('team_captain', 'vice_captain', 'member')),
  invited_by uuid,
  used_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

-- ────────────────────────────────────────────────────────────────
-- CHALLENGES
-- ────────────────────────────────────────────────────────────────
create table if not exists challenges (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  name             text not null,
  description      text not null default '',
  status           text not null default 'upcoming'
                   check (status in ('active', 'completed', 'upcoming')),
  start_date       date not null,
  end_date         date,
  manually_closed  boolean not null default false,
  created_at       timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────
-- CHALLENGE ↔ TEAM ASSIGNMENTS
-- ────────────────────────────────────────────────────────────────
create table if not exists challenge_teams (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  team_id      uuid not null references teams(id) on delete cascade,
  unique (challenge_id, team_id)
);

-- ────────────────────────────────────────────────────────────────
-- TASKS
-- start_week: first week the task appears (architecture/scheduling)
-- week_number: same value, exposed to UI for display
-- ────────────────────────────────────────────────────────────────
create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  title        text not null,
  description  text not null default '',
  points       int not null default 10 check (points > 0),
  start_week   int not null default 1 check (start_week >= 1),
  week_number  int not null default 1 check (week_number >= 1),
  category     text not null default 'Other',
  icon         text not null default '✅',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────
-- TASK ↔ TEAM VISIBILITY
-- (If empty, task is visible to all teams in the challenge)
-- ────────────────────────────────────────────────────────────────
create table if not exists task_teams (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references tasks(id) on delete cascade,
  team_id      uuid not null references teams(id) on delete cascade,
  unique (task_id, team_id)
);

-- ────────────────────────────────────────────────────────────────
-- TASK SUBMISSIONS  (renamed from 'submissions')
-- proof_type: 'image' for photo proof, 'text' for written log
-- points_awarded: set on approval (may differ from task.points if overridden)
-- ────────────────────────────────────────────────────────────────
create table if not exists task_submissions (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid not null references tasks(id) on delete cascade,
  challenge_id     uuid not null references challenges(id) on delete cascade,
  user_id          uuid not null references profiles(id) on delete cascade,
  org_id           uuid not null references organizations(id) on delete cascade,
  submitted_at     timestamptz not null default now(),
  submitted_date   date not null default current_date,
  status           text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected')),
  proof_url        text,
  proof_type       text not null default 'text' check (proof_type in ('image', 'text')),
  notes            text,
  rejection_reason text,
  points_awarded   int,
  reviewed_by      uuid references profiles(id),
  reviewed_at      timestamptz
);

-- ────────────────────────────────────────────────────────────────
-- POINTS TRANSACTIONS  (ledger for all point events)
-- amount: positive = award, negative = deduction
-- ────────────────────────────────────────────────────────────────
create table if not exists points_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  amount        int not null,
  reason        text,
  submission_id uuid references task_submissions(id),
  awarded_by    uuid references profiles(id),
  is_manual     boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────
-- FEED ITEMS  (renamed from 'feed_posts')
-- ────────────────────────────────────────────────────────────────
create table if not exists feed_items (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  type         text not null default 'general'
               check (type in (
                 'announcement', 'achievement', 'leaderboard_change',
                 'quiz_result', 'milestone', 'submission_approved', 'general'
               )),
  title        text not null,
  content      text not null default '',
  author_id    uuid references profiles(id) on delete set null,
  challenge_id uuid references challenges(id) on delete set null,
  pinned       boolean not null default false,
  is_auto_generated boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────
-- FEED REACTIONS  (one row per user per reaction per post)
-- ────────────────────────────────────────────────────────────────
create table if not exists feed_reactions (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references feed_items(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  reaction   text not null check (reaction in ('broccoli', 'fire', 'star', 'heart')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id, reaction)
);

-- ────────────────────────────────────────────────────────────────
-- MESSAGES  (team chat — mobile app only)
-- ────────────────────────────────────────────────────────────────
create table if not exists messages (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  content    text,
  media_url  text,
  media_type text,
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────
-- EVENTS  (org events with optional points — quiz or offline)
-- attendees_count is computed via COUNT(event_participations)
-- ────────────────────────────────────────────────────────────────
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  title       text not null,
  description text,
  type        text check (type in ('quiz', 'offline')),
  points      int not null default 0,
  location    text,
  start_time  timestamptz,
  end_time    timestamptz,
  is_active   boolean not null default true,
  status      text not null default 'upcoming' check (status in ('upcoming', 'completed')),
  created_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────
-- EVENT PARTICIPATIONS
-- ────────────────────────────────────────────────────────────────
create table if not exists event_participations (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references events(id) on delete cascade,
  user_id        uuid not null references profiles(id) on delete cascade,
  points_awarded int not null default 0,
  created_at     timestamptz not null default now(),
  unique (event_id, user_id)
);

-- ────────────────────────────────────────────────────────────────
-- POLICIES
-- ────────────────────────────────────────────────────────────────
create table if not exists policies (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  content     text not null default '',
  color_index int not null default 0,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────
-- VIEWS
-- ────────────────────────────────────────────────────────────────

-- Total approved points per team per challenge
create or replace view team_points_view
with (security_invoker = on)
as
select
  tm.team_id,
  s.challenge_id,
  coalesce(sum(t.points), 0)::int as total_points
from team_members tm
left join task_submissions s
  on s.user_id = tm.user_id
  and s.org_id = tm.org_id
  and s.status = 'approved'
left join tasks t on t.id = s.task_id
group by tm.team_id, s.challenge_id;

-- Approved points per member per week per challenge
create or replace view member_week_points_view
with (security_invoker = on)
as
select
  s.user_id,
  s.challenge_id,
  tm.team_id,
  (floor((s.submitted_at::date - c.start_date) / 7.0) + 1)::int as week_number,
  sum(t.points)::int as points
from task_submissions s
join tasks t on t.id = s.task_id
join challenges c on c.id = s.challenge_id
join team_members tm
  on tm.user_id = s.user_id
  and tm.org_id = s.org_id
where s.status = 'approved'
group by s.user_id, s.challenge_id, tm.team_id, (floor((s.submitted_at::date - c.start_date) / 7.0) + 1)::int;

-- ────────────────────────────────────────────────────────────────
-- DB TRIGGER: Auto-award points + generate feed item on approval
-- ────────────────────────────────────────────────────────────────
create or replace function handle_submission_approved()
returns trigger language plpgsql as $$
begin
  if NEW.status = 'approved' and OLD.status != 'approved' then
    -- Award points transaction
    insert into points_transactions (user_id, org_id, amount, reason, submission_id, is_manual)
    values (NEW.user_id, NEW.org_id, coalesce(NEW.points_awarded, 0), 'Task approved', NEW.id, false);

    -- Update member total_points
    update profiles set total_points = total_points + coalesce(NEW.points_awarded, 0)
    where id = NEW.user_id;

    -- Auto-generate feed item
    insert into feed_items (org_id, type, title, content, author_id, challenge_id, is_auto_generated)
    values (NEW.org_id, 'submission_approved', 'Task Completed', '', NEW.user_id, NEW.challenge_id, true);
  end if;
  return NEW;
end;
$$;

drop trigger if exists on_submission_approved on task_submissions;
create trigger on_submission_approved
  after update on task_submissions
  for each row execute function handle_submission_approved();

-- ────────────────────────────────────────────────────────────────
-- ACCESS
-- Dev mode: open access via anon key. Tighten with RLS for production.
-- ────────────────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant all on all routines in schema public to anon, authenticated;
