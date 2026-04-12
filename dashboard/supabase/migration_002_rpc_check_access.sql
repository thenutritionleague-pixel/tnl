-- Run this query in your Supabase SQL Editor
-- This creates a secure RPC function that the mobile app uses to check 
-- if an email has access, bypassing Row Level Security (RLS) safely.
-- RLS normally blocks anonymous users from querying profiles/invites.

create or replace function check_email_access(lookup_email text)
returns text language plpgsql security definer as $$
declare
  found_id uuid;
begin
  -- 1. Check if they already have a complete profile
  select id into found_id from profiles where email = lookup_email limit 1;
  if found_id is not null then return 'profile'; end if;
  
  -- 2. Check if they are in the invite whitelist (and haven't used the invite yet)
  select id into found_id from invite_whitelist where email = lookup_email and used_at is null limit 1;
  if found_id is not null then return 'invite'; end if;
  
  return null;
end;
$$;
