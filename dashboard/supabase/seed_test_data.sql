-- ================================================================
-- TEST SEED DATA — The Nutrition League
-- Run in Supabase → SQL Editor
-- ================================================================
-- Covers: leaderboard, teams, tasks, submissions (approved/pending/rejected),
--         points, feed, events, policies, messages, invites, reactions
-- Preserves: admin_users where email = 'abdulquadir828@gmail.com'
-- Challenge starts 2026-04-05 → current week = 3 as of 2026-04-19
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- 0. CLEANUP  (children before parents)
-- ────────────────────────────────────────────────────────────────
delete from public.feed_reactions;
delete from public.event_participations;
delete from public.messages;
delete from public.feed_items;
delete from public.points_transactions;
delete from public.task_submissions;
delete from public.task_teams;
delete from public.tasks;
delete from public.challenge_teams;
delete from public.challenges;
delete from public.team_members;
delete from public.org_members;
delete from public.invite_whitelist;
delete from public.events;
delete from public.policies;
delete from public.profiles where email != 'abdulquadir828@gmail.com';
delete from public.teams;
delete from public.admin_users where email != 'abdulquadir828@gmail.com';
delete from public.organizations;

-- ────────────────────────────────────────────────────────────────
-- 1. ORGANIZATION
-- ────────────────────────────────────────────────────────────────
insert into public.organizations (id, name, slug, logo, country, timezone, is_active)
values (
  'aaaabbbb-aaaa-aaaa-aaaa-000000000001',
  'Pixel Labs',
  'pixel-labs',
  '⚡',
  'IN',
  'Asia/Kolkata',
  true
);

-- ────────────────────────────────────────────────────────────────
-- 2. TEAMS  (3 teams for leaderboard diversity)
-- ────────────────────────────────────────────────────────────────
insert into public.teams (id, org_id, name, emoji, color) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000011', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'Alpha Wolves',      '🐺', '#059669'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000012', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'Beta Bulls',        '🐂', '#2563EB'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000013', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'Gamma Gladiators',  '⚡', '#7C3AED');

-- ────────────────────────────────────────────────────────────────
-- 3. PROFILES  (10 test members — is_test=true allows OTP 123456)
-- avatar_color matches team color for visual grouping
-- ────────────────────────────────────────────────────────────────
insert into public.profiles (id, org_id, name, email, avatar_color, total_points, is_test) values
  -- Alpha Wolves
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000101', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'Arjun Sharma',  'arjun@test.tnl',   '#059669', 0, true),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000102', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'Priya Patel',   'priya@test.tnl',   '#059669', 0, true),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000103', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'Rahul Gupta',   'rahul@test.tnl',   '#059669', 0, true),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000104', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'Sneha Rao',     'sneha@test.tnl',   '#059669', 0, true),
  -- Beta Bulls
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000105', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'Kiran Kumar',   'kiran@test.tnl',   '#2563EB', 0, true),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000106', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'Divya Nair',    'divya@test.tnl',   '#2563EB', 0, true),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000107', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'Amit Singh',    'amit@test.tnl',    '#2563EB', 0, true),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000108', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'Meera Joshi',   'meera@test.tnl',   '#2563EB', 0, true),
  -- Gamma Gladiators
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000109', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'Ravi Verma',    'ravi@test.tnl',    '#7C3AED', 0, true),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000110', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'Anjali Das',    'anjali@test.tnl',  '#7C3AED', 0, true);

-- ────────────────────────────────────────────────────────────────
-- 4. ORG MEMBERS
-- ────────────────────────────────────────────────────────────────
insert into public.org_members (org_id, user_id, role) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'aaaabbbb-aaaa-aaaa-aaaa-000000000101', 'member'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'aaaabbbb-aaaa-aaaa-aaaa-000000000102', 'member'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'aaaabbbb-aaaa-aaaa-aaaa-000000000103', 'member'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'aaaabbbb-aaaa-aaaa-aaaa-000000000104', 'member'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'aaaabbbb-aaaa-aaaa-aaaa-000000000105', 'member'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'aaaabbbb-aaaa-aaaa-aaaa-000000000106', 'member'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'aaaabbbb-aaaa-aaaa-aaaa-000000000107', 'member'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'aaaabbbb-aaaa-aaaa-aaaa-000000000108', 'member'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'aaaabbbb-aaaa-aaaa-aaaa-000000000109', 'member'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'aaaabbbb-aaaa-aaaa-aaaa-000000000110', 'member');

