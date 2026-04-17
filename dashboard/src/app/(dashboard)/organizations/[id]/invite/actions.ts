'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getAdminProfile } from '@/lib/auth'

async function checkAccess(orgId: string) {
  const profile = await getAdminProfile()
  if (!profile) return null
  if (profile.role === 'org_admin' && profile.org_id !== orgId) return null
  if (profile.role === 'sub_admin' && profile.org_id !== orgId) return null
  return profile
}

async function isRoleTaken(client: any, orgId: string, teamId: string | null, role: string, excludeId?: string, excludeUserId?: string) {
  const normalizedRole = role.toLowerCase().trim()
  if (!teamId || normalizedRole === 'member') return false

  // 1. Check active members
  const { data: activeMember } = await client
    .from('team_members')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('team_id', teamId)
    .eq('role', normalizedRole)
    .maybeSingle()

  if (activeMember && activeMember.user_id !== excludeUserId) {
    return true
  }

  // 2. Check pending invites
  let query = client
    .from('invite_whitelist')
    .select('id')
    .eq('org_id', orgId)
    .eq('team_id', teamId)
    .eq('role', normalizedRole)
    .is('used_at', null)

  if (excludeId) query = query.neq('id', excludeId)

  const { data: pendingInvite } = await query.maybeSingle()

  return !!pendingInvite
}

export async function addToWhitelist(orgId: string, email: string, teamId: string | null, role: string) {
  try {
    const profile = await checkAccess(orgId)
    if (!profile) return { error: 'Unauthorized.' }

    const normalizedRole = role.toLowerCase().trim()
    const client = await createAdminClient()

    if (await isRoleTaken(client, orgId, teamId, normalizedRole)) {
      return { error: `This team already has a ${normalizedRole === 'captain' ? 'Captain' : 'Vice Captain'}.` }
    }

    const { data, error } = await client.from('invite_whitelist').insert({
      org_id: orgId,
      email: email.toLowerCase().trim(),
      team_id: teamId || null,
      role: normalizedRole,
      invited_by: profile.id,
    }).select('id').single()

    if (error) {
      if (error.code === '23505') return { error: 'This email is already in the whitelist.' }
      return { error: error.message }
    }
    revalidatePath(`/organizations/${orgId}/invite`)
    return { success: true, id: data?.id }
  } catch (e: any) {
    console.error('addToWhitelist error:', e)
    return { error: e.message || 'An unexpected error occurred.' }
  }
}

export async function bulkAddToWhitelist(orgId: string, emails: string[], teamId: string | null, role: string) {
  try {
    const profile = await checkAccess(orgId)
    if (!profile) return { error: 'Unauthorized.' }

    const normalizedRole = role.toLowerCase().trim()
    const client = await createAdminClient()

    if (await isRoleTaken(client, orgId, teamId, normalizedRole)) {
      return { error: `This team already has a ${normalizedRole === 'captain' ? 'Captain' : 'Vice Captain'}.` }
    }

    const rows = emails.map(email => ({
      org_id: orgId,
      email: email.toLowerCase().trim(),
      team_id: teamId || null,
      role: normalizedRole,
      invited_by: profile.id,
    }))

    const { data, error } = await client.from('invite_whitelist')
      .upsert(rows, { onConflict: 'org_id,email' })
      .select('id, email')

    if (error) return { error: error.message }

    revalidatePath(`/organizations/${orgId}/invite`)
    return { success: true, data }
  } catch (e: any) {
    console.error('bulkAddToWhitelist error:', e)
    return { error: e.message || 'An unexpected error occurred.' }
  }
}

export async function removeFromWhitelist(orgId: string, id: string) {
  try {
    const profile = await checkAccess(orgId)
    if (!profile) return { error: 'Unauthorized.' }

    const client = await createAdminClient()
    const { error } = await client.from('invite_whitelist').delete().eq('id', id).eq('org_id', orgId)
    if (error) return { error: error.message }

    revalidatePath(`/organizations/${orgId}/invite`)
    return { success: true }
  } catch (e: any) {
    console.error('removeFromWhitelist error:', e)
    return { error: e.message || 'An unexpected error occurred.' }
  }
}

export async function updateWhitelistEntry(orgId: string, id: string, email: string, teamId: string, role: string) {
  try {
    const profile = await checkAccess(orgId)
    if (!profile) return { error: 'Unauthorized.' }

    const normalizedRole = role.toLowerCase().trim()
    const client = await createAdminClient()

    if (await isRoleTaken(client, orgId, teamId, normalizedRole, id)) {
      return { error: `This team already has a ${normalizedRole === 'captain' ? 'Captain' : 'Vice Captain'}.` }
    }

    const { error } = await client.from('invite_whitelist')
      .update({
        email: email.toLowerCase().trim(),
        team_id: teamId,
        role: normalizedRole,
      })
      .eq('id', id)
      .eq('org_id', orgId)

    if (error) {
      if (error.code === '23505') return { error: 'This email is already in the whitelist.' }
      return { error: error.message }
    }

    revalidatePath(`/organizations/${orgId}/invite`)
    return { success: true }
  } catch (e: any) {
    console.error('updateWhitelistEntry error:', e)
    return { error: e.message || 'An unexpected error occurred.' }
  }
}
