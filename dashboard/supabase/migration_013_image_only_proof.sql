-- Migration 013: Force image-only proof submissions
--
-- Changes:
-- 1. Drop old proof_type check constraint (which allowed 'text')
-- 2. Add new constraint: only 'image' allowed
-- 3. Set all existing 'text' proof_type rows to 'image' (data migration)
-- 4. Change column default to 'image'
-- 5. Remove stale 'notes' column usage — keep it for admin notes (rejection_reason already covers it)

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Update any existing 'text' submissions to 'image'
-- (these are test/seed data — real users will now always upload images)
-- ─────────────────────────────────────────────────────────────────────────────
update task_submissions
set proof_type = 'image'
where proof_type = 'text';

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Drop the old check constraint and replace with image-only
-- ─────────────────────────────────────────────────────────────────────────────
alter table task_submissions
  drop constraint if exists task_submissions_proof_type_check;

alter table task_submissions
  add constraint task_submissions_proof_type_check
  check (proof_type = 'image');

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Change default to 'image' explicitly
-- ─────────────────────────────────────────────────────────────────────────────
alter table task_submissions
  alter column proof_type set default 'image';

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY:
-- ─────────────────────────────────────────────────────────────────────────────
-- select proof_type, count(*) from task_submissions group by proof_type;
-- Expected: only 'image' rows