-- ────────────────────────────────────────────────────────────────
-- 5. TEAM MEMBERS  (captain, vice_captain, member)
-- ────────────────────────────────────────────────────────────────
insert into public.team_members (team_id, user_id, org_id, role) values
  -- Alpha Wolves
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000011', 'aaaabbbb-aaaa-aaaa-aaaa-000000000101', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'captain'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000011', 'aaaabbbb-aaaa-aaaa-aaaa-000000000102', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'vice_captain'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000011', 'aaaabbbb-aaaa-aaaa-aaaa-000000000103', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'member'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000011', 'aaaabbbb-aaaa-aaaa-aaaa-000000000104', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'member'),
  -- Beta Bulls
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000012', 'aaaabbbb-aaaa-aaaa-aaaa-000000000105', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'captain'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000012', 'aaaabbbb-aaaa-aaaa-aaaa-000000000106', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'vice_captain'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000012', 'aaaabbbb-aaaa-aaaa-aaaa-000000000107', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'member'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000012', 'aaaabbbb-aaaa-aaaa-aaaa-000000000108', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'member'),
  -- Gamma Gladiators
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000013', 'aaaabbbb-aaaa-aaaa-aaaa-000000000109', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'captain'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000013', 'aaaabbbb-aaaa-aaaa-aaaa-000000000110', 'aaaabbbb-aaaa-aaaa-aaaa-000000000001', 'member');

-- ────────────────────────────────────────────────────────────────
-- 6. ADMIN USERS  (org_admin for Pixel Labs dashboard testing)
-- ────────────────────────────────────────────────────────────────
insert into public.admin_users (id, org_id, role, name, email, status, avatar_color) values
  (
    'aaaabbbb-aaaa-aaaa-aaaa-000000000701',
    'aaaabbbb-aaaa-aaaa-aaaa-000000000001',
    'org_admin',
    'Arjun Sharma',
    'arjun.admin@test.tnl',
    'active',
    '#059669'
  );

-- ────────────────────────────────────────────────────────────────
-- 7. CHALLENGE  (active, started Apr 5 → week 3 on Apr 19)
-- ────────────────────────────────────────────────────────────────
insert into public.challenges (id, org_id, name, description, status, start_date, end_date)
values (
  'aaaabbbb-aaaa-aaaa-aaaa-000000000201',
  'aaaabbbb-aaaa-aaaa-aaaa-000000000001',
  'Health Sprint 2026',
  'A 4-week challenge to build consistent daily habits around nutrition, movement, and mindfulness.',
  'active',
  '2026-04-05',
  '2026-05-02'
);

-- ────────────────────────────────────────────────────────────────
-- 8. CHALLENGE ↔ TEAMS
-- ────────────────────────────────────────────────────────────────
insert into public.challenge_teams (challenge_id, team_id) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000201', 'aaaabbbb-aaaa-aaaa-aaaa-000000000011'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000201', 'aaaabbbb-aaaa-aaaa-aaaa-000000000012'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000201', 'aaaabbbb-aaaa-aaaa-aaaa-000000000013');

