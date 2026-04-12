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
  if (profile.role !== 'super_admin' && profile.role !== 'sub_super_admin' && profile.role !== 'org_admin') {
    return { error: 'Only org admins and above can remove sub admins.' }
  }
  if ((profile.role === 'org_admin') && profile.org_id !== orgId) {
    return { error: 'You can only manage admins in your own organization.' }
  }

  const client = await createAdminClient()
  const { error } = await client
    .from('admin_users')
    .delete()
    .eq('id', adminId)
    .eq('org_id', orgId)
    .eq('role', 'sub_admin') // safety: never delete org_admin
  if (error) return { error: error.message }

  revalidatePath(`/organizations/${orgId}/admins`)
  return { success: true }
}
