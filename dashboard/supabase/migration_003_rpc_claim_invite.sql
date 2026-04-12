-- ================================================================
-- RPC Function: claim_user_invite
-- Safely processes a mobile user's signup by resolving their invite
-- ================================================================

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
  -- 1. Update the automatically created profile (from auth trigger)
  update public.profiles
  set 
    name = trim(p_name),
    org_id = p_org_id
  where auth_id = p_auth_id
  returning id into v_profile_id;

  if v_profile_id is null then
    raise exception 'Profile not found for auth_id %', p_auth_id;
  end if;

  -- 2. Insert into team_members if team_id is provided
  if p_team_id is not null then
    insert into public.team_members (team_id, user_id, org_id, role)
    values (p_team_id, v_profile_id, p_org_id, 'member')
    on conflict (team_id, user_id) do nothing;
  end if;

  -- 3. Mark the invite as used if invite_id is provided
  if p_invite_id is not null then
    update public.invite_whitelist
    set used_at = now()
    where id = p_invite_id;
  end if;

  -- Return the profile data
  select jsonb_build_object(
    'id', id,
    'org_id', org_id,
    'name', name,
    'email', email,
    'avatar_color', avatar_color
  ) into v_result
  from public.profiles
  where id = v_profile_id;

  return v_result;
end;
$$;