-- ────────────────────────────────────────────────────────────────
-- 9. TASKS  (3 weeks × 3/3/2 tasks = 8 tasks)
-- ────────────────────────────────────────────────────────────────
insert into public.tasks (id, challenge_id, title, description, points, start_week, week_number, category, icon, is_active) values
  -- Week 1
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000301', 'aaaabbbb-aaaa-aaaa-aaaa-000000000201',
   'Morning Walk', 'Take a 20-min walk before 10am. Upload a photo from your walk.', 10, 1, 1, 'Movement', '🚶', true),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000302', 'aaaabbbb-aaaa-aaaa-aaaa-000000000201',
   'Drink 8 Glasses', 'Drink at least 8 glasses of water today. Snap your water bottle.', 5, 1, 1, 'Nutrition', '💧', true),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000303', 'aaaabbbb-aaaa-aaaa-aaaa-000000000201',
   'Eat Fruits', 'Include at least 2 servings of whole fruits in your meals today.', 10, 1, 1, 'Nutrition', '🍎', true),
  -- Week 2
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000304', 'aaaabbbb-aaaa-aaaa-aaaa-000000000201',
   'Yoga Session', 'Complete a 20-min yoga or stretching session. Photo or video proof.', 15, 2, 2, 'Movement', '🧘', true),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000305', 'aaaabbbb-aaaa-aaaa-aaaa-000000000201',
   'No Junk Food', 'Avoid all processed snacks and fast food for the day. Log your meals.', 10, 2, 2, 'Nutrition', '🥗', true),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000306', 'aaaabbbb-aaaa-aaaa-aaaa-000000000201',
   'Cook a Healthy Recipe', 'Cook one home meal with whole ingredients. Show us the dish!', 10, 2, 2, 'Nutrition', '🍲', true),
  -- Week 3 (current)
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000307', 'aaaabbbb-aaaa-aaaa-aaaa-000000000201',
   'Evening Run', 'Run or jog for at least 2km after 5pm. Share your fitness tracker screenshot.', 20, 3, 3, 'Movement', '🏃', true),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000308', 'aaaabbbb-aaaa-aaaa-aaaa-000000000201',
   'Daily Journal', 'Write 3 things you are grateful for today. Photo of your journal.', 10, 3, 3, 'Mindfulness', '📓', true);

-- ────────────────────────────────────────────────────────────────
-- 10. TASK SUBMISSIONS
-- Week 1 (Apr 7) — most approved, 2 rejected, 1 missed
-- Week 2 (Apr 14) — mix of approved and pending
-- Week 3 (Apr 19) — pending (today, admin needs to review)
-- ────────────────────────────────────────────────────────────────

-- WEEK 1 APPROVED SUBMISSIONS ──────────────────────────────────

-- Arjun: walk✓ water✓ fruits✓
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000301','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000101','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 07:30:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Arjun+Walk+W1',10),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000302','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000101','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 12:00:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Arjun+Water+W1',5),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000303','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000101','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 13:30:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Arjun+Fruits+W1',10);

-- Priya: walk✓ fruits✓ (skipped water)
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000301','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000102','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 08:00:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Priya+Walk+W1',10),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000303','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000102','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 13:00:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Priya+Fruits+W1',10);

-- Rahul: walk✓ water✓
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000301','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000103','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 09:00:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Rahul+Walk+W1',10),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000302','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000103','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 12:30:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Rahul+Water+W1',5);

-- Sneha: walk✓ water✓ fruits✓
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000301','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000104','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 07:45:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Sneha+Walk+W1',10),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000302','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000104','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 11:00:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Sneha+Water+W1',5),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000303','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000104','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 13:00:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Sneha+Fruits+W1',10);

-- Kiran: walk✓ water✓ fruits✓
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000301','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000105','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 07:15:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Kiran+Walk+W1',10),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000302','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000105','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 11:30:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Kiran+Water+W1',5),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000303','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000105','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 13:45:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Kiran+Fruits+W1',10);

-- Divya: walk✓ water✓
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000301','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000106','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 08:30:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Divya+Walk+W1',10),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000302','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000106','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 12:00:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Divya+Water+W1',5);

-- Amit: walk✓  water→REJECTED (blurry photo)
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000301','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000107','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 09:30:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Amit+Walk+W1',10),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000302','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000107','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 14:00:00+05:30','2026-04-07','rejected',null,null);

-- set rejection reason for Amit water
update public.task_submissions set rejection_reason = 'Photo is too blurry to verify. Please resubmit with a clearer photo.'
where user_id = 'aaaabbbb-aaaa-aaaa-aaaa-000000000107'
  and task_id  = 'aaaabbbb-aaaa-aaaa-aaaa-000000000302'
  and status   = 'rejected';

