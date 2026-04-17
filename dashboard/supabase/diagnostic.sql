-- Yi Nutrition League — Deep Diagnostic Tool
-- Run this to see exactly what the mobile app sees.

with current_user_data as (
  select id, email from auth.users where email = 'abdulquadir828+member@gmail.com'
)
select 
  p.id as profile_uuid,
  p.name as profile_name,
  p.org_id as linked_org_id,
  o.name as organization_name,
  tm.team_id as linked_team_id,
  t.name as team_name
from current_user_data u
join public.profiles p on p.auth_id = u.id
left join public.organizations o on o.id = p.org_id
left join public.team_members tm on tm.user_id = p.id
left join public.teams t on t.id = tm.team_id;

-- Check for sync errors
select * from signup_debug_logs where email = 'abdulquadir828+member@gmail.com' order by created_at desc;
