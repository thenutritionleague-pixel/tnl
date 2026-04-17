-- ================================================================
-- Migration 016: Avatar & Logo storage integration
-- Run in Supabase → SQL Editor
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- 1. Add logo_url to organizations
-- ────────────────────────────────────────────────────────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- ────────────────────────────────────────────────────────────────
-- 2. Add avatar_url to profiles
-- ────────────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ────────────────────────────────────────────────────────────────
-- 3. Storage RLS — org-logos bucket
--    Dashboard upload goes through server action (service role,
--    bypasses RLS). These policies are only needed if you ever
--    upload directly from a client session.
--    Keeping them simple: any authenticated user can upload/delete.
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org-logos: org member upload"   ON storage.objects;
DROP POLICY IF EXISTS "org-logos: org member delete"   ON storage.objects;
DROP POLICY IF EXISTS "org-logos: authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "org-logos: authenticated delete" ON storage.objects;

CREATE POLICY "org-logos: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'org-logos');

CREATE POLICY "org-logos: authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'org-logos');

-- ────────────────────────────────────────────────────────────────
-- 4. Storage RLS — avatars bucket
--    Mobile users upload their own avatar.
--    Path: {profile_id}/{timestamp}.ext
--    Policy: the first path segment must equal the uploading
--    user's profile id (from the profiles table).
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "avatars: member upload own"      ON storage.objects;
DROP POLICY IF EXISTS "avatars: member delete own"      ON storage.objects;
DROP POLICY IF EXISTS "avatars: authenticated upload"   ON storage.objects;
DROP POLICY IF EXISTS "avatars: authenticated delete"   ON storage.objects;

CREATE POLICY "avatars: member upload own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (string_to_array(name, '/'))[1] = (
      SELECT id::text FROM public.profiles WHERE auth_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "avatars: member delete own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (string_to_array(name, '/'))[1] = (
      SELECT id::text FROM public.profiles WHERE auth_id = auth.uid() LIMIT 1
    )
  );

-- ────────────────────────────────────────────────────────────────
-- NOTE: Both buckets are PUBLIC — no SELECT policy needed.
-- Public URLs work for anyone without auth.
-- ────────────────────────────────────────────────────────────────
