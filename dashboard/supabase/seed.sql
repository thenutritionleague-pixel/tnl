-- ================================================================
-- Yi Nutrition League — Seed Data  (Phase 2 — fully updated)
-- Run AFTER schema.sql in Supabase → SQL Editor → New Query
-- ================================================================

do $seed$
declare
  -- ── Organizations ──────────────────────────────────────────────
  v_org1 uuid := '10000000-0000-0000-0000-000000000001'; -- Young Indians Mumbai
  v_org2 uuid := '10000000-0000-0000-0000-000000000002'; -- Young Indians Delhi
  v_org3 uuid := '10000000-0000-0000-0000-000000000003'; -- Young Indians Bangalore

  -- ── Admin Users (dashboard logins) ────────────────────────────
  -- user_id stays NULL until you link to auth.users (see post-seed steps)
  v_ad1  uuid := 'a0000000-0000-0000-0000-000000000001'; -- Super Admin       (platform)
  v_ad2  uuid := 'a0000000-0000-0000-0000-000000000002'; -- Rahul Mehta       (Mumbai org_admin)
  v_ad3  uuid := 'a0000000-0000-0000-0000-000000000003'; -- Vikram Sharma     (Delhi org_admin)
  v_ad4  uuid := 'a0000000-0000-0000-0000-000000000004'; -- Preethi Nair      (Bangalore org_admin)

  -- ── Profiles (mobile app users) ───────────────────────────────
  -- Mumbai org members
  v_u01 uuid := '20000000-0000-0000-0000-000000000001'; -- Rahul Mehta        (org pool)
  v_u02 uuid := '20000000-0000-0000-0000-000000000002'; -- Arjun Shah         (Team Alpha captain)
  v_u03 uuid := '20000000-0000-0000-0000-000000000003'; -- Riya Kapoor        (Team Alpha vice_captain)
  v_u04 uuid := '20000000-0000-0000-0000-000000000004'; -- Pooja Joshi        (Team Alpha member)
  v_u05 uuid := '20000000-0000-0000-0000-000000000005'; -- Arun Sharma        (Team Alpha member)
  v_u06 uuid := '20000000-0000-0000-0000-000000000006'; -- Neha Verma         (Team Alpha member)
  v_u07 uuid := '20000000-0000-0000-0000-000000000007'; -- Rahul Das          (Team Alpha member)
  v_u08 uuid := '20000000-0000-0000-0000-000000000008'; -- Meera Nair         (Team Beta captain)
  v_u09 uuid := '20000000-0000-0000-0000-000000000009'; -- Sahil Joshi        (Team Beta vice_captain)
  v_u10 uuid := '20000000-0000-0000-0000-000000000010'; -- Karan Mehta        (Team Beta member)
  v_u11 uuid := '20000000-0000-0000-0000-000000000011'; -- Divya Pillai       (Team Beta member)
  v_u12 uuid := '20000000-0000-0000-0000-000000000012'; -- Yash Rao           (Team Beta member)
  v_u13 uuid := '20000000-0000-0000-0000-000000000013'; -- Rohan Gupta        (Team Gamma captain)
  v_u14 uuid := '20000000-0000-0000-0000-000000000014'; -- Tara Mehta         (Team Gamma vice_captain)
  v_u15 uuid := '20000000-0000-0000-0000-000000000015'; -- Sana Khan          (Team Gamma member)
  v_u16 uuid := '20000000-0000-0000-0000-000000000016'; -- Dev Kumar          (Team Gamma member)
  v_u17 uuid := '20000000-0000-0000-0000-000000000017'; -- Priya Singh        (Team Delta captain)
  v_u18 uuid := '20000000-0000-0000-0000-000000000018'; -- Aakash Rao         (Team Delta vice_captain)
  v_u19 uuid := '20000000-0000-0000-0000-000000000019'; -- Ishaan Patel       (Team Delta member)
  v_u20 uuid := '20000000-0000-0000-0000-000000000020'; -- Fatima Ali         (Team Delta member)
  v_u21 uuid := '20000000-0000-0000-0000-000000000021'; -- Om Sharma          (Team Delta member)
  v_u22 uuid := '20000000-0000-0000-0000-000000000022'; -- Vikram Das         (Team Epsilon captain)
  v_u23 uuid := '20000000-0000-0000-0000-000000000023'; -- Nisha Pillai       (Team Epsilon vice_captain)
  v_u24 uuid := '20000000-0000-0000-0000-000000000024'; -- Ankit Jain         (Team Epsilon member)
  v_u25 uuid := '20000000-0000-0000-0000-000000000025'; -- Ananya Rao         (Team Zeta captain)
  v_u26 uuid := '20000000-0000-0000-0000-000000000026'; -- Dev Bose           (Team Zeta vice_captain)
  v_u27 uuid := '20000000-0000-0000-0000-000000000027'; -- Simran Kaur        (Team Zeta member)
  v_u28 uuid := '20000000-0000-0000-0000-000000000028'; -- Kabir Singh        (Team Zeta member)
  -- Unassigned (available pool — no team yet)
  v_u29 uuid := '20000000-0000-0000-0000-000000000029'; -- Zara Hassan
  v_u30 uuid := '20000000-0000-0000-0000-000000000030'; -- Raj Patel
  v_u31 uuid := '20000000-0000-0000-0000-000000000031'; -- Leena George
  v_u32 uuid := '20000000-0000-0000-0000-000000000032'; -- Aryan Kapoor
  v_u33 uuid := '20000000-0000-0000-0000-000000000033'; -- Meghna Rao
  -- Delhi + Bangalore org admins (profiles for mobile login)
  v_u34 uuid := '20000000-0000-0000-0000-000000000034'; -- Vikram Sharma      (Delhi admin)
  v_u35 uuid := '20000000-0000-0000-0000-000000000035'; -- Preethi Nair       (Bangalore admin)

  -- ── Teams (Mumbai only) ────────────────────────────────────────
  v_t1 uuid := '30000000-0000-0000-0000-000000000001'; -- Team Alpha
  v_t2 uuid := '30000000-0000-0000-0000-000000000002'; -- Team Beta
  v_t3 uuid := '30000000-0000-0000-0000-000000000003'; -- Team Gamma
  v_t4 uuid := '30000000-0000-0000-0000-000000000004'; -- Team Delta
  v_t5 uuid := '30000000-0000-0000-0000-000000000005'; -- Team Epsilon
  v_t6 uuid := '30000000-0000-0000-0000-000000000006'; -- Team Zeta

  -- ── Challenges (Mumbai) ────────────────────────────────────────
  v_ch1 uuid := '40000000-0000-0000-0000-000000000001'; -- Wellness April (active)
  v_ch2 uuid := '40000000-0000-0000-0000-000000000002'; -- Step Challenge May (upcoming)

  -- ── Tasks ─────────────────────────────────────────────────────
  -- v_tk1 = 20pts (Week 1), v_tk2 = 10pts (Week 1), v_tk3 = 10pts (Week 3)
  v_tk1 uuid := '50000000-0000-0000-0000-000000000001'; -- Morning Walk
  v_tk2 uuid := '50000000-0000-0000-0000-000000000002'; -- Hydration Log
  v_tk3 uuid := '50000000-0000-0000-0000-000000000003'; -- Mindful Eating

  -- ── Feed Items ────────────────────────────────────────────────
  v_p1  uuid := '60000000-0000-0000-0000-000000000001';
  v_p2  uuid := '60000000-0000-0000-0000-000000000002';
  v_p3  uuid := '60000000-0000-0000-0000-000000000003';
  v_p4  uuid := '60000000-0000-0000-0000-000000000004';
  v_p5  uuid := '60000000-0000-0000-0000-000000000005';
  v_p6  uuid := '60000000-0000-0000-0000-000000000006';
  v_p7  uuid := '60000000-0000-0000-0000-000000000007';
  v_p8  uuid := '60000000-0000-0000-0000-000000000008';

  -- ── Policies ──────────────────────────────────────────────────
  v_pol1 uuid := '70000000-0000-0000-0000-000000000001';
  v_pol2 uuid := '70000000-0000-0000-0000-000000000002';
  v_pol3 uuid := '70000000-0000-0000-0000-000000000003';

  -- ── Events (Mumbai) ───────────────────────────────────────────
  v_ev1 uuid := '80000000-0000-0000-0000-000000000001'; -- Nutrition Quiz (upcoming)
  v_ev2 uuid := '80000000-0000-0000-0000-000000000002'; -- Team Walk (upcoming)
  v_ev3 uuid := '80000000-0000-0000-0000-000000000003'; -- Wellness Workshop (completed)

