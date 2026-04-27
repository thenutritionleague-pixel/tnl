-- Enforce at most one captain and one vice-captain per team.
-- Partial unique indexes mean concurrent role assignments can't both succeed —
-- the second UPDATE wins the race, the first is silently overwritten (which
-- is fine), but two concurrent inserts/updates trying to SET the same role
-- on different users will hit a constraint rather than silently double-assign.
--
-- We use a function-based approach via a BEFORE trigger so the constraint is
-- enforced in a single round-trip regardless of the client library used.

create or replace function public.enforce_team_role_uniqueness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role in ('captain', 'vice_captain') then
    -- Demote any existing holder of this role in the same team (excluding self)
    update team_members
    set role = 'member'
    where team_id = new.team_id
      and role = new.role
      and user_id != new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_team_role_uniqueness on team_members;

create trigger trg_team_role_uniqueness
  before insert or update of role
  on team_members
  for each row
  execute function public.enforce_team_role_uniqueness();
