-- Migration 010: Set user abdulquadir828@gmail.com as Super Admin
-- This updates the admin_users table to assign the 'super_admin' role for the given email.
-- If the user does not exist in admin_users, it inserts a new record.

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Find the auth.users id for the given email
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'abdulquadir828@gmail.com';
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email abdulquadir828@gmail.com not found in auth.users';
  END IF;

  -- Upsert into admin_users
  INSERT INTO public.admin_users (user_id, org_id, role, name, email, status)
  VALUES (v_user_id, NULL, 'super_admin', 'Abdulquadir', 'abdulquadir828@gmail.com', 'active')
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;
END $$;