begin

  -- ────────────────────────────────────────────────────────────────
  -- ORGANIZATIONS
  -- ────────────────────────────────────────────────────────────────
  insert into organizations (id, name, slug, logo, country, timezone, is_active, created_at) values
    (v_org1, 'Young Indians Mumbai',    'yi-mumbai',    '🏙️', 'IN', 'Asia/Kolkata', true,  '2026-01-15 00:00:00+00'),
    (v_org2, 'Young Indians Delhi',     'yi-delhi',     '🏛️', 'IN', 'Asia/Kolkata', true,  '2026-01-20 00:00:00+00'),
    (v_org3, 'Young Indians Bangalore', 'yi-bangalore', '🌳', 'IN', 'Asia/Kolkata', false, '2026-02-01 00:00:00+00')
  on conflict (id) do nothing;

  -- ────────────────────────────────────────────────────────────────
  -- ADMIN USERS  (dashboard logins — org_id NULL for platform-level)
  -- Link user_id to auth.users UUID after running post-seed steps below
  -- ────────────────────────────────────────────────────────────────
  insert into admin_users (id, user_id, org_id, role, name, email, status, avatar_color) values
    (v_ad1, null, null,   'super_admin', 'Super Admin',   'super@yi.com',                         'active', '#059669'),
    (v_ad2, null, v_org1, 'org_admin',   'Rahul Mehta',   'rahul.mehta@yi-mumbai.com',             'active', '#3b82f6'),
    (v_ad3, null, v_org2, 'org_admin',   'Vikram Sharma', 'vikram.sharma@yi-delhi.com',            'active', '#ef4444'),
    (v_ad4, null, v_org3, 'org_admin',   'Preethi Nair',  'preethi.nair@yi-bangalore.com',         'active', '#8b5cf6')
  on conflict (id) do nothing;

  -- ────────────────────────────────────────────────────────────────
  -- PROFILES  (mobile app users — org_id links them to their org)
  -- ────────────────────────────────────────────────────────────────
  insert into profiles (id, org_id, name, email, avatar_color) values
    -- Mumbai org members (v_org1)
    (v_u01, v_org1, 'Rahul Mehta',   'rahul.mehta@yi-mumbai.com',    '#059669'),
    (v_u02, v_org1, 'Arjun Shah',    'arjun.shah@yi-mumbai.com',     '#ef4444'),
    (v_u03, v_org1, 'Riya Kapoor',   'riya.kapoor@yi-mumbai.com',    '#3b82f6'),
    (v_u04, v_org1, 'Pooja Joshi',   'pooja.joshi@yi-mumbai.com',    '#f97316'),
    (v_u05, v_org1, 'Arun Sharma',   'arun.sharma@yi-mumbai.com',    '#14b8a6'),
    (v_u06, v_org1, 'Neha Verma',    'neha.verma@yi-mumbai.com',     '#8b5cf6'),
    (v_u07, v_org1, 'Rahul Das',     'rahul.das@yi-mumbai.com',      '#f59e0b'),
    (v_u08, v_org1, 'Meera Nair',    'meera.nair@yi-mumbai.com',     '#f59e0b'),
    (v_u09, v_org1, 'Sahil Joshi',   'sahil.joshi@yi-mumbai.com',    '#06b6d4'),
    (v_u10, v_org1, 'Karan Mehta',   'karan.mehta@yi-mumbai.com',    '#14b8a6'),
    (v_u11, v_org1, 'Divya Pillai',  'divya.pillai@yi-mumbai.com',   '#ec4899'),
    (v_u12, v_org1, 'Yash Rao',      'yash.rao@yi-mumbai.com',       '#10b981'),
    (v_u13, v_org1, 'Rohan Gupta',   'rohan.gupta@yi-mumbai.com',    '#ec4899'),
    (v_u14, v_org1, 'Tara Mehta',    'tara.mehta@yi-mumbai.com',     '#06b6d4'),
    (v_u15, v_org1, 'Sana Khan',     'sana.khan@yi-mumbai.com',      '#84cc16'),
    (v_u16, v_org1, 'Dev Kumar',     'dev.kumar@yi-mumbai.com',      '#f97316'),
    (v_u17, v_org1, 'Priya Singh',   'priya.singh@yi-mumbai.com',    '#8b5cf6'),
    (v_u18, v_org1, 'Aakash Rao',    'aakash.rao@yi-mumbai.com',     '#ef4444'),
    (v_u19, v_org1, 'Ishaan Patel',  'ishaan.patel@yi-mumbai.com',   '#14b8a6'),
    (v_u20, v_org1, 'Fatima Ali',    'fatima.ali@yi-mumbai.com',     '#f59e0b'),
    (v_u21, v_org1, 'Om Sharma',     'om.sharma@yi-mumbai.com',      '#10b981'),
    (v_u22, v_org1, 'Vikram Das',    'vikram.das@yi-mumbai.com',     '#3b82f6'),
    (v_u23, v_org1, 'Nisha Pillai',  'nisha.pillai@yi-mumbai.com',   '#f97316'),
    (v_u24, v_org1, 'Ankit Jain',    'ankit.jain@yi-mumbai.com',     '#ec4899'),
    (v_u25, v_org1, 'Ananya Rao',    'ananya.rao@yi-mumbai.com',     '#10b981'),
    (v_u26, v_org1, 'Dev Bose',      'dev.bose@yi-mumbai.com',       '#8b5cf6'),
    (v_u27, v_org1, 'Simran Kaur',   'simran.kaur@yi-mumbai.com',    '#f59e0b'),
    (v_u28, v_org1, 'Kabir Singh',   'kabir.singh@yi-mumbai.com',    '#ef4444'),
    -- Unassigned Mumbai members
    (v_u29, v_org1, 'Zara Hassan',   'zara.hassan@yi-mumbai.com',    '#ec4899'),
    (v_u30, v_org1, 'Raj Patel',     'raj.patel@yi-mumbai.com',      '#3b82f6'),
    (v_u31, v_org1, 'Leena George',  'leena.george@yi-mumbai.com',   '#f59e0b'),
    (v_u32, v_org1, 'Aryan Kapoor',  'aryan.kapoor@yi-mumbai.com',   '#10b981'),
    (v_u33, v_org1, 'Meghna Rao',    'meghna.rao@yi-mumbai.com',     '#8b5cf6'),
    -- Delhi + Bangalore admins (v_org2 / v_org3)
    (v_u34, v_org2, 'Vikram Sharma', 'vikram.sharma@yi-delhi.com',   '#3b82f6'),
    (v_u35, v_org3, 'Preethi Nair',  'preethi.nair@yi-bangalore.com','#8b5cf6')
  on conflict (id) do nothing;

  -- ────────────────────────────────────────────────────────────────
  -- ORG MEMBERS
  -- ────────────────────────────────────────────────────────────────
  insert into org_members (org_id, user_id, role, joined_at) values
    -- Mumbai
    (v_org1, v_u01, 'org_admin', '2026-01-15 00:00:00+00'),
    (v_org1, v_u02, 'member',    '2026-01-20 00:00:00+00'),
    (v_org1, v_u03, 'member',    '2026-01-20 00:00:00+00'),
    (v_org1, v_u04, 'member',    '2026-01-21 00:00:00+00'),
    (v_org1, v_u05, 'member',    '2026-01-22 00:00:00+00'),
    (v_org1, v_u06, 'member',    '2026-01-23 00:00:00+00'),
    (v_org1, v_u07, 'member',    '2026-01-24 00:00:00+00'),
    (v_org1, v_u08, 'member',    '2026-01-25 00:00:00+00'),
    (v_org1, v_u09, 'member',    '2026-01-26 00:00:00+00'),
    (v_org1, v_u10, 'member',    '2026-01-27 00:00:00+00'),
    (v_org1, v_u11, 'member',    '2026-01-28 00:00:00+00'),
    (v_org1, v_u12, 'member',    '2026-01-29 00:00:00+00'),
    (v_org1, v_u13, 'member',    '2026-01-30 00:00:00+00'),
    (v_org1, v_u14, 'member',    '2026-01-31 00:00:00+00'),
    (v_org1, v_u15, 'member',    '2026-02-01 00:00:00+00'),
    (v_org1, v_u16, 'member',    '2026-02-02 00:00:00+00'),
    (v_org1, v_u17, 'member',    '2026-02-03 00:00:00+00'),
    (v_org1, v_u18, 'member',    '2026-02-04 00:00:00+00'),
    (v_org1, v_u19, 'member',    '2026-02-05 00:00:00+00'),
    (v_org1, v_u20, 'member',    '2026-02-06 00:00:00+00'),
    (v_org1, v_u21, 'member',    '2026-02-07 00:00:00+00'),
    (v_org1, v_u22, 'member',    '2026-02-08 00:00:00+00'),
    (v_org1, v_u23, 'member',    '2026-02-09 00:00:00+00'),
    (v_org1, v_u24, 'member',    '2026-02-10 00:00:00+00'),
    (v_org1, v_u25, 'member',    '2026-02-11 00:00:00+00'),
    (v_org1, v_u26, 'member',    '2026-02-12 00:00:00+00'),
    (v_org1, v_u27, 'member',    '2026-02-13 00:00:00+00'),
    (v_org1, v_u28, 'member',    '2026-02-14 00:00:00+00'),
    (v_org1, v_u29, 'member',    '2026-02-15 00:00:00+00'),
    (v_org1, v_u30, 'member',    '2026-02-16 00:00:00+00'),
    (v_org1, v_u31, 'member',    '2026-02-17 00:00:00+00'),
    (v_org1, v_u32, 'member',    '2026-02-18 00:00:00+00'),
    (v_org1, v_u33, 'member',    '2026-02-19 00:00:00+00'),
    -- Delhi + Bangalore
    (v_org2, v_u34, 'org_admin', '2026-01-20 00:00:00+00'),
    (v_org3, v_u35, 'org_admin', '2026-02-01 00:00:00+00')
  on conflict (org_id, user_id) do nothing;

  -- ────────────────────────────────────────────────────────────────
  -- TEAMS  (Mumbai only)
  -- ────────────────────────────────────────────────────────────────
  insert into teams (id, org_id, name, emoji, color) values
    (v_t1, v_org1, 'Team Alpha',   '🥦', '#059669'),
    (v_t2, v_org1, 'Team Beta',    '🫐', '#3b82f6'),
    (v_t3, v_org1, 'Team Gamma',   '🍎', '#f59e0b'),
    (v_t4, v_org1, 'Team Delta',   '🥑', '#8b5cf6'),
    (v_t5, v_org1, 'Team Epsilon', '🍇', '#ec4899'),
    (v_t6, v_org1, 'Team Zeta',    '🌽', '#14b8a6')
  on conflict (id) do nothing;

  -- ────────────────────────────────────────────────────────────────
  -- TEAM MEMBERS
  -- ────────────────────────────────────────────────────────────────
  insert into team_members (team_id, user_id, org_id, role) values
    -- Team Alpha
    (v_t1, v_u02, v_org1, 'captain'),
    (v_t1, v_u03, v_org1, 'vice_captain'),
    (v_t1, v_u04, v_org1, 'member'),
    (v_t1, v_u05, v_org1, 'member'),
    (v_t1, v_u06, v_org1, 'member'),
    (v_t1, v_u07, v_org1, 'member'),
    -- Team Beta
    (v_t2, v_u08, v_org1, 'captain'),
    (v_t2, v_u09, v_org1, 'vice_captain'),
    (v_t2, v_u10, v_org1, 'member'),
    (v_t2, v_u11, v_org1, 'member'),
    (v_t2, v_u12, v_org1, 'member'),
    -- Team Gamma
    (v_t3, v_u13, v_org1, 'captain'),
    (v_t3, v_u14, v_org1, 'vice_captain'),
    (v_t3, v_u15, v_org1, 'member'),
    (v_t3, v_u16, v_org1, 'member'),
    -- Team Delta
    (v_t4, v_u17, v_org1, 'captain'),
    (v_t4, v_u18, v_org1, 'vice_captain'),
    (v_t4, v_u19, v_org1, 'member'),
    (v_t4, v_u20, v_org1, 'member'),
    (v_t4, v_u21, v_org1, 'member'),
    -- Team Epsilon
    (v_t5, v_u22, v_org1, 'captain'),
    (v_t5, v_u23, v_org1, 'vice_captain'),
    (v_t5, v_u24, v_org1, 'member'),
    -- Team Zeta
    (v_t6, v_u25, v_org1, 'captain'),
    (v_t6, v_u26, v_org1, 'vice_captain'),
    (v_t6, v_u27, v_org1, 'member'),
    (v_t6, v_u28, v_org1, 'member')
  on conflict (team_id, user_id) do nothing;

  -- ────────────────────────────────────────────────────────────────
  -- CHALLENGES
  -- Wellness April: Week 1 = Mar 14-20, W2 = Mar 21-27, W3 = Mar 28-Apr 3, W4 = Apr 4-10
  -- ────────────────────────────────────────────────────────────────
  insert into challenges (id, org_id, name, description, status, start_date, end_date) values
    (v_ch1, v_org1,
      'Wellness April',
      'A 4-week holistic wellness challenge covering movement, hydration, and mindful eating.',
      'active', '2026-03-14', '2026-04-17'),
    (v_ch2, v_org1,
      'Step Challenge May',
      'Track your daily steps and build a consistent movement habit throughout May.',
      'upcoming', '2026-05-01', '2026-05-31')
  on conflict (id) do nothing;

  insert into challenge_teams (challenge_id, team_id) values
    (v_ch1, v_t1), (v_ch1, v_t2), (v_ch1, v_t3),
    (v_ch1, v_t4), (v_ch1, v_t5), (v_ch1, v_t6)
  on conflict (challenge_id, team_id) do nothing;

  -- ────────────────────────────────────────────────────────────────
  -- TASKS  (week_number = start_week — both columns required)
  -- ────────────────────────────────────────────────────────────────
  insert into tasks (id, challenge_id, title, description, points, start_week, week_number, category, icon) values
    (v_tk1, v_ch1, 'Morning Walk',   'Walk for at least 30 minutes in the morning.',  20, 1, 1, 'Exercise',    '🚶'),
    (v_tk2, v_ch1, 'Hydration Log',  'Drink 2.5 L of water and log it daily.',        10, 1, 1, 'Hydration',   '💧'),
    (v_tk3, v_ch1, 'Mindful Eating', 'Eat without screens for at least one meal.',    10, 3, 3, 'Mindfulness', '🥗')
  on conflict (id) do nothing;

  -- ────────────────────────────────────────────────────────────────
  -- TASK SUBMISSIONS  (renamed from 'submissions')
  -- All approved submissions include: submitted_date, points_awarded, reviewed_at
  -- points_awarded: v_tk1 = 20, v_tk2 = 10, v_tk3 = 10
  -- ────────────────────────────────────────────────────────────────

  -- ── Team Alpha: Arjun Shah ──────────────────────────────────────
  -- Morning Walk (20pts × 19 = 380)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk1, v_ch1, v_u02, v_org1, d::timestamptz + interval '7 hours', d, 'approved', 'text', 'Completed 30+ min morning walk.', now(), 20
  from unnest(array[
    '2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-17','2026-03-18','2026-03-19',
    '2026-03-21','2026-03-22','2026-03-23','2026-03-24','2026-03-25',
    '2026-03-28','2026-03-29','2026-03-30','2026-03-31','2026-04-01',
    '2026-04-04','2026-04-05','2026-04-06'
  ]) as t(d);

  -- Hydration Log (10pts × 11 = 110)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk2, v_ch1, v_u02, v_org1, d::timestamptz + interval '9 hours', d, 'approved', 'text', 'Drank 2.5L water today.', now(), 10
  from unnest(array[
    '2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-17','2026-03-18','2026-03-19',
    '2026-03-21','2026-03-22','2026-03-23','2026-03-24','2026-03-25'
  ]) as t(d);

  -- Mindful Eating (10pts × 7 = 70)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk3, v_ch1, v_u02, v_org1, d::timestamptz + interval '13 hours', d, 'approved', 'text', 'Ate lunch without screens.', now(), 10
  from unnest(array[
    '2026-03-28'::date,'2026-03-29','2026-03-30','2026-03-31',
    '2026-04-04','2026-04-05','2026-04-06'
  ]) as t(d);

  -- ── Team Alpha: Riya Kapoor ─────────────────────────────────────
  -- Morning Walk (20pts × 17 = 340)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk1, v_ch1, v_u03, v_org1, d::timestamptz + interval '7 hours', d, 'approved', 'text', 'Morning walk done!', now(), 20
  from unnest(array[
    '2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-17','2026-03-18',
    '2026-03-21','2026-03-22','2026-03-23','2026-03-24','2026-03-25',
    '2026-03-28','2026-03-29','2026-03-30','2026-03-31',
    '2026-04-04','2026-04-05','2026-04-06'
  ]) as t(d);

  -- Hydration Log (10pts × 10 = 100)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk2, v_ch1, v_u03, v_org1, d::timestamptz + interval '9 hours', d, 'approved', 'text', '2.5L logged today.', now(), 10
  from unnest(array[
    '2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-17','2026-03-18','2026-03-19',
    '2026-03-21','2026-03-22','2026-03-23','2026-03-24'
  ]) as t(d);

  -- Mindful Eating (10pts × 5 = 50)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk3, v_ch1, v_u03, v_org1, d::timestamptz + interval '13 hours', d, 'approved', 'text', 'Screen-free dinner!', now(), 10
  from unnest(array[
    '2026-03-28'::date,'2026-03-29','2026-03-30','2026-04-04','2026-04-05'
  ]) as t(d);

  -- ── Team Alpha: Pooja Joshi ─────────────────────────────────────
  -- Morning Walk (20pts × 14 = 280)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk1, v_ch1, v_u04, v_org1, d::timestamptz + interval '7 hours', d, 'approved', 'text', 'Walk complete.', now(), 20
  from unnest(array[
    '2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-17',
    '2026-03-21','2026-03-22','2026-03-23','2026-03-24','2026-03-25',
    '2026-03-28','2026-03-29','2026-03-30',
    '2026-04-04','2026-04-05'
  ]) as t(d);

  -- Hydration Log (10pts × 9 = 90)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk2, v_ch1, v_u04, v_org1, d::timestamptz + interval '9 hours', d, 'approved', 'text', 'Hydration tracked.', now(), 10
  from unnest(array[
    '2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-17','2026-03-18','2026-03-19',
    '2026-03-21','2026-03-22','2026-03-23'
  ]) as t(d);

  -- Mindful Eating (10pts × 6 = 60)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk3, v_ch1, v_u04, v_org1, d::timestamptz + interval '13 hours', d, 'approved', 'text', 'Mindful meal done.', now(), 10
  from unnest(array[
    '2026-03-28'::date,'2026-03-29','2026-03-30','2026-03-31','2026-04-04','2026-04-05'
  ]) as t(d);

  -- ── Team Alpha: Arun Sharma ─────────────────────────────────────
  -- Morning Walk (20pts × 12 = 240)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk1, v_ch1, v_u05, v_org1, d::timestamptz + interval '7 hours', d, 'approved', 'text', 'Morning walk done.', now(), 20
  from unnest(array[
    '2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-17',
    '2026-03-21','2026-03-22','2026-03-23','2026-03-24',
    '2026-03-30','2026-03-31',
    '2026-04-04','2026-04-05'
  ]) as t(d);

  -- Hydration Log (10pts × 7 = 70)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk2, v_ch1, v_u05, v_org1, d::timestamptz + interval '9 hours', d, 'approved', 'text', '2.5L water consumed.', now(), 10
  from unnest(array[
    '2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-17',
    '2026-03-21','2026-03-22','2026-03-23'
  ]) as t(d);

  -- Mindful Eating (10pts × 7 = 70)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk3, v_ch1, v_u05, v_org1, d::timestamptz + interval '13 hours', d, 'approved', 'text', 'Screen-free meal.', now(), 10
  from unnest(array[
    '2026-03-28'::date,'2026-03-29','2026-03-30','2026-03-31',
    '2026-04-04','2026-04-05','2026-04-06'
  ]) as t(d);

  -- ── Team Alpha: Neha Verma ──────────────────────────────────────
  -- Morning Walk (20pts × 8 = 160)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk1, v_ch1, v_u06, v_org1, d::timestamptz + interval '7 hours', d, 'approved', 'text', 'Walk logged.', now(), 20
  from unnest(array[
    '2026-03-14'::date,'2026-03-15','2026-03-16',
    '2026-03-21','2026-03-22','2026-03-23',
    '2026-03-31','2026-04-04'
  ]) as t(d);

  -- Hydration Log (10pts × 6 = 60)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk2, v_ch1, v_u06, v_org1, d::timestamptz + interval '9 hours', d, 'approved', 'text', 'Hydration done.', now(), 10
  from unnest(array[
    '2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-17',
    '2026-03-21','2026-03-22'
  ]) as t(d);

  -- Mindful Eating (10pts × 8 = 80)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk3, v_ch1, v_u06, v_org1, d::timestamptz + interval '13 hours', d, 'approved', 'text', 'Mindful eating done.', now(), 10
  from unnest(array[
    '2026-03-28'::date,'2026-03-29','2026-03-30','2026-03-31',
    '2026-04-04','2026-04-05','2026-04-06','2026-04-07'
  ]) as t(d);

  -- ── Team Alpha: Rahul Das ───────────────────────────────────────
  -- Morning Walk (20pts × 2 = 40)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk1, v_ch1, v_u07, v_org1, d::timestamptz + interval '7 hours', d, 'approved', 'text', 'Walk done.', now(), 20
  from unnest(array['2026-03-14'::date,'2026-04-04']) as t(d);

  -- Hydration Log (10pts × 10 = 100)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk2, v_ch1, v_u07, v_org1, d::timestamptz + interval '9 hours', d, 'approved', 'text', 'Water logged.', now(), 10
  from unnest(array[
    '2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-17','2026-03-18',
    '2026-03-21','2026-03-22','2026-03-23','2026-03-24','2026-03-25'
  ]) as t(d);

  -- Mindful Eating (10pts × 6 = 60)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk3, v_ch1, v_u07, v_org1, d::timestamptz + interval '13 hours', d, 'approved', 'text', 'Mindful meal logged.', now(), 10
  from unnest(array[
    '2026-03-28'::date,'2026-03-29','2026-03-30','2026-03-31',
    '2026-04-04','2026-04-05'
  ]) as t(d);

  -- ── Team Beta: Meera Nair ───────────────────────────────────────
  -- Morning Walk (20pts × 15 = 300)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk1, v_ch1, v_u08, v_org1, d::timestamptz + interval '7 hours', d, 'approved', 'text', 'Morning walk complete.', now(), 20
  from unnest(array[
    '2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-17','2026-03-18','2026-03-19',
    '2026-03-21','2026-03-22','2026-03-23','2026-03-24',
    '2026-03-28','2026-03-29','2026-03-30',
    '2026-04-04','2026-04-05'
  ]) as t(d);

  -- Hydration Log (10pts × 9 = 90)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk2, v_ch1, v_u08, v_org1, d::timestamptz + interval '9 hours', d, 'approved', 'text', 'Hydration logged.', now(), 10
  from unnest(array[
    '2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-17','2026-03-18',
    '2026-03-21','2026-03-22','2026-03-23','2026-03-24'
  ]) as t(d);

  -- Mindful Eating (10pts × 5 = 50)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk3, v_ch1, v_u08, v_org1, d::timestamptz + interval '13 hours', d, 'approved', 'text', 'Screen-free meal.', now(), 10
  from unnest(array[
    '2026-03-28'::date,'2026-03-29','2026-03-30','2026-03-31','2026-04-04'
  ]) as t(d);

  -- ── Team Beta: Sahil Joshi ──────────────────────────────────────
  -- Morning Walk (20pts × 14 = 280)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk1, v_ch1, v_u09, v_org1, d::timestamptz + interval '7 hours', d, 'approved', 'text', 'Walk logged.', now(), 20
  from unnest(array[
    '2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-17','2026-03-18',
    '2026-03-21','2026-03-22','2026-03-23','2026-03-24','2026-03-25',
    '2026-03-28','2026-03-29','2026-03-30','2026-04-04'
  ]) as t(d);

  -- Hydration Log (10pts × 8 = 80)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes, reviewed_at, points_awarded)
  select v_tk2, v_ch1, v_u09, v_org1, d::timestamptz + interval '9 hours', d, 'approved', 'text', 'Water intake logged.', now(), 10
  from unnest(array[
    '2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-17','2026-03-18','2026-03-19',
    '2026-03-21','2026-03-22'
  ]) as t(d);

  -- ── Team Beta: Karan, Divya, Yash (group insert) ───────────────
  -- Morning Walk (20pts × 7 days × 3 members = 420)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, reviewed_at, points_awarded)
  select v_tk1, v_ch1, uid, v_org1, d::timestamptz + interval '7 hours', d, 'approved', 'text', now(), 20
  from unnest(array[v_u10, v_u11, v_u12]) as t1(uid),
       unnest(array['2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-21','2026-03-22','2026-03-28','2026-04-04']) as t2(d);

  -- Hydration Log (10pts × 5 days × 3 members = 150)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, reviewed_at, points_awarded)
  select v_tk2, v_ch1, uid, v_org1, d::timestamptz + interval '9 hours', d, 'approved', 'text', now(), 10
  from unnest(array[v_u10, v_u11, v_u12]) as t1(uid),
       unnest(array['2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-17','2026-03-21']) as t2(d);

  -- ── Team Gamma (group insert) ───────────────────────────────────
  -- Morning Walk (20pts × 8 days × 4 members = 640)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, reviewed_at, points_awarded)
  select v_tk1, v_ch1, uid, v_org1, d::timestamptz + interval '7 hours', d, 'approved', 'text', now(), 20
  from unnest(array[v_u13, v_u14, v_u15, v_u16]) as t1(uid),
       unnest(array['2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-17','2026-03-21','2026-03-22','2026-03-28','2026-04-04']) as t2(d);

  -- Hydration Log (10pts × 5 days × 4 members = 200)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, reviewed_at, points_awarded)
  select v_tk2, v_ch1, uid, v_org1, d::timestamptz + interval '9 hours', d, 'approved', 'text', now(), 10
  from unnest(array[v_u13, v_u14, v_u15, v_u16]) as t1(uid),
       unnest(array['2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-21','2026-03-22']) as t2(d);

  -- ── Team Delta (group insert) ───────────────────────────────────
  -- Morning Walk (20pts × 7 days × 5 members = 700)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, reviewed_at, points_awarded)
  select v_tk1, v_ch1, uid, v_org1, d::timestamptz + interval '7 hours', d, 'approved', 'text', now(), 20
  from unnest(array[v_u17, v_u18, v_u19, v_u20, v_u21]) as t1(uid),
       unnest(array['2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-21','2026-03-22','2026-03-28','2026-04-04']) as t2(d);

  -- Hydration Log (10pts × 4 days × 5 members = 200)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, reviewed_at, points_awarded)
  select v_tk2, v_ch1, uid, v_org1, d::timestamptz + interval '9 hours', d, 'approved', 'text', now(), 10
  from unnest(array[v_u17, v_u18, v_u19, v_u20, v_u21]) as t1(uid),
       unnest(array['2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-21']) as t2(d);

  -- ── Team Epsilon (group insert) ─────────────────────────────────
  -- Morning Walk (20pts × 6 days × 3 members = 360)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, reviewed_at, points_awarded)
  select v_tk1, v_ch1, uid, v_org1, d::timestamptz + interval '7 hours', d, 'approved', 'text', now(), 20
  from unnest(array[v_u22, v_u23, v_u24]) as t1(uid),
       unnest(array['2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-21','2026-03-22','2026-03-28']) as t2(d);

  -- Hydration Log (10pts × 4 days × 3 members = 120)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, reviewed_at, points_awarded)
  select v_tk2, v_ch1, uid, v_org1, d::timestamptz + interval '9 hours', d, 'approved', 'text', now(), 10
  from unnest(array[v_u22, v_u23, v_u24]) as t1(uid),
       unnest(array['2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-21']) as t2(d);

  -- ── Team Zeta (group insert) ────────────────────────────────────
  -- Morning Walk (20pts × 5 days × 4 members = 400)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, reviewed_at, points_awarded)
  select v_tk1, v_ch1, uid, v_org1, d::timestamptz + interval '7 hours', d, 'approved', 'text', now(), 20
  from unnest(array[v_u25, v_u26, v_u27, v_u28]) as t1(uid),
       unnest(array['2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-21','2026-03-22']) as t2(d);

  -- Hydration Log (10pts × 4 days × 4 members = 160)
  insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, reviewed_at, points_awarded)
  select v_tk2, v_ch1, uid, v_org1, d::timestamptz + interval '9 hours', d, 'approved', 'text', now(), 10
  from unnest(array[v_u25, v_u26, v_u27, v_u28]) as t1(uid),
       unnest(array['2026-03-14'::date,'2026-03-15','2026-03-16','2026-03-21']) as t2(d);

  -- ── Pending submissions (approvals queue) ──────────────────────
  insert into task_submissions
    (task_id, challenge_id, user_id, org_id, submitted_at, submitted_date, status, proof_type, notes)
  values
    (v_tk1, v_ch1, v_u02, v_org1, '2026-04-08 07:30:00+00', '2026-04-08', 'pending', 'text',
      'Walked 40 mins along the seafront. Feeling great!'),
    (v_tk1, v_ch1, v_u03, v_org1, '2026-04-08 08:00:00+00', '2026-04-08', 'pending', 'image',
      'See attached photo from my morning run.'),
    (v_tk2, v_ch1, v_u04, v_org1, '2026-04-08 09:15:00+00', '2026-04-08', 'pending', 'text',
      'Tracked 3L of water today. Used my new bottle!'),
    (v_tk1, v_ch1, v_u08, v_org1, '2026-04-09 07:45:00+00', '2026-04-09', 'pending', 'text',
      'Early morning walk done before work.'),
    (v_tk3, v_ch1, v_u13, v_org1, '2026-04-09 13:00:00+00', '2026-04-09', 'pending', 'text',
      'Had lunch in the garden without my phone. Very calming.'),
    (v_tk1, v_ch1, v_u22, v_org1, '2026-04-10 07:30:00+00', '2026-04-10', 'pending', 'image',
      'Morning walk screenshot attached.');

  -- ────────────────────────────────────────────────────────────────
  -- POINTS TRANSACTIONS  (manual adjustments — seeded for history page)
  -- Auto-generated transactions (from approvals) will be created by the
  -- trigger when real approvals happen. These are manual-only for seed.
  -- ────────────────────────────────────────────────────────────────
  insert into points_transactions (user_id, org_id, amount, reason, awarded_by, is_manual, created_at) values
    (v_u02, v_org1,  50, 'Quiz winner bonus — Nutrition Quiz Round 1', v_u01, true, '2026-03-31 17:00:00+00'),
    (v_u08, v_org1,  25, 'Team spirit award — Week 2',                 v_u01, true, '2026-03-28 12:00:00+00'),
    (v_u13, v_org1, -10, 'Submission removed — duplicate entry',       v_u01, true, '2026-03-22 10:00:00+00');

  -- ────────────────────────────────────────────────────────────────
  -- SYNC profiles.total_points
  -- The DB trigger fires on UPDATE only (not INSERT). Manually compute
  -- totals from task_submissions + manual points_transactions.
  -- ────────────────────────────────────────────────────────────────
  update profiles p
  set total_points = coalesce(ts_pts.pts, 0) + coalesce(man_pts.pts, 0)
  from (
    select user_id, sum(points_awarded) as pts
    from task_submissions
    where status = 'approved' and points_awarded is not null
    group by user_id
  ) ts_pts
  left join (
    select user_id, sum(amount) as pts
    from points_transactions
    where is_manual = true
    group by user_id
  ) man_pts on man_pts.user_id = ts_pts.user_id
  where p.id = ts_pts.user_id;

  -- ────────────────────────────────────────────────────────────────
  -- FEED ITEMS  (renamed from feed_posts — add is_auto_generated = false)
  -- ────────────────────────────────────────────────────────────────
  insert into feed_items (id, org_id, type, title, content, author_id, challenge_id, pinned, is_auto_generated, created_at) values
    (v_p1, v_org1, 'announcement', 'Final Week — Week 4 Starts Now! 🏆',
      'We are in the home stretch! Two final tasks remain. Push hard — Team Alpha leads but anything can change. Submit daily!',
      v_u01, v_ch1, true, false, '2026-04-10 09:00:00+00'),

    (v_p2, v_org1, 'leaderboard_change', 'Team Alpha Takes the Lead! 📊',
      'Team Alpha has overtaken Team Beta with 2,340 points. Incredible consistency from the whole team.',
      v_u01, v_ch1, false, false, '2026-04-07 10:30:00+00'),

    (v_p3, v_org1, 'achievement', 'Arjun Shah hits 500 points! 🏆',
      'Arjun Shah from Team Alpha has crossed the 500-point mark — the first member to do so this challenge. Incredible dedication!',
      v_u01, v_ch1, false, false, '2026-04-05 14:00:00+00'),

    (v_p4, v_org1, 'milestone', 'Week 3 Wrap-Up 🎯',
      'Week 3 is done! Total points logged: 8,450 across all teams. Mindful Eating saw strong adoption. Keep it up!',
      v_u01, v_ch1, false, false, '2026-04-04 09:00:00+00'),

    (v_p5, v_org1, 'quiz_result', 'Nutrition Quiz Results Are In! 🧠',
      'Average score: 7.4 / 10. Top scorer: Meera Nair with a perfect 10. Great job to everyone who participated!',
      v_u01, v_ch1, false, false, '2026-03-31 16:00:00+00'),

    (v_p6, v_org1, 'announcement', 'New Task Added: Mindful Eating 🥗',
      'Starting Week 3, a new 10-point task is live — Mindful Eating. Eat one meal per day without screens. Simple but powerful.',
      v_u01, v_ch1, false, false, '2026-03-28 08:00:00+00'),

    (v_p7, v_org1, 'submission_approved', 'Week 2 Submissions Approved ✅',
      'All Week 2 submissions have been reviewed and approved. Points have been updated on the leaderboard. Great consistency!',
      v_u01, v_ch1, false, false, '2026-03-28 11:00:00+00'),

    (v_p8, v_org1, 'general', 'Welcome to Wellness April! 🌱',
      'Kicking off our biggest challenge yet. 4 weeks, 6 teams, and one goal — build lasting wellness habits. Let''s go!',
      v_u01, v_ch1, false, false, '2026-03-14 08:00:00+00')
  on conflict (id) do nothing;

  -- ────────────────────────────────────────────────────────────────
  -- FEED REACTIONS
  -- ────────────────────────────────────────────────────────────────
  insert into feed_reactions (post_id, user_id, reaction) values
    (v_p1, v_u02, 'fire'),    (v_p1, v_u08, 'fire'),
    (v_p1, v_u03, 'broccoli'),
    (v_p2, v_u02, 'broccoli'),(v_p2, v_u03, 'star'),
    (v_p3, v_u08, 'star'),    (v_p3, v_u01, 'heart'),
    (v_p4, v_u02, 'fire'),    (v_p4, v_u13, 'fire'),
    (v_p5, v_u08, 'star'),
    (v_p8, v_u02, 'broccoli'),(v_p8, v_u03, 'broccoli'),
    (v_p8, v_u08, 'broccoli'),(v_p8, v_u13, 'fire')
  on conflict (post_id, user_id, reaction) do nothing;

  -- ────────────────────────────────────────────────────────────────
  -- POLICIES  (fixed column order: name, color_index, content)
  -- ────────────────────────────────────────────────────────────────
  insert into policies (id, org_id, name, color_index, content, updated_at) values
    (v_pol1, v_org1, 'Privacy Policy', 0,
      '<h2>Privacy Policy</h2><p>This Privacy Policy explains how Young Indians Mumbai collects, uses, and protects your personal data when you participate in Yi Nutrition League activities.</p><h3>Data We Collect</h3><p>We collect your name, email address, and activity submissions. Health-related data (steps, meals logged) is collected only with your explicit consent.</p><h3>How We Use It</h3><p>Your data is used solely to calculate leaderboard points, generate team reports, and communicate challenge updates.</p><h3>Data Retention</h3><p>Data is retained for 12 months after the challenge ends, then anonymised for aggregate reporting.</p>',
      '2026-03-16 00:00:00+00'),

    (v_pol2, v_org1, 'Terms of Use', 1,
      '<h2>Terms of Use</h2><p>By participating in the Yi Nutrition League, you agree to the following terms:</p><h3>Fair Play</h3><p>All submissions must be genuine. Falsified entries will result in disqualification and removal from the leaderboard.</p><h3>Conduct</h3><p>Members are expected to engage respectfully in all team communications and feed interactions.</p><h3>Prizes & Recognition</h3><p>Winners are determined solely by approved points at the close of the challenge. Decisions by the admin team are final.</p>',
      '2026-03-16 00:00:00+00'),

    (v_pol3, v_org1, 'Data Usage & Consent', 2,
      '<h2>Data Usage & Consent</h2><p>Your health and activity data is collected with your explicit consent and used only for the purposes described below.</p><h3>What You Consent To</h3><p>By joining a challenge, you consent to the collection of your daily activity submissions, points history, and team participation data.</p><h3>Withdrawal</h3><p>You may withdraw consent at any time by contacting your org admin. Withdrawal will result in your data being anonymised within 30 days.</p>',
      '2026-03-16 00:00:00+00')
  on conflict (id) do nothing;

  -- ────────────────────────────────────────────────────────────────
  -- EVENTS  (Mumbai org)
  -- ────────────────────────────────────────────────────────────────
  insert into events (id, org_id, title, description, type, points, location, start_time, end_time, is_active, status) values
    (v_ev1, v_org1,
      'Nutrition Knowledge Quiz',
      'Test your nutrition knowledge and earn points! 10 questions on macros, hydration, and mindful eating. Top 3 scorers get a bonus.',
      'quiz', 50, null,
      '2026-04-15 18:00:00+05:30', '2026-04-15 19:00:00+05:30',
      true, 'upcoming'),

    (v_ev2, v_org1,
      'Team Building Walk — Bandstand',
      'Join your fellow Young Indians for a group walk along Bandstand Promenade. All teams welcome. Attendance earns points!',
      'offline', 30, 'Bandstand Promenade, Bandra, Mumbai',
      '2026-04-20 07:00:00+05:30', '2026-04-20 08:30:00+05:30',
      true, 'upcoming'),

    (v_ev3, v_org1,
      'Wellness Workshop — Mindful Eating',
      'An in-person workshop on mindful eating habits with our resident nutritionist. Includes a Q&A and take-home resource pack.',
      'offline', 25, 'Young Indians Community Hall, Andheri West, Mumbai',
      '2026-03-25 10:00:00+05:30', '2026-03-25 12:00:00+05:30',
      true, 'completed')
  on conflict (id) do nothing;

  -- ── Event participations (completed workshop only) ──────────────
  insert into event_participations (event_id, user_id, points_awarded) values
    (v_ev3, v_u02, 25),
    (v_ev3, v_u03, 25),
    (v_ev3, v_u08, 25),
    (v_ev3, v_u09, 25),
    (v_ev3, v_u13, 25),
    (v_ev3, v_u17, 25)
  on conflict (event_id, user_id) do nothing;

  -- ────────────────────────────────────────────────────────────────
  -- INVITE WHITELIST  (mix of pending and accepted for invite page)
  -- ────────────────────────────────────────────────────────────────
  insert into invite_whitelist (org_id, email, team_id, role, invited_by, used_at, created_at) values
    -- Pending invites (used_at IS NULL → status = 'pending')
    (v_org1, 'new.member1@gmail.com',    v_t1, 'member',       v_u01, null, '2026-04-05 10:00:00+00'),
    (v_org1, 'new.member2@gmail.com',    v_t2, 'member',       v_u01, null, '2026-04-06 11:00:00+00'),
    (v_org1, 'new.captain@gmail.com',    v_t3, 'team_captain', v_u01, null, '2026-04-07 09:00:00+00'),
    -- Accepted invites (used_at IS NOT NULL → status = 'accepted')
    (v_org1, 'arjun.shah@yi-mumbai.com', v_t1, 'member',       v_u01, '2026-01-20 10:00:00+00', '2026-01-18 08:00:00+00'),
    (v_org1, 'meera.nair@yi-mumbai.com', v_t2, 'member',       v_u01, '2026-01-25 12:00:00+00', '2026-01-22 09:00:00+00')
  on conflict (org_id, email) do nothing;

end;
$seed$;

-- ================================================================
-- POST-SEED STEPS (run manually in Supabase Dashboard)
-- ================================================================
--
-- 1. Go to Authentication → Users → Create user: super@yi.com
--    Copy the UUID generated.
--
-- 2. Run this in SQL Editor to link the auth user to admin_users:
--    UPDATE admin_users SET user_id = '<paste-uuid-here>'
--    WHERE email = 'super@yi.com';
--
-- 3. Repeat steps 1-2 for each org admin email if you want to test
--    those logins:
--      rahul.mehta@yi-mumbai.com  → links to v_ad2
--      vikram.sharma@yi-delhi.com → links to v_ad3
--
-- 4. Verify total_points seeded correctly:
--    SELECT id, name, total_points FROM profiles
--    WHERE org_id = '10000000-0000-0000-0000-000000000001'
--    ORDER BY total_points DESC;
--
-- Expected top: Arjun Shah = 560+50 = 610, Riya Kapoor = 490,
--               Meera Nair = 440+25 = 465, ...
-- ================================================================