-- Meera: walk✓ water✓ fruits✓
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000301','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000108','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 07:00:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Meera+Walk+W1',10),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000302','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000108','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 11:00:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Meera+Water+W1',5),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000303','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000108','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 13:15:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Meera+Fruits+W1',10);

-- Ravi: walk✓ water✓ fruits✓
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000301','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000109','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 08:00:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Ravi+Walk+W1',10),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000302','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000109','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 12:00:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Ravi+Water+W1',5),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000303','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000109','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 13:30:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Ravi+Fruits+W1',10);

-- Anjali: walk✓ fruits✓ (skipped water)
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000301','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000110','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 09:00:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Anjali+Walk+W1',10),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000303','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000110','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-07 13:00:00+05:30','2026-04-07','approved','https://placehold.co/600x400?text=Anjali+Fruits+W1',10);

-- WEEK 2 APPROVED SUBMISSIONS ──────────────────────────────────

-- Arjun: yoga✓ nojunk✓
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000304','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000101','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 07:00:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Arjun+Yoga+W2',15),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000305','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000101','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 20:00:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Arjun+NoJunk+W2',10);

-- Priya: yoga✓ nojunk✓ recipe✓
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000304','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000102','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 06:30:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Priya+Yoga+W2',15),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000305','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000102','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 20:30:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Priya+NoJunk+W2',10),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000306','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000102','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 19:00:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Priya+Recipe+W2',10);

-- Rahul: nojunk✓  yoga→REJECTED (not a yoga photo)
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000305','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000103','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 21:00:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Rahul+NoJunk+W2',10),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000304','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000103','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 07:30:00+05:30','2026-04-14','rejected',null,null);

update public.task_submissions set rejection_reason = 'This does not appear to be a yoga session. Please submit a clear photo of your practice.'
where user_id = 'aaaabbbb-aaaa-aaaa-aaaa-000000000103'
  and task_id  = 'aaaabbbb-aaaa-aaaa-aaaa-000000000304'
  and status   = 'rejected';

-- Sneha: yoga✓
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000304','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000104','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 06:00:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Sneha+Yoga+W2',15);

-- Kiran: yoga✓ nojunk✓ recipe✓
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000304','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000105','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 05:45:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Kiran+Yoga+W2',15),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000305','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000105','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 20:15:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Kiran+NoJunk+W2',10),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000306','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000105','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 19:30:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Kiran+Recipe+W2',10);

-- Divya: yoga✓ nojunk✓
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000304','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000106','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 07:00:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Divya+Yoga+W2',15),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000305','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000106','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 21:00:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Divya+NoJunk+W2',10);

-- Amit: nojunk✓
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000305','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000107','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 20:45:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Amit+NoJunk+W2',10);

-- Meera: yoga✓ nojunk✓ recipe✓
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000304','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000108','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 06:15:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Meera+Yoga+W2',15),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000305','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000108','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 20:30:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Meera+NoJunk+W2',10),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000306','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000108','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 19:15:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Meera+Recipe+W2',10);

-- Ravi: yoga✓ nojunk✓
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000304','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000109','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 07:00:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Ravi+Yoga+W2',15),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000305','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000109','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 20:00:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Ravi+NoJunk+W2',10);

-- Anjali: nojunk✓
insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000305','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000110','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-14 21:00:00+05:30','2026-04-14','approved','https://placehold.co/600x400?text=Anjali+NoJunk+W2',10);

-- WEEK 3 PENDING SUBMISSIONS (today — admin needs to review these) ─────────

insert into public.task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_url, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000307','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000101','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-19 18:30:00+05:30','2026-04-19','pending','https://placehold.co/600x400?text=Arjun+Run+W3',null),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000308','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000102','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-19 21:00:00+05:30','2026-04-19','pending','https://placehold.co/600x400?text=Priya+Journal+W3',null),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000307','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000105','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-19 19:00:00+05:30','2026-04-19','pending','https://placehold.co/600x400?text=Kiran+Run+W3',null),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000307','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000108','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-19 18:45:00+05:30','2026-04-19','pending','https://placehold.co/600x400?text=Meera+Run+W3',null),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000308','aaaabbbb-aaaa-aaaa-aaaa-000000000201','aaaabbbb-aaaa-aaaa-aaaa-000000000109','aaaabbbb-aaaa-aaaa-aaaa-000000000001','2026-04-19 21:30:00+05:30','2026-04-19','pending','https://placehold.co/600x400?text=Ravi+Journal+W3',null);

