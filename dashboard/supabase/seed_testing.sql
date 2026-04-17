-- ================================================================
-- Yi Nutrition League — Testing Seed Data (REVISED V3)
-- 1 Org, 2 Teams, 10 Members, Submissions, Feed, Policies, Invites
-- ================================================================

do $seed$
declare
  -- ── IDs (using 'b' prefix for testing range) ──────────────────
  v_org  uuid := 'b0000000-0000-0000-0000-000000000001'; -- Test Org
  v_ad   uuid := 'ba000000-0000-0000-0000-000000000002'; -- Test Org Admin
  
  -- Teams
  v_tA   uuid := 'b3000000-0000-0000-0000-000000000001'; -- Team Apple
  v_tB   uuid := 'b3000000-0000-0000-0000-000000000002'; -- Team Banana
  
  -- Members (Team A)
  v_u1   uuid := 'b2000000-0000-0000-0000-000000000001'; -- Alice (Captain A)
  v_u2   uuid := 'b2000000-0000-0000-0000-000000000002'; -- Bob
  v_u3   uuid := 'b2000000-0000-0000-0000-000000000003'; -- Charlie
  v_u4   uuid := 'b2000000-0000-0000-0000-000000000004'; -- David
  v_u5   uuid := 'b2000000-0000-0000-0000-000000000005'; -- Eve
  
  -- Members (Team B)
  v_u6   uuid := 'b2000000-0000-0000-0000-000000000006'; -- Frank (Captain B)
  v_u7   uuid := 'b2000000-0000-0000-0000-000000000007'; -- Grace
  v_u8   uuid := 'b2000000-0000-0000-0000-000000000008'; -- Heidi
  v_u9   uuid := 'b2000000-0000-0000-0000-000000000009'; -- Ivan
  v_u10  uuid := 'b2000000-0000-0000-0000-000000000010'; -- Judy

  -- Challenge & Tasks
  v_ch   uuid := 'b4000000-0000-0000-0000-000000000001'; -- Launch Challenge
  v_tkT  uuid := 'b5000000-0000-0000-0000-000000000001'; -- Daily Journal (Text)
  v_tkI  uuid := 'b5000000-0000-0000-0000-000000000002'; -- Meal Photo (Image)
  
