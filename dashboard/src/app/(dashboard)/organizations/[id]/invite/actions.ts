'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getAdminProfile } from '@/lib/auth'

const ALLOWED_ROLES = ['super_admin', 'sub_super_admin', 'org_admin', 'sub_admin']
const ORG_SCOPED_ROLES = ['org_admin', 'sub_admin']

async function checkAccess(orgId: string) {
  const profile = await getAdminProfile()
  if (!profile) return null
  if (!ALLOWED_ROLES.includes(profile.role)) return null
  if (ORG_SCOPED_ROLES.includes(profile.role) && profile.org_id !== orgId) return null
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

    const normalizedEmail = email.toLowerCase().trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return { error: 'Invalid email address.' }

    const normalizedRole = role.toLowerCase().trim()
    const client = await createAdminClient()

    if (await isRoleTaken(client, orgId, teamId, normalizedRole)) {
      return { error: `This team already has a ${normalizedRole === 'captain' ? 'Captain' : 'Vice Captain'}.` }
    }

    const { data, error } = await client.from('invite_whitelist').insert({
      org_id: orgId,
      email: normalizedEmail,
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

// Returns which captain/vice_captain roles are already taken per team
// (checks both active team_members and pending invite_whitelist)
export async function getTeamRoleStatus(orgId: string): Promise<Record<string, { captain: boolean; vice_captain: boolean }>> {
  try {
    const profile = await checkAccess(orgId)
    if (!profile) return {}
    const client = await createAdminClient()

    const [{ data: activeMembers }, { data: pendingInvites }, { data: existingEmails }] = await Promise.all([
      client.from('team_members').select('team_id, role').eq('org_id', orgId).in('role', ['captain', 'vice_captain']),
      client.from('invite_whitelist').select('team_id, role').eq('org_id', orgId).is('used_at', null).in('role', ['captain', 'vice_captain']),
      client.from('invite_whitelist').select('email').eq('org_id', orgId),
    ])

    const result: Record<string, { captain: boolean; vice_captain: boolean }> = {}
    const setTaken = (teamId: string, role: string) => {
      if (!teamId) return
      if (!result[teamId]) result[teamId] = { captain: false, vice_captain: false }
      if (role === 'captain') result[teamId].captain = true
      if (role === 'vice_captain') result[teamId].vice_captain = true
    }
    for (const r of activeMembers ?? []) setTaken(r.team_id, r.role)
    for (const r of pendingInvites ?? []) setTaken(r.team_id, r.role)

    const emails = (existingEmails ?? []).map((r: any) => (r.email as string).toLowerCase().trim())
    return { ...result, __existingEmails: emails as any }
  } catch {
    return {}
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

export async function csvImportToWhitelist(
  orgId: string,
  rows: Array<{ email: string; teamId: string | null; role: string }>
) {
  try {
    const profile = await checkAccess(orgId)
    if (!profile) return { error: 'Unauthorized.' }

    const client = await createAdminClient()

    const dbRows = rows.map(r => ({
      org_id: orgId,
      email: r.email.toLowerCase().trim(),
      team_id: r.teamId || null,
      role: r.role.toLowerCase().trim(),
      invited_by: profile.id,
    }))

    const { data, error } = await client
      .from('invite_whitelist')
      .upsert(dbRows, { onConflict: 'org_id,email' })
      .select('id, email')

    if (error) return { error: error.message }

    revalidatePath(`/organizations/${orgId}/invite`)
    return { success: true, data }
  } catch (e: any) {
    console.error('csvImportToWhitelist error:', e)
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
