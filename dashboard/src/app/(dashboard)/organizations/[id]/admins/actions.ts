'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getAdminProfile } from '@/lib/auth'

export async function createSubAdmin(orgId: string, name: string, email: string) {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  if (profile.role !== 'super_admin' && profile.role !== 'sub_super_admin' && profile.role !== 'org_admin') {
    return { error: 'Only org admins and above can add sub admins.' }
  }
  // Org admins can only manage their own org
  if ((profile.role === 'org_admin' || profile.role === 'sub_admin') && profile.org_id !== orgId) {
    return { error: 'You can only manage admins in your own organization.' }
  }

  const client = await createAdminClient()

  const { data: existing } = await client
    .from('admin_users')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (existing) return { error: 'An admin with this email already exists.' }

  const { error } = await client.from('admin_users').insert({
    name: name || email.split('@')[0],
    email,
    role: 'sub_admin',
    status: 'active',
    org_id: orgId,
    created_by: profile.id,
  })
  if (error) return { error: error.message }

  revalidatePath(`/organizations/${orgId}/admins`)
  return { success: true }
}

export async function removeSubAdmin(orgId: string, adminId: string) {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  
  // Only super admins or the org's own org_admin can remove admins
  const isSuper = profile.role === 'super_admin' || profile.role === 'sub_super_admin'
  const isOwnOrgAdmin = profile.role === 'org_admin' && profile.org_id === orgId

  if (!isSuper && !isOwnOrgAdmin) {
    return { error: 'Only org admins and above can remove admins.' }
  }

  const client = await createAdminClient()

  // 1. Get the auth id before we delete
  const { data: admin } = await client
    .from('admin_users')
    .select('user_id, role')
    .eq('id', adminId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!admin) return { error: 'Admin not found.' }

  // 2. Safety: Only super admins can delete an org_admin
  if (admin.role === 'org_admin' && !isSuper) {
    return { error: 'Only platform super admins can remove an Organization Admin.' }
  }

  if (admin.user_id) {
    // 3. Delete from Supabase Auth (This triggers the Nuclear Cascade on admin_users/profiles)
    const { error: authErr } = await client.auth.admin.deleteUser(admin.user_id)
    if (authErr) return { error: authErr.message }
  } else {
    // 4. Fallback: Delete from admin_users directly
    const { error } = await client
      .from('admin_users')
      .delete()
      .eq('id', adminId)
      .eq('org_id', orgId)
    if (error) return { error: error.message }
  }

  revalidatePath(`/organizations/${orgId}/admins`)
  return { success: true }
}