begin

  -- NOTE: This script is ADDITIVE. It does NOT delete your Super Admin.

  -- 1. Create Organization
  insert into organizations (id, name, slug, logo, country, timezone, is_active)
  values (v_org, 'Test Production Org', 'test-prod', '🚀', 'IN', 'Asia/Kolkata', true)
  on conflict (id) do nothing;

  -- 2. Create Org Admin (Dashboard access for this specific Org)
  insert into admin_users (id, org_id, role, name, email, status, avatar_color)
  values (v_ad, v_org, 'org_admin', 'Test Admin', 'admin@test.com', 'active', '#059669')
  on conflict (id) do nothing;

  -- 3. Create Teams
  insert into teams (id, org_id, name, emoji, color) values
    (v_tA, v_org, 'Team Apple',  '🍎', '#ef4444'),
    (v_tB, v_org, 'Team Banana', '🍌', '#f59e0b')
  on conflict (id) do nothing;

  -- 4. Create Profiles (Mobile App access)
  insert into profiles (id, org_id, name, email, avatar_color) values
    (v_u1, v_org, 'Alice (Capt A)', 'alice@test.com', '#3b82f6'),
    (v_u2, v_org, 'Bob',            'bob@test.com',   '#ef4444'),
    (v_u3, v_org, 'Charlie',        'charlie@test.com','#10b981'),
    (v_u4, v_org, 'David',          'david@test.com',  '#f59e0b'),
    (v_u5, v_org, 'Eve',            'eve@test.com',    '#8b5cf6'),
    (v_u6, v_org, 'Frank (Capt B)', 'frank@test.com',  '#ec4899'),
    (v_u7, v_org, 'Grace',          'grace@test.com',  '#06b6d4'),
    (v_u8, v_org, 'Heidi',          'heidi@test.com',  '#84cc16'),
    (v_u9, v_org, 'Ivan',           'ivan@test.com',   '#f97316'),
    (v_u10,v_org, 'Judy',           'judy@test.com',   '#14b8a6')
  on conflict (id) do nothing;

  -- 5. Link Org Members (Official membership)
  insert into org_members (org_id, user_id, role) values
    (v_org, v_u1, 'member'), (v_org, v_u2, 'member'), (v_org, v_u3, 'member'), (v_org, v_u4, 'member'), (v_org, v_u5, 'member'),
    (v_org, v_u6, 'member'), (v_org, v_u7, 'member'), (v_org, v_u8, 'member'), (v_org, v_u9, 'member'), (v_org, v_u10,'member')
  on conflict (org_id, user_id) do nothing;

  -- 6. Link Team Members
  insert into team_members (team_id, user_id, org_id, role) values
    (v_tA, v_u1, v_org, 'captain'), (v_tA, v_u2, v_org, 'member'), (v_tA, v_u3, v_org, 'member'), (v_tA, v_u4, v_org, 'member'), (v_tA, v_u5, v_org, 'member'),
    (v_tB, v_u6, v_org, 'captain'), (v_tB, v_u7, v_org, 'member'), (v_tB, v_u8, v_org, 'member'), (v_tB, v_u9, v_org, 'member'), (v_tB, v_u10,v_org, 'member')
  on conflict (team_id, user_id) do nothing;

  -- 6. Create Challenge & Tasks
  insert into challenges (id, org_id, name, description, status, start_date, end_date)
  values (v_ch, v_org, 'Launch Habits', 'Building the core testing habits.', 'active', current_date - interval '2 days', current_date + interval '28 days')
  on conflict (id) do nothing;

  insert into challenge_teams (challenge_id, team_id) values (v_ch, v_tA), (v_ch, v_tB)
  on conflict (challenge_id, team_id) do nothing;

  insert into tasks (id, challenge_id, title, description, points, start_week, week_number, category, icon) values
    (v_tkT, v_ch, 'Daily Journal', 'Write 100 words about your day.', 20, 1, 1, 'Mindfulness', '📝'),
    (v_tkI, v_ch, 'Meal Photo',    'Upload a photo of your healthy lunch.', 30, 1, 1, 'Nutrition',   '📸')
  on conflict (id) do nothing;

  -- 7. Submissions
  -- Pending
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, status, proof_type, notes) values
    (v_tkT, v_ch, v_u1, v_org, now(), 'pending', 'text', 'My first journal entry for testing!'),
    (v_tkI, v_ch, v_u2, v_org, now(), 'pending', 'image', 'Checking the image proof workflow.');

  -- Approved (Alice reviewed Charlie)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, status, proof_type, points_awarded, reviewed_at, reviewed_by) values
    (v_tkT, v_ch, v_u3, v_org, now() - interval '1 day', 'approved', 'text', 20, now(), v_u1);
  update profiles set total_points = 20 where id = v_u3;

  -- Rejected (Alice rejected David)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, status, proof_type, rejection_reason, reviewed_at, reviewed_by) values
    (v_tkI, v_ch, v_u4, v_org, now() - interval '1 day', 'rejected', 'image', 'Image is blurred, please re-upload.', now(), v_u1);

  -- 8. Points History (Manual Adjustment)
  insert into points_transactions (user_id, org_id, amount, reason, awarded_by, is_manual) values
    (v_u5, v_org, 50, 'Bonus points for testing', v_u1, true);
  update profiles set total_points = 50 where id = v_u5;

  -- 9. Feed Items (One for each category)
  insert into feed_items (org_id, type, title, content, author_id, pinned, is_auto_generated) values
    (v_org, 'announcement', 'Welcome to the Team!', 'We are launching the testing phase today.', v_u1, true, false),
    (v_org, 'achievement', 'New Milestone', 'Alice has completed 10 tasks!', null, false, true),
    (v_org, 'leaderboard_change', 'Team Update', 'Team Banana is climbing the ranks!', null, false, true),
    (v_org, 'quiz_result', 'Quiz Stats', 'Average score for the last quiz was 8.5.', null, false, true),
    (v_org, 'milestone', 'All-Team Goal', 'We have collectively logged 1000 liters of water!', null, false, true),
    (v_org, 'general', 'Healthy Living', 'Don''t forget to stay hydrated!', v_u1, false, false);

  -- 10. Policies
  insert into policies (org_id, name, color_index, content) values
    (v_org, 'Platform Privacy', 0, '<h2>Privacy</h2><p>Your test data is secure.</p>'),
    (v_org, 'Fair Play Rules', 1, '<h2>Rules</h2><p>Maintain integrity during testing.</p>');

  -- 11. Invite Whitelist (Pending & Accepted)
  insert into invite_whitelist (org_id, email, team_id, role, invited_by, used_at) values
    (v_org, 'new.member@test.com', v_tA, 'member', v_u1, null),
    (v_org, 'alice@test.com',      v_tA, 'member', v_u1, now());

end;
$seed$;
