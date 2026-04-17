-- ================================================================
-- CONSOLIDATED SYNC SCRIPT (2026-04-13)
-- Run this in Supabase SQL Editor to sync your DB with late-session fixes.
-- ================================================================

-- 1. Update Tasks Schema (Decoupled Dates)
alter table public.tasks 
  add column if not exists start_date date null,
  add column if not exists end_date date null;

-- 2. Link profiles to auth.users (Nuclear Cascade)
-- This ensures that deleting from Supabase Auth wipes the profile too.
alter table public.profiles
  drop constraint if exists profiles_auth_id_fkey,
  add constraint profiles_auth_id_fkey 
  foreign key (auth_id) 
  references auth.users(id) 
  on delete cascade;

-- 3. Hardened Team Uniqueness (One team per org)
alter table public.team_members
  drop constraint if exists team_members_org_user_unique,
  add constraint team_members_org_user_unique 
  unique (org_id, user_id);

-- 3.1 Standardize Invite Whitelist Roles
-- This fixes the 'role_check' violation by unifying on 'captain'
alter table public.invite_whitelist 
  drop constraint if exists invite_whitelist_role_check;

alter table public.invite_whitelist
  add constraint invite_whitelist_role_check 
  check (role in ('captain', 'vice_captain', 'member'));