-- ────────────────────────────────────────────────────────────────
-- 11. POINTS TRANSACTIONS  (one per approved submission)
-- ────────────────────────────────────────────────────────────────
insert into public.points_transactions (user_id, org_id, amount, reason, is_manual) values
  -- Arjun: 25 (W1) + 25 (W2) = 50
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000101','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000101','aaaabbbb-aaaa-aaaa-aaaa-000000000001',5, 'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000101','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000101','aaaabbbb-aaaa-aaaa-aaaa-000000000001',15,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000101','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  -- Priya: 20 (W1) + 35 (W2) = 55
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000102','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000102','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000102','aaaabbbb-aaaa-aaaa-aaaa-000000000001',15,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000102','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000102','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  -- Rahul: 15 (W1) + 10 (W2) = 25
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000103','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000103','aaaabbbb-aaaa-aaaa-aaaa-000000000001',5, 'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000103','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  -- Sneha: 25 (W1) + 15 (W2) = 40
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000104','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000104','aaaabbbb-aaaa-aaaa-aaaa-000000000001',5, 'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000104','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000104','aaaabbbb-aaaa-aaaa-aaaa-000000000001',15,'Task approved',false),
  -- Kiran: 25 (W1) + 35 (W2) = 60
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000105','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000105','aaaabbbb-aaaa-aaaa-aaaa-000000000001',5, 'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000105','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000105','aaaabbbb-aaaa-aaaa-aaaa-000000000001',15,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000105','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000105','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  -- Divya: 15 (W1) + 25 (W2) = 40
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000106','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000106','aaaabbbb-aaaa-aaaa-aaaa-000000000001',5, 'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000106','aaaabbbb-aaaa-aaaa-aaaa-000000000001',15,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000106','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  -- Amit: 10 (W1) + 10 (W2) = 20
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000107','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000107','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  -- Meera: 25 (W1) + 35 (W2) = 60
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000108','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000108','aaaabbbb-aaaa-aaaa-aaaa-000000000001',5, 'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000108','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000108','aaaabbbb-aaaa-aaaa-aaaa-000000000001',15,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000108','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000108','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  -- Ravi: 25 (W1) + 25 (W2) = 50
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000109','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000109','aaaabbbb-aaaa-aaaa-aaaa-000000000001',5, 'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000109','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000109','aaaabbbb-aaaa-aaaa-aaaa-000000000001',15,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000109','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  -- Anjali: 20 (W1) + 10 (W2) = 30
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000110','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000110','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000110','aaaabbbb-aaaa-aaaa-aaaa-000000000001',10,'Task approved',false);

-- ────────────────────────────────────────────────────────────────
-- 12. UPDATE total_points on profiles
-- Leaderboard: Beta(180) > Alpha(170) > Gamma(80)
-- Individual: Kiran=Meera(60) > Priya(55) > Arjun=Ravi(50) > Sneha=Divya(40) > Anjali(30) > Rahul(25) > Amit(20)
-- ────────────────────────────────────────────────────────────────
update public.profiles set total_points = 50  where id = 'aaaabbbb-aaaa-aaaa-aaaa-000000000101'; -- Arjun
update public.profiles set total_points = 55  where id = 'aaaabbbb-aaaa-aaaa-aaaa-000000000102'; -- Priya
update public.profiles set total_points = 25  where id = 'aaaabbbb-aaaa-aaaa-aaaa-000000000103'; -- Rahul
update public.profiles set total_points = 40  where id = 'aaaabbbb-aaaa-aaaa-aaaa-000000000104'; -- Sneha
update public.profiles set total_points = 60  where id = 'aaaabbbb-aaaa-aaaa-aaaa-000000000105'; -- Kiran
update public.profiles set total_points = 40  where id = 'aaaabbbb-aaaa-aaaa-aaaa-000000000106'; -- Divya
update public.profiles set total_points = 20  where id = 'aaaabbbb-aaaa-aaaa-aaaa-000000000107'; -- Amit
update public.profiles set total_points = 60  where id = 'aaaabbbb-aaaa-aaaa-aaaa-000000000108'; -- Meera
update public.profiles set total_points = 50  where id = 'aaaabbbb-aaaa-aaaa-aaaa-000000000109'; -- Ravi
update public.profiles set total_points = 30  where id = 'aaaabbbb-aaaa-aaaa-aaaa-000000000110'; -- Anjali

