'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { getAdminProfile } from '@/lib/auth'

export async function updateAdminName(name: string) {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Not authenticated' }
  const client = await createAdminClient()
  const { error } = await client
    .from('admin_users')
    .update({ name })
    .eq('id', profile.id)
  if (error) return { error: error.message }
  return { success: true }
}

// Called after client-side OTP verification succeeds.
// At this point the client's session is for the new email user (created by signInWithOtp).
// We update the original admin's email in both auth.users and admin_users, then clean up.
export async function finalizeEmailChange(
  adminId: string,
  originalUserId: string,
  newEmail: string,
) {
  const adminClient = await createAdminClient()

  // Verify adminId + originalUserId are consistent (basic guard)
  const { data: adminUser } = await adminClient
    .from('admin_users')
    .select('id, user_id')
    .eq('id', adminId)
    .eq('user_id', originalUserId)
    .single()
  if (!adminUser) return { error: 'Admin record not found.' }

  // Update original auth user's email and mark confirmed
  const { error: authError } = await adminClient.auth.admin.updateUserById(originalUserId, {
    email: newEmail,
    email_confirm: true,
  })
  if (authError) return { error: authError.message }

  // Update admin_users.email
  const { error: dbError } = await adminClient
    .from('admin_users')
    .update({ email: newEmail })
    .eq('id', adminId)
  if (dbError) return { error: dbError.message }

  // Delete the temp OTP user created for the new email (if different from original)
  const { data: { users } } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  const tempUser = users.find(u => u.email === newEmail && u.id !== originalUserId)
  if (tempUser) {
    await adminClient.auth.admin.deleteUser(tempUser.id)
  }

  return { success: true }
}
