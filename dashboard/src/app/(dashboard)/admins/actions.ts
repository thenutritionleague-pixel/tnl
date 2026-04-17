'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { getAdminProfile } from '@/lib/auth'

export async function inviteSubSuperAdmin(name: string, email: string) {
  const profile = await getAdminProfile()
  if (!profile || profile.role !== 'super_admin') {
    return { error: 'Only super admins can invite platform admins.' }
  }

  const client = await createAdminClient()

  const { data: existing } = await client
    .from('admin_users')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (existing) return { error: 'An admin with this email already exists.' }

  const { error } = await client.from('admin_users').insert({
    name,
    email,
    role: 'sub_super_admin',
    status: 'active',
    created_by: profile.id,
  })
  if (error) return { error: error.message }
  return { success: true }
}

export async function removeSubSuperAdmin(adminId: string) {
  const profile = await getAdminProfile()
  if (!profile || profile.role !== 'super_admin') {
    return { error: 'Only super admins can remove platform admins.' }
  }
  const client = await createAdminClient()
  
  // 1. Get the auth id before we delete
  const { data: admin } = await client
    .from('admin_users')
    .select('user_id')
    .eq('id', adminId)
    .eq('role', 'sub_super_admin')
    .maybeSingle()

  if (!admin) return { error: 'Admin not found.' }

  if (admin.user_id) {
    // 2. Delete from Supabase Auth (This triggers the Nuclear Cascade on admin_users/profiles)
    const { error: authErr } = await client.auth.admin.deleteUser(admin.user_id)
    if (authErr) return { error: authErr.message }
  } else {
    // 3. Fallback: Delete from admin_users directly
    const { error } = await client
      .from('admin_users')
      .delete()
      .eq('id', adminId)
      .eq('role', 'sub_super_admin')
    if (error) return { error: error.message }
  }

  return { success: true }
}
