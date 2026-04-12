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

export async function addToWhitelist(orgId: string, email: string, teamId: string | null, role: string) {
  const profile = await checkAccess(orgId)
  if (!profile) return { error: 'Unauthorized.' }

  const client = await createAdminClient()
  const { error } = await client.from('invite_whitelist').insert({
    org_id: orgId,
    email: email.toLowerCase().trim(),
    team_id: teamId || null,
    role,
    invited_by: profile.id,
  })
  if (error) {
    if (error.code === '23505') return { error: 'This email is already in the whitelist.' }
    return { error: error.message }
  }
  revalidatePath(`/organizations/${orgId}/invite`)
  return { success: true }
}

export async function bulkAddToWhitelist(orgId: string, emails: string[], teamId: string | null, role: string) {
  const profile = await checkAccess(orgId)
  if (!profile) return { error: 'Unauthorized.' }

  const client = await createAdminClient()
  const rows = emails.map(email => ({
    org_id: orgId,
    email: email.toLowerCase().trim(),
    team_id: teamId || null,
    role,
    invited_by: profile.id,
  }))

  const { error } = await client.from('invite_whitelist').upsert(rows, { onConflict: 'org_id,email', ignoreDuplicates: true })
  if (error) return { error: error.message }

  revalidatePath(`/organizations/${orgId}/invite`)
  return { success: true }
}

export async function removeFromWhitelist(orgId: string, id: string) {
  const profile = await checkAccess(orgId)
  if (!profile) return { error: 'Unauthorized.' }

  const client = await createAdminClient()
  const { error } = await client.from('invite_whitelist').delete().eq('id', id).eq('org_id', orgId)
  if (error) return { error: error.message }

  revalidatePath(`/organizations/${orgId}/invite`)
  return { success: true }
}
