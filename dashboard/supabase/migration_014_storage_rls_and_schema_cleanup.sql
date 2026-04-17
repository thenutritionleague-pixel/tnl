-- Migration 014: Storage RLS policies + task_submissions schema cleanup
--
-- Part 1: Fix Storage RLS for task-proofs bucket (fixes 403 on upload)
-- Part 2: Drop unused columns from task_submissions (notes, proof_type)

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1: STORAGE RLS POLICIES FOR task-proofs BUCKET
-- ═══════════════════════════════════════════════════════════════════════════
-- The bucket must exist first (create via Supabase dashboard if not done yet).
-- If you created it via the dashboard with "private" mode, run the following:
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable RLS on storage.objects (is already on by default, but just in case)
-- INSERT: authenticated users can upload to their own folder
create policy "Authenticated users can upload proofs"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'task-proofs'
    and auth.uid()::text = (string_to_array(name, '/'))[2]
  );

-- SELECT: authenticated users can read their own proofs
create policy "Authenticated users can read own proofs"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'task-proofs'
    and auth.uid()::text = (string_to_array(name, '/'))[2]
  );

-- SELECT: service_role can read all (for admin signed URL generation)
-- This is already covered by service_role bypass, but included for clarity.

-- DELETE: users can delete their own files (optional but safe)
create policy "Authenticated users can delete own proofs"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'task-proofs'
    and auth.uid()::text = (string_to_array(name, '/'))[2]
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2: DROP UNUSED COLUMNS FROM task_submissions
-- ═══════════════════════════════════════════════════════════════════════════
-- proof_type: now always 'image' by constraint — column + constraint dropped
-- notes:      was used only for text proof content (text submissions removed)
--             rejection_reason handles admin feedback instead.
-- ═══════════════════════════════════════════════════════════════════════════

-- Step 1: Drop the proof_type constraint FIRST (before dropping column)
alter table task_submissions
  drop constraint if exists task_submissions_proof_type_check;

-- Step 2: Drop the now-redundant columns
alter table task_submissions
  drop column if exists proof_type,
  drop column if exists notes;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY:
-- ═══════════════════════════════════════════════════════════════════════════
-- select column_name from information_schema.columns
-- where table_name = 'task_submissions'
-- order by ordinal_position;
-- Expected columns: id, task_id, challenge_id, user_id, org_id,
--   submitted_at, submitted_date, status, proof_url,
--   rejection_reason, points_awarded, reviewed_by, reviewed_at
