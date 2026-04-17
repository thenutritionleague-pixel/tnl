-- ================================================================
-- Yi Nutrition League — Fresh Start Cleanup Script
-- Run in Supabase → SQL Editor → New Query
-- WARNING: This will delete ALL data (orgs, members, tasks, etc.)
-- but will PRESERVE Super Admin accounts.
-- ================================================================

begin;

-- 1. Remove all organization-related data (Challenges, Teams, Submissions, etc.)
-- This relies on the 'on delete cascade' foreign keys in the schema.
delete from organizations;

-- 2. Remove all mobile app profiles and their history
-- (Submissions and transactions will be deleted by this or the org delete)
delete from profiles;

-- 3. Remove all admin users EXCEPT platform-level Super Admins
delete from admin_users 
where role not in ('super_admin', 'sub_super_admin');

-- 4. Final verification cleanup for any orphans
delete from invite_whitelist;
delete from events;
delete from feed_items;

commit;

-- ================================================================
-- Success: Your database is now empty except for Super Admins.
-- You can now create your first REAL organization from the dashboard.
-- ================================================================