-- 4. Reusable User Sync Function (Can be called manually to fix orphaned users)
create or replace function public.sync_user_invites(p_auth_id uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_invite record;
  v_profile_id uuid;
  v_log_id uuid;
begin
  -- Initial Log
  insert into public.signup_debug_logs (email, event, details)
  values (p_email, 'SYNC_START', jsonb_build_object('auth_id', p_auth_id))
  returning id into v_log_id;

  -- 1. Find the invite (Defensive Case-Insensitive + Trim)
  select * into v_invite from public.invite_whitelist 
  where lower(trim(email)) = lower(trim(p_email)) and used_at is null limit 1;

  if v_invite.id is null then
    update public.signup_debug_logs set event = 'NO_INVITE_FOUND', details = details || jsonb_build_object('reason', 'No pending invite found') where id = v_log_id;
    return;
  end if;

  -- 2. Create/Sync Profile
  begin
    insert into public.profiles (auth_id, name, email, org_id, avatar_color)
    values (
      p_auth_id,
      split_part(p_email, '@', 1),
      p_email,
      v_invite.org_id,
      '#059669'
    )
    on conflict (auth_id) do update set 
      org_id = coalesce(profiles.org_id, v_invite.org_id),
      email = p_email
    returning id into v_profile_id;
  exception when others then
    select id into v_profile_id from public.profiles where lower(email) = lower(p_email) limit 1;
    if v_profile_id is null then 
      update public.signup_debug_logs set event = 'PROFILE_CREATION_FAILED', details = details || jsonb_build_object('error', SQLERRM) where id = v_log_id;
      return; 
    end if;
    update public.profiles set auth_id = p_auth_id, org_id = v_invite.org_id where id = v_profile_id;
  end;

  -- 3. Link Org Membership
  begin
    insert into public.org_members (org_id, user_id, role)
    values (v_invite.org_id, v_profile_id, 'member')
    on conflict (org_id, user_id) do nothing;
  exception when others then null;
  end;

  -- 4. Link Team Membership
  if v_invite.team_id is not null then
    begin
      delete from public.team_members where user_id = v_profile_id and org_id = v_invite.org_id;
      
      if lower(v_invite.role) in ('captain', 'vice_captain') then
        update public.team_members set role = 'member' 
        where team_id = v_invite.team_id and lower(role) = lower(v_invite.role);
      end if;

      insert into public.team_members (team_id, user_id, org_id, role)
      values (v_invite.team_id, v_profile_id, v_invite.org_id, lower(v_invite.role))
      on conflict do nothing;
    exception when others then null;
    end;
  end if;

  update public.invite_whitelist set used_at = now() where id = v_invite.id;
  update public.signup_debug_logs set event = 'SYNC_SUCCESS', details = details || jsonb_build_object('profile_id', v_profile_id, 'org_id', v_invite.org_id) where id = v_log_id;
end;
$$;

-- 5. Updated Registration Trigger (Calls the sync function)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_user_invites(new.id, new.email);
  return new;
end;
$$;

-- 4.1 Check Email Access RPC (Used by mobile app to verify invite before OTP)
-- accessible by 'anon' safely. Case-Insensitive.
create or replace function public.check_email_access(lookup_email text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where lower(email) = lower(trim(lookup_email))) then
    return 'profile';
  elsif exists (select 1 from public.invite_whitelist where lower(email) = lower(trim(lookup_email)) and used_at is null) then
    return 'invite';
  else
    return null;
  end if;
end;
$$;

grant execute on function public.check_email_access(text) to anon, authenticated;

-- 3. Hardened Invitation Claim RPC
create or replace function public.claim_user_invite(
  p_auth_id uuid,
  p_email text,
  p_name text,
  p_org_id uuid,
  p_invite_id uuid default null,
  p_team_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_profile_id uuid;
  v_result jsonb;
begin
  -- 0. STRICT VALIDATION: Ensure the invite actually exists and is unused
  if p_invite_id is not null then
    if not exists (
      select 1 from public.invite_whitelist 
      where id = p_invite_id and email = p_email and used_at is null
    ) then
      raise exception 'This invitation is invalid or has already been used.';
    end if;
  end if;

  -- 1. Update/Link the profile
  update public.profiles
  set name = trim(p_name), org_id = p_org_id
  where auth_id = p_auth_id
  returning id into v_profile_id;

  if v_profile_id is null then
    raise exception 'Profile not found';
  end if;

  -- 2. Ensure Org membership
  insert into public.org_members (org_id, user_id, role)
  values (p_org_id, v_profile_id, 'member')
  on conflict (org_id, user_id) do nothing;

  -- 3. Team membership
  if p_team_id is not null then
    insert into public.team_members (team_id, user_id, org_id, role)
    values (p_team_id, v_profile_id, p_org_id, 'member')
    on conflict (team_id, user_id) do nothing;
  end if;

  -- 4. Mark invite as used
  if p_invite_id is not null then
    update public.invite_whitelist
    set used_at = now()
    where id = p_invite_id;
  end if;

  -- Return result
  select jsonb_build_object(
    'id', id, 'org_id', org_id, 'name', name, 'email', email
  ) into v_result
  from public.profiles
  where id = v_profile_id;

  return v_result;
end;
$$;

-- 4. Dynamic Tasks Mobile RPC
drop function if exists get_mobile_tasks(uuid, uuid);
create or replace function get_mobile_tasks(p_team_id uuid, p_org_id uuid)
returns table (id uuid, challenge_id uuid, title text, description text, points int, week_number int, category text, icon text, is_active boolean, start_date date, end_date date)
language plpgsql security definer as $$
declare
  v_timezone text;
  v_local_today date;
begin
  select o.timezone into v_timezone from organizations o where o.id = p_org_id;
  if not found or v_timezone is null then v_timezone := 'UTC'; end if;
  v_local_today := (current_timestamp at time zone v_timezone)::date;

  return query
  select t.id, t.challenge_id, t.title, t.description, t.points, t.week_number, t.category, t.icon, t.is_active, t.start_date, t.end_date
  from tasks t join challenges c on t.challenge_id = c.id
  where c.org_id = p_org_id and c.status = 'active' and c.manually_closed = false and t.is_active = true
    and ((t.start_date is not null and v_local_today >= t.start_date) or (t.start_date is null and v_local_today >= (c.start_date + ((t.week_number - 1) * 7))))
    and (t.end_date is null or v_local_today <= t.end_date)
    and (not exists (select 1 from challenge_teams ct where ct.challenge_id = c.id) or exists (select 1 from challenge_teams ct where ct.challenge_id = c.id and ct.team_id = p_team_id))
    and (not exists (select 1 from task_teams tt where tt.task_id = t.id) or exists (select 1 from task_teams tt where tt.task_id = t.id and tt.team_id = p_team_id));
end;
$$;


-- 5. Email Synchronization Triggers (Auth <-> Profile <-> Whitelist)
-- 5.1 Sync AUTH.USERS -> PROFILES (User triggered from mobile)
create or replace function public.sync_auth_email_to_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Prevent recursion
  if pg_trigger_depth() > 1 then return new; end if;

  if (old.email <> new.email) then
    update public.profiles set email = new.email where auth_id = new.id;
    update public.invite_whitelist set email = new.email where email = old.email;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_update on auth.users;
create trigger on_auth_user_email_update
  after update of email on auth.users
  for each row execute function public.sync_auth_email_to_profile();

-- 5.2 Sync PROFILES -> AUTH.USERS (Admin triggered from dashboard)
create or replace function public.sync_profile_email_to_auth()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Prevent recursion
  if pg_trigger_depth() > 1 then return new; end if;

  if (old.email <> new.email) then
    update auth.users set email = new.email where id = new.auth_id;
    update public.invite_whitelist set email = new.email where email = old.email and org_id = new.org_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_email_update on public.profiles;
create trigger on_profile_email_update
  after update of email on public.profiles
  for each row execute function public.sync_profile_email_to_auth();


-- 6. Hardened RLS Helpers (Fix for circular dependencies and path issues)
create or replace function public.auth_user_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where auth_id = auth.uid() limit 1;
$$;

create or replace function public.auth_user_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.profiles where auth_id = auth.uid() limit 1;
$$;

-- 8. Standardized RLS Policies (Production-Ready)
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.team_members enable row level security;

-- Organizations: Can read the one I belong to
drop policy if exists "org: read own org" on public.organizations;
create policy "org: read own org"
  on public.organizations for select
  to authenticated
  using (id = (select org_id from public.profiles where auth_id = auth.uid()));

-- Profiles: Can read own profile (No circular dependency)
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using (auth_id = auth.uid());

-- Profiles: Can read everyone in same org
drop policy if exists "profiles: read same org" on public.profiles;
create policy "profiles: read same org"
  on public.profiles for select
  to authenticated
  using (org_id = public.auth_user_org_id());

-- Team Members: Can read own team membership
drop policy if exists "team_members: read own" on public.team_members;
create policy "team_members: read own"
  on public.team_members for select
  to authenticated
  using (user_id = public.auth_user_id());

-- Team Members: Can read same org
drop policy if exists "team_members: read same org" on public.team_members;
create policy "team_members: read same org"
  on public.team_members for select
  to authenticated
  using (org_id = public.auth_user_org_id());
-- 9. Explicit Foreign Key Naming (Matches Flutter App Expectations)
-- This ensures that the mobile app's join queries (e.g. organizations!profiles_org_id_fkey) always work.
do $$ 
begin
  -- Profiles -> Organizations
  alter table public.profiles drop constraint if exists profiles_org_id_fkey;
  alter table public.profiles add constraint profiles_org_id_fkey foreign key (org_id) references organizations(id);

  -- Team Members -> Teams
  alter table public.team_members drop constraint if exists team_members_team_id_fkey;
  alter table public.team_members add constraint team_members_team_id_fkey foreign key (team_id) references teams(id) on delete cascade;

  -- Team Members -> Profiles (User)
  alter table public.team_members drop constraint if exists team_members_user_id_fkey;
  alter table public.team_members add constraint team_members_user_id_fkey foreign key (user_id) references profiles(id) on delete cascade;
exception when others then null;
end $$;

-- -- 10. CLEAN SLATE: Maximum Visibility RLS (Fix for "Your Org" / "No Team")
-- This wipes all complex logic and allows all logged-in users to see metadata.
do $$ 
declare
  r record;
begin
  for r in (select policyname, tablename from pg_policies where schemaname = 'public' and tablename in ('organizations', 'profiles', 'team_members', 'teams', 'tasks', 'challenges', 'feed_items', 'feed_reactions')) 
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Enable RLS globally for consistency
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.challenges enable row level security;
alter table public.tasks enable row level security;
alter table public.feed_items enable row level security;
alter table public.feed_reactions enable row level security;

-- Force Disable RLS on Organizations to guarantee visibility of name/logo
alter table public.organizations disable row level security;

-- 11. Simple, Bulletproof Policies (Select = True)
create policy "allow_select_orgs" on public.organizations for select to authenticated using (true);
create policy "allow_select_profiles" on public.profiles for select to authenticated using (true);
create policy "allow_select_teams" on public.teams for select to authenticated using (true);
create policy "allow_select_team_members" on public.team_members for select to authenticated using (true);
create policy "allow_select_challenges" on public.challenges for select to authenticated using (true);
create policy "allow_select_tasks" on public.tasks for select to authenticated using (true);
create policy "allow_select_feed" on public.feed_items for select to authenticated using (true);
create policy "allow_select_reactions" on public.feed_reactions for select to authenticated using (true);

-- 12. Write Access policies (Self-only)
create policy "allow_update_own_profile" on public.profiles for update to authenticated using (auth_id = auth.uid());
create policy "allow_insert_reactions" on public.feed_reactions for insert to authenticated with check (user_id = (select id from public.profiles where auth_id = auth.uid()));
create policy "allow_delete_own_reactions" on public.feed_reactions for delete to authenticated using (user_id = (select id from public.profiles where auth_id = auth.uid()));

-- 13. Feed Reactions - Universal Constraint Fix
-- This allows Emojis and Strings safely.
alter table public.feed_reactions drop constraint if exists feed_reactions_reaction_check;
alter table public.feed_reactions add constraint feed_reactions_reaction_check 
check (reaction in ('broccoli', 'fire', 'star', 'heart', '🥦', '🔥', '⭐', '❤️'));
