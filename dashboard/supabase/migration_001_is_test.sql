-- ================================================================
-- Migration 001 — Add is_test flag to profiles
-- Run in Supabase → SQL Editor
-- ================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.is_test IS
  'Test users bypass real OTP — mobile app accepts 123456 as their OTP';

-- Mark the seeded dummy profiles as test users
UPDATE profiles SET is_test = true;