-- ────────────────────────────────────────────────────────────────
-- 13. FEED ITEMS
-- ────────────────────────────────────────────────────────────────
insert into public.feed_items (id, org_id, type, title, content, author_id, challenge_id, pinned, is_auto_generated, created_at) values
  -- Pinned announcement
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000501',
   'aaaabbbb-aaaa-aaaa-aaaa-000000000001',
   'announcement',
   '🚀 Health Sprint 2026 is LIVE!',
   'Welcome to Week 1 of Health Sprint 2026! Complete your daily tasks, earn points, and help your team climb the leaderboard. Remember — consistency beats perfection. Let''s go! 💪',
   null,
   'aaaabbbb-aaaa-aaaa-aaaa-000000000201',
   true, false,
   '2026-04-05 09:00:00+05:30'),
  -- Milestone at end of week 1
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000502',
   'aaaabbbb-aaaa-aaaa-aaaa-000000000001',
   'milestone',
   '🏆 Week 1 Wrap-Up — Beta Bulls lead!',
   'Week 1 is complete! Beta Bulls are ahead with 95 pts, Alpha Wolves at 90 pts, and Gamma Gladiators at 55 pts. Week 2 starts now — yoga and nutrition tasks are unlocked. Keep pushing!',
   null,
   'aaaabbbb-aaaa-aaaa-aaaa-000000000201',
   false, true,
   '2026-04-12 09:00:00+05:30'),
  -- General post from Arjun
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000503',
   'aaaabbbb-aaaa-aaaa-aaaa-000000000001',
   'general',
   'Team tip: batch-cook on Sundays 🍲',
   'Hey team, for the "Cook a Healthy Recipe" task this week — try batch-cooking on Sunday! Makes it way easier to keep the streak going on busy weekdays. Share your meal prep wins below!',
   'aaaabbbb-aaaa-aaaa-aaaa-000000000101',
   null,
   false, false,
   '2026-04-12 11:30:00+05:30'),
  -- Achievement auto-generated
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000504',
   'aaaabbbb-aaaa-aaaa-aaaa-000000000001',
   'achievement',
   '⭐ Kiran Kumar hit 60 points!',
   'Kiran Kumar from Beta Bulls has crossed the 60-point mark — the first member to reach this milestone. Incredible consistency! 🔥',
   null,
   'aaaabbbb-aaaa-aaaa-aaaa-000000000201',
   false, true,
   '2026-04-18 20:00:00+05:30'),
  -- Leaderboard change
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000505',
   'aaaabbbb-aaaa-aaaa-aaaa-000000000001',
   'leaderboard_change',
   '📊 Week 3 Leaderboard Update',
   'After 2 full weeks: Beta Bulls 180 pts 🥇 | Alpha Wolves 170 pts 🥈 | Gamma Gladiators 80 pts 🥉. Week 3 tasks are now live — the Evening Run is worth 20 pts, so don''t miss it!',
   null,
   'aaaabbbb-aaaa-aaaa-aaaa-000000000201',
   false, true,
   '2026-04-19 09:00:00+05:30');

