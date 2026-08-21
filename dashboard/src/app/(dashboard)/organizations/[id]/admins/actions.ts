'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getAdminProfile, readOnlyBlock } from '@/lib/auth'

export async function createSubAdmin(orgId: string, name: string, email: string) {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  const blocked = readOnlyBlock(profile)
  if (blocked) return { error: blocked.error }
  if (profile.role !== 'super_admin' && profile.role !== 'sub_super_admin' && profile.role !== 'org_admin') {
    return { error: 'Only org admins and above can add sub admins.' }
  }
  // Org admins can only manage their own org
  if ((profile.role === 'org_admin' || profile.role === 'sub_admin') && profile.org_id !== orgId) {
    return { error: 'You can only manage admins in your own organization.' }
  }

  const client = await createAdminClient()

  // Store the email lowercased. The RLS policy on admin_users is
  // auth.email() = email, and Supabase always hands back a lowercased address,
  // so a row saved with any capital letter can never be read by its own owner.
  const normalizedEmail = email.toLowerCase().trim()

  const { data: existing } = await client
    .from('admin_users')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle()
  if (existing) return { error: 'An admin with this email already exists.' }

  const { error } = await client.from('admin_users').insert({
    name: name || normalizedEmail.split('@')[0],
    email: normalizedEmail,
    role: 'sub_admin',
    status: 'active',
    org_id: orgId,
    created_by: profile.id,
  })
  if (error) return { error: error.message }

  revalidatePath(`/organizations/${orgId}/admins`)
  return { success: true }
}

export async function changeOrgAdminEmail(orgId: string, adminId: string, newEmail: string) {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  const blocked = readOnlyBlock(profile)
  if (blocked) return { error: blocked.error }
  const isSuper = profile.role === 'super_admin' || profile.role === 'sub_super_admin'
  if (!isSuper) return { error: 'Only platform super admins can change the org admin email.' }

  const client = await createAdminClient()

  const { data: admin } = await client
    .from('admin_users')
    .select('user_id, role')
    .eq('id', adminId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!admin) return { error: 'Admin not found.' }
  if (admin.role !== 'org_admin') return { error: 'Can only change email for Org Admin.' }

  // Update email in admin_users
  const { error: dbErr } = await client
    .from('admin_users')
    .update({ email: newEmail.toLowerCase() })
    .eq('id', adminId)
  if (dbErr) return { error: dbErr.message }

  // Update Supabase Auth email if they have an account
  if (admin.user_id) {
    const { error: authErr } = await client.auth.admin.updateUserById(admin.user_id, {
      email: newEmail.toLowerCase(),
    })
    if (authErr) return { error: authErr.message }
  }

  revalidatePath(`/organizations/${orgId}/admins`)
  return { success: true }
}

export async function removeSubAdmin(orgId: string, adminId: string) {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  const blocked = readOnlyBlock(profile)
  if (blocked) return { error: blocked.error }
  
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

/**
 * Turn view-only access on or off for a sub-admin.
 *
 * View-only means they still see every page and every number — approvals,
 * standings, reports — but every action that writes is refused server-side.
 * Only sub-admins can be set this way: the org admin is the person who grants
 * it, so letting them lock themselves out of their own org would be a trap.
 */
export async function setSubAdminReadOnly(orgId: string, adminId: string, readOnly: boolean) {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  if (profile.role !== 'super_admin' && profile.role !== 'sub_super_admin' && profile.role !== 'org_admin') {
    return { error: 'Only org admins and above can change access levels.' }
  }
  if (profile.role === 'org_admin' && profile.org_id !== orgId) {
    return { error: 'You can only manage admins in your own organization.' }
  }
  const blocked = readOnlyBlock(profile)
  if (blocked) return { error: blocked.error }

  const client = await createAdminClient()

  const { data: target } = await client
    .from('admin_users')
    .select('id, role')
    .eq('id', adminId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!target) return { error: 'Admin not found.' }
  if (target.role !== 'sub_admin') return { error: 'Only sub admins can be set to view-only.' }

  const { error } = await client
    .from('admin_users')
    .update({ read_only: readOnly })
    .eq('id', adminId)
  if (error) return { error: error.message }

  revalidatePath(`/organizations/${orgId}/admins`)
  return { success: true }
}
