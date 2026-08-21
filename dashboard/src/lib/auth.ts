import { cache } from 'react'
import { createClient, createAdminClient } from './supabase/server'

// React cache deduplicates these calls within a single request.
// Layout and page both call these, but they only hit the DB once.

export const getUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

export const getAdminProfile = cache(async () => {
  const user = await getUser()
  if (!user) return null
  const adminClient = await createAdminClient()

  // Normal case: look up by user_id
  const { data } = await adminClient
    .from('admin_users')
    .select('id, user_id, org_id, name, email, role, status, read_only, created_by, created_at')
    .eq('user_id', user.id)
    .single()
  if (data) return data

  // Fallback: match by email and sync user_id (handles first-time login or auth re-creation)
  const { data: byEmail } = await adminClient
    .from('admin_users')
    .select('id, user_id, org_id, name, email, role, status, read_only, created_by, created_at')
    .eq('email', user.email!)
    .single()
  if (byEmail) {
    if (byEmail.user_id !== user.id) {
      await adminClient.from('admin_users').update({ user_id: user.id }).eq('id', byEmail.id)
    }
    return { ...byEmail, user_id: user.id }
  }

  return null
})

/** Shape returned by getAdminProfile(), for helpers that only need the guard bits. */
type GuardableProfile = { read_only?: boolean | null } | null | undefined

/**
 * True when this admin is allowed to change things.
 *
 * Read-only admins can reach every page and see every number — the block is
 * deliberately at the action layer, not the route layer, so they keep full
 * visibility and lose only the ability to write.
 */
export function canWrite(profile: GuardableProfile): boolean {
  return !!profile && profile.read_only !== true
}

/**
 * Guard for the top of a mutating server action. Returns an error object to
 * hand straight back to the client, or null when the write may proceed.
 *
 * Server actions are each their own entry point — there is no single choke
 * point a middleware could cover — so this has to be called explicitly by every
 * action that writes. UI-level hiding is a courtesy; this is the boundary.
 */
export function readOnlyBlock(profile: GuardableProfile): { error: string } | null {
  if (canWrite(profile)) return null
  return { error: 'Your account has view-only access, so this change was not saved.' }
}