-- ────────────────────────────────────────────────────────────────
-- 14. FEED REACTIONS
-- ────────────────────────────────────────────────────────────────
insert into public.feed_reactions (post_id, user_id, reaction) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000501','aaaabbbb-aaaa-aaaa-aaaa-000000000101','fire'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000501','aaaabbbb-aaaa-aaaa-aaaa-000000000102','fire'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000501','aaaabbbb-aaaa-aaaa-aaaa-000000000105','broccoli'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000501','aaaabbbb-aaaa-aaaa-aaaa-000000000108','star'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000502','aaaabbbb-aaaa-aaaa-aaaa-000000000105','fire'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000502','aaaabbbb-aaaa-aaaa-aaaa-000000000106','fire'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000503','aaaabbbb-aaaa-aaaa-aaaa-000000000102','heart'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000503','aaaabbbb-aaaa-aaaa-aaaa-000000000104','broccoli'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000503','aaaabbbb-aaaa-aaaa-aaaa-000000000108','heart'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000504','aaaabbbb-aaaa-aaaa-aaaa-000000000101','star'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000504','aaaabbbb-aaaa-aaaa-aaaa-000000000109','fire'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000505','aaaabbbb-aaaa-aaaa-aaaa-000000000103','broccoli'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000505','aaaabbbb-aaaa-aaaa-aaaa-000000000107','fire');

-- ────────────────────────────────────────────────────────────────
-- 15. EVENTS
-- ────────────────────────────────────────────────────────────────
insert into public.events (id, org_id, title, description, type, points, location, start_time, end_time, is_active, status, created_at) values
  -- Completed quiz
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000401',
   'aaaabbbb-aaaa-aaaa-aaaa-000000000001',
   'Nutrition Knowledge Quiz 🧠',
   'Test your knowledge on macronutrients, meal timing, and hydration. Top scorers earn bonus points!',
   'quiz', 25, null,
   '2026-04-10 18:00:00+05:30',
   '2026-04-10 19:00:00+05:30',
   false, 'completed',
   '2026-04-05 09:00:00+05:30'),
  -- Upcoming offline event
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000402',
   'aaaabbbb-aaaa-aaaa-aaaa-000000000001',
   'Group Park Walk 🌳',
   'Join us for a 5km group walk at Cubbon Park. Bring your water bottle! Points awarded on attendance.',
   'offline', 30, 'Cubbon Park, Bengaluru',
   '2026-04-26 07:00:00+05:30',
   '2026-04-26 09:00:00+05:30',
   true, 'upcoming',
   '2026-04-15 09:00:00+05:30');

-- ────────────────────────────────────────────────────────────────
-- 16. EVENT PARTICIPATIONS  (quiz — 6 attendees, 25 pts each)
-- ────────────────────────────────────────────────────────────────
insert into public.event_participations (event_id, user_id, points_awarded) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000401','aaaabbbb-aaaa-aaaa-aaaa-000000000101',25),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000401','aaaabbbb-aaaa-aaaa-aaaa-000000000102',25),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000401','aaaabbbb-aaaa-aaaa-aaaa-000000000105',25),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000401','aaaabbbb-aaaa-aaaa-aaaa-000000000106',25),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000401','aaaabbbb-aaaa-aaaa-aaaa-000000000108',25),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000401','aaaabbbb-aaaa-aaaa-aaaa-000000000109',25);

-- ────────────────────────────────────────────────────────────────
-- 17. ORG POLICIES
-- ────────────────────────────────────────────────────────────────
insert into public.policies (id, org_id, name, content, color_index) values
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000601',
   'aaaabbbb-aaaa-aaaa-aaaa-000000000001',
   'Submission Guidelines',
   'All task proof photos must clearly show the activity being performed. Blurry, unrelated, or misleading photos will be rejected. Members may resubmit rejected tasks within the same week. Each task may only be submitted once per day unless the admin enables resubmission.',
   0),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000602',
   'aaaabbbb-aaaa-aaaa-aaaa-000000000001',
   'Community Code of Conduct',
   'Pixel Labs Health Sprint is a supportive community challenge. Please keep team chat and feed respectful and encouraging. Any form of harassment or cheating (e.g. submitting fake proof) will result in disqualification and removal from the challenge.',
   1);

