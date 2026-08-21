-- Read-only admins.
--
-- The client asked for sub-admins who can see the dashboard but cannot change
-- anything — useful for chapter leads who need visibility into approvals and
-- standings without the ability to approve, reject, adjust points, or edit the
-- roster.
--
-- This is a flag rather than a new role on purpose. The role column already
-- drives the org guard in proxy.ts, the post-login redirect, and the grouping
-- on the admins page; a fifth role would have to be threaded through all of
-- them. A read_only sub_admin keeps role = 'sub_admin', so every one of those
-- paths keeps working untouched and the only new behaviour is the write block.
--
-- Defaults to false, so no existing admin changes.

alter table admin_users
  add column if not exists read_only boolean not null default false;

comment on column admin_users.read_only is
  'When true, this admin may view the dashboard but every mutating server action is refused.';
