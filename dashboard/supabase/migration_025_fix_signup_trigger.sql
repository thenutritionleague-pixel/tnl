-- ================================================================
-- Migration 025: Fix "Database error saving new user" on OTP send
-- ================================================================
-- Root cause: sync_user_invites() immediately INSERTs into
-- signup_debug_logs. If that table doesn't exist the trigger throws
-- → Supabase returns 500 and never sends the OTP.
--
-- Fix: rewrite sync_user_invites without the debug table, and wrap
-- handle_new_user in a top-level exception handler so auth user
-- creation NEVER fails even if the sync logic breaks.
-- ================================================================

-- 1. Rewrite sync_user_invites — no signup_debug_logs dependency
create or replace function public.sync_user_invites(p_auth_id uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_invite    record;
  v_profile_id uuid;
begin
  -- Find pending invite (case-insensitive)
  select * into v_invite
  from public.invite_whitelist
  where lower(trim(email)) = lower(trim(p_email))
    and used_at is null
  limit 1;

  if v_invite.id is null then
    return; -- Not invited — do nothing, don't block
  end if;

  -- Create or sync profile
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
      email  = p_email
    returning id into v_profile_id;
  exception when others then
    -- Profile may already exist by email (e.g. test user)
    select id into v_profile_id
    from public.profiles
    where lower(email) = lower(p_email)
    limit 1;

    if v_profile_id is null then return; end if;

    update public.profiles
    set auth_id = p_auth_id, org_id = v_invite.org_id
    where id = v_profile_id;
  end;

  -- Link org membership
  begin
    insert into public.org_members (org_id, user_id, role)
    values (v_invite.org_id, v_profile_id, 'member')
    on conflict (org_id, user_id) do nothing;
  exception when others then null;
  end;

  -- Link team membership
  if v_invite.team_id is not null then
    begin
      delete from public.team_members
      where user_id = v_profile_id and org_id = v_invite.org_id;

      if lower(v_invite.role) in ('captain', 'vice_captain') then
        update public.team_members set role = 'member'
        where team_id = v_invite.team_id
          and lower(role) = lower(v_invite.role);
      end if;

      insert into public.team_members (team_id, user_id, org_id, role)
      values (v_invite.team_id, v_profile_id, v_invite.org_id, lower(v_invite.role))
      on conflict do nothing;
    exception when others then null;
    end;
  end if;

  -- Mark invite as used
  update public.invite_whitelist set used_at = now() where id = v_invite.id;
end;
$$;

-- 2. Harden handle_new_user — never block auth user creation
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.sync_user_invites(new.id, new.email);
  exception when others then
    null; -- Sync failed but user is created — they can still log in
  end;
  return new;
end;
$$;