-- ────────────────────────────────────────────────────────────────
-- 18. TEAM MESSAGES  (a few per team to test chat)
-- ────────────────────────────────────────────────────────────────
insert into public.messages (team_id, user_id, content, created_at) values
  -- Alpha Wolves
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000011','aaaabbbb-aaaa-aaaa-aaaa-000000000101','Good morning Wolves! Let''s get those walks in early today 🚶‍♂️','2026-04-07 06:45:00+05:30'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000011','aaaabbbb-aaaa-aaaa-aaaa-000000000102','Just finished mine! 3km in 28 min 💪','2026-04-07 08:05:00+05:30'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000011','aaaabbbb-aaaa-aaaa-aaaa-000000000103','Heading out now, see you all at the top of the leaderboard 😄','2026-04-07 09:10:00+05:30'),
  -- Beta Bulls
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000012','aaaabbbb-aaaa-aaaa-aaaa-000000000105','Bulls, we are crushing it this week! 3 tasks done already','2026-04-14 21:00:00+05:30'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000012','aaaabbbb-aaaa-aaaa-aaaa-000000000108','Cooked my first ever dal tadka for the recipe task 🍲 so proud haha','2026-04-14 19:30:00+05:30'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000012','aaaabbbb-aaaa-aaaa-aaaa-000000000106','Amazing! Let''s keep the pressure on this week 🔥','2026-04-14 21:15:00+05:30'),
  -- Gamma Gladiators
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000013','aaaabbbb-aaaa-aaaa-aaaa-000000000109','We need to pick up pace this week Gladiators, Alpha is close on points','2026-04-14 22:00:00+05:30'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000013','aaaabbbb-aaaa-aaaa-aaaa-000000000110','Agreed! The run task this week is 20 pts — that''s a big one 🏃‍♀️','2026-04-19 10:00:00+05:30');

-- ────────────────────────────────────────────────────────────────
-- 19. INVITE WHITELIST
-- 3 used (already joined members — for testing invite history)
-- 3 pending (for testing invite flow from dashboard + mobile)
-- ────────────────────────────────────────────────────────────────
insert into public.invite_whitelist (org_id, email, team_id, role, used_at) values
  -- Used invites (early members)
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000001','arjun@test.tnl',    'aaaabbbb-aaaa-aaaa-aaaa-000000000011','captain',      now() - interval '20 days'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000001','kiran@test.tnl',    'aaaabbbb-aaaa-aaaa-aaaa-000000000012','captain',      now() - interval '20 days'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000001','ravi@test.tnl',     'aaaabbbb-aaaa-aaaa-aaaa-000000000013','captain',      now() - interval '20 days');

insert into public.invite_whitelist (org_id, email, team_id, role) values
  -- Pending invites (use these to test sign-up flow)
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000001','newmember1@test.tnl','aaaabbbb-aaaa-aaaa-aaaa-000000000011','member'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000001','newmember2@test.tnl','aaaabbbb-aaaa-aaaa-aaaa-000000000012','member'),
  ('aaaabbbb-aaaa-aaaa-aaaa-000000000001','newmember3@test.tnl','aaaabbbb-aaaa-aaaa-aaaa-000000000013','member');

-- ════════════════════════════════════════════════════════════════
-- DONE! Summary:
-- ────────────────────────────────────────────────────────────────
-- Org:          Pixel Labs (slug: pixel-labs)
-- Teams:        Alpha Wolves | Beta Bulls | Gamma Gladiators
-- Members:      10 test profiles (is_test=true → OTP 123456)
-- Challenge:    Health Sprint 2026 (active, started Apr 5, week 3 now)
-- Tasks:        8 tasks across 3 weeks
-- Submissions:  ~40 rows — approved/rejected (W1+W2) + pending (W3)
-- Points:       Beta 180 > Alpha 170 > Gamma 80
-- Feed:         5 posts (announcement, milestone, general, achievement, leaderboard)
-- Events:       1 completed quiz + 1 upcoming walk
-- Policies:     2 org policies
-- Messages:     8 team chat messages
-- Invites:      3 used + 3 pending (newmember1/2/3@test.tnl)
-- ════════════════════════════════════════════════════════════════
